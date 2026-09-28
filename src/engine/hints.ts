// Map hints (3iq, D95): measure a generated grid, pick the strongest qualitative
// trait per family against the biome's baseline, and roll a reveal order. Pure and
// deterministic in (grid, mapSeed). Levers in src/data/hints.ts.
import {
  MAP_HINTS, HINT_FAMILIES, HINT_FALLBACK, HINT_REMARKABLE, HINT_SCARCE, HINT_BASELINE_FLOOR, HINT_BASELINE, MONSTERS,
} from "../data/constants";
import type { HintFamily, HintMetric, HintTrait } from "../data/constants";
import type { Grid } from "./grid";
import { rand } from "./rng";

export function mapMetrics(grid: Grid): Record<HintMetric, number> {
  const tiles = grid.terrain.flat();
  const share = (pred: (t: string) => boolean) => tiles.filter(pred).length / tiles.length;
  const pois = grid.pois;
  const P = pois.length || 1;
  const kind = (k: string) => pois.filter((p) => p.kind === k).length / P;
  const mons = pois.flatMap((p) => (p.creature && MONSTERS[p.creature] ? [MONSTERS[p.creature]!] : []));
  const M = mons.length || 1;
  return {
    mountain: share((t) => t === "mountain"),
    mud: share((t) => t === "mud"),
    river: share((t) => t === "river"),
    ice: share((t) => t === "ice"),
    water: share((t) => t === "lake" || t === "sea" || t === "shallows"),
    monster: kind("monster"),
    melee: mons.filter((m) => m.dmgType === "melee").length / M,
    ranged: mons.filter((m) => m.dmgType === "ranged").length / M,
    magic: mons.filter((m) => m.dmgType === "magic").length / M,
    plate: mons.filter((m) => m.armourType === "plate").length / M,
    maxTier: Math.max(0, ...mons.map((m) => m.tier)),
    mining: kind("mining"),
    wood: kind("wood"),
    herb: kind("herb"),
    animal: kind("animal"),
    food: kind("herb") + kind("animal"),
  };
}

// How strongly a trait fires on these metrics (0 = not at all). Absolute traits
// outrank every relative one.
function traitScore(trait: HintTrait, value: number, base: number): number {
  const t = trait.test;
  if ("atLeast" in t) return value >= t.atLeast ? Infinity : 0;
  if (t.minAbs !== undefined && value < t.minAbs) return 0;
  if (t.minBase !== undefined && base < t.minBase) return 0;
  const ratio = value / Math.max(base, HINT_BASELINE_FLOOR);
  if (t.dir === "high") return ratio >= (t.ratio ?? HINT_REMARKABLE) ? ratio : 0;
  return ratio <= (t.ratio ?? HINT_SCARCE) ? 1 / Math.max(ratio, 0.01) : 0;
}

// The hint id each family gets on this grid (strongest trait, else the fallback).
export function familyHints(grid: Grid): Record<HintFamily, string> {
  const metrics = mapMetrics(grid);
  const base = HINT_BASELINE[grid.biomeId] ?? {};
  const out = {} as Record<HintFamily, string>;
  for (const family of HINT_FAMILIES) {
    let best: string = HINT_FALLBACK[family].id;
    let bestScore = 0;
    for (const trait of MAP_HINTS) {
      if (trait.family !== family) continue;
      const s = traitScore(trait, metrics[trait.metric], base[trait.metric] ?? 0);
      if (s > bestScore) { best = trait.id; bestScore = s; }
    }
    out[family] = best;
  }
  return out;
}

// The map's hints in REVEAL order (study uncovers them front to back): one per family,
// order rolled on the map's own seed so which family you learn first varies per map.
export function rollMapHints(grid: Grid, mapSeed: string): string[] {
  const fam = familyHints(grid);
  return HINT_FAMILIES
    .map((f, i) => ({ id: fam[f], key: rand(mapSeed, "hint-order", i) }))
    .sort((a, b) => a.key - b.key)
    .map((h) => h.id);
}

const LABELS: Record<string, { label: string; family: HintFamily }> = Object.fromEntries([
  ...MAP_HINTS.map((t) => [t.id, { label: t.label, family: t.family }]),
  ...HINT_FAMILIES.map((f) => [HINT_FALLBACK[f].id, { label: HINT_FALLBACK[f].label, family: f }]),
]);
export function hintLabel(id: string): string {
  return LABELS[id]?.label ?? id;
}
export function hintFamily(id: string): HintFamily | null {
  return LABELS[id]?.family ?? null;
}
