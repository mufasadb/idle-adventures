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
    creatureTable: [],
    materialTable: {},
  },
  desert: {
    terrainWeights: { plains: 0.75, mountain: 0.2, river: 0.05 },
    nodeTypeWeights: { mining: 0.4, monster: 0.25, herb: 0.15, wood: 0.1, animal: 0.1 },
    creatureTable: [],
    materialTable: {},
  },
  tundra: {
    terrainWeights: { ice: 0.5, mountain: 0.25, plains: 0.15, river: 0.1 },
    nodeTypeWeights: { animal: 0.35, monster: 0.25, mining: 0.2, wood: 0.1, herb: 0.1 },
    creatureTable: [],
    materialTable: {},
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
export const BACKPACK_SLOTS = { starter: 0 } as Record<string, number>; // slots per backpack tier (placeholder — M3)
export const STACK_CAP = 0; // max qty per stack (placeholder — M3)

// --- Gathering (filled in M3) ---
export const NODE_HARDNESS = {} as Record<string, number>; // by node type/tier (placeholder — M3)
export const TOOL_QUALITY = {} as Record<string, number>; // by tool (placeholder — M3)
export const GATHER_YIELD = {} as Record<string, number>; // by node (placeholder — M3)

// --- Combat (filled in M4) ---
export const PLAYER_BASE_HP = 0; // (placeholder — M4)
export const DMG_ARMOUR_MATRIX = {
  melee: { plate: 1.0, light: 1.25, robe: 1.5 },
  ranged: { plate: 0.5, light: 1.0, robe: 1.5 },
  magic: { plate: 1.5, light: 1.0, robe: 0.5 },
} as const; // visible dmg×armour matrix (values from spec §5 — the one table settled now)
export const ARMOUR_DEFENSE = {} as Record<string, number>; // by piece/tier (placeholder — M4)
export const AFFINITY_MULTIPLIER = 1; // hidden affinity effect, e.g. silver↔werewolf (placeholder — M4)
export const POTION_HEAL = 0; // (placeholder — M4)
export const AUTO_POTION_THRESHOLD = 0; // HP fraction to auto-quaff (placeholder — M4)
export const MONSTER_TIER_HP_CURVE = {} as Record<string, number>; // (placeholder — M4)
export const MONSTER_TIER_DMG_CURVE = {} as Record<string, number>; // (placeholder — M4)
export const LOOT_TABLE = {} as Record<string, ItemStackSpec[]>; // by monster (placeholder — M4)

// --- Crafting (filled in M5) ---
export const RECIPE = {} as Record<string, { inputs: ItemStackSpec[]; output: ItemStackSpec }>; // (placeholder — M5)

type ItemStackSpec = { defId: string; qty: number };
