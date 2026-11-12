import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useProgram } from "@/programs/context";
import { getOverrides, setOverrides, useProgramOverrides } from "@/lib/program-overrides";
import { rayaKeyStatus } from "@/lib/raya.functions";
import { getExportTarget, setExportTarget } from "@/lib/raya-export.functions";
import { Panel } from "@/components/Panel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, Gauge, ExternalLink, ShieldAlert, Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/lib/theme";
import { getConcurrencyCap, setConcurrencyCap, CONCURRENCY_CAP_DEFAULT } from "@/lib/concurrency-cap";
import { ConnectionsSection } from "@/components/settings/ConnectionsSection";
import { AgentsSection } from "@/components/settings/AgentsSection";
import { useAuth } from "@/auth/context";
import { UsersRolesSection } from "@/components/settings/UsersRolesSection";

export const Route = createFileRoute("/settings")({
  component: Settings,
});

function Settings() {
  const { isAdmin } = useAuth();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">Connections, agents, and program configuration.</p>
      </header>
      <Tabs defaultValue="connections">
        <TabsList>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="agents">Agents</TabsTrigger>
          {isAdmin && <TabsTrigger value="users-roles">Users & Roles</TabsTrigger>}
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="reference">Reference</TabsTrigger>
        </TabsList>
        <TabsContent value="connections" className="mt-4"><ConnectionsSection /></TabsContent>
        <TabsContent value="agents" className="mt-4"><AgentsSection /></TabsContent>
        {isAdmin && <TabsContent value="users-roles" className="mt-4"><UsersRolesSection /></TabsContent>}
        <TabsContent value="general" className="mt-4"><GeneralSettings /></TabsContent>
        <TabsContent value="reference" className="mt-4"><ReferenceSettings /></TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralSettings() {
  const { config, programId } = useProgram();
  const overrides = useProgramOverrides(programId);

  const [agentId, setAgentId] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [cap, setCap] = useState<number>(() => getConcurrencyCap());

  const keyStatusFn = useServerFn(rayaKeyStatus);

  useEffect(() => {
    const o = getOverrides(programId);
    setAgentId(o.rayaAgentId ?? config.rayaAgentId ?? "");
    setSheetUrl(o.sheetCsvUrl ?? config.sheetCsvUrl ?? "");
  }, [programId, config]);

  useEffect(() => {
    keyStatusFn({ data: undefined as any })
      .then((r: any) => setKeyConfigured(Boolean(r?.configured)))
      .catch(() => setKeyConfigured(false));
  }, [keyStatusFn]);

  const save = () => {
    setOverrides(programId, { rayaAgentId: agentId, sheetCsvUrl: sheetUrl });
    toast.success("Settings saved");
  };

  return (
    <div className="space-y-6">
      <AppearancePanel />
      <Panel title="Raya API key" description="Stored as a backend secret · never sent to the browser">
        {keyConfigured === null ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : keyConfigured ? (
          <div className="flex items-center gap-2 rounded-md bg-brand-soft text-brand px-3 py-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span><strong>RAYA_API_KEY</strong> is set.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <div>
              <p><strong>RAYA_API_KEY</strong> is not set.</p>
              <p className="text-xs mt-1 text-destructive/80">
                Add it in Project Settings → Secrets, then reload this page.
              </p>
            </div>
          </div>
        )}
      </Panel>

      <Panel title="Concurrency cap" description="Account-wide pool of concurrent calls shared across all programs (default 20)">
        <div className="flex items-end gap-3 max-w-sm">
          <div className="flex-1">
            <Label htmlFor="cap" className="text-xs">Max concurrent calls (cap)</Label>
            <div className="mt-1 flex items-center gap-2">
              <Gauge className="h-4 w-4 text-brand" />
              <Input
                id="cap"
                type="number"
                min={1}
                max={500}
                value={cap}
                onChange={(e) => setCap(Math.max(1, Number(e.target.value) || CONCURRENCY_CAP_DEFAULT))}
              />
            </div>
          </div>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => { setConcurrencyCap(cap); toast.success(`Cap set to ${cap}`); }}
          >
            Save cap
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Raya's default account limit is 20 concurrent calls. Adjust if your plan allows more.
        </p>
      </Panel>

      <ExportStagingPanel program={programId} />

      <Panel title="Program defaults" description={`${config.label} · fallbacks used when a program has no agent/sheet configured above.`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="agent" className="text-xs">Raya agent id</Label>
            <Input
              id="agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="e.g. agt_abc123"
              className="mt-1 font-mono"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Used by createBatch, startBatch, listBatches and initiateCall for the {config.label} program.
            </p>
          </div>
          <div>
            <Label htmlFor="sheet" className="text-xs">Connected sheet (CSV URL)</Label>
            <Input
              id="sheet"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              placeholder="https://docs.google.com/…/pub?output=csv"
              className="mt-1"
            />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between border-t pt-3 mt-1">
            <p className="text-xs text-muted-foreground">
              Active agent: <span className="font-mono">{overrides.rayaAgentId || config.rayaAgentId || "—"}</span>
            </p>
            <Button className="bg-brand text-brand-foreground hover:bg-brand/90" onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AppearancePanel() {
  const { theme, setTheme } = useTheme();
  const opts: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <Panel title="Appearance" description="Choose a light or dark theme, or follow your system setting.">
      <div className="inline-flex rounded-lg border border-border bg-card p-1">
        {opts.map((o) => {
          const Icon = o.icon;
          const active = theme === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => setTheme(o.value)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="h-4 w-4" />
              {o.label}
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function ReferenceSettings() {
  const { config } = useProgram();
  return (
    <Accordion type="single" collapsible defaultValue="kpis" className="space-y-2">
      <AccordionItem value="kpis" className="rounded-xl border bg-card px-4">
        <AccordionTrigger>KPI definitions</AccordionTrigger>
        <AccordionContent>
          <p className="text-xs text-muted-foreground mb-3">Drives the Overview cards</p>
          <ul className="divide-y">
            {config.kpis.map((k) => (
              <li key={k.key} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <div className="font-medium">{k.label}</div>
                  <div className="text-xs text-muted-foreground font-mono">{k.key}</div>
                </div>
                <Badge variant="secondary" className="bg-brand-soft text-brand">
                  {k.format}
                </Badge>
              </li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="drops" className="rounded-xl border bg-card px-4">
        <AccordionTrigger>Drop-reason buckets</AccordionTrigger>
        <AccordionContent>
          <p className="text-xs text-muted-foreground mb-3">Per-program taxonomy</p>
          <div className="flex flex-wrap gap-2">
            {config.dropReasons.map((r) => (
              <Badge key={r} variant="secondary" className="bg-muted text-foreground font-mono">
                {r}
              </Badge>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="columns" className="rounded-xl border bg-card px-4">
        <AccordionTrigger>Column schema</AccordionTrigger>
        <AccordionContent>
          <p className="text-xs text-muted-foreground mb-3">
            {config.columns.length} columns expected in the {config.label} master sheet
          </p>
          <div className="flex flex-wrap gap-1.5">
            {config.columns.map((c, i) => (
              <span key={c} className="text-[11px] font-mono px-2 py-1 rounded bg-muted text-foreground">
                {i + 1}. {c}
              </span>
            ))}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function ExportStagingPanel({ program }: { program: "seekers" | "providers" }) {
  const getFn = useServerFn(getExportTarget);
  const setFn = useServerFn(setExportTarget);
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["export-target", program],
    queryFn: () => getFn({ data: { program } }),
    staleTime: 30_000,
  });
  const target = query.data;

  const [sheetUrl, setSheetUrl] = useState("");
  const [tabName, setTabName] = useState("Sheet1");
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (target) {
      setSheetUrl(target.sheet_id ? `https://docs.google.com/spreadsheets/d/${target.sheet_id}/edit` : "");
      setTabName("Sheet1");
      setLabel(target.label ?? "");
    } else {
      setSheetUrl("");
      setTabName("Sheet1");
      setLabel("");
    }
  }, [target]);

  const save = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          program,
          sheetUrlOrId: sheetUrl,
          tabName,
          label,
        },
      }),
    onSuccess: () => {
      toast.success("Staging sheet saved");
      qc.invalidateQueries({ queryKey: ["export-target", program] });
    },
    onError: (e) =>
      toast.error(e instanceof Error ? e.message : "Failed to save staging target"),
  });

  return (
    <Panel
      title="Results export sheet (staging)"
      description="QC staging only — not the master. Master sheets in Connections are never written to."
    >
      <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Create a fresh Google Sheet for QC. Share it with{" "}
          <span className="font-mono">blue-dots-admin@blue-dots-project.iam.gserviceaccount.com</span>{" "}
          as <strong>Editor</strong>. Exports append to this sheet only — masters in Connections are protected.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="staging-sheet" className="text-xs">Staging sheet URL or ID</Label>
          <Input
            id="staging-sheet"
            value={sheetUrl}
            onChange={(e) => setSheetUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit"
            className="mt-1 font-mono text-xs"
          />
        </div>
        <div>
          <Label htmlFor="staging-tab" className="text-xs">Tab name</Label>
          <Input
            id="staging-tab"
            value={tabName}
            readOnly
            placeholder="Sheet1"
            className="mt-1"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Fixed staging tab for exports; no Staging tab is used.</p>
        </div>
        <div>
          <Label htmlFor="staging-label" className="text-xs">Label (optional)</Label>
          <Input
            id="staging-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. KKB QC June 2026"
            className="mt-1"
          />
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <div className="text-[11px] text-muted-foreground">
            {target?.sheet_id ? (
              <span className="inline-flex items-center gap-2">
                Current target: <span className="font-mono">{target.sheet_id}</span>
                <a
                  href={`https://docs.google.com/spreadsheets/d/${target.sheet_id}/edit`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-brand underline"
                >
                  open <ExternalLink className="h-3 w-3" />
                </a>
                {target.last_exported_at && (
                  <span>· last export {new Date(target.last_exported_at).toLocaleString()}</span>
                )}
              </span>
            ) : (
              <span>No staging sheet configured — exports are blocked until you save one.</span>
            )}
            {target?.last_error && (
              <p className="mt-1 text-destructive">Last error: {target.last_error}</p>
            )}
          </div>
          <Button
            className="bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => save.mutate()}
            disabled={save.isPending || !sheetUrl.trim()}
          >
            {save.isPending ? "Saving…" : "Save staging sheet"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
