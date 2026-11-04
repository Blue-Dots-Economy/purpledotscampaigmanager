import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchProgramAggregates,
  syncProgramSnapshot,
  fetchKkbDropAnalysis,
  fetchCampaignList,
  fetchFunnelDurations,
  type AggregatePayload,
  type KkbDropAnalysisPayload,
  fetchKkbCallOutcomes,
  fetchProgramFilterOptions,
  type CampaignListItem,
  type CallOutcomeCount,
  type ProgramFilterOptions,
} from "@/lib/snapshot.functions";
import {
  fetchReviewCalls,
  fetchReviewMap,
  fetchExistingReviews,
  type ReviewDataset,
} from "@/lib/review.functions";
import { listReviewers } from "@/lib/reviewers.functions";
import type { ProgramConfig, ProgramId } from "./registry";
import { toast } from "sonner";


export interface OverviewFilters {
  state?: string;             // 'all' | 'GZB' | 'KA'
  dateFrom?: string | null;   // YYYY-MM-DD
  dateTo?: string | null;     // YYYY-MM-DD
  campaignType?: string;      // 'all' | 'normal' | 'higher_education'
  campaign?: string | null;   // exact campaign_type value (Campaign Review scope)
  channel?: string;           // 'all' | 'outbound' | 'inbound'
}

const STALE_AFTER_MS = 4 * 60 * 60_000; // 4 hours — on-load freshness trigger

export function useProgramAggregates(config: ProgramConfig, filters?: OverviewFilters) {
  const fn = useServerFn(fetchProgramAggregates);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const campaignType = filters?.campaignType ?? "all";
  const campaign = filters?.campaign ?? null;
  const channel = filters?.channel ?? "all";
  const query = useQuery<AggregatePayload>({
    queryKey: ["program-aggregates", config.id, state, dateFrom, dateTo, campaignType, campaign, channel],
    queryFn: () => fn({ data: { program: config.id, state, dateFrom, dateTo, campaignType, campaign, channel } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    refetchInterval: false,
    retry: 1,
    retryDelay: 1500,
  });
  return query;
}

export function useKkbDropAnalysis(filters?: OverviewFilters) {
  const fn = useServerFn(fetchKkbDropAnalysis);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const campaignType = filters?.campaignType ?? "all";
  const campaign = filters?.campaign ?? null;
  const channel = filters?.channel ?? "all";
  return useQuery<KkbDropAnalysisPayload>({
    queryKey: ["kkb-drop-analysis", state, dateFrom, dateTo, campaignType, campaign, channel],
    queryFn: () => fn({ data: { state, dateFrom, dateTo, campaignType, campaign, channel } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useKkbCallOutcomes(filters?: OverviewFilters, enabled = true) {
  const fn = useServerFn(fetchKkbCallOutcomes);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const campaignType = filters?.campaignType ?? "all";
  const campaign = filters?.campaign ?? null;
  const channel = filters?.channel ?? "all";
  return useQuery<CallOutcomeCount[]>({
    queryKey: ["kkb-call-outcomes", state, dateFrom, dateTo, campaignType, campaign, channel],
    queryFn: () => fn({ data: { state, dateFrom, dateTo, campaignType, campaign, channel } }),
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useFunnelDurations(config: ProgramConfig, filters?: OverviewFilters) {
  const fn = useServerFn(fetchFunnelDurations);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const campaignType = filters?.campaignType ?? "all";
  const campaign = filters?.campaign ?? null;
  const channel = filters?.channel ?? "all";
  return useQuery<Record<string, number>>({
    queryKey: ["funnel-durations", config.id, state, dateFrom, dateTo, campaignType, campaign, channel],
    queryFn: () => fn({ data: { program: config.id, state, dateFrom, dateTo, campaignType, campaign, channel } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useCampaignList(
  config: ProgramConfig,
  filters?: Pick<OverviewFilters, "state" | "dateFrom" | "dateTo" | "channel">,
) {
  const fn = useServerFn(fetchCampaignList);
  const state = filters?.state ?? "all";
  const dateFrom = filters?.dateFrom ?? null;
  const dateTo = filters?.dateTo ?? null;
  const channel = filters?.channel ?? "all";
  return useQuery<CampaignListItem[]>({
    queryKey: ["campaign-list", config.id, state, dateFrom, dateTo, channel],
    queryFn: () => fn({ data: { program: config.id, state, dateFrom, dateTo, channel } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useSyncProgram(programId: ProgramId) {
  const qc = useQueryClient();
  const fn = useServerFn(syncProgramSnapshot);
  return useMutation({
    mutationFn: (vars?: { force?: boolean; silent?: boolean }) =>
      fn({ data: { program: programId, force: vars?.force ?? false } }).then((r) => ({
        ...r,
        silent: vars?.silent ?? false,
      })),
    onSuccess: (res) => {
      // Invalidate every query — a sync can change the rows underlying
      // aggregates, campaign lists, drop analysis, funnel durations, and
      // campaign cause breakdowns. Narrow key invalidation missed most of
      // these and made Refresh feel like a no-op.
      qc.invalidateQueries();
      if (res.silent) return;
      if (res.skipped) return; // a sync was already running — nothing to brag about
      if (res.ok) toast.success(`Synced · ${res.rowCount} rows`);
      else if (res.errors.length > 0) toast.error(res.errors[0].message);

    },
    onError: (e, vars) => {
      if (vars?.silent) return;
      toast.error(e instanceof Error ? e.message : "Sync failed");
    },
  });
}

/**
 * Auto-trigger a background sync when the visible snapshot is older than
 * STALE_AFTER_MS. Non-blocking — the current snapshot stays on screen and the
 * aggregates refetch when the sync finishes.
 */
export function useAutoFreshness(programId: ProgramId, lastSyncedAt: string | null | undefined) {
  const sync = useSyncProgram(programId);
  useEffect(() => {
    if (sync.isPending) return;
    const ageMs = lastSyncedAt ? Date.now() - new Date(lastSyncedAt).getTime() : Infinity;
    if (ageMs > STALE_AFTER_MS) {
      sync.mutate({ silent: true });
    }
    // We intentionally only re-run when the program or the timestamp changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, lastSyncedAt]);
  return sync;
}

export function useReviewCalls(dataset: ReviewDataset) {
  const fn = useServerFn(fetchReviewCalls);
  return useQuery<Array<Record<string, string>>>({
    queryKey: ["review-calls", dataset],
    queryFn: () => fn({ data: { dataset } }),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useReviewMap() {
  const fn = useServerFn(fetchReviewMap);
  return useQuery<
    Array<{ call_id: string | null; job_id: string | null; reviewer_email: string | null }>
  >({
    queryKey: ["review-map"],
    queryFn: () => fn({}),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useExistingReviews(callId?: string | null, jobId?: string | null) {
  const fn = useServerFn(fetchExistingReviews);
  const enabled = Boolean((callId ?? "").trim() || (jobId ?? "").trim());
  return useQuery<
    Array<{
      reviewer_email: string | null;
      reviewer_name: string | null;
      overall_rating: number | null;
      quantitative_issues: string | null;
      reviewer_notes: string | null;
      turn_flags: string | null;
      created_at: string;
    }>
  >({
    queryKey: ["existing-reviews", callId ?? null, jobId ?? null],
    queryFn: () => fn({ data: { callId: callId ?? null, jobId: jobId ?? null } }),
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}


export function useReviewers() {
  const fn = useServerFn(listReviewers);
  return useQuery<string[]>({
    queryKey: ["reviewers"],
    queryFn: () => fn({}),
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}

export function useProgramFilterOptions(config: ProgramConfig) {
  const fn = useServerFn(fetchProgramFilterOptions);
  return useQuery<ProgramFilterOptions>({
    queryKey: ["program-filter-options", config.id],
    queryFn: () => fn({ data: { program: config.id } }),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 1500,
  });
}
