import { deepStrictEqual, strictEqual } from "node:assert";
import { test } from "node:test";
import { LAUNCH_PROGRAMS } from "./launch-program";

test("Only Seekers can be selected for campaign launch", () => {
  deepStrictEqual(LAUNCH_PROGRAMS, ["seekers"]);
});

test("The launch initial program is Seekers, independent of global context", () => {
  strictEqual(LAUNCH_PROGRAMS[0], "seekers");
});