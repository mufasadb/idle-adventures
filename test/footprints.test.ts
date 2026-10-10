// seyh.10 (D105/D112): route cost shows as footprints along the planned (and walked)
// route — more, smaller prints on slow ground — and the map-wide tint is opt-in.
import { describe, expect, test } from "bun:test";
import { footprintCount } from "../src/render/render";
import { footprintSvg } from "../src/web/footprints";
import { expeditionView, currentDerived } from "../src/web/expedition-view";
import { camTransform } from "../src/web/camera";
import { readFileSync } from "node:fs";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { moveCost } from "../src/engine/move";
import { emptyLoadout } from "../src/engine/loadout";
import { FOOTPRINT_ENERGY_PER_PRINT, FOOTPRINT_MAX_PRINTS, TERRAIN_COST } from "../src/data/constants";
import type { Expedition, GameState } from "../src/engine/types";

describe("footprintCount", () => {
  test("prints = step cost / FOOTPRINT_ENERGY_PER_PRINT, rounded up, ≥1, capped; impassable = null", () => {
    expect(FOOTPRINT_ENERGY_PER_PRINT).toBe(5);
    expect(footprintCount(TERRAIN_COST.plains)).toBe(2); // 10 / 5
    expect(footprintCount(TERRAIN_COST.mud)).toBe(3); // 15 / 5
    expect(footprintCount(TERRAIN_COST.ice)).toBe(4); // 20 / 5
    expect(footprintCount(TERRAIN_COST.river)).toBe(6); // 30 / 5
    expect(footprintCount(moveCost("ice", null, ["ice-cleats"]))).toBe(1); // 20 − 15 = 5 → the tundra highway
    expect(footprintCount(moveCost("mountain", null, ["climbing-pick"]))).toBe(FOOTPRINT_MAX_PRINTS); // 40 → capped
    expect(footprintCount(moveCost("plains", "horse", []))).toBe(1); // 10 ÷ 2 = 5
    expect(footprintCount(Infinity)).toBeNull();
  });
  test("slower ground never gets fewer prints", () => {
    for (let c = 1; c < 60; c++) expect(footprintCount(c + 1)!).toBeGreaterThanOrEqual(footprintCount(c)!);
  });
});

describe("footprintSvg", () => {
  const sizes = (svg: string) => [...svg.matchAll(/rx="([\d.]+)"/g)].map((m) => Number(m[1]));
  test("n prints (sole + heel each), rotated to the direction of travel; fainter when walked", () => {
    const svg = footprintSvg({ n: 3, dx: 1, dy: 0 });
    expect(svg).toContain('data-prints="3"');
    expect(svg.match(/<ellipse/g)!.length).toBe(6);
    expect(svg).toContain("rotate(0 50 50)");
    expect(footprintSvg({ n: 2, dx: 0, dy: -1 })).toContain("rotate(-90 50 50)");
    expect(footprintSvg({ n: 2, dx: 1, dy: 1 })).toContain("rotate(45 50 50)");
    expect(footprintSvg({ n: 2, dx: 1, dy: 0 }, true)).toContain('class="fp walked"');
    expect(footprintSvg({ n: 0, dx: 1, dy: 0 })).toBe("");
  });
  test("more prints are smaller (slow ground reads as short steps)", () => {
    expect(Math.max(...sizes(footprintSvg({ n: 6, dx: 1, dy: 0 })))).toBeLessThan(Math.max(...sizes(footprintSvg({ n: 2, dx: 1, dy: 0 }))));
  });
});

// Same fixture as route-preview.test.ts: map "rp-0", x=3 is a straight plains run north
// from y=34 at 10 energy a step, no POIs on the line.
const SEED = "rp-0";
const START = { x: 3, y: 34 };
const ui = { drawerOpen: false, tab: "here" as const, logHtml: "" };
function stateAt(): GameState {
  const exp: Expedition = { mapSeed: SEED, pos: { ...START }, energy: 300, maxEnergy: 300, hp: 30, loadout: emptyLoadout(), carry: [], cleared: [], autoGather: false };
  return { seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp };
}

describe("expedition view (seyh.10)", () => {
  test("no cost tint by default; the Settings switch still turns it on", () => {
    const html = expeditionView(stateAt(), [], ui);
    expect(html).not.toMatch(/\bcost[1-4]\b/);
    expect(html).toContain("Cost shading: <b>off</b>");
    expect(expeditionView(stateAt(), [], { ...ui, costTint: true })).toMatch(/\bcost[1-4]\b/);
  });
  test("each walkable route tile carries prints matching its engine step cost; none off the route or on you", () => {
    const html = expeditionView(stateAt(), [{ x: START.x, y: START.y - 3 }], ui);
    const g = generateGrid(SEED, rollBiome(SEED));
    for (let d = 1; d <= 3; d++) {
      const y = START.y - d;
      const n = footprintCount(moveCost(g.terrain[y]![START.x]!, null, []))!;
      expect(html).toMatch(new RegExp(`data-x="${START.x}" data-y="${y}"[^>]*><svg class="fp" viewBox="0 0 100 100" data-prints="${n}"`));
    }
    expect(html.match(/<svg class="fp/g)!.length).toBe(3);
    expect(html).not.toMatch(new RegExp(`data-x="${START.x}" data-y="${START.y}"[^>]*><svg`));
  });
  test("the walked trail shows faint prints; the plan wins where they overlap", () => {
    const trail = [{ x: START.x, y: START.y - 1, dx: 0, dy: -1 }, { x: START.x, y: START.y - 2, dx: 0, dy: -1 }];
    const html = expeditionView(stateAt(), [], { ...ui, trail });
    expect(html.match(/class="fp walked"/g)!.length).toBe(2);
    const both = expeditionView(stateAt(), [{ x: START.x, y: START.y - 1 }], { ...ui, trail });
    expect(both.match(/class="fp walked"/g)!.length).toBe(1);
    expect(both.match(/<svg class="fp"/g)!.length).toBe(1);
  });
});

// --- seyh.10 review fix-up: diagonals, the run-out point, grey blocks, shading, camera ---

describe("diagonal steps (owner: 'the steps on a diagonal look bigger')", () => {
  const rx = (svg: string) => [...svg.matchAll(/rx="([\d.]+)"/g)].map((m) => Number(m[1]));
  const cxs = (svg: string) => [...svg.matchAll(/<ellipse cx="([\d.-]+)"/g)].filter((_, i) => i % 2 === 0).map((m) => Number(m[1]));
  const walkable = (Object.keys(TERRAIN_COST) as (keyof typeof TERRAIN_COST)[]).filter((t) => Number.isFinite(moveCost(t, null, [])));
  test("count follows the engine's diagonal cost (√2×, floored), so a diagonal gets more prints, never fewer", () => {
    expect(footprintCount(moveCost("plains", null, [], true), true)).toBe(3); // floor(10·√2)=14 → ⌈14/5⌉
    expect(footprintCount(moveCost("river", null, [], true), true)).toBe(9); // floor(30·√2)=42 → 9 (diagonal cap ⌈6·√2⌉ = 9)
    for (const t of walkable) {
      const straight = footprintCount(moveCost(t, null, []))!;
      const diag = footprintCount(moveCost(t, null, [], true), true)!;
      expect(diag).toBeGreaterThanOrEqual(straight);
    }
  });
  test("same ground → same print size and (near) same spacing, straight or diagonal", () => {
    for (const t of walkable) {
      const unit = footprintCount(moveCost(t, null, []))!;
      const n = footprintCount(moveCost(t, null, [], true), true)!;
      const straight = footprintSvg({ n: unit, unit, dx: 1, dy: 0 });
      const diag = footprintSvg({ n, unit, dx: 1, dy: -1 });
      expect(new Set(rx(diag))).toEqual(new Set(rx(straight))); // identical sole + heel sizes
      if (unit > 1) {
        const gap = (s: string) => { const c = cxs(s); return c[1]! - c[0]!; };
        const ratio = gap(diag) / gap(straight);
        expect(ratio).toBeGreaterThan(0.8); // ⌈⌉ rounding can tighten a diagonal's spacing a little,
        expect(ratio).toBeLessThan(1.2); // never stretch it into bigger strides
      }
    }
  });
  test("the view counts a diagonal route step with the engine's diagonal cost", () => {
    // rp-0: (3,34) → (0,31) is three plains diagonals
    const html = expeditionView(stateAt(), [{ x: 0, y: 31 }], ui);
    expect(html.match(/<svg class="fp" viewBox="0 0 100 100" data-prints="3"/g)!.length).toBe(3);
  });
});

describe("where the energy runs out (owner: 'not clear where your energy will run out')", () => {
  // 35 energy, straight north on plains @10: steps 0..2 are paid (35→5), step 3 can't be
  const lowState = (): GameState => { const s = stateAt(); s.expedition!.energy = 35; return s; };
  const route = [{ x: START.x, y: START.y - 6 }];
  test("the route model marks the first unpayable step from its own energy simulation", () => {
    const { rt } = currentDerived(lowState(), route)!;
    expect(rt.runsDry).toBe(true);
    expect(rt.dryAt).toBe(3);
    expect(rt.stepCosts).toEqual([10, 10, 10, 10, 10, 10]);
    expect(currentDerived(stateAt(), route)!.rt.dryAt).toBeNull();
  });
  test("prints past it are hollow; the last affordable step carries the stop mark; no numbers", () => {
    const html = expeditionView(lowState(), route, ui);
    expect(html.match(/<svg class="fp"/g)!.length).toBe(3);
    expect(html.match(/<svg class="fp dry"/g)!.length).toBe(3);
    expect(html.match(/class="stop"/g)!.length).toBe(1);
    expect(html).toMatch(new RegExp(`data-x="${START.x}" data-y="${START.y - 3}"[^>]*><svg class="fp"[^>]*>.*?class="stop"`));
    expect(html).not.toMatch(/data-step=/);
    expect(expeditionView(stateAt(), route, ui)).not.toMatch(/fp dry|class="stop"/);
  });
});

const css = readFileSync(new URL("../src/web/index.html", import.meta.url), "utf8");
// lastIndexOf: a grouped selector list ("… .tile.cost4::before {") can end with the same text
const rule = (sel: string) => { const i = css.lastIndexOf(`${sel} {`); expect(i).toBeGreaterThan(-1); return css.slice(i, css.indexOf("}", i)); };
/** every colour in a CSS block is a neutral grey/black/white (no hue): |r−g|, |g−b| ≤ 16 */
function neutral(block: string): boolean {
  const cols: number[][] = [];
  for (const m of block.matchAll(/#([0-9a-f]{6})/gi)) cols.push([0, 2, 4].map((o) => parseInt(m[1]!.slice(o, o + 2), 16)));
  for (const m of block.matchAll(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g)) cols.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  expect(cols.length).toBeGreaterThan(0);
  return cols.every(([r, g, b]) => Math.abs(r! - g!) <= 16 && Math.abs(g! - b!) <= 16);
}

describe("grey blocks, luminance shading (seyh.10 review)", () => {
  test("a blocked leg's tile is .path-blocked over a .blocked hatch, both grey", () => {
    const s = stateAt();
    s.expedition!.pos = { x: 8, y: 29 }; // rp-0: (9,29) is mountain, impassable on foot
    const html = expeditionView(s, [{ x: 10, y: 29 }], ui);
    expect(html).toMatch(/class="tile terrain-mountain[^"]*\bblocked\b[^"]*\bpath-blocked\b[^"]*"[^>]*data-x="9" data-y="29"/);
    expect(neutral(rule(".tile.blocked::before"))).toBe(true);
    expect(neutral(rule(".tile.path-blocked"))).toBe(true);
    expect(neutral(rule(".tile.path-blocked::after"))).toBe(true);
  });
  test("the opt-in cost shading is a darkening veil: no hue, darker with each band", () => {
    const alphas = [1, 2, 3, 4].map((b) => {
      const r = rule(`.tile.cost${b}::before`);
      expect(neutral(r)).toBe(true);
      return Number(r.match(/rgba\(0, 0, 0, ([\d.]+)\)/)![1]);
    });
    for (let i = 1; i < 4; i++) expect(alphas[i]!).toBeGreaterThan(alphas[i - 1]!);
  });
});

describe("camera (seyh.10 hairlines)", () => {
  test("the translate is whole pixels; the zoom is untouched", () => {
    expect(camTransform({ x: 10.4, y: -3.6 }, 1.35)).toBe("translate(-10px, 4px) scale(1.35)");
    expect(camTransform({ x: 0.2, y: 99.5 }, 1)).toBe("translate(0px, -100px) scale(1)");
  });
});
