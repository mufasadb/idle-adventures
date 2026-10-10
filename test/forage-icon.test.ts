// seyh.32: a perceived forage node draws its material's ITEM ICON (flint shows the
// flint icon), not the pale letter "f" the map used to fall back to.
import { test, expect } from "bun:test";
import { expeditionView } from "../src/web/expedition-view";
import { iconStyle } from "../src/web/assets";
import { generateGrid } from "../src/engine/grid";
import { emptyLoadout } from "../src/engine/loadout";
import { perceive } from "../src/engine/perceive";
import type { Expedition, GameState } from "../src/engine/types";

const ui = { drawerOpen: false, tab: "here" as const, logHtml: "" };

// Scan woodland maps for a flint forage node with a walkable neighbour to stand on.
function flintFixture(): { exp: Expedition; at: { x: number; y: number } } {
  for (let i = 0; i < 200; i++) {
    const mapSeed = `fi-${i}`;
    const grid = generateGrid(mapSeed, "woodland");
    for (const p of grid.pois) {
      if (p.kind !== "herb" || p.material !== "flint") continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const pos = { x: p.x + dx, y: p.y + dy };
        if (grid.pois.some((q) => q.x === pos.x && q.y === pos.y)) continue;
        if (!["plains", "mud", "ice"].includes(grid.terrain[pos.y]?.[pos.x] ?? "")) continue;
        const exp: Expedition = { mapSeed, biomeId: "woodland", pos, energy: 100, maxEnergy: 100, hp: 30, loadout: emptyLoadout(), carry: [], cleared: [] };
        return { exp, at: { x: p.x, y: p.y } };
      }
    }
  }
  throw new Error("no flint fixture");
}

test("a perceived flint node renders the flint icon, not the letter 'f'", () => {
  const { exp, at } = flintFixture();
  const state: GameState = { seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp };
  // premise: standing next to it, the node is resolved as flint
  expect(perceive(generateGrid(exp.mapSeed, "woodland"), exp.pos, []).find((n) => n.x === at.x && n.y === at.y)?.detail?.material).toBe("flint");
  const html = expeditionView(state, [], ui);
  const tile = html.match(new RegExp(`<div class="[^"]*"[^>]*data-x="${at.x}" data-y="${at.y}"[^>]*>(.*?)</div>`))?.[1];
  expect(tile).toBeDefined();
  const flint = iconStyle("flint")!;
  expect(flint).not.toBeNull(); // the atlas has a flint frame
  expect(tile).toContain(`<span class="nodeicon" style="${flint}"`);
  expect(tile).not.toMatch(/>f$/); // no letter glyph after the icon
});
