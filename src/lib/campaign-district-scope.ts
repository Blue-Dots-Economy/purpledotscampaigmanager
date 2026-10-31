/** Enable only after live call region mapping has been populated and verified. */
export const ENABLE_CAMPAIGN_DISTRICT_SCOPING = false;

const DISTRICT_SCOPED_ROLES = new Set(["wc", "jfc"]);
export interface CampaignDistrictScope {
  enabled: boolean;
  district: string | null;
  error: { message: string; code: string } | null;
}

export function resolveCampaignDistrictScope(
  actor: { role: string; district?: string | null } | null,
  enabled: boolean = ENABLE_CAMPAIGN_DISTRICT_SCOPING,
): CampaignDistrictScope {
  if (!enabled) return { enabled: false, district: null, error: null };
  if (!actor) return { enabled: true, district: null, error: { code: "CAMPAIGN_SESSION_REQUIRED", message: "Sign in again to verify your campaign access." } };
  if (!DISTRICT_SCOPED_ROLES.has(actor.role)) return { enabled: true, district: null, error: null };
  const district = actor.district?.trim();
  if (!district || district.toLowerCase() === "all" || district.toLowerCase() === "unknown") {
    return { enabled: true, district: null, error: { code: "CAMPAIGN_DISTRICT_MISSING", message: "Your account has no district assigned. Ask an administrator to assign your district before viewing campaign data." } };
  }
  return { enabled: true, district, error: null };
}

export function campaignScopedState(scope: CampaignDistrictScope, requested?: string): string {
  if (scope.error) throw new Error(scope.error.message);
  return scope.district ?? (requested && requested !== "all" ? requested : "all");
}