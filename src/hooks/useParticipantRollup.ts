import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchParticipantRollup } from "@/lib/participant-rollup.functions";
import type { ParticipantDomain } from "@/lib/participant-rollup";

export function participantRollupQueryOptions(actor: string, domain: ParticipantDomain, fetcher: typeof fetchParticipantRollup = fetchParticipantRollup) {
  return queryOptions({ queryKey: ["real-participant-rollup", actor, domain], queryFn: () => fetcher({ data: { domain } }), staleTime: 60_000, retry: false });
}
export function useParticipantRollup(actor: string, domain: ParticipantDomain) {
  const fetcher = useServerFn(fetchParticipantRollup);
  return useSuspenseQuery(participantRollupQueryOptions(actor, domain, fetcher));
}