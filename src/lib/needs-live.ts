export interface NeedCategory { orgName: string; category: string; seekers: number; phrasings: number; mentions: number }
export interface NeedPhrasing { need: string; source: string; seekers: number; mentions: number }
export interface NeedsCoverage { orgName: string; seekersTotal: number; profilesInPool: number; profilesRead: number }
export interface NeedsOverview { categories: NeedCategory[]; coverage: NeedsCoverage[] }

/**
 * Pill order follows how much needs data was actually extracted: the sum of the
 * server's distinct-people `seekers` across an organisation's categories.
 * `coverage.seekersTotal` is total registered seekers and says nothing about
 * extraction, so it must not drive this order — the coverage strip below uses it.
 */
export function organisations(o: NeedsOverview): string[] {
  const extracted = new Map<string, number>();
  for (const r of o.categories) extracted.set(r.orgName, (extracted.get(r.orgName) ?? 0) + r.seekers);
  return [...extracted.keys()].sort((a, b) => (extracted.get(b) ?? 0) - (extracted.get(a) ?? 0));
}

/** Distinct-people `seekers` comes from the server; never sum phrasings to recompute it. */
export function categoriesFor(o: NeedsOverview, org: string): NeedCategory[] {
  return o.categories.filter(c => c.orgName === org);
}

export function coverageFor(o: NeedsOverview, org: string): NeedsCoverage | null {
  return o.coverage.find(c => c.orgName === org) ?? null;
}

// Deliberately tiny, hand-checked list: the data has no grievance field.
// Never extend this through keyword inference or apply it to other needs.
export const GRIEVANCE_NEEDS: ReadonlySet<string> = new Set(["pension not received", "pension stopped"]);
export function isGrievance(need: string): boolean { return GRIEVANCE_NEEDS.has(need.toLowerCase()); }
