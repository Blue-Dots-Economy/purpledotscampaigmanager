import { describe, expect, it } from "vitest";
import { summariseEngagementRows, type EngagementRollupRow } from "./engagement-rollup";

const row = (org_name: string, domain: "seeker" | "provider", n: [number, number, number, number, number], engaged: number, as_of = "2026-11-04T00:00:00Z", first_event = "2026-10-01T00:00:00Z"): EngagementRollupRow => ({
  org_name, domain, total: n.reduce((a, b) => a + b, 0), never_count: n[0], new_count: n[1], active_count: n[2], at_risk_count: n[3], dormant_count: n[4], engaged_users: engaged, as_of, first_event,
});
const rows = [
  row("ALIMCO", "seeker", [100, 50, 10, 0, 0], 8),
  row("Other", "seeker", [20, 5, 3, 1, 2], 4, "2026-11-03T00:00:00Z", "2026-09-30T00:00:00Z"),
  row("ALIMCO", "provider", [7, 1, 1, 0, 0], 1),
];

describe("summariseEngagementRows", () => {
  it("scopes by domain and totals buckets", () => {
    const s = summariseEngagementRows(rows, "seeker", null);
    expect(s.orgs).toHaveLength(2);
    expect([s.never, s.new, s.active, s.atRisk, s.dormant, s.engagedUsers]).toEqual([120, 55, 13, 1, 2, 12]);
    expect(s.asOf).toBe("2026-11-04T00:00:00Z");
    expect(s.firstEvent).toBe("2026-09-30T00:00:00Z");
  });
  it("scopes by organisation", () => {
    const s = summariseEngagementRows(rows, "seeker", "ALIMCO");
    expect(s.orgs.map(o => o.orgName)).toEqual(["ALIMCO"]);
    expect(s.active).toBe(10);
  });
  it("five buckets sum to total", () => {
    const s = summariseEngagementRows(rows, "seeker", null);
    expect(s.never + s.new + s.active + s.atRisk + s.dormant).toBe(s.total);
    for (const o of s.orgs) expect(o.never + o.new + o.active + o.atRisk + o.dormant).toBe(o.total);
  });
  it("throws on empty scope", () => {
    expect(() => summariseEngagementRows(rows, "provider", "Other")).toThrow();
  });
});
