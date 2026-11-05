import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchGeoRollup } from "@/lib/geo-rollup.functions";
import type { ParticipantDomain } from "@/lib/participant-rollup";

type GeoFetcher = (options: Parameters<typeof fetchGeoRollup>[0]) => ReturnType<typeof fetchGeoRollup>;
export function geoRollupQueryOptions(actor: string, domain: ParticipantDomain, fetcher: GeoFetcher = fetchGeoRollup) {
  return queryOptions({ queryKey: ["geo-rollup", actor, domain], queryFn: () => fetcher({ data: { domain } }), staleTime: 60_000, retry: false });
}
export function useGeoRollup(actor: string, domain: ParticipantDomain) {
  const fetcher = useServerFn(fetchGeoRollup);
  const query = useSuspenseQuery(geoRollupQueryOptions(actor, domain, fetcher));
  if (query.error) throw query.error;
  return query;
}
