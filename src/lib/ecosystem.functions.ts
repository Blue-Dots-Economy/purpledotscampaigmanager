import { createServerFn } from "@tanstack/react-start";
import type { EcosystemOverview } from "./ecosystem-live";

export type EcosystemOverviewResult = EcosystemOverview & { source: "purple" };

export const fetchEcosystemOverview = createServerFn({ method: "GET" }).handler(async (): Promise<EcosystemOverviewResult> => {
  try {
    const { resolveRequestIdentity } = await import("./campaign-session.server");
    const identity = await resolveRequestIdentity(process.env["CAMPAIGN_SESSION_SECRET"]);
    console.info("[ecosystem] identity path", { path: identity.path });
    const email = identity.email;
    if (!email) throw new Error("Ecosystem access could not be verified. Please sign in again.");
    const { sbFor, sbForAuth, activeSource } = await import("./db.server");
    if (activeSource() !== "purple")
      throw new Error("The live Purple ecosystem database is unavailable. No sample data has been substituted.");
    const { data: account, error: accountError } = await sbForAuth()
      .from("app_users")
      .select("role,active")
      .eq("email", email)
      .maybeSingle();
    if (accountError || !account?.active)
      throw new Error("Ecosystem access could not be verified. Please sign in again.");
    const db = sbFor();
    const [cats, types, tots] = await Promise.all([
      db.rpc("get_ecosystem_categories"),
      db.rpc("get_ecosystem_provider_types"),
      db.rpc("get_ecosystem_totals"),
    ]);
    for (const [name, r] of [["categories", cats], ["provider_types", types], ["totals", tots]] as const) {
      if (r.error) {
        console.error(`[ecosystem] RPC get_ecosystem_${name} failed`, { code: r.error.code, message: r.error.message });
        throw new Error("The live ecosystem query failed. Please retry.");
      }
    }
    const t = tots.data?.[0];
    if (!t) throw new Error("The live ecosystem totals are missing. This is a loading problem, not an empty network.");
    return {
      categories: (cats.data ?? []).map((r: Record<string, unknown>) => ({
        category: String(r.category),
        seekersWanting: Number(r.seekers_wanting) || 0,
        providersOffering: Number(r.providers_offering) || 0,
        connections: Number(r.connections) || 0,
      })),
      providerTypes: (types.data ?? []).map((r: Record<string, unknown>) => ({
        providerType: String(r.provider_type),
        providers: Number(r.providers) || 0,
        connectedProviders: Number(r.connected_providers) || 0,
        connections: Number(r.connections) || 0,
      })),
      totals: {
        totalSeekers: Number(t.total_seekers) || 0,
        totalProviders: Number(t.total_providers) || 0,
        seekersWithNeeds: Number(t.seekers_with_needs) || 0,
        providersWithOffer: Number(t.providers_with_offer) || 0,
        totalConnections: Number(t.total_connections) || 0,
        connectedSeekers: Number(t.connected_seekers) || 0,
        connectedProviders: Number(t.connected_providers) || 0,
        consentAcknowledged: Number(t.consent_acknowledged) || 0,
        consentRefused: Number(t.consent_refused) || 0,
        firstConnection: String(t.first_connection),
        lastConnection: String(t.last_connection),
      },
      source: "purple",
    };
  } catch (error) {
    console.error("[ecosystem] Load refused or failed", { message: error instanceof Error ? error.message : "Unknown failure" });
    throw new Error(error instanceof Error ? error.message : "Ecosystem data could not be loaded. Please retry.");
  }
});
