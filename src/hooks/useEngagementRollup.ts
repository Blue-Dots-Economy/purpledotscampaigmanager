import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchEngagementRollup } from "@/lib/engagement-rollup.functions";
import type { ParticipantDomain } from "@/lib/participant-rollup";

type EngagementFetcher = (options: Parameters<typeof fetchEngagementRollup>[0]) => ReturnType<typeof fetchEngagementRollup>;
export function engagementRollupQueryOptions(actor: string, domain: ParticipantDomain, fetcher: EngagementFetcher = fetchEngagementRollup) {
  return queryOptions({ queryKey: ["engagement-rollup", actor, domain], queryFn: () => fetcher({ data: { domain } }), staleTime: 60_000, retry: false });
}
export function useEngagementRollup(actor: string, domain: ParticipantDomain) {
  const fetcher = useServerFn(fetchEngagementRollup);
  const query = useSuspenseQuery(engagementRollupQueryOptions(actor, domain, fetcher));
  if (query.error) throw query.error;
  return query;
}
