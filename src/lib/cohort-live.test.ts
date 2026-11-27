import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildCohortFilter, cohortSummary, validateCohortFilter, cohortIdsCsv, COHORT_ARRAY_KEYS, districtsForStates, districtsAfterStateChange, cohortDistricts, type CohortDistrict } from "./cohort-live";

describe("cohort filters", () => {
  it("omits every unselected array rather than sending an empty array", () => {
    expect(buildCohortFilter(Object.fromEntries(COHORT_ARRAY_KEYS.map(key => [key, []])))).toEqual({});
    expect(buildCohortFilter({ orgs: ["ALIMCO"], states: [] })).toEqual({ orgs: ["ALIMCO"] });
  });
  it("accepts exactly the remaining selections", () => {
    expect([...COHORT_ARRAY_KEYS]).toEqual(["orgs", "coordinators", "things", "states", "districts", "lifecycle"]);
  });
  it("rejects every removed filter, even with a value the database would accept", () => {
    for (const key of ["categories", "requests", "bands"]) expect(() => validateCohortFilter({ [key]: ["Pension"] })).toThrow(`Unknown cohort filter: ${key}.`);
    for (const key of ["completion_max", "max_calls", "cooldown_days"]) expect(() => validateCohortFilter({ [key]: 2 })).toThrow(`Unknown cohort filter: ${key}.`);
  });
  it("never builds a removed filter from stale picker state", () => {
    const stale = { orgs: ["ALIMCO"], categories: ["Pension"], bands: ["High"], max_calls: "2", cooldown_days: "30" };
    expect(buildCohortFilter(stale as Parameters<typeof buildCohortFilter>[0])).toEqual({ orgs: ["ALIMCO"] });
  });
  it("only includes the recorded-need filter when enabled", () => {
    expect(buildCohortFilter({ needs_only: false })).toEqual({});
    expect(buildCohortFilter({ needs_only: true })).toEqual({ needs_only: true });
  });
  it("rejects unknown keys including contact details", () => {
    for (const key of ["name", "phone", "contact_phone", "unknown"]) expect(() => validateCohortFilter({ [key]: "x" })).toThrow();
  });
  it("rejects invalid selection and toggle types", () => {
    expect(() => validateCohortFilter({ orgs: "ALIMCO" })).toThrow();
    expect(() => validateCohortFilter({ orgs: [1] })).toThrow();
    expect(() => validateCohortFilter({ needs_only: "true" })).toThrow();
    expect(() => validateCohortFilter([])).toThrow();
  });
  it("summarises every selected filter", () => {
    expect(cohortSummary({ orgs: ["ALIMCO"], coordinators: ["C01"], things: ["pension"], states: ["Uttar Pradesh"], districts: ["Basti"], lifecycle: ["Live"], needs_only: true }))
      .toBe("ALIMCO · C01 · pension · Uttar Pradesh · Basti · Live · with a recorded need");
  });
  it("reads correctly with just one filter", () => {
    expect(cohortSummary({ orgs: ["ALIMCO"] })).toBe("ALIMCO");
    expect(cohortSummary({ needs_only: true })).toBe("with a recorded need");
    expect(cohortSummary({})).toBe("All people");
  });
  it("exports exactly two identifier columns even if extra fields exist", () => {
    const row = { item_id: "item-1", user_id: "user-1", name: "excluded", phone: "excluded" };
    expect(cohortIdsCsv([row])).toBe('item_id,user_id\r\n"item-1","user-1"');
  });
  it("refuses cohort entry into both dialler operations before any side effect", async () => {
    const source = readFileSync("src/routes/launch.tsx", "utf8");
    for (const [name, next] of [["startCreatedBatch", "launch"], ["launch", null]] as const) {
      const start = source.indexOf(`  const ${name} = async`);
      const end = next ? source.indexOf(`  const ${next} = async`, start) : source.indexOf("\n\n  return (", start);
      const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
      let sideEffects = 0;
      const invoke = new Function("source", "setLaunching", `${code}; return ${name};`)("cohort", () => { sideEffects++; });
      await invoke("unused-batch");
      expect(sideEffects).toBe(0);
    }
  });
});

describe("cohort districts", () => {
  const all: CohortDistrict[] = [
    { state: "Uttar Pradesh", district: "Basti" }, { state: "Uttar Pradesh", district: "Lucknow" },
    { state: "Maharashtra", district: "Pune" }, { state: "Maharashtra", district: "Aurangabad" },
    { state: "Bihar", district: "Aurangabad" },
  ];
  it("passes state and district pairs through and drops malformed rows", () => {
    expect(cohortDistricts([{ state: "Uttar Pradesh", district: "Basti", extra: 1 }, { state: "Bihar" }, { state: 1, district: "X" }, "Pune", null]))
      .toEqual([{ state: "Uttar Pradesh", district: "Basti" }]);
    expect(cohortDistricts(undefined)).toEqual([]);
  });
  it("narrows districts to the selected states", () => {
    expect(districtsForStates(all, ["Uttar Pradesh"])).toEqual(["Basti", "Lucknow"]);
    expect(districtsForStates(all, ["Uttar Pradesh", "Bihar"])).toEqual(["Aurangabad", "Basti", "Lucknow"]);
  });
  it("offers every district when no state is selected", () => {
    expect(districtsForStates(all, [])).toEqual(["Aurangabad", "Basti", "Lucknow", "Pune"]);
  });
  it("removes a deselected state's districts from the selection", () => {
    expect(districtsAfterStateChange(all, ["Uttar Pradesh", "Maharashtra"], ["Maharashtra"], ["Basti", "Pune"])).toEqual(["Pune"]);
    expect(districtsAfterStateChange(all, ["Uttar Pradesh"], [], ["Basti"])).toEqual([]);
  });
  it("offers and keeps a district name shared by two states when either state is selected", () => {
    expect(districtsForStates(all, ["Maharashtra"])).toContain("Aurangabad");
    expect(districtsForStates(all, ["Bihar"])).toEqual(["Aurangabad"]);
    expect(districtsAfterStateChange(all, ["Maharashtra", "Bihar"], ["Bihar"], ["Aurangabad", "Pune"])).toEqual(["Aurangabad"]);
  });
  it("drops a district that the newly selected states no longer offer", () => {
    expect(districtsAfterStateChange(all, [], ["Maharashtra"], ["Basti", "Pune"])).toEqual(["Pune"]);
  });
});
