// seyh.10 (D105/D112): route cost shows as footprints along the planned (and walked)
// route — more, smaller prints on slow ground — and the map-wide tint is opt-in.
import { describe, expect, test } from "bun:test";
import { footprintCount } from "../src/render/render";
import { footprintSvg } from "../src/web/footprints";
import { expeditionView } from "../src/web/expedition-view";
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
    expect(html).toContain("Cost colours: <b>off</b>");
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
