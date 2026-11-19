import { createServerFn } from "@tanstack/react-start";
import type { NeedsOverview } from "./needs-live";

export const fetchNeedsOverview = createServerFn({ method: "GET" }).handler(async (): Promise<NeedsOverview> => {
  try {
    const { resolveRequestIdentity } = await import("./campaign-session.server");
    const identity = await resolveRequestIdentity(process.env["CAMPAIGN_SESSION_SECRET"]);
    console.info("[needs] identity path", { path: identity.path });
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
    const [rollup, coverage] = await Promise.all([
      db.rpc("get_needs_rollup"),
      db.rpc("get_needs_coverage"),
    ]);
    for (const [name, r] of [["rollup", rollup], ["coverage", coverage]] as const) {
      if (r.error) {
        console.error(`[needs] RPC get_needs_${name} failed`, { code: r.error.code, message: r.error.message });
        throw new Error("The live ecosystem query failed. Please retry.");
      }
    }
    return {
      rows: (rollup.data ?? []).map((r: Record<string, unknown>) => ({
        orgName: String(r.org_name), category: String(r.category), need: String(r.need), source: String(r.source),
        seekers: Number(r.seekers) || 0, mentions: Number(r.mentions) || 0,
      })),
      coverage: (coverage.data ?? []).map((r: Record<string, unknown>) => ({
        orgName: String(r.org_name), seekersTotal: Number(r.seekers_total) || 0,
        profilesInPool: Number(r.profiles_in_pool) || 0, profilesRead: Number(r.profiles_read) || 0,
      })),
    };
  } catch (error) {
    console.error("[needs] Load refused or failed", { message: error instanceof Error ? error.message : "Unknown failure" });
    throw new Error(error instanceof Error ? error.message : "Ecosystem data could not be loaded. Please retry.");
  }
});