import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { buildCohortFilter, cohortSummary, validateCohortFilter, cohortIdsCsv, COHORT_ARRAY_KEYS, districtsForStates, districtsAfterStateChange, type CohortDistrict } from "./cohort-live";

describe("cohort filters", () => {
  it("omits every unselected array rather than sending an empty array", () => {
    expect(buildCohortFilter(Object.fromEntries(COHORT_ARRAY_KEYS.map(key => [key, []])))).toEqual({});
    expect(buildCohortFilter({ orgs: ["ALIMCO"], categories: [] })).toEqual({ orgs: ["ALIMCO"] });
  });
  it("omits blank numeric guards", () => {
    expect(buildCohortFilter({ completion_max: "", max_calls: " ", cooldown_days: "" })).toEqual({});
  });
  it("includes zero numeric guards", () => {
    expect(buildCohortFilter({ completion_max: "0", max_calls: "0", cooldown_days: "0" })).toEqual({ completion_max: 0, max_calls: 0, cooldown_days: 0 });
  });
  it("only includes the recorded-need filter when enabled", () => {
    expect(buildCohortFilter({ needs_only: false })).toEqual({});
    expect(buildCohortFilter({ needs_only: true })).toEqual({ needs_only: true });
  });
  it("rejects unknown keys including contact details", () => {
    for (const key of ["name", "phone", "contact_phone", "unknown"]) expect(() => validateCohortFilter({ [key]: "x" })).toThrow();
  });
  it("rejects negative, fractional and nonnumeric guards", () => {
    for (const key of ["completion_max", "max_calls", "cooldown_days"]) {
      for (const value of [-1, 0.5, "2", NaN, Infinity]) expect(() => validateCohortFilter({ [key]: value })).toThrow();
    }
  });
  it("rejects invalid selection and toggle types", () => {
    expect(() => validateCohortFilter({ orgs: "ALIMCO" })).toThrow();
    expect(() => validateCohortFilter({ orgs: [1] })).toThrow();
    expect(() => validateCohortFilter({ needs_only: "true" })).toThrow();
    expect(() => validateCohortFilter([])).toThrow();
  });
  it("summarises every selected filter and guard", () => {
    expect(cohortSummary({ orgs: ["ALIMCO"], coordinators: ["C01"], categories: ["Pension"], requests: ["not received"], things: ["pension"], bands: ["High"], states: ["Uttar Pradesh"], districts: ["Basti"], lifecycle: ["Live"], needs_only: true, completion_max: 60, max_calls: 2, cooldown_days: 30 }))
      .toBe("ALIMCO · C01 · Pension · not received · pension · High · Uttar Pradesh · Basti · Live · with a recorded need · profile completion at most 60% · max 2 calls · 30-day cooldown");
  });
  it("reads correctly with just one filter", () => {
    expect(cohortSummary({ orgs: ["ALIMCO"] })).toBe("ALIMCO");
    expect(cohortSummary({ max_calls: 0 })).toBe("max 0 calls");
    expect(cohortSummary({ cooldown_days: 30 })).toBe("30-day cooldown");
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
