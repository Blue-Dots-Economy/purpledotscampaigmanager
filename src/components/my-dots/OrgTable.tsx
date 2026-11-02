import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Info, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CoordinatorRow, OrgRow } from "@/lib/my-dots-region";
import { ACTIVITY_FORMULA, ActivityCell, ParticipantTable, SAMPLE_NOTE, SortBtn, TableShell, sortRows, useSort } from "./shared";

/** Sortable organisation → coordinator table with the participant drill dialog. Shared by district and national views. */
export function OrgTable({ orgs: input, title = "By organisation" }: { orgs: OrgRow[]; title?: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { sortKey, sortDir, toggleSort } = useSort();
  const [drill, setDrill] = useState<{ org: OrgRow; coord: CoordinatorRow } | null>(null);
  const orgs = sortRows(input, sortKey, sortDir);
  return (
    <>
        <TableShell
          title={title}
          caption={`${orgs.length} organisations · ${orgs.reduce((n, o) => n + o.coordinators.length, 0)} coordinators · ranked by activity · expand to drill in`}
        >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="uppercase text-xs tracking-wider">Organisation / Coordinator</TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Coords</TableHead>
                  <TableHead className="text-right"><SortBtn k="total" sortKey={sortKey} onToggle={toggleSort}>Purple Dots</SortBtn></TableHead>
                  <TableHead className="text-right"><SortBtn k="newInPeriod" sortKey={sortKey} onToggle={toggleSort}>New</SortBtn></TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Active %</TableHead>
                  <TableHead className="text-right uppercase text-xs tracking-wider">Inactive %</TableHead>
                  <TableHead className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <SortBtn k="activityScore" title={ACTIVITY_FORMULA} sortKey={sortKey} onToggle={toggleSort}>Activity</SortBtn>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-5 w-5" aria-label="How activity is calculated">
                            <Info className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{ACTIVITY_FORMULA}</TooltipContent>
                      </Tooltip>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((o) => {
                  const open = expanded.has(o.id);
                  const coords = sortRows(o.coordinators, sortKey, sortDir);
                  return (
                    <Fragment key={o.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() =>
                          setExpanded((s) => {
                            const n = new Set(s);
                            if (n.has(o.id)) n.delete(o.id);
                            else n.add(o.id);
                            return n;
                          })
                        }
                      >
                        <TableCell>
                          <span className="inline-flex items-center gap-2 font-medium">
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {o.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{o.coordinators.length}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.total}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.newInPeriod}</TableCell>
                        <TableCell className="text-right tabular-nums">{o.activePct}%</TableCell>
                        <TableCell className="text-right tabular-nums">{o.inactivePct}%</TableCell>
                        <TableCell><ActivityCell score={o.activityScore} /></TableCell>
                      </TableRow>
                      {open &&
                        coords.map((c) => (
                          <TableRow
                            key={c.code}
                            className="cursor-pointer bg-muted/30"
                            onClick={() => setDrill({ org: o, coord: c })}
                          >
                            <TableCell className="pl-12">
                              <span className="inline-flex items-center gap-2 font-mono text-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
                                {c.code}
                              </span>
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground">—</TableCell>
                            <TableCell className="text-right tabular-nums">{c.total}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.newInPeriod}</TableCell>
                            <TableCell className="text-right tabular-nums">{c.activePct}%</TableCell>
                            <TableCell className="text-right tabular-nums">{c.inactivePct}%</TableCell>
                            <TableCell><ActivityCell score={c.activityScore} /></TableCell>
                          </TableRow>
                        ))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
        </TableShell>

        <Dialog open={!!drill} onOpenChange={(v) => !v && setDrill(null)}>
          <DialogContent className="max-w-2xl">
            {drill && (
              <>
                <DialogHeader>
                  <DialogTitle className="font-mono">{drill.coord.code}</DialogTitle>
                  <DialogDescription>
                    {drill.org.name} · {drill.coord.total} participants · {SAMPLE_NOTE}
                  </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                  <ParticipantTable participants={drill.coord.participants} />
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
    </>
  );
}
