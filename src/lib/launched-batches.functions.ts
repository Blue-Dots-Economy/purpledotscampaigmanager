// Records campaign metadata for each Raya batch launched from the wizard.
// The staging export joins on batch_id to stamp campaign columns onto rows.

import { createServerFn } from "@tanstack/react-start";
import { sbFor } from "./db.server";
import type { SupabaseClient } from "@supabase/supabase-js";

// Runs before metadata recording/start; a registration failure must not cancel a created Raya batch.
export async function registerLaunchAgent(
  client: Pick<SupabaseClient, "from">,
  data: { program: string; agentId?: string; agentName?: string },
) {
  if (!data.agentId?.trim()) return;
  try {
    const { error } = await client.from("program_agents").upsert({
      program: data.program,
      agent_id: data.agentId.trim(),
      name: data.agentName?.trim() || data.agentId.trim(),
    }, { onConflict: "program,agent_id", ignoreDuplicates: true });
    if (error) console.error("[launch] Agent registration failed; concurrency discovery may undercount", { code: error.code, message: error.message });
  } catch (error) {
    console.error("[launch] Agent registration failed; concurrency discovery may undercount", { message: error instanceof Error ? error.message : "Unknown registration failure" });
  }
}

// Per-request client: sbFor() picks the database for the current actor.
function sb() {
  return sbFor();
}

function normalizePhone(v: any): string {
  const digits = String(v ?? "").replace(/\D+/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizeKey(k: string): string {
  return String(k ?? "").trim().toLowerCase().replace(/[\s\-]+/g, "_");
}

function pickRaw(row: Record<string, any>, candidates: string[]): string | null {
  const normalized = new Map<string, any>();
  Object.entries(row ?? {}).forEach(([k, v]) => normalized.set(normalizeKey(k), v));
  for (const key of candidates) {
    const value = normalized.get(normalizeKey(key));
    if (value != null && String(value).trim() !== "") return String(value).trim();
  }
  return null;
}

export interface LaunchedBatchRow {
  batch_id: string;
  program: string;
  agent_id: string | null;
  agent_name: string | null;
  batch_name: string | null;
  campaign_day: string | null;
  campaign_date: string | null;
  campaign_type: string | null;
  language: string | null;
  city_campaign: string | null;
  region: string | null;
  created_at: string;
  updated_at: string;
}

export const recordLaunchedBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      batchId: string;
      program: string;
      agentId?: string;
      agentName?: string;
      batchName?: string;
      campaignDay?: string;
      campaignDate?: string;
      campaignType?: string;
      language?: string;
      cityCampaign?: string;
      region?: string;
        inputRows?: Array<Record<string, any>>;
    }) => {
      if (!d.batchId) throw new Error("batchId required");
      if (!d.program) throw new Error("program required");
      return d;
    },
  )
  .handler(async ({ data }) => {
    const c = sb();
    await registerLaunchAgent(c, data);
    const payload = {
      batch_id: data.batchId,
      program: data.program,
      agent_id: data.agentId ?? null,
      agent_name: data.agentName ?? null,
      batch_name: data.batchName ?? null,
      campaign_day: data.campaignDay ?? null,
      campaign_date: data.campaignDate ?? null,
      campaign_type: data.campaignType ?? null,
      language: data.language ?? null,
      city_campaign: data.cityCampaign ?? null,
      region: data.region ?? null,
      updated_at: new Date().toISOString(),
    };
    const { data: row, error } = await c
      .from("launched_batches")
      .upsert(payload, { onConflict: "batch_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (Array.isArray(data.inputRows) && data.inputRows.length > 0) {
      const rows = data.inputRows
        .map((r) => {
          const phone = normalizePhone(
            r.normalized_phone ?? r.contact_phone ?? r.phone ?? r.mobile ?? r.phone_number,
          );
          if (!phone) return null;
          return {
            batch_id: data.batchId,
            program: data.program,
            normalized_phone: phone,
            contact_name: pickRaw(r, ["contact_name", "name", "seeker_name", "candidate_name"]),
            recommendations: pickRaw(r, ["recommendations", "jobs_recommended", "recommended_jobs"]),
            user_intent: pickRaw(r, ["user_intent", "intent"]),
            raw: r,
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);
      if (rows.length > 0) {
        const { error: inputError } = await sb()
          .from("launched_batch_inputs")
          .upsert(rows as any[], { onConflict: "batch_id,normalized_phone" });
        if (inputError) throw new Error(inputError.message);
      }
    }

    return row as LaunchedBatchRow;
  });

export const getNextCampaignDay = createServerFn({ method: "GET" })
  .inputValidator((d: { program: string }) => {
    if (!d.program) throw new Error("program required");
    return d;
  })
  .handler(async ({ data }) => {
    const c = sb();
    const { data: rows } = await c
      .from("launched_batches")
      .select("campaign_day")
      .eq("program", data.program)
      .order("created_at", { ascending: false })
      .limit(50);
    let maxN = 0;
    for (const r of rows ?? []) {
      const m = String((r as any).campaign_day ?? "").match(/(\d+)/);
      if (m) maxN = Math.max(maxN, Number(m[1]));
    }
    return { next: `Day ${maxN + 1}` };
  });
