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
import { name, rejectCopy, setEnergyUnit, tradeoff, tradeoffDelta, tradeoffDeltaText, homecomingSummary, knownRecipeIds } from "../render/render";
import type { Homecoming } from "../render/render";
import { homeStripHtml, homeGoods, playHaul } from "./homecoming";
import { installItemCard } from "./item-card";
import type { GameState, Action, GameEvent, ItemStack, Loadout, LoadoutSlot } from "../engine/types";
import type { LogEntry } from "./log";
import { logView } from "./log";
import { save, load, loadLog, saveLastPlan, loadLastPlan, migrateFog, FOG_NOTICE, loadResearchLog, saveResearchLog, RESEARCH_HISTORY_MAX, saveRunStart, loadRunStart, restOfPlan, replayPlan, repackOffer, planActions } from "./persist";
import { mountTree, focusRecipe } from "./craft-tree";
import type { ResearchLogEntry } from "./craft-tree";
import { townView, prepValid } from "./town-view";
import { mountRegion } from "./region-view";
import { townSceneView, mountScene, walkOut, walkIn, goToSpot, resetScene, scene } from "./town-scene";
import { scenePlacements } from "./town-layout";
import type { Spot } from "./town-layout";
import { formatLogEntry } from "./log";
import type { TownTab } from "./town-view";
import { expeditionView, currentDerived } from "./expedition-view";
import type { TrailStep } from "./expedition-view";
import type { DrawerTab } from "./expedition-view";
import { expeditionGrid } from "../engine/grid";
import type { GatherableNodeType } from "../data/constants";
import { pickupCues, craftNote, heldOnRun, planWithout } from "./feedback";
import type { GatherMiss } from "./feedback";
import { emptyFx, paintFx } from "./fx";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "play";
const SAVE_KEY = `idle-adv:${seed}`;

let state: GameState = load(SAVE_KEY) ?? newGame(seed, { recipeFog: true }); // 675: new games are fogged
let log: LogEntry[] = loadLog(SAVE_KEY);
// 675: a save from before the fog gets it switched on once (nothing held is stranded — persist.migrateFog).
{ const fogged = migrateFog(state); if (fogged) { state = fogged; log.unshift({ t: "note", text: FOG_NOTICE }); save(SAVE_KEY, state, log); } }
// 675: the research table's history (persisted beside the save) + this session's latest result.
let researchLog: ResearchLogEntry[] = loadResearchLog(SAVE_KEY);
let researchLast: ResearchLogEntry | null = null;
// eot: routing is the PLAYER's job. `route` is the planned list of waypoints (the
// player's tile is the implicit head); each leg between consecutive points is drawn
// as a naive STRAIGHT line (lineTiles), never an energy-optimal path. Clicks build,
// extend, and truncate it; Walk executes it. Empty = nothing planned.
let route: Pos[] = [];
let trail: TrailStep[] = []; // seyh.10: tiles walked this run (faint footprints); cleared back in town
// zpm.3: two-step town flow. `prep` = the mapSeed the player is preparing to embark
// on (null = the town OVERVIEW where you pick a map). Selecting a map (Prepare)
// sets it and shows the loadout screen; Embark commits, ← back clears it. Purely a
// VIEW mode — the loadout plan itself lives in state.loadout (D28). Cleared whenever
// we leave town (draw() guards it) so a consumed/rotated map can never linger.
let prep: string | null = null;
const app = document.querySelector<HTMLDivElement>("#app")!;
setEnergyUnit("⚡"); // user 2026-10-10: lightning for energy (the console keeps "e")
installItemCard(app); // f2i7: hold (or tap) an item to see what it does
// kml: landscape-first expedition UI. The drawer (slide-up on phones, a sidebar on wide
// screens) holds everything that isn't the map; the map is a camera over the grid.
let drawerOpen = false;
let drawerTab: DrawerTab = "here";
let costTint = (() => { try { return localStorage.getItem("idle-adv:costTint") === "on"; } catch { return false; } })(); // per-viewer map setting; opt-in since seyh.10 (D105) — the route's footprints show cost now
let confirmHome = false; // the 🏠 button's "head home?" card is up
let confirmEmbark = false; // seyh.5: a risky start's "Embark anyway?" inline confirm is up (cleared by any action)
let stuckDismissed = false; // "Not yet" on the exhausted card (cleared on any accepted action)
let wasEngaged = false;
let townTab: TownTab = "main";
// d13: the packing screen's open worn-slot swap menu (view-only).
let wornOpen: string | null = null;
// 0m4: the town is a walkable square (the scene) by default; "menus" is the plain tabbed
// town, kept as a fallback so every function stays reachable without the scene.
type TownMode = "scene" | "menus";
let townMode: TownMode = (() => { try { return localStorage.getItem("ia-town") === "menus" ? "menus" : "scene"; } catch { return "scene"; } })();
// In the scene, `prep` is the CHOSEN map and the Pack sheet is a separate overlay —
// closing it keeps the choice (the cloth by the gate reopens it).
let packOpen = false;
// seyh.31: the pack sheet packs last run's kit by itself the first time it opens in a
// town stay (empty plan only) — once, so a Reset afterwards stays cleared.
let autoRepacked = false;
let lastPhase: GameState["phase"] | null = null;
// beh/rx5/mki: transient action feedback (tile cues, pack glow, craft notes) — painted
// over each render by paintFx; purely presentational, never saved.
const fx = emptyFx();
// seyh.1: the last run's homecoming (render.homecomingSummary) — shown as the square's
// foot strip once the haul has flown into the bank (homeShown), until you next act in
// town. View-only and unsaved: a reload just skips it (the bank already has the haul).
let homecoming: Homecoming | null = null;
let homeShown = false;
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

function newRun(): void { state = newGame(seed, { recipeFog: true }); log = [{ t: "note", text: "· new game" }]; route = []; researchLog = []; researchLast = null; saveResearchLog(SAVE_KEY, researchLog); draw(); }

// Replay each stored pack through reduce; items eaten/lost/sold-off last run just
// reject (insufficient / wrong-slot for a dead defId) and are counted as skipped.
// seyh.31: only the steps the plan doesn't already hold, so "Repack the rest" after a
// partial auto-pack never doubles up.
function repackLast(): void {
  const rest = restOfPlan(loadLastPlan(SAVE_KEY), state.loadout);
  if (!rest.length) return;
  const r = replayPlan(state, rest);
  state = r.state;
  note(`↻ repacked last loadout${r.skipped ? ` · skipped ${r.skipped} (not in bank / no slot)` : ""}`);
}
// seyh.31 (owner: "if I have the same stuff as last time, default to having that packed"):
// on the sheet's first opening this town stay, with nothing planned yet, pack last run's
// kit through the same reduce path the button uses. Partial → a toast says what's missing.
function autoRepack(): void {
  autoRepacked = true;
  if (planActions(state.loadout).length) return;
  const plan = loadLastPlan(SAVE_KEY);
  if (!plan.length) return;
  const r = replayPlan(state, plan);
  if (!r.packed) return;
  state = r.state;
  const text = r.skipped ? `↻ packed what you took last time · ${r.skipped} left behind (not in the bank / no room)` : "↻ packed what you took last time";
  log.unshift({ t: "note", text });
  fx.note = { ok: true, text, anchor: null, t0: now() };
}

// --- action plumbing: one funnel so every interaction goes through reduce ----
function apply(action: Action): GameEvent[] {
  confirmEmbark = false;
  const events = step(action);
  trimAndDraw();
  return events;
}
// o9vr: craft N from the workshop tray — N real craft actions through the same funnel
// (the reducer decides each one), drawn once; stops at the first refusal.
function craftN(recipeId: string, n: number): void {
  let made = 0, got = 0;
  for (let i = 0; i < n; i++) {
    const ev = step({ type: "craft", recipeId });
    if (ev.some((e) => e.type === "action-rejected")) break;
    made++;
    for (const e of ev) if (e.type === "crafted") got += e.output.qty;
  }
  // the note names the last craft ("+2 Ration … (now 9)") — say the batch's total instead
  if (made > 1 && fx.note?.ok) fx.note = { ...fx.note, text: fx.note.text.replace(/^\+\d+/, `+${got}`) };
  trimAndDraw();
}
function closeTree(): void {
  if (state.phase === "town" && townMode === "scene" && !packOpen) scene.panel = null;
  else townTab = "main";
  draw();
}
function step(action: Action): GameEvent[] {
  const prevState = state; // seyh.1: the last expedition state, for the homecoming
  const prevLoadout = state.loadout; // embark consumes this plan — stash it for repack
  const { state: next, events } = reduce(state, action);
  if (action.type === "embark" && !events.some((e) => e.type === "action-rejected")) {
    saveLastPlan(SAVE_KEY, prevLoadout);
    saveRunStart(SAVE_KEY, knownRecipeIds(prevState)); // seyh.1: what's "new" at the end of this run
    homecoming = null;
  }
  state = next;
  const rej = events.find((e) => e.type === "action-rejected");
  // seyh.1: every run end (return, or defeat) comes from one action — summarise it here;
  // any later accepted town action retires a strip that's already been seen.
  const home = homecomingSummary(prevState, events, next, loadRunStart(SAVE_KEY));
  if (home) { homecoming = home; homeShown = false; }
  else if (!rej && homeShown && prevState.phase === "town") homecoming = null;
  if (!rej) stuckDismissed = false; // the world moved on: re-check exhaustion fresh
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
    else { fx.packed = { defId: action.itemId, t0: now() }; tradeFlash(prevLoadout); }
    wornOpen = null;
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
  return events;
}
// 675: ask the research table. Hit or miss, the result shows in the panel and joins the history.
function research(query: string): void {
  const q = query.trim();
  if (!q) return;
  const ev = reduce(state, { type: "research", query: q }).events; // peek: is it accepted? (apply logs + draws either way)
  const hit = ev.find((e) => e.type === "research-hit");
  const miss = ev.find((e) => e.type === "research-miss");
  const entry: ResearchLogEntry | null = hit?.type === "research-hit" ? { q, hit: hit.recipeId } : miss?.type === "research-miss" ? { q, ...(miss.alreadyKnown ? { known: true } : {}) } : null;
  if (entry) { researchLast = entry; researchLog = [entry, ...researchLog].slice(0, RESEARCH_HISTORY_MAX); saveResearchLog(SAVE_KEY, researchLog); }
  apply({ type: "research", query: q });
}
// 675: "find it in the workshop →" — open the tree and flash the recipe's card.
function findRecipe(recipeId: string): void {
  if (townMode === "scene") scene.panel = "recipes"; else townTab = "recipes";
  draw();
  focusRecipe(app, recipeId);
}
function note(line: string): void { log.unshift({ t: "note", text: line }); trimAndDraw(); }
function trimAndDraw(): void { log = log.slice(0, 16); draw(); }
// beh: unpack ONE of an item — rebuild the plan without it, replaying every other pack
// through reduce (same path as repack; the engine has no unpack action, D28 plan-only).
function unpack(defId: string, slot?: LoadoutSlot): void {
  const steps = planWithout(state.loadout, defId, slot);
  if (!steps) return;
  let lo = { ...state, loadout: newGame(seed).loadout };
  let skipped = 0;
  for (const step of steps) {
    const r = reduce(lo, { type: "pack", slot: step.slot, itemId: step.itemId });
    if (r.events.some((e) => e.type === "action-rejected")) { skipped += 1; continue; }
    lo = r.state;
  }
  const before = state.loadout;
  state = lo;
  fx.packed = null;
  tradeFlash(before);
  wornOpen = null;
  const text = `unpacked 1× ${name(defId)}${skipped ? ` · ${skipped} other item(s) no longer fit and were dropped from the plan` : ""}`;
  fx.note = { ok: skipped === 0, text, anchor: null, t0: now() }; // d13: the log is hidden on the packing screen — say it as a toast
  note(`· ${text}`);
}
// seyh.4: flash what a pack/unpack did to the packing trade-off ("+80⚡ ≈ +8 tiles · −5 loot").
function tradeFlash(before: Loadout): void {
  const d = tradeoffDelta(tradeoff(before), tradeoff(state.loadout));
  fx.delta = d ? { text: tradeoffDeltaText(d), t0: now() } : null;
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
  const planned = currentDerived(state, wps)?.rt.walkable ?? [];
  const from = state.expedition!.pos;
  const r = walkWaypoints(state, wps);
  // seyh.10: the walk follows the derived line, so its first `steps` tiles are where you went
  trail = [...trail, ...planned.slice(0, r.steps).map((t, i) => { const p = i ? planned[i - 1]! : from; return { x: t.x, y: t.y, dx: Math.sign(t.x - p.x), dy: Math.sign(t.y - p.y) }; })];
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
  const cameHome = lastPhase !== null && lastPhase !== "town" && state.phase === "town";
  if (lastPhase === "town" && state.phase !== "town") resetScene();
  lastPhase = state.phase;
  if (state.phase !== "town") autoRepacked = false;
  if (state.phase === "town" && !autoRepacked && prepValid(state, prep) && (townMode !== "scene" || packOpen)) autoRepack();
  if (state.phase === "town") trail = []; // seyh.10: a new run starts with clean ground
  if (state.phase !== "town") { prep = null; packOpen = false; } // leaving town drops the prep selection (zpm.3)
  if (packOpen && !prepValid(state, prep)) packOpen = false;
  const engaged = !!state.expedition?.combat;
  if (engaged && !wasEngaged) { drawerOpen = false; drawerTab = "here"; } // eor: a fight just started — its sheet sits over the map, so get the drawer out of the way
  wasEngaged = engaged;
  document.body.classList.toggle("in-expedition", state.phase !== "town");
  const inScene = state.phase === "town" && townMode === "scene" && !packOpen;
  document.body.classList.toggle("in-town-scene", inScene);
  // keep the open panel's scroll across re-renders (a craft/pack re-renders everything)
  const panelEl = app.querySelector<HTMLElement>(".ts-panel");
  const keepScroll = panelEl && panelEl.dataset.tsPanel === scene.panel ? panelEl.querySelector<HTMLElement>(".ts-panel-body")?.scrollTop ?? 0 : 0;
  const repack = state.phase === "town" && prep !== null && !inScene ? repackOffer(state, loadLastPlan(SAVE_KEY)) : false;
  if (cameHome && !inScene) homeShown = true; // seyh.1: the plain menus town has no square to fly over
  app.innerHTML = state.phase !== "town"
    ? expeditionView(state, route, { drawerOpen, tab: drawerTab, logHtml: logView(log), confirmHome, stuckDismissed, costTint, trail })
    : inScene
      ? townSceneView(state, { prep, logHtml: logView(log), lastLine: log[0] ? formatLogEntry(log[0]).replace(/<br>/g, " ") : "", research: { history: researchLog, last: researchLast }, homeStrip: homecoming && homeShown ? homeStripHtml(homecoming) : undefined })
      : `${homecoming && homeShown && !packOpen && !prep ? homeStripHtml(homecoming, "flow") : ""}${townView(state, prep, repack, townTab, { wornOpen, embarkConfirm: confirmEmbark, research: { history: researchLog, last: researchLast } })}${logView(log)}`;
  wire(); save(SAVE_KEY, state, log);
  mountRegion(app, draw); // seyh.28: the region chart's own picks (lands, scraps, panel rows)
  mountTree(app, state, { craft: craftN, close: closeTree }); // o9vr: the workshop's tree (pan, select, tray) — before paintFx, which anchors the craft note in its tray
  if (inScene) {
    mountScene(app, arriveAt, state);
    const body = app.querySelector<HTMLElement>(".ts-panel-body");
    if (body && keepScroll) body.scrollTop = keepScroll;
    if (cameHome) void homeWalk(); // seyh.1: the haul onto the cloth, into the bank, then the strip
  }
  // c67 camera-follow, now a real camera (kml): re-centre on the player when their
  // POSITION changes; otherwise keep wherever the player panned to.
  if (state.phase !== "town" && state.expedition) {
    const p = `${state.expedition.pos.x},${state.expedition.pos.y}`;
    if (p !== camPos) { centerOnPlayer(); camPos = p; } else applyCam();
  } else camPos = null;
  paintFx(app, fx, now()); // after the camera: tile cues read live tile positions
}

// seyh.1 (owner Q10 = B): the hero walks in, stops at the packing cloth with the haul
// laid out on it, the stacks fly into the Bank, and only then does the strip appear.
async function homeWalk(): Promise<void> {
  const h = homecoming;
  const goods = !!h && homeGoods(h).length > 0;
  await walkIn(goods ? spotById("cloth").stand : undefined);
  if (state.phase !== "town" || homecoming !== h) return;
  if (h && goods) await playHaul(app, h);
  if (state.phase !== "town" || homecoming !== h) return;
  homeShown = true;
  draw();
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
  // centre in the part of the map an open drawer leaves showing (a side sheet in
  // landscape, a bottom sheet in portrait)
  const v = vp.getBoundingClientRect(), dEl = app.querySelector<HTMLElement>(".drawer.open");
  const d = dEl && getComputedStyle(dEl).position === "fixed" ? dEl.getBoundingClientRect() : null;
  const side = !!d && d.top <= v.top + 1, bottom = !!d && !side;
  const viewW = side ? Math.max(0, d!.left - v.left) : vp.clientWidth;
  const viewH = bottom ? Math.max(0, d!.top - v.top) : vp.clientHeight;
  cam = { x: (pl.offsetLeft + 16) * ZOOM - viewW / 2, y: (pl.offsetTop + 16) * ZOOM - viewH / 2 };
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
  const handle = app.querySelector<HTMLElement>("[data-drawer-toggle]"); if (handle) handle.onclick = () => { drawerOpen = !drawerOpen; draw(); setTimeout(centerOnPlayer, 200); }; // after the drawer's height transition
  app.querySelectorAll<HTMLElement>("[data-tab]").forEach((el) => el.onclick = () => { drawerTab = el.dataset.tab as DrawerTab; drawerOpen = true; draw(); });
  app.querySelectorAll<HTMLElement>("[data-open-tab]").forEach((el) => el.onclick = () => { drawerTab = el.dataset.openTab as DrawerTab; drawerOpen = true; draw(); });
  app.querySelectorAll<HTMLElement>("[data-embark]").forEach((el) => el.onclick = () => { confirmEmbark = false; embark(el.dataset.embark!); });
  app.querySelectorAll<HTMLElement>("[data-embark-confirm]").forEach((el) => el.onclick = () => { confirmEmbark = true; draw(); }); // seyh.5: risky start → ask first
  app.querySelectorAll<HTMLElement>("[data-embark-cancel]").forEach((el) => el.onclick = () => { confirmEmbark = false; draw(); });
  app.querySelectorAll<HTMLElement>("[data-prepare]").forEach((el) => el.onclick = () => prepare(el.dataset.prepare!)); // zpm.3: enter the prep screen for this map
  app.querySelectorAll<HTMLElement>("[data-back]").forEach((el) => el.onclick = () => { if (townMode === "scene") packOpen = false; else prep = null; wornOpen = null; confirmEmbark = false; draw(); }); // zpm.3: back to the map overview / the square
  // 0m4: the square — tab strip, panel close, the Pack shortcut, the menus/scene switch
  app.querySelectorAll<HTMLElement>("[data-panel]").forEach((el) => el.onclick = () => { scene.panel = scene.panel === el.dataset.panel ? null : el.dataset.panel as typeof scene.panel; draw(); });
  app.querySelectorAll<HTMLElement>("[data-panel-close]").forEach((el) => el.onclick = () => { scene.panel = null; scene.labelOn = null; draw(); });
  app.querySelectorAll<HTMLElement>("[data-open-pack]").forEach((el) => el.onclick = () => { scene.panel = null; packOpen = true; draw(); });
  app.querySelectorAll<HTMLElement>("[data-town-mode]").forEach((el) => el.onclick = () => {
    townMode = el.dataset.townMode === "menus" ? "menus" : "scene";
    try { localStorage.setItem("ia-town", townMode); } catch { /* private mode: not remembered */ }
    packOpen = townMode === "scene" ? false : packOpen; if (townMode === "menus") prep = null;
    draw();
  });
  // 675: the research table — search (Enter submits the form), spend an ink, find a revealed recipe
  app.querySelectorAll<HTMLFormElement>("[data-research-form]").forEach((f) => f.onsubmit = (ev) => { ev.preventDefault(); research(f.querySelector<HTMLInputElement>("[data-research-q]")?.value ?? ""); });
  app.querySelectorAll<HTMLElement>("[data-buy-research]").forEach((el) => el.onclick = () => apply({ type: "buy-research", inkId: el.dataset.buyResearch! }));
  app.querySelectorAll<HTMLElement>("[data-find-recipe]").forEach((el) => el.onclick = () => findRecipe(el.dataset.findRecipe!));
  app.querySelectorAll<HTMLElement>("[data-craft]").forEach((el) => el.onclick = () => apply({ type: "craft", recipeId: el.dataset.craft! }));
  app.querySelectorAll<HTMLElement>("[data-pack]").forEach((el) => el.onclick = () => apply({ type: "pack", slot: el.dataset.slot as LoadoutSlot, itemId: el.dataset.pack! }));
  app.querySelectorAll<HTMLElement>("[data-unpack]").forEach((el) => el.onclick = () => unpack(el.dataset.unpack!, el.dataset.unpackSlot as LoadoutSlot | undefined));
  app.querySelectorAll<HTMLElement>("[data-worn-open]").forEach((el) => el.onclick = () => { wornOpen = wornOpen === el.dataset.wornOpen ? null : el.dataset.wornOpen!; draw(); }); // d13: worn slot swap menu
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
  app.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => el.onclick = () => { route = []; confirmHome = false; apply({ type: el.dataset.act! } as Action); });
  const tint = app.querySelector<HTMLElement>("[data-toggle-costtint]"); if (tint) tint.onclick = () => {
    costTint = !costTint;
    try { localStorage.setItem("idle-adv:costTint", costTint ? "on" : "off"); } catch { /* private mode: session-only */ }
    draw();
  };
  const home = app.querySelector<HTMLElement>("[data-home]"); if (home) home.onclick = () => { confirmHome = true; draw(); };
  const homeCancel = app.querySelector<HTMLElement>("[data-home-cancel]"); if (homeCancel) homeCancel.onclick = () => { confirmHome = false; stuckDismissed = true; draw(); };
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

// --- the town square (0m4) ---------------------------------------------------------
const spotById = (id: string): Spot => scenePlacements(state.stations ?? []).find((s) => s.id === id)!;
// Pick a map → in the square the hero walks to the packing cloth, then the Pack sheet opens.
function prepare(mapSeed: string): void {
  prep = mapSeed; route = [];
  if (homeShown) homecoming = null; // seyh.1: picking the next map moves on from the last run
  if (townMode !== "scene") { draw(); return; }
  scene.panel = null; draw();
  void goToSpot(spotById("cloth"));
}
// The hero arrived at a station: open what it's for.
function arriveAt(s: Spot): void {
  const a = s.action;
  if (a.kind === "panel") scene.panel = a.panel;
  else if (a.kind === "gate") { if (prepValid(state, prep)) { scene.panel = null; packOpen = true; } else scene.panel = "maps"; }
  else if (a.kind === "plot") scene.panel = "recipes";
  else return;
  draw();
  if (a.kind === "plot" && !(state.stations ?? []).includes(a.station)) {
    focusRecipe(app, a.station); // 675: scroll the tree to the station's card and flash it (absent while still undiscovered)
  }
}
// Embark: in the square the gate opens and the hero walks out first (a refused embark
// skips the show and just logs why).
function embark(mapSeed: string): void {
  const action: Action = { type: "embark", mapSeed };
  if (townMode !== "scene" || reduce(state, action).events.some((e) => e.type === "action-rejected")) { apply(action); return; }
  packOpen = false; scene.panel = null; scene.labelOn = null;
  scene.hero = { ...spotById("cloth").stand };
  draw();
  void walkOut().then(() => apply(action));
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
