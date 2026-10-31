import { strictEqual, deepStrictEqual, throws } from "node:assert";
import { test } from "node:test";
import { ENABLE_CAMPAIGN_DISTRICT_SCOPING, resolveCampaignDistrictScope, campaignScopedState } from "./campaign-district-scope";

test("District scoping ships disabled and preserves requested all-state access", () => {
  strictEqual(ENABLE_CAMPAIGN_DISTRICT_SCOPING, false);
  strictEqual(campaignScopedState(resolveCampaignDistrictScope({ role: "wc", district: null }), "all"), "all");
});
for (const role of ["wc", "jfc"]) {
  test(`${role} cannot override Basti with all or another district`, () => {
    const scope = resolveCampaignDistrictScope({ role, district: "Basti" }, true);
    strictEqual(campaignScopedState(scope, "all"), "Basti");
    strictEqual(campaignScopedState(scope, "Pune"), "Basti");
  });
  test(`${role} without a district receives an explicit error and cannot read nationwide`, () => {
    const scope = resolveCampaignDistrictScope({ role, district: null }, true);
    strictEqual(scope.error?.code, "CAMPAIGN_DISTRICT_MISSING");
    throws(() => campaignScopedState(scope, "all"));
  });
}
for (const role of ["admin", "network_admin", "ecosystem", "owner", "coordinator"]) {
  test(`${role} is not district-scoped`, () => {
    strictEqual(campaignScopedState(resolveCampaignDistrictScope({ role, district: "Basti" }, true), "all"), "all");
  });
}
test("Enabled scoping refuses an unverified session", () => {
  strictEqual(resolveCampaignDistrictScope(null, true).error?.code, "CAMPAIGN_SESSION_REQUIRED");
});
test("Disabled scoping does not require or inspect an account", () => {
  deepStrictEqual(resolveCampaignDistrictScope(null, false), { enabled: false, district: null, error: null });
});