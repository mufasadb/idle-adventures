// 0m4: the walkable town's layout table — positions, hit-testing, plot sprites.
import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { ART, GROUND, PLOTS, TOWN_LAYOUT, HERO_HOME, plotArt, scenePlacements, spotAt, spotBox, walkMs, walkPlan, WALK_SPEED, BLINK_LEAD_MS, cameraX, clampCam } from "../src/web/town-layout";
import type { ArtKey, Spot } from "../src/web/town-layout";
import type { StationId } from "../src/data/constants";

const STATIONS = Object.keys(PLOTS) as StationId[];
const byId = (spots: Spot[], id: string) => spots.find((s) => s.id === id)!;
const centre = (s: Spot) => { const b = spotBox(s); return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; };

// A .webp's pixel size, from its header (VP8X extended, or simple lossy VP8).
function webpSize(path: string): { w: number; h: number } {
  const b = readFileSync(path);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`unexpected webp chunk ${chunk} in ${path}`);
}

describe("town art", () => {
  test("every layer the layout names exists, at the size the layout assumes (aspect drives hit boxes)", () => {
    for (const key of Object.keys(ART) as ArtKey[]) {
      const path = `src/web/assets/town/${key}.webp`;
      expect(existsSync(path)).toBe(true);
      expect(webpSize(path)).toEqual(ART[key]);
    }
    expect(webpSize("src/web/assets/town/ground.webp")).toEqual(GROUND);
  });
});

describe("plots", () => {
  test("an unbuilt station shows the empty plot; a built one its own sprite (the alchemical desk = alchemist)", () => {
    for (const st of STATIONS) expect(plotArt(st, false).art).toBe("plot");
    expect(plotArt("smokehouse", true).art).toBe("smokehouse");
    expect(plotArt("alchemical-desk", true).art).toBe("alchemist");
    expect(plotArt("anvil", true).art).toBe("anvil");
    expect(plotArt("still", true).art).toBe("still");
  });

  test("one plot per home station, built or not; an old save with no stations gets every plot empty", () => {
    const none = scenePlacements([]);
    for (const st of STATIONS) expect(byId(none, `plot:${st}`).art).toBe("plot");
    const some = scenePlacements(["smokehouse", "alchemical-desk"]);
    expect(byId(some, "plot:smokehouse").art).toBe("smokehouse");
    expect(byId(some, "plot:alchemical-desk").art).toBe("alchemist");
    expect(byId(some, "plot:anvil").art).toBe("plot");
    expect(some.filter((s) => s.id.startsWith("plot:"))).toHaveLength(STATIONS.length);
  });
});

describe("layout", () => {
  const spots = scenePlacements(["anvil"]);

  test("placements are depth-sorted back to front (feet y ascending)", () => {
    for (let i = 1; i < spots.length; i++) expect(spots[i]!.y).toBeGreaterThanOrEqual(spots[i - 1]!.y);
  });

  test("every station sits on the ground and the hero can stand by it", () => {
    for (const s of spots) {
      const b = spotBox(s);
      expect(b.x0).toBeGreaterThan(-0.1); expect(b.x1).toBeLessThan(1.1);
      expect(b.y0).toBeGreaterThanOrEqual(0); expect(b.y1).toBeLessThanOrEqual(1);
      expect(s.stand.x).toBeGreaterThan(0); expect(s.stand.x).toBeLessThan(1);
      expect(s.stand.y).toBeGreaterThan(0); expect(s.stand.y).toBeLessThan(1);
    }
  });

  test("the stations open what the brief says", () => {
    const panel = (id: string) => { const a = byId(spots, id).action; return a.kind === "panel" ? a.panel : a.kind; };
    expect(panel("board")).toBe("maps");
    expect(panel("bank")).toBe("bank");
    expect(panel("workshop")).toBe("recipes");
    expect(panel("research")).toBe("research");
    expect(panel("stable")).toBe("stable");
    expect(panel("gate")).toBe("gate");
    expect(panel("cloth")).toBe("gate");
    // the gate and its packing cloth are on the right edge
    expect(byId(spots, "gate").x).toBeGreaterThan(0.85);
    expect(byId(spots, "cloth").x).toBeGreaterThan(0.8);
  });

  test("tapping a station's middle hits it; open ground and decoration hit nothing", () => {
    for (const s of spots) if (s.action.kind !== "none") expect(spotAt(spots, centre(s))?.id).toBe(s.id);
    expect(spotAt(spots, HERO_HOME)).toBeNull(); // the middle of the square
    expect(spotAt(spots, centre(byId(spots, "cart")))).toBeNull(); // the cart is scenery
  });

  test("overlapping boxes resolve to the one drawn in front (lower on the ground)", () => {
    const back: Spot = { ...TOWN_LAYOUT[0]!, id: "back", y: 0.5 };
    const front: Spot = { ...TOWN_LAYOUT[0]!, id: "front", y: 0.52 };
    expect(spotAt([front, back], { x: back.x, y: 0.4 })?.id).toBe("front");
  });

  test("a sprite's transparent corner doesn't steal the tap", () => {
    const b = spotBox(byId(spots, "board"));
    expect(spotAt([byId(spots, "board")], { x: b.x0 + 0.001, y: b.y0 + 0.001 })).toBeNull();
  });
});

describe("walking + camera", () => {
  test("a walk goes at WALK_SPEED; standing still takes none", () => {
    expect(walkMs(HERO_HOME, HERO_HOME)).toBe(0);
    const hop = walkMs(HERO_HOME, { x: 0.52, y: 0.72 });
    expect(hop).toBe(Math.round((0.02 * GROUND.w / GROUND.h / WALK_SPEED) * 1000));
    expect(walkMs({ x: 0.05, y: 0.5 }, { x: 0.95, y: 0.5 })).toBeGreaterThan(walkMs(HERO_HOME, { x: 0.65, y: 0.6 }));
  });

  test("a short walk goes all the way; a long one sets off, then blinks to the spot", () => {
    const near = { x: 0.53, y: 0.72 };
    expect(walkPlan(HERO_HOME, near)).toEqual({ walk: near, ms: walkMs(HERO_HOME, near), blink: false });
    const far = { x: 0.95, y: 0.5 };
    const p = walkPlan({ x: 0.05, y: 0.5 }, far);
    expect(p.blink).toBe(true);
    expect(p.ms).toBe(BLINK_LEAD_MS);
    expect(p.walk.x).toBeGreaterThan(0.05); expect(p.walk.x).toBeLessThan(0.3); // set off the right way, a few steps
    expect(p.walk.y).toBe(0.5);
  });

  test("the camera centres the hero but never shows past the ground's edges", () => {
    expect(cameraX(0.5, 2000, 800)).toBe(600);
    expect(cameraX(0.02, 2000, 800)).toBe(0);
    expect(cameraX(0.99, 2000, 800)).toBe(1200);
    expect(clampCam(500, 700, 800)).toBe(0); // ground narrower than the view: pinned
  });
});
