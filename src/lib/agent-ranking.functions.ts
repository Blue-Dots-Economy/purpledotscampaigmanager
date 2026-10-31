import { createServerFn } from "@tanstack/react-start";
import { callCountsFromRows } from "./agent-ranking";

export const getLaunchAgentUsage = createServerFn({ method: "GET" })
  .inputValidator((data: { agentIds: string[] }) => {
    if (!Array.isArray(data.agentIds) || data.agentIds.length > 2000 || data.agentIds.some(id => typeof id !== "string" || !id.trim())) throw new Error("Invalid agent IDs");
    return { agentIds: [...new Set(data.agentIds)] };
  })
  .handler(async () => {
    const start = performance.now();
    try {
      const { sbFor, activeSource } = await import("./db.server");
      if (activeSource() !== "purple") throw new Error("Purple database routing is unavailable");
      const { data: rows, error } = await sbFor()
        .rpc("get_agent_call_counts");
      if (error) throw new Error(error.message);
      const counts = callCountsFromRows((rows ?? []) as unknown as { agent_id: string; calls: number }[]);
      return { counts, source: "purple" as const, distinctAgents: Object.keys(counts).length, queryMs: Math.round(performance.now() - start), error: false };
    } catch (error) {
      console.warn("[launch] Database call ranking unavailable; retaining alphabetical list", { message: error instanceof Error ? error.message : "Unknown query failure" });
      return { counts: null, source: "purple" as const, distinctAgents: null, queryMs: Math.round(performance.now() - start), error: true };
    }
  });