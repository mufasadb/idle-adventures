import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { GRID_SIZE, STACK_CAP } from "../src/data/constants";
import type { GameState, Action } from "../src/engine/types";

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
  const visited = new Set<string>();
  for (let step = 0; step < GRID_SIZE * 6 && s.expedition; step++) {
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
      if (nb.x < 0 || nb.y < 0 || nb.x >= GRID_SIZE || nb.y >= GRID_SIZE) continue;
      if (visited.has(`${nb.x},${nb.y}`)) continue;
      if (!accepts(s, { type: "move", to: nb })) continue;
      const d = cheb(nb, t); if (d < bd) { bd = d; best = nb; }
    }
    if (!best) break;
    s = reduce(s, { type: "move", to: best }).state;
    visited.add(`${best.x},${best.y}`);
    if (s.expedition!.energy <= 0) break;
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

// `sustain:map:*` rolls all-TUNDRA — the worst case for food (only ~10% herb
// nodes, ~88% ice). It's the stress test: if you can stay fed here, you can
// anywhere. Food must come from hunting (hides), not just foraging.
test("sustainability: 15 runs on herb-poor tundra never starve the player", () => {
  let s = newGame("sustain");
  const RUNS = 15;
  for (let i = 0; i < RUNS; i++) {
    // pre-run: you have food to pack (else you'd embark at 0 energy = a dead loop)
    expect(qtyOf(s, "ration")).toBeGreaterThan(0);
    s = oneRun(s, `sustain:map:${i % 3}`);
    // post-run: you replenished — the loop is net-neutral-or-better on food
    expect(qtyOf(s, "ration")).toBeGreaterThan(0);
  }
});

// A biome-diverse rotation should also sustain (and here deer-hide is available,
// so the backpack bootstrap lands too — proving the early climb works end to end).
test("sustainability: a biome-diverse rotation sustains AND bootstraps a backpack", () => {
  let s = newGame("rot"); // woodland/desert/tundra — all three biomes; deer-hide stays reachable so the pack bootstrap lands even at POI_DENSITY 18 (denser maps clear only partially, qrl)
  for (let i = 0; i < 10; i++) s = oneRun(s, `rot:map:${i % 3}`);
  expect(qtyOf(s, "ration")).toBeGreaterThan(0);
  expect(qtyOf(s, "starter") + qtyOf(s, "leather")).toBeGreaterThan(0); // earned a pack from the haul
});
