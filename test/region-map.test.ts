// seyh.28 / D106 / D110: the region chart. Each land has a FIXED bearing on every
// ring, rings are tiers, held maps sit in their own land's wedge on their tier's ring
// (never randomly), and an unlit near land says when the rotation brings it back.
import { describe, expect, test } from "bun:test";
import { BIOME_IDS, RARE_BIOMES, REGION_BEARING, REGION_BACK_HORIZON, MAP_TIER_MAX } from "../src/data/constants";
import type { BiomeId } from "../src/data/constants";
import { regionWedge, landsAt, ringBand, regionRings, regionSpots, ringWord, backInTrips, backInCopy, REGION_GEOM } from "../src/render/render";
import { newGame, localMap } from "../src/engine/town";
import type { GameState, MapItem } from "../src/engine/types";
import { regionView, region, mapTile } from "../src/web/region-view";

const map = (mapSeed: string, biomeId: BiomeId, tier: number, extra: Partial<MapItem> = {}): MapItem => ({ mapSeed, biomeId, vintage: 0, tier, hints: [], studied: 0, ...extra });
const norm = (a: number) => ((a % 360) + 360) % 360;
const within = (a: number, w: { a0: number; a1: number }) => { const d = norm(a - w.a0); return d >= 0 && d <= w.a1 - w.a0 + 1e-9; };

describe("fixed land sectors (D106: never random geography)", () => {
  test("the near ring is the three base lands in thirds", () => {
    expect(landsAt(1).sort()).toEqual(BIOME_IDS.filter((b) => !RARE_BIOMES[b]).sort());
    for (const b of landsAt(1)) {
      const w = regionWedge(b, 1)!;
      expect(w.a1 - w.a0).toBeCloseTo(120);
    }
  });
  test("a land keeps its bearing on every ring it lies on", () => {
    for (const b of BIOME_IDS) {
      for (let t = 1; t <= MAP_TIER_MAX; t++) {
        const w = regionWedge(b, t);
        if ((RARE_BIOMES[b]?.minTier ?? 1) > t) { expect(w).toBeNull(); continue; }
        expect(w!.mid).toBe(REGION_BEARING[b]);
        expect(w!.a0).toBeLessThan(w!.mid);
        expect(w!.a1).toBeGreaterThan(w!.mid);
      }
    }
  });
  test("each ring's wedges tile the whole circle with no gap or overlap", () => {
    for (let t = 1; t <= MAP_TIER_MAX; t++) {
      const ws = landsAt(t).map((b) => regionWedge(b, t)!);
      expect(ws.reduce((s, w) => s + (w.a1 - w.a0), 0)).toBeCloseTo(360);
      for (let i = 0; i < ws.length; i++) expect(norm(ws[i]!.a1)).toBeCloseTo(norm(ws[(i + 1) % ws.length]!.a0));
    }
  });
  test("every land has a distinct bearing", () => {
    expect(new Set(Object.values(REGION_BEARING)).size).toBe(BIOME_IDS.length);
  });
});

describe("rings = tiers", () => {
  test("ring 1 is the near country around the town; outer rings share the rest out to the edge", () => {
    for (const rings of [3, 4, 5]) {
      expect(ringBand(1, rings)).toEqual([REGION_GEOM.town, REGION_GEOM.near]);
      for (let t = 2; t <= rings; t++) expect(ringBand(t, rings)[0]).toBeCloseTo(ringBand(t - 1, rings)[1]);
      expect(ringBand(rings, rings)[1]).toBeCloseTo(REGION_GEOM.edge);
    }
  });
  test("the chart reaches far (T3) at least, and out to the deepest map held", () => {
    expect(regionRings([])).toBe(3);
    expect(regionRings([map("a", "desert", 2)])).toBe(3);
    expect(regionRings([map("a", "desert", 4)])).toBe(4);
    expect(regionRings([map("a", "desert", 9)])).toBe(MAP_TIER_MAX);
  });
  test("ring names are words, not numerals", () => {
    expect([1, 2, 3].map(ringWord)).toEqual(["near", "further out", "far"]);
    for (let t = 1; t <= MAP_TIER_MAX; t++) expect(ringWord(t)).not.toMatch(/^[IVX\d]+$/);
  });
});

describe("held maps sit in their land's wedge on their tier's ring", () => {
  const maps = [
    map("m-c2", "coastal", 2), map("m-w2", "woodland", 2), map("m-s2", "swamp", 2),
    map("m-d2a", "desert", 2), map("m-d2b", "desert", 2), map("m-d2c", "desert", 2),
    map("m-f3", "fungal", 3), map("m-t3", "tundra", 3), map("m-w1", "woodland", 1),
  ];
  test("on the ring, inside the wedge", () => {
    const rings = regionRings(maps);
    for (const s of regionSpots(maps)) {
      const m = maps.find((x) => x.mapSeed === s.mapSeed)!;
      const [r0, r1] = ringBand(m.tier!, rings);
      expect(s.r - s.size).toBeGreaterThanOrEqual(r0);
      expect(s.r + s.size).toBeLessThanOrEqual(r1);
      expect(within(s.bearing, regionWedge(m.biomeId, m.tier!)!)).toBe(true);
      expect(Math.hypot(s.x, s.y)).toBeCloseTo(s.r);
    }
  });
  test("stable: the same maps in any order land on the same spots", () => {
    const a = regionSpots(maps), b = regionSpots([...maps].reverse());
    const key = (xs: typeof a) => Object.fromEntries(xs.map((s) => [s.mapSeed, [s.x, s.y]]));
    expect(key(b)).toEqual(key(a));
  });
  test("a lone map sits on its land's own bearing", () => {
    const [s] = regionSpots([map("solo", "jungle", 2)]);
    expect(s!.bearing).toBe(REGION_BEARING.jungle);
  });
  test("placed by the FROZEN biomeId (D93), not re-derived from the seed", () => {
    const [a] = regionSpots([map("same-seed", "coastal", 2)]);
    const [b] = regionSpots([map("same-seed", "tundra", 2)]);
    expect(a!.bearing).toBe(REGION_BEARING.coastal);
    expect(b!.bearing).toBe(REGION_BEARING.tundra);
  });
  test("maps of one land and tier don't overlap (up to three)", () => {
    const spots = regionSpots(maps).filter((s) => s.mapSeed.startsWith("m-d2"));
    expect(spots).toHaveLength(3);
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y)).toBeGreaterThan(spots[i]!.size + spots[j]!.size);
    }
  });
  test("a scrap wears its own land's tile (D106: scraps carry their land's colour), the same at every tier", () => {
    for (const b of BIOME_IDS) {
      const near = mapTile(map(`n-${b}`, b, 1));
      expect(mapTile(map(`v-${b}`, b, 3))).toBe(near);
      for (const o of BIOME_IDS) if (o !== b) expect(mapTile(map(`o-${o}`, o, 1))).not.toBe(near);
    }
  });
});

describe("an unlit near land says when it's back", () => {
  test("backInTrips is the first future trip whose local walk-out is that land", () => {
    const seed = "rg-back", runs = 2;
    for (const b of landsAt(1)) {
      const n = backInTrips(seed, runs, b);
      if (n === null) {
        for (let k = 1; k <= REGION_BACK_HORIZON; k++) expect(localMap(seed, runs + k).biomeId).not.toBe(b);
      } else {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(localMap(seed, runs + n).biomeId).toBe(b);
        for (let k = 1; k < n; k++) expect(localMap(seed, runs + k).biomeId).not.toBe(b);
      }
    }
  });
  test("the copy is a time, never a dead end", () => {
    expect(backInCopy(1)).toBe("back past the gate next trip");
    expect(backInCopy(2)).toBe("back past the gate in 2 trips");
    expect(backInCopy(null)).toMatch(/good while/);
  });
});

describe("the region view (smoke)", () => {
  const mid = (): GameState => ({ ...newGame("rg-view"), runs: 3, maps: [map("v-c2", "coastal", 2, { hints: ["g-ordinary"] }), map("v-t3", "tundra", 3)] });
  test("a new game: only the near country, the lit land pre-selected with Walk out", () => {
    region.sel = null;
    const s = newGame("rg-new");
    const html = regionView(s, null);
    const local = localMap(s.seed, 0);
    expect(html).toContain("data-region");
    expect(html).toContain(`data-prepare="${local.mapSeed}"`);
    expect(html).toContain("Walk out");
    expect(html).toContain(`class="rg-land lit on" `);
    expect(html.match(/class="rg-land lit/g)).toHaveLength(1);
    expect(html).not.toContain("data-region-map");
    expect(html).not.toMatch(/FREE/);
  });
  test("held maps: one scrap and one panel row each; picking one offers Pack for it", () => {
    const s = mid();
    region.sel = null;
    let html = regionView(s, null);
    expect(html.match(/<g class="rg-scrap/g)).toHaveLength(2);
    expect(html.match(/<button class="rg-row/g)).toHaveLength(2);
    region.sel = { kind: "map", mapSeed: "v-c2" };
    html = regionView(s, null);
    expect(html).toContain(`class="rg-scrap on" data-region-map="v-c2"`);
    expect(html).toContain(`data-prepare="v-c2"`);
    expect(html).toContain("further out");
    expect(html).toContain("rg-road");
    region.sel = null;
  });
  test("a chosen held map (prep) is the default selection", () => {
    region.sel = null;
    expect(regionView(mid(), "v-t3")).toContain(`data-prepare="v-t3"`);
  });
  test("an unlit near land's card says when it's back", () => {
    const s = mid();
    const unlit = landsAt(1).find((b) => b !== localMap(s.seed, 3).biomeId)!;
    region.sel = { kind: "land", biome: unlit };
    const html = regionView(s, null);
    expect(html).toContain(backInCopy(backInTrips(s.seed, 3, unlit)));
    expect(html).not.toContain("data-prepare");
    region.sel = null;
  });
});
