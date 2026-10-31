import { createServerFn } from "@tanstack/react-start";
import { fetchAgentUsage, useRayaRanking } from "./agent-ranking";
import { rayaFetch } from "./raya-api";

export const getLaunchAgentUsage = createServerFn({ method: "GET" })
  .inputValidator((data: { agentIds: string[] }) => {
    if (!Array.isArray(data.agentIds) || data.agentIds.length > 2000 || data.agentIds.some(id => typeof id !== "string" || !id.trim())) throw new Error("Invalid agent IDs");
    return { agentIds: [...new Set(data.agentIds)] };
  })
  .handler(async ({ data }) => {
    const start = performance.now();
    let localRows: number | null = null;
    let distinctAgents: number | null = null;
    let source: "local" | "raya" = "raya";
    try {
      const { sbFor } = await import("./db.server");
      const { data: rows, error, count } = await sbFor().from("launched_batches").select("agent_id", { count: "exact" });
      const localCounts: Record<string, number> = {};
      if (!error) {
        localRows = count ?? rows?.length ?? 0;
        for (const row of rows ?? []) {
          const id = String(row.agent_id ?? "").trim();
          if (id) localCounts[id] = (localCounts[id] ?? 0) + 1;
        }
        distinctAgents = Object.keys(localCounts).length;
        // A truncated history cannot establish complete local usage counts.
        if ((rows?.length ?? 0) === localRows && !useRayaRanking(distinctAgents, data.agentIds.length)) source = "local";
      }
      const counts = source === "local" ? localCounts : await fetchAgentUsage(data.agentIds, path => rayaFetch(path, { method: "GET", signal: AbortSignal.timeout(15_000) }, { maxAttempts: 1 }));
      return { counts, source, localRows, distinctAgents, queryMs: Math.round(performance.now() - start), error: false };
    } catch {
      console.warn("[launch] Agent usage unavailable; retaining alphabetical agent list");
      return { counts: null, source, localRows, distinctAgents, queryMs: Math.round(performance.now() - start), error: true };
    }
  });