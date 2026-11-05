import type { ParticipantDomain } from "./participant-rollup";

/** One row per (org × domain) from get_engagement_rollup(). */
export type EngagementRollupRow = {
  org_name: string; domain: ParticipantDomain; total: number;
  never_count: number; new_count: number; active_count: number; at_risk_count: number; dormant_count: number;
  engaged_users: number; as_of: string | null; first_event: string | null;
};

export type EngagementBuckets = { total: number; never: number; new: number; active: number; atRisk: number; dormant: number; engagedUsers: number };
export type EngagementOrg = EngagementBuckets & { orgName: string };
export type EngagementSummary = EngagementBuckets & { orgs: EngagementOrg[]; asOf: string | null; firstEvent: string | null };

const buckets = (r: EngagementRollupRow): EngagementBuckets => ({
  total: Number(r.total), never: Number(r.never_count), new: Number(r.new_count), active: Number(r.active_count),
  atRisk: Number(r.at_risk_count), dormant: Number(r.dormant_count), engagedUsers: Number(r.engaged_users),
});

export function summariseEngagementRows(rows: EngagementRollupRow[], domain: ParticipantDomain, organisation: string | null): EngagementSummary {
  const scoped = rows.filter(r => r.domain === domain && (!organisation || r.org_name === organisation));
  if (!scoped.length) throw new Error("No engagement rows were returned for this account and programme. This is a data-loading problem, not confirmation of zero engagement.");
  const totals: EngagementBuckets = { total: 0, never: 0, new: 0, active: 0, atRisk: 0, dormant: 0, engagedUsers: 0 };
  let asOf: string | null = null, firstEvent: string | null = null;
  const orgs = scoped.map(r => {
    const b = buckets(r);
    for (const k of Object.keys(totals) as (keyof EngagementBuckets)[]) totals[k] += b[k];
    if (r.as_of && (!asOf || r.as_of > asOf)) asOf = r.as_of;
    if (r.first_event && (!firstEvent || r.first_event < firstEvent)) firstEvent = r.first_event;
    return { orgName: r.org_name, ...b };
  }).sort((a, b) => b.total - a.total);
  return { ...totals, orgs, asOf, firstEvent };
}
