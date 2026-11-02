import { describe, expect, it } from "vitest";
import {
  connectionWindowLabel,
  seekersWithoutNeeds,
  toProviderGapRows,
  toSeekerGapRows,
  totalSeekerDemandGap,
  unconnectedDemand,
  type EcosystemCategory,
  type EcosystemTotalsLive,
} from "./ecosystem-live";

// Spot values verified against the live Purple RPCs on 2026-11-02.
const ASSISTIVE: EcosystemCategory = {
  category: "Assistive Devices",
  seekersWanting: 14706,
  providersOffering: 326,
  connections: 1530,
};
const SCREENING: EcosystemCategory = {
  category: "Screening",
  seekersWanting: 4,
  providersOffering: 50,
  connections: 4,
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
  it("maps provider rows from category supply/demand, with capacity and matching unavailable", () => {
    const [row] = toProviderGapRows([ASSISTIVE]);
    expect(row.providers).toBe(326);
    expect(row.connections).toBe(1530);
    expect(row.capacity).toBeNull();
    expect(row.matching).toBeNull();
    expect(row.demand).toBe(14706);
    expect(row.actionGap).toBe(14706 - 1530);
  });

  it("maps seeker rows: area, aggregators = providers offering, reach = seekers wanting", () => {
    const [row] = toSeekerGapRows([ASSISTIVE]);
    expect(row.area).toBe("Assistive Devices");
    expect(row.aggregators).toBe(326);
    expect(row.reach).toBe(14706);
    expect(row.matching).toBeNull();
    expect(row.actionGap).toBe(14706 - 1530);
  });

  it("never invents a negative action gap", () => {
    expect(unconnectedDemand(SCREENING)).toBe(0);
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
});
