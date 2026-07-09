import { test, expect } from "bun:test";
import {
  recipeGateHint,
  recipeTerrainGate,
  nodeToolHint,
  nodeTierNote,
  describe as describeItem,
} from "../src/render/render";
import { perceive } from "../src/engine/perceive";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { MATERIAL_TIER } from "../src/data/constants";

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

test("nodeToolHint names the tool KIND a node wants, null for bare-hand herbs", () => {
  expect(nodeToolHint("mining")).toBe("needs a pick");
  expect(nodeToolHint("animal")).toBe("needs a knife");
  expect(nodeToolHint("wood")).toBe("needs a axe");
  expect(nodeToolHint("herb")).toBeNull();
});

test("nodeTierNote surfaces a >1 material tier, null for tier 1 or a monster", () => {
  expect(nodeTierNote({ tier: 2, material: "silver-ore" })).toBe("tier 2 — needs a tier-2 tool");
  expect(nodeTierNote({ tier: 1, material: "iron-ore" })).toBeNull();
  expect(nodeTierNote(null)).toBeNull();
  // a monster detail (has creature) is never given a material-tier note
  expect(nodeTierNote({ tier: 3, creature: "ice-troll" })).toBeNull();
});

test("nodeTierNote reads the PERCEIVED (range-gated) tier for a surveyed node", () => {
  // find a seed with a tier-2+ mining/wood/animal material to prove the wiring
  for (let i = 0; i < 200; i++) {
    const seed = `tier-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const tiered = grid.pois.find((p) => p.material && (MATERIAL_TIER[p.material] ?? 1) > 1);
    if (!tiered) continue;
    // stand on it → perceive resolves detail → note names its tier
    const per = perceive(grid, { x: tiered.x, y: tiered.y }, []).find(
      (p) => p.x === tiered.x && p.y === tiered.y,
    )!;
    const note = nodeTierNote(per.detail);
    expect(note).toBe(`tier ${MATERIAL_TIER[tiered.material!]} — needs a tier-${MATERIAL_TIER[tiered.material!]} tool`);
    return;
  }
  throw new Error("no tiered material POI in scan range");
});

test("describe: a kit-tool states what door it opens (fire-kit → field cooking)", () => {
  expect(describeItem("fire-kit").toLowerCase()).toContain("field cooking");
  expect(describeItem("glassware").toLowerCase()).toContain("field brewing");
  expect(describeItem("blacksmiths-hammer").toLowerCase()).toContain("forge");
  // the spyglass tooltip explains the survey payoff (playtest: felt broken)
  expect(describeItem("spyglass").toLowerCase()).toContain("tier");
});
