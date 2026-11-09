import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { fetchProfileSignal } from "@/lib/profile-signal.functions";

/** Non-suspending: the organisation table renders immediately; the filter enables once counts arrive. */
export function useProfileSignal(actor: string, enabled: boolean) {
  const fetcher = useServerFn(fetchProfileSignal);
  return useQuery({ queryKey: ["profile-signal", actor], queryFn: () => fetcher(), enabled, staleTime: 5 * 60_000, retry: false });
}
