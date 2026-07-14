// Combat data (465: the combat domain split out of constants.ts). Damage/armour
// matrix, monster/weapon/armour catalogs, loot tables, ranged ammo, enhancements,
// affinities. Pure data — re-exported by constants.ts, so consumers are unchanged.
import type { ItemStackSpec } from "./spec";

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
// % mitigation (si7.1, supersedes flat subtraction): incoming damage is scaled
// by MITIGATION_K/(K + D) where D = Σ(defense ÷ matrix). Armour REDUCES the
// toll (full iron plate ≈ −50%, mithril ≈ −70%) but never floors it to chip —
// the M7 F1 "plate floors the whole bestiary" collapse dies here.
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
export const MITIGATION_K = 6;
export const POTION_HEAL = 10; // default HP restored per potion use (fallback for POTION_HEAL_BY)
// Per-potion heal (2026-07-04): tiered potions restore more, gated by a T2
// material so they too sit behind the iron-pick. Absent = POTION_HEAL.
export const POTION_HEAL_BY: Record<string, number> = {
  potion: 10,
  "greater-potion": 20,
  draught: 8, // ke3.6: the herbal basic heal — a touch weaker than the town `potion`, but the ONLY potion you can brew mid-run (field-draught)
  "greater-draught": 20, // ke3.6: the alchemical-desk strong heal — matches greater-potion (a parallel home-deep path, not power creep), but the field kit can't make it
};
export const AUTO_POTION_THRESHOLD = 0.5; // fraction of base HP to auto-quaff at
// On-map item use (82r): using items outside combat "just costs energy" — about
// one plains step each. In-combat quaff stays energy-free (its cost is tempo;
// si7.1 combat balance was calibrated with it).
export const QUAFF_ENERGY = 2; // energy to drink a potion OUTSIDE an engagement
export const SURVEY_ENERGY = 5; // energy to survey a POI at range (54f): ~half a plains step — the price of studying the glass, paid to resolve one far node's detail
export const FIELD_CRAFT_ENERGY = 10; // ke3.4: flat energy to field-craft (spent before the craft, then waste-free auto-eat like gather). Half a herb gather (20) — a real "deliberate stop" cost, not free. Raise to make field crafting a heavier commitment
export const DON_DOFF_ENERGY = 2; // energy to don/doff one piece of gear on the map
export const UNARMED_DAMAGE = 1; // damage when wielding no weapon — ALSO a bow with no arrows left (D45: arrows-out = a club, never a soft-lock)

// --- Ranged combat (D45): bow + ammo, the pick-free power path ---
// Arrows are the one consumable that STACKS in the loadout: ARROW_STACK_CAP per
// inventory slot (consumableSlots counts ceil(units/cap)), so a slot of arrows
// ≈ 20 shots — a real slot cost with light bookkeeping. Every combat exchange
// while wielding a bow with ammo spends 1 arrow (front stack, FIFO).
// ⚠ balance surface: arrow supply gates bow damage — changing this requires `bun run sim:tables` if kits carry ammo (test/balance-tables.test.ts enforces)
export const ARROW_STACK_CAP = 20; // arrows per inventory slot; raise = cheaper ammo logistics, lower = tighter ammo-vs-food-vs-loot squeeze
export const ARROWS_PER_CRAFT = 10; // arrows per craft batch — "three different things to grab, so it should give you quite a lot of them" (user, 2026-07-07)
// ke3.3: the arrow-shaft recipe's outputScale multiplier — shafts per oak-log =
// ARROW_SHAFTS_PER_LOG × the fletch tool's TOOL_SPEED. At q1 (fletchers-knife) one
// log → 3 shafts → exactly one arrows-fletched batch; at q2 (steel-fletchers-knife)
// one log → 6 shafts → two batches, i.e. the better knife HALVES wood/arrow. The
// fletched path is deliberately parallel to the direct `arrows` recipe at q1 (no
// free lunch) and only pays off once you've climbed to the steel knife.
export const ARROW_SHAFTS_PER_LOG = 3; // shafts per log per unit tool quality (outputScale qtyPer)
export const AMMO: string[] = ["arrows"]; // ammo catalog (slotOf → "ammo"); packed like potions, spent per exchange

// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
export const MONSTER_TIER_HP_CURVE: Record<number, number> = {
  1: 8,
  2: 16,
  3: 28,
  4: 54, // tier-4 boss: 9 mithril-sword strikes → 8 retaliations — exactly the 3-greater-potion gate (D34 recalibrated, si7.1)
}; // monster base HP by tier
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
export const MONSTER_TIER_DMG_CURVE: Record<number, number> = {
  1: 4,
  2: 8,
  3: 14,
  4: 24, // ×K/(K+10) vs full mithril = 9/hit — lethal without the potion supply (si7.1)
}; // monster base damage by tier, scaled by % mitigation (MITIGATION_K) coming in.
   // Steepened at tier 1 (si7.1) so a bare-kit fight costs matchup-scaled real HP:
   // good ≈ 13% of base HP, neutral ≈ 27%, bad ≥ 40% — HP is a second run-budget.

// Combat consumables (bzd, spec §4.3): a "battle item" packed into the loadout
// buffs a SINGLE fight and is consumed at fight start. Gated only behind fighting
// T3 monsters (vampire→elixir, troll→warding), so a player who FOUGHT their way
// up can beat the Wyrm without the full mithril grind — at a real inventory-slot
// cost (pqp). resolveCombat sums damageAdd into dmgOut and mitigationAdd into
// mitigation. Absent defId = no buff.
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
export const COMBAT_BUFF: Record<string, { damageAdd?: number; mitigationAdd?: number }> = {
  "elixir-of-power": { damageAdd: 2 }, // from dust-vampire's vampire-ash
  "warding-draught": { mitigationAdd: 3 }, // from ice-troll's troll-hide
};

// Weapon enhancements (D60, weapon-enhancement spec §2.2) — whetstone (flat
// damage) + weapon oils (affinity/poison coating) merged into ONE charge-based
// buff state. Applied mid-run via `enhance`; consumed by YOUR strikes. Rides the
// expedition (Expedition.weaponBuff), never the weapon — no per-instance item state.
//   charges     — how many player strikes the coating survives before clearing.
//   flatDamage? — +N added to playerDamage per strike (the WHETSTONE flavour).
//   affinityTag?— a MONSTER tag; if the engaged monster carries it, damage ×AFFINITY_MULTIPLIER
//                 (the OIL flavour: silver-oil→werewolf, drake-oil→dragon). Matched-or-not,
//                 never double: a weapon already matching this tag doesn't stack it.
//   poison?     — on a coated hit set/refresh Engagement.poison to this {dmg,rounds}
//                 (the VENOM-OIL flavour): a DoT the monster suffers each round.
// Starting values are a feel-pass (tune in playtest). Enhancement defIds also live
// in ENHANCEMENT (below) so slotOf→"enhancement" and the "every output real" invariant sees them.
export const WEAPON_ENHANCEMENT: Record<string, { charges: number; flatDamage?: number; affinityTag?: string; poison?: { dmg: number; rounds: number } }> = {
  whetstone: { charges: 6, flatDamage: 2 }, // anvil-forged grindstone: +2 flat dmg for 6 strikes
  "silver-oil": { charges: 5, affinityTag: "werewolf" }, // still-brewed: ×2 vs werewolf-tagged
  "drake-oil": { charges: 5, affinityTag: "dragon" }, // still-brewed: ×2 vs dragon-tagged (the Wyrm answer without full mithril)
  "venom-oil": { charges: 5, poison: { dmg: 3, rounds: 4 } }, // still-brewed: coats a poison DoT the monster suffers each round
};
// Enhancement catalog (D60): defIds that pack as `enhancement` (1 slot/unit, no
// stacking, like a battle-item) and are recognised by slotOf. WEAPON_ENHANCEMENT keys.
export const ENHANCEMENT: string[] = ["whetstone", "silver-oil", "drake-oil", "venom-oil"];

export const AFFINITY_MULTIPLIER = 2; // hidden affinity effect, e.g. silver↔werewolf
export type Affinity = { monsterTag: string; itemTag: string };
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
export const AFFINITIES: Affinity[] = [
  { monsterTag: "werewolf", itemTag: "silver" },
  { monsterTag: "fae", itemTag: "iron" },
  { monsterTag: "vampire", itemTag: "garlic-coated" },
  { monsterTag: "dragon", itemTag: "wyrmbane" }, // wyrmfang ×2 vs the Wyrm — the first kill is brutal, then the boss becomes a farmable node (D34)
]; // discoverable damage multiplier pairings

// `category` (8ec) is the "hunt this kind for that resource" legibility layer —
// beasts → hides/meat, humanoids → maps, fae → potion dust — and keys
// CATEGORY_LOOT_TABLE. Pure classification, no combat effect; affinity pairings
// stay in `tags`.
export type MonsterCategory = "beast" | "humanoid" | "fae" | "undead" | "giant" | "dragon";
export type Monster = { tier: number; dmgType: DmgType; armourType: ArmourType; category: MonsterCategory; tags: string[] };
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
export const MONSTERS: Record<string, Monster> = {
  werewolf: { tier: 2, dmgType: "melee", armourType: "light", category: "beast", tags: ["werewolf", "beast"] },
  "fae-sprite": { tier: 1, dmgType: "magic", armourType: "robe", category: "fae", tags: ["fae"] },
  "forest-boar": { tier: 1, dmgType: "melee", armourType: "light", category: "beast", tags: ["beast"] },
  "giant-scorpion": { tier: 2, dmgType: "melee", armourType: "plate", category: "beast", tags: ["beast"] },
  "dust-vampire": { tier: 3, dmgType: "magic", armourType: "robe", category: "undead", tags: ["vampire"] },
  "sand-raider": { tier: 1, dmgType: "ranged", armourType: "light", category: "humanoid", tags: [] },
  "frost-fae": { tier: 2, dmgType: "magic", armourType: "robe", category: "fae", tags: ["fae"] },
  "snow-wolf": { tier: 1, dmgType: "melee", armourType: "light", category: "beast", tags: ["beast"] },
  "ice-troll": { tier: 3, dmgType: "melee", armourType: "plate", category: "giant", tags: ["troll"] },
  // Humanoids (8ec): one per biome so map-hunting is viable anywhere. Ordinary
  // difficulty for their tier — the category is the point, not the stats.
  "forest-bandit": { tier: 1, dmgType: "ranged", armourType: "light", category: "humanoid", tags: [] }, // ranged (si7.1): completes woodland's incoming-type spread
  "snow-marauder": { tier: 2, dmgType: "ranged", armourType: "light", category: "humanoid", tags: [] },
  // Tier-1 spread completers (si7.1): every biome's reachable band now covers
  // melee/ranged/magic incoming AND plate/light/robe hides — the matchup lesson
  // has material on day one. Ordinary stats; the TYPE is the point.
  "shell-beetle": { tier: 1, dmgType: "melee", armourType: "plate", category: "beast", tags: ["beast"] }, // woodland: the first "my sword skates off it" moment
  "mirage-wisp": { tier: 1, dmgType: "magic", armourType: "robe", category: "fae", tags: ["fae"] }, // desert: early iron-sword affinity teacher
  "ice-crab": { tier: 1, dmgType: "melee", armourType: "plate", category: "beast", tags: ["beast"] }, // tundra: plate hide before the troll
  // Tier-4 boss (D34): magic damage into a plate hide — punishes the plate
  // strategy that carried the whole game (plate weak to magic, ÷1.5). The
  // dragon tag pairs with the wyrmbane affinity so wyrmfang farms it (§4.1).
  "ancient-wyrm": { tier: 4, dmgType: "magic", armourType: "plate", category: "dragon", tags: ["dragon"] },
  // Mid-game tier 2 (m0a): two robe-hide bow-bait targets so the ranged line has mid-tier prey.
  "giant-elk": { tier: 2, dmgType: "melee", armourType: "light", category: "beast", tags: ["beast"] }, // m0a: woodland mid-tier — rich-venison source
  "dust-djinn": { tier: 2, dmgType: "magic", armourType: "robe", category: "fae", tags: ["fae"] }, // m0a: desert bow-bait (robe hide)
  "frost-hatchling": { tier: 2, dmgType: "magic", armourType: "robe", category: "beast", tags: ["dragon"] }, // m0a: tundra wyrm herald, bow-bait; dragon tag = wyrmbane affinity
}; // monster combat stats and loot triggers

export type Weapon = { dmgType: DmgType; damage: number; tags: string[] };
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
export const WEAPONS: Record<string, Weapon> = {
  // T0 (damage 2) — the stone-age entry weapon (9az/xls): a deadwood club,
  // knapped/bound by hand with NO tool. Below sword (3), above unarmed (1) —
  // a real weapon that the very first run crafts before any metal exists.
  club: { dmgType: "melee", damage: 2, tags: [] },
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
// ⚠ balance surface: changing this requires `bun run sim:tables` (test/balance-tables.test.ts enforces)
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
  "forest-bandit": [{ defId: "raider-supplies", qty: 1 }],
  "snow-marauder": [{ defId: "raider-supplies", qty: 1 }],
  "frost-fae": [{ defId: "fae-dust", qty: 2 }],
  "snow-wolf": [{ defId: "wolf-pelt", qty: 2 }],
  "ice-troll": [{ defId: "troll-hide", qty: 2 }],
  "shell-beetle": [{ defId: "beetle-shell", qty: 2 }],
  "mirage-wisp": [{ defId: "wisp-essence", qty: 2 }],
  "ice-crab": [{ defId: "crab-shell", qty: 2 }],
  // Boss (D34): wyrm-scale always → dragonscale-cuirass; dragonheart @0.2 (the
  // 1/5 rare) → wyrmfang. `chance` is rolled per-encounter in fightAt (§4.5).
  "ancient-wyrm": [{ defId: "wyrm-scale", qty: 3 }, { defId: "dragonheart", qty: 1, chance: 0.2 }],
  // Mid-game tier 2 (m0a): giant-elk drops only rich-venison (elk-antler omitted — drop-only path keeps roster clean)
  "giant-elk": [{ defId: "rich-venison", qty: 2 }],
  "dust-djinn": [{ defId: "djinn-ember", qty: 1 }],
  // frost-hatchling: hatchling-scale (armour shortcut) + map-scroll @15% (the wyrm herald's map drop)
  // map-scroll is intercepted by rollLoot/fightAt and minted as a MapItem — it never enters carry as a material.
  "frost-hatchling": [{ defId: "hatchling-scale", qty: 1 }, { defId: "map-scroll", qty: 1, chance: 0.15 }],
}; // monster fixed loot drops (entries with `chance` roll deterministically in fightAt)

// Category-level loot (8ec): rolled IN ADDITION to the monster's own LOOT_TABLE
// entries, so loot can hang off a specific monster, a whole category, or both.
// Humanoids are the map category: a regular-but-not-guaranteed map-scroll drop
// (MAP_DROP_CHANCE lever). fightAt intercepts MAP_SCROLL_ID — it never enters
// carry as a material; it mints a carried MapItem instead (spec §4).
export const MAP_SCROLL_ID = "map-scroll";
export const MAP_DROP_CHANCE = 0.5; // lever: humanoid map-drop rate (docs/balance-levers.md)
export const CATEGORY_LOOT_TABLE: Record<MonsterCategory, ItemStackSpec[]> = {
  beast: [],
  humanoid: [{ defId: MAP_SCROLL_ID, qty: 1, chance: MAP_DROP_CHANCE }],
  fae: [],
  undead: [],
  giant: [],
  dragon: [],
};
