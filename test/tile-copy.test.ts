// ai8 / qba / 5k4: tile names, what a tile yields, and slow-vs-blocked route copy —
// pure render.ts selectors read off the terrain/gear levers.
import { describe, expect, test } from "bun:test";
import { tileName, tileYield, terrainGear, slowRouteNote, blockedRouteNote } from "../src/render/render";
import { TERRAIN_GATE, TRANSPORT_MULTIPLIER } from "../src/data/constants";

const onFoot = { transport: null, tools: [] as string[] };

describe("tileName (qba)", () => {
  test("terrain, a monster, a resolved node, an unresolved node, a cleared tile", () => {
    expect(tileName("plains", null, null, false)).toBe("Plains");
    expect(tileName("plains", { kind: "monster", creature: "forest-bandit" }, null, false)).toBe("Forest Bandit");
    expect(tileName("mud", { kind: "mining", creature: null }, { material: "copper-ore" }, false)).toBe("Ore vein · Copper Ore");
    expect(tileName("mud", { kind: "mining", creature: null }, null, false)).toBe("Ore vein"); // honest to sight
    expect(tileName("plains", { kind: "monster", creature: "forest-boar" }, null, true)).toBe("Plains · cleared");
    expect(tileName("plains", { kind: "wood", creature: null }, null, true)).toBe("Plains · worked out");
  });
});

describe("tileYield (ai8)", () => {
  const vein = { kind: "mining" as const, creature: null };
  test("names the yield and the missing tool", () => {
    expect(tileYield(vein, { material: "copper-ore" }, false, [])).toBe("Ore vein → Copper Ore (needs pick)");
    expect(tileYield(vein, { material: "copper-ore" }, false, ["pick"])).toBe("Ore vein → Copper Ore");
  });
  test("an access gate you don't hold, from the perceived detail", () => {
    expect(tileYield(vein, { material: "silver-ore", gatedBy: ["iron-pick", "steel-pick"] }, false, ["pick"])).toBe("Ore vein → Silver Ore (needs iron-pick or steel-pick)");
    expect(tileYield(vein, { material: "silver-ore", gatedBy: ["iron-pick"] }, false, ["pick", "iron-pick"])).toBe("Ore vein → Silver Ore");
  });
  test("unresolved = '?', and nothing for monsters / empty / cleared tiles", () => {
    expect(tileYield(vein, null, false, [])).toBe("Ore vein → ?");
    expect(tileYield({ kind: "monster", creature: "forest-boar" }, null, false, [])).toBeNull();
    expect(tileYield(null, null, false, [])).toBeNull();
    expect(tileYield(vein, { material: "copper-ore" }, true, [])).toBeNull();
  });
});

describe("terrainGear", () => {
  test("opens = TERRAIN_GATE enables; speeds = discounts + faster transports", () => {
    expect(terrainGear("mountain").opens).toEqual(Object.keys(TERRAIN_GATE.mountain!));
    expect(terrainGear("mud").speeds).toEqual(["waders", ...Object.keys(TRANSPORT_MULTIPLIER).filter((t) => (TRANSPORT_MULTIPLIER[t]!.mud ?? 1) > 1)]);
    expect(terrainGear("plains").opens).toEqual([]);
  });
});

describe("slowRouteNote (5k4)", () => {
  test("plains only — not slow", () => {
    expect(slowRouteNote(["plains", "plains"], onFoot)).toBeNull();
  });
  test("names the slow terrain (most tiles first) and loosely hints gear", () => {
    const n = slowRouteNote(["mud", "river", "mud", "plains"], onFoot)!;
    expect(n.startsWith("slower going through the mud and river")).toBe(true);
    expect(n).toContain("waders");
    expect(n).toContain("would speed it up");
  });
  test("gear you already have is not suggested; a fully-sped terrain is no longer slow", () => {
    expect(slowRouteNote(["mud"], { transport: null, tools: ["waders"] })).toBeNull(); // 15 − 5 = plains pace
    expect(slowRouteNote(["river"], { transport: null, tools: ["waders"] })).not.toContain("waders");
  });
  test("slow terrain no gear speeds still says slower, without a hint", () => {
    expect(slowRouteNote(["spore-thicket"], onFoot)).toBe("slower going through the spore-thickets");
  });
});

describe("blockedRouteNote (5k4)", () => {
  test("names the wall and the gear that crosses it", () => {
    expect(blockedRouteNote("mountain")).toBe("the mountains block this path — only a climbing pick gets you across");
    expect(blockedRouteNote("sea")).toBe("the sea blocks this path — only a longboat gets you across");
  });
});
