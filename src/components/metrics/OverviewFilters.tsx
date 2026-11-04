import { useMemo, useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useProgram } from "@/programs/context";
import { useProgramFilterOptions } from "@/programs/useProgramAggregates";
import type { CampaignDistrictScope } from "@/lib/campaign-district-scope";
import { campaignChannelOptions } from "@/lib/campaign-channel";

export type StateValue = string;
export type CampaignTypeValue = string;
export type ChannelValue = string;

export interface OverviewFilterValue {
  state: StateValue;
  dateFrom: string | null; // YYYY-MM-DD
  dateTo: string | null;
  campaignType: CampaignTypeValue;
  channel: ChannelValue;
}



const fmt = (d: Date) => format(d, "yyyy-MM-dd");

// Parse a YYYY-MM-DD string as a LOCAL date (avoid UTC shift from new Date("YYYY-MM-DD")).
const parseLocal = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
};

export function OverviewFilters({
  value,
  onChange,
  showChannel = false,
  districtScope,
}: {
  value: OverviewFilterValue;
  onChange: (next: OverviewFilterValue) => void;
  showChannel?: boolean;
  districtScope?: CampaignDistrictScope;
}) {
  const [open, setOpen] = useState(false);
  const { config } = useProgram();
  const { data: options } = useProgramFilterOptions(config);
  const channelOptions = campaignChannelOptions(options?.channels);
  const stateOptions = useMemo(
    () => [{ value: "all", label: "All states" }, ...(options?.cities ?? []).map((c) => ({ value: c, label: c }))],
    [options?.cities],
  );

  const range: DateRange | undefined = useMemo(() => {
    if (!value.dateFrom && !value.dateTo) return undefined;
    return {
      from: value.dateFrom ? parseLocal(value.dateFrom) : undefined,
      to: value.dateTo ? parseLocal(value.dateTo) : undefined,
    };
  }, [value.dateFrom, value.dateTo]);

  const dateLabel = useMemo(() => {
    if (!value.dateFrom && !value.dateTo) return "All time";
    if (value.dateFrom && value.dateTo && value.dateFrom === value.dateTo) {
      return format(parseLocal(value.dateFrom), "MMM d, yyyy");
    }
    const f = value.dateFrom ? format(parseLocal(value.dateFrom), "MMM d, yyyy") : "…";
    const t = value.dateTo ? format(parseLocal(value.dateTo), "MMM d, yyyy") : "…";
    return `${f} → ${t}`;
  }, [value.dateFrom, value.dateTo]);


  const setPreset = (days: number | null) => {
    if (days === null) {
      onChange({ ...value, dateFrom: null, dateTo: null });
    } else {
      const to = new Date();
      const from = subDays(to, days - 1);
      onChange({ ...value, dateFrom: fmt(from), dateTo: fmt(to) });
    }
    setOpen(false);
  };

  const isClearable =
    value.dateFrom ||
    value.dateTo ||
    value.state !== "all" ||
    (showChannel && value.channel !== "all");

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* State segmented control */}
      {districtScope?.district ? (
        <Button variant="outline" size="sm" disabled aria-label={`District: ${districtScope.district}`}>
          District: {districtScope.district}
        </Button>
      ) : (options?.cities.length ?? 0) > 0 && (
      <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
        {stateOptions.map((opt) => {
          const active = value.state === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange({ ...value, state: opt.value })}
              className={cn(
                "px-3 py-1.5 rounded transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      )}

      {/* Channel segmented control (KKB only) */}
      {showChannel && (options?.channels.length ?? 0) >= 2 && (
        <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
          {channelOptions.map((opt) => {
            const active = value.channel === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...value, channel: opt.value })}
                className={cn(
                  "px-3 py-1.5 rounded transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Date range */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-2 text-xs font-normal",
              !value.dateFrom && !value.dateTo && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            {dateLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
          <div className="flex flex-col sm:flex-row">
            <div className="flex flex-col gap-1 border-b sm:border-b-0 sm:border-r border-border p-2 text-xs min-w-[140px]">
              <button
                type="button"
                className="text-left px-2 py-1.5 rounded hover:bg-muted"
                onClick={() => setPreset(null)}
              >
                All time
              </button>
              <button
                type="button"
                className="text-left px-2 py-1.5 rounded hover:bg-muted"
                onClick={() => setPreset(7)}
              >
                Last 7 days
              </button>
              <button
                type="button"
                className="text-left px-2 py-1.5 rounded hover:bg-muted"
                onClick={() => setPreset(30)}
              >
                Last 30 days
              </button>
            </div>
            <Calendar
              mode="range"
              numberOfMonths={2}
              selected={range}
              onSelect={(r) => {
                const from = r?.from ? fmt(r.from) : null;
                // Single-day click: react-day-picker leaves `to` undefined until the second click.
                // Treat the first click as a single-day selection so the filter applies immediately.
                const to = r?.to ? fmt(r.to) : from;
                onChange({
                  ...value,
                  dateFrom: from,
                  dateTo: to,
                });
              }}

              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </div>
        </PopoverContent>
      </Popover>

      {isClearable && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground"
          onClick={() => onChange({ state: "all", dateFrom: null, dateTo: null, campaignType: "all", channel: "all" })}
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}
