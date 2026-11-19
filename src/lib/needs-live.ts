export interface NeedCategory { orgName: string; category: string; seekers: number; phrasings: number; mentions: number }
export interface NeedPhrasing { need: string; source: string; seekers: number; mentions: number }
export interface NeedsCoverage { orgName: string; seekersTotal: number; profilesInPool: number; profilesRead: number }
export interface NeedsOverview { categories: NeedCategory[]; coverage: NeedsCoverage[] }

export function organisations(o: NeedsOverview): string[] {
  const totals = new Map(o.coverage.map(c => [c.orgName, c.seekersTotal]));
  return [...new Set(o.categories.map(r => r.orgName))].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
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
