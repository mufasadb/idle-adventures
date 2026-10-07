// Cel restyle (2026-10-07): the web asset lookup prefers hi-res cel frames, drawn at
// the pixel frame's CSS size, and falls back to the pixel atlas for keys it lacks.
import { afterEach, describe, expect, test } from "bun:test";
import { frameStyle, iconStyle, monsterStyle, setArtSet } from "../src/web/assets";
import celIcon from "../src/web/assets/cel/atlas-icon.json";
import celMonster from "../src/web/assets/cel/atlas-monster.json";
import pixelIcon from "../src/web/assets/atlas-icon.json";
import pixelMonster from "../src/web/assets/atlas-monster.json";

const celIcons = Object.keys(celIcon.frames);
const celMonsters = Object.keys(celMonster.frames);
const pixelOnlyIcon = Object.keys(pixelIcon.frames).find((k) => !celIcons.includes(k));
const pixelOnlyMonster = Object.keys(pixelMonster.frames).find((k) => !celMonsters.includes(k));

afterEach(() => setArtSet("cel"));

describe("cel art set", () => {
  test("every cel frame is the pixel frame's size × scale (layout unchanged)", () => {
    for (const m of [celIcon, celMonster]) {
      const px = (m.kind === "icon" ? pixelIcon : pixelMonster).frames as Record<string, { w: number; h: number }>;
      for (const [k, f] of Object.entries(m.frames)) {
        expect(px[k]).toBeDefined();
        expect(f.w).toBe(px[k]!.w * m.scale);
        expect(f.h).toBe(px[k]!.h * m.scale);
      }
    }
  });

  test("a cel icon is drawn scaled down to its CSS size, smoothly", () => {
    const id = celIcons[0]!;
    const f = (celIcon.frames as Record<string, { w: number; h: number }>)[id]!;
    const st = iconStyle(id)!;
    expect(st).toContain(`width:${f.w / celIcon.scale}px`);
    expect(st).toContain(`background-size:${celIcon.size.w / celIcon.scale}px ${celIcon.size.h / celIcon.scale}px`);
    expect(st).toContain("image-rendering:auto");
  });

  test("a cel monster breathes instead of playing the pixel idle loop", () => {
    const st = monsterStyle(celMonsters[0]!)!;
    expect(st).toContain("cel-breathe");
    expect(st).not.toContain("animation:idle-");
  });

  test("keys without a cel frame fall back to the pixel atlas", () => {
    if (pixelOnlyIcon) expect(iconStyle(pixelOnlyIcon)).not.toContain("background-size");
    if (pixelOnlyMonster) expect(monsterStyle(pixelOnlyMonster)).not.toContain("cel-breathe");
    expect(frameStyle("icon", "no-such-item")).toBeNull();
  });

  test("the pixel set ignores cel frames", () => {
    setArtSet("pixel");
    expect(iconStyle(celIcons[0]!)).not.toContain("background-size");
    expect(monsterStyle(celMonsters[0]!)).not.toContain("cel-breathe");
  });
});
