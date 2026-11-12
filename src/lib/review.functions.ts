import { createServerFn } from "@tanstack/react-start";
import {
  getCallDetail,
  readStagingCallIds,
  writeStagingHeaders,
  appendStagingRows,
  readReviewedIdsForEmail,
  readAllReviewedIds,
} from "./sheets.server";

export type ReviewDataset = "seekers" | "providers";

async function sb() {
  const { sbFor } = await import("@/lib/db.server");
  return sbFor();
}

function normKey(h: string): string {
  return String(h ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

async function resolveSheet(
  dataset: ReviewDataset,
  channel?: string,
): Promise<{ sheet_id: string; tab_name: string | null }> {
  const client = await sb();
  const { data, error } = await client
    .from("sheet_connections")
    .select("sheet_id, tab_name, channel")
    .eq("program", dataset)
    .eq("enabled", true);
  if (error) throw new Error(`sheet_connections lookup failed: ${error.message}`);
  const rows = (data ?? []) as Array<{ sheet_id: string; tab_name: string | null; channel: string | null }>;
  if (rows.length === 0) throw new Error(`No enabled sheet connection for dataset '${dataset}'`);
  const want = channel ?? "outbound";
  const pick =
    rows.find((r) => (r.channel ?? "outbound") === want) ??
    rows.find((r) => (r.channel ?? "outbound") === "outbound") ??
    rows[0];
  return { sheet_id: pick.sheet_id, tab_name: pick.tab_name ?? null };
}

const REVIEW_COLS = "call_id, campaign_day, campaign_date, campaign_type, language, city_campaign, call_outcome, call_duration_seconds, intent_score, drop_reason, job_status, phone, channel, data";
/** List variant: REVIEW_COLS minus the fat `data` jsonb. Selecting `data` forces
 * Postgres to detoast every transcript just to build a list → the Review hub
 * times out against the pipeline matview. Detail fetches keep `data`. */
const REVIEW_LIST_COLS = "call_id, campaign_day, campaign_date, campaign_type, language, city_campaign, call_outcome, call_duration_seconds, intent_score, drop_reason, job_status, phone, channel";

/** A server-function response is capped at 16 MB by the framework, and the whole
 * list is ~36 MB even without `data` — so the list is returned one slice at a
 * time and stitched together client-side (see useReviewCalls). */
const LIST_PAGE = 1000;
const MAX_LIST_ROWS = 100000;

export interface ReviewCallsPage {
  rows: Array<Record<string, string>>;
  total: number;
  offset: number;
}

function mapReviewRow(r: Record<string, unknown>): Record<string, string> {
  const d = (r.data ?? {}) as Record<string, unknown>;
  const raw = (d.raw ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (d as Record<string, unknown>)[k] ?? (raw as Record<string, unknown>)[k];
      if (v !== undefined && v !== null && String(v) !== "") return String(v);
    }
    return "";
  };
  return {
    call_id: r.call_id != null ? String(r.call_id) : "",
    job_id: pick("job_id"),

    campaign_day: r.campaign_day != null ? String(r.campaign_day) : "",
    campaign_date: r.campaign_date != null ? String(r.campaign_date) : "",
    campaign_type: r.campaign_type != null ? String(r.campaign_type) : "",
    language: r.language != null ? String(r.language) : "",
    city_campaign: r.city_campaign != null ? String(r.city_campaign) : "",
    call_outcome: r.call_outcome != null ? String(r.call_outcome) : "",
    call_duration_seconds: r.call_duration_seconds != null ? String(r.call_duration_seconds) : "",
    call_datetime_ist: pick("call_datetime_ist"),
    intent_score: r.intent_score != null ? String(r.intent_score) : "",
    drop_reason: r.drop_reason != null ? String(r.drop_reason) : "",
    job_status: r.job_status != null ? String(r.job_status) : "",
    channel: r.channel != null ? String(r.channel) : "outbound",
    call_recording_url: "",
  };
}

export const fetchReviewCalls = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset; offset?: number; limit?: number }) => data)
  .handler(async ({ data }): Promise<ReviewCallsPage> => {
    const client = await sb();
    const offset = Math.max(0, Math.floor(data.offset ?? 0));
    const limit = Math.min(Math.max(1, Math.floor(data.limit ?? LIST_PAGE)), MAX_LIST_ROWS);
    const { data: batch, error, count } = await client
      .from("call_rows")
      .select(REVIEW_LIST_COLS, { count: "exact" })
      .eq("program", data.dataset)
      // id is unique so offset slices are stable; call_id is not.
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);
    const rows = ((batch ?? []) as unknown as Array<Record<string, unknown>>).map(mapReviewRow);
    return { rows, total: count ?? offset + rows.length, offset };
  });

/** Single-call fetch for the transcript review page — avoids loading the whole table. */
export const fetchReviewCall = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset; callId: string }) => data)
  .handler(async ({ data }): Promise<Record<string, string> | null> => {
    const client = await sb();
    const { data: row, error } = await client
      .from("call_rows")
      .select(REVIEW_COLS)
      .eq("program", data.dataset)
      .eq("call_id", data.callId)
      .maybeSingle();
    // call_rows can hold >1 row per call_id; maybeSingle errors on multiples, so
    // fall back to a bounded read instead of blanking the page.
    if (error) {
      const { data: rows } = await client
        .from("call_rows")
        .select(REVIEW_COLS)
        .eq("program", data.dataset)
        .eq("call_id", data.callId)
        .limit(1);
      const first = (rows ?? [])[0] as Record<string, unknown> | undefined;
      return first ? mapReviewRow(first) : null;
    }
    if (!row) return null;
    return mapReviewRow(row as unknown as Record<string, unknown>);
  });

export const fetchCallDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { dataset: ReviewDataset; callId: string }) => data)
  .handler(async ({ data }) => {
    const client = await sb();
    const { data: row } = await client
      .from("call_rows")
      .select("channel")
      .eq("program", data.dataset)
      .eq("call_id", data.callId)
      .maybeSingle();
    const channel = (row?.channel as string | undefined) ?? "outbound";
    const { sheet_id, tab_name } = await resolveSheet(data.dataset, channel);
    const detail = await getCallDetail(sheet_id, tab_name ?? undefined, data.callId);
    return (
      detail ?? { call_transcript: "", final_summary: "", call_recording_url: "", effectiveTab: "" }
    );
  });

export const fetchReviewMap = createServerFn({ method: "GET" }).handler(async () => {
  const client = await sb();
  const { data, error } = await client
    .from("transcript_reviews")
    .select("call_id, job_id, reviewer_email");
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    call_id: string | null;
    job_id: string | null;
    reviewer_email: string | null;
  }>;
});

export const fetchReviewedCallIds = createServerFn({ method: "GET" })
  .inputValidator((data: { email: string; program?: ReviewDataset }) => data)
  .handler(async ({ data }): Promise<string[]> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return [];
    const client = await sb();
    const ids = new Set<string>();
    // 1) Supabase transcript_reviews (paginated past the ~1000-row cap)
    let from = 0;
    while (true) {
      const { data: batch, error } = await client
        .from("transcript_reviews")
        .select("call_id, job_id")
        .eq("reviewer_email", email)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = batch ?? [];
      for (const r of rows as Array<{ call_id: string | null; job_id: string | null }>) {
        if (r.call_id) ids.add(String(r.call_id));
        if (r.job_id) ids.add(String(r.job_id));
      }
      if (rows.length === 0) break;
      from += rows.length;
    }
    // 2) Master sheet "Feedback Responses" tab (durable append-only log). Never throws.
    if (data.program) {
      try {
        const { sheet_id } = await resolveSheet(data.program);
        const sheetIds = await readReviewedIdsForEmail(sheet_id, "Feedback Responses", email);
        for (const v of sheetIds) ids.add(v);
      } catch { /* ignore */ }
    }
    return Array.from(ids);
  });

/** Every call_id/job_id reviewed by ANY reviewer for a program (DB ∪ sheet). */
export const fetchAllReviewedCallIds = createServerFn({ method: "GET" })
  .inputValidator((data: { program: ReviewDataset }) => data)
  .handler(async ({ data }): Promise<string[]> => {
    const client = await sb();
    const ids = new Set<string>();
    // 1) Supabase transcript_reviews for this program (+ legacy null-dataset rows), paginated.
    let from = 0;
    while (true) {
      const { data: batch, error } = await client
        .from("transcript_reviews")
        .select("call_id, job_id")
        .or(`dataset.eq.${data.program},dataset.is.null`)
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      const rows = batch ?? [];
      for (const r of rows as Array<{ call_id: string | null; job_id: string | null }>) {
        if (r.call_id) ids.add(String(r.call_id));
        if (r.job_id) ids.add(String(r.job_id));
      }
      if (rows.length === 0) break;
      from += rows.length;
    }
    // 2) Master sheet "Feedback Responses" tab (all reviewers). Never throws.
    try {
      const { sheet_id } = await resolveSheet(data.program);
      const sheetIds = await readAllReviewedIds(sheet_id, "Feedback Responses");
      for (const v of sheetIds) ids.add(v);
    } catch { /* ignore */ }
    return Array.from(ids);
  });

export const fetchExistingReviews = createServerFn({ method: "GET" })
  .inputValidator((data: { callId?: string | null; jobId?: string | null }) => data)
  .handler(async ({ data }) => {
    const client = await sb();
    const callId = (data.callId ?? "").trim();
    const jobId = (data.jobId ?? "").trim();
    let query = client
      .from("transcript_reviews")
      .select(
        "reviewer_email, reviewer_name, overall_rating, quantitative_issues, reviewer_notes, turn_flags, created_at",
      )
      .order("created_at", { ascending: false });
    if (callId) {
      query = query.eq("call_id", callId);
    } else if (jobId) {
      query = query.eq("job_id", jobId);
    } else {
      return [];
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export interface ReviewInput {
  job_id?: string | null;
  call_id?: string | null;
  reviewer_email: string;
  reviewer_name?: string | null;
  company_name?: string | null;
  campaign_day?: string | null;
  campaign_type?: string | null;
  language?: string | null;
  city_campaign?: string | null;
  contact_phone?: string | null;
  call_outcome?: string | null;
  job_status_in_master?: string | null;
  review_type?: string | null;
  quantitative_issues?: string | null;
  turn_flags?: string | null;
  overall_rating?: number | null;
  reviewer_notes?: string | null;
  summary_match?: string | null;
  job_status_correct?: string | null;
  output_fields_accurate?: string | null;
  dataset: ReviewDataset;
}

const FEEDBACK_COLUMNS = [
  "timestamp",
  "reviewer_email",
  "reviewer_name",
  "campaign_day",
  "campaign_type",
  "language",
  "city_campaign",
  "company_name",
  "contact_phone",
  "job_id",
  "call_id",
  "call_outcome",
  "job_status_in_master",
  "quantitative_issues",
  "turn_flags",
  "overall_rating",
  "reviewer_notes",
  "review_type",
  "dataset",
];

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((data: { review: ReviewInput }) => data)
  .handler(async ({ data }) => {
    const review: ReviewInput = { review_type: "transcript", ...data.review, company_name: "" };
    const client = await sb();
    const { error } = await client
      .from("transcript_reviews")
      .upsert(review as unknown as Record<string, unknown>, {
        onConflict: "call_id,reviewer_email",
      });
    if (error) throw new Error(error.message);

    // Append to master sheet's "Feedback Responses" tab. Never fail the DB write on a sheet hiccup.
    try {
      const { sheet_id } = await resolveSheet(review.dataset);
      const tab = "Feedback Responses";
      const state = await readStagingCallIds(sheet_id, tab);
      if (!state.hasHeaders) {
        await writeStagingHeaders(sheet_id, tab, FEEDBACK_COLUMNS);
      }
      const timestamp = new Date().toISOString();
      const rec: Record<string, unknown> = { ...(review as unknown as Record<string, unknown>), timestamp };
      const row = FEEDBACK_COLUMNS.map((c) => {
        const v = rec[c];
        return v === null || v === undefined ? "" : String(v);
      });
      await appendStagingRows(sheet_id, tab, [row]);
    } catch (e) {
      console.error("[submitReview] sheet append failed:", e);
    }

    return { ok: true };
  });
