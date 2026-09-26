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
import type { GameState, Action, ItemStack, LoadoutSlot } from "../engine/types";
import type { LogEntry } from "./log";
import { logView } from "./log";
import { save, load, loadLog, saveLastPlan, loadLastPlan } from "./persist";
import { townView } from "./town-view";
import { expeditionView, currentDerived } from "./expedition-view";

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
  trimAndDraw();
}

// --- rendering ---------------------------------------------------------------
function draw(): void {
  // boc: every action rebuilds app.innerHTML, which discards the scrollable play
  // window (.gridscroll) and snaps it back to origin. Preserve its scroll offsets
  // across the re-render (save before, restore after) so the view stays put. Only
  // restores when a .gridscroll existed both before and after — phase transitions
  // (town has none) correctly fall through to the fresh element's default 0,0.
  if (state.phase !== "town") prep = null; // leaving town drops the prep selection (zpm.3)
  const prev = app.querySelector<HTMLElement>(".gridscroll");
  const keepScroll = prev ? { top: prev.scrollTop, left: prev.scrollLeft } : null;
  const body = state.phase === "town" ? townView(state, prep, loadLastPlan(SAVE_KEY).length > 0) : expeditionView(state, route);
  app.innerHTML = `${body}${logView(log)}`;
  if (keepScroll) {
    const next = app.querySelector<HTMLElement>(".gridscroll");
    if (next) { next.scrollTop = keepScroll.top; next.scrollLeft = keepScroll.left; }
  }
  wire(); save(SAVE_KEY, state, log);
  // c67 (playtest F4): camera-follow. The map is taller than its scroll window, so a
  // Walk that moves you north walks you off-screen and you must chase yourself. When
  // the player's POSITION changes, re-centre the window on them. On a pos-UNCHANGED
  // redraw (route planning, toggles) we leave the boc-preserved scroll alone, so
  // scrolling ahead to inspect a far node is never yanked back.
  if (state.phase !== "town" && state.expedition) {
    const p = `${state.expedition.pos.x},${state.expedition.pos.y}`;
    if (p !== camPos) { centerOnPlayer(); camPos = p; }
  } else camPos = null;
}

// c67: scroll the play window so the player tile sits at its centre (the browser
// clamps at the edges, so an edge player naturally shows the ground ahead).
let camPos: string | null = null;
function centerOnPlayer(): void {
  const gs = app.querySelector<HTMLElement>(".gridscroll");
  const pl = gs?.querySelector<HTMLElement>(".tile.player");
  if (!gs || !pl) return;
  const gsR = gs.getBoundingClientRect(), plR = pl.getBoundingClientRect();
  gs.scrollTop += (plR.top - gsR.top) - gs.clientHeight / 2 + plR.height / 2;
  gs.scrollLeft += (plR.left - gsR.left) - gs.clientWidth / 2 + plR.width / 2;
}

// --- wiring: attach handlers after each render -------------------------------
function wire(): void {
  app.querySelectorAll<HTMLElement>("[data-embark]").forEach((el) => el.onclick = () => apply({ type: "embark", mapSeed: el.dataset.embark! }));
  app.querySelectorAll<HTMLElement>("[data-prepare]").forEach((el) => el.onclick = () => { prep = el.dataset.prepare!; route = []; draw(); }); // zpm.3: enter the prep screen for this map
  app.querySelectorAll<HTMLElement>("[data-back]").forEach((el) => el.onclick = () => { prep = null; draw(); }); // zpm.3: back to the map overview
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
