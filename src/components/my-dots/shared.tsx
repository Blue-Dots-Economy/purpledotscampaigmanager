// Shared building blocks for the My Purple Dots persona views (region, owner, coordinator).
// Privacy: participants by ID only, coordinators by code only, organisations by institution name.
import { useMemo, useState } from "react";
import { useProgram } from "@/programs/context";
import {
  Users,
  AlertTriangle,
  PauseCircle,
  RefreshCw,
  UserCircle2,
  FlaskConical,
  Sparkles,
  UserX,
  TrendingDown,
  UserCog,
  ArrowUpDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getRegionRollup,
  PROFILE_COMPLETION_THRESHOLD,
  type Lifecycle,
  type Period,
  type ParticipantType,
  type RegionRollup,
  type RollupScope,
  type ScopedParticipantRow,
  type StatusCounts,
} from "@/lib/my-dots-region";

export const REGION = "Basti";
export const SAMPLE_NOTE = "Preview — sample data until the database is connected.";
export const ACTIVITY_FORMULA =
  "Activity = round(0.5 × (100 − inactive %) + 0.5 × average profile completion). Same formula for organisations and coordinators.";

// Fixed semantic colours on purpose: these lifecycle states must not shift with the theme.
export const STATUS: {
  key: Lifecycle;
  label: string;
  desc: string;
  Icon: typeof Users;
  num: string;
  card: string;
  tile: string;
}[] = [
  { key: "new", label: "New", desc: "Joined within the last 7 days", Icon: Sparkles,
    num: "text-emerald-600 dark:text-emerald-400", card: "bg-emerald-500/[0.01] border-border", tile: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  { key: "active", label: "Active", desc: "Engaged in the last 30 days", Icon: Users,
    num: "text-blue-600 dark:text-blue-400", card: "bg-blue-500/[0.01] border-border", tile: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
  { key: "at-risk", label: "At Risk", desc: "No engagement for 31–90 days", Icon: AlertTriangle,
    num: "text-amber-600 dark:text-amber-400", card: "bg-amber-500/[0.01] border-border", tile: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  { key: "inactive", label: "Inactive", desc: "No activity for over 90 days, or never", Icon: PauseCircle,
    num: "text-rose-600 dark:text-rose-400", card: "bg-rose-500/[0.01] border-border", tile: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
];

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  new: "New",
  active: "Active",
  "at-risk": "At Risk",
  inactive: "Inactive",
};

export const PERIOD_LABEL: Record<Period, string> = { 7: "This week", 30: "30 days", 90: "90 days" };

export type SortKey = "total" | "newInPeriod" | "activityScore";

export function sortRows<T extends Record<SortKey, number>>(rows: T[], key: SortKey, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => (a[key] - b[key]) * dir);
}

export function useSort(initial: SortKey = "activityScore") {
  const [sortKey, setSortKey] = useState<SortKey>(initial);
  const [sortDir, setSortDir] = useState<1 | -1>(-1);
  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(-1);
    }
  };
  return { sortKey, sortDir, toggleSort };
}

export function SortBtn<K extends string = SortKey>({
  k,
  children,
  title,
  sortKey,
  onToggle,
}: {
  k: K;
  children: React.ReactNode;
  title?: string;
  sortKey: K;
  onToggle: (k: K) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onToggle(k)}
      className="inline-flex items-center gap-1 hover:text-foreground"
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-foreground" : "opacity-50"}`} />
    </button>
  );
}

/** Type/period/refresh state + the single rollup call, shared by every persona view. */
export function useRollup(scope: RollupScope) {
  // Type follows the sidebar's global Seekers | Providers switch (read-only here).
  const { programId } = useProgram();
  const type: ParticipantType = programId === "providers" ? "provider" : "seeker";
  const [period, setPeriod] = useState<Period>(30);
  const [nonce, setNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scopeKey = JSON.stringify(scope);
  const rollup = useMemo(
    () => getRegionRollup({ region: REGION, period, type, scope }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period, type, nonce, scopeKey],
  );
  const refresh = () => {
    setRefreshing(true);
    setNonce((n) => n + 1);
    setTimeout(() => setRefreshing(false), 300);
  };
  return { rollup, type, period, setPeriod, refreshing, refresh };
}

export function eyebrowFor(type: ParticipantType) {
  return type === "provider" ? "PROVIDERS" : "SEEKERS";
}

/** Subtle tile tint on the same thresholds as the activity bar. */
export function activityTintClass(score: number) {
  if (score >= 60) return "bg-emerald-500/[0.04]";
  if (score >= 40) return "bg-amber-500/[0.04]";
  return "bg-rose-500/[0.04]";
}

export function activityTextClass(score: number) {
  if (score >= 60) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

export function activityBarClass(score: number) {
  if (score >= 60) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-rose-500";
}

export function ActivityCell({ score, suffix = "" }: { score: number; suffix?: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${activityBarClass(score)}`} style={{ width: `${Math.min(100, score)}%` }} />
      </div>
      <span className={`tabular-nums text-right font-medium ${suffix ? "w-10" : "w-7"}`}>{score}{suffix}</span>
    </div>
  );
}

export function SectionLabel({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
      <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{children}</div>
      {caption && <div className="text-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}

/** Section label + bordered card wrapper shared by every organisation table. */
export function TableShell({ title, caption, children }: { title: React.ReactNode; caption?: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel caption={caption}>{title}</SectionLabel>
      <div className="rounded-xl border border-border bg-card">{children}</div>
    </div>
  );
}

/** Uppercase table-head label used for non-sortable columns. */
export const HEAD_LABEL = "uppercase text-xs tracking-wider";

export function InfoCard({ Icon, tile, headline, sub }: { Icon: typeof Users; tile: string; headline: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex items-start gap-4">
      <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center ${tile}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-base font-semibold text-foreground">{headline}</div>
        <div className="mt-1 text-sm text-muted-foreground">{sub}</div>
      </div>
    </div>
  );
}

/** Small, de-emphasised sample-data marker that lives inside the header band. */
export function SampleChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground" title={SAMPLE_NOTE}>
      <FlaskConical className="h-3 w-3" />
      Sample data
    </span>
  );
}

/** Network-style stat: icon + title row, large number alone, small sub-label. */
export function StatCard({ Icon, title, value, sub }: { Icon: typeof Users; title: string; value: string | number; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="h-4 w-4 text-brand" />
        {title}
      </div>
      <div className={`mt-3 font-bold tracking-tight tabular-nums text-foreground ${typeof value === "number" ? "text-4xl" : "text-xl"}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{sub}</div>
    </div>
  );
}

export function HeaderBand({
  badge,
  type,
  period,
  setPeriod,
  total,
  sentence,
  refreshing,
  onRefresh,
  chips = <SampleChip />,
  children,
}: {
  badge: string;
  type: ParticipantType;
  /** Omit both to hide the period selector (e.g. when the server fixes the window). */
  period?: Period;
  setPeriod?: (p: Period) => void;
  /** Source markers beside the badge; defaults to the sample-data chip. */
  chips?: React.ReactNode;
  /** Extra full-width lines under the band (data window, load date, warnings). */
  children?: React.ReactNode;
  total: number;
  sentence: string;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
    <div className="flex flex-wrap items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-brand-soft flex items-center justify-center text-brand">
        <Users className="h-6 w-6" />
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{eyebrowFor(type)}</span>
          <Badge variant="secondary">{badge}</Badge>
          {chips}
        </div>
        <div className="text-2xl font-bold tabular-nums">{total.toLocaleString()}</div>
      </div>
      <div className="hidden sm:block h-10 w-px bg-border" />
      <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">{sentence}</p>
      <div className="flex items-center gap-2 ml-auto">
        {period !== undefined && setPeriod && <Select value={String(period)} onValueChange={(v) => setPeriod(Number(v) as Period)}>
          <SelectTrigger className="h-9 w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">This week</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
          </SelectContent>
        </Select>}
        <Button variant="outline" className="gap-2" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
    </div>
    {children && <div className="mt-4 border-t border-border pt-3 space-y-1">{children}</div>}
    </div>
  );
}

export function StatusCards({ status }: { status: StatusCounts }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {STATUS.map(({ key, label, desc, Icon, num, card, tile }) => (
        <div key={key} className={`rounded-xl border p-5 ${card}`}>
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tile}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div className={`mt-4 text-5xl font-bold tracking-tight tabular-nums ${num}`}>
            {status[key].toLocaleString()}
          </div>
          <div className="mt-2 text-base font-semibold text-foreground">{label}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">{desc}</div>
        </div>
      ))}
    </div>
  );
}

/** mode "group": counts coordinators with zero onboards. mode "self": one coordinator's own onboards. */
export function NeedsAttention({
  rollup,
  period,
  mode = "group",
}: {
  rollup: RegionRollup;
  period: Period;
  mode?: "group" | "self";
}) {
  const na = rollup.needsAttention;
  const coords = rollup.orgs.flatMap((o) => o.coordinators);
  const zeroCodes = coords.filter((c) => c.newInPeriod === 0).map((c) => c.code);
  const selfNew = coords.reduce((a, c) => a + c.newInPeriod, 0);
  const periodText = PERIOD_LABEL[period].toLowerCase();
  // Card 1: weakest unit, one level below the current scope.
  // Several districts → lowest district; several orgs → lowest org; one org → lowest coordinator.
  const multiDistrict = rollup.districts.length > 1;
  const multiOrg = rollup.orgs.length > 1;
  const units = multiDistrict
    ? rollup.districts.map((d) => ({ name: d.name, score: d.activityScore, inactive: d.inactivePct, n: d.total }))
    : multiOrg
      ? rollup.orgs.map((o) => ({ name: o.name, score: o.activityScore, inactive: o.inactivePct, n: o.total }))
      : coords.map((c) => ({ name: c.code, score: c.activityScore, inactive: c.inactivePct, n: c.total }));
  const weakest = units.filter((u) => u.n > 0).sort((a, b) => a.score - b.score)[0];
  const lowestIn = multiDistrict ? "lowest nationally" : multiOrg ? "lowest in district" : mode === "self" ? "your caseload" : "lowest in organisation";
  const belowPct = rollup.total ? Math.round((na.profilesBelowThreshold / rollup.total) * 100) : 0;
  return (
    <div>
      <SectionLabel>Needs attention</SectionLabel>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <InfoCard
          Icon={TrendingDown}
          tile="bg-rose-500/15 text-rose-600 dark:text-rose-400"
          headline={weakest ? `${weakest.name} — activity ${weakest.score}` : "No participants yet"}
          sub={weakest ? `${lowestIn} · ${weakest.inactive}% inactive` : periodText}
        />
        {mode === "group" ? (
          <InfoCard
            Icon={UserCog}
            tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            headline={`${na.coordinatorsWithZeroNewOnboards} coordinator${na.coordinatorsWithZeroNewOnboards === 1 ? "" : "s"} · 0 new onboards`}
            sub={zeroCodes.length ? `${zeroCodes.join(", ")} · ${periodText}` : `Everyone onboarded someone · ${periodText}`}
          />
        ) : (
          <InfoCard
            Icon={UserCog}
            tile="bg-amber-500/15 text-amber-600 dark:text-amber-400"
            headline={`${selfNew} new onboard${selfNew === 1 ? "" : "s"}`}
            sub={selfNew === 0 ? `No one joined your caseload · ${periodText}` : `Joined your caseload · ${periodText}`}
          />
        )}
        <InfoCard
          Icon={UserX}
          tile="bg-rose-500/15 text-rose-600 dark:text-rose-400"
          headline={`${na.inactiveSharePct}% inactive`}
          sub={`${rollup.status.inactive} of ${rollup.total} inactive · ${na.profilesBelowThreshold} profiles below ${PROFILE_COMPLETION_THRESHOLD}% (${belowPct}%)`}
        />
      </div>
    </div>
  );
}

/** Individual participants by ID with a neutral avatar. Never renders names or contact details. */
export function ParticipantTable({ participants }: { participants: ScopedParticipantRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Participant</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Joined</TableHead>
          <TableHead className="text-right">Last engaged</TableHead>
          <TableHead className="text-right">Profile</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {participants.map((p) => (
          <ParticipantRow key={p.id} p={p} />
        ))}
      </TableBody>
    </Table>
  );
}

export function ParticipantRow({ p, indent = false }: { p: ScopedParticipantRow; indent?: boolean }) {
  return (
    <TableRow>
      <TableCell className={indent ? "pl-12" : undefined}>
        <span className="inline-flex items-center gap-2 font-mono text-sm">
          <UserCircle2 className="h-5 w-5 text-muted-foreground" aria-hidden />
          {p.id}
        </span>
      </TableCell>
      <TableCell className="capitalize">{p.type}</TableCell>
      <TableCell><Badge variant="outline">{LIFECYCLE_LABEL[p.lifecycle]}</Badge></TableCell>
      <TableCell className="text-right tabular-nums">{p.joinedDaysAgo}d ago</TableCell>
      <TableCell className="text-right tabular-nums">
        {p.lastEngagedDaysAgo === null ? "Never" : `${p.lastEngagedDaysAgo}d ago`}
      </TableCell>
      <TableCell
        className={`text-right tabular-nums ${p.profileCompletion < PROFILE_COMPLETION_THRESHOLD ? "text-destructive" : ""}`}
      >
        {p.profileCompletion}%
      </TableCell>
    </TableRow>
  );
}
