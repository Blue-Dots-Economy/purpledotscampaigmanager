import { deepStrictEqual, strictEqual, rejects } from "node:assert";
import { test } from "node:test";
import { fetchAllRayaAgents } from "./raya-api";
import { registerLaunchAgent } from "./launched-batches.functions";
import type { SupabaseClient } from "@supabase/supabase-js";

test("Agent collection uses singular /agent and follows offset/limit until total", async () => {
  const paths: string[] = [];
  const result = await fetchAllRayaAgents(async (path) => {
    paths.push(path);
    const offset = Number(new URL(path, "https://example.invalid").searchParams.get("offset"));
    return { agents: Array.from({ length: offset === 0 ? 2 : 1 }, (_, i) => ({ id: String(offset + i), name: `Agent ${offset + i}` })), total: 3, offset, limit: 2 };
  }, 2);
  deepStrictEqual(paths, ["/agent?offset=0&limit=2", "/agent?offset=2&limit=2"]);
  strictEqual(result.length, 3);
});

test("Malformed huge total cannot fetch more than 50 pages", async () => {
  let calls = 0;
  await fetchAllRayaAgents(async () => ({ agents: [{ id: String(calls), name: "Agent" }], offset: calls++, limit: 1, total: 999999 }), 1);
  strictEqual(calls, 50);
});

test("Agent enumeration stops at 2000 agents", async () => {
  let calls = 0;
  const result = await fetchAllRayaAgents(async () => {
    const offset = calls++ * 100;
    return { agents: Array.from({ length: 100 }, (_, i) => ({ id: String(offset + i), name: "Agent" })), offset, limit: 100, total: 999999 };
  });
  strictEqual(calls, 20);
  strictEqual(result.length, 2000);
});

test("API error propagates rather than masquerading as zero agents", async () => {
  await rejects(fetchAllRayaAgents(async () => { throw new Error("API unavailable"); }), /API unavailable/);
});

test("Broken pagination cannot silently return an incomplete empty list", async () => {
  await rejects(fetchAllRayaAgents(async () => ({ agents: [], total: 115, offset: 0, limit: 100 })), /before its total/);
});

test("A successful account with zero agents is distinct from an API failure", async () => {
  deepStrictEqual(await fetchAllRayaAgents(async () => ({ agents: [], total: 0, offset: 0, limit: 0 })), []);
});

test("Launch registration upserts program, ID, name without overwriting saved settings", async () => {
  let target = "";
  let payload: unknown;
  let options: unknown;
  const client = { from: (table: string) => {
    target = table;
    return { upsert: async (row: unknown, opts: unknown) => { payload = row; options = opts; return { error: null }; } };
  } } as unknown as Pick<SupabaseClient, "from">;
  await registerLaunchAgent(client, { program: "seekers", agentId: "agent-new", agentName: "New agent" });
  strictEqual(target, "program_agents");
  deepStrictEqual(payload, { program: "seekers", agent_id: "agent-new", name: "New agent" });
  deepStrictEqual(options, { onConflict: "program,agent_id", ignoreDuplicates: true });
});

test("Registration failure is logged and never rejects the launch", async () => {
  const original = console.error;
  let logged = 0;
  console.error = () => { logged++; };
  try {
    const client = { from: () => ({ upsert: async () => ({ error: { code: "42501", message: "Denied" } }) }) } as unknown as Pick<SupabaseClient, "from">;
    await registerLaunchAgent(client, { program: "seekers", agentId: "agent-new" });
    const throwingClient = { from: () => { throw new Error("offline"); } } as unknown as Pick<SupabaseClient, "from">;
    await registerLaunchAgent(throwingClient, { program: "seekers", agentId: "agent-new" });
    strictEqual(logged, 2);
  } finally { console.error = original; }
});