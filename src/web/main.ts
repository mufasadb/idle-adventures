// Interactive web driver (the human side of the two-driver design, spec §12).
// A thin, stateful shell over the pure engine: every button/cell click builds an
// Action, folds it through `reduce`, and re-renders. legalActions(state) drives
// what's offered, so the UI can never diverge from what the engine accepts.
// Pathing (A*) is a UI convenience — it only proposes a sequence of `move`
// actions; each step is still validated by `reduce`.
import { newGame, candidateMaps, mapEpithet } from "../engine/town";
import { reduce } from "../engine/reduce";
import { legalActions } from "../sim/legal";
import { expeditionGrid, rollBiome } from "../engine/grid";
import type { Grid } from "../engine/grid";
import { slotOf } from "../engine/catalog";
import { recipeOutputQty } from "../engine/craft";
import { moveCost, moveCostBreakdown } from "../engine/move";
import { costToReach } from "../engine/reach";
import { carryCap } from "../engine/carry";
import { heldFoodEnergy } from "../engine/food";
import { damageTaken, playerDamage, wieldsRanged } from "../engine/combat";
import { RECIPE, MATERIAL_TIER, MAP_WIDTH, MAP_HEIGHT, MAX_ENERGY, TENT_FOOD_MULTIPLIER, MONSTER_TIER_HP_CURVE, MONSTERS, QUAFF_ENERGY, DON_DOFF_ENERGY, ARROW_STACK_CAP, TERRAIN_GATE, COMBAT_BUFF, SURVEY_ENERGY, FIELD_CRAFT_ENERGY, INKS, AFFIX_EFFECTS, NODE_TOOL, TOOL_CAPABILITY, WEAPON_ENHANCEMENT } from "../data/constants";
import type { BiomeId, GatherableNodeType } from "../data/constants";
import { TERRAIN_CHAR, POI_CHAR, PLAYER_CHAR, flavorDetail, matchupLessons, weaponHint, logisticsEffect, describe, recipeGateHint, recipeTerrainGate, nodeToolHint, nodeTierNote } from "../render/render";
import { perceive } from "../engine/perceive";
import type { GameState, Action, GameEvent, ItemStack, Loadout, Equipment, LoadoutSlot, MapItem, RejectionReason } from "../engine/types";

// Per-node verb so the UI reads right: you don't "mine" an animal.
const GATHER_VERB: Record<string, { label: string; past: string; noun: string }> = {
  mining: { label: "⛏ Mine", past: "mined", noun: "ore vein" },
  wood: { label: "🪓 Chop", past: "chopped", noun: "stand of trees" },
  herb: { label: "🌿 Forage", past: "foraged", noun: "herb patch" },
  animal: { label: "🔪 Hunt", past: "hunted", noun: "animal" },
};

// Human-readable item names. Backpacks read as "… Backpack"; everything else is
// its de-hyphenated, title-cased defId (iron-ore → "Iron Ore").
const BACKPACK_NAMES: Record<string, string> = { starter: "Starter Backpack", leather: "Leather Backpack", "large-pack": "Large Pack" };
function name(defId: string): string {
  if (BACKPACK_NAMES[defId]) return BACKPACK_NAMES[defId]!;
  return defId.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "play";
const SAVE_KEY = `idle-adv:${seed}`;

type Pos = { x: number; y: number };
type Pending = { goal: Pos; path: Pos[]; cost: number; fight?: string; shoot?: boolean } | null; // shoot (D45): the goal is adjacent + a ranged engage is legal

let state: GameState = load() ?? newGame(seed);
let log: string[] = loadLog();
let pending: Pending = null; // a proposed walk awaiting a confirm click
let hint: string | null = null; // transient path banner when a click can't be routed (si7.5)
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
function newRun(): void { state = newGame(seed); log = ["· new game"]; pending = null; draw(); }

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
  hint = null; // any committed action clears a stale walled-off notice
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
      return (e.victory
        ? `⚔ beat the ${name(e.creature)} · −${round(e.hpLost)}hp${e.potionsUsed ? ` (${e.potionsUsed} potion${e.potionsUsed > 1 ? "s" : ""})` : ""} · loot ${e.loot.map((l) => `${l.qty}× ${name(l.defId)}`).join(", ") || "none"}`
        : `☠ the ${name(e.creature)} downed you · run ends, haul kept`) + tail;
    }
    case "crafted": return `✦ ${e.where === "field" ? "field-crafted 🔥 " : "crafted "}${e.output.qty}× ${name(e.output.defId)}`;
    case "pocketed-map": return `📜 pocketed a T${e.tier} ${name(e.biomeId)} map`;
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
    case "inked": return `🖋 inked the map — it is now of ${AFFIX_EFFECTS[e.affix]?.label ?? e.affix}`;
    case "auto-quaff-toggled": return `auto-quaff ${e.on ? "on" : "off"}`;
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

// --- A* pathfinding (UI convenience) -----------------------------------------
// `blocked` = live-monster tiles routed AROUND (monsters block a tile until
// beaten). The goal itself is allowed even if blocked, so you can click a monster
// to walk in and fight it — the route just won't pass through OTHER monsters.
function findPath(grid: Grid, start: Pos, goal: Pos, transport: string | null, tools: string[], blocked: Set<string>): { path: Pos[]; cost: number } | null {
  if (kk(start) === kk(goal)) return { path: [], cost: 0 };
  const goalK = kk(goal);
  const startK = kk(start);
  const g = new Map<string, number>([[startK, 0]]);
  const came = new Map<string, Pos>();
  const open = new Set<string>([startK]);
  const coord = new Map<string, Pos>([[startK, start]]);
  const h = (p: Pos) => Math.max(Math.abs(p.x - goal.x), Math.abs(p.y - goal.y));
  while (open.size) {
    let cur: string | null = null, best = Infinity;
    for (const k of open) { const f = (g.get(k) ?? Infinity) + h(coord.get(k)!); if (f < best) { best = f; cur = k; } }
    if (cur === null) break;
    if (cur === kk(goal)) {
      const path: Pos[] = []; let step = goal;
      while (kk(step) !== startK) { path.unshift(step); step = came.get(kk(step))!; }
      return { path, cost: g.get(kk(goal))! };
    }
    open.delete(cur);
    const p = coord.get(cur)!;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = p.x + dx, ny = p.y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const nk = `${nx},${ny}`;
      if (blocked.has(nk) && nk !== goalK) continue; // route around other monsters
      const step = moveCost(grid.terrain[ny]![nx]!, transport, tools);
      if (!Number.isFinite(step)) continue;
      const tentative = (g.get(cur) ?? Infinity) + step;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, p); g.set(nk, tentative); coord.set(nk, { x: nx, y: ny }); open.add(nk);
      }
    }
  }
  return null;
}

// Map a rejected walk step to a cause-specific message (1te-e): one banner
// string used to cover ≥3 distinct RejectionReasons, so a bag-full fight read
// identically to a walled tile. The reason rides the action-rejected event the
// move driver already receives.
// gate-legibility (playtest 2026-07-09 #1): NAME the missing thing. When the reject
// came from a craft, `recipeId` lets us read RECIPE[...].requires and say exactly
// which station/tool/terrain is missing instead of a generic "needs something."
function rejectCopy(reason: RejectionReason, recipeId?: string): string {
  const gate = recipeId ? recipeGateHint(recipeId) : null; // "needs anvil + blacksmiths-hammer"
  switch (reason) {
    case "impassable": return "blocked by terrain";
    case "carry-full": return "bag full — a monster fight needs a free loot slot";
    case "exhausted": return "out of energy";
    case "engaged": return "you're engaged — fight or flee below";
    case "missing-station": return gate ? `can't craft — ${gate} (build the station first)` : "needs a station you haven't built";
    case "missing-tool": return gate ? `can't craft — ${gate}` : "needs a tool you don't have";
    case "tool-too-weak": return "your tool is too weak for this material's tier";
    case "not-field-craftable": return "that recipe is town-only — it can't be made in the field";
    case "not-near-terrain": {
      const terr = recipeId ? recipeTerrainGate(recipeId) : null;
      return terr ? `must stand on (or next to) ${terr} to make this` : "you're not on the terrain this needs";
    }
    default: return reason;
  }
}
const foodUnits = (food: ItemStack[]) => food.reduce((n, s) => n + s.qty, 0);

// Replay a proposed path one move at a time (each still validated by reduce).
// Stops early on the first rejection (surfacing its true cause, 1te-e) or when
// a step engages a monster (1te-a: walking INTO a monster is a fight, not a
// walk — the deadlock was that the generic "blocked" message hid a bag-full
// engage rejection and swallowed the successful engagement's state change).
function confirmWalk(path: Pos[]): void {
  const startEnergy = state.expedition!.energy;
  const startFood = state.expedition!.loadout.food;
  let steps = 0;
  let stopReason: RejectionReason | null = null;
  let engaged = false;
  for (const t of path) {
    const { state: next, events } = reduce(state, { type: "move", to: t });
    const rej = events.find((e): e is Extract<GameEvent, { type: "action-rejected" }> => e.type === "action-rejected");
    if (rej) { stopReason = rej.reason; break; }
    state = next;
    if (next.expedition!.combat) { engaged = true; break; } // final step was the fight
    steps += 1;
  }
  const exp = state.expedition!;
  // spend/food computed once from start→end state — no per-step sign juggling,
  // so auto-eat refills mid-walk net out correctly and never print "−-45e" (1te-b).
  const net = startEnergy - exp.energy; // >0 spent, <0 net gain from auto-eat
  const delta = net >= 0 ? `−${round(net)}e` : `+${round(-net)}e`;
  const ate = foodUnits(startFood) - foodUnits(exp.loadout.food);
  const ateClause = ate > 0 ? ` · auto-ate ${ate}× ration` : "";
  if (steps > 0) log.unshift(`🚶 walked ${steps} tile${steps !== 1 ? "s" : ""} → (${exp.pos.x},${exp.pos.y}) · ${delta}${ateClause}`);
  if (engaged) log.unshift(`⚔ engaged the ${name(exp.combat!.creature)} — resolve the fight in the panel below`);
  if (stopReason) log.unshift(`✋ stopped — ${rejectCopy(stopReason)}`);
  pending = null; trimAndDraw();
}

// --- rendering ---------------------------------------------------------------
function draw(): void {
  app.innerHTML = state.phase === "town" ? townView() : expeditionView();
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
  for (const m of maps) boxes.push(slotBox("loot", `🗺️ T${m.tier ?? 1} ${name(m.biomeId)} map`, "")); // carried maps (8ec): 1 slot each
  return boxes;
}
function wornGhosts(eq: Equipment): string[] {
  const worn = [eq.weapon, eq.helmet, eq.chest, eq.legs, eq.boots, eq.gloves, eq.transport, eq.backpack, eq.panniers].filter(Boolean) as string[];
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
  if (affixes.length) return ` <span class="muted">of ${affixes.map((a) => AFFIX_EFFECTS[a]?.label ?? a).join(", ")}</span>`;
  return epithetSuffix(m.mapSeed, m.biomeId, m.tier ?? 1);
}

function townView(): string {
  const legal = legalActions(state);
  const craftable = legal.filter((a): a is Extract<Action, { type: "craft" }> => a.type === "craft");
  const lo = state.loadout;
  const eq = lo.equipment;
  const cap = carryCap(eq);
  const inv = inventoryGrid(lo, [], cap);
  const offer = candidateMaps(state.seed, state.runs ?? 0);
  const heldMaps = state.maps ?? [];
  const heldSeeds = new Set(heldMaps.map((m) => m.mapSeed));
  const equipRow = (label: string, val: string | null) =>
    `<div class="row"><span class="k">${label}</span><span class="v">${val ?? "<span class='muted'>—</span>"}</span></div>`;

  return `
  <header><h1>Town</h1><span class="muted">seed "${state.seed}"</span><button class="link" data-newgame>new game</button></header>
  <div class="cols">
    <section>
      <h2>Choose a map <span class="muted small">3 fresh each visit — no going back</span></h2>
      <div class="mapoffer">
        ${offer.map((m) => `
          <div class="mapcard">
            <b>${m.preview.headline}${epithetSuffix(m.mapSeed, m.biomeId)}</b>
            <button data-embark="${m.mapSeed}">Embark ▶</button>
            ${heldSeeds.has(m.mapSeed) ? `<span class="muted small">pocketed</span>` : `<button data-pocket="${m.mapSeed}">Pocket</button>`}
          </div>`).join("")}
      </div>
      ${lo.food.length === 0 ? `<div class="warn">⚠ no food packed → you embark at full ${MAX_ENERGY} energy but have nothing to eat mid-run — no way to refill your stamina</div>` : ""}
      ${wieldsRanged(lo) && !(lo.ammo ?? []).length ? `<div class="warn">⚠ bow packed with NO ARROWS → it will swing like a club (1 dmg). Pack arrows to shoot.</div>` : ""}
      <div class="muted small">Embark = "go nearby" (free). Pocket keeps a map to run later — it rotates out of the offer but stays yours.</div>

      <h2 style="margin-top:1rem">Your maps <span class="muted small">held — spent on embark</span></h2>
      ${heldMaps.length ? `<div class="mapoffer">
        ${heldMaps.map((m) => `
          <div class="mapcard">
            <b>T${m.tier ?? 1} ${name(m.biomeId)} map${heldMapSuffix(m)}</b>
            <span class="muted small">${(state.runs ?? 0) - m.vintage} runs old</span>
            <button data-embark="${m.mapSeed}">Embark ▶ (spend)</button>
            ${Object.keys(INKS).filter((inkId) => legal.some((a) => a.type === "ink" && a.mapSeed === m.mapSeed && a.inkId === inkId)).map((inkId) => `<button data-ink-map="${m.mapSeed}" data-ink-id="${inkId}" title="apply ${name(inkId)} — rolls an affix from its domain onto this map">${name(inkId)}</button>`).join("")}
          </div>`).join("")}
      </div>` : `<div class="muted small">(none — pocket a map to keep it for later)</div>`}
    </section>

    <section>
      <h2>Loadout plan <button class="link" data-reset>reset</button>${loadLastPlan().length && planActions(lo).length === 0 ? ` <button class="link" data-repack title="re-pack the loadout you took last run (skips anything no longer in the bank)">↻ repack last</button>` : ""}</h2>
      ${equipRow("weapon", eq.weapon ? name(eq.weapon) : null)}
      ${equipRow("armour", [eq.helmet, eq.chest, eq.legs, eq.boots, eq.gloves].filter(Boolean).map((d) => name(d as string)).join(", ") || null)}
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
            const hint = weaponHint(out) ?? logisticsEffect(out); // 57l weapon-class hint; wzk: range/carry gear states its benefit inline (disjoint sets)
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
  const tier = poi.material ? (MATERIAL_TIER[poi.material] ?? 1) : 1;
  // gate-legibility (playtest 2026-07-09 #1): distinguish the two "can't gather"
  // reasons and name each. NO tool of the required KIND → "needs a knife"; has the
  // kind but too weak for the tier → "needs a tier-N tool".
  const needCap = NODE_TOOL[poi.kind as GatherableNodeType];
  const hasToolKind = !needCap || exp.loadout.equipment.tools.some((t) => TOOL_CAPABILITY[t] === needCap);
  const toolLocked = !canGather && !hasToolKind;
  const tierLocked = !canGather && hasToolKind && tier > 1;
  const locked = toolLocked || tierLocked;
  const article = /^[aeiou]/i.test(verb.noun) ? "an" : "a";
  return `<div class="here ${locked ? "locked" : ""}">
    <b>Here:</b> ${article} ${verb.noun} — <b>${name(poi.material!)}</b>${tier > 1 ? ` <span class="tier">tier ${tier}</span>` : ""}.
    ${canGather ? `<button data-act="gather">${verb.label} it</button>`
      : toolLocked ? `🔒 <span class="warn">${nodeToolHint(poi.kind as GatherableNodeType)} to work ${name(poi.material!)}</span>`
      : tierLocked ? `🔒 <span class="warn">your tool is too weak — needs a tier-${tier} tool to work ${name(poi.material!)}</span>`
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
  return `<div class="here monster engagement">
    <b>⚔ Engaged: ${name(c.creature)}</b>
    <div class="bar"><span>Its HP</span><div class="track"><div class="fill monster" style="width:${(c.monsterHp / maxHp) * 100}%"></div></div><b>${round(c.monsterHp)}/${maxHp}</b></div>
    <div class="forecast">you hit for <b>${round(dmgOut)}</b> · it hits for <b>${round(dmgIn)}</b> · <b class="${winning ? "good" : "over"}">${winning ? `kill in ${toKill}` : `it kills you first (~${toDie} rounds)`}</b>${exp.loadout.potions.length ? ` · ${exp.loadout.potions.reduce((n, p) => n + p.qty, 0)} potion(s) extend that` : ""}${quiver}${coatingLine(exp)}${c.poison ? ` · ☠ poisoned (${round(c.poison.dmg)}/rd, ${c.poison.rounds} left)` : ""}</div>
    <div class="actions">
      <button data-act="fight">⚔ Fight (1 round)</button>
      <button data-act="flee" title="disengage — take one parting hit (${round(dmgIn)}); unused battle items keep for later">🏃 Flee (−${round(dmgIn)} HP)</button>
      ${canQuaff ? `<button data-act="quaff">🧪 Potion</button>` : `<button disabled title="no potions, or full HP">🧪 Potion</button>`}
      <button data-act="toggle-auto-quaff">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
      ${(exp.loadout.battleItems ?? []).map((s) => { const b = COMBAT_BUFF[s.defId] ?? {}; const eff = [b.damageAdd ? `+${b.damageAdd} dmg` : "", b.mitigationAdd ? `+${b.mitigationAdd} mitigation` : ""].filter(Boolean).join(", "); return `<button data-use-item="${s.defId}" title="use it this fight only (${eff})">⚗ ${name(s.defId)} (${eff})${s.qty > 1 ? ` ×${s.qty}` : ""}</button>`; }).join("")}
      ${enhanceButtons(exp)}
    </div>
  </div>`;
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
  const pathSet = new Set(pending ? pending.path.map(kk) : []);
  const goalK = pending ? kk(pending.goal) : "";

  let cells = "";
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const k = `${x},${y}`;
    const isPlayer = exp.pos.x === x && exp.pos.y === y;
    const poi = poiAt.get(k);
    const isCleared = cleared.has(k);
    const cls = ["tile", `terrain-${grid.terrain[y]![x]}`];
    if (poi && !isCleared) cls.push("poi", `poi-${poi.kind}`);
    if (isPlayer) cls.push("player");
    const onPath = pathSet.has(k);
    let stepBd: ReturnType<typeof moveCostBreakdown> | null = null;
    if (onPath) {
      cls.push("path");
      stepBd = moveCostBreakdown(grid.terrain[y]![x]!, exp.loadout.equipment.transport, exp.loadout.equipment.tools);
      if (stepBd.enabled) cls.push("path-enabled");
      else if (stepBd.discounts.length) cls.push("path-tool");
      else if (stepBd.transport) cls.push("path-transport");
    }
    if (k === goalK) cls.push("path-goal");
    const locked = poi && !isCleared && poi.material && (MATERIAL_TIER[poi.material] ?? 1) > 1;
    if (locked) cls.push("locked");
    const ch = isPlayer ? PLAYER_CHAR : isCleared ? "·" : poi ? POI_CHAR[poi.kind] : TERRAIN_CHAR[grid.terrain[y]![x]!];
    const per = poi ? perceived.get(k) : undefined;
    // gate-legibility (playtest 2026-07-09 #1, node tier/reach visibility): a
    // surveyed / in-vision node names its MATERIAL TIER at range (nodeTierNote reads
    // the PERCEIVED, range-gated tier) so a far vein's worth-the-trek is legible —
    // an agent trekked 50 tiles only to learn a node was tier-2. This also makes the
    // tier honest to sight: an out-of-range node (per.detail null) reveals nothing.
    const tierNote = per ? nodeTierNote(per.detail) : null;
    const title = stepBd
      ? stepExplain(stepBd)
      : poi && !isCleared // a cleared tile shows '·' — its title must not keep the stale poi text (1te-d)
      ? (per && per.detail
          ? `${poi.kind} · ${flavorDetail(per.detail, poi.kind)}${tierNote ? ` · ${tierNote}` : ""}`
          : poi.kind === "monster" ? "a monster" : `a ${poi.kind} node`)
      : grid.terrain[y]![x]!;
    cells += `<div class="${cls.join(" ")}" data-x="${x}" data-y="${y}" title="${title}">${ch}</div>`;
  }

  const maxEnergy = exp.maxEnergy ?? MAX_ENERGY;
  // When a walk is pending, split the energy bar: the part you'll KEEP after the
  // walk (green) + the part it'll SPEND (orange, red if it would strand you).
  const pendCost = pending ? pending.cost : 0;
  const overBudget = pending ? pending.cost > exp.energy : false;
  const spend = Math.min(pendCost, exp.energy);
  const keep = exp.energy - spend;
  const pct = (v: number) => Math.min(100, (v / maxEnergy) * 100);
  // energy may exceed maxEnergy after a manual over-eat (m0a) — cap the bar fill at
  // 100% and surface the surplus rather than overflowing the track.
  const overFull = !pending && exp.energy > maxEnergy;
  const overSpan = overFull ? ` <span class="overfull">+${round(exp.energy - maxEnergy)}</span>` : "";
  const energyFill = pending
    ? `<div class="fill energy" style="width:${pct(keep)}%"></div><div class="fill spend${overBudget ? " over" : ""}" style="width:${pct(spend)}%"></div>`
    : `<div class="fill energy" style="width:${pct(exp.energy)}%"></div>`;
  const energyLabel = pending
    ? `${round(exp.energy)}/${maxEnergy} → <b class="${overBudget ? "over" : ""}">${round(Math.max(0, exp.energy - pendCost))}</b>${overBudget ? " ⚠ strands you" : ""}`
    : `${round(exp.energy)}/${maxEnergy}${overSpan}`;
  const bars = `
    <div class="bar"><span>Energy</span><div class="track">${energyFill}</div><b>${energyLabel}</b></div>
    <div class="bar"><span>HP</span><div class="track"><div class="fill hp" style="width:${Math.min(100, (exp.hp / 30) * 100)}%"></div></div><b>${round(exp.hp)}</b></div>`;

  const saving = pending
    ? pending.path.reduce((s, p) => s + moveCostBreakdown(grid.terrain[p.y]![p.x]!, null, []).final, 0) - pending.cost
    : 0;
  const savingClause = pending && Number.isFinite(saving) && saving > 0 ? ` · gear/transport saved ${round(saving)}e` : "";
  const forecastClause = pending?.fight
    ? (() => {
        const dmgOut = playerDamage(exp.loadout, pending.fight!, exp.weaponBuff); // D60: forecast reflects an active coating
        const dmgIn = damageTaken(exp.loadout, pending.fight!, 0);
        const toKill = Math.ceil(MONSTER_TIER_HP_CURVE[MONSTERS[pending.fight!]!.tier]! / dmgOut);
        const toDie = Math.ceil(exp.hp / dmgIn);
        const winning = toKill <= toDie;
        return ` · <span class="forecast" title="bare-kit forecast — battle items apply when the fight starts">forecast: you hit ${round(dmgOut)}, it hits ${round(dmgIn)} — <b class="${winning ? "good" : "over"}">${winning ? `kill in ${toKill}` : "it wins the race"}</b></span>`;
      })()
    : "";
  const pathBanner = exp.combat
    ? `<div class="pathbanner engaged">⚔ <b>ENGAGED — the ${name(exp.combat.creature)}</b> · fight or flee in the panel below ↓</div>`
    : pending
    ? `<div class="pathbanner">${pending.fight ? `⚔ walk in &amp; <b>fight the ${name(pending.fight)}</b> · ` : ""}→ (${pending.goal.x},${pending.goal.y}): ${pending.path.length} tile${pending.path.length !== 1 ? "s" : ""}, <b class="${pending.cost > exp.energy ? "over" : ""}">−${round(pending.cost)} energy</b>${savingClause}${forecastClause} · <button data-walk>${pending.fight ? "Fight ▶" : "Walk ▶"}</button> ${pending.shoot ? `<button data-shoot title="engage from here with your bow — your opener lands before it can answer, and you don't step in">🏹 Shoot</button> ` : ""}${legal.some((a) => a.type === "survey" && a.at.x === pending!.goal.x && a.at.y === pending!.goal.y) ? `<button data-survey-x="${pending.goal.x}" data-survey-y="${pending.goal.y}" title="study it through the glass without walking over — resolves its detail for −${SURVEY_ENERGY}e">🔭 Survey (−${SURVEY_ENERGY}e)</button> ` : ""}<button class="link" data-cancelpath>cancel</button></div>`
    : hint
    ? `<div class="pathbanner"><b class="over">✗ ${hint}</b></div>`
    : `<div class="pathbanner muted">Click a tile → previews the route + energy. Click <b>Walk</b> (or the tile again / right-click) to go. Monsters (<b>X</b>) block their tile — click one to fight, or route around.</div>`;

  const cap = carryCap(exp.loadout.equipment);
  const inv = inventoryGrid(exp.loadout, exp.carry, cap, exp.carriedMaps ?? [], exp.autoEatFood ?? null);
  return `
  <header><h1>${rollBiome(exp.mapSeed)} expedition</h1><span class="muted">pos (${exp.pos.x},${exp.pos.y})</span><button class="link" data-newgame>new game</button></header>
  <div class="cols">
    <section class="mapwrap">
      ${bars}
      ${pathBanner}
      <div class="gridscroll"><div class="grid" style="grid-template-columns:repeat(${MAP_WIDTH}, 1.4rem);">${cells}</div></div>
    </section>
    <section>
      ${exp.combat ? engagementPanel(exp, legal) : herePanel(grid, exp, legal)}
      <h2>Actions</h2>
      <div class="actions">
        ${legal.some((a) => a.type === "eat") ? `<button data-act="eat">🍖 Eat${exp.loadout.equipment.tools.includes("tent") ? " (+50%)" : ""}</button>` : `<button disabled title="no food, or already full">🍖 Eat</button>`}
        ${legal.some((a) => a.type === "quaff") ? `<button data-act="quaff" title="drink a potion here (−${QUAFF_ENERGY}e)">🧪 Potion (−${QUAFF_ENERGY}e)</button>` : `<button disabled title="no potions, full HP, or too tired">🧪 Potion</button>`}
        <button data-act="toggle-auto-quaff" title="auto-drink a potion when HP drops below the threshold mid-fight">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
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
      ${(exp.carriedMaps ?? []).length ? `<div class="bank" style="margin-top:.5rem">${(exp.carriedMaps ?? []).map((m) => `<div class="bankitem"><span class="chip" title="1 slot — banks as a held map when the run ends">🗺️ T${m.tier ?? 1} ${name(m.biomeId)} map</span><button data-drop-map="${m.mapSeed}">drop</button></div>`).join("")}</div>` : ""}
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
  app.querySelectorAll<HTMLElement>("[data-pocket]").forEach((el) => el.onclick = () => apply({ type: "pocket-map", mapSeed: el.dataset.pocket! }));
  app.querySelectorAll<HTMLElement>("[data-craft]").forEach((el) => el.onclick = () => apply({ type: "craft", recipeId: el.dataset.craft! }));
  app.querySelectorAll<HTMLElement>("[data-pack]").forEach((el) => el.onclick = () => apply({ type: "pack", slot: el.dataset.slot as LoadoutSlot, itemId: el.dataset.pack! }));
  app.querySelectorAll<HTMLElement>("[data-drop]").forEach((el) => el.onclick = () => apply({ type: "drop", itemId: el.dataset.drop! }));
  app.querySelectorAll<HTMLElement>("[data-don]").forEach((el) => el.onclick = () => apply({ type: "don", itemId: el.dataset.don! }));
  app.querySelectorAll<HTMLElement>("[data-doff]").forEach((el) => el.onclick = () => apply({ type: "doff", itemId: el.dataset.doff! }));
  app.querySelectorAll<HTMLElement>("[data-drop-map]").forEach((el) => el.onclick = () => apply({ type: "drop-map", mapSeed: el.dataset.dropMap! }));
  app.querySelectorAll<HTMLElement>("[data-use-item]").forEach((el) => el.onclick = () => apply({ type: "use-item", itemId: el.dataset.useItem! }));
  app.querySelectorAll<HTMLElement>("[data-enhance]").forEach((el) => el.onclick = () => apply({ type: "enhance", id: el.dataset.enhance! }));
  app.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => el.onclick = () => { pending = null; apply({ type: el.dataset.act! } as Action); });
  // Auto-eat designation (mco): right-click a food box to set it as the auto-eat
  // food; right-clicking the already-designated one clears it (null = off).
  app.querySelectorAll<HTMLElement>("[data-eatfood]").forEach((el) => el.oncontextmenu = (ev) => {
    ev.preventDefault();
    const defId = el.dataset.eatfood!;
    apply({ type: "set-auto-eat-food", defId: state.expedition?.autoEatFood === defId ? null : defId });
  });
  const reset = app.querySelector<HTMLElement>("[data-reset]"); if (reset) reset.onclick = () => planReset();
  const repack = app.querySelector<HTMLElement>("[data-repack]"); if (repack) repack.onclick = () => repackLast();
  const cancel = app.querySelector<HTMLElement>("[data-cancelpath]"); if (cancel) cancel.onclick = () => { pending = null; draw(); };
  const walk = app.querySelector<HTMLElement>("[data-walk]"); if (walk) walk.onclick = () => { if (pending) confirmWalk(pending.path); };
  // Shoot (D45): ranged engage on the pending goal — stays put, spends no energy
  const shoot = app.querySelector<HTMLElement>("[data-shoot]"); if (shoot) shoot.onclick = () => { if (pending) { const at = pending.goal; pending = null; apply({ type: "fight", at }); } };
  // Survey (54f): resolve the pending goal's detail at range, stay put
  const surveyBtn = app.querySelector<HTMLElement>("[data-survey-x]"); if (surveyBtn) surveyBtn.onclick = () => { const at = { x: Number(surveyBtn.dataset.surveyX), y: Number(surveyBtn.dataset.surveyY) }; pending = null; apply({ type: "survey", at }); };
  app.querySelectorAll<HTMLElement>("[data-ink-map]").forEach((el) => el.onclick = () => apply({ type: "ink", mapSeed: el.dataset.inkMap!, inkId: el.dataset.inkId! }));
  app.querySelectorAll<HTMLElement>("[data-newgame]").forEach((el) => el.onclick = () => { if (confirm("Start a new game? This wipes the current run.")) newRun(); });
  app.querySelectorAll<HTMLElement>(".tile[data-x]").forEach((el) => {
    const handler = (ev: Event) => { ev.preventDefault(); onTileClick({ x: Number(el.dataset.x), y: Number(el.dataset.y) }); };
    el.onclick = handler;
    el.oncontextmenu = handler; // right-click works too
  });
}

// Why did A* find no route to a clicked tile? (si7.5) — replaces the old generic
// "walled off / blocked by a monster" with a reasoned cause. Data-driven from
// TERRAIN_GATE via reach.ts (pure): (1) if the tile IS terrain-reachable with the
// current kit, only a monster on the sole route can have blocked A*; (2) else, try
// each gate tool the player lacks — if adding it makes reach finite, name it (only
// climbing-pick enables mountains today; raft merely discounts a river, so it never
// surfaces here); (3) otherwise the tile is sealed behind impassable terrain.
function unreachableReason(grid: Grid, from: Pos, goal: Pos): string {
  const eq = state.expedition!.loadout.equipment;
  const reach = (tools: string[]) => costToReach(grid.terrain, from, eq.transport, tools)[goal.y]![goal.x]!;
  if (Number.isFinite(reach(eq.tools))) {
    return "a monster sits on the only route — fight through it, or find a way around";
  }
  const gateTools = [...new Set(Object.values(TERRAIN_GATE).flatMap((g) => Object.keys(g ?? {})))];
  const enablers = gateTools.filter((tool) => !eq.tools.includes(tool) && Number.isFinite(reach([...eq.tools, tool])));
  if (enablers.length) return `walled off — a ${enablers.map(name).join(" or ")} would open a route`;
  return "no route exists — that tile is sealed behind impassable terrain";
}

function onTileClick(to: Pos): void {
  hint = null;
  const exp = state.expedition;
  if (!exp) return;
  if (to.x === exp.pos.x && to.y === exp.pos.y) { pending = null; draw(); return; } // click self = cancel
  if (pending && kk(pending.goal) === kk(to)) { confirmWalk(pending.path); return; } // confirm
  const grid = expeditionGrid(exp);
  const cleared = new Set(exp.cleared.map(kk));
  // live monsters block the route (you fight what you walk into) — routed around
  const blocked = new Set(grid.pois.filter((p) => p.kind === "monster" && p.creature && !cleared.has(kk(p))).map(kk));
  const found = findPath(grid, exp.pos, to, exp.loadout.equipment.transport, exp.loadout.equipment.tools, blocked);
  if (!found || found.path.length === 0) { pending = null; hint = unreachableReason(grid, exp.pos, to); draw(); return; }
  const goalPoi = grid.pois.find((p) => kk(p) === kk(to));
  const fight = goalPoi?.kind === "monster" && goalPoi.creature && !cleared.has(kk(to)) ? goalPoi.creature : undefined;
  // Shoot affordance (D45): an adjacent live monster with a bow + arrows offers
  // a ranged engage alongside the walk-in — legality straight from reduce (D29).
  const shoot = fight !== undefined && legalActions(state).some((a) => a.type === "fight" && a.at !== undefined && a.at.x === to.x && a.at.y === to.y);
  pending = { goal: to, path: found.path, cost: found.cost, fight, shoot };
  draw();
}

draw();
