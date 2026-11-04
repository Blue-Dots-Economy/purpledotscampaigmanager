import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Layers } from "lucide-react";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { useReviewCalls, useReviewMap } from "@/programs/useProgramAggregates";
import { buildStatusMap, getReviewKey, type ReviewCall } from "@/lib/review-ui";
import { CallCard } from "@/components/review/CallCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/review")({
  validateSearch: (s: Record<string, unknown>) => ({ prefill: typeof s.prefill === "string" ? s.prefill : undefined }),
  component: ReviewHub,
  head: () => ({ meta: [
    { title: "Call Review | Purple Dots" },
    { name: "description", content: "Review Purple Dots seeker call recordings, outcomes and transcripts." },
    { property: "og:title", content: "Call Review | Purple Dots" },
    { property: "og:description", content: "Review Purple Dots seeker call recordings, outcomes and transcripts." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

const OUTCOME_OPTIONS = ["All", "Completed", "Early Disconnect"];
const DURATION_OPTIONS = ["All", "< 30s", "30s – 1m", "1 – 2m", "2 – 5m", "> 5m"];
const INTENT_OPTIONS = ["All", "High Intent Score", "Low Intent Score"];
const CHANNEL_OPTIONS = ["All", "Outbound", "Inbound"];
const FILTER_KEY = "review_filters_v1";
const BULK_KEY = "bulk_review_queue";

type Tab = "all" | "pending" | "reviewed";
interface Filters {
  day: string; date: string[]; campaign: string; lang: string; city: string;
  outcome: string; duration: string; intent: string; dropReason: string;
  channel: string; tab: Tab; search: string;
}
const DEFAULT_FILTERS: Filters = {
  day: "All", date: [], campaign: "All", lang: "All", city: "All",
  outcome: "All", duration: "All", intent: "All", dropReason: "All",
  channel: "All", tab: "pending", search: "",
};

function parseIst(s: string): number {
  if (!s) return 0;
  const m = String(s).replace(/\s*IST\s*$/i, "").trim();
  const d = new Date(m.includes("T") ? m + "+05:30" : m.replace(" ", "T") + "+05:30");
  const t = d.getTime();
  return isFinite(t) ? t : 0;
}
function dayNum(s: string): number {
  const m = String(s).match(/(\d+)\s*$/);
  return m ? Number(m[1]) : 0;
}
function distinct(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((x) => x && x.trim())));
}
function durationBucket(sec: number, bucket: string): boolean {
  if (bucket === "All") return true;
  if (bucket === "< 30s") return sec < 30;
  if (bucket === "30s – 1m") return sec >= 30 && sec < 60;
  if (bucket === "1 – 2m") return sec >= 60 && sec < 120;
  if (bucket === "2 – 5m") return sec >= 120 && sec < 300;
  if (bucket === "> 5m") return sec >= 300;
  return true;
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-3xl font-semibold", tone)}>{value}</div>
    </div>
  );
}

function ReviewHub() {
  const { programId } = useProgram();
  const dataset = programId;
  const { session } = useAuth();
  const email = session?.email;
  const navigate = useNavigate();

  const callsQuery = useReviewCalls(dataset);
  const mapQuery = useReviewMap();
  const calls: ReviewCall[] | null = callsQuery.data ?? null;

  const statusMap = useMemo(() => {
    if (!mapQuery.data) return null;
    return buildStatusMap(mapQuery.data, email);
  }, [mapQuery.data, email]);

  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const [filters, setFilters] = useState<Filters>(() => {
    if (typeof window === "undefined") return DEFAULT_FILTERS;
    try {
      const raw = window.sessionStorage.getItem(FILTER_KEY);
      if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return DEFAULT_FILTERS;
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(FILTER_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);
  useEffect(() => { setPage(1); }, [filters]);
  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    try {
      const ids = window.sessionStorage.getItem("review_prefill_ids");
      if (ids) {
        setFilters((f) => ({ ...f, search: ids, tab: "all" }));
        window.sessionStorage.removeItem("review_prefill_ids");
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const options = useMemo(() => {
    const list = calls ?? [];
    const days = distinct(list.map((c) => c.campaign_day)).sort((a, b) => dayNum(b) - dayNum(a));
    const dates = distinct(list.map((c) => c.campaign_date)).sort();
    const campaigns = distinct(list.map((c) => c.campaign_type)).sort();
    const langs = distinct(list.map((c) => c.language)).sort();
    const cities = distinct(list.map((c) => c.city_campaign)).sort();
    const drops = distinct(list.map((c) => c.drop_reason)).sort();
    return { days, dates, campaigns, langs, cities, drops };
  }, [calls]);

  const baseSet = useMemo(() => {
    return (calls ?? []).filter((c) => c.call_outcome === "Completed" || c.call_outcome === "Early Disconnect");
  }, [calls]);

  const searchTokens = useMemo(() =>
    filters.search.toLowerCase().split(/[\s,;\n\r\t]+/).filter(Boolean)
  , [filters.search]);

  const filtered = useMemo(() => {
    const rows = baseSet.filter((c) => {
      if (filters.day !== "All" && c.campaign_day !== filters.day) return false;
      if (filters.date.length > 0 && !filters.date.includes(c.campaign_date)) return false;
      if (filters.campaign !== "All" && c.campaign_type !== filters.campaign) return false;
      if (filters.lang !== "All" && c.language !== filters.lang) return false;
      if (filters.city !== "All" && c.city_campaign !== filters.city) return false;
      if (filters.outcome !== "All" && c.call_outcome !== filters.outcome) return false;
      if (filters.dropReason !== "All" && c.drop_reason !== filters.dropReason) return false;
      if (dataset === "seekers" && filters.channel !== "All" && String(c.channel || "outbound").toLowerCase() !== filters.channel.toLowerCase()) return false;
      const sec = Number(c.call_duration_seconds) || 0;
      if (!durationBucket(sec, filters.duration)) return false;
      if (filters.intent !== "All") {
        const score = Number(c.intent_score);
        if (!isFinite(score)) return false;
        if (filters.intent === "High Intent Score" && score < 5) return false;
        if (filters.intent === "Low Intent Score" && score >= 5) return false;
      }
      if (searchTokens.length > 0) {
        const cid = String(c.call_id || "").toLowerCase();
        const jid = String(c.job_id || "").toLowerCase();
        if (!searchTokens.some((t) => cid.includes(t) || jid.includes(t))) return false;
        return true;
      }
      if (filters.tab !== "all") {
        if (!statusMap) return false;
        const st = statusMap.get(getReviewKey(c));
        const reviewed = !!st?.is_reviewed;
        if (filters.tab === "reviewed" && !reviewed) return false;
        if (filters.tab === "pending" && reviewed) return false;
      }
      return true;
    });
    rows.sort((a, b) => {
      const dd = dayNum(b.campaign_day) - dayNum(a.campaign_day);
      if (dd) return dd;
      const du = (Number(b.call_duration_seconds) || 0) - (Number(a.call_duration_seconds) || 0);
      if (du) return du;
      return parseIst(b.call_datetime_ist) - parseIst(a.call_datetime_ist);
    });
    return rows;
  }, [baseSet, filters, searchTokens, statusMap]);

  const stats = useMemo(() => {
    let reviewed = 0;
    if (statusMap) {
      for (const c of baseSet) {
        if (statusMap.get(getReviewKey(c))?.is_reviewed) reviewed++;
      }
    }
    return { total: baseSet.length, reviewed, pending: baseSet.length - reviewed };
  }, [baseSet, statusMap]);

  const startBulk = () => {
    const pending = filtered
      .filter((c) => !statusMap?.get(getReviewKey(c))?.is_reviewed)
      .slice()
      .sort((a, b) => {
        const dt = parseIst(b.call_datetime_ist) - parseIst(a.call_datetime_ist);
        if (dt) return dt;
        return (Number(b.call_duration_seconds) || 0) - (Number(a.call_duration_seconds) || 0);
      });
    const ids = pending.map((c) => String(c.call_id || c.job_id || "")).filter(Boolean);
    if (ids.length === 0) return;
    try { window.sessionStorage.setItem(BULK_KEY, JSON.stringify(ids)); } catch { /* ignore */ }
    navigate({ to: "/review/$callId", params: { callId: ids[0] }, search: { bulk: "1" } });
  };

  if (calls === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const SelectFilter = ({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: string[]; placeholder: string }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full">
        <span className="truncate text-sm">
          <span className="text-muted-foreground">{placeholder}: </span>
          <span className="font-medium text-foreground">{value}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Review hub</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {email ? <>Reviewing as <span className="font-medium text-foreground">{email}</span></> : "Not signed in"}
            {" · "}<span className="uppercase">{dataset}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total Call Recordings" value={stats.total} />
        <StatCard label="Pending" value={stats.pending} tone="text-amber-600" />
        <StatCard label="Reviewed" value={stats.reviewed} tone="text-emerald-600" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search by Call ID or Job ID — paste multiple separated by spaces, commas, or new lines"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {dataset === "seekers" && <SelectFilter value={filters.channel} onChange={(v) => set("channel", v)} options={CHANNEL_OPTIONS} placeholder="Channel" />}
          <SelectFilter value={filters.day} onChange={(v) => set("day", v)} options={["All", ...options.days]} placeholder="Day" />
          <SelectFilter value={filters.campaign} onChange={(v) => set("campaign", v)} options={["All", ...options.campaigns]} placeholder="Campaign" />
          <SelectFilter value={filters.lang} onChange={(v) => set("lang", v)} options={["All", ...options.langs]} placeholder="Language" />
          <SelectFilter value={filters.city} onChange={(v) => set("city", v)} options={["All", ...options.cities]} placeholder="City" />
          <SelectFilter value={filters.outcome} onChange={(v) => set("outcome", v)} options={OUTCOME_OPTIONS} placeholder="Outcome" />
          <SelectFilter value={filters.duration} onChange={(v) => set("duration", v)} options={DURATION_OPTIONS} placeholder="Duration" />
          <SelectFilter value={filters.intent} onChange={(v) => set("intent", v)} options={INTENT_OPTIONS} placeholder="Intent" />
          <SelectFilter value={filters.dropReason} onChange={(v) => set("dropReason", v)} options={["All", ...options.drops]} placeholder="Drop reason" />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-lg bg-muted p-1">
            {(["all", "pending", "reviewed"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set("tab", t)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md capitalize transition",
                  filters.tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t === "pending" ? "Pending Review" : t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={startBulk}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Layers className="h-4 w-4" />
            Bulk Review
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 py-12 text-center text-sm text-muted-foreground">
            No calls match these filters.
          </div>
        ) : (
          <>
            {filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((c) => (
              <CallCard
                key={String(c.call_id || c.job_id)}
                call={c}
                reviewStatus={statusMap?.get(getReviewKey(c))}
              />
            ))}
            {filtered.length > PAGE_SIZE && (() => {
              const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
              const current = Math.min(page, totalPages);
              const start = (current - 1) * PAGE_SIZE + 1;
              const end = Math.min(current * PAGE_SIZE, filtered.length);
              return (
                <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
                  <div className="text-xs text-muted-foreground">
                    Showing <span className="font-medium text-foreground">{start}–{end}</span> of{" "}
                    <span className="font-medium text-foreground">{filtered.length}</span>
                  </div>
                  <div className="inline-flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={current <= 1}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="px-2 text-xs text-muted-foreground">
                      Page <span className="font-medium text-foreground">{current}</span> of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={current >= totalPages}
                      className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
