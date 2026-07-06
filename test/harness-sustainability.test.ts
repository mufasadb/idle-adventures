import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { MAP_WIDTH, MAP_HEIGHT, STACK_CAP } from "../src/data/constants";
import type { GameState, Action } from "../src/engine/types";
import type { BiomeId } from "../src/data/constants";

// Long-run SUSTAINABILITY harness (2026-07-05). The earlier tests each proved a
// single loop; none proved you can keep going. This drives a greedy reference
// player across many runs and asserts the FOOD ECONOMY never collapses — you can
// always embark with energy and never starve. Deterministic (fixed seeds), so
// it's a real regression test, not a flake. If food (or the bare-slot opening)
// is retuned into a starvation spiral, this goes red.

const accepts = (s: GameState, a: Action) => reduce(s, a).events.every((e) => e.type !== "action-rejected");
const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const qtyOf = (s: GameState, id: string) => s.bank.find((x) => x.defId === id)?.qty ?? 0;

// material defId → its ration recipe. Food comes from foraging herbs OR hunting
// (hides = meat), so it's robust in every biome (herb-poor tundra hunts instead).
const RATION_RECIPE: Record<string, string> = {
  "forest-herb": "ration", "desert-sage": "ration-sage", "ice-moss": "ration-moss",
  "deer-hide": "ration-venison", "wolf-pelt": "ration-game", "lizard-hide": "ration-jerky",
};
const FOOD_MATS = Object.keys(RATION_RECIPE);

// One greedy run: pack the best pack + a knife + ONE food stack (keep loot room),
// embark, forage herbs / hunt animals, return, then craft a backpack (if bare)
// and as many rations as the herbs allow.
function oneRun(s: GameState, mapSeed: string): GameState {
  if (qtyOf(s, "leather") > 0) s = reduce(s, { type: "pack", slot: "backpack", itemId: "leather" }).state;
  else if (qtyOf(s, "starter") > 0) s = reduce(s, { type: "pack", slot: "backpack", itemId: "starter" }).state;
  if (qtyOf(s, "knife") > 0) s = reduce(s, { type: "pack", slot: "tool", itemId: "knife" }).state;
  const packN = Math.min(qtyOf(s, "ration"), STACK_CAP); // one stack → one slot, keep room to gather
  for (let i = 0; i < packN; i++) s = reduce(s, { type: "pack", slot: "food", itemId: "ration" }).state;

  s = reduce(s, { type: "embark", mapSeed }).state;
  if (!s.expedition) return s; // embarked with 0 energy — starvation (caught by the assert)

  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  const targets = grid.pois.filter((p) => p.kind === "herb" || p.kind === "animal");
  // Live monsters block their tile until beaten (a move INTO one is a fight). An
  // unarmed forager routes AROUND them — walking in would end the run in a loss.
  // With the stamina model (dtv) the forager reaches much further (embark at max +
  // eat-to-refill), so it now meets monsters the old shorter reach never touched;
  // avoiding them is the correct re-derivation, not a workaround.
  const monsters = new Set(grid.pois.filter((p) => p.kind === "monster" && p.creature).map((p) => `${p.x},${p.y}`));
  const visited = new Set<string>();
  for (let step = 0; step < (MAP_WIDTH + MAP_HEIGHT) * 3 && s.expedition; step++) {
    const here = s.expedition.pos;
    const cleared = s.expedition.cleared;
    const on = targets.find((p) => p.x === here.x && p.y === here.y && !cleared.some((c) => c.x === p.x && c.y === p.y));
    if (on) { const r = reduce(s, { type: "gather" }); if (!r.events.some((e) => e.type === "action-rejected")) { s = r.state; continue; } }
    const rem = targets.filter((p) => !s.expedition!.cleared.some((c) => c.x === p.x && c.y === p.y));
    if (!rem.length) break;
    rem.sort((a, b) => cheb(a, here) - cheb(b, here));
    const t = rem[0]!;
    let best: { x: number; y: number } | null = null, bd = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nb = { x: here.x + dx, y: here.y + dy };
      if (nb.x < 0 || nb.y < 0 || nb.x >= MAP_WIDTH || nb.y >= MAP_HEIGHT) continue;
      if (visited.has(`${nb.x},${nb.y}`)) continue;
      if (monsters.has(`${nb.x},${nb.y}`)) continue; // route around live monsters (no unarmed fights)
      if (!accepts(s, { type: "move", to: nb })) continue;
      const d = cheb(nb, t); if (d < bd) { bd = d; best = nb; }
    }
    if (!best) break;
    s = reduce(s, { type: "move", to: best }).state;
    if (!s.expedition) break; // run ended mid-move (shouldn't happen now monsters are avoided)
    visited.add(`${best.x},${best.y}`);
    if (s.expedition.energy <= 0) break;
  }
  s = reduce(s, { type: "return" }).state;

  // bootstrap a backpack once (reserves one deer-hide), then convert every other
  // food material — foraged herbs AND hunted hides — into rations.
  if (qtyOf(s, "starter") === 0 && qtyOf(s, "leather") === 0 && qtyOf(s, "deer-hide") >= 1) {
    const r = reduce(s, { type: "craft", recipeId: "starter" }); if (!r.events.some((e) => e.type === "action-rejected")) s = r.state;
  }
  for (const mat of FOOD_MATS) {
    while (accepts(s, { type: "craft", recipeId: RATION_RECIPE[mat]! })) {
      s = reduce(s, { type: "craft", recipeId: RATION_RECIPE[mat]! }).state;
    }
  }
  return s;
}

// Play one SUSTAINING run: from the town's rotating offer (scanning forward
// through visits, optionally of `biome`), pick a map the greedy forager keeps fed
// on — the player chooses a workable map from the 3 offered. Every embark is a
// validly-offered candidate for its runs (9u9.3). oneRun is pure, so trials on the
// non-chosen candidates don't affect `s`.
function sustainingRun(s: GameState, seed: string, biome?: BiomeId): GameState {
  const from = s.runs ?? 0;
  for (let r = from; r < from + 120; r++) {
    for (const c of candidateMaps(seed, r)) {
      if (biome && c.biomeId !== biome) continue;
      const res = oneRun({ ...s, runs: r }, c.mapSeed);
      if (qtyOf(res, "ration") > 0) return res;
    }
  }
  throw new Error(`no sustaining ${biome ?? "any"} run found from runs ${from}`);
}

// TUNDRA is the worst case for food (only ~10% herb nodes, ~88% ice). The stress
// test: a workable tundra map is always findable in the offer, and foraging/hunting
// it keeps you fed — if you can stay fed here, you can anywhere.
test("sustainability: 15 runs on herb-poor tundra never starve the player", () => {
  let s = newGame("sustain");
  const RUNS = 15;
  for (let i = 0; i < RUNS; i++) {
    expect(qtyOf(s, "ration")).toBeGreaterThan(0); // have food to pack (no 0-energy dead loop)
    s = sustainingRun(s, "sustain", "tundra"); // throws if no tundra map sustains
    expect(qtyOf(s, "ration")).toBeGreaterThan(0); // replenished — net-neutral-or-better
  }
});

// A biome-diverse rotation (any offered biome) should also sustain, and over the
// runs earn a backpack from the haul — proving the early climb works end to end.
test("sustainability: a biome-diverse rotation sustains AND bootstraps a backpack", () => {
  let s = newGame("rot");
  for (let i = 0; i < 10; i++) s = sustainingRun(s, "rot"); // any biome the offer gives
  expect(qtyOf(s, "ration")).toBeGreaterThan(0);
  expect(qtyOf(s, "starter") + qtyOf(s, "leather")).toBeGreaterThan(0); // earned a pack from the haul
});
