// ai8 / qba / 5k4: tile names, what a tile yields, and slow-vs-blocked route copy —
// pure render.ts selectors read off the terrain/gear levers.
import { describe, expect, test } from "bun:test";
import { tileName, tileYield, terrainGear, slowRouteNote, blockedRouteNote, ownedGear } from "../src/render/render";
import { emptyLoadout } from "../src/engine/loadout";
import type { Expedition } from "../src/engine/types";
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
  test("unresolved says 'too far to tell' (seyh.6, never '?'), and nothing for monsters / empty / cleared tiles", () => {
    expect(tileYield(vein, null, false, [])).toBe("Ore vein (too far to tell)");
    expect(tileYield(vein, { gatedBy: null }, false, [])).not.toContain("?");
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

// seyh.29 (D111): the notes never name the gear in words; they return the helping
// gear for the web to draw as silhouettes, `owned` once the player has had one.
const gearWords = /waders|raft|longboat|pick|cleats|horse|wagon|mule|speed it up|gets you across/;
describe("slowRouteNote (5k4, seyh.29)", () => {
  test("plains only — not slow", () => {
    expect(slowRouteNote(["plains", "plains"], onFoot)).toBeNull();
  });
  test("names the slow terrain (most tiles first), never the gear; the gear comes back as hints", () => {
    const n = slowRouteNote(["mud", "river", "mud", "plains"], onFoot)!;
    expect(n.text).toBe("slower going through the mud and river");
    expect(n.text).not.toMatch(gearWords);
    expect(n.gear.map((g) => g.id)).toContain("waders");
    expect(n.gear.every((g) => !g.owned)).toBe(true); // default: nothing owned
  });
  test("owned gear is flagged (coloured in), the rest stays a silhouette", () => {
    const n = slowRouteNote(["mud"], onFoot, (id) => id === "waders")!;
    expect(n.gear.find((g) => g.id === "waders")!.owned).toBe(true);
    expect(n.gear.filter((g) => g.id !== "waders").every((g) => !g.owned)).toBe(true);
  });
  test("gear you already wear is not hinted; a fully-sped terrain is no longer slow", () => {
    expect(slowRouteNote(["mud"], { transport: null, tools: ["waders"] })).toBeNull(); // 15 − 5 = plains pace
    expect(slowRouteNote(["river"], { transport: null, tools: ["waders"] })!.gear.map((g) => g.id)).not.toContain("waders");
  });
  test("slow ground no gear speeds → no hint at all (it is always like this)", () => {
    expect(slowRouteNote(["spore-thicket"], onFoot)).toEqual({ text: "slower going through the spore-thickets", gear: [] });
  });
});

describe("blockedRouteNote (5k4, seyh.29)", () => {
  test("names the wall, not the gear; the gear that crosses it comes back as hints", () => {
    expect(blockedRouteNote("mountain")).toEqual({ text: "the mountains block this path", gear: [{ id: "climbing-pick", owned: false }] });
    expect(blockedRouteNote("sea", (id) => id === "longboat")).toEqual({ text: "the sea blocks this path", gear: [{ id: "longboat", owned: true }] });
  });
});

describe("ownedGear (seyh.29)", () => {
  test("bank, town loadout, expedition loadout/spares/carry, and ever-seen all count; nothing else", () => {
    const lo = emptyLoadout();
    lo.equipment.transport = "horse";
    const exLo = emptyLoadout();
    exLo.equipment.tools = ["ice-cleats"];
    exLo.spares = [{ defId: "raft", qty: 1 }];
    const exp: Expedition = { mapSeed: "m", pos: { x: 0, y: 0 }, energy: 10, hp: 30, loadout: exLo, carry: [{ defId: "wagon", qty: 1 }], cleared: [] };
    const owned = ownedGear({ bank: [{ defId: "waders", qty: 1 }], loadout: lo, expedition: exp, seen: ["mule"] });
    for (const id of ["waders", "horse", "ice-cleats", "raft", "wagon", "mule"]) expect(owned(id)).toBe(true);
    expect(owned("climbing-pick")).toBe(false);
    expect(ownedGear({ bank: [], loadout: emptyLoadout(), expedition: null })("waders")).toBe(false);
  });
});
