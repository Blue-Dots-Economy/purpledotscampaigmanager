import { Component, Fragment, useState, type ReactNode } from "react";
import { Building2, ChevronRight, MapPin, MapPinned, UserRound } from "lucide-react";
import { useGeoRollup } from "@/hooks/useGeoRollup";
import type { ParticipantDomain } from "@/lib/participant-rollup";
import type { GeoNode } from "@/lib/geo-rollup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ActivityCell, HEAD_LABEL, SectionLabel, SortBtn, StatCard, TableShell } from "./shared";

type SortKey = "total" | "located" | "avgCompletion" | "belowThreshold";
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
    <Tabs defaultValue="org">
      <TabsList><TabsTrigger value="org">By organisation</TabsTrigger><TabsTrigger value="geo">By geography</TabsTrigger></TabsList>
      <TabsContent value="org" className="space-y-2">
        <GeoTable title="Organisations · coordinators · locations" first="Organisation" nodes={data.byOrganisation} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
        <p className="text-xs text-muted-foreground">{COVERAGE_NOTE}</p>
      </TabsContent>
      <TabsContent value="geo" className="space-y-2">
        <GeoTable title="States · districts · organisations" first="State" nodes={data.byGeography} sortKey={sortKey} sortDir={sortDir} onToggle={toggle} />
        <p className="text-xs text-muted-foreground">{COVERAGE_NOTE}</p>
      </TabsContent>
    </Tabs>
  </div>;
}

function GeoTable({ title, first, nodes, sortKey, sortDir, onToggle }: { title: string; first: string; nodes: GeoNode[]; sortKey: SortKey; sortDir: 1 | -1; onToggle: (k: SortKey) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const flip = (id: string) => setOpen(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const sorted = (list: GeoNode[]) => [...list].sort((a, b) => (a[sortKey] - b[sortKey]) * sortDir);
  const render = (list: GeoNode[], depth: number): ReactNode => sorted(list).map(n => {
    const Icon = ICON[n.kind];
    const expandable = n.children.length > 0;
    const isOpen = open.has(n.id);
    return <Fragment key={n.id}>
      <TableRow>
        <TableCell className={INDENT[depth]}>
          <button type="button" disabled={!expandable} aria-expanded={expandable ? isOpen : undefined} onClick={() => flip(n.id)} className="inline-flex items-center gap-2 text-left font-medium disabled:cursor-default">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""} ${expandable ? "" : "invisible"}`} />
            <Icon className="h-4 w-4 text-muted-foreground" />{n.label}
            {n.coordinatorType && <span className="text-xs font-normal text-muted-foreground">{n.coordinatorType}</span>}
          </button>
        </TableCell>
        <TableCell className="text-right tabular-nums">{n.total.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums text-muted-foreground">{n.located.toLocaleString()} of {n.total.toLocaleString()} located{n.total ? ` (${((n.located / n.total) * 100).toFixed(1)}%)` : ""}</TableCell>
        <TableCell className="text-right tabular-nums">{n.draft.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums">{n.live.toLocaleString()}</TableCell>
        <TableCell className="text-right tabular-nums">{n.retired.toLocaleString()}</TableCell>
        <TableCell><ActivityCell score={n.avgCompletion} suffix="%" /></TableCell>
        <TableCell className="text-right tabular-nums">{n.belowThreshold.toLocaleString()}</TableCell>
      </TableRow>
      {isOpen && render(n.children, depth + 1)}
    </Fragment>;
  });
  return <TableShell title={title} caption="Expand rows to drill down · completeness is participant-weighted">
    <Table>
      <TableHeader><TableRow>
        <TableHead className={HEAD_LABEL}>{first}</TableHead>
        <TableHead className="text-right"><SortBtn k="total" sortKey={sortKey} onToggle={onToggle}>Participants</SortBtn></TableHead>
        <TableHead className="text-right"><SortBtn k="located" sortKey={sortKey} onToggle={onToggle}>Coverage</SortBtn></TableHead>
        <TableHead className={`text-right ${HEAD_LABEL}`}>Draft</TableHead>
        <TableHead className={`text-right ${HEAD_LABEL}`}>Live</TableHead>
        <TableHead className={`text-right ${HEAD_LABEL}`}>Retired</TableHead>
        <TableHead className="text-right"><SortBtn k="avgCompletion" sortKey={sortKey} onToggle={onToggle}>Completeness</SortBtn></TableHead>
        <TableHead className="text-right"><SortBtn k="belowThreshold" sortKey={sortKey} onToggle={onToggle}>Below 60%</SortBtn></TableHead>
      </TableRow></TableHeader>
      <TableBody>{render(nodes, 0)}</TableBody>
    </Table>
  </TableShell>;
}
