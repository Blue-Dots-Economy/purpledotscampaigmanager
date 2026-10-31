import { createServerFn } from "@tanstack/react-start";
import { ENABLE_CAMPAIGN_DISTRICT_SCOPING, resolveCampaignDistrictScope } from "./campaign-district-scope";

export const fetchCampaignDistrictScope = createServerFn({ method: "GET" }).handler(async () => {
  if (!ENABLE_CAMPAIGN_DISTRICT_SCOPING) return resolveCampaignDistrictScope(null);
  const { readCampaignDistrictScope } = await import("./campaign-session.server");
  return readCampaignDistrictScope(process.env["CAMPAIGN_SESSION_SECRET"]);
});

export const clearCampaignSession = createServerFn({ method: "POST" }).handler(async () => {
  if (!ENABLE_CAMPAIGN_DISTRICT_SCOPING) return;
  const { campaignSession } = await import("./campaign-session.server");
  await (await campaignSession(process.env["CAMPAIGN_SESSION_SECRET"])).clear();
});