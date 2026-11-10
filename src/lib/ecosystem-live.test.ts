import { describe, expect, it } from "vitest";
import {
  connectionWindowLabel,
  seekersWithoutNeeds,
  toProviderGapRows,
  toSeekerGapRows,
  totalSeekerDemandGap,
  unconnectedDemand,
  unmatchedDemand,
  totalUnmatchedDemand,
  type EcosystemCategory,
  type EcosystemTotalsLive,
} from "./ecosystem-live";

// Spot values verified against the live Purple RPCs on 2026-11-02.
const ASSISTIVE: EcosystemCategory = {
  category: "Assistive Devices",
  seekersWanting: 14706,
  providersOffering: 326,
  connectedSeekers: 1530,
  matchedSeekers: 14000,
  strongMatches: 12000,
  matchesComputedAt: "2026-11-10T00:00:00Z",
};
const SCREENING: EcosystemCategory = {
  category: "Screening",
  seekersWanting: 4,
  providersOffering: 50,
  connectedSeekers: 4,
  matchedSeekers: null,
  strongMatches: null,
  matchesComputedAt: null,
};

const TOTALS: EcosystemTotalsLive = {
  totalSeekers: 93397,
  totalProviders: 502,
  seekersWithNeeds: 18669,
  providersWithOffer: 384,
  totalConnections: 1812,
  connectedSeekers: 820,
  connectedProviders: 96,
  consentAcknowledged: 1804,
  consentRefused: 8,
  firstConnection: "2026-10-07",
  lastConnection: "2026-10-29",
};

describe("ecosystem live mapping", () => {
  it("maps provider rows from live category supply, demand and matches", () => {
    const [row] = toProviderGapRows([ASSISTIVE]);
    expect(row.providers).toBe(326);
    expect(row.connectedSeekers).toBe(1530);
    expect(row.strongMatches).toBe(12000);
    expect(row.matching).toBe(14000);
    expect(row.demandSupplyGap).toBe(2706);
    expect(row.demand).toBe(14706);
    expect(row.actionGap).toBe(14706 - 1530);
  });

  it("maps seeker rows: area, aggregators = providers offering, reach = seekers wanting", () => {
    const [row] = toSeekerGapRows([ASSISTIVE]);
    expect(row.area).toBe("Assistive Devices");
    expect(row.aggregators).toBe(326);
    expect(row.reach).toBe(14706);
    expect(row.matching).toBe(14000);
    expect(row.strongMatches).toBe(12000);
    expect(row.demandSupplyGap).toBe(2706);
    expect(row.actionGap).toBe(14706 - 1530);
  });

  it("never invents a negative action gap", () => {
    expect(unconnectedDemand(SCREENING)).toBe(0);
  });

  it("never reports more connected seekers than seekers wanting a category", () => {
    for (const c of [ASSISTIVE, SCREENING]) {
      expect(c.connectedSeekers).toBeLessThanOrEqual(c.seekersWanting);
      const [provider] = toProviderGapRows([c]);
      const [seeker] = toSeekerGapRows([c]);
      expect(provider.actionGap).toBeGreaterThanOrEqual(0);
      expect(seeker.actionGap).toBeGreaterThanOrEqual(0);
    }
  });

  it("sums the demand gap across categories", () => {
    expect(totalSeekerDemandGap([ASSISTIVE, SCREENING])).toBe(14706 - 1530);
  });

  it("reports seekers without a recorded need (about 80% of the population)", () => {
    expect(seekersWithoutNeeds(TOTALS)).toBe(74728);
  });

  it("labels the connection window", () => {
    expect(connectionWindowLabel("2026-10-07", "2026-10-29")).toBe("7 Oct – 29 Oct 2026");
  });

  it("subtracts high-confidence matches from demand", () => {
    expect(unmatchedDemand({ ...ASSISTIVE, seekersWanting: 14723, strongMatches: 12073 })).toBe(2650);
    expect(unmatchedDemand({ ...ASSISTIVE, seekersWanting: 13842, strongMatches: 11459 })).toBe(2383);
  });

  it("never reports a negative unmatched demand", () => {
    expect(unmatchedDemand({ ...SCREENING, strongMatches: 5 })).toBe(0);
  });

  it("keeps unloaded match data null in helpers and both row mappings", () => {
    expect(unmatchedDemand(SCREENING)).toBeNull();
    expect(totalUnmatchedDemand([ASSISTIVE, SCREENING])).toBeNull();
    for (const row of [...toProviderGapRows([SCREENING]), ...toSeekerGapRows([SCREENING])]) {
      expect(row.matching).toBeNull();
      expect(row.strongMatches).toBeNull();
      expect(row.demandSupplyGap).toBeNull();
    }
  });

  it("treats zero strong matches as full unmet demand, not missing data", () => {
    const employment = { ...ASSISTIVE, seekersWanting: 398, matchedSeekers: 398, strongMatches: 0 };
    expect(unmatchedDemand(employment)).toBe(398);
    expect(totalUnmatchedDemand([employment])).toBe(398);
  });

  it("sums unmatched demand across fully loaded categories", () => {
    expect(totalUnmatchedDemand([ASSISTIVE, { ...SCREENING, strongMatches: 3 }])).toBe(2707);
  });
});
