import { strictEqual } from "node:assert";
import { test } from "node:test";
import { ENABLE_COHORT_AUDIENCE, resolveLaunchAudienceSource } from "../routes/launch";

test("Cohort audience is enabled", () => {
  strictEqual(ENABLE_COHORT_AUDIENCE, true);
});

test("A cohort selection is honoured", () => {
  strictEqual(resolveLaunchAudienceSource("cohort"), "cohort");
});

test("Bulk upload remains available", () => {
  strictEqual(resolveLaunchAudienceSource("upload"), "upload");
});