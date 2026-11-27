import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Panel } from "@/components/Panel";
import { MetricCard } from "@/components/metrics/MetricCard";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchCohortOptions, fetchCohortPreview } from "@/lib/cohort.functions";
import { buildCohortFilter, districtsForStates, districtsAfterStateChange, type CohortUiState, type CohortArrayKey, type LockedCohort } from "@/lib/cohort-live";

const selectors = [
  ["orgs", "Organisation"], ["states", "State"], ["districts", "District"], ["lifecycle", "Profile status"],
] as const;
const fmt = (n: number) => n.toLocaleString("en-IN");

export function PickCohort({ state, onChange, locked, onUse }: {
  state: CohortUiState; onChange: (state: CohortUiState) => void; locked: LockedCohort | null; onUse: (cohort: LockedCohort) => void;
}) {
  const optionsFn = useServerFn(fetchCohortOptions);
  const previewFn = useServerFn(fetchCohortPreview);
  const options = useQuery({ queryKey: ["launch-cohort-options"], queryFn: () => optionsFn(), staleTime: 15_000, retry: false });
  const parsed = useMemo(() => {
    try { return { filter: buildCohortFilter(state), error: null }; }
    catch (error) { return { filter: null, error: error instanceof Error ? error.message : "Invalid filters." }; }
  }, [state]);
  const key = parsed.filter ? JSON.stringify(parsed.filter) : null;
  const [debouncedKey, setDebouncedKey] = useState(key);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKey(key), 400);
    return () => clearTimeout(timer);
  }, [key]);
  const preview = useQuery({
    queryKey: ["launch-cohort-preview", debouncedKey],
    queryFn: () => previewFn({ data: JSON.parse(debouncedKey ?? "{}") }),
    enabled: !!options.data && debouncedKey !== null && key === debouncedKey,
    staleTime: 15_000, retry: false,
  });
  const waiting = key !== debouncedKey || preview.isFetching;
  const ready = !!parsed.filter && !!preview.data && !waiting && !preview.isError && !!options.data;
  const allDistricts = options.data?.districts ?? [];
  const selectedStates = state.states ?? [];
  const set = (key: CohortArrayKey | "needs_only", value: string[] | boolean) => onChange({ ...state, [key]: value });

  return (
    <Panel title="Step 3 · Pick a cohort" description="Choose people from the live database — the DPG places the calls"
      action={preview.data && waiting ? <span role="status" className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</span> : undefined}>
      {options.isPending && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading filters…</p>}
      {options.isError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>Cohort filters could not be loaded.</p><Button variant="outline" onClick={() => options.refetch()}>Retry</Button></div>}
      {options.data && <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {selectors.map(([key, label]) => key === "districts"
            ? <MultiSelect key={key} label={label} values={districtsForStates(allDistricts, selectedStates)} selected={state.districts ?? []} onChange={values => set(key, values)} />
            : <MultiSelect key={key} label={label} values={options.data[key]} selected={state[key] ?? []} onChange={values => key === "states"
              ? onChange({ ...state, states: values, districts: districtsAfterStateChange(allDistricts, selectedStates, values, state.districts ?? []) })
              : set(key, values)} />)}
        </div>
        <div className="mt-4 flex items-center gap-2"><Switch id="cohort-needs-only" checked={state.needs_only ?? false} onCheckedChange={value => set("needs_only", value)} /><Label htmlFor="cohort-needs-only">Only people with a recorded need</Label></div>
        {parsed.error && <p role="alert" className="mt-3 text-sm text-destructive">{parsed.error}</p>}
        <div className="mt-6 border-t border-border pt-4" aria-live="polite" aria-busy={waiting}>
          {preview.isPending && !parsed.error && <p role="status" className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Counting people…</p>}
          {preview.isError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>Cohort preview could not be loaded.</p><Button variant="outline" onClick={() => preview.refetch()}>Retry</Button></div>}
          {preview.data && <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard label="People matched" value={preview.data.total} sub={`${fmt(preview.data.with_needs)} have a recorded need`} />
              <MetricCard label="Never called" value={preview.data.never_called} sub="no call history" />
              <MetricCard label="Called before" value={preview.data.called_before} sub="would be re-contacted" />
              <MetricCard label="Known location" value={preview.data.located_total} sub={`${preview.data.total ? Math.round((preview.data.located_total / preview.data.total) * 100) : 0}% of the cohort`} />
            </div>
            <h5 className="mb-2 mt-5 text-sm font-medium">Sample · {preview.data.sample.length} of {fmt(preview.data.total)}</h5>
            <div className="overflow-x-auto"><Table>
              <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">{["Item ID", "Organisation", "State", "District", "Band", "Calls made", "Completion", "Last call date", "Categories"].map(label => <TableHead key={label} className="whitespace-nowrap text-xs uppercase tracking-wider">{label}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{preview.data.sample.map(row => <TableRow key={row.item_id}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{row.item_id}</TableCell>
                <TableCell className="min-w-40">{row.org_name ?? "—"}</TableCell><TableCell>{row.state ?? "—"}</TableCell><TableCell>{row.district ?? "—"}</TableCell><TableCell>{row.band ?? "—"}</TableCell><TableCell className="tabular-nums">{row.calls_made}</TableCell><TableCell className="tabular-nums">{row.completion ?? "—"}</TableCell><TableCell className="whitespace-nowrap">{row.last_call_date ?? "—"}</TableCell><TableCell className="min-w-40">{row.categories.join(", ") || "—"}</TableCell>
              </TableRow>)}{preview.data.sample.length === 0 && <TableRow><TableCell colSpan={9} className="text-muted-foreground">No people match these filters.</TableCell></TableRow>}</TableBody>
            </Table></div>
          </>}
          <Button className="mt-4 gap-2" disabled={!ready || !preview.data?.total || !!locked} onClick={() => {
            if (!ready || !parsed.filter || !preview.data) return;
            onUse({ filter: parsed.filter, total: preview.data.total });
          }}><Check className="h-4 w-4" />{locked ? "Cohort selected" : "Use this cohort"}</Button>
        </div>
      </>}
    </Panel>
  );
}

function MultiSelect({ label, values, selected, onChange }: { label: string; values: string[]; selected: string[]; onChange: (values: string[]) => void }) {
  const [search, setSearch] = useState("");
  const visible = values.filter(value => value.toLowerCase().includes(search.toLowerCase()));
  return <div className="min-w-0 space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <Popover><PopoverTrigger asChild><Button variant="outline" aria-label={label} className="w-full justify-between gap-2"><span className="truncate">{selected.length ? selected.join(", ") : "All"}</span><ChevronDown className="h-4 w-4 shrink-0" /></Button></PopoverTrigger>
      <PopoverContent align="start" className="max-w-[calc(100vw-2rem)] space-y-3">
        <Input aria-label={`Search ${label}`} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        <div className="max-h-64 space-y-3 overflow-y-auto">{visible.map(value => <Label key={value} className="flex cursor-pointer items-start gap-2 text-sm"><Checkbox checked={selected.includes(value)} onCheckedChange={checked => onChange(checked === true ? [...selected, value] : selected.filter(s => s !== value))} /><span className="min-w-0 break-words">{value}</span></Label>)}{!visible.length && <p className="text-xs text-muted-foreground">No matching values.</p>}</div>
        {!!selected.length && <Button variant="ghost" size="sm" onClick={() => onChange([])}>Clear selection</Button>}
      </PopoverContent>
    </Popover>
  </div>;
}