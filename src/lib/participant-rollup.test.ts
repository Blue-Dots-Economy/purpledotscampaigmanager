import { describe, expect, it } from "vitest";
import { participantOrganisation, summariseParticipantRows, isParticipantLoadStale, loadAgeDays, type ParticipantRollupRow } from "./participant-rollup";

const row = (org_name: string, domain: "seeker" | "provider", total: number, draft_count = total, live_count = 0, avg_completion = 0): ParticipantRollupRow => ({ org_name, domain, total, new_count: total, active_count: 0, at_risk_count: 0, inactive_count: 0, draft_count, live_count, retired_count: total-draft_count-live_count, avg_completion, below_threshold: total });
const rows = [row("Tech Mahindra Foundation","seeker",52070,50491,1575,29),row("ALIMCO","seeker",35374),row("DEPwD Seeker Purple Dots","seeker",4026),row("EnAble India","seeker",1919),row("ALIMCO","provider",256),row("EnAble India","provider",120),row("Tech Mahindra Foundation","provider",98),row("DEPwD (Divyangjan)","provider",28),row("DEPwD (Divyangjan)","seeker",8)];

describe("live participant rollup rules", () => {
  it("preserves the nine verified rows and 93,899 profiles", () => { expect(rows).toHaveLength(9); expect(rows.reduce((s,r)=>s+r.total,0)).toBe(93899); });
  it("lets network administrators see all organisations", () => { expect(participantOrganisation("network_admin","account@example.test")).toBeNull(); });
  it("lets working committees see all organisations without district mapping", () => { expect(participantOrganisation("wc","account@example.test")).toBeNull(); });
  it("maps ownerbasti only to Tech Mahindra Foundation", () => { expect(participantOrganisation("owner","ownerbasti@purpledots.com")).toBe("Tech Mahindra Foundation"); });
  it("never widens an unmapped owner's scope", () => { expect(()=>participantOrganisation("owner","other@example.test")).toThrow("No participant organisation"); });
  it("keeps coordinators out of the real data path", () => { expect(()=>participantOrganisation("coordinator","account@example.test")).toThrow(); });
  it("filters Seekers by domain", () => { expect(summariseParticipantRows(rows,"seeker",null).total).toBe(93397); });
  it("filters Providers by domain", () => { expect(summariseParticipantRows(rows,"provider",null).total).toBe(502); });
  it("owner data leaks no other organisation", () => { const r = summariseParticipantRows(rows,"seeker","Tech Mahindra Foundation"); expect(r.total).toBe(52070); expect(r.orgs.map(o=>o.name)).toEqual(["Tech Mahindra Foundation"]); });
  it("preserves TMF publication counts", () => { const r = summariseParticipantRows(rows,"seeker","Tech Mahindra Foundation"); expect(r.draft).toBe(50491); expect(r.live).toBe(1575); expect(r.retired).toBe(4); });
  it("retains zero inactive without manufacturing retention", () => { expect(summariseParticipantRows(rows,"seeker",null).status.inactive).toBe(0); });
  it("retains DEPwD's zero completion for 4,026 profiles", () => { const r = summariseParticipantRows(rows,"seeker","DEPwD Seeker Purple Dots"); expect(r.total).toBe(4026); expect(r.avgCompletion).toBe(0); });
  it("rejects missing rows instead of showing no participants", () => { expect(()=>summariseParticipantRows([],"seeker",null)).toThrow(); });
  it("weights completion by profiles rather than organisations", () => { expect(summariseParticipantRows([row("A","seeker",90,90,0,0),row("B","seeker",10,10,0,100)],"seeker",null).avgCompletion).toBe(10); });
  it("flags the October 29 load as four calendar days old on November 2", () => { const now = new Date("2026-11-02T01:42:00Z"); expect(loadAgeDays("2026-10-29T08:53:43Z",now)).toBe(4); expect(isParticipantLoadStale("2026-10-29T08:53:43Z",now)).toBe(true); });
  it("does not flag a load until more than two days old", () => { expect(isParticipantLoadStale("2026-10-29T08:53:43Z",new Date("2026-10-31T10:00:00Z"))).toBe(false); });
});