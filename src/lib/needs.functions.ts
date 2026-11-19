import { createServerFn } from "@tanstack/react-start";
import type { NeedPhrasing, NeedsOverview } from "./needs-live";

async function verifiedDb() {
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
  return sbFor();
}

function fail(error: unknown): never {
  console.error("[needs] Load refused or failed", { message: error instanceof Error ? error.message : "Unknown failure" });
  throw new Error(error instanceof Error ? error.message : "Ecosystem data could not be loaded. Please retry.");
}

export const fetchNeedsOverview = createServerFn({ method: "GET" }).handler(async (): Promise<NeedsOverview> => {
  try {
    const db = await verifiedDb();
    const [categories, coverage] = await Promise.all([
      db.rpc("get_needs_categories"),
      db.rpc("get_needs_coverage"),
    ]);
    for (const [name, r] of [["get_needs_categories", categories], ["get_needs_coverage", coverage]] as const) {
      if (r.error) {
        console.error(`[needs] RPC ${name} failed`, { code: r.error.code, message: r.error.message });
        throw new Error("The live ecosystem query failed. Please retry.");
      }
    }
    return {
      categories: (categories.data ?? []).map((r: Record<string, unknown>) => ({
        orgName: String(r.org_name), category: String(r.category),
        seekers: Number(r.seekers) || 0, phrasings: Number(r.phrasings) || 0, mentions: Number(r.mentions) || 0,
      })),
      coverage: (coverage.data ?? []).map((r: Record<string, unknown>) => ({
        orgName: String(r.org_name), seekersTotal: Number(r.seekers_total) || 0,
        profilesInPool: Number(r.profiles_in_pool) || 0, profilesRead: Number(r.profiles_read) || 0,
      })),
    };
  } catch (error) { fail(error); }
});

export const fetchNeedPhrasings = createServerFn({ method: "GET" })
  .inputValidator((d: { org: string; category: string }) => {
    if (typeof d?.org !== "string" || typeof d?.category !== "string" || !d.org || !d.category || d.org.length > 300 || d.category.length > 300)
      throw new Error("Invalid organisation or category.");
    return { org: d.org, category: d.category };
  })
  .handler(async ({ data }): Promise<NeedPhrasing[]> => {
    try {
      const db = await verifiedDb();
      const r = await db.rpc("get_needs_phrasings", { _org: data.org, _category: data.category });
      if (r.error) {
        console.error("[needs] RPC get_needs_phrasings failed", { code: r.error.code, message: r.error.message });
        throw new Error("The phrasings could not be loaded. Please retry.");
      }
      return (r.data ?? []).map((row: Record<string, unknown>) => ({
        need: String(row.need), source: String(row.source),
        seekers: Number(row.seekers) || 0, mentions: Number(row.mentions) || 0,
      }));
    } catch (error) { fail(error); }
  });
