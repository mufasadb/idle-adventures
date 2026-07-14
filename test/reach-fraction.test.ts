import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { newGame, candidateMaps } from "../src/engine/town";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { costToReach } from "../src/engine/reach";
import { emptyLoadout } from "../src/engine/loadout";
import { MAX_ENERGY, MAP_WIDTH, MAP_HEIGHT, MATERIAL_GATE } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";

// This harness routes around monster POIs by target selection (gatherable
// nodes only), but the greedy nearest-target walk can still step onto a
// monster tile it didn't intend to path through. si7.1: that no longer
// resolves inline — it ENGAGES. Fight the engagement to resolution (win, lose,
// or the run ends) so the harvest measurement isn't truncated by an
// accidental block; a lost fight still ends the run exactly as before.
function resolveWalkIn(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.expedition?.combat && ++guard < 100) {
    s = reduce(s, { type: "fight" }).state;
  }
  return s;
}

test("e3j structural: the strip out-ranges one energy capacity (5 offered maps)", () => {
  // The farthest POI must cost more than MAX_ENERGY to even REACH on foot —
  // food (and forage routing) is the only way to work the deep half.
  for (let r = 0; r < 5; r++) {
    const c = candidateMaps("rf", r)[0]!;
    const grid = generateGrid(c.mapSeed, rollBiome(c.mapSeed));
    const reach = costToReach(grid.terrain, grid.entry);
    const finite = grid.pois.map((p) => reach[p.y]![p.x]!).filter(Number.isFinite);
    expect(finite.length).toBeGreaterThan(0);
    expect(Math.max(...finite)).toBeGreaterThan(MAX_ENERGY);
  }
});

test("e3j report: starter-kit harvest fraction", () => {
  const c = candidateMaps("rf", 0)[0]!;
  let state: GameState = newGame("rf");
  const act = (a: Action) => reduce(state, a);
  // Affordable kit: a fresh bank has no small-backpack yet (that's a
  // craft output — see town.ts), so pack only what the bare BASE_CARRY_SLOTS
  // bag fits: pick + knife tools, 2 ration food (4/6 slots). Assert each pack
  // actually lands so an unaffordable/oversized kit can't silently regress
  // this test back to a meaningless 0% (as starter+axe+4 rations did).
  for (const a of [
    { type: "pack", slot: "tool", itemId: "pick" } as const,
    { type: "pack", slot: "tool", itemId: "knife" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
  ]) {
    const r = act(a);
    state = r.state;
    expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
  }
  state = act({ type: "embark", mapSeed: c.mapSeed }).state;
  expect(state.phase).toBe("expedition");
  // mco: auto-eat off by default — designate the packed ration to eat-to-refill.
  state = reduce(state, { type: "set-auto-eat-food", defId: "ration" }).state;
  const grid = generateGrid(c.mapSeed, rollBiome(c.mapSeed));
  // Only target nodes this kit can actually work: herb (bare hands), mining
  // (pick) or animal (knife) — no axe, so skip wood — and only UNGATED materials
  // (D78: absent from MATERIAL_GATE); an access-gated one rejects tool-too-weak
  // with basic tools.
  const gatherable = grid.pois.filter(
    (p) =>
      (p.kind === "herb" || p.kind === "mining" || p.kind === "animal") &&
      p.material !== null &&
      !(p.material in MATERIAL_GATE),
  );
  let cleared = 0;
  const skipped = new Set<string>();
  // Greedy: walk to the nearest unworked gatherable node, gather, DROP the loot
  // (this measures energy reach, not carry pressure), repeat until exhausted,
  // wedged, or killed (walking into a blocking monster unarmed can end the run).
  for (let step = 0; step < (MAP_WIDTH + MAP_HEIGHT) * 4 && state.expedition; step++) {
    const exp = state.expedition;
    const here = exp.pos;
    const targets = gatherable.filter(
      (p) =>
        !exp.cleared.some((q) => q.x === p.x && q.y === p.y) &&
        !skipped.has(`${p.x},${p.y}`),
    );
    if (targets.length === 0) break;
    targets.sort(
      (a, b) =>
        Math.max(Math.abs(a.x - here.x), Math.abs(a.y - here.y)) -
        Math.max(Math.abs(b.x - here.x), Math.abs(b.y - here.y)),
    );
    const t = targets[0]!;
    if (t.x === here.x && t.y === here.y) {
      const r = reduce(state, { type: "gather" });
      state = r.state;
      if (!r.events.some((e) => e.type === "gathered")) {
        // e.g. carry-full from a berries gather when food slots are momentarily
        // full — skip this node and keep going, rather than ending the run.
        skipped.add(`${t.x},${t.y}`);
        continue;
      }
      cleared++;
      // shed loot: measure reach, not carry (rejection OK — berries went to food, not carry)
      state = reduce(state, { type: "drop", itemId: t.material! }).state;
      continue;
    }
    const r = reduce(state, { type: "move", to: { x: t.x, y: t.y } });
    if (r.events.some((e) => e.type === "action-rejected")) break; // exhausted / impassable
    state = r.state;
    if (state.expedition?.combat) state = resolveWalkIn(state); // accidental walk-in: fight it out
    if (state.expedition && state.expedition.pos.x === here.x && state.expedition.pos.y === here.y) break; // wedged
  }
  if (state.expedition) state = reduce(state, { type: "return" }).state;
  const fraction = cleared / grid.pois.length;
  console.log(
    `[e3j] starter-kit harvest: ${cleared}/${grid.pois.length} POIs (${(100 * fraction).toFixed(0)}%) — target 15–20% starter, ~50% geared`,
  );
  // Structural ceiling only: even a perfect starter run must not clear most of the map.
  expect(fraction).toBeLessThan(0.6);
});

test("e3j report: geared-kit harvest fraction", () => {
  const c = candidateMaps("rf", 0)[0]!;
  // Hand-build a stocked bank (spec §6 parity) instead of relying on newGame's
  // starter bank — a geared+provisioned run should harvest much more of the map.
  let state: GameState = {
    seed: "rf",
    phase: "town",
    bank: [
      { defId: "leather", qty: 1 },
      { defId: "horse", qty: 1 },
      { defId: "pick", qty: 1 },
      { defId: "knife", qty: 1 },
      { defId: "ice-cleats", qty: 1 },
      { defId: "climbing-pick", qty: 1 },
      { defId: "ration", qty: 6 },
      { defId: "tent", qty: 1 },
    ],
    loadout: emptyLoadout(),
    expedition: null,
    runs: 0,
  };
  const act = (a: Action) => reduce(state, a);
  for (const a of [
    { type: "pack", slot: "backpack", itemId: "leather" } as const,
    { type: "pack", slot: "transport", itemId: "horse" } as const,
    { type: "pack", slot: "tool", itemId: "pick" } as const,
    { type: "pack", slot: "tool", itemId: "knife" } as const,
    { type: "pack", slot: "tool", itemId: "ice-cleats" } as const,
    { type: "pack", slot: "tool", itemId: "climbing-pick" } as const,
    { type: "pack", slot: "tool", itemId: "tent" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
    { type: "pack", slot: "food", itemId: "ration" } as const,
  ]) {
    const r = act(a);
    state = r.state;
    expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
  }
  state = act({ type: "embark", mapSeed: c.mapSeed }).state;
  expect(state.phase).toBe("expedition");
  // mco: auto-eat off by default — designate the packed ration to eat-to-refill.
  state = reduce(state, { type: "set-auto-eat-food", defId: "ration" }).state;
  const grid = generateGrid(c.mapSeed, rollBiome(c.mapSeed));
  // Target ALL gatherable kinds this kit can work: pick + knife (no axe, so still
  // skip wood), UNGATED materials only (D78) — same filter as the starter test.
  const gatherable = grid.pois.filter(
    (p) =>
      (p.kind === "herb" || p.kind === "mining" || p.kind === "animal") &&
      p.material !== null &&
      !(p.material in MATERIAL_GATE),
  );
  let cleared = 0;
  const skipped = new Set<string>();
  for (let step = 0; step < (MAP_WIDTH + MAP_HEIGHT) * 4 && state.expedition; step++) {
    const exp = state.expedition;
    const here = exp.pos;
    const targets = gatherable.filter(
      (p) =>
        !exp.cleared.some((q) => q.x === p.x && q.y === p.y) &&
        !skipped.has(`${p.x},${p.y}`),
    );
    if (targets.length === 0) break;
    targets.sort(
      (a, b) =>
        Math.max(Math.abs(a.x - here.x), Math.abs(a.y - here.y)) -
        Math.max(Math.abs(b.x - here.x), Math.abs(b.y - here.y)),
    );
    const t = targets[0]!;
    if (t.x === here.x && t.y === here.y) {
      const r = reduce(state, { type: "gather" });
      state = r.state;
      if (!r.events.some((e) => e.type === "gathered")) {
        skipped.add(`${t.x},${t.y}`);
        continue;
      }
      cleared++;
      state = reduce(state, { type: "drop", itemId: t.material! }).state;
      continue;
    }
    const r = reduce(state, { type: "move", to: { x: t.x, y: t.y } });
    if (r.events.some((e) => e.type === "action-rejected")) break;
    state = r.state;
    if (state.expedition && state.expedition.pos.x === here.x && state.expedition.pos.y === here.y) break;
  }
  if (state.expedition) state = reduce(state, { type: "return" }).state;
  const fraction = cleared / grid.pois.length;
  console.log(
    `[e3j] geared-kit harvest: ${cleared}/${grid.pois.length} POIs (${(100 * fraction).toFixed(0)}%) (target ~50%)`,
  );
  // Structural ceiling only: even a perfect geared run must not clear the whole map.
  expect(fraction).toBeLessThan(0.9);
});
