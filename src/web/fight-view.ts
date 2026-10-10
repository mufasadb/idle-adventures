// The fight UI (eor, D103 — Muse la-lwqd7z option 2): a full-width bottom SHEET over
// the map while engaged — you on the left, the monster on the right, the actions in the
// middle — and a compact pre-fight card for a monster at the route's end. No round
// counts: one traffic-light verdict (render.ts fightVerdict) + each side's attack and
// armour TYPE, so the matrix stays the player's to read. Legality from reduce (D29).
import { wieldsRanged, loadedAmmoIndex } from "../engine/combat";
import { MONSTERS, MONSTER_TIER_HP_CURVE, PLAYER_BASE_HP, ANTIDOTE } from "../data/constants";
import type { DmgType, ArmourType } from "../data/constants";
import type { PoiDetail } from "../engine/perceive";
import type { GameState, Action, Expedition, Loadout } from "../engine/types";
import {
  name, describe, round1, rejectCopy, enhancementHint, battleItemEffect, engagementForecast,
  engagementVerdict, VERDICT_LABEL, DMG_TYPE_ICON, ARMOUR_TYPE_ICON, playerAttackType, armourTypesWorn,
  lootPreview, lootSlots,
} from "../render/render";
import type { FightVerdict } from "../render/render";
import { iconStyle, monsterStyle, playerStyle } from "./assets";

// The verdict from the LAST render, keyed on the engagement, so a coat/swap/potion that
// flips it makes the verdict pulse (replaces 67e's "kill in 5 → 3" delta). Presentational.
const PULSE_MS = 1200;
let lastVerdict: { key: string; v: FightVerdict; changedAt: number } | null = null;

// si7.6.9.6: flasks the reducer would let you throw — at your engaged target, or at
// `at` from range.
export function throwLegal(legal: Action[], at?: { x: number; y: number }): string[] {
  return [...new Set(legal.filter((a): a is Extract<Action, { type: "throw" }> => a.type === "throw" && (at ? a.at !== undefined && a.at.x === at.x && a.at.y === at.y : a.at === undefined)).map((a) => a.itemId))];
}
// An "Apply <enhancement>" button per carried enhancement the reducer accepts (D60).
export function enhanceButtons(exp: Expedition, legal: Action[], short = false): string {
  const ok = new Set(legal.filter((a): a is Extract<Action, { type: "enhance" }> => a.type === "enhance").map((a) => a.id));
  return (exp.loadout.enhancements ?? []).filter((s) => ok.has(s.defId)).map((s) =>
    `<button data-enhance="${s.defId}" title="coat your weapon (${enhancementHint(s.defId) ?? ""})${exp.weaponBuff ? " — replaces the current coating" : ""}">🗡️ ${short ? "Coat" : "Apply"} ${name(s.defId)}${s.qty > 1 ? ` ×${s.qty}` : ""}</button>`).join("");
}

// --- small pieces ---------------------------------------------------------------
const typeChip = (kind: "atk" | "arm", t: DmgType | ArmourType, title: string) =>
  `<span class="fs-type ${kind} t-${t}" title="${title}">${kind === "atk" ? DMG_TYPE_ICON[t as DmgType] : ARMOUR_TYPE_ICON[t as ArmourType]} ${t}</span>`;
function playerTypes(lo: Loadout): string {
  const atk = playerAttackType(lo);
  const arm = armourTypesWorn(lo.equipment);
  return `${typeChip("atk", atk, `your strikes deal ${atk} damage`)}${arm.length ? arm.map((a) => typeChip("arm", a, `you wear ${a} armour`)).join("") : `<span class="fs-type arm none" title="no armour worn">🛡 none</span>`}`;
}
function monsterTypes(dmg?: DmgType, arm?: ArmourType): string {
  return `${dmg ? typeChip("atk", dmg, `it deals ${dmg} damage`) : `<span class="fs-type atk unknown" title="get closer (or survey) to read it">? attack</span>`}${arm ? typeChip("arm", arm, `its hide is ${arm}`) : `<span class="fs-type arm unknown" title="get closer (or survey) to read it">? hide</span>`}`;
}
function hpBar(hp: number, max: number, cls: string): string {
  return `<div class="fs-hp"><div class="track"><div class="fill ${cls}" style="width:${Math.max(0, Math.min(100, (hp / max) * 100))}%"></div></div><b>${round1(hp)}/${max}</b></div>`;
}
// A sprite in a fixed portrait box; a frame larger than the box is zoomed down to fit.
const PORTRAIT_PX = 52;
function portrait(style: string | null, glyph: string): string {
  if (!style) return `<span class="fs-portrait glyph">${glyph}</span>`;
  const h = Number(/height:([\d.]+)px/.exec(style)?.[1] ?? PORTRAIT_PX);
  const zoom = h > PORTRAIT_PX ? ` zoom:${(PORTRAIT_PX / h).toFixed(3)};` : "";
  return `<span class="fs-portrait"><span class="sprite" style="${style};${zoom}" aria-hidden="true"></span></span>`;
}
function lootIcons(creature: string): string {
  const { sure, maybe } = lootPreview(creature);
  const icon = (defId: string, cls: string, q = "") => {
    const st = iconStyle(defId);
    return `<span class="fs-loot ${cls}" title="${cls === "maybe" ? "might drop: " : ""}${name(defId)}${q}">${st ? `<span class="fs-loot-icon" style="${st}"></span>` : `<span class="fs-loot-name">${name(defId)}</span>`}${q ? `<span class="q">${q}</span>` : ""}${cls === "maybe" ? `<span class="q">?</span>` : ""}</span>`;
  };
  return [...sure.map((s) => icon(s.defId, "sure", s.qty > 1 ? `×${s.qty}` : "")), ...maybe.map((d) => icon(d, "maybe"))].join("") || `<span class="muted small">no loot</span>`;
}
export function verdictDot(v: FightVerdict): string {
  return `<span class="vdot v-${v}" title="${VERDICT_LABEL[v]}"></span>`;
}

// --- the fight sheet ------------------------------------------------------------
export function fightSheet(exp: Expedition, legal: Action[]): string {
  const c = exp.combat!;
  const m = MONSTERS[c.creature]!;
  const maxHp = MONSTER_TIER_HP_CURVE[m.tier]!;
  const verdict = engagementVerdict(exp);
  const key = `${c.creature}@${c.at.x},${c.at.y}`;
  const t = performance.now();
  if (!lastVerdict || lastVerdict.key !== key) lastVerdict = { key, v: verdict, changedAt: -Infinity };
  else if (lastVerdict.v !== verdict) lastVerdict = { key, v: verdict, changedAt: t };
  const age = t - lastVerdict.changedAt;
  const pulse = age < PULSE_MS ? ` pulse" style="animation-delay:${-age}ms` : "";
  const has = (type: Action["type"]) => legal.some((a) => a.type === type);
  const { dmgIn } = engagementForecast(exp);

  // Your side: quiver / coating / poison chips, potions + auto-quaff.
  const li = loadedAmmoIndex(exp.loadout);
  const loaded = li === -1 ? null : exp.loadout.ammo![li]!;
  const shots = loaded ? (exp.loadout.ammo ?? []).filter((s) => s.defId === loaded.defId).reduce((n, s) => n + s.qty, 0) : 0;
  const chips = [
    wieldsRanged(exp.loadout) ? `<span class="fs-chip${shots === 0 ? " bad" : ""}" title="${shots === 0 ? "empty quiver — you swing the bow like a club" : `${shots} ${loaded ? name(loaded.defId).toLowerCase() : "ammo"} left`}">🏹 ${shots}</span>` : "",
    exp.weaponBuff ? `<span class="fs-chip" title="${name(exp.weaponBuff.id)} — ${enhancementHint(exp.weaponBuff.id) ?? ""}">🗡️ ${exp.weaponBuff.charges}</span>` : "",
    exp.poisoned ? `<span class="poison-chip" title="you're poisoned: −${exp.poisoned.dmg} HP a round for ${exp.poisoned.ticks} more">☠ ${exp.poisoned.ticks}</span>` : "",
  ].join("");
  const pots = exp.loadout.potions.reduce((n, p) => n + p.qty, 0);
  const autoQ = exp.autoQuaff ?? true;
  const you = `<div class="fs-side fs-you">
      <div class="fs-head">${portrait(playerStyle(), "@")}<div class="fs-id"><b>You</b>${hpBar(exp.hp, PLAYER_BASE_HP, "hp")}</div></div>
      <div class="fs-types">${playerTypes(exp.loadout)}${chips}</div>
      <div class="fs-pots"><span title="${pots} potion${pots === 1 ? "" : "s"} carried">🧪 ×${pots}</span><button class="fs-toggle${autoQ ? " on" : ""}" data-act="toggle-auto-quaff" title="auto-drink a potion when HP drops low mid-fight">auto-quaff ${autoQ ? "on" : "off"}</button></div>
    </div>`;

  const foe = `<div class="fs-side fs-foe">
      <div class="fs-head"><div class="fs-id"><b>${name(c.creature)}</b>${hpBar(c.monsterHp, maxHp, "monster")}</div>${portrait(monsterStyle(c.creature), "X")}</div>
      <div class="fs-types">${monsterTypes(m.dmgType, m.armourType)}${c.poison ? `<span class="poison-chip" title="your poison: ${round1(c.poison.dmg)} a round, ${c.poison.rounds} more">☠ ${c.poison.rounds}</span>` : ""}</div>
      <div class="fs-lootrow">${lootIcons(c.creature)}</div>
    </div>`;

  // The middle: only what the reducer accepts right now.
  const free = !(c.struck ?? false);
  const throws = throwLegal(legal).map((id) => {
    const qty = (exp.loadout.flasks ?? []).filter((s) => s.defId === id).reduce((n, s) => n + s.qty, 0);
    return `<button class="throw" data-throw="${id}" title="${describe(id)}">💥 Throw ${name(id).toLowerCase()}${qty > 1 ? ` ×${qty}` : ""}${free ? ` <span class="free-opener">FREE</span>` : ""}</button>`;
  });
  const usable = new Set(legal.filter((a): a is Extract<Action, { type: "use-item" }> => a.type === "use-item").map((a) => a.itemId));
  const items = exp.loadout.battleItems.filter((s) => !ANTIDOTE.includes(s.defId) && usable.has(s.defId)).map((s) =>
    `<button data-use-item="${s.defId}" title="use it this fight only (${battleItemEffect(s.defId) ?? ""})">⚗ ${name(s.defId)}${s.qty > 1 ? ` ×${s.qty}` : ""}</button>`);
  const cure = legal.some((a) => a.type === "use-item" && ANTIDOTE.includes(a.itemId)) ? [`<button class="antidote" data-use-item="antidote" title="cure your poison — no turn">🧪 Antidote</button>`] : [];
  const creature = name(c.creature);
  const dons = legal.filter((a): a is Extract<Action, { type: "don" }> => a.type === "don")
    .map((a) => `<button class="swap" data-don="${a.itemId}" title="equip ${name(a.itemId)} — costs a turn (the ${creature} strikes)">🛡 Don ${name(a.itemId)}</button>`);
  const doffs = legal.filter((a): a is Extract<Action, { type: "doff" }> => a.type === "doff")
    .map((a) => `<button class="swap" data-doff="${a.itemId}" title="stow ${name(a.itemId)} — costs a turn (the ${creature} strikes)">🎒 Doff ${name(a.itemId)}</button>`);
  const actions = [
    has("fight") ? `<button class="primary" data-act="fight" title="trade one round of blows">⚔ Fight</button>` : "",
    has("flee") ? `<button data-act="flee" title="disengage — take one parting hit (−${round1(dmgIn)} HP); unused battle items keep">🏃 Flee</button>` : "",
    has("quaff") ? `<button data-act="quaff" title="drink a potion — costs a turn (the ${creature} strikes)">🧪 Quaff</button>` : "",
    ...throws, ...cure, ...items, enhanceButtons(exp, legal, true), ...dons, ...doffs,
    `<button class="fs-toggle${(exp.autoFinish ?? false) ? " on" : ""}" data-act="toggle-auto-finish" title="fast-forward whole fights to victory or defeat in one tap">⏩ auto-finish ${(exp.autoFinish ?? false) ? "on" : "off"}</button>`,
  ].filter(Boolean).join("");

  return `<div class="fightsheet v-${verdict}" data-fightsheet>
    ${you}
    <div class="fs-mid">
      <div class="fs-verdict v-${verdict}${pulse}" title="the fight as it stands — green: you win without potions · orange: only by drinking potions · red: you lose even with them">${VERDICT_LABEL[verdict]}</div>
      <div class="fs-actions">${actions}</div>
    </div>
    ${foe}
  </div>`;
}

// --- the pre-fight card (a monster at the route's end, or underfoot) ------------
// Verdict + both sides' types + loot + the bag-slot warning. `detail` is what you
// PERCEIVE of it (types read "?" until it's in sight or surveyed).
export function preFightCard(state: GameState, exp: Expedition, creature: string, at: { x: number; y: number }, verdict: FightVerdict, detail: PoiDetail | null): string {
  const { need, free } = lootSlots(state.seed, creature, at, exp.loadout, exp.carry);
  const tight = need > free; // exactly engage()'s pendingLootFits check, as counts
  return `<div class="prefight v-${verdict}">
    <div class="pf-top">${portrait(monsterStyle(creature), "X")}<div class="pf-id"><b>${name(creature)}</b><span class="fs-verdict v-${verdict}">${VERDICT_LABEL[verdict]}</span></div><div class="fs-lootrow">${lootIcons(creature)}${need > 0 ? (tight ? `<span class="pf-fit no" title="won't all fit in your bag">✗</span>` : `<span class="pf-fit ok" title="fits in your bag">✓</span>`) : ""}</div></div>
    <div class="pf-vs"><span class="pf-who">you</span>${playerTypes(exp.loadout)}<span class="pf-who">it</span>${monsterTypes(detail?.dmgType, detail?.armourType)}</div>
    ${tight ? `<div class="pf-bag" title="${rejectCopy("carry-full", undefined, "fight")}">⚠ needs ${need} free slot${need === 1 ? "" : "s"} — bag has ${free}</div>` : ""}
  </div>`;
}
