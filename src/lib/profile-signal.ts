import { LOCATION_NOT_RECORDED } from "./geo-rollup";
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


/** Pass counts for one lifecycle bucket of one table row. Weak and "missing" are derived from the row's totals. */
export type Bucket = { strong: number; moderate: number; location: number; disability: number; needCategory: number };
export type SignalCounts = Record<string, { draft: Bucket; live: Bucket }>;
export type ProfileFacts = { item_id: string; org: string; coordinator: string; state: string | null; district: string | null; lifecycle: string };
export const TOTAL_KEY = "";

/** Same row ids the organisation / geography tables use (see geo-rollup nest()). */
export function nodeIdsFor(p: Pick<ProfileFacts, "org" | "coordinator" | "state" | "district">): string[] {
  const st = p.state ?? LOCATION_NOT_RECORDED, di = p.district ?? LOCATION_NOT_RECORDED;
  const o = `/org:${p.org}`, c = `${o}/coordinator:${p.coordinator}`, s = `${c}/state:${st}`;
  const ids = [o, c, s];
  if (p.state != null) ids.push(`${s}/district:${di}`);
  const gs = `/state:${st}`;
  ids.push(gs);
  if (p.state != null) { const gd = `${gs}/district:${di}`; ids.push(gd, `${gd}/org:${p.org}`); } else ids.push(`${gs}/org:${p.org}`);
  return ids;
}

const emptyBucket = (): Bucket => ({ strong: 0, moderate: 0, location: 0, disability: 0, needCategory: 0 });

export function buildSignalCounts(input: { profiles: ProfileFacts[]; calls: CallFacts[]; locations: LocationFacts[] }): SignalCounts {
  const dis = new Set<string>(), need = new Set<string>(), loc = new Set<string>();
  for (const c of input.calls) { if (disabilityPasses(c.disability)) dis.add(c.item_id); if (needCategoryPasses(c.needs)) need.add(c.item_id); }
  for (const l of input.locations) if (locationPasses(l)) loc.add(l.item_id);
  const out: SignalCounts = {};
  for (const p of input.profiles) {
    if (p.lifecycle !== "draft" && p.lifecycle !== "live") continue;
    const c: Checks = { name: false, contact: false, needDetails: false, location: loc.has(p.item_id), disability: dis.has(p.item_id), needCategory: need.has(p.item_id) };
    if (!c.location && !c.disability && !c.needCategory) continue;
    const s = classify(c);
    for (const id of [TOTAL_KEY, ...nodeIdsFor(p)]) {
      const b = (out[id] ??= { draft: emptyBucket(), live: emptyBucket() })[p.lifecycle];
      if (s !== "weak") b[s] += 1;
      if (c.location) b.location += 1; if (c.disability) b.disability += 1; if (c.needCategory) b.needCategory += 1;
    }
  }
  return out;
}

export type SignalFilter = { kind: "signal"; key: Signal } | { kind: "missing"; key: "location" | "disability" | "needCategory" };
/** Matching profiles in one row for the chosen filter, split by Draft / Live. */
export function matchFor(row: { draft: number; live: number }, counts: { draft: Bucket; live: Bucket } | undefined, f: SignalFilter) {
  const one = (n: number, b: Bucket) => f.kind === "missing" ? n - b[f.key] : f.key === "weak" ? n - b.strong - b.moderate : b[f.key];
  const draft = one(row.draft, counts?.draft ?? emptyBucket()), live = one(row.live, counts?.live ?? emptyBucket());
  return { draft, live, total: draft + live };
}
