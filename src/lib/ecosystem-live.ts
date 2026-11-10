// Live Ecosystem View data mapping — pure functions, no server imports.
// Source: Purple RPCs get_ecosystem_categories / get_ecosystem_provider_types /
// get_ecosystem_totals / get_ecosystem_matching, fetched in ecosystem.functions.ts.
// Matching has a live source; null counts mean match data is not loaded.
//
// Fields with no live source are null (rendered as "—"), never fabricated:
// - capacity (no record of how many people a provider can serve)

export interface EcosystemCategory {
  category: string;
  seekersWanting: number;
  providersOffering: number;
  connectedSeekers: number;
  matchedSeekers: number | null;
  strongMatches: number | null;
  matchesComputedAt: string | null;
}

export interface EcosystemProviderType {
  providerType: string;
  providers: number;
  connectedProviders: number;
  connections: number;
}

export interface EcosystemTotalsLive {
  totalSeekers: number;
  totalProviders: number;
  seekersWithNeeds: number;
  providersWithOffer: number;
  totalConnections: number;
  connectedSeekers: number;
  connectedProviders: number;
  consentAcknowledged: number;
  consentRefused: number;
  firstConnection: string; // ISO date
  lastConnection: string; // ISO date
}

export interface EcosystemOverview {
  categories: EcosystemCategory[];
  providerTypes: EcosystemProviderType[];
  totals: EcosystemTotalsLive;
}

/** Seekers wanting a category who have no connection yet. */
export const unconnectedDemand = (c: EcosystemCategory): number =>
  Math.max(0, c.seekersWanting - c.connectedSeekers);

/** Demand a provider cannot meet well: seekers wanting a service with no
 *  high-confidence match available. Null while match data is not loaded. */
export const unmatchedDemand = (c: EcosystemCategory): number | null =>
  c.strongMatches === null ? null : Math.max(0, c.seekersWanting - c.strongMatches);

export function totalUnmatchedDemand(categories: EcosystemCategory[]): number | null {
  if (categories.some((c) => c.strongMatches === null)) return null;
  return categories.reduce((a, c) => a + (unmatchedDemand(c) ?? 0), 0);
}

export interface ProviderGapRow {
  category: string;
  providers: number;
  strongMatches: number | null;
  matching: number | null;
  demandSupplyGap: number | null;
  connectedSeekers: number;
  /** Real demand behind the action gap and its level (not shown as "Matching"). */
  demand: number;
  actionGap: number;
}

export interface SeekerGapRow {
  area: string;
  /** Providers offering this category — the organisations reaching these seekers. */
  aggregators: number;
  /** Seekers wanting this category. */
  reach: number;
  matching: number | null;
  strongMatches: number | null;
  demandSupplyGap: number | null;
  connectedSeekers: number;
  /** Same as reach; kept separate so gap levels are computed on demand. */
  demand: number;
  actionGap: number;
}

export function toProviderGapRows(categories: EcosystemCategory[]): ProviderGapRow[] {
  return categories.map((c) => ({
    category: c.category,
    providers: c.providersOffering,
    strongMatches: c.strongMatches,
    matching: c.matchedSeekers,
    demandSupplyGap: unmatchedDemand(c),
    connectedSeekers: c.connectedSeekers,
    demand: c.seekersWanting,
    actionGap: unconnectedDemand(c),
  }));
}

export function toSeekerGapRows(categories: EcosystemCategory[]): SeekerGapRow[] {
  return categories.map((c) => ({
    area: c.category,
    aggregators: c.providersOffering,
    reach: c.seekersWanting,
    matching: c.matchedSeekers,
    strongMatches: c.strongMatches,
    demandSupplyGap: unmatchedDemand(c),
    connectedSeekers: c.connectedSeekers,
    demand: c.seekersWanting,
    actionGap: unconnectedDemand(c),
  }));
}

/** Real demand-supply gap: seekers wanting a category with no connection yet. */
export function totalSeekerDemandGap(categories: EcosystemCategory[]): number {
  return categories.reduce((a, c) => a + unconnectedDemand(c), 0);
}

export function seekersWithoutNeeds(t: EcosystemTotalsLive): number {
  return Math.max(0, t.totalSeekers - t.seekersWithNeeds);
}

/** "7–29 Oct 2026" style window for the live-data chip. */
export function connectionWindowLabel(first: string, last: string): string {
  const fmt = (iso: string, withYear: boolean) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" as const } : {}),
      timeZone: "UTC",
    });
  return `${fmt(first, false)} – ${fmt(last, true)}`;
}
