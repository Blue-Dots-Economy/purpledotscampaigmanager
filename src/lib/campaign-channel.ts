export function campaignChannelOptions(channels: string[] = []) {
  return [{ value: "all", label: "All calls" }, ...channels.map((channel) => ({ value: channel, label: channel }))];
}

export function parseCampaignChannel(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}