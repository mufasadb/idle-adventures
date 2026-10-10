// The expedition HUD (seyh.3): a route that runs dry is amber, never "strands you".
// Running dry only ends the gathering; home is free from anywhere (D62, D108).
import { test, expect } from "bun:test";
import { expeditionView } from "../src/web/expedition-view";
import { deriveRoute } from "../src/web/route";
import { preFightCard } from "../src/web/fight-view";
import { freeLootStacks } from "../src/engine/carry";
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

// seyh.6: the route card says what the walk will gather and whether it fits; the
// pre-fight card always marks whether the loot fits (✓/✗), not only on overflow.
test("seyh.6: a route over resolved copper veins shows the yield line with 'fits ✓', and no '?' node label", () => {
  const seed = "yl-0"; // fixture from route-preview.test.ts: copper veins at (18,27), (15,25) from (17,27)
  const loadout = emptyLoadout(); loadout.equipment.tools = ["pick"];
  const exp: Expedition = { mapSeed: seed, pos: { x: 17, y: 27 }, energy: 300, maxEnergy: 300, hp: 30, loadout, carry: [], cleared: [] };
  const html = expeditionView({ seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp }, [{ x: 18, y: 27 }, { x: 15, y: 25 }], ui);
  expect(html).toMatch(/<div class="yieldline">→ .*Copper Ore \+\d+ · fits ✓<\/div>/);
  expect(html).not.toContain("→ ?");
  const off = expeditionView({ seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: { ...exp, autoGather: false } }, [{ x: 18, y: 27 }], ui);
  expect(off).not.toContain("yieldline");
});

test("seyh.6: the pre-fight card marks the loot ✓ when it fits and ✗ when it doesn't", () => {
  const s = stateWith(300);
  const exp = s.expedition!;
  let at: { x: number; y: number } | null = null;
  for (let x = 0; x < 35 && !at; x++) if (preFightCard(s, exp, "forest-boar", { x, y: 0 }, "win", null).includes("pf-fit")) at = { x, y: 0 };
  expect(at).not.toBeNull(); // some tile's roll drops loot
  expect(preFightCard(s, exp, "forest-boar", at!, "win", null)).toContain('class="pf-fit ok"');
  const free = freeLootStacks(exp.loadout);
  const full = { ...exp, carry: Array.from({ length: free }, (_, i) => ({ defId: i % 2 ? "oak-log" : "iron-ore", qty: 5 })) };
  expect(preFightCard(s, full, "forest-boar", at!, "win", null)).toContain('class="pf-fit no"');
});
