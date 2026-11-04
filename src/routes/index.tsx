import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { overviewDefaultDateRange } from "@/lib/overview-date-range";
import { useProgram } from "@/programs/context";
import { useProgramAggregates } from "@/programs/useProgramAggregates";
import { ProgramAnalytics } from "@/components/metrics/ProgramAnalytics";
import {
  OverviewFilters,
  type OverviewFilterValue,
} from "@/components/metrics/OverviewFilters";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campaign Overview | Purple Dots" },
      { name: "description", content: "Purple Dots campaign performance, funnel and drop analysis for the selected date range." },
      { property: "og:title", content: "Campaign Overview | Purple Dots" },
      { property: "og:description", content: "Purple Dots campaign performance, funnel and drop analysis for the selected date range." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { config } = useProgram();
  const [filters, setFilters] = useState<OverviewFilterValue>(() => ({
    state: "all",
    ...overviewDefaultDateRange(),
    campaignType: "all",
    channel: "all",
  }));
  const query = useProgramAggregates(config, filters);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <OverviewFilters value={filters} onChange={setFilters} showChannel districtScope={query.data?.districtScope} />
        {query.isFetching && (
          <span className="text-xs text-muted-foreground">Updating…</span>
        )}
      </div>
      <ProgramAnalytics
        config={config}
        filters={filters}
        onClearFilters={() =>
          setFilters({
            state: "all",
            dateFrom: null,
            dateTo: null,
            campaignType: "all",
            channel: "all",
          })
        }
      />
    </div>
  );
}
