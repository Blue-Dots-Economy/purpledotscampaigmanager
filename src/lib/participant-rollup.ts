import type { StatusCounts } from "./my-dots-region";

export type ParticipantDomain = "seeker" | "provider";
export type ParticipantRollupRow = {
  org_name: string; domain: ParticipantDomain; total: number;
  new_count: number; active_count: number; at_risk_count: number; inactive_count: number;
  draft_count: number; live_count: number; retired_count: number;
  avg_completion: number; below_threshold: number;
};
export const REAL_PARTICIPANT_ROLES = ["admin", "ecosystem", "network_admin", "wc", "jfc", "owner"] as const;

/** Called only with a server-verified account; missing owner mappings never widen scope. */
export function participantOrganisation(role: string, email: string): string | null {
  if (!(REAL_PARTICIPANT_ROLES as readonly string[]).includes(role)) throw new Error("Your account cannot access live participant data.");
  if (role !== "owner") return null;
  if (email.trim().toLowerCase().split("@")[0] === "ownerbasti") return "Tech Mahindra Foundation";
  throw new Error("No participant organisation is assigned to your account. Please ask for an organisation assignment.");
}

export function summariseParticipantRows(rows: ParticipantRollupRow[], domain: ParticipantDomain, organisation: string | null) {
  const orgs = rows.filter(r => r.domain === domain && (!organisation || r.org_name === organisation)).map(r => ({
    id: r.org_name, name: r.org_name, total: Number(r.total),
    status: { new: Number(r.new_count), active: Number(r.active_count), "at-risk": Number(r.at_risk_count), inactive: Number(r.inactive_count) } as StatusCounts,
    draft: Number(r.draft_count), live: Number(r.live_count), retired: Number(r.retired_count),
    avgCompletion: Number(r.avg_completion), belowThreshold: Number(r.below_threshold),
  }));
  if (!orgs.length) throw new Error("No participant rollup rows were returned for this account and programme. This is a data-loading problem, not confirmation of zero participants.");
  const total = orgs.reduce((s,r) => s + r.total, 0);
  const status = orgs.reduce((s,r) => ({ new: s.new+r.status.new, active: s.active+r.status.active, "at-risk": s["at-risk"]+r.status["at-risk"], inactive: s.inactive+r.status.inactive }), { new: 0, active: 0, "at-risk": 0, inactive: 0 });
  return {
    isSample: false as const, organisation, total, status, orgs,
    draft: orgs.reduce((s,r) => s+r.draft,0), live: orgs.reduce((s,r) => s+r.live,0), retired: orgs.reduce((s,r) => s+r.retired,0),
    belowThreshold: orgs.reduce((s,r) => s+r.belowThreshold,0),
    // RPC organisation means are rounded; retain participant weighting, not a mean of organisations.
    avgCompletion: total ? Math.round(orgs.reduce((s,r) => s+r.total*r.avgCompletion,0)/total) : 0,
  };
}

export function loadAgeDays(loadedAt: string, now = new Date()): number {
  const date = new Date(loadedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("Participant load date is unavailable.");
  return Math.max(0, Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())) / 86400000));
}
export function isParticipantLoadStale(loadedAt: string, now = new Date()) { return loadAgeDays(loadedAt, now) > 2; }