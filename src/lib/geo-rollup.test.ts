import { describe, expect, it } from "vitest";
import { geoMetrics, rollupByGeography, rollupByOrganisation, scopeGeoRows, LOCATION_NOT_RECORDED, type GeoRollupRow } from "./geo-rollup";

const row = (org_name: string, coordinator_code: string, state: string | null, district: string | null, total: number, avg_completion: number, domain: "seeker" | "provider" = "seeker"): GeoRollupRow =>
  ({ org_name, coordinator_code, coordinator_type: domain, state, district, domain, total, live_count: 1, draft_count: total - 1, avg_completion, below_threshold: 1 });
const rows = [
  row("Tech Mahindra Foundation", "A2BC", "Uttar Pradesh", "Basti", 100, 80),
  row("Tech Mahindra Foundation", "A2BC", null, null, 900, 20),
  row("ALIMCO", "Z9XY", "Uttar Pradesh", "Basti", 50, 50),
  row("ALIMCO", "Z9XY", "Maharashtra", "Pune", 10, 10),
  row("ALIMCO", "P1PP", "Maharashtra", "Pune", 5, 90, "provider"),
];

describe("geo rollup", () => {
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
