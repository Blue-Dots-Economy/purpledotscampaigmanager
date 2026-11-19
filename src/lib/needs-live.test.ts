import { describe, expect, it } from "vitest";
import { categoriesFor, coverageFor, GRIEVANCE_NEEDS, isGrievance, needsFor, organisations, type NeedsOverview } from "./needs-live";

const overview: NeedsOverview = {
  rows: [
    { orgName: "ALIMCO", category: "Pension", need: "pension stopped", source: "profile", seekers: 55, mentions: 60 },
    { orgName: "ALIMCO", category: "Assistive Devices", need: "tricycle", source: "profile", seekers: 230, mentions: 240 },
    { orgName: "ALIMCO", category: "Pension", need: "pension", source: "profile", seekers: 296, mentions: 300 },
    { orgName: "ALIMCO", category: "Pension", need: "pension not received", source: "call", seekers: 114, mentions: 120 },
    { orgName: "DEPwD", category: "Pension", need: "pension application", source: "profile", seekers: 1, mentions: 1 },
    { orgName: "ALIMCO", category: "Assistive Devices", need: "battery tricycle", source: "profile", seekers: 139, mentions: 140 },
  ],
  coverage: [
    { orgName: "DEPwD", seekersTotal: 100, profilesInPool: 50, profilesRead: 1 },
    { orgName: "ALIMCO", seekersTotal: 48603, profilesInPool: 15898, profilesRead: 2661 },
    { orgName: "Unread", seekersTotal: 100000, profilesInPool: 50000, profilesRead: 0 },
  ],
};

describe("needs live", () => {
  it("sums seekers within each category and preserves category ordering", () => {
    expect(categoriesFor(overview, "ALIMCO").map(({ category, seekers }) => ({ category, seekers }))).toEqual([
      { category: "Pension", seekers: 465 }, { category: "Assistive Devices", seekers: 369 },
    ]);
  });
  it("counts distinct verbatim phrasings, not source rows", () => {
    const duplicate = { ...overview.rows[0], source: "call", seekers: 5 };
    const category = categoriesFor({ ...overview, rows: [...overview.rows, duplicate] }, "ALIMCO")[0];
    expect(category.phrasings).toBe(3);
    expect(category.seekers).toBe(470);
    expect(category.needs).toContain(duplicate);
  });
  it("reports one phrasing and one seeker for a single-need category", () => {
    expect(categoriesFor(overview, "DEPwD")[0]).toMatchObject({ category: "Pension", seekers: 1, phrasings: 1 });
  });
  it("does not change category rollups when sources change to call", () => {
    const summarize = (data: NeedsOverview) => categoriesFor(data, "ALIMCO").map(({ category, seekers, phrasings }) => ({ category, seekers, phrasings }));
    expect(summarize({ ...overview, rows: overview.rows.map(row => ({ ...row, source: "call" })) })).toEqual(summarize(overview));
  });
  it("keeps all six organisations selectable when all six are returned", () => {
    const names = ["ALIMCO", "Tech Mahindra Foundation", "EnAble India", "Youth4Jobs Foundation", "Department of Empowerment of Persons with Disabilities (Divyangjan)", "DEPwD Seeker Purple Dots"];
    const data: NeedsOverview = {
      rows: names.flatMap((orgName, index) => Array.from({ length: [1114, 480, 52, 10, 7, 1][index] }, () => ({ ...overview.rows[0], orgName }))),
      coverage: names.map((orgName, index) => ({ orgName, seekersTotal: 600 - index, profilesInPool: 100, profilesRead: 10 })),
    };
    expect(organisations(data)).toEqual(names);
  });
  it("groups only the selected organisation and orders categories and needs by seekers", () => {
    const groups = needsFor(overview, "ALIMCO");
    expect(groups.map(g => g.category)).toEqual(["Pension", "Assistive Devices"]);
    expect(groups[0].needs.map(n => n.seekers)).toEqual([296, 114, 55]);
    expect(groups[1].needs.map(n => n.seekers)).toEqual([230, 139]);
    expect(groups.flatMap(g => g.needs).every(n => n.orgName === "ALIMCO")).toBe(true);
  });
  it("orders organisations by seeker total and excludes coverage-only organisations", () => {
    expect(organisations(overview)).toEqual(["ALIMCO", "DEPwD"]);
  });
  it("returns the explicit ALIMCO coverage counts", () => {
    expect(coverageFor(overview, "ALIMCO")).toEqual({ orgName: "ALIMCO", seekersTotal: 48603, profilesInPool: 15898, profilesRead: 2661 });
  });
  it("returns null for missing coverage", () => { expect(coverageFor(overview, "Missing")).toBeNull(); });
  it("marks pension not received case-insensitively", () => { expect(isGrievance("PENSION NOT RECEIVED")).toBe(true); });
  it("marks pension stopped case-insensitively", () => { expect(isGrievance("Pension Stopped")).toBe(true); });
  it("never expands the grievance list beyond the two hand-checked labels", () => {
    expect([...GRIEVANCE_NEEDS]).toEqual(["pension not received", "pension stopped"]);
    expect(isGrievance("pension")).toBe(false);
    expect(isGrievance("pension application")).toBe(false);
    expect(isGrievance("pension stopped temporarily")).toBe(false);
  });
  it("preserves call source and all row fields without merging with profiles", () => {
    const call = overview.rows[3];
    const withProfile = { ...overview, rows: [...overview.rows, { ...call, source: "profile" }] };
    const needs = needsFor(withProfile, "ALIMCO").flatMap(g => g.needs);
    expect(needs.find(n => n.source === "call")).toBe(call);
    expect(needs.filter(n => n.need === call.need).map(n => n.source)).toEqual(["call", "profile"]);
  });
  it("handles empty and single-row organisations", () => {
    expect(needsFor(overview, "Missing")).toEqual([]);
    expect(needsFor(overview, "DEPwD")[0].needs).toEqual([overview.rows[4]]);
  });
});