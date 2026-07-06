// Balance levers. POC ships feel-pass values, not balanced ones.
// Discipline: engine logic NEVER hardcodes a number — it reads a lever from here.
// M0 defines the NAMES and SHAPES with placeholder values; each milestone fills in
// the real numbers for its system. See docs/balance-levers.md.

// --- Map & perception (filled in M1) ---
export const GRID_SIZE = 20; // tiles per side
export const NOISE_FREQUENCY = 0.15; // Perlin sample step per tile; lower = larger terrain regions
export const POI_DENSITY = 18; // POIs per map — richer than one run can harvest (2026-07-05, qrl): forces "which region do I work?" (sim: ~91%→~55% cleared with 3 food slots). Was 12.
export const POI_MIN_SPACING = 3; // min Chebyshev distance between POIs (spec: 3–4 tiles apart)
export const POI_PLACEMENT_ATTEMPTS = 400; // seeded rejection-sampling budget per map
export const FOOD_REACH_MIN = 2; // Phase 3 (b91): min forageable (herb/animal) nodes that must sit on finite on-foot cost-to-reach tiles; else generateGrid falls back to unbiased placement so a bare loadout is never walled off from food
// Perception (9u9.2): node KIND is always visible; a node's qualitative identity
// (species/material/tier/dmg+armour type — never the fight outcome) resolves only
// within this Chebyshev radius of the player. Tools in VISION_RANGE_BONUS widen it
// (data-driven like TERRAIN_GATE; future glasses/cartography/scent items slot in).
export const DETAIL_RADIUS = 2;
export const VISION_RANGE_BONUS: Record<string, number> = { spyglass: 3 }; // spyglass → radius 5
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
      mining: { "iron-ore": 7, "copper-ore": 2, "silver-ore": 1 }, // silver present (D27) but T2-gated
      wood: { "oak-log": 7, "pine-log": 2, "ironwood-log": 1 }, // ironwood T2 (iron-axe)
      herb: { "forest-herb": 7, "desert-sage": 2, "ice-moss": 1 },
      animal: { "deer-hide": 7, "wolf-pelt": 2, "lizard-hide": 1 },
    },
  },
  desert: {
    terrainWeights: { plains: 0.55, mountain: 0.3, river: 0.15 },
    nodeTypeWeights: { mining: 0.4, monster: 0.25, herb: 0.15, wood: 0.1, animal: 0.1 },
    creatureTable: ["giant-scorpion", "dust-vampire", "sand-raider"],
    materialTable: {
      mining: { "copper-ore": 7, "iron-ore": 2, "coal": 1 }, // coal T2 (iron-pick) — desert is a fuel source
      wood: { "cactus-wood": 7, "oak-log": 2, "pine-log": 1 },
      herb: { "desert-sage": 7, "forest-herb": 2, "ice-moss": 1 },
      animal: { "lizard-hide": 7, "deer-hide": 2, "drake-hide": 1 }, // drake T2 (steel-knife)
    },
  },
  tundra: {
    terrainWeights: { ice: 0.5, mountain: 0.25, plains: 0.15, river: 0.1 },
    nodeTypeWeights: { animal: 0.35, monster: 0.25, mining: 0.2, wood: 0.1, herb: 0.1 },
    creatureTable: ["frost-fae", "snow-wolf", "ice-troll", "ancient-wyrm"], // wyrm = the tier-4 boss/goal (~1-in-4 tundra monster POIs); no spawn code — its lethality is the gate (D34)
    materialTable: {
      mining: { "silver-ore": 5, "coal": 2, "iron-ore": 2, "mithril-ore": 1 }, // silver T2 + coal T2 + mithril T3: tundra is the deep-tier mine
      wood: { "pine-log": 7, "oak-log": 2, "ironwood-log": 1 },
      herb: { "ice-moss": 7, "desert-sage": 2, "forest-herb": 1 },
      animal: { "wolf-pelt": 7, "deer-hide": 2, "drake-hide": 1 },
    },
  },
};

// Gather tier gate (2026-07-04): a material's tier; a POI is workable only when
// the player's best tool for that node's capability has quality >= this tier
// (see reduce.gather / tools.toolQualityFor). Absent = tier 1. This one lever
// gates the entire tech tree — no smelting step. Design:
// docs/superpowers/specs/2026-07-04-tiered-progression-carry-squeeze-design.md
export const MATERIAL_TIER: Record<string, number> = {
  coal: 2,
  "silver-ore": 2,
  "ironwood-log": 2,
  "drake-hide": 2,
  "mithril-ore": 3,
};

// --- Energy economy (filled in M2; rescaled ×10 for graded movement, svz) ---
// Every energy-denominated lever sits on a ×10 scale so gear can shave meaningful
// POINTS off a step (TERRAIN_GATE) without snapping to impassable — ratios are
// preserved vs the old scale, so the economy feel is unchanged.
export const ENERGY_PER_FOOD = 80; // default energy per packed food item (fallback for FOOD_ENERGY)
// Base energy floor (qrl, ×10 svz): embark energy = max(BASE_ENERGY_FLOOR,
// packedFoodEnergy). ~5 actions with no food — the recoverable-by-effort fail
// state (spec §3), NOT a 0-energy dead-loop. See reduce.embark.
export const BASE_ENERGY_FLOOR = 200;
// Per-food energy (tiered): denser food gives more per item, earning slot efficiency
// against the carry squeeze. Absent = ENERGY_PER_FOOD.
export const FOOD_ENERGY: Record<string, number> = {
  ration: 80,
  "trail-ration": 160, // stays 2× a ration — the T2 density edge
};
export const MIN_STEP = 5; // a discounted step never costs less than this (svz)
// Movement is GRADED (svz): TERRAIN_COST is ABSOLUTE step energy on a ×10 scale.
// Gear subtracts point-discounts (TERRAIN_GATE), transport divides per-terrain.
// Mountains stay the one hard gate (Infinity) until a tool ENABLES them.
export const TERRAIN_COST: Record<Terrain, number> = {
  plains: 10,
  mud: 15,
  ice: 20,
  river: 30,
  mountain: Infinity, // impassable — climbing-pick enables it (TERRAIN_GATE)
}; // absolute energy per tile stepped ONTO, on foot, before gear/transport
// Equipped tools that modify gated terrain (svz). `enable` makes an impassable
// terrain finite (mountain only); `discount` subtracts from the step energy. Each
// tool costs a tool slot, so bringing it is a real loadout tradeoff.
export const TERRAIN_GATE: Partial<Record<Terrain, Record<string, { enable?: number; discount?: number }>>> = {
  mountain: { "climbing-pick": { enable: 40 } }, // ∞ → 40 (crossable at 4× plains)
  river: { raft: { discount: 20 } }, // 30 → 10 (≈ plains)
  mud: { waders: { discount: 5 } }, // 15 → 10
  ice: { "ice-cleats": { discount: 15 } }, // 20 → 5 (faster than plains — a tundra highway)
};
export const TRANSPORT_MULTIPLIER: Record<string, Partial<Record<Terrain, number>>> = {
  horse: { plains: 2, mud: 1.2 }, // open-ground speed; ice/river/mountain default ÷1
  wagon: { ice: 2, plains: 1.5, mud: 1.2 }, // the ice answer + general hauler
  mule: { plains: 0.8, mud: 0.8, ice: 0.8, river: 0.8 }, // slow, but the big carrier (carry role unchanged)
}; // per-terrain move-cost divisor by transport defId; absent terrain / on-foot = ÷1

// Carry sources stack (zhn, spec §4.4): bringing transport adds a small carry
// bonus on top of your backpack; a beast (horse/mule) can also wear panniers for
// more. So a mule + panniers is a hauler; a horse is fast with a little extra room.
export const TRANSPORT_CARRY: Record<string, number> = {
  horse: 2,
  wagon: 6, // a cart hauls cargo (but can't wear panniers — not a beast)
  mule: 4, // the pack animal
}; // extra inventory slots added by transport defId; absent = 0
export const BEAST_TRANSPORTS: string[] = ["horse", "mule"]; // living transports panniers can strap to
export const PANNIERS: string[] = ["panniers"]; // saddlebag catalog (zhn)
export const PANNIERS_SLOTS: Record<string, number> = {
  panniers: 4, // extra slots, but ONLY with a beast transport equipped
}; // keyed by panniers defId

// --- Carry (filled in M3; rebalanced Phase 2 / pqp) ---
// Slots are now UNIT-based (pqp): each food/potion/battleItem unit and each tool
// takes one slot; only loot materials stack (STACK_CAP). So a food supply is ~5×
// the slot pressure it was — caps are bumped to keep a run viable while keeping
// the food↔loot squeeze live. Loot still compresses (STACK_CAP), consumables don't.
export const BASE_CARRY_SLOTS = 6; // slots with NO backpack (bare) — a minimal run: a tool + a little food + some loot
export const BACKPACK_SLOTS: Record<string, number> = {
  starter: 8, // your first craftable pack
  leather: 12,
  "large-pack": 16, // top tier
}; // TOTAL inventory slots by backpack defId (replaces the base, not added to it)
export const STACK_CAP = 5; // max qty per LOOT stack; overflow opens a new stack (slot). Consumables/tools do NOT stack (pqp) — one unit per slot.

// --- Gathering (filled in M3) ---
// D21: hardness/tool/yield are per NODE TYPE, never per biome. The biome only
// flavours WHICH material a node yields — stamped at generation (D25).
export const NODE_HARDNESS: Record<GatherableNodeType, number> = {
  mining: 60,
  wood: 40,
  herb: 20,
  animal: 40,
}; // energy cost numerator (×10 svz): cost = hardness ÷ tool quality
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
  "steel-pick": "pick",
  "steel-axe": "axe",
  "steel-knife": "knife",
  spyglass: "vision", // perception-range capability (9u9.2); NODE_TOOL never asks for it, so no gather impact
  "climbing-pick": "climb", // gating capability (boo); NODE_TOOL never asks for "climb", so no gather impact
  raft: "ford", // gating capability for rivers (boo)
  waders: "wade", // graded-movement gear (svz); NODE_TOOL never asks for it
  "ice-cleats": "trek",
}; // tool defId → capability; tiered tools (M5: "iron-pick": "pick") are data-only
export const TOOL_QUALITY: Record<string, number> = {
  pick: 1,
  axe: 1,
  knife: 1,
  "iron-pick": 2, // halves mining cost vs the basic pick — the "cheaper second run" demonstrator
  "iron-axe": 2,
  "steel-pick": 3, // tier 3: unlocks mithril; also cheapest mining
  "steel-axe": 3,
  "steel-knife": 2,
  spyglass: 1, // quality irrelevant to vision; present to satisfy the catalog invariant
  "climbing-pick": 1, // quality irrelevant to gating; present to satisfy the catalog invariant
  raft: 1,
  waders: 1,
  "ice-cleats": 1,
}; // gather-cost divisor AND tier gate (quality == max MATERIAL_TIER gatherable)
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
export const POTION_HEAL = 10; // default HP restored per potion use (fallback for POTION_HEAL_BY)
// Per-potion heal (2026-07-04): tiered potions restore more, gated by a T2
// material so they too sit behind the iron-pick. Absent = POTION_HEAL.
export const POTION_HEAL_BY: Record<string, number> = {
  potion: 10,
  "greater-potion": 20,
};
export const AUTO_POTION_THRESHOLD = 0.5; // fraction of base HP to auto-quaff at
export const UNARMED_DAMAGE = 1; // damage when wielding no weapon

export const MONSTER_TIER_HP_CURVE: Record<number, number> = {
  1: 6,
  2: 14,
  3: 28,
  4: 48, // tier-4 boss (ancient-wyrm) — winnable only with the full mithril climb + ≥3 greater-potions (D34)
}; // monster base HP by tier
export const MONSTER_TIER_DMG_CURVE: Record<number, number> = {
  1: 2,
  2: 5,
  3: 11,
  4: 20, // tier-4 boss — magic into plate (÷1.5) stays lethal even in full mithril (D34)
}; // monster base damage by tier. Steepened 2026-07-05 so cheap iron plate no
   // longer floors tier-3 — you need the steel/mithril climb to tame them.

// Combat consumables (bzd, spec §4.3): a "battle item" packed into the loadout
// buffs a SINGLE fight and is consumed at fight start. Gated only behind fighting
// T3 monsters (vampire→elixir, troll→warding), so a player who FOUGHT their way
// up can beat the Wyrm without the full mithril grind — at a real inventory-slot
// cost (pqp). resolveCombat sums damageAdd into dmgOut and mitigationAdd into
// mitigation. Absent defId = no buff.
export const COMBAT_BUFF: Record<string, { damageAdd?: number; mitigationAdd?: number }> = {
  "elixir-of-power": { damageAdd: 2 }, // from dust-vampire's vampire-ash
  "warding-draught": { mitigationAdd: 3 }, // from ice-troll's troll-hide
};

export const AFFINITY_MULTIPLIER = 2; // hidden affinity effect, e.g. silver↔werewolf
export type Affinity = { monsterTag: string; itemTag: string };
export const AFFINITIES: Affinity[] = [
  { monsterTag: "werewolf", itemTag: "silver" },
  { monsterTag: "fae", itemTag: "iron" },
  { monsterTag: "vampire", itemTag: "garlic-coated" },
  { monsterTag: "dragon", itemTag: "wyrmbane" }, // wyrmfang ×2 vs the Wyrm — the first kill is brutal, then the boss becomes a farmable node (D34)
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
  // Tier-4 boss (D34): magic damage into a plate hide — punishes the plate
  // strategy that carried the whole game (plate weak to magic, ÷1.5). The
  // dragon tag pairs with the wyrmbane affinity so wyrmfang farms it (§4.1).
  "ancient-wyrm": { tier: 4, dmgType: "magic", armourType: "plate", tags: ["dragon"] },
}; // monster combat stats and loot triggers

export type Weapon = { dmgType: DmgType; damage: number; tags: string[] };
export const WEAPONS: Record<string, Weapon> = {
  // T1 (damage 3) — starter/basic, matrix + affinity choices live here early
  sword: { dmgType: "melee", damage: 3, tags: [] },
  "iron-sword": { dmgType: "melee", damage: 3, tags: ["iron"] }, // fae affinity
  bow: { dmgType: "ranged", damage: 3, tags: [] },
  "fire-staff": { dmgType: "magic", damage: 3, tags: [] },
  // T2 (damage 4) — gated by a T2 material; silver-sword is the werewolf pick
  "silver-sword": { dmgType: "melee", damage: 3, tags: ["silver"] }, // stays dmg 3; its edge is the ×2 affinity
  "steel-sword": { dmgType: "melee", damage: 4, tags: [] },
  "composite-bow": { dmgType: "ranged", damage: 4, tags: [] },
  "inferno-staff": { dmgType: "magic", damage: 4, tags: [] },
  // T3 (damage 6) — melee only; top of the mithril climb
  "mithril-sword": { dmgType: "melee", damage: 6, tags: [] },
  // Boss capstone (D34) — from the Wyrm's rare dragonheart. dmg 8 + wyrmbane
  // affinity (×2 vs dragons) turns the brutal first kill into a farmable node.
  wyrmfang: { dmgType: "melee", damage: 8, tags: ["wyrmbane"] },
}; // weapon damage type and affinity tags. Damage scales modestly (3/4/6) so armour type still matters vs a tier-up weapon

export type ArmourSlot = "helmet" | "chest" | "legs" | "boots" | "gloves";
export const ARMOUR: Record<string, { armourType: ArmourType; defense: number; slot: ArmourSlot }> = {
  "plate-helmet": { armourType: "plate", defense: 1, slot: "helmet" }, // iron plate Σ6 (cut 2026-07-05): protective but doesn't floor tier-3
  "plate-chest": { armourType: "plate", defense: 2, slot: "chest" },
  "plate-legs": { armourType: "plate", defense: 1, slot: "legs" },
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
  // --- Tier ladder (2026-07-04). Plate carries the full 3-tier climb (it's the
  // combat-trivializer at the top); light/robe get a single T2 bump on their
  // sample pieces so type-matchup stays a live choice without a full extra set.
  // Steel = iron plate +1/pc (coal-gated); mithril = iron plate +2/pc (steel-pick-gated).
  "steel-plate-helmet": { armourType: "plate", defense: 2, slot: "helmet" }, // steel Σ10: tames tier-3 to a real but survivable fight
  "steel-plate-chest": { armourType: "plate", defense: 3, slot: "chest" },
  "steel-plate-legs": { armourType: "plate", defense: 2, slot: "legs" },
  "steel-plate-boots": { armourType: "plate", defense: 2, slot: "boots" },
  "steel-plate-gloves": { armourType: "plate", defense: 1, slot: "gloves" },
  "mithril-plate-helmet": { armourType: "plate", defense: 3, slot: "helmet" }, // mithril Σ15: the trivializer, top of the climb
  "mithril-plate-chest": { armourType: "plate", defense: 4, slot: "chest" },
  "mithril-plate-legs": { armourType: "plate", defense: 3, slot: "legs" },
  "mithril-plate-boots": { armourType: "plate", defense: 3, slot: "boots" },
  "mithril-plate-gloves": { armourType: "plate", defense: 2, slot: "gloves" },
  "studded-chest": { armourType: "light", defense: 3, slot: "chest" }, // light-chest +1 (drake-gated)
  "studded-legs": { armourType: "light", defense: 2, slot: "legs" },
  "enchanted-chest": { armourType: "robe", defense: 2, slot: "chest" }, // robe-chest +1 (silver-gated)
  "enchanted-hood": { armourType: "robe", defense: 2, slot: "helmet" },
  // --- Combat-drop shortcuts (2026-07-05, peu): monster parts craft into gear,
  // so routing AROUND a monster forfeits real power (§4.2). Each bypasses a
  // normal material gate — the reward for choosing to fight.
  "warg-jerkin": { armourType: "light", defense: 3, slot: "chest" }, // werewolf-pelt → light chest def 3, no drake needed
  "scorpion-plate-chest": { armourType: "plate", defense: 3, slot: "chest" }, // scorpion-carapace → steel-grade plate chest, NO coal
  "dragonscale-cuirass": { armourType: "plate", defense: 5, slot: "chest" }, // boss drop — best chest in the game (D34)
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
  // Boss (D34): wyrm-scale always → dragonscale-cuirass; dragonheart @0.2 (the
  // 1/5 rare) → wyrmfang. `chance` is rolled per-encounter in fightAt (§4.5).
  "ancient-wyrm": [{ defId: "wyrm-scale", qty: 3 }, { defId: "dragonheart", qty: 1, chance: 0.2 }],
}; // monster fixed loot drops (entries with `chance` roll deterministically in fightAt)

// --- Consumable item catalogs (M5) ---
// ENERGY_PER_FOOD / POTION_HEAL are flat, so these are single-item catalogs for
// the POC; the list is what `pack`/`slotOf` validate a food/potion defId against.
export const FOOD: string[] = ["ration", "trail-ration"];
export const POTION: string[] = ["potion", "greater-potion"];
export const BATTLE_ITEM: string[] = ["elixir-of-power", "warding-draught"]; // combat consumables (bzd); COMBAT_BUFF keys

// --- Crafting (M5): direct & instant, materials → item (D10). One shared tree
// so hauls from different biomes feed each other. Weighted materials (D27) make
// cross-biome inputs a soft pull (silver best-farmed in tundra), not a hard gate.
export const RECIPE: Record<string, { inputs: ItemStackSpec[]; output: ItemStackSpec }> = {
  // Consumables — T1. Rations are FORAGED: any herb → food. Herbs need no tool
  // and every biome has herb nodes, so food is always sustainable wherever you
  // go (one variant per herb so the loop never depends on a specific biome).
  ration: { inputs: [{ defId: "forest-herb", qty: 2 }], output: { defId: "ration", qty: 2 } },
  "ration-sage": { inputs: [{ defId: "desert-sage", qty: 2 }], output: { defId: "ration", qty: 2 } },
  "ration-moss": { inputs: [{ defId: "ice-moss", qty: 2 }], output: { defId: "ration", qty: 2 } },
  // …or from HUNTING — every T1 hide is also meat. Herb-poor biomes (tundra is
  // 88% ice, ~10% herb but ~35% animal) stay fed by hunting instead of foraging,
  // so food is robust everywhere. Hides double as gear stock — a real tradeoff.
  "ration-venison": { inputs: [{ defId: "deer-hide", qty: 1 }], output: { defId: "ration", qty: 2 } },
  "ration-game": { inputs: [{ defId: "wolf-pelt", qty: 1 }], output: { defId: "ration", qty: 2 } },
  "ration-jerky": { inputs: [{ defId: "lizard-hide", qty: 1 }], output: { defId: "ration", qty: 2 } },
  potion: { inputs: [{ defId: "desert-sage", qty: 1 }, { defId: "forest-herb", qty: 1 }], output: { defId: "potion", qty: 1 } },
  // Consumables — T2 (gated by a T2 material → sit behind the iron-pick)
  "trail-ration": { inputs: [{ defId: "ration", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "trail-ration", qty: 1 } }, // cooked over coal — denser energy/slot
  "greater-potion": { inputs: [{ defId: "potion", qty: 1 }, { defId: "silver-ore", qty: 1 }], output: { defId: "greater-potion", qty: 1 } },
  // Tools — tiered upgrades (iron-pick is the "cheaper second run" demonstrator)
  "iron-pick": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "iron-pick", qty: 1 } },
  "iron-axe": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "iron-axe", qty: 1 } },
  // T3 tools need coal (T2, iron-pick-gated) → you must climb pick→iron-pick→mine coal before steel exists
  "steel-pick": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 2 }], output: { defId: "steel-pick", qty: 1 } },
  "steel-axe": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "steel-axe", qty: 1 } },
  "steel-knife": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "silver-ore", qty: 1 }], output: { defId: "steel-knife", qty: 1 } }, // silver T2 → iron-pick-gated
  spyglass: { inputs: [{ defId: "copper-ore", qty: 2 }, { defId: "ice-moss", qty: 1 }], output: { defId: "spyglass", qty: 1 } }, // cross-biome: desert copper + tundra moss
  // Terrain-gating tools (boo): each a tool slot, so bringing one is a real loadout tradeoff
  "climbing-pick": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "climbing-pick", qty: 1 } }, // enables mountains (∞ → 40)
  raft: { inputs: [{ defId: "pine-log", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "raft", qty: 1 } }, // discounts rivers (30 → 10)
  waders: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "pine-log", qty: 1 }], output: { defId: "waders", qty: 1 } }, // discounts mud (15 → 10)
  "ice-cleats": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "wolf-pelt", qty: 1 }], output: { defId: "ice-cleats", qty: 1 } }, // glide on ice (20 → 5)
  // Backpack — carry upgrades. `starter` is your FIRST pack (you start bare):
  // cheap, one hunt's worth of hide. Then leather (5), large-pack (7, T2).
  starter: { inputs: [{ defId: "deer-hide", qty: 1 }], output: { defId: "starter", qty: 1 } },
  leather: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "leather", qty: 1 } },
  "large-pack": { inputs: [{ defId: "drake-hide", qty: 2 }, { defId: "ironwood-log", qty: 1 }], output: { defId: "large-pack", qty: 1 } },
  // Transport
  horse: { inputs: [{ defId: "deer-hide", qty: 3 }, { defId: "oak-log", qty: 2 }], output: { defId: "horse", qty: 1 } },
  wagon: { inputs: [{ defId: "ironwood-log", qty: 2 }, { defId: "iron-ore", qty: 2 }], output: { defId: "wagon", qty: 1 } }, // T2: ironwood → iron-axe
  panniers: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "panniers", qty: 1 } }, // saddlebags — extra carry, needs a beast (zhn)
  // Weapons — T1
  "iron-sword": { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "iron-sword", qty: 1 } },
  bow: { inputs: [{ defId: "oak-log", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "bow", qty: 1 } },
  "fire-staff": { inputs: [{ defId: "pine-log", qty: 2 }, { defId: "fae-dust", qty: 1 }], output: { defId: "fire-staff", qty: 1 } },
  // Weapons — T2 (each needs a T2 material → all sit behind the iron-pick/iron-axe/steel-knife tier)
  "silver-sword": { inputs: [{ defId: "silver-ore", qty: 3 }], output: { defId: "silver-sword", qty: 1 } }, // werewolf affinity; silver T2, best-farmed in tundra
  "steel-sword": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "steel-sword", qty: 1 } },
  "composite-bow": { inputs: [{ defId: "ironwood-log", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "composite-bow", qty: 1 } }, // ironwood T2 → iron-axe
  "inferno-staff": { inputs: [{ defId: "fae-dust", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "inferno-staff", qty: 1 } },
  // Weapons — T3 (mithril → steel-pick)
  "mithril-sword": { inputs: [{ defId: "mithril-ore", qty: 3 }], output: { defId: "mithril-sword", qty: 1 } },
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
  // Armour — T2 steel plate (iron-plate cost + coal → iron-pick-gated)
  "steel-plate-helmet": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-helmet", qty: 1 } },
  "steel-plate-chest": { inputs: [{ defId: "iron-ore", qty: 3 }, { defId: "coal", qty: 2 }], output: { defId: "steel-plate-chest", qty: 1 } },
  "steel-plate-legs": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-legs", qty: 1 } },
  "steel-plate-boots": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-boots", qty: 1 } },
  "steel-plate-gloves": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-gloves", qty: 1 } },
  // Armour — T3 mithril plate (mithril → steel-pick-gated). The combat-trivializer, top of the longest climb.
  "mithril-plate-helmet": { inputs: [{ defId: "mithril-ore", qty: 2 }], output: { defId: "mithril-plate-helmet", qty: 1 } },
  "mithril-plate-chest": { inputs: [{ defId: "mithril-ore", qty: 3 }], output: { defId: "mithril-plate-chest", qty: 1 } },
  "mithril-plate-legs": { inputs: [{ defId: "mithril-ore", qty: 2 }], output: { defId: "mithril-plate-legs", qty: 1 } },
  "mithril-plate-boots": { inputs: [{ defId: "mithril-ore", qty: 1 }], output: { defId: "mithril-plate-boots", qty: 1 } },
  "mithril-plate-gloves": { inputs: [{ defId: "mithril-ore", qty: 1 }], output: { defId: "mithril-plate-gloves", qty: 1 } },
  // Armour — light/robe T2 samples (gated by a T2 material so they sit mid-climb)
  "studded-chest": { inputs: [{ defId: "drake-hide", qty: 1 }, { defId: "deer-hide", qty: 1 }], output: { defId: "studded-chest", qty: 1 } }, // drake T2 → steel-knife
  "studded-legs": { inputs: [{ defId: "drake-hide", qty: 1 }], output: { defId: "studded-legs", qty: 1 } },
  "enchanted-chest": { inputs: [{ defId: "ice-moss", qty: 2 }, { defId: "silver-ore", qty: 1 }], output: { defId: "enchanted-chest", qty: 1 } }, // silver T2 → iron-pick
  "enchanted-hood": { inputs: [{ defId: "ice-moss", qty: 1 }, { defId: "silver-ore", qty: 1 }], output: { defId: "enchanted-hood", qty: 1 } },
  // --- Combat-drop crafts (2026-07-05, peu): the ONLY source of the combat
  // branch, so routing around a monster forfeits real power (§4.2). Every
  // monster part now feeds a recipe. (T3 combat consumables elixir-of-power /
  // warding-draught land in Phase 2 with the battleItems mechanic — bzd.)
  "ration-boar": { inputs: [{ defId: "boar-hide", qty: 2 }], output: { defId: "ration", qty: 2 } }, // boar-hide = meat
  "trail-ration-raider": { inputs: [{ defId: "raider-supplies", qty: 1 }], output: { defId: "trail-ration", qty: 1 } }, // T2 food shortcut, no coal
  "warg-jerkin": { inputs: [{ defId: "werewolf-pelt", qty: 2 }], output: { defId: "warg-jerkin", qty: 1 } },
  "scorpion-plate-chest": { inputs: [{ defId: "scorpion-carapace", qty: 2 }], output: { defId: "scorpion-plate-chest", qty: 1 } },
  "large-pack-troll": { inputs: [{ defId: "troll-hide", qty: 2 }, { defId: "ironwood-log", qty: 1 }], output: { defId: "large-pack", qty: 1 } }, // alt route to the top pack
  // T3 combat consumables (bzd) — the exclusive reward for fighting T3 monsters
  "elixir-of-power": { inputs: [{ defId: "vampire-ash", qty: 2 }], output: { defId: "elixir-of-power", qty: 1 } }, // +2 dmg, one fight
  "warding-draught": { inputs: [{ defId: "troll-hide", qty: 2 }], output: { defId: "warding-draught", qty: 1 } }, // +3 mitigation, one fight
  // Boss capstone (D34)
  "dragonscale-cuirass": { inputs: [{ defId: "wyrm-scale", qty: 3 }], output: { defId: "dragonscale-cuirass", qty: 1 } },
  wyrmfang: { inputs: [{ defId: "dragonheart", qty: 1 }], output: { defId: "wyrmfang", qty: 1 } },
};

type ItemStackSpec = { defId: string; qty: number; chance?: number }; // chance ∈ (0,1): drop probability, rolled per-encounter (LOOT_TABLE only); absent = always drops
