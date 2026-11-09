import { ChevronDown, Info } from "lucide-react";
import { CHECKS, matchFor, TOTAL_KEY, type SignalCounts, type SignalFilter } from "@/lib/profile-signal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { HEAD_LABEL } from "./shared";

export const SIGNALS = [
  { key: "strong", label: "Strong Signal", desc: "All six checks pass" },
  { key: "moderate", label: "Moderate Signal", desc: "Location, Disability, Need Category present — others may be missing" },
  { key: "weak", label: "Weak Signal", desc: "Missing Location, Disability or Need Category" },
] as const;
export const pct = (n: number, d: number) => d ? `${Math.round((n / d) * 100)}%` : "0%";
export function filterLabel(f: SignalFilter | null) {
  if (!f) return "All";
  return f.kind === "signal" ? SIGNALS.find(s => s.key === f.key)!.label : `Missing ${CHECKS.find(c => c.key === f.key)!.label}`;
}

/** Profile status filter for the organisation table (preview account only). */
export function ProfileSignalFilter({ value, onChange, counts, totals, loading, error }: {
  value: SignalFilter | null; onChange: (f: SignalFilter | null) => void;
  counts?: SignalCounts; totals: { draft: number; live: number }; loading: boolean; error?: string;
}) {
  const all = totals.draft + totals.live;
  const m = (f: SignalFilter) => counts ? matchFor(totals, counts[TOTAL_KEY], f).total : 0;
  return <div className="flex flex-wrap items-center gap-2">
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={loading || !!error}>
        <Button variant="outline" className="min-w-56 justify-between">{loading ? "Profile: loading…" : `Profile: ${filterLabel(value)}`}<ChevronDown className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuItem onSelect={() => onChange(null)}>Clear (show all)</DropdownMenuItem>
        <DropdownMenuSeparator />
        {SIGNALS.map(s => <DropdownMenuItem key={s.key} onSelect={() => onChange({ kind: "signal", key: s.key })} className="items-start justify-between gap-3">
          <span><span className="block">{s.label}</span><span className="block text-xs text-muted-foreground">{s.desc}</span></span>
          <span className="shrink-0 tabular-nums text-muted-foreground">{m({ kind: "signal", key: s.key }).toLocaleString()} · {pct(m({ kind: "signal", key: s.key }), all)}</span>
        </DropdownMenuItem>)}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className={HEAD_LABEL}>Missing field</DropdownMenuLabel>
        {CHECKS.map(c => {
          const f = c.loaded ? { kind: "missing", key: c.key } as SignalFilter : null;
          return <DropdownMenuItem key={c.key} disabled={!f} onSelect={() => f && onChange(f)} className="justify-between">
            <span>{c.label}</span>
            <span className="tabular-nums text-muted-foreground">{f ? `${m(f).toLocaleString()} · ${pct(m(f), all)}` : "Not loaded"}</span>
          </DropdownMenuItem>;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="sm"><Info className="h-4 w-4" />Profile status rules</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profile Status</DialogTitle>
          <DialogDescription>A profile is Strong only when all 6 checks pass. Counts cover draft and live profiles. Disability and Need Category come from call records, so only seekers who were called can pass them.</DialogDescription>
        </DialogHeader>
        <ol className="space-y-2 text-sm">
          {CHECKS.map((c, i) => {
            const pass = c.loaded && counts ? all - m({ kind: "missing", key: c.key as "location" }) : null;
            return <li key={c.key} className="flex justify-between gap-4">
              <span><span className="font-medium">{i + 1}. {c.label}</span> — <span className="text-muted-foreground">{c.rule}</span></span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{pass == null ? "Not loaded" : `${pass.toLocaleString()} (${pct(pass, all)})`}</span>
            </li>;
          })}
        </ol>
        <p className="rounded-md border border-border p-3 text-sm">Profiles complete (all 6 checks pass): <span className="font-semibold">{pct(m({ kind: "signal", key: "strong" }), all)}</span></p>
        <p className="text-xs text-muted-foreground">Name, Email or Phone and Need Details are not in the database yet, so no profile can be Strong until they are loaded.</p>
      </DialogContent>
    </Dialog>
    {error && <span role="alert" className="text-sm text-destructive">Profile status could not be loaded: {error}</span>}
    <span className="text-xs text-muted-foreground">Preview · only visible to this account</span>
  </div>;
}
