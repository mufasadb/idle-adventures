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
  TOOL_QUALITY,
  TOOL_CAPABILITY,
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
} from "../src/data/constants";

test("constants: lever groups exist with the documented shape", () => {
  expect(typeof MAP_WIDTH).toBe("number");
  expect(typeof MAP_HEIGHT).toBe("number");
  expect(TERRAIN_COST).toHaveProperty("ice");
  expect(BACKPACK_SLOTS).toHaveProperty("small-backpack");
});

test("constants: M1 map levers are filled", () => {
  // 20×60 strip (e3j): phone-portrait — thumb-wide, scroll-long
  expect(MAP_WIDTH).toBe(20);
  expect(MAP_HEIGHT).toBe(60);
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
  for (const tool of Object.keys(TOOL_QUALITY)) {
    expect(TOOL_CAPABILITY[tool]).toBeDefined(); // every tool declares its capability
    expect(TOOL_QUALITY[tool]).toBeGreaterThan(0); // 0 → Infinity cost; negative → energy-GAINING gather
  }
  for (const tool of Object.keys(TOOL_CAPABILITY)) {
    expect(TOOL_QUALITY[tool]).toBeDefined(); // every capable tool has a quality
  }
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
