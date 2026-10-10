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
import { PLAYER_BASE_HP, RECIPE, MAP_WIDTH, MAP_HEIGHT, MAX_ENERGY, TENT_CAMP_MEALS, QUAFF_ENERGY, DON_DOFF_ENERGY, SURVEY_ENERGY, FIELD_CRAFT_ENERGY, FISH_CAST_ENERGY, FISH_DEEP_DEPTH, ANTIDOTE, TERRAIN_HP_COST } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";
import { TERRAIN_CHAR, poiGlyph, kindLabel, FORAGE_MATERIAL_CHAR, PLAYER_CHAR, flavorDetail, describe, recipeGateHint, nodeToolHint, nodeGateNote, materialGated, materialLocked, name, rejectCopy, GATHER_VERB, round1, preFightVerdict, isExhausted, costBand, tileName, tileYield, slowRouteNote, blockedRouteNote, verdictRoles, roleClass, worstVerdict } from "../render/render";
import type { FightVerdict } from "../render/render";
import { fightSheet, preFightCard, throwLegal, enhanceButtons, verdictDot } from "./fight-view";
import { perceive } from "../engine/perceive";
import type { GameState, Action } from "../engine/types";
import { inventoryGrid } from "./inventory";
import { heldOnRun } from "./feedback";

const kk = (p: Pos) => `${p.x},${p.y}`;
const capFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Human breakdown of a single step's energy — surfaced as a path tile's hover
// title so the horse/gear effect is visible: "plains 10e ÷2 (horse) = 5e".
function stepExplain(bd: ReturnType<typeof moveCostBreakdown>): string {
  if (!Number.isFinite(bd.base) && !bd.enabled) return `${bd.terrain} — impassable`;
  const parts: string[] = [`${bd.terrain} ${Number.isFinite(bd.base) ? bd.base + "e" : "∞"}`];
  if (bd.enabled) parts.push(`→ ${bd.enabled.to} (${name(bd.enabled.tool)})`);
  for (const d of bd.discounts) parts.push(`− ${d.amount} (${name(d.tool)})`);
  if (bd.transport) parts.push(`÷${bd.transport.divisor} (${name(bd.transport.id)})`);
  return `${parts.join(" ")} = ${round1(bd.final)}⚡`;
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
    // Standing on a live, un-engaged monster shouldn't happen in normal play
    // (move-onto-tile auto-engages, grid gen bars POIs from the entry tile,
    // victory relocation lands only on cleared tiles) — kept defensively for
    // hand-built/test states. eor: the same pre-fight card the route end shows.
    const verdict = preFightVerdict(exp.loadout, poi.creature, exp.hp, exp.weaponBuff, exp.mapTier ?? 1, exp.poisoned, exp.autoQuaff ?? true);
    return `<div class="here monster">
      ${preFightCard(state, exp, poi.creature, pos, verdict, per?.detail ?? null)}
      It's static: it won't touch you unless you Fight.
      ${canFight ? `<button data-act="fight">⚔ Engage the ${name(poi.creature)}</button>` : `<span class="warn">can't fight — ${rejectCopy(whyNot(state, { type: "fight" }) ?? "carry-full", undefined, "fight")}</span>`}
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
    return `<div class="here fish"><button data-act="fish">🎣 Fish</button> the deepest water beside you (−${FISH_CAST_ENERGY}⚡) · each spot bites once; deeper water, bigger catch.</div>`;
  }
  const reason = whyNot(state, { type: "fish" });
  if (!reason || reason === "no-water" || reason === "engaged") return "";
  return `<div class="here fish">🎣 <span class="warn">${rejectCopy(reason, undefined, "fish")}</span></div>`;
}

// si7.6.9.6: the poison chip beside the HP bar (a green skull + ticks left) and, when an
// antidote is held, its one-tap cure right next to it.
function poisonChip(exp: NonNullable<GameState["expedition"]>, legal: Action[]): string {
  if (!exp.poisoned) return "";
  const cure = legal.some((a) => a.type === "use-item" && ANTIDOTE.includes(a.itemId));
  return ` <span class="poison-chip" title="poisoned: −${exp.poisoned.dmg} HP per step or fight round for ${exp.poisoned.ticks} more — it can't take you below 1 HP">☠ ${exp.poisoned.ticks}</span>${cure ? `<button class="antidote" data-use-item="antidote" title="antidote — cure the poison (no turn, no energy)">🧪<span class="lbl"> Antidote</span></button>` : ""}`;
}

export type DrawerTab = "here" | "bag" | "craft" | "log";
export type ExpeditionUi = { drawerOpen: boolean; tab: DrawerTab; logHtml: string; confirmHome?: boolean; stuckDismissed?: boolean; costTint?: boolean };

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
    const band = costBand(moveCost(terr, exp.loadout.equipment.transport, exp.loadout.equipment.tools));
    if (band === null) cls.push("blocked");
    else if (ui.costTint ?? true) cls.push(`cost${band}`); // the cost tint: green cheap → red slow, with your gear
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
  const projecting = hasRoute && !rt.blocked; // seyh.5: a blocked route can't be walked — no spend to project
  const overFull = !projecting && exp.energy > maxEnergy;
  const overSpan = overFull ? ` <span class="overfull">+${round1(exp.energy - maxEnergy)}</span>` : "";
  const energyFill = projecting
    ? `<div class="fill energy" style="width:${pct(keep)}%"></div><div class="fill spend${overBudget ? " over" : ""}" style="width:${pct(spend)}%"></div>`
    : `<div class="fill energy" style="width:${pct(exp.energy)}%"></div>`;
  const energyLabel = projecting
    ? `${round1(exp.energy)}/${maxEnergy} → <b class="${overBudget ? "over" : ""}">${round1(Math.max(0, rt.endEnergy))}</b>${overBudget ? " ⚠ strands you" : ""}`
    : `${round1(exp.energy)}/${maxEnergy}${overSpan}`;
  const autoGatherOn = exp.autoGather ?? true;
  // kml: compact HUD bars that float over the map (landscape-first layout).
  const bars = `
    <div class="bar"><span>⚡ Energy</span><div class="track">${energyFill}</div><b>${energyLabel}</b></div>
    <div class="bar"><span>HP</span><div class="track"><div class="fill hp" style="width:${Math.min(100, (exp.hp / PLAYER_BASE_HP) * 100)}%"></div></div><b>${round1(exp.hp)}</b>${poisonChip(exp, legal)}</div>`;

  // End-of-route affordances (eot): the LAST waypoint drives Fight/Shoot/Survey.
  const endPoi = route.length ? poiAt.get(goalK) : undefined;
  const fight = endPoi && endPoi.kind === "monster" && endPoi.creature && !cleared.has(goalK) ? endPoi.creature : undefined;
  const shoot = fight !== undefined && legal.some((a) => a.type === "fight" && a.at !== undefined && a.at.x === rt.end.x && a.at.y === rt.end.y);
  const costClause = `<b class="${overBudget ? "over" : ""}">−${round1(total)}⚡</b>${rt.actionCost > 0 ? ` <span class="muted">(${round1(rt.walkCost)} walk + ${round1(rt.actionCost)} gather)</span>` : ""}`;
  // eor (D103): a monster at the route's end gets the pre-fight card — verdict colour,
  // both sides' attack/armour types, loot, bag-slot warning. No round counts.
  const verdictFor = (creature: string): FightVerdict => preFightVerdict(exp.loadout, creature, exp.hp, exp.weaponBuff, exp.mapTier ?? 1, exp.poisoned, exp.autoQuaff ?? true);
  const endVerdict = fight ? verdictFor(fight) : null;
  const fightCard = fight && endVerdict ? preFightCard(state, exp, fight, rt.end, endVerdict, perceived.get(goalK)?.detail ?? null) : "";
  const surveyAtEnd = legal.some((a) => a.type === "survey" && a.at.x === rt.end.x && a.at.y === rt.end.y);
  // si7.6.9.6: an adjacent monster at the route's end can take a thrown opener from here.
  const throwables = fight ? throwLegal(legal, rt.end) : [];
  const hpClause = rt.hpCost > 0 ? ` · <b class="over hp-tag" title="spore-thickets on this route — a filter-mask breathes free">−${round1(rt.hpCost)} HP</b>` : "";
  // Ambush warning (2i8, playtest F5): the walk auto-engages the FIRST monster on the
  // line — warn prominently when that fight is a forecast LOSS.
  const cm = rt.crossedMonster;
  const cmVerdict = cm && !(fight && cm.pos.x === rt.end.x && cm.pos.y === rt.end.y) ? verdictFor(cm.creature) : null;
  const crossWarn = cm && cmVerdict === "lose"
    ? `<div class="over">⚠ runs into a ${name(cm.creature)} at (${cm.pos.x},${cm.pos.y}) you'd LOSE to — reroute.</div>`
    : "";
  // seyh.5: the main button follows the verdict (worst of the end fight and any ambush):
  // lose → Walk/Fight goes secondary and "✕ Cancel route" is the filled primary; costly → amber.
  const roles = verdictRoles(worstVerdict(endVerdict, cmVerdict));
  const cancelBtn = roles.safe === "primary" ? `<button class="primary" data-cancelpath title="clear the route">✕ Cancel route</button>` : "";
  // 5k4: name the wall a leg hits (and the gear that crosses it, if any); a walkable
  // route over dear terrain says it'll be slower and hints at gear that speeds it.
  const firstBlock = rt.legs.find((l) => l.blockedAt)?.blockedAt ?? null;
  const blockNote = firstBlock ? `<div class="over">✗ ${capFirst(blockedRouteNote(grid.terrain[firstBlock.y]![firstBlock.x]!))}. <span class="muted">Tap the line to unwind.</span></div>` : "";
  const slow = hasRoute && !firstBlock ? slowRouteNote(rt.walkable.map((t) => grid.terrain[t.y]![t.x]!), exp.loadout.equipment) : null;
  const slowNote = slow ? `<div class="slow">🐢 ${slow}</div>` : "";
  // kml: the route bar floats at the bottom of the map — only when there's something to say.
  // A live fight has its own sheet (eor), so no route bar then.
  const routeBar = !exp.combat && hasRoute
    ? `<div class="routebar${rt.blocked ? " blocked" : ""}${fight ? " has-fight" : ""}">${crossWarn}${blockNote}${fightCard}<div class="routeline">${rt.walkable.length} tile${rt.walkable.length !== 1 ? "s" : ""} · ${costClause}${hpClause}</div>${slowNote}<div class="routebtns">${cancelBtn}<button class="${roleClass(roles.go)}" data-walk${rt.blocked ? " disabled" : ""}>${fight ? "Fight ▶" : "Walk ▶"}</button>${shoot ? `<button data-shoot title="engage from here — your opener lands first">🏹 Shoot</button>` : ""}${throwables.map((id) => `<button class="throw" data-throw="${id}" data-throw-x="${rt.end.x}" data-throw-y="${rt.end.y}" title="throw from here — ${describe(id)}">💥 Throw ${name(id).toLowerCase()} <span class="free-opener">FREE OPENER</span></button>`).join("")}${surveyAtEnd ? `<button data-survey-x="${rt.end.x}" data-survey-y="${rt.end.y}" title="resolve its detail from here">🔭 −${SURVEY_ENERGY}⚡</button>` : ""}${cancelBtn ? "" : `<button data-cancelpath title="clear the route">✕</button>`}</div></div>`
    : "";

  // qba: the tapped tile (the route's end) names itself and what reaching it costs —
  // a label pinned over the tile, riding the map camera.
  const endTerrain = grid.terrain[rt.end.y]![rt.end.x]!;
  const endCleared = cleared.has(goalK);
  const endPer = perceived.get(goalK);
  const endName = tileName(endTerrain, endPoi ?? null, endPer?.detail ?? null, endCleared);
  const endBlocked = firstBlock !== null;
  const tileLabel = hasRoute
    ? `<div class="tilelabel${endBlocked ? " blocked" : ""}" style="left:${2 + rt.end.x * 33 + 16}px;top:${2 + rt.end.y * 33}px">${endVerdict ? verdictDot(endVerdict) : ""}${endName} · ${endBlocked ? "can't reach" : `−${round1(rt.walkCost)}⚡`}</div>`
    : "";

  // kml: contextual quick actions on the map itself (so the common verbs never need
  // the drawer). Legality from reduce (D29). A fight's verbs live in its sheet (eor).
  const here = grid.pois.find((p) => p.x === exp.pos.x && p.y === exp.pos.y);
  const quick: string[] = [];
  if (!exp.combat && here && legal.some((a) => a.type === "gather")) quick.push(`<button data-act="gather">${GATHER_VERB[here.kind]?.label ?? "Gather"}</button>`);
  if (!exp.combat && canFish) quick.push(`<button data-act="fish" title="cast into the deepest water beside you (−${FISH_CAST_ENERGY}⚡)">🎣 Fish</button>`);

  const cap = carryCap(exp.loadout.equipment);
  // 7lr: which foods can actually be eaten right now (speculative-reduce filtered), and
  // whether an eat would be the tent camp meal (tent equipped + an unspent charge).
  const eatable = new Set(legal.filter((a): a is Extract<Action, { type: "eat" }> => a.type === "eat").map((a) => a.defId));
  const campMealReady = exp.loadout.equipment.tools.includes("tent") && (exp.campMealsUsed ?? 0) < TENT_CAMP_MEALS;
  const inv = inventoryGrid(exp.loadout, exp.carry, cap, exp.autoEatFood ?? null, eatable, campMealReady);

  const hereTab = `
      ${exp.combat ? `<div class="here monster">⚔ <b>Fighting the ${name(exp.combat.creature)}</b> — your moves are in the fight panel over the map.</div>` : herePanel(state, grid, exp, legal) + fishLine(state, legal)}
      <div class="actions">
        ${exp.loadout.equipment.tools.includes("tent") ? `<span class="campmeal-badge${campMealReady ? " ready" : " spent"}" title="${campMealReady ? "eat a food from your bag as a CAMP MEAL — over max at +50%, once per run" : "camp meal spent this run"}">🏕 camp meal ${campMealReady ? "ready" : "spent"}</span>` : ""}
        ${legal.some((a) => a.type === "quaff") ? `<button data-act="quaff" title="drink a potion here (−${QUAFF_ENERGY}⚡)">🧪 Potion (−${QUAFF_ENERGY}⚡)</button>` : ""}
        ${exp.combat ? "" : enhanceButtons(exp, legal)}
      </div>
      ${exp.weaponBuff ? `<div class="muted small">🗡️ ${name(exp.weaponBuff.id)} · ${exp.weaponBuff.charges} strike${exp.weaponBuff.charges === 1 ? "" : "s"} left</div>` : ""}
      <details class="settings"><summary>Settings</summary>
        <div class="actions">
          <button data-toggle-costtint title="tint each tile by what a step onto it costs you, with what you carry">Cost colours: <b>${(ui.costTint ?? true) ? "on" : "off"}</b></button>
          <button data-toggle-autogather>Auto-gather on walk: <b>${autoGatherOn ? "on" : "off"}</b></button>
          <button data-act="toggle-auto-quaff" title="auto-drink a potion when HP drops low mid-fight">Auto-potion: <b>${(exp.autoQuaff ?? true) ? "on" : "off"}</b></button>
          <button data-act="toggle-auto-finish" title="resolve whole fights in one tap">Auto-finish fights: <b>${(exp.autoFinish ?? false) ? "on" : "off"}</b></button>
          <button class="link" data-newgame>new game</button>
        </div>
      </details>`;

  const bagTab = `
      <div class="muted small">${inv.used}/${cap} slots · tap a food to eat one · long-press / right-click a food to auto-eat it${exp.autoEatFood ? ` (now: <b>${name(exp.autoEatFood)}</b>)` : ""}</div>
      ${inv.html}
      ${exp.carry.length ? `<div class="bank">${exp.carry.map((s) => `<div class="bankitem"><span class="chip" title="${describe(s.defId)}">${name(s.defId)} ×${s.qty}</span>${legal.some((a) => a.type === "don" && a.itemId === s.defId) ? `<button data-don="${s.defId}" title="equip it (−${DON_DOFF_ENERGY}⚡)">don</button>` : ""}<button data-drop="${s.defId}">drop</button></div>`).join("")}</div>` : ""}
      ${(() => { const doffable = legal.filter((a) => a.type === "doff").map((a) => (a as { itemId: string }).itemId); return doffable.length ? `<div class="bank">${doffable.map((id) => `<div class="bankitem"><span class="chip" title="worn · ${describe(id)}">${name(id)} (worn)</span><button data-doff="${id}" title="stow it (−${DON_DOFF_ENERGY}⚡; takes a slot)">doff</button></div>`).join("")}</div>` : ""; })()}
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
      // mki: the button is the one clickable thing; "have N" shows the craft land in the bag.
      const have = heldOnRun(exp, r.output.defId);
      return `<div class="craftpath" data-recipe="${a.recipeId}"><button class="craftbtn" data-craft="${a.recipeId}" title="field-craft (−${FIELD_CRAFT_ENERGY}⚡)">🔥 Craft</button> <span>${recipeOutputQty(r, pool)}× ${name(r.output.defId)}${have ? ` <span class="have small">· have ${have}</span>` : ""} <span class="muted small">← ${ing}</span></span></div>`;
    }).join("");
    const lockedRows = kitLocked.map((id) => {
      const r = RECIPE[id]!;
      return `<div class="craftpath locked" data-recipe="${id}">🔒 ${name(r.output.defId)} <span class="warn small">${recipeGateHint(id)}</span></div>`;
    }).join("");
    return `<div class="muted small">−${FIELD_CRAFT_ENERGY}⚡ each</div><div class="craftlist">${readyRows}${lockedRows}</div>`;
  })();

  const tabBody = ui.tab === "bag" ? bagTab : ui.tab === "craft" ? craftTab : ui.tab === "log" ? ui.logHtml : hereTab;
  const tabBtn = (t: DrawerTab, label: string) => `<button class="tab${ui.tab === t ? " on" : ""}" data-tab="${t}">${label}</button>`;
  // ai8: the collapsed drawer line says what your tile gives — and, with a route
  // planned, what the target gives (a monster with its verdict dot). One line.
  const yieldAt = (p: Pos, k: string): string => {
    const poi = poiAt.get(k) ?? null;
    const isCleared = cleared.has(k);
    const detail = perceived.get(k)?.detail ?? null;
    if (poi && !isCleared && poi.kind === "monster" && poi.creature) return `${verdictDot(verdictFor(poi.creature))}${name(poi.creature)}`;
    const y = tileYield(poi, detail, isCleared, exp.loadout.equipment.tools);
    const icon = y && detail?.material ? iconStyle(detail.material) : null;
    return y ? `${icon ? `<span class="sum-icon" style="${icon}"></span>` : ""}${y}` : tileName(grid.terrain[p.y]![p.x]!, poi, detail, isCleared);
  };
  const hereSummary = exp.combat ? `⚔ ${name(exp.combat.creature)}` : yieldAt(exp.pos, kk(exp.pos));
  const targetSummary = !exp.combat && hasRoute ? ` <span class="sum-target">▸ ${yieldAt(rt.end, goalK)}</span>` : "";

  return `
  <div class="exp${exp.combat ? " fighting" : ""}">
    <div class="viewport" data-viewport>
      <div class="grid atlas-assets" data-grid style="grid-template-columns:repeat(${MAP_WIDTH}, 32px);">${cells}${tileLabel}</div>
      <div class="hud">
        <div class="hud-title">${name(grid.biomeId)}${(exp.mapTier ?? 1) > 1 ? ` <span class="muted">T${exp.mapTier}</span>` : ""}</div>
        ${bars}
      </div>
      <button class="pan pan-n" data-pan="0,-2" aria-label="pan north">▲</button>
      <button class="pan pan-s" data-pan="0,2" aria-label="pan south">▼</button>
      <button class="pan pan-w" data-pan="-2,0" aria-label="pan west">◀</button>
      <button class="pan pan-e" data-pan="2,0" aria-label="pan east">▶</button>
      <button class="recentre" data-recentre title="centre on you" aria-label="centre on you">◎</button>
      ${exp.combat ? "" : `<button class="home-btn" data-home title="head home" aria-label="head home">🏠</button>`}
      ${homeSheet(state, legal, ui)}
      ${quick.length ? `<div class="quick">${quick.join("")}</div>` : ""}
      ${routeBar}
      ${exp.combat ? fightSheet(exp, legal) : ""}
    </div>
    <aside class="drawer${ui.drawerOpen ? " open" : ""}">
      <button class="drawer-handle" data-drawer-toggle><span class="grip"></span><span class="summary"><span class="sum-here">${hereSummary}</span>${targetSummary}</span><span class="bagcount">${inv.used}/${cap} bag</span><span class="chev">${ui.drawerOpen ? "▾" : "▴"}</span></button>
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

// The way home lives on the map (user 2026-10-10): the 🏠 button asks first; when
// you're out of energy and food with nothing to cook (isExhausted), the same card
// comes up on its own. Return is free (D62).
function homeSheet(state: GameState, legal: Action[], ui: ExpeditionUi): string {
  const stuck = isExhausted(state, legal) && !ui.stuckDismissed;
  if (!stuck && !ui.confirmHome) return "";
  const body = stuck
    ? `<h3>You're exhausted</h3><p>No energy left, nothing to eat, and nothing here to cook. Head home with what you carry?</p>`
    : `<h3>Head home?</h3><p>You'll walk back to town with everything you carry. The trip home is free.</p>`;
  return `<div class="home-sheet${stuck ? " stuck" : ""}" role="dialog" aria-label="head home">
    ${body}
    <div class="actions"><button class="primary" data-act="return">🏠 Go home</button><button data-home-cancel>${stuck ? "Not yet" : "Stay"}</button></div>
  </div>`;
}
