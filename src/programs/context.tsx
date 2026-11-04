import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouterState } from "@tanstack/react-router";
import { registry, type ProgramConfig, type ProgramId } from "./registry";
import { resolveProgramId } from "./call-program";

interface Ctx {
  programId: ProgramId;
  config: ProgramConfig;
  setProgramId: (id: ProgramId) => void;
}

const ProgramCtx = createContext<Ctx | null>(null);

export function ProgramProvider({ children }: { children: ReactNode }) {
  const [programId, setProgramId] = useState<ProgramId>("seekers");
  return (
    <ProgramCtx.Provider value={{ programId, config: registry[programId], setProgramId }}>
      {children}
    </ProgramCtx.Provider>
  );
}

export function useProgram() {
  const ctx = useContext(ProgramCtx);
  if (!ctx) throw new Error("useProgram must be used inside ProgramProvider");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const programId = resolveProgramId(pathname, ctx.programId);
  return { ...ctx, programId, config: registry[programId] };
}
