// 0m4: the walkable town — the scene's layout table and its pure helpers (no DOM, no
// asset imports, so it unit-tests in isolation). Everything is in GROUND-RELATIVE
// coordinates: x ∈ [0,1] across the ground's width, y ∈ [0,1] down its height, and a
// sprite's `h` is its height as a fraction of the ground's height (its width follows
// from the art's aspect). A sprite is anchored at its feet (bottom-centre), and depth
// sorts by that y — further down the ground draws in front.
import type { StationId } from "../data/constants";

/** The ground layer's pixel size (only its aspect matters to the layout). */
export const GROUND = { w: 3072, h: 1152 } as const;

/** Every art layer the scene draws, with its prepared size (for aspect + hit boxes). */
export const ART = {
  bank: { w: 539, h: 520 },
  board: { w: 334, h: 400 },
  workshop: { w: 445, h: 460 },
  research: { w: 304, h: 400 },
  stable: { w: 444, h: 420 },
  "gate-closed": { w: 521, h: 560 },
  "gate-open": { w: 613, h: 560 },
  cloth: { w: 348, h: 150 },
  cart: { w: 241, h: 190 },
  plot: { w: 450, h: 300 },
  smokehouse: { w: 365, h: 380 },
  alchemist: { w: 263, h: 320 },
  anvil: { w: 324, h: 210 },
  still: { w: 223, h: 320 },
} as const;
export type ArtKey = keyof typeof ART;

/** What tapping a spot does once the hero gets there. */
export type SpotAction =
  | { kind: "panel"; panel: TownPanel }
  | { kind: "gate" } // the Pack sheet for the chosen map, else the board
  | { kind: "plot"; station: StationId } // unbuilt → Recipes at its build recipe; built → Recipes
  | { kind: "none" };
export type TownPanel = "maps" | "bank" | "recipes" | "research" | "stable" | "log";

export type Pt = { x: number; y: number };
export type Spot = {
  id: string;
  label: string;
  art: ArtKey;
  x: number; y: number; h: number; // feet (bottom-centre) + height, ground-relative
  stand: Pt; // where the hero stops to use it
  action: SpotAction;
};

/** The hero's resting spot in the middle of the square, and his height on the ground. */
export const HERO_HOME: Pt = { x: 0.5, y: 0.72 };
export const HERO_H = 0.15;
/** Where the hero walks out to (and comes back in from) beyond the gate. */
export const GATE_OUTSIDE: Pt = { x: 0.93, y: 0.30 };

// The fixed stations. Positions were placed against ground.webp (the square in the
// middle, clearings left and right, the gate gap on the right edge).
export const TOWN_LAYOUT: readonly Spot[] = [
  { id: "bank", label: "Bank", art: "bank", x: 0.30, y: 0.40, h: 0.40, stand: { x: 0.31, y: 0.48 }, action: { kind: "panel", panel: "bank" } },
  { id: "workshop", label: "Workshop", art: "workshop", x: 0.44, y: 0.34, h: 0.33, stand: { x: 0.44, y: 0.44 }, action: { kind: "panel", panel: "recipes" } },
  { id: "research", label: "Research table", art: "research", x: 0.565, y: 0.33, h: 0.29, stand: { x: 0.565, y: 0.44 }, action: { kind: "panel", panel: "research" } },
  { id: "stable", label: "Stable", art: "stable", x: 0.705, y: 0.45, h: 0.31, stand: { x: 0.69, y: 0.53 }, action: { kind: "panel", panel: "stable" } },
  { id: "board", label: "Map board", art: "board", x: 0.245, y: 0.67, h: 0.28, stand: { x: 0.29, y: 0.72 }, action: { kind: "panel", panel: "maps" } },
  { id: "gate", label: "Town gate", art: "gate-closed", x: 0.915, y: 0.40, h: 0.40, stand: { x: 0.90, y: 0.49 }, action: { kind: "gate" } },
  { id: "cloth", label: "Packing cloth", art: "cloth", x: 0.86, y: 0.70, h: 0.12, stand: { x: 0.80, y: 0.68 }, action: { kind: "gate" } },
  { id: "cart", label: "", art: "cart", x: 0.965, y: 0.62, h: 0.13, stand: { x: 0.90, y: 0.62 }, action: { kind: "none" } },
];

// One building plot per home station (state.stations).
export const PLOTS: Readonly<Record<StationId, Pt>> = {
  smokehouse: { x: 0.09, y: 0.56 },
  "alchemical-desk": { x: 0.11, y: 0.82 },
  anvil: { x: 0.37, y: 0.92 },
  still: { x: 0.64, y: 0.92 },
};
const PLOT_H = 0.19;
const STATION_LABEL: Readonly<Record<StationId, string>> = {
  smokehouse: "Smokehouse", "alchemical-desk": "Alchemical desk", anvil: "Anvil", still: "Still",
};
// A built station's art and height on its plot.
const BUILT: Readonly<Record<StationId, { art: ArtKey; h: number }>> = {
  smokehouse: { art: "smokehouse", h: 0.27 },
  "alchemical-desk": { art: "alchemist", h: 0.24 },
  anvil: { art: "anvil", h: 0.15 },
  still: { art: "still", h: 0.24 },
};

/** A plot's sprite: the station once it's built, the empty staked plot until then. */
export function plotArt(station: StationId, built: boolean): { art: ArtKey; h: number } {
  return built ? BUILT[station] : { art: "plot", h: PLOT_H };
}

/** Every spot in the scene for these built stations, back-to-front (depth = feet y). */
export function scenePlacements(stations: readonly StationId[]): Spot[] {
  const built = new Set(stations);
  const plots: Spot[] = (Object.keys(PLOTS) as StationId[]).map((st) => {
    const p = PLOTS[st], a = plotArt(st, built.has(st));
    return {
      id: `plot:${st}`,
      label: built.has(st) ? STATION_LABEL[st] : `${STATION_LABEL[st]} — build plot`,
      art: a.art, x: p.x, y: p.y, h: a.h,
      stand: { x: p.x + 0.04, y: Math.min(0.95, p.y + 0.03) },
      action: { kind: "plot", station: st },
    };
  });
  return [...TOWN_LAYOUT, ...plots].sort((a, b) => a.y - b.y);
}

/** A spot's box in ground fractions (x0,y0 top-left; x1,y1 bottom-right). */
export function spotBox(s: Spot, art: ArtKey = s.art): { x0: number; y0: number; x1: number; y1: number } {
  const a = ART[art];
  const w = (s.h * a.w / a.h) * GROUND.h / GROUND.w; // height fraction → width fraction
  return { x0: s.x - w / 2, y0: s.y - s.h, x1: s.x + w / 2, y1: s.y };
}

/** The front-most tappable spot under a ground point (boxes inset a little so the
 *  transparent corners of a sprite don't steal taps from what's behind it). */
export function spotAt(spots: readonly Spot[], p: Pt, inset = 0.12): Spot | null {
  let hit: Spot | null = null;
  for (const s of spots) {
    if (s.action.kind === "none") continue;
    const b = spotBox(s), ix = (b.x1 - b.x0) * inset, iy = (b.y1 - b.y0) * inset;
    if (p.x >= b.x0 + ix && p.x <= b.x1 - ix && p.y >= b.y0 + iy && p.y <= b.y1) {
      if (!hit || s.y >= hit.y) hit = s; // later in depth = drawn in front
    }
  }
  return hit;
}

/** Walking pace in ground heights per second (the hero is HERO_H tall, so ~3 body
 *  lengths a second: a brisk stroll, not a glide). */
export const WALK_SPEED = 0.45;
/** A walk longer than this is cut short: the hero sets off for BLINK_LEAD_MS, fades
 *  out, and fades back in at the destination (user 2026-10-10: "looks normal but we
 *  don't have to watch them"). */
export const BLINK_AFTER_MS = 1000;
export const BLINK_LEAD_MS = 650;

/** Walk time in ms at WALK_SPEED; standing still takes none. */
export function walkMs(from: Pt, to: Pt): number {
  const d = Math.hypot((to.x - from.x) * GROUND.w / GROUND.h, to.y - from.y); // in ground heights
  return d < 0.005 ? 0 : Math.round((d / WALK_SPEED) * 1000);
}

/** How to get from `from` to `to`: walk there outright, or (a long way) walk toward
 *  `walk` for `ms`, then blink to `to`. */
export function walkPlan(from: Pt, to: Pt): { walk: Pt; ms: number; blink: boolean } {
  const ms = walkMs(from, to);
  if (ms <= BLINK_AFTER_MS) return { walk: to, ms, blink: false };
  const f = BLINK_LEAD_MS / ms;
  return { walk: { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f }, ms: BLINK_LEAD_MS, blink: true };
}

/** The camera's left edge (px) to centre `x` (ground fraction) in a view `viewW` wide,
 *  clamped so the ground always fills the view. */
export function cameraX(x: number, worldW: number, viewW: number): number {
  return clampCam(x * worldW - viewW / 2, worldW, viewW);
}
export function clampCam(cam: number, worldW: number, viewW: number): number {
  return worldW <= viewW ? 0 : Math.max(0, Math.min(worldW - viewW, cam));
}
