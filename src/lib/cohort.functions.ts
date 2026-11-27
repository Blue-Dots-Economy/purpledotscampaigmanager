import { createServerFn } from "@tanstack/react-start";
import { validateCohortFilter, type CohortFilter, type CohortOptions, type CohortPreview, type CohortId } from "./cohort-live";

async function verifiedDb() {
  const { resolveRequestIdentity } = await import("./campaign-session.server");
  const identity = await resolveRequestIdentity(process.env["CAMPAIGN_SESSION_SECRET"]);
  if (!identity.email) throw new Error("Cohort access could not be verified. Please sign in again.");
  const { sbFor, sbForAuth, activeSource } = await import("./db.server");
  if (activeSource() !== "purple") throw new Error("The live Purple cohort database is unavailable.");
  const { data: account, error } = await sbForAuth().from("app_users").select("role,active").eq("email", identity.email).maybeSingle();
  if (error || !account?.active || !["admin", "jfc", "wc", "network_admin", "owner"].includes(account.role))
    throw new Error("Cohort access could not be verified. Please sign in with a launch-enabled account.");
  return sbFor();
}

const text = (v: unknown): string | null => typeof v === "string" ? v : null;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
const count = (v: unknown): number => typeof v === "number" && Number.isFinite(v) ? v : 0;

export const fetchCohortOptions = createServerFn({ method: "GET" }).handler(async (): Promise<CohortOptions> => {
  const db = await verifiedDb();
  const { data, error } = await db.rpc("get_cohort_options");
  if (error || !data) throw new Error("Cohort filters could not be loaded. Please retry.");
  return { orgs: strings(data.orgs), states: strings(data.states), categories: strings(data.categories), requests: strings(data.requests), things: strings(data.things), bands: strings(data.bands), lifecycle: strings(data.lifecycle) };
});

export const fetchCohortPreview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => validateCohortFilter(input))
  .handler(async ({ data: filter }): Promise<CohortPreview> => {
    const db = await verifiedDb();
    const { data, error } = await db.rpc("get_cohort_preview", { _f: filter });
    if (error || !data) throw new Error("The cohort preview could not be loaded. Please retry.");
    // Explicit projection prevents any unexpected columns crossing into the browser.
    return {
      total: count(data.total), located_total: count(data.located_total), never_called: count(data.never_called),
      called_before: count(data.called_before), max_calls_seen: count(data.max_calls_seen), with_needs: count(data.with_needs),
      by_org: (data.by_org ?? []).map((r: Record<string, unknown>) => ({ org_name: text(r.org_name) ?? "", total: count(r.total) })),
      by_category: (data.by_category ?? []).map((r: Record<string, unknown>) => ({ category: text(r.category) ?? "", total: count(r.total) })),
      by_request: (data.by_request ?? []).map((r: Record<string, unknown>) => ({ request: text(r.request) ?? "", total: count(r.total) })),
      sample: (data.sample ?? []).slice(0, 25).map((r: Record<string, unknown>) => ({
        item_id: text(r.item_id) ?? "", org_name: text(r.org_name), state: text(r.state), district: text(r.district), band: text(r.band),
        calls_made: count(r.calls_made), completion: typeof r.completion === "number" ? r.completion : null,
        last_call_date: text(r.last_call_date), categories: strings(r.categories),
      })),
    };
  });

export const fetchCohortIds = createServerFn({ method: "POST" })
  .inputValidator((input: { filter: CohortFilter; limit: number }) => {
    if (!input || !Number.isSafeInteger(input.limit) || input.limit <= 0) throw new Error("Invalid cohort download limit.");
    return { filter: validateCohortFilter(input.filter), limit: input.limit };
  })
  .handler(async ({ data }): Promise<CohortId[]> => {
    const db = await verifiedDb();
    const rows: CohortId[] = [];
    // PostgREST caps table results: read explicit slices rather than silently exporting only 1,000 identifiers.
    for (let offset = 0; offset < data.limit; offset += 1000) {
      const end = Math.min(offset + 999, data.limit - 1);
      const page = await db.rpc("get_cohort_ids", { _f: data.filter, _limit: data.limit }).order("item_id", { ascending: true }).range(offset, end);
      if (page.error) throw new Error("The cohort download failed. Please retry; no partial file has been saved.");
      const slice = page.data ?? [];
      for (const row of slice) {
        if (typeof row.item_id !== "string" || !row.item_id) throw new Error("The cohort download contains an invalid identifier.");
        rows.push({ item_id: row.item_id, user_id: text(row.user_id) });
      }
      if (slice.length < end - offset + 1) break;
    }
    if (new Set(rows.map(row => row.item_id)).size !== rows.length)
      throw new Error("The cohort changed during download. Please retry; no partial file has been saved.");
    return rows;
  });