import type { ProgramId } from "./registry";

export function isCallProgramPath(pathname: string): boolean {
  return pathname === "/" || pathname === "/campaigns" || pathname.startsWith("/campaigns/") || pathname === "/review" || pathname.startsWith("/review/");
}

export function resolveProgramId(pathname: string, selected: ProgramId): ProgramId {
  return isCallProgramPath(pathname) ? "seekers" : selected;
}