import { createServerFn } from "@tanstack/react-start";
import { PARTICIPANT_SESSION_EXPIRED, participantOrganisation, type ParticipantDomain } from "./participant-rollup";
import { summariseEngagementRows, type EngagementRollupRow } from "./engagement-rollup";

// Only `domain` comes from the client; organisation scope is derived from the verified account.
export const fetchEngagementRollup = createServerFn({ method: "GET" })
  .inputValidator((input: { domain: ParticipantDomain }) => {
    if (input.domain !== "seeker" && input.domain !== "provider") throw new Error("Invalid participant programme.");
    return { domain: input.domain };
  })
  .handler(async ({ data }) => {
    try {
      const { resolveRequestIdentity } = await import("./campaign-session.server");
      const identity = await resolveRequestIdentity(process.env["CAMPAIGN_SESSION_SECRET"]);
      console.info("[engagement-rollup] identity path", { path: identity.path });
      const email = identity.email;
      if (!email) throw new Error(`${PARTICIPANT_SESSION_EXPIRED}: Participant access could not be verified. Please sign in again.`);
      const { sbFor, sbForAuth, activeSource } = await import("./db.server");
      if (activeSource() !== "purple") throw new Error("The live Purple participant database is unavailable. No sample or empty data has been substituted.");
      const { data: account, error: accountError } = await sbForAuth().from("app_users").select("role,active").eq("email", email).maybeSingle();
      if (accountError || !account?.active) throw new Error(`${PARTICIPANT_SESSION_EXPIRED}: Participant access could not be verified. Please sign in again.`);
      const organisation = participantOrganisation(account.role, email);
      const { data: rows, error } = await sbFor().rpc("get_engagement_rollup");
      if (error) { console.error("[engagement-rollup] RPC failed", { code: error.code, message: error.message }); throw new Error("The live engagement query failed. Please retry."); }
      if (!Array.isArray(rows) || !rows.length) throw new Error("The Purple engagement query returned no rows. This is a loading problem, not zero engagement.");
      return { organisation, ...summariseEngagementRows(rows as EngagementRollupRow[], data.domain, organisation) };
    } catch (error) {
      console.error("[engagement-rollup] Load refused or failed", { message: error instanceof Error ? error.message : "Unknown failure" });
      throw new Error(error instanceof Error ? error.message : "Engagement data could not be loaded. Please retry.");
    }
  });
