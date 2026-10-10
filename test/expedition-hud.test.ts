// The expedition HUD (seyh.3): a route that runs dry is amber, never "strands you".
// Running dry only ends the gathering; home is free from anywhere (D62, D108).
import { test, expect } from "bun:test";
import { expeditionView } from "../src/web/expedition-view";
import { deriveRoute } from "../src/web/route";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { emptyLoadout } from "../src/engine/loadout";
import type { Expedition, GameState } from "../src/engine/types";

// Same fixture as route-preview.test.ts: map "rp-0", x=3 is a straight plains run north
// from y=34 at 10 energy a step, no POIs on the line.
const SEED = "rp-0";
const START = { x: 3, y: 34 };
const ui = { drawerOpen: false, tab: "here" as const, logHtml: "" };

function stateWith(energy: number): GameState {
  const exp: Expedition = { mapSeed: SEED, pos: { ...START }, energy, maxEnergy: 300, hp: 30, loadout: emptyLoadout(), carry: [], cleared: [], autoGather: false };
  return { seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp };
}

test("a route that runs dry reads amber 'home is still free', no 'strands', Walk enabled", () => {
  const s = stateWith(50);
  const route = [{ x: START.x, y: START.y - 20 }]; // 200 energy of walking on 50
  const grid = generateGrid(SEED, rollBiome(SEED));
  expect(deriveRoute(grid, s.expedition!, route, new Set(), new Set()).runsDry).toBe(true);
  const html = expeditionView(s, route, ui);
  expect(html).toContain("home is still free");
  expect(html).toContain("hud-note amber");
  expect(html).not.toMatch(/strand/i);
  expect(html).toMatch(/<button class="primary" data-walk>/); // not disabled: walking until dry is legal
});

test("seyh.2: the HUD and drawer handle show the haul phrase, HP is an integer over max, the Bag tab has no count", () => {
  const s = stateWith(50);
  const hurt: GameState = { ...s, expedition: { ...s.expedition!, hp: 26.6 } };
  const html = expeditionView(hurt, [], ui);
  // bare bag (6 slots), nothing packed → 6 free × 5 = 30
  expect(html).toContain('<div class="hud-haul">Haul 0 · room for 30</div>');
  expect(html).toContain('<span class="bagcount">Haul 0 · room for 30</span>');
  expect(html).toContain("<b>27/30</b>");
  expect(html).toContain('data-tab="bag">Bag</button>');
});

test("a route within budget shows no runs-dry note; the 🏠 button says it's free", () => {
  const s = stateWith(50);
  const html = expeditionView(s, [{ x: START.x, y: START.y - 3 }], ui);
  expect(html).not.toContain("home is still free");
  expect(html).toContain('class="home-free">free<');
});
