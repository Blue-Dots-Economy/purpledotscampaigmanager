import { test } from "node:test";
import { deepStrictEqual, strictEqual, rejects } from "node:assert";
import { fetchAgentUsage, sortAgentsByUsage, useRayaRanking } from "./agent-ranking";

test("Fewer than half the account agents uses Raya; exactly half uses local", () => {
  strictEqual(useRayaRanking(9, 20), true);
  strictEqual(useRayaRanking(10, 20), false);
  strictEqual(useRayaRanking(0, 20), true);
});
test("Ranking sorts usage descending then name, including zero-use ties", () => {
  const agents = [{ agent_id: "a", name: "Zulu" }, { agent_id: "b", name: "Beta" }, { agent_id: "c", name: "Alpha" }, { agent_id: "d", name: "Delta" }];
  deepStrictEqual(sortAgentsByUsage(agents, { a: 12, b: 12, c: 0 }).map(a => a.agent_id), ["b", "a", "c", "d"]);
  deepStrictEqual(sortAgentsByUsage(agents).map(a => a.agent_id), ["c", "b", "d", "a"]);
});
test("Counts are fetched in parallel with one lightweight request per agent", async () => {
  const paths: string[] = [];
  let finish: (() => void) | undefined;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const pending = fetchAgentUsage(["a", "b"], async path => { paths.push(path); await gate; return { total: 12 }; });
  strictEqual(paths.length, 2);
  finish?.();
  deepStrictEqual(await pending, { a: 12, b: 12 });
  deepStrictEqual(paths, ["/batch?agent_id=a&page_size=1", "/batch?agent_id=b&page_size=1"]);
});
test("Any failed or invalid usage request rejects counts instead of fabricating zero", async () => {
  await rejects(fetchAgentUsage(["a"], async () => { throw new Error("Unavailable"); }), /Unavailable/);
  await rejects(fetchAgentUsage(["a"], async () => ({ batches: [] })), /Invalid Raya batch total/);
});