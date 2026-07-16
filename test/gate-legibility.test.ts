import { test, expect } from "bun:test";
import {
  recipeGateHint,
  recipeTerrainGate,
  nodeToolHint,
  nodeGateNote,
  materialsUnlockedBy,
  describe as describeItem,
} from "../src/render/render";
import { perceive } from "../src/engine/perceive";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { MATERIAL_GATE } from "../src/data/constants";

// gate-legibility (playtest 2026-07-09 finding #1) — pure signposting helpers.

test("recipeGateHint names the station + tools a locked recipe needs", () => {
  // plate armour is anvil + blacksmiths-hammer gated
  const h = recipeGateHint("plate-helmet");
  expect(h).toBe("needs anvil + blacksmiths-hammer");
});

test("recipeGateHint names a tool-only gate (draught → glassware)", () => {
  expect(recipeGateHint("draught")).toBe("needs glassware");
});

test("recipeGateHint names the multi-tool AND-gate (stew)", () => {
  expect(recipeGateHint("stew")).toBe("needs fire-kit + cooking-pot");
});

test("recipeGateHint is null for an ungated recipe", () => {
  // a basic ration has no requires
  expect(recipeGateHint("composite-bow")).toBeNull();
});

test("recipeTerrainGate surfaces a field terrain gate (water-vial → river)", () => {
  expect(recipeTerrainGate("water-vial")).toBe("river");
  expect(recipeTerrainGate("plate-helmet")).toBeNull();
});

test("nodeToolHint names the MISSING tool(s) for a node, null when the player holds them (D83 tool-aware)", () => {
  // Bare-handed: names whatever the node requires.
  expect(nodeToolHint("mining", [])).toBe("needs a pick");
  expect(nodeToolHint("wood", [])).toBe("needs a axe");
  expect(nodeToolHint("herb", [])).toBeNull(); // bare-hand forage
  // Animal = trap AND knife (D83). Flavored combined copy; then only the missing one.
  expect(nodeToolHint("animal", [])).toBe("you'll need both a trap to trap the animal and a knife to alleviate it of its parts");
  expect(nodeToolHint("animal", ["knife"])).toBe("needs a trap to trap the animal");
  expect(nodeToolHint("animal", ["trap"])).toBe("needs a knife to alleviate it of its parts");
  expect(nodeToolHint("animal", ["trap", "knife"])).toBeNull();
  // Holding the tool clears the generic hint too.
  expect(nodeToolHint("mining", ["pick"])).toBeNull();
});

test("nodeGateNote names the unlocking tool family for a gated material, null for ungated or a monster", () => {
  // D78: gate note names WHICH tool(s) unlock the node — no tier number.
  expect(nodeGateNote({ gatedBy: ["iron-pick", "steel-pick"], material: "silver-ore" })).toBe("locked — needs iron-pick or steel-pick");
  expect(nodeGateNote({ gatedBy: null, material: "iron-ore" })).toBeNull();
  expect(nodeGateNote(null)).toBeNull();
  // a monster detail (has creature) is never given a material-gate note
  expect(nodeGateNote({ tier: 3, creature: "ice-troll" })).toBeNull();
});

test("nodeGateNote reads the PERCEIVED (range-gated) gate for a surveyed node", () => {
  // find a seed with a gated mining/wood/animal material to prove the wiring
  for (let i = 0; i < 200; i++) {
    const seed = `gate-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const gated = grid.pois.find((p) => p.material && p.material in MATERIAL_GATE);
    if (!gated) continue;
    // stand on it → perceive resolves detail → note names its unlocking tools
    const per = perceive(grid, { x: gated.x, y: gated.y }, []).find(
      (p) => p.x === gated.x && p.y === gated.y,
    )!;
    const note = nodeGateNote(per.detail);
    expect(note).toBe(`locked — needs ${MATERIAL_GATE[gated.material!]!.tools.join(" or ")}`);
    return;
  }
  throw new Error("no gated material POI in scan range");
});

test("materialsUnlockedBy reverse-maps a tool to the materials it gates", () => {
  // iron-pick opens coal/salt/silver-ore (any-of with steel-pick); steel-pick also mithril
  expect(materialsUnlockedBy("iron-pick")).toEqual(["coal", "salt", "silver-ore"]);
  expect(materialsUnlockedBy("steel-pick")).toEqual(["coal", "mithril-ore", "salt", "silver-ore"]);
  expect(materialsUnlockedBy("pick")).toEqual([]); // base tool gates nothing
  // D83: steel-knife retired — drake-hide is a combat drop now, seal huntable with the base knife.
});

test("describe: a kit-tool states what door it opens (fire-kit → field cooking)", () => {
  expect(describeItem("fire-kit").toLowerCase()).toContain("field cooking");
  expect(describeItem("glassware").toLowerCase()).toContain("field brewing");
  expect(describeItem("blacksmiths-hammer").toLowerCase()).toContain("forge");
  // the spyglass tooltip explains the survey payoff (playtest: felt broken)
  expect(describeItem("spyglass").toLowerCase()).toContain("gate");
});
