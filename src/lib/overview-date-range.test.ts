import { deepStrictEqual } from "node:assert";
import { test } from "node:test";
import { overviewDefaultDateRange } from "./overview-date-range";

test("Overview defaults to 30 inclusive calendar days ending today", () => {
  deepStrictEqual(overviewDefaultDateRange(new Date(2026, 9, 30, 14, 3)), {
    dateFrom: "2026-10-01",
    dateTo: "2026-10-30",
  });
});

test("Overview's 30-day default crosses year boundaries", () => {
  deepStrictEqual(overviewDefaultDateRange(new Date(2026, 0, 10)), {
    dateFrom: "2025-12-12",
    dateTo: "2026-01-10",
  });
});