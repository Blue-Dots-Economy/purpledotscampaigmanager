import { createServerFn } from "@tanstack/react-start";

// Auth + reviewer tables live wherever auth lives. Use the flag-based selector so that
// today (cutover off) everything runs on the CURRENT project exactly as before, and at
// cutover (ROZGAR_CUTOVER on) all of these move to the new project in lockstep with login.
async function sb() {
  const { sbForAuth } = await import("@/lib/db.server");
  return sbForAuth();
}

// A verified-session failure must never block sign-in; it is logged and only the
// participant view (which requires it) shows an error.
async function establishSessionSafely(email: string) {
  try {
    const { establishCampaignSession } = await import("./campaign-session.server");
    await establishCampaignSession(process.env["CAMPAIGN_SESSION_SECRET"], email);
  } catch (e) {
    console.error("[auth] establishCampaignSession failed:", e instanceof Error ? e.message : String(e));
  }
}

export const resolveLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password?: string }) => d)
  .handler(async ({ data }): Promise<{ role: "admin" | "user" | "ecosystem" | "jfc" | "wc" | "owner" | "coordinator" | "network_admin" | null; name?: string | null; district?: string | null; program?: string | null; node_type?: string | null; node_name?: string | null; fault?: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    const password = data.password || "";
    const client = await sb();
    try {
      // The Supabase client returns errors instead of throwing, so `error` must be
      // checked explicitly: a database fault (missing function, signature mismatch,
      // crypt() failure) must not be mistaken for a wrong password.
      const { data: rows, error } = await client.rpc("app_user_login", { _email: email, _password: password || null });
      if (error) {
        console.error("[auth] app_user_login RPC failed:", { message: error.message, code: error.code, details: error.details, hint: error.hint });
        return { role: null, fault: true };
      }
      const row = (Array.isArray(rows) ? rows[0] : rows) as Record<string, string> | undefined;
      if (row?.role) {
        // Real participant views also require this verified identity, independent of campaign scoping.
        await establishSessionSafely(email);
        return {
          role: row.role as "admin" | "user" | "ecosystem" | "jfc" | "wc" | "owner" | "coordinator" | "network_admin",
          name: row.name ?? null,
          district: row.district ?? null,
          program: row.program ?? null,
          node_type: row.node_type ?? null,
          node_name: row.node_name ?? null,
        };
      }
    } catch (e) {
      // A thrown error here is a fault (network, client setup), not a missing account.
      console.error("[auth] app_user_login threw:", e instanceof Error ? e.message : String(e));
      return { role: null, fault: true };
    }
    try {
      const { data: r, error } = await client.from("reviewers").select("email").eq("email", email).maybeSingle();
      if (error) {
        console.error("[auth] reviewers fallback query failed:", { message: error.message, code: error.code, details: error.details, hint: error.hint });
        return { role: null, fault: true };
      }
      if (r) {
        await establishSessionSafely(email);
        return { role: "user" };
      }
    } catch (e) {
      console.error("[auth] reviewers fallback query threw:", e instanceof Error ? e.message : String(e));
      return { role: null, fault: true };
    }
    return { role: null };
  });

export const listReviewers = createServerFn({ method: "GET" })
  .handler(async (): Promise<string[]> => {
    try {
      const { data } = await (await sb()).from("reviewers").select("email").order("email");
      return (data ?? []).map((r: { email: string }) => r.email);
    } catch { return []; }
  });

export const addReviewer = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    if (!email) return { ok: false };
    try { await (await sb()).from("reviewers").upsert({ email }, { onConflict: "email" }); return { ok: true }; }
    catch { return { ok: false }; }
  });

export const removeReviewer = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }): Promise<{ ok: boolean }> => {
    const email = (data.email || "").trim().toLowerCase();
    try { await (await sb()).from("reviewers").delete().eq("email", email); return { ok: true }; }
    catch { return { ok: false }; }
  });
