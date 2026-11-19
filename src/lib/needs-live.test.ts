import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import { categoriesFor, coverageFor, SERVICE_FAILURE_REQUESTS, isServiceFailure, itemBarPercent, organisations, type NeedsOverview } from "./needs-live";

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
  it("orders organisations by extracted needs, not seeker total, and excludes coverage-only organisations", () => {
    expect(organisations(overview)).toEqual(["ALIMCO", "DEPwD"]);
  });
  it("puts an organisation with a huge seeker total but almost no extracted needs last", () => {
    const data: NeedsOverview = {
      categories: [
        { orgName: "DEPwD Seeker Purple Dots", category: "Employment Opportunities", seekers: 1, phrasings: 1, mentions: 1 },
        { orgName: "ALIMCO", category: "Assistive Devices", seekers: 1026, phrasings: 40, mentions: 1300 },
        { orgName: "ALIMCO", category: "Pension", seekers: 706, phrasings: 12, mentions: 800 },
        { orgName: "Tech Mahindra Foundation", category: "Pension", seekers: 1197, phrasings: 9, mentions: 1400 },
        { orgName: "EnAble India", category: "Pension", seekers: 583, phrasings: 7, mentions: 700 },
        { orgName: "Youth4Jobs Foundation", category: "Pension", seekers: 100, phrasings: 5, mentions: 120 },
        { orgName: "Department of Empowerment of Persons with Disabilities (Divyangjan)", category: "Pension", seekers: 99, phrasings: 4, mentions: 110 },
      ],
      coverage: [
        { orgName: "DEPwD Seeker Purple Dots", seekersTotal: 110721, profilesInPool: 60151, profilesRead: 1 },
        { orgName: "ALIMCO", seekersTotal: 48603, profilesInPool: 15898, profilesRead: 2661 },
        { orgName: "Tech Mahindra Foundation", seekersTotal: 30000, profilesInPool: 9000, profilesRead: 1500 },
        { orgName: "EnAble India", seekersTotal: 20000, profilesInPool: 6000, profilesRead: 900 },
        { orgName: "Youth4Jobs Foundation", seekersTotal: 10000, profilesInPool: 3000, profilesRead: 400 },
        { orgName: "Department of Empowerment of Persons with Disabilities (Divyangjan)", seekersTotal: 5000, profilesInPool: 1500, profilesRead: 200 },
      ],
    };
    // 3232 extracted people for ALIMCO vs 1 for DEPwD Seeker Purple Dots, whose
    // 1,10,721 registered seekers must not lift it to the front.
    expect(organisations(data)).toEqual([
      "ALIMCO",
      "Tech Mahindra Foundation",
      "EnAble India",
      "Youth4Jobs Foundation",
      "Department of Empowerment of Persons with Disabilities (Divyangjan)",
      "DEPwD Seeker Purple Dots",
    ]);
  });
  it("returns the explicit ALIMCO coverage counts", () => {
    expect(coverageFor(overview, "ALIMCO")).toEqual({ orgName: "ALIMCO", seekersTotal: 48603, profilesInPool: 15898, profilesRead: 2661 });
  });
  it("returns null for missing coverage", () => { expect(coverageFor(overview, "Missing")).toBeNull(); });
  it("matches exactly the nine service-failure requests, without keyword inference", () => {
    const failures = ["not received", "payment stopped", "payment delayed", "payment stalled", "payment irregular", "arrears", "rejected", "bank account issue", "application pending"];
    expect([...SERVICE_FAILURE_REQUESTS]).toEqual(failures);
    for (const value of failures) {
      expect(isServiceFailure(value)).toBe(true);
      for (const other of [value.toUpperCase(), `pension: ${value}`, `${value} temporarily`, ` ${value}`]) expect(isServiceFailure(other)).toBe(false);
    }
    for (const value of ["new", "information", "apply", "restart", "pension", ""]) expect(isServiceFailure(value)).toBe(false);
  });
  it("renders both sections when a category has one item and many requests", () => {
    const detail = {
      items: [{ thing: "pension", people: 706, phrasings: 12 }],
      requests: [{ request: "new", people: 296 }, { request: "not received", people: 123 }, { request: "information", people: 70 }, { request: "apply", people: 59 }, { request: "payment stopped", people: 34 }, { request: "restart", people: 31 }, { request: "payment delayed", people: 20 }],
    };
    // Execute the real expansion with a successful category query, bypassing
    // unrelated route/server transforms without copying its rendering logic.
    const source = readFileSync("src/routes/ecosystem-view.tsx", "utf8");
    const expansion = source.slice(source.indexOf("function NeedDetail("), source.indexOf("function TotalsRow("));
    const compiled = ts.transpileModule(expansion, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
    const render = new Function("exports", "require", "useQuery", "useServerFn", "fetchNeedDetail", "itemBarPercent", "isServiceFailure", "fmt", `${compiled}; return NeedDetail;`)(
      {}, () => jsxRuntime, () => ({ data: detail, isPending: false, isError: false }), () => () => {}, () => {}, itemBarPercent, isServiceFailure, (n: number) => n.toLocaleString("en-IN"),
    );
    const visible = renderToStaticMarkup(render({ org: "ALIMCO", category: "Pension" })).replace(/<[^>]*>/g, "");
    expect(visible).toContain("pension");
    expect(visible).toContain("706");
    for (const request of detail.requests) {
      expect(visible).toContain(`${request.request} ${request.people}`);
    }
  });
  it("scales item bars to the largest item inside that category", () => {
    const items = [{ thing: "tricycle", people: 643, phrasings: 69 }, { thing: "wheelchair", people: 321.5, phrasings: 12 }];
    expect(itemBarPercent(items[0], items)).toBe(100);
    expect(itemBarPercent(items[1], items)).toBe(50);
    const pension = [{ thing: "pension", people: 706, phrasings: 12 }];
    expect(itemBarPercent(pension[0], pension)).toBe(100);
  });
});
