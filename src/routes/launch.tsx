import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useProgram } from "@/programs/context";
import { useProgramOverrides } from "@/lib/program-overrides";
import {
  rayaCreateBatch,
  rayaStartBatch,
  rayaListAgents,
  validateContacts,
} from "@/lib/raya.functions";
import { listProgramAgents } from "@/lib/agents.functions";
import { recordLaunchedBatch, getNextCampaignDay } from "@/lib/launched-batches.functions";
import { useAuth } from "@/auth/context";
import { useConcurrencyUsage, useRefreshConcurrency } from "@/hooks/useConcurrencyUsage";
import { Link } from "@tanstack/react-router";
import { registry, type ProgramId } from "@/programs/registry";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  Upload,
  FileText,
  Rocket,
  Check,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  X,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";
import { ScheduleEditor, type ScheduleState, makeDefaultSchedule } from "@/components/ScheduleEditor";
import { appendLaunchLog } from "@/lib/launch-log";
import { cn } from "@/lib/utils";
import { loadSeekersAsync, type Seeker } from "@/lib/upSeekersCsv";
import { buildCohort, type CohortIntent, type ConfidenceBand } from "@/lib/cohort";
import { LAUNCH_PROGRAMS } from "@/lib/launch-program";
import { getLaunchAgentUsage } from "@/lib/agent-ranking.functions";
import { sortAgentsByUsage } from "@/lib/agent-ranking";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export const ENABLE_COHORT_AUDIENCE = false;

export function resolveLaunchAudienceSource(selected: "upload" | "cohort"): "upload" | "cohort" {
  return ENABLE_COHORT_AUDIENCE ? selected : "upload";
}

export const Route = createFileRoute("/launch")({
  component: LaunchWizard,
  head: () => ({
    meta: [
      { title: "Launch campaign | Purple Dots" },
      { name: "description", content: "Prepare and launch Purple Dots outreach campaigns." },
      { property: "og:title", content: "Launch campaign | Purple Dots" },
      { property: "og:description", content: "Prepare and launch Purple Dots outreach campaigns." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const STEPS = [
  "Program",
  "Agent",
  "Audience",
  "Schedule",
  "Concurrency",
  "Review",
  "Launch",
] as const;

interface ValidationReport {
  total: number;
  valid: number;
  invalid: number;
  missingCols: string[];
  problems: { row: number; reason: string; phone?: string; name?: string }[];
  validRows: { name: string; phone: string; cc: string; extras: Record<string, string>; rowIndex: number }[];
}

interface ParsedCsv { headers: string[]; rows: string[][] }

function parseCsv(text: string): ParsedCsv {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((l) => l.split(",").map((c) => c.trim()));
  return { headers, rows };
}

function detectRegion(filename: string): { region: string; language: string; city: string } {
  const f = filename.toLowerCase();
  if (f.includes("ka") || f.includes("kannada") || f.includes("hubli")) {
    return { region: "KA", language: "Kannada", city: "Hubli-Dharwad" };
  }
  return { region: "GZB", language: "Hindi", city: "Ghaziabad" };
}

function LaunchWizard() {
  const { programId: ctxProgram, config: ctxConfig, setProgramId } = useProgram();
  const [step, setStep] = useState(0);
  const [program, setProgram] = useState<ProgramId>(LAUNCH_PROGRAMS[0]);
  const config = registry[program];
  const overrides = useProgramOverrides(program);
  const defaultAgentId = overrides.rayaAgentId || config.rayaAgentId || "";

  const [agentId, setAgentId] = useState<string>(defaultAgentId);
  const [agentName, setAgentName] = useState<string>("");
  const [agentFilter, setAgentFilter] = useState("");
  const agentListRef = useRef<HTMLDivElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [region, setRegion] = useState<string>("");
  const [report, setReport] = useState<ValidationReport | null>(null);
  const [validating, setValidating] = useState(false);
  const [proceedInvalid, setProceedInvalid] = useState(false);

  const [selectedSource, setSource] = useState<"upload" | "cohort">("upload");
  const source = resolveLaunchAudienceSource(selectedSource);
  const [cohortIntent, setCohortIntent] = useState<CohortIntent>("drive");
  const [profileStatuses, setProfileStatuses] = useState<string[]>(["Active", "At Risk"]);
  const [confidenceBand, setConfidenceBand] = useState<ConfidenceBand>("low");
  const [seekers, setSeekers] = useState<Seeker[] | null>(null);
  const [seekersLoading, setSeekersLoading] = useState(false);

  const [schedule, setSchedule] = useState<ScheduleState>(() => makeDefaultSchedule());
  const [concurrency, setConcurrency] = useState(5);
  const [maxRetries, setMaxRetries] = useState(2);
  const [retryAfterHrs, setRetryAfterHrs] = useState(24);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>(["Pending"]);

  const [batchName, setBatchName] = useState("");
  const [campaignDay, setCampaignDay] = useState<string>("Day 1");
  const [campaignDate, setCampaignDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [launching, setLaunching] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [startStatus, setStartStatus] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [startPending, setStartPending] = useState(false);
  const { session } = useAuth();
  const canDirectLaunch = session?.role === "admin" || session?.role === "jfc" || session?.role === "wc" || session?.role === "network_admin" || session?.role === "owner";

  const listAgentsFn = useServerFn(listProgramAgents);
  const listLiveAgentsFn = useServerFn(rayaListAgents);
  const agentUsageFn = useServerFn(getLaunchAgentUsage);
  const validateFn = useServerFn(validateContacts);
  const createBatchFn = useServerFn(rayaCreateBatch);
  const startBatchFn = useServerFn(rayaStartBatch);
  const recordBatchFn = useServerFn(recordLaunchedBatch);
  const nextDayFn = useServerFn(getNextCampaignDay);
  const usage = useConcurrencyUsage({ enabled: !launching });
  const refreshUsage = useRefreshConcurrency();
  const available = usage.data?.available ?? Infinity;
  const cap = usage.data?.cap ?? 20;

  // Derive language + city_campaign from region.
  const regionInfo = useMemo(() => {
    if (region === "KA") return { language: "Kannada", city: "Hubli-Dharwad" };
    if (region === "GZB") return { language: "Hindi", city: "Ghaziabad" };
    return { language: "", city: "" };
  }, [region]);
  const campaignType = useMemo(() => {
    const lang = regionInfo.language || region || "";
    const dayNum = (campaignDay.match(/\d+/) || ["1"])[0];
    const intentTag = source === "cohort" ? (cohortIntent === "drive" ? "DriveApplications" : "FillInfo") : "";
    return `${program.toUpperCase()}_${lang}_${intentTag ? intentTag + "_" : ""}Day${dayNum}`;
  }, [program, regionInfo.language, region, campaignDay, source, cohortIntent]);

  useEffect(() => {
    if (source === "cohort" && !seekers && !seekersLoading) {
      setSeekersLoading(true);
      loadSeekersAsync()
        .then((r) => setSeekers(r.seekers))
        .catch(() => setSeekers([]))
        .finally(() => setSeekersLoading(false));
    }
  }, [source, seekers, seekersLoading]);

  useEffect(() => {
    if (source === "cohort" && region !== "GZB") setRegion("GZB");
  }, [source, region]);

  const cohortContacts = useMemo(
    () => (seekers ? buildCohort(seekers, { intent: cohortIntent, profileStatuses, confidenceBand }) : []),
    [seekers, cohortIntent, profileStatuses, confidenceBand],
  );

  // Fetch next campaign day suggestion when program changes.
  useEffect(() => {
    let cancelled = false;
    nextDayFn({ data: { program } }).then((r) => {
      if (!cancelled) setCampaignDay(r.next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [program, nextDayFn]);

  // Auto-fill batchName to the computed campaign_type so they line up.
  useEffect(() => {
    if (campaignType) setBatchName(campaignType);
  }, [campaignType]);


  // Sync chosen program back to global context so the rest of the dashboard follows.
  useEffect(() => { if (program !== ctxProgram) setProgramId(program); }, [program, ctxProgram, setProgramId]);

  const agentsQuery = useQuery({
    queryKey: ["launch-agents", program],
    queryFn: async () => {
      const [savedResult, liveResult] = await Promise.allSettled([
        listAgentsFn({ data: { program } }),
        listLiveAgentsFn({ data: {} }),
      ]);
      const saved = savedResult.status === "fulfilled" ? savedResult.value : [];
      if (liveResult.status === "fulfilled") {
        return {
          agents: liveResult.value.map((a) => ({ id: a.id, agent_id: a.id, name: a.name })),
          note: null,
        };
      }
      console.warn("[launch] Live agent list unavailable; using saved agents");
      return {
        agents: saved,
        note: savedResult.status === "rejected"
          ? "Live and saved agent lists couldn't be loaded. Your current agent selection is still available."
          : "Live Raya agents couldn't be loaded. Showing saved agents; launching is still available.",
      };
    },
    enabled: step >= 1,
    retry: false,
  });
  const agents = agentsQuery.data?.agents ?? [];
  const rankingQuery = useQuery({
    queryKey: ["launch-agent-usage", agents.map(a => a.agent_id)],
    queryFn: () => agentUsageFn({ data: { agentIds: agents.map(a => a.agent_id) } }),
    enabled: step >= 1 && agents.length > 0,
    retry: false,
    staleTime: 60_000,
  });
  const rankedAgents = sortAgentsByUsage(agents, rankingQuery.data?.counts ?? undefined);
  const visibleAgents = rankedAgents.filter(a => a.agent_id === agentId || a.name.toLowerCase().includes(agentFilter.toLowerCase()));
  useEffect(() => {
    agentListRef.current?.querySelector('[data-state="checked"]')?.scrollIntoView({ block: "nearest" });
  }, [agentId, agentFilter, rankingQuery.data, agentsQuery.data, step]);

  useEffect(() => {
    if (!agentName && agentsQuery.data && agentId) {
      const found = agentsQuery.data.agents.find((a) => a.agent_id === agentId);
      if (found) setAgentName(found.name);
    }
  }, [agentsQuery.data, agentId, agentName]);

  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const canNext = useMemo(() => {
    if (step === 0) return !!program;
    if (step === 1) return !!agentId;
    if (step === 2) {
      if (source === "cohort") return cohortContacts.length > 0;
      if (!report) return false;
      if (report.missingCols.length > 0) return false;
      if (report.invalid === 0) return true;
      return proceedInvalid;
    }
    if (step === 3) return schedule.startTime < schedule.endTime && schedule.days.length > 0;
    if (step === 4) {
      if (!(concurrency > 0 && maxRetries >= 0 && retryAfterHrs > 0)) return false;
      if (Number.isFinite(available) && concurrency > (available as number)) return false;
      return true;
    }
    return true;
  }, [step, program, agentId, report, proceedInvalid, schedule, concurrency, maxRetries, retryAfterHrs, available, source, cohortContacts.length]);

  const onFile = useCallback(async (f: File) => {
    setFile(f);
    setReport(null);
    setProceedInvalid(false);
    setRegion(detectRegion(f.name).region);
    // batchName auto-derives from campaignType (program + language + Day N).
    const text = await f.text();
    const p = parseCsv(text);
    setParsed(p);
    setValidating(true);
    try {
      const res = await validateFn({ data: { headers: p.headers, rows: p.rows } });
      setReport(res as ValidationReport);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Validation failed");
    } finally {
      setValidating(false);
    }
  }, [validateFn]);

  const startCreatedBatch = async (id: string, logRows?: number) => {
    setLaunching(true);
    setLaunchError(null);
    setStartPending(false);
    try {
      const started: any = await startBatchFn({
        data: {
          batchId: id,
          schedule: {
            timezone: schedule.timezone,
            start_time: schedule.startTime,
            end_time: schedule.endTime,
            days: schedule.days,
          },
          maxRetries,
          retryAfterHrs,
          concurrency,
          selectedStatuses: selectedStatuses.length ? selectedStatuses : ["Pending"],
        },
      });
      const status = started?.status ?? started?.batch?.status ?? "started";
      setStartStatus(String(status));
      appendLaunchLog({
        date: new Date().toISOString(),
        program,
        file: file?.name ?? batchName,
        rows: logRows ?? report?.valid ?? 0,
        status: "appended",
        batchId: id,
      });
      toast.success(`Batch launched · ${id}`);
      refreshUsage();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Start failed";
      setLaunchError(`${msg}\nBatch ${id} was created but not started. Use Retry start to resume without creating a duplicate batch.`);
      setStartPending(true);
      toast.error(msg.split("\n")[0]);
    } finally {
      setLaunching(false);
    }
  };

  const launch = async () => {
    if (Number.isFinite(available) && concurrency > (available as number)) {
      const msg = `Only ${available} concurrency available — reduce concurrency or stop a running batch.`;
      setLaunchError(msg);
      toast.error(msg);
      return;
    }
    setLaunching(true); setLaunchError(null); setStartPending(false); setStartStatus(null);
    try {
      const contacts =
        source === "cohort"
          ? cohortContacts.map((c) => ({ ...c, _region: region }))
          : (report?.validRows ?? []).map((r) => ({
              contact_name: r.name,
              contact_phone: r.phone,
              country_code: r.cc,
              ...r.extras,
              _region: region,
            }));
      if (contacts.length === 0) {
        toast.error("No contacts to launch.");
        setLaunching(false);
        return;
      }
      const created = await createBatchFn({ data: { agentId, batchName, contacts } }) as
        | { ok: true; batchId: string; contactsInserted?: number; totalRows?: number; message?: string }
        | { ok: false; batchId: null; validation: { message: string; totalRows?: number; validRows?: number; invalidRows?: number; errors: Array<{ row?: number; field?: string; message?: string; value?: any }> } };

      if (!created.ok) {
        const v = created.validation;
        const sample = (v.errors ?? []).slice(0, 5)
          .map((er) => `row ${er.row ?? "?"}${er.field ? ` · ${er.field}` : ""}${er.message ? `: ${er.message}` : ""}`)
          .join("\n");
        const more = (v.errors?.length ?? 0) > 5 ? `\n…and ${v.errors!.length - 5} more` : "";
        throw new Error(
          `${v.message}${typeof v.invalidRows === "number" ? ` (${v.invalidRows} invalid of ${v.totalRows ?? "?"})` : ""}${sample ? `\n${sample}${more}` : ""}`,
        );
      }

      const id = created.batchId;
      setBatchId(id);
      // Persist campaign metadata for the staging export to join on later.
      try {
        await recordBatchFn({
          data: {
            batchId: id,
            program,
            agentId,
            agentName,
            batchName,
            campaignDay,
            campaignDate,
            campaignType,
            language: regionInfo.language,
            cityCampaign: regionInfo.city,
            region,
            inputRows: contacts,
          },
        });
      } catch (e) {
        console.error("recordLaunchedBatch failed", e);
      }
      await startCreatedBatch(id, contacts.length);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Launch failed";
      setLaunchError(msg);
      toast.error(msg.split("\n")[0]);
      appendLaunchLog({
        date: new Date().toISOString(),
        program,
        file: file?.name ?? batchName,
        rows: source === "cohort" ? cohortContacts.length : (report?.valid ?? 0),
        status: "failed",
      });
    } finally {
      setLaunching(false);
    }
  };


  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 0 && (
        <Panel title="Step 1 · Program" description="Pick which program this batch belongs to">
          <div className="grid gap-3 w-full max-w-sm">
            {LAUNCH_PROGRAMS.map((p) => (
              <Button
                key={p}
                type="button"
                variant="outline"
                aria-pressed={program === p}
                onClick={() => setProgram(p)}
                className={cn(
                  "h-auto w-full flex-col items-start whitespace-normal rounded-lg border-2 p-5 text-left transition-colors",
                  program === p ? "border-brand bg-brand-soft" : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <div className="text-lg font-semibold">{registry[p].label}</div>
                <div className="text-xs text-muted-foreground mt-1">{registry[p].subtitle}</div>
              </Button>
            ))}
          </div>
        </Panel>
      )}

      {step === 1 && (
        <Panel title="Step 2 · Agent" description="Choose which Raya agent will place the calls">
          {agentsQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading agents…</div>
          )}
          {agentsQuery.data?.note && (
            <div role="status" className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{agentsQuery.data.note}
            </div>
          )}
          {agentsQuery.data && agents.length === 0 && !agentsQuery.data.note && (
            <div className="rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
              No agents found in the Raya account.{" "}
              <Link to="/settings" className="text-brand underline">Add one in the Agents section</Link>.
            </div>
          )}
          {agentsQuery.data && (agents.length > 0 || (agentsQuery.data.note && agentId)) && (
            <div className="w-full min-w-0 space-y-2">
              <Label>Raya agent</Label>
              <Input aria-label="Filter agents" placeholder="Filter agents…" value={agentFilter} onChange={e => setAgentFilter(e.target.value)} />
              {rankingQuery.isFetching && <p role="status" className="text-xs text-muted-foreground">Loading call counts…</p>}
              {(rankingQuery.error || rankingQuery.data?.error) && <p role="status" className="text-xs text-muted-foreground">Usage couldn't be loaded. Agents are listed by name.</p>}
              <RadioGroup
                ref={agentListRef}
                aria-label="Raya agents"
                className="grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3"
                value={agentId}
                onValueChange={(v) => {
                  setAgentId(v);
                  setAgentName(agents.find((a) => a.agent_id === v)?.name ?? "");
                }}
              >
                  {agents.length === 0 && agentId && <Label className="flex items-center gap-3 p-3"><RadioGroupItem value={agentId} />{agentName || agentId} · Current selection</Label>}
                  {visibleAgents.map((a) => (
                    <Label key={a.id} htmlFor={`launch-agent-${a.agent_id}`} className={cn("flex min-h-12 min-w-0 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2", agentId === a.agent_id ? "bg-brand-soft" : "hover:bg-muted")}>
                      <RadioGroupItem id={`launch-agent-${a.agent_id}`} value={a.agent_id} aria-label={a.name} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="block break-words text-sm leading-4">{a.name}</span>
                        {(rankingQuery.data?.counts?.[a.agent_id] ?? 0) > 0 && <span className="block text-xs leading-4 text-muted-foreground">{rankingQuery.data?.counts?.[a.agent_id]?.toLocaleString("en-US")} calls</span>}
                      </div>
                    </Label>
                  ))}
              </RadioGroup>
              {visibleAgents.length === 0 && agents.length > 0 && <p className="text-sm text-muted-foreground">No matching agents.</p>}
              <p className="text-xs text-muted-foreground">
                Manage agents in the <Link to="/settings" className="text-brand underline">Agents</Link> section.
              </p>
            </div>
          )}
        </Panel>
      )}

      {step === 2 && (
        <div className="space-y-4">
          {ENABLE_COHORT_AUDIENCE && <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
            {([
              { id: "upload", icon: Upload, title: "Bulk upload", desc: "Dial a CSV of contacts you provide." },
              { id: "cohort", icon: Gauge, title: "Create cohort", desc: "Build an audience from My Blue Dots." },
            ] as const).map((o) => (
              <button
                key={o.id}
                onClick={() => setSource(o.id)}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-colors flex items-start gap-3",
                  source === o.id ? "border-brand bg-brand-soft" : "border-border bg-card hover:bg-muted/40",
                )}
              >
                <span className="mt-0.5 text-brand"><o.icon className="h-5 w-5" /></span>
                <span>
                  <span className="block text-sm font-semibold">{o.title}</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span>
                </span>
              </button>
            ))}
          </div>}
          {source === "upload" ? (
            <UploadStep
              file={file}
              parsed={parsed}
              report={report}
              validating={validating}
              region={region}
              setRegion={setRegion}
              proceedInvalid={proceedInvalid}
              setProceedInvalid={setProceedInvalid}
              onFile={onFile}
              onReset={() => { setFile(null); setParsed(null); setReport(null); setProceedInvalid(false); }}
            />
          ) : (
            <CohortStep
              intent={cohortIntent}
              setIntent={setCohortIntent}
              profileStatuses={profileStatuses}
              setProfileStatuses={setProfileStatuses}
              confidenceBand={confidenceBand}
              setConfidenceBand={setConfidenceBand}
              loading={seekersLoading}
              count={cohortContacts.length}
            />
          )}
        </div>
      )}

      {step === 3 && (
        <Panel title="Step 4 · Schedule" description="Days, time window, and timezone for the call window">
          <div className="max-w-xl"><ScheduleEditor value={schedule} onChange={setSchedule} /></div>
        </Panel>
      )}

      {step === 4 && (
        <Panel title="Step 5 · Concurrency & retries" description="How aggressively Raya should dial">
          <div className="mb-4 max-w-2xl rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Raya rate limit: <strong>1 call per 20 seconds</strong> by default. Keep concurrency low or launches will be throttled (HTTP 429).
            </div>
          </div>
          <div className={cn(
            "mb-4 max-w-2xl rounded-md border px-3 py-2 text-sm flex items-start gap-2",
            available === 0
              ? "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400"
              : available <= 5
                ? "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-300"
                : "border-brand/20 bg-brand-soft text-brand",
          )}>
            <Gauge className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <strong>{usage.isLoading ? "…" : available}</strong> of {cap} concurrency available right now (account-wide, shared by KKB + DKB).
              {usage.data?.batches?.length ? (
                <span className="ml-1 opacity-80">In use by {usage.data.batches.length} batch{usage.data.batches.length === 1 ? "" : "es"}.</span>
              ) : null}
              {concurrency > (available as number) && Number.isFinite(available) && (
                <div className="mt-1 font-medium">Reduce concurrency to {available} or stop a running batch to proceed.</div>
              )}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 max-w-2xl">
            <NumberField
              label="Concurrency"
              value={concurrency}
              onChange={setConcurrency}
              min={1}
              max={Math.max(1, Math.min(100, Number.isFinite(available) ? (available as number) : 100))}
            />
            <NumberField label="Max retries" value={maxRetries} onChange={setMaxRetries} min={0} max={10} />
            <NumberField label="Retry after (hrs)" value={retryAfterHrs} onChange={setRetryAfterHrs} min={1} max={168} />
          </div>
          <div className="mt-4 max-w-2xl">
            <Label className="text-xs">Contacts to call (status)</Label>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(["Pending", "Unanswered", "Failed"] as const).map((s) => {
                const active = selectedStatuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSelectedStatuses((prev) => {
                        const next = prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s];
                        return next.length === 0 ? ["Pending"] : next;
                      });
                    }}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                      active
                        ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {active && <Check className="h-3 w-3" />}
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Pending = new / not-yet-called contacts. Add Unanswered or Failed to also re-call those from a previous run.
            </p>
          </div>

        </Panel>
      )}

      {step === 5 && (
        <Panel title="Step 6 · Review" description="Confirm everything before sending to Raya">
          <div className="grid gap-3 sm:grid-cols-2 text-sm max-w-3xl">
            <Field label="Program" value={config.label} />
            <Field label="Agent" value={agentName || agentId} mono />
            <Field label="Agent id" value={agentId} mono />
            <Field label="Batch name" value={batchName} />
            <Field label="Audience" value={source === "cohort" ? "Cohort · My Blue Dots" : "Bulk upload"} />
            {source === "cohort" ? (
              <>
                <Field label="Cohort intent" value={cohortIntent === "drive" ? "Drive Applications" : "Fill Missing Information"} />
                <Field label="Cohort filter" value={cohortIntent === "drive" ? profileStatuses.join(", ") : `Confidence ${confidenceBand}`} />
              </>
            ) : (
              <Field label="File" value={file?.name ?? "—"} />
            )}
            <Field label="Region" value={region} />
            <Field label="Language" value={regionInfo.language || "—"} />
            <Field label="City campaign" value={regionInfo.city || "—"} />
            <Field label="Campaign day" value={campaignDay} />
            <Field label="Campaign date" value={campaignDate} />
            <Field label="Campaign type" value={campaignType} />
            <Field label="Contacts" value={source === "cohort" ? String(cohortContacts.length) : `${report?.valid ?? 0} of ${report?.total ?? 0}`} />
            <Field label="Will skip" value={String(report?.invalid ?? 0)} />
            <Field label="Days" value={dayLabels(schedule.days)} />
            <Field label="Time window" value={`${schedule.startTime}–${schedule.endTime}`} />
            <Field label="Timezone" value={schedule.timezone} />
            <Field label="Concurrency" value={String(concurrency)} />
            <Field label="Max retries" value={String(maxRetries)} />
            <Field label="Retry after" value={`${retryAfterHrs} hrs`} />
            <Field label="Statuses to call" value={selectedStatuses.join(", ")} />

          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-3 max-w-3xl">
            <div>
              <Label htmlFor="bn" className="text-xs">Edit batch name</Label>
              <Input id="bn" value={batchName} onChange={(e) => setBatchName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cday" className="text-xs">Campaign day</Label>
              <Input id="cday" value={campaignDay} onChange={(e) => setCampaignDay(e.target.value)} placeholder="Day 1" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="cdate" className="text-xs">Campaign date</Label>
              <Input id="cdate" type="date" value={campaignDate} onChange={(e) => setCampaignDate(e.target.value)} className="mt-1" />
            </div>
          </div>
        </Panel>
      )}

      {step === 6 && (
        <Panel title="Step 7 · Launch" description="Create the batch in Raya and start the schedule">
          <div className="space-y-4 max-w-xl">
            {!batchId && !launching && canDirectLaunch && (
              <Button onClick={launch} variant="outline" className="gap-1.5">
                <Rocket className="h-4 w-4" /> Launch campaign
              </Button>
            )}
            {launching && (
              <div className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Creating batch and starting schedule…</div>
            )}
            {batchId && (
              <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-sm flex items-center gap-2">
                <Check className="h-4 w-4" /> Batch created · <span className="font-mono">{batchId}</span>
              </div>
            )}
            {startPending && batchId && !launching && (
              <Button
                onClick={() => startCreatedBatch(batchId)}
                className="bg-brand text-brand-foreground hover:bg-brand/90 gap-1.5"
              >
                <Rocket className="h-4 w-4" /> Retry start
              </Button>
            )}
            {startStatus && (
              <div className="rounded-md bg-brand-soft text-brand px-3 py-2 text-sm flex items-center gap-2">
                <Check className="h-4 w-4" /> Status: {startStatus}
              </div>
            )}
            {launchError && (
              <div className="rounded-md bg-red-500/15 text-red-700 dark:text-red-400 px-3 py-2 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="whitespace-pre-line">{launchError}</div>
              </div>
            )}
          </div>
        </Panel>
      )}

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={back} disabled={step === 0 || launching}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={next} disabled={!canNext} className="bg-brand text-brand-foreground hover:bg-brand/90">
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        ) : (
          <Button variant="outline" onClick={() => { setStep(0); setBatchId(null); setStartStatus(null); setStartPending(false); setFile(null); setParsed(null); setReport(null); }}>
            Start over
          </Button>
        )}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div className={cn(
              "h-7 w-7 rounded-full text-xs font-semibold flex items-center justify-center border-2",
              done ? "bg-brand border-brand text-brand-foreground" :
              active ? "border-brand text-brand" : "border-border text-muted-foreground",
            )}>
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={cn("text-xs whitespace-nowrap", active ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="w-6 h-px bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

function UploadStep({
  file, parsed, report, validating, region, setRegion, proceedInvalid, setProceedInvalid, onFile, onReset,
}: {
  file: File | null;
  parsed: ParsedCsv | null;
  report: ValidationReport | null;
  validating: boolean;
  region: string;
  setRegion: (r: string) => void;
  proceedInvalid: boolean;
  setProceedInvalid: (v: boolean) => void;
  onFile: (f: File) => void;
  onReset: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Panel title="Step 3 · Upload & validate" description="Drop a CSV — we validate before any Raya call is made">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 cursor-pointer transition-colors",
          drag ? "border-brand bg-brand-soft" : "border-border bg-muted/40",
        )}
      >
        <div className="h-10 w-10 rounded-full bg-brand-soft flex items-center justify-center text-brand">
          <Upload className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium">Drop CSV here, or click to browse</p>
        <p className="text-xs text-muted-foreground">Required: contact_name, contact_phone. Optional: country_code (default 91).</p>
        <input ref={inputRef} type="file" accept=".csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>

      {file && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-3 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> File
              </div>
              <div className="text-sm font-medium truncate" title={file.name}>{file.name}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-red-600"
              onClick={(e) => { e.stopPropagation(); onReset(); if (inputRef.current) inputRef.current.value = ""; }}
              title="Remove file"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <InfoTile label="Rows" value={parsed?.rows.length.toLocaleString() ?? "—"} />
          <div className="rounded-lg border bg-card p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Detected region</div>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="KA">KA · Kannada · Hubli</SelectItem>
                <SelectItem value="GZB">GZB · Hindi · Ghaziabad</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {validating && (
        <div className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Validating…</div>
      )}

      {report && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-brand-soft text-brand hover:bg-brand-soft">{report.valid} valid</Badge>
            <Badge variant="secondary">{report.total} total</Badge>
            {report.invalid > 0 && <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 hover:bg-red-500/25">{report.invalid} problems</Badge>}
          </div>
          {report.missingCols.length > 0 && (
            <div className="rounded-md bg-red-500/15 text-red-700 dark:text-red-400 px-3 py-2 text-sm">
              Missing required column{report.missingCols.length === 1 ? "" : "s"}: <span className="font-mono">{report.missingCols.join(", ")}</span>
            </div>
          )}
          {report.problems.length > 0 && (
            <div className="rounded-md border max-h-56 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Row</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.problems.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{p.row}</TableCell>
                      <TableCell className="text-xs">{p.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {report.invalid > 0 && report.missingCols.length === 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={proceedInvalid} onChange={(e) => setProceedInvalid(e.target.checked)} />
              Proceed with {report.valid} valid rows only (skip {report.invalid} problem rows)
            </label>
          )}
        </div>
      )}

      {parsed && parsed.headers.length > 0 && (
        <div className="mt-5">
          <p className="text-xs text-muted-foreground mb-2">Preview · first 20 rows</p>
          <div className="max-h-72 overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>{parsed.headers.map((h) => <TableHead key={h} className="whitespace-nowrap text-xs">{h}</TableHead>)}</TableRow>
              </TableHeader>
              <TableBody>
                {parsed.rows.slice(0, 20).map((r, i) => (
                  <TableRow key={i}>{r.map((c, j) => <TableCell key={j} className="text-xs whitespace-nowrap">{c}</TableCell>)}</TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function NumberField({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} className="mt-1" />
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("text-sm mt-0.5 break-all", mono && "font-mono")}>{value || "—"}</div>
    </div>
  );
}

function InfoTile({ icon, label, value, hint }: { icon?: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
        {icon}{label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

const DAY_NAMES = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function dayLabels(days: number[]) {
  return days.slice().sort().map((d) => DAY_NAMES[d]).join(", ") || "—";
}

function CohortStep({
  intent, setIntent, profileStatuses, setProfileStatuses, confidenceBand, setConfidenceBand, loading, count,
}: {
  intent: CohortIntent;
  setIntent: (v: CohortIntent) => void;
  profileStatuses: string[];
  setProfileStatuses: (v: string[]) => void;
  confidenceBand: ConfidenceBand;
  setConfidenceBand: (v: ConfidenceBand) => void;
  loading: boolean;
  count: number;
}) {
  const STATUSES = ["New", "Active", "At Risk", "Inactive"];
  const BANDS: { id: ConfidenceBand; label: string }[] = [
    { id: "low", label: "Low (< 40)" },
    { id: "medium", label: "Medium (40–70)" },
    { id: "high", label: "High (> 70)" },
  ];
  const toggleStatus = (s: string) =>
    setProfileStatuses(profileStatuses.includes(s) ? profileStatuses.filter((x) => x !== s) : [...profileStatuses, s]);

  return (
    <Panel title="Step 3 · Create cohort" description="Build an audience from My Blue Dots">
      <div className="grid gap-3 sm:grid-cols-2 max-w-xl mb-5">
        {([
          { id: "drive", icon: Rocket, title: "Drive Applications", desc: "Call seekers to push them to apply." },
          { id: "fill", icon: FileText, title: "Fill Missing Information", desc: "Call seekers to complete their profile." },
        ] as const).map((o) => (
          <button
            key={o.id}
            onClick={() => setIntent(o.id)}
            className={cn(
              "rounded-xl border-2 p-4 text-left transition-colors flex items-start gap-3",
              intent === o.id ? "border-brand bg-brand-soft" : "border-border bg-card hover:bg-muted/40",
            )}
          >
            <span className="mt-0.5 text-brand"><o.icon className="h-5 w-5" /></span>
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold">
                {o.title}
                {o.id === "fill" && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">Mock</span>}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5">{o.desc}</span>
            </span>
          </button>
        ))}
      </div>

      {intent === "drive" ? (
        <div className="max-w-xl">
          <Label className="text-xs">Profile status · select one or more</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {STATUSES.map((s) => {
              const on = profileStatuses.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                    on ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90" : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}{s}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="max-w-xl">
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/15 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            Confidence score isn't in the data yet — this is a mock using profile completeness as a stand-in until the field lands.
          </div>
          <Label className="text-xs">Confidence score · target a band</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {BANDS.map((b) => {
              const on = confidenceBand === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setConfidenceBand(b.id)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
                    on ? "border-brand bg-brand text-brand-foreground hover:bg-brand/90" : "border-border bg-card text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {on && <Check className="h-3 w-3" />}{b.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-baseline gap-2 border-t border-border pt-4">
        {loading ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading My Blue Dots…</span>
        ) : (
          <>
            <span className="text-2xl font-semibold tabular-nums">{count.toLocaleString("en-IN")}</span>
            <span className="text-sm text-muted-foreground">blue dots match — they'll be called</span>
          </>
        )}
      </div>
    </Panel>
  );
}
