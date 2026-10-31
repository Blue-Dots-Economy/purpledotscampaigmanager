export function sortAgentsByUsage<T extends { agent_id: string; name: string }>(
  agents: T[], counts?: Record<string, number>,
): T[] {
  return [...agents].sort((a, b) => (counts?.[b.agent_id] ?? 0) - (counts?.[a.agent_id] ?? 0) || a.name.localeCompare(b.name));
}

export function callCountsFromRows(rows: { agent_id: string; calls: number }[]): Record<string, number> {
  if (!rows.length) throw new Error("Purple call ranking unexpectedly returned no agents");
  return Object.fromEntries(rows.map(row => {
    if (!row.agent_id || !Number.isInteger(row.calls) || row.calls < 0) throw new Error("Invalid database call count");
    return [row.agent_id, row.calls];
  }));
}