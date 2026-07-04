// Balance levers. POC ships feel-pass values, not balanced ones.
// Discipline: engine logic NEVER hardcodes a number — it reads a lever from here.
// M0 defines the NAMES and SHAPES with placeholder values; each milestone fills in
// the real numbers for its system. See docs/balance-levers.md.

// --- Map & forecast (filled in M1) ---
export const GRID_SIZE = 20; // tiles per side
export const NOISE_FREQUENCY = 0.15; // Perlin sample step per tile; lower = larger terrain regions
export const POI_DENSITY = 12; // POIs per map
export const POI_MIN_SPACING = 3; // min Chebyshev distance between POIs (spec: 3–4 tiles apart)
export const POI_PLACEMENT_ATTEMPTS = 400; // seeded rejection-sampling budget per map
export const CANDIDATE_MAP_COUNT = 3; // town map choices (spec §11)
export const PREVIEW_FIDELITY = 0; // how much a preview reveals (placeholder — M5)

// Terrain vocabulary. Array order = elevation band order for noise→terrain
// mapping (river lowest … mountain highest) — reordering it reshapes maps.
export const TERRAINS = ["river", "mud", "plains", "ice", "mountain"] as const;
export type Terrain = (typeof TERRAINS)[number];

// Node (POI) vocabulary — what biome nodeTypeWeights and (M3) hardness/yield key on.
export const NODE_TYPES = ["mining", "wood", "herb", "animal", "monster"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

// Node types the player can gather (monster nodes resolve via fight, M4).
export type GatherableNodeType = Exclude<NodeType, "monster">;

// --- Biomes (D21): generation profiles ONLY, consumed by generateGrid and
// never consulted after generation. Adding a biome = adding one entry here.
export const BIOME_IDS = ["woodland", "desert", "tundra"] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

export type Biome = {
  terrainWeights: Partial<Record<Terrain, number>>; // relative mix; zero/absent = never generates
  nodeTypeWeights: Partial<Record<NodeType, number>>; // relative POI kind mix
  creatureTable: string[]; // biome-flavoured monster defIds (filled M4)
  materialTable: Partial<Record<NodeType, Record<string, number>>>; // node kind → weighted material defIds (D27)
};

export const BIOMES: Record<BiomeId, Biome> = {
  woodland: {
    terrainWeights: { plains: 0.4, mud: 0.25, river: 0.15, mountain: 0.2 },
    nodeTypeWeights: { wood: 0.35, herb: 0.25, animal: 0.2, monster: 0.15, mining: 0.05 },
    creatureTable: ["werewolf", "fae-sprite", "forest-boar"],
    materialTable: {
      mining: { "iron-ore": 7, "copper-ore": 2, "silver-ore": 1 },
      wood: { "oak-log": 7, "pine-log": 2, "cactus-wood": 1 },
      herb: { "forest-herb": 7, "desert-sage": 2, "ice-moss": 1 },
      animal: { "deer-hide": 7, "wolf-pelt": 2, "lizard-hide": 1 },
    },
  },
  desert: {
    terrainWeights: { plains: 0.55, mountain: 0.3, river: 0.15 },
    nodeTypeWeights: { mining: 0.4, monster: 0.25, herb: 0.15, wood: 0.1, animal: 0.1 },
    creatureTable: ["giant-scorpion", "dust-vampire", "sand-raider"],
    materialTable: {
      mining: { "copper-ore": 7, "iron-ore": 2, "silver-ore": 1 },
      wood: { "cactus-wood": 7, "oak-log": 2, "pine-log": 1 },
      herb: { "desert-sage": 7, "forest-herb": 2, "ice-moss": 1 },
      animal: { "lizard-hide": 7, "deer-hide": 2, "wolf-pelt": 1 },
    },
  },
  tundra: {
    terrainWeights: { ice: 0.5, mountain: 0.25, plains: 0.15, river: 0.1 },
    nodeTypeWeights: { animal: 0.35, monster: 0.25, mining: 0.2, wood: 0.1, herb: 0.1 },
    creatureTable: ["frost-fae", "snow-wolf", "ice-troll"],
    materialTable: {
      mining: { "silver-ore": 7, "iron-ore": 2, "copper-ore": 1 },
      wood: { "pine-log": 7, "oak-log": 2, "cactus-wood": 1 },
      herb: { "ice-moss": 7, "desert-sage": 2, "forest-herb": 1 },
      animal: { "wolf-pelt": 7, "deer-hide": 2, "lizard-hide": 1 },
    },
  },
};

// --- Energy economy (filled in M2) ---
export const ENERGY_PER_FOOD = 10; // energy per packed food item
export const MOVE_BASE_COST = 1; // energy per tile on neutral ground, on foot
export const TERRAIN_COST: Record<Terrain, number> = {
  plains: 1,
  mud: 1.5,
  ice: 2,
  river: 3, // fordable but expensive
  mountain: Infinity, // impassable (gating gear may cheapen this later)
}; // cost multiplier per terrain stepped ONTO
export const TRANSPORT_MULTIPLIER: Record<string, number> = {
  horse: 1.5, // fast — divides move cost (spec §10: base × terrain ÷ transport)
  mule: 0.8, // slow — will pay for it in carry capacity (M3/M5)
}; // keyed by transport defId; absent/on-foot = 1

// --- Carry (filled in M3) ---
export const BASE_CARRY_SLOTS = 2; // carry stacks with no backpack equipped
export const BACKPACK_SLOTS: Record<string, number> = {
  starter: 4,
  leather: 6,
}; // TOTAL carry stacks by backpack defId (replaces the base, not added to it)
export const STACK_CAP = 10; // max qty per stack; overflow starts a new stack (new slot)

// --- Gathering (filled in M3) ---
// D21: hardness/tool/yield are per NODE TYPE, never per biome. The biome only
// flavours WHICH material a node yields — stamped at generation (D25).
export const NODE_HARDNESS: Record<GatherableNodeType, number> = {
  mining: 6,
  wood: 4,
  herb: 2,
  animal: 4,
}; // energy cost numerator: cost = hardness ÷ tool quality
export const NODE_TOOL: Record<GatherableNodeType, string | null> = {
  mining: "pick",
  wood: "axe",
  herb: null, // bare hands
  animal: "knife",
}; // required tool CAPABILITY per node type
export const TOOL_CAPABILITY: Record<string, string> = {
  pick: "pick",
  axe: "axe",
  knife: "knife",
  "iron-pick": "pick",
  "iron-axe": "axe",
  "steel-knife": "knife",
  spyglass: "scout", // scouting capability; NODE_TOOL never asks for "scout", so no gather impact
}; // tool defId → capability; tiered tools (M5: "iron-pick": "pick") are data-only
export const TOOL_QUALITY: Record<string, number> = {
  pick: 1,
  axe: 1,
  knife: 1,
  "iron-pick": 2, // halves mining cost vs the basic pick — the "cheaper second run" demonstrator
  "iron-axe": 2,
  "steel-knife": 2,
  spyglass: 1, // quality irrelevant to scouting; present to satisfy the catalog invariant
}; // gather-cost divisor by tool defId
export const GATHER_YIELD: Record<GatherableNodeType, number> = {
  mining: 3,
  wood: 3,
  herb: 2,
  animal: 2,
}; // qty gathered per (one-shot) node

// --- Combat (filled in M4) ---
export type DmgType = "melee" | "ranged" | "magic";
export type ArmourType = "plate" | "light" | "robe";

export const DMG_ARMOUR_MATRIX: Record<DmgType, Record<ArmourType, number>> = {
  melee: { plate: 1.0, light: 1.25, robe: 1.5 },
  ranged: { plate: 0.5, light: 1.0, robe: 1.5 },
  magic: { plate: 1.5, light: 1.0, robe: 0.5 },
}; // visible dmg×armour matrix (values from spec §5 — the one table settled now)

export const PLAYER_BASE_HP = 30; // player starting HP
export const CHIP_DAMAGE_MIN = 1; // floor on damage both directions; HP always drains, fights always end
export const POTION_HEAL = 10; // HP restored per potion use
export const AUTO_POTION_THRESHOLD = 0.5; // fraction of base HP to auto-quaff at
export const UNARMED_DAMAGE = 1; // damage when wielding no weapon

export const MONSTER_TIER_HP_CURVE: Record<number, number> = {
  1: 6,
  2: 12,
  3: 24,
}; // monster base HP by tier
export const MONSTER_TIER_DMG_CURVE: Record<number, number> = {
  1: 2,
  2: 4,
  3: 7,
}; // monster base damage by tier

export const AFFINITY_MULTIPLIER = 2; // hidden affinity effect, e.g. silver↔werewolf
export type Affinity = { monsterTag: string; itemTag: string };
export const AFFINITIES: Affinity[] = [
  { monsterTag: "werewolf", itemTag: "silver" },
  { monsterTag: "fae", itemTag: "iron" },
  { monsterTag: "vampire", itemTag: "garlic-coated" },
]; // discoverable damage multiplier pairings

export type Monster = { tier: number; dmgType: DmgType; armourType: ArmourType; tags: string[] };
export const MONSTERS: Record<string, Monster> = {
  werewolf: { tier: 2, dmgType: "melee", armourType: "light", tags: ["werewolf", "beast"] },
  "fae-sprite": { tier: 1, dmgType: "magic", armourType: "robe", tags: ["fae"] },
  "forest-boar": { tier: 1, dmgType: "melee", armourType: "light", tags: ["beast"] },
  "giant-scorpion": { tier: 2, dmgType: "melee", armourType: "plate", tags: ["beast"] },
  "dust-vampire": { tier: 3, dmgType: "magic", armourType: "robe", tags: ["vampire"] },
  "sand-raider": { tier: 1, dmgType: "ranged", armourType: "light", tags: [] },
  "frost-fae": { tier: 2, dmgType: "magic", armourType: "robe", tags: ["fae"] },
  "snow-wolf": { tier: 1, dmgType: "melee", armourType: "light", tags: ["beast"] },
  "ice-troll": { tier: 3, dmgType: "melee", armourType: "plate", tags: ["troll"] },
}; // monster combat stats and loot triggers

export type Weapon = { dmgType: DmgType; damage: number; tags: string[] };
export const WEAPONS: Record<string, Weapon> = {
  sword: { dmgType: "melee", damage: 3, tags: [] },
  "iron-sword": { dmgType: "melee", damage: 3, tags: ["iron"] },
  "silver-sword": { dmgType: "melee", damage: 3, tags: ["silver"] },
  bow: { dmgType: "ranged", damage: 3, tags: [] },
  "fire-staff": { dmgType: "magic", damage: 3, tags: [] },
}; // weapon damage type and affinity tags

export type ArmourSlot = "helmet" | "chest" | "legs" | "boots" | "gloves";
export const ARMOUR: Record<string, { armourType: ArmourType; defense: number; slot: ArmourSlot }> = {
  "plate-helmet": { armourType: "plate", defense: 2, slot: "helmet" },
  "plate-chest": { armourType: "plate", defense: 3, slot: "chest" },
  "plate-legs": { armourType: "plate", defense: 2, slot: "legs" },
  "plate-boots": { armourType: "plate", defense: 1, slot: "boots" },
  "plate-gloves": { armourType: "plate", defense: 1, slot: "gloves" },
  "light-helmet": { armourType: "light", defense: 1, slot: "helmet" },
  "light-chest": { armourType: "light", defense: 2, slot: "chest" },
  "light-legs": { armourType: "light", defense: 1, slot: "legs" },
  "light-boots": { armourType: "light", defense: 1, slot: "boots" },
  "light-gloves": { armourType: "light", defense: 1, slot: "gloves" },
  "robe-hood": { armourType: "robe", defense: 1, slot: "helmet" },
  "robe-chest": { armourType: "robe", defense: 1, slot: "chest" },
  "robe-legs": { armourType: "robe", defense: 1, slot: "legs" },
  "robe-boots": { armourType: "robe", defense: 1, slot: "boots" },
  "robe-gloves": { armourType: "robe", defense: 1, slot: "gloves" },
}; // armour pieces by type, defense contribution, and body slot (slot: M5 pack validation)

export const LOOT_TABLE: Record<string, ItemStackSpec[]> = {
  werewolf: [{ defId: "werewolf-pelt", qty: 2 }],
  "fae-sprite": [{ defId: "fae-dust", qty: 2 }],
  "forest-boar": [{ defId: "boar-hide", qty: 2 }],
  "giant-scorpion": [{ defId: "scorpion-carapace", qty: 2 }],
  "dust-vampire": [{ defId: "vampire-ash", qty: 2 }],
  "sand-raider": [{ defId: "raider-supplies", qty: 1 }],
  "frost-fae": [{ defId: "fae-dust", qty: 2 }],
  "snow-wolf": [{ defId: "wolf-pelt", qty: 2 }],
  "ice-troll": [{ defId: "troll-hide", qty: 2 }],
}; // monster fixed loot drops

export const SCOUT_ENERGY_COST = 1; // energy per scout activation
export const SCOUT_RADIUS = 3; // Chebyshev radius of scout reveal
export const SCOUT_TOOL = "spyglass"; // required tool defId for scouting

// --- Consumable item catalogs (M5) ---
// ENERGY_PER_FOOD / POTION_HEAL are flat, so these are single-item catalogs for
// the POC; the list is what `pack`/`slotOf` validate a food/potion defId against.
export const FOOD: string[] = ["ration"];
export const POTION: string[] = ["potion"];

// --- Crafting (M5): direct & instant, materials → item (D10). One shared tree
// so hauls from different biomes feed each other. Weighted materials (D27) make
// cross-biome inputs a soft pull (silver best-farmed in tundra), not a hard gate.
export const RECIPE: Record<string, { inputs: ItemStackSpec[]; output: ItemStackSpec }> = {
  // Consumables
  ration: { inputs: [{ defId: "forest-herb", qty: 1 }, { defId: "deer-hide", qty: 1 }], output: { defId: "ration", qty: 2 } },
  potion: { inputs: [{ defId: "desert-sage", qty: 1 }, { defId: "forest-herb", qty: 1 }], output: { defId: "potion", qty: 1 } },
  // Tools — tiered upgrades (iron-pick is the "cheaper second run" demonstrator)
  "iron-pick": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "iron-pick", qty: 1 } },
  "iron-axe": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "iron-axe", qty: 1 } },
  "steel-knife": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "silver-ore", qty: 1 }], output: { defId: "steel-knife", qty: 1 } },
  spyglass: { inputs: [{ defId: "copper-ore", qty: 2 }, { defId: "ice-moss", qty: 1 }], output: { defId: "spyglass", qty: 1 } }, // cross-biome: desert copper + tundra moss
  // Backpack — carry upgrade
  leather: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "leather", qty: 1 } },
  // Transport
  horse: { inputs: [{ defId: "deer-hide", qty: 3 }, { defId: "oak-log", qty: 2 }], output: { defId: "horse", qty: 1 } },
  // Weapons
  "iron-sword": { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "iron-sword", qty: 1 } },
  "silver-sword": { inputs: [{ defId: "silver-ore", qty: 3 }], output: { defId: "silver-sword", qty: 1 } }, // werewolf affinity; silver best-farmed in tundra
  bow: { inputs: [{ defId: "oak-log", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "bow", qty: 1 } },
  "fire-staff": { inputs: [{ defId: "pine-log", qty: 2 }, { defId: "fae-dust", qty: 1 }], output: { defId: "fire-staff", qty: 1 } },
  // Armour — full plate set + light/robe samples
  "plate-helmet": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "plate-helmet", qty: 1 } },
  "plate-chest": { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "plate-chest", qty: 1 } },
  "plate-legs": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "plate-legs", qty: 1 } },
  "plate-boots": { inputs: [{ defId: "iron-ore", qty: 1 }], output: { defId: "plate-boots", qty: 1 } },
  "plate-gloves": { inputs: [{ defId: "iron-ore", qty: 1 }], output: { defId: "plate-gloves", qty: 1 } },
  "light-chest": { inputs: [{ defId: "deer-hide", qty: 2 }], output: { defId: "light-chest", qty: 1 } },
  "light-legs": { inputs: [{ defId: "deer-hide", qty: 1 }, { defId: "wolf-pelt", qty: 1 }], output: { defId: "light-legs", qty: 1 } },
  "robe-chest": { inputs: [{ defId: "forest-herb", qty: 2 }, { defId: "ice-moss", qty: 1 }], output: { defId: "robe-chest", qty: 1 } },
  "robe-hood": { inputs: [{ defId: "forest-herb", qty: 1 }, { defId: "ice-moss", qty: 1 }], output: { defId: "robe-hood", qty: 1 } },
};

type ItemStackSpec = { defId: string; qty: number };
