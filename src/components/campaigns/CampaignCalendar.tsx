import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { humanizeCampaignType } from "@/lib/campaign-name";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface CalendarCampaign {
  campaignType: string;
  campaignDate: string | null;
  region: string | null;
  totalCalls: number;
  answered: number;
  engaged: number;
  converted: number;
}

type Channel = string;

function parseCampaignDate(s: string | null): Date | null {
  if (!s) return null;
  const raw = String(s).trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function regionKey(region: string | null): "gzb" | "ka" | "other" {
  const r = (region ?? "").trim().toLowerCase();
  if (r.includes("gzb") || r.includes("ghaziabad")) return "gzb";
  if (r === "ka" || r.includes("kanpur") || r.includes("karnataka")) return "ka";
  return "other";
}

const CHIP_STYLES: Record<string, string> = {
  gzb: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/25",
  ka: "bg-[#2461a6]/15 text-[#2461a6] dark:text-[#7fb0e6] border-[#2461a6]/30 hover:bg-[#2461a6]/25",
  other: "bg-muted text-muted-foreground border-border hover:bg-muted/70",
};
const DOT_STYLES: Record<string, string> = {
  gzb: "bg-emerald-500",
  ka: "bg-[#2461a6]",
  other: "bg-muted-foreground/50",
};

function shortName(campaignType: string): string {
  return humanizeCampaignType(campaignType).replace(/^KKB\s*·\s*/i, "");
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CampaignCalendar({
  campaigns,
  channel,
}: {
  campaigns: CalendarCampaign[];
  channel: Channel;
}) {
  const { dated, undated, latest } = useMemo(() => {
    const dated: { date: Date; c: CalendarCampaign }[] = [];
    const undated: CalendarCampaign[] = [];
    for (const c of campaigns) {
      const d = parseCampaignDate(c.campaignDate);
      if (d) dated.push({ date: d, c });
      else undated.push(c);
    }
    const latest = dated.reduce<Date | null>(
      (acc, x) => (!acc || x.date > acc ? x.date : acc),
      null,
    );
    return { dated, undated, latest };
  }, [campaigns]);

  const [monthOffset, setMonthOffset] = useState(0);
  const baseMonth = useMemo(() => startOfMonth(latest ?? new Date()), [latest]);
  const month = addMonths(baseMonth, monthOffset);

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);
  const freshCutoff = today.getTime() - 7 * 86400000;

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 0 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 0 });
  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = new Date(d.getTime() + 86400000)) {
    days.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarCampaign[]>();
    for (const { date, c } of dated) {
      const key = format(date, "yyyy-MM-dd");
      const arr = map.get(key);
      if (arr) arr.push(c);
      else map.set(key, [c]);
    }
    return map;
  }, [dated]);

  const isFresh = (c: CalendarCampaign) => {
    const d = parseCampaignDate(c.campaignDate);
    return !!d && d.getTime() >= freshCutoff && d.getTime() <= today.getTime();
  };

  const linkProps = (c: CalendarCampaign) => ({
    to: "/campaigns/$campaign" as const,
    params: { campaign: c.campaignType },
    search: {
      date: c.campaignDate ?? undefined,
      channel: channel === "all" ? undefined : channel,
    },
  });

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{format(month, "MMMM yyyy")}</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setMonthOffset((o) => o - 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMonthOffset(0)}
              className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              Latest
            </button>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setMonthOffset((o) => o + 1)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[720px]">
            <div className="grid grid-cols-7 border-b border-border">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const items = byDay.get(key) ?? [];
                const inMonth = isSameMonth(day, month);
                const visible = items.slice(0, 2);
                const overflow = items.length - visible.length;
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-[104px] border-b border-r border-border p-1.5 space-y-1",
                      !inMonth && "bg-muted/20",
                    )}
                  >
                    <div
                      className={cn(
                        "text-[11px] tabular-nums px-0.5",
                        inMonth ? "text-foreground" : "text-muted-foreground/50",
                        isSameDay(day, today) &&
                          "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand text-brand-foreground font-semibold",
                      )}
                    >
                      {format(day, "d")}
                    </div>
                    {visible.map((c, i) => {
                      const rk = regionKey(c.region);
                      return (
                        <Link
                          key={`${c.campaignType}-${i}`}
                          {...linkProps(c)}
                          title={humanizeCampaignType(c.campaignType)}
                          className={cn(
                            "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] transition-colors",
                            CHIP_STYLES[rk],
                          )}
                        >
                          <span className="truncate flex-1">{shortName(c.campaignType)}</span>
                          {isFresh(c) && (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                          )}
                        </Link>
                      );
                    })}
                    {overflow > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="w-full rounded px-1.5 py-0.5 text-left text-[11px] text-muted-foreground hover:bg-muted"
                          >
                            +{overflow} more
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80 p-2">
                          <div className="px-2 py-1 text-xs font-semibold">
                            {format(day, "MMM d, yyyy")} · {items.length} campaigns
                          </div>
                          <ul className="max-h-72 overflow-y-auto">
                            {items.map((c, i) => {
                              const rk = regionKey(c.region);
                              return (
                                <li key={`${c.campaignType}-row-${i}`}>
                                  <Link
                                    {...linkProps(c)}
                                    className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                                  >
                                    <span
                                      className={cn(
                                        "h-2 w-2 shrink-0 rounded-full",
                                        DOT_STYLES[rk],
                                      )}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="flex items-center gap-1.5">
                                        <span className="truncate text-xs font-medium">
                                          {shortName(c.campaignType)}
                                        </span>
                                        {isFresh(c) && (
                                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                                        )}
                                      </span>
                                      <span className="block text-[11px] text-muted-foreground tabular-nums">
                                        {c.totalCalls.toLocaleString()} calls ·{" "}
                                        {c.converted.toLocaleString()} conv
                                      </span>
                                    </span>
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4 px-4 py-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> GZB
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2461a6]" /> KA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> New — run in the last 7 days
          </span>
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Undated campaigns · {undated.length}
          </h4>
          <ul className="mt-2 divide-y divide-border">
            {undated.map((c, i) => (
              <li key={`${c.campaignType}-und-${i}`}>
                <Link
                  {...linkProps(c)}
                  className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-muted/40 rounded-md px-1"
                >
                  <span className="truncate">{humanizeCampaignType(c.campaignType)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {c.totalCalls.toLocaleString()} calls · {c.converted.toLocaleString()} conv
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
