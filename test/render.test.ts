import { test, expect } from "bun:test";
import { render, renderGridText } from "../src/render/render";
import { generateGrid } from "../src/engine/grid";
import { GRID_SIZE, POI_DENSITY } from "../src/data/constants";
import type { GameState } from "../src/engine/types";

const expeditionState = (mapSeed: string): GameState => ({
  seed: "game-seed",
  phase: "expedition",
  bank: [],
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
  },
});

test("render: town state renders the town placeholder", () => {
  const state: GameState = { seed: "s", phase: "town", bank: [], expedition: null };
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
