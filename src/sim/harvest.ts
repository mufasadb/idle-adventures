// Harvest-fraction sim (si7.2): a greedy reference player packs a loadout, embarks
// at a given MAP TIER, and greedily clears the nearest gatherable POI it can afford
// until exhausted/wedged. Returns the fraction of the map's POIs cleared — the
// "reachable-and-affordable ceiling" for that loadout at that tier. Pure/seeded
// (drives reduce; no Math.random). Sibling to simReach/mapTierReport in balance.ts.
import { reduce } from "../engine/reduce";
import { generateGrid, rollBiome } from "../engine/grid";
import { emptyLoadout } from "../engine/loadout";
import { moveCost } from "../engine/move";
import { MAP_WIDTH, MAP_HEIGHT } from "../data/constants";
import type { BiomeId, Terrain } from "../data/constants";
import type { GameState, Action } from "../engine/types";

export type PackSpec = { tools?: string[]; backpack?: string; transport?: string; food: { defId: string; qty: number }[] };
export type HarvestResult = { mapSeed: string; mapTier: number; cleared: number; total: number; fraction: number };

type Pt = { x: number; y: number };
const NEIGHBORS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// One Dijkstra from `from` over passable, monster-free tiles → cost grid + prev
// pointers. `blocked` = live monster tiles (obstacles), so a path never steps onto
// a monster: the walker routes AROUND them and never engages. Linear-scan frontier
// is fine at POC scale (20×60 = 1200 tiles). Absent/Infinity cost = unreachable.
function dijkstraFrom(terrain: Terrain[][], from: Pt, transport: string | null, tools: string[], blocked: Set<string>): { cost: number[][]; prev: (string | null)[][] } {
  const cost: number[][] = Array.from({ length: MAP_HEIGHT }, () => new Array<number>(MAP_WIDTH).fill(Infinity));
  const prev: (string | null)[][] = Array.from({ length: MAP_HEIGHT }, () => new Array<string | null>(MAP_WIDTH).fill(null));
  cost[from.y]![from.x] = 0;
  const pq: [number, number, number][] = [[0, from.x, from.y]];
  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i]![0] < pq[bi]![0]) bi = i;
    const [d, x, y] = pq.splice(bi, 1)[0]!;
    if (d > cost[y]![x]!) continue;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
      if (blocked.has(`${nx},${ny}`)) continue; // route around live monsters
      const c = moveCost(terrain[ny]![nx]!, transport, tools);
      if (!Number.isFinite(c)) continue;
      const nd = d + c;
      if (nd < cost[ny]![nx]!) { cost[ny]![nx] = nd; prev[ny]![nx] = `${x},${y}`; pq.push([nd, nx, ny]); }
    }
  }
  return { cost, prev };
}

// Reconstruct the adjacent-waypoint path to (tx,ty) from a dijkstraFrom result.
function pathWaypoints(prev: (string | null)[][], from: Pt, tx: number, ty: number): Pt[] {
  const start = `${from.x},${from.y}`;
  const steps: Pt[] = [];
  let cur = `${tx},${ty}`;
  while (cur !== start) {
    const [px, py] = cur.split(",").map(Number) as [number, number];
    steps.unshift({ x: px, y: py });
    const p = prev[py]![px];
    if (p === null) return []; // no path (shouldn't happen: caller checks finite cost)
    cur = p;
  }
  return steps;
}

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
  // mco: auto-eat is OFF by default — designate the packed food so the greedy
  // harvester eats-to-refill and reaches deep (was the pre-mco embark default).
  if (pack.food[0]) s = reduce(s, { type: "set-auto-eat-food", defId: pack.food[0].defId } as Action).state;

  const eq = s.expedition.loadout.equipment; // transport/tools are fixed for the run
  const blocked = new Set(grid.pois.filter((p) => p.kind === "monster" && p.creature !== null).map((p) => `${p.x},${p.y}`));
  const gatherable = grid.pois.filter((p) => p.kind === "herb" || p.kind === "mining" || p.kind === "animal");
  const worked = new Set<string>();
  let cleared = 0;
  // Bound = tiles on the grid: each iteration either clears a node or marks one
  // worked/unreachable, and both sets only grow — the loop cannot spin.
  for (let guard = 0; s.expedition && guard < MAP_WIDTH * MAP_HEIGHT; guard++) {
    const here = s.expedition.pos;
    const { cost, prev } = dijkstraFrom(grid.terrain, here, eq.transport, eq.tools, blocked);
    // nearest unworked gatherable by true monster-aware path cost
    let best: { p: (typeof gatherable)[number] } | null = null;
    let bestCost = Infinity;
    for (const p of gatherable) {
      if (worked.has(`${p.x},${p.y}`)) continue;
      const c = cost[p.y]![p.x]!;
      if (Number.isFinite(c) && c < bestCost) { bestCost = c; best = { p }; }
    }
    if (!best) break;
    const t = best.p;
    worked.add(`${t.x},${t.y}`); // mark now: reached or not, we won't retry it
    let reached = true;
    for (const wp of pathWaypoints(prev, here, t.x, t.y)) {
      const r = reduce(s, { type: "move", to: wp } as Action);
      if (r.events.some((e) => e.type === "action-rejected")) { reached = false; break; } // exhausted
      s = r.state;
      if (!s.expedition) { reached = false; break; }
    }
    if (!reached || !s.expedition) continue;
    const r = reduce(s, { type: "gather" });
    s = r.state;
    if (r.events.some((e) => e.type === "gathered")) {
      cleared++;
      // Shed the loot so carry-full never stops the walk: this measures energy
      // REACH, not carry pressure. A carry-full gather-reject is an accepted
      // measurement floor (affects tier + base packs equally), not a bug.
      if (t.material) s = reduce(s, { type: "drop", itemId: t.material } as Action).state;
    }
  }
  return { mapSeed, mapTier, cleared, total, fraction: total ? cleared / total : 0 };
}

export function harvestFractionReport(pack: PackSpec, mapTier: number, seeds: string[]): { rows: HarvestResult[]; avg: number } {
  const rows = seeds.map((seed) => simHarvest(pack, seed, mapTier));
  const avg = rows.reduce((sum, r) => sum + r.fraction, 0) / (rows.length || 1);
  return { rows, avg };
}
