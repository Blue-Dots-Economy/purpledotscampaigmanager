import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchProfileSignal } from "@/lib/profile-signal.functions";

export function useProfileSignal(actor: string) {
  const fetcher = useServerFn(fetchProfileSignal);
  const query = useSuspenseQuery(queryOptions({ queryKey: ["profile-signal", actor], queryFn: () => fetcher(), staleTime: 5 * 60_000, retry: false }));
  if (query.error) throw query.error;
  return query;
}
