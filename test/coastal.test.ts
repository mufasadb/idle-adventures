// D94 — coastal biome (si7.6.8.2) + the second catch wave (si7.6.8.1): the sea along one
// edge, the longboat that sails it, and the deep-sea catches with their uses.
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid } from "../src/engine/grid";
import type { Grid } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { visionRadius } from "../src/engine/perceive";
import { BIOMES, MAP_WIDTH, MAP_HEIGHT, RECIPE, ARMOUR, FOOD, FRESH_TO_STALE, MONSTERS, LOOT_TABLE } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

const seeds = Array.from({ length: 30 }, (_, i) => `coast-${i}`);
const grids = seeds.map((s) => generateGrid(s, "coastal", 2));

// Which edge holds the most sea — the coastline the gradient pushed it against.
function seaShareOfEdge(g: Grid): number {
  const edges = [
    g.terrain[0]!, g.terrain[MAP_HEIGHT - 1]!,
    g.terrain.map((r) => r[0]!), g.terrain.map((r) => r[MAP_WIDTH - 1]!),
  ];
  return Math.max(...edges.map((e) => e.filter((t) => t === "sea").length / e.length));
}

test("every coastal map has a sea against one edge, fringed by shallows", () => {
  for (const g of grids) {
    const flat = g.terrain.flat();
    expect(flat).toContain("sea");
    expect(flat).toContain("shallows");
    expect(flat).not.toContain("lake");
    expect(seaShareOfEdge(g)).toBeGreaterThan(0.5);
  }
});

test("the entry and every POI sit off the sea; land stays one component", () => {
  for (const g of grids) {
    for (const p of [...g.pois, g.entry]) expect(g.terrain[p.y]![p.x]).not.toBe("sea");
    const walk = (x: number, y: number) => Number.isFinite(moveCost(g.terrain[y]![x]!, null));
    const seen = new Set([`${g.entry.x},${g.entry.y}`]);
    const stack = [g.entry];
    while (stack.length) {
      const c = stack.pop()!;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = c.x + dx, y = c.y + dy, k = `${x},${y}`;
        if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || seen.has(k) || !walk(x, y)) continue;
        seen.add(k);
        stack.push({ x, y });
      }
    }
    expect(seen.size).toBe(g.terrain.flat().filter((t) => Number.isFinite(moveCost(t, null))).length);
  }
});

test("the longboat sails sea and lake; the raft still can't take the sea", () => {
  expect(moveCost("sea", null, ["raft"])).toBe(Infinity);
  expect(moveCost("sea", null, ["longboat"])).toBe(15);
  expect(moveCost("lake", null, ["longboat"])).toBe(15);
  expect(moveCost("river", null, ["longboat"])).toBe(10);
  expect(moveCost("shallows", null, ["longboat"])).toBe(10);
});

test("the longboat is built from coastal driftwood", () => {
  expect(RECIPE.longboat!.inputs.map((i) => i.defId)).toContain("driftwood");
  expect(BIOMES.coastal.materialTable.wood).toHaveProperty("driftwood");
});

test("out on the deep sea in a longboat, the cast reads the deep-sea table", () => {
  let checked = 0;
  for (let i = 0; i < grids.length && checked < 5; i++) {
    const g = grids[i]!;
    for (let y = 1; y < MAP_HEIGHT - 1 && checked < 5; y++) for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (g.terrain[y]![x] !== "sea" || g.depth![y]![x]! < 5) continue; // ≥2 deeper than FISH_DEEP_DEPTH → every neighbour is deep too
      const loadout = emptyLoadout();
      loadout.equipment.tools = ["fishing-rod", "longboat"];
      const state: GameState = {
        seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
        expedition: { mapSeed: seeds[i]!, mapTier: 2, biomeId: "coastal", pos: { x, y }, energy: 200, hp: 30, loadout, carry: [], cleared: [] },
      };
      const { events } = reduce(state, { type: "fish" });
      const caught = events.find((e) => e.type === "fished") as { catch: string; water: string } | undefined;
      expect(caught).toBeDefined();
      expect(Object.keys(BIOMES.coastal.fishTable!["deep-sea"]!)).toContain(caught!.catch);
      expect(caught!.water).toBe("deep-sea");
      checked++;
      break;
    }
  }
  expect(checked).toBe(5);
});

test("second catch wave: pearl, turtle shell and kelp are fished on the coast, and each has its use", () => {
  const all = new Set(Object.values(BIOMES.coastal.fishTable!).flatMap((row) => Object.keys(row)));
  for (const d of ["pearl", "turtle-shell", "kelp", "mackerel", "tuna"]) expect(all.has(d)).toBe(true);
  // pearl → a longer glass
  expect(RECIPE["pearl-spyglass"]!.inputs.map((i) => i.defId)).toContain("pearl");
  expect(visionRadius(["pearl-spyglass"])).toBeGreaterThan(visionRadius(["spyglass"]));
  // turtle shell → a light helm that beats the basic light helmet
  expect(RECIPE["turtle-shell-helm"]!.inputs.map((i) => i.defId)).toContain("turtle-shell");
  expect(ARMOUR["turtle-shell-helm"]!).toMatchObject({ armourType: "light", slot: "helmet" });
  expect(ARMOUR["turtle-shell-helm"]!.defense).toBeGreaterThan(ARMOUR["light-helmet"]!.defense);
  // kelp → a draught (glassware brew)
  expect(RECIPE["draught-kelp"]).toMatchObject({ output: { defId: "draught" }, requires: { tools: ["glassware"] } });
  // sea fish are food, spoil like the rest, and tuna grills
  for (const f of ["mackerel", "tuna", "grilled-tuna", "samphire"]) expect(FOOD).toContain(f);
  expect(FRESH_TO_STALE.tuna).toBe("stale-fish");
  expect(RECIPE["grilled-tuna"]).toMatchObject({ field: true, requires: { tools: ["fire-kit"] } });
});

test("the coastal roster spreads melee/ranged/magic incoming, and drops feed the tree", () => {
  const roster = Object.keys(BIOMES.coastal.creatureTable);
  expect(new Set(roster.map((m) => MONSTERS[m]!.dmgType))).toEqual(new Set(["melee", "ranged", "magic"]));
  expect(roster.some((m) => MONSTERS[m]!.category === "humanoid")).toBe(true); // a map-dropper
  const inputs = new Set(Object.values(RECIPE).flatMap((r) => r.inputs.map((i) => i.defId)));
  for (const m of roster) for (const drop of LOOT_TABLE[m] ?? []) expect(inputs.has(drop.defId)).toBe(true);
});
