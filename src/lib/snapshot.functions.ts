import { createServerFn } from "@tanstack/react-start";
import type { CallRow } from "@/programs/data";
import type { ProgramId } from "@/programs/registry";


async function sb() {
  const { sbFor } = await import("@/lib/db.server");
  return sbFor();
}

function asYesNoBool(v: string | undefined): boolean {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}
function asNum(v: string | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[,%]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function asJsonArr(v: string | undefined): string[] {
  if (!v) return [];
  const s = String(v).trim();
  if (s.startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      /* ignore */
    }
  }
  return s.split(/[|,;]/).map((x) => x.trim()).filter(Boolean);
}
function normKey(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

// Defensive normalization: date cells may arrive as Excel serials ("46196"),
// ISO strings ("2026-06-23..."), or arbitrary display strings. Always store
// YYYY-MM-DD when we can recognize the shape; otherwise pass through.
function normalizeCampaignDate(v: string | undefined | null): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^[0-9]{4,6}$/.test(s)) {
    const serial = Number(s);
    // Excel epoch (with 1900 leap-year bug compat): 1899-12-30 + serial days.
    const ms = Date.UTC(1899, 11, 30) + serial * 86400000;
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

function mapRow(headers: string[], values: string[]): CallRow {
  const idx: Record<string, number> = {};
  const raw: Record<string, string> = {};
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (!(k in idx)) idx[k] = i;
    raw[k] = values[i] ?? "";
  });
  const get = (k: string) => {
    const i = idx[normKey(k)];
    return i !== undefined ? values[i] : undefined;
  };
  const firstNonEmpty = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = get(k);
      if (v !== undefined && String(v).trim() !== "") return v;
    }
    return undefined;
  };
  const callStatus = (get("call_status") ?? "").trim().toLowerCase();
  const answeredFromStatus = callStatus.startsWith("answered") || callStatus === "completed";
  return {
    campaign_day: get("campaign_day") ?? "",
    campaign_date: get("campaign_date") ?? "",
    campaign_type: firstNonEmpty("campaign_type", "campaign_name") ?? "",
    language: get("language") ?? "",
    call_id: get("call_id") ?? "",
    phone: firstNonEmpty("phone", "contact_phone", "phone_number") ?? "",
    call_duration_seconds: asNum(get("call_duration_seconds")),
    call_datetime_ist: get("call_datetime_ist") ?? "",
    call_outcome: get("call_outcome") ?? "",
    call_answered:
      get("call_answered") !== undefined ? asYesNoBool(get("call_answered")) : answeredFromStatus,
    call_engaged: asYesNoBool(get("call_engaged")),
    applied_to_job: asYesNoBool(get("applied_to_job")),
    applications_count: asNum(get("applications_count")),
    jobs_shown: asYesNoBool(get("jobs_shown")),
    primary_topic: get("primary_topic") ?? "",
    call_language: get("call_language") ?? get("language") ?? "",
    call_recording_url: "",
    final_summary: "",
    call_transcript: "",
    tried_to_apply: asYesNoBool(get("tried_to_apply")),
    drop_reason: get("drop_reason") ?? "",
    city_campaign: get("city_campaign") ?? "",
    seeker_name: get("seeker_name") ?? get("candidate_name") ?? get("company_name") ?? "",
    user_intent: get("user_intent") ?? "low",
    jobs_recommended: asJsonArr(get("jobs_recommended")),
    jobs_applied: asJsonArr(get("jobs_applied")),
    jobs_failed_to_apply: asJsonArr(get("jobs_failed_to_apply")),
    "Intent Score": asNum(firstNonEmpty("intent_score", "call_value_score")),
    "Intent Score Reasoning": "",
    counselled: asYesNoBool(get("counselled")),
    interview_scheduled: asYesNoBool(get("interview_scheduled")),
    course_interest: get("course_interest") ?? undefined,
    trade: get("trade") ?? undefined,
    counsellor_id: get("counsellor_id") ?? undefined,
    candidate_name: get("candidate_name") ?? undefined,
    raw,
  };
}

export interface SyncResult {
  ok: boolean;
  program: ProgramId;
  rowCount: number;
  connectionCount: number;
  errors: { id: string; name: string; message: string }[];
  lastSyncedAt: string;
  skipped?: boolean;
}

// In-process lock as a fast-path guard. The DB status check below guards across
// processes / serverless invocations.
const inflight = new Map<ProgramId, Promise<SyncResult>>();

export async function performSync(program: ProgramId, opts?: { force?: boolean }): Promise<SyncResult> {
  // When the session reads the second (upstream-pipeline) database, call_rows is a
  // read-only view fed by the pipeline — sheet sync does not apply. Return the normal
  // error-shaped result so the UI surfaces the message instead of a low-level DB error.
  const { activeSource } = await import("@/lib/db.server");
  if (activeSource() === "purple") {
    return {
      ok: false,
      program,
      rowCount: 0,
      connectionCount: 0,
      errors: [
        {
          id: "_source",
          name: "Sync disabled",
          message:
            "Sync is disabled for this data source. Campaign records are loaded directly by the upstream pipeline, not from Google Sheets.",
        },
      ],
      lastSyncedAt: new Date().toISOString(),
    };
  }
  const existing = inflight.get(program);
  if (existing && !opts?.force) return existing;
  const p = (async (): Promise<SyncResult> => {
    const client = await sb();

    const runStart = new Date().toISOString();
    const staleThresholdIso = new Date(Date.now() - 4 * 60_000).toISOString();

    {
      await client
        .from("program_sync_state")
        .upsert({ program }, { onConflict: "program", ignoreDuplicates: true });

      // A manual/forced refresh takes over the lock unconditionally — otherwise a
      // crashed run leaves status='syncing' and every click silently no-ops.
      const claim = client
        .from("program_sync_state")
        .update({ status: "syncing", updated_at: runStart })
        .eq("program", program);
      if (!opts?.force) {
        claim.or(`status.neq.syncing,updated_at.lt.${staleThresholdIso}`);
      }
      const { data: claimed, error: claimErr } = await claim.select(
        "program, last_synced_at, row_count",
      );

      if (claimErr || !claimed || claimed.length === 0) {
        const { data: cur } = await client
          .from("program_sync_state")
          .select("last_synced_at, row_count")
          .eq("program", program)
          .maybeSingle();
        return {
          ok: true,
          program,
          rowCount: Number(cur?.row_count ?? 0),
          connectionCount: 0,
          errors: [],
          lastSyncedAt: (cur?.last_synced_at as string) ?? new Date().toISOString(),
          skipped: true,
        };
      }
    }

    const { data: conns } = await client
      .from("sheet_connections")
      .select("*")
      .eq("program", program)
      .eq("enabled", true);
    const list = (conns ?? []) as Array<{
      id: string;
      name: string;
      sheet_id: string;
      tab_name: string | null;
      channel: string | null;
    }>;
    // Process small/inbound tabs first so they complete and reconcile even if a
    // large tab (e.g. 27k-row outbound) later exhausts the runtime budget.
    list.sort((a, b) => (a.channel === "inbound" ? 0 : 1) - (b.channel === "inbound" ? 0 : 1));

    const errors: SyncResult["errors"] = [];
    type UpsertRow = {
      program: ProgramId;
      connection_id: string;
      channel: string;
      call_id: string;
      campaign_day: string;
      intent_score: number | null;
      call_answered: boolean;
      call_engaged: boolean;
      applied_to_job: boolean;
      tried_to_apply: boolean;
      call_status: string;
      job_status: string;
      new_job_posted: string;
      talent_insights_shown: string;
      phases_reached: string;
      drop_reason: string;
      call_outcome: string;
      city_campaign: string;
      campaign_date: string;
      campaign_type: string;
      language: string;
      phone: string;
      call_duration_seconds: number | null;
      applications_count: number | null;
      data: CallRow;
      row_hash: string;
      synced_at: string;
    };

    function computeRowHash(r: Omit<UpsertRow, "row_hash" | "synced_at">): string {
      // Pure-JS FNV-1a 64-bit-ish hash (two 32-bit lanes) so this module stays
      // safe to include in the client graph (no node:crypto import).
      const str = JSON.stringify(r);
      let h1 = 0x811c9dc5;
      let h2 = 0x01000193;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 0x01000193) >>> 0;
        h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
      }
      return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
    }

    const BATCH = 500;
    const PAGE = 10000;
    let lastSyncedAt = new Date().toISOString();
    let statusWritten = false;
    let totalRows = 0;

    try {
      const hasGoogleCreds = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim());
      if (!hasGoogleCreds && list.length > 0) {
        const msg = "GOOGLE_SERVICE_ACCOUNT_JSON is not set. Add it in Project Settings → Secrets, then run Refresh again.";
        errors.push({ id: "_config", name: "Google credentials", message: msg });
        const nowIso = new Date().toISOString();
        for (const c of list) {
          await client
            .from("sheet_connections")
            .update({ status: "error", last_error: msg, last_synced_at: nowIso })
            .eq("id", c.id);
        }
      }
      if (hasGoogleCreds && list.length > 0) {
        const { readSheet } = await import("./sheets.server");

        for (const c of list) {
          const connSeen = new Set<string>();
          const existingHashes = new Map<string, string | null>();
          let connReadOk = true;
          let totalMappedForConn = 0;
          let effectiveTabForConn: string | null = null;
          try {
            // Existing hashes for THIS connection only (keyed by call_id).
            // Paginate with .range() — PostgREST caps single responses (~1000 rows).
            {
              let hFrom = 0;
              while (true) {
                const { data: ex, error: exErr } = await client
                  .from("call_rows")
                  .select("call_id, row_hash")
                  .eq("program", program)
                  .eq("connection_id", c.id)
                  .order("call_id", { ascending: true })
                  .range(hFrom, hFrom + 999);
                if (exErr) {
                  errors.push({ id: "_hash_lookup", name: c.name, message: exErr.message });
                  connReadOk = false;
                  break;
                }
                const b = ex ?? [];
                for (const r of b) {
                  existingHashes.set(r.call_id as string, (r.row_hash as string | null) ?? null);
                }
                if (b.length === 0) break;
                hFrom += b.length;
              }
            }

            let pageStart = 2;
            while (connReadOk) {
              const { headers, rows, effectiveTab } = await readSheet(
                c.sheet_id,
                c.tab_name ?? undefined,
                pageStart,
                PAGE,
              );
              effectiveTabForConn = effectiveTab;
              if (rows.length === 0) break;

              const nowIso = new Date().toISOString();
              const toUpsert: UpsertRow[] = [];
              for (let i = 0; i < rows.length; i++) {
                const mapped = mapRow(headers, rows[i]);
                const callId = mapped.call_id?.trim() || `${c.id}:${pageStart - 2 + i}`;
                if (connSeen.has(callId)) continue;
                connSeen.add(callId);
                const base = {
                  program,
                  connection_id: c.id,
                  channel: c.channel ?? "outbound",
                  call_id: callId,
                  campaign_day: mapped.campaign_day || "",
                  intent_score: Number.isFinite(mapped["Intent Score"]) ? mapped["Intent Score"] : null,
                  call_answered: mapped.call_answered,
                  call_engaged: mapped.call_engaged,
                  applied_to_job: mapped.applied_to_job,
                  tried_to_apply: mapped.tried_to_apply,
                  call_status: mapped.raw?.call_status ?? "",
                  job_status: mapped.raw?.job_status ?? "",
                  new_job_posted: mapped.raw?.new_job_posted ?? "",
                  talent_insights_shown: mapped.raw?.talent_insights_shown ?? "",
                  phases_reached: mapped.raw?.phases_reached ?? "",
                  drop_reason: mapped.drop_reason || mapped.raw?.drop_reason || "",
                  call_outcome: mapped.raw?.call_outcome || mapped.call_outcome || "",
                  city_campaign: mapped.raw?.city_campaign || mapped.city_campaign || "",
                  campaign_date: normalizeCampaignDate(mapped.campaign_date || mapped.raw?.campaign_date),
                  campaign_type: mapped.campaign_type || mapped.raw?.campaign_type || "",
                  language: mapped.language || mapped.raw?.language || "",
                  phone: mapped.phone || "",
                  call_duration_seconds: Number.isFinite(mapped.call_duration_seconds) ? mapped.call_duration_seconds : null,
                  applications_count: Number.isFinite(mapped.applications_count) ? mapped.applications_count : null,
                  data: mapped,
                };
                const row_hash = computeRowHash(base);
                const prev = existingHashes.get(callId);
                if (prev === undefined || prev !== row_hash) {
                  toUpsert.push({ ...base, row_hash, synced_at: nowIso });
                }
              }

              let pageUpsertFailed = false;
              for (let i = 0; i < toUpsert.length; i += BATCH) {
                const slice = toUpsert.slice(i, i + BATCH);
                const { error } = await client
                  .from("call_rows")
                  .upsert(slice, { onConflict: "program,call_id" });
                if (error) {
                  errors.push({ id: "_upsert", name: c.name, message: error.message });
                  pageUpsertFailed = true;
                  break;
                }
              }
              if (pageUpsertFailed) {
                connReadOk = false;
                break;
              }

              await client
                .from("program_sync_state")
                .update({ updated_at: new Date().toISOString() })
                .eq("program", program);

              totalMappedForConn += rows.length;
              if (rows.length < PAGE) break;
              pageStart += PAGE;
            }

            // Per-connection reconcile: delete rows for THIS connection whose
            // call_id is no longer in the tab. Scoped by connection_id, so it can
            // never touch another connection's rows. Only when this connection's
            // read fully succeeded and returned rows.
            if (connReadOk && connSeen.size > 0) {
              const toDelete = [...existingHashes.keys()].filter((id) => !connSeen.has(id));
              for (let i = 0; i < toDelete.length; i += 200) {
                const slice = toDelete.slice(i, i + 200);
                const { error: delErr } = await client
                  .from("call_rows")
                  .delete()
                  .eq("program", program)
                  .eq("connection_id", c.id)
                  .in("call_id", slice);
                if (delErr) {
                  errors.push({ id: "_reconcile", name: c.name, message: delErr.message });
                  break;
                }
              }
            }

            totalRows += connSeen.size;

            const patch: Record<string, unknown> = {
              status: connReadOk ? "connected" : "error",
              row_count: totalMappedForConn,
              last_error: connReadOk ? null : (errors[errors.length - 1]?.message ?? "sync error"),
              last_synced_at: new Date().toISOString(),
            };
            if (effectiveTabForConn && effectiveTabForConn !== (c.tab_name ?? "")) {
              patch.tab_name = effectiveTabForConn;
            }
            await client.from("sheet_connections").update(patch).eq("id", c.id);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({ id: c.id, name: c.name, message: msg });
            await client
              .from("sheet_connections")
              .update({
                status: "error",
                last_error: msg,
                last_synced_at: new Date().toISOString(),
              })
              .eq("id", c.id);
          }
        }
      }

      lastSyncedAt = new Date().toISOString();
      statusWritten = true;
      await client.from("program_sync_state").upsert({
        program,
        last_synced_at: lastSyncedAt,
        row_count: totalRows,
        status: errors.length > 0 ? "partial" : "ok",
        last_error: errors.length > 0 ? errors[0].message : null,
        updated_at: lastSyncedAt,
      });
    } finally {
      if (!statusWritten) {
        lastSyncedAt = new Date().toISOString();
        await client.from("program_sync_state").upsert({
          program,
          last_synced_at: lastSyncedAt,
          row_count: totalRows,
          status: errors.length > 0 ? "partial" : "ok",
          last_error: errors.length > 0 ? errors[0].message : null,
          updated_at: lastSyncedAt,
        });
      }
    }

    return {
      ok: errors.length === 0,
      program,
      rowCount: totalRows,
      connectionCount: list.length,
      errors,
      lastSyncedAt,
    };
  })();
  inflight.set(program, p);
  try {
    return await p;
  } finally {
    inflight.delete(program);
  }
}

export const syncProgramSnapshot = createServerFn({ method: "POST" })
  .inputValidator((d: { program: ProgramId; force?: boolean }) => d)
  .handler(async ({ data }) => performSync(data.program, { force: data.force }));

/** Which database the current session reads ("purple" = upstream pipeline, "current" = sheets).
 *  Server-only routing for the client — db.server.ts must never be imported client-side. */
// TEMPORARY ROUTING DIAGNOSTIC — can be removed once the routing issue is resolved.
// This server function reports the routing decision for the temporary diagnostic chip (?diag=1);
// remove it together with that chip. Comment-only edit to pick up current project secrets on rebuild.
// Returns booleans only; never the PURPLE_SUPABASE_URL or service-role key values.
export const fetchActiveSource = createServerFn({ method: "GET" }).handler(async () => {
  const { activeSource, diagnosticRouting } = await import("@/lib/db.server");
  return { source: activeSource(), ...diagnosticRouting() };
});

export interface CampaignRollup {
  day: string;
  date: string;
  type: string;
  language: string;
  rows: number;
  answered: number;
  engaged: number;
  converted: number;
  new_jobs: number;
  answered_pct: number;
  high_intent: number;
}

export interface ProgramAggregates {
  kpis: Record<string, number>;
  perDay: CampaignRollup[];
  drops: Array<{ reason: string; count: number }>;
  intents: Array<{ score: string; count: number }>;
  regions: Array<{ region: string; count: number }>;
  phases: Array<{ phase: string; count: number }>;
  jobStatus: Array<{ status: string; count: number }>;
  outcomes: Array<{ outcome: string; count: number }>;
  dkbIntents: Array<{ score: string; count: number }>;
  dropAnalysis: Array<{
    stage: string;
    reason: string;
    byRegion: Record<string, number>;
    total: number;
  }>;
}

function emptyAggregates(): ProgramAggregates {
  return {
    kpis: {},
    perDay: [],
    drops: [],
    intents: [],
    regions: [],
    phases: [],
    jobStatus: [],
    outcomes: [],
    dkbIntents: [],
    dropAnalysis: [],
  };
}

function normalizeAggregates(value: unknown): ProgramAggregates {
  if (!value || typeof value !== "object") return emptyAggregates();
  const raw = value as Partial<ProgramAggregates>;
  const kpis: Record<string, number> =
    raw.kpis && typeof raw.kpis === "object" ? { ...(raw.kpis as Record<string, number>) } : {};
  // RPC historically emits `total_rows`; frontend registry uses `total_calls`.
  // Mirror both so either consumer reads the same filtered count.
  if (kpis.total_calls == null && kpis.total_rows != null) kpis.total_calls = kpis.total_rows;
  if (kpis.total_rows == null && kpis.total_calls != null) kpis.total_rows = kpis.total_calls;
  return {
    kpis,
    perDay: Array.isArray(raw.perDay) ? raw.perDay : [],
    drops: Array.isArray(raw.drops) ? raw.drops : [],
    intents: Array.isArray(raw.intents) ? raw.intents : [],
    regions: Array.isArray(raw.regions) ? raw.regions : [],
    phases: Array.isArray(raw.phases) ? raw.phases : [],
    jobStatus: Array.isArray(raw.jobStatus) ? raw.jobStatus : [],
    outcomes: Array.isArray(raw.outcomes) ? raw.outcomes : [],
    dkbIntents: Array.isArray(raw.dkbIntents) ? raw.dkbIntents : [],
    dropAnalysis: Array.isArray(raw.dropAnalysis)
      ? (raw.dropAnalysis as unknown[]).flatMap((entry) => {
          if (!entry || typeof entry !== "object") return [];
          const e = entry as Record<string, unknown>;
          const byRegion: Record<string, number> = {};
          if (e.byRegion && typeof e.byRegion === "object") {
            for (const [k, v] of Object.entries(e.byRegion as Record<string, unknown>)) {
              if (typeof v === "number" && Number.isFinite(v)) byRegion[k] = v;
            }
          }
          const total = typeof e.total === "number" && Number.isFinite(e.total) ? e.total : 0;
          return [
            {
              stage: typeof e.stage === "string" ? e.stage : String(e.stage ?? ""),
              reason: typeof e.reason === "string" ? e.reason : String(e.reason ?? ""),
              byRegion,
              total,
            },
          ];
        })
      : [],
  };
}

export type MetricAccent = "green" | "amber" | "red" | "blue";

export interface MetricCardDef {
  key: string;
  label: string;
  value: string;
  sub: string;
  accent: MetricAccent;
}

export interface MetricGroup {
  key: string;
  title: string;
  subtitle?: string;
  cards: MetricCardDef[];
}

export interface ProviderFunnelStage {
  key: string;
  label: string;
  providers: number;
  openings: number;
  calls: number;
}
export interface ProgramMetricsRaw {
  program?: string;
  providerFunnel?: ProviderFunnelStage[];
  [k: string]: number | string | ProviderFunnelStage[] | undefined;
}

export interface AggregatePayload {
  source: "snapshot" | "empty";
  hasSnapshot: boolean;
  totalRows: number;
  /** Total rows in the unfiltered snapshot (for distinguishing "no snapshot" vs "filter excludes everything"). */
  snapshotRowCount: number;
  connectionCount: number;
  lastSyncedAt: string | null;
  syncStatus: string;
  aggregates: ProgramAggregates;
  metricGroups: MetricGroup[];
  metrics: ProgramMetricsRaw;
  /** Lightweight per-day index for the Campaigns table (no row payload). */
  campaigns: ProgramAggregates["perDay"];
  /** Why a payload is empty — UI uses this to pick the right empty-state copy. */
  emptyReason?: "no_connections" | "no_snapshot" | "no_results";
  error?: string;
}

function emptyPayload(
  connectionCount: number,
  state: { last_synced_at: string | null; status: string } | null,
  error?: string,
  emptyReason: AggregatePayload["emptyReason"] = connectionCount === 0 ? "no_connections" : "no_snapshot",
): AggregatePayload {
  return {
    source: "empty",
    hasSnapshot: false,
    totalRows: 0,
    snapshotRowCount: 0,
    connectionCount,
    lastSyncedAt: state?.last_synced_at ?? null,
    syncStatus: state?.status ?? "idle",
    aggregates: emptyAggregates(),
    metricGroups: [],
    metrics: {},
    campaigns: [],
    emptyReason,
    error,
  };
}

interface AggregateRpcPayload {
  connectionCount?: number;
  lastSyncedAt?: string | null;
  syncStatus?: string;
  stateRowCount?: number;
  aggregates?: unknown;
  metricGroups?: unknown;
  metrics?: unknown;
}

function normalizeMetricsRaw(value: unknown): ProgramMetricsRaw {
  if (!value || typeof value !== "object") return {};
  const out: ProgramMetricsRaw = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "program") out.program = String(v);
    else if (k === "providerFunnel" && Array.isArray(v)) {
      out.providerFunnel = v.flatMap((it) => {
        if (!it || typeof it !== "object") return [];
        const o = it as Record<string, unknown>;
        return [{
          key: String(o.key ?? ""),
          label: String(o.label ?? ""),
          providers: Number(o.providers ?? 0) || 0,
          openings: Number(o.openings ?? 0) || 0,
          calls: Number(o.calls ?? 0) || 0,
        }];
      });
    }
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v !== "" && !isNaN(Number(v))) out[k] = Number(v);
  }
  return out;
}


function normalizeMetricGroups(value: unknown): MetricGroup[] {
  if (!Array.isArray(value)) return [];
  const allowed: MetricAccent[] = ["green", "amber", "red", "blue"];
  return value.flatMap((g): MetricGroup[] => {
    if (!g || typeof g !== "object") return [];
    const o = g as Record<string, unknown>;
    const cards = Array.isArray(o.cards)
      ? o.cards.flatMap((c): MetricCardDef[] => {
          if (!c || typeof c !== "object") return [];
          const x = c as Record<string, unknown>;
          const accent = allowed.includes(x.accent as MetricAccent) ? (x.accent as MetricAccent) : "blue";
          return [{
            key: String(x.key ?? ""),
            label: String(x.label ?? ""),
            value: String(x.value ?? ""),
            sub: String(x.sub ?? ""),
            accent,
          }];
        })
      : [];
    return [{
      key: String(o.key ?? ""),
      title: String(o.title ?? ""),
      subtitle: o.subtitle ? String(o.subtitle) : undefined,
      cards,
    }];
  });
}

export const fetchProgramAggregates = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId; state?: string; dateFrom?: string | null; dateTo?: string | null; campaignType?: string; campaign?: string | null; channel?: string }) => d)
  .handler(async ({ data }): Promise<AggregatePayload> => {
    const program = data.program;
    const state = data.state && data.state !== "all" ? data.state : "all";
    const dateFrom = data.dateFrom ?? null;
    const dateTo = data.dateTo ?? null;
    const campaignType = data.campaignType ?? "all";
    const campaign = data.campaign ?? null;
    try {
      let payload: AggregateRpcPayload;
      try {
        const client = await sb();
        const { data: rpcData, error } = await client.rpc("get_program_aggregate_payload", {
          _program: program,
          _state: state,
          _date_from: dateFrom,
          _date_to: dateTo,
          _campaign_type: campaignType,
          _campaign: campaign,
          _channel: data.channel ?? "all",
        });
        if (error) throw new Error(error.message);
        payload = (rpcData && typeof rpcData === "object" ? rpcData : {}) as AggregateRpcPayload;
      } catch (e) {
        return emptyPayload(0, null, e instanceof Error ? e.message : String(e));
      }
      const connectionCount = payload.connectionCount ?? 0;
      const snapshotRowCount = Number(payload.stateRowCount ?? 0);
      const stateMeta = {
        last_synced_at: payload.lastSyncedAt ?? null,
        status: payload.syncStatus ?? "idle",
      };
      // Do NOT gate emptiness on stateRowCount alone. It is
      // program_sync_state.row_count — bookkeeping written only by the Google
      // Sheets sync. On the pipeline source no sync runs, so it can be 0 while
      // the payload holds real rows. Treat rows in the payload as sufficient.
      const rawKpis = (payload.aggregates as { kpis?: Record<string, unknown> } | undefined)?.kpis;
      const rawMetrics = payload.metrics as Record<string, unknown> | undefined;
      const payloadRowCount =
        Number(rawKpis?.["total_rows"] ?? rawKpis?.["total_calls"] ?? rawMetrics?.["totalCalls"] ?? 0) || 0;
      if (!snapshotRowCount && !payloadRowCount) {
        return emptyPayload(
          connectionCount,
          stateMeta,
          undefined,
          connectionCount === 0 ? "no_connections" : "no_snapshot",
        );
      }
      const aggregates = normalizeAggregates(payload.aggregates);
      const metricGroups = normalizeMetricGroups(payload.metricGroups);
      const metrics = normalizeMetricsRaw(payload.metrics);
      // Filtered count — use the reconciled KPI (mirrors total_rows/total_calls).
      // Do NOT fall back to the unfiltered snapshot size; that masks filter results.
      const totalRows = Number(aggregates.kpis.total_calls ?? 0);
      return {
        source: "snapshot",
        hasSnapshot: true,
        totalRows,
        snapshotRowCount,
        connectionCount,
        lastSyncedAt: stateMeta.last_synced_at,
        syncStatus: stateMeta.status,
        aggregates,
        metricGroups,
        metrics,
        campaigns: aggregates.perDay,
        emptyReason: totalRows === 0 ? "no_results" : undefined,
      };
    } catch (e) {
      return emptyPayload(0, null, e instanceof Error ? e.message : String(e));
    }
  });


export const fetchCampaignDayRowsFn = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId; day: string }) => d)
  .handler(async ({ data }): Promise<{ rows: CallRow[] }> => {
    const client = await sb();
    const { data: out, error } = await client
      .from("call_rows")
      .select("data")
      .eq("program", data.program)
      .eq("campaign_day", data.day)
      .limit(5000);
    if (error) throw new Error(error.message);
    return { rows: (out ?? []).map((r: { data: CallRow }) => r.data) };
  });

export interface KkbDropAnalysisPayload {
  stages: Array<{ key: string; label: string }>;
  buckets: Array<{
    bucket: string;
    byStage: Record<string, number>;
    total: number;
    raw: Array<{ reason: string; count: number }>;
  }>;
  maxCell: number;
  grandTotal: number;
  /** Calls flagged for severe distress / suicidal ideation — excluded from the matrix. Optional while the field is absent. */
  safeguardingFlagged?: number;
}

export const fetchKkbDropAnalysis = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { state?: string; dateFrom?: string | null; dateTo?: string | null; campaignType?: string; campaign?: string | null; channel?: string }) => d,
  )
  .handler(async ({ data }): Promise<KkbDropAnalysisPayload> => {
    const empty: KkbDropAnalysisPayload = { stages: [], buckets: [], maxCell: 0, grandTotal: 0 };
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_kkb_drop_analysis", {
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _campaign_type: data.campaignType ?? "all",
        _campaign: data.campaign ?? null,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      if (!rpcData || typeof rpcData !== "object") return empty;
      const p = rpcData as KkbDropAnalysisPayload;
      return {
        stages: Array.isArray(p.stages) ? p.stages : [],
        buckets: Array.isArray(p.buckets) ? p.buckets : [],
        maxCell: Number(p.maxCell ?? 0) || 0,
        grandTotal: Number(p.grandTotal ?? 0) || 0,
        safeguardingFlagged: p.safeguardingFlagged != null ? Number(p.safeguardingFlagged) || 0 : undefined,
      };
    } catch {
      return empty;
    }
  });

export const fetchDkbDropAnalysis = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { state?: string; dateFrom?: string | null; dateTo?: string | null; campaignType?: string; campaign?: string | null; channel?: string }) => d,
  )
  .handler(async ({ data }): Promise<KkbDropAnalysisPayload> => {
    const empty: KkbDropAnalysisPayload = { stages: [], buckets: [], maxCell: 0, grandTotal: 0 };
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_dkb_drop_analysis", {
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _campaign_type: data.campaignType ?? "all",
        _campaign: data.campaign ?? null,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      if (!rpcData || typeof rpcData !== "object") return empty;
      const p = rpcData as KkbDropAnalysisPayload;
      return {
        stages: Array.isArray(p.stages) ? p.stages : [],
        buckets: Array.isArray(p.buckets) ? p.buckets : [],
        maxCell: Number(p.maxCell ?? 0) || 0,
        grandTotal: Number(p.grandTotal ?? 0) || 0,
        safeguardingFlagged: p.safeguardingFlagged != null ? Number(p.safeguardingFlagged) || 0 : undefined,
      };
    } catch {
      return empty;
    }
  });

export interface CampaignListItem {
  campaignType: string;
  campaignDate: string | null;
  language: string | null;
  region: string | null;
  totalCalls: number;
  answered: number;
  engaged: number;
  highIntent: number;
  converted: number;
}

export const fetchCampaignList = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { program: ProgramId; state?: string; dateFrom?: string | null; dateTo?: string | null; channel?: string }) => d,
  )
  .handler(async ({ data }): Promise<CampaignListItem[]> => {
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_campaign_list", {
        _program: data.program,
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      if (!Array.isArray(rpcData)) return [];
      return rpcData.flatMap((it): CampaignListItem[] => {
        if (!it || typeof it !== "object") return [];
        const o = it as Record<string, unknown>;
        return [{
          campaignType: String(o.campaignType ?? ""),
          campaignDate: o.campaignDate ? String(o.campaignDate) : null,
          language: o.language ? String(o.language) : null,
          region: o.region ? String(o.region) : null,
          totalCalls: Number(o.totalCalls ?? 0) || 0,
          answered: Number(o.answered ?? 0) || 0,
          engaged: Number(o.engaged ?? 0) || 0,
          highIntent: Number(o.highIntent ?? 0) || 0,
          converted: Number(o.converted ?? 0) || 0,
        }];
      });
    } catch {
      return [];
    }
  });

export interface CampaignDropCausesPayload {
  sampleCalls: number;
  region: string | null;
  highIntentNonApply: {
    segment: number;
    top: Array<{ phase: string; reason: string; count: number; pct: number }>;
  };
  phaseShare: Array<{
    phaseKey: string;
    phaseLabel: string;
    campaignPct: number;
    regionPct: number;
  }>;
}

export const fetchCampaignDropCauses = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { campaign: string; state?: string; dateFrom?: string | null; dateTo?: string | null; channel?: string }) => d,
  )
  .handler(async ({ data }): Promise<CampaignDropCausesPayload> => {
    const empty: CampaignDropCausesPayload = {
      sampleCalls: 0,
      region: null,
      highIntentNonApply: { segment: 0, top: [] },
      phaseShare: [],
    };
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_campaign_drop_causes", {
        _campaign: data.campaign,
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      if (!rpcData || typeof rpcData !== "object") return empty;
      const p = rpcData as CampaignDropCausesPayload;
      return {
        sampleCalls: Number(p.sampleCalls ?? 0) || 0,
        region: p.region ?? null,
        highIntentNonApply: {
          segment: Number(p.highIntentNonApply?.segment ?? 0) || 0,
          top: Array.isArray(p.highIntentNonApply?.top) ? p.highIntentNonApply.top : [],
        },
        phaseShare: Array.isArray(p.phaseShare) ? p.phaseShare : [],
      };
    } catch {
      return empty;
    }
  });

export interface DkbCampaignCausesPayload {
  sampleCalls: number;
  region: string | null;
  phaseShare: Array<{
    phaseKey: string;
    phaseLabel: string;
    campaignPct: number;
    regionPct: number;
  }>;
}

export const fetchDkbCampaignCauses = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { campaign: string; state?: string; dateFrom?: string | null; dateTo?: string | null; channel?: string }) => d,
  )
  .handler(async ({ data }): Promise<DkbCampaignCausesPayload> => {
    const empty: DkbCampaignCausesPayload = { sampleCalls: 0, region: null, phaseShare: [] };
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_dkb_campaign_causes", {
        _campaign: data.campaign,
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      if (!rpcData || typeof rpcData !== "object") return empty;
      const p = rpcData as DkbCampaignCausesPayload;
      return {
        sampleCalls: Number(p.sampleCalls ?? 0) || 0,
        region: p.region ?? null,
        phaseShare: Array.isArray(p.phaseShare) ? p.phaseShare : [],
      };
    } catch {
      return empty;
    }
  });

export const fetchFunnelCallIds = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      program: ProgramId;
      state?: string;
      dateFrom?: string | null;
      dateTo?: string | null;
      campaignType?: string;
      campaign?: string | null;
      stage: string;
      channel?: string;
    }) => d,
  )
  .handler(async ({ data }): Promise<{ count: number; ids: string[] }> => {
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_funnel_call_ids", {
        _program: data.program,
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _campaign_type: data.campaignType ?? "all",
        _campaign: data.campaign ?? null,
        _stage: data.stage,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      const p = (rpcData && typeof rpcData === "object" ? rpcData : {}) as {
        count?: number;
        ids?: unknown;
      };
      const ids = Array.isArray(p.ids) ? p.ids.map((x) => String(x)) : [];
      return { count: Number(p.count ?? ids.length) || ids.length, ids };
    } catch {
      return { count: 0, ids: [] };
    }
  });

export const fetchFunnelDurations = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      program: ProgramId;
      state?: string;
      dateFrom?: string | null;
      dateTo?: string | null;
      campaignType?: string;
      campaign?: string | null;
      channel?: string;
    }) => d,
  )
  .handler(async ({ data }): Promise<Record<string, number>> => {
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_funnel_durations", {
        _program: data.program,
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _campaign_type: data.campaignType ?? "all",
        _campaign: data.campaign ?? null,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      if (!rpcData || typeof rpcData !== "object") return {};
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(rpcData as Record<string, unknown>)) {
        const n = Number(v);
        if (Number.isFinite(n)) out[k] = n;
      }
      return out;
    } catch {
      return {};
    }
  });

export interface CallOutcomeCount { outcome: string; n: number }

/** KKB-only: call_outcome breakdown honouring the same filters as the funnel. */
export const fetchKkbCallOutcomes = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { state?: string; dateFrom?: string | null; dateTo?: string | null; campaignType?: string; campaign?: string | null; channel?: string }) => d,
  )
  .handler(async ({ data }): Promise<CallOutcomeCount[]> => {
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_kkb_call_outcomes", {
        _state: data.state && data.state !== "all" ? data.state : "all",
        _date_from: data.dateFrom ?? null,
        _date_to: data.dateTo ?? null,
        _campaign_type: data.campaignType ?? "all",
        _campaign: data.campaign ?? null,
        _channel: data.channel ?? "all",
      });
      if (error) throw new Error(error.message);
      if (!Array.isArray(rpcData)) return [];
      return (rpcData as Array<Record<string, unknown>>)
        .map((r) => ({ outcome: String(r.outcome ?? "Unknown"), n: Number(r.n ?? 0) || 0 }))
        .sort((a, b) => b.n - a.n);
    } catch {
      return [];
    }
  });

export interface ProgramFilterOptions {
  cities: string[];
  campaignTypes: string[];
  channels: string[];
}

const toStringArray = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.flatMap((x) => (typeof x === "string" && x.trim() ? [x] : []))
    : [];

export const fetchProgramFilterOptions = createServerFn({ method: "GET" })
  .inputValidator((d: { program: ProgramId }) => d)
  .handler(async ({ data }): Promise<ProgramFilterOptions> => {
    try {
      const client = await sb();
      const { data: rpcData, error } = await client.rpc("get_program_filter_options", {
        _program: data.program,
      } as never);
      if (error) throw new Error(error.message);
      if (!rpcData || typeof rpcData !== "object") {
        return { cities: [], campaignTypes: [], channels: [] };
      }
      const o = rpcData as Record<string, unknown>;
      return {
        cities: toStringArray(o.cities),
        campaignTypes: toStringArray(o.campaignTypes),
        channels: toStringArray(o.channels),
      };
    } catch {
      return { cities: [], campaignTypes: [], channels: [] };
    }
  });
