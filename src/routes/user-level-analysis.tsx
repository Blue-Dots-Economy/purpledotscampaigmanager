import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Users,
  UserPlus,
  AlertTriangle,
  PauseCircle,
  Copy,
  CheckCircle2,
  Send,
  TrendingUp,
  Activity,
  RefreshCw,
  Languages,
  Moon,
  Search,
  ChevronDown,
  Upload,
  RotateCcw,
  SlidersHorizontal,
  Info,
  Network,
} from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  loadSeekers,
  loadSeekersAsync,
  saveUploadedCsv,
  resetToBundled,
  PROFILE_FIELD_LABELS,
  type Seeker,
  type CsvMeta,
} from "@/lib/upSeekersCsv";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { RealParticipantView } from "@/components/my-dots/RealParticipantView";
import { CoordinatorRollupView } from "@/components/my-dots/CoordinatorRollupView";
import { getScopeForActor } from "@/lib/my-dots-region";
import { useRouterState } from "@tanstack/react-router";
import {
  getProviderParticipants,
  getProviderSummary,
  getSeekerParticipants,
  getSeekerSummary,
  sumBreakdown,
  type ConnectionBreakdown,
  getUserMetrics,
  type Lifecycle,
  type Participant,
} from "@/lib/purple-dots-participants";

export const Route = createFileRoute("/user-level-analysis")({
  component: MyPurpleDotsRoute,
  head: () => ({
    meta: [
      { title: "My Purple Dots · Participant network" },
      {
        name: "description",
        content:
          "Lifecycle, profile health and connection activity across the Purple Dots seeker and service-provider network.",
      },
      { property: "og:title", content: "My Purple Dots · Participant network" },
      {
        property: "og:description",
        content:
          "Lifecycle, profile health and connection activity across the Purple Dots seeker and service-provider network.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const LIFECYCLE_STYLES: Record<Lifecycle, string> = {
  New: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  Active: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  "At Risk": "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  Inactive: "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30",
};

const LIFECYCLE_ICON_STYLES: Record<Lifecycle, string> = {
  New: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  Active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  "At Risk": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  Inactive: "bg-rose-500/15 text-rose-600 dark:text-rose-400",
};

const LIFECYCLE_ORDER: Lifecycle[] = ["New", "Active", "At Risk", "Inactive"];

const LIFECYCLE_ICONS: Record<Lifecycle, typeof Users> = {
  New: UserPlus,
  Active: Users,
  "At Risk": AlertTriangle,
  Inactive: PauseCircle,
};

const SEEKER_DESCRIPTIONS: Record<Lifecycle, string> = {
  New: "Profile age ≤ 7 days",
  Active: "Last connection requested ≤ 30 days",
  "At Risk": "Profile > 7d, last connection requested 31–90d",
  Inactive: "Last connection requested > 90 days or never",
};

const PROVIDER_DESCRIPTIONS: Record<Lifecycle, string> = {
  New: "Service posted within the last 7 days",
  Active: "Accepted or rejected a request in the last 30 days",
  "At Risk": "No responses for 30–90 days",
  Inactive: "No activity for 90+ days",
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatJoined(raw: string): string {
  if (!raw) return "—";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${MONTHS[Number(iso[2]) - 1]} ${Number(iso[3])}, ${iso[1]}`;
  const parts = raw.trim().split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts.map((p) => parseInt(p, 10));
    if (m && d && y) return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  return raw;
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words[1]?.[0] ?? "")).toUpperCase();
}

const SEGMENTS = [
  { key: "requested" as const, label: "Requested", color: "bg-brand" },
  { key: "accepted" as const, label: "Accepted", color: "bg-emerald-500" },
  { key: "declined" as const, label: "Declined", color: "bg-rose-500" },
  { key: "cancelled" as const, label: "Cancelled", color: "bg-muted-foreground/40" },
];

function SegmentedBar({ breakdown, max }: { breakdown: ConnectionBreakdown; max: number }) {
  const total = sumBreakdown(breakdown);
  const fill = max > 0 ? Math.max(0, Math.min(100, (total / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
      {total > 0 && (
        <div className="flex h-full" style={{ width: `${fill}%` }}>
          {SEGMENTS.map((s) => {
            const v = breakdown[s.key];
            if (!v) return null;
            return (
              <div key={s.key} className={`h-full ${s.color}`} style={{ width: `${(v / total) * 100}%` }} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConnectionCell({
  breakdown,
  max,
}: {
  breakdown: ConnectionBreakdown;
  max: number;
}) {
  const total = sumBreakdown(breakdown);
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex items-center gap-2 cursor-default outline-none" tabIndex={0}>
          <span className="tabular-nums">{total}</span>
          <SegmentedBar breakdown={breakdown} max={max} />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-52">
        <div className="space-y-1.5 text-xs">
          {SEGMENTS.map((s) => (
            <div key={s.key} className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${s.color}`} />
              <span className="text-muted-foreground">{s.label}</span>
              <span className="ml-auto tabular-nums">{breakdown[s.key]}</span>
            </div>
          ))}
          <div className="border-t border-border pt-1.5 flex items-center">
            <span className="font-medium">Total</span>
            <span className="ml-auto font-medium tabular-nums">{total}</span>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
      <div
        className="h-full rounded-full bg-brand"
        style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

function MetricTile({
  label,
  value,
  description,
  Icon,
}: {
  label: string;
  value: string;
  description: string;
  Icon: typeof Users;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-lg bg-brand-soft flex items-center justify-center text-brand">
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-sm font-medium leading-tight">{label}</div>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {description}
      </div>
    </div>
  );
}

// Live organisation views are independent of the coordinator's explicitly labelled sample view.
// Every other role keeps the roster below.
function MyPurpleDotsRoute() {
  const { session } = useAuth();
  const role = session?.role;
  const search = useRouterState({ select: (s) => s.location.search }) as Record<string, unknown>;
  const persona =
    role === "admin" &&
    (search?.persona === "owner" || search?.persona === "coordinator" || search?.persona === "national" || search?.persona === "wc")
      ? search.persona
      : role;
  if (persona === "coordinator") {
    const scope = getScopeForActor("coordinator", session?.email);
    if (scope.kind === "coordinator") return <CoordinatorRollupView scope={scope} />;
  }
  if (["owner", "national", "network_admin", "admin", "ecosystem", "wc", "jfc"].includes(persona ?? "")) return <RealParticipantView />;
  return <UserLevelAnalysis />;
}

function UserLevelAnalysis() {
  const { config } = useProgram();
  const isProviders = config.id === "providers";
  const entityLabel = isProviders ? "Service Providers" : "Seekers";

  const initial = useMemo(() => loadSeekers(), []);
  const [seekers, setSeekers] = useState<Seeker[]>(initial.seekers);
  const [meta, setMeta] = useState<CsvMeta>(initial.meta);
  const [isFetching, setIsFetching] = useState(false);
  const [search, setSearch] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<string>("all");
  const [minCompletion, setMinCompletion] = useState<number>(0);
  const [profileInfoOpen, setProfileInfoOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    loadSeekersAsync().then(({ seekers: s, meta: m }) => {
      setSeekers(s);
      setMeta(m);
    });
  }, []);

  const refetch = async () => {
    setIsFetching(true);
    const { seekers: s, meta: m } = await loadSeekersAsync();
    setSeekers(s);
    setMeta(m);
    setTimeout(() => setIsFetching(false), 300);
  };

  const handleUploadClick = () => fileRef.current?.click();

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const { seekers: s, meta: m, persisted } = await saveUploadedCsv(file.name, text);
      setSeekers(s);
      setMeta(m);
      if (!persisted) {
        alert(
          `Loaded ${s.length} rows from "${file.name}", but it couldn't be saved to browser storage. It will remain active until you reload the page.`,
        );
      }
    } catch (err) {
      alert("Failed to parse CSV: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleReset = async () => {
    const { seekers: s, meta: m } = await resetToBundled();
    setSeekers(s);
    setMeta(m);
  };

  const participants = useMemo<Participant[]>(
    () => (isProviders ? getProviderParticipants() : getSeekerParticipants()),
    [isProviders],
  );

  const fieldCompletion = useMemo(() => {
    const total = seekers.length;
    const counts = new Array(PROFILE_FIELD_LABELS.length).fill(0) as number[];
    for (const s of seekers) {
      s.profileFieldChecks.forEach((c, i) => {
        if (c.passed) counts[i]++;
      });
    }
    return PROFILE_FIELD_LABELS.map((label, i) => ({
      label,
      count: counts[i],
      pct: total ? Math.round((counts[i] / total) * 100) : 0,
    }));
  }, [seekers]);

  const summary = useMemo(() => {
    const s = isProviders ? getProviderSummary() : getSeekerSummary();
    return { registered: s.profilesRegistered, complete: s.profilesComplete };
  }, [isProviders]);

  const userMetrics = getUserMetrics(config.id, participants);

  const byLifecycle = useMemo(() => {
    const counts: Record<Lifecycle, number> = { New: 0, Active: 0, "At Risk": 0, Inactive: 0 };
    for (const p of participants) counts[p.lifecycle]++;
    return counts;
  }, [participants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants.filter((p) => {
      if (lifecycleFilter !== "all" && p.lifecycle !== lifecycleFilter) return false;
      if (p.profileCompletion < minCompletion) return false;
      if (q && !(p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [participants, search, lifecycleFilter, minCompletion]);

  const visible = filtered.slice(0, 200);
  const maxInitiated = Math.max(1, ...participants.map((p) => p.initiated));
  const maxReceived = Math.max(1, ...participants.map((p) => p.received));
  const completePct = summary.registered
    ? Math.round((summary.complete / summary.registered) * 100)
    : 0;
  const descriptions = isProviders ? PROVIDER_DESCRIPTIONS : SEEKER_DESCRIPTIONS;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Purple Dots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discovery &amp; services network for People with Disabilities
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChosen}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Add Participants
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                Source: <span className="font-medium text-foreground">{meta.name}</span>
                <div>{meta.rows.toLocaleString()} rows</div>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Reload current data
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleUploadClick()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload new CSV…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleReset()}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to bundled CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="gap-2">
            <Languages className="h-4 w-4" />
            English
          </Button>
          <Button variant="outline" size="icon">
            <Moon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Summary bar */}
      <div className="rounded-xl border border-border bg-card p-5 flex flex-wrap items-center gap-4">
        <div className="h-10 w-10 rounded-lg bg-brand-soft flex items-center justify-center text-brand">
          <Network className="h-5 w-5" />
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {entityLabel}
          </div>
          <div className="text-lg font-semibold">{participants.length.toLocaleString()} total</div>
        </div>
        <div className="hidden sm:block h-10 w-px bg-border" />
        <p className="text-sm text-muted-foreground flex-1 min-w-[200px]">
          Lifecycle and profile health across your network
        </p>
        <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Lifecycle cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {LIFECYCLE_ORDER.map((life) => {
          const Icon = LIFECYCLE_ICONS[life];
          return (
            <div key={life} className="rounded-xl border border-border bg-card p-5">
              <div
                className={`h-10 w-10 rounded-lg flex items-center justify-center ${LIFECYCLE_ICON_STYLES[life]}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-5 text-4xl font-bold tracking-tight">
                {byLifecycle[life].toLocaleString()}
              </div>
              <div className="mt-2 text-base font-semibold">{life}</div>
              <div className="mt-1 text-sm text-muted-foreground">{descriptions[life]}</div>
            </div>
          );
        })}
      </div>

      {/* Profiles & Users metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">
            Profiles
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile
              label="Profiles Registered"
              value={summary.registered.toLocaleString()}
              description={`All ${entityLabel} records`}
              Icon={Copy}
            />
            <MetricTile
              label="Profiles Complete"
              value={summary.complete.toLocaleString()}
              description={`${completePct}% of all profiles`}
              Icon={CheckCircle2}
            />
            <MetricTile
              label="Received Connections"
              value={userMetrics.receivedConnections.toLocaleString()}
              description="Profiles with submissions"
              Icon={Send}
            />
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-3">
            Users
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricTile
              label={`Total ${entityLabel}`}
              value={userMetrics.totalAccountHolders.toLocaleString()}
              description="Unique account holders"
              Icon={Users}
            />
            <MetricTile
              label="Avg Profiles per User"
              value={String(userMetrics.avgProfilesPerUser)}
              description="Profiles managed each"
              Icon={TrendingUp}
            />
            <MetricTile
              label="Avg Actions per User"
              value={String(userMetrics.avgActionsPerUser)}
              description="Recorded interactions"
              Icon={Activity}
            />
          </div>
        </div>
      </div>

      {/* Participant table */}
      <Panel
        title={`${entityLabel} Activity & Status`}
        description={`${filtered.length.toLocaleString()} of ${participants.length.toLocaleString()}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search"
                className="pl-9 w-[200px]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={lifecycleFilter} onValueChange={setLifecycleFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All lifecycles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All lifecycles</SelectItem>
                {LIFECYCLE_ORDER.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <SlidersHorizontal className="h-4 w-4" />
                  All filters
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 space-y-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">Profile completion</div>
                  <Select
                    value={String(minCompletion)}
                    onValueChange={(v) => setMinCompletion(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">All</SelectItem>
                      <SelectItem value="50">50% and above</SelectItem>
                      <SelectItem value="75">75% and above</SelectItem>
                      <SelectItem value="100">100% only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setSearch("");
                    setLifecycleFilter("all");
                    setMinCompletion(0);
                  }}
                >
                  Clear all filters
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        }
      >
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-8">
                  <input type="checkbox" aria-label="Select all" className="accent-current" />
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Participant</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Joined</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1">
                    Profile Status
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      aria-label="How profile status is calculated"
                      onClick={() => setProfileInfoOpen(true)}
                    >
                      <Info className="h-3.5 w-3.5" />
                    </Button>
                  </span>
                </TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Initiated</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Received</TableHead>
                <TableHead className="text-xs uppercase tracking-wider">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name}`}
                      className="accent-current"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-brand-soft text-brand flex items-center justify-center text-xs font-semibold">
                        {initials(p.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.name}</div>
                        <div className="text-[11px] text-muted-foreground font-mono truncate">
                          {p.id}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{formatJoined(p.joined)}</div>
                    <div className="text-[11px] text-muted-foreground">last seen {p.lastSeen}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Bar pct={p.profileCompletion} />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {p.profileCompletion}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ConnectionCell breakdown={p.initiatedBreakdown} max={maxInitiated} />
                  </TableCell>
                  <TableCell>
                    <ConnectionCell breakdown={p.receivedBreakdown} max={maxReceived} />
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`rounded-full ${LIFECYCLE_STYLES[p.lifecycle]}`}
                    >
                      {p.lifecycle}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-10">
                    No participants match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {!isProviders && (
          <div className="pt-3 text-xs text-muted-foreground">
            Showing sample data. Uploaded CSV is used for profile-status analysis only.
          </div>
        )}
        {filtered.length > 0 && (
          <div className="pt-1 text-xs text-muted-foreground">
            Showing 1–{visible.length.toLocaleString()} of {filtered.length.toLocaleString()}
          </div>
        )}
      </Panel>

      <Dialog open={profileInfoOpen} onOpenChange={setProfileInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Profile Status</DialogTitle>
            <DialogDescription>
              A profile is considered complete only when all {PROFILE_FIELD_LABELS.length} checks
              below pass for that profile. The % next to each field is the share of profiles where
              just that one field passes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ol className="list-decimal pl-5 space-y-1.5 text-sm">
              {[
                { label: "Name", desc: "not blank and not a placeholder (Unknown, अज्ञात, etc.)" },
                { label: "Location", desc: "not blank and not just city / state / their combination" },
                { label: "Email or Phone", desc: "at least one filled" },
                { label: "Age", desc: "not blank" },
                { label: "Role", desc: 'not blank and not "any"' },
                { label: "Expected Salary", desc: "not blank" },
              ].map((f) => {
                const fc = fieldCompletion.find((x) => x.label === f.label);
                return (
                  <li key={f.label}>
                    <div className="flex items-start justify-between gap-3">
                      <span>
                        <span className="font-medium">{f.label}</span> — {f.desc}
                      </span>
                      <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                        {fc ? `${fc.count.toLocaleString()} (${fc.pct}%)` : ""}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="rounded border border-border bg-muted/30 px-3 py-2 text-sm">
              Profiles complete (all {PROFILE_FIELD_LABELS.length} checks pass):{" "}
              <span className="font-semibold">{completePct}%</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
