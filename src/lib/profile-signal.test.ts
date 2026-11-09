import { describe, expect, it } from "vitest";
import { buildSignalCounts, canSeeProfileSignal, classify, disabilityPasses, locationPasses, matchFor, needCategoryPasses, nodeIdsFor, TOTAL_KEY } from "./profile-signal";
import { rollupByGeography, rollupByOrganisation, type GeoRollupRow } from "./geo-rollup";

const all = { name: true, location: true, contact: true, disability: true, needCategory: true, needDetails: true };
describe("profile signal", () => {
  it("is visible only to purpledots@ekstep.org", () => {
    expect(canSeeProfileSignal(" PurpleDots@ekstep.org ")).toBe(true);
    expect(canSeeProfileSignal("vineela@purpledots.com")).toBe(false);
    expect(canSeeProfileSignal(null)).toBe(false);
  });
  it("is Strong only when all six checks pass", () => {
    expect(classify(all)).toBe("strong");
    expect(classify({ ...all, name: false })).toBe("moderate");
  });
  it("is Moderate when location, disability and need category pass but another fails", () => {
    expect(classify({ ...all, contact: false, needDetails: false })).toBe("moderate");
  });
  it("is Weak when location, disability or need category fails", () => {
    expect(classify({ ...all, location: false })).toBe("weak");
    expect(classify({ ...all, disability: false })).toBe("weak");
    expect(classify({ ...all, needCategory: false })).toBe("weak");
  });
  it("rejects a location that is only the district and/or state", () => {
    expect(locationPasses({ location_label: "Basti", district: "Basti", state: "Uttar Pradesh" })).toBe(false);
    expect(locationPasses({ location_label: "Basti, Uttar Pradesh", district: "Basti", state: "Uttar Pradesh" })).toBe(false);
    expect(locationPasses({ location_label: "Unknown", district: null, state: null })).toBe(false);
    expect(locationPasses({ location_label: "Ward 4, Basti", district: "Basti", state: "Uttar Pradesh" })).toBe(true);
  });
  it("rejects a disability of “any” and blank need categories", () => {
    expect(disabilityPasses(["Any"])).toBe(false);
    expect(disabilityPasses(["Visual Impairment"])).toBe(true);
    expect(needCategoryPasses([" "])).toBe(false);
    expect(needCategoryPasses(["Government Schemes"])).toBe(true);
  });
  it("uses the same row ids as both organisation and geography tables", () => {
    const r: GeoRollupRow = { org_name: "A", coordinator_code: "C1", coordinator_type: "seeker", state: "UP", district: "Basti", domain: "seeker", total: 1, live_count: 0, draft_count: 1, retired_count: 0, avg_completion: 0, below_threshold: 0 };
    const unloc = { ...r, state: null, district: null };
    const ids = (n: { id: string; children: any[] }[]): string[] => n.flatMap(x => [x.id, ...ids(x.children)]);
    for (const row of [r, unloc]) {
      const tableIds = [...ids(rollupByOrganisation([row])), ...ids(rollupByGeography([row]))].sort();
      expect(nodeIdsFor({ org: row.org_name, coordinator: row.coordinator_code, state: row.state, district: row.district }).sort()).toEqual(tableIds);
    }
  });
  it("splits matches by draft and live, and every unmatched profile counts as Weak", () => {
    const base = { org: "A", coordinator: "C1", state: null, district: null };
    const counts = buildSignalCounts({
      profiles: [{ ...base, item_id: "p1", lifecycle: "draft" }, { ...base, item_id: "p2", lifecycle: "live" }],
      calls: [{ item_id: "p1", disability: ["Locomotor Disability"], needs: ["Employment Support"] }, { item_id: "p2", disability: ["Mental Illness"], needs: null }],
      locations: [{ item_id: "p1", location_label: "Ward 4", district: null, state: null }],
    });
    const row = { draft: 8, live: 2 };
    expect(matchFor(row, counts["/org:A"], { kind: "signal", key: "moderate" })).toEqual({ draft: 1, live: 0, total: 1 });
    expect(matchFor(row, counts["/org:A"], { kind: "signal", key: "weak" })).toEqual({ draft: 7, live: 2, total: 9 });
    expect(matchFor(row, counts[TOTAL_KEY], { kind: "missing", key: "disability" })).toEqual({ draft: 7, live: 1, total: 8 });
    expect(matchFor(row, undefined, { kind: "signal", key: "weak" })).toEqual({ draft: 8, live: 2, total: 10 });
  });
});
