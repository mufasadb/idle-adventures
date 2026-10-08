// Interactive web driver (the human side of the two-driver design, spec §12).
// A thin, stateful shell over the pure engine: every button/cell click builds an
// Action, folds it through `reduce`, and re-renders. legalActions(state) drives
// what's offered, so the UI can never diverge from what the engine accepts.
// Routing is the player's job (eot): clicks build straight-line waypoints; Walk
// replays them as single `move`s, each still validated by `reduce`.
//
// This file owns the mutable UI state, the reduce funnel and the click wiring.
// The views are pure HTML builders in town-view.ts / expedition-view.ts /
// inventory.ts / log.ts; persistence lives in persist.ts.
import { newGame } from "../engine/town";
import { reduce } from "../engine/reduce";
import { route as walkWaypoints } from "../sim/play";
import { routeAfterClick } from "./route";
import type { Pos } from "./route";
import { name, rejectCopy } from "../render/render";
import type { GameState, Action, GameEvent, ItemStack, LoadoutSlot } from "../engine/types";
import type { LogEntry } from "./log";
import { logView } from "./log";
import { save, load, loadLog, saveLastPlan, loadLastPlan } from "./persist";
import { townView } from "./town-view";
import type { TownTab } from "./town-view";
import { expeditionView, currentDerived } from "./expedition-view";
import type { DrawerTab } from "./expedition-view";
import { expeditionGrid } from "../engine/grid";
import type { GatherableNodeType } from "../data/constants";
import { pickupCues, craftNote, heldOnRun, planWithout } from "./feedback";
import type { GatherMiss } from "./feedback";
import { emptyFx, paintFx } from "./fx";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "play";
const SAVE_KEY = `idle-adv:${seed}`;

let state: GameState = load(SAVE_KEY) ?? newGame(seed);
let log: LogEntry[] = loadLog(SAVE_KEY);
// eot: routing is the PLAYER's job. `route` is the planned list of waypoints (the
// player's tile is the implicit head); each leg between consecutive points is drawn
// as a naive STRAIGHT line (lineTiles), never an energy-optimal path. Clicks build,
// extend, and truncate it; Walk executes it. Empty = nothing planned.
let route: Pos[] = [];
// zpm.3: two-step town flow. `prep` = the mapSeed the player is preparing to embark
// on (null = the town OVERVIEW where you pick a map). Selecting a map (Prepare)
// sets it and shows the loadout screen; Embark commits, ← back clears it. Purely a
// VIEW mode — the loadout plan itself lives in state.loadout (D28). Cleared whenever
// we leave town (draw() guards it) so a consumed/rotated map can never linger.
let prep: string | null = null;
const app = document.querySelector<HTMLDivElement>("#app")!;
// kml: landscape-first expedition UI. The drawer (slide-up on phones, a sidebar on wide
// screens) holds everything that isn't the map; the map is a camera over the grid.
let drawerOpen = false;
let drawerTab: DrawerTab = "here";
let wasEngaged = false;
let townTab: TownTab = "main";
// beh/rx5/mki: transient action feedback (tile cues, pack glow, craft notes) — painted
// over each render by paintFx; purely presentational, never saved.
const fx = emptyFx();
const now = () => performance.now();

// rx5: record the on-map cues for a batch of reducer events (+ the walk's gather
// misses) and pulse the bag for anything that went into it.
function recordCues(events: GameEvent[], misses: GatherMiss[]): void {
  const exp = state.expedition;
  if (!exp) return;
  const pois = expeditionGrid(exp).pois;
  const kindAt = (p: Pos) => {
    const poi = pois.find((q) => q.x === p.x && q.y === p.y);
    return poi && poi.kind !== "monster" ? (poi.kind as GatherableNodeType) : null;
  };
  const cues = pickupCues(events, misses, kindAt, exp.loadout.equipment.tools);
  const t0 = now();
  for (const cue of cues) fx.cues.push({ cue, t0 });
  const defs = [...new Set(cues.filter((c) => c.kind === "gain" && c.defId).map((c) => c.defId!))];
  if (defs.length) fx.flash = { defs, t0 };
}

function newRun(): void { state = newGame(seed); log = [{ t: "note", text: "· new game" }]; route = []; draw(); }

// Replay each stored pack through reduce; items eaten/lost/sold-off last run just
// reject (insufficient / wrong-slot for a dead defId) and are counted as skipped.
function repackLast(): void {
  const plan = loadLastPlan(SAVE_KEY);
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
  if (action.type === "embark" && !events.some((e) => e.type === "action-rejected")) saveLastPlan(SAVE_KEY, prevLoadout);
  state = next;
  const rej = events.find((e) => e.type === "action-rejected");
  // rx5: a manual gather that the reducer refused gets the same tile cue a walk-over does.
  const misses: GatherMiss[] = action.type === "gather" && rej?.type === "action-rejected" && state.expedition
    ? [{ at: { ...state.expedition.pos }, reason: rej.reason }] : [];
  recordCues(events, misses);
  // mki: craft result next to the button (+ toast) — off the crafted / rejected event.
  if (action.type === "craft") {
    const n = craftNote(action.recipeId, events, (defId, where) => where === "field" && state.expedition
      ? heldOnRun(state.expedition, defId)
      : state.bank.filter((b) => b.defId === defId).reduce((k, b) => k + b.qty, 0));
    if (n) fx.note = { ok: n.ok, text: n.text, anchor: `[data-recipe="${n.recipeId}"]`, t0: now() };
  }
  // beh: a pack glows the bank row + the loadout slot it landed in; a refusal says why there.
  if (action.type === "pack") {
    if (rej?.type === "action-rejected") fx.note = { ok: false, text: `✗ can't pack ${name(action.itemId)} — ${rejectCopy(rej.reason, undefined, "pack")}`, anchor: `[data-bank="${action.itemId}"]`, t0: now() };
    else fx.packed = { defId: action.itemId, t0: now() };
  }
  for (const e of events) {
    // gate-legibility (playtest 2026-07-09 #1): a rejected CRAFT knows its recipeId
    // here (the event doesn't carry it) — name the exact missing station/tool/terrain.
    // A note, since formatEvent can't reconstruct it from the event alone.
    if (e.type === "action-rejected" && e.action === "craft" && action.type === "craft") {
      log.unshift({ t: "note", text: `✗ craft — ${rejectCopy(e.reason, action.recipeId)}` });
    } else {
      log.unshift({ t: "event", e });
    }
  }
  trimAndDraw();
}
function note(line: string): void { log.unshift({ t: "note", text: line }); trimAndDraw(); }
function trimAndDraw(): void { log = log.slice(0, 16); draw(); }
// beh: unpack ONE of an item — rebuild the plan without it, replaying every other pack
// through reduce (same path as repack; the engine has no unpack action, D28 plan-only).
function unpack(defId: string): void {
  const steps = planWithout(state.loadout, defId);
  if (!steps) return;
  let lo = { ...state, loadout: newGame(seed).loadout };
  let skipped = 0;
  for (const step of steps) {
    const r = reduce(lo, { type: "pack", slot: step.slot, itemId: step.itemId });
    if (r.events.some((e) => e.type === "action-rejected")) { skipped += 1; continue; }
    lo = r.state;
  }
  state = lo;
  fx.packed = null;
  note(`· unpacked 1× ${name(defId)}${skipped ? ` · ${skipped} other item(s) no longer fit and were dropped from the plan` : ""}`);
}
function planReset(): void {
  // pack is only a PLAN on state.loadout (D28: bank untouched until embark).
  state = { ...state, loadout: newGame(seed).loadout };
  note("· cleared the loadout plan");
}

const foodUnits = (food: ItemStack[]) => food.reduce((n, s) => n + s.qty, 0);

// Walk the planned waypoints (eot) through the SAME driver the console uses
// (sim/play route): straight lineTiles legs of single `move`s validated by reduce
// (D29), auto-gathering each tile landed on. It halts on the first rejection (its
// true cause, 1te-e), a walked-into fight (1te-a), or a FULL BAG — which pauses with
// the remaining route intact so you can make room and Walk again. Here we only
// summarise the result into the log.
function walkRoute(wps: Pos[]): void {
  const startEnergy = state.expedition!.energy;
  const startFood = state.expedition!.loadout.food;
  const r = walkWaypoints(state, wps);
  state = r.state;
  const exp = state.expedition!;
  // spend/food computed once from start→end state — no per-step sign juggling,
  // so auto-eat refills mid-walk net out correctly and never print "−-45e" (1te-b).
  const net = startEnergy - exp.energy; // >0 spent, <0 net gain from auto-eat
  const ate = foodUnits(startFood) - foodUnits(exp.loadout.food);
  if (r.steps > 0) log.unshift({ t: "walk", steps: r.steps, pos: { x: exp.pos.x, y: exp.pos.y }, net, ate, gathered: r.gathered });
  if (r.halt?.kind === "engaged") log.unshift({ t: "note", text: `⚔ engaged the ${name(exp.combat!.creature)} — resolve the fight in the panel below` });
  if (r.halt?.kind === "bag-full") log.unshift({ t: "note", text: `🎒 bag full — dropped anchor at (${exp.pos.x},${exp.pos.y}); make room and Walk to resume` });
  if (r.halt?.kind === "rejected") log.unshift({ t: "note", text: `✋ stopped — ${rejectCopy(r.halt.reason)}` });
  // Preserve the remaining route only on a bag-full pause (resume after making room);
  // a fight or an obstacle clears it so you re-plan from where you are.
  route = r.halt?.kind === "bag-full" ? r.remaining : [];
  recordCues(r.events, r.misses); // rx5: "+2 Copper Ore" rising off each node picked up; "needs pick" on the ones walked over
  trimAndDraw();
}

// --- rendering ---------------------------------------------------------------
function draw(): void {
  if (state.phase !== "town") prep = null; // leaving town drops the prep selection (zpm.3)
  const engaged = !!state.expedition?.combat;
  if (engaged && !wasEngaged) { drawerOpen = true; drawerTab = "here"; } // a fight just started: show its panel
  wasEngaged = engaged;
  document.body.classList.toggle("in-expedition", state.phase !== "town");
  app.innerHTML = state.phase === "town"
    ? `${townView(state, prep, loadLastPlan(SAVE_KEY).length > 0, townTab)}${logView(log)}`
    : expeditionView(state, route, { drawerOpen, tab: drawerTab, logHtml: logView(log) });
  wire(); save(SAVE_KEY, state, log);
  // c67 camera-follow, now a real camera (kml): re-centre on the player when their
  // POSITION changes; otherwise keep wherever the player panned to.
  if (state.phase !== "town" && state.expedition) {
    const p = `${state.expedition.pos.x},${state.expedition.pos.y}`;
    if (p !== camPos) { centerOnPlayer(); camPos = p; } else applyCam();
  } else camPos = null;
  paintFx(app, fx, now()); // after the camera: tile cues read live tile positions
}

// --- map camera (kml) ----------------------------------------------------------
// The grid is always zoomed (bigger on touch screens) and panned by a translate — no
// re-render, so panning stays smooth. cam = the top-left of the view in scaled px.
const TILE_PX = 33; // 32px tile + 1px grid gap
const ZOOM = matchMedia("(pointer: coarse)").matches ? 1.35 : 1;
let cam = { x: 0, y: 0 };
let camPos: string | null = null;
function viewportEl(): HTMLElement | null { return app.querySelector<HTMLElement>("[data-viewport]"); }
function applyCam(): void {
  const vp = viewportEl();
  const g = app.querySelector<HTMLElement>("[data-grid]");
  if (!vp || !g) return;
  const w = g.offsetWidth * ZOOM, h = g.offsetHeight * ZOOM;
  const slack = 48; // a little overscroll so edge tiles can clear the HUD
  const clamp = (v: number, size: number, view: number) =>
    size + 2 * slack <= view ? (size - view) / 2 : Math.max(-slack, Math.min(size - view + slack, v));
  cam = { x: clamp(cam.x, w, vp.clientWidth), y: clamp(cam.y, h, vp.clientHeight) };
  g.style.transform = `translate(${-cam.x}px, ${-cam.y}px) scale(${ZOOM})`;
}
function centerOnPlayer(): void {
  const vp = viewportEl();
  const pl = app.querySelector<HTMLElement>(".tile.player");
  if (!vp || !pl) return;
  cam = { x: (pl.offsetLeft + 16) * ZOOM - vp.clientWidth / 2, y: (pl.offsetTop + 16) * ZOOM - vp.clientHeight / 2 };
  applyCam();
}
function panBy(dx: number, dy: number): void { cam = { x: cam.x + dx, y: cam.y + dy }; applyCam(); }

// Drag-to-pan (mouse, one or two fingers): a pointer that moves past a small threshold
// pans instead of clicking, and the click it would have produced is swallowed.
const drag = { pointers: new Map<number, { x: number; y: number }>(), moved: 0, suppressClick: false };
function centroid(): { x: number; y: number } {
  let x = 0, y = 0;
  for (const p of drag.pointers.values()) { x += p.x; y += p.y; }
  const n = Math.max(1, drag.pointers.size);
  return { x: x / n, y: y / n };
}
function wireCamera(): void {
  const vp = viewportEl();
  if (!vp) return;
  vp.onpointerdown = (ev) => {
    if ((ev.target as HTMLElement).closest("button, .routebar, .hud")) return;
    drag.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (drag.pointers.size === 1) { drag.moved = 0; drag.suppressClick = false; }
  };
  vp.onpointermove = (ev) => {
    const prev = drag.pointers.get(ev.pointerId);
    if (!prev) return;
    const before = centroid();
    drag.pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const after = centroid();
    const dx = after.x - before.x, dy = after.y - before.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved > 8 || drag.pointers.size > 1) { drag.suppressClick = true; panBy(-dx, -dy); }
  };
  const end = (ev: PointerEvent) => { drag.pointers.delete(ev.pointerId); };
  vp.onpointerup = end;
  vp.onpointercancel = end;
  vp.addEventListener("click", (ev) => { if (drag.suppressClick) { ev.stopPropagation(); ev.preventDefault(); drag.suppressClick = false; } }, true);
  vp.onwheel = (ev) => { ev.preventDefault(); panBy(ev.deltaX, ev.deltaY); };
}
document.addEventListener("keydown", (ev) => {
  if (state.phase === "town" || (ev.target as HTMLElement).closest("input, textarea")) return;
  const step = 2 * TILE_PX * ZOOM;
  const d: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0] };
  const v = d[ev.key];
  if (!v) return;
  ev.preventDefault();
  panBy(v[0] * step, v[1] * step);
});
addEventListener("resize", () => applyCam());

// --- wiring: attach handlers after each render -------------------------------
function wire(): void {
  wireCamera();
  app.querySelectorAll<HTMLElement>("[data-town-tab]").forEach((el) => el.onclick = () => { townTab = el.dataset.townTab as TownTab; draw(); });
  app.querySelectorAll<HTMLElement>("[data-pan]").forEach((el) => el.onclick = () => { const [dx, dy] = el.dataset.pan!.split(",").map(Number); panBy(dx! * TILE_PX * ZOOM, dy! * TILE_PX * ZOOM); });
  const recentre = app.querySelector<HTMLElement>("[data-recentre]"); if (recentre) recentre.onclick = () => centerOnPlayer();
  const handle = app.querySelector<HTMLElement>("[data-drawer-toggle]"); if (handle) handle.onclick = () => { drawerOpen = !drawerOpen; draw(); };
  app.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => el.onclick = () => { drawerTab = el.dataset.tab as DrawerTab; drawerOpen = true; draw(); });
  app.querySelectorAll<HTMLElement>("[data-open-tab]").forEach((el) => el.onclick = () => { drawerTab = el.dataset.openTab as DrawerTab; drawerOpen = true; draw(); });
  app.querySelectorAll<HTMLElement>("[data-embark]").forEach((el) => el.onclick = () => apply({ type: "embark", mapSeed: el.dataset.embark! }));
  app.querySelectorAll<HTMLElement>("[data-prepare]").forEach((el) => el.onclick = () => { prep = el.dataset.prepare!; route = []; draw(); }); // zpm.3: enter the prep screen for this map
  app.querySelectorAll<HTMLElement>("[data-back]").forEach((el) => el.onclick = () => { prep = null; draw(); }); // zpm.3: back to the map overview
  app.querySelectorAll<HTMLElement>("[data-craft]").forEach((el) => el.onclick = () => apply({ type: "craft", recipeId: el.dataset.craft! }));
  app.querySelectorAll<HTMLElement>("[data-pack]").forEach((el) => el.onclick = () => apply({ type: "pack", slot: el.dataset.slot as LoadoutSlot, itemId: el.dataset.pack! }));
  app.querySelectorAll<HTMLElement>("[data-unpack]").forEach((el) => el.onclick = () => unpack(el.dataset.unpack!));
  app.querySelectorAll<HTMLElement>("[data-drop]").forEach((el) => el.onclick = () => apply({ type: "drop", itemId: el.dataset.drop! }));
  app.querySelectorAll<HTMLElement>("[data-don]").forEach((el) => el.onclick = () => apply({ type: "don", itemId: el.dataset.don! }));
  app.querySelectorAll<HTMLElement>("[data-doff]").forEach((el) => el.onclick = () => apply({ type: "doff", itemId: el.dataset.doff! }));
  app.querySelectorAll<HTMLElement>("[data-drop-map]").forEach((el) => el.onclick = () => apply({ type: "drop-map", mapSeed: el.dataset.dropMap! }));
  // si7.6.9.6: throw a flask — at the engaged monster, or from range at the route's end.
  app.querySelectorAll<HTMLElement>("[data-throw]").forEach((el) => el.onclick = () => {
    const x = el.dataset.throwX, y = el.dataset.throwY;
    route = [];
    apply(x !== undefined && y !== undefined ? { type: "throw", itemId: el.dataset.throw!, at: { x: Number(x), y: Number(y) } } : { type: "throw", itemId: el.dataset.throw! });
  });
  app.querySelectorAll<HTMLElement>("[data-use-item]").forEach((el) => el.onclick = () => apply({ type: "use-item", itemId: el.dataset.useItem! }));
  app.querySelectorAll<HTMLElement>("[data-enhance]").forEach((el) => el.onclick = () => apply({ type: "enhance", id: el.dataset.enhance! }));
  app.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => el.onclick = () => { route = []; apply({ type: el.dataset.act! } as Action); });
  const gatherToggle = app.querySelector<HTMLElement>("[data-toggle-autogather]"); if (gatherToggle) gatherToggle.onclick = () => apply({ type: "toggle-auto-gather" });
  // Auto-eat designation (mco): right-click a food box to set it as the auto-eat
  // food; right-clicking the already-designated one clears it (null = off).
  // 7lr: left-click a food box to eat one unit (tent + charge = camp meal).
  app.querySelectorAll<HTMLElement>("[data-eat]").forEach((el) => el.onclick = () => apply({ type: "eat", defId: el.dataset.eat! }));
  app.querySelectorAll<HTMLElement>("[data-eatfood]").forEach((el) => el.oncontextmenu = (ev) => {
    ev.preventDefault();
    const defId = el.dataset.eatfood!;
    apply({ type: "set-auto-eat-food", defId: state.expedition?.autoEatFood === defId ? null : defId });
  });
  const reset = app.querySelector<HTMLElement>("[data-reset]"); if (reset) reset.onclick = () => planReset();
  const repack = app.querySelector<HTMLElement>("[data-repack]"); if (repack) repack.onclick = () => repackLast();
  const cancel = app.querySelector<HTMLElement>("[data-cancelpath]"); if (cancel) cancel.onclick = () => { route = []; draw(); };
  const walk = app.querySelector<HTMLElement>("[data-walk]"); if (walk) walk.onclick = () => { const d = currentDerived(state, route); if (d && !d.rt.blocked) walkRoute(route); };
  // Shoot (D45): ranged engage on the LAST waypoint — stays put, spends no energy
  const shoot = app.querySelector<HTMLElement>("[data-shoot]"); if (shoot) shoot.onclick = () => { const at = route[route.length - 1]; if (at) { route = []; apply({ type: "fight", at }); } };
  // Survey (54f): resolve the last waypoint's detail at range, stay put
  const surveyBtn = app.querySelector<HTMLElement>("[data-survey-x]"); if (surveyBtn) surveyBtn.onclick = () => { const at = { x: Number(surveyBtn.dataset.surveyX), y: Number(surveyBtn.dataset.surveyY) }; route = []; apply({ type: "survey", at }); };
  app.querySelectorAll<HTMLElement>("[data-study]").forEach((el) => el.onclick = () => apply({ type: "study", mapSeed: el.dataset.study! })); // D95
  app.querySelectorAll<HTMLElement>("[data-ink-map]").forEach((el) => el.onclick = () => apply({ type: "ink", mapSeed: el.dataset.inkMap!, inkId: el.dataset.inkId! }));
  app.querySelectorAll<HTMLElement>("[data-newgame]").forEach((el) => el.onclick = () => { if (confirm("Start a new game? This wipes the current run.")) newRun(); });
  app.querySelectorAll<HTMLElement>(".tile[data-x]").forEach((el) => {
    const handler = (ev: Event) => { ev.preventDefault(); onTileClick({ x: Number(el.dataset.x), y: Number(el.dataset.y) }); };
    el.onclick = handler;
    el.oncontextmenu = handler; // right-click works too
  });
}

// A tile click builds the plan (eot): clear on self, TRUNCATE if the tile is already
// on the drawn line (earliest walk-order occurrence — handles self-crossing), else
// APPEND a new waypoint. No pathfinding — the line geometry is whatever routeAfterClick
// draws; a leg crossing a wall just shows a red marker and disables Walk.
function onTileClick(to: Pos): void {
  const exp = state.expedition;
  if (!exp) return;
  route = routeAfterClick(exp, route, to, currentDerived(state, route)?.rt.blocked ?? false);
  draw();
}

draw();
