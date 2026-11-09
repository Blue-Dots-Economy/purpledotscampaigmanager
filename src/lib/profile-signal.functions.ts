import { createServerFn } from "@tanstack/react-start";
import { PARTICIPANT_SESSION_EXPIRED, participantOrganisation } from "./participant-rollup";
import { canSeeProfileSignal, rollupProfileSignal, type CallFacts, type LocationFacts } from "./profile-signal";
import type { GeoRollupRow } from "./geo-rollup";

const PAGE = 1000;
const asList = (v: unknown): string[] | null => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : null;

// Seekers only. Access is decided here from the verified account, never by the client.
export const fetchProfileSignal = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { resolveRequestIdentity } = await import("./campaign-session.server");
    const identity = await resolveRequestIdentity(process.env["CAMPAIGN_SESSION_SECRET"]);
    const email = identity.email;
    if (!email) throw new Error(`${PARTICIPANT_SESSION_EXPIRED}: Participant access could not be verified. Please sign in again.`);
    if (!canSeeProfileSignal(email)) return { allowed: false as const };
    const { sbFor, sbForAuth, activeSource } = await import("./db.server");
    if (activeSource() !== "purple") throw new Error("The live Purple participant database is unavailable.");
    const { data: account, error: accountError } = await sbForAuth().from("app_users").select("role,active").eq("email", email).maybeSingle();
    if (accountError || !account?.active) throw new Error(`${PARTICIPANT_SESSION_EXPIRED}: Participant access could not be verified. Please sign in again.`);
    const organisation = participantOrganisation(account.role, email);
    const db = sbFor();

    const { data: geo, error: geoErr } = await db.rpc("get_geo_rollup");
    if (geoErr || !Array.isArray(geo)) throw new Error("The live participant totals could not be loaded. Please retry.");
    const orgTotals = new Map<string, number>();
    for (const r of geo as GeoRollupRow[]) if (r.domain === "seeker" && (!organisation || r.org_name === organisation)) orgTotals.set(r.org_name, (orgTotals.get(r.org_name) ?? 0) + Number(r.total));

    const calls: CallFacts[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from("purple_dots_calls").select("profile_item_id,disability_category_mapped,solution_option_mapped_categories")
        .not("profile_item_id", "is", null).or("test_flag.is.null,test_flag.eq.false").order("call_id").range(from, from + PAGE - 1);
      if (error) throw new Error("Call records could not be loaded. Please retry.");
      for (const r of data ?? []) calls.push({ item_id: String(r.profile_item_id), disability: asList(r.disability_category_mapped), needs: asList(r.solution_option_mapped_categories) });
      if (!data || data.length < PAGE || from > 50_000) break;
    }
    const locations: LocationFacts[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await db.from("purple_items").select("item_id,location_label,district,state").not("location_label", "is", null).order("item_id").range(from, from + PAGE - 1);
      if (error) throw new Error("Profile locations could not be loaded. Please retry.");
      for (const r of data ?? []) locations.push({ item_id: String(r.item_id), location_label: r.location_label, district: r.district, state: r.state });
      if (!data || data.length < PAGE || from > 50_000) break;
    }
    const ids = [...new Set([...calls.map(c => c.item_id), ...locations.map(l => l.item_id)])];
    const profileOrg = new Map<string, string>();
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 150) chunks.push(ids.slice(i, i + 150));
    for (let i = 0; i < chunks.length; i += 8) {
      const res = await Promise.all(chunks.slice(i, i + 8).map(c => db.from("pd_profile").select("item_id,org_name").eq("domain", "seeker").in("item_id", c)));
      for (const r of res) { if (r.error) throw new Error("Profile organisations could not be loaded. Please retry."); for (const p of r.data ?? []) profileOrg.set(String(p.item_id), p.org_name); }
    }
    // Counts only: no participant rows or identifying fields leave the server.
    return { allowed: true as const, organisation, ...rollupProfileSignal({ orgTotals, profileOrg, calls, locations }), calledProfiles: new Set(calls.map(c => c.item_id)).size };
  } catch (error) {
    console.error("[profile-signal] Load failed", { message: error instanceof Error ? error.message : "Unknown failure" });
    throw new Error(error instanceof Error ? error.message : "Profile signal could not be loaded. Please retry.");
  }
});
