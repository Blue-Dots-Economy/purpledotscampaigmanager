export const COHORT_ARRAY_KEYS = ["orgs", "coordinators", "categories", "requests", "things", "bands", "states", "districts", "lifecycle"] as const;
export const COHORT_NUMBER_KEYS = ["completion_max", "max_calls", "cooldown_days"] as const;
export type CohortArrayKey = typeof COHORT_ARRAY_KEYS[number];
export type CohortNumberKey = typeof COHORT_NUMBER_KEYS[number];
export type CohortFilter = Partial<Record<CohortArrayKey, string[]> & Record<CohortNumberKey, number> & { needs_only: boolean }>;
export type CohortUiState = Partial<Record<CohortArrayKey, string[]> & Record<CohortNumberKey, string> & { needs_only: boolean }>;
export interface CohortOptions { orgs: string[]; states: string[]; categories: string[]; requests: string[]; things: string[]; bands: string[]; lifecycle: string[] }
export interface CohortSample {
  item_id: string; org_name: string | null; state: string | null; district: string | null;
  band: string | null; calls_made: number; completion: number | null; last_call_date: string | null; categories: string[];
}
export interface CohortPreview {
  total: number; located_total: number; never_called: number; called_before: number; max_calls_seen: number; with_needs: number;
  by_org: { org_name: string; total: number }[];
  by_category: { category: string; total: number }[];
  by_request: { request: string; total: number }[];
  sample: CohortSample[];
}
export interface CohortId { item_id: string; user_id: string | null }
export interface LockedCohort { filter: CohortFilter; total: number }

/** Whitelist the wire format; empty arrays are deliberately not rewritten. */
export function validateCohortFilter(input: unknown): CohortFilter {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid cohort filters.");
  const result: CohortFilter = {};
  for (const [key, value] of Object.entries(input)) {
    if ((COHORT_ARRAY_KEYS as readonly string[]).includes(key)) {
      if (!Array.isArray(value) || !value.every(v => typeof v === "string" && v.trim().length > 0)) throw new Error(`Invalid ${key} filter.`);
      result[key as CohortArrayKey] = [...value];
    } else if ((COHORT_NUMBER_KEYS as readonly string[]).includes(key)) {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${key} guard. Use a non-negative integer.`);
      result[key as CohortNumberKey] = value;
    } else if (key === "needs_only") {
      if (typeof value !== "boolean") throw new Error("Invalid recorded-need filter.");
      result.needs_only = value;
    } else throw new Error(`Unknown cohort filter: ${key}.`);
  }
  return result;
}

export function buildCohortFilter(state: CohortUiState): CohortFilter {
  const filter: CohortFilter = {};
  for (const key of COHORT_ARRAY_KEYS) {
    const values = state[key];
    if (values?.length) filter[key] = [...values];
  }
  if (state.needs_only) filter.needs_only = true;
  for (const key of COHORT_NUMBER_KEYS) {
    const value = state[key];
    if (value !== undefined && value.trim() !== "") filter[key] = Number(value);
  }
  return validateCohortFilter(filter);
}

export function cohortSummary(filter: CohortFilter): string {
  const parts: string[] = [];
  for (const key of COHORT_ARRAY_KEYS) if (filter[key]?.length) parts.push(filter[key]?.join(", ") ?? "");
  if (filter.needs_only) parts.push("with a recorded need");
  if (filter.completion_max !== undefined) parts.push(`profile completion at most ${filter.completion_max}%`);
  if (filter.max_calls !== undefined) parts.push(`max ${filter.max_calls} calls`);
  if (filter.cooldown_days !== undefined) parts.push(`${filter.cooldown_days}-day cooldown`);
  return parts.join(" · ") || "All people";
}

export function cohortIdsCsv(rows: CohortId[]): string {
  const escape = (value: string | null) => `"${(value ?? "").replaceAll('"', '""')}"`;
  return ["item_id,user_id", ...rows.map(row => `${escape(row.item_id)},${escape(row.user_id)}`)].join("\r\n");
}