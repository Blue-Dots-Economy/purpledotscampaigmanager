export function useRayaRanking(distinctAgents: number, accountAgents: number): boolean {
  return distinctAgents < accountAgents / 2;
}

export function sortAgentsByUsage<T extends { agent_id: string; name: string }>(
  agents: T[], counts?: Record<string, number>,
): T[] {
  return [...agents].sort((a, b) => (counts?.[b.agent_id] ?? 0) - (counts?.[a.agent_id] ?? 0) || a.name.localeCompare(b.name));
}

export async function fetchAgentUsage(
  ids: string[], request: (path: string) => Promise<unknown>,
): Promise<Record<string, number>> {
  const entries = await Promise.all(ids.map(async (id) => {
    const raw = await request(`/batch?agent_id=${encodeURIComponent(id)}&page_size=1`);
    const total = raw && typeof raw === "object" ? (raw as Record<string, unknown>).total : undefined;
    if (typeof total !== "number" || !Number.isInteger(total) || total < 0) throw new Error("Invalid Raya batch total");
    return [id, total] as const;
  }));
  return Object.fromEntries(entries);
}