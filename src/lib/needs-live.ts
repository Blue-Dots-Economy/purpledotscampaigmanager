export interface NeedRow { orgName: string; category: string; need: string; source: string; seekers: number; mentions: number }
export interface NeedsCoverage { orgName: string; seekersTotal: number; profilesInPool: number; profilesRead: number }
export interface NeedsOverview { rows: NeedRow[]; coverage: NeedsCoverage[] }

export function organisations(o: NeedsOverview): string[] {
  const totals = new Map(o.coverage.map(c => [c.orgName, c.seekersTotal]));
  return [...new Set(o.rows.map(r => r.orgName))].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
}

export function needsFor(o: NeedsOverview, org: string): { category: string; needs: NeedRow[] }[] {
  const groups = new Map<string, NeedRow[]>();
  for (const row of o.rows) {
    if (row.orgName !== org) continue;
    const group = groups.get(row.category);
    if (group) group.push(row); else groups.set(row.category, [row]);
  }
  return [...groups].map(([category, needs]) => ({ category, needs: [...needs].sort((a, b) => b.seekers - a.seekers) }))
    .sort((a, b) => b.needs.reduce((sum, n) => sum + n.seekers, 0) - a.needs.reduce((sum, n) => sum + n.seekers, 0));
}

export function coverageFor(o: NeedsOverview, org: string): NeedsCoverage | null {
  return o.coverage.find(c => c.orgName === org) ?? null;
}

// Deliberately tiny, hand-checked list: the data has no grievance field.
// Never extend this through keyword inference or apply it to other needs.
export const GRIEVANCE_NEEDS: ReadonlySet<string> = new Set(["pension not received", "pension stopped"]);
export function isGrievance(need: string): boolean { return GRIEVANCE_NEEDS.has(need.toLowerCase()); }