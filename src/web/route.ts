// Pure route-preview derivation (extracted from main.ts so it's DOM-free and unit
// testable — df3). The player plans the route by hand: each waypoint draws a NAIVE
// straight line (lineTiles) from the previous point — never an energy-optimal path
// (finding the efficient route is the game). deriveRoute turns the waypoint list into
// the drawn tiles, per-leg block markers, and an auto-eat-aware energy preview. Pure
// over its inputs; recomputed each render, never stored.
import type { Grid } from "../engine/grid";
import type { Expedition } from "../engine/types";
import { moveCost } from "../engine/move";
import { lineTiles } from "../engine/line";
import { gatherCost } from "../engine/tools";
import { eatToRefill } from "../engine/food";
import { MAX_ENERGY, TENT_FOOD_MULTIPLIER } from "../data/constants";

export type Pos = { x: number; y: number };
const kk = (p: Pos) => `${p.x},${p.y}`;

export type Leg = { tiles: Pos[]; blockedAt: Pos | null };
export type DerivedRoute = {
  legs: Leg[];
  drawn: Pos[]; // every leg tile in walk order (the whole plan, drawn even past a block)
  walkable: Pos[]; // the prefix the walk will actually traverse (stops at the first block)
  waypointKeys: Set<string>;
  blockKeys: Set<string>; // each leg's first impassable tile — the red "won't work" markers
  walkCost: number; // movement energy over the walkable prefix
  actionCost: number; // auto-gather energy for resolved workable nodes on the walkable prefix
  endEnergy: number; // simulated CURRENT energy after the walk, mirroring the reducer's pay-then-auto-eat per tile (df3)
  strands: boolean; // the walk would truly run energy ≤ 0 before completing, EVEN WITH designated auto-eat (df3)
  blocked: boolean; // any leg hits a wall → Walk disabled
  end: Pos; // last waypoint (or the player, if the route is empty)
};

export function deriveRoute(grid: Grid, exp: Expedition, wps: Pos[], resolved: Set<string>, cleared: Set<string>): DerivedRoute {
  const eq = exp.loadout.equipment;
  const legs: Leg[] = [];
  const drawn: Pos[] = [];
  const walkable: Pos[] = [];
  const waypointKeys = new Set<string>();
  const blockKeys = new Set<string>();
  let walkCost = 0;
  let actionCost = 0;
  // df3: simulate CURRENT energy tile-by-tile in the SAME order the reducer walks
  // (pay a cost, THEN waste-free auto-eat the DESIGNATED food) so the "strands you"
  // verdict + projected end-energy reflect what the walk ACTUALLY does — never the
  // raw walkCost+actionCost, which ignores mid-walk refills. autoEatFood unset = no
  // refills, so this reduces to the old exp.energy − total behaviour.
  const maxEnergy = exp.maxEnergy ?? MAX_ENERGY;
  const tentMult = eq.tools.includes("tent") ? TENT_FOOD_MULTIPLIER : 1;
  const autoEatFood = exp.autoEatFood;
  let simEnergy = exp.energy;
  let simFood = exp.loadout.food.map((s) => ({ ...s }));
  // Mirror autoRefill: pay `cost` off simEnergy, then auto-eat the designated food.
  const payThenEat = (cost: number): void => {
    simEnergy -= cost;
    if (autoEatFood) {
      const fed = eatToRefill(simFood, simEnergy, maxEnergy, autoEatFood, tentMult);
      simFood = fed.food;
      simEnergy = fed.energy;
    }
  };
  let strands = false; // the walk truly can't finish even WITH auto-eat
  let globallyBlocked = false; // once the walk hits any wall, later tiles aren't traversed
  let prevWalk: Pos = exp.pos; // previous WALKED tile — sets the next step's diagonal cost
  let legStart: Pos = exp.pos;
  for (const wp of wps) {
    waypointKeys.add(kk(wp));
    const tiles = lineTiles(legStart, wp);
    let blockedAt: Pos | null = null;
    for (const t of tiles) {
      drawn.push(t);
      const passable = Number.isFinite(moveCost(grid.terrain[t.y]![t.x]!, eq.transport, eq.tools)); // impassability is flag-independent
      if (!passable) {
        if (blockedAt === null) { blockedAt = t; blockKeys.add(kk(t)); } // this leg's first block
        globallyBlocked = true;
      } else if (!globallyBlocked) {
        walkable.push(t);
        const diagonal = prevWalk.x !== t.x && prevWalk.y !== t.y;
        const mc = moveCost(grid.terrain[t.y]![t.x]!, eq.transport, eq.tools, diagonal);
        prevWalk = t;
        walkCost += mc;
        // The reducer rejects a step as "exhausted" when its cost exceeds current
        // energy (auto-eat already ran at the prior tile) — so the walk halts here
        // and doesn't finish. Flag strand once, but keep summing the raw cost
        // breakdown so the spend readout still shows the whole planned route.
        if (!strands && mc > simEnergy) strands = true;
        payThenEat(mc);
        if ((exp.autoGather ?? true) && !cleared.has(kk(t)) && resolved.has(kk(t))) {
          const poi = grid.pois.find((p) => p.x === t.x && p.y === t.y);
          if (poi) {
            const gc = gatherCost(poi, eq.tools);
            if (gc !== null) {
              actionCost += gc;
              // Gather also rejects "exhausted" on cost > energy, but a failed
              // gather does NOT stop the walk (main.ts keeps walking) — so it
              // never strands; only skip its refill/spend when unaffordable.
              if (gc <= simEnergy) payThenEat(gc);
            }
          }
        }
      }
    }
    legs.push({ tiles, blockedAt });
    legStart = wp;
  }
  return { legs, drawn, walkable, waypointKeys, blockKeys, walkCost, actionCost, endEnergy: simEnergy, strands, blocked: legs.some((l) => l.blockedAt !== null), end: wps.length ? wps[wps.length - 1]! : exp.pos };
}
