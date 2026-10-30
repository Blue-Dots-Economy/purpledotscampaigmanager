import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { AggregatePayload } from "@/lib/snapshot.functions";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Rocket, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { Link, useRouterState } from "@tanstack/react-router";
import { MobileNav } from "./MobileNav";
import { AccountMenu } from "./AccountMenu";
import {
  useSyncProgram,
  useProgramAggregates,
  useAutoFreshness,
} from "@/programs/useProgramAggregates";
import { fetchActiveSource } from "@/lib/snapshot.functions";
import { ConcurrencyChip } from "@/components/ConcurrencyChip";

export function TopBar() {
  const { config } = useProgram();
  const { session } = useAuth();
  const canDirectLaunch = session?.role === "admin" || session?.role === "jfc" || session?.role === "wc";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isUserOverview = pathname === "/user-level-analysis";
  // TEMPORARY ROUTING DIAGNOSTIC — remove once the routing issue is resolved.
  // location.search is normally a parsed object in TanStack Router, but be
  // tolerant of a raw query string too so the chip cannot silently never render.
  const rawSearch = useRouterState({ select: (s) => (s.location as { search: unknown }).search });
  const diagParam =
    typeof rawSearch === "string"
      ? new URLSearchParams(rawSearch).get("diag")
      : (rawSearch as unknown as Record<string, unknown> | null)?.diag;
  const showDiag = diagParam === "1";
  const sync = useSyncProgram(config.id);
  const query = useProgramAggregates(config);
  const lastSynced = query.data?.lastSyncedAt ?? null;

  const getActiveSource = useServerFn(fetchActiveSource);
  const { data: activeSource } = useQuery({
    queryKey: ["active-source"],
    queryFn: () => getActiveSource(),
    staleTime: Infinity,
  });
  const sourceIsPurple = activeSource?.source === "purple";
  // TEMPORARY ROUTING DIAGNOSTIC — remove once the routing issue is resolved.
  // Chip shows only with ?diag=1; never exposes URL/key values, booleans only.
  const diag =
    activeSource &&
    `source=${activeSource.source} hasUrl=${activeSource.hasUrl} hasKey=${activeSource.hasKey} cutover=${activeSource.cutover} actor=${activeSource.actor ?? "null"} pilot=${activeSource.pilotMatch}`;

  // On-load freshness: kick off a silent background sync if the snapshot is stale.
  const autoSync = useAutoFreshness(config.id, lastSynced);
  const qc = useQueryClient();
  const [isRefetching, setIsRefetching] = useState(false);
  const isSyncing = sync.isPending || autoSync.isPending || isRefetching;

  // Pipeline source: sheet sync does not apply, so Refresh refetches the
  // dashboard's cached queries instead. Does NOT touch last_synced_at — that
  // timestamp records pipeline arrivals, not button presses.
  const DASHBOARD_KEYS = new Set([
    "program-aggregates",
    "kkb-drop-analysis",
    "kkb-call-outcomes",
    "dkb-drop-analysis",
    "funnel-durations",
    "campaign-list",
    "campaign-causes",
    "dkb-campaign-causes",
    "north-star",
    "program-filter-options",
    "program-rows",
  ]);
  const callsOf = (d: AggregatePayload | undefined) => {
    const v = d?.metrics?.totalCalls;
    return typeof v === "number" ? v : (d?.totalRows ?? 0);
  };
  const refetchFromPipeline = async () => {
    const before = callsOf(query.data);
    setIsRefetching(true);
    try {
      await qc.invalidateQueries({
        predicate: (q) => DASHBOARD_KEYS.has(String(q.queryKey[0])),
      });
      // Read the fresh count from this query's own refetch result instead of
      // reconstructing its cache key by hand — a key-shape change would
      // otherwise make getQueryData return undefined and the toast lie.
      const { data: fresh } = await query.refetch();
      const after = callsOf(fresh);
      const n = after.toLocaleString();
      if (after > before) toast.success(`Refreshed · ${(after - before).toLocaleString()} new calls`);
      else if (after === before) toast.success(`Up to date · ${n} calls`);
      else toast.success(`Refreshed · ${n} calls`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setIsRefetching(false);
    }
  };

  const ago = lastSynced ? timeAgo(lastSynced) : "never";
  const ageMs = lastSynced ? Date.now() - new Date(lastSynced).getTime() : null;
  const stale = ageMs !== null && ageMs > 60 * 60_000; // > 1 hour
  // Problem state: a recorded sync error, or no sync in 48h — regardless of status 'ok'.
  const syncLastError = query.data?.syncLastError?.trim() || "";
  const syncTooOld = ageMs !== null && ageMs > 48 * 60 * 60_000;
  const syncProblem = Boolean(syncLastError) || syncTooOld;
  const syncProblemReason = [
    syncLastError && `Last sync error: ${syncLastError}`,
    syncTooOld && `Last successful sync was ${ago} (over 48 hours).`,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 border-b bg-background">
      <MobileNav />
      {!isUserOverview && (
        <div>
          <p className="text-sm text-muted-foreground">
            Here's how {config.label} is performing
          </p>
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        {!isUserOverview && (
          <>
            <ConcurrencyChip />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft text-brand px-3 py-1 text-xs font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {config.label} program
            </span>
            <span
              className={`text-xs ${
                isSyncing
                  ? "text-muted-foreground"
                  : syncProblem
                    ? "text-destructive font-medium"
                    : stale
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground"
              }`}
              title={syncProblem ? syncProblemReason : (lastSynced ?? "Never synced")}
            >
              {isSyncing ? "Updating…" : syncProblem ? `Sync problem · ${ago}` : `Updated ${ago}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => (sourceIsPurple ? void refetchFromPipeline() : sync.mutate({ force: true }))}
              disabled={isSyncing}
              title={`Last synced ${ago}`}
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {/* Pipeline source refetches — "sync" only describes the sheet path. */}
              {isSyncing ? (sourceIsPurple ? "Refreshing…" : "Syncing…") : "Refresh"}
            </Button>
            {canDirectLaunch && (
              <Link to="/launch">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Upload className="h-4 w-4" /> Upload CSV
                </Button>
              </Link>
            )}
            <Link to={canDirectLaunch ? "/launch" : "/request-campaign"}>
              <Button size="sm" className="gap-1.5 bg-brand text-brand-foreground hover:bg-brand/90">
                <Rocket className="h-4 w-4" /> {canDirectLaunch ? "Launch campaign" : "Request campaign"}
              </Button>
            </Link>
          </>
        )}
        {/* TEMPORARY ROUTING DIAGNOSTIC — remove once the routing issue is resolved. */}
        {showDiag && diag && (
          <span className="font-mono text-[11px] text-muted-foreground border border-border rounded px-2 py-0.5">
            {diag}
          </span>
        )}
        <AccountMenu />
      </div>
    </header>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
