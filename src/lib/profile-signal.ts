/** Six-check profile signal (Strong / Moderate / Weak), rolled up per organisation.
 *  Name, Email/Phone and Need Details are not loaded into the database yet, so they
 *  always fail and are reported as "not loaded" rather than as real gaps. */

/** Preview is limited to this one account until the rules are confirmed. */
export const PROFILE_SIGNAL_EMAILS = new Set(["purpledots@ekstep.org"]);
export const canSeeProfileSignal = (email: string | null | undefined) => !!email && PROFILE_SIGNAL_EMAILS.has(email.trim().toLowerCase());

export type CheckKey = "name" | "location" | "contact" | "disability" | "needCategory" | "needDetails";
export const CHECKS: { key: CheckKey; label: string; rule: string; loaded: boolean }[] = [
  { key: "name", label: "Name", rule: "Not blank and not a placeholder (Unknown, Unnamed Profile, etc.)", loaded: false },
  { key: "location", label: "Location", rule: "Not blank, not just district / state, not on the exclusion list", loaded: true },
  { key: "contact", label: "Email or Phone", rule: "At least one filled", loaded: false },
  { key: "disability", label: "Disability Type", rule: "Not blank and not “any” (from call records)", loaded: true },
  { key: "needCategory", label: "Need Category", rule: "Not blank (from call records)", loaded: true },
  { key: "needDetails", label: "Need Details", rule: "Not blank", loaded: false },
];
export const LOCATION_EXCLUSIONS = new Set(["unknown", "na", "n/a", "none", "null", "-", "india", "not available"]);

export type Signal = "strong" | "moderate" | "weak";
export type CallFacts = { item_id: string; disability: string[] | null; needs: string[] | null };
export type LocationFacts = { item_id: string; location_label: string | null; district: string | null; state: string | null };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const filled = (list: string[] | null | undefined, reject: (v: string) => boolean = () => false) =>
  Array.isArray(list) && list.some(v => typeof v === "string" && norm(v) !== "" && !reject(norm(v)));

export function locationPasses(f: Pick<LocationFacts, "location_label" | "district" | "state">): boolean {
  const l = norm(f.location_label).replace(/\s+/g, " ");
  if (!l || LOCATION_EXCLUSIONS.has(l)) return false;
  const d = norm(f.district), s = norm(f.state);
  const parts = l.split(/\s*,\s*/).filter(Boolean);
  if (parts.length && parts.every(p => p === d || p === s)) return false; // only district / state
  return true;
}
export const disabilityPasses = (v: string[] | null) => filled(v, x => x === "any");
export const needCategoryPasses = (v: string[] | null) => filled(v);

export type Checks = Record<CheckKey, boolean>;
export function classify(c: Checks): Signal {
  if (Object.values(c).every(Boolean)) return "strong";
  if (c.location && c.disability && c.needCategory) return "moderate";
  return "weak";
}

export type SignalMetrics = { total: number; strong: number; moderate: number; weak: number; missing: Record<CheckKey, number> };
export type SignalOrg = SignalMetrics & { org: string };

/** orgTotals: participants per organisation (all seekers). profileOrg: organisation of each item id we hold facts for. */
export function rollupProfileSignal(input: {
  orgTotals: Map<string, number>; profileOrg: Map<string, string>; calls: CallFacts[]; locations: LocationFacts[];
}): { totals: SignalMetrics; byOrganisation: SignalOrg[] } {
  const dis = new Set<string>(), need = new Set<string>(), loc = new Set<string>();
  for (const c of input.calls) { if (disabilityPasses(c.disability)) dis.add(c.item_id); if (needCategoryPasses(c.needs)) need.add(c.item_id); }
  for (const l of input.locations) if (locationPasses(l)) loc.add(l.item_id);
  const blank = (org: string, total: number): SignalOrg => ({ org, total, strong: 0, moderate: 0, weak: 0, missing: { name: total, location: total, contact: total, disability: total, needCategory: total, needDetails: total } });
  const orgs = new Map<string, SignalOrg>();
  for (const [org, total] of input.orgTotals) orgs.set(org, blank(org, total));
  const ids = new Set([...dis, ...need, ...loc]);
  for (const id of ids) {
    const org = input.profileOrg.get(id); const o = org ? orgs.get(org) : undefined;
    if (!o) continue; // profile outside this scope / programme
    const c: Checks = { name: false, contact: false, needDetails: false, location: loc.has(id), disability: dis.has(id), needCategory: need.has(id) };
    const s = classify(c); if (s !== "weak") o[s] += 1;
    for (const k of ["location", "disability", "needCategory"] as const) if (c[k]) o.missing[k] -= 1;
  }
  const list = [...orgs.values()].map(o => ({ ...o, weak: o.total - o.strong - o.moderate }));
  const totals = blank("", 0) as SignalMetrics;
  for (const o of list) { totals.total += o.total; totals.strong += o.strong; totals.moderate += o.moderate; totals.weak += o.weak; for (const k of Object.keys(o.missing) as CheckKey[]) totals.missing[k] += o.missing[k]; }
  for (const k of Object.keys(totals.missing) as CheckKey[]) totals.missing[k] -= 0;
  totals.missing = Object.fromEntries((Object.keys(totals.missing) as CheckKey[]).map(k => [k, list.reduce((a, o) => a + o.missing[k], 0)])) as Record<CheckKey, number>;
  return { totals, byOrganisation: list.sort((a, b) => b.total - a.total) };
}
