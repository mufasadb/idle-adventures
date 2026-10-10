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

test("seyh.29: the HUD and drawer handle show a plain bag counter (slots used/max), HP is an integer over max, the Bag tab has no count", () => {
  const s = stateWith(50);
  const hurt: GameState = { ...s, expedition: { ...s.expedition!, hp: 26.6 } };
  const html = expeditionView(hurt, [], ui);
  // bare bag (6 slots), nothing packed → 0/6
  expect(html).toContain('<div class="hud-bag">Bag 0/6</div>');
  expect(html).toContain('<span class="bagcount">Bag 0/6</span>');
  expect(html).not.toMatch(/Haul|room for/);
  expect(html).toContain("<b>27/30</b>");
  expect(html).toContain('data-tab="bag">Bag</button>');
  // a full bag reads amber
  const full: GameState = { ...s, expedition: { ...s.expedition!, carry: Array.from({ length: 6 }, (_, i) => ({ defId: i % 2 ? "oak-log" : "iron-ore", qty: 1 })) } };
  const fh = expeditionView(full, [], ui);
  expect(fh).toContain('<div class="hud-bag amber">Bag 6/6</div>');
  expect(fh).toContain('<span class="bagcount amber">Bag 6/6</span>');
});

test("a route within budget shows no runs-dry note; the 🏠 button says 'head home', not 'free'", () => {
  const s = stateWith(50);
  const html = expeditionView(s, [{ x: START.x, y: START.y - 3 }], ui);
  expect(html).not.toContain("home is still free");
  expect(html).toContain('class="home-tag">head home<');
  expect(html).not.toContain(">free<");
});

// seyh.29 (D111): the route card shows the yield but no fit verdict; the pre-fight card
// shows the loot but no ✓/✗ (the "needs N free slots" warning stays).
test("seyh.29: a route over resolved copper veins shows the yield line without a fit verdict, and no '?' node label", () => {
  const seed = "yl-0"; // fixture from route-preview.test.ts: copper veins at (18,27), (15,25) from (17,27)
  const loadout = emptyLoadout(); loadout.equipment.tools = ["pick"];
  const exp: Expedition = { mapSeed: seed, pos: { x: 17, y: 27 }, energy: 300, maxEnergy: 300, hp: 30, loadout, carry: [], cleared: [] };
  const html = expeditionView({ seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp }, [{ x: 18, y: 27 }, { x: 15, y: 25 }], ui);
  expect(html).toMatch(/<div class="yieldline">→ .*Copper Ore \+\d+<\/div>/);
  expect(html).not.toMatch(/fits ✓|won't fit/);
  expect(html).not.toContain("→ ?");
  const off = expeditionView({ seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: { ...exp, autoGather: false } }, [{ x: 18, y: 27 }], ui);
  expect(off).not.toContain("yieldline");
});

test("seyh.29: the pre-fight card has no ✓/✗ fit mark; a tight bag still warns in words", () => {
  const s = stateWith(300);
  const exp = s.expedition!;
  const free = freeLootStacks(exp.loadout);
  const full = { ...exp, carry: Array.from({ length: free }, (_, i) => ({ defId: i % 2 ? "oak-log" : "iron-ore", qty: 5 })) };
  let at: { x: number; y: number } | null = null;
  for (let x = 0; x < 35 && !at; x++) if (preFightCard(s, full, "forest-boar", { x, y: 0 }, "win", null).includes("pf-bag")) at = { x, y: 0 };
  expect(at).not.toBeNull(); // some tile's roll drops loot that won't fit
  expect(preFightCard(s, exp, "forest-boar", at!, "win", null)).not.toMatch(/pf-fit|✓|✗/);
  const tight = preFightCard(s, full, "forest-boar", at!, "win", null);
  expect(tight).not.toMatch(/pf-fit|✓|✗/);
  expect(tight).toContain("⚠ needs");
});

// seyh.29 (D111): a slow or blocked route shows the helping gear as icons, never by name:
// a silhouette until you own one, coloured once it's in your bank.
function besideTerrain(want: "mud" | "mountain"): { seed: string; from: { x: number; y: number }; to: { x: number; y: number } } {
  for (let i = 0; i < 200; i++) {
    const seed = `sil-${i}`;
    const g = generateGrid(seed, rollBiome(seed));
    for (let y = 1; y < 34; y++) for (let x = 1; x < 34; x++) {
      if (g.terrain[y]![x] !== "plains" || g.terrain[y]![x + 1] !== want) continue;
      if (g.pois.some((p) => (p.x === x || p.x === x + 1) && p.y === y)) continue;
      return { seed, from: { x, y }, to: { x: x + 1, y } };
    }
  }
  throw new Error(`no plains beside ${want}`);
}
test("seyh.29: slow ground shows gear silhouettes, coloured once owned; blocked ground the same; no gear named", () => {
  const mud = besideTerrain("mud");
  const exp: Expedition = { mapSeed: mud.seed, pos: mud.from, energy: 300, maxEnergy: 300, hp: 30, loadout: emptyLoadout(), carry: [], cleared: [], autoGather: false };
  const base: GameState = { seed: "s", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition: exp };
  const html = expeditionView(base, [mud.to], ui);
  expect(html).toContain("slower going through the mud");
  expect(html).toContain('class="gear-sil" data-gear="waders"');
  expect(html).not.toMatch(/speed it up|gets you across/);
  const owned = expeditionView({ ...base, bank: [{ defId: "waders", qty: 1 }] }, [mud.to], ui);
  expect(owned).toContain('class="gear-sil owned" data-gear="waders"');
  const mtn = besideTerrain("mountain");
  const bexp = { ...exp, mapSeed: mtn.seed, pos: mtn.from };
  const blocked = expeditionView({ ...base, expedition: bexp }, [mtn.to], ui);
  expect(blocked).toContain("The mountains block this path.");
  expect(blocked).toContain('class="gear-sil" data-gear="climbing-pick"');
  expect(blocked).not.toMatch(/only a climbing pick/);
});
