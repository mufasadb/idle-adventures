// seyh.1: coming home — the pure summary the web strip draws (render.homecomingSummary).
// Haul = exactly the carry + carried maps at the run's end (not the supplies that banked
// back); unspent = the energy you still had; new recipes = known at return minus known
// at embark (the D104 fog's "next" flips when you first hold an input).
import { describe, expect, test } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { RECIPE, MATERIAL_GATE, PLAYER_BASE_HP } from "../src/data/constants";
import { STARTER_RECIPES } from "../src/data/research";
import type { GameState } from "../src/engine/types";
import { homecomingSummary, homecomingLine, knownRecipeIds } from "../src/render/render";
import { recipeKnowledge } from "../src/engine/knowledge";
import { scanForPoi, standingOn, mapWithMonster, fightToEnd } from "./helpers";

const woodNode = () => scanForPoi("seyh1-wood", (p) => p.kind === "wood" && p.material !== null && !(p.material in MATERIAL_GATE));

describe("homecomingSummary", () => {
  test("a voluntary return: haul = the carry (stacks summed per item) + carried maps; unspent = energy at return", () => {
    const { seed, poi } = woodNode();
    const s0 = standingOn(seed, poi, { tools: ["axe"], energy: 250, food: [{ defId: "ration", qty: 2 }] });
    const g = reduce(s0, { type: "gather" });
    expect(g.events.some((e) => e.type === "gathered")).toBe(true);
    const before: GameState = { ...g.state, expedition: { ...g.state.expedition!,
      carry: [...g.state.expedition!.carry, { defId: "salt", qty: 5 }, { defId: "salt", qty: 2 }],
      carriedMaps: [{ mapSeed: "m-1", biomeId: "woodland", vintage: 0 }],
    } };
    const r = reduce(before, { type: "return" });
    const h = homecomingSummary(before, r.events, r.state)!;
    expect(h).not.toBeNull();
    const exp = before.expedition!;
    // every carried stack, summed per defId, in first-carried order — and nothing else
    const want = new Map<string, number>();
    for (const s of exp.carry) want.set(s.defId, (want.get(s.defId) ?? 0) + s.qty);
    expect(h.haul).toEqual([...want].map(([defId, qty]) => ({ defId, qty })));
    expect(h.haul.find((s) => s.defId === "salt")!.qty).toBe(7);
    expect(h.haul.some((s) => s.defId === "ration" || s.defId === "axe")).toBe(false); // supplies/tools bank back, they aren't haul
    expect(h.maps).toEqual(exp.carriedMaps!);
    expect(h.unspent).toBe(exp.energy);
    expect(h.defeated).toBe(false);
    // the haul really is what landed in the bank
    for (const s of h.haul) expect(r.state.bank.find((b) => b.defId === s.defId)?.qty ?? 0).toBeGreaterThanOrEqual(s.qty);
  });

  test("new recipes: exactly those whose fog flipped from not-known (at embark) to known (at return)", () => {
    const { seed, poi } = woodNode();
    const mat = poi.material!;
    // Everything the recipe book asks for has been held EXCEPT this node's material, so a
    // recipe that needs it flips to "next" the moment it's gathered.
    const allInputs = new Set(Object.values(RECIPE).flatMap((r) => r.inputs.map((i) => i.defId)));
    const seen = [...allInputs].filter((d) => d !== mat);
    const s0: GameState = { ...standingOn(seed, poi, { tools: ["axe"], energy: 250 }), recipeFog: true, seen };
    const atEmbark = knownRecipeIds(s0);
    const g = reduce(s0, { type: "gather" });
    const r = reduce(g.state, { type: "return" });
    const h = homecomingSummary(g.state, r.events, r.state, atEmbark)!;
    const knownAfter = recipeKnowledge(r.state).filter((k) => k.status === "known").map((k) => k.recipeId);
    expect(h.newRecipes).toEqual(knownAfter.filter((id) => !atEmbark.includes(id)));
    expect(h.newRecipes.length).toBeGreaterThan(0); // non-vacuous: the gather unlocked something
    for (const id of h.newRecipes) {
      expect(RECIPE[id]!.inputs.some((i) => i.defId === mat)).toBe(true);
      expect(STARTER_RECIPES).not.toContain(id);
    }
    // without the embark snapshot the fallback diffs against the last expedition state,
    // which already held the material — nothing reads as new
    expect(homecomingSummary(g.state, r.events, r.state)!.newRecipes).toEqual([]);
    // fog off: everything is always known, so nothing is ever new
    const off = standingOn(seed, poi, { tools: ["axe"] });
    const ro = reduce(off, { type: "return" });
    expect(homecomingSummary(off, ro.events, ro.state, knownRecipeIds(off))!.newRecipes).toEqual([]);
  });

  test("a defeat (soft fail) is summarised too, as a defeat — the carry still came home", () => {
    const { seed, poi } = mapWithMonster("seyh1-defeat");
    const before: GameState = {
      ...standingOn(seed, poi, { energy: 120, hp: 3 }), // naked, 3 HP: loses to any T1 monster
    };
    before.expedition!.carry = [{ defId: "silver-ore", qty: 3 }];
    // engage, then fight it out; the summary reads the state just before the final blow
    let s = reduce(before, { type: "fight" });
    let prev = before;
    let guard = 0;
    while (s.state.expedition?.combat && ++guard < 100) { prev = s.state; s = reduce(s.state, { type: "fight" }); }
    expect(s.state.phase).toBe("town");
    const h = homecomingSummary(prev, s.events, s.state)!;
    expect(h.defeated).toBe(true);
    expect(h.haul).toEqual([{ defId: "silver-ore", qty: 3 }]);
    expect(h.unspent).toBe(prev.expedition!.energy);
    expect(homecomingLine(h, (d) => d)).toBe(`Beaten and dragged home with 3× silver-ore · ${h.unspent}e unspent`);
    expect(fightToEnd(before).state.phase).toBe("town"); // the shared helper agrees it's a loss
    expect(PLAYER_BASE_HP).toBeGreaterThan(3);
  });

  test("no run end, no summary; the line handles empty-handed and every-energy-spent", () => {
    const { seed, poi } = woodNode();
    const s0 = standingOn(seed, poi, { tools: ["axe"], energy: 250 });
    const g = reduce(s0, { type: "gather" });
    expect(homecomingSummary(s0, g.events, g.state)).toBeNull();
    const empty: GameState = { ...s0, expedition: { ...s0.expedition!, energy: 0 } };
    const r = reduce(empty, { type: "return" });
    const h = homecomingSummary(empty, r.events, r.state)!;
    expect(h.haul).toEqual([]);
    expect(homecomingLine(h, (d) => d)).toBe("Home empty-handed · every e spent");
  });
});
