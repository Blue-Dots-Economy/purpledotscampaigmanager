import { Component, Suspense, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, FileText, CheckCircle2, Users, TrendingDown, UserX } from "lucide-react";
import { useAuth } from "@/auth/context";
import { useProgram } from "@/programs/context";
import { useParticipantRollup } from "@/hooks/useParticipantRollup";
import { PARTICIPANT_SESSION_EXPIRED, isParticipantLoadStale, loadAgeDays, type ParticipantDomain } from "@/lib/participant-rollup";
import { LoadingState, QueryErrorState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GeoErrorBoundary, GeoRollupView } from "./GeoRollupView";
import { HeaderBand, InfoCard, SectionLabel, StatCard } from "./shared";
import { EngagementCards, EngagementErrorBoundary } from "./EngagementCards";

class ParticipantErrorBoundary extends Component<{ children: ReactNode; onRetry: () => Promise<void> }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    // Session-expired errors can never be fixed by retrying — only a fresh sign-in
    // re-establishes the verified server session. Redirect instead of a dead Retry.
    if (this.state.error.message.startsWith(PARTICIPANT_SESSION_EXPIRED)) return <SessionRefreshRedirect />;
    return <QueryErrorState error={{ message: this.state.error.message, code: "PARTICIPANT_LOAD_FAILED" }} onRetry={() => { void this.props.onRetry().then(() => this.setState({ error: null })); }} />;
  }
}

function SessionRefreshRedirect() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return <div role="alert" className="py-16 text-center space-y-3">
    <p className="text-sm text-muted-foreground">Live participant data needs a fresh sign-in after the latest update. Sign out and sign in again to continue — your work is unaffected.</p>
    <Button variant="outline" size="sm" onClick={() => { logout(); void navigate({ to: "/login", replace: true }); }}>Sign out</Button>
  </div>;
}

export function RealParticipantView() {
  const { session } = useAuth();
  const { programId } = useProgram();
  const domain = programId === "providers" ? "provider" : "seeker";
  const actor = session?.email ?? "signed-out";
  const queryClient = useQueryClient();
  return <ParticipantErrorBoundary key={`${actor}:${domain}`} onRetry={async () => {
    await queryClient.resetQueries({ queryKey: ["real-participant-rollup", actor, domain] });
  }}><Suspense fallback={<div aria-label="Loading participants"><LoadingState /></div>}>
    <ParticipantDashboard actor={actor} domain={domain} />
  </Suspense></ParticipantErrorBoundary>;
}

function formatDate(value: string) { return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
function ParticipantDashboard({ actor, domain }: { actor: string; domain: ParticipantDomain }) {
  const { data, refetch, isFetching } = useParticipantRollup(actor, domain);
  return <ParticipantDashboardBody actor={actor} data={data} domain={domain} isFetching={isFetching} onRefresh={() => void refetch()} />;
}
export type ParticipantRollupData = ReturnType<typeof useParticipantRollup>["data"];
/** Presentational body; takes data so it can be rendered without the live query.
 *  Built entirely on the shared my-dots components so it matches the sample views. */
export function ParticipantDashboardBody({ actor, data, domain, isFetching, onRefresh }: { actor?: string; data: ParticipantRollupData; domain: ParticipantDomain; isFetching: boolean; onRefresh: () => void }) {
  const stale = isParticipantLoadStale(data.latestLoadedAt);
  const start = new Date(data.windowStart);
  const end = new Date(data.windowEnd);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const window = sameMonth ? `${start.getUTCDate()}–${end.getUTCDate()} ${end.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}` : `${formatDate(data.windowStart)} – ${formatDate(data.windowEnd)}`;
  const n = data.orgs.length;
  const weakest = [...data.orgs].filter(o => o.total > 0).sort((a, b) => a.avgCompletion - b.avgCompletion)[0];
  const pct = (x: number) => data.total ? Math.round((x / data.total) * 100) : 0;
  return <div className="space-y-6">
    <HeaderBand
      badge={data.organisation ?? "All organisations"}
      type={domain}
      total={data.total}
      sentence={`Profile health across ${n} organisation${n === 1 ? "" : "s"}.`}
      refreshing={isFetching}
      onRefresh={onRefresh}
      chips={<Badge variant="outline">Live database</Badge>}
    >
      <p className="text-sm font-medium">Participant data: {window}</p>
      <p className="text-sm text-muted-foreground">Loaded: {formatDate(data.loadedAt)}{data.loadedAt.slice(0,10) !== data.latestLoadedAt.slice(0,10) ? ` – ${formatDate(data.latestLoadedAt)}` : " · bulk import"}</p>
      {stale && <p role="status" className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />Import is {loadAgeDays(data.latestLoadedAt)} days old — no newer participant load.</p>}
    </HeaderBand>

    {actor && <EngagementErrorBoundary><Suspense fallback={<div aria-label="Loading engagement"><LoadingState /></div>}><EngagementCards actor={actor} domain={domain} /></Suspense></EngagementErrorBoundary>}

    <div>
      <SectionLabel>Needs attention</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard Icon={TrendingDown} tile="bg-rose-500/15 text-rose-600 dark:text-rose-400"
          headline={weakest ? `${weakest.name} — ${weakest.avgCompletion}% complete` : "No participants yet"}
          sub={weakest ? `Lowest average completeness · ${weakest.total.toLocaleString()} participants` : "No organisations in scope"} />
        <InfoCard Icon={UserX} tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
          headline={`${data.belowThreshold.toLocaleString()} profiles below 60%`}
          sub={`${pct(data.belowThreshold)}% of ${data.total.toLocaleString()} participants`} />
        <InfoCard Icon={FileText} tile="bg-rose-500/15 text-rose-600 dark:text-rose-400"
          headline={`${pct(data.draft)}% still in draft`}
          sub={`${data.draft.toLocaleString()} draft · ${data.live.toLocaleString()} live`} />
      </div>
    </div>

    <div>
      <SectionLabel>Network</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard Icon={Building2} title="Organisations" value={n} sub="In this scope" />
        <StatCard Icon={FileText} title="Draft profiles" value={data.draft} sub="Not yet published" />
        <StatCard Icon={CheckCircle2} title="Live profiles" value={data.live} sub="Published" />
        <StatCard Icon={Users} title="Average completeness" value={`${data.avgCompletion}%`} sub="Participant-weighted" />
      </div>
    </div>

    {actor && <GeoErrorBoundary><Suspense fallback={<div aria-label="Loading geography"><LoadingState /></div>}><GeoRollupView actor={actor} domain={domain} /></Suspense></GeoErrorBoundary>}
    <p className="text-xs text-muted-foreground">Network completeness is participant-weighted from rounded organisation averages. Participant window and load date cover the full imported dataset.</p>
  </div>;
}
