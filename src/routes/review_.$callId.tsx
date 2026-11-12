import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, SkipForward, Star, X, ChevronDown, Check, AlertTriangle } from "lucide-react";
import { useProgram } from "@/programs/context";
import { useAuth } from "@/auth/context";
import { useReviewCall, useExistingReviews } from "@/programs/useProgramAggregates";
import { fetchCallDetail, submitReview } from "@/lib/review.functions";
import { AudioPlayer } from "@/components/review/AudioPlayer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { playSwoosh } from "@/lib/sfx";

export const Route = createFileRoute("/review_/$callId")({
  validateSearch: (s: Record<string, unknown>) => ({ bulk: typeof s.bulk === "string" ? s.bulk : undefined }),
  component: TranscriptReview,
  head: () => ({ meta: [
    { title: "Transcript Review | Purple Dots" },
    { name: "description", content: "Inspect a Purple Dots seeker call transcript and review its conversation quality." },
    { property: "og:title", content: "Transcript Review | Purple Dots" },
    { property: "og:description", content: "Inspect a Purple Dots seeker call transcript and review its conversation quality." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

type TurnFlag = { turn: number; note: string };
type Turn = { speaker: string; content: string; no_audio?: boolean };

const ISSUE_OPTIONS = [
  { id: "Latency Issue", color: "bg-red-500", desc: "Bot paused too long between responses" },
  { id: "Flow Broken", color: "bg-orange-500", desc: "Conversation jumped phases or skipped steps" },
  { id: "Data Not Capturing", color: "bg-yellow-500", desc: "Bot failed to record what employer said" },
  { id: "Transcript Issue", color: "bg-purple-500", desc: "Speech-to-text errors, wrong language or garbled text" },
  { id: "Hallucinating", color: "bg-blue-500", desc: "Bot made up information not said by employer" },
  { id: "Wrong Language", color: "bg-gray-800", desc: "Bot spoke in wrong language" },
  { id: "API Failing", color: "bg-pink-500", desc: "API errors or failures during the call" },
  { id: "Irrelevant Job Shared", color: "bg-indigo-500", desc: "Job recommendation didn't match the seeker", datasets: ["seekers"] as string[] },
  { id: "Weak Introduction", color: "bg-violet-500", desc: "Introduction needs to be better" },
  { id: "No Issues", color: "bg-emerald-500", desc: "Everything looked correct" },
];

function normaliseTranscript(raw: unknown): Turn[] {
  if (!raw) return [];
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.startsWith("[")) { try { return normaliseTranscript(JSON.parse(s)); } catch { return []; } }
    const turns: Turn[] = [];
    for (const line of s.split(/\r?\n/)) {
      const m = line.match(/^\s*(Bot|Employer|Assistant|User|Speaker\s*\d+)\s*[:\-]\s*(.*)$/i);
      if (m) turns.push({ speaker: m[1], content: m[2] });
      else if (line.trim() && turns.length) turns[turns.length - 1].content += " " + line.trim();
    }
    return turns;
  }
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[]).map((t) => ({
    speaker: String(t.speaker ?? t.role ?? ""),
    content: String(t.content ?? t.text ?? t.message ?? ""),
    no_audio: t.no_audio === true || /no audio/i.test(String(t.content ?? "")),
  }));
}
function normaliseSpeaker(s: string): "Bot" | "Employer" {
  const x = s.toLowerCase();
  if (x.includes("bot") || x.includes("assistant") || x.includes("speaker 1") || x === "1") return "Bot";
  return "Employer";
}

const ENCOURAGERS = [
  "Nice work!",
  "Another one down!",
  "On a roll!",
  "Great catch!",
  "Keep it going!",
  "Smooth — next!",
];
function praise(count: number, hasNext: boolean, total: number): string {
  if (!hasNext) return `Batch complete — you reviewed all ${total}. Incredible work.`;
  if (count > 0 && count % 25 === 0) return `${count} reviews this session — you're crushing it!`;
  if (count > 0 && count % 10 === 0) return `${count} in a row — you're on fire!`;
  return ENCOURAGERS[count % ENCOURAGERS.length];
}


function TranscriptReview() {
  const { callId } = Route.useParams();
  const { bulk } = Route.useSearch();
  const bulkMode = bulk === "1";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { programId } = useProgram();
  const dataset = programId;
  const { session } = useAuth();
  const reviewerEmail = (session?.email || "").toLowerCase();
  const isAdmin = reviewerEmail === "admin@bluedots.com";

  const callQuery = useReviewCall(dataset, callId);
  const call = callQuery.data;

  const detailFn = useServerFn(fetchCallDetail);
  const detailQuery = useQuery({
    queryKey: ["call-detail", dataset, callId],
    queryFn: () => detailFn({ data: { dataset, callId } }),
    staleTime: 5 * 60_000,
    enabled: !!callId,
  });
  const transcript = useMemo(() => normaliseTranscript(detailQuery.data?.call_transcript), [detailQuery.data]);
  const recordingUrl = detailQuery.data?.call_recording_url;

  const existing = useExistingReviews(call?.call_id || callId, call?.job_id || null);
  const existingReviews = existing.data ?? [];

  const [issues, setIssues] = useState<string[]>([]);
  const [flagTurn, setFlagTurn] = useState("");
  const [flagNote, setFlagNote] = useState("");
  const [flags, setFlags] = useState<TurnFlag[]>([]);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  const [sessionReviewed, setSessionReviewed] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try { return Number(window.sessionStorage.getItem("reviews_done_session")) || 0; } catch { return 0; }
  });
  const [celebrate, setCelebrate] = useState<null | "normal" | "milestone">(null);
  const turnRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => {
    setIssues([]); setFlags([]); setFlagTurn(""); setFlagNote(""); setNotes(""); setRating(0);
    setCelebrate(null); setSubmitting(false);
    window.scrollTo(0, 0);
  }, [callId]);

  // Prefill my previous review if present
  useEffect(() => {
    const mine = existingReviews.find((r) => (r.reviewer_email || "").toLowerCase() === reviewerEmail);
    if (!mine) return;
    if (mine.quantitative_issues) setIssues(mine.quantitative_issues.split(",").map((s) => s.trim()).filter(Boolean));
    if (mine.turn_flags) { try { const p = JSON.parse(mine.turn_flags); if (Array.isArray(p)) setFlags(p); } catch { /* ignore */ } }
    setNotes(mine.reviewer_notes || "");
    setRating(mine.overall_rating ?? 0);
  }, [existingReviews, reviewerEmail]);

  const flaggedSet = useMemo(() => new Set(flags.map((f) => f.turn)), [flags]);

  function toggleIssue(id: string) {
    setIssues((prev) => {
      if (id === "No Issues") return prev.includes(id) ? [] : ["No Issues"];
      const next = prev.filter((x) => x !== "No Issues");
      return next.includes(id) ? next.filter((x) => x !== id) : [...next, id];
    });
  }
  function addFlag() {
    const n = parseInt(flagTurn, 10);
    if (!n || !flagNote.trim()) { toast.error("Pick a turn and write a note."); return; }
    setFlags((p) => [...p, { turn: n, note: flagNote.trim() }]);
    setFlagTurn(""); setFlagNote("");
  }
  function scrollToTurn(n: number) { turnRefs.current[n]?.scrollIntoView({ behavior: "smooth", block: "center" }); }

  const submitFn = useServerFn(submitReview);

  async function submit() {
    if (!call) return;
    if (isAdmin) { toast.error("The shared admin account can't submit reviews.", { description: "Sign in with your own email to review." }); return; }
    if (issues.length === 0) { toast.error("Select at least one issue (or 'No Issues')."); return; }
    if (rating === 0) { toast.error("Give an overall rating."); return; }
    if (!reviewerEmail) { toast.error("Session expired. Please sign in again."); return; }
    setSubmitting(true);
    const callIdStr = call.call_id && String(call.call_id).trim() ? String(call.call_id) : null;
    const jobIdStr = call.job_id && String(call.job_id).trim() ? String(call.job_id) : null;
    const callAny = call as unknown as Record<string, string | undefined>;
    const review = {
      job_id: jobIdStr ?? callIdStr ?? "unknown",
      call_id: callIdStr ?? jobIdStr ?? "unknown",
      reviewer_email: reviewerEmail,
      reviewer_name: reviewerEmail,
      campaign_day: call.campaign_day, campaign_type: call.campaign_type, language: call.language,
      city_campaign: call.city_campaign, company_name: call.company_name,
      contact_phone: callAny.contact_phone ?? null,
      call_outcome: call.call_outcome, job_status_in_master: call.job_status,
      reviewer_notes: notes, quantitative_issues: issues.join(", "),
      turn_flags: JSON.stringify(flags), overall_rating: rating,
      review_type: "transcript", dataset,
    };
    try {
      await submitFn({ data: { review } });
      qc.invalidateQueries({ queryKey: ["review-map"] });
      qc.invalidateQueries({ queryKey: ["existing-reviews", callIdStr, jobIdStr] });
      const newCount = sessionReviewed + 1;
      setSessionReviewed(newCount);
      try { window.sessionStorage.setItem("reviews_done_session", String(newCount)); } catch { /* ignore */ }
      playSwoosh();
      if (bulkMode) {
        const raw = sessionStorage.getItem("bulk_review_queue");
        const queue: string[] = raw ? JSON.parse(raw) : [];
        const idx = queue.indexOf(callId);
        const next = idx >= 0 && idx < queue.length - 1 ? queue[idx + 1] : null;
        const remaining = queue.length - (idx + 1);
        const milestone = !next || (newCount > 0 && newCount % 10 === 0);
        toast.success(praise(newCount, !!next, queue.length), next ? { description: `${remaining} ${remaining === 1 ? "call" : "calls"} to go` } : undefined);
        setCelebrate(milestone ? "milestone" : "normal");
        window.setTimeout(() => {
          if (next) {
            navigate({ to: "/review/$callId", params: { callId: next }, search: { bulk: "1" } });
          } else {
            try { sessionStorage.removeItem("bulk_review_queue"); } catch { /* ignore */ }
            navigate({ to: "/review", search: { prefill: undefined } });
          }
        }, milestone ? 420 : 170);
        return;
      }
      toast.success("Review submitted — nice work!");
      setCelebrate("normal");
      window.setTimeout(() => navigate({ to: "/review", search: { prefill: undefined } }), 170);
    } catch (e) {
      toast.error(`Failed to submit: ${e instanceof Error ? e.message : "Try again."}`);
      setSubmitting(false);
    }
  }

  if (callQuery.isLoading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!call) return (
    <div className="space-y-4">
      <button onClick={() => navigate({ to: "/review", search: { prefill: undefined } })} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to review</button>
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">Call not found.</div>
    </div>
  );

  const bulkInfo = (() => {
    if (!bulkMode) return null;
    try {
      const raw = sessionStorage.getItem("bulk_review_queue");
      const queue: string[] = raw ? JSON.parse(raw) : [];
      const idx = Math.max(0, queue.indexOf(callId));
      const next = idx < queue.length - 1 ? queue[idx + 1] : null;
      return { idx, total: queue.length, next };
    } catch { return null; }
  })();
  const bulkPct = bulkInfo && bulkInfo.total > 0 ? Math.round((bulkInfo.idx / bulkInfo.total) * 100) : 0;
  const canSubmit = issues.length > 0 && rating > 0 && !isAdmin;
  const submitHint = isAdmin ? "The admin account can't submit reviews — sign in with your own email" : issues.length === 0 ? "Select at least one issue" : rating === 0 ? "Add an overall rating to submit" : "";

  return (
    <div className="space-y-4">
      {celebrate && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center" aria-hidden="true">
          {celebrate === "milestone" && (
            <>
              <span className="rozgar-ring absolute h-28 w-28 rounded-full border-4 border-primary" />
              <span className="rozgar-ring-2 absolute h-28 w-28 rounded-full border-4 border-primary" />
            </>
          )}
          <span className="rozgar-pop flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-xl">
            <Check className="h-10 w-10" strokeWidth={3} />
          </span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/review", search: { prefill: undefined } })} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{call.call_id || call.job_id}</h1>
          <p className="truncate text-xs text-muted-foreground">{call.campaign_day} · {call.language} · {call.city_campaign} · {call.call_datetime_ist}</p>
        </div>
        {bulkInfo && (
          <button onClick={() => bulkInfo.next ? navigate({ to: "/review/$callId", params: { callId: bulkInfo.next }, search: { bulk: "1" } }) : navigate({ to: "/review", search: { prefill: undefined } })} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted">Skip <SkipForward className="h-3.5 w-3.5" /></button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", reviewerEmail === "admin@bluedots.com" ? "bg-amber-500" : "bg-emerald-500")} />
          Reviewing as <span className="font-medium text-foreground">{reviewerEmail || "unknown"}</span>
        </span>
      </div>
      {reviewerEmail === "admin@bluedots.com" && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>You're signed in as the shared <strong>admin</strong> account. Reviews you submit here are credited to admin, not you — and won't be tracked against your own work. Sign out and sign in with your own email before reviewing.</span>
        </div>
      )}

      {bulkInfo && (
        <div className="space-y-1.5 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-foreground">Reviewing call {bulkInfo.idx + 1} of {bulkInfo.total}</span>
            <span className="text-muted-foreground">{bulkPct}% complete{sessionReviewed > 0 ? ` · ${sessionReviewed} reviewed this session` : ""}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={bulkPct} aria-valuemin={0} aria-valuemax={100} aria-label="Batch review progress">
            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${bulkPct}%` }} />
          </div>
        </div>
      )}


      <div className="grid gap-4 lg:grid-cols-5 lg:h-[calc(100vh-11rem)] lg:overflow-hidden">
        {/* transcript */}
        <section className="lg:col-span-3 lg:h-full lg:min-h-0">
          <div className="flex h-full flex-col rounded-2xl border border-border bg-card">
            <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">Transcript</h2><p className="text-xs text-muted-foreground">{detailQuery.isLoading ? "Loading…" : `${transcript.length} turns`}</p></div>
            <div className="flex-1 min-h-0 space-y-2 overflow-y-auto p-4 max-h-[60vh] lg:max-h-none">
              {detailQuery.isLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : transcript.length === 0 ? (
                <p className="py-12 text-center text-sm italic text-muted-foreground">Transcript not available for this call.</p>
              ) : transcript.map((turn, i) => {
                const idx = i + 1; const isBot = normaliseSpeaker(turn.speaker) === "Bot"; const flagged = flaggedSet.has(idx);
                return (
                  <div key={idx} ref={(el) => { turnRefs.current[idx] = el; }} className={cn("rounded-xl border p-3", flagged ? "border-l-4 border-l-red-500 border-border" : "border-border", turn.no_audio && "bg-muted/40")}>
                    <div className="flex items-start gap-3">
                      <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", isBot ? "bg-primary" : "bg-slate-400")} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2"><span className="text-sm font-semibold">{isBot ? "Bot" : "Employer"}<span className="ml-2 text-xs font-normal text-muted-foreground">#{idx}</span></span></div>
                        <p className={cn("mt-1 whitespace-pre-wrap text-sm leading-relaxed", turn.no_audio ? "italic text-muted-foreground" : "text-foreground/90")}>{turn.content || (turn.no_audio ? "[no audio]" : "")}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border p-4">
              <AudioPlayer src={typeof recordingUrl === "string" && recordingUrl.startsWith("https://api.getraya.app/call_recording/") ? recordingUrl : undefined} companyName={call.call_id || call.job_id} duration={Number(call.call_duration_seconds) || 0} datetime={call.call_datetime_ist} />
            </div>
          </div>
        </section>

        {/* feedback */}
        <aside className="space-y-3 lg:col-span-2 lg:h-full lg:overflow-y-auto lg:pr-1">
          <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
            <div className="rounded-xl border border-border bg-card">
              <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left"><span className="text-sm font-semibold">Call Info</span><ChevronDown className={cn("h-4 w-4 transition-transform", infoOpen && "rotate-180")} /></CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 border-t border-border px-4 py-3 text-xs">
                <Info k="Campaign Day" v={call.campaign_day} /><Info k="Campaign Type" v={call.campaign_type} /><Info k="Language" v={call.language} /><Info k="Job Status" v={call.job_status} /><Info k="Outcome" v={call.call_outcome} /><Info k="Drop Reason" v={call.drop_reason} />
                {detailQuery.data?.final_summary && (<div className="pt-2"><div className="text-muted-foreground">Final Summary</div><div className="mt-0.5 italic text-foreground/80">{detailQuery.data.final_summary}</div></div>)}
              </CollapsibleContent>
            </div>
          </Collapsible>

          {existingReviews.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-4">
              <Label className="text-sm font-semibold">Previous reviews</Label>
              <div className="mt-3 space-y-3">
                {existingReviews.map((r, i) => (
                  <div key={i} className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                    <div className="flex items-center justify-between gap-2"><span className="font-medium text-foreground">{r.reviewer_name || r.reviewer_email}</span><span className="text-muted-foreground">{r.overall_rating ? `★ ${r.overall_rating}` : "—"}</span></div>
                    {r.quantitative_issues && <div className="flex flex-wrap gap-1">{r.quantitative_issues.split(",").map((s) => s.trim()).filter(Boolean).map((iss) => <span key={iss} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{iss}</span>)}</div>}
                    {r.reviewer_notes && <p className="italic text-foreground/80">"{r.reviewer_notes}"</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-sm font-semibold">Issues detected</Label>
            <div className="mt-3 space-y-2">
              {ISSUE_OPTIONS.filter((o) => !o.datasets || o.datasets.includes(dataset)).map((opt) => {
                const checked = issues.includes(opt.id);
                return (
                  <label key={opt.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-2.5", checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}>
                    <Checkbox checked={checked} onCheckedChange={() => toggleIssue(opt.id)} className="mt-0.5" />
                    <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", opt.color)} />
                    <span className="flex-1"><span className="block text-sm font-medium">{opt.id}</span><span className="block text-xs text-muted-foreground">{opt.desc}</span></span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-sm font-semibold">Flag a specific turn</Label>
            <div className="mt-3 flex gap-2">
              <Select value={flagTurn} onValueChange={setFlagTurn}><SelectTrigger className="w-28"><SelectValue placeholder="Turn" /></SelectTrigger><SelectContent>{transcript.map((_, i) => <SelectItem key={i + 1} value={String(i + 1)}>Turn {i + 1}</SelectItem>)}</SelectContent></Select>
              <Input value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="Describe the issue…" className="flex-1" />
              <Button type="button" onClick={addFlag} size="icon" variant="outline" className="shrink-0"><Plus className="h-4 w-4" /></Button>
            </div>
            {flags.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {flags.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-2 text-xs">
                    <button onClick={() => scrollToTurn(f.turn)} className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-700 dark:text-red-400 hover:bg-red-500/25">Turn {f.turn}</button>
                    <span className="flex-1 text-foreground/80">{f.note}</span>
                    <button onClick={() => setFlags((p) => p.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <Label htmlFor="notes" className="text-sm font-semibold">Additional observations</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={3} className="mt-2" placeholder="Anything else worth mentioning…" />
            <div className="mt-1 text-right text-xs text-muted-foreground">{notes.length}/500</div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <Label className="text-sm font-semibold">Overall call quality</Label>
            <div className="mt-2 flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} className="rounded p-1 transition hover:scale-110" aria-label={`Rate ${n}`}><Star className={cn("h-6 w-6", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} /></button>
              ))}
              <span className="ml-2 text-xs text-muted-foreground">{rating === 0 ? "Not rated" : rating === 1 ? "Very poor" : rating === 2 ? "Poor" : rating === 3 ? "Okay" : rating === 4 ? "Good" : "Excellent"}</span>
            </div>
          </div>

          <div className="sticky bottom-0 z-10 -mx-1 border-t border-border bg-card/95 px-1 pb-1 pt-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
            {!canSubmit && (
              <p className="mb-2 text-center text-[11px] font-medium text-muted-foreground">{submitHint}</p>
            )}
            <Button onClick={submit} disabled={submitting || isAdmin} className="w-full rounded-full">
              {submitting ? "Submitting…" : isAdmin ? "Reviewing disabled for admin" : bulkMode ? "Submit & next call" : "Submit Review"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ k, v }: { k: string; v?: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right font-medium text-foreground">{v || "—"}</span></div>;
}
