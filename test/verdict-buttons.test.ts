// seyh.5 / D109: the main button follows the verdict (route card, fight sheet, packing
// Embark), orange means "you win but it costs potions", and each side's damage PER HIT
// is shown — never the margin.
import { describe, expect, test } from "bun:test";
import { emptyLoadout } from "../src/engine/loadout";
import { newGame } from "../src/engine/town";
import { reduce } from "../src/engine/reduce";
import { rollBiome } from "../src/engine/grid";
import type { Action, Expedition, GameState, Loadout } from "../src/engine/types";
import {
  combatForecast, engagementForecast, preFightVerdict, engagementVerdict, preFightHits, engagementHits, hitLabel,
  verdictRoles, roleClass, worstVerdict,
} from "../src/render/render";
import { MONSTER_TIER_HP_CURVE, AUTO_POTION_THRESHOLD, PLAYER_BASE_HP } from "../src/data/constants";
import { fightSheet } from "../src/web/fight-view";
import { expeditionView } from "../src/web/expedition-view";
import { townView, embarkButton, riskyStart } from "../src/web/town-view";
import { mapWithMonster } from "./helpers";

const sword = (potions: Loadout["potions"] = []): Loadout => {
  const lo = emptyLoadout();
  lo.equipment.weapon = "sword";
  lo.potions = potions;
  return lo;
};
const POTS = [{ defId: "potion", qty: 2 }];

describe("orange = costs consumables (D109)", () => {
  // sword vs forest-boar: 3 strikes to kill, it hits 4 after strikes 1 and 2 → −8 HP.
  // From 20 HP: 20 → 16 → 12, and 12 ≤ AUTO_POTION_THRESHOLD × base (15) → a potion goes.
  test("a bare-race win that dips under the auto-quaff threshold is orange", () => {
    expect(AUTO_POTION_THRESHOLD * PLAYER_BASE_HP).toBeGreaterThanOrEqual(12);
    expect(combatForecast(sword(), "forest-boar", 20).winning).toBe(true);
    expect(preFightVerdict(sword(POTS), "forest-boar", 20)).toBe("costly");
    // …green with nothing to drink, or with auto-quaff off (nothing is drunk for you)
    expect(preFightVerdict(sword(), "forest-boar", 20)).toBe("win");
    expect(preFightVerdict(sword(POTS), "forest-boar", 20, undefined, 1, undefined, false)).toBe("win");
  });
  test("a win that never dips stays green even with potions packed", () => {
    expect(preFightVerdict(sword(POTS), "forest-boar", 30)).toBe("win"); // 30 → 22, above 15
  });
  test("auto-quaff off doesn't hide a potion-only win: still orange (you can drink)", () => {
    expect(preFightVerdict(sword(POTS), "forest-boar", 8, undefined, 1, undefined, false)).toBe("costly");
  });
  test("mid-fight reads the expedition's auto-quaff setting", () => {
    const e: Expedition = {
      mapSeed: "m", pos: { x: 0, y: 0 }, energy: 100, hp: 20, loadout: sword(POTS), carry: [], cleared: [],
      combat: { at: { x: 1, y: 1 }, creature: "forest-boar", monsterHp: MONSTER_TIER_HP_CURVE[1]!, moveOnWin: true, damageAdd: 0, mitigationAdd: 0, startHp: 20, potionsUsed: 0 },
    };
    expect(engagementVerdict(e)).toBe("costly");
    expect(engagementVerdict({ ...e, autoQuaff: false })).toBe("win");
  });
});

describe("damage per hit (D109) — numbers, never the margin", () => {
  test("pre-fight: the forecast's per-strike numbers, ? for a side you can't yet read", () => {
    const f = combatForecast(sword(), "forest-boar", 30);
    expect(preFightHits(sword(), "forest-boar", undefined, 1, { dmgType: "melee", armourType: "light" })).toEqual({ you: f.dmgOut, it: f.dmgIn });
    expect(preFightHits(sword(), "forest-boar", undefined, 1, null)).toEqual({ you: null, it: null });
    expect(preFightHits(sword(), "forest-boar", undefined, 1, { armourType: "light" })).toEqual({ you: f.dmgOut, it: null });
  });
  test("mid-fight: the live forecast (battle-item adds included)", () => {
    const e: Expedition = {
      mapSeed: "m", pos: { x: 0, y: 0 }, energy: 100, hp: 30, loadout: sword(), carry: [], cleared: [],
      combat: { at: { x: 1, y: 1 }, creature: "forest-boar", monsterHp: 5, moveOnWin: true, damageAdd: 1, mitigationAdd: 0, startHp: 30, potionsUsed: 0 },
    };
    const f = engagementForecast(e);
    expect(engagementHits(e)).toEqual({ you: f.dmgOut, it: f.dmgIn });
  });
  test("copy", () => {
    expect(hitLabel(3.75)).toBe("3.8 a hit");
    expect(hitLabel(4)).toBe("4 a hit");
    expect(hitLabel(null)).toBe("? a hit");
  });
});

describe("verdict → button roles", () => {
  test("win: go is gold primary · costly: amber primary · lose: go secondary, the way out is primary", () => {
    expect(verdictRoles("win")).toEqual({ go: "primary", safe: "secondary" });
    expect(verdictRoles("costly")).toEqual({ go: "amber", safe: "secondary" });
    expect(verdictRoles("lose")).toEqual({ go: "secondary", safe: "primary" });
    expect(verdictRoles(null)).toEqual({ go: "primary", safe: "secondary" }); // a plain walk
    expect(roleClass("primary")).toBe("primary");
    expect(roleClass("amber")).toBe("primary amber");
    expect(roleClass("secondary")).toBe("");
  });
  test("the worst verdict on a route wins", () => {
    expect(worstVerdict(null, undefined)).toBeNull();
    expect(worstVerdict("win", null)).toBe("win");
    expect(worstVerdict("win", "costly")).toBe("costly");
    expect(worstVerdict("costly", "lose", "win")).toBe("lose");
  });
});

// --- views ------------------------------------------------------------------------
const btn = (html: string, attr: string) => new RegExp(`<button[^>]*${attr}[^>]*>`).exec(html)?.[0] ?? "";
const isPrimary = (tag: string) => /class="[^"]*\bprimary\b/.test(tag);

describe("fightSheet follows the verdict", () => {
  const legal: Action[] = [{ type: "fight" }, { type: "flee" }, { type: "quaff" }];
  const exp = (hp: number, potions: Loadout["potions"] = []): Expedition => ({
    mapSeed: "m", pos: { x: 0, y: 0 }, energy: 100, hp, loadout: sword(potions), carry: [], cleared: [],
    combat: { at: { x: 1, y: 1 }, creature: "forest-boar", monsterHp: MONSTER_TIER_HP_CURVE[1]!, moveOnWin: true, damageAdd: 0, mitigationAdd: 0, startHp: hp, potionsUsed: 0 },
  });
  test("lose: Flee is the primary and leads; Fight is secondary", () => {
    const e = exp(8);
    expect(engagementVerdict(e)).toBe("lose");
    const html = fightSheet(e, legal);
    expect(isPrimary(btn(html, 'data-act="flee"'))).toBe(true);
    expect(isPrimary(btn(html, 'data-act="fight"'))).toBe(false);
    expect(html.indexOf('data-act="flee"')).toBeLessThan(html.indexOf('data-act="fight"'));
  });
  test("costly: Fight stays primary but amber, Quaff is highlighted", () => {
    const e = exp(8, POTS);
    expect(engagementVerdict(e)).toBe("costly");
    const html = fightSheet(e, legal);
    expect(btn(html, 'data-act="fight"')).toContain('class="primary amber"');
    expect(btn(html, 'data-act="quaff"')).toContain('class="hl"');
    expect(isPrimary(btn(html, 'data-act="flee"'))).toBe(false);
  });
  test("win: Fight is the gold primary; both sides show a damage number, no HP projection", () => {
    const e = exp(30);
    const html = fightSheet(e, legal);
    expect(btn(html, 'data-act="fight"')).toContain('class="primary"');
    const f = engagementForecast(e);
    expect(html).toContain(hitLabel(f.dmgOut));
    expect(html).toContain(hitLabel(f.dmgIn));
    expect(html).not.toContain("hpspend");
  });
});

describe("the route card follows the verdict", () => {
  // Stand next to a forest boar and plan a one-step route onto it.
  const { seed, grid, poi } = mapWithMonster("seyh5", "forest-boar");
  const state = (hp: number, lo: Loadout): { s: GameState; from: { x: number; y: number } } => {
    const g = newGame("seyh5");
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
      const from = { x: poi.x + dx, y: poi.y + dy };
      if (from.x < 0 || from.y < 0 || from.y >= grid.terrain.length || from.x >= grid.terrain[0]!.length) continue;
      if (grid.pois.some((p) => p.x === from.x && p.y === from.y)) continue;
      const s: GameState = { ...g, phase: "expedition", expedition: { mapSeed: seed, biomeId: rollBiome(seed), pos: from, energy: 200, hp, loadout: lo, carry: [], cleared: [] } };
      if (!/routebar blocked/.test(expeditionView(s, [{ x: poi.x, y: poi.y }], { drawerOpen: false, tab: "here", logHtml: "" }))) return { s, from };
    }
    throw new Error("no walkable neighbour");
  };
  const view = (hp: number, lo: Loadout) => expeditionView(state(hp, lo).s, [{ x: poi.x, y: poi.y }], { drawerOpen: false, tab: "here", logHtml: "" });
  test("lose: Fight ▶ lacks .primary and ✕ Cancel route is the filled primary", () => {
    expect(preFightVerdict(sword(), "forest-boar", 8)).toBe("lose");
    const html = view(8, sword());
    expect(isPrimary(btn(html, "data-walk"))).toBe(false);
    expect(btn(html, "data-cancelpath")).toContain('class="primary"');
    expect(html).toContain("✕ Cancel route");
  });
  test("costly: Fight ▶ stays primary, amber", () => {
    expect(btn(view(8, sword(POTS)), "data-walk")).toContain('class="primary amber"');
  });
  test("win: Fight ▶ is the gold primary; the cancel is the plain ✕", () => {
    const html = view(30, sword());
    expect(btn(html, "data-walk")).toContain('class="primary"');
    expect(isPrimary(btn(html, "data-cancelpath"))).toBe(false);
    expect(html).toContain('class="fill spend'); // control: a walkable route DOES project its spend
  });
  test("a blocked route projects no energy spend", () => {
    // Find a route that hits a wall: any impassable tile on this map, reached from the entry.
    const g = newGame("seyh5");
    const s0: GameState = { ...g, phase: "expedition", expedition: { mapSeed: seed, biomeId: rollBiome(seed), pos: { x: 17, y: 17 }, energy: 200, hp: 30, loadout: sword(), carry: [], cleared: [] } };
    let html = "";
    outer: for (let y = 0; y < grid.terrain.length; y++) for (let x = 0; x < grid.terrain[0]!.length; x++) {
      const h = expeditionView(s0, [{ x, y }], { drawerOpen: false, tab: "here", logHtml: "" });
      if (/routebar blocked/.test(h)) { html = h; break outer; }
    }
    expect(html).not.toBe("");
    expect(html).not.toContain('class="fill spend');
    expect(html).not.toMatch(/⚡ Energy<\/span><div class="track">[^]*?→ <b/);
  });
});

describe("packing: a risky start demotes Embark and asks first", () => {
  test("riskyStart: no food / bag full", () => {
    const lo = newGame("seyh5").loadout;
    expect(riskyStart({ ...lo, food: [] })).toContain("no food");
    expect(riskyStart({ ...lo, food: [{ defId: "ration", qty: 1 }] })).not.toContain("no food");
  });
  test("embarkButton: safe = gold data-embark; risky = secondary data-embark-confirm; confirming = two buttons", () => {
    expect(embarkButton("m", true, [], false)).toContain('class="embark-final" data-embark="m"');
    const risky = embarkButton("m", true, ["bag full before you start"], false);
    expect(risky).toContain("data-embark-confirm");
    expect(risky).toContain("risky");
    expect(risky).not.toContain('data-embark="m"');
    const confirm = embarkButton("m", true, ["bag full before you start"], true);
    expect(confirm).toContain("Embark anyway?");
    expect(confirm).toContain('data-embark="m"');
    expect(confirm).toContain("data-embark-cancel");
  });
  test("the rendered sheet: no food → first tap is a confirm, the confirm state carries the real embark", () => {
    const s: GameState = { ...newGame("seyh5-pack"), bank: [] };
    const seedM = /data-prepare="([^"]+)"/.exec(townView(s, null, false))![1]!;
    const lo = s.loadout;
    expect(riskyStart(lo).length).toBeGreaterThan(0); // a fresh game packs no food
    const first = townView(s, seedM, false);
    expect(first).toContain("data-embark-confirm");
    expect(first).not.toContain(`data-embark="${seedM}"`);
    const second = townView(s, seedM, false, "main", { embarkConfirm: true });
    expect(second).toContain(`data-embark="${seedM}"`);
    expect(reduce(s, { type: "embark", mapSeed: seedM }).events.some((e) => e.type === "action-rejected")).toBe(false);
  });
});
