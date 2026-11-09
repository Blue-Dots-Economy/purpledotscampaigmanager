import { describe, expect, it } from "vitest";
import { canSeeProfileSignal, classify, disabilityPasses, locationPasses, needCategoryPasses, rollupProfileSignal } from "./profile-signal";

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
  it("counts every unmatched participant as Weak so totals reconcile", () => {
    const r = rollupProfileSignal({
      orgTotals: new Map([["A", 10], ["B", 5]]),
      profileOrg: new Map([["p1", "A"], ["p2", "A"], ["p3", "B"]]),
      calls: [{ item_id: "p1", disability: ["Locomotor Disability"], needs: ["Employment Support"] }, { item_id: "p2", disability: ["Mental Illness"], needs: null }],
      locations: [{ item_id: "p1", location_label: "Ward 4", district: "Basti", state: "UP" }, { item_id: "p3", location_label: "Hadapsar", district: "Pune", state: "MH" }],
    });
    const a = r.byOrganisation.find(o => o.org === "A")!;
    expect(a).toMatchObject({ total: 10, strong: 0, moderate: 1, weak: 9 });
    expect(a.missing).toMatchObject({ location: 9, disability: 8, needCategory: 9, name: 10 });
    expect(r.totals).toMatchObject({ total: 15, moderate: 1, weak: 14 });
    expect(r.totals.missing.location).toBe(13);
  });
});
