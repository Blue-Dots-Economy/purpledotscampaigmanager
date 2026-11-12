import { Component, Fragment, useMemo, useRef, useState, type ReactNode } from "react";
import { Building2, ChevronRight, MapPin, MapPinned, UserRound } from "lucide-react";
import { useGeoRollup } from "@/hooks/useGeoRollup";
import type { ParticipantDomain } from "@/lib/participant-rollup";
import { coordinatorLabel, labelCoordinators, type CoordinatorLabel, type GeoNode } from "@/lib/geo-rollup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ActivityCell, HEAD_LABEL, SectionLabel, SortBtn, StatCard, TableShell } from "./shared";
import { useProfileSignal } from "@/hooks/useProfileSignal";
import { canSeeProfileSignal, matchFor, type SignalCounts, type SignalFilter } from "@/lib/profile-signal";
import { filterLabel, pct, ProfileSignalFilter } from "./ProfileSignalFilter";

type SortKey = "total" | "avgCompletion" | "belowThreshold";
const INDENT = ["", "pl-12", "pl-20", "pl-28"];
const ICON = { org: Building2, coordinator: UserRound, state: MapPinned, district: MapPin } as const;
const COVERAGE_NOTE = "Location is recorded for only part of the data; unlocated profiles are shown as “Location not recorded”, not dropped.";

export class GeoErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <p role="alert" className="text-sm text-destructive">Geography roll-up could not be loaded: {this.state.error.message}</p>;
  }
}

export function GeoRollupView({ actor, domain }: { actor: string; domain: ParticipantDomain }) {
  const { data } = useGeoRollup(actor, domain);
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const signalOn = domain === "seeker" && canSeeProfileSignal(actor);
  const signal = useProfileSignal(actor, signalOn);
  const [filter, setFilter] = useState<SignalFilter | null>(null);
  const counts = signal.data?.allowed ? signal.data.counts : undefined;
  const sigState: SigState = signal.error ? "error" : counts ? "ready" : "loading";
  const sig = signalOn ? { filter: counts ? filter : null, counts: counts ?? {}, state: sigState } : undefined;
  const toggle = (k: SortKey) => { if (k === sortKey) setSortDir(d => d === 1 ? -1 : 1); else { setSortKey(k); setSortDir(-1); } };
  const t = data.totals;
  const cov = t.total ? ((t.located / t.total) * 100).toFixed(1) : "0.0";
  const states = data.byGeography.filter(n => n.label !== "Location not recorded").length;
  return <div className="space-y-6">
    <div>
      <SectionLabel caption="Live database">Geography</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard Icon={MapPinned} title="Located profiles" value={t.located.toLocaleString()} sub={`${cov}% of ${t.total.toLocaleString()}`} />
        <StatCard Icon={MapPin} title="States" value={states} sub="With recorded locations" />
      </div>
    </div>
    {signalOn && <ProfileSignalFilter value={filter} onChange={setFilter} counts={counts} totals={{ draft: t.draft, live: t.live }} loading={signal.isLoading} error={signal.error?.message} />}
    <Tabs defaultValue="org">
      <TabsList><TabsTrigger value="org">By organisation</TabsTrigger><TabsTrigger value="geo">By geography</TabsTrigger></TabsList>
      <TabsContent value="org" className="space-y-2">
        <GeoTable title="Organisations · coordinators · locations" first="Organisation" nodes={data.byOrganisation} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} sig={sig} drillDepth={1} />
        <p className="text-xs text-muted-foreground">{COVERAGE_NOTE}</p>
      </TabsContent>
      <TabsContent value="geo" className="space-y-2">
        <GeoTable title="States · districts · organisations" first="State" nodes={data.byGeography} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} sig={sig} />
        <p className="text-xs text-muted-foreground">{COVERAGE_NOTE}</p>
      </TabsContent>
    </Tabs>
  </div>;
}

type SigState = "ready" | "loading" | "error";
type Sig = { filter: SignalFilter | null; counts: SignalCounts; state: SigState };
function GeoTable({ title, first, nodes, sortKey, sortDir, onToggle, sig, drillDepth }: { title: string; first: string; nodes: GeoNode[]; sortKey: SortKey; sortDir: 1 | -1; onToggle: (k: SortKey) => void; sig?: Sig; drillDepth?: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ node: GeoNode; organisation: string } | null>(null);
  const drillTrigger = useRef<HTMLTableRowElement | null>(null);
  const coordinatorLabels = useMemo(() => {
    const labels = new Map<string, CoordinatorLabel>();
    const visit = (list: GeoNode[]) => {
      for (const node of list) {
        if (node.kind === "org") {
          for (const [id, label] of labelCoordinators(node.children.filter(child => child.kind === "coordinator"))) labels.set(id, label);
        } else if (node.kind === "coordinator" && !labels.has(node.id)) {
          labels.set(node.id, coordinatorLabel(node));
        }
        visit(node.children);
      }
    };
    visit(nodes);
    return labels;
  }, [nodes]);
  const drillLabel = drill ? coordinatorLabels.get(drill.node.id) : undefined;
  const flip = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sorted = (list: GeoNode[]) => [...list].sort((a, b) => (a[sortKey] - b[sortKey]) * sortDir);
  const render = (list: GeoNode[], depth: number, parent?: GeoNode): ReactNode => sorted(list).map(n => {
    const Icon = ICON[n.kind];
    const opensDialog = drillDepth !== undefined && depth === drillDepth;
    const expandable = n.children.length > 0;
    const isOpen = open.has(n.id);
    const inferred = coordinatorLabels.get(n.id);
    const displayLabel = inferred?.label ?? n.label;
    const label = <>
      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${!opensDialog && isOpen ? "rotate-90" : ""} ${opensDialog || expandable ? "" : "invisible"}`} />
      <Icon className="h-4 w-4 text-muted-foreground" />{displayLabel}
      {n.coordinatorType && <span className="text-xs font-normal text-muted-foreground">{n.coordinatorType}</span>}
      {inferred?.share != null && <span className="text-xs font-normal text-muted-foreground">{Math.round(inferred.share * 100)}%</span>}
    </>;
    const showDrill = (trigger: HTMLTableRowElement) => {
      drillTrigger.current = trigger;
      setDrill({ node: n, organisation: parent?.label ?? "" });
    };
    return <Fragment key={n.id}>
      <TableRow
        className={opensDialog ? "cursor-pointer hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : undefined}
        role={opensDialog ? "button" : undefined}
        tabIndex={opensDialog ? 0 : undefined}
        aria-haspopup={opensDialog ? "dialog" : undefined}
        aria-label={opensDialog ? `Open coordinator ${displayLabel}${n.coordinatorType ? ` · ${n.coordinatorType}` : ""}${inferred?.share != null ? ` · ${Math.round(inferred.share * 100)}%` : ""}` : undefined}
        onClick={opensDialog ? e => showDrill(e.currentTarget) : undefined}
        onKeyDown={opensDialog ? e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); showDrill(e.currentTarget); } } : undefined}
      >
        <TableCell className={INDENT[depth]}>
          {opensDialog ? <span title={inferred?.code} className="inline-flex items-center gap-2 text-left font-medium">{label}</span> :
            <button type="button" title={inferred?.code} disabled={!expandable} aria-expanded={expandable ? isOpen : undefined} onClick={() => flip(n.id)} className="inline-flex items-center gap-2 text-left font-medium disabled:cursor-default">{label}</button>}
        </TableCell>
        <TableCell className="text-right tabular-nums">{n.total.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums">{n.draft.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums">{n.live.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums">{n.retired.toLocaleString()}</TableCell>
        <TableCell>{sig?.filter ? <SignalCell node={n} sig={{ ...sig, filter: sig.filter }} /> : sig ? <SignalTagCell node={n} counts={sig.counts} state={sig.state} /> : <ActivityCell score={n.avgCompletion} suffix="%" />}</TableCell>
        <TableCell className="text-right tabular-nums">{n.belowThreshold.toLocaleString()}</TableCell>
      </TableRow>
      {!opensDialog && isOpen && render(n.children, depth + 1, n)}
    </Fragment>;
  });
  return <><TableShell title={title} caption={sig?.filter ? `Expand rows to drill down · Completeness shows ${filterLabel(sig.filter)} profiles (draft + live)` : sig ? "Expand rows to drill down · tag shows the profile status most profiles in the row have" : "Expand rows to drill down · completeness is participant-weighted"}>
    <Table>
      <TableHeader><TableRow>
        <TableHead className={HEAD_LABEL}>{first}</TableHead>
        <TableHead className="text-right"><SortBtn k="total" sortKey={sortKey} onToggle={onToggle}>Participants</SortBtn></TableHead>
        <TableHead className={`text-right ${HEAD_LABEL}`}>Draft</TableHead>
        <TableHead className={`text-right ${HEAD_LABEL}`}>Live</TableHead>
        <TableHead className={`text-right ${HEAD_LABEL}`}>Retired</TableHead>
        <TableHead className="text-right">{sig?.filter ? <span className={HEAD_LABEL}>{filterLabel(sig.filter)}</span> : <SortBtn k="avgCompletion" sortKey={sortKey} onToggle={onToggle}>Completeness</SortBtn>}</TableHead>
        <TableHead className="text-right"><SortBtn k="belowThreshold" sortKey={sortKey} onToggle={onToggle}>Below 60%</SortBtn></TableHead>
      </TableRow></TableHeader>
      <TableBody>{render(nodes, 0)}</TableBody>
    </Table>
  </TableShell>
    {drillDepth !== undefined && <Dialog open={!!drill} onOpenChange={o => { if (!o) setDrill(null); }}>
      <DialogContent className="max-w-4xl max-h-[85dvh] overflow-y-auto" onCloseAutoFocus={e => { e.preventDefault(); drillTrigger.current?.focus(); }}>
        <DialogHeader className="min-w-0 break-words">
          <DialogTitle title={drillLabel?.code}>{drillLabel?.label ?? drill?.node.label}{drill?.node.coordinatorType ? ` · ${drill.node.coordinatorType}` : ""}{drillLabel?.share != null && <span className="ml-2 text-xs font-normal text-muted-foreground">{Math.round(drillLabel.share * 100)}%</span>}</DialogTitle>
          <DialogDescription>{drill ? `${drill.organisation} · ${drill.node.total.toLocaleString()} participants · ${drill.node.avgCompletion}% complete` : ""}</DialogDescription>
        </DialogHeader>
        {drill && (drill.node.children.length ?
          <div className="min-w-0 overflow-x-auto"><GeoTable key={drill.node.id} title="States · districts" first="State" nodes={drill.node.children} sortKey={sortKey} sortDir={sortDir} onToggle={onToggle} sig={sig} /></div> :
          <p className="text-sm text-muted-foreground">No state or district details available.</p>)}
      </DialogContent>
    </Dialog>}
  </>;
}

/** Replaces the completeness bar while a profile-status filter is applied. */
function SignalCell({ node, sig }: { node: GeoNode; sig: { filter: SignalFilter; counts: SignalCounts } }) {
  const m = matchFor(node, sig.counts[node.id], sig.filter);
  const of = node.draft + node.live;
  return <div className="min-w-40 text-right tabular-nums">
    <div className="font-medium">{m.total.toLocaleString()} <span className="text-xs text-muted-foreground">{pct(m.total, of)}</span></div>
    <div className="whitespace-nowrap text-xs text-muted-foreground">Draft {m.draft.toLocaleString()} · Live {m.live.toLocaleString()}</div>
  </div>;
}

const TAG = {
  strong: { label: "Strong Signal", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-500/40 dark:text-emerald-400" },
  moderate: { label: "Moderate Signal", cls: "bg-blue-500/15 text-blue-700 border-blue-500/40 dark:text-blue-400" },
  weak: { label: "Weak Signal", cls: "bg-amber-500/15 text-amber-700 border-amber-500/40 dark:text-amber-400" },
} as const;

/** Row's most common profile status (draft + live) as a tag, with completeness underneath. */
function SignalTagCell({ node, counts, state }: { node: GeoNode; counts: SignalCounts; state: SigState }) {
  if (state !== "ready") return <div className="flex flex-col items-end gap-1">
    <span className="whitespace-nowrap rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{state === "loading" ? "Checking signal…" : "Signal unavailable"}</span>
    <span className="text-xs tabular-nums text-muted-foreground">{node.avgCompletion}% complete</span>
  </div>;
  const c = counts[node.id];
  const n = (key: "strong" | "moderate" | "weak") => matchFor(node, c, { kind: "signal", key }).total;
  const by = (["strong", "moderate", "weak"] as const).map(k => ({ k, v: n(k) }));
  const top = by.reduce((a, b) => (b.v > a.v ? b : a));
  const of = node.draft + node.live;
  const t = TAG[top.k];
  return <div className="flex flex-col items-end gap-1" title={by.map(x => `${TAG[x.k].label}: ${x.v.toLocaleString()}`).join(" · ")}>
    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${t.cls}`}>{t.label} <span className="font-normal">{pct(top.v, of)}</span></span>
    <span className="text-xs tabular-nums text-muted-foreground">{node.avgCompletion}% complete</span>
  </div>;
}
