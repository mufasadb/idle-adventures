// Pure route-preview derivation (extracted from main.ts so it's DOM-free and unit
// testable — df3). The player plans the route by hand: each waypoint draws a NAIVE
// straight line (lineTiles) from the previous point — never an energy-optimal path
// (finding the efficient route is the game). deriveRoute turns the waypoint list into
// the drawn tiles, per-leg block markers, and an auto-eat-aware energy preview. Pure
// over its inputs; recomputed each render, never stored.
import type { Grid } from "../engine/grid";
import type { Expedition, ItemStack } from "../engine/types";
import { moveCost, terrainHpCost } from "../engine/move";
import { lineTiles } from "../engine/line";
import { gatherCost } from "../engine/tools";
import { eatToRefill } from "../engine/food";
import { addToCarry, carryCap, usedSlots } from "../engine/carry";
import { gatherYield, placeYield } from "../engine/reduce-expedition";
import { MAX_ENERGY, FOOD, POTION } from "../data/constants";

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
  runsDry: boolean; // the walk would truly run energy ≤ 0 before completing, EVEN WITH designated auto-eat (df3)
  // seyh.10: per walkable tile, the engine's cost of the step onto it (diagonal flag
  // included) — what the footprints count, and the index in `walkable` of the first step
  // the walk can't pay (null = it never runs dry). Same simulation as runsDry.
  stepCosts: number[];
  dryAt: number | null;
  blocked: boolean; // any leg hits a wall → Walk disabled
  hpCost: number; // si7.6.9.6 (D99): HP the walkable prefix's hazardous terrain (spore-thicket, no mask) costs
  hazardKeys: Set<string>; // walkable tiles that cost HP — tinted red on the map
  crossedMonster: { pos: Pos; creature: string } | null; // first UNCLEARED monster on the walkable prefix — the walk auto-engages it (2i8: warn before you commit the route into a fight)
  end: Pos; // last waypoint (or the player, if the route is empty)
  // seyh.6: what the walk will auto-gather — resolved, workable, affordable nodes on the
  // walkable prefix, in walk order, up to where the walk would stop (runs dry / walks
  // into a fight). Empty with auto-gather off. Unresolved nodes are never predicted.
  gathers: Gather[];
  fits: boolean; // every predicted gather lands (placed exactly as gather does, after auto-eat)
  short: number; // bag slots missing for the rest; the walk pauses at the first that won't fit
};
export type Gather = { at: Pos; material: string; qty: number };

export function deriveRoute(grid: Grid, exp: Expedition, wps: Pos[], resolved: Set<string>, cleared: Set<string>): DerivedRoute {
  const eq = exp.loadout.equipment;
  const legs: Leg[] = [];
  const drawn: Pos[] = [];
  const walkable: Pos[] = [];
  const waypointKeys = new Set<string>();
  const blockKeys = new Set<string>();
  let walkCost = 0;
  let actionCost = 0;
  let hpCost = 0;
  const hazardKeys = new Set<string>();
  // df3: simulate CURRENT energy tile-by-tile in the SAME order the reducer walks
  // (pay a cost, THEN waste-free auto-eat the DESIGNATED food) so the "runs dry"
  // verdict + projected end-energy reflect what the walk ACTUALLY does — never the
  // raw walkCost+actionCost, which ignores mid-walk refills. autoEatFood unset = no
  // refills, so this reduces to the old exp.energy − total behaviour.
  const maxEnergy = exp.maxEnergy ?? MAX_ENERGY;
  const autoEatFood = exp.autoEatFood;
  let simEnergy = exp.energy;
  let simFood = exp.loadout.food.map((s) => ({ ...s }));
  // Mirror autoRefill: pay `cost` off simEnergy, then auto-eat the designated food.
  // 7lr: auto-eat gets NO tent bonus (×1) — the tent's +50% is manual-camp-meal-only.
  const payThenEat = (cost: number): void => {
    simEnergy -= cost;
    if (autoEatFood) {
      const fed = eatToRefill(simFood, simEnergy, maxEnergy, autoEatFood);
      simFood = fed.food;
      simEnergy = fed.energy;
    }
  };
  let runsDry = false; // the walk truly can't finish even WITH auto-eat
  const stepCosts: number[] = [];
  let dryAt: number | null = null;
  // seyh.6: the bag as the walk fills it. Gathers land via placeYield (the reducer's own
  // placement) into the post-auto-eat inventory; once one won't fit, the real walk
  // pauses (sim/play route: bag-full), so the rest only count toward `short`.
  const gathers: Gather[] = [];
  const gatheredKeys = new Set<string>();
  let simCarry: ItemStack[] = exp.carry;
  let overflow: { food: ItemStack[]; carry: ItemStack[] } | null = null; // the bag, uncapped, from the first miss on
  let walkStops = false; // the real walk halts here (a step it can't pay, or a fight)
  let crossedMonster: { pos: Pos; creature: string } | null = null; // first monster the walk would auto-engage
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
        // First uncleared monster on the walk: the reducer auto-engages when you step
        // onto a monster tile, so this is the fight the route commits you to (2i8).
        if (!crossedMonster && !cleared.has(kk(t))) {
          const mon = grid.pois.find((p) => p.x === t.x && p.y === t.y && p.kind === "monster" && p.creature);
          if (mon) crossedMonster = { pos: { x: t.x, y: t.y }, creature: mon.creature! };
        }
        const diagonal = prevWalk.x !== t.x && prevWalk.y !== t.y;
        const mc = moveCost(grid.terrain[t.y]![t.x]!, eq.transport, eq.tools, diagonal);
        prevWalk = t;
        stepCosts.push(mc);
        walkCost += mc;
        const hz = terrainHpCost(grid.terrain[t.y]![t.x]!, eq.tools);
        if (hz > 0) { hpCost += hz; hazardKeys.add(kk(t)); }
        // The reducer rejects a step as "exhausted" when its cost exceeds current
        // energy (auto-eat already ran at the prior tile) — so the walk halts here
        // and doesn't finish. Flag runsDry once, but keep summing the raw cost
        // breakdown so the spend readout still shows the whole planned route.
        if (!runsDry && mc > simEnergy) { runsDry = true; walkStops = true; dryAt = walkable.length - 1; }
        payThenEat(mc);
        if ((exp.autoGather ?? true) && !cleared.has(kk(t)) && resolved.has(kk(t)) && !gatheredKeys.has(kk(t))) {
          const poi = grid.pois.find((p) => p.x === t.x && p.y === t.y);
          if (poi) {
            const gc = gatherCost(poi, eq.tools);
            if (gc !== null) {
              actionCost += gc;
              gatheredKeys.add(kk(t)); // a worked node is cleared: a looping route doesn't gather it twice
              // Gather also rejects "exhausted" on cost > energy, but a failed
              // gather does NOT stop the walk (main.ts keeps walking) — so it
              // never runs dry; only skip its refill/spend when unaffordable.
              if (gc <= simEnergy) {
                const before = { energy: simEnergy, food: simFood };
                payThenEat(gc);
                if (!walkStops && poi.material !== null && poi.kind !== "monster") {
                  const qty = gatherYield(poi.kind, poi.magnitude);
                  gathers.push({ at: { x: t.x, y: t.y }, material: poi.material, qty });
                  const placed = overflow ? null : placeYield({ ...exp.loadout, food: simFood }, simCarry, poi.material, qty, "front");
                  if (placed) {
                    simFood = placed.loadout.food;
                    simCarry = placed.carry;
                  } else {
                    // carry-full: the reducer rejects before paying, and the walk pauses here
                    if (!overflow) { simEnergy = before.energy; simFood = before.food; overflow = { food: simFood, carry: simCarry }; }
                    overflow = FOOD.includes(poi.material) || POTION.includes(poi.material)
                      ? { ...overflow, food: [...overflow.food, { defId: poi.material, qty }] } // one slot per unit, like food
                      : { ...overflow, carry: addToCarry(overflow.carry, poi.material, qty, Infinity)! };
                  }
                }
              }
            }
          }
        }
        if (crossedMonster && crossedMonster.pos.x === t.x && crossedMonster.pos.y === t.y) walkStops = true; // the walk engages here
      }
    }
    legs.push({ tiles, blockedAt });
    legStart = wp;
  }
  const short = overflow ? Math.max(1, usedSlots({ ...exp.loadout, food: overflow.food }, overflow.carry) - carryCap(eq)) : 0;
  return { legs, drawn, walkable, waypointKeys, blockKeys, walkCost, actionCost, hpCost, hazardKeys, endEnergy: simEnergy, runsDry, stepCosts, dryAt, crossedMonster, blocked: legs.some((l) => l.blockedAt !== null), end: wps.length ? wps[wps.length - 1]! : exp.pos, gathers, fits: overflow === null, short };
}

// --- click → waypoint list (eot) --------------------------------------------
// A click either clears, TRUNCATES (snaps to the earliest walk-order occurrence of a
// tile already on the drawn path — this is the "un-click to unwind" gesture, and it
// resolves self-crossing routes deterministically), or APPENDS a new waypoint. The
// truncation target becomes the new final waypoint.
export function routeAfterClick(exp: Expedition, wps: Pos[], to: Pos, blocked: boolean): Pos[] {
  if (to.x === exp.pos.x && to.y === exp.pos.y) return []; // click self = clear
  // earliest walk-order occurrence of `to` across the legs → truncate there (unwind)
  let legStart: Pos = exp.pos;
  for (let i = 0; i < wps.length; i++) {
    for (const t of lineTiles(legStart, wps[i]!)) {
      if (t.x === to.x && t.y === to.y) return [...wps.slice(0, i), to];
    }
    legStart = wps[i]!;
  }
  // Not on the path → a new leg. But if the route is ALREADY blocked, appending would
  // just stack more ghost-blocked legs that never clear (playtest F5) — so a fresh click
  // starts OVER with a single leg from the player instead of poisoning the plan further.
  return blocked ? [to] : [...wps, to];
}
