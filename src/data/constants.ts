// Balance levers. POC ships feel-pass values, not balanced ones.
// Discipline: engine logic NEVER hardcodes a number — it reads a lever from here.
// M0 defines the NAMES and SHAPES with placeholder values; each milestone fills in
// the real numbers for its system. See docs/balance-levers.md.
//
// 465: constants.ts is the BARREL — domain data lives in sibling modules and is
// re-exported here so every consumer keeps importing from "../data/constants".
export * from "./spec";
export * from "./combat";
export * from "./crafting";

// --- Map & perception (filled in M1) ---
// 20×60 strip (e3j): the map outgrows one 300-energy capacity so food buys reach
// again. WIDTH is thumb-sized for phone portrait; HEIGHT is the long axis you
// scroll — the whole reach economy hangs off this pair.
export const MAP_WIDTH = 20; // tiles across
export const MAP_HEIGHT = 60; // tiles along the strip
export const NOISE_FREQUENCY = 0.15; // Perlin sample step per tile; lower = larger terrain regions
// Barrier layer (e3j): a SECOND, lower-frequency noise field lays long walls of
// each biome's barrierTerrain across the strip — the navigation puzzle. Tiles
// whose barrier sample exceeds BARRIER_THRESHOLD become wall; a connectivity
// pass then guarantees all walkable tiles stay one component (nothing is ever
// literally unreachable barefoot — mountains are cost-walls, not prisons).
export const BARRIER_NOISE_FREQUENCY = 0.06; // ≪ NOISE_FREQUENCY → chunky ridges, not speckle
export const BARRIER_THRESHOLD = 0.68; // the "how walled is the world" dial: lower = more maze
export const POI_DENSITY = 60; // POIs per 20×60 map (e3j): ~3× area × slightly denser — a geared+provisioned run should harvest ~half and CHOOSE which half. Was 18 on 20×20.
export const POI_MIN_SPACING = 3; // min Chebyshev distance between POIs (spec: 3–4 tiles apart)
export const POI_PLACEMENT_ATTEMPTS = 2000; // seeded rejection-sampling budget per map (scaled with density, e3j)
export const FOOD_REACH_MIN = 2; // min forageable (herb/animal) nodes on finite on-foot cost-to-reach tiles (grid.test reachability guard). D73 (57r): placement is value-agnostic — forage is NO LONGER pulled near entry, so this only promises forage sits on REACHABLE tiles (guaranteed by the walkable-connectivity carve, since all POIs land on walkable tiles), NOT that it's cheap to reach. Food SUFFICIENCY at scale is a density concern (biome nodeTypeWeights), validated by the pinned harness-sustainability test, not by placement
// Perception (9u9.2): node KIND is always visible; a node's qualitative identity
// (species/material/tier/dmg+armour type — never the fight outcome) resolves only
// within this Chebyshev radius of the player. Tools in VISION_RANGE_BONUS widen it
// (data-driven like TERRAIN_GATE; future glasses/cartography/scent items slot in).
export const DETAIL_RADIUS = 2;
export const VISION_RANGE_BONUS: Record<string, number> = { spyglass: 3 }; // spyglass → radius 5
export const CANDIDATE_MAP_COUNT = 3; // town map choices (spec §11)
export const PREVIEW_FIDELITY = 0; // how much a preview reveals (placeholder — M5)

// Fresh-game starter bank (e96): the kit a new game begins with — a tunable lever,
// not a literal buried in town.ts. Modest + functional: enough to run a real first
// expedition. You start with NO backpack (bare BASE_CARRY_SLOTS); the ration stack
// is exactly one STACK_CAP while you bootstrap the food loop.
export const STARTER_BANK: { defId: string; qty: number }[] = [
  { defId: "pick", qty: 1 },
  { defId: "axe", qty: 1 },
  { defId: "knife", qty: 1 },
  { defId: "sword", qty: 1 },
  { defId: "ration", qty: 5 },
  { defId: "potion", qty: 2 },
];

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
  creatureTable: Record<string, number>; // weighted monster defIds (si7.1): same shape as materialTable entries — tier-1/2 dominate, bosses rare
  materialTable: Partial<Record<NodeType, Record<string, number>>>; // node kind → weighted material defIds (D27)
  barrierTerrain: Terrain; // what a wall is made of here (e3j)
};

export const BIOMES: Record<BiomeId, Biome> = {
  woodland: {
    terrainWeights: { plains: 0.4, mud: 0.25, river: 0.15, mountain: 0.2 },
    nodeTypeWeights: { wood: 0.3, herb: 0.25, animal: 0.2, monster: 0.15, mining: 0.1 }, // p8b: mining 0.05→0.1 (avg ~3→~6 nodes/map) — still the rarest, but reliably present so woodland reads as a mineable biome
    creatureTable: { "forest-boar": 5, "forest-bandit": 4, "shell-beetle": 4, "fae-sprite": 3, werewolf: 2, "giant-elk": 3 }, // m0a: giant-elk mid-tier
    materialTable: {
      mining: { "iron-ore": 7, "copper-ore": 2, "silver-ore": 1 }, // silver present (D27) but T2-gated
      wood: { "oak-log": 5, "pine-log": 2, "ironwood-log": 1, stringybark: 3, apple: 2 }, // ironwood T2 (iron-axe); stringybark (D45) = bowstring source, woodland is bow country (oak rebalanced 7→5); apple (m0a) fresh fruit from orchard — material defId = food defId so gather routes to food
      herb: { "forest-herb": 7, berries: 4, "desert-sage": 2, "ice-moss": 1, flint: 2, thistle: 1 }, // flint (D45): foraged from creek beds, bare hands — arrowheads without a pick; thistle (m0a) T1 herb
      animal: { "deer-hide": 7, "wolf-pelt": 2, "lizard-hide": 1, feather: 2 }, // feather (D45): fletching from birds (knife)
    },
    barrierTerrain: "mountain",
  },
  desert: {
    terrainWeights: { plains: 0.55, mountain: 0.3, river: 0.15 },
    nodeTypeWeights: { mining: 0.4, monster: 0.25, herb: 0.15, wood: 0.1, animal: 0.1 },
    creatureTable: { "sand-raider": 5, "mirage-wisp": 4, "giant-scorpion": 3, "dust-djinn": 3 }, // m0a: dust-djinn mid-tier bow-bait
    materialTable: {
      mining: { "copper-ore": 7, "iron-ore": 2, "coal": 1, salt: 2 }, // coal T2 (iron-pick) — desert is a fuel source; salt (m0a) T2 evaporite
      wood: { "cactus-wood": 7, "oak-log": 2, "pine-log": 1 },
      herb: { "desert-sage": 7, "forest-herb": 2, berries: 1, "ice-moss": 1, flint: 3 }, // flint country (D45): scree + dry creek beds
      animal: { "lizard-hide": 7, "deer-hide": 2, "drake-hide": 1, feather: 2 }, // drake T2 (steel-knife); feather (D45)
    },
    barrierTerrain: "mountain",
  },
  tundra: {
    terrainWeights: { ice: 0.5, mountain: 0.25, plains: 0.15, river: 0.1 },
    nodeTypeWeights: { animal: 0.35, monster: 0.25, mining: 0.2, wood: 0.1, herb: 0.1 },
    creatureTable: { "snow-wolf": 5, "ice-crab": 4, "snow-marauder": 3, "frost-fae": 2, "frost-hatchling": 3 }, // m0a: frost-hatchling wyrm herald bow-bait
    materialTable: {
      mining: { "silver-ore": 5, "coal": 2, "iron-ore": 2, "mithril-ore": 1 }, // silver T2 + coal T2 + mithril T3: tundra is the deep-tier mine
      wood: { "pine-log": 7, "oak-log": 2, "ironwood-log": 1, stringybark: 1 }, // stringybark rare here (D45) — bow country is woodland
      herb: { "ice-moss": 7, "desert-sage": 2, berries: 1, "forest-herb": 1, flint: 1, thistle: 2 }, // thistle (m0a) T2 herb; flint scarce under the ice (D45)
      animal: { "wolf-pelt": 7, "deer-hide": 2, "drake-hide": 1, feather: 2, seal: 2 }, // seal (m0a) T2 large prey; feather (D45)
    },
    barrierTerrain: "mountain",
  },
};

// Gather ACCESS gate (D78, 2026-07-11): a material's gate is an explicit ANY-OF
// tool list — a POI is workable only when at least one of these tool defIds is
// equipped. Absent = ungated (bare hands / the base kind tool suffice). This
// mirrors the RECIPE.requires grammar: progression is a path/tree of explicit
// edges, not a numeric ladder. Tools carry SPEED (TOOL_SPEED, the cost divisor);
// gates carry ACCESS (this lever) — the two axes are decoupled (see reduce.gather).
// Every listed tool's capability MUST match the NODE_TOOL capability of every
// biome node kind that rolls the material (asserted in constants.test) or the
// gate is unsatisfiable. Supersedes the 2026-07-04 quality==tier conflation.
// Design: docs/superpowers/specs/2026-07-04-tiered-progression-carry-squeeze-design.md (superseded note)
export const MATERIAL_GATE: Record<string, { tools: string[] }> = {
  coal: { tools: ["iron-pick", "steel-pick"] }, // desert/tundra mining fuel — needs a hardened pick
  "silver-ore": { tools: ["iron-pick", "steel-pick"] },
  salt: { tools: ["iron-pick", "steel-pick"] }, // desert mining (m0a): evaporite deposits — pick required
  "ironwood-log": { tools: ["iron-axe", "steel-axe"] }, // wood — needs a hardened axe
  "drake-hide": { tools: ["steel-knife"] }, // animal — needs the steel knife
  seal: { tools: ["steel-knife"] }, // tundra animal (m0a): large prey — steel knife required
  "mithril-ore": { tools: ["steel-pick"] }, // deepest mining tier — only the steel pick
};

// --- Map epithets (q2k): a map whose generated content crosses a notability
// threshold gets an EPITHET appended to its display name ("a woodland map of
// carbon", "of the ancients"). Ordered — FIRST match wins; most maps match
// nothing (thresholds keep it notable). Tests are DATA-declarative (no closures
// in a lever) and evaluated in engine/town.ts:epithetForGrid.
//   • { material, minCount }       — >= minCount POIs yield this material defId
//   • { creatureTierAtLeast }      — some monster POI is at least this MONSTERS[].tier
//   • { nodeType, minShare }       — this node kind is >= minShare of all POIs
// Labels are the SHARED naming vocabulary cxq's inks/affixes draw from (one
// table: q2k READS a rolled map, cxq WRITES one). Labels stay QUALITATIVE —
// a number must never leak (a perception guard, enforced by test).
export type EpithetTest =
  | { material: string; minCount: number }
  | { creatureTierAtLeast: number }
  | { nodeType: NodeType; minShare: number };
export type Epithet = { id: string; label: string; test: EpithetTest };
export const EPITHETS: Epithet[] = [
  { id: "ancients", label: "the ancients", test: { creatureTierAtLeast: 3 } }, // a T3+ terror lairs here (troll/vampire/wyrm) — the spawn-lottery tell (playtest v3 §2)
  { id: "gleaming", label: "gleaming", test: { material: "mithril-ore", minCount: 2 } }, // a mithril vein, not a fleck
  { id: "carbon", label: "carbon", test: { material: "coal", minCount: 4 } }, // a real coal seam
  { id: "the-hunt", label: "the hunt", test: { nodeType: "monster", minShare: 0.4 } }, // monster-dense — a hunting ground
  { id: "plenty", label: "plenty", test: { nodeType: "herb", minShare: 0.45 } }, // forage-rich
];

// --- Cartography: inks + affixes (cxq) — soft-editing a held map toward what
// you want to farm. LOOP: craft an ink (picks the DOMAIN) → apply it to a HELD
// map (the `ink` action) → the world ROLLS a specific affix from that ink's pool
// → generateGrid reads the affix as a weight multiplier. Re-inking the SAME
// domain REPLACES its affix (chasing the roll is a resource loop). Semi-
// deterministic: player picks domain, world picks the affix (seeded, not save-
// scummable). LEGIBILITY (user): ink RECIPES carry only VAGUE flavour; the affix
// NAME carries the meaning — and the labels are the SAME vocabulary q2k's map
// EPITHETS use (read the language in offers before you write it with inks).
export type AffixEffect = {
  label: string; // display: "<biome> map of <label>" — shares q2k's EPITHETS vocabulary
  materialWeightMul?: Record<string, number>; // ×weight on these material defIds in their node table
  nodeTypeWeightMul?: Partial<Record<NodeType, number>>; // ×weight on these POI kinds
};
// Affixes apply MULTIPLICATIVELY to the (tier-scaled) generation tables — one
// modifier pipeline, applied after tierProfile. Labels reuse q2k EPITHETS words.
export const AFFIX_EFFECTS: Record<string, AffixEffect> = {
  "of-carbon": { label: "carbon", nodeTypeWeightMul: { mining: 1.5 }, materialWeightMul: { coal: 4 } },
  "of-gleaming": { label: "gleaming", nodeTypeWeightMul: { mining: 1.5 }, materialWeightMul: { "mithril-ore": 5 } },
  "of-sage": { label: "sage", nodeTypeWeightMul: { herb: 1.5 }, materialWeightMul: { "desert-sage": 4 } },
  "of-thorns": { label: "thorns", nodeTypeWeightMul: { herb: 1.5 }, materialWeightMul: { thistle: 4 } },
};
// Each ink defId declares its DOMAIN (for same-domain replacement) and the POOL
// of affixes the world rolls from. Inks are bank materials crafted via RECIPE
// and consumed by the `ink` action (never packed).
export const INKS: Record<string, { domain: string; pool: string[] }> = {
  "ore-ink": { domain: "ore", pool: ["of-carbon", "of-gleaming"] },
  "herb-ink": { domain: "herb", pool: ["of-sage", "of-thorns"] },
};

// --- Energy economy (filled in M2; rescaled ×10 for graded movement, svz) ---
// Every energy-denominated lever sits on a ×10 scale so gear can shave meaningful
// POINTS off a step (TERRAIN_GATE) without snapping to impassable — ratios are
// preserved vs the old scale, so the economy feel is unchanged.
export const ENERGY_PER_FOOD = 80; // default energy RESTORED per food unit eaten (fallback for FOOD_ENERGY)
// Stamina model (2026-07-06, dtv — supersedes BASE_ENERGY_FLOOR/qrl): energy is
// now current STAMINA on a max/current bar. You embark at MAX_ENERGY regardless
// of food; move/gather drain current energy; eating a food unit refills toward
// max (FOOD_ENERGY × tentMult). MAX_ENERGY is the base ceiling (gear-raisable
// later — a future progression axis). See reduce.embark / food.eatToRefill.
export const MAX_ENERGY = 300;
// A tent (durable "camp" tool) multiplies energy restored per food unit — each
// ration goes further, so food is a stronger reach investment. Tunable.
export const TENT_FOOD_MULTIPLIER = 1.5;
// Energy-capacity gear (si7.2): a durable tool that RAISES the stamina ceiling
// (maxEnergy) additively at embark, so denser tier food stays whole-unit
// auto-eatable (eatToRefill only eats a unit that fits under max). One proof
// line for the POC (canteen +100 → 300→400); biome-tier variants are m0a.
export const ENERGY_CAP_BONUS: Record<string, number> = {
  canteen: 100,
};
// Per-food RESTORE (tiered): denser food restores more per unit eaten, earning
// slot efficiency against the carry squeeze. Absent = ENERGY_PER_FOOD.
export const FOOD_ENERGY: Record<string, number> = {
  ration: 80, // T1 floor — do NOT lower (tundra forage-only sustainability, harness-gated)
  "trail-ration": 130, // compressed from 160 (si7.2) — opens ladder headroom above it
  berries: 30, // fresh forage (e3j): weak-but-immediate — eat on the trail or lose them to staleness
  jam: 120, // processed stale-berries — hauling the harvest home beats eating it raw (1.5 rations/slot)
  pemmican: 240, // tier-food line (si7.2): dense trail food (meat + berries). Auto-eat only fires if you DESIGNATE it (mco); otherwise it's a RESERVE you cash in with a manual `eat` (over-eats up to foodEnergy×tentMult, may exceed maxEnergy). No tent-safe density cap needed (m0a).
  apple: 40, // fresh forage (m0a): woodland orchard fruit — weak-but-immediate, stales to bruised-apple
  "smoked-venison": 200, // m0a: woodland cured meat — a manual-over-eat reserve under a tent
  "blubber-stew": 160, // m0a: tundra rendered fat + moss
  "cooked-venison": 150, // ke3.4: field-cooked over a fire-kit — denser than a ration, less than the home-smoked (200) version; turns raw meat into mid-run stamina
  "cooked-berries": 100, // ke3.5: field-roasted fresh berries — a universal-forage field cook (berries appear in every biome); denser than 2 raw berries (60) and a keeper (doesn't stale)
  stew: 220, // ke3.5: the premium field cook — needs BOTH fire-kit + cooking-pot (2 tool slots) and 3 gathered inputs; denser than smoked-venison (200), still under the pemmican reserve (240)
};

// Fresh→processed food (e3j): fresh forage eaten on-map is good NOW; hauled
// home it STALES into a material (endExpedition maps defIds at banking) that
// town-crafts into denser food (jam). Stale forms are materials — slotOf never
// returns "food" for them — so they can't be packed back out: "old berries"
// enforce themselves with no extra rule.
export const FRESH_TO_STALE: Record<string, string> = { berries: "stale-berries", apple: "bruised-apple" };
export const MIN_STEP = 5; // a discounted step never costs less than this (svz)
// Diagonal steps cover √2 tiles of distance, so they cost √2× the orthogonal step,
// rounded DOWN (l2w): floor(orthogonalFinal × DIAGONAL_MULTIPLIER). Applied by every
// pathfinder via moveCost's `diagonal` flag so reach/route costs never drift (D29
// spirit). Lower toward 1 to make diagonals cheaper (back to the old free shortcut);
// this is geometry, not balance — leave at √2 unless you deliberately want octile bias.
export const DIAGONAL_MULTIPLIER = Math.SQRT2; // ≈1.41421
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
  "small-backpack": 8, // your first craftable pack
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
}; // energy cost numerator (×10 svz): cost = hardness ÷ tool speed (TOOL_SPEED)
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
  tent: "camp", // stamina gear (dtv): multiplies food restore; NODE_TOOL never asks for "camp", so no gather impact
  canteen: "provision", // stamina gear (si7.2): raises maxEnergy; NODE_TOOL never asks for "provision", so no gather impact
  "fletchers-knife": "fletch", // crafting tool (ke3.3): gates + quality-scales the arrow-shaft recipe. NODE_TOOL never asks for "fletch", so no gather impact — the payoff is on the CRAFT (outputScale), not gathering
  "steel-fletchers-knife": "fletch", // data-only tier-2 fletch tool (like iron-pick): more shafts per log
  "fire-kit": "heat", // field-craft kit-tool (ke3.4): the heat gate for cooking. Carried into the field; NODE_TOOL never asks for "heat", so no gather impact
  "cooking-pot": "simmer", // field-craft kit-tool (ke3.5): the second cooking tool — a stew needs fire-kit AND cooking-pot (AND-gate). NODE_TOOL never asks for "simmer"
  glassware: "alchemy", // field-craft kit-tool (ke3.6): the brewing gate for draughts. Carried into the field; NODE_TOOL never asks for "alchemy"
  "blacksmiths-hammer": "smith", // forge tool (ke3.7): gates all metal plate at the anvil. NODE_TOOL never asks for "smith"; it never needs to leave town but reuses the tool path
}; // tool defId → capability; tiered tools (M5: "iron-pick": "pick") are data-only
// gate-legibility (playtest 2026-07-09 finding #1): a kit-tool is an unmarked key —
// 3/3 blind agents never found field crafting. This maps a tool CAPABILITY to a
// short "what door it opens" clause, surfaced in item tooltips + the field-craft
// affordance so the door is visible before you hold the key. Pure signposting; no
// mechanic reads this. Capabilities absent here (movement/gather tools) speak for
// themselves and get no clause.
export const TOOL_PURPOSE: Record<string, string> = {
  heat: "enables field cooking (with a cooking-pot, cooks stew)",
  simmer: "with a fire-kit, cooks stew in the field",
  alchemy: "enables field brewing (draughts)",
  vision: "reveals a far node's material and gate when you survey it",
  smith: "forges metal plate at an anvil",
};
// Tool SPEED (D78): the gather-cost divisor ONLY (cost = NODE_HARDNESS ÷ speed).
// Absent = speed 1 (a tool contributes no speedup — the base kind tool, or a tool
// whose speed is irrelevant because its job is a gate/capability, not gathering).
// ACCESS now lives in MATERIAL_GATE, so the old "quality doubles as tier" filler
// rows (spyglass/climbing-pick/raft/waders/ice-cleats/tent/canteen/fire-kit/…)
// are gone — a capability tool that never speeds a gather simply has no entry.
// Also feeds outputScale (craft yield scales with the fletch tool's speed).
export const TOOL_SPEED: Record<string, number> = {
  "iron-pick": 2, // halves mining cost vs the basic pick — the "cheaper second run" demonstrator
  "iron-axe": 2,
  "steel-pick": 3, // fastest mining
  "steel-axe": 3,
  "steel-knife": 2,
  "fletchers-knife": 1, // ke3.3: outputScale multiplier for arrow-shaft (qtyPer × speed)
  "steel-fletchers-knife": 2, // tier-2: 2× shafts per log — the visible tool payoff (repays 57l)
}; // pick/axe/knife (the base kind tools) are absent = speed 1 — the ungated baseline
export const GATHER_YIELD: Record<GatherableNodeType, number> = {
  mining: 3,
  wood: 3,
  herb: 2,
  animal: 2,
}; // qty gathered per (one-shot) node


// === Map tiers (2yn) — value-scaling generation axis. See spec 2026-07-08-map-tiers. ===
export const MAP_TIER_MAX = 5; // deepest map tier; drop-mint caps here

// === Return flavor (xwp) — cosmetic beat on VOLUNTARY return only (never defeat). ===
// Reframes the loop as "how much value can you extract before fatigue forces you
// home": a low-energy return reads as an exhausted trek, a high-energy one as
// boredom/disdain. Pure flavor — no mechanic change; free return still stands.
// Bucket picked from (energy, mapTier, leftover-cooked-food); a seeded rand picks
// the variant. See engine/flavor.ts. No em dashes in copy by request.
export const RETURN_FRESH_FRACTION = 0.5; // energy > this × maxEnergy = "fresh" (bored/beneath); ≤ = weary; ==0 = spent
export const RETURN_TIER_HIGH = 3; // spent at mapTier ≥ this → the "long journey home" pool (epic at MAP_TIER_MAX)
// Cooked/prepared keeper foods: leftover qty>0 of any of these + a fresh return = the "beneath you" snark.
export const RETURN_COOKED_FOODS: string[] = ["cooked-venison", "cooked-berries", "stew", "smoked-venison", "blubber-stew"];
export type ReturnFlavorBucket = "spent-low" | "spent-high" | "spent-epic" | "weary" | "bored" | "beneath";
export const RETURN_FLAVOR: Record<ReturnFlavorBucket, string[]> = {
  "spent-low": [
    "Legs like lead, you start the trudge home.",
    "Running on fumes, you set off on the walk back.",
    "Spent, you point yourself at town and put one foot in front of the other.",
  ],
  "spent-high": [
    "Bone-tired, you begin the long journey home.",
    "Nothing left in the tank; the long road back stretches out ahead.",
    "You barely make it home after days on the trail.",
  ],
  "spent-epic": [
    "Utterly wrecked, you face the absurdly long trek back. This'll take a while.",
    "You pushed too far; getting home from out here is its own expedition.",
    "Empty, and a world away from town. Your bones already ache at the thought.",
  ],
  weary: [
    "Tired but upright, you make your way back.",
    "You've had enough for one trip and head home.",
    "Legs aching, you turn for town.",
  ],
  bored: [
    "You get bored and wander back.",
    "Nothing here worth your time, you amble home.",
    "You've seen enough. Back to town.",
  ],
  beneath: [
    "You've decided this place is beneath you, and stroll home with provisions to spare.",
    "Pockets full of good food, energy to burn; clearly this land wasn't worthy.",
    "Rations untouched, chin up: this place simply didn't rise to your standard.",
  ],
};

// Per-material weight multiplier by map tier. Sparse: absent defId/tier = 1 (identity).
// MUST be 1 at tier 1 for every listed material (asserted in map-tier.test).
export const MATERIAL_MAP_TIER_WEIGHT: Record<string, Record<number, number>> = {
  coal:          { 2: 1, 3: 2, 4: 4, 5: 2 },
  "iron-ore":    { 2: 1.5, 3: 2, 4: 2, 5: 1.5 },
  "mithril-ore": { 3: 1, 4: 2, 5: 3 },
};

// Node-variant magnitude distribution by map tier. Weighted over class {1,2,3}.
// T1 = {1:1} (always base — identity). Higher tiers shift toward rich.
export const NODE_MAGNITUDE_WEIGHTS: Record<number, Record<number, number>> = {
  1: { 1: 1 },
  2: { 1: 6, 2: 3, 3: 1 },
  3: { 1: 4, 2: 4, 3: 2 },
  4: { 1: 3, 2: 4, 3: 3 },
  5: { 1: 2, 2: 4, 3: 4 },
};

// Yield multiplier per magnitude class; multiplies GATHER_YIELD[kind].
export const NODE_MAGNITUDE_YIELD: Record<number, number> = { 1: 1, 2: 2, 3: 3 };

// Boss gate = the SINGLE source of where bosses spawn, now BIOME-SCOPED (user 2026-07-08):
// each boss re-enters ONLY its native biome at its gate tier. Bosses are removed from the
// base biome creatureTables and live only here; tierProfile ADDS the matching
// biome+tier layer to the boss-free base table. Graduated: minibosses at T2, wyrm at T3.
// A biome/tier with no entry adds nothing (identity). Each tier's entry is the FULL add
// for that tier (not a delta from the previous tier).
export const MAP_TIER_CREATURE_ADD: Record<BiomeId, Record<number, Record<string, number>>> = {
  woodland: {}, // no gated bosses native to woodland in the POC
  desert: {
    2: { "dust-vampire": 1 },
    3: { "dust-vampire": 2 },
    4: { "dust-vampire": 2 },
    5: { "dust-vampire": 3 },
  },
  tundra: {
    2: { "ice-troll": 1 },
    3: { "ice-troll": 2, "ancient-wyrm": 1 },
    4: { "ice-troll": 2, "ancient-wyrm": 2 },
    5: { "ice-troll": 3, "ancient-wyrm": 3 },
  },
};

// POI count by map tier. Absent = POI_DENSITY (identity at T1). Richer maps upward.
export const POI_DENSITY_BY_TIER: Record<number, number> = {
  2: POI_DENSITY + 2,
  3: POI_DENSITY + 4,
  4: POI_DENSITY + 6,
  5: POI_DENSITY + 8,
};

// Harvest-fraction targets (si7.2) — the core balance contract, sim-verified by
// test/harvest-fraction.test.ts. CALIBRATED to the monster-aware reference walker
// (a headless greedy forager), NOT a human: on a tier-matched map, tier-appropriate
// food clears ~TIER of the POIs, base rations ~BASE (half). The literal 60/30 is the
// design ASPIRATION — the no-optimal-router reference player is a conservative floor
// (a real player harvests more); the TIER≈2×BASE ratio is the invariant, and the hard
// gate. Which ~half the player takes stays a live routing choice.
export const HARVEST_FRACTION_TIER_TARGET = 0.5;
export const HARVEST_FRACTION_BASE_TARGET = 0.25;

// Per-terrain weight multiplier by map tier. Absent tier/terrain = 1 (identity at T1).
// Harsher mix upward — the energy cost that makes si7.2's tier-food matter.
export const TERRAIN_WEIGHT_TIER_SHIFT: Record<number, Partial<Record<Terrain, number>>> = {
  2: { mountain: 1.15, river: 1.15 },
  3: { mountain: 1.3, river: 1.3, ice: 1.15 },
  4: { mountain: 1.5, river: 1.4, ice: 1.3 },
  5: { mountain: 1.7, river: 1.5, ice: 1.4 },
};
