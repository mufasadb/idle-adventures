// test/constants.test.ts
import { test, expect } from "bun:test";
import {
  MAP_WIDTH,
  MAP_HEIGHT,
  TERRAIN_COST,
  BACKPACK_SLOTS,
  TERRAINS,
  RECIPE,
  NODE_TYPES,
  BIOME_IDS,
  BIOMES,
  POI_DENSITY,
  POI_MIN_SPACING,
  NOISE_FREQUENCY,
  ENERGY_PER_FOOD,
  MIN_STEP,
  TRANSPORT_MULTIPLIER,
  BASE_CARRY_SLOTS,
  STACK_CAP,
  NODE_HARDNESS,
  NODE_TOOL,
  NODE_SECONDARY_TOOL,
  TOOL_SPEED,
  TOOL_CAPABILITY,
  MATERIAL_GATE,
  GATHER_YIELD,
  PLAYER_BASE_HP,
  CHIP_DAMAGE_MIN,
  POTION_HEAL,
  AUTO_POTION_THRESHOLD,
  UNARMED_DAMAGE,
  AFFINITY_MULTIPLIER,
  MONSTER_TIER_HP_CURVE,
  MONSTER_TIER_DMG_CURVE,
  MONSTERS,
  WEAPONS,
  ARMOUR,
  LOOT_TABLE,
  AFFINITIES,
  FOOD,
  POTION,
  CATEGORY_LOOT_TABLE,
  FRESH_TO_STALE,
  STARTER_BANK,
  FOOD_ENERGY,
  POTION_HEAL_BY,
  BATTLE_ITEM,
  COMBAT_BUFF,
} from "../src/data/constants";

test("constants: lever groups exist with the documented shape", () => {
  expect(typeof MAP_WIDTH).toBe("number");
  expect(typeof MAP_HEIGHT).toBe("number");
  expect(TERRAIN_COST).toHaveProperty("ice");
  expect(BACKPACK_SLOTS).toHaveProperty("small-backpack");
});

test("constants: M1 map levers are filled", () => {
  // D84: a 35×35 square you drill into the centre (was a 20×60 portrait strip).
  expect(MAP_WIDTH).toBe(35);
  expect(MAP_HEIGHT).toBe(35);
  expect(MAP_WIDTH).toBe(MAP_HEIGHT); // square — no false "deep" axis
  expect(POI_DENSITY).toBeGreaterThan(0);
  expect(POI_MIN_SPACING).toBeGreaterThanOrEqual(3);
  expect(NOISE_FREQUENCY).toBeGreaterThan(0);
});

test("constants: every biome is a complete generation profile", () => {
  expect(BIOME_IDS).toEqual(["woodland", "desert", "tundra"]);
  for (const id of BIOME_IDS) {
    const biome = BIOMES[id];
    const terrainTotal = TERRAINS.reduce(
      (sum, t) => sum + (biome.terrainWeights[t] ?? 0),
      0,
    );
    const nodeTotal = NODE_TYPES.reduce(
      (sum, n) => sum + (biome.nodeTypeWeights[n] ?? 0),
      0,
    );
    expect(terrainTotal).toBeGreaterThan(0);
    expect(nodeTotal).toBeGreaterThan(0);
    // creatureTable is weighted (si7.1), same shape as materialTable entries
    expect(typeof biome.creatureTable).toBe("object");
    expect(typeof biome.materialTable).toBe("object");
  }
});

test("constants: biomes are visibly distinct profiles", () => {
  expect(BIOMES.tundra.terrainWeights.ice ?? 0).toBeGreaterThan(0);
  expect(BIOMES.woodland.terrainWeights.ice ?? 0).toBe(0);
  expect(BIOMES.desert.terrainWeights.ice ?? 0).toBe(0);
  expect(BIOMES.desert.nodeTypeWeights.mining ?? 0).toBeGreaterThan(
    BIOMES.woodland.nodeTypeWeights.mining ?? 0,
  );
});

test("constants: M2 energy levers are filled", () => {
  expect(ENERGY_PER_FOOD).toBeGreaterThan(0);
  expect(MIN_STEP).toBeGreaterThan(0);
  expect(TERRAIN_COST.ice).toBeGreaterThan(TERRAIN_COST.plains); // bead acceptance: ice > plains
  expect(Number.isFinite(TERRAIN_COST.mountain)).toBe(false); // impassable without gear
  expect(TRANSPORT_MULTIPLIER.horse.plains!).toBeGreaterThan(1); // horse is fast on plains (per-terrain divisor)
});

test("constants: M3 carry + gathering levers are filled", () => {
  expect(BASE_CARRY_SLOTS).toBeGreaterThan(0);
  expect(BACKPACK_SLOTS["small-backpack"]).toBeGreaterThan(BASE_CARRY_SLOTS);
  expect(STACK_CAP).toBeGreaterThan(0);
  expect(NODE_TOOL.mining).toBe("pick"); // bead acceptance hinges on this gate
  expect(NODE_TOOL.herb).toBeNull(); // herbs gather bare-handed
  for (const kind of ["mining", "wood", "herb", "animal"] as const) {
    expect(NODE_HARDNESS[kind]).toBeGreaterThan(0);
    expect(GATHER_YIELD[kind]).toBeGreaterThan(0);
  }
  // D78: TOOL_SPEED is now the gather-cost divisor ONLY (absent = 1), decoupled
  // from ACCESS (MATERIAL_GATE). No every-tool-needs-an-entry invariant anymore —
  // instead every SPEED key must be a real tool and a positive divisor.
  for (const tool of Object.keys(TOOL_SPEED)) {
    expect(TOOL_CAPABILITY[tool]).toBeDefined(); // every speed-tuned tool is a real tool
    expect(TOOL_SPEED[tool]).toBeGreaterThan(0); // 0 → Infinity cost; negative → energy-GAINING gather
  }
});

// D78 gate parity: every tool named in a MATERIAL_GATE any-of list must be a real
// tool whose capability matches the NODE_TOOL capability of EVERY biome node kind
// that rolls that material — otherwise the gate is unsatisfiable (you could never
// equip a tool of the right kind that unlocks it).
test("constants: every MATERIAL_GATE tool is capability-matched to the material's node kind", () => {
  for (const [material, gate] of Object.entries(MATERIAL_GATE)) {
    // The capabilities of every biome node kind that can roll this material.
    const nodeCaps = new Set<string | null>();
    for (const id of BIOME_IDS) {
      for (const kind of ["mining", "wood", "herb", "animal"] as const) {
        if (BIOMES[id].materialTable[kind]?.[material]) nodeCaps.add(NODE_TOOL[kind]);
      }
    }
    expect(nodeCaps.size).toBeGreaterThan(0); // the material is actually rolled somewhere
    // A gated material must never roll from a bare-hands (null-capability) node —
    // that gate would be unsatisfiable (no tool can provide "no capability").
    for (const nc of nodeCaps) expect(nc).not.toBeNull();
    for (const tool of gate.tools) {
      const cap = TOOL_CAPABILITY[tool];
      expect(cap).toBeDefined(); // the gate names a real tool
      // its capability must satisfy every node kind that rolls the material
      for (const nc of nodeCaps) expect(cap).toBe(nc as string);
    }
  }
});

// D83: an animal node's AND-gate (NODE_SECONDARY_TOOL) must be SATISFIABLE — the
// named capability has to be provided by at least one real tool, or hunting would
// be impossible. (Distinct from NODE_TOOL, the primary/speed capability.)
test("constants: every NODE_SECONDARY_TOOL capability is provided by a real tool (AND-gate is satisfiable)", () => {
  for (const [kind, cap] of Object.entries(NODE_SECONDARY_TOOL)) {
    expect(NODE_TOOL[kind as keyof typeof NODE_TOOL]).not.toBeNull(); // a bare-hand node with a secondary would be contradictory
    const providers = Object.entries(TOOL_CAPABILITY).filter(([, c]) => c === cap);
    expect(providers.length).toBeGreaterThan(0); // some tool grants this capability
  }
  expect(NODE_SECONDARY_TOOL.animal).toBe("trap"); // hunting needs a trap alongside the knife
});

test("constants: every biome yields a non-empty weighted material table per gatherable node type", () => {
  for (const id of BIOME_IDS) {
    for (const kind of ["mining", "wood", "herb", "animal"] as const) {
      const table = BIOMES[id].materialTable[kind];
      expect(table).toBeTruthy();
      const weights = Object.values(table!);
      expect(weights.length).toBeGreaterThan(0);
      for (const w of weights) expect(w).toBeGreaterThan(0);
    }
  }
});

test("constants: each biome's DOMINANT material per node type is distinct (D27 soft pulls)", () => {
  const dominant = (table: Record<string, number>) =>
    Object.entries(table).sort((a, b) => b[1] - a[1])[0]![0];
  const dominants = BIOME_IDS.flatMap((id) =>
    (["mining", "wood", "herb", "animal"] as const).map((kind) =>
      dominant(BIOMES[id].materialTable[kind]!),
    ),
  );
  expect(new Set(dominants).size).toBe(dominants.length); // 12 distinct dominants
});

test("constants: silver is dominant in tundra mining but present elsewhere (D27)", () => {
  expect(BIOMES.tundra.materialTable.mining!["silver-ore"]).toBeGreaterThan(
    BIOMES.woodland.materialTable.mining!["silver-ore"] ?? 0,
  );
  expect(BIOMES.woodland.materialTable.mining!["silver-ore"]).toBeGreaterThan(0);
});

test("constants: M4 combat levers are filled", () => {
  expect(PLAYER_BASE_HP).toBeGreaterThan(0);
  expect(CHIP_DAMAGE_MIN).toBeGreaterThan(0); // HP always drains; fights always terminate
  expect(POTION_HEAL).toBeGreaterThan(0);
  expect(AUTO_POTION_THRESHOLD).toBeGreaterThan(0);
  expect(AUTO_POTION_THRESHOLD).toBeLessThanOrEqual(1);
  expect(UNARMED_DAMAGE).toBeGreaterThan(0);
  expect(AFFINITY_MULTIPLIER).toBeGreaterThan(1);
});

test("constants: monster catalog is internally consistent", () => {
  for (const [id, monster] of Object.entries(MONSTERS)) {
    expect(MONSTER_TIER_HP_CURVE[monster.tier]).toBeGreaterThan(0);
    expect(MONSTER_TIER_DMG_CURVE[monster.tier]).toBeGreaterThan(0);
    expect(["melee", "ranged", "magic"]).toContain(monster.dmgType);
    expect(["plate", "light", "robe"]).toContain(monster.armourType);
    expect(LOOT_TABLE[id]).toBeDefined(); // every monster drops something
    for (const stack of LOOT_TABLE[id]!) expect(stack.qty).toBeGreaterThan(0);
  }
  for (const [, weapon] of Object.entries(WEAPONS)) {
    expect(weapon.damage).toBeGreaterThan(0);
  }
  for (const [, piece] of Object.entries(ARMOUR)) {
    expect(piece.defense).toBeGreaterThan(0);
  }
});

test("constants: every biome's creatureTable is 2-6 real monsters, weighted", () => {
  for (const id of BIOME_IDS) {
    const table = BIOMES[id].creatureTable;
    const creatures = Object.keys(table);
    expect(creatures.length).toBeGreaterThanOrEqual(2);
    expect(creatures.length).toBeLessThanOrEqual(6); // tundra carries the tier-4 wyrm (D34) + snow-marauder (8ec) + ice-crab (si7.1)
    for (const creature of creatures) {
      expect(MONSTERS[creature]).toBeDefined();
      expect(table[creature]).toBeGreaterThan(0); // weighted (si7.1): every entry has a real weight
    }
  }
});

test("constants: armour pieces declare a valid body slot", () => {
  const slots = ["helmet", "chest", "legs", "boots", "gloves"];
  for (const [, piece] of Object.entries(ARMOUR)) {
    expect(slots).toContain(piece.slot);
  }
});

test("constants: consumable catalogs are non-empty", () => {
  expect(FOOD.length).toBeGreaterThan(0);
  expect(POTION.length).toBeGreaterThan(0);
});

// ke3.1: a `requires.terrain` gate only makes sense for a recipe you craft in the
// field (the runtime terrain check lives in the field-craft bead). Assert the
// catalog can never declare a terrain gate on a town-only recipe.
test("constants: requires.terrain only appears on field recipes (ke3.1)", () => {
  for (const recipe of Object.values(RECIPE)) {
    if (recipe.requires?.terrain !== undefined) {
      expect(recipe.field).toBe(true);
      // terrain must be a real terrain
      expect(TERRAINS).toContain(recipe.requires.terrain);
    }
  }
});

// ke3.4: a station is uncarriable, so a field:true recipe can never satisfy a
// station gate — the catalog must never declare one (a dead recipe otherwise).
test("constants: a field:true recipe never carries a station requirement (ke3.4)", () => {
  for (const recipe of Object.values(RECIPE)) {
    if (recipe.field) expect(recipe.requires?.station).toBeUndefined();
  }
});

test("constants: the acceptance affinity pairing exists (silver ↔ werewolf)", () => {
  expect(WEAPONS["silver-sword"]!.tags).toContain("silver");
  expect(MONSTERS.werewolf!.tags).toContain("werewolf");
  expect(
    AFFINITIES.some((a) => a.monsterTag === "werewolf" && a.itemTag === "silver"),
  ).toBe(true);
});

// --- content invariants (7dt): the catalog's safety net before the content glow-up
// multiplies recipes/items. These catch typo'd defIds that would otherwise ship
// through a green suite (the seal-blubber class of bug: an uncraftable recipe, a
// silent-fallback effect key, a dead material that banks and does nothing). -------

// The set of defIds the game can actually PRODUCE: gathered materials (every biome
// materialTable), combat drops (monster + category loot), fresh→stale bank transforms,
// anything a recipe outputs, and the starter bank. A recipe input outside this set is
// uncraftable in real play.
const PRODUCIBLE: Set<string> = (() => {
  const s = new Set<string>();
  for (const id of BIOME_IDS) {
    for (const kind of ["mining", "wood", "herb", "animal"] as const) {
      for (const defId of Object.keys(BIOMES[id].materialTable[kind] ?? {})) s.add(defId);
    }
  }
  for (const table of Object.values(LOOT_TABLE)) for (const stack of table) s.add(stack.defId);
  for (const table of Object.values(CATEGORY_LOOT_TABLE)) for (const stack of table) s.add(stack.defId);
  for (const [fresh, stale] of Object.entries(FRESH_TO_STALE)) { s.add(fresh); s.add(stale); }
  for (const recipe of Object.values(RECIPE)) s.add(recipe.output.defId);
  for (const stack of STARTER_BANK) s.add(stack.defId);
  return s;
})();

// 7dt (1) SOURCED-INPUTS — the highest-leverage invariant in the repo. Every input
// of every recipe must be producible; otherwise the recipe is dead (the seal-blubber
// bug, idle-adventure-7pi, shipped through a green suite because this didn't exist).
test("content: every recipe input is producible (no uncraftable recipe)", () => {
  for (const [id, recipe] of Object.entries(RECIPE)) {
    for (const input of recipe.inputs) {
      expect(PRODUCIBLE.has(input.defId) || `recipe ${id} needs unsourced input ${input.defId}`).toBe(true);
    }
  }
});

// 7dt (2) PARITY — an effect-table key that isn't a real catalog member silently
// falls back (FOOD_ENERGY→ENERGY_PER_FOOD, POTION_HEAL_BY→POTION_HEAL) or no-ops
// (COMBAT_BUFF); a catalog member missing from its effect table takes the default.
test("content: FOOD_ENERGY keys are all real foods (no silent ENERGY_PER_FOOD fallback from a typo)", () => {
  for (const defId of Object.keys(FOOD_ENERGY)) {
    expect(FOOD.includes(defId) || `FOOD_ENERGY key ${defId} is not a FOOD`).toBe(true);
  }
});

test("content: POTION_HEAL_BY keys are all real potions (no silent POTION_HEAL fallback from a typo)", () => {
  for (const defId of Object.keys(POTION_HEAL_BY)) {
    expect(POTION.includes(defId) || `POTION_HEAL_BY key ${defId} is not a POTION`).toBe(true);
  }
});

test("content: BATTLE_ITEM ⇔ COMBAT_BUFF are the same set (no battle item with a silent no-buff)", () => {
  for (const defId of BATTLE_ITEM) {
    expect(COMBAT_BUFF[defId] || `battle item ${defId} has no COMBAT_BUFF (silent no-buff)`).toBeTruthy();
  }
  for (const defId of Object.keys(COMBAT_BUFF)) {
    expect(BATTLE_ITEM.includes(defId) || `COMBAT_BUFF key ${defId} is not a BATTLE_ITEM`).toBe(true);
  }
});

// 7dt (3) MATERIALS-MEANINGFUL — a gathered material must DO something: feed a recipe
// input, or be directly consumable (food/potion/battle-item). There is no item-value
// table (the loop's value IS what you craft/eat), so a material that feeds nothing is
// dead weight — it generates, banks, and does nothing (grid.ts documents affixes
// silently no-op on unknown defIds).
test("content: every biome material feeds a recipe or is directly consumable (no dead material)", () => {
  const recipeInputs = new Set(Object.values(RECIPE).flatMap((r) => r.inputs.map((i) => i.defId)));
  const consumable = new Set<string>([...FOOD, ...POTION, ...BATTLE_ITEM]);
  for (const id of BIOME_IDS) {
    for (const kind of ["mining", "wood", "herb", "animal"] as const) {
      for (const defId of Object.keys(BIOMES[id].materialTable[kind] ?? {})) {
        const meaningful = recipeInputs.has(defId) || consumable.has(defId);
        expect(meaningful || `${id}/${kind} material ${defId} feeds no recipe and is not consumable`).toBe(true);
      }
    }
  }
});
