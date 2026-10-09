// Crafting fog + the town research table (675, D104). Spec:
// docs/superpowers/specs/2026-10-09-crafting-fog-research-design.md
// Pure data — re-exported by constants.ts. The rules live in engine/knowledge.ts
// (who knows what, recipe tiers) and engine/research.ts (query matching).
import type { FishWater } from "./constants"; // type-only (erased — no runtime cycle)

// The recipes every fogged game starts knowing: the four stone-age tools (user,
// 2026-10-08 — "at the start only the main tools are visible"). Everything else is
// discovered: by holding all of a recipe's inputs ("next"), crafting it, or research.
export const STARTER_RECIPES: string[] = ["knife", "axe", "pick", "trap"];

// --- Research table budget (user 2026-10-09) ---
export const RESEARCH_FREE_PER_TRIP = 1; // free searches per town visit (refreshes when `runs` advances, i.e. each return home). 0 = no free search.
export const RESEARCH_SEARCHES_PER_INK = 5; // searches bought by spending ONE research ink at the table
export const RESEARCH_INKS: string[] = ["ore-ink", "herb-ink"]; // the inks the table accepts (existing crafted items, also used for map inking — cxq)
// How far ABOVE your progress tier research can see: progress T1 → finds recipes up
// to T2. "dragon" on day one finds nothing (the same miss line as a word that matches
// nothing — no spoiler). A miss still COSTS the search (user 2026-10-09: learning the
// game's vocabulary should pay off).
export const RESEARCH_TIER_LOOKAHEAD = 1;

// Query matching knobs. A query token (plus its RESEARCH_SYNONYMS expansions) matches a
// vocabulary token exactly (after normalising + singularising both), or as a PREFIX when
// the query token is at least this long ("knif" → knife, "pemm" → pemmican) — short
// tokens ("bow", "axe") must match whole so "bo" can't sweep the book.
export const RESEARCH_MIN_PREFIX = 4;
// Words dropped from a query before matching (a sentence like "a bag for the river").
export const RESEARCH_STOPWORDS: string[] = ["a", "an", "the", "of", "for", "to", "and", "or", "with", "in", "on", "my", "some", "how", "make", "i", "want", "need", "craft", "recipe"];

// --- Recipe tiers (verticality) ---
// recipeTier(id) is DERIVED (engine/knowledge.ts): the lowest map tier where each raw
// input can be obtained (biome min tier, monster tier, gather gate), a crafted input
// takes its own recipe's tier, and a recipe = max(inputs, required tools, required
// station), min 1. This table OVERRIDES the derived tier for things that need nothing
// rare but are MEANT for later (user 2026-10-09: "things that don't strictly require
// anything but are meant for later still sit higher"). An override feeds forward:
// a station's tier floors every recipe that requires it.
export const RECIPE_TIER_OVERRIDE: Record<string, number> = {
  canteen: 2, // energy-cap gear — a second-trip upgrade, not a day-one craft
  "ice-cleats": 2, // tundra traversal gear
  tent: 2, // camp meals — the overnight kit
  waders: 2, // mud traversal gear
  "climbing-pick": 2, // opens mountains — a deliberate mid-game unlock
  horse: 2, // transport — a big logistics step
  panniers: 2, // only matters with a horse
  "map-satchel": 2, // map holders matter once maps drop
  smokehouse: 2, // stations are the home-base layer
  "alchemical-desk": 3,
  anvil: 2,
  still: 3,
  "dragonscale-cuirass": 4, // wyrm gear
  wyrmfang: 5,
};
// Derived-tier input: a GATED material (MATERIAL_GATE) sits this many tiers above the
// cheapest tool that opens it — silver/coal/salt/ironwood land at T2 (iron tools are
// T1), mithril at T3 (the steel-pick is T2), matching the gates' design comments.
export const GATED_MATERIAL_TIER_STEP = 1;
// Derived-tier input: the gear a water class needs before you can fish it (a rod, plus
// a boat for deep water). The catch's tier is floored by the gear's recipe tier.
export const FISH_WATER_GEAR: Record<FishWater, string[]> = {
  river: ["fishing-rod"],
  shallows: ["fishing-rod"],
  lake: ["fishing-rod"],
  sea: ["fishing-rod"],
  "deep-lake": ["fishing-rod", "raft"],
  "deep-sea": ["fishing-rod", "longboat"],
};

// Irregular plurals the crude singulariser can't derive (applied to BOTH the query and
// the vocabulary before matching). Regular plurals (s / es / ies→y) are rule-based.
export const RESEARCH_IRREGULAR_PLURALS: Record<string, string> = {
  knives: "knife", wolves: "wolf", leaves: "leaf", geese: "goose", teeth: "tooth", feet: "foot",
  staves: "staff", halves: "half", loaves: "loaf", thieves: "thief", hooves: "hoof", shelves: "shelf",
  dwarves: "dwarf", elves: "elf", scarves: "scarf", lives: "life", mice: "mouse", men: "man",
  oxen: "ox", children: "child", shoes: "shoe", dice: "die", fish: "fish", sheep: "sheep", deer: "deer",
  wharves: "wharf", calves: "calf", sheaves: "sheaf",
};

// Category / spelling words that EXPAND a query token into many words before matching
// (user 2026-10-09: "matching must be generous"). Keys and values are matched after the
// same normalisation as everything else. US/UK spellings live here too.
const ARMOUR_WORDS = ["armour", "armor", "plate", "chest", "helm", "helmet", "boots", "gloves", "legs", "hood", "robe", "cuirass", "jerkin"];
export const RESEARCH_SYNONYMS: Record<string, string[]> = {
  armor: ARMOUR_WORDS, armour: ARMOUR_WORDS,
  defense: ["defence"], defence: ["defense", "armour", "ward", "protection"],
  gear: ["armour", "weapon", "tool"],
  weapon: ["sword", "bow", "staff", "club", "blade", "blowgun", "dagger", "fang"],
  arms: ["weapon", "sword", "bow"],
  blade: ["sword", "knife", "dagger", "fang"],
  ranged: ["bow", "arrow", "dart", "blowgun", "flask"],
  ammo: ["arrow", "dart"], ammunition: ["arrow", "dart"],
  magic: ["staff", "robe", "enchanted", "wand"],
  food: ["ration", "jam", "stew", "fish", "meat", "jerky", "pemmican", "venison", "berry"],
  meal: ["food"], eat: ["food"], snack: ["food"], grub: ["food"], provision: ["food"],
  meat: ["venison", "jerky", "stew", "pemmican"],
  boat: ["raft", "longboat", "ship"], ship: ["boat"], canoe: ["boat"], vessel: ["boat"],
  bag: ["backpack", "pack", "satchel", "panniers", "case", "quiver", "sack"],
  backpack: ["bag"], pack: ["bag"], storage: ["bag"], container: ["bag", "vial", "case"],
  potion: ["draught", "elixir", "flask", "antidote", "brew", "tonic"],
  brew: ["potion"], drink: ["potion", "water", "canteen"],
  bomb: ["flask", "grenade"], grenade: ["flask", "bomb"], explosive: ["bomb"],
  tool: ["pick", "axe", "knife", "trap", "hammer", "rod", "kit", "spyglass", "pot"],
  station: ["anvil", "smokehouse", "still", "desk"], building: ["station"], workshop: ["station"],
  transport: ["horse", "wagon", "raft", "longboat", "mount"], travel: ["transport", "boots", "cleats", "waders"],
  mount: ["horse"], ride: ["horse"],
  heal: ["potion", "draught", "healing"], health: ["heal"], medicine: ["heal", "antidote"],
  poison: ["venom", "toxin", "antidote", "dart"], venom: ["poison"], toxin: ["poison"],
  oil: ["coating", "whetstone"], coating: ["oil"], enhance: ["oil", "whetstone"],
  climb: ["climbing"], swim: ["boat", "waders"], cross: ["boat", "raft"],
  dragon: ["wyrm"], wyrm: ["dragon"], // not "drake": a day-one "dragon" must not find the T2 drake-hide recipes
  cook: ["cooked", "grilled", "smoked", "stew", "boil", "pot", "fire"],
  fire: ["flame", "burn"], flame: ["fire"],
  map: ["cartography", "ink"], ink: ["map"],
  boots: ["feet", "footwear"], shoe: ["boots"], hat: ["helm", "hood", "helmet"], helm: ["helmet"], helmet: ["helm"],
  shirt: ["chest"], trousers: ["legs"], pants: ["legs"], gauntlet: ["gloves"], glove: ["gloves"],
};

// Research vocabulary: every recipe OUTPUT defId → related words (synonyms, category,
// what it's for, what it's made from). The output's own name tokens are matched too
// ("small-backpack" → small, backpack, smallbackpack). Several recipes share an output
// (ration ← herb/sage/moss/venison/…) — they share its words. Coverage is pinned:
// every recipe output has ≥ 6 entries (test/research.test.ts).
export const RESEARCH_KEYWORDS: Record<string, string[]> = {
  // food
  ration: ["food", "meal", "provision", "rations", "eat", "jerky", "supplies", "herb", "meat", "snack", "basic"],
  jam: ["preserve", "jelly", "sweet", "fruit", "berry", "food", "spread", "apple", "marmalade", "conserve"],
  pemmican: ["food", "meat", "berry", "trail", "dense", "preserved", "drake", "hide", "jerky"],
  "trail-ration": ["food", "trail", "travel", "provision", "dense", "meal", "coal", "hiking", "supplies"],
  "cooked-venison": ["food", "meat", "deer", "venison", "cook", "roast", "campfire", "elk", "steak"],
  "cooked-berries": ["food", "berry", "fruit", "cook", "campfire", "stewed", "compote", "warm"],
  "grilled-tuna": ["food", "fish", "tuna", "grill", "cook", "campfire", "sea", "seafood", "steak"],
  "grilled-pike": ["food", "fish", "pike", "grill", "cook", "campfire", "lake", "seafood"],
  "crayfish-boil": ["food", "crayfish", "boil", "shellfish", "pot", "cook", "crawfish", "seafood", "lobster"],
  "smoked-fish": ["food", "fish", "smoke", "smoked", "preserve", "cure", "kipper", "seafood"],
  stew: ["food", "soup", "pot", "meat", "cook", "hearty", "meal", "broth", "venison", "berry"],
  "smoked-venison": ["food", "meat", "venison", "smoke", "cure", "jerky", "salt", "elk", "preserve"],
  "blubber-stew": ["food", "seal", "blubber", "fat", "stew", "cold", "warm", "soup", "moss"],
  // potions + alchemy
  potion: ["heal", "healing", "health", "medicine", "cure", "remedy", "tonic", "hp", "herb", "sage", "leech"],
  "greater-potion": ["heal", "healing", "health", "medicine", "strong", "remedy", "silver", "potion", "big"],
  draught: ["heal", "healing", "potion", "brew", "drink", "medicine", "glass", "herb", "kelp"],
  "greater-draught": ["heal", "healing", "potion", "brew", "strong", "drink", "silver", "alchemy"],
  antidote: ["poison", "venom", "cure", "remedy", "snakebite", "toxin", "medicine", "thistle", "potion"],
  "elixir-of-power": ["strength", "damage", "buff", "power", "rage", "potion", "battle", "might", "vampire", "ash"],
  "warding-draught": ["defence", "defense", "protection", "ward", "armor", "buff", "shield", "potion", "troll"],
  "water-vial": ["water", "flask", "vial", "drink", "river", "fill", "bottle", "glass"],
  "glass-vial": ["glass", "vial", "bottle", "flask", "container", "flint", "jar", "phial"],
  glassware: ["glass", "alchemy", "lab", "beaker", "brewing", "chemistry", "flint", "kit", "tool"],
  // inks + maps
  "ore-ink": ["ink", "map", "cartography", "write", "mine", "ore", "dye", "copper", "research"],
  "herb-ink": ["ink", "map", "cartography", "write", "herb", "plant", "dye", "research"],
  "map-satchel": ["map", "bag", "case", "pouch", "carry", "cartography", "hide", "leather"],
  "map-case": ["map", "case", "tube", "carry", "cartography", "holder", "silver", "drake"],
  // materials
  "iron-ore": ["iron", "ore", "metal", "smelt", "bog", "refine", "swamp", "bar"],
  leather: ["backpack", "bag", "pack", "hide", "leather", "carry", "storage", "satchel", "rucksack"],
  bowstring: ["string", "bow", "cord", "archery", "twine", "sinew", "bark", "stringybark"],
  "arrow-shaft": ["arrow", "shaft", "fletching", "archery", "wood", "ammo", "oak", "stick"],
  // tools
  club: ["weapon", "cudgel", "bludgeon", "mace", "stick", "wood", "melee", "deadwood", "bat"],
  knife: ["blade", "cut", "skinning", "hunt", "dagger", "flint", "tool", "stone", "skin"],
  axe: ["wood", "chop", "tree", "lumber", "logging", "hatchet", "tool", "flint", "stone"],
  pick: ["mine", "mining", "ore", "rock", "stone", "pickaxe", "tool", "flint", "dig"],
  trap: ["hunt", "hunting", "snare", "animal", "catch", "game", "tool", "deadwood", "flint"],
  "iron-pick": ["mine", "mining", "ore", "pickaxe", "iron", "tool", "upgrade", "dig", "silver", "coal"],
  "iron-axe": ["wood", "chop", "lumber", "hatchet", "iron", "tool", "upgrade", "ironwood", "tree"],
  "steel-pick": ["mine", "mining", "ore", "pickaxe", "steel", "tool", "mithril", "dig", "upgrade"],
  "steel-axe": ["wood", "chop", "lumber", "hatchet", "steel", "tool", "upgrade", "tree"],
  "climbing-pick": ["climb", "climbing", "mountain", "ice", "ascend", "cliff", "scale", "axe", "rope"],
  spyglass: ["telescope", "scope", "see", "vision", "survey", "look", "far", "lens", "copper"],
  "pearl-spyglass": ["telescope", "scope", "see", "vision", "survey", "pearl", "far", "lens"],
  "fletchers-knife": ["knife", "fletch", "fletching", "arrow", "shaft", "carve", "whittle", "tool", "fletcher"],
  "fire-kit": ["fire", "flint", "tinder", "campfire", "cook", "light", "spark", "firestarter", "kit"],
  "cooking-pot": ["pot", "cook", "cooking", "stew", "boil", "kettle", "pan", "iron", "cauldron"],
  "fishing-rod": ["fish", "fishing", "rod", "angle", "line", "catch", "hook", "pole", "tackle"],
  "blacksmiths-hammer": ["hammer", "smith", "blacksmith", "forge", "anvil", "metal", "plate", "tool", "iron"],
  whetstone: ["sharpen", "sharp", "stone", "blade", "edge", "grind", "whet", "enhance", "coating"],
  "filter-mask": ["mask", "spore", "breathe", "filter", "air", "fungus", "gas", "respirator", "reed"],
  // travel + carry
  raft: ["boat", "water", "river", "float", "cross", "lake", "sail", "log", "paddle"],
  longboat: ["boat", "ship", "sea", "ocean", "sail", "water", "deep", "driftwood", "canoe"],
  waders: ["mud", "swamp", "boots", "wade", "bog", "marsh", "water", "shallows", "hide"],
  "ice-cleats": ["ice", "snow", "boots", "grip", "frozen", "tundra", "cleat", "crampon", "spikes"],
  tent: ["camp", "camping", "shelter", "sleep", "rest", "overnight", "bed", "hide", "canvas"],
  canteen: ["water", "bottle", "flask", "drink", "stamina", "energy", "thirst", "copper", "flagon"],
  "small-backpack": ["bag", "pack", "satchel", "sack", "carry", "haul", "storage", "rucksack", "hide", "pouch"],
  "large-pack": ["bag", "pack", "backpack", "satchel", "carry", "haul", "storage", "big", "rucksack", "drake", "troll"],
  horse: ["mount", "ride", "riding", "steed", "pony", "transport", "travel", "animal", "stallion"],
  wagon: ["cart", "carriage", "transport", "wheel", "haul", "carry", "vehicle", "ironwood"],
  panniers: ["saddlebag", "saddle", "bag", "horse", "carry", "haul", "storage", "pannier"],
  quiver: ["arrow", "ammo", "archery", "holder", "bow", "case", "carry", "bag"],
  // stations
  smokehouse: ["smoke", "smoker", "station", "preserve", "meat", "fish", "building", "house"],
  "alchemical-desk": ["alchemy", "desk", "lab", "laboratory", "station", "potion", "brewing", "workbench", "alchemist"],
  anvil: ["forge", "smith", "smithy", "blacksmith", "station", "metal", "armor", "workbench"],
  still: ["distill", "distillery", "station", "alchemy", "oil", "flask", "brewing", "alembic"],
  // weapons
  sword: ["weapon", "blade", "melee", "fight", "sabre", "steel", "iron", "longsword"],
  "iron-sword": ["weapon", "blade", "melee", "iron", "fight", "sabre", "longsword", "metal"],
  "steel-sword": ["weapon", "blade", "melee", "steel", "fight", "sabre", "longsword", "coal"],
  "silver-sword": ["weapon", "blade", "melee", "silver", "werewolf", "monster", "holy", "longsword"],
  "mithril-sword": ["weapon", "blade", "melee", "mithril", "legendary", "fight", "longsword", "elven"],
  wyrmfang: ["dragon", "wyrm", "fang", "blade", "slayer", "sword", "weapon", "legendary", "dragonheart"],
  bow: ["archery", "ranged", "arrow", "shoot", "weapon", "longbow", "hunt", "oak", "archer"],
  "composite-bow": ["archery", "ranged", "arrow", "shoot", "weapon", "longbow", "strong", "ironwood", "archer"],
  blowgun: ["dart", "blowpipe", "ranged", "poison", "weapon", "shoot", "reed", "amber"],
  arrows: ["arrow", "ammo", "ammunition", "archery", "bow", "shoot", "projectile", "feather", "flint"],
  "blow-dart": ["dart", "ammo", "blowgun", "blowpipe", "needle", "projectile", "reed", "amber"],
  "toxin-dart": ["dart", "ammo", "poison", "toxin", "toad", "blowgun", "venom", "projectile"],
  "venom-dart": ["dart", "ammo", "poison", "venom", "blowgun", "deadly", "oil", "projectile"],
  "fire-staff": ["staff", "magic", "fire", "wand", "spell", "wizard", "mage", "fae", "dust"],
  "inferno-staff": ["staff", "magic", "fire", "wand", "spell", "wizard", "inferno", "mage", "flame"],
  // flasks + oils
  "fire-flask": ["bomb", "firebomb", "grenade", "throw", "flask", "fire", "explosive", "molotov", "salt"],
  "venom-flask": ["bomb", "poison", "throw", "flask", "venom", "grenade", "toxin", "sac"],
  "spore-bomb": ["bomb", "spore", "throw", "grenade", "fungus", "explosive", "flask", "mushroom"],
  "silver-oil": ["oil", "coating", "blade", "silver", "werewolf", "enhance", "weapon", "anoint"],
  "drake-oil": ["oil", "coating", "blade", "dragon", "drake", "enhance", "weapon", "anoint"],
  "venom-oil": ["oil", "coating", "blade", "poison", "venom", "enhance", "weapon", "thistle"],
  // armour
  "plate-helmet": ["armor", "armour", "helmet", "helm", "head", "plate", "metal", "iron", "hat"],
  "plate-chest": ["armor", "armour", "chest", "breastplate", "body", "plate", "metal", "iron", "cuirass"],
  "plate-legs": ["armor", "armour", "legs", "greaves", "leggings", "plate", "metal", "iron", "lurker"],
  "plate-boots": ["armor", "armour", "boots", "feet", "sabatons", "plate", "metal", "iron", "beetle"],
  "plate-gloves": ["armor", "armour", "gloves", "gauntlets", "hands", "plate", "metal", "iron"],
  "steel-plate-helmet": ["armor", "armour", "helmet", "helm", "head", "steel", "plate", "metal"],
  "steel-plate-chest": ["armor", "armour", "chest", "breastplate", "body", "steel", "plate", "metal"],
  "steel-plate-legs": ["armor", "armour", "legs", "greaves", "leggings", "steel", "plate", "metal"],
  "steel-plate-boots": ["armor", "armour", "boots", "feet", "sabatons", "steel", "plate", "metal"],
  "steel-plate-gloves": ["armor", "armour", "gloves", "gauntlets", "hands", "steel", "plate", "metal"],
  "mithril-plate-helmet": ["armor", "armour", "helmet", "helm", "head", "mithril", "plate", "metal"],
  "mithril-plate-chest": ["armor", "armour", "chest", "breastplate", "body", "mithril", "plate", "metal"],
  "mithril-plate-legs": ["armor", "armour", "legs", "greaves", "leggings", "mithril", "plate", "metal"],
  "mithril-plate-boots": ["armor", "armour", "boots", "feet", "sabatons", "mithril", "plate", "metal"],
  "mithril-plate-gloves": ["armor", "armour", "gloves", "gauntlets", "hands", "mithril", "plate", "metal"],
  "light-chest": ["armor", "armour", "chest", "leather", "jerkin", "tunic", "light", "body", "hide"],
  "light-legs": ["armor", "armour", "legs", "leather", "trousers", "pants", "light", "hide", "pelt"],
  "robe-chest": ["armor", "armour", "robe", "cloth", "mage", "magic", "body", "herb", "moss"],
  "robe-hood": ["armor", "armour", "hood", "robe", "cloth", "mage", "head", "hat", "moss"],
  "studded-chest": ["armor", "armour", "chest", "leather", "studded", "drake", "body", "hide"],
  "studded-legs": ["armor", "armour", "legs", "leather", "studded", "drake", "hide", "trousers"],
  "turtle-shell-helm": ["armor", "armour", "helmet", "helm", "head", "turtle", "shell", "hat"],
  "enchanted-chest": ["armor", "armour", "robe", "enchanted", "magic", "silver", "body", "mage"],
  "enchanted-hood": ["armor", "armour", "hood", "enchanted", "magic", "silver", "head", "mage"],
  "warg-jerkin": ["armor", "armour", "werewolf", "wolf", "warg", "pelt", "jerkin", "chest", "leather"],
  "scorpion-plate-chest": ["armor", "armour", "scorpion", "carapace", "chest", "plate", "shell", "body"],
  "dragonscale-cuirass": ["dragon", "wyrm", "scale", "armor", "armour", "chest", "cuirass", "legendary", "body"],
};
