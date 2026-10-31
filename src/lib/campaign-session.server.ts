import { useSession, getRequest } from "@tanstack/react-start/server";
import { sbForAuth } from "./db.server";
import { resolveCampaignDistrictScope, type CampaignDistrictScope } from "./campaign-district-scope";

export function campaignSession(password: string | undefined) {
  if (!password || password.length < 32) throw new Error("Campaign session configuration is unavailable.");
  return useSession<{ email: string }>({
    name: "purple_campaign_session",
    password,
    maxAge: 60 * 60 * 24 * 7,
    cookie: { httpOnly: true, sameSite: "lax", secure: new URL(getRequest().url).protocol === "https:", path: "/" },
  });
}

/** Only call after login has verified the credentials; never accept a browser session identity. */
export async function establishCampaignSession(password: string | undefined, email: string) {
  const session = await campaignSession(password);
  await session.clear();
  await session.update({ email });
}

export async function readCampaignDistrictScope(password: string | undefined): Promise<CampaignDistrictScope> {
  try {
    const session = await campaignSession(password);
    if (!session.data.email) return resolveCampaignDistrictScope(null, true);
    // Re-read account attributes, so an account's district/role changes apply without a new login.
    const { data, error } = await sbForAuth().from("app_users")
      .select("role,district,active").eq("email", session.data.email).maybeSingle();
    if (error) throw new Error("Campaign account lookup failed.");
    const scope = resolveCampaignDistrictScope(data?.active ? data : null, true);
    if (scope.error) console.error("[campaign-scope] Access refused", { code: scope.error.code });
    return scope;
  } catch {
    console.error("[campaign-scope] Verified session/account lookup failed");
    return { enabled: true, district: null, error: { code: "CAMPAIGN_SESSION_REQUIRED", message: "Campaign access could not be verified. Please sign in again." } };
  }
}