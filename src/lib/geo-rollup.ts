import type { ParticipantDomain } from "./participant-rollup";

/** One row per (org × coordinator × state × district × domain) from get_geo_rollup(). */
export type GeoRollupRow = {
  org_name: string; coordinator_code: string; coordinator_type: string;
  state: string | null; district: string | null; domain: ParticipantDomain;
  total: number; live_count: number; draft_count: number; avg_completion: number; below_threshold: number;
};

export const LOCATION_NOT_RECORDED = "Location not recorded";

export type GeoMetrics = { total: number; live: number; draft: number; located: number; avgCompletion: number; belowThreshold: number };
export type GeoNode = GeoMetrics & { id: string; label: string; kind: "org" | "coordinator" | "state" | "district"; coordinatorType?: string; children: GeoNode[] };

export function scopeGeoRows(rows: GeoRollupRow[], domain: ParticipantDomain, organisation: string | null): GeoRollupRow[] {
  const scoped = rows.filter(r => r.domain === domain && (!organisation || r.org_name === organisation));
  if (!scoped.length) throw new Error("No geography rollup rows were returned for this account and programme. This is a data-loading problem, not confirmation of zero participants.");
  return scoped;
}

/** Participant-weighted completion: sum(total × avg) / sum(total), never a mean of means. */
export function geoMetrics(rows: GeoRollupRow[]): GeoMetrics {
  let total = 0, live = 0, draft = 0, located = 0, weighted = 0, below = 0;
  for (const r of rows) {
    const t = Number(r.total);
    total += t; live += Number(r.live_count); draft += Number(r.draft_count);
    if (r.state != null) located += t;
    weighted += t * Number(r.avg_completion); below += Number(r.below_threshold);
  }
  return { total, live, draft, located, avgCompletion: total ? Math.round(weighted / total) : 0, belowThreshold: below };
}

type Level = { kind: GeoNode["kind"]; key: (r: GeoRollupRow) => string };
const stateKey = (r: GeoRollupRow) => r.state ?? LOCATION_NOT_RECORDED;
const districtKey = (r: GeoRollupRow) => r.district ?? LOCATION_NOT_RECORDED;

function nest(rows: GeoRollupRow[], levels: Level[], prefix = ""): GeoNode[] {
  if (!levels.length) return [];
  const [level, ...rest] = levels;
  const groups = new Map<string, GeoRollupRow[]>();
  for (const r of rows) { const k = level.key(r); const g = groups.get(k); if (g) g.push(r); else groups.set(k, [r]); }
  return [...groups].map(([label, g]) => {
    const id = `${prefix}/${level.kind}:${label}`;
    // Unlocated profiles stay as one leaf: no duplicate "not recorded" district under it.
    const children = level.kind === "state" && label === LOCATION_NOT_RECORDED ? nest(g, rest.filter(l => l.kind !== "district"), id) : nest(g, rest, id);
    return { id, label, kind: level.kind, ...(level.kind === "coordinator" ? { coordinatorType: g[0].coordinator_type } : {}), ...geoMetrics(g), children };
  }).sort((a, b) => b.total - a.total);
}

export function rollupByOrganisation(rows: GeoRollupRow[]): GeoNode[] {
  return nest(rows, [
    { kind: "org", key: r => r.org_name },
    { kind: "coordinator", key: r => r.coordinator_code },
    { kind: "state", key: stateKey },
    { kind: "district", key: districtKey },
  ]);
}

export function rollupByGeography(rows: GeoRollupRow[]): GeoNode[] {
  return nest(rows, [
    { kind: "state", key: stateKey },
    { kind: "district", key: districtKey },
    { kind: "org", key: r => r.org_name },
  ]);
}
