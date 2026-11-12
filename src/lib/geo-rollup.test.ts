import { describe, expect, it } from "vitest";
import { coordinatorLabel, labelCoordinators, geoMetrics, rollupByGeography, rollupByOrganisation, scopeGeoRows, LOCATION_NOT_RECORDED, type GeoNode, type GeoRollupRow } from "./geo-rollup";
import { isParticipantLoadStale, loadAgeDays } from "./participant-rollup";

const row = (org_name: string, coordinator_code: string, state: string | null, district: string | null, total: number, avg_completion: number, domain: "seeker" | "provider" = "seeker"): GeoRollupRow =>
  ({ org_name, coordinator_code, coordinator_type: domain, state, district, domain, total, live_count: 1, draft_count: total - 1, retired_count: 0, avg_completion, below_threshold: 1 });
const rows = [
  row("Tech Mahindra Foundation", "A2BC", "Uttar Pradesh", "Basti", 100, 80),
  row("Tech Mahindra Foundation", "A2BC", null, null, 900, 20),
  row("ALIMCO", "Z9XY", "Uttar Pradesh", "Basti", 50, 50),
  row("ALIMCO", "Z9XY", "Maharashtra", "Pune", 10, 10),
  row("ALIMCO", "P1PP", "Maharashtra", "Pune", 5, 90, "provider"),
];

const coordinator = (code: string, states: Array<[string | null, number]>): GeoNode =>
  rollupByOrganisation(states.map(([state, total]) => row("Test organisation", code, state, null, total, 70)))[0].children[0];

describe("inferred coordinator labels", () => {
  it("shows a unique 100% state without a suffix", () => {
    const node = coordinator("1BB3", [["Uttar Pradesh", 100]]);
    expect(coordinatorLabel(node)).toEqual({ label: "Uttar Pradesh", share: 1, code: "1BB3" });
    expect(labelCoordinators([node]).get(node.id)?.label).toBe("Uttar Pradesh");
  });
  it("uses located participants for the 87.2% state share", () => {
    expect(coordinatorLabel(coordinator("2BB3", [["Telangana", 872], ["Assam", 128]]))).toEqual({ label: "Telangana", share: 0.872, code: "2BB3" });
  });
  it("shows Mixed when the largest state is only 40%", () => {
    expect(coordinatorLabel(coordinator("3BB3", [["Assam", 40], ["Maharashtra", 35], ["Telangana", 25]]))).toEqual({ label: "Mixed", share: 0.4, code: "3BB3" });
  });
  it("includes the exact 60% boundary as a state label", () => {
    expect(coordinatorLabel(coordinator("4BB3", [["Assam", 60], ["Maharashtra", 40]]))).toEqual({ label: "Assam", share: 0.6, code: "4BB3" });
  });
  it("falls back to the code when located is zero", () => {
    const node = { ...coordinator("5BB3", [["Assam", 100]]), located: 0 };
    expect(coordinatorLabel(node)).toEqual({ label: "5BB3", share: null, code: "5BB3" });
  });
  it("falls back when only unrecorded locations exist", () => {
    expect(coordinatorLabel(coordinator("6BB3", [[null, 100]]))).toEqual({ label: "6BB3", share: null, code: "6BB3" });
  });
  it("falls back when no state children exist", () => {
    const node = { ...coordinator("7BB3", [["Assam", 100]]), children: [] };
    expect(coordinatorLabel(node)).toEqual({ label: "7BB3", share: null, code: "7BB3" });
  });
  it("numbers duplicate state labels in supplied total-descending order, leaving unique labels alone", () => {
    const first = coordinator("8BB3", [["Assam", 990], ["Maharashtra", 10]]);
    const second = coordinator("9BB3", [["Assam", 76], ["Maharashtra", 24]]);
    const unique = coordinator("AB B", [["Telangana", 50]]);
    const labels = labelCoordinators([first, second, unique]);
    expect(labels.get(first.id)).toEqual({ label: "Assam 1", share: 0.99, code: "8BB3" });
    expect(labels.get(second.id)).toEqual({ label: "Assam 2", share: 0.76, code: "9BB3" });
    expect(labels.get(unique.id)?.label).toBe("Telangana");
  });
  it("never chooses unrecorded locations or includes them in the denominator", () => {
    const node = coordinator("BBBB", [[null, 900], ["Assam", 60], ["Maharashtra", 40]]);
    expect(node.children[0].label).toBe(LOCATION_NOT_RECORDED);
    expect(coordinatorLabel(node)).toEqual({ label: "Assam", share: 0.6, code: "BBBB" });
    expect(coordinatorLabel({ ...node, located: 200 }).share).toBe(0.3);
  });
  it("ignores non-state children even when they are largest", () => {
    const node = coordinator("CCCC", [["Assam", 100]]);
    const district: GeoNode = { ...node.children[0], kind: "district", label: "District", total: 1000 };
    expect(coordinatorLabel({ ...node, children: [district, ...node.children] })).toEqual({ label: "Assam", share: 1, code: "CCCC" });
  });
  it("numbers duplicate Mixed labels but never suffixes raw-code fallbacks", () => {
    const first = coordinator("DDDD", [["Assam", 40], ["Maharashtra", 35], ["Telangana", 25]]);
    const second = coordinator("EEEE", [["Assam", 4], ["Maharashtra", 3], ["Telangana", 3]]);
    const raw = coordinator("Mixed", [[null, 10]]);
    const labels = labelCoordinators([first, second, raw]);
    expect(labels.get(first.id)?.label).toBe("Mixed 1");
    expect(labels.get(second.id)?.label).toBe("Mixed 2");
    expect(labels.get(raw.id)).toEqual({ label: "Mixed", share: null, code: "Mixed" });
  });
});

describe("geo rollup", () => {
  it("does not flag the November 5 latest load on November 6 despite an October 29 oldest load", () => {
    const now = new Date("2026-11-06T14:01:00Z");
    expect(isParticipantLoadStale("2026-10-29T08:53:43Z", now)).toBe(true);
    expect(loadAgeDays("2026-11-05T08:53:43Z", now)).toBe(1);
    expect(isParticipantLoadStale("2026-11-05T08:53:43Z", now)).toBe(false);
  });
  it("includes the verified retired count alongside the shared seeker totals", () => {
    const seekerRows = [{ ...row("Organisation", "C01", "Uttar Pradesh", "Basti", 175473, 40), live_count: 5587, draft_count: 169882, retired_count: 4, below_threshold: 151839 }];
    expect(geoMetrics(seekerRows)).toMatchObject({ total: 175473, draft: 169882, live: 5587, retired: 4, belowThreshold: 151839 });
  });
  it("sums retired profiles through both drilldown hierarchies", () => {
    const retiredRows = [{ ...rows[0], retired_count: 1 }, { ...rows[1], retired_count: 3 }];
    const org = rollupByOrganisation(retiredRows)[0];
    expect(org.retired).toBe(4);
    expect(org.children[0].retired).toBe(4);
    expect(org.children[0].children.reduce((sum, node) => sum + node.retired, 0)).toBe(4);
    const geography = rollupByGeography(retiredRows);
    expect(geography.reduce((sum, node) => sum + node.retired, 0)).toBe(4);
    expect(geography.flatMap(node => node.children).reduce((sum, node) => sum + node.retired, 0)).toBe(4);
    expect(geoMetrics([]).retired).toBe(0);
  });
  it("weights completion by participants, not by averaging averages", () => {
    expect(geoMetrics([rows[0], rows[1]]).avgCompletion).toBe(26); // (8000+18000)/1000
  });
  it("scopes by domain and organisation, and throws on empty", () => {
    expect(scopeGeoRows(rows, "seeker", "ALIMCO")).toHaveLength(2);
    expect(() => scopeGeoRows(rows, "provider", "Tech Mahindra Foundation")).toThrow();
  });
  it("nests org → coordinator → state → district and keeps unlocated rows", () => {
    const tree = rollupByOrganisation(scopeGeoRows(rows, "seeker", null));
    const tm = tree.find(n => n.label === "Tech Mahindra Foundation")!;
    expect(tm).toMatchObject({ total: 1000, located: 100 });
    const states = tm.children[0].children.map(s => s.label);
    expect(states).toContain(LOCATION_NOT_RECORDED);
    expect(tm.children[0].children[1].children[0].label).toBe("Basti");
  });
  it("nests state → district → org with one unlocated node", () => {
    const tree = rollupByGeography(scopeGeoRows(rows, "seeker", null));
    const up = tree.find(n => n.label === "Uttar Pradesh")!;
    expect(up.children[0]).toMatchObject({ label: "Basti", total: 150, avgCompletion: 70 });
    expect(up.children[0].children.map(o => o.label)).toEqual(["Tech Mahindra Foundation", "ALIMCO"]);
    const none = tree.filter(n => n.label === LOCATION_NOT_RECORDED);
    expect(none).toHaveLength(1);
    expect(none[0]).toMatchObject({ total: 900, located: 0 });
    expect(none[0].children.every(c => c.kind === "org")).toBe(true);
    expect(tree.reduce((s, n) => s + n.total, 0)).toBe(1060);
  });
});
