import { describe, expect, it } from "vitest";
import { campaignChannelOptions, parseCampaignChannel } from "./campaign-channel";

describe("data-driven campaign channels", () => {
  it("preserves the exact capitalised database values", () => {
    expect(campaignChannelOptions(["Outbound", "Inbound"]).map((o) => o.value)).toEqual(["all", "Outbound", "Inbound"]);
  });
  it("accepts any non-empty channel without case normalization", () => {
    expect(parseCampaignChannel("Inbound")).toBe("Inbound");
    expect(parseCampaignChannel("Custom channel")).toBe("Custom channel");
    expect(parseCampaignChannel("all")).toBe("all");
  });
  it("rejects empty or non-string search values", () => {
    expect(parseCampaignChannel("")).toBeUndefined();
    expect(parseCampaignChannel("  ")).toBeUndefined();
    expect(parseCampaignChannel(12)).toBeUndefined();
  });
});