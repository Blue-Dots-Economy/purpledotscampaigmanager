import { strictEqual } from "node:assert";
import { test } from "node:test";
import { ENABLE_COHORT_AUDIENCE, resolveLaunchAudienceSource } from "../routes/launch";

test("Cohort audience is temporarily disabled", () => {
  strictEqual(ENABLE_COHORT_AUDIENCE, false);
});

test("A cohort selection is forced to upload while cohort is disabled", () => {
  strictEqual(resolveLaunchAudienceSource("cohort"), "upload");
});

test("Bulk upload remains available", () => {
  strictEqual(resolveLaunchAudienceSource("upload"), "upload");
});