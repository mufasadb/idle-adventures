// Interactive web driver (the human side of the two-driver design, spec §12).
// A thin, stateful shell over the pure engine: every button/cell click builds an
// Action, folds it through `reduce`, and re-renders. legalActions(state) drives
// what's offered, so the UI can never diverge from what the engine accepts.
// Pathing (A*) is a UI convenience — it only proposes a sequence of `move`
// actions; each step is still validated by `reduce`.
import { newGame, localMap, mapEpithet } from "../engine/town";
import { reduce } from "../engine/reduce";
import { legalActions } from "../sim/legal";
import { expeditionGrid, rollBiome } from "../engine/grid";
import type { Grid } from "../engine/grid";
import { slotOf } from "../engine/catalog";
import { recipeOutputQty } from "../engine/craft";
import { moveCost, moveCostBreakdown } from "../engine/move";
import { ASSET_TRIAL, TILE_BG, MONSTER_SPRITES, MONSTER_SIZE, NODE_ICON } from "./assets-trial";
import { carryCap, mapCarryCap } from "../engine/carry";
import { wornPieces, ARMOUR_SLOTS } from "../engine/pack";
import { lineTiles } from "../engine/line";
import { gatherCost } from "../engine/tools";
import { heldFoodEnergy } from "../engine/food";
import { damageTaken, playerDamage, wieldsRanged } from "../engine/combat";
import { RECIPE, MATERIAL_GATE, MAP_WIDTH, MAP_HEIGHT, MAX_ENERGY, TENT_FOOD_MULTIPLIER, MONSTER_TIER_HP_CURVE, MONSTERS, QUAFF_ENERGY, DON_DOFF_ENERGY, ARROW_STACK_CAP, COMBAT_BUFF, SURVEY_ENERGY, FIELD_CRAFT_ENERGY, INKS, AFFIX_EFFECTS, NODE_TOOL, TOOL_CAPABILITY, WEAPON_ENHANCEMENT } from "../data/constants";
import type { BiomeId, GatherableNodeType } from "../data/constants";
import { TERRAIN_CHAR, POI_CHAR, PLAYER_CHAR, flavorDetail, matchupLessons, weaponHint, logisticsEffect, enhancementHint, affixMaterialHint, describe, recipeGateHint, nodeToolHint, nodeGateNote, name, rejectCopy, combatForecast } from "../render/render";
import { perceive } from "../engine/perceive";
import type { GameState, Action, GameEvent, ItemStack, Loadout, Equipment, Expedition, LoadoutSlot, MapItem, RejectionReason } from "../engine/types";

// Per-node verb so the UI reads right: you don't "mine" an animal.
const GATHER_VERB: Record<string, { label: string; past: string; noun: string }> = {
  mining: { label: "⛏ Mine", past: "mined", noun: "ore vein" },
  wood: { label: "🪓 Chop", past: "chopped", noun: "stand of trees" },
  herb: { label: "🌿 Forage", past: "foraged", noun: "herb patch" },
  animal: { label: "🔪 Hunt", past: "hunted", noun: "animal" },
};


const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "play";
const SAVE_KEY = `idle-adv:${seed}`;

type Pos = { x: number; y: number };

let state: GameState = load() ?? newGame(seed);
let log: string[] = loadLog();
// eot: routing is the PLAYER's job. `route` is the planned list of waypoints (the
// player's tile is the implicit head); each leg between consecutive points is drawn
// as a naive STRAIGHT line (lineTiles), never an energy-optimal path. Clicks build,
// extend, and truncate it; Walk executes it. Empty = nothing planned.
let route: Pos[] = [];
// 67e: the engagement forecast from the LAST render, so the panel can show a delta
// ("kill in 5 → 3") after a coat/swap/potion. Keyed on the engagement so a new fight
// resets it. Purely presentational.
let lastForecast: { key: string; dmgOut: number; toKill: number } | null = null;
const app = document.querySelector<HTMLDivElement>("#app")!;

// --- persistence: survive a page refresh (the run isn't lost) ----------------
function save(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    localStorage.setItem(`${SAVE_KEY}:log`, JSON.stringify(log));
  } catch { /* storage disabled — non-fatal */ }
}
function load(): GameState | null {
  try { const raw = localStorage.getItem(SAVE_KEY); return raw ? (JSON.parse(raw) as GameState) : null; } catch { return null; }
}
function loadLog(): string[] {
  try { const raw = localStorage.getItem(`${SAVE_KEY}:log`); return raw ? (JSON.parse(raw) as string[]) : []; } catch { return []; }
}
function newRun(): void { state = newGame(seed); log = ["· new game"]; route = []; draw(); }

// --- repack-last-loadout (nuy) -----------------------------------------------
// The plan is consumed at embark by design (D22/D28) — correct, but it read as a
// silent reset, and hand-repacking the same kit cost 10+ clicks per run. We keep
// the engine untouched: serialize the JUST-CONSUMED plan as an ordered list of
// ordinary pack actions and replay them through reduce (D29 intact). Equipment
// that changes carry capacity (backpack/transport/panniers) is packed FIRST so
// later consumable slot checks see the real cap.
type PackStep = { slot: LoadoutSlot; itemId: string };
function planActions(lo: Loadout): PackStep[] {
  const eq = lo.equipment;
  const acts: PackStep[] = [];
  const equip: [LoadoutSlot, string | null][] = [
    ["backpack", eq.backpack], ["transport", eq.transport], ["panniers", eq.panniers],
    ["weapon", eq.weapon], ["helmet", eq.helmet], ["chest", eq.chest], ["legs", eq.legs], ["boots", eq.boots], ["gloves", eq.gloves],
  ];
  for (const [slot, id] of equip) if (id) acts.push({ slot, itemId: id });
  for (const t of eq.tools) acts.push({ slot: "tool", itemId: t });
  const units = (list: ItemStack[], slot: LoadoutSlot) => { for (const s of list) for (let i = 0; i < s.qty; i++) acts.push({ slot, itemId: s.defId }); };
  units(lo.food, "food");
  units(lo.potions, "potion");
  units(lo.battleItems ?? [], "battle-item");
  units(lo.enhancements ?? [], "enhancement"); // weapon enhancements (D60)
  units(lo.spares ?? [], "spare");
  units(lo.ammo ?? [], "ammo");
  return acts;
}
function saveLastPlan(lo: Loadout): void {
  const steps = planActions(lo);
  try { localStorage.setItem(`${SAVE_KEY}:lastPlan`, JSON.stringify(steps)); } catch { /* storage disabled */ }
}
function loadLastPlan(): PackStep[] {
  try { const raw = localStorage.getItem(`${SAVE_KEY}:lastPlan`); return raw ? (JSON.parse(raw) as PackStep[]) : []; } catch { return []; }
}
// Replay each stored pack through reduce; items eaten/lost/sold-off last run just
// reject (insufficient / wrong-slot for a dead defId) and are counted as skipped.
function repackLast(): void {
  const plan = loadLastPlan();
  if (!plan.length) return;
  let skipped = 0;
  for (const step of plan) {
    const { state: next, events } = reduce(state, { type: "pack", slot: step.slot, itemId: step.itemId });
    if (events.some((e) => e.type === "action-rejected")) { skipped += 1; continue; }
    state = next;
  }
  note(`↻ repacked last loadout${skipped ? ` · skipped ${skipped} (not in bank / no slot)` : ""}`);
}

// --- action plumbing: one funnel so every interaction goes through reduce ----
function apply(action: Action): void {
  const prevLoadout = state.loadout; // embark consumes this plan — stash it for repack
  const { state: next, events } = reduce(state, action);
  if (action.type === "embark" && !events.some((e) => e.type === "action-rejected")) saveLastPlan(prevLoadout);
  state = next;
  for (const e of events) {
    // gate-legibility (playtest 2026-07-09 #1): a rejected CRAFT knows its recipeId
    // here (the event doesn't carry it) — name the exact missing station/tool/terrain.
    if (e.type === "action-rejected" && e.action === "craft" && action.type === "craft") {
      log.unshift(`✗ craft — ${rejectCopy(e.reason, action.recipeId)}`);
    } else {
      log.unshift(fmt(e));
    }
  }
  trimAndDraw();
}
function note(line: string): void { log.unshift(line); trimAndDraw(); }
function trimAndDraw(): void { log = log.slice(0, 16); draw(); }
function planReset(): void {
  // pack is only a PLAN on state.loadout (D28: bank untouched until embark).
  state = { ...state, loadout: newGame(seed).loadout };
  note("· cleared the loadout plan");
}

function fmt(e: GameEvent): string {
  switch (e.type) {
    case "embarked": return `▶ embarked on a ${e.biomeId} map — ${e.energy} energy`;
    case "moved": return `walked to (${e.to.x},${e.to.y}) on ${e.terrain} · −${round(e.cost)}e → ${round(e.energy)}e`;
    case "gathered": return `${GATHER_VERB[e.kind]?.past ?? "gathered"} ${e.qty}× ${name(e.material)} · −${round(e.cost)}e → ${round(e.energy)}e`;
    case "dropped": return `dropped ${e.qty}× ${name(e.defId)}`;
    case "ate": return `🍖 ate ${name(e.defId)} · +${round(e.restored)}e → ${round(e.energy)}e`;
    case "auto-eat-set": return e.defId ? `🍴 auto-eat: ${name(e.defId)}` : `🍴 auto-eat off`;
    case "fought": {
      const lessons = matchupLessons(e.matchup, null);
      const tail = lessons.length ? ` · ${lessons.join(" · ")}` : "";
      const ff = e.rounds ? ` ⏩ (${e.rounds} rounds)` : ""; // 67e: auto-finish collapsed the fight
      return (e.victory
        ? `⚔ beat the ${name(e.creature)}${ff} · −${round(e.hpLost)}hp${e.potionsUsed ? ` (${e.potionsUsed} potion${e.potionsUsed > 1 ? "s" : ""})` : ""} · loot ${e.loot.map((l) => `${l.qty}× ${name(l.defId)}`).join(", ") || "none"}`
        : `☠ the ${name(e.creature)} downed you${ff} · run ends, haul kept`) + tail;
    }
    case "crafted": return `✦ ${e.where === "field" ? "field-crafted 🔥 " : "crafted "}${e.output.qty}× ${name(e.output.defId)}`;
    case "map-dropped": return e.carried
      ? `🗺️ looted a T${e.tier} ${name(e.biomeId)} map (takes 1 slot — banks home with you)`
      : `🗺️ a T${e.tier} ${name(e.biomeId)} map dropped — pack full, left behind`;
    case "map-discarded": return `🗺️ discarded a carried map`;
    case "packed": return `packed ${name(e.defId)} → ${e.slot}`;
    case "run-ended": return e.flavor ? `${e.flavor}<br>— run ended (${e.reason}) —` : `— run ended (${e.reason}) —`;
    case "action-rejected": return `✗ ${e.action} — ${rejectCopy(e.reason)}`;
    case "engaged": return e.ranged
      ? `🏹 engaged the ${name(e.creature)} from a tile away — your opener lands before it can answer`
      : `⚔ engaged the ${name(e.creature)}`;
    case "exchanged": return `⚔ traded blows with the ${name(e.creature)} — dealt ${round(e.dmgDealt)}, took ${round(e.dmgTaken)} · ${round(e.hp)}hp left${e.arrowSpent ? " · 🏹 −1 arrow" : ""}${e.poisonDmg ? ` · ☠ poison ${round(e.poisonDmg)}` : ""}`;
    case "fled": return `🏃 fled the ${name(e.creature)} · −${round(e.partingHit)}hp → ${round(e.hp)}hp`;
    case "quaffed": return `🧪 quaffed ${name(e.defId)} · +${round(e.healed)}hp → ${round(e.hp)}hp${e.energy !== undefined ? ` · −${QUAFF_ENERGY}e → ${round(e.energy)}e` : ""}`;
    case "item-used": return `⚗ used ${name(e.defId)} this fight${e.damageAdd ? ` · +${round(e.damageAdd)} dmg` : ""}${e.mitigationAdd ? ` · +${round(e.mitigationAdd)} mitigation` : ""}`;
    case "enhanced": return `🗡️ coated your weapon with ${name(e.id)} · ${e.charges} charge${e.charges === 1 ? "" : "s"}`;
    case "surveyed": return `🔭 surveyed the ${e.kind} at (${e.at.x},${e.at.y}) — its detail is now in focus`;
    case "inked": { const mat = affixMaterialHint(e.affix); return `🖋 inked — this map now favours ${mat ? name(mat) : "its domain"} (of ${AFFIX_EFFECTS[e.affix]?.label ?? e.affix})`; }
    case "auto-quaff-toggled": return `auto-quaff ${e.on ? "on" : "off"}`;
    case "auto-finish-toggled": return `auto-finish fights ${e.on ? "on" : "off"}`;
    case "auto-gather-toggled": return `auto-gather ${e.on ? "on" : "off"}`;
    case "provoked": return `⚔ the ${name(e.creature)} strikes while you act · −${round(e.hit)}hp → ${round(e.hp)}hp`;
    case "donned": return `🧤 donned ${name(e.defId)}${e.displaced ? ` (stowed ${name(e.displaced)})` : ""} · −${DON_DOFF_ENERGY}e → ${round(e.energy)}e`;
    case "doffed": return `🎒 doffed ${name(e.defId)} to the bag · −${DON_DOFF_ENERGY}e → ${round(e.energy)}e`;
  }
}
const round = (n: number) => Math.round(n * 10) / 10;
const kk = (p: Pos) => `${p.x},${p.y}`;

// Human breakdown of a single step's energy — surfaced as a path tile's hover
// title so the horse/gear effect is visible: "plains 10e ÷2 (horse) = 5e".
function stepExplain(bd: ReturnType<typeof moveCostBreakdown>): string {
  if (!Number.isFinite(bd.base) && !bd.enabled) return `${bd.terrain} — impassable`;
  const parts: string[] = [`${bd.terrain} ${Number.isFinite(bd.base) ? bd.base + "e" : "∞"}`];
  if (bd.enabled) parts.push(`→ ${bd.enabled.to} (${name(bd.enabled.tool)})`);
  for (const d of bd.discounts) parts.push(`− ${d.amount} (${name(d.tool)})`);
  if (bd.transport) parts.push(`÷${bd.transport.divisor} (${name(bd.transport.id)})`);
  return `${parts.join(" ")} = ${round(bd.final)}e`;
}

// Transport role hints (web copy only — mirrors TRANSPORT_MULTIPLIER intent).
const TRANSPORT_ROLE: Record<string, string> = {
  horse: "faster on open ground",
  wagon: "faster on ice",
  mule: "slow but hauls",
};

// --- Direct-line routing (eot) -----------------------------------------------
// The player plans the route by hand: each waypoint draws a NAIVE straight line
// (lineTiles) from the previous point — never an energy-optimal path (finding the
// efficient route is the game). deriveRoute turns the waypoint list into the drawn
// tiles, per-leg block markers, and the split walk/action energy preview. Pure over
// its inputs; recomputed each render, never stored.
type Leg = { tiles: Pos[]; blockedAt: Pos | null };
type DerivedRoute = {
  legs: Leg[];
  drawn: Pos[]; // every leg tile in walk order (the whole plan, drawn even past a block)
  walkable: Pos[]; // the prefix the walk will actually traverse (stops at the first block)
  waypointKeys: Set<string>;
  blockKeys: Set<string>; // each leg's first impassable tile — the red "won't work" markers
  walkCost: number; // movement energy over the walkable prefix
  actionCost: number; // auto-gather energy for resolved workable nodes on the walkable prefix
  blocked: boolean; // any leg hits a wall → Walk disabled
  end: Pos; // last waypoint (or the player, if the route is empty)
};

function deriveRoute(grid: Grid, exp: Expedition, wps: Pos[], resolved: Set<string>, cleared: Set<string>): DerivedRoute {
  const eq = exp.loadout.equipment;
  const legs: Leg[] = [];
  const drawn: Pos[] = [];
  const walkable: Pos[] = [];
  const waypointKeys = new Set<string>();
  const blockKeys = new Set<string>();
  let walkCost = 0;
  let actionCost = 0;
  let globallyBlocked = false; // once the walk hits any wall, later tiles aren't traversed
  let prevWalk: Pos = exp.pos; // previous WALKED tile — sets the next step's diagonal cost
  let legStart: Pos = exp.pos;
  for (const wp of wps) {
    waypointKeys.add(kk(wp));
    const tiles = lineTiles(legStart, wp);
    let blockedAt: Pos | null = null;
    for (const t of tiles) {
      drawn.push(t);
      const passable = Number.isFinite(moveCost(grid.terrain[t.y]![t.x]!, eq.transport, eq.tools)); // impassability is flag-independent
      if (!passable) {
        if (blockedAt === null) { blockedAt = t; blockKeys.add(kk(t)); } // this leg's first block
        globallyBlocked = true;
      } else if (!globallyBlocked) {
        walkable.push(t);
        const diagonal = prevWalk.x !== t.x && prevWalk.y !== t.y;
        walkCost += moveCost(grid.terrain[t.y]![t.x]!, eq.transport, eq.tools, diagonal);
        prevWalk = t;
        if ((exp.autoGather ?? true) && !cleared.has(kk(t)) && resolved.has(kk(t))) {
          const poi = grid.pois.find((p) => p.x === t.x && p.y === t.y);
          if (poi) { const gc = gatherCost(poi, eq.tools); if (gc !== null) actionCost += gc; }
        }
      }
    }
    legs.push({ tiles, blockedAt });
    legStart = wp;
  }
  return { legs, drawn, walkable, waypointKeys, blockKeys, walkCost, actionCost, blocked: legs.some((l) => l.blockedAt !== null), end: wps.length ? wps[wps.length - 1]! : exp.pos };
}

// A click either clears, TRUNCATES (snaps to the earliest walk-order occurrence of a
// tile already on the drawn path — this is the "un-click to unwind" gesture, and it
// resolves self-crossing routes deterministically), or APPENDS a new waypoint. The
// truncation target becomes the new final waypoint.
function routeAfterClick(exp: Expedition, wps: Pos[], to: Pos): Pos[] {
  if (to.x === exp.pos.x && to.y === exp.pos.y) return []; // click self = clear
  // earliest walk-order occurrence of `to` across the legs → truncate there
  let legStart: Pos = exp.pos;
  for (let i = 0; i < wps.length; i++) {
    for (const t of lineTiles(legStart, wps[i]!)) {
      if (t.x === to.x && t.y === to.y) return [...wps.slice(0, i), to];
    }
    legStart = wps[i]!;
  }
  return [...wps, to]; // not on the path → new leg
}

const foodUnits = (food: ItemStack[]) => food.reduce((n, s) => n + s.qty, 0);

// Walk the planned waypoints in order (eot). Each leg is the straight lineTiles from
// the current position to the waypoint, applied as single `move`s validated by reduce
// (D29). After each step, auto-gather the tile the walk landed on (gated by
// autoGather): a node harvests, a FULL BAG pauses the walk with the remaining route
// intact so you can make room and Walk again. The whole walk also halts on the first
// rejection (its true cause, 1te-e) or a walked-into fight (1te-a).
function walkRoute(wps: Pos[]): void {
  const startEnergy = state.expedition!.energy;
  const startFood = state.expedition!.loadout.food;
  let steps = 0;
  let gathered = 0;
  let stopReason: RejectionReason | null = null;
  let engaged = false;
  let bagFull = false;
  const remaining = [...wps];
  walk: while (remaining.length) {
    for (const t of lineTiles(state.expedition!.pos, remaining[0]!)) {
      const moved = reduce(state, { type: "move", to: t });
      const rej = moved.events.find((e): e is Extract<GameEvent, { type: "action-rejected" }> => e.type === "action-rejected");
      if (rej) { stopReason = rej.reason; break walk; }
      state = moved.state;
      if (state.expedition!.combat) { engaged = true; break walk; } // walked into a fight
      steps += 1;
      if (state.expedition!.autoGather ?? true) {
        const g = reduce(state, { type: "gather" });
        if (g.events.some((e) => e.type === "gathered")) { state = g.state; gathered += 1; }
        else if (g.events.some((e) => e.type === "action-rejected" && e.reason === "carry-full")) { bagFull = true; break walk; }
        // other gather rejections (no node / too weak / exhausted) — skip, keep walking
      }
    }
    remaining.shift(); // reached this waypoint
  }
  const exp = state.expedition!;
  // spend/food computed once from start→end state — no per-step sign juggling,
  // so auto-eat refills mid-walk net out correctly and never print "−-45e" (1te-b).
  const net = startEnergy - exp.energy; // >0 spent, <0 net gain from auto-eat
  const delta = net >= 0 ? `−${round(net)}e` : `+${round(-net)}e`;
  const ate = foodUnits(startFood) - foodUnits(exp.loadout.food);
  const ateClause = ate > 0 ? ` · auto-ate ${ate}× ration` : "";
  const gatheredClause = gathered > 0 ? ` · auto-gathered ${gathered}× node${gathered !== 1 ? "s" : ""}` : "";
  if (steps > 0) log.unshift(`🚶 walked ${steps} tile${steps !== 1 ? "s" : ""} → (${exp.pos.x},${exp.pos.y}) · ${delta}${ateClause}${gatheredClause}`);
  if (engaged) log.unshift(`⚔ engaged the ${name(exp.combat!.creature)} — resolve the fight in the panel below`);
  if (bagFull) log.unshift(`🎒 bag full — dropped anchor at (${exp.pos.x},${exp.pos.y}); make room and Walk to resume`);
  if (stopReason) log.unshift(`✋ stopped — ${rejectCopy(stopReason)}`);
  // Preserve the remaining route only on a bag-full pause (resume after making room);
  // a fight or an obstacle clears it so you re-plan from where you are.
  route = bagFull ? remaining : [];
  trimAndDraw();
}

// --- rendering ---------------------------------------------------------------
function draw(): void {
  // boc: every action rebuilds app.innerHTML, which discards the scrollable play
  // window (.gridscroll) and snaps it back to origin. Preserve its scroll offsets
  // across the re-render (save before, restore after) so the view stays put. Only
  // restores when a .gridscroll existed both before and after — phase transitions
  // (town has none) correctly fall through to the fresh element's default 0,0.
  const prev = app.querySelector<HTMLElement>(".gridscroll");
  const keepScroll = prev ? { top: prev.scrollTop, left: prev.scrollLeft } : null;
  app.innerHTML = state.phase === "town" ? townView() : expeditionView();
  if (keepScroll) {
    const next = app.querySelector<HTMLElement>(".gridscroll");
    if (next) { next.scrollTop = keepScroll.top; next.scrollLeft = keepScroll.left; }
  }
  wire(); save();
}

// The inventory grid (pqp/ju3). Each food/potion/battle-item UNIT and each tool
// is its own filled box (no stacking); loot materials stack (one box per stack,
// shown ×qty). Empty boxes pad to `cap`. Worn gear (weapon/armour/transport/
// backpack/panniers) is appended as semi-transparent GHOST boxes — you see your
// whole kit in one place, but ghosts don't spend a real slot. Food burns down
// over the run, so its boxes disappear live as they're eaten.
// vb8: `tip` (from describe(defId)) rides in the title after the name — item
// constants are legible on hover without cluttering the chip.
function slotBox(cls: string, label: string, q: string, tip = ""): string {
  return `<div class="slot ${cls}" title="${label}${q}${tip ? ` — ${tip}` : ""}">${label}${q ? `<span class="q">${q}</span>` : ""}</div>`;
}
// eatFood (mco): on expedition, `eatFood` is the designated auto-eat food defId
// (or null = none designated but still designatable). Food boxes then carry
// data-eatfood for right-click designation, and the active one gets a border + 🍴
// badge. In town it's undefined → plain food boxes, no designation affordance.
function realSlots(loadout: Loadout, carry: ItemStack[], maps: MapItem[] = [], eatFood?: string | null): string[] {
  const boxes: string[] = [];
  const units = (items: ItemStack[], cls: string) => {
    for (const it of items) for (let i = 0; i < it.qty; i++) boxes.push(slotBox(cls, name(it.defId), "", describe(it.defId)));
  };
  // Food boxes (mco): right-clickable to designate as the auto-eat food when on
  // expedition (eatFood !== undefined). The designated one gets `designated` + a badge.
  if (eatFood === undefined) {
    units(loadout.food, "food");
  } else {
    for (const it of loadout.food) for (let i = 0; i < it.qty; i++) {
      const on = it.defId === eatFood;
      const tip = `${on ? "auto-eating — right-click to stop" : "right-click to auto-eat this"} · ${describe(it.defId)}`;
      boxes.push(`<div class="slot food${on ? " designated" : ""}" data-eatfood="${it.defId}" title="${name(it.defId)} — ${tip}">${name(it.defId)}${on ? `<span class="autoeat">🍴</span>` : ""}</div>`);
    }
  }
  units(loadout.potions, "potion");
  units(loadout.battleItems ?? [], "battle");
  units(loadout.enhancements ?? [], "battle"); // weapon enhancements (D60): 1 slot/unit, styled like battle items
  units(loadout.spares ?? [], "tool"); // spare gear (82r): 1 slot per piece, grey like tools; expands into carry at embark
  // ammo (D45): the one deep-stacking consumable — one box per ARROW_STACK_CAP slot, shown ×qty like loot
  for (const it of loadout.ammo ?? []) {
    for (let rest = it.qty; rest > 0; rest -= ARROW_STACK_CAP) {
      boxes.push(slotBox("ammo", name(it.defId), `×${Math.min(rest, ARROW_STACK_CAP)}`, describe(it.defId)));
    }
  }
  for (const t of loadout.equipment.tools) boxes.push(slotBox("tool", name(t), "", describe(t)));
  for (const s of carry) boxes.push(slotBox("loot", name(s.defId), `×${s.qty}`, describe(s.defId)));
  // zpm.2: carried maps NO LONGER use a loot/carry slot — they live in a dedicated
  // map-carry pool (mapCarryCap) and render in their own section below the grid.
  void maps;
  return boxes;
}
function wornGhosts(eq: Equipment): string[] {
  const worn = wornPieces(eq).filter(Boolean) as string[];
  return worn.map((d) => `<div class="slot ghost" title="${name(d)} — worn, no slot · ${describe(d)}">${name(d)}</div>`);
}
// Returns { used, html }. used = real filled slots (ghosts excluded).
function inventoryGrid(loadout: Loadout, carry: ItemStack[], cap: number, maps: MapItem[] = [], eatFood?: string | null): { used: number; html: string } {
  const real = realSlots(loadout, carry, maps, eatFood);
  const boxes = [...real];
  while (boxes.length < cap) boxes.push(`<div class="slot empty">·</div>`);
  const ghosts = wornGhosts(loadout.equipment);
  const ghostStrip = ghosts.length ? `<div class="slots ghosts" title="worn gear — free, doesn't use a slot">${ghosts.join("")}</div>` : "";
  return { used: real.length, html: `<div class="slots">${boxes.join("")}</div>${ghostStrip}` };
}

// q2k: append a notability epithet to a map's name ("… of carbon"), or nothing.
function epithetSuffix(mapSeed: string, biomeId: BiomeId, tier = 1): string {
  const e = mapEpithet(mapSeed, biomeId, tier);
  return e ? ` <span class="muted">of ${e}</span>` : "";
}

// A held map's name suffix: cxq affix labels (explicit, player-inked) take
// precedence over the q2k emergent epithet — the affix IS the notability signal.
function heldMapSuffix(m: MapItem): string {
  const affixes = m.affixes ?? [];
  if (affixes.length) {
    // egd: a title tooltip names the favoured material(s) so an inked map's benefit
    // is legible on the card, not just the moment it was inked.
    const favours = affixes.map(affixMaterialHint).filter(Boolean).map((mat) => name(mat!));
    const tip = favours.length ? ` title="favours ${favours.join(", ")}"` : "";
    return ` <span class="muted"${tip}>of ${affixes.map((a) => AFFIX_EFFECTS[a]?.label ?? a).join(", ")}</span>`;
  }
  return epithetSuffix(m.mapSeed, m.biomeId, m.tier ?? 1);
}

function townView(): string {
  const legal = legalActions(state);
  const craftable = legal.filter((a): a is Extract<Action, { type: "craft" }> => a.type === "craft");
  const lo = state.loadout;
  const eq = lo.equipment;
  const cap = carryCap(eq);
  const inv = inventoryGrid(lo, [], cap);
  const local = localMap(state.seed, state.runs ?? 0);
  const heldMaps = state.maps ?? [];
  const equipRow = (label: string, val: string | null) =>
    `<div class="row"><span class="k">${label}</span><span class="v">${val ?? "<span class='muted'>—</span>"}</span></div>`;

  return `
  <header><h1>Town</h1><span class="muted">seed "${state.seed}"</span><button class="link" data-newgame>new game</button></header>
  <div class="cols">
    <section>
      <h2>Local expedition <span class="muted small">over the hill — free, always available</span></h2>
      <div class="mapoffer">
        <div class="mapcard">
          <b>${local.preview.headline}${epithetSuffix(local.mapSeed, local.biomeId)}</b>
          <button data-embark="${local.mapSeed}">Embark ▶</button>
        </div>
      </div>
      ${lo.food.length === 0 ? `<div class="warn">⚠ no food packed → you embark at full ${MAX_ENERGY} energy but have nothing to eat mid-run — no way to refill your stamina</div>` : ""}
      ${wieldsRanged(lo) && !(lo.ammo ?? []).length ? `<div class="warn">⚠ bow packed with NO ARROWS → it will swing like a club (1 dmg). Pack arrows to shoot.</div>` : ""}
      <div class="muted small">The local map is the free "go nearby" run — a fresh T1 map every visit, never consumed. Better maps come from humanoid drops and are spent on embark.</div>

      <h2 style="margin-top:1rem">Your maps <span class="muted small">earned from drops — spent on embark</span></h2>
      ${heldMaps.length ? `<div class="mapoffer">
        ${heldMaps.map((m) => `
          <div class="mapcard">
            <b>T${m.tier ?? 1} ${name(m.biomeId)} map${heldMapSuffix(m)}</b>
            <span class="muted small">${(state.runs ?? 0) - m.vintage} runs old</span>
            <button data-embark="${m.mapSeed}">Embark ▶ (spend)</button>
            ${Object.keys(INKS).filter((inkId) => legal.some((a) => a.type === "ink" && a.mapSeed === m.mapSeed && a.inkId === inkId)).map((inkId) => `<button data-ink-map="${m.mapSeed}" data-ink-id="${inkId}" title="apply ${name(inkId)} — rolls an affix from its domain onto this map">${name(inkId)}</button>`).join("")}
          </div>`).join("")}
      </div>` : `<div class="muted small">(none yet — kill a humanoid to loot a map)</div>`}
    </section>

    <section>
      <h2>Loadout plan <button class="link" data-reset>reset</button>${loadLastPlan().length && planActions(lo).length === 0 ? ` <button class="link" data-repack title="re-pack the loadout you took last run (skips anything no longer in the bank)">↻ repack last</button>` : ""}</h2>
      ${equipRow("weapon", eq.weapon ? name(eq.weapon) : null)}
      ${equipRow("armour", ARMOUR_SLOTS.map((s) => eq[s]).filter(Boolean).map((d) => name(d as string)).join(", ") || null)}
      ${equipRow("transport", eq.transport ? `${name(eq.transport)}${TRANSPORT_ROLE[eq.transport] ? ` — ${TRANSPORT_ROLE[eq.transport]}` : ""}` : null)}
      ${eq.panniers ? equipRow("panniers", name(eq.panniers)) : ""}
      ${equipRow("backpack", eq.backpack ? name(eq.backpack) : "none")}
      ${equipRow("tools", eq.tools.map(name).join(", ") || null)}
      <div class="row"><span class="k">bag</span><span class="v">${inv.used}/${cap} slots</span></div>
      ${inv.html}
      <div class="muted small">worn gear (ghosted) is free · each food / potion / battle-item / tool takes one slot — bring several tools to work different node types · you embark at ${MAX_ENERGY} energy; packed food holds ≈ ${heldFoodEnergy(lo.food)} energy of refills to eat back as you travel${eq.tools.includes("tent") ? ` · tent — food restores +${Math.round((TENT_FOOD_MULTIPLIER - 1) * 100)}%` : ""}</div>
    </section>

    <section>
      <h2>Bank</h2>
      <div class="bank">
        ${state.bank.map((s) => {
          const slot = slotOf(s.defId);
          const canPack = slot !== null && legal.some((a) => a.type === "pack" && a.slot === slot && a.itemId === s.defId);
          const canSpare = legal.some((a) => a.type === "pack" && a.slot === "spare" && a.itemId === s.defId);
          return `<div class="bankitem">
            <span class="chip" title="${describe(s.defId)}">${name(s.defId)} ×${s.qty}</span>
            ${canPack ? `<button data-pack="${s.defId}" data-slot="${slot}">pack</button>` : `<span class="muted small">${slot ?? "material"}</span>`}
            ${canSpare ? `<button data-pack="${s.defId}" data-slot="spare" title="a SPARE in the bag (1 slot) — don it mid-run to swap gear">+spare</button>` : ""}
          </div>`;
        }).join("")}
      </div>
    </section>

    <section>
      <h2>Recipe book <span class="muted small">one line per output · each ingredient path listed below it</span></h2>
      <div class="craftlist">
        ${(() => {
          const affordable = new Set(craftable.map((a) => a.recipeId));
          // group recipe ids by the defId they output, preserving insertion order
          const byOutput = new Map<string, string[]>();
          const built = new Set(state.stations ?? []); // ke3.2: an already-built station has no rebuild option
          for (const id of Object.keys(RECIPE)) {
            const r = RECIPE[id]!;
            if (r.field) continue; // ke3.4: field-only recipes never render as town rows (they'd be permanently locked)
            if (r.buildsStation && built.has(r.buildsStation)) continue; // hide, don't render locked
            const out = r.output.defId;
            (byOutput.get(out) ?? byOutput.set(out, []).get(out)!).push(id);
          }
          // outputs with any affordable path first, else stable insertion order
          const outputs = [...byOutput.keys()].sort((a, b) => {
            const av = byOutput.get(a)!.some((id) => affordable.has(id)) ? 0 : 1;
            const bv = byOutput.get(b)!.some((id) => affordable.has(id)) ? 0 : 1;
            return av - bv;
          });
          // ke3.3: town tool pool (bank ∪ equipped) → outputScale recipes show
          // their REAL yield at your current knife tier, not the base qty.
          const townTools = [...state.bank.map((s) => s.defId), ...state.loadout.equipment.tools];
          return outputs.map((out) => {
            const ids = byOutput.get(out)!;
            const qty = recipeOutputQty(RECIPE[ids[0]!]!, townTools);
            const anyCan = ids.some((id) => affordable.has(id));
            const paths = ids.map((id) => {
              const r = RECIPE[id]!;
              const ing = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
              const can = affordable.has(id);
              // gate-legibility (playtest 2026-07-09 #1): a locked row named its
              // ingredients but not its STATION/TOOL gate — players only inferred
              // "I lack mats." If a hard gate (station/tool) is unmet, name it.
              const req = r.requires;
              const gateUnmet = !can && req && (
                (req.station && !built.has(req.station)) ||
                (req.tools?.some((t) => !townTools.includes(t)))
              );
              const gate = gateUnmet ? recipeGateHint(id) : null;
              return `<div class="craftpath${can ? "" : " locked"}">← ${ing}${
                can ? ` <button data-craft="${id}">craft ✓</button>` : gate ? ` <span class="warn small">🔒 ${gate}</span>` : ""
              }</div>`;
            }).join("");
            const hint = weaponHint(out) ?? logisticsEffect(out) ?? enhancementHint(out); // 57l weapon hint; wzk range/carry; 7ao coating effect (disjoint sets)
            return `<div class="craftgroup${anyCan ? "" : " locked"}">
              <div class="craftname" title="${describe(out)}">${qty}× ${name(out)}${hint ? ` <span class="muted small">· ${hint}</span>` : ""}</div>
              ${paths}
            </div>`;
          }).join("");
        })()}
      </div>
    </section>
  </div>
  ${logView()}`;
}

// What the player is standing on — always shown, so gather/fight has context.
function herePanel(grid: Grid, exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
  const pos = exp.pos;
  const poi = grid.pois.find((p) => p.x === pos.x && p.y === pos.y);
  const cleared = exp.cleared.some((c) => c.x === pos.x && c.y === pos.y);
  const terrain = grid.terrain[pos.y]![pos.x]!;
  const canGather = legal.some((a) => a.type === "gather");
  const canFight = legal.some((a) => a.type === "fight");

  if (!poi || cleared) {
    const clearedText = poi?.kind === "monster"
      ? ` · you cleared the ${name(poi.creature!)} that was here`
      : cleared ? " · a worked-out node (nothing left)" : " · nothing to do";
    return `<div class="here"><b>Here:</b> open ${terrain}${clearedText}.</div>`;
  }
  if (poi.kind === "monster" && poi.creature) {
    // You're standing on it, so it's always within perception range.
    const per = perceive(grid, exp.pos, exp.loadout.equipment.tools, exp.surveyed ?? []).find((p) => p.x === poi.x && p.y === poi.y);
    const desc = flavorDetail(per?.detail ?? null, "monster");
    // Standing on a live, un-engaged monster shouldn't happen in normal play
    // (move-onto-tile auto-engages, grid gen bars POIs from the entry tile,
    // victory relocation lands only on cleared tiles) — this branch is kept
    // defensively for hand-built/test states. No pre-fight forecast here; that
    // lives in the walk-in path banner (§5), where the decision actually happens.
    return `<div class="here monster">
      <b>Here:</b> a <b>${name(poi.creature!)}</b> — <i>${desc}</i>.
      It's static: it won't touch you unless you Fight. You can just walk past it.
      ${canFight ? `<button data-act="fight">⚔ Engage the ${name(poi.creature!)}</button>` : `<span class="warn">can't fight (bag full for its loot?)</span>`}
    </div>`;
  }
  // gatherable node
  const verb = GATHER_VERB[poi.kind]!;
  // D78: the material's ACCESS gate (any-of tool list), or null when ungated.
  const gate = poi.material ? (MATERIAL_GATE[poi.material]?.tools ?? null) : null;
  const gateSatisfied = !gate || gate.some((t) => exp.loadout.equipment.tools.includes(t));
  // gate-legibility (playtest 2026-07-09 #1): distinguish the two "can't gather"
  // reasons and name each. NO tool of the required KIND → "needs a knife"; has the
  // kind but the material is access-gated by a tool you lack → "needs iron-pick or …".
  const needCap = NODE_TOOL[poi.kind as GatherableNodeType];
  const hasToolKind = !needCap || exp.loadout.equipment.tools.some((t) => TOOL_CAPABILITY[t] === needCap);
  const toolLocked = !canGather && !hasToolKind;
  const gateLocked = !canGather && hasToolKind && !gateSatisfied;
  const locked = toolLocked || gateLocked;
  const article = /^[aeiou]/i.test(verb.noun) ? "an" : "a";
  return `<div class="here ${locked ? "locked" : ""}">
    <b>Here:</b> ${article} ${verb.noun} — <b>${name(poi.material!)}</b>${gate ? ` <span class="tier">gated</span>` : ""}.
    ${canGather ? `<button data-act="gather">${verb.label} it</button>`
      : toolLocked ? `🔒 <span class="warn">${nodeToolHint(poi.kind as GatherableNodeType)} to work ${name(poi.material!)}</span>`
      : gateLocked ? `🔒 <span class="warn">locked — needs ${gate!.join(" or ")} to work ${name(poi.material!)}</span>`
      : `<span class="warn">can't ${verb.past.replace(/ed$/, "")} — bag full (need a free loot slot)</span>`}
  </div>`;
}

// Weapon-enhancement readout (D60): the active coating + charges left, or nothing.
function coatingLine(exp: NonNullable<GameState["expedition"]>): string {
  const b = exp.weaponBuff;
  if (!b) return "";
  return ` · 🗡️ ${name(b.id)} · ${b.charges} left`;
}
// An "Apply <enhancement>" button per carried enhancement (D60) — legality from
// reduce (D29). Works engaged or unengaged; applying over an active coating replaces it.
function enhanceButtons(exp: NonNullable<GameState["expedition"]>): string {
  return (exp.loadout.enhancements ?? []).map((s) => {
    const e = WEAPON_ENHANCEMENT[s.defId];
    const eff = e ? [e.flatDamage ? `+${e.flatDamage} dmg` : "", e.affinityTag ? `×2 vs ${e.affinityTag}` : "", e.poison ? `poison ${e.poison.dmg}/rd ×${e.poison.rounds}` : ""].filter(Boolean).join(", ") : "";
    return `<button data-enhance="${s.defId}" title="coat your weapon (${e?.charges ?? 0} charges: ${eff})${exp.weaponBuff ? " — replaces the current coating" : ""}">🗡️ Apply ${name(s.defId)}${s.qty > 1 ? ` ×${s.qty}` : ""}</button>`;
  }).join("");
}

// The engagement panel replaces herePanel while a live fight is in progress
// (exp.combat set): monster HP bar, per-round forecast (the honest race —
// toKill vs toDie, no potion double-count), and Fight/Flee/Potion/auto-quaff.
function engagementPanel(exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
  const c = exp.combat!;
  const maxHp = MONSTER_TIER_HP_CURVE[MONSTERS[c.creature]!.tier]!;
  const dmgOut = playerDamage(exp.loadout, c.creature, exp.weaponBuff) + c.damageAdd; // D60: forecast reflects the coating
  const dmgIn = damageTaken(exp.loadout, c.creature, c.mitigationAdd);
  const toKill = Math.ceil(c.monsterHp / dmgOut);
  const toDie = Math.ceil(exp.hp / dmgIn); // raw race — potions extend it (noted in the forecast line)
  const winning = toKill <= toDie;
  const canQuaff = legal.some((a) => a.type === "quaff");
  // Quiver readout (D45): a wielded bow spends an arrow per round; empty = club.
  const arrows = (exp.loadout.ammo ?? []).reduce((n, s) => n + s.qty, 0);
  const quiver = wieldsRanged(exp.loadout) ? ` · 🏹 ${arrows} arrow${arrows === 1 ? "" : "s"}${arrows === 0 ? " — swinging it like a club!" : ""}` : "";
  // 67e: damage-change feedback — diff this forecast against the last render's so a
  // coat/swap/potion shows its effect ("→ kill in 3", "(was 4.5)"). Reset per fight.
  const key = `${c.creature}@${c.at.x},${c.at.y}`;
  const prev = lastForecast && lastForecast.key === key ? lastForecast : null;
  const dmgWas = prev && round(prev.dmgOut) !== round(dmgOut) ? ` <span class="was">(was ${round(prev.dmgOut)})</span>` : "";
  const killWas = prev && winning && prev.toKill !== toKill ? ` <span class="was">(was ${prev.toKill})</span>` : "";
  lastForecast = { key, dmgOut, toKill };
  return `<div class="here monster engagement">
    <b>⚔ Engaged: ${name(c.creature)}</b>
    <div class="bar"><span>Its HP</span><div class="track"><div class="fill monster" style="width:${(c.monsterHp / maxHp) * 100}%"></div></div><b>${round(c.monsterHp)}/${maxHp}</b></div>
    <div class="forecast">you hit for <b>${round(dmgOut)}</b>${dmgWas} · it hits for <b>${round(dmgIn)}</b> · <b class="${winning ? "good" : "over"}">${winning ? `kill in ${toKill}` : `it kills you first (~${toDie} rounds)`}</b>${killWas}${exp.loadout.potions.length ? ` · ${exp.loadout.potions.reduce((n, p) => n + p.qty, 0)} potion(s) extend that` : ""}${quiver}${coatingLine(exp)}${c.poison ? ` · ☠ poisoned (${round(c.poison.dmg)}/rd, ${c.poison.rounds} left)` : ""}</div>
    <div class="actions">
      <button data-act="fight">⚔ Fight (1 round)</button>
      <button data-act="flee" title="disengage — take one parting hit (${round(dmgIn)}); unused battle items keep for later">🏃 Flee (−${round(dmgIn)} HP)</button>
      ${canQuaff ? `<button data-act="quaff" title="drink a potion — costs a turn (the ${name(c.creature)} strikes)">🧪 Potion</button>` : `<button disabled title="no potions, or full HP">🧪 Potion</button>`}
      <button data-act="toggle-auto-quaff">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
      <button data-act="toggle-auto-finish" title="fast-forward whole fights to victory or defeat in one click">Auto-finish: <b>${(exp.autoFinish ?? false) ? "on" : "off"}</b></button>
      ${(exp.loadout.battleItems ?? []).map((s) => { const b = COMBAT_BUFF[s.defId] ?? {}; const eff = [b.damageAdd ? `+${b.damageAdd} dmg` : "", b.mitigationAdd ? `+${b.mitigationAdd} mitigation` : ""].filter(Boolean).join(", "); return `<button data-use-item="${s.defId}" title="use it this fight only (${eff})">⚗ ${name(s.defId)} (${eff})${s.qty > 1 ? ` ×${s.qty}` : ""}</button>`; }).join("")}
      ${enhanceButtons(exp)}
      ${swapGearButtons(exp, legal)}
    </div>
  </div>`;
}

// 67e: mid-fight gear swaps — don from carry / doff worn, each costs a monster turn
// (legality from reduce, D29). Prominent in the panel so "swap to the armour that
// resists this" is a real in-fight verb.
function swapGearButtons(exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
  const creature = name(exp.combat!.creature);
  const dons = legal.filter((a): a is Extract<Action, { type: "don" }> => a.type === "don")
    .map((a) => `<button data-don="${a.itemId}" title="equip ${name(a.itemId)} — costs a turn (the ${creature} strikes)">🛡 Don ${name(a.itemId)}</button>`);
  const doffs = legal.filter((a): a is Extract<Action, { type: "doff" }> => a.type === "doff")
    .map((a) => `<button data-doff="${a.itemId}" title="stow ${name(a.itemId)} — costs a turn (the ${creature} strikes)">🎒 Doff ${name(a.itemId)}</button>`);
  return [...dons, ...doffs].join("");
}

function expeditionView(): string {
  const exp = state.expedition!;
  const grid = expeditionGrid(exp);
  const legal = legalActions(state);

  const poiAt = new Map(grid.pois.map((p) => [kk(p), p]));
  const perceived = new Map(
    perceive(grid, exp.pos, exp.loadout.equipment.tools, exp.surveyed ?? []).map((p) => [`${p.x},${p.y}`, p]),
  );
  const cleared = new Set(exp.cleared.map(kk));
  const resolved = new Set([...perceived].filter(([, p]) => p.detail != null).map(([key]) => key));
  const rt = deriveRoute(grid, exp, route, resolved, cleared);
  const drawnSet = new Set(rt.drawn.map(kk));
  const goalK = kk(rt.end);

  let cells = "";
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const k = `${x},${y}`;
    const isPlayer = exp.pos.x === x && exp.pos.y === y;
    const poi = poiAt.get(k);
    const isCleared = cleared.has(k);
    const cls = ["tile", `terrain-${grid.terrain[y]![x]}`];
    if (poi && !isCleared) cls.push("poi", `poi-${poi.kind}`);
    if (isPlayer) cls.push("player");
    const onPath = drawnSet.has(k);
    const isBlock = rt.blockKeys.has(k);
    let stepBd: ReturnType<typeof moveCostBreakdown> | null = null;
    if (isBlock) {
      cls.push("path", "path-blocked"); // the red "this won't work" marker
    } else if (onPath) {
      cls.push("path");
      stepBd = moveCostBreakdown(grid.terrain[y]![x]!, exp.loadout.equipment.transport, exp.loadout.equipment.tools);
      if (stepBd.enabled) cls.push("path-enabled");
      else if (stepBd.discounts.length) cls.push("path-tool");
      else if (stepBd.transport) cls.push("path-transport");
    }
    if (rt.waypointKeys.has(k)) cls.push("path-waypoint");
    if (route.length && k === goalK) cls.push("path-goal");
    // D78: loadout-aware lock — a gated material whose any-of tool list is
    // unsatisfied by the currently-equipped tools (strictly better than the old
    // tier>1 marker: it clears once you're carrying the key).
    const gate = poi && !isCleared && poi.material ? (MATERIAL_GATE[poi.material]?.tools ?? null) : null;
    const locked = gate !== null && !gate.some((t) => exp.loadout.equipment.tools.includes(t));
    if (locked) cls.push("locked");
    const ch = isPlayer ? PLAYER_CHAR : isCleared ? "·" : poi ? POI_CHAR[poi.kind] : TERRAIN_CHAR[grid.terrain[y]![x]!];
    const per = poi ? perceived.get(k) : undefined;
    // gate-legibility (playtest 2026-07-09 #1, node gate/reach visibility): a
    // surveyed / in-vision node names its ACCESS GATE at range (nodeGateNote reads
    // the PERCEIVED, range-gated gate) so a far vein's worth-the-trek and its
    // unlocking tool are legible — an agent trekked 50 tiles only to learn a node
    // was locked. Honest to sight: an out-of-range node (per.detail null) reveals nothing.
    const tierNote = per ? nodeGateNote(per.detail) : null;
    const title = stepBd
      ? stepExplain(stepBd)
      : poi && !isCleared // a cleared tile shows '·' — its title must not keep the stale poi text (1te-d)
      ? (per && per.detail
          ? `${poi.kind} · ${flavorDetail(per.detail, poi.kind)}${tierNote ? ` · ${tierNote}` : ""}`
          : poi.kind === "monster" ? "a monster" : `a ${poi.kind} node`)
      : grid.terrain[y]![x]!;
    // 48l.6 trial: paint the terrain tile texture + overlay a ¾ billboard sprite
    // on monster POIs / a node icon where we have one. Flag-gated; the real
    // delivery is an atlas+manifest keyed by defId.
    let trialStyle = "";
    let overlay = "";
    if (ASSET_TRIAL) {
      const bg = TILE_BG[grid.terrain[y]![x]!];
      if (bg) trialStyle = ` style="background-image:url('${bg}')"`;
      if (poi && !isCleared) {
        if (poi.kind === "monster") {
          const keys = Object.keys(MONSTER_SPRITES);
          const cr = poi.creature && MONSTER_SPRITES[poi.creature] ? poi.creature : keys[(x * 31 + y * 17) % keys.length]!;
          const sp = MONSTER_SPRITES[cr];
          const msz = MONSTER_SIZE[cr] ?? 48;
          if (sp) overlay = `<img class="sprite" src="${sp}" style="width:${msz}px;height:${msz}px" alt="">`;
        } else if (NODE_ICON[poi.kind]) {
          overlay = `<img class="nodeicon" src="${NODE_ICON[poi.kind]}" alt="">`;
        }
      }
    }
    const glyph = ASSET_TRIAL && !isPlayer && (overlay !== "" || !poi) ? "" : ch;
    cells += `<div class="${cls.join(" ")}"${trialStyle} data-x="${x}" data-y="${y}" title="${title}">${overlay}${glyph}</div>`;
  }

  const maxEnergy = exp.maxEnergy ?? MAX_ENERGY;
  // With a route planned, split the energy bar: the part you'll KEEP (green) + the
  // part it'll SPEND (orange, red if it would strand you). Planned = walk + auto-gather.
  const hasRoute = route.length > 0;
  const total = rt.walkCost + rt.actionCost;
  const overBudget = hasRoute && total > exp.energy;
  const spend = Math.min(total, exp.energy); // clamp — a huge route must never blow out the bar
  const keep = exp.energy - spend;
  const pct = (v: number) => Math.min(100, (v / maxEnergy) * 100);
  // energy may exceed maxEnergy after a manual over-eat (m0a) — cap the bar fill at
  // 100% and surface the surplus rather than overflowing the track.
  const overFull = !hasRoute && exp.energy > maxEnergy;
  const overSpan = overFull ? ` <span class="overfull">+${round(exp.energy - maxEnergy)}</span>` : "";
  const energyFill = hasRoute
    ? `<div class="fill energy" style="width:${pct(keep)}%"></div><div class="fill spend${overBudget ? " over" : ""}" style="width:${pct(spend)}%"></div>`
    : `<div class="fill energy" style="width:${pct(exp.energy)}%"></div>`;
  const energyLabel = hasRoute
    ? `${round(exp.energy)}/${maxEnergy} → <b class="${overBudget ? "over" : ""}">${round(Math.max(0, exp.energy - total))}</b>${overBudget ? " ⚠ strands you" : ""}`
    : `${round(exp.energy)}/${maxEnergy}${overSpan}`;
  const autoGatherOn = exp.autoGather ?? true;
  const bars = `
    <div class="bar"><span>Energy</span><div class="track">${energyFill}</div><b>${energyLabel}</b></div>
    <div class="bar"><span>HP</span><div class="track"><div class="fill hp" style="width:${Math.min(100, (exp.hp / 30) * 100)}%"></div></div><b>${round(exp.hp)}</b></div>
    <div class="muted small">🌿 auto-gather <b>${autoGatherOn ? "on" : "off"}</b> — <button class="link" data-toggle-autogather>${autoGatherOn ? "walk over nodes without harvesting" : "harvest nodes you cross"}</button></div>`;

  // End-of-route affordances (eot): the LAST waypoint drives Fight/Shoot/Survey.
  const endPoi = route.length ? poiAt.get(goalK) : undefined;
  const fight = endPoi && endPoi.kind === "monster" && endPoi.creature && !cleared.has(goalK) ? endPoi.creature : undefined;
  const shoot = fight !== undefined && legal.some((a) => a.type === "fight" && a.at !== undefined && a.at.x === rt.end.x && a.at.y === rt.end.y);
  const costClause = `<b class="${overBudget ? "over" : ""}">−${round(rt.walkCost)} walk${rt.actionCost > 0 ? ` + −${round(rt.actionCost)} gather` : ""}${rt.actionCost > 0 ? ` = −${round(total)}` : ""} energy</b>`;
  const forecastClause = fight
    ? (() => {
        const f = combatForecast(exp.loadout, fight, exp.hp, exp.weaponBuff); // D60: reflects an active coating
        return ` · <span class="forecast" title="bare-kit forecast — battle items apply when the fight starts">forecast: you hit ${round(f.dmgOut)}, it hits ${round(f.dmgIn)} — <b class="${f.winning ? "good" : "over"}">${f.winning ? `kill in ${f.toKill}` : "it wins the race"}</b></span>`;
      })()
    : "";
  const surveyAtEnd = legal.some((a) => a.type === "survey" && a.at.x === rt.end.x && a.at.y === rt.end.y);
  const pathBanner = exp.combat
    ? `<div class="pathbanner engaged">⚔ <b>ENGAGED — the ${name(exp.combat.creature)}</b> · fight or flee in the panel below ↓</div>`
    : hasRoute
    ? `<div class="pathbanner${rt.blocked ? " blocked" : ""}">${rt.blocked ? `<b class="over">✗ blocked — a leg crosses impassable terrain (red).</b> Click a tile on the line to unwind past it, or reroute. · ` : ""}${fight ? `⚔ walk in &amp; <b>fight the ${name(fight)}</b> · ` : ""}→ (${rt.end.x},${rt.end.y}): ${rt.walkable.length} tile${rt.walkable.length !== 1 ? "s" : ""}, ${costClause}${forecastClause} · <button data-walk${rt.blocked ? " disabled title=\"clear the blocked leg first\"" : ""}>${fight ? "Fight ▶" : "Walk ▶"}</button> ${shoot ? `<button data-shoot title="engage from here with your bow — your opener lands before it can answer, and you don't step in">🏹 Shoot</button> ` : ""}${surveyAtEnd ? `<button data-survey-x="${rt.end.x}" data-survey-y="${rt.end.y}" title="study it through the glass without walking over — resolves its detail for −${SURVEY_ENERGY}e">🔭 Survey (−${SURVEY_ENERGY}e)</button> ` : ""}<button class="link" data-cancelpath>cancel</button></div>`
    : `<div class="pathbanner muted">Click a tile → draws a straight line + previews energy. Click more tiles to add waypoints; click a tile already on the line to unwind to it. Then <b>Walk</b>. Monsters (<b>X</b>) are fought when your line reaches them.</div>`;

  const cap = carryCap(exp.loadout.equipment);
  const inv = inventoryGrid(exp.loadout, exp.carry, cap, exp.carriedMaps ?? [], exp.autoEatFood ?? null);
  return `
  <header><h1>${rollBiome(exp.mapSeed)} expedition</h1><span class="muted">pos (${exp.pos.x},${exp.pos.y})</span><button class="link" data-newgame>new game</button></header>
  <div class="cols">
    <section class="mapwrap">
      ${bars}
      ${pathBanner}
      <div class="gridscroll"><div class="grid${ASSET_TRIAL ? " asset-trial" : ""}" style="grid-template-columns:repeat(${MAP_WIDTH}, ${ASSET_TRIAL ? "32px" : "1.4rem"});">${cells}</div></div>
    </section>
    <section>
      ${exp.combat ? engagementPanel(exp, legal) : herePanel(grid, exp, legal)}
      <h2>Actions</h2>
      <div class="actions">
        ${legal.some((a) => a.type === "eat") ? `<button data-act="eat">🍖 Eat${exp.loadout.equipment.tools.includes("tent") ? " (+50%)" : ""}</button>` : `<button disabled title="no food, or already full">🍖 Eat</button>`}
        ${legal.some((a) => a.type === "quaff") ? `<button data-act="quaff" title="drink a potion here (−${QUAFF_ENERGY}e)">🧪 Potion (−${QUAFF_ENERGY}e)</button>` : `<button disabled title="no potions, full HP, or too tired">🧪 Potion</button>`}
        <button data-act="toggle-auto-quaff" title="auto-drink a potion when HP drops below the threshold mid-fight">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
        <button data-act="toggle-auto-finish" title="67e: fast-forward whole fights to victory or defeat in one click — flip off to make in-fight decisions">Auto-finish fights: <b>${(exp.autoFinish ?? false) ? "on" : "off"}</b></button>
        ${enhanceButtons(exp)}
        <button data-act="return">⏎ Return to town</button>
      </div>
      ${exp.weaponBuff ? `<div class="muted small">🗡️ active coating: <b>${name(exp.weaponBuff.id)}</b> · ${exp.weaponBuff.charges} strike${exp.weaponBuff.charges === 1 ? "" : "s"} left</div>` : ""}
      ${(() => {
        // ke3.4: field-craft list — legal craft candidates on expedition (reduce
        // has already filtered to field recipes you can make right here).
        const fieldCrafts = legal.filter((a): a is Extract<Action, { type: "craft" }> => a.type === "craft");
        const craftable = new Set(fieldCrafts.map((a) => a.recipeId));
        const pool = [...exp.loadout.equipment.tools, ...exp.carry.map((s) => s.defId)];
        // gate-legibility (playtest 2026-07-09 #1, field-craft discoverability): 3/3
        // testers never found field crafting because the panel only appeared once the
        // kit was already equipped — the fire-kit was an unmarked key. Show the DOOR
        // before the key: any field recipe gated on a kit-tool you lack renders greyed
        // with its "needs: fire-kit" requirement, so the branch is visible to plan for.
        const kitLocked = Object.keys(RECIPE).filter((id) => {
          const r = RECIPE[id]!;
          if (!r.field || craftable.has(id)) return false;
          const tools = r.requires?.tools;
          return tools && tools.some((t) => !pool.includes(t)); // missing a kit-tool
        });
        if (!fieldCrafts.length && !kitLocked.length) return "";
        const readyRows = fieldCrafts.map((a) => {
          const r = RECIPE[a.recipeId]!;
          const ing = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
          return `<div class="craftpath">🔥 <button data-craft="${a.recipeId}" title="field-craft (−${FIELD_CRAFT_ENERGY}e)">craft ✓</button> ${recipeOutputQty(r, pool)}× ${name(r.output.defId)} <span class="muted small">← ${ing}</span></div>`;
        }).join("");
        const lockedRows = kitLocked.map((id) => {
          const r = RECIPE[id]!;
          const ing = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
          return `<div class="craftpath locked">🔒 ${r.output.qty}× ${name(r.output.defId)} <span class="muted small">← ${ing}</span> <span class="warn small">${recipeGateHint(id)}</span></div>`;
        }).join("");
        return `<h2>Field craft <span class="muted small">−${FIELD_CRAFT_ENERGY}e each</span></h2><div class="craftlist">${readyRows}${lockedRows}</div>`;
      })()}
      <h2>Bag <span class="muted small">${inv.used}/${cap} slots</span></h2>
      ${inv.html}
      <div class="muted small">🍴 auto-eat: ${exp.autoEatFood ? `<b>${name(exp.autoEatFood)}</b> refills your energy as you travel — right-click it to stop` : "off — right-click a food unit in the bag to auto-eat it (waste-free refills)"}</div>
      <div class="muted small">food (green) is eaten to refill energy as you travel — freeing slots for loot (gold). Potions purple · battle items red · tools grey · worn gear ghosted (free).</div>
      ${exp.carry.length ? `<div class="bank" style="margin-top:.5rem">${exp.carry.map((s) => `<div class="bankitem"><span class="chip" title="${describe(s.defId)}">${name(s.defId)} ×${s.qty}</span>${legal.some((a) => a.type === "don" && a.itemId === s.defId) ? `<button data-don="${s.defId}" title="equip it (−${DON_DOFF_ENERGY}e; swaps the worn piece into the bag)">don</button>` : ""}<button data-drop="${s.defId}">drop</button></div>`).join("")}</div>` : ""}
      ${(() => { const doffable = legal.filter((a) => a.type === "doff").map((a) => (a as { itemId: string }).itemId); return doffable.length ? `<div class="bank" style="margin-top:.5rem">${doffable.map((id) => `<div class="bankitem"><span class="chip" title="worn · ${describe(id)}">${name(id)} (worn)</span><button data-doff="${id}" title="stow it in the bag (−${DON_DOFF_ENERGY}e; takes a slot)">doff</button></div>`).join("")}</div>` : ""; })()}
      ${(exp.carriedMaps ?? []).length ? `<div class="muted" style="margin-top:.5rem;font-size:.85em">carried maps ${(exp.carriedMaps ?? []).length}/${mapCarryCap(state.bank)} map-pocket</div><div class="bank">${(exp.carriedMaps ?? []).map((m) => `<div class="bankitem"><span class="chip" title="map-pocket (separate from loot slots) — banks as a held map when the run ends">🗺️ T${m.tier ?? 1} ${name(m.biomeId)} map</span><button data-drop-map="${m.mapSeed}">drop</button></div>`).join("")}</div>` : ""}
    </section>
  </div>
  ${logView()}`;
}

function logView(): string {
  return `<section class="logbox"><h2>Log</h2>${log.length ? log.map((l) => `<div class="logline">${l}</div>`).join("") : `<span class="muted">—</span>`}</section>`;
}

// --- wiring: attach handlers after each render -------------------------------
function wire(): void {
  app.querySelectorAll<HTMLElement>("[data-embark]").forEach((el) => el.onclick = () => apply({ type: "embark", mapSeed: el.dataset.embark! }));
  app.querySelectorAll<HTMLElement>("[data-craft]").forEach((el) => el.onclick = () => apply({ type: "craft", recipeId: el.dataset.craft! }));
  app.querySelectorAll<HTMLElement>("[data-pack]").forEach((el) => el.onclick = () => apply({ type: "pack", slot: el.dataset.slot as LoadoutSlot, itemId: el.dataset.pack! }));
  app.querySelectorAll<HTMLElement>("[data-drop]").forEach((el) => el.onclick = () => apply({ type: "drop", itemId: el.dataset.drop! }));
  app.querySelectorAll<HTMLElement>("[data-don]").forEach((el) => el.onclick = () => apply({ type: "don", itemId: el.dataset.don! }));
  app.querySelectorAll<HTMLElement>("[data-doff]").forEach((el) => el.onclick = () => apply({ type: "doff", itemId: el.dataset.doff! }));
  app.querySelectorAll<HTMLElement>("[data-drop-map]").forEach((el) => el.onclick = () => apply({ type: "drop-map", mapSeed: el.dataset.dropMap! }));
  app.querySelectorAll<HTMLElement>("[data-use-item]").forEach((el) => el.onclick = () => apply({ type: "use-item", itemId: el.dataset.useItem! }));
  app.querySelectorAll<HTMLElement>("[data-enhance]").forEach((el) => el.onclick = () => apply({ type: "enhance", id: el.dataset.enhance! }));
  app.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => el.onclick = () => { route = []; apply({ type: el.dataset.act! } as Action); });
  const gatherToggle = app.querySelector<HTMLElement>("[data-toggle-autogather]"); if (gatherToggle) gatherToggle.onclick = () => apply({ type: "toggle-auto-gather" });
  // Auto-eat designation (mco): right-click a food box to set it as the auto-eat
  // food; right-clicking the already-designated one clears it (null = off).
  app.querySelectorAll<HTMLElement>("[data-eatfood]").forEach((el) => el.oncontextmenu = (ev) => {
    ev.preventDefault();
    const defId = el.dataset.eatfood!;
    apply({ type: "set-auto-eat-food", defId: state.expedition?.autoEatFood === defId ? null : defId });
  });
  const reset = app.querySelector<HTMLElement>("[data-reset]"); if (reset) reset.onclick = () => planReset();
  const repack = app.querySelector<HTMLElement>("[data-repack]"); if (repack) repack.onclick = () => repackLast();
  const cancel = app.querySelector<HTMLElement>("[data-cancelpath]"); if (cancel) cancel.onclick = () => { route = []; draw(); };
  const walk = app.querySelector<HTMLElement>("[data-walk]"); if (walk) walk.onclick = () => { const d = currentDerived(); if (d && !d.blocked) walkRoute(route); };
  // Shoot (D45): ranged engage on the LAST waypoint — stays put, spends no energy
  const shoot = app.querySelector<HTMLElement>("[data-shoot]"); if (shoot) shoot.onclick = () => { const at = route[route.length - 1]; if (at) { route = []; apply({ type: "fight", at }); } };
  // Survey (54f): resolve the last waypoint's detail at range, stay put
  const surveyBtn = app.querySelector<HTMLElement>("[data-survey-x]"); if (surveyBtn) surveyBtn.onclick = () => { const at = { x: Number(surveyBtn.dataset.surveyX), y: Number(surveyBtn.dataset.surveyY) }; route = []; apply({ type: "survey", at }); };
  app.querySelectorAll<HTMLElement>("[data-ink-map]").forEach((el) => el.onclick = () => apply({ type: "ink", mapSeed: el.dataset.inkMap!, inkId: el.dataset.inkId! }));
  app.querySelectorAll<HTMLElement>("[data-newgame]").forEach((el) => el.onclick = () => { if (confirm("Start a new game? This wipes the current run.")) newRun(); });
  app.querySelectorAll<HTMLElement>(".tile[data-x]").forEach((el) => {
    const handler = (ev: Event) => { ev.preventDefault(); onTileClick({ x: Number(el.dataset.x), y: Number(el.dataset.y) }); };
    el.onclick = handler;
    el.oncontextmenu = handler; // right-click works too
  });
}

// Recompute the derived route from the live state + `route` waypoints, for wire
// handlers that run outside the render (Walk needs the walkable tiles + blocked flag).
function currentDerived(): DerivedRoute | null {
  const exp = state.expedition;
  if (!exp) return null;
  const grid = expeditionGrid(exp);
  const perceived = new Map(perceive(grid, exp.pos, exp.loadout.equipment.tools, exp.surveyed ?? []).map((p) => [`${p.x},${p.y}`, p]));
  const resolved = new Set([...perceived].filter(([, p]) => p.detail != null).map(([k]) => k));
  const cleared = new Set(exp.cleared.map(kk));
  return deriveRoute(grid, exp, route, resolved, cleared);
}

// A tile click builds the plan (eot): clear on self, TRUNCATE if the tile is already
// on the drawn line (earliest walk-order occurrence — handles self-crossing), else
// APPEND a new waypoint. No pathfinding — the line geometry is whatever routeAfterClick
// draws; a leg crossing a wall just shows a red marker and disables Walk.
function onTileClick(to: Pos): void {
  const exp = state.expedition;
  if (!exp) return;
  route = routeAfterClick(exp, route, to);
  draw();
}

draw();
