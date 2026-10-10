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
export * from "./hints";
export * from "./research"; // 675 (D104): crafting fog + research table

// --- Map & perception (filled in M1) ---
// D84: a 35×35 SQUARE you drill into the CENTER (was a 20×60 portrait strip with a
// south entry). The strip's shape falsely signalled "a deep north end worth reaching"
// — but within-map placement is value-agnostic (D57r), so depth-within-a-map does NOT
// pay; the reward axis is MAP TIER. A centre-entry square removes that false signal and
// makes the run's opening move a 360° "which direction do I spend my energy?" choice.
// c67 camera-follow decouples map shape from screen shape (the viewport pans to the
// player). Area 1225 ≈ the old 1200, so the map still out-ranges one 300-energy tank —
// you reach any single point but never clear the whole field in one run.
export const MAP_WIDTH = 35; // tiles across (square)
export const MAP_HEIGHT = 35; // tiles down (square)
export const NOISE_FREQUENCY = 0.15; // Perlin sample step per tile; lower = larger terrain regions
// Barrier layer (e3j): a SECOND, lower-frequency noise field lays long walls of
// each biome's barrierTerrain across the map — the navigation puzzle. Tiles
// whose barrier sample exceeds BARRIER_THRESHOLD become wall; a connectivity
// pass then guarantees all walkable tiles stay one component (nothing is ever
// literally unreachable barefoot — mountains are cost-walls, not prisons).
export const BARRIER_NOISE_FREQUENCY = 0.06; // ≪ NOISE_FREQUENCY → chunky ridges, not speckle
export const BARRIER_THRESHOLD = 0.68; // the "how walled is the world" dial: lower = more maze
// River layer (1u6, D96): its own namespaced noise field; a tile is river where that
// field sits within a biome's `river` band of its midline (0.5) — a contour LINE, so
// rivers wind across the map instead of pooling as blobs. Rivers used to be the lowest
// terrainWeights band, which Perlin (clustered around 0.5) almost never reached.
export const RIVER_NOISE_FREQUENCY = 0.05; // low → a few long, gently winding rivers per map
export const WATER_NOISE_FREQUENCY = 0.07;
export const SPORE_NOISE_FREQUENCY = 0.12; // si7.6.9.4: spore-thicket field — patchy clumps you route through or around // si7.6.5: standing-water field (a biome's `water` layer) — low, so lakes are blobs, not puddles
export const POI_DENSITY = 60; // POIs per 35×35 map (D84): a geared+provisioned run should harvest ~half and CHOOSE which half (now: which DIRECTION). Area 1225 ≈ the old 20×60 = 1200, so the count/value budget carries over.
export const POI_MIN_SPACING = 3; // min Chebyshev distance between POIs (spec: 3–4 tiles apart)
export const POI_PLACEMENT_ATTEMPTS = 2000; // seeded rejection-sampling budget per map (scaled with density, e3j)
export const FOOD_REACH_MIN = 2; // min forageable (herb/animal) nodes on finite on-foot cost-to-reach tiles (grid.test reachability guard). D73 (57r): placement is value-agnostic — forage is NO LONGER pulled near entry, so this only promises forage sits on REACHABLE tiles (guaranteed by the walkable-connectivity carve, since all POIs land on walkable tiles), NOT that it's cheap to reach. Food SUFFICIENCY at scale is a density concern (biome nodeTypeWeights), validated by the pinned harness-sustainability test, not by placement
// Perception (9u9.2): node KIND is always visible; a node's qualitative identity
// (species/material/tier/dmg+armour type — never the fight outcome) resolves only
// within this Chebyshev radius of the player. Tools in VISION_RANGE_BONUS widen it
// (data-driven like TERRAIN_GATE; future glasses/cartography/scent items slot in).
export const DETAIL_RADIUS = 2;
export const VISION_RANGE_BONUS: Record<string, number> = { spyglass: 3, "pearl-spyglass": 5 }; // spyglass → radius 5; pearl-spyglass (D94) → radius 7

// Fresh-game starter bank (e96): the kit a new game begins with — a tunable lever,
// not a literal buried in town.ts. Modest + functional: enough to run a real first
// expedition. You start with NO backpack (bare BASE_CARRY_SLOTS); the ration stack
// is exactly one STACK_CAP while you bootstrap the food loop.
// xls/9az stone-age bootstrap: you no longer START with tools/weapon — you knap
// them your first run (club/knife/axe/pick from flint + deadwood, no tool). Food
// only, so run 1 isn't a starvation trap; return is free (D62), so the bootstrap
// costs one deliberate forage trip. See docs/superpowers/specs/2026-07-14-stone-age-bootstrap-design.md
export const STARTER_BANK: { defId: string; qty: number }[] = [
  { defId: "ration", qty: 5 },
  { defId: "potion", qty: 2 },
];

// Terrain vocabulary. Array order = elevation band order for noise→terrain
// mapping (river lowest … mountain highest) — reordering it reshapes maps.
// Water terrains (si7.6.5) are APPENDED so the noise→terrain bands above are
// untouched; they never come from terrainWeights — only a biome's `water` layer
// (below) places them, so a biome without one generates byte-identically.
// spore-thicket (si7.6.9.4) is appended the same way: only a biome's `spores` layer places it.
export const TERRAINS = ["river", "mud", "plains", "ice", "mountain", "shallows", "lake", "sea", "spore-thicket"] as const;
export const WATER_TERRAINS: Terrain[] = ["river", "shallows", "lake", "sea"]; // fishable water (si7.6.2)
export type Terrain = (typeof TERRAINS)[number];

// Node (POI) vocabulary — what biome nodeTypeWeights and (M3) hardness/yield key on.
export const NODE_TYPES = ["mining", "wood", "herb", "animal", "monster"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

// Node types the player can gather (monster nodes resolve via fight, M4).
export type GatherableNodeType = Exclude<NodeType, "monster">;

// --- Biomes (D21): generation profiles ONLY, consumed by generateGrid and
// never consulted after generation. Adding a biome = adding one entry here.
export const BIOME_IDS = ["woodland", "desert", "tundra", "swamp", "coastal", "jungle", "fungal"] as const; // APPEND-only: rollBiome walks rare biomes in this order
export type BiomeId = (typeof BIOME_IDS)[number];
// Rare biomes (si7.6.3 / r51, D91): excluded from the base uniform roll, then rolled in
// on their own namespaced chance once the map tier reaches minTier. A base biome's roll
// is untouched, so every T1 map (and every map below a rare biome's minTier) keeps the
// biome it always had. Drop-maps and the in-run grid both roll with the map's tier.
// Rare biomes roll in BIOME_IDS order, first hit wins — so a new one appended at the end
// never steals a seed an earlier rare biome already claimed (coastal after swamp, D94).
export const RARE_BIOMES: Partial<Record<BiomeId, { minTier: number; chance: number }>> = {
  swamp: { minTier: 2, chance: 0.3 }, // ~30% of T2+ found maps are swamp
  coastal: { minTier: 2, chance: 0.3 }, // D94: rolls after swamp → ~21% of T2+ maps (0.7 × 0.3)
  jungle: { minTier: 2, chance: 0.25 }, // D100: after coastal → ~12% of T2+ maps (0.7 × 0.7 × 0.25)
  fungal: { minTier: 3, chance: 0.3 }, // D100: T3+ only, after jungle → ~8% of T3+ maps
};

export type Biome = {
  terrainWeights: Partial<Record<Terrain, number>>; // relative mix; zero/absent = never generates
  nodeTypeWeights: Partial<Record<NodeType, number>>; // relative POI kind mix
  creatureTable: Record<string, number>; // weighted monster defIds (si7.1): same shape as materialTable entries — tier-1/2 dominate, bosses rare
  materialTable: Partial<Record<NodeType, Record<string, number>>>; // node kind → weighted material defIds (D27)
  barrierTerrain: Terrain; // what a wall is made of here (e3j)
  // Standing water (si7.6.5): an independent low-frequency noise field. Samples
  // above `lakeThreshold` become `body` (lake/sea — boat-only), a band `shallowsBand`
  // below that becomes wadeable shallows ringing it. Absent = no standing water
  // (the biome's maps are byte-identical to before water existed).
  // `coast` (D94): blend weight 0..1 of an edge gradient into the water field — the sea
  // piles up against ONE seeded map edge (a shoreline), not scattered lakes.
  water?: { body: Terrain; lakeThreshold: number; shallowsBand: number; coast?: number };
  // Rivers (1u6, D96): half-width of the river band around the river field's midline —
  // wider = more/thicker river. Rivers never overwrite a wall, and standing water
  // drowns them where they meet it. Absent = no rivers. Scaled by map tier via
  // TERRAIN_WEIGHT_TIER_SHIFT[tier].river.
  river?: number;
  // Spore thickets (si7.6.9.4, D99): its own namespaced noise field; dry land (plains/mud/
  // ice) whose sample exceeds this threshold becomes spore-thicket. Absent = none.
  spores?: number;
  // Richness (D100): multiplies the map tier's magnitude-2 and -3 node weights, so more
  // of this biome's nodes are rich veins/stands. Absent = 1 (the tier's own mix).
  magnitudeBoost?: number;
  // Fishing (si7.6.2): what each KIND of water yields here, rolled per water tile
  // at generation (D21 — gather-time never consults the biome). Absent kind =
  // that water can't be fished in this biome.
  fishTable?: Partial<Record<FishWater, Record<string, number>>>;
};

// Water classes fishing keys on (si7.6.2): the terrain, split by DEPTH for bodies —
// a lake/sea tile FISH_DEEP_DEPTH+ tiles from any land is "deep" (reachable only by
// boat), so going out on the water is what earns the rare catches.
export type FishWater = "river" | "shallows" | "lake" | "deep-lake" | "sea" | "deep-sea";

export const BIOMES: Record<BiomeId, Biome> = {
  woodland: {
    terrainWeights: { plains: 0.4, mud: 0.4, mountain: 0.2 }, // 1u6: river's old 0.15 folded into mud (its upper noise neighbour) so no other band moves
    river: 0.03,
    nodeTypeWeights: { wood: 0.3, herb: 0.25, animal: 0.2, monster: 0.15, mining: 0.1 }, // p8b: mining 0.05→0.1 (avg ~3→~6 nodes/map) — still the rarest, but reliably present so woodland reads as a mineable biome
    creatureTable: { "forest-boar": 5, "forest-bandit": 4, "shell-beetle": 4, "fae-sprite": 3, werewolf: 2, "giant-elk": 3 }, // m0a: giant-elk mid-tier
    materialTable: {
      mining: { "iron-ore": 7, "copper-ore": 2, "silver-ore": 1 }, // silver present (D27) but T2-gated
      wood: { "oak-log": 5, "pine-log": 2, "ironwood-log": 1, stringybark: 3, apple: 2 }, // ironwood T2 (iron-axe); stringybark (D45) = bowstring source, woodland is bow country (oak rebalanced 7→5); apple (m0a) fresh fruit from orchard — material defId = food defId so gather routes to food
      herb: { "forest-herb": 7, deadwood: 6, flint: 5, berries: 4, "desert-sage": 2, "ice-moss": 1, thistle: 1 }, // D83: flint 2→5, deadwood 3→6 — bootstrap materials abundant on T1 (~42% of woodland forage), tapered at higher tiers via MATERIAL_MAP_TIER_WEIGHT. flint (D45): creek-bed arrowheads, bare hands; deadwood (xls): bare-hands foraged wood — the stone-age bootstrap; thistle (m0a) T1 herb
      animal: { "deer-hide": 7, "wolf-pelt": 2, "lizard-hide": 1, feather: 2 }, // feather (D45): fletching from birds (knife)
    },
    barrierTerrain: "mountain",
    water: { body: "lake", lakeThreshold: 0.72, shallowsBand: 0.05 }, // si7.6.5: ~8% lake + ~6% shallows ring per map; the raft crosses it
    fishTable: { // si7.6.2: banks give trout/crayfish; the lake edge perch; the deep middle (raft) pike + treasure
      river: { trout: 6, crayfish: 4, reed: 3 }, // si7.6.6: reeds line the banks (blowgun + darts)
      shallows: { crayfish: 6, trout: 3, reed: 4 },
      lake: { perch: 7, crayfish: 2, "sunken-lockbox": 1, amber: 2 }, // si7.6.6: amber washes out of the lakebed (the dart/blowgun binder)
      "deep-lake": { pike: 6, perch: 2, "sunken-lockbox": 3, "sodden-map": 1, amber: 1 },
    },
  },
  desert: {
    terrainWeights: { plains: 0.7, mountain: 0.3 }, // 1u6: river's old 0.15 folded into plains (its upper noise neighbour) so no other band moves
    river: 0.015, // thin desert creeks
    nodeTypeWeights: { mining: 0.4, monster: 0.25, herb: 0.15, wood: 0.1, animal: 0.1 },
    creatureTable: { "sand-raider": 5, "mirage-wisp": 4, "giant-scorpion": 3, "dust-djinn": 3, drake: 3 }, // m0a: dust-djinn mid-tier bow-bait; D83: drake (T2) drops drake-hide — the hide is now a fight, not a hunt
    materialTable: {
      mining: { "copper-ore": 7, "iron-ore": 2, "coal": 1, salt: 2 }, // coal T2 (iron-pick) — desert is a fuel source; salt (m0a) T2 evaporite
      wood: { "cactus-wood": 7, "oak-log": 2, "pine-log": 1 },
      herb: { "desert-sage": 7, flint: 5, deadwood: 5, "forest-herb": 2, berries: 1, "ice-moss": 1 }, // D83: flint 3→5, deadwood 2→5 — bootstrap abundance on T1 (~48% of desert forage), tapered higher. flint country (D45): scree + dry creek beds; deadwood (xls): scarcer bare-hands wood in the desert
      animal: { "lizard-hide": 7, "deer-hide": 2, feather: 2 }, // D83: drake-hide removed — now a combat drop from the `drake` monster (was 'too high up' for a hunted node); feather (D45)
    },
    barrierTerrain: "mountain",
    fishTable: { river: { crayfish: 5, trout: 2, reed: 2 } }, // si7.6.2: thin desert creeks — crayfish in the mud
  },
  tundra: {
    terrainWeights: { ice: 0.5, mountain: 0.25, plains: 0.25 }, // 1u6: river's old 0.1 folded into plains (its upper noise neighbour) so no other band moves
    river: 0.02,
    nodeTypeWeights: { animal: 0.35, monster: 0.25, mining: 0.2, wood: 0.1, herb: 0.1 },
    creatureTable: { "snow-wolf": 5, "ice-crab": 4, "snow-marauder": 3, "frost-fae": 2, "frost-hatchling": 3, drake: 3 }, // m0a: frost-hatchling wyrm herald bow-bait; D83: drake (T2) drops drake-hide (now a fight, not a hunt)
    materialTable: {
      mining: { "silver-ore": 5, "coal": 2, "iron-ore": 2, "mithril-ore": 1 }, // silver T2 + coal T2 + mithril T3: tundra is the deep-tier mine
      wood: { "pine-log": 7, "oak-log": 2, "ironwood-log": 1, stringybark: 1 }, // stringybark rare here (D45) — bow country is woodland
      herb: { "ice-moss": 7, deadwood: 5, flint: 4, "desert-sage": 2, thistle: 2, berries: 1, "forest-herb": 1 }, // D83: flint 1→4, deadwood 2→5 — bootstrap abundance on T1 (~41% of tundra forage; was the worst biome), tapered higher. thistle (m0a) T2 herb; deadwood (xls): bare-hands wood under the tundra
      animal: { "wolf-pelt": 7, "deer-hide": 2, feather: 2, seal: 2 }, // D83: drake-hide removed (now the `drake` combat drop); seal (m0a) large prey — now huntable with the base trap+knife (steel-knife retired); feather (D45)
    },
    barrierTerrain: "mountain",
    fishTable: { river: { trout: 6, crayfish: 1 } }, // si7.6.2: cold, clear tundra streams
  },
  // Swamp (si7.6.3, D91): a RARE mid-tier biome — never offered at T1, found on T2+
  // dropped maps (RARE_BIOMES). Mud + water heavy (waders and the raft finally star),
  // plated/armoured monsters (blowgun country), toad venom for a middle dart tier.
  swamp: {
    terrainWeights: { mud: 0.65, plains: 0.2, mountain: 0.15 }, // 1u6: river's old 0.2 folded into mud (its upper noise neighbour) so no other band moves
    river: 0.04,
    nodeTypeWeights: { herb: 0.3, monster: 0.25, animal: 0.2, wood: 0.15, mining: 0.1 },
    creatureTable: { "giant-leech": 5, "bog-lurker": 4, "marsh-hag": 3, "fae-sprite": 2, werewolf: 1 },
    materialTable: {
      mining: { "bog-iron": 6, "iron-ore": 3, "copper-ore": 2, "silver-ore": 1 }, // bog-iron refines to iron-ore in town (2 → 1)
      wood: { deadwood: 5, "pine-log": 3, "oak-log": 3, "ironwood-log": 1 }, // drowned timber: mostly deadwood
      herb: { thistle: 6, "forest-herb": 5, deadwood: 4, flint: 2, berries: 2 }, // thistle country (venom-oil's herb)
      animal: { "toad-venom": 6, "deer-hide": 3, feather: 2 }, // bog toads: trap + knife, like any hunt
    },
    barrierTerrain: "mountain",
    water: { body: "lake", lakeThreshold: 0.64, shallowsBand: 0.08 }, // ~18% lake + a wide shallows margin
    fishTable: {
      river: { eel: 5, crayfish: 4, reed: 4 },
      shallows: { crayfish: 5, reed: 5, eel: 3 },
      lake: { eel: 6, perch: 3, amber: 2, "sunken-lockbox": 1 },
      "deep-lake": { pike: 5, eel: 3, "sunken-lockbox": 3, "sodden-map": 1, amber: 2 },
    },
  },
  // Coastal (si7.6.8.2 + si7.6.8.1, D94): a RARE T2+ biome — the fishing home. The sea
  // fills one side of the map behind a wadeable beach; its deep water (out past the
  // shallows) needs the longboat and holds the second catch wave (pearl, turtle shell).
  coastal: {
    terrainWeights: { plains: 0.4, mud: 0.4, mountain: 0.2 }, // dunes, tidal flats, sea cliffs. 1u6: river's old 0.2 folded into mud (its upper noise neighbour) so no other band moves
    river: 0.03,
    nodeTypeWeights: { herb: 0.25, monster: 0.25, animal: 0.2, wood: 0.15, mining: 0.15 },
    creatureTable: { "tide-crab": 5, wrecker: 4, siren: 3 },
    materialTable: {
      mining: { salt: 5, "copper-ore": 4, "iron-ore": 2 }, // salt pans (iron-pick) — the coast is the salt country
      wood: { driftwood: 6, "pine-log": 3, "oak-log": 1 }, // driftwood = the longboat's timber
      herb: { samphire: 6, flint: 4, deadwood: 3, "forest-herb": 2, berries: 1 }, // samphire: salt-marsh greens, fresh food
      animal: { seal: 5, feather: 4, "deer-hide": 1 }, // seal colonies + seabirds
    },
    barrierTerrain: "mountain",
    water: { body: "sea", lakeThreshold: 0.58, shallowsBand: 0.06, coast: 0.4 },
    fishTable: {
      river: { trout: 4, crayfish: 4, reed: 3 },
      shallows: { kelp: 5, crayfish: 4, reed: 2 },
      sea: { mackerel: 6, kelp: 4, "turtle-shell": 1, "sunken-lockbox": 1 },
      "deep-sea": { tuna: 5, pearl: 2, "turtle-shell": 2, "sunken-lockbox": 3, "sodden-map": 1 },
    },
  },
  // Jungle (si7.6.9.3, D100): a RARE T2+ biome — venom country. Two of its four
  // creatures are venomous (D98: they poison you, gently); in return it is the richest
  // land in the game — deep ores on a T2 map, boosted node magnitudes, fruit that keeps.
  jungle: {
    terrainWeights: { plains: 0.35, mud: 0.45, mountain: 0.2 }, // dense undergrowth reads as mud
    river: 0.035, // big jungle rivers
    nodeTypeWeights: { wood: 0.25, herb: 0.25, mining: 0.2, animal: 0.15, monster: 0.15 },
    creatureTable: { "jungle-viper": 5, "vine-horror": 4, headhunter: 3, "fae-sprite": 2 },
    materialTable: {
      mining: { "mithril-ore": 4, "silver-ore": 3, "iron-ore": 3, coal: 2 }, // the mithril country, on a T2 map — the reward for the venom (steel-pick)
      wood: { "ironwood-log": 4, stringybark: 3, "jungle-fruit": 3, "oak-log": 2 }, // jungle-fruit: material = food defId (gather routes to food)
      herb: { "jungle-fruit": 5, thistle: 4, "forest-herb": 4, "desert-sage": 2, flint: 2 }, // fruit + thistle — antidotes + venom oil
      animal: { "venom-sac": 5, feather: 4, "deer-hide": 2 }, // snakes: trap + knife
    },
    barrierTerrain: "mountain",
    magnitudeBoost: 2, // twice the rich nodes of any other map at its tier
    water: { body: "lake", lakeThreshold: 0.74, shallowsBand: 0.05 },
    fishTable: {
      river: { eel: 3, crayfish: 3, reed: 4 },
      shallows: { reed: 5, crayfish: 4 },
      lake: { perch: 4, eel: 4, amber: 3 },
      "deep-lake": { pike: 4, amber: 3, "sunken-lockbox": 2, "sodden-map": 1 },
    },
  },
  // Fungal forest (si7.6.9.5, D100): a RARE T3+ biome — spore-thickets (D99) cost HP to
  // cross without a filter-mask; spores are the spore-bomb's reagent; deep ores + glowcaps.
  fungal: {
    terrainWeights: { plains: 0.35, mud: 0.45, mountain: 0.2 },
    river: 0.02,
    spores: 0.6,
    nodeTypeWeights: { herb: 0.35, mining: 0.25, monster: 0.25, wood: 0.1, animal: 0.05 },
    creatureTable: { myconid: 5, "cave-spider": 4, "spore-shambler": 3, "spore-cultist": 3 },
    materialTable: {
      mining: { coal: 4, "mithril-ore": 3, "silver-ore": 3, "iron-ore": 1 }, // coal seams under the rot — spore-bomb + fire-flask fuel
      wood: { glowcap: 5, deadwood: 3, "ironwood-log": 2 }, // giant caps are the "timber" — glowcap: material = food defId, food that keeps
      herb: { spores: 6, glowcap: 2, thistle: 2, "forest-herb": 2 },
      animal: { feather: 3, "venom-sac": 2, "deer-hide": 1 }, // cave bats + spiders
    },
    barrierTerrain: "mountain",
    magnitudeBoost: 1.5,
    fishTable: { river: { crayfish: 4, eel: 2 } },
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
  // D83: drake-hide + seal steel-knife gates retired — drake-hide is now a combat
  // drop (the `drake` monster) and seal is huntable with the base trap+knife.
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
// Each ink defId declares the POOL of affixes the world rolls from; the pool IS
// the ink's domain (re-inking replaces any affix already drawn from the same pool).
// Inks are bank materials crafted via RECIPE and consumed by the `ink` action (never packed).
export const INKS: Record<string, { pool: string[] }> = {
  "ore-ink": { pool: ["of-carbon", "of-gleaming"] }, // ore domain
  "herb-ink": { pool: ["of-sage", "of-thorns"] }, // herb domain
};

// --- Energy economy (filled in M2; rescaled ×10 for graded movement, svz) ---
// Every energy-denominated lever sits on a ×10 scale so gear can shave meaningful
// POINTS off a step (TERRAIN_GATE) without snapping to impassable — ratios are
// preserved vs the old scale, so the economy feel is unchanged.
export const ENERGY_PER_FOOD = 80; // default energy RESTORED per food unit eaten (fallback for FOOD_ENERGY)
// Stamina model (2026-07-06, dtv — supersedes BASE_ENERGY_FLOOR/qrl): energy is
// now current STAMINA on a max/current bar. You embark at MAX_ENERGY regardless
// of food; move/gather drain current energy; eating a food unit refills toward
// max (FOOD_ENERGY per unit; the tent only boosts the manual camp meal, 7lr). MAX_ENERGY is the base ceiling (gear-raisable
// later — a future progression axis). See reduce.embark / food.eatToRefill.
export const MAX_ENERGY = 300;
// A tent (durable "camp" tool) powers the once-per-run "CAMP MEAL" (7lr): a manual
// eat with a tent + an unspent charge multiplies restore by this AND over-eats past
// max (banking reach beyond the bar). ONLY the camp meal reads this — auto-eat and
// normal manual eat are plain ×1. So the tent is a deliberate, rationed power move
// (a bag slot for one killer meal), not a passive buff. Tunable.
export const TENT_FOOD_MULTIPLIER = 1.5;
export const TENT_CAMP_MEALS = 1; // camp meals per expedition a tent grants (7lr)
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
  pemmican: 240, // tier-food line (si7.2): dense trail food (meat + berries). Auto-eat only fires if you DESIGNATE it (mco); otherwise it's a RESERVE you cash in with a manual `eat` (capped at maxEnergy; a tent's once-per-run camp meal restores ×TENT_FOOD_MULTIPLIER and may exceed it, 7lr). No tent-safe density cap needed (m0a).
  apple: 40, // fresh forage (m0a): woodland orchard fruit — weak-but-immediate, stales to bruised-apple
  "smoked-venison": 200, // m0a: woodland cured meat — a strong camp-meal (tent) reserve
  "blubber-stew": 160, // m0a: tundra rendered fat + moss
  crayfish: 30, // si7.6.2: fresh, weak alone — boil a pot of them (crayfish-boil)
  trout: 40, // si7.6.2: river/shallows catch, fresh
  perch: 60, // si7.6.2: lake-edge catch, fresh
  eel: 70, // si7.6.3: swamp catch, fresh
  pike: 90, // si7.6.2: deep-lake catch (raft) — grill it for a camp-meal-grade food
  "jungle-fruit": 60, // D100: jungle fruit — fresh, keeps (not in FRESH_TO_STALE)
  glowcap: 70, // D100: fungal glowcaps — keeps
  samphire: 40, // D94: coastal forage greens — weak-but-immediate; not in FRESH_TO_STALE, so it simply keeps
  mackerel: 60, // D94: sea catch, fresh
  tuna: 100, // D94: deep-sea catch (longboat) — grill it
  "grilled-tuna": 240, // D94: field-cooked tuna (fire-kit) — the best field food, for going out past the shallows
  "grilled-pike": 220, // si7.6.2: field-cooked pike (fire-kit)
  "crayfish-boil": 170, // si7.6.2: 3 crayfish in a pot (fire-kit + cooking-pot)
  "smoked-fish": 150, // si7.6.2: the stale-fish payoff at the smokehouse
  "cooked-venison": 150, // ke3.4: field-cooked over a fire-kit — denser than a ration, less than the home-smoked (200) version; turns raw meat into mid-run stamina
  "cooked-berries": 100, // ke3.5: field-roasted fresh berries — a universal-forage field cook (berries appear in every biome); denser than 2 raw berries (60) and a keeper (doesn't stale)
  stew: 220, // ke3.5: the premium field cook — needs BOTH fire-kit + cooking-pot (2 tool slots) and 3 gathered inputs; denser than smoked-venison (200), still under the pemmican reserve (240)
};

// Fresh→processed food (e3j): fresh forage eaten on-map is good NOW; hauled
// home it STALES into a material (endExpedition maps defIds at banking) that
// town-crafts into denser food (jam). Stale forms are materials — slotOf never
// returns "food" for them — so they can't be packed back out: "old berries"
// enforce themselves with no extra rule.
export const FRESH_TO_STALE: Record<string, string> = {
  berries: "stale-berries",
  apple: "bruised-apple",
  trout: "stale-fish", perch: "stale-fish", pike: "stale-fish", crayfish: "stale-fish", eel: "stale-fish", mackerel: "stale-fish", tuna: "stale-fish", // si7.6.2 (+ D94 sea fish): fish spoils on the way home — the smokehouse turns it into smoked-fish
};
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
  shallows: 25, // si7.6.5: wadeable lake/sea margin — slow, not a wall
  lake: Infinity, // si7.6.5: boat-only — a raft enables it (TERRAIN_GATE)
  "spore-thicket": 15, // si7.6.9.4: slow like mud — its real price is HP (TERRAIN_HP_COST), not energy
  sea: Infinity, // si7.6.5: boat-only — needs a sea-going boat (coastal biome, later); a raft can't
}; // absolute energy per tile stepped ONTO, on foot, before gear/transport
// Equipped tools that modify gated terrain (svz). `enable` makes an impassable
// terrain finite (mountain only); `discount` subtracts from the step energy. Each
// tool costs a tool slot, so bringing it is a real loadout tradeoff.
export const TERRAIN_GATE: Partial<Record<Terrain, Record<string, { enable?: number; discount?: number }>>> = {
  mountain: { "climbing-pick": { enable: 40 } }, // ∞ → 40 (crossable at 4× plains)
  river: { raft: { discount: 20 }, longboat: { discount: 20 } }, // 30 → 10 (≈ plains)
  shallows: { raft: { discount: 15 }, longboat: { discount: 15 }, waders: { discount: 10 } }, // 25 → 10 / 15 (si7.6.5)
  lake: { raft: { enable: 15 }, longboat: { enable: 15 } }, // si7.6.5: ∞ → 15 — the raft is the lake boat (the longboat does lakes too)
  sea: { longboat: { enable: 15 } }, // D94: ∞ → 15 — only the sea-going longboat; a raft still can't
  mud: { waders: { discount: 5 } }, // 15 → 10
  ice: { "ice-cleats": { discount: 15 } }, // 20 → 5 (faster than plains — a tundra highway)
};
// HP a step ONTO this terrain costs (si7.6.9.4, D99) unless you carry one of its ward
// tools. Never drops you below TERRAIN_HP_FLOOR — spores wear you down, they don't kill.
export const TERRAIN_HP_COST: Partial<Record<Terrain, number>> = { "spore-thicket": 2 };
export const TERRAIN_HP_WARD: Partial<Record<Terrain, string[]>> = { "spore-thicket": ["filter-mask"] };
export const TERRAIN_HP_FLOOR = 1;
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
}; // required tool CAPABILITY per node type (the PRIMARY — drives gather SPEED)
// D83: a node kind may require a SECOND capability IN ADDITION to NODE_TOOL[kind]
// (an AND-gate). Absent = no extra requirement. The primary still drives gather
// SPEED; the secondary is a pure binary gate. Animal "hunting" now needs a TRAP to
// catch the beast AND a knife to take its parts — reject copy names both.
export const NODE_SECONDARY_TOOL: Partial<Record<GatherableNodeType, string>> = {
  animal: "trap",
};
export const TOOL_CAPABILITY: Record<string, string> = {
  pick: "pick",
  axe: "axe",
  knife: "knife",
  trap: "trap", // D83: the CATCH tool for hunting — animal nodes need a trap (this) AND a knife (skinning). Binary gate, no TOOL_SPEED (not a speed tool).
  "iron-pick": "pick",
  "iron-axe": "axe",
  "steel-pick": "pick",
  "steel-axe": "axe",
  spyglass: "vision", // perception-range capability (9u9.2); NODE_TOOL never asks for it, so no gather impact
  "climbing-pick": "climb", // gating capability (boo); NODE_TOOL never asks for "climb", so no gather impact
  raft: "ford", // gating capability for rivers (boo); D88: also the lake boat
  longboat: "sail", // D94: the sea-going boat — enables sea AND lake; NODE_TOOL never asks for "sail"
  "pearl-spyglass": "vision", // D94: spyglass + pearls — a longer glass (VISION_RANGE_BONUS)
  "fishing-rod": "fish", // si7.6.2: fish any water tile you stand on or next to; NODE_TOOL never asks for "fish"
  waders: "wade", // graded-movement gear (svz); NODE_TOOL never asks for it
  "filter-mask": "filter", // si7.6.9.4: spore-thickets cost no HP (TERRAIN_HP_WARD); NODE_TOOL never asks for it
  "ice-cleats": "trek",
  tent: "camp", // stamina gear (dtv; 7lr): powers the once-per-run camp meal (×TENT_FOOD_MULTIPLIER); NODE_TOOL never asks for "camp", so no gather impact
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
  fish: "fishes the water you stand on or beside",
  filter: "breathe freely in spore-thickets (no HP lost crossing them)",
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
  "fletchers-knife": 1, // ke3.3: outputScale multiplier for arrow-shaft (qtyPer × speed)
  "steel-fletchers-knife": 2, // tier-2: 2× shafts per log — the visible tool payoff (repays 57l)
}; // pick/axe/knife (the base kind tools) are absent = speed 1 — the ungated baseline
// --- Fishing (si7.6.2) ---
export const FISH_CAST_ENERGY = 25; // energy per cast — a bank of trout (40) nets little; lake/deep catches (60/90) are the payoff for going out on the raft
export const FISH_DEEP_DEPTH = 3; // a lake/sea tile this many tiles (Chebyshev) from the nearest land is "deep" water
// Special catches that aren't plain items (si7.6.2). A lockbox is opened on the spot
// and its contents rolled per entry (like LOOT_TABLE chances); a sodden map joins your
// carried maps exactly like a humanoid map-drop (tier = this map's + 1).
export const LOCKBOX_LOOT: { defId: string; qty: number; chance: number }[] = [
  { defId: "iron-ore", qty: 2, chance: 0.6 },
  { defId: "copper-ore", qty: 2, chance: 0.4 },
  { defId: "silver-ore", qty: 1, chance: 0.3 },
  { defId: "potion", qty: 1, chance: 0.35 },
  { defId: "salt", qty: 1, chance: 0.3 },
];
export const CATCH_EFFECT: Record<string, "lockbox" | "map"> = { "sunken-lockbox": "lockbox", "sodden-map": "map" };

export const GATHER_YIELD: Record<GatherableNodeType, number> = {
  mining: 3,
  wood: 3,
  herb: 2,
  animal: 2,
}; // qty gathered per (one-shot) node


// === Map tiers (2yn) — value-scaling generation axis. See spec 2026-07-08-map-tiers. ===
export const MAP_TIER_MAX = 5; // deepest map tier; drop-mint caps here

// === The region map (seyh.28, D106/D110) — the town's chart of the land around it. ===
// Each land's FIXED bearing from town (degrees clockwise from north). A land keeps its
// direction on every tier ring, so a held map always sits in its own land's wedge and
// the chart never teaches a false geography. On each ring the wedges are split halfway
// between the bearings of the lands that can appear at that tier (base lands + rare
// lands from their RARE_BIOMES.minTier), so the inner ring is the three base lands in
// thirds, the next ring adds the T2 rares between them, and fungal joins from T3.
// Presentation only: never read by generation. Moving a bearing moves the land on the chart.
export const REGION_BEARING: Record<BiomeId, number> = {
  woodland: 0, // north, straight out of the gate
  swamp: 60,
  fungal: 90, // squeezed in east from T3, between swamp and desert
  desert: 120,
  coastal: 180,
  tundra: 240,
  jungle: 300,
};
// How many trips ahead the chart looks to say when an unlit near land comes back
// ("back in 2 trips"). Each look generates a local map (~40ms), so only scanned when
// the player taps an unlit land. Past this horizon it says "not for a good while".
export const REGION_BACK_HORIZON = 8;

// === Route footprints (idle-adventure-seyh.10, D105/D112) — presentation only ===
// A planned or walked route draws boot prints on each tile; the count per tile is the
// engine's orthogonal step cost with your current gear divided by this, rounded up and
// clamped. More prints = shorter, smaller steps = slower ground. At 5: ice with cleats
// (5) = 1 print, plains (10) = 2, mud/spores (15) = 3, ice on foot (20) = 4, shallows
// (25) = 5, river (30) = 6. Lower it to exaggerate the contrast; raise it to calm it.
export const FOOTPRINT_ENERGY_PER_PRINT = 5;
export const FOOTPRINT_MAX_PRINTS = 6; // a cap so a mountain climb (40) stays legible on one tile

// === Map-carry capacity (zpm.2) — a DEDICATED pool for carried map-drops, separate
// from loot/carry slots. Carried maps no longer steal a loot stack (spec §3). ===
export const MAP_CARRY_BASE = 1; // starter-bag "map pocket": how many map-drops you can carry with NO holder owned.
// Total map-carry cap a map-holder grants (best OWNED wins, mirroring BACKPACK_SLOTS —
// holders are OWNED, not equipped: a passive bag upgrade, no slot cost). Recipes in
// crafting.ts. NEAR-THING values (tune in zpm.4).
export const MAP_HOLDER_CAP: Record<string, number> = {
  "map-satchel": 2, // T1 hide holder: +1 over base
  "map-case": 3, // T2 holder: +2 over base
};

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
  // D108 (seyh.3): the fresh buckets point at YOUR unspent budget, never at an empty
  // world. Bucket logic (engine/flavor.ts) is unchanged.
  bored: [
    "Still fresh, you head home with energy to spare.",
    "Plenty left in your legs, you call it early and turn for town.",
    "You head back with half a day's walking still in you.",
  ],
  beneath: [
    "Fed, rested and barely winded, you stroll home with provisions to spare.",
    "Pockets full of good food and energy to burn, you call it a day early.",
    "Rations untouched and legs still fresh, you wander back to town.",
  ],
};

// Per-material weight multiplier by map tier. Sparse: absent defId/tier = 1 (identity).
// MUST be 1 at tier 1 for every listed material (asserted in map-tier.test).
export const MATERIAL_MAP_TIER_WEIGHT: Record<string, Record<number, number>> = {
  coal:          { 2: 1, 3: 2, 4: 4, 5: 2 },
  "iron-ore":    { 2: 1.5, 3: 2, 4: 2, 5: 1.5 },
  "mithril-ore": { 3: 1, 4: 2, 5: 3 },
  // D83: bootstrap materials are ABUNDANT at T1 (base herb weights raised) but
  // taper on higher tiers so they don't crowd out higher-value forage deep in —
  // a fresh player finds them fast; a deep run drifts back toward scarcity.
  flint:         { 2: 0.5, 3: 0.3, 4: 0.2, 5: 0.2 },
  deadwood:      { 2: 0.5, 3: 0.3, 4: 0.2, 5: 0.2 },
};

// D84: per-creature weight multiplier by MAP tier — the sibling of
// MATERIAL_MAP_TIER_WEIGHT for the roster. Sparse, IDENTITY at T1 (absent = ×1, so
// T1 maps are byte-identical). This is what makes a higher-tier map PLAY different:
// the T1 trash scales OUT and the T2 monsters scale IN as tier rises, so the fights
// read tougher on the combat forecast and the drops craft into GEAR, not just food —
// the real "deeper = better", carried by the roster (bosses fade in separately via
// MAP_TIER_CREATURE_ADD). Rosters OVERLAP (a T2 map is mostly familiar with tougher
// things creeping in; a T3 is mostly tough with the odd straggler) — not a hard switch.
// Woodland gains a real tier climb here (its MAP_TIER_CREATURE_ADD is empty — D82
// near-thing) by scaling giant-elk/werewolf up. Multipliers are the tuning dial.
export const CREATURE_MAP_TIER_WEIGHT: Record<string, Record<number, number>> = {
  // Tier-1 trash scales OUT (untouched at T1/T2; thinning begins at T3)
  "sand-raider":     { 3: 0.6, 4: 0.4, 5: 0.3 },
  "mirage-wisp":     { 3: 0.6, 4: 0.4, 5: 0.3 },
  "forest-boar":     { 3: 0.6, 4: 0.4, 5: 0.3 },
  "snow-wolf":       { 3: 0.6, 4: 0.4, 5: 0.3 },
  "shell-beetle":    { 3: 0.6, 4: 0.4, 5: 0.3 },
  "ice-crab":        { 3: 0.6, 4: 0.4, 5: 0.3 },
  "fae-sprite":      { 3: 0.6, 4: 0.4, 5: 0.3 },
  "forest-bandit":   { 3: 0.6, 4: 0.4, 5: 0.3 },
  // Tier-2 mid scales IN (giant-elk/werewolf give WOODLAND its tier climb)
  "giant-scorpion":  { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  "dust-djinn":      { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  drake:             { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  "giant-elk":       { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  werewolf:          { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  "snow-marauder":   { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  "frost-fae":       { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  "frost-hatchling": { 2: 1.5, 3: 2, 4: 2.5, 5: 3 },
  // D94 coastal: the crab thins out, the wrecker + siren scale in
  "tide-crab":       { 3: 0.6, 4: 0.4, 5: 0.3 },
  wrecker:           { 3: 1.5, 4: 2, 5: 2.5 },
  siren:             { 3: 1.5, 4: 2, 5: 2.5 },
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
  swamp: {}, // si7.6.3: no swamp boss yet
  coastal: {}, // D94: no coastal boss yet
  jungle: {}, // D100: no jungle boss yet
  fungal: {}, // D100: no fungal boss yet
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
// 7lr: removing the tent's PASSIVE auto-eat bonus (its +50% now lives only in the
// once-per-run camp meal) lowered auto-harvest reach on tent packs ~1 band (the
// reference forager auto-routes and never uses a camp meal, so it's a conservative
// floor a real player beats by timing the meal). Targets re-derived to the new
// equilibrium (0.50→0.45 / 0.25→0.20); the TIER≈2× BASE invariant (the hard gate) is
// UNTOUCHED — measured 2.38× after the change.
export const HARVEST_FRACTION_TIER_TARGET = 0.45;
export const HARVEST_FRACTION_BASE_TARGET = 0.2;

// Per-terrain weight multiplier by map tier. Absent tier/terrain = 1 (identity at T1).
// Harsher mix upward — the energy cost that makes si7.2's tier-food matter.
export const TERRAIN_WEIGHT_TIER_SHIFT: Record<number, Partial<Record<Terrain, number>>> = {
  2: { mountain: 1.15, river: 1.15 },
  3: { mountain: 1.3, river: 1.3, ice: 1.15 },
  4: { mountain: 1.5, river: 1.4, ice: 1.3 },
  5: { mountain: 1.7, river: 1.5, ice: 1.4 },
};
