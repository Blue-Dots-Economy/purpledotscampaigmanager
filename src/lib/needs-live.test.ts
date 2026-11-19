import { describe, expect, it } from "vitest";
import { categoriesFor, coverageFor, GRIEVANCE_NEEDS, isGrievance, organisations, type NeedsOverview } from "./needs-live";

const overview: NeedsOverview = {
  categories: [
    { orgName: "ALIMCO", category: "Assistive Devices", seekers: 1026, phrasings: 40, mentions: 1300 },
    { orgName: "ALIMCO", category: "Pension", seekers: 706, phrasings: 12, mentions: 800 },
    { orgName: "DEPwD", category: "Pension", seekers: 1, phrasings: 1, mentions: 1 },
  ],
  coverage: [
    { orgName: "DEPwD", seekersTotal: 100, profilesInPool: 50, profilesRead: 1 },
    { orgName: "ALIMCO", seekersTotal: 48603, profilesInPool: 15898, profilesRead: 2661 },
    { orgName: "Unread", seekersTotal: 100000, profilesInPool: 50000, profilesRead: 0 },
  ],
};

describe("needs live", () => {
  it("passes server seekers through unchanged rather than summing", () => {
    expect(categoriesFor(overview, "ALIMCO")).toEqual([overview.categories[0], overview.categories[1]]);
    expect(categoriesFor(overview, "ALIMCO")[0].seekers).toBe(1026);
  });
  it("returns only the selected organisation's categories in server order", () => {
    expect(categoriesFor(overview, "DEPwD")).toEqual([overview.categories[2]]);
  });
  it("keeps all six organisations selectable", () => {
    const names = ["ALIMCO", "Tech Mahindra Foundation", "EnAble India", "Youth4Jobs Foundation", "Department of Empowerment of Persons with Disabilities (Divyangjan)", "DEPwD Seeker Purple Dots"];
    const data: NeedsOverview = {
      categories: names.map(orgName => ({ orgName, category: "Pension", seekers: 1, phrasings: 1, mentions: 1 })),
      coverage: names.map((orgName, index) => ({ orgName, seekersTotal: 600 - index, profilesInPool: 100, profilesRead: 10 })),
    };
    expect(organisations(data)).toEqual(names);
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
    expect(isGrievance("pension stopped temporarily")).toBe(false);
  });
});
