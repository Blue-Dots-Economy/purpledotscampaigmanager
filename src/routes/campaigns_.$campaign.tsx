import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import type { ChannelValue } from "@/components/metrics/OverviewFilters";
import { format } from "date-fns";
import { useProgram } from "@/programs/context";
import { useCampaignList } from "@/programs/useProgramAggregates";
import { ProgramAnalytics } from "@/components/metrics/ProgramAnalytics";
import { CampaignVerdict } from "@/components/campaigns/CampaignVerdict";
import { CampaignSuccess } from "@/components/campaigns/CampaignSuccess";
import { CampaignVerdictDkb } from "@/components/campaigns/CampaignVerdictDkb";
import { CampaignSuccessDkb } from "@/components/campaigns/CampaignSuccessDkb";
import { humanizeCampaignType } from "@/lib/campaign-name";
import { LoadingState, NoDataState, QueryErrorState } from "@/components/EmptyState";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/campaigns_/$campaign")({
  validateSearch: (s: Record<string, unknown>) => ({
    date: typeof s.date === "string" ? s.date : undefined,
    channel:
      s.channel === "outbound" || s.channel === "inbound" || s.channel === "all"
        ? s.channel
        : undefined,
  }),
  component: CampaignReviewDetail,
  head: () => ({ meta: [
    { title: "Campaign analysis | Purple Dots" },
    { name: "description", content: "Purple Dots campaign funnel, outcomes and regional comparisons." },
    { property: "og:title", content: "Campaign analysis | Purple Dots" },
    { property: "og:description", content: "Purple Dots campaign funnel, outcomes and regional comparisons." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});


function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function CampaignReviewDetail() {
  const { campaign: rawCampaign } = Route.useParams();
  const { date, channel } = Route.useSearch();
  const channelFilter = (channel ?? "all") as ChannelValue;
  const navigate = useNavigate();
  const { config } = useProgram();
  const { data: campaigns, isLoading, error, refetch } = useCampaignList(config, { channel: channelFilter });


  const sorted = useMemo(
    () =>
      (campaigns ?? [])
        .slice()
        .sort((a, b) => (b.campaignDate ?? "").localeCompare(a.campaignDate ?? "")),
    [campaigns],
  );
  const current =
    sorted.find(
      (c) => c.campaignType === rawCampaign && (date ? c.campaignDate === date : true),
    ) ?? sorted.find((c) => c.campaignType === rawCampaign);

  if (isLoading && !campaigns) return <LoadingState />;
  if (error) return <QueryErrorState error={{ code: "CAMPAIGN_ACCESS", message: error.message }} onRetry={() => void refetch()} />;

  if (!current) {
    return (
      <div className="space-y-4">
        <Link
          to="/campaigns"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All campaigns
        </Link>
        <NoDataState reason="no_results" />
      </div>
    );
  }

  const region = current.region ?? null;
  const scopeDate = current.campaignDate ?? null;
  const detailFilters = { dateFrom: scopeDate, dateTo: scopeDate, channel: channelFilter };
  const dateLabel = (() => {
    const d = parseDate(current.campaignDate);
    return d ? format(d, "MMM d, yyyy") : "—";
  })();
  const label = region ?? "all";
  const currentComposite = `${current.campaignType} ${current.campaignDate ?? ""}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <Link
            to="/campaigns"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All campaigns
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1 truncate">
            {humanizeCampaignType(current.campaignType)}
          </h1>
          <div className="text-sm text-muted-foreground mt-0.5">
            {dateLabel}
            {region ? ` · ${region}` : ""}
          </div>
        </div>
        <div className="w-72 max-w-full">
          <Select
            value={currentComposite}
            onValueChange={(v) => {
              const idx = v.indexOf(" ");
              const type = idx === -1 ? v : v.slice(0, idx);
              const d = idx === -1 ? "" : v.slice(idx + 1);
              navigate({
                to: "/campaigns/$campaign",
                params: { campaign: type },
                search: { date: d || undefined, channel: channel ?? undefined },
              });

            }}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Switch campaign" />
              <ChevronDown className="h-4 w-4 opacity-50" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
              {sorted.map((c) => (
                <SelectItem
                  key={`${c.campaignType}__${c.campaignDate ?? "nodate"}`}
                  value={`${c.campaignType} ${c.campaignDate ?? ""}`}
                >
                  {humanizeCampaignType(c.campaignType)}
                  {c.campaignDate ? ` · ${c.campaignDate}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {config.id === "seekers" && (
        <>
          <CampaignSuccess
            campaign={current.campaignType}
            language={current.language ?? null}
            region={region}
            campaignDate={current.campaignDate ?? null}
            filters={detailFilters}
          />
          <CampaignVerdict
            campaign={current.campaignType}
            region={region}
            filters={detailFilters}
          />
        </>
      )}

      {config.id === "providers" && (
        <>
          <CampaignSuccessDkb
            campaign={current.campaignType}
            language={current.language ?? null}
            region={region}
            campaignDate={current.campaignDate ?? null}
            filters={detailFilters}
          />
          <CampaignVerdictDkb
            campaign={current.campaignType}
            region={region}
            filters={detailFilters}
          />
        </>
      )}


      <ProgramAnalytics
        config={config}
        filters={{ state: "all", dateFrom: scopeDate, dateTo: scopeDate, campaignType: "all", channel: channelFilter }}
        campaign={current.campaignType}
        comparison={{ mode: "state-average", region, label }}
      />

    </div>
  );
}
