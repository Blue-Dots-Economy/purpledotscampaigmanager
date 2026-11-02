// Shared preview-host classifier. Pure module — safe to test and to import from
// server code. Fail closed: anything not positively recognised is NOT a preview.
//
// A static preview's first label matches `^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$`
// (covers id-preview--, id-preview-6--, id-preview-<sha>--, preview--, preview-<n|sha>--)
// under a recognised suffix only. Published slugs (purpledotscampaigmanager.lovable.app),
// project--<id>.lovable.app without -dev, and custom domains are never previews.
const PREVIEW_SUFFIXES = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"];
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;

export function isPreviewHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (!PREVIEW_SUFFIXES.some((s) => host.endsWith(s))) return false;
  const firstLabel = host.split(".")[0] ?? "";
  return PREVIEW_LABEL.test(firstLabel);
}
