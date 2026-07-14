// Crafting + consumable catalogs (465: split out of constants.ts). Food/potion/
// battle-item lists, station ids, and the shared RECIPE tree. Pure data —
// re-exported by constants.ts so consumers are unchanged.
import type { ItemStackSpec } from "./spec";
import type { Terrain } from "./constants"; // RECIPE.requires.terrain (type-only; erased, no runtime cycle)
import { ARROWS_PER_CRAFT, ARROW_SHAFTS_PER_LOG } from "./combat"; // ammo recipe yields

// --- Consumable item catalogs (M5) ---
// ENERGY_PER_FOOD / POTION_HEAL are flat, so these are single-item catalogs for
// the POC; the list is what `pack`/`slotOf` validate a food/potion defId against.
export const FOOD: string[] = ["ration", "trail-ration", "berries", "jam", "pemmican", "apple", "smoked-venison", "blubber-stew", "cooked-venison", "cooked-berries", "stew"];
export const POTION: string[] = ["potion", "greater-potion", "draught", "greater-draught"];
export const BATTLE_ITEM: string[] = ["elixir-of-power", "warding-draught"]; // combat consumables (bzd); COMBAT_BUFF keys

// --- Crafting (M5): direct & instant, materials → item (D10). One shared tree
// so hauls from different biomes feed each other. Weighted materials (D27) make
// cross-biome inputs a soft pull (silver best-farmed in tundra), not a hard gate.
// Stations (ke3, crafting-depth §2): non-bank, permanent, home-side infrastructure
// that gates the deep home recipes. A station is a property of the base
// (`state.stations`), never a carried stack — so a `requires.station` gate can by
// definition never be satisfied in the field, which is what keeps hard recipes
// home-bound. Built via a recipe's `buildsStation` (ke3.2).
export type StationId = "smokehouse" | "alchemical-desk" | "anvil" | "still";

// A recipe can gate beyond its `inputs` (ke3.1, crafting-depth §4.1):
//   requires.station — a home StationId (uncarriable → home-only)
//   requires.tools   — DEFIDS, AND semantics: EVERY listed tool must be present in
//                      the caller's phase-scoped tool pool (town = bank∪equipped;
//                      field = equipped∪carry). Recognised via TOOL_CAPABILITY.
//   requires.terrain — a Terrain the crafter must stand on (field-only gate; the
//                      runtime check lands in ke3.4). Invariant: only on field:true.
// field — opt-in to expedition crafting (default absent = town-only, byte-for-byte).
// Absent `requires`/`field` on every existing recipe → behaviour unchanged.
export const RECIPE: Record<
  string,
  {
    inputs: ItemStackSpec[];
    output: ItemStackSpec;
    requires?: { station?: StationId; tools?: string[]; terrain?: Terrain };
    field?: boolean;
    buildsStation?: StationId; // ke3.2: this recipe BUILDS a home station — its output is routed into state.stations (once), never banked. Inputs consumed normally (e.g. steel×N → anvil). Town-only by nature.
    outputScale?: { capability: string; qtyPer: number }; // ke3.3: output.qty is REPLACED by qtyPer × best TOOL_SPEED over availableTools with this capability (the gating tool's speed scales the yield). Absent = fixed output.qty (every existing recipe unchanged).
  }
> = {
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
  jam: { inputs: [{ defId: "stale-berries", qty: 3 }], output: { defId: "jam", qty: 1 } }, // the stale-berry payoff (e3j): denser than ration, cheaper than trail-ration
  pemmican: { inputs: [{ defId: "drake-hide", qty: 1 }, { defId: "stale-berries", qty: 2 }], output: { defId: "pemmican", qty: 1 } }, // dense trail food (si7.2): meat + berries. Monster-drop-meat variant → m0a.
  potion: { inputs: [{ defId: "desert-sage", qty: 1 }, { defId: "forest-herb", qty: 1 }], output: { defId: "potion", qty: 1 } },
  // Cartography inks (cxq) — apply to a HELD map to roll an affix from the ink's
  // domain. Vague flavour only (the affix NAME carries the meaning). ore-ink is a
  // deliberate copper sink (playtest flagged copper as a trap).
  "ore-ink": { inputs: [{ defId: "copper-ore", qty: 2 }, { defId: "potion", qty: 1 }], output: { defId: "ore-ink", qty: 1 } },
  "herb-ink": { inputs: [{ defId: "forest-herb", qty: 2 }, { defId: "potion", qty: 1 }], output: { defId: "herb-ink", qty: 1 } },
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
  tent: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "pine-log", qty: 2 }], output: { defId: "tent", qty: 1 } }, // camp gear (dtv): food restores +50% energy
  canteen: { inputs: [{ defId: "copper-ore", qty: 2 }, { defId: "deer-hide", qty: 1 }], output: { defId: "canteen", qty: 1 } }, // provision gear (si7.2): +maxEnergy; a copper sink
  // Backpack — carry upgrades. `small-backpack` is your FIRST pack (you start
  // bare): cheap, one hunt's worth of hide. Then leather (5), large-pack (7, T2).
  "small-backpack": { inputs: [{ defId: "deer-hide", qty: 1 }], output: { defId: "small-backpack", qty: 1 } },
  leather: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "leather", qty: 1 } },
  "large-pack": { inputs: [{ defId: "drake-hide", qty: 2 }, { defId: "ironwood-log", qty: 1 }], output: { defId: "large-pack", qty: 1 } },
  // Transport
  horse: { inputs: [{ defId: "deer-hide", qty: 3 }, { defId: "oak-log", qty: 2 }], output: { defId: "horse", qty: 1 } },
  wagon: { inputs: [{ defId: "ironwood-log", qty: 2 }, { defId: "iron-ore", qty: 2 }], output: { defId: "wagon", qty: 1 } }, // T2: ironwood → iron-axe
  panniers: { inputs: [{ defId: "deer-hide", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "panniers", qty: 1 } }, // saddlebags — extra carry, needs a beast (zhn)
  // Ranged line (D45) — fully pick-free: bark → string, wood+flint+feather → arrows.
  bowstring: { inputs: [{ defId: "stringybark", qty: 2 }], output: { defId: "bowstring", qty: 1 } }, // bark strips twist into cord
  arrows: { inputs: [{ defId: "pine-log", qty: 1 }, { defId: "flint", qty: 1 }, { defId: "feather", qty: 1 }], output: { defId: "arrows", qty: ARROWS_PER_CRAFT } }, // three cheap inputs, generous batch
  // Fletching thread (ke3.3) — the cross-tree yield-mod that laces wood/smithing
  // into the bow line and repays 57l (bow payoff invisible) with a VISIBLE tool
  // payoff. A fletchers-knife turns one oak-log into a batch of shafts; a steel
  // knife doubles the batch. Shafts are the alternate arrow body (vs the direct
  // pine-log recipe above) — parallel cost at the base knife, cheaper with steel.
  "fletchers-knife": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "oak-log", qty: 1 }], output: { defId: "fletchers-knife", qty: 1 } },
  "arrow-shaft": { inputs: [{ defId: "oak-log", qty: 1 }], output: { defId: "arrow-shaft", qty: 1 }, requires: { tools: ["fletchers-knife"] }, outputScale: { capability: "fletch", qtyPer: ARROW_SHAFTS_PER_LOG } }, // qty REPLACED by qtyPer × knife quality
  "arrows-fletched": { inputs: [{ defId: "arrow-shaft", qty: ARROW_SHAFTS_PER_LOG }, { defId: "flint", qty: 1 }, { defId: "feather", qty: 1 }], output: { defId: "arrows", qty: ARROWS_PER_CRAFT } }, // shafts + heads + fletching → a batch; one q1-log's worth of shafts = one batch
  // Field crafting (ke3.4) — the fire-kit is a carried kit-tool (flint-and-steel
  // style: flint forage + iron), the heat gate for cooking. cooked-venison is the
  // minimal field recipe: raw meat + a log of fuel, cooked over the kit → dense
  // stamina mid-run. ke3.5 extends this into the full cooking loop. NO lit-fire
  // state machine — fuel is a normal input, the fire-kit is the gate.
  "fire-kit": { inputs: [{ defId: "flint", qty: 1 }, { defId: "iron-ore", qty: 1 }], output: { defId: "fire-kit", qty: 1 } },
  "cooked-venison": { inputs: [{ defId: "rich-venison", qty: 1 }, { defId: "oak-log", qty: 1 }], output: { defId: "cooked-venison", qty: 1 }, requires: { tools: ["fire-kit"] }, field: true }, // fuel = oak-log; heat = fire-kit; field-only
  // ke3.5 proof slice — the cooking LOOP has depth: a bare fire-kit roasts meat or
  // fresh forage; adding a cooking-pot (a second tool slot) unlocks the dense stew.
  "cooked-berries": { inputs: [{ defId: "berries", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "cooked-berries", qty: 1 }, requires: { tools: ["fire-kit"] }, field: true }, // universal-forage field cook (berries in every biome) — turns fresh-that-stales into a keeper
  "cooking-pot": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "cooking-pot", qty: 1 } }, // the second cooking tool (town-crafted, carried into the field)
  stew: { inputs: [{ defId: "rich-venison", qty: 1 }, { defId: "berries", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "stew", qty: 1 }, requires: { tools: ["fire-kit", "cooking-pot"] }, field: true }, // AND-gate: needs BOTH kit-tools; multi-ingredient premium field food
  // Smokehouse (station) — gates the EXISTING smoked-venison recipe behind home
  // infra (ke3.5). Near-zero new content: proves the station gate on real food.
  smokehouse: { inputs: [{ defId: "oak-log", qty: 3 }, { defId: "iron-ore", qty: 2 }], output: { defId: "smokehouse", qty: 1 }, buildsStation: "smokehouse" },
  // Alchemy thread (ke3.6) — the fullest home-vs-field split in one vertical. The
  // FIELD kit (glassware + fire-kit) brews a basic healing draught from a river-
  // filled vial; HOME the alchemical-desk (station) brews the strong version the
  // field can't. Water is never an item from the sky (user): you fill a vial at a
  // river in the field; at home the recipe just omits water.
  glassware: { inputs: [{ defId: "flint", qty: 3 }], output: { defId: "glassware", qty: 1 } }, // the brewing tool (blown from flint-glass), carried into the field
  "glass-vial": { inputs: [{ defId: "flint", qty: 2 }], output: { defId: "glass-vial", qty: 2 } }, // cheap empty containers — a stackable material
  "water-vial": { inputs: [{ defId: "glass-vial", qty: 1 }], output: { defId: "water-vial", qty: 1 }, field: true, requires: { terrain: "river" } }, // FILL a vial at a river (on/adjacent) — no tools, field-only; river exists in every biome
  draught: { inputs: [{ defId: "forest-herb", qty: 2 }], output: { defId: "draught", qty: 1 }, requires: { tools: ["glassware"] } }, // HOME brew: glassware + herbs, water omitted (user)
  "field-draught": { inputs: [{ defId: "water-vial", qty: 1 }, { defId: "forest-herb", qty: 2 }, { defId: "oak-log", qty: 1 }], output: { defId: "draught", qty: 1 }, requires: { tools: ["glassware", "fire-kit"] }, field: true }, // FIELD brew: same basic draught, needs a filled vial + heat; lands in loadout.potions so it's quaffable right away
  "alchemical-desk": { inputs: [{ defId: "glass-vial", qty: 3 }, { defId: "iron-ore", qty: 2 }], output: { defId: "alchemical-desk", qty: 1 }, buildsStation: "alchemical-desk" }, // the deep home alchemy station
  "greater-draught": { inputs: [{ defId: "forest-herb", qty: 2 }, { defId: "silver-ore", qty: 1 }], output: { defId: "greater-draught", qty: 1 }, requires: { station: "alchemical-desk" } }, // strong heal the field kit CAN'T make — station-gated, town-only
  // Forge (ke3.7) — the anvil station + blacksmith's hammer gate ALL metal plate.
  // Adds NO new armour (F1-safe); it makes "heavy armour = forge work" a real
  // progression beat (build a forge before plate flows). Chitin/carapace plate
  // alternates stay ungated — the deliberate "plate without a forge" path.
  anvil: { inputs: [{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 2 }], output: { defId: "anvil", qty: 1 }, buildsStation: "anvil" },
  "blacksmiths-hammer": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "blacksmiths-hammer", qty: 1 } },
  // Weapons — T1
  "iron-sword": { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "iron-sword", qty: 1 } },
  bow: { inputs: [{ defId: "oak-log", qty: 2 }, { defId: "bowstring", qty: 1 }], output: { defId: "bow", qty: 1 } }, // D45 rework: bowstring replaces deer-hide — the whole bow line stays pick-free (starter axe)
  "fire-staff": { inputs: [{ defId: "pine-log", qty: 2 }, { defId: "fae-dust", qty: 1 }], output: { defId: "fire-staff", qty: 1 } },
  // Weapons — T2 (each needs a T2 material → all sit behind the iron-pick/iron-axe/steel-knife tier)
  "silver-sword": { inputs: [{ defId: "silver-ore", qty: 3 }], output: { defId: "silver-sword", qty: 1 } }, // werewolf affinity; silver T2, best-farmed in tundra
  "steel-sword": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "steel-sword", qty: 1 } },
  "composite-bow": { inputs: [{ defId: "ironwood-log", qty: 2 }, { defId: "bowstring", qty: 1 }], output: { defId: "composite-bow", qty: 1 } }, // D45 rework: bowstring replaces deer-hide; ironwood T2 (iron-axe) — the TOP bow crosses into mining, the style never requires it
  "inferno-staff": { inputs: [{ defId: "fae-dust", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "inferno-staff", qty: 1 } },
  // Weapons — T3 (mithril → steel-pick)
  "mithril-sword": { inputs: [{ defId: "mithril-ore", qty: 3 }], output: { defId: "mithril-sword", qty: 1 } },
  // Armour — full plate set + light/robe samples. ALL metal plate (iron/steel/
  // mithril) is FORGE work (ke3.7): gated behind the anvil station + a blacksmith's
  // hammer. No new armour → F1-safe; if anything it gates plate MORE (the chitin/
  // carapace alternates below stay ungated — "plate without a forge").
  "plate-helmet": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "plate-helmet", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "plate-chest": { inputs: [{ defId: "iron-ore", qty: 3 }], output: { defId: "plate-chest", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "plate-legs": { inputs: [{ defId: "iron-ore", qty: 2 }], output: { defId: "plate-legs", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "plate-boots": { inputs: [{ defId: "iron-ore", qty: 1 }], output: { defId: "plate-boots", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "plate-gloves": { inputs: [{ defId: "iron-ore", qty: 1 }], output: { defId: "plate-gloves", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "light-chest": { inputs: [{ defId: "deer-hide", qty: 2 }], output: { defId: "light-chest", qty: 1 } },
  "light-legs": { inputs: [{ defId: "deer-hide", qty: 1 }, { defId: "wolf-pelt", qty: 1 }], output: { defId: "light-legs", qty: 1 } },
  "robe-chest": { inputs: [{ defId: "forest-herb", qty: 2 }, { defId: "ice-moss", qty: 1 }], output: { defId: "robe-chest", qty: 1 } },
  "robe-hood": { inputs: [{ defId: "forest-herb", qty: 1 }, { defId: "ice-moss", qty: 1 }], output: { defId: "robe-hood", qty: 1 } },
  // Armour — T2 steel plate (iron-plate cost + coal → iron-pick-gated)
  "steel-plate-helmet": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-helmet", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "steel-plate-chest": { inputs: [{ defId: "iron-ore", qty: 3 }, { defId: "coal", qty: 2 }], output: { defId: "steel-plate-chest", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "steel-plate-legs": { inputs: [{ defId: "iron-ore", qty: 2 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-legs", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "steel-plate-boots": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-boots", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "steel-plate-gloves": { inputs: [{ defId: "iron-ore", qty: 1 }, { defId: "coal", qty: 1 }], output: { defId: "steel-plate-gloves", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  // Armour — T3 mithril plate (mithril → steel-pick-gated). The combat-trivializer, top of the longest climb.
  "mithril-plate-helmet": { inputs: [{ defId: "mithril-ore", qty: 2 }], output: { defId: "mithril-plate-helmet", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "mithril-plate-chest": { inputs: [{ defId: "mithril-ore", qty: 3 }], output: { defId: "mithril-plate-chest", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "mithril-plate-legs": { inputs: [{ defId: "mithril-ore", qty: 2 }], output: { defId: "mithril-plate-legs", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "mithril-plate-boots": { inputs: [{ defId: "mithril-ore", qty: 1 }], output: { defId: "mithril-plate-boots", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
  "mithril-plate-gloves": { inputs: [{ defId: "mithril-ore", qty: 1 }], output: { defId: "mithril-plate-gloves", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } },
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
  "plate-boots-beetle": { inputs: [{ defId: "beetle-shell", qty: 2 }], output: { defId: "plate-boots", qty: 1 } }, // beetle chitin = plate without iron (si7.1)
  "fire-staff-wisp": { inputs: [{ defId: "wisp-essence", qty: 1 }, { defId: "cactus-wood", qty: 2 }], output: { defId: "fire-staff", qty: 1 } }, // desert path to magic — no woodland fae needed (si7.1)
  "ration-crab": { inputs: [{ defId: "crab-shell", qty: 1 }], output: { defId: "ration", qty: 2 } }, // crab meat (si7.1)
  // T3 combat consumables (bzd) — the exclusive reward for fighting T3 monsters
  "elixir-of-power": { inputs: [{ defId: "vampire-ash", qty: 2 }], output: { defId: "elixir-of-power", qty: 1 } }, // +2 dmg, one fight
  "warding-draught": { inputs: [{ defId: "troll-hide", qty: 2 }], output: { defId: "warding-draught", qty: 1 } }, // +3 mitigation, one fight
  // m0a: mid-game tier foods — dense reserves that reward routing cross-biome materials
  "smoked-venison": { inputs: [{ defId: "rich-venison", qty: 1 }, { defId: "salt", qty: 1 }], output: { defId: "smoked-venison", qty: 1 }, requires: { station: "smokehouse" } }, // m0a food, now gated behind the smokehouse station (ke3.5): the deep home-cured version (200) vs the field roast (cooked-venison, 150)
  "blubber-stew": { inputs: [{ defId: "seal", qty: 1 }, { defId: "ice-moss", qty: 1 }], output: { defId: "blubber-stew", qty: 1 } }, // m0a: tundra tier-food (7pi: raw seal, matching other biome tier-foods that consume the gather directly)
  "apple-jam": { inputs: [{ defId: "bruised-apple", qty: 3 }], output: { defId: "jam", qty: 1 } }, // m0a: staled orchard fruit → jam (mirrors stale-berries→jam)
  "elixir-of-power-thistle": { inputs: [{ defId: "thistle", qty: 2 }, { defId: "djinn-ember", qty: 1 }], output: { defId: "elixir-of-power", qty: 1 } }, // m0a: breaks the vampire-only gate on the battle-item line
  // Boss capstone (D34)
  "dragonscale-cuirass": { inputs: [{ defId: "wyrm-scale", qty: 3 }], output: { defId: "dragonscale-cuirass", qty: 1 } },
  wyrmfang: { inputs: [{ defId: "dragonheart", qty: 1 }], output: { defId: "wyrmfang", qty: 1 } },
  // m0a: mid-game monster drops consuming recipes (roster.test invariant: every drop feeds the tree)
  "scale-jerky": { inputs: [{ defId: "hatchling-scale", qty: 1 }], output: { defId: "ration", qty: 2 } }, // hatchling chitin rendered = field rations (unusual but functional)
  // Weapon enhancement (ke3.7 threads 3+4, D60) — merged whetstone + oils. The
  // still station brews the OILS (affinity/poison coatings); the anvil forges the
  // WHETSTONE (flat-damage grindstone — sharpening is smith work, reuses the forge).
  still: { inputs: [{ defId: "glass-vial", qty: 3 }, { defId: "copper-ore", qty: 2 }], output: { defId: "still", qty: 1 }, buildsStation: "still" }, // a copper sink; reuses alchemy glass
  "silver-oil": { inputs: [{ defId: "silver-ore", qty: 1 }, { defId: "forest-herb", qty: 1 }], output: { defId: "silver-oil", qty: 1 }, requires: { station: "still" } }, // affinity vs werewolf
  "drake-oil": { inputs: [{ defId: "drake-hide", qty: 1 }, { defId: "fae-dust", qty: 1 }], output: { defId: "drake-oil", qty: 1 }, requires: { station: "still" } }, // affinity vs dragon — the Wyrm answer without full mithril
  "venom-oil": { inputs: [{ defId: "thistle", qty: 1 }, { defId: "fae-dust", qty: 1 }], output: { defId: "venom-oil", qty: 1 }, requires: { station: "still" } }, // poison DoT
  whetstone: { inputs: [{ defId: "flint", qty: 2 }, { defId: "iron-ore", qty: 1 }], output: { defId: "whetstone", qty: 1 }, requires: { station: "anvil", tools: ["blacksmiths-hammer"] } }, // a grindstone block — forged at the anvil
};


