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
  materialTable: Partial<Record<NodeType, string>>; // node kind → material defId (filled M3/M5)
};

export const BIOMES: Record<BiomeId, Biome> = {
  woodland: {
    terrainWeights: { plains: 0.4, mud: 0.25, river: 0.15, mountain: 0.2 },
    nodeTypeWeights: { wood: 0.35, herb: 0.25, animal: 0.2, monster: 0.15, mining: 0.05 },
    creatureTable: ["werewolf", "fae-sprite", "forest-boar"],
    materialTable: { mining: "iron-ore", wood: "oak-log", herb: "forest-herb", animal: "deer-hide" },
  },
  desert: {
    terrainWeights: { plains: 0.55, mountain: 0.3, river: 0.15 },
    nodeTypeWeights: { mining: 0.4, monster: 0.25, herb: 0.15, wood: 0.1, animal: 0.1 },
    creatureTable: ["giant-scorpion", "dust-vampire", "sand-raider"],
    materialTable: { mining: "copper-ore", wood: "cactus-wood", herb: "desert-sage", animal: "lizard-hide" },
  },
  tundra: {
    terrainWeights: { ice: 0.5, mountain: 0.25, plains: 0.15, river: 0.1 },
    nodeTypeWeights: { animal: 0.35, monster: 0.25, mining: 0.2, wood: 0.1, herb: 0.1 },
    creatureTable: ["frost-fae", "snow-wolf", "ice-troll"],
    materialTable: { mining: "silver-ore", wood: "pine-log", herb: "ice-moss", animal: "wolf-pelt" },
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
}; // tool defId → capability; tiered tools (M5: "iron-pick": "pick") are data-only
export const TOOL_QUALITY: Record<string, number> = {
  pick: 1,
  axe: 1,
  knife: 1,
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

export const ARMOUR: Record<string, { armourType: ArmourType; defense: number }> = {
  "plate-helmet": { armourType: "plate", defense: 2 },
  "plate-chest": { armourType: "plate", defense: 3 },
  "plate-legs": { armourType: "plate", defense: 2 },
  "plate-boots": { armourType: "plate", defense: 1 },
  "plate-gloves": { armourType: "plate", defense: 1 },
  "light-helmet": { armourType: "light", defense: 1 },
  "light-chest": { armourType: "light", defense: 2 },
  "light-legs": { armourType: "light", defense: 1 },
  "light-boots": { armourType: "light", defense: 1 },
  "light-gloves": { armourType: "light", defense: 1 },
  "robe-hood": { armourType: "robe", defense: 1 },
  "robe-chest": { armourType: "robe", defense: 1 },
  "robe-legs": { armourType: "robe", defense: 1 },
  "robe-boots": { armourType: "robe", defense: 1 },
  "robe-gloves": { armourType: "robe", defense: 1 },
}; // armour pieces by type and defense contribution

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

// --- Crafting (filled in M5) ---
export const RECIPE = {} as Record<string, { inputs: ItemStackSpec[]; output: ItemStackSpec }>; // (placeholder — M5)

type ItemStackSpec = { defId: string; qty: number };
