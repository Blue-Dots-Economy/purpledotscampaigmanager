import { queryOptions, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchEcosystemOverview } from "@/lib/ecosystem.functions";

type EcosystemFetcher = () => ReturnType<typeof fetchEcosystemOverview>;

export function ecosystemOverviewQueryOptions(fetcher: EcosystemFetcher = fetchEcosystemOverview) {
  return queryOptions({ queryKey: ["ecosystem-overview"], queryFn: () => fetcher(), staleTime: 60_000, retry: false });
}

export function useEcosystemOverview() {
  const fetcher = useServerFn(fetchEcosystemOverview);
  return useQuery(ecosystemOverviewQueryOptions(fetcher));
}
