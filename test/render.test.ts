import { test, expect } from "bun:test";
import { render, renderGridText, renderGridHtml } from "../src/render/render";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { MAP_WIDTH, MAP_HEIGHT, POI_DENSITY } from "../src/data/constants";
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
        gloves: null, tools: [], transport: null, backpack: null, panniers: null,
      },
      food: [],
      potions: [],
      battleItems: [],
    },
    carry: [],
    cleared: [],
  },
});

test("render: town state renders the town placeholder", () => {
  const state: GameState = { seed: "s", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  expect(render(state)).toBe("(town)");
});

test("renderGridText: 60 rows × 20 chars, byte-identical for same seed+biome", () => {
  const text = renderGridText(generateGrid("snap-1", "woodland"));
  const again = renderGridText(generateGrid("snap-1", "woodland"));
  expect(text).toBe(again);
  const rows = text.split("\n");
  expect(rows.length).toBe(MAP_HEIGHT);
  for (const row of rows) expect(row.length).toBe(MAP_WIDTH);
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
  expect(rows.length).toBe(MAP_HEIGHT);
  expect(rows[5]![5]).toBe("@");
});

test("renderGridHtml: emits a CSS grid with one tile per cell", () => {
  const grid = generateGrid("snap-1", "woodland");
  const html = renderGridHtml(grid, grid.entry);
  expect(html).toContain(`grid-template-columns: repeat(${MAP_WIDTH}`);
  expect(html.match(/class="tile /g)?.length).toBe(MAP_WIDTH * MAP_HEIGHT);
  expect(html).toContain("player");
  expect(html.match(/ poi /g)?.length).toBe(POI_DENSITY);
  expect(html).toBe(renderGridHtml(generateGrid("snap-1", "woodland"), grid.entry));
});

// --- perception flavor (9u9.2): facts → vague human text, no numbers/outcome ---
import { flavorDetail, matchupLessons } from "../src/render/render";

test("flavorDetail: null detail gives kind-only text; monster detail is vague, no numbers", () => {
  expect(flavorDetail(null, "monster")).toBe("a monster");
  const txt = flavorDetail({ tier: 3, dmgType: "magic", armourType: "plate", creature: "ice-troll" }, "monster");
  expect(txt).not.toMatch(/\d/); // no exact numbers leak
  expect(txt.length).toBeGreaterThan(0);
});

test("matchupLessons: surfaces affinity + weapon-vs-hide + armour result", () => {
  const l = matchupLessons({ weaponVsHide: 0.5, affinityFired: true, armourVsAttack: "exposed" }, "bow");
  expect(l.length).toBeGreaterThan(0);
  expect(l.join(" ")).toMatch(/savaged|something/i); // affinity line present
  const none = matchupLessons({ weaponVsHide: 1, affinityFired: false, armourVsAttack: "neutral" }, "sword");
  expect(none.length).toBe(0); // nothing notable → no noise
});

test("render: expedition honours mapTier — tier-3 render differs from tier-1 render", () => {
  // seed="snap-1" biome="desert" (rollBiome("snap-1")==="desert") produces different
  // terrain/POI layouts at tier 1 vs tier 3, so we can prove the tier arg is used.
  const seed = "snap-1";
  const biome = rollBiome(seed);
  const tier1Grid = generateGrid(seed, biome, 1);
  const tier3Grid = generateGrid(seed, biome, 3);
  // Sanity: the two grids actually differ for this seed (proves the test is meaningful)
  expect(renderGridText(tier1Grid)).not.toBe(renderGridText(tier3Grid));

  // Build a GameState with mapTier: 3
  const baseExp = expeditionState(seed);
  const tier3State: GameState = {
    ...baseExp,
    expedition: { ...baseExp.expedition!, mapTier: 3 },
  };
  const tier1State: GameState = {
    ...baseExp,
    expedition: { ...baseExp.expedition!, mapTier: 1 },
  };

  // render() must match the grid generated at the expedition's actual tier
  expect(render(tier3State)).toBe(renderGridText(tier3Grid, baseExp.expedition!.pos));
  expect(render(tier1State)).toBe(renderGridText(tier1Grid, baseExp.expedition!.pos));
  // Cross-check: tier-3 state must NOT render as tier-1 grid
  expect(render(tier3State)).not.toBe(renderGridText(tier1Grid, baseExp.expedition!.pos));
});

test("flavorDetail names node magnitude variants", () => {
  expect(flavorDetail({ tier: 1, material: "iron-ore", magnitude: 2 }, "mining")).toBe("iron-ore cluster");
  expect(flavorDetail({ tier: 1, material: "iron-ore", magnitude: 3 }, "mining")).toBe("iron-ore cave");
  expect(flavorDetail({ tier: 1, material: "berries", magnitude: 2 }, "herb")).toBe("berries patch");
  // base (magnitude 1/absent) unchanged
  expect(flavorDetail({ tier: 1, material: "iron-ore" }, "mining")).toBe("iron-ore");
});
