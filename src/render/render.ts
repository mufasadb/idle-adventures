import { BIOMES, RESEARCH_INKS, RESEARCH_SEARCHES_PER_INK, LOOT_TABLE, CATEGORY_LOOT_TABLE, MAP_SCROLL_ID, WEAPONS, ARMOUR, FOOD, FOOD_ENERGY, ENERGY_PER_FOOD, POTION, POTION_HEAL, POTION_HEAL_BY, COMBAT_BUFF, TOOL_CAPABILITY, TOOL_PURPOSE, ENERGY_CAP_BONUS, BACKPACK_SLOTS, TRANSPORT_CARRY, TRANSPORT_MULTIPLIER, TERRAIN_GATE, TERRAIN_COST, PANNIERS_SLOTS, INKS, AFFIX_EFFECTS, MATERIAL_GATE, TENT_FOOD_MULTIPLIER, RECIPE, NODE_TOOL, NODE_SECONDARY_TOOL, WEAPON_ENHANCEMENT, AFFINITY_MULTIPLIER, MONSTERS, MONSTER_TIER_HP_CURVE, QUAFF_ENERGY, DON_DOFF_ENERGY, FLASK_EFFECT, ANTIDOTE, MAP_HINTS, DMG_ARMOUR_MATRIX, TERRAIN_HP_WARD } from "../data/constants";
import type { Terrain, NodeType, DmgType, ArmourType, GatherableNodeType, FishWater, HintMetric } from "../data/constants";
import type { PoiDetail } from "../engine/perceive";
import type { Matchup } from "../engine/combat";
import { playerDamage, damageTaken, strikeExchange, wieldsRanged, hasAmmo, loadedAmmoIndex, rollLoot } from "../engine/combat";
import { consumeOne, addToCarry, freeLootStacks, carryCap, slotCap, quiverAmmoSlots } from "../engine/carry";
import { CONSUMABLE_KINDS, CONSUMABLE_KEYS } from "../engine/catalog";
import { moveCost } from "../engine/move";
import { ARMOUR_SLOTS } from "../engine/pack";
import type { Action, Equipment, Expedition, Loadout, MapItem, RejectionReason, GameEvent, ItemStack, LoadoutSlot } from "../engine/types";
import { mapEpithet } from "../engine/town";
import { hintLabel } from "../engine/hints";

// --- Shared presentation selectors (eho): pure defId→text + data-shaped derivations
// that BOTH surfaces (the web UI and the blind-playtest console) format, so their
// text can't drift. Web-only HTML builders stay in src/web/.

// Display names for defIds whose title-cased id reads wrong ("leather" alone →
// which leather?). Everything else title-cases its kebab defId — e.g.
// "small-backpack" → "Small Backpack" (m3o renamed it from the ambiguous "starter").
const DISPLAY_NAMES: Record<string, string> = { leather: "Leather Backpack", "large-pack": "Large Pack" };
export function name(defId: string): string {
  if (DISPLAY_NAMES[defId]) return DISPLAY_NAMES[defId]!;
  return defId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// A rejected action's cause → one human sentence (gate-legibility, playtest 2026-07-09).
// recipeId lets a craft rejection name the exact missing station/tool/terrain.
// `action` tailors copy that differs by verb (a full bag blocks a fight's loot slot
// vs a gather's yield).
export function rejectCopy(reason: RejectionReason, recipeId?: string, action?: Action["type"]): string {
  const gate = recipeId ? recipeGateHint(recipeId) : null; // "needs anvil + blacksmiths-hammer"
  switch (reason) {
    case "impassable": return "blocked by terrain";
    case "carry-full": return action === "fight" || action === "throw" ? "bag full — a fight needs a free bag slot for each kind of loot the monster drops" : "bag full — no free slot for that";
    case "exhausted": return "out of energy";
    case "engaged": return "you're engaged — fight or flee below";
    // d13: the packing screen's refusals (tap a bank chip that won't go in)
    case "no-slot": return "bag full — every slot is taken (unpack something, or wear a bigger pack)";
    case "already-packed": return "already packed — one of each tool is all you need";
    case "insufficient": if (action === "pack") return "none left in the bank"; return "nothing to use for that (or it'd have no effect)"; // no potion/material/charge, or already at full HP/max
    case "no-monster": return action === "throw" ? "no monster on or next to you to throw at" : "nothing to fight here";
    case "not-poisoned": return "you're not poisoned — save the antidote";
    case "missing-station": return gate ? `can't craft — ${gate} (build the station first)` : "needs a station you haven't built";
    case "missing-tool": return gate ? `can't craft — ${gate}` : action === "fish" ? "needs a fishing-rod" : "needs a tool you don't have";
    case "no-water": return "no water on or beside you to fish";
    case "fully-read": return "you've read everything this map has to tell";
    case "fished-out": return "you've fished all the water within reach — move along the bank (or out on a raft)";
    case "tool-too-weak": return "your tool is too weak for this material's tier";
    case "recipe-unknown": return "you don't know that recipe yet — hold all its ingredients, or ask at the research table in town";
    case "no-research": return `no searches left — come back from a trip for a free one, or spend an ink (${RESEARCH_INKS.join(" / ")}) for ${RESEARCH_SEARCHES_PER_INK} more`;
    case "not-field-craftable": return "that recipe is town-only — it can't be made in the field";
    case "not-near-terrain": {
      const terr = recipeId ? recipeTerrainGate(recipeId) : null;
      return terr ? `must stand on (or next to) ${terr} to make this` : "you're not on the terrain this needs";
    }
    default: return reason;
  }
}

// Per-node-kind gather vocabulary (shared with the map action buttons in main.ts):
// past tense feeds the `gathered` log line, label/noun the UI.
export const GATHER_VERB: Record<string, { label: string; past: string; noun: string }> = {
  mining: { label: "⛏ Mine", past: "mined", noun: "ore vein" },
  wood: { label: "🪓 Chop", past: "chopped", noun: "stand of trees" },
  herb: { label: "🌿 Forage", past: "foraged", noun: "forage patch" },
  animal: { label: "🔪 Hunt", past: "hunted", noun: "animal" },
};

// Fishing log vocabulary (si7.6.2), shared by both surfaces.
export const FISH_WATER_WORDS: Record<FishWater, string> = {
  river: "river", shallows: "shallows", lake: "lake edge", "deep-lake": "deep lake", sea: "sea", "deep-sea": "open sea",
};
function catchWords(caught: string, contents: ItemStack[], name: (defId: string) => string): string {
  if (caught === "sunken-lockbox") {
    return `hauled up a sunken lockbox: ${contents.map((c) => `${c.qty}× ${name(c.defId)}`).join(", ") || "empty, rusted through"}`;
  }
  if (caught === "sodden-map") return "something papery snagged the line";
  return `caught 1× ${name(caught)}`;
}

// One-decimal display rounding for log numbers (matches the web's historical style).
export const round1 = (n: number) => Math.round(n * 10) / 10;

// The energy unit in event lines: "e" on the console (its lines are parsed — never
// reshape them), ⚡ on the web (user 2026-10-10). The web calls setEnergyUnit at boot.
let EN = "e";
export function setEnergyUnit(unit: string): void { EN = unit; }
export const energyUnit = (): string => EN;

// THE GameEvent → text formatter (exm): one exhaustive switch, shared by the web and
// the headless playtest console. The `name` fn is the surface's only vocabulary knob —
// the web passes display `name()`, the console passes identity (raw defIds, the
// blind-playtest vocabulary). The closed GameEvent union keeps this exhaustive: adding
// a variant without a case here is a typecheck error (delete no case). run-ended keeps
// a `\n` break; an HTML surface converts it to <br> at render.
export function formatEvent(e: GameEvent, name: (defId: string) => string): string {
  switch (e.type) {
    case "embarked": return `▶ embarked on a ${e.biomeId} map — ${e.energy} energy`;
    case "moved": return `walked to (${e.to.x},${e.to.y}) on ${e.terrain} · −${round1(e.cost)}${EN} → ${round1(e.energy)}${EN}${e.hazardTaken ? ` · 🍄 spores −${round1(e.hazardTaken)}hp` : ""}${e.poisonTaken ? ` · ☠ poison −${round1(e.poisonTaken)}hp` : ""}${e.hp !== undefined ? ` → ${round1(e.hp)}hp` : ""}`;
    case "gathered": return `${GATHER_VERB[e.kind]?.past ?? "gathered"} ${e.qty}× ${name(e.material)} · −${round1(e.cost)}${EN} → ${round1(e.energy)}${EN}`;
    case "fished": return `🎣 fished the ${FISH_WATER_WORDS[e.water]} — ${catchWords(e.catch, e.contents, name)} · −${round1(e.cost)}${EN} → ${round1(e.energy)}${EN}`;
    case "dropped": return `dropped ${e.qty}× ${name(e.defId)}`;
    case "ate": return `${e.campMeal ? "🏕 camp meal — ate" : "🍖 ate"} ${name(e.defId)} · +${round1(e.restored)}${EN} → ${round1(e.energy)}${EN}${e.campMeal ? " (over max — banked reach)" : ""}`;
    case "auto-eat-set": return e.defId ? `🍴 auto-eat: ${name(e.defId)}` : `🍴 auto-eat off`;
    case "fought": {
      const lessons = matchupLessons(e.matchup);
      const tail = lessons.length ? ` · ${lessons.join(" · ")}` : "";
      const ff = e.rounds ? ` ⏩ (${e.rounds} rounds)` : ""; // 67e: auto-finish collapsed the fight
      return (e.victory
        ? `⚔ beat the ${name(e.creature)}${ff} · −${round1(e.hpLost)}hp${e.potionsUsed ? ` (${e.potionsUsed} potion${e.potionsUsed > 1 ? "s" : ""})` : ""} · loot ${e.loot.map((l) => `${l.qty}× ${name(l.defId)}`).join(", ") || "none"}`
        : `☠ the ${name(e.creature)} downed you${ff} · run ends, haul kept`) + tail;
    }
    case "crafted": return `✦ ${e.where === "field" ? "field-crafted 🔥 " : "crafted "}${e.output.qty}× ${name(e.output.defId)}`;
    case "map-dropped": return e.source === "fished"
      ? (e.carried ? `🗺️ fished up a sodden T${e.tier} ${name(e.biomeId)} map — it dries out on the way home` : `🗺️ a sodden T${e.tier} ${name(e.biomeId)} map — no room for more maps, it sinks back`)
      : e.carried
      ? `🗺️ looted a T${e.tier} ${name(e.biomeId)} map (takes 1 slot — banks home with you)`
      : `🗺️ a T${e.tier} ${name(e.biomeId)} map dropped — pack full, left behind`;
    case "map-discarded": return `🗺️ discarded a carried map`;
    case "packed": return `packed ${name(e.defId)} → ${e.slot}`;
    case "research-hit": return `📖 research: someone in town knows how to make ${name(RECIPE[e.recipeId]?.output.defId ?? e.recipeId)} — ${e.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ")} (recipe ${e.recipeId})${e.free ? " · free search spent" : ` · ${e.charges} search${e.charges === 1 ? "" : "es"} left`}`;
    case "research-miss": return `${e.alreadyKnown ? `📖 research: "${e.query}" — you already know everything the town can tell you about that` : `📖 research: "${e.query}" — Nobody in town has heard of that.`}${e.free ? " · free search spent" : ` · ${e.charges} search${e.charges === 1 ? "" : "es"} left`}`;
    case "research-bought": return `🖋 spent 1× ${name(e.inkId)} at the research table · ${e.charges} search${e.charges === 1 ? "" : "es"} banked`;
    case "run-ended": return e.flavor ? `${e.flavor}\n— run ended (${e.reason}) —` : `— run ended (${e.reason}) —`;
    case "action-rejected": return `✗ ${e.action} — ${rejectCopy(e.reason, undefined, e.action)}`;
    case "engaged": return e.ranged
      ? `🏹 engaged the ${name(e.creature)} from a tile away — your opener lands before it can answer`
      : `⚔ engaged the ${name(e.creature)}`;
    case "exchanged": return `${e.thrown ? `💥 threw a ${name(e.thrown)} at the ${name(e.creature)}${e.dmgTaken === 0 && e.monsterHp > 0 ? " (it can't answer yet)" : ""} —` : `⚔ traded blows with the ${name(e.creature)} —`} dealt ${round1(e.dmgDealt)}, took ${round1(e.dmgTaken)} · ${round1(e.hp)}hp left${e.arrowSpent ? (e.ammoSpent ? ` · 🎯 −1 ${name(e.ammoSpent)}` : " · 🏹 −1 arrow") : ""}${e.poisonDmg ? ` · ☠ poison ${round1(e.poisonDmg)}` : ""}${e.poisonTaken ? ` · ☠ your poison −${round1(e.poisonTaken)}hp` : ""}${e.envenomed ? " · ☠ its bite POISONED you (antidote cures)" : ""}`;
    case "fled": return `🏃 fled the ${name(e.creature)} · −${round1(e.partingHit)}hp → ${round1(e.hp)}hp`;
    case "quaffed": return `🧪 quaffed ${name(e.defId)} · +${round1(e.healed)}hp → ${round1(e.hp)}hp${e.energy !== undefined ? ` · −${QUAFF_ENERGY}${EN} → ${round1(e.energy)}${EN}` : ""}`;
    case "item-used": if (e.cured) return `🧪 drank the ${name(e.defId)} — the poison is gone`;
      return `⚗ used ${name(e.defId)} this fight${e.damageAdd ? ` · +${round1(e.damageAdd)} dmg` : ""}${e.mitigationAdd ? ` · +${round1(e.mitigationAdd)} mitigation` : ""}`;
    case "enhanced": return `🗡️ coated your weapon with ${name(e.id)} · ${e.charges} charge${e.charges === 1 ? "" : "s"}`;
    case "surveyed": return `🔭 surveyed the ${e.kind} at (${e.at.x},${e.at.y}) — its detail is now in focus`;
    case "map-studied": return `📜 you study the map: "${hintLabel(e.hint)}"${e.remaining ? ` (${e.remaining} more to read)` : " (fully read)"}`;
    case "inked": { const mat = affixMaterialHint(e.affix); return `🖋 inked — this map now favours ${mat ? name(mat) : "its domain"} (of ${AFFIX_EFFECTS[e.affix]?.label ?? e.affix})`; }
    case "auto-quaff-toggled": return `auto-quaff ${e.on ? "on" : "off"}`;
    case "auto-finish-toggled": return `auto-finish fights ${e.on ? "on" : "off"}`;
    case "auto-gather-toggled": return `auto-gather ${e.on ? "on" : "off"}`;
    case "provoked": return `⚔ the ${name(e.creature)} strikes while you act · −${round1(e.hit)}hp → ${round1(e.hp)}hp`;
    case "donned": return `🧤 donned ${name(e.defId)}${e.displaced ? ` (stowed ${name(e.displaced)})` : ""} · −${DON_DOFF_ENERGY}${EN} → ${round1(e.energy)}${EN}`;
    case "doffed": return `🎒 doffed ${name(e.defId)} to the bag · −${DON_DOFF_ENERGY}${EN} → ${round1(e.energy)}${EN}`;
  }
}

// Fight forecast as DATA (eho): the "can I win the race?" numbers behind the web's
// verdict colour (D103 — the web no longer prints them) and the console ENGAGED line. dmgOut/dmgIn are per-strike; toKill/toDie are the round counts; the
// player wins iff they land the kill no later than they'd fall. Formatting is the
// surface's job. weaponBuff reflects an active coating (D60).
export function combatForecast(
  loadout: Loadout,
  creature: string,
  hp: number,
  weaponBuff?: { id: string },
  mapTier = 1, // D102: humanoid camps hit harder on deeper maps
): { dmgOut: number; dmgIn: number; toKill: number; toDie: number; winning: boolean } {
  const dmgOut = playerDamage(loadout, creature, weaponBuff);
  const dmgIn = damageTaken(loadout, creature, 0, mapTier);
  const toKill = Math.ceil(MONSTER_TIER_HP_CURVE[MONSTERS[creature]!.tier]! / dmgOut);
  const toDie = Math.ceil(hp / dmgIn);
  return { dmgOut, dmgIn, toKill, toDie, winning: toKill <= toDie };
}

// The same race mid-fight (67e): the live monster HP, this fight's battle-item
// adds and any active coating. Shared by the web's engagementVerdict and the console
// ENGAGED header.
export function engagementForecast(exp: Expedition): { dmgOut: number; dmgIn: number; toKill: number; toDie: number; winning: boolean } {
  const c = exp.combat!;
  const dmgOut = playerDamage(exp.loadout, c.creature, exp.weaponBuff) + c.damageAdd;
  const dmgIn = damageTaken(exp.loadout, c.creature, c.mitigationAdd, exp.mapTier ?? 1);
  const toKill = Math.ceil(c.monsterHp / dmgOut);
  const toDie = Math.ceil(exp.hp / dmgIn); // raw race — potions extend it
  return { dmgOut, dmgIn, toKill, toDie, winning: toKill <= toDie };
}

// --- Fight verdict (eor, D103): the web shows ONE traffic-light verdict instead of
// round counts. Derived from the forecasts above + the engine's own round function
// (strikeExchange, auto-quaff semantics) — no new combat math here.
//   win    — the bare race (combatForecast/engagementForecast `winning`) already wins
//   costly — the bare race loses, but carried potions (auto-quaffed at the threshold)
//            turn it into a win
//   lose   — even every carried potion can't save it
export type FightVerdict = "win" | "costly" | "lose";
export const VERDICT_LABEL: Record<FightVerdict, string> = { win: "Clean win", costly: "Costly win", lose: "You'd lose" };

type RaceStart = {
  loadout: Loadout; hp: number; monsterHp: number; creature: string;
  damageAdd?: number; mitigationAdd?: number; weaponBuff?: { id: string; charges: number };
  poison?: { dmg: number; rounds: number }; playerPoison?: { dmg: number; ticks: number };
  opener?: boolean; mapTier?: number;
};
// Plays the fight out with strikeExchange round by round (auto-quaff ON, ammo spent per
// shot like fightRound) — the same loop resolveCombat runs, but from a mid-fight start.
// Venom is a per-round roll the forecast can't know, so it's left out.
function potionRace(r: RaceStart): { victory: boolean; potionsUsed: number } {
  let { loadout, hp, monsterHp, weaponBuff, poison, playerPoison } = r;
  let opener = r.opener ?? false;
  let potionsUsed = 0;
  for (let i = 0; i < 500; i++) {
    const shoots = wieldsRanged(loadout) && hasAmmo(loadout);
    const round = strikeExchange(loadout, hp, monsterHp, r.creature, {
      damageAdd: r.damageAdd ?? 0, mitigationAdd: r.mitigationAdd ?? 0, autoQuaff: true,
      skipRetaliation: opener, weaponBuff, poison, ...(playerPoison ? { playerPoison } : {}), mapTier: r.mapTier ?? 1,
    });
    potionsUsed += round.potionsUsed;
    if (round.victory || round.defeated) return { victory: round.victory, potionsUsed };
    loadout = { ...loadout, potions: round.potionsAfter, ...(shoots ? { ammo: consumeOne(loadout.ammo ?? [], loadedAmmoIndex(loadout)) } : {}) };
    hp = round.hp; monsterHp = round.monsterHp; weaponBuff = round.weaponBuffAfter; poison = round.poisonAfter;
    playerPoison = round.playerPoisonAfter; opener = false;
  }
  return { victory: false, potionsUsed };
}
// The classification itself: the bare race first, then the potion-aware play-out.
// A play-out that wins without drinking anything (a coating's poison finishing it)
// still counts as a clean win.
export function fightVerdict(bareWinning: boolean, withPotions: { victory: boolean; potionsUsed: number } | null): FightVerdict {
  if (bareWinning) return "win";
  if (!withPotions?.victory) return "lose";
  return withPotions.potionsUsed > 0 ? "costly" : "win";
}
// Before the fight (route end / standing on it): full monster HP, no battle items yet.
export function preFightVerdict(loadout: Loadout, creature: string, hp: number, weaponBuff?: { id: string; charges: number }, mapTier = 1, playerPoison?: { dmg: number; ticks: number }): FightVerdict {
  const bare = combatForecast(loadout, creature, hp, weaponBuff, mapTier).winning;
  return fightVerdict(bare, bare || !loadout.potions.length ? null : potionRace({
    loadout, hp, monsterHp: MONSTER_TIER_HP_CURVE[MONSTERS[creature]!.tier]!, creature, weaponBuff, mapTier, ...(playerPoison ? { playerPoison } : {}),
  }));
}
// Mid-fight: the live engagement (its HP, battle-item adds, poison, opener).
export function engagementVerdict(exp: Expedition): FightVerdict {
  const c = exp.combat!;
  const bare = engagementForecast(exp).winning;
  return fightVerdict(bare, bare || !exp.loadout.potions.length ? null : potionRace({
    loadout: exp.loadout, hp: exp.hp, monsterHp: c.monsterHp, creature: c.creature,
    damageAdd: c.damageAdd, mitigationAdd: c.mitigationAdd, weaponBuff: exp.weaponBuff, poison: c.poison,
    ...(exp.poisoned ? { playerPoison: exp.poisoned } : {}), opener: c.opener ?? false, mapTier: exp.mapTier ?? 1,
  }));
}

// eor: each side's attack + armour TYPE (the visible matrix), in place of the numbers.
export const DMG_TYPE_ICON: Record<DmgType, string> = { melee: "⚔", ranged: "🏹", magic: "✨" };
export const ARMOUR_TYPE_ICON: Record<ArmourType, string> = { plate: "🛡", light: "🧥", robe: "👘" };
// What your strike deals: the wielded weapon's type; bare hands — or a bow with an
// empty quiver (D45, swung as a club) — hit as melee.
export function playerAttackType(loadout: Loadout): DmgType {
  const w = loadout.equipment.weapon;
  if (w === null || !WEAPONS[w]) return "melee";
  if (wieldsRanged(loadout) && !hasAmmo(loadout)) return "melee";
  return WEAPONS[w]!.dmgType;
}
// The armour classes you're wearing, most pieces first (ties in plate/light/robe order).
export function armourTypesWorn(equipment: Equipment): ArmourType[] {
  const n: Record<ArmourType, number> = { plate: 0, light: 0, robe: 0 };
  for (const slot of ARMOUR_SLOTS) {
    const id = equipment[slot];
    const a = id ? ARMOUR[id] : undefined;
    if (a) n[a.armourType] += 1;
  }
  return (["plate", "light", "robe"] as ArmourType[]).filter((t) => n[t] > 0).sort((a, b) => n[b] - n[a]);
}

// eor: what a monster drops — `sure` always drops, `maybe` are chance drops (shown as
// "?" so the fight panel never spoils a rare roll). Read off the loot tables.
export function lootPreview(creature: string): { sure: ItemStack[]; maybe: string[] } {
  const entries = [...(LOOT_TABLE[creature] ?? []), ...(CATEGORY_LOOT_TABLE[MONSTERS[creature]?.category ?? "beast"] ?? [])];
  return {
    sure: entries.filter((e) => e.chance === undefined).map((e) => ({ defId: e.defId, qty: e.qty })),
    maybe: entries.filter((e) => e.chance !== undefined).map((e) => e.defId),
  };
}
// eor: the bag check engage() runs (pendingLootFits), as counts for the warning:
// `need` = new bag stacks the loot would open, `free` = stacks still open.
export function lootSlots(seed: string, creature: string, at: { x: number; y: number }, loadout: Loadout, carry: ItemStack[]): { need: number; free: number } {
  let c: ItemStack[] = carry;
  for (const s of rollLoot(seed, creature, at).filter((s) => s.defId !== MAP_SCROLL_ID)) c = addToCarry(c, s.defId, s.qty, Infinity)!;
  return { need: c.length - carry.length, free: Math.max(0, freeLootStacks(loadout) - carry.length) };
}

// --- Tile names, yields and route-terrain copy (ai8 / qba / 5k4) ---------------------
const TERRAIN_PLURAL: Record<Terrain, string> = {
  river: "river", mud: "mud", plains: "plains", ice: "ice", mountain: "mountains", shallows: "shallows",
  lake: "lake", sea: "sea", "spore-thicket": "spore-thickets",
};
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// "a raft", "an axe", "waders" (a pair-noun takes no article).
function gearPhrase(defId: string): string {
  const n = name(defId).toLowerCase();
  return /s$/.test(n) ? n : `${/^[aeiou]/.test(n) ? "an" : "a"} ${n}`;
}
const orList = (xs: string[]) => xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;

// The gear that changes a terrain: `opens` = tools that make an impassable terrain
// crossable (TERRAIN_GATE enable), `speeds` = tools that discount it + transports that
// move faster on it (TRANSPORT_MULTIPLIER > 1). Data order; read from the levers.
export function terrainGear(terrain: Terrain): { opens: string[]; speeds: string[] } {
  const gate = TERRAIN_GATE[terrain] ?? {};
  const opens = Object.keys(gate).filter((t) => gate[t]!.enable !== undefined);
  const speeds = [
    ...Object.keys(gate).filter((t) => (gate[t]!.discount ?? 0) > 0),
    ...Object.keys(TRANSPORT_MULTIPLIER).filter((t) => (TRANSPORT_MULTIPLIER[t]![terrain] ?? 1) > 1),
  ];
  return { opens, speeds };
}

// 5k4: a route that crosses terrain dearer than a plains step (with the gear you have)
// says it'll be slower, naming the terrain and — loosely — gear that would help.
// `terrains` = the walkable tiles' terrain in walk order. Null = nothing slow.
const SLOW_HINT_MAX = 3; // how many gear names the hint lists (presentation only)
export function slowRouteNote(terrains: Terrain[], equipment: Pick<Equipment, "transport" | "tools">): string | null {
  const counts = new Map<Terrain, number>();
  for (const t of terrains) {
    const step = moveCostOf(t, equipment);
    if (Number.isFinite(step) && step > TERRAIN_COST.plains) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (!counts.size) return null;
  const slow = [...counts].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  const held = new Set([...equipment.tools, ...(equipment.transport ? [equipment.transport] : [])]);
  const gear = [...new Set(slow.flatMap((t) => terrainGear(t).speeds))].filter((g) => !held.has(g)).slice(0, SLOW_HINT_MAX);
  const where = orList(slow.map((t) => TERRAIN_PLURAL[t])).replace(/ or /, " and ");
  return `slower going through the ${where}${gear.length ? ` — ${orList(gear.map(gearPhrase))} would speed it up` : ""}`;
}
// 5k4: a leg that hits a wall names the wall — and, if some gear crosses it, which.
export function blockedRouteNote(terrain: Terrain): string {
  const plural = TERRAIN_PLURAL[terrain];
  const verb = plural.endsWith("s") ? "block" : "blocks";
  const { opens } = terrainGear(terrain);
  return `the ${plural} ${verb} this path${opens.length ? ` — only ${orList(opens.map(gearPhrase))} gets you across` : ""}`;
}
// Orthogonal step cost with the given gear (the move engine's own function).
function moveCostOf(t: Terrain, eq: Pick<Equipment, "transport" | "tools">): number {
  return moveCost(t, eq.transport, eq.tools);
}

type TilePoi = { kind: NodeType; creature: string | null } | null;
// qba: the name a tapped tile reads as — a monster's name, a node's yield (once
// perceived), or the terrain. Honest to sight: an unresolved node names only its kind.
export function tileName(terrain: Terrain, poi: TilePoi, detail: PoiDetail | null, cleared: boolean): string {
  if (poi && !cleared) {
    if (poi.kind === "monster") return poi.creature ? name(poi.creature) : "a monster";
    const noun = capFirst(GATHER_VERB[poi.kind]?.noun ?? kindLabel(poi.kind));
    return detail?.material ? `${noun} · ${name(detail.material)}` : noun;
  }
  return `${capFirst(terrain)}${cleared ? (poi?.kind === "monster" ? " · cleared" : " · worked out") : ""}`;
}
// ai8: what a tile GIVES, for the collapsed drawer line — "Ore vein → Copper Ore
// (needs pick)". Tool needs from nodeToolShort; an access gate from the perceived
// detail (nodeGateNote's source). Null for a monster/empty tile (the caller shows those).
export function tileYield(poi: TilePoi, detail: PoiDetail | null, cleared: boolean, tools: string[]): string | null {
  if (!poi || cleared || poi.kind === "monster") return null;
  const noun = capFirst(GATHER_VERB[poi.kind]?.noun ?? kindLabel(poi.kind));
  if (!detail?.material) return `${noun} → ?`;
  const need = nodeToolShort(poi.kind as GatherableNodeType, tools)
    ?? (detail.gatedBy?.length && !detail.gatedBy.some((t) => tools.includes(t)) ? `needs ${detail.gatedBy.join(" or ")}` : null);
  return `${noun} → ${name(detail.material)}${need ? ` (${need})` : ""}`;
}

// --- Perception flavor (9u9.2): turn structured facts into vague, learn-the-
// vocabulary text. NEVER numbers or the fight outcome. New monsters get flavor
// for free (generated from facts); per-creature overrides can land later.
const DMG_FLAVOR: Record<DmgType, string> = {
  melee: "it shifts its weight to strike",
  ranged: "it keeps its distance, wary",
  magic: "an odd sheen ripples off its skin",
};
const HIDE_FLAVOR: Record<ArmourType, string> = {
  plate: "a thick, scaled hide",
  light: "a lean, quick frame",
  robe: "a soft, unarmoured shape",
};
// Monster size flavor keyed by tier (e96: was a positional array whose index-0 ""
// was a landmine — a defined empty string that `?? "a"` never replaced, so a tier-0
// creature rendered as " creature". A tier→flavor map has no hole; any tier outside
// 1-4 falls through to the "a" default.)
const SIZE_FLAVOR: Record<number, string> = { 1: "a small", 2: "a fair-sized", 3: "a large", 4: "a towering" };

// Weapon-class mechanical hint (57l, playtest v3): ONE clause saying what a
// weapon class DOES — all three blind agents abandoned the bow line because
// its payoff was invisible while melee's numbers print in every fight log.
// Qualitative matrix character + the ranged verb; never numbers. Data-driven
// off WEAPONS.dmgType so future weapons get a hint for free.
const WEAPON_CLASS_HINT: Record<DmgType, string> = {
  melee: "melee — hand-to-hand; strongest against soft, unarmoured hides",
  ranged: "ranged — strike FIRST from a tile away (needs arrows; empty quiver = a club); flies true against soft hides, blunted by plate",
  magic: "magic — burns through plate and scale, fizzles against soft robes",
};
export function weaponHint(defId: string): string | null {
  const w = WEAPONS[defId];
  return w ? WEAPON_CLASS_HINT[w.dmgType] : null;
}

// Item-constant tooltip (vb8): a one-line, DATA-DRIVEN description of what an
// item does, for the web `title=` on every item chip. Numbers ARE allowed here
// (the game is a deterministic math puzzle; hiding constants only pushes the
// math into notebook reverse-engineering — playtest v3 §5, web precedent: fight
// forecasts already print numbers). Inks stay VAGUE though — the cxq legibility
// rule keeps the material spoiler in the affix NAME, not the recipe/tooltip.
// Console does NOT use this (blind-playtest discovery pressure stays).
// wzk (early-game legibility): the range-extenders read as inert names in blind
// play — a transport looked like pure carry, terrain gear like jargon. These two
// helpers state the MOVEMENT benefit, reading the movement levers (never hardcoded
// numbers) so new gear/terrain gets legible for free.
function terrainGearNote(defId: string): string | null {
  const notes: string[] = [];
  for (const terrain of Object.keys(TERRAIN_GATE) as Terrain[]) {
    const g = TERRAIN_GATE[terrain]?.[defId];
    if (!g) continue;
    if (g.enable !== undefined) notes.push(`crosses ${terrain} (∞→${g.enable})`);
    else if (g.discount !== undefined) notes.push(`${terrain} ${TERRAIN_COST[terrain]}→${TERRAIN_COST[terrain] - g.discount}`);
  }
  return notes.length ? notes.join(", ") : null;
}
function transportSpeedNote(defId: string): string | null {
  const mult = TRANSPORT_MULTIPLIER[defId];
  if (!mult) return null;
  const faster = (Object.entries(mult) as [Terrain, number][]).filter(([, m]) => m > 1).map(([t, m]) => `×${m} on ${t}`);
  return faster.length ? `${faster.join(", ")} speed` : null;
}

// Concise range/logistics benefit for the craft book (wzk): blind players never
// hovered the describe() tooltip, so the range-extenders' payoff was invisible at
// craft time. Returns a short inline label for movement/carry/food gear, or null
// for items whose value is already obvious (weapons carry weaponHint; raw mats).
export function logisticsEffect(defId: string): string | null {
  if (ENERGY_CAP_BONUS[defId]) return `+${ENERGY_CAP_BONUS[defId]} max energy`;
  if (defId === "tent") return `food +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}%`;
  const terr = terrainGearNote(defId);
  if (terr) return terr;
  if (defId in TRANSPORT_CARRY) {
    const speed = transportSpeedNote(defId);
    return speed ? `${speed}, +${TRANSPORT_CARRY[defId]} carry` : `+${TRANSPORT_CARRY[defId]} carry`;
  }
  if (defId in BACKPACK_SLOTS) return `${BACKPACK_SLOTS[defId]} carry slots`;
  return null;
}

// 7ao: the combat effect of a weapon enhancement (whetstone / oils), read from
// WEAPON_ENHANCEMENT (no magic numbers — the ×N is AFFINITY_MULTIPLIER). D60 shipped
// these buildable but with zero in-game hint of what they do. Returns null for
// non-enhancement defIds. "hits" = charges (one strike each).
export function enhancementHint(defId: string): string | null {
  const e = WEAPON_ENHANCEMENT[defId];
  if (!e) return null;
  const parts: string[] = [];
  if (e.flatDamage) parts.push(`+${e.flatDamage} damage per strike`);
  if (e.affinityTag) parts.push(`×${AFFINITY_MULTIPLIER} damage vs ${e.affinityTag}`);
  if (e.poison) parts.push(`poison ${e.poison.dmg}/round for ${e.poison.rounds} rounds`);
  return `${parts.join(", ")} · ${e.charges} hits`;
}

// A battle item's one-fight effect ("+2 dmg, +1 mitigation"), or null.
export function battleItemEffect(defId: string): string | null {
  const b = COMBAT_BUFF[defId];
  if (!b) return null;
  return [b.damageAdd ? `+${b.damageAdd} dmg` : "", b.mitigationAdd ? `+${b.mitigationAdd} mitigation` : ""].filter(Boolean).join(", ");
}

// A held map's title parts: cxq affix labels (explicit, player-inked) take
// precedence over the q2k emergent epithet — the affix IS the notability signal.
// `label` is what follows "of" (null = plain map); `favours` names the material
// defIds an inked map favours (egd), empty for an un-inked map.
export function heldMapTitle(m: MapItem): { label: string | null; favours: string[] } {
  const affixes = m.affixes ?? [];
  if (affixes.length) {
    return {
      label: affixes.map((a) => AFFIX_EFFECTS[a]?.label ?? a).join(", "),
      favours: affixes.map(affixMaterialHint).filter((x): x is string => x !== null),
    };
  }
  return { label: mapEpithet(m.mapSeed, m.biomeId, m.tier ?? 1), favours: [] };
}

// The town recipe book's rows, in catalog order: field-only recipes never show in
// town (ke3.4 — they surface in the field-craft list) and an already-built station
// has no rebuild row (ke3.2).
export function townRecipeIds(stations: readonly string[]): string[] {
  const built = new Set(stations);
  return Object.keys(RECIPE).filter((id) => {
    const r = RECIPE[id]!;
    return !r.field && !(r.buildsStation && built.has(r.buildsStation));
  });
}

// Playtest 2026-09-30: field-only recipes (antidote, field-draught, cooked meals, the
// water-vial) were invisible from town — a blind player was told "an antidote cures it"
// with no way to learn the recipe. Town books list them in their own section: what it
// makes, from what, and what the field needs (kit tools, terrain).
export function fieldRecipeIds(): string[] {
  return Object.keys(RECIPE).filter((id) => RECIPE[id]!.field);
}
export function fieldRecipeNote(recipeId: string): string {
  const req = RECIPE[recipeId]?.requires;
  const parts: string[] = [];
  if (req?.tools?.length) parts.push(`carry ${req.tools.join(" + ")}`);
  if (req?.terrain) parts.push(`stand on or next to ${req.terrain}`);
  return `made on an expedition${parts.length ? ` — ${parts.join(", ")}` : ""}`;
}

// egd: the material an affix favours, for the ink confirmation. Material-specific
// (user call): the ink names the boosted material AND keeps the affix label, so
// applying it both pays off and teaches the "of gleaming = mithril" vocabulary.
// Returns the highest-weighted material defId, or null (unknown / material-less).
export function affixMaterialHint(affix: string): string | null {
  const mul = AFFIX_EFFECTS[affix]?.materialWeightMul;
  if (!mul) return null;
  const top = Object.entries(mul).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : null;
}

export function describe(defId: string): string {
  const w = WEAPONS[defId];
  if (w) return `weapon · ${w.damage} ${w.dmgType} dmg — ${WEAPON_CLASS_HINT[w.dmgType]}`;
  const a = ARMOUR[defId];
  if (a) return `${a.slot} armour · ${a.defense} defense · ${a.armourType}`;
  if (FOOD.includes(defId)) return `food · restores ${FOOD_ENERGY[defId] ?? ENERGY_PER_FOOD} energy per unit`;
  if (POTION.includes(defId)) return `potion · heals ${POTION_HEAL_BY[defId] ?? POTION_HEAL} HP`;
  if (FLASK_EFFECT[defId]) { const f = FLASK_EFFECT[defId]!; return `flask · thrown for ${f.dmg} damage that ignores armour${f.poison ? `, then ${f.poison.dmg} poison a round for ${f.poison.rounds} rounds` : ""} — a fight's first strike, if thrown, is free`; }
  if (ANTIDOTE.includes(defId)) return "battle item · cures your poison — on the map or mid-fight, without costing a turn";
  const buff = battleItemEffect(defId);
  if (buff) return `battle item · ${buff} for one fight`;
  if (ENERGY_CAP_BONUS[defId]) return `gear · +${ENERGY_CAP_BONUS[defId]} max energy`;
  // wzk: terrain gear before the generic tool branch — raft/waders/ice-cleats/
  // climbing-pick are TOOL_CAPABILITY entries, but their VALUE is the terrain
  // discount, not the "ford/wade/trek" jargon word.
  const terr = terrainGearNote(defId);
  if (terr) return `gear · ${terr}`;
  if (defId in TOOL_CAPABILITY) {
    const cap = TOOL_CAPABILITY[defId]!;
    if (defId === "tent") return `tool · camp — food restores +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}%`;
    // gate-legibility (playtest 2026-07-09 #1): kit-tools are unmarked keys — say
    // what door each opens (field cooking/brewing, the forge, node-tier vision).
    const purpose = TOOL_PURPOSE[cap];
    // D78: a gathering tool names the materials whose gate lists it ("unlocks
    // silver-ore, coal") — the ACCESS it grants, in place of the old tier number.
    const unlocks = materialsUnlockedBy(defId);
    const unlockNote = unlocks.length ? ` — unlocks ${unlocks.join(", ")}` : "";
    return `tool · ${cap}${purpose ? ` — ${purpose}` : unlockNote}`;
  }
  if (defId in BACKPACK_SLOTS) return `backpack · ${BACKPACK_SLOTS[defId]} carry slots`;
  if (defId in TRANSPORT_CARRY) {
    const speed = transportSpeedNote(defId); // wzk: name the speed benefit, not only carry
    return `transport · ${speed ? `${speed} · ` : ""}carries ${TRANSPORT_CARRY[defId]} slots`;
  }
  if (defId in PANNIERS_SLOTS) return `panniers · +${PANNIERS_SLOTS[defId]} carry slots (needs a mount)`;
  if (defId in INKS) return `a cartographer's ink — apply to a held map to coax out a tendency`;
  const enh = enhancementHint(defId); // 7ao: whetstone/oils state their combat effect
  if (enh) return `weapon coating · ${enh}`;
  // D78: gated materials read qualitatively — no tier number (perception guard).
  return defId in MATERIAL_GATE ? "a gated crafting material" : "a crafting material";
}

// D78 reverse lookup: the materials whose MATERIAL_GATE any-of list names this
// tool — i.e. what ACCESS equipping it grants. Sorted for deterministic copy.
export function materialsUnlockedBy(toolDefId: string): string[] {
  return Object.keys(MATERIAL_GATE)
    .filter((m) => MATERIAL_GATE[m]!.tools.includes(toolDefId))
    .sort();
}

// gate-legibility (playtest 2026-07-09 #1): a locked recipe/craft-reject must NAME
// the gate, not say "you lack something." Reads RECIPE[id].requires and returns the
// human "needs …" clause (station + tools joined with " + "), or null for a recipe
// with no gate. `terrain` gates are field-craft-only; call `recipeTerrainGate` for
// that clause where the current tile is known.
export function recipeGateHint(recipeId: string): string | null {
  const req = RECIPE[recipeId]?.requires;
  if (!req) return null;
  const parts: string[] = [];
  if (req.station) parts.push(req.station);
  if (req.tools) parts.push(...req.tools);
  return parts.length ? `needs ${parts.join(" + ")}` : null;
}

// The terrain a field recipe must be crafted on/adjacent to (river for water-vial),
// or null. Kept separate: it's only a "gate" when the player isn't already there.
export function recipeTerrainGate(recipeId: string): Terrain | null {
  return RECIPE[recipeId]?.requires?.terrain ?? null;
}

// gate-legibility (playtest 2026-07-09 #1): a gather `missing-tool` reject must name
// the tool KIND (capability) the node wants — "needs a knife", not "no tool". Reads
// NODE_TOOL[kind] (a capability string that reads as a noun: pick/axe/knife). Herb
// nodes need no tool → null.
// D83: tool-AWARE — names the required tool(s) the player is MISSING for this node,
// or null when they hold everything. Animal "hunting" needs a TRAP (catch) AND a
// knife (skin); the flavored copy names both, or just the missing one.
export function nodeToolHint(kind: GatherableNodeType, tools: string[]): string | null {
  const has = (cap: string) => tools.some((t) => TOOL_CAPABILITY[t] === cap);
  const prim = NODE_TOOL[kind];
  const sec = NODE_SECONDARY_TOOL[kind] ?? null;
  const missPrim = prim !== null && !has(prim);
  const missSec = sec !== null && !has(sec);
  if (!missPrim && !missSec) return null;
  if (kind === "animal") {
    if (missPrim && missSec) return "you'll need both a trap to trap the animal and a knife to alleviate it of its parts";
    if (missSec) return "needs a trap to trap the animal";
    return "needs a knife to alleviate it of its parts";
  }
  return `needs a ${prim}`; // generic single-tool nodes (mining/wood)
}

// rx5: the terse form of nodeToolHint for the on-map "walked over, didn't gather"
// cue — "needs pick", "needs trap + knife". Same missing-tool reading; null when
// nothing's missing.
export function nodeToolShort(kind: GatherableNodeType, tools: string[]): string | null {
  const has = (cap: string) => tools.some((t) => TOOL_CAPABILITY[t] === cap);
  const missing = [NODE_TOOL[kind], NODE_SECONDARY_TOOL[kind] ?? null].filter((c): c is string => c !== null && !has(c));
  return missing.length ? `needs ${missing.join(" + ")}` : null;
}

// gate-legibility (playtest 2026-07-09 #1, node gate/reach visibility): a surveyed /
// in-vision node reads its ACCESS GATE at range so players can plan which veins are
// worth the trek and WHICH tool unlocks them — an agent mined ~12 nodes fishing for
// silver, then trekked 50 tiles to learn a node was locked. Fed the PERCEIVED gate
// (range-gated via perceive), honest to what you can actually see. Ungated → null
// (no signpost needed). NOT for monsters (their size is flavored separately).
// D78: names the unlocking tool family instead of a tier number.
export function nodeGateNote(detail: PoiDetail | null): string | null {
  if (!detail || detail.creature) return null; // null or a monster detail
  const gate = detail.gatedBy;
  if (!gate || gate.length === 0) return null;
  return `locked — needs ${gate.join(" or ")}`;
}

// Catalog projections of a material's ACCESS gate (ciq): the map's per-tile "locked"
// overlay and the herePanel "gated" badge paint EVERY visible node from current tools —
// that's a data lookup over the catalog, not a rejected action, so it belongs here (not
// as a whyNot). materialGated = has any access gate at all; materialLocked = that gate
// names no tool the player currently holds.
export function materialGated(material: string): boolean {
  return (MATERIAL_GATE[material]?.tools?.length ?? 0) > 0;
}
export function materialLocked(material: string, tools: string[]): boolean {
  const gate = MATERIAL_GATE[material]?.tools ?? null;
  return gate !== null && !gate.some((t) => tools.includes(t));
}

const MAGNITUDE_SUFFIX: Record<NodeType, Record<number, string>> = {
  mining: { 2: "cluster", 3: "cave" },
  wood:   { 2: "stand", 3: "grove" },
  herb:   { 2: "patch", 3: "thicket" },
  animal: { 2: "herd", 3: "warren" },
  monster: {},
};

// Vague human text from perception facts. `detail === null` → kind only.
export function flavorDetail(detail: PoiDetail | null, kind: NodeType): string {
  if (detail === null) return kind === "monster" ? "a monster" : `a ${kindLabel(kind)} node`;
  if (kind === "monster") {
    const size = (detail.tier !== undefined ? SIZE_FLAVOR[detail.tier] : undefined) ?? "a";
    const hide = detail.armourType ? HIDE_FLAVOR[detail.armourType] : "an unclear form";
    const tell = detail.dmgType ? `; ${DMG_FLAVOR[detail.dmgType]}` : "";
    return `${size} creature — ${hide}${tell}`;
  }
  const mat = detail.material ?? `a ${kindLabel(kind)} node`;
  const suffix = detail.magnitude ? MAGNITUDE_SUFFIX[kind]?.[detail.magnitude] : undefined;
  return suffix ? `${mat} ${suffix}` : mat;
}

// 0-2 salient post-fight lessons; empty when nothing notable happened. `weaponId`
// is part of the interface for callers that flavor per-weapon later.
export function matchupLessons(matchup: Matchup): string[] {
  const out: string[] = [];
  if (matchup.affinityFired) out.push("something in your weapon savaged it");
  if (matchup.weaponVsHide !== null && matchup.weaponVsHide < 1) out.push("your weapon skated off its hide");
  else if (matchup.weaponVsHide !== null && matchup.weaponVsHide > 1) out.push("you found the gap in its guard");
  if (matchup.armourVsAttack === "exposed") out.push("its attacks tore through your armour");
  else if (matchup.armourVsAttack === "resisted") out.push("your armour turned the blows aside");
  return out.slice(0, 2);
}

export const TERRAIN_CHAR: Record<Terrain, string> = {
  river: "~",
  mud: ",",
  plains: ".",
  ice: "*",
  mountain: "^",
  shallows: "-",
  lake: "=",
  sea: "#",
  "spore-thicket": "%",
};

export const POI_CHAR: Record<NodeType, string> = {
  mining: "O",
  wood: "T",
  herb: "H",
  animal: "A",
  monster: "X",
};

// cww (playtest 2026-07-17 F1): a forage ("herb") node is a LOTTERY — the same "H"
// marker hides flint / deadwood / berries / herbs, so 3/3 blind players found one and
// assumed the rest were the same, missing the bootstrap tool-materials. Once a forage
// node RESOLVES (you're within perception range), show its MATERIAL glyph instead of
// the generic kind glyph, so the map visibly teaches that forage varies. Vague far,
// specific near (the existing perception model) — this just makes the "near" state
// legible. Materials absent here (the actual herbs) keep the generic "H".
export const FORAGE_MATERIAL_CHAR: Record<string, string> = {
  flint: "f",
  deadwood: "d",
  berries: "b",
};

// The map glyph for a perceived POI. Precedence: a humanoid CAMP landmark (wzx — the
// map-dropper, "C", visible at any range) > a RESOLVED forage material (f/d/b) > the
// kind glyph. Shared by the console map and the web grid so both teach identically.
const CAMP_CHAR = "C";
export function poiGlyph(kind: NodeType, detail: PoiDetail | null, landmark?: "camp"): string {
  if (landmark === "camp") return CAMP_CHAR;
  if (kind === "herb" && detail?.material) return FORAGE_MATERIAL_CHAR[detail.material] ?? POI_CHAR.herb;
  return POI_CHAR[kind];
}

// cww: player-facing label for a node KIND. The internal type stays "herb", but a
// forage node yields herbs OR flint OR deadwood OR berries — calling it "herb" implies
// herbs-only and hid the tool-material path. Display it as "forage".
export function kindLabel(kind: NodeType): string {
  return kind === "herb" ? "forage" : kind;
}

// TERRAIN_CHAR / POI_CHAR / PLAYER_CHAR are the shared tile glyphs; the web
// (main.ts) and headless console (playtest.ts) each draw their own grid from them.
// (1z7: the three render.ts grid drawers — render/renderGridText/renderGridHtml —
// were used by zero shipped surfaces and are gone; the glyph maps stay.)
export const PLAYER_CHAR = "@";

// --- Packing sheet (d13): the town prep screen's carry-rule selectors -------------
// Pure, data-shaped reads of the ENGINE's own carry math (carryCap / slotCap /
// consumableSlots / quiverAmmoSlots) and the levers, so the packing screen can show
// WHY the bag holds what it does without re-deriving a single rule.

// Where bag capacity comes from (sums to carryCap): the backpack REPLACES the bare
// pockets (slotCap), transport adds its bonus, panniers add theirs only on a beast.
// Each part's size is a difference of carryCap calls, so the engine stays the authority.
export type CapacityPart = { source: "pockets" | "backpack" | "transport" | "panniers"; defId: string | null; slots: number };
export function carryBreakdown(equipment: Equipment): CapacityPart[] {
  const base = slotCap(equipment.backpack);
  const parts: CapacityPart[] = [{ source: equipment.backpack ? "backpack" : "pockets", defId: equipment.backpack, slots: base }];
  const withTransport = carryCap({ ...equipment, panniers: null });
  if (withTransport > base) parts.push({ source: "transport", defId: equipment.transport, slots: withTransport - base });
  const all = carryCap(equipment);
  if (all > withTransport) parts.push({ source: "panniers", defId: equipment.panniers, slots: all - withTransport });
  return parts;
}
// The bare-pockets size a backpack replaces (for "replaces your 6 pockets" copy).
export const POCKET_SLOTS = slotCap(null);

// One packed item as the bag lists it: `slots` = the carry slots it costs (the
// registry's units-per-slot; ammo the quiver holds costs none — `quivered` slots of
// it ride in the quiver). Σ slots === consumableSlots(loadout).
export type BagRow = { defId: string; qty: number; slots: number; perSlot: number; packSlot: LoadoutSlot; quivered: number };
export function bagRows(loadout: Loadout): BagRow[] {
  const rows: BagRow[] = loadout.equipment.tools.map((t) => ({ defId: t, qty: 1, slots: 1, perSlot: 1, packSlot: "tool" as LoadoutSlot, quivered: 0 }));
  let quiverLeft = quiverAmmoSlots(loadout.equipment);
  for (const key of CONSUMABLE_KEYS) {
    const kind = CONSUMABLE_KINDS[key];
    for (const s of loadout[key] ?? []) {
      let slots = Math.ceil(s.qty / kind.stackCapPerSlot);
      let quivered = 0;
      if (key === "ammo" && quiverLeft > 0) { quivered = Math.min(quiverLeft, slots); quiverLeft -= quivered; slots -= quivered; }
      rows.push({ defId: s.defId, qty: s.qty, slots, perSlot: kind.stackCapPerSlot, packSlot: kind.slot, quivered });
    }
  }
  return rows;
}
// The bag's filled slots in order, one entry per slot: the defId and how many units
// sit in that slot (flasks 3, arrows 10 — the rest 1). Length === consumableSlots.
export function bagCells(loadout: Loadout): { defId: string; qty: number }[] {
  const cells: { defId: string; qty: number }[] = [];
  for (const r of bagRows(loadout)) {
    let rest = r.qty - Math.min(r.qty, r.quivered * r.perSlot); // the quiver takes the first slots' worth
    for (let i = 0; i < r.slots; i++) { const q = Math.min(r.perSlot, rest); cells.push({ defId: r.defId, qty: q }); rest -= q; }
  }
  return cells;
}

// What a gather kind yields, as the haul line says it.
export const HAUL_NOUN: Record<GatherableNodeType, string> = { mining: "ore", wood: "wood", animal: "animals", herb: "forage" };
const GATHER_KINDS = Object.keys(NODE_TOOL) as GatherableNodeType[];
const hasCap = (tools: string[], cap: string) => tools.some((t) => TOOL_CAPABILITY[t] === cap);
// The node kinds these tools can work (herbs need none, so they're always in), plus
// fish when a rod is packed — the "expected haul" line.
export function expectedHaul(tools: string[]): string[] {
  const kinds = GATHER_KINDS.filter((k) => nodeToolShort(k, tools) === null).map((k) => HAUL_NOUN[k]);
  return hasCap(tools, "fish") ? [...kinds, "fish"] : kinds;
}
// What a packed tool is FOR, in a couple of words: the haul it opens ("ore"), with the
// partner tool an AND-gated kind still needs ("animals, with a knife"); else its
// terrain/stamina effect (logisticsEffect); null for tools that need no gloss.
export function toolGloss(defId: string, tools: string[]): string | null {
  const cap = TOOL_CAPABILITY[defId];
  if (cap === undefined) return null;
  const kinds = GATHER_KINDS.filter((k) => NODE_TOOL[k] === cap || NODE_SECONDARY_TOOL[k] === cap);
  if (kinds.length) {
    return kinds.map((k) => {
      const missing = [NODE_TOOL[k], NODE_SECONDARY_TOOL[k] ?? null].filter((c): c is string => c !== null && c !== cap && !hasCap(tools, c));
      return `${HAUL_NOUN[k]}${missing.length ? `, with a ${missing.join(" + ")}` : ""}`;
    }).join(" · ");
  }
  if (cap === "fish") return "fish";
  return logisticsEffect(defId) ?? TOOL_PURPOSE[cap] ?? null;
}

// Scout reports → kit (d13): what each map hint asks of the loadout, checked against
// the plan. ground = the gear that opens/speeds/wards that terrain (TERRAIN_GATE,
// TRANSPORT_MULTIPLIER, TERRAIN_HP_WARD); threat = the armour class that best resists
// that attack (or the attack that best beats that hide) off DMG_ARMOUR_MATRIX, or
// potions for a dangerous map; bounty = the node kind's tools (NODE_TOOL /
// NODE_SECONDARY_TOOL), or food for thin forage. "Nothing remarkable" hints, and
// low-terrain ones, ask for nothing (null). `have` names what in the plan answers it.
export type HintNeed = { want: string; have: string | null; ok: boolean; gear: string | null; node: GatherableNodeType | null };
const HINT_TERRAINS: Partial<Record<HintMetric, Terrain[]>> = {
  mountain: ["mountain"], mud: ["mud"], river: ["river"], ice: ["ice"], water: ["lake", "shallows"], spores: ["spore-thicket"],
};
const HINT_NODE: Partial<Record<HintMetric, GatherableNodeType>> = { mining: "mining", wood: "wood", animal: "animal", herb: "herb" };
const argBest = <K extends string>(rec: Record<K, number>, better: (a: number, b: number) => boolean): K =>
  (Object.keys(rec) as K[]).reduce((best, k) => (better(rec[k], rec[best]) ? k : best));
export function hintNeed(hintId: string, loadout: Loadout): HintNeed | null {
  const trait = MAP_HINTS.find((t) => t.id === hintId);
  if (!trait) return null; // a fallback ("nothing unusual") hint
  const lowRelative = "dir" in trait.test && trait.test.dir === "low";
  const eq = loadout.equipment;
  const held = [...eq.tools, ...(eq.transport ? [eq.transport] : [])];
  const terrains = HINT_TERRAINS[trait.metric];
  if (terrains) {
    if (lowRelative) return null; // "open country" / "little water" / "clear air" — nothing to bring
    const gear = [...new Set(terrains.flatMap((t) => { const g = terrainGear(t); return [...g.opens, ...g.speeds, ...(TERRAIN_HP_WARD[t] ?? [])]; }))];
    if (!gear.length) return null;
    const have = gear.filter((g) => held.includes(g));
    return { want: orList(gear.map(name)), have: have.length ? have.map(name).join(" + ") : null, ok: have.length > 0, gear: have[0] ?? gear[0]!, node: null };
  }
  const node = HINT_NODE[trait.metric];
  if (node) {
    const caps = [NODE_TOOL[node], NODE_SECONDARY_TOOL[node] ?? null].filter((c): c is string => c !== null);
    if (!caps.length) return null; // forage: bare hands
    const have = eq.tools.filter((t) => caps.includes(TOOL_CAPABILITY[t] ?? ""));
    const ok = nodeToolShort(node, eq.tools) === null;
    return { want: caps.map((c) => name(c)).join(" + "), have: ok ? have.map(name).join(" + ") : null, ok, gear: null, node };
  }
  if (trait.metric === "food") {
    const units = loadout.food.reduce((n, s) => n + s.qty, 0);
    return { want: "food from home", have: units ? `${units} food` : null, ok: units > 0, gear: loadout.food[0]?.defId ?? "ration", node: null };
  }
  if (trait.metric === "melee" || trait.metric === "ranged" || trait.metric === "magic") {
    const best = argBest(DMG_ARMOUR_MATRIX[trait.metric], (a, b) => a < b);
    const ok = armourTypesWorn(eq).includes(best);
    return { want: `${best} armour`, have: ok ? `${best} armour` : null, ok, gear: null, node: null };
  }
  if (trait.metric === "plate") {
    const dmg = (Object.keys(DMG_ARMOUR_MATRIX) as DmgType[]).reduce((b, d) => (DMG_ARMOUR_MATRIX[d].plate > DMG_ARMOUR_MATRIX[b].plate ? d : b));
    const ok = playerAttackType(loadout) === dmg;
    return { want: `a ${dmg} weapon`, have: ok && eq.weapon ? name(eq.weapon) : null, ok, gear: eq.weapon, node: null };
  }
  if (trait.metric === "monster" || trait.metric === "maxTier") {
    if (lowRelative) return null; // "quiet country"
    const units = loadout.potions.reduce((n, s) => n + s.qty, 0);
    return { want: "potions", have: units ? `${units} potion${units > 1 ? "s" : ""}` : null, ok: units > 0, gear: loadout.potions[0]?.defId ?? "potion", node: null };
  }
  return null;
}

/** Out on the map with nowhere left to go: no step is affordable, nothing in the bag
 *  can be eaten, and nothing you could craft right here is food. Surfaces offer the
 *  trip home (return is always free, D62). `legal` is legalActions(state). */
export function isExhausted(state: { phase: string; expedition?: Expedition | null }, legal: Action[]): boolean {
  const exp = state.expedition;
  if (state.phase !== "expedition" || !exp || exp.combat) return false;
  return !legal.some((a) =>
    a.type === "move" || a.type === "eat" ||
    (a.type === "craft" && FOOD.includes(RECIPE[a.recipeId]?.output.defId ?? "")));
}

/** What is still worth staying for once exhausted (seyh.3): the player-words verbs of the
 *  legal non-home actions that do something out here (an adjacent fight or throw, a field
 *  craft, a drop). Settings toggles and the auto-eat pick don't count. Empty = the only
 *  real move left is the free trip home, so the exhausted card offers nothing else. */
export function stuckOptions(legal: Action[]): string[] {
  const out: string[] = [];
  if (legal.some((a) => a.type === "fight" || a.type === "throw")) out.push("fight");
  if (legal.some((a) => a.type === "craft")) out.push("craft");
  if (legal.some((a) => a.type === "drop" || a.type === "drop-map")) out.push("drop things");
  return out;
}

/** Where an item comes from, in player words (user 2026-10-10: "where do I get flint?"):
 *  the node kinds + biomes whose material tables hold it (with the tool that node
 *  needs), the monsters that drop it, and whether it's crafted. Empty = nothing known. */
export function itemSources(defId: string): string[] {
  const out: string[] = [];
  const byKind = new Map<string, string[]>();
  for (const [biome, b] of Object.entries(BIOMES)) {
    for (const [kind, table] of Object.entries(b.materialTable)) {
      if (!table || !(defId in table)) continue;
      byKind.set(kind, [...(byKind.get(kind) ?? []), name(biome)]);
    }
  }
  for (const [kind, biomes] of byKind) {
    const tool = NODE_TOOL[kind as GatherableNodeType];
    const noun = GATHER_VERB[kind]?.noun ?? kindLabel(kind as NodeType);
    out.push(`${capFirst(noun)} in ${biomes.join(", ")} · ${tool ? `needs a ${name(tool)}` : "bare hands"}`);
  }
  const droppers = Object.entries(LOOT_TABLE).filter(([, drops]) => drops.some((d) => d.defId === defId)).map(([m]) => name(m));
  if (droppers.length) out.push(`Dropped by ${droppers.join(", ")}`);
  if (Object.values(RECIPE).some((r) => r.output.defId === defId)) out.push("Crafted");
  return out;
}

/** Rough step-cost band for the map's cost tint (user 2026-10-10: "use colours to
 *  indicate the rough cost of moving"). Effective energy per step with your gear:
 *  1 = plains-cheap or better, 2 = a bit slow (mud), 3 = slow (ice), 4 = very slow
 *  (river, shallows, mountains with a pick). Impassable tiles return null (they
 *  already wear the blocked crosshatch). */
export const COST_BANDS = [10, 15, 20] as const; // upper bound (inclusive) of bands 1–3
export function costBand(stepCost: number): 1 | 2 | 3 | 4 | null {
  if (!Number.isFinite(stepCost)) return null;
  const i = COST_BANDS.findIndex((max) => stepCost <= max);
  return (i === -1 ? 4 : i + 1) as 1 | 2 | 3 | 4;
}
