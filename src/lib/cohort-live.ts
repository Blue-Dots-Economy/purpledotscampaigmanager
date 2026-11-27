export const COHORT_ARRAY_KEYS = ["orgs", "coordinators", "things", "states", "districts", "lifecycle"] as const;
export type CohortArrayKey = typeof COHORT_ARRAY_KEYS[number];
export type CohortFilter = Partial<Record<CohortArrayKey, string[]> & { needs_only: boolean }> & {
  // Removed guards. Step 6 Review in launch.tsx still reads these two names, so they stay typed as never-present
  // until that file drops its two rows; the validator rejects both at runtime.
  max_calls?: never; cooldown_days?: never;
};
export type CohortUiState = Partial<Record<CohortArrayKey, string[]> & { needs_only: boolean }>;
/** A district is only unique within its state: two district names occur in more than one state. */
export interface CohortDistrict { state: string; district: string }
export interface CohortOptions { orgs: string[]; states: string[]; things: string[]; lifecycle: string[]; districts: CohortDistrict[] }
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
  return validateCohortFilter(filter);
}

export function cohortSummary(filter: CohortFilter): string {
  const parts: string[] = [];
  for (const key of COHORT_ARRAY_KEYS) if (filter[key]?.length) parts.push(filter[key]?.join(", ") ?? "");
  if (filter.needs_only) parts.push("with a recorded need");
  return parts.join(" · ") || "All people";
}

export function cohortIdsCsv(rows: CohortId[]): string {
  const escape = (value: string | null) => `"${(value ?? "").replaceAll('"', '""')}"`;
  return ["item_id,user_id", ...rows.map(row => `${escape(row.item_id)},${escape(row.user_id)}`)].join("\r\n");
}

/** Read the `{state, district}` pairs off the wire, keeping only rows where both fields are strings. */
export function cohortDistricts(value: unknown): CohortDistrict[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row: unknown) => {
    if (!row || typeof row !== "object") return [];
    const { state, district } = row as Record<string, unknown>;
    return typeof state === "string" && typeof district === "string" ? [{ state, district }] : [];
  });
}

/** District names on offer: every district with no state selected, otherwise only those in the selected states. */
export function districtsForStates(all: CohortDistrict[], states: string[]): string[] {
  const names = new Set<string>();
  for (const row of all) if (!states.length || states.includes(row.state)) names.add(row.district);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/**
 * Selected districts after the state selection changes. Districts of a deselected state are dropped unless a
 * still-selected state has a district of the same name, and nothing outside the narrowed list survives.
 */
export function districtsAfterStateChange(all: CohortDistrict[], previousStates: string[], nextStates: string[], selected: string[]): string[] {
  const removed = previousStates.filter(state => !nextStates.includes(state));
  const dropped = new Set(all.filter(row => removed.includes(row.state)).map(row => row.district));
  const kept = new Set(all.filter(row => nextStates.includes(row.state)).map(row => row.district));
  return selected.filter(name => nextStates.length ? kept.has(name) : !dropped.has(name));
}
