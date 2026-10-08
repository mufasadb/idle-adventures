// The expedition screen: resource bars, the map grid + planned-route overlay, the
// here/engagement panel, actions, field craft and the bag.
import { legalActions, whyNot } from "../sim/legal";
import { expeditionGrid } from "../engine/grid";
import type { Grid } from "../engine/grid";
import { recipeOutputQty } from "../engine/craft";
import { moveCostBreakdown, moveCost } from "../engine/move";
import { frameStyle, iconStyle, monsterStyle, nodeIconId, playerStyle, tileStyle } from "./assets";
import { carryCap, mapCarryCap } from "../engine/carry";
import { deriveRoute } from "./route";
import type { Pos } from "./route";
import { wieldsRanged, loadedAmmoIndex } from "../engine/combat";
import { PLAYER_BASE_HP, RECIPE, MAP_WIDTH, MAP_HEIGHT, MAX_ENERGY, TENT_CAMP_MEALS, MONSTER_TIER_HP_CURVE, MONSTERS, QUAFF_ENERGY, DON_DOFF_ENERGY, SURVEY_ENERGY, FIELD_CRAFT_ENERGY, FISH_CAST_ENERGY, FISH_DEEP_DEPTH, ANTIDOTE, TERRAIN_HP_COST } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";
import { TERRAIN_CHAR, poiGlyph, kindLabel, FORAGE_MATERIAL_CHAR, PLAYER_CHAR, flavorDetail, describe, recipeGateHint, nodeToolHint, nodeGateNote, materialGated, materialLocked, name, rejectCopy, combatForecast, GATHER_VERB, round1, engagementForecast, enhancementHint, battleItemEffect } from "../render/render";
import { perceive } from "../engine/perceive";
import type { GameState, Action } from "../engine/types";
import { inventoryGrid } from "./inventory";

const kk = (p: Pos) => `${p.x},${p.y}`;

// 67e: the engagement forecast from the LAST render, so the panel can show a delta
// ("kill in 5 → 3") after a coat/swap/potion. Keyed on the engagement so a new fight
// resets it. Purely presentational.
let lastForecast: { key: string; dmgOut: number; toKill: number } | null = null;

// Human breakdown of a single step's energy — surfaced as a path tile's hover
// title so the horse/gear effect is visible: "plains 10e ÷2 (horse) = 5e".
function stepExplain(bd: ReturnType<typeof moveCostBreakdown>): string {
  if (!Number.isFinite(bd.base) && !bd.enabled) return `${bd.terrain} — impassable`;
  const parts: string[] = [`${bd.terrain} ${Number.isFinite(bd.base) ? bd.base + "e" : "∞"}`];
  if (bd.enabled) parts.push(`→ ${bd.enabled.to} (${name(bd.enabled.tool)})`);
  for (const d of bd.discounts) parts.push(`− ${d.amount} (${name(d.tool)})`);
  if (bd.transport) parts.push(`÷${bd.transport.divisor} (${name(bd.transport.id)})`);
  return `${parts.join(" ")} = ${round1(bd.final)}e`;
}

// What the player is standing on — always shown, so gather/fight has context.
function herePanel(state: GameState, grid: Grid, exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
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
      ${canFight ? `<button data-act="fight">⚔ Engage the ${name(poi.creature!)}</button>` : `<span class="warn">can't fight — ${rejectCopy(whyNot(state, { type: "fight" }) ?? "carry-full", undefined, "fight")}</span>`}
    </div>`;
  }
  // gatherable node
  const verb = GATHER_VERB[poi.kind]!;
  // Legality — and the REASON — come from the reducer, not a hand-derived rule (ciq):
  // whyNot returns the exact gather rejection (missing-tool / tool-too-weak / carry-full
  // / …). The web only chooses copy per reason; it no longer re-decides which applies.
  const reason = canGather ? null : whyNot(state, { type: "gather" });
  const gated = materialGated(poi.material!); // catalog "is there a gate at all" → the badge
  const per = perceive(grid, pos, exp.loadout.equipment.tools, exp.surveyed ?? []).find((p) => p.x === poi.x && p.y === poi.y);
  const article = /^[aeiou]/i.test(verb.noun) ? "an" : "a";
  // A tool/gate lock is a HARD lock (🔒, dimmed) — you need a tool; carry-full/exhausted
  // are transient (plain warn). Rich per-reason copy names the missing tool or the
  // access gate (from the PERCEIVED gate) — both render hints; else rejectCopy.
  const hardLock = reason === "missing-tool" || reason === "tool-too-weak";
  const lockCopy =
    reason === "missing-tool" ? `${nodeToolHint(poi.kind as GatherableNodeType, exp.loadout.equipment.tools)} to work ${name(poi.material!)}`
    : reason === "tool-too-weak" ? `${nodeGateNote(per?.detail ?? null) ?? "locked"} to work ${name(poi.material!)}`
    : rejectCopy(reason ?? "carry-full");
  return `<div class="here ${hardLock ? "locked" : ""}">
    <b>Here:</b> ${article} ${verb.noun} — <b>${name(poi.material!)}</b>${gated ? ` <span class="tier">gated</span>` : ""}.
    ${canGather ? `<button data-act="gather">${verb.label} it</button>`
      : `${hardLock ? "🔒 " : ""}<span class="warn">${lockCopy}</span>`}
  </div>`;
}

// Fishing (si7.6.2): a Fish button when a cast is legal; otherwise, when there IS water
// on or beside you, say why not (no rod / fished out / bag full / tired). Legality and
// the reason both come from the reducer (D29, ciq).
function fishLine(state: GameState, legal: Action[]): string {
  if (legal.some((a) => a.type === "fish")) {
    return `<div class="here fish"><button data-act="fish">🎣 Fish</button> the deepest water beside you (−${FISH_CAST_ENERGY}e) · each spot bites once; deeper water, bigger catch.</div>`;
  }
  const reason = whyNot(state, { type: "fish" });
  if (!reason || reason === "no-water" || reason === "engaged") return "";
  return `<div class="here fish">🎣 <span class="warn">${rejectCopy(reason, undefined, "fish")}</span></div>`;
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
    return `<button data-enhance="${s.defId}" title="coat your weapon (${enhancementHint(s.defId) ?? ""})${exp.weaponBuff ? " — replaces the current coating" : ""}">🗡️ Apply ${name(s.defId)}${s.qty > 1 ? ` ×${s.qty}` : ""}</button>`;
  }).join("");
}

// si7.6.9.6 (Muse option 1): flasks the reducer would let you throw — at your engaged
// target, or at `at` from range. Legality from reduce (D29).
function throwLegal(legal: Action[], at?: { x: number; y: number }): string[] {
  return [...new Set(legal.filter((a): a is Extract<Action, { type: "throw" }> => a.type === "throw" && (at ? a.at !== undefined && a.at.x === at.x && a.at.y === at.y : a.at === undefined)).map((a) => a.itemId))];
}
// A Throw button per held flask; before anything has struck, it wears the glowing
// FREE OPENER badge — the throw draws no retaliation.
function throwButtons(exp: NonNullable<GameState["expedition"]>, legal: Action[]): string[] {
  const free = !(exp.combat?.struck ?? false);
  return throwLegal(legal).map((id) => {
    const qty = (exp.loadout.flasks ?? []).filter((s) => s.defId === id).reduce((n, s) => n + s.qty, 0);
    return `<button class="throw" data-throw="${id}" title="${describe(id)}">💥 Throw ${name(id).toLowerCase()} ×${qty}${free ? ` <span class="free-opener">FREE OPENER</span>` : ""}</button>`;
  });
}
// si7.6.9.6: the poison chip beside the HP bar (a green skull + ticks left) and, when an
// antidote is held, its one-tap cure right next to it.
function poisonChip(exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
  if (!exp.poisoned) return "";
  const cure = legal.some((a) => a.type === "use-item" && ANTIDOTE.includes(a.itemId));
  return ` <span class="poison-chip" title="poisoned: −${exp.poisoned.dmg} HP per step or fight round for ${exp.poisoned.ticks} more — it can't take you below 1 HP">☠ ${exp.poisoned.ticks}</span>${cure ? `<button class="antidote" data-use-item="antidote" title="antidote — cure the poison (no turn, no energy)">🧪<span class="lbl"> Antidote</span></button>` : ""}`;
}

// The engagement panel replaces herePanel while a live fight is in progress
// (exp.combat set): monster HP bar, per-round forecast (the honest race —
// toKill vs toDie, no potion double-count), and Fight/Flee/Potion/auto-quaff.
function engagementPanel(state: GameState, exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
  const c = exp.combat!;
  const maxHp = MONSTER_TIER_HP_CURVE[MONSTERS[c.creature]!.tier]!;
  const { dmgOut, dmgIn, toKill, toDie, winning } = engagementForecast(exp); // D60: reflects the coating; potions extend it (noted in the forecast line)
  const canQuaff = legal.some((a) => a.type === "quaff");
  // Quiver readout (D45): a wielded bow spends an arrow per round; empty = club.
  // si7.6.6: count only the ammo the wielded weapon can shoot, and name it.
  const li = loadedAmmoIndex(exp.loadout);
  const loaded = li === -1 ? null : exp.loadout.ammo![li]!;
  const shots = loaded ? (exp.loadout.ammo ?? []).filter((s) => s.defId === loaded.defId).reduce((n, s) => n + s.qty, 0) : 0;
  const quiver = wieldsRanged(exp.loadout) ? ` · 🏹 ${shots} ${loaded ? name(loaded.defId).toLowerCase() : "ammo"}${shots === 0 ? " — swinging it like a club!" : ""}` : "";
  // 67e: damage-change feedback — diff this forecast against the last render's so a
  // coat/swap/potion shows its effect ("→ kill in 3", "(was 4.5)"). Reset per fight.
  const key = `${c.creature}@${c.at.x},${c.at.y}`;
  const prev = lastForecast && lastForecast.key === key ? lastForecast : null;
  const dmgWas = prev && round1(prev.dmgOut) !== round1(dmgOut) ? ` <span class="was">(was ${round1(prev.dmgOut)})</span>` : "";
  const killWas = prev && winning && prev.toKill !== toKill ? ` <span class="was">(was ${prev.toKill})</span>` : "";
  lastForecast = { key, dmgOut, toKill };
  return `<div class="here monster engagement">
    <b>⚔ Engaged: ${name(c.creature)}</b>
    <div class="bar"><span>Its HP</span><div class="track"><div class="fill monster" style="width:${(c.monsterHp / maxHp) * 100}%"></div></div><b>${round1(c.monsterHp)}/${maxHp}</b></div>
    <div class="forecast">you hit for <b>${round1(dmgOut)}</b>${dmgWas} · it hits for <b>${round1(dmgIn)}</b> · <b class="${winning ? "good" : "over"}">${winning ? `kill in ${toKill}` : `it kills you first (~${toDie} rounds)`}</b>${killWas}${exp.loadout.potions.length ? ` · ${exp.loadout.potions.reduce((n, p) => n + p.qty, 0)} potion(s) extend that` : ""}${quiver}${coatingLine(exp)}${c.poison ? ` · ☠ poisoned (${round1(c.poison.dmg)}/rd, ${c.poison.rounds} left)` : ""}</div>
    <div class="actions">
      <button data-act="fight">⚔ Fight (1 round)</button>
      ${throwButtons(exp, legal).join("")}
      <button data-act="flee" title="disengage — take one parting hit (${round1(dmgIn)}); unused battle items keep for later">🏃 Flee (−${round1(dmgIn)} HP)</button>
      ${canQuaff ? `<button data-act="quaff" title="drink a potion — costs a turn (the ${name(c.creature)} strikes)">🧪 Potion</button>` : `<button disabled title="${rejectCopy(whyNot(state, { type: "quaff" }) ?? "insufficient")}">🧪 Potion</button>`}
      <button data-act="toggle-auto-quaff">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
      <button data-act="toggle-auto-finish" title="fast-forward whole fights to victory or defeat in one click">Auto-finish: <b>${(exp.autoFinish ?? false) ? "on" : "off"}</b></button>
      ${exp.loadout.battleItems.filter((s) => !ANTIDOTE.includes(s.defId)).map((s) => { const eff = battleItemEffect(s.defId) ?? ""; return `<button data-use-item="${s.defId}" title="use it this fight only (${eff})">⚗ ${name(s.defId)} (${eff})${s.qty > 1 ? ` ×${s.qty}` : ""}</button>`; }).join("")}
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

export type DrawerTab = "here" | "bag" | "craft" | "log";
export type ExpeditionUi = { drawerOpen: boolean; tab: DrawerTab; logHtml: string };

export function expeditionView(state: GameState, route: Pos[], ui: ExpeditionUi): string {
  const exp = state.expedition!;
  const { grid, perceived, cleared, rt } = currentDerived(state, route)!;
  const legal = legalActions(state);

  const poiAt = new Map(grid.pois.map((p) => [kk(p), p]));
  const canFish = legal.some((a) => a.type === "fish");
  const drawnSet = new Set(rt.drawn.map(kk));
  const goalK = kk(rt.end);

  let cells = "";
  for (let y = 0; y < MAP_HEIGHT; y++) for (let x = 0; x < MAP_WIDTH; x++) {
    const k = `${x},${y}`;
    const isPlayer = exp.pos.x === x && exp.pos.y === y;
    const poi = poiAt.get(k);
    const isCleared = cleared.has(k);
    const cls = ["tile", `terrain-${grid.terrain[y]![x]}`];
    // si7.6.2: deep water (the raft-only fishing ground) and already-fished water read
    // differently. Placeholder styling until the Muse water/boat mockups are picked.
    const terr = grid.terrain[y]![x]!;
    const depth = grid.depth?.[y]?.[x] ?? 0;
    if (depth >= FISH_DEEP_DEPTH) cls.push("deep");
    // 9e0 (Muse option 2): stepped depth bands on standing water, a crosshatch on any
    // tile you can't cross with what you carry now, a bobber on water you could fish.
    if (terr === "lake" || terr === "sea") cls.push(`d${Math.min(depth, 3)}`);
    if (!Number.isFinite(moveCost(terr, exp.loadout.equipment.transport, exp.loadout.equipment.tools))) cls.push("blocked");
    if ((exp.fished ?? []).some((f) => f.x === x && f.y === y)) cls.push("fished");
    else if (canFish && Math.abs(x - exp.pos.x) <= 1 && Math.abs(y - exp.pos.y) <= 1 && grid.catches?.[y]?.[x]) cls.push("bobber");
    if (isPlayer && (terr === "lake" || terr === "sea")) cls.push("on-raft"); // Muse option 1: you're on the raft
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
    if (rt.hazardKeys.has(k)) cls.push("path-hazard"); // si7.6.9.6: this step costs HP (spores, no mask)
    if (rt.waypointKeys.has(k)) cls.push("path-waypoint");
    if (route.length && k === goalK) cls.push("path-goal");
    // D78: loadout-aware lock — a gated material whose any-of tool list is
    // unsatisfied by the currently-equipped tools (strictly better than the old
    // tier>1 marker: it clears once you're carrying the key).
    const locked = !!poi && !isCleared && !!poi.material && materialLocked(poi.material, exp.loadout.equipment.tools);
    if (locked) cls.push("locked");
    const per = poi ? perceived.get(k) : undefined;
    // cww: a RESOLVED forage node shows its material glyph (f/d/b) + a material colour
    // class, so the map teaches that forage varies (flint/deadwood look different once near).
    if (poi && !isCleared && poi.kind === "herb" && per?.detail?.material) cls.push(`mat-${per.detail.material}`);
    // wzx: a humanoid CAMP (the map-dropper) reads as a landmark at any range.
    const isCamp = !!poi && !isCleared && per?.landmark === "camp";
    if (isCamp) cls.push("landmark-camp");
    const ch = isPlayer ? PLAYER_CHAR : isCleared ? "·" : poi ? poiGlyph(poi.kind, per?.detail ?? null, per?.landmark) : TERRAIN_CHAR[grid.terrain[y]![x]!];
    // gate-legibility (playtest 2026-07-09 #1, node gate/reach visibility): a
    // surveyed / in-vision node names its ACCESS GATE at range (nodeGateNote reads
    // the PERCEIVED, range-gated gate) so a far vein's worth-the-trek and its
    // unlocking tool are legible — an agent trekked 50 tiles only to learn a node
    // was locked. Honest to sight: an out-of-range node (per.detail null) reveals nothing.
    const tierNote = per ? nodeGateNote(per.detail) : null;
    const title = stepBd
      ? stepExplain(stepBd)
      : isCamp // wzx: a camp reads as "map here" at any range, resolved or not
      ? `a camp — kill the humanoid here to loot a MAP${per && per.detail ? ` · ${flavorDetail(per.detail, poi!.kind)}` : ""}`
      : poi && !isCleared // a cleared tile shows '·' — its title must not keep the stale poi text (1te-d)
      ? (per && per.detail
          ? `${kindLabel(poi.kind)} · ${flavorDetail(per.detail, poi.kind)}${tierNote ? ` · ${tierNote}` : ""}`
          : poi.kind === "monster" ? "a monster" : `a ${kindLabel(poi.kind)} node`)
      : grid.terrain[y]![x]! === "spore-thicket"
      ? `spore-thicket — −${TERRAIN_HP_COST["spore-thicket"]} HP a step unless you carry a filter-mask`
      : grid.terrain[y]![x]!;
    // 48l.10: paint approved atlas frames. Missing defIds deliberately keep the
    // glyph path below; a creature must never borrow another creature's sprite.
    let tileAssetStyle = "";
    let overlay = "";
    const terrainStyle = tileStyle(grid.terrain[y]![x]!, grid.biomeId);
    if (terrainStyle) tileAssetStyle = ` style="${terrainStyle}"`;
    if (poi && !isCleared) {
      if (poi.kind === "monster" && poi.creature) {
        const spriteStyle = monsterStyle(poi.creature);
        if (spriteStyle) overlay = `<span class="sprite" style="${spriteStyle}" aria-hidden="true"></span>`;
      } else if (!(poi.kind === "herb" && per?.detail?.material && FORAGE_MATERIAL_CHAR[per.detail.material])) {
        const iconStyleValue = iconStyle(nodeIconId(poi.kind, per?.detail?.material));
        if (iconStyleValue) overlay = `<span class="nodeicon" style="${iconStyleValue}" aria-hidden="true"></span>`;
      }
    }
    // Round-5 raft sprite (monster atlas) has no rider, so the player glyph is drawn on top of it.
    const raft = isPlayer && cls.includes("on-raft") ? frameStyle("monster", "player-raft") : null;
    if (raft) {
      cls.push("raft-sprite");
      overlay = `<span class="nodeicon" style="${raft}" aria-hidden="true"></span>`;
      // keep the water under the raft: `.player`'s !important background would wipe the inline tile
      if (terrainStyle) tileAssetStyle = ` style="${terrainStyle.replace(/;/g, " !important;")} !important"`;
    }
    // The hero sprite (cel set only) replaces the @ glyph, standing on the tile (or the raft).
    const hero = isPlayer ? playerStyle() : null;
    if (hero) {
      cls.push("hero-sprite");
      overlay = `${raft ? overlay : ""}<span class="sprite hero" style="${hero}" aria-hidden="true"></span>`;
      if (terrainStyle && !raft) tileAssetStyle = ` style="${terrainStyle.replace(/;/g, " !important;")} !important"`;
    }
    const glyph = hero ? "" : raft ? `<span class="rider">${ch}</span>` : !isPlayer && (overlay !== "" || !poi) ? "" : isPlayer && overlay ? "" : ch;
    cells += `<div class="${cls.join(" ")}"${tileAssetStyle} data-x="${x}" data-y="${y}" title="${title}">${overlay}${glyph}</div>`;
  }

  const maxEnergy = exp.maxEnergy ?? MAX_ENERGY;
  // With a route planned, split the energy bar: the part you'll KEEP (green) + the
  // part it'll SPEND (orange, red if it would strand you). Planned = walk + auto-gather.
  const hasRoute = route.length > 0;
  const total = rt.walkCost + rt.actionCost;
  // df3: the STRAND verdict is auto-eat-aware — the walk over-budgets only when the
  // simulated energy (mid-walk refills applied) can't finish, not merely when the raw
  // walk+gather spend exceeds current energy. endEnergy is the honest projected end.
  const overBudget = hasRoute && rt.strands;
  const spend = Math.min(total, exp.energy); // clamp — a huge route must never blow out the bar
  const keep = exp.energy - spend;
  const pct = (v: number) => Math.min(100, (v / maxEnergy) * 100);
  // energy may exceed maxEnergy after a manual over-eat (m0a) — cap the bar fill at
  // 100% and surface the surplus rather than overflowing the track.
  const overFull = !hasRoute && exp.energy > maxEnergy;
  const overSpan = overFull ? ` <span class="overfull">+${round1(exp.energy - maxEnergy)}</span>` : "";
  const energyFill = hasRoute
    ? `<div class="fill energy" style="width:${pct(keep)}%"></div><div class="fill spend${overBudget ? " over" : ""}" style="width:${pct(spend)}%"></div>`
    : `<div class="fill energy" style="width:${pct(exp.energy)}%"></div>`;
  const energyLabel = hasRoute
    ? `${round1(exp.energy)}/${maxEnergy} → <b class="${overBudget ? "over" : ""}">${round1(Math.max(0, rt.endEnergy))}</b>${overBudget ? " ⚠ strands you" : ""}`
    : `${round1(exp.energy)}/${maxEnergy}${overSpan}`;
  const autoGatherOn = exp.autoGather ?? true;
  // kml: compact HUD bars that float over the map (landscape-first layout).
  const bars = `
    <div class="bar"><span>Energy</span><div class="track">${energyFill}</div><b>${energyLabel}</b></div>
    <div class="bar"><span>HP</span><div class="track"><div class="fill hp" style="width:${Math.min(100, (exp.hp / PLAYER_BASE_HP) * 100)}%"></div></div><b>${round1(exp.hp)}</b>${poisonChip(exp, legal)}</div>`;

  // End-of-route affordances (eot): the LAST waypoint drives Fight/Shoot/Survey.
  const endPoi = route.length ? poiAt.get(goalK) : undefined;
  const fight = endPoi && endPoi.kind === "monster" && endPoi.creature && !cleared.has(goalK) ? endPoi.creature : undefined;
  const shoot = fight !== undefined && legal.some((a) => a.type === "fight" && a.at !== undefined && a.at.x === rt.end.x && a.at.y === rt.end.y);
  const costClause = `<b class="${overBudget ? "over" : ""}">−${round1(total)}e</b>${rt.actionCost > 0 ? ` <span class="muted">(${round1(rt.walkCost)} walk + ${round1(rt.actionCost)} gather)</span>` : ""}`;
  const forecastClause = fight
    ? (() => {
        const f = combatForecast(exp.loadout, fight, exp.hp, exp.weaponBuff, exp.mapTier ?? 1); // D60: reflects an active coating
        return ` · <span class="forecast" title="bare-kit forecast — battle items apply when the fight starts">you ${round1(f.dmgOut)} / it ${round1(f.dmgIn)} — <b class="${f.winning ? "good" : "over"}">${f.winning ? `kill in ${f.toKill}` : "it wins"}</b></span>`;
      })()
    : "";
  const surveyAtEnd = legal.some((a) => a.type === "survey" && a.at.x === rt.end.x && a.at.y === rt.end.y);
  // si7.6.9.6: an adjacent monster at the route's end can take a thrown opener from here.
  const throwables = fight ? throwLegal(legal, rt.end) : [];
  const hpClause = rt.hpCost > 0 ? ` · <b class="over hp-tag" title="spore-thickets on this route — a filter-mask breathes free">−${round1(rt.hpCost)} HP</b>` : "";
  // Ambush warning (2i8, playtest F5): the walk auto-engages the FIRST monster on the
  // line — warn prominently when that fight is a forecast LOSS.
  const cm = rt.crossedMonster;
  const crossWarn = cm && !combatForecast(exp.loadout, cm.creature, exp.hp, exp.weaponBuff, exp.mapTier ?? 1).winning
    ? `<div class="over">⚠ runs into a ${name(cm.creature)} at (${cm.pos.x},${cm.pos.y}) you'd LOSE to — reroute.</div>`
    : "";
  // kml: the route bar floats at the bottom of the map — only when there's something to say.
  const routeBar = exp.combat
    ? `<div class="routebar engaged">⚔ <b>Engaged — ${name(exp.combat.creature)}</b> <button data-open-tab="here">fight / flee ▸</button></div>`
    : hasRoute
    ? `<div class="routebar${rt.blocked ? " blocked" : ""}">${crossWarn}${rt.blocked ? `<div class="over">✗ a leg crosses terrain you can't pass — tap the line to unwind.</div>` : ""}<div class="routeline">${fight ? `⚔ ${name(fight)} · ` : ""}${rt.walkable.length} tile${rt.walkable.length !== 1 ? "s" : ""} · ${costClause}${hpClause}${forecastClause}</div><div class="routebtns"><button class="primary" data-walk${rt.blocked ? " disabled" : ""}>${fight ? "Fight ▶" : "Walk ▶"}</button>${shoot ? `<button data-shoot title="engage from here — your opener lands first">🏹 Shoot</button>` : ""}${throwables.map((id) => `<button class="throw" data-throw="${id}" data-throw-x="${rt.end.x}" data-throw-y="${rt.end.y}" title="throw from here — ${describe(id)}">💥 Throw ${name(id).toLowerCase()} <span class="free-opener">FREE OPENER</span></button>`).join("")}${surveyAtEnd ? `<button data-survey-x="${rt.end.x}" data-survey-y="${rt.end.y}" title="resolve its detail from here">🔭 −${SURVEY_ENERGY}e</button>` : ""}<button data-cancelpath title="clear the route">✕</button></div></div>`
    : "";

  // kml: contextual quick actions on the map itself (so the common verbs never need
  // the drawer). Legality from reduce (D29).
  const here = grid.pois.find((p) => p.x === exp.pos.x && p.y === exp.pos.y);
  const quick: string[] = [];
  if (!exp.combat && here && legal.some((a) => a.type === "gather")) quick.push(`<button data-act="gather">${GATHER_VERB[here.kind]?.label ?? "Gather"}</button>`);
  if (canFish) quick.push(`<button data-act="fish" title="cast into the deepest water beside you (−${FISH_CAST_ENERGY}e)">🎣 Fish</button>`);
  if (exp.combat) quick.push(`<button data-act="fight">⚔ Fight</button>`, ...throwButtons(exp, legal), `<button data-act="flee">🏃 Flee</button>`);

  const cap = carryCap(exp.loadout.equipment);
  // 7lr: which foods can actually be eaten right now (speculative-reduce filtered), and
  // whether an eat would be the tent camp meal (tent equipped + an unspent charge).
  const eatable = new Set(legal.filter((a): a is Extract<Action, { type: "eat" }> => a.type === "eat").map((a) => a.defId));
  const campMealReady = exp.loadout.equipment.tools.includes("tent") && (exp.campMealsUsed ?? 0) < TENT_CAMP_MEALS;
  const inv = inventoryGrid(exp.loadout, exp.carry, cap, exp.autoEatFood ?? null, eatable, campMealReady);

  const hereTab = `
      ${exp.combat ? engagementPanel(state, exp, legal) : herePanel(state, grid, exp, legal) + fishLine(state, legal)}
      <div class="actions">
        ${exp.loadout.equipment.tools.includes("tent") ? `<span class="campmeal-badge${campMealReady ? " ready" : " spent"}" title="${campMealReady ? "eat a food from your bag as a CAMP MEAL — over max at +50%, once per run" : "camp meal spent this run"}">🏕 camp meal ${campMealReady ? "ready" : "spent"}</span>` : ""}
        ${legal.some((a) => a.type === "quaff") ? `<button data-act="quaff" title="drink a potion here (−${QUAFF_ENERGY}e)">🧪 Potion (−${QUAFF_ENERGY}e)</button>` : ""}
        ${enhanceButtons(exp)}
        <button data-act="return">⏎ Return to town</button>
      </div>
      ${exp.weaponBuff ? `<div class="muted small">🗡️ ${name(exp.weaponBuff.id)} · ${exp.weaponBuff.charges} strike${exp.weaponBuff.charges === 1 ? "" : "s"} left</div>` : ""}
      <details class="settings"><summary>Settings</summary>
        <div class="actions">
          <button data-toggle-autogather>Auto-gather on walk: <b>${autoGatherOn ? "on" : "off"}</b></button>
          <button data-act="toggle-auto-quaff" title="auto-drink a potion when HP drops low mid-fight">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
          <button data-act="toggle-auto-finish" title="resolve whole fights in one tap">Auto-finish fights: <b>${(exp.autoFinish ?? false) ? "on" : "off"}</b></button>
          <button class="link" data-newgame>new game</button>
        </div>
      </details>`;

  const bagTab = `
      <div class="muted small">${inv.used}/${cap} slots · tap a food to eat one · long-press / right-click a food to auto-eat it${exp.autoEatFood ? ` (now: <b>${name(exp.autoEatFood)}</b>)` : ""}</div>
      ${inv.html}
      ${exp.carry.length ? `<div class="bank">${exp.carry.map((s) => `<div class="bankitem"><span class="chip" title="${describe(s.defId)}">${name(s.defId)} ×${s.qty}</span>${legal.some((a) => a.type === "don" && a.itemId === s.defId) ? `<button data-don="${s.defId}" title="equip it (−${DON_DOFF_ENERGY}e)">don</button>` : ""}<button data-drop="${s.defId}">drop</button></div>`).join("")}</div>` : ""}
      ${(() => { const doffable = legal.filter((a) => a.type === "doff").map((a) => (a as { itemId: string }).itemId); return doffable.length ? `<div class="bank">${doffable.map((id) => `<div class="bankitem"><span class="chip" title="worn · ${describe(id)}">${name(id)} (worn)</span><button data-doff="${id}" title="stow it (−${DON_DOFF_ENERGY}e; takes a slot)">doff</button></div>`).join("")}</div>` : ""; })()}
      ${(exp.carriedMaps ?? []).length ? `<div class="muted small">maps ${(exp.carriedMaps ?? []).length}/${mapCarryCap(state.bank)}</div><div class="bank">${(exp.carriedMaps ?? []).map((m) => `<div class="bankitem"><span class="chip" title="banks as a held map when the run ends">🗺️ T${m.tier ?? 1} ${name(m.biomeId)}</span><button data-drop-map="${m.mapSeed}">drop</button></div>`).join("")}</div>` : ""}`;

  const craftTab = (() => {
    // ke3.4: field-craft list — legal craft candidates on expedition (reduce has already
    // filtered to field recipes you can make right here). gate-legibility (playtest
    // 2026-07-09 #1): also show kit-locked recipes greyed with what they need (whyNot — ciq).
    const fieldCrafts = legal.filter((a): a is Extract<Action, { type: "craft" }> => a.type === "craft");
    const craftable = new Set(fieldCrafts.map((a) => a.recipeId));
    const pool = [...exp.loadout.equipment.tools, ...exp.carry.map((s) => s.defId)];
    const kitLocked = Object.keys(RECIPE).filter((id) =>
      RECIPE[id]!.field && !craftable.has(id) && whyNot(state, { type: "craft", recipeId: id }) === "missing-tool");
    if (!fieldCrafts.length && !kitLocked.length) return `<div class="muted">Nothing to craft here. Field recipes need a kit (fire-kit, glassware…) and their ingredients.</div>`;
    const readyRows = fieldCrafts.map((a) => {
      const r = RECIPE[a.recipeId]!;
      const ing = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
      return `<div class="craftpath"><button data-craft="${a.recipeId}" title="field-craft (−${FIELD_CRAFT_ENERGY}e)">🔥 craft</button> ${recipeOutputQty(r, pool)}× ${name(r.output.defId)} <span class="muted small">← ${ing}</span></div>`;
    }).join("");
    const lockedRows = kitLocked.map((id) => {
      const r = RECIPE[id]!;
      return `<div class="craftpath locked">🔒 ${name(r.output.defId)} <span class="warn small">${recipeGateHint(id)}</span></div>`;
    }).join("");
    return `<div class="muted small">−${FIELD_CRAFT_ENERGY}e each</div><div class="craftlist">${readyRows}${lockedRows}</div>`;
  })();

  const tabBody = ui.tab === "bag" ? bagTab : ui.tab === "craft" ? craftTab : ui.tab === "log" ? ui.logHtml : hereTab;
  const tabBtn = (t: DrawerTab, label: string) => `<button class="tab${ui.tab === t ? " on" : ""}" data-tab="${t}">${label}</button>`;
  const hereSummary = exp.combat ? `⚔ ${name(exp.combat.creature)}` : here && !cleared.has(kk(here)) ? (here.kind === "monster" ? "a monster" : kindLabel(here.kind)) : grid.terrain[exp.pos.y]![exp.pos.x]!;

  return `
  <div class="exp">
    <div class="viewport" data-viewport>
      <div class="grid atlas-assets" data-grid style="grid-template-columns:repeat(${MAP_WIDTH}, 32px);">${cells}</div>
      <div class="hud">
        <div class="hud-title">${name(grid.biomeId)}${(exp.mapTier ?? 1) > 1 ? ` <span class="muted">T${exp.mapTier}</span>` : ""}</div>
        ${bars}
      </div>
      <button class="pan pan-n" data-pan="0,-2" aria-label="pan north">▲</button>
      <button class="pan pan-s" data-pan="0,2" aria-label="pan south">▼</button>
      <button class="pan pan-w" data-pan="-2,0" aria-label="pan west">◀</button>
      <button class="pan pan-e" data-pan="2,0" aria-label="pan east">▶</button>
      <button class="recentre" data-recentre title="centre on you" aria-label="centre on you">◎</button>
      ${quick.length ? `<div class="quick">${quick.join("")}</div>` : ""}
      ${routeBar}
    </div>
    <aside class="drawer${ui.drawerOpen ? " open" : ""}">
      <button class="drawer-handle" data-drawer-toggle><span class="grip"></span><span class="summary">${hereSummary} · ${inv.used}/${cap} bag</span><span class="chev">${ui.drawerOpen ? "▾" : "▴"}</span></button>
      <nav class="tabs">${tabBtn("here", "Here")}${tabBtn("bag", `Bag ${inv.used}/${cap}`)}${tabBtn("craft", "Craft")}${tabBtn("log", "Log")}</nav>
      <div class="drawer-body">${tabBody}</div>
    </aside>
  </div>
  `;
}

// The perceived/cleared sets and the derived route for the live state + planned
// waypoints — shared by the render and by wire handlers that run outside it (Walk
// needs the blocked flag; a tile click needs it to decide append-vs-restart).
export function currentDerived(state: GameState, route: Pos[]) {
  const exp = state.expedition;
  if (!exp) return null;
  const grid = expeditionGrid(exp);
  const perceived = new Map(perceive(grid, exp.pos, exp.loadout.equipment.tools, exp.surveyed ?? []).map((p) => [kk(p), p]));
  const resolved = new Set([...perceived].filter(([, p]) => p.detail != null).map(([k]) => k));
  const cleared = new Set(exp.cleared.map(kk));
  return { grid, perceived, cleared, rt: deriveRoute(grid, exp, route, resolved, cleared) };
}
