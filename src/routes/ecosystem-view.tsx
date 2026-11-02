import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Panel } from "@/components/Panel";
import { MetricCard } from "@/components/metrics/MetricCard";
import { NATIONAL_REGION, RegionSelector, type RegionValue } from "@/components/ecosystem/RegionSelector";
import { OnboardingTab } from "@/components/ecosystem/OnboardingTab";
import { useEcosystemOverview } from "@/hooks/useEcosystemOverview";
import {
  connectionWindowLabel,
  seekersWithoutNeeds,
  toProviderGapRows,
  toSeekerGapRows,
  totalSeekerDemandGap,
  type ProviderGapRow,
  type SeekerGapRow,
} from "@/lib/ecosystem-live";
import type { EcosystemOverviewResult } from "@/lib/ecosystem.functions";
import { gapLevel, recommendedActions, type GapLevelLabel } from "@/lib/ecosystem-data";

export const Route = createFileRoute("/ecosystem-view")({
  component: EcosystemView,
  head: () => ({
    meta: [
      { title: "Ecosystem view · Purple Dots" },
      { name: "description", content: "Provider and seeker gap analysis from live connection data." },
      { property: "og:title", content: "Ecosystem view · Purple Dots" },
      { property: "og:description", content: "Provider and seeker gap analysis from live connection data." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmt = (n: number) => n.toLocaleString("en-IN");

const LEVEL_CLASSES: Record<GapLevelLabel, string> = {
  High: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  Medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  Low: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
};

function LevelBadge({ level }: { level: GapLevelLabel }) {
  return (
    <Badge variant="outline" className={LEVEL_CLASSES[level]}>
      {level}
    </Badge>
  );
}

function GapNumber({ value }: { value: number }) {
  return <span className="tabular-nums text-red-600 dark:text-red-400">{fmt(value)}</span>;
}

/** Cells for fields with no live source render an em dash, never a number. */
function Cell({ value, red }: { value: number | null; red?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  if (red) return <GapNumber value={value} />;
  return <span className="tabular-nums">{fmt(value)}</span>;
}

function Actions({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((a) => (
        <Button
          key={a}
          variant="outline"
          size="sm"
          className="h-7 bg-brand-soft text-brand border-brand/20 text-xs font-normal hover:bg-brand-soft"
        >
          {a}
        </Button>
      ))}
    </div>
  );
}

function relativeAge(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

function LiveChip({ first, last }: { first: string; last: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-green-500/10 px-2 py-0.5 text-[11px] text-green-700 dark:text-green-400"
      title="Figures come from the live Purple database"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Live data · connections {connectionWindowLabel(first, last)}
    </span>
  );
}

function EcosystemView() {
  // District filtering is disabled: the live data has no location field yet,
  // so every figure below is national. The selector stays visible but disabled.
  const [region] = useState<RegionValue>(NATIONAL_REGION);
  const query = useEcosystemOverview();
  const data = query.data ?? null;

  return (
    <Tabs defaultValue="providers" className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <RegionSelector value={region} onChange={() => {}} disabled />
          <span className="text-xs text-muted-foreground max-w-[280px]">
            District filtering is off — the live data has no district information yet, so all figures are national.
          </span>
          {data ? <LiveChip first={data.totals.firstConnection} last={data.totals.lastConnection} /> : null}
          <TabsList>
            <TabsTrigger
              value="providers"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Providers
            </TabsTrigger>
            <TabsTrigger
              value="seekers"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Seekers
            </TabsTrigger>
            <TabsTrigger
              value="onboarding"
              className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              Onboarding
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="flex items-center gap-2">
          {data ? (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              {`Loaded ${relativeAge(query.dataUpdatedAt)}`}
            </Badge>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
            Sync now
          </Button>
        </div>
      </div>

      {query.isPending ? (
        <Panel title="Loading live ecosystem data">
          <p className="py-8 text-center text-sm text-muted-foreground">
            Reading categories, provider types and totals from the live database…
          </p>
        </Panel>
      ) : query.isError || !data ? (
        <Panel title="Live ecosystem data could not be loaded">
          <div className="py-8 flex flex-col items-center gap-3 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            <p className="text-sm text-muted-foreground max-w-md">
              {query.error instanceof Error
                ? query.error.message
                : "The live ecosystem query failed. No sample or empty data has been substituted."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        </Panel>
      ) : (
        <>
          <p className="text-xs text-muted-foreground -mt-3">
            {fmt(seekersWithoutNeeds(data.totals))} of {fmt(data.totals.totalSeekers)} seekers (
            {Math.round((seekersWithoutNeeds(data.totals) / Math.max(1, data.totals.totalSeekers)) * 100)}%) have no
            recorded need yet. Category demand counts every recorded need, so a seeker with two needs appears in both
            categories.
          </p>
          <TabsContent value="providers" className="space-y-6 mt-0">
            <TotalsRow data={data} />
            <GapSummary data={data} />
            <ProvidersGapPanel rows={toProviderGapRows(data.categories)} />
          </TabsContent>

          <TabsContent value="seekers" className="space-y-6 mt-0">
            <TotalsRow data={data} />
            <GapSummary data={data} />
            <SeekersGapPanel rows={toSeekerGapRows(data.categories)} />
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-6 mt-0">
            <OnboardingTab region={region} />
          </TabsContent>
        </>
      )}
    </Tabs>
  );
}

function TotalsRow({ data }: { data: EcosystemOverviewResult }) {
  const t = data.totals;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <MetricCard label="Total seekers" value={t.totalSeekers} sub="registered nationwide" />
      <MetricCard label="Total service providers" value={t.totalProviders} sub="active organisations" />
      <MetricCard
        label="Total connections"
        value={t.totalConnections}
        sub={`seeker ↔ provider links, ${connectionWindowLabel(t.firstConnection, t.lastConnection)}`}
      />
    </div>
  );
}

function Figure({ value, label, red }: { value: string; label: string; red?: boolean }) {
  return (
    <div>
      <p
        className={`text-2xl font-semibold tracking-tight tabular-nums ${
          red ? "text-red-600 dark:text-red-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function GapSummary({ data }: { data: EcosystemOverviewResult }) {
  const t = data.totals;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Panel title="Action gap" description="Connections the ecosystem could have initiated.">
        <div className="grid grid-cols-2 gap-4">
          <Figure
            value={`${fmt(t.connectedSeekers)} / ${fmt(t.totalSeekers)}`}
            label="Seekers · initiated connections"
          />
          <Figure
            value={`${fmt(t.connectedProviders)} / ${fmt(t.totalProviders)}`}
            label="Providers · initiated connections"
          />
        </div>
      </Panel>
      <Panel title="Demand-supply gap" description="Where supply cannot meet demand today.">
        <div className="grid grid-cols-2 gap-4">
          <Figure
            red
            value={fmt(totalSeekerDemandGap(data.categories))}
            label="Gap in seeker demand · seekers wanting a service with no connection yet"
          />
          <Figure
            red
            value="—"
            label="Gap in provider supply · unavailable: provider capacity is not recorded"
          />
        </div>
      </Panel>
    </div>
  );
}

const LEVEL_OPTIONS: (GapLevelLabel | "All")[] = ["All", "High", "Medium", "Low"];

function GapFilters({
  itemLabel,
  options,
  value,
  onValue,
  level,
  onLevel,
  shown,
  total,
}: {
  itemLabel: string;
  options: string[];
  value: string;
  onValue: (v: string) => void;
  level: string;
  onLevel: (v: string) => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-4">
      <Select value={value} onValueChange={onValue}>
        <SelectTrigger className="h-8 w-[240px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All">All {itemLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={level} onValueChange={onLevel}>
        <SelectTrigger className="h-8 w-[160px] text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LEVEL_OPTIONS.map((l) => (
            <SelectItem key={l} value={l}>
              {l === "All" ? "All gap levels" : `${l} gap`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="ml-auto text-xs text-muted-foreground">
        {shown} of {total} {itemLabel}
      </span>
    </div>
  );
}

function ProvidersGapPanel({ rows }: { rows: ProviderGapRow[] }) {
  const [cat, setCat] = useState("All");
  const [level, setLevel] = useState("All");
  const [open, setOpen] = useState<string | null>(null);

  const enriched = rows.map((r) => {
    const agL = gapLevel(r.actionGap, r.demand);
    return { ...r, agL, actions: recommendedActions("provider", agL, "Low") };
  });

  const filtered = enriched.filter(
    (r) => (cat === "All" || r.category === cat) && (level === "All" || r.agL === level),
  );

  return (
    <Panel
      title="Gaps"
      description="Status on gaps from inaction, and from demand outstripping supply."
      action={
        <Button variant="outline" size="sm">
          Request download
        </Button>
      }
    >
      <GapFilters
        itemLabel="categories"
        options={rows.map((r) => r.category)}
        value={cat}
        onValue={setCat}
        level={level}
        onLevel={setLevel}
        shown={filtered.length}
        total={rows.length}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Service category</TableHead>
              <TableHead className="text-right">Service providers</TableHead>
              <TableHead className="text-right">
                Can service upto
                <span className="block text-[10px] font-normal text-muted-foreground">count of seekers</span>
              </TableHead>
              <TableHead className="text-right">Matching seekers</TableHead>
              <TableHead className="text-right">Connections</TableHead>
              <TableHead className="text-right">Action gap</TableHead>
              <TableHead>Action gap level</TableHead>
              <TableHead className="text-right">Demand-supply gap</TableHead>
              <TableHead>Demand-supply gap level</TableHead>
              <TableHead>Recommended actions</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.category}>
                <TableCell className="font-medium">{r.category}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.providers)}</TableCell>
                <TableCell className="text-right"><Cell value={r.capacity} /></TableCell>
                <TableCell className="text-right"><Cell value={r.matching} /></TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.connections)}</TableCell>
                <TableCell className="text-right"><GapNumber value={r.actionGap} /></TableCell>
                <TableCell><LevelBadge level={r.agL} /></TableCell>
                <TableCell className="text-right"><Cell value={null} red /></TableCell>
                <TableCell><span className="text-muted-foreground">—</span></TableCell>
                <TableCell><Actions items={r.actions} /></TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`View providers in ${r.category}`}
                    onClick={() => setOpen(r.category)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No categories match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryDrilldown
        category={open}
        count={rows.find((r) => r.category === open)?.providers ?? 0}
        noun="service provider"
        onClose={() => setOpen(null)}
      />
    </Panel>
  );
}

function SeekersGapPanel({ rows }: { rows: SeekerGapRow[] }) {
  const [need, setNeed] = useState("All");
  const [level, setLevel] = useState("All");
  const [open, setOpen] = useState<string | null>(null);

  const enriched = rows.map((r) => {
    const agL = gapLevel(r.actionGap, r.demand);
    return { ...r, agL, actions: recommendedActions("seeker", agL, "Low") };
  });

  const filtered = enriched.filter(
    (r) => (need === "All" || r.area === need) && (level === "All" || r.agL === level),
  );

  return (
    <Panel
      title="Gaps"
      description="Status on gaps from inaction, and from demand outstripping supply."
      action={
        <Button variant="outline" size="sm">
          Request download
        </Button>
      }
    >
      <GapFilters
        itemLabel="needs"
        options={rows.map((r) => r.area)}
        value={need}
        onValue={setNeed}
        level={level}
        onLevel={setLevel}
        shown={filtered.length}
        total={rows.length}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Seeker need area</TableHead>
              <TableHead className="text-right">Aggregators</TableHead>
              <TableHead className="text-right">
                Can reach upto
                <span className="block text-[10px] font-normal text-muted-foreground">seekers wanting this</span>
              </TableHead>
              <TableHead className="text-right">Matching providers</TableHead>
              <TableHead className="text-right">Connections</TableHead>
              <TableHead className="text-right">Action gap</TableHead>
              <TableHead>Action gap level</TableHead>
              <TableHead className="text-right">Demand-supply gap</TableHead>
              <TableHead>Demand-supply gap level</TableHead>
              <TableHead>Recommended actions</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.area}>
                <TableCell className="font-medium">{r.area}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.aggregators)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.reach)}</TableCell>
                <TableCell className="text-right"><Cell value={r.matching} /></TableCell>
                <TableCell className="text-right tabular-nums">{fmt(r.connections)}</TableCell>
                <TableCell className="text-right"><GapNumber value={r.actionGap} /></TableCell>
                <TableCell><LevelBadge level={r.agL} /></TableCell>
                <TableCell className="text-right"><Cell value={null} red /></TableCell>
                <TableCell><span className="text-muted-foreground">—</span></TableCell>
                <TableCell><Actions items={r.actions} /></TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    aria-label={`View aggregators for ${r.area}`}
                    onClick={() => setOpen(r.area)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                  No needs match these filters.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <CategoryDrilldown
        category={open}
        count={rows.find((r) => r.area === open)?.aggregators ?? 0}
        noun="aggregator"
        onClose={() => setOpen(null)}
      />
    </Panel>
  );
}

/** The live RPCs publish category totals only — no organisation-level rows yet. */
function CategoryDrilldown({
  category,
  count,
  noun,
  onClose,
}: {
  category: string | null;
  count: number;
  noun: "service provider" | "aggregator";
  onClose: () => void;
}) {
  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{category}</DialogTitle>
          <DialogDescription>
            {count} {noun}
            {count === 1 ? "" : "s"} in this category.
          </DialogDescription>
        </DialogHeader>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Organisation-level detail is not available from the live data yet — only category totals are published.
        </p>
      </DialogContent>
    </Dialog>
  );
}
