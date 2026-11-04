import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { Search, ArrowRight, ExternalLink, ShieldAlert, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { useProgram } from "@/programs/context";
import { useCampaignList, useProgramFilterOptions } from "@/programs/useProgramAggregates";
import { campaignChannelOptions } from "@/lib/campaign-channel";
import { humanizeCampaignType } from "@/lib/campaign-name";
import { CampaignCalendar } from "@/components/campaigns/CampaignCalendar";

import { Panel } from "@/components/Panel";
import { LoadingState, QueryErrorState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { listProgramLiveBatches, getBatchLiveDetail, type LiveBatch } from "@/lib/raya-live.functions";
import { rayaStopBatch } from "@/lib/raya.functions";
import { exportBatchToStaging } from "@/lib/raya-export.functions";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/campaigns")({ component: CampaignsPage, head: () => ({ meta: [
  { title: "Campaigns | Purple Dots" },
  { name: "description", content: "Purple Dots live batches and completed campaign performance." },
  { property: "og:title", content: "Campaigns | Purple Dots" },
  { property: "og:description", content: "Purple Dots live batches and completed campaign performance." },
  { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
] }) });

const RECENT_WINDOW_DAYS = 2;
const PAGE_SIZE = 12;
const RUNNING_STATUSES = new Set(["running","in_progress","in progress","processing","active","live","started"]);

function statusBadgeClass(status: string): string {
  if (RUNNING_STATUSES.has(status)) return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  if (status === "scheduled" || status === "queued" || status === "pending") return "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30";
  if (status === "stopping" || status === "paused") return "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30";
  if (status === "completed" || status === "finished") return "bg-brand-soft text-brand border-brand/30";
  if (status === "stopped" || status === "failed") return "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";
  return "bg-muted text-muted-foreground border-border";
}
function maskPhone(p: string): string { if (!p) return "—"; if (p.length <= 4) return p; return p.slice(0, p.length - 6).replace(/\d/g, "•") + p.slice(-4).padStart(6, "•"); }
function formatSchedule(s: any): string { if (!s) return "—"; const days = Array.isArray(s.days) ? s.days : []; const dayNames = ["","Mon","Tue","Wed","Thu","Fri","Sat","Sun"]; const dayStr = days.map((d: number) => dayNames[d] ?? d).join(", "); return `${dayStr || "—"} · ${s.start_time ?? "?"}–${s.end_time ?? "?"} ${s.timezone ?? ""}`.trim(); }
function useTabVisible() {
  const [visible, setVisible] = useState(typeof document !== "undefined" ? !document.hidden : true);
  useEffect(() => { const h = () => setVisible(!document.hidden); document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h); }, []);
  return visible;
}
function parseDate(s: string | null): Date | null { if (!s) return null; const [y,m,d] = s.split("-").map(Number); if (!y||!m||!d) return null; return new Date(y, m-1, d); }
function formatDate(d: string | null): string { const dt = parseDate(d); return dt ? format(dt, "MMM d, yyyy") : "—"; }
function pct(n: number, d: number): string { if (!d) return "—"; return `${Math.round((n/d)*1000)/10}%`; }

function CampaignsPage() {
  const { config } = useProgram();
  const [openLiveBatch, setOpenLiveBatch] = useState<LiveBatch | null>(null);
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-sm text-muted-foreground mt-1">Live calling batches stream from Raya in real time. Completed campaigns come from the synced sheet — open any one to review its performance.</p>
      </div>
      <LiveBatchesSection program={config.id} onOpen={setOpenLiveBatch} />
      <CompletedCampaigns />
      <LiveBatchDetailDialog batch={openLiveBatch} program={config.id} onClose={() => setOpenLiveBatch(null)} />
    </div>
  );
}

interface CampaignLike { campaignType: string; campaignDate: string | null; region: string | null; totalCalls: number; answered: number; engaged: number; converted: number; }

function CompletedCampaigns() {
  const { config } = useProgram();
  const successLabel = "Converted";
  const [channel, setChannel] = useState<string>("all");
  const { data: options } = useProgramFilterOptions(config);
  const channelOptions = campaignChannelOptions(options?.channels);
  const { data, isLoading, error, refetch } = useCampaignList(config, { channel });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "calendar">("calendar");
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("campaigns_view") : null;
    if (saved === "list" || saved === "calendar") setView(saved);
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("campaigns_view", view);
  }, [view]);
  useEffect(() => { setPage(1); }, [search]);

  const { recent, all } = useMemo(() => {
    const items = (data ?? []).slice();
    const today = new Date(); today.setHours(0,0,0,0);
    const cutoff = today.getTime() - RECENT_WINDOW_DAYS * 86400000;
    items.sort((a,b) => (b.campaignDate ?? "").localeCompare(a.campaignDate ?? ""));
    const q = search.trim().toLowerCase();
    const filtered = q ? items.filter((c) => humanizeCampaignType(c.campaignType).toLowerCase().includes(q) || c.campaignType.toLowerCase().includes(q)) : items;
    const recent = filtered.filter((c) => { const dt = parseDate(c.campaignDate); return dt ? dt.getTime() >= cutoff : false; });
    return { recent, all: filtered };
  }, [data, search]);
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageRows = all.slice((clampedPage - 1) * PAGE_SIZE, clampedPage * PAGE_SIZE);
  if (error) return <QueryErrorState error={{ code: "CAMPAIGN_ACCESS", message: error.message }} onRetry={() => void refetch()} />;
  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Completed campaigns</h2>
          <p className="text-xs text-muted-foreground mt-1">Drill into one campaign and compare it to its region's average.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
            {([
              { value: "list" as const, label: "List" },
              { value: "calendar" as const, label: "Calendar" },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setView(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded transition-colors",
                  view === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {(options?.channels.length ?? 0) >= 2 && (

            <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
              {channelOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChannel(opt.value)}
                  className={cn(
                    "px-3 py-1.5 rounded transition-colors",
                    channel === opt.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          <div className="relative w-72 max-w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by campaign name" className="pl-8 h-9" />
          </div>
        </div>
      </div>
      {isLoading && !data ? <LoadingState /> : view === "calendar" ? (
        <CampaignCalendar campaigns={all} channel={channel} />
      ) : (
        <>
          {recent.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest · review pending</h3>
              <div className="grid gap-3 md:grid-cols-2">{recent.map((c) => <CampaignCard key={`${c.campaignType}__${c.campaignDate ?? "nd"}`} campaign={c} successLabel={successLabel} channel={channel} highlighted />)}</div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">All campaigns</h3>
              {all.length > PAGE_SIZE && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={clampedPage <= 1} className="inline-flex items-center gap-0.5 rounded-md border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted"><ChevronLeft className="h-3.5 w-3.5" /> Prev</button>
                  <span className="tabular-nums">Page {clampedPage} of {pageCount}</span>
                  <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={clampedPage >= pageCount} className="inline-flex items-center gap-0.5 rounded-md border border-border px-2 py-1 disabled:opacity-40 hover:bg-muted">Next <ChevronRight className="h-3.5 w-3.5" /></button>
                </div>
              )}
            </div>
            <Panel>
              <ul className="divide-y divide-border">
                {pageRows.length === 0 ? <li className="py-6 text-center text-sm text-muted-foreground">No campaigns match your search.</li> : pageRows.map((c) => <CampaignRow key={`${c.campaignType}__${c.campaignDate ?? "nd"}`} campaign={c} successLabel={successLabel} channel={channel} />)}
              </ul>
            </Panel>
            {all.length > 0 && <p className="text-[11px] text-muted-foreground text-right tabular-nums">{all.length} campaign{all.length === 1 ? "" : "s"}</p>}
          </div>
        </>
      )}
    </section>
  );
}

function CampaignCard({ campaign, successLabel, channel, highlighted }: { campaign: CampaignLike; successLabel: string; channel: string; highlighted?: boolean }) {
  return (
    <Link to="/campaigns/$campaign" params={{ campaign: campaign.campaignType }} search={{ date: campaign.campaignDate ?? undefined, channel: channel === "all" ? undefined : channel }} className={cn("group block rounded-xl border bg-card p-5 transition-colors hover:bg-muted/40", highlighted ? "border-primary border-2 shadow-sm" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold truncate">{humanizeCampaignType(campaign.campaignType)}</h3>{highlighted && <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">New</span>}</div>
          <div className="mt-1 text-xs text-muted-foreground">{formatDate(campaign.campaignDate)}{campaign.region ? ` · ${campaign.region}` : ""}</div>
        </div>
        <span className={cn(buttonVariants({ size: "sm" }), "shrink-0 gap-1.5 pointer-events-none")}>Review <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-xs">
        <Metric label="Calls" value={campaign.totalCalls.toLocaleString()} />
        <Metric label="Answered" value={pct(campaign.answered, campaign.totalCalls)} />
        <Metric label="Engaged" value={campaign.engaged.toLocaleString()} />
        <Metric label={successLabel} value={campaign.converted.toLocaleString()} />
      </div>
    </Link>
  );
}
function CampaignRow({ campaign, successLabel, channel }: { campaign: CampaignLike; successLabel: string; channel: string }) {
  return (
    <li>
      <Link to="/campaigns/$campaign" params={{ campaign: campaign.campaignType }} search={{ date: campaign.campaignDate ?? undefined, channel: channel === "all" ? undefined : channel }} className="group flex items-center gap-4 py-3 px-1 hover:bg-muted/40 rounded-md transition-colors">

        <div className="min-w-0 flex-1"><div className="font-medium truncate">{humanizeCampaignType(campaign.campaignType)}</div><div className="text-xs text-muted-foreground mt-0.5">{formatDate(campaign.campaignDate)}{campaign.region ? ` · ${campaign.region}` : ""}</div></div>
        <div className="hidden sm:grid grid-cols-4 gap-6 text-xs text-right">
          <Metric label="Calls" value={campaign.totalCalls.toLocaleString()} align="right" />
          <Metric label="Answered" value={pct(campaign.answered, campaign.totalCalls)} align="right" />
          <Metric label="Engaged" value={campaign.engaged.toLocaleString()} align="right" />
          <Metric label={successLabel} value={campaign.converted.toLocaleString()} align="right" />
        </div>
        <span className={cn(buttonVariants({ size: "sm" }), "ml-2 shrink-0 gap-1.5 pointer-events-none")}>Review <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" /></span>
      </Link>
    </li>
  );
}
function Metric({ label, value, align }: { label: string; value: string; align?: "right" }) {
  return (<div className={align === "right" ? "text-right" : ""}><div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div><div className="text-sm font-semibold tabular-nums">{value}</div></div>);
}

function LiveBatchesSection({ program, onOpen }: { program: "seekers" | "providers"; onOpen: (b: LiveBatch) => void }) {
  const listFn = useServerFn(listProgramLiveBatches);
  const visible = useTabVisible();
  const query = useQuery({ queryKey: ["live-batches", program], queryFn: () => listFn({ data: { program } }), staleTime: 20_000, refetchInterval: visible ? 30_000 : false, refetchOnWindowFocus: false });
  const batches = query.data?.ok ? query.data.batches : [];
  const error = query.data && !query.data.ok ? query.data.error : null;
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");

  const { active, inactive } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? batches.filter((b) => b.batchName.toLowerCase().includes(q) || b.agentName.toLowerCase().includes(q)) : batches;
    const active: LiveBatch[] = [];
    const inactive: LiveBatch[] = [];
    for (const b of filtered) {
      const isActive = RUNNING_STATUSES.has(b.status) || b.status === "scheduled" || b.status === "queued" || b.status === "pending" || b.status === "stopping" || b.status === "paused" || b.status === "not started" || b.status === "not_started";
      (isActive ? active : inactive).push(b);
    }
    return { active, inactive };
  }, [batches, search]);

  const runningCount = active.filter((b) => RUNNING_STATUSES.has(b.status)).length;

  return (
    <Panel
      title="Live & scheduled"
      description="Reads directly from Raya across this program's agents."
      action={
        batches.length > 0 ? (
          <div className="flex items-center gap-2">
            {runningCount > 0 && (
              <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                <span className="relative mr-1.5 inline-flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
                {runningCount} live
              </Badge>
            )}
            <div className="relative w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search batches" className="pl-8 h-8 text-xs" />
            </div>
          </div>
        ) : null
      }
    >
      {query.isLoading && !query.data ? (
        <p className="text-sm text-muted-foreground">Loading batches…</p>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load: {error}</p>
      ) : batches.length === 0 ? (
        <p className="text-sm text-muted-foreground">No batches yet for this program. Launch one from the Launch wizard.</p>
      ) : (
        <div className="space-y-5">
          {active.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Active · {active.length}</h3>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{active.map((b) => <LiveBatchCard key={b.batchId} batch={b} onOpen={() => onOpen(b)} />)}</div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active or scheduled batches right now.</p>
          )}
          {inactive.length > 0 && (
            <div className="space-y-2">
              <button onClick={() => setShowInactive((v) => !v)} className="flex w-full items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted">
                <span>Inactive / completed · {inactive.length}</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", showInactive && "rotate-180")} />
              </button>
              {showInactive && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{inactive.map((b) => <LiveBatchCard key={b.batchId} batch={b} onOpen={() => onOpen(b)} compact />)}</div>}
            </div>
          )}
          {active.length === 0 && inactive.length === 0 && search && (
            <p className="text-sm text-muted-foreground">No batches match "{search}".</p>
          )}
        </div>
      )}
    </Panel>
  );
}
function LiveBatchCard({ batch, onOpen, compact }: { batch: LiveBatch; onOpen: () => void; compact?: boolean }) {
  const isRunning = RUNNING_STATUSES.has(batch.status);
  const p = batch.total > 0 ? Math.round((batch.dialed / batch.total) * 100) : 0;
  return (
    <button onClick={onOpen} className={cn("group relative rounded-xl border bg-card text-left transition hover:border-brand/50 hover:shadow-sm", compact ? "p-3" : "p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex items-center gap-2">{isRunning && <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>}<p className="truncate text-sm font-semibold text-foreground">{batch.batchName}</p></div><p className="mt-0.5 truncate text-xs text-muted-foreground">{batch.agentName}</p></div>
        <Badge variant="outline" className={cn("shrink-0", statusBadgeClass(batch.status))}>{isRunning ? "● Live" : batch.status || "—"}</Badge>
      </div>
      <div className={cn(compact ? "mt-2" : "mt-3", "space-y-1")}><Progress value={p} className="h-1.5" /><p className="text-[11px] text-muted-foreground tabular-nums">{batch.dialed} / {batch.total || "?"} dialed · {batch.pickedUp} picked up</p></div>
    </button>
  );
}
function StatusTile({ label, value, accent }: { label: string; value: number; accent: "brand"|"amber"|"rose"|"muted" }) {
  const cls = accent === "brand" ? "text-brand" : accent === "amber" ? "text-amber-600 dark:text-amber-400" : accent === "rose" ? "text-rose-600 dark:text-rose-400" : "text-foreground";
  return (<div className="rounded-lg border bg-card p-3"><p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</p></div>);
}
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (<div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className={`truncate text-foreground ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span></div>);
}
function LiveBatchDetailDialog({ batch, program, onClose }: { batch: LiveBatch | null; program: "seekers"|"providers"; onClose: () => void }) {
  const detailFn = useServerFn(getBatchLiveDetail);
  const stopFn = useServerFn(rayaStopBatch);
  const exportFn = useServerFn(exportBatchToStaging);
  const qc = useQueryClient();
  const visible = useTabVisible();
  const open = !!batch;
  const [confirmStop, setConfirmStop] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [now, setNow] = useState<number>(Date.now());
  const exportMut = useMutation({ mutationFn: () => exportFn({ data: { program, batchId: batch!.batchId, batchName: batch!.batchName, agentName: batch!.agentName } }), onSuccess: (r) => toast.success(`Appended ${r.appended} row${r.appended === 1 ? "" : "s"}; updated ${r.updated ?? 0} existing row${(r.updated ?? 0) === 1 ? "" : "s"} in staging.`, { action: { label: "Open sheet", onClick: () => window.open(r.sheetUrl, "_blank") } }), onError: (e) => toast.error(e instanceof Error ? e.message : "Export failed.") });
  const query = useQuery({ enabled: open, queryKey: ["live-batch-detail", batch?.batchId], queryFn: () => detailFn({ data: { batchId: batch!.batchId, agentName: batch!.agentName, batchName: batch!.batchName } }), refetchInterval: open && visible ? 12_000 : false, refetchOnWindowFocus: false, staleTime: 8_000 });
  useEffect(() => { if (query.dataUpdatedAt) setUpdatedAt(query.dataUpdatedAt); }, [query.dataUpdatedAt]);
  useEffect(() => { if (!open) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [open]);
  const stopMut = useMutation({ mutationFn: () => stopFn({ data: { batchId: batch!.batchId } }), onSuccess: () => { toast.success("Stop requested."); qc.invalidateQueries({ queryKey: ["live-batches"] }); qc.invalidateQueries({ queryKey: ["live-batch-detail", batch?.batchId] }); setConfirmStop(false); }, onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to stop batch.") });
  const d = query.data;
  const total = d?.total ?? batch?.total ?? 0;
  const dialed = d?.dialed ?? batch?.dialed ?? 0;
  const p = total > 0 ? Math.round((dialed / total) * 100) : 0;
  const agoSec = Math.max(0, Math.floor((now - updatedAt) / 1000));
  const isRunning = d ? RUNNING_STATUSES.has(d.status) : batch ? RUNNING_STATUSES.has(batch.status) : false;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle className="flex items-center gap-3"><span>{batch?.batchName || "Batch"}</span>{batch && <Badge variant="outline" className={statusBadgeClass(d?.status || batch.status)}>{isRunning ? "● Live" : d?.status || batch.status || "—"}</Badge>}<span className="ml-auto text-[11px] font-normal text-muted-foreground">{query.isFetching ? "Refreshing…" : `Updated ${agoSec}s ago`}</span></DialogTitle></DialogHeader>
        {!batch ? null : (
          <div className="space-y-5">
            <div><div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground tabular-nums"><span>{dialed} / {total || "?"} dialed</span><span>{p}%</span></div><Progress value={p} className="h-2" /></div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6"><StatusTile label="Pending" value={d?.pending ?? 0} accent="muted" /><StatusTile label="Calling" value={d?.inProgress ?? 0} accent="amber" /><StatusTile label="Picked up" value={d?.pickedUp ?? 0} accent="brand" /><StatusTile label="Completed" value={d?.completed ?? 0} accent="brand" /><StatusTile label="Unanswered" value={d?.unanswered ?? 0} accent="muted" /><StatusTile label="Failed" value={d?.failed ?? 0} accent="rose" /></div>
            <div className="grid gap-2 rounded-lg border bg-muted/20 p-3 text-xs sm:grid-cols-2"><Meta label="Agent" value={d?.agentName || batch.agentName} /><Meta label="Schedule" value={formatSchedule(d?.schedule ?? batch.schedule)} /><Meta label="Concurrency" value={String(d?.concurrency ?? batch.concurrency ?? "—")} /><Meta label="Max retries" value={String(d?.maxRetries ?? batch.maxRetries ?? "—")} /><Meta label="Batch ID" value={batch.batchId} mono /><Meta label="Created" value={d?.createdAt ? new Date(d.createdAt).toLocaleString() : batch.createdAt ? new Date(batch.createdAt).toLocaleString() : "—"} /></div>
            <div><h4 className="mb-2 text-sm font-semibold">Recent calls</h4>{!d || d.recent.length === 0 ? <p className="text-xs text-muted-foreground">No recent calls yet.</p> : (<div className="overflow-hidden rounded-md border"><Table><TableHeader><TableRow><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Duration</TableHead></TableRow></TableHeader><TableBody>{d.recent.map((c, i) => <TableRow key={`${c.phone}-${i}`}><TableCell className="font-mono text-xs">{maskPhone(c.phone)}</TableCell><TableCell className="text-xs">{c.status}</TableCell><TableCell className="text-right tabular-nums text-xs">{c.duration > 0 ? `${c.duration}s` : "—"}</TableCell></TableRow>)}</TableBody></Table></div>)}</div>
          </div>
        )}
        {batch && (
          <div className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
            <span className="inline-flex items-center gap-1.5"><ShieldAlert className="h-3.5 w-3.5 shrink-0" /> Writing to staging sheet for QC — master sheets are not modified.</span>
            <div className="flex items-center gap-2">{exportMut.data?.sheetUrl && <a href={exportMut.data.sheetUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand underline">open staging <ExternalLink className="h-3 w-3" /></a>}<Button size="sm" variant="outline" disabled={exportMut.isPending} onClick={() => exportMut.mutate()}>{exportMut.isPending ? "Exporting…" : "Export results to staging"}</Button></div>
          </div>
        )}
        <DialogFooter className="mt-4 flex items-center justify-between gap-2 sm:justify-between">
          <p className="text-[11px] text-muted-foreground">Auto-refresh every 12s while tab is visible.</p>
          {isRunning && (confirmStop ? (<div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">Stop this campaign?</span><Button size="sm" variant="ghost" onClick={() => setConfirmStop(false)}>Cancel</Button><Button size="sm" variant="destructive" disabled={stopMut.isPending} onClick={() => stopMut.mutate()}>{stopMut.isPending ? "Stopping…" : "Confirm stop"}</Button></div>) : <Button size="sm" variant="destructive" onClick={() => setConfirmStop(true)}>Stop campaign</Button>)}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
