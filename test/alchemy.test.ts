import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { RECIPE, POTION, POTION_HEAL_BY, PLAYER_BASE_HP } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";
import type { GameState, ItemStack } from "../src/engine/types";

// ke3.6 alchemy vertical: the fullest home-vs-field split — field brews a basic
// draught from a river-filled vial; home's alchemical-desk brews the strong one.

function town(bank: ItemStack[], stations?: GameState["stations"]): GameState {
  return { seed: "c", phase: "town", bank, loadout: emptyLoadout(), expedition: null, ...(stations ? { stations } : {}) };
}

function field(opts: { tools?: string[]; carry?: ItemStack[]; potions?: ItemStack[]; hp?: number; energy?: number; seed?: string; pos?: { x: number; y: number } } = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.tools = opts.tools ?? [];
  loadout.potions = opts.potions ?? [];
  return {
    seed: "al", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed: opts.seed ?? "al-seed", pos: opts.pos ?? { x: 10, y: 30 }, energy: opts.energy ?? 200, hp: opts.hp ?? 30, maxEnergy: 300, loadout, carry: opts.carry ?? [], cleared: [] },
  };
}

// find a river tile (rivers exist in every biome) to fill a vial on/adjacent
function riverState(carry: ItemStack[], tools: string[] = []): GameState {
  for (let i = 0; i < 200; i++) {
    const seed = `river-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    for (let y = 1; y < grid.terrain.length - 1; y++) {
      for (let x = 1; x < grid.terrain[0]!.length - 1; x++) {
        if (grid.terrain[y]![x] === "river") return field({ seed, pos: { x, y }, carry, tools });
      }
    }
  }
  throw new Error("no river tile found in scan range");
}

test("alchemy: catalog wiring — glassware tool, draught/greater-draught potions (ke3.6)", () => {
  expect(slotOf("glassware")).toBe("tool");
  expect(POTION).toContain("draught");
  expect(POTION).toContain("greater-draught");
  expect(POTION_HEAL_BY.draught).toBeGreaterThan(0);
});

// --- water mechanic: fill a vial at a river ----------------------------------

test("alchemy: water-vial (fill) needs a river on/adjacent, else not-near-terrain (ke3.6)", () => {
  // no river anywhere near a landlocked plains tile → reject
  const dry = field({ carry: [{ defId: "glass-vial", qty: 1 }] });
  const grid = generateGrid(dry.expedition!.mapSeed, rollBiome(dry.expedition!.mapSeed));
  // move the player onto a definitely-not-river tile
  let placed: GameState | null = null;
  for (let y = 1; y < grid.terrain.length - 1 && !placed; y++) {
    for (let x = 1; x < grid.terrain[0]!.length - 1; x++) {
      const near = ["river"].some((t) => [grid.terrain[y]![x], grid.terrain[y]![x + 1], grid.terrain[y]![x - 1], grid.terrain[y + 1]![x], grid.terrain[y - 1]![x]].includes(t as never));
      if (grid.terrain[y]![x] !== "river" && !near) { placed = field({ seed: dry.expedition!.mapSeed, pos: { x, y }, carry: [{ defId: "glass-vial", qty: 1 }] }); break; }
    }
  }
  if (placed) {
    const { events } = reduce(placed, { type: "craft", recipeId: "water-vial" });
    expect(events).toEqual([{ type: "action-rejected", action: "craft", reason: "not-near-terrain" }]);
  }
  // at a river → fills the vial (into carry, a material)
  const wet = riverState([{ defId: "glass-vial", qty: 1 }]);
  const { state } = reduce(wet, { type: "craft", recipeId: "water-vial" });
  expect(state.expedition!.carry.find((s) => s.defId === "water-vial")?.qty).toBe(1);
});

// --- field draught: brewable + quaffable in the field ------------------------

test("alchemy: field-draught brews into loadout.potions and is quaffable right away (ke3.6)", () => {
  const s = field({
    tools: ["glassware", "fire-kit"],
    carry: [{ defId: "water-vial", qty: 1 }, { defId: "forest-herb", qty: 2 }, { defId: "oak-log", qty: 1 }],
    hp: 10, // hurt, so the brewed draught can heal
  });
  const brewed = reduce(s, { type: "craft", recipeId: "field-draught" });
  const pots = brewed.state.expedition!.loadout.potions;
  expect(pots.find((p) => p.defId === "draught")?.qty).toBe(1); // landed in potions, not carry
  expect(brewed.state.expedition!.carry.find((c) => c.defId === "draught")).toBeUndefined();
  // quaff it here on the map
  const quaffed = reduce(brewed.state, { type: "quaff" });
  expect(quaffed.state.expedition!.hp).toBe(10 + POTION_HEAL_BY.draught!);
  expect(quaffed.events.some((e) => e.type === "quaffed")).toBe(true);
});

test("alchemy: field-draught needs glassware AND fire-kit (ke3.6)", () => {
  const carry: ItemStack[] = [{ defId: "water-vial", qty: 1 }, { defId: "forest-herb", qty: 2 }, { defId: "oak-log", qty: 1 }];
  const noHeat = reduce(field({ tools: ["glassware"], carry }), { type: "craft", recipeId: "field-draught" });
  expect(noHeat.events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-tool" }]);
});

// --- home draught + the desk-gated strong potion -----------------------------

test("alchemy: draught brews at home with glassware, no water (ke3.6)", () => {
  const { state } = reduce(town([{ defId: "glassware", qty: 1 }, { defId: "forest-herb", qty: 2 }]), { type: "craft", recipeId: "draught" });
  expect(state.bank.find((s) => s.defId === "draught")?.qty).toBe(1);
});

test("alchemy: greater-draught needs the alchemical-desk — town rejects missing-station, field can't make it (ke3.6)", () => {
  const bank: ItemStack[] = [{ defId: "forest-herb", qty: 2 }, { defId: "silver-ore", qty: 1 }];
  // town without a desk → missing-station
  const noDesk = reduce(town(bank), { type: "craft", recipeId: "greater-draught" });
  expect(noDesk.events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-station" }]);
  // the field kit can't make it at all (a station recipe is inherently town-only)
  const inField = reduce(field({ carry: bank }), { type: "craft", recipeId: "greater-draught" });
  expect(inField.events).toEqual([{ type: "action-rejected", action: "craft", reason: "not-field-craftable" }]);
  // build the desk, then brew it at home
  const built = reduce(town([{ defId: "glass-vial", qty: 3 }, { defId: "iron-ore", qty: 2 }, ...bank]), { type: "craft", recipeId: "alchemical-desk" });
  expect(built.state.stations).toEqual(["alchemical-desk"]);
  const brewed = reduce(built.state, { type: "craft", recipeId: "greater-draught" });
  expect(brewed.state.bank.find((s) => s.defId === "greater-draught")?.qty).toBe(1);
});

test("alchemy: the same draught, two paths — field-basic (8) vs desk-strong (matches greater-potion) (ke3.6)", () => {
  expect(RECIPE["field-draught"]!.field).toBe(true);
  expect(RECIPE["greater-draught"]!.requires?.station).toBe("alchemical-desk");
  expect(POTION_HEAL_BY.draught!).toBeLessThan(POTION_HEAL_BY["greater-draught"]!);
  expect(PLAYER_BASE_HP).toBeGreaterThan(0); // sanity: heals are meaningful vs base HP
});
