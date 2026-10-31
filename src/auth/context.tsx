import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveLogin } from "@/lib/reviewers.functions";
import { clearCampaignSession } from "@/lib/campaign-scope.functions";
import { ENABLE_CAMPAIGN_DISTRICT_SCOPING } from "@/lib/campaign-district-scope";

const STORAGE_KEY = "rozgar-auth";
const COOKIE_KEY = "rozgar_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
export type Role = "admin" | "user" | "ecosystem" | "jfc" | "wc" | "owner" | "coordinator" | "network_admin";
export type Session = { email: string; role: Role; name?: string | null; district?: string | null; program?: string | null; nodeType?: string | null; nodeName?: string | null };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.split("=")[1] ?? "") : null;
}

function writeCookie(name: string, value: string) {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`;
}

function clearCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

type AuthContextValue = {
  session: Session | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<Role | null>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const queryClient = useQueryClient();
  const resolve = useServerFn(resolveLogin);
  const clearVerifiedSession = useServerFn(clearCampaignSession);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        let raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) raw = readCookie(COOKIE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.email && parsed.role && parsed.role !== "admin") {
            // Non-admin sessions restore normally. The rozgar_auth cookie must
            // survive reloads: the server reads it to identify the actor and
            // decide which database the session reads.
            setSession(parsed);
            // Re-sync both stores so whichever was missing gets refilled.
            try { window.localStorage.setItem(STORAGE_KEY, raw); } catch { /* ignore */ }
            writeCookie(COOKIE_KEY, raw);
          } else {
            // Admin requires an explicit login every time so a shared browser
            // can't leave the next person signed in as admin. Malformed or
            // role-less values take the same path. Clearing the query cache
            // too, so a previous user's cached data never shows to the next.
            try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
            clearCookie(COOKIE_KEY);
            if (ENABLE_CAMPAIGN_DISTRICT_SCOPING) void clearVerifiedSession().catch(() => {});
            queryClient.clear();
          }
        }
      } catch { /* ignore */ }
    }
    setHydrated(true);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await resolve({ data: { email, password } });
    if (res?.fault) throw new Error("auth-fault");
    if (res?.role) {
      const s: Session = { email: email.trim().toLowerCase(), role: res.role, name: res.name ?? null, district: res.district ?? null, program: res.program ?? null, nodeType: res.node_type ?? null, nodeName: res.node_name ?? null };
      const raw = JSON.stringify(s);
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem(STORAGE_KEY, raw); } catch { /* ignore */ }
        writeCookie(COOKIE_KEY, raw);
      }
      setSession(s);
      queryClient.clear();
      return s.role;
    }
    return null;
  };

  const logout = () => {
    if (ENABLE_CAMPAIGN_DISTRICT_SCOPING) void clearVerifiedSession().catch(() => {});
    if (typeof window !== "undefined") {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      clearCookie(COOKIE_KEY);
    }
    setSession(null);
    queryClient.clear();
  };


  return (
    <AuthContext.Provider value={{ session, isAuthenticated: !!session, isAdmin: session?.role === "admin", hydrated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
