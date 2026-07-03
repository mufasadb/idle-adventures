import { test, expect } from "bun:test";
import { render, renderGridText, renderGridHtml } from "../src/render/render";
import { generateGrid } from "../src/engine/grid";
import { GRID_SIZE, POI_DENSITY } from "../src/data/constants";
import type { GameState } from "../src/engine/types";
import { emptyLoadout } from "../src/engine/loadout";

const expeditionState = (mapSeed: string): GameState => ({
  seed: "game-seed",
  phase: "expedition",
  bank: [],
  loadout: emptyLoadout(),
  expedition: {
    mapSeed,
    pos: { x: 5, y: 5 },
    energy: 0,
    hp: 0,
    loadout: {
      equipment: {
        weapon: null, helmet: null, chest: null, legs: null, boots: null,
        gloves: null, tools: [], transport: null, backpack: null,
      },
      food: [],
      potions: [],
    },
    carry: [],
    cleared: [],
  },
});

test("render: town state renders the town placeholder", () => {
  const state: GameState = { seed: "s", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  expect(render(state)).toBe("(town)");
});

test("renderGridText: 20 rows × 20 chars, byte-identical for same seed+biome", () => {
  const text = renderGridText(generateGrid("snap-1", "woodland"));
  const again = renderGridText(generateGrid("snap-1", "woodland"));
  expect(text).toBe(again);
  const rows = text.split("\n");
  expect(rows.length).toBe(GRID_SIZE);
  for (const row of rows) expect(row.length).toBe(GRID_SIZE);
});

test("renderGridText: snapshot per biome — same seed, visibly different maps", () => {
  expect(renderGridText(generateGrid("snap-1", "woodland"))).toMatchSnapshot("woodland");
  expect(renderGridText(generateGrid("snap-1", "desert"))).toMatchSnapshot("desert");
  expect(renderGridText(generateGrid("snap-1", "tundra"))).toMatchSnapshot("tundra");
  expect(renderGridText(generateGrid("snap-1", "desert"))).not.toBe(
    renderGridText(generateGrid("snap-1", "tundra")),
  );
});

test("renderGridText: draws all POIs as uppercase markers", () => {
  const grid = generateGrid("snap-1", "desert");
  const flat = renderGridText(grid).replace(/\n/g, "");
  const poiChars = flat.split("").filter((c) => "OTHAX".includes(c));
  expect(poiChars.length).toBe(POI_DENSITY);
});

test("render: expedition renders the grid with the player at pos", () => {
  const text = render(expeditionState("snap-1"));
  const rows = text.split("\n");
  expect(rows.length).toBe(GRID_SIZE);
  expect(rows[5]![5]).toBe("@");
});

test("renderGridHtml: emits a CSS grid with one tile per cell", () => {
  const grid = generateGrid("snap-1", "woodland");
  const html = renderGridHtml(grid, grid.entry);
  expect(html).toContain(`grid-template-columns: repeat(${GRID_SIZE}`);
  expect(html.match(/class="tile /g)?.length).toBe(GRID_SIZE * GRID_SIZE);
  expect(html).toContain("player");
  expect(html.match(/ poi /g)?.length).toBe(POI_DENSITY);
  expect(html).toBe(renderGridHtml(generateGrid("snap-1", "woodland"), grid.entry));
});
