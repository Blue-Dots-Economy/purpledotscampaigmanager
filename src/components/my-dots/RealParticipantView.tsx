import { Component, Suspense, useEffect, type ReactNode, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, FileText, RefreshCw, CheckCircle2, Users } from "lucide-react";
import { useAuth } from "@/auth/context";
import { useProgram } from "@/programs/context";
import { useParticipantRollup } from "@/hooks/useParticipantRollup";
import { PARTICIPANT_SESSION_EXPIRED, isParticipantLoadStale, loadAgeDays, type ParticipantDomain } from "@/lib/participant-rollup";
import { LoadingState, QueryErrorState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusCards, SectionLabel } from "./shared";

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
  const navigate = useNavigate();
  useEffect(() => { void navigate({ to: "/login", search: { reason: "session-refresh" } }); }, [navigate]);
  return <p role="status" className="py-16 text-center text-sm text-muted-foreground">Your sign-in needs to be refreshed — taking you to the sign-in page…</p>;
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
  const [sortKey, setSortKey] = useState<"total" | "draft" | "avgCompletion">("total");
  const [direction, setDirection] = useState<1 | -1>(-1);
  const stale = isParticipantLoadStale(data.loadedAt);
  const start = new Date(data.windowStart);
  const end = new Date(data.windowEnd);
  const sameMonth = start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear();
  const window = sameMonth ? `${start.getUTCDate()}–${end.getUTCDate()} ${end.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}` : `${formatDate(data.windowStart)} – ${formatDate(data.windowEnd)}`;
  const sort = (key: typeof sortKey) => { if (key === sortKey) setDirection(d => d === 1 ? -1 : 1); else { setSortKey(key); setDirection(-1); } };
  const rows = [...data.orgs].sort((a,b) => (a[sortKey]-b[sortKey])*direction);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold uppercase text-muted-foreground">{domain === "seeker" ? "Seekers" : "Providers"}</span><Badge variant="secondary">{data.organisation ?? "All organisations"}</Badge><Badge variant="outline">Live database</Badge></div>
        <div className="flex flex-wrap items-baseline gap-3"><span className="text-4xl font-bold tabular-nums">{data.total.toLocaleString()}</span><span className="text-sm text-muted-foreground">participants · {data.orgs.length} organisation{data.orgs.length === 1 ? "" : "s"}</span></div>
        <p className="text-sm font-medium">Participant data: {window}</p>
        <p className="text-sm text-muted-foreground">Loaded: {formatDate(data.loadedAt)}{data.loadedAt.slice(0,10) !== data.latestLoadedAt.slice(0,10) ? ` – ${formatDate(data.latestLoadedAt)}` : " · bulk import"}</p>
        {stale && <p role="status" className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />Import is {loadAgeDays(data.loadedAt)} days old — no newer participant load.</p>}
      </div>
      <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />Refresh</Button>
    </header>
    <section>
      <SectionLabel>Publication & profile health</SectionLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Draft profiles", value: data.draft.toLocaleString(), Icon: FileText, sub: "Not yet published" },
          { label: "Live profiles", value: data.live.toLocaleString(), Icon: CheckCircle2, sub: "Published" },
          { label: "Retired profiles", value: data.retired.toLocaleString(), Icon: Archive, sub: "No longer published" },
          { label: "Average completeness", value: `${data.avgCompletion}%`, Icon: Users, sub: `${data.belowThreshold.toLocaleString()} profiles below 60%` },
        ].map(({ label, value, Icon, sub }) => <div key={label} className="rounded-lg border border-border bg-card p-5"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Icon className="h-4 w-4 text-brand" />{label}</div><div className="mt-3 text-4xl font-bold tabular-nums">{value}</div><p className="mt-2 text-sm text-muted-foreground">{sub}</p></div>)}
      </div>
    </section>
    <section><SectionLabel caption="New uses the fixed 7-day window in the participant query">Participant lifecycle</SectionLabel><StatusCards status={data.status} /><p className="mt-3 text-sm text-muted-foreground">Inactive is 0 within this data window; this does not establish long-term retention.</p></section>
    <section>
      <SectionLabel>Organisations</SectionLabel>
      <div className="overflow-x-auto">
        <Table><TableHeader><TableRow>
          <TableHead className="min-w-52">Organisation</TableHead>
          <TableHead className="text-right" aria-sort={sortKey === "total" ? direction === -1 ? "descending" : "ascending" : "none"}><Button variant="ghost" size="sm" onClick={() => sort("total")}>Participants</Button></TableHead>
          <TableHead className="text-right" aria-sort={sortKey === "draft" ? direction === -1 ? "descending" : "ascending" : "none"}><Button variant="ghost" size="sm" onClick={() => sort("draft")}>Draft</Button></TableHead>
          <TableHead className="text-right">Live</TableHead><TableHead className="text-right">Retired</TableHead>
          <TableHead className="text-right" aria-sort={sortKey === "avgCompletion" ? direction === -1 ? "descending" : "ascending" : "none"}><Button variant="ghost" size="sm" onClick={() => sort("avgCompletion")}>Completeness</Button></TableHead>
          <TableHead className="text-right">Below 60%</TableHead>
          <TableHead className="text-right">New</TableHead><TableHead className="text-right">Active</TableHead><TableHead className="text-right">At Risk</TableHead><TableHead className="text-right">Inactive</TableHead>
        </TableRow></TableHeader><TableBody>{rows.map(org => <TableRow key={org.id}>
          <TableCell className="max-w-80 whitespace-normal font-medium">{org.name}</TableCell><TableCell className="text-right tabular-nums">{org.total.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{org.draft.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{org.live.toLocaleString()}</TableCell><TableCell className="text-right tabular-nums">{org.retired.toLocaleString()}</TableCell><TableCell className={`text-right tabular-nums ${org.avgCompletion < 60 ? "text-destructive font-semibold" : ""}`}>{org.avgCompletion}%</TableCell><TableCell className="text-right tabular-nums">{org.belowThreshold.toLocaleString()}</TableCell>{(["new","active","at-risk","inactive"] as const).map(key => <TableCell key={key} className="text-right tabular-nums">{org.status[key].toLocaleString()}</TableCell>)}
        </TableRow>)}</TableBody></Table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Network completeness is participant-weighted from rounded organisation averages. Participant window and load date cover the full imported dataset.</p>
    </section>
  </div>;
}