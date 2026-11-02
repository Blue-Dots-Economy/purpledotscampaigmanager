import { createServerFn } from "@tanstack/react-start";
import { PARTICIPANT_SESSION_EXPIRED, participantOrganisation, summariseParticipantRows, type ParticipantDomain, type ParticipantRollupRow } from "./participant-rollup";

export const fetchParticipantRollup = createServerFn({ method: "GET" })
  .inputValidator((input: { domain: ParticipantDomain }) => {
    if (input.domain !== "seeker" && input.domain !== "provider") throw new Error("Invalid participant programme.");
    return input;
  })
  .handler(async ({ data }) => {
    try {
      const { resolveRequestIdentity } = await import("./campaign-session.server");
      const identity = await resolveRequestIdentity(process.env["CAMPAIGN_SESSION_SECRET"]);
      console.info("[participant-rollup] identity path", { path: identity.path });
      const email = identity.email;
      if (!email) throw new Error(`${PARTICIPANT_SESSION_EXPIRED}: Participant access could not be verified. Please sign in again.`);
      const { sbFor, sbForAuth, activeSource } = await import("./db.server");
      if (activeSource() !== "purple") throw new Error("The live Purple participant database is unavailable. No sample or empty data has been substituted.");
      const { data: account, error: accountError } = await sbForAuth().from("app_users").select("role,active").eq("email", email).maybeSingle();
      if (accountError || !account?.active) throw new Error(`${PARTICIPANT_SESSION_EXPIRED}: Participant access could not be verified. Please sign in again.`);
      const organisation = participantOrganisation(account.role, email);
      const db = sbFor();
      const { data: rows, error } = await db.rpc("get_participant_rollup");
      if (error) { console.error("[participant-rollup] RPC failed", { code: error.code, message: error.message }); throw new Error("The live participant query failed. Please retry."); }
      if (!Array.isArray(rows) || !rows.length) throw new Error("The Purple participant query returned no rows. This is a loading problem, not an empty participant network.");
      const rollup = summariseParticipantRows(rows as ParticipantRollupRow[], data.domain, organisation);
      // Dates only: never return raw participant rows or identifying fields.
      const [first, last, oldestLoad, latestLoad] = await Promise.all([
        db.from("purple_users").select("created_at").order("created_at", { ascending: true, nullsFirst: false }).limit(1),
        db.from("purple_users").select("created_at").order("created_at", { ascending: false, nullsFirst: false }).limit(1),
        db.from("purple_users").select("loaded_at").order("loaded_at", { ascending: true, nullsFirst: false }).limit(1),
        db.from("purple_users").select("loaded_at").order("loaded_at", { ascending: false, nullsFirst: false }).limit(1),
      ]);
      if ([first,last,oldestLoad,latestLoad].some(r => r.error)) throw new Error("Participant freshness dates could not be loaded. Please retry.");
      const windowStart = first.data?.[0]?.created_at as string | undefined;
      const windowEnd = last.data?.[0]?.created_at as string | undefined;
      const loadedAt = oldestLoad.data?.[0]?.loaded_at as string | undefined;
      const latestLoadedAt = latestLoad.data?.[0]?.loaded_at as string | undefined;
      if (!windowStart || !windowEnd || !loadedAt || !latestLoadedAt) throw new Error("Participant freshness dates are missing. Please retry.");
      return { ...rollup, source: "purple" as const, windowStart, windowEnd, loadedAt, latestLoadedAt, rpcRowCount: rows.length };
    } catch (error) {
      console.error("[participant-rollup] Load refused or failed", { message: error instanceof Error ? error.message : "Unknown failure" });
      throw new Error(error instanceof Error ? error.message : "Participant data could not be loaded. Please retry.");
    }
  });