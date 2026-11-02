import { describe, expect, it } from "vitest";
import { isPreviewHost } from "./preview-host";

describe("isPreviewHost", () => {
  it.each([
    "id-preview--f9ce44d6-63df-4899-8da5-c22f8ecf437b.lovable.app",
    "id-preview-6--f9ce44d6-63df-4899-8da5-c22f8ecf437b.lovable.app",
    "id-preview-090ea06--f9ce44d6-63df-4899-8da5-c22f8ecf437b.lovable.app",
    "preview--purpledotscampaigmanager.lovable.app",
    "preview-3--purpledotscampaigmanager.lovable.app",
    "preview-090ea06--purpledotscampaigmanager.lovable.app",
    "ID-PREVIEW--F9CE44D6.LOVABLE.APP",
  ])("recognises preview host %s", (host) => {
    expect(isPreviewHost(host)).toBe(true);
  });

  it.each([
    "purpledotscampaigmanager.lovable.app", // published
    "www.purpledots.in", // custom domain
    "project--f9ce44d6-63df-4899-8da5-c22f8ecf437b.lovable.app", // no -dev
    "fakeid-preview--f9ce44d6.lovable.app", // prefix not at start
    "my-preview--evil.lovable.app",
    "id-preview--f9ce44d6.evil.example.com", // unrecognised suffix
    "id-preview--f9ce44d6.lovable.app.evil.com",
    "localhost",
    "",
  ])("rejects non-preview host %s", (host) => {
    expect(isPreviewHost(host)).toBe(false);
  });
});
