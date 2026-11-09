import { Component, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Info, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { useProfileSignal } from "@/hooks/useProfileSignal";
import { CHECKS, type CheckKey, type Signal, type SignalOrg } from "@/lib/profile-signal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { HEAD_LABEL, SectionLabel, StatCard, TableShell } from "./shared";

export class ProfileSignalErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return <p role="alert" className="text-sm text-destructive">Profile signal could not be loaded: {this.state.error.message}</p>;
  }
}

type Filter = { kind: "signal"; key: Signal } | { kind: "missing"; key: CheckKey } | null;
const SIGNALS: { key: Signal; label: string; desc: string }[] = [
  { key: "strong", label: "Strong Signal", desc: "All six checks pass" },
  { key: "moderate", label: "Moderate Signal", desc: "Location, Disability, Need Category present — others may be missing" },
  { key: "weak", label: "Weak Signal", desc: "Missing Location, Disability or Need Category" },
];
const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : "0%";
const NOT_LOADED = "Not loaded";

export function ProfileSignalView({ actor }: { actor: string }) {
  const { data } = useProfileSignal(actor);
  const [filter, setFilter] = useState<Filter>(null);
  const rows = useMemo(() => {
    if (!data.allowed) return [];
    const count = (o: SignalOrg) => !filter ? o.total : filter.kind === "signal" ? o[filter.key] : o.missing[filter.key];
    return data.byOrganisation.map(o => ({ ...o, matching: count(o) })).filter(o => o.matching > 0).sort((a, b) => b.matching - a.matching);
  }, [data, filter]);
  if (!data.allowed) return null;
  const t = data.totals;
  const filterLabel = !filter ? "All" : filter.kind === "signal" ? SIGNALS.find(s => s.key === filter.key)!.label : `Missing ${CHECKS.find(c => c.key === filter.key)!.label}`;
  const loaded = (k: CheckKey) => CHECKS.find(c => c.key === k)!.loaded;

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SectionLabel caption="Preview · only visible to this account">Profile signal</SectionLabel>
      <Dialog>
        <DialogTrigger asChild><Button variant="ghost" size="sm"><Info className="h-4 w-4" />How it is calculated</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Profile Status</DialogTitle>
            <DialogDescription>A profile is Strong only when all 6 checks pass. The % next to each field is the share of profiles where that one field passes. Disability and Need Category come from call records, so only seekers who were called can pass them.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-2 text-sm">
            {CHECKS.map((c, i) => <li key={c.key} className="flex justify-between gap-4">
              <span><span className="font-medium">{i + 1}. {c.label}</span> — <span className="text-muted-foreground">{c.rule}</span></span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{c.loaded ? `${(t.total - t.missing[c.key]).toLocaleString()} (${pct(t.total - t.missing[c.key], t.total)})` : NOT_LOADED}</span>
            </li>)}
          </ol>
          <p className="rounded-md border border-border p-3 text-sm">Profiles complete (all 6 checks pass): <span className="font-semibold">{pct(t.strong, t.total)}</span></p>
          <p className="text-xs text-muted-foreground">Name, Email or Phone and Need Details are not in the database yet, so no profile can be Strong until they are loaded.</p>
        </DialogContent>
      </Dialog>
    </div>

    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard Icon={ShieldCheck} title="Strong Signal" value={t.strong} sub={`${pct(t.strong, t.total)} of ${t.total.toLocaleString()} seekers`} />
      <StatCard Icon={ShieldQuestion} title="Moderate Signal" value={t.moderate} sub={`${pct(t.moderate, t.total)} · ${data.calledProfiles.toLocaleString()} seekers have call records`} />
      <StatCard Icon={ShieldAlert} title="Weak Signal" value={t.weak} sub={`${pct(t.weak, t.total)} of all seekers`} />
    </div>

    <TableShell title="Profile signal by organisation" caption={filter ? `Filtered: ${filterLabel}` : "Counts of seekers per organisation"}>
      <div className="px-4 pb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" className="min-w-56 justify-between">Profile: {filterLabel}<ChevronDown className="h-4 w-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-80">
            <DropdownMenuItem onSelect={() => setFilter(null)}>Clear (show all)</DropdownMenuItem>
            <DropdownMenuSeparator />
            {SIGNALS.map(s => <DropdownMenuItem key={s.key} onSelect={() => setFilter({ kind: "signal", key: s.key })} className="items-start justify-between gap-3">
              <span><span className="block">{s.label}</span><span className="block text-xs text-muted-foreground">{s.desc}</span></span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{t[s.key].toLocaleString()} · {pct(t[s.key], t.total)}</span>
            </DropdownMenuItem>)}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className={HEAD_LABEL}>Missing field</DropdownMenuLabel>
            {CHECKS.map(c => <DropdownMenuItem key={c.key} disabled={!c.loaded} onSelect={() => setFilter({ kind: "missing", key: c.key })} className="justify-between">
              <span>{c.label}</span>
              <span className="tabular-nums text-muted-foreground">{c.loaded ? `${t.missing[c.key].toLocaleString()} · ${pct(t.missing[c.key], t.total)}` : NOT_LOADED}</span>
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Table>
        <TableHeader><TableRow>
          <TableHead className={HEAD_LABEL}>Organisation</TableHead>
          <TableHead className={`text-right ${HEAD_LABEL}`}>Seekers</TableHead>
          {filter && <TableHead className={`text-right ${HEAD_LABEL}`}>Matching</TableHead>}
          <TableHead className={`text-right ${HEAD_LABEL}`}>Strong</TableHead>
          <TableHead className={`text-right ${HEAD_LABEL}`}>Moderate</TableHead>
          <TableHead className={`text-right ${HEAD_LABEL}`}>Weak</TableHead>
          <TableHead className={`text-right ${HEAD_LABEL}`}>No location</TableHead>
          <TableHead className={`text-right ${HEAD_LABEL}`}>No disability</TableHead>
          <TableHead className={`text-right ${HEAD_LABEL}`}>No need category</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map(o => <TableRow key={o.org}>
            <TableCell className="font-medium">{o.org}</TableCell>
            <TableCell className="text-right tabular-nums">{o.total.toLocaleString()}</TableCell>
            {filter && <TableCell className="text-right tabular-nums font-semibold">{o.matching.toLocaleString()}</TableCell>}
            <TableCell className="text-right tabular-nums">{o.strong.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{o.moderate.toLocaleString()} <span className="text-xs text-muted-foreground">{pct(o.moderate, o.total)}</span></TableCell>
            <TableCell className="text-right tabular-nums">{o.weak.toLocaleString()} <span className="text-xs text-muted-foreground">{pct(o.weak, o.total)}</span></TableCell>
            {(["location", "disability", "needCategory"] as const).map(k => <TableCell key={k} className="text-right tabular-nums">{loaded(k) ? o.missing[k].toLocaleString() : NOT_LOADED}</TableCell>)}
          </TableRow>)}
          {!rows.length && <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground">No organisations match this filter.</TableCell></TableRow>}
        </TableBody>
      </Table>
    </TableShell>
    <p className="text-xs text-muted-foreground">Name, Email or Phone and Need Details are not loaded yet and count as failing, so Strong stays at 0 for now. Disability and Need Category are taken from call records.</p>
  </div>;
}
