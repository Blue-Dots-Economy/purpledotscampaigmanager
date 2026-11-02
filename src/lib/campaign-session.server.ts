import { useSession, getRequest } from "@tanstack/react-start/server";
import { sbForAuth } from "./db.server";
import { resolveCampaignDistrictScope, type CampaignDistrictScope } from "./campaign-district-scope";
import { isPreviewHost } from "./preview-host";

export type IdentityPath = "verified" | "preview-fallback" | "none";

function readOrdinarySessionEmail(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const raw = cookie.split("; ").find((c) => c.startsWith("rozgar_auth="));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw.slice("rozgar_auth=".length)));
    return typeof parsed?.email === "string" && parsed.email ? parsed.email : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the signed-in identity. The verified campaign session is always
 * preferred. The Lovable preview gateway never returns the app's sealed cookie,
 * so on a positively recognised preview host only, fall back to the ordinary
 * (client-readable) session cookie — role, active status and scoping are still
 * re-read server-side from app_users afterwards, never trusted from the cookie.
 * Every unrecognised host takes the strict path.
 */
export async function resolveRequestIdentity(password: string | undefined): Promise<{ email: string | null; path: IdentityPath }> {
  try {
    const session = await campaignSession(password);
    if (session.data.email) return { email: session.data.email, path: "verified" };
  } catch {
    // No usable verified session; the preview fallback below may still apply.
  }
  const hostname = new URL(getRequest().url).hostname.toLowerCase();
  if (isPreviewHost(hostname)) {
    const email = readOrdinarySessionEmail(getRequest());
    if (email) return { email, path: "preview-fallback" };
  }
  return { email: null, path: "none" };
}

export function campaignSession(password: string | undefined) {
  if (!password || password.length < 32) throw new Error("Campaign session configuration is unavailable.");
  return useSession<{ email: string }>({
    name: "purple_campaign_session",
    password,
    maxAge: 60 * 60 * 24 * 7,
    // The editor preview runs in a cross-site iframe, where Lax cookies are never sent back.
    // On HTTPS use SameSite=None + Partitioned (CHIPS) so the verified session survives there.
    cookie: new URL(getRequest().url).protocol === "https:"
      ? { httpOnly: true, sameSite: "none", secure: true, partitioned: true, path: "/" }
      : { httpOnly: true, sameSite: "lax", secure: false, path: "/" },
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
    if (!session.data.email) {
      console.error("[campaign-scope] Verified session is missing");
      return resolveCampaignDistrictScope(null, true);
    }
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