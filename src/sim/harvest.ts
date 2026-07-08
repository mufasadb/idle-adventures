// Harvest-fraction sim (si7.2): a greedy reference player packs a loadout, embarks
// at a given MAP TIER, and greedily clears the nearest gatherable POI it can afford
// until exhausted/wedged. Returns the fraction of the map's POIs cleared — the
// "reachable-and-affordable ceiling" for that loadout at that tier. Pure/seeded
// (drives reduce; no Math.random). Sibling to simReach/mapTierReport in balance.ts.
import { reduce } from "../engine/reduce";
import { generateGrid, rollBiome } from "../engine/grid";
import { emptyLoadout } from "../engine/loadout";
import { MAP_WIDTH, MAP_HEIGHT } from "../data/constants";
import type { BiomeId } from "../data/constants";
import type { GameState, Action } from "../engine/types";

export type PackSpec = { tools?: string[]; backpack?: string; transport?: string; food: { defId: string; qty: number }[] };
export type HarvestResult = { mapSeed: string; mapTier: number; cleared: number; total: number; fraction: number };

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function simHarvest(pack: PackSpec, mapSeed: string, mapTier: number): HarvestResult {
  const biomeId = rollBiome(mapSeed) as BiomeId;
  // A stocked bank that covers everything we pack (generous qty), plus a HELD map
  // carrying the tier so embark threads mapTier (reduce reads heldMap.tier).
  const bank = [
    ...(pack.tools ?? []).map((defId) => ({ defId, qty: 1 })),
    ...(pack.backpack ? [{ defId: pack.backpack, qty: 1 }] : []),
    ...(pack.transport ? [{ defId: pack.transport, qty: 1 }] : []),
    ...pack.food.map((f) => ({ ...f })),
  ];
  let s: GameState = {
    seed: "harvest",
    phase: "town",
    bank,
    loadout: emptyLoadout(),
    maps: [{ mapSeed, biomeId, vintage: 0, tier: mapTier }],
    expedition: null,
    runs: 0,
  };
  const pk = (slot: string, itemId: string) => { s = reduce(s, { type: "pack", slot, itemId } as Action).state; };
  if (pack.backpack) pk("backpack", pack.backpack);
  if (pack.transport) pk("transport", pack.transport);
  for (const t of pack.tools ?? []) pk("tool", t);
  for (const f of pack.food) for (let i = 0; i < f.qty; i++) pk("food", f.defId);

  s = reduce(s, { type: "embark", mapSeed } as Action).state;
  const grid = generateGrid(mapSeed, biomeId, mapTier);
  const total = grid.pois.length;
  if (!s.expedition) return { mapSeed, mapTier, cleared: 0, total, fraction: 0 };

  // Only nodes a bare-hands/pick/knife kit can work (skip wood — no axe here) and
  // materials at tier ≤ 1 tool quality; keeps the greedy walker from wedging on
  // tool-too-weak rejections. This measures reach, not tool progression.
  const gatherable = grid.pois.filter((p) => p.kind === "herb" || p.kind === "mining" || p.kind === "animal");
  let cleared = 0;
  const skipped = new Set<string>();
  for (let step = 0; step < (MAP_WIDTH + MAP_HEIGHT) * 4 && s.expedition; step++) {
    const here = s.expedition.pos;
    const targets = gatherable.filter(
      (p) => !s.expedition!.cleared.some((q) => q.x === p.x && q.y === p.y) && !skipped.has(`${p.x},${p.y}`),
    );
    if (targets.length === 0) break;
    targets.sort((a, b) => cheb(a, here) - cheb(b, here));
    const t = targets[0]!;
    if (t.x === here.x && t.y === here.y) {
      const r = reduce(s, { type: "gather" });
      s = r.state;
      if (!r.events.some((e) => e.type === "gathered")) { skipped.add(`${t.x},${t.y}`); continue; }
      cleared++;
      if (t.material) s = reduce(s, { type: "drop", itemId: t.material } as Action).state; // shed loot: measure reach, not carry
      continue;
    }
    const r = reduce(s, { type: "move", to: { x: t.x, y: t.y } });
    if (r.events.some((e) => e.type === "action-rejected")) break;
    s = r.state;
    if (s.expedition?.combat) { skipped.add(`${t.x},${t.y}`); continue; } // walked into a monster; skip it
    if (s.expedition && s.expedition.pos.x === here.x && s.expedition.pos.y === here.y) break; // wedged
  }
  return { mapSeed, mapTier, cleared, total, fraction: total ? cleared / total : 0 };
}

export function harvestFractionReport(pack: PackSpec, mapTier: number, seeds: string[]): { rows: HarvestResult[]; avg: number } {
  const rows = seeds.map((seed) => simHarvest(pack, seed, mapTier));
  const avg = rows.reduce((sum, r) => sum + r.fraction, 0) / (rows.length || 1);
  return { rows, avg };
}
