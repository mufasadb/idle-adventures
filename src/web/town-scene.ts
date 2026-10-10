// 0m4: the town as a PLACE — a village square seen 3/4 top-down (mockup la-ir9roc/A).
// The ground is wider than the screen; stations sit on it by data (town-layout.ts);
// the hero walks between them and the camera pans to follow (drag/swipe/wheel pans
// too). Tapping a station walks the hero there, then opens its panel — the same
// section builders the menu town uses (town-view.ts), so nothing is rewritten.
//
// This module owns the scene's view-only state (hero position/facing, gate, camera,
// open panel). It never decides legality: panels are built off legalActions/whyNot
// exactly as before, and every action still funnels through main.ts's reduce.
import type { GameState } from "../engine/types";
import { localMap } from "../engine/town";
import { bagCells, name } from "../render/render";
import { EQUIP_SLOTS } from "../engine/pack";
import type { StationId } from "../data/constants";
import { TOWN_ART, TOWN_GROUND, HERO_FRAMES } from "./assets";
import { scenePlacements, spotAt, spotBox, walkPlan, cameraX, clampCam, HERO_HOME, HERO_H, GATE_OUTSIDE, GROUND } from "./town-layout";
import type { Pt, Spot, TownPanel } from "./town-layout";
import type { ResearchLogEntry } from "./craft-tree";
import { regionView } from "./region-view";
import { mapSelectSection, bankSection, recipeSection, stableSection, researchSection, ic, prepValid } from "./town-view";

export type { TownPanel } from "./town-layout";

type Facing = "left" | "right";
export const scene = {
  hero: { ...HERO_HOME } as Pt,
  facing: "left" as Facing,
  frame: 0, // 0 = standing, 1..4 = walk frames
  gateOpen: false,
  heroGone: false, // walked out of the gate (embark in progress)
  cam: null as number | null, // camera left edge in px; null = centre on the hero
  panel: null as TownPanel | null,
  labelOn: null as string | null, // the station whose label shows (tapped / arrived at)
  busy: false, // an embark/arrival animation owns the scene
  walkToken: 0,
};

const reducedMotion = (): boolean => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

const PANEL_TITLE: Record<TownPanel, string> = { maps: "Map board", bank: "Bank", recipes: "Workshop", research: "Research table", stable: "Stable", log: "Log" };

// What's laid out on the cloth: everything in the plan — bag contents + worn gear.
export function clothItems(state: GameState): string[] {
  const lo = state.loadout;
  const worn = EQUIP_SLOTS.map((s) => lo.equipment[s as keyof typeof lo.equipment]).filter((v): v is string => typeof v === "string");
  return [...worn, ...bagCells(lo).map((c) => c.defId)];
}

const pct = (v: number) => `${(v * 100).toFixed(3)}%`;

function spotHtml(s: Spot, art = s.art): string {
  const b = spotBox(s, art);
  const on = scene.labelOn === s.id ? " label-on" : "";
  const tappable = s.action.kind !== "none";
  const tag = tappable ? "button" : "div";
  return `<${tag} class="ts-spot${on}" data-spot="${s.id}"${tappable ? ` aria-label="${s.label}"` : ""} style="left:${pct(b.x0)};top:${pct(b.y0)};width:${pct(b.x1 - b.x0)};height:${pct(s.h)};z-index:${Math.round(s.y * 1000)}">`
    + `<img src="${TOWN_ART[art]}" alt="" draggable="false"></${tag}>`;
}
// Labels live in their own top layer (under each sprite's feet), so a sprite in front
// can't hide the name of the one you're pointing at.
function labelHtml(s: Spot): string {
  if (!s.label) return "";
  const on = scene.labelOn === s.id ? " on" : "";
  return `<span class="ts-label${on}" data-tag="${s.id}" style="left:${pct(s.x)};top:${pct(s.y)}">${s.label}</span>`;
}
/** Mark one station (sprite + its label) with `cls`, clearing it from the rest. */
function mark(cls: string, id: string | null): void {
  app?.querySelectorAll(`.ts-spot.${cls}, .ts-label.${cls}`).forEach((el) => {
    if ((el as HTMLElement).dataset.spot !== id && (el as HTMLElement).dataset.tag !== id) el.classList.remove(cls);
  });
  if (id) app?.querySelectorAll(`[data-spot="${id}"], [data-tag="${id}"]`).forEach((el) => el.classList.add(cls));
}

function heroHtml(): string {
  const src = HERO_FRAMES[scene.facing][scene.frame]!;
  return `<div class="ts-hero${scene.heroGone ? " gone" : ""}" style="${heroStyle(scene.hero)}"><img src="${src}" alt="you" draggable="false"></div>`;
}
function heroStyle(p: Pt): string {
  const w = HERO_H * (128 / 179) * GROUND.h / GROUND.w;
  return `left:${pct(p.x - w / 2)};top:${pct(p.y - HERO_H)};width:${pct(w)};height:${pct(HERO_H)};z-index:${Math.round(p.y * 1000) + 1}`;
}

export type SceneOpts = { prep: string | null; logHtml: string; lastLine: string; research?: { history: ResearchLogEntry[]; last: ResearchLogEntry | null } };

export function townSceneView(state: GameState, o: SceneOpts): string {
  const spots = scenePlacements((state.stations ?? []) as StationId[]);
  const chosen = prepValid(state, o.prep) ? o.prep : null;
  const world = spots.map((s) => spotHtml(s, s.id === "gate" ? (scene.gateOpen ? "gate-open" : "gate-closed") : s.art)).join("");
  // the packing cloth shows what's planned, as small item icons laid on it
  const items = clothItems(state);
  const cloth = spots.find((s) => s.id === "cloth")!;
  const cb = spotBox(cloth);
  const clothHtml = items.length
    ? `<div class="ts-cloth-items" style="left:${pct(cb.x0 + (cb.x1 - cb.x0) * 0.14)};top:${pct(cb.y0 + cloth.h * 0.12)};width:${pct((cb.x1 - cb.x0) * 0.72)};height:${pct(cloth.h * 0.8)};z-index:${Math.round(cloth.y * 1000)}">${items.slice(0, 12).map((d) => `<span title="${name(d)}">${ic(d, 32)}</span>`).join("")}</div>` : "";
  const tab = (p: TownPanel, label: string) => `<button class="ts-tab${scene.panel === p ? " on" : ""}" data-panel="${p}">${label}</button>`;
  const local = localMap(state.seed, state.runs ?? 0);
  const chosenLabel = chosen ? (chosen === local.mapSeed ? "the local map" : "an earned map") : null;
  const bar = `<div class="ts-bar">
      <h1>Town</h1>
      <nav class="ts-tabs">${tab("maps", "Maps")}${tab("bank", "Bank")}${tab("recipes", "Recipes")}${tab("research", "Research")}${tab("stable", "Stable")}${tab("log", "Log")}${chosen ? `<button class="ts-tab go" data-open-pack title="pack for ${chosenLabel} and embark">Pack ▶</button>` : ""}</nav>
      <span class="ts-aux"><button class="link" data-town-mode="menus" title="the plain menus, without the square">≡ menus</button><button class="link" data-newgame>new game</button></span>
    </div>`;
  // o9vr: the workshop (recipes) is its own full-screen crafting tree, not a side panel
  // seyh.28 (D106): choosing where to go is the region chart, full screen (the board, the gate with nothing chosen, the Maps tab)
  const panel = scene.panel === "recipes" ? recipeSection(state) : scene.panel === "maps" ? regionView(state, o.prep) : scene.panel ? `<aside class="ts-panel${scene.hero.x > 0.5 ? " left" : ""}" data-ts-panel="${scene.panel}">
      <div class="ts-panel-head"><b>${PANEL_TITLE[scene.panel]}</b><button class="ts-close" data-panel-close aria-label="close">✕</button></div>
      <div class="ts-panel-body">${panelBody(state, scene.panel, o)}</div>
    </aside>` : "";
  const hint = chosen ? `<div class="ts-hint">${chosenLabel} chosen — the packing cloth is by the gate ▶</div>` : "";
  return `<div class="town-scene${scene.panel ? ` has-panel${scene.hero.x > 0.5 ? " panel-left" : ""}` : ""}">
    <div class="ts-vp" data-ts-vp>
      <div class="ts-world" data-ts-world>
        <img class="ts-ground" src="${TOWN_GROUND}" alt="" draggable="false">
        ${world}${clothHtml}${heroHtml()}${spots.map(labelHtml).join("")}
      </div>
    </div>
    ${bar}
    ${hint}
    ${o.lastLine ? `<div class="ts-last" data-panel="log" title="open the log">${o.lastLine}</div>` : ""}
  </div>
  ${panel}
  ${scene.panel ? "" : `<div class="ts-below"><p class="muted small">Tap a building and you walk over to it · drag to look around the square.</p>${o.logHtml}</div>`}`;
}

function panelBody(state: GameState, p: TownPanel, o: SceneOpts): string {
  switch (p) {
    case "maps": return mapSelectSection(state, localMap(state.seed, state.runs ?? 0), state.maps ?? []);
    case "bank": return bankSection(state);
    case "recipes": return recipeSection(state);
    case "stable": return stableSection(state);
    case "research": return researchSection(state, o.research?.history ?? [], o.research?.last ?? null);
    case "log": return o.logHtml;
  }
}

// ===== the live scene (DOM) ====================================================

let app: HTMLElement | null = null;
let onArrive: (s: Spot) => void = () => {};
const worldEl = () => app?.querySelector<HTMLElement>("[data-ts-world]") ?? null;
const vpEl = () => app?.querySelector<HTMLElement>("[data-ts-vp]") ?? null;
let worldW = 0, worldH = 0;

/** Size the world to the viewport (the ground covers it: full height, or full width
 *  on a very wide screen) and place the camera. Called after every render + resize. */
export function layoutScene(): void {
  const vp = vpEl(), w = worldEl();
  if (!vp || !w) return;
  const k = Math.max(vp.clientHeight / GROUND.h, vp.clientWidth / GROUND.w);
  worldW = GROUND.w * k; worldH = GROUND.h * k;
  w.style.width = `${worldW}px`;
  w.style.height = `${worldH}px`;
  w.style.setProperty("--ts-k", (worldH / 600).toFixed(3));
  applyCam();
}

function applyCam(): void {
  const vp = vpEl(), w = worldEl();
  if (!vp || !w) return;
  // with a side panel open, centre the hero in the part of the square still showing
  const panel = app?.querySelector<HTMLElement>(".ts-panel");
  const cover = panel && getComputedStyle(panel).position === "fixed" ? panel.offsetWidth : 0;
  const shift = panel?.classList.contains("left") ? cover : 0; // the open part starts after a left-docked panel
  const x = clampCam(scene.cam ?? cameraX(scene.hero.x, worldW, vp.clientWidth - cover) - shift, worldW, vp.clientWidth);
  scene.cam = scene.cam === null ? null : x;
  const y = Math.max(0, (worldH - vp.clientHeight) * 0.4); // a too-tall ground crops mostly from the top (sky)
  w.style.transform = `translate(${-x}px, ${-y}px)`;
}

function paintHero(bob = 0): void {
  const h = app?.querySelector<HTMLElement>(".ts-hero");
  if (!h) return;
  h.setAttribute("style", heroStyle(scene.hero) + (bob ? `;transform:translateY(${bob}px)` : ""));
  h.classList.toggle("gone", scene.heroGone);
  const img = h.querySelector("img");
  const src = HERO_FRAMES[scene.facing][scene.frame]!;
  if (img && img.getAttribute("src") !== src) img.setAttribute("src", src);
}

function setGate(open: boolean): void {
  scene.gateOpen = open;
  const g = app?.querySelector<HTMLElement>('[data-spot="gate"]');
  const gate = scenePlacements([]).find((s) => s.id === "gate")!;
  if (!g) return;
  const b = spotBox(gate, open ? "gate-open" : "gate-closed");
  g.style.left = pct(b.x0); g.style.width = pct(b.x1 - b.x0);
  g.querySelector("img")?.setAttribute("src", TOWN_ART[open ? "gate-open" : "gate-closed"]);
}

/** Walk the hero to `to` (ground fraction); resolves on arrival. A newer walk cancels
 *  this one. With no `ms`, a long way is a few steps then a fade to the spot (walkPlan);
 *  an explicit `ms` always walks the whole way (the gate). */
export async function walkTo(to: Pt, ms?: number): Promise<boolean> {
  const token = ++scene.walkToken;
  scene.cam = null; // follow the hero again
  if (to.x !== scene.hero.x) scene.facing = to.x < scene.hero.x ? "left" : "right";
  const plan = ms === undefined ? walkPlan(scene.hero, to) : { walk: to, ms, blink: false };
  if (reducedMotion() || plan.ms === 0) {
    scene.hero = { ...to }; scene.frame = 0;
    paintHero(); applyCam();
    return true;
  }
  if (!plan.blink) return stride(plan.walk, plan.ms, token);
  const h = () => app?.querySelector<HTMLElement>(".ts-hero");
  setTimeout(() => { if (token === scene.walkToken) h()?.classList.add("blink"); }, plan.ms - FADE_MS);
  const ok = await stride(plan.walk, plan.ms, token);
  if (!ok) { h()?.classList.remove("blink"); return false; }
  scene.hero = { ...to }; scene.frame = 0;
  paintHero(); applyCam();
  h()?.classList.remove("blink"); // fades back in where it was sent
  await new Promise((r) => setTimeout(r, FADE_MS));
  return token === scene.walkToken;
}

const FADE_MS = 250; // matches .ts-hero's opacity transition

/** Walk in a straight line at a steady pace (the walk-cycle frames + a little bob). */
function stride(to: Pt, ms: number, token: number): Promise<boolean> {
  const from = { ...scene.hero }, t0 = performance.now();
  return new Promise((done) => {
    const step = (now: number) => {
      if (token !== scene.walkToken) return done(false);
      const t = Math.min(1, (now - t0) / ms);
      scene.hero = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      const n = Math.floor((now - t0) / 140);
      scene.frame = t < 1 ? 1 + (n % 4) : 0;
      paintHero(t < 1 && n % 2 ? -1.5 : 0); // the two-pose cycle gets a little bob
      applyCam();
      if (t < 1) requestAnimationFrame(step); else done(true);
    };
    requestAnimationFrame(step);
  });
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, reducedMotion() ? 0 : ms));

/** Tap a station: show its label, walk over, then hand off to main.ts (open its panel…). */
export async function goToSpot(s: Spot): Promise<void> {
  if (scene.busy) return;
  scene.labelOn = s.id;
  mark("label-on", s.id);
  if (await walkTo(s.stand)) onArrive(s);
}

/** Embark: the gate swings open and the hero walks out through it. */
export async function walkOut(): Promise<void> {
  scene.busy = true;
  scene.panel = null;
  const gate = scenePlacements([]).find((s) => s.id === "gate")!;
  setGate(true);
  await wait(250);
  await walkTo(gate.stand);
  await walkTo(GATE_OUTSIDE, 500);
  scene.heroGone = true; paintHero();
  await wait(250);
  scene.busy = false;
}

/** Home from a run: the hero comes in through the open gate, which shuts behind him. */
export async function walkIn(): Promise<void> {
  scene.busy = true;
  scene.heroGone = false;
  scene.hero = { ...GATE_OUTSIDE };
  setGate(true); paintHero(); applyCam();
  await wait(200);
  const gate = scenePlacements([]).find((s) => s.id === "gate")!;
  await walkTo(gate.stand, 500);
  setGate(false);
  await walkTo(HERO_HOME);
  scene.busy = false;
}

/** Reset the scene when leaving town (the next visit starts by the gate). */
export function resetScene(): void {
  scene.walkToken++;
  scene.heroGone = false; scene.gateOpen = false; scene.panel = null; scene.labelOn = null; scene.cam = null; scene.busy = false;
  scene.hero = { ...HERO_HOME }; scene.frame = 0;
}

// Pointer handling: drag/swipe pans the camera; a tap hit-tests the ground (front-most
// station by depth, transparent corners ignored) and walks there. Stations are also
// real <button>s for keyboard users (their own click handler, wired in main.ts).
const drag = { id: -1, x: 0, y: 0, moved: 0, cam0: 0 };
export function mountScene(root: HTMLElement, arrive: (s: Spot) => void, state: GameState): void {
  app = root; onArrive = arrive;
  layoutScene();
  const vp = vpEl();
  if (!vp) return;
  const spots = scenePlacements((state.stations ?? []) as StationId[]);
  const toGround = (cx: number, cy: number): Pt | null => {
    const r = worldEl()?.getBoundingClientRect();
    return r && r.width ? { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height } : null;
  };
  vp.onpointerdown = (ev) => {
    drag.id = ev.pointerId; drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0;
    drag.cam0 = scene.cam ?? cameraX(scene.hero.x, worldW, vp.clientWidth);
  };
  vp.onpointermove = (ev) => {
    if (ev.pointerId === drag.id) {
      const dx = ev.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(ev.clientY - drag.y));
      if (drag.moved > 8) { scene.cam = clampCam(drag.cam0 - dx, worldW, vp.clientWidth); applyCam(); vp.classList.add("dragging"); }
      return;
    }
    if (ev.pointerType !== "mouse") return;
    const p = toGround(ev.clientX, ev.clientY), s = p ? spotAt(spots, p) : null;
    mark("hover", s?.id ?? null);
    vp.style.cursor = s ? "pointer" : "";
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== drag.id) return;
    drag.id = -1;
    vp.classList.remove("dragging");
    if (drag.moved > 8 || ev.type === "pointercancel" || scene.busy) return;
    const p = toGround(ev.clientX, ev.clientY);
    if (!p) return;
    const s = spotAt(spots, p);
    if (s) void goToSpot(s);
    else void walkTo({ x: Math.max(0.04, Math.min(0.96, p.x)), y: Math.max(0.45, Math.min(0.92, p.y)) }); // stroll on open ground
  };
  vp.onpointerup = end;
  vp.onpointercancel = end;
  vp.onwheel = (ev) => {
    const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
    if (!d) return;
    ev.preventDefault();
    scene.cam = clampCam((scene.cam ?? cameraX(scene.hero.x, worldW, vp.clientWidth)) + d, worldW, vp.clientWidth);
    applyCam();
  };
  // keyboard: a focused station button activates on Enter/Space
  vp.querySelectorAll<HTMLElement>("button.ts-spot").forEach((el) => {
    el.onfocus = () => mark("hover", el.dataset.spot ?? null);
    el.onblur = () => mark("hover", null);
  });
  vp.querySelectorAll<HTMLElement>("button.ts-spot").forEach((el) => el.onclick = (ev) => {
    if ((ev as MouseEvent).detail !== 0) return; // pointer taps are handled by the hit-test above
    const s = spots.find((x) => x.id === el.dataset.spot);
    if (s) void goToSpot(s);
  });
}

if (typeof addEventListener === "function") addEventListener("resize", () => layoutScene());
