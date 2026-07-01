// Balance levers. POC ships feel-pass values, not balanced ones.
// Discipline: engine logic NEVER hardcodes a number — it reads a lever from here.
// M0 defines the NAMES and SHAPES with placeholder values; each milestone fills in
// the real numbers for its system. See docs/balance-levers.md.

// --- Map & forecast (filled in M1) ---
export const GRID_SIZE = 20; // tiles per side (placeholder — see M1)
export const POI_DENSITY = 0; // POIs per map (placeholder — see M1)
export const POI_MIN_SPACING = 0; // min tiles between POIs (placeholder — see M1)
export const NOISE_THRESHOLDS = {} as Record<string, number>; // terrain cutoffs (placeholder — M1)
export const CANDIDATE_MAP_COUNT = 3; // town map choices (spec §11)
export const PREVIEW_FIDELITY = 0; // how much a preview reveals (placeholder — M5)

// --- Energy economy (filled in M2) ---
export const ENERGY_PER_FOOD = 0; // energy per packed food item (placeholder — M2)
export const MOVE_BASE_COST = 0; // energy per tile on neutral ground (placeholder — M2)
export const TERRAIN_COST = {
  plains: 0,
  mud: 0,
  ice: 0,
  river: 0,
  mountain: 0,
} as const; // per-terrain multiplier (placeholder — M2)
export const TRANSPORT_MULTIPLIER = {} as Record<string, number>; // move-cost reduction (placeholder — M2)

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
