import { describe, expect, it } from "vitest";
import { isCallProgramPath, resolveProgramId } from "./call-program";

describe("call-page program resolution", () => {
  it.each(["/", "/campaigns", "/campaigns/example", "/review", "/review/example"])("%s always resolves to seekers without changing the selection", (path) => {
    expect(isCallProgramPath(path)).toBe(true);
    expect(resolveProgramId(path, "providers")).toBe("seekers");
    expect(resolveProgramId(path, "seekers")).toBe("seekers");
  });
  it.each(["/user-level-analysis", "/ecosystem-view", "/launch", "/settings", "/campaigns-other", "/review-other"])("%s preserves provider selection", (path) => {
    expect(isCallProgramPath(path)).toBe(false);
    expect(resolveProgramId(path, "providers")).toBe("providers");
  });
});