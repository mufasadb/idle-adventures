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
import { moveCost, moveCostBreakdown } from "../engine/move";
import { carryCap } from "../engine/carry";
import { heldFoodEnergy } from "../engine/food";
import { RECIPE, MATERIAL_TIER, GRID_SIZE, BASE_ENERGY_FLOOR } from "../data/constants";
import { TERRAIN_CHAR, POI_CHAR, PLAYER_CHAR, flavorDetail, matchupLessons } from "../render/render";
import { perceive } from "../engine/perceive";
import type { GameState, Action, GameEvent, ItemStack, Loadout, Equipment, LoadoutSlot } from "../engine/types";

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

// --- action plumbing: one funnel so every interaction goes through reduce ----
function apply(action: Action): void {
  const { state: next, events } = reduce(state, action);
  state = next;
  for (const e of events) log.unshift(fmt(e));
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
    case "fought": {
      const lessons = matchupLessons(e.matchup, null);
      const tail = lessons.length ? ` · ${lessons.join(" · ")}` : "";
      return (e.victory
        ? `⚔ beat the ${name(e.creature)} · −${round(e.hpLost)}hp${e.potionsUsed ? ` (${e.potionsUsed} potion${e.potionsUsed > 1 ? "s" : ""})` : ""} · loot ${e.loot.map((l) => `${l.qty}× ${name(l.defId)}`).join(", ") || "none"}`
        : `☠ the ${name(e.creature)} downed you · run ends, haul kept`) + tail;
    }
    case "crafted": return `✦ crafted ${e.output.qty}× ${name(e.output.defId)}`;
    case "packed": return `packed ${name(e.defId)} → ${e.slot}`;
    case "run-ended": return `— run ended (${e.reason}) —`;
    case "action-rejected": return `✗ ${e.action} rejected: ${e.reason}`;
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
      if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
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

// The inventory grid (pqp/ju3). Each food/potion/battle-item UNIT and each tool
// is its own filled box (no stacking); loot materials stack (one box per stack,
// shown ×qty). Empty boxes pad to `cap`. Worn gear (weapon/armour/transport/
// backpack/panniers) is appended as semi-transparent GHOST boxes — you see your
// whole kit in one place, but ghosts don't spend a real slot. Food burns down
// over the run, so its boxes disappear live as they're eaten.
function slotBox(cls: string, label: string, q: string): string {
  return `<div class="slot ${cls}" title="${label}${q}">${label}${q ? `<span class="q">${q}</span>` : ""}</div>`;
}
function realSlots(loadout: Loadout, carry: ItemStack[]): string[] {
  const boxes: string[] = [];
  const units = (items: ItemStack[], cls: string) => {
    for (const it of items) for (let i = 0; i < it.qty; i++) boxes.push(slotBox(cls, name(it.defId), ""));
  };
  units(loadout.food, "food");
  units(loadout.potions, "potion");
  units(loadout.battleItems ?? [], "battle");
  for (const t of loadout.equipment.tools) boxes.push(slotBox("tool", name(t), ""));
  for (const s of carry) boxes.push(slotBox("loot", name(s.defId), `×${s.qty}`));
  return boxes;
}
function wornGhosts(eq: Equipment): string[] {
  const worn = [eq.weapon, eq.helmet, eq.chest, eq.legs, eq.boots, eq.gloves, eq.transport, eq.backpack, eq.panniers].filter(Boolean) as string[];
  return worn.map((d) => `<div class="slot ghost" title="${name(d)} — worn, no slot">${name(d)}</div>`);
}
// Returns { used, html }. used = real filled slots (ghosts excluded).
function inventoryGrid(loadout: Loadout, carry: ItemStack[], cap: number): { used: number; html: string } {
  const real = realSlots(loadout, carry);
  const boxes = [...real];
  while (boxes.length < cap) boxes.push(`<div class="slot empty">·</div>`);
  const ghosts = wornGhosts(loadout.equipment);
  const ghostStrip = ghosts.length ? `<div class="slots ghosts" title="worn gear — free, doesn't use a slot">${ghosts.join("")}</div>` : "";
  return { used: real.length, html: `<div class="slots">${boxes.join("")}</div>${ghostStrip}` };
}

function townView(): string {
  const legal = legalActions(state);
  const craftable = legal.filter((a): a is Extract<Action, { type: "craft" }> => a.type === "craft");
  const lo = state.loadout;
  const eq = lo.equipment;
  const cap = carryCap(eq);
  const inv = inventoryGrid(lo, [], cap);
  const offer = candidateMaps(state.seed, state.runs ?? 0);
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
            <b>${m.preview.headline}</b>
            <button data-embark="${m.mapSeed}">Embark ▶</button>
          </div>`).join("")}
      </div>
      ${lo.food.length === 0 ? `<div class="warn">⚠ no food packed → only the base ${BASE_ENERGY_FLOOR} energy (a short run), and nothing to eat mid-run</div>` : ""}
      <div class="muted small">Pick a biome to work this run. The offer rotates every time you return.</div>
    </section>

    <section>
      <h2>Loadout plan <button class="link" data-reset>reset</button></h2>
      ${equipRow("weapon", eq.weapon ? name(eq.weapon) : null)}
      ${equipRow("armour", [eq.helmet, eq.chest, eq.legs, eq.boots, eq.gloves].filter(Boolean).map((d) => name(d as string)).join(", ") || null)}
      ${equipRow("transport", eq.transport ? `${name(eq.transport)}${TRANSPORT_ROLE[eq.transport] ? ` — ${TRANSPORT_ROLE[eq.transport]}` : ""}` : null)}
      ${eq.panniers ? equipRow("panniers", name(eq.panniers)) : ""}
      ${equipRow("backpack", eq.backpack ? name(eq.backpack) : "none")}
      ${equipRow("tools", eq.tools.map(name).join(", ") || null)}
      <div class="row"><span class="k">bag</span><span class="v">${inv.used}/${cap} slots</span></div>
      ${inv.html}
      <div class="muted small">worn gear (ghosted) is free · each food / potion / battle-item / tool takes one slot · food banks ≈ ${heldFoodEnergy(lo.food)} energy and burns down as you travel</div>
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
      <h2>Recipe book <span class="muted small">everything craftable · ingredients named, sources not</span></h2>
      <div class="craftlist">
        ${(() => {
          const affordable = new Set(craftable.map((a) => a.recipeId));
          const ids = Object.keys(RECIPE).sort((a, b) => {
            const av = affordable.has(a) ? 0 : 1, bv = affordable.has(b) ? 0 : 1;
            return av - bv; // affordable first, else stable insertion order
          });
          return ids.map((id) => {
            const r = RECIPE[id]!;
            const cost = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
            const can = affordable.has(id);
            const out = `${r.output.qty}× ${name(r.output.defId)}`;
            return `<div class="craftitem${can ? "" : " locked"}">${
              can
                ? `<button data-craft="${id}">${out}</button>`
                : `<span class="craftname">${out}</span>`
            }<span class="muted small">${cost}</span></div>`;
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
    const per = perceive(grid, exp.pos, exp.loadout.equipment.tools).find((p) => p.x === poi.x && p.y === poi.y);
    const desc = flavorDetail(per?.detail ?? null, "monster");
    return `<div class="here monster">
      <b>Here:</b> a <b>${name(poi.creature!)}</b> — <i>${desc}</i>.
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

  const poiAt = new Map(grid.pois.map((p) => [kk(p), p]));
  const perceived = new Map(
    perceive(grid, exp.pos, exp.loadout.equipment.tools).map((p) => [`${p.x},${p.y}`, p]),
  );
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
    const title = stepBd
      ? stepExplain(stepBd)
      : poi
      ? (per && per.detail
          ? `${poi.kind} · ${flavorDetail(per.detail, poi.kind)}${locked ? ` (needs a better tool)` : ""}`
          : poi.kind === "monster" ? "a monster" : `a ${poi.kind} node`)
      : grid.terrain[y]![x]!;
    cells += `<div class="${cls.join(" ")}" data-x="${x}" data-y="${y}" title="${title}">${ch}</div>`;
  }

  const bars = `
    <div class="bar"><span>Energy</span><div class="track"><div class="fill energy" style="width:${Math.min(100, exp.energy)}%"></div></div><b>${round(exp.energy)}</b></div>
    <div class="bar"><span>HP</span><div class="track"><div class="fill hp" style="width:${Math.min(100, (exp.hp / 30) * 100)}%"></div></div><b>${round(exp.hp)}</b></div>`;

  const saving = pending
    ? pending.path.reduce((s, p) => s + moveCostBreakdown(grid.terrain[p.y]![p.x]!, null, []).final, 0) - pending.cost
    : 0;
  const savingClause = pending && Number.isFinite(saving) && saving > 0 ? ` · gear/transport saved ${round(saving)}e` : "";
  const pathBanner = pending
    ? `<div class="pathbanner">${pending.fight ? `⚔ walk in &amp; <b>fight the ${name(pending.fight)}</b> · ` : ""}→ (${pending.goal.x},${pending.goal.y}): ${pending.path.length} tile${pending.path.length !== 1 ? "s" : ""}, <b class="${pending.cost > exp.energy ? "over" : ""}">−${round(pending.cost)} energy</b>${savingClause} · <button data-walk>${pending.fight ? "Fight ▶" : "Walk ▶"}</button> <button class="link" data-cancelpath>cancel</button></div>`
    : `<div class="pathbanner muted">Click a tile → previews the route + energy. Click <b>Walk</b> (or the tile again / right-click) to go. Monsters (<b>X</b>) block their tile — click one to fight, or route around.</div>`;

  const cap = carryCap(exp.loadout.equipment);
  const inv = inventoryGrid(exp.loadout, exp.carry, cap);
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
        <button data-act="return">⏎ Return to town</button>
      </div>
      <h2>Bag <span class="muted small">${inv.used}/${cap} slots</span></h2>
      ${inv.html}
      <div class="muted small">food (green) burns down as you travel — freeing slots for loot (gold). Potions purple · battle items red · tools grey · worn gear ghosted (free).</div>
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
  const found = findPath(grid, exp.pos, to, exp.loadout.equipment.transport, exp.loadout.equipment.tools, blocked);
  if (!found || found.path.length === 0) { pending = null; note("✗ can't reach that tile (walled off / blocked by a monster)"); return; }
  const goalPoi = grid.pois.find((p) => kk(p) === kk(to));
  const fight = goalPoi?.kind === "monster" && goalPoi.creature && !cleared.has(kk(to)) ? goalPoi.creature : undefined;
  pending = { goal: to, path: found.path, cost: found.cost, fight };
  draw();
}

draw();
