import { Link } from "@tanstack/react-router";
import { AlertTriangle, Database, FilterX } from "lucide-react";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export type EmptyReason = "no_connections" | "no_snapshot" | "no_results";

export interface NoDataStateProps {
  reason?: EmptyReason;
  onClearFilters?: () => void;
}

export function NoDataState({ reason = "no_connections", onClearFilters }: NoDataStateProps) {
  if (reason === "no_results") {
    return (
      <Panel title="No data for the selected filters">
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-brand-soft p-3 text-brand">
            <FilterX className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            No calls match the current date or region filters. Try a different date range or
            clear the filters to see all data.
          </p>
          {onClearFilters && (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  if (reason === "no_snapshot") {
    return (
      <Panel title="No data yet">
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="rounded-full bg-brand-soft p-3 text-brand">
            <Database className="h-6 w-6" />
          </div>
          <p className="text-sm text-muted-foreground max-w-md">
            No snapshot available yet. A sync will populate KPIs, charts and call rows shortly.
          </p>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="No data yet">
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-brand-soft p-3 text-brand">
          <Database className="h-6 w-6" />
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          No data yet — connect a sheet in{" "}
          <Link to="/settings" className="text-brand underline">
            Settings
          </Link>{" "}
          to start seeing live KPIs, charts and call rows here.
        </p>
      </div>
    </Panel>
  );
}

export function LoadingState() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  );
}

export function QueryErrorState({
  error,
  onRetry,
}: {
  error?: { message: string; code: string | null } | null;
  onRetry?: () => void;
}) {
  const isTimeout = error?.code === "57014";
  const isScopeError = error?.code?.startsWith("CAMPAIGN_");
  return (
    <Panel title="Couldn't load the dashboard">
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="rounded-full bg-destructive/10 p-3 text-destructive">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <p className="text-sm text-muted-foreground max-w-md">
          {isScopeError ? error?.message : isTimeout
            ? "The query timed out. This usually means there's more data than the current queries can aggregate in time."
            : "The dashboard query failed. Your data has not been lost — this is a loading problem, not an empty database."}
        </p>
        {!isScopeError && <p className="text-xs text-muted-foreground font-mono">
          {isTimeout
            ? "Database error 57014: statement timeout"
            : `Error${error?.code ? ` ${error.code}` : ""}: ${error?.message ?? "unknown"}`}
        </p>}
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        )}
      </div>
    </Panel>
  );
}
