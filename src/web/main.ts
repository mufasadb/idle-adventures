// Interactive web driver (the human side of the two-driver design, spec §12).
// A thin, stateful shell over the pure engine: every button/cell click builds an
// Action, folds it through `reduce`, and re-renders. legalActions(state) drives
// what's offered, so the UI can never diverge from what the engine accepts.
// Pathing (A*) is a UI convenience — it only proposes a sequence of `move`
// actions; each step is still validated by `reduce`.
import { newGame, candidateMaps } from "../engine/town";
import { reduce } from "../engine/reduce";
import { legalActions } from "../sim/legal";
import { generateGrid, rollBiome } from "../engine/grid";
import type { Grid } from "../engine/grid";
import { slotOf } from "../engine/catalog";
import { moveCost } from "../engine/move";
import { slotCap } from "../engine/carry";
import { RECIPE, MATERIAL_TIER, GRID_SIZE, MONSTERS } from "../data/constants";
import { TERRAIN_CHAR, POI_CHAR, PLAYER_CHAR } from "../render/render";
import type { GameState, Action, GameEvent, ItemStack, LoadoutSlot } from "../engine/types";

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
type Pending = { goal: Pos; path: Pos[]; cost: number; fight?: string } | null;

let state: GameState = load() ?? newGame(seed);
let log: string[] = loadLog();
let pending: Pending = null; // a proposed walk awaiting a confirm click
let chosenMap: { mapSeed: string; headline: string } | null = null; // one auto-picked candidate
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
function newRun(): void { state = newGame(seed); log = ["· new game"]; pending = null; chosenMap = null; draw(); }

// pick one candidate map at random from THIS visit's fresh offer (rotates with runs)
function pickMap(): { mapSeed: string; headline: string } {
  const maps = candidateMaps(state.seed, state.runs ?? 0);
  const m = maps[Math.floor(Math.random() * maps.length)]!;
  return { mapSeed: m.mapSeed, headline: m.preview.headline };
}

// --- action plumbing: one funnel so every interaction goes through reduce ----
function apply(action: Action): void {
  const { state: next, events } = reduce(state, action);
  state = next;
  for (const e of events) log.unshift(fmt(e));
  if (action.type === "embark") chosenMap = null; // reroll next time we're in town
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
    case "fought": return e.victory
      ? `⚔ beat the ${name(e.creature)} · −${round(e.hpLost)}hp${e.potionsUsed ? ` (${e.potionsUsed} potion${e.potionsUsed > 1 ? "s" : ""})` : ""} · loot ${e.loot.map((l) => `${l.qty}× ${name(l.defId)}`).join(", ") || "none"}`
      : `☠ the ${name(e.creature)} downed you · run ends, haul kept`;
    case "scouted": return `🔭 scouted: ${e.monsters.map((m) => `${name(m.creature)} T${m.tier} (${m.forecast.victory ? "win" : "LOSE"} −${round(m.forecast.hpLost)}hp)`).join("; ") || "nothing near"}`;
    case "crafted": return `✦ crafted ${e.output.qty}× ${name(e.output.defId)}`;
    case "packed": return `packed ${name(e.defId)} → ${e.slot}`;
    case "run-ended": return `— run ended (${e.reason}) —`;
    case "action-rejected": return `✗ ${e.action} rejected: ${e.reason}`;
  }
}
const round = (n: number) => Math.round(n * 10) / 10;
const kk = (p: Pos) => `${p.x},${p.y}`;

// --- A* pathfinding (UI convenience) -----------------------------------------
// `blocked` = live-monster tiles routed AROUND (monsters block a tile until
// beaten). The goal itself is allowed even if blocked, so you can click a monster
// to walk in and fight it — the route just won't pass through OTHER monsters.
function findPath(grid: Grid, start: Pos, goal: Pos, transport: string | null, blocked: Set<string>): { path: Pos[]; cost: number } | null {
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
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
      const nk = `${nx},${ny}`;
      if (blocked.has(nk) && nk !== goalK) continue; // route around other monsters
      const step = moveCost(grid.terrain[ny]![nx]!, transport);
      if (!Number.isFinite(step)) continue;
      const tentative = (g.get(cur) ?? Infinity) + step;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, p); g.set(nk, tentative); coord.set(nk, { x: nx, y: ny }); open.add(nk);
      }
    }
  }
  return null;
}

function confirmWalk(path: Pos[]): void {
  let steps = 0, spent = 0, stopped = false;
  for (const t of path) {
    const before = state.expedition!.energy;
    const { state: next, events } = reduce(state, { type: "move", to: t });
    if (events.some((e) => e.type === "action-rejected")) { stopped = true; break; }
    spent += before - next.expedition!.energy; steps += 1; state = next;
  }
  const p = state.expedition!.pos;
  log.unshift(`🚶 walked ${steps} tile${steps !== 1 ? "s" : ""} → (${p.x},${p.y}) · −${round(spent)}e${stopped ? " (stopped: blocked / out of energy)" : ""}`);
  pending = null; trimAndDraw();
}

// --- rendering ---------------------------------------------------------------
function draw(): void {
  app.innerHTML = state.phase === "town" ? townView() : expeditionView();
  wire(); save();
}

// A slot strip: `cap` boxes, filled left-to-right. `groups` are drawn in order
// with their class (food/potion ballast dimmed, loot bright); the rest are empty.
function slotStrip(groups: { items: ItemStack[]; cls: string }[], cap: number): string {
  const filled: string[] = [];
  for (const gr of groups) for (const it of gr.items) filled.push(`<div class="slot ${gr.cls}" title="${name(it.defId)} ×${it.qty}">${name(it.defId)}<span class="q">×${it.qty}</span></div>`);
  const boxes = filled.slice(0, cap);
  while (boxes.length < cap) boxes.push(`<div class="slot empty">·</div>`);
  return `<div class="slots">${boxes.join("")}</div>`;
}

function townView(): string {
  const legal = legalActions(state);
  const craftable = legal.filter((a): a is Extract<Action, { type: "craft" }> => a.type === "craft");
  const lo = state.loadout;
  const eq = lo.equipment;
  const cap = slotCap(eq.backpack);
  const foodEnergyHint = lo.food.reduce((s, f) => s + f.qty, 0);
  if (!chosenMap) chosenMap = pickMap();
  const equipRow = (label: string, val: string | null) =>
    `<div class="row"><span class="k">${label}</span><span class="v">${val ?? "<span class='muted'>—</span>"}</span></div>`;

  return `
  <header><h1>Town</h1><span class="muted">seed "${state.seed}"</span><button class="link" data-newgame>new game</button></header>
  <div class="cols">
    <section>
      <h2>Next map</h2>
      <div class="mapcard">
        <b>${chosenMap.headline}</b>
        <button data-embark="${chosenMap.mapSeed}">Embark ▶</button>
      </div>
      ${lo.food.length === 0 ? `<div class="warn">⚠ no food packed → you'll embark with 0 energy</div>` : ""}
      <div class="muted small">A map is rolled for you. Pack, then embark.</div>
    </section>

    <section>
      <h2>Loadout plan <button class="link" data-reset>reset</button></h2>
      ${equipRow("weapon", eq.weapon ? name(eq.weapon) : null)}
      ${equipRow("armour", [eq.helmet, eq.chest, eq.legs, eq.boots, eq.gloves].filter(Boolean).map((d) => name(d as string)).join(", ") || null)}
      ${equipRow("transport", eq.transport ? name(eq.transport) : null)}
      ${equipRow("backpack", eq.backpack ? `${name(eq.backpack)} (${cap} slots)` : `none (${cap} slots)`)}
      ${equipRow("tools", eq.tools.map(name).join(", ") || null)}
      <div class="row"><span class="k">bag (${cap} slots)</span></div>
      ${slotStrip([{ items: lo.food, cls: "food" }, { items: lo.potions, cls: "potion" }], cap)}
      <div class="muted small">food ≈ ${foodEnergyHint * 10}+ energy · dimmed slots are supplies; the rest carry loot on the map</div>
    </section>

    <section>
      <h2>Bank</h2>
      <div class="bank">
        ${state.bank.map((s) => {
          const slot = slotOf(s.defId);
          const canPack = slot !== null && legal.some((a) => a.type === "pack" && a.itemId === s.defId);
          return `<div class="bankitem">
            <span class="chip">${name(s.defId)} ×${s.qty}</span>
            ${canPack ? `<button data-pack="${s.defId}" data-slot="${slot}">pack</button>` : `<span class="muted small">${slot ?? "material"}</span>`}
          </div>`;
        }).join("")}
      </div>
    </section>

    <section>
      <h2>Craft ${craftable.length === 0 ? `<span class="muted small">(nothing affordable yet)</span>` : ""}</h2>
      <div class="craftlist">
        ${craftable.map((a) => {
          const r = RECIPE[a.recipeId]!;
          const cost = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
          return `<div class="craftitem"><button data-craft="${a.recipeId}">${r.output.qty}× ${name(r.output.defId)}</button><span class="muted small">${cost}</span></div>`;
        }).join("")}
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
    const m = MONSTERS[poi.creature]!;
    return `<div class="here monster">
      <b>Here:</b> a <b>${name(poi.creature!)}</b> — tier ${m.tier}, ${m.dmgType} damage, ${m.armourType} hide.
      It's static: it won't touch you unless you Fight. You can just walk past it.
      ${canFight ? `<button data-act="fight">⚔ Fight the ${name(poi.creature!)}</button>` : `<span class="warn">can't fight (bag full for its loot?)</span>`}
    </div>`;
  }
  // gatherable node
  const verb = GATHER_VERB[poi.kind]!;
  const tier = poi.material ? (MATERIAL_TIER[poi.material] ?? 1) : 1;
  const locked = tier > 1 && !canGather;
  const article = /^[aeiou]/i.test(verb.noun) ? "an" : "a";
  return `<div class="here ${locked ? "locked" : ""}">
    <b>Here:</b> ${article} ${verb.noun} — <b>${name(poi.material!)}</b>${tier > 1 ? ` <span class="tier">tier ${tier}</span>` : ""}.
    ${canGather ? `<button data-act="gather">${verb.label} it</button>`
      : locked ? `🔒 <span class="warn">your tool is too weak — needs a tier-${tier} tool to work ${name(poi.material!)}</span>`
      : `<span class="warn">can't ${verb.past.replace(/ed$/, "")} (no tool / bag full)</span>`}
  </div>`;
}

function expeditionView(): string {
  const exp = state.expedition!;
  const grid = generateGrid(exp.mapSeed, rollBiome(exp.mapSeed));
  const legal = legalActions(state);
  const canScout = legal.some((a) => a.type === "scout");

  const poiAt = new Map(grid.pois.map((p) => [kk(p), p]));
  const cleared = new Set(exp.cleared.map(kk));
  const pathSet = new Set(pending ? pending.path.map(kk) : []);
  const goalK = pending ? kk(pending.goal) : "";

  let cells = "";
  for (let y = 0; y < GRID_SIZE; y++) for (let x = 0; x < GRID_SIZE; x++) {
    const k = `${x},${y}`;
    const isPlayer = exp.pos.x === x && exp.pos.y === y;
    const poi = poiAt.get(k);
    const isCleared = cleared.has(k);
    const cls = ["tile", `terrain-${grid.terrain[y]![x]}`];
    if (poi && !isCleared) cls.push("poi", `poi-${poi.kind}`);
    if (isPlayer) cls.push("player");
    if (pathSet.has(k)) cls.push("path");
    if (k === goalK) cls.push("path-goal");
    const locked = poi && !isCleared && poi.material && (MATERIAL_TIER[poi.material] ?? 1) > 1;
    if (locked) cls.push("locked");
    const ch = isPlayer ? PLAYER_CHAR : isCleared ? "·" : poi ? POI_CHAR[poi.kind] : TERRAIN_CHAR[grid.terrain[y]![x]!];
    const title = poi
      ? `${poi.kind}${poi.material ? ` · ${poi.material}${locked ? ` (T${MATERIAL_TIER[poi.material]} — needs a better tool)` : ""}` : ""}${poi.creature ? ` · ${poi.creature}` : ""}`
      : grid.terrain[y]![x]!;
    cells += `<div class="${cls.join(" ")}" data-x="${x}" data-y="${y}" title="${title}">${ch}</div>`;
  }

  const bars = `
    <div class="bar"><span>Energy</span><div class="track"><div class="fill energy" style="width:${Math.min(100, exp.energy)}%"></div></div><b>${round(exp.energy)}</b></div>
    <div class="bar"><span>HP</span><div class="track"><div class="fill hp" style="width:${Math.min(100, (exp.hp / 30) * 100)}%"></div></div><b>${round(exp.hp)}</b></div>`;

  const pathBanner = pending
    ? `<div class="pathbanner">${pending.fight ? `⚔ walk in &amp; <b>fight the ${name(pending.fight)}</b> · ` : ""}→ (${pending.goal.x},${pending.goal.y}): ${pending.path.length} tile${pending.path.length !== 1 ? "s" : ""}, <b class="${pending.cost > exp.energy ? "over" : ""}">−${round(pending.cost)} energy</b> · <button data-walk>${pending.fight ? "Fight ▶" : "Walk ▶"}</button> <button class="link" data-cancelpath>cancel</button></div>`
    : `<div class="pathbanner muted">Click a tile → previews the route + energy. Click <b>Walk</b> (or the tile again / right-click) to go. Monsters (<b>X</b>) block their tile — click one to fight, or route around.</div>`;

  const cap = slotCap(exp.loadout.equipment.backpack);
  return `
  <header><h1>${rollBiome(exp.mapSeed)} expedition</h1><span class="muted">pos (${exp.pos.x},${exp.pos.y})</span><button class="link" data-newgame>new game</button></header>
  <div class="cols">
    <section class="mapwrap">
      ${bars}
      ${pathBanner}
      <div class="grid" style="grid-template-columns:repeat(${GRID_SIZE}, 1.4rem);">${cells}</div>
    </section>
    <section>
      ${herePanel(grid, exp, legal)}
      <h2>Actions</h2>
      <div class="actions">
        ${canScout ? `<button data-act="scout">🔭 Scout</button>` : ""}
        <button data-act="return">⏎ Return to town</button>
      </div>
      <h2>Bag <span class="muted small">${exp.loadout.food.length + exp.loadout.potions.length + exp.carry.length}/${cap}</span></h2>
      ${slotStrip([{ items: exp.loadout.food, cls: "food" }, { items: exp.loadout.potions, cls: "potion" }, { items: exp.carry, cls: "loot" }], cap)}
      <div class="muted small">dim = supplies (food/potions) · bright = loot. Every supply slot is a loot slot you gave up.</div>
      ${exp.carry.length ? `<div class="bank" style="margin-top:.5rem">${exp.carry.map((s) => `<div class="bankitem"><span class="chip">${name(s.defId)} ×${s.qty}</span><button data-drop="${s.defId}">drop</button></div>`).join("")}</div>` : ""}
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
  app.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => el.onclick = () => { pending = null; apply({ type: el.dataset.act! } as Action); });
  const reset = app.querySelector<HTMLElement>("[data-reset]"); if (reset) reset.onclick = () => planReset();
  const cancel = app.querySelector<HTMLElement>("[data-cancelpath]"); if (cancel) cancel.onclick = () => { pending = null; draw(); };
  const walk = app.querySelector<HTMLElement>("[data-walk]"); if (walk) walk.onclick = () => { if (pending) confirmWalk(pending.path); };
  app.querySelectorAll<HTMLElement>("[data-newgame]").forEach((el) => el.onclick = () => { if (confirm("Start a new game? This wipes the current run.")) newRun(); });
  app.querySelectorAll<HTMLElement>(".tile[data-x]").forEach((el) => {
    const handler = (ev: Event) => { ev.preventDefault(); onTileClick({ x: Number(el.dataset.x), y: Number(el.dataset.y) }); };
    el.onclick = handler;
    el.oncontextmenu = handler; // right-click works too
  });
}

function onTileClick(to: Pos): void {
  const exp = state.expedition;
  if (!exp) return;
  if (to.x === exp.pos.x && to.y === exp.pos.y) { pending = null; draw(); return; } // click self = cancel
  if (pending && kk(pending.goal) === kk(to)) { confirmWalk(pending.path); return; } // confirm
  const grid = generateGrid(exp.mapSeed, rollBiome(exp.mapSeed));
  const cleared = new Set(exp.cleared.map(kk));
  // live monsters block the route (you fight what you walk into) — routed around
  const blocked = new Set(grid.pois.filter((p) => p.kind === "monster" && p.creature && !cleared.has(kk(p))).map(kk));
  const found = findPath(grid, exp.pos, to, exp.loadout.equipment.transport, blocked);
  if (!found || found.path.length === 0) { pending = null; note("✗ can't reach that tile (walled off / blocked by a monster)"); return; }
  const goalPoi = grid.pois.find((p) => kk(p) === kk(to));
  const fight = goalPoi?.kind === "monster" && goalPoi.creature && !cleared.has(kk(to)) ? goalPoi.creature : undefined;
  pending = { goal: to, path: found.path, cost: found.cost, fight };
  draw();
}

draw();
