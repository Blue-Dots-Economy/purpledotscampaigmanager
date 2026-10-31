import { test } from "node:test";
import { deepStrictEqual, strictEqual, rejects } from "node:assert";
import { callCountsFromRows, sortAgentsByUsage } from "./agent-ranking";

test("Ranking sorts usage descending then name, including zero-use ties", () => {
  const agents = [{ agent_id: "a", name: "Zulu" }, { agent_id: "b", name: "Beta" }, { agent_id: "c", name: "Alpha" }, { agent_id: "d", name: "Delta" }];
  deepStrictEqual(sortAgentsByUsage(agents, { a: 12, b: 12, c: 0 }).map(a => a.agent_id), ["b", "a", "c", "d"]);
  deepStrictEqual(sortAgentsByUsage(agents).map(a => a.agent_id), ["c", "b", "d", "a"]);
});
test("Database call volumes preserve the expected 94825, 10636 and 493 leaders", () => {
  const counts = callCountsFromRows([{ agent_id: "hindi", calls: 94825 }, { agent_id: "telugu", calls: 10636 }, { agent_id: "marathi", calls: 493 }]);
  deepStrictEqual(counts, { hindi: 94825, telugu: 10636, marathi: 493 });
  deepStrictEqual(sortAgentsByUsage([{ agent_id: "marathi", name: "Marathi" }, { agent_id: "hindi", name: "Hindi" }, { agent_id: "telugu", name: "Telugu" }], counts).map(a => a.agent_id), ["hindi", "telugu", "marathi"]);
});