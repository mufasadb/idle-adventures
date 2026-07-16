import { test, expect } from "bun:test";
import { townActions, expeditionActions, legalActions } from "../src/sim/legal";
import { reduce } from "../src/engine/reduce";
import { newGame, localMap } from "../src/engine/town";
const OFFER_S = localMap("s", 0).mapSeed; // the free local map for seed "s" (9u9.3)
import { play } from "../src/sim/play";
import { generateGrid, rollBiome } from "../src/engine/grid";
import type { Poi } from "../src/engine/grid";
import { emptyLoadout } from "../src/engine/loadout";
import { MATERIAL_GATE } from "../src/data/constants";
import type { Action, GameState } from "../src/engine/types";

const accepts = (state: GameState, action: Action) =>
  reduce(state, action).events.every((e) => e.type !== "action-rejected");

test("townActions: offers pack + embark on a fresh game, never move/gather", () => {
  const state = newGame("s");
  const actions = townActions(state);
  expect(actions.length).toBeGreaterThan(0);
  // every offered action is genuinely accepted by reduce (D29: no drift)
  for (const a of actions) expect(accepts(state, a)).toBe(true);
  // packing a starter item is offered — a fresh bank is FOOD only now (xls/9az
  // bootstrap: no pre-made tools; you knap those your first run), so the packable
  // starter is the ration, not a tool.
  expect(actions).toContainEqual({ type: "pack", slot: "food", itemId: "ration" });
  // embark on the free local map is offered
  expect(actions).toContainEqual({ type: "embark", mapSeed: localMap("s", 0).mapSeed });
  // no expedition-only actions leak in
  expect(actions.some((a) => a.type === "move" || a.type === "gather" || a.type === "return")).toBe(false);
});

// pocket-map is retired (zpm.1): it's removed from the Action union, so the
// compiler itself guarantees townActions can never emit it — no runtime assert
// needed (checking `a.type === "pocket-map"` is now a type error). This test pins
// that town offers embark on the free local map AND each held (drop-earned) map.
test("townActions: offers embark on the free local map + each held map (zpm.1)", () => {
  const state = newGame("s");
  const town = townActions(state);
  // the free local map is embarkable
  expect(town).toContainEqual({ type: "embark", mapSeed: localMap("s", 0).mapSeed });
  // a held (drop-earned) map is also embarkable
  const withHeld: GameState = { ...state, maps: [{ mapSeed: "s:drop:1", biomeId: "woodland", vintage: 0, tier: 2 }] };
  const after = townActions(withHeld);
  expect(after).toContainEqual({ type: "embark", mapSeed: "s:drop:1" });
  for (const a of after) expect(accepts(withHeld, a)).toBe(true); // D29: no drift
});

test("townActions: empty when not in town", () => {
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: OFFER_S },
  ]).state;
  expect(townActions(onMap)).toEqual([]);
});

test("expeditionActions: offers return (always) + some moves, never craft/pack", () => {
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: OFFER_S },
  ]).state;
  const actions = expeditionActions(onMap);
  for (const a of actions) expect(accepts(onMap, a)).toBe(true);
  expect(actions).toContainEqual({ type: "return" }); // legal here (un-engaged); engaged, return rejects and flee is the out (D43)
  expect(actions.some((a) => a.type === "move")).toBe(true); // at least one legal neighbour
  expect(actions.some((a) => a.type === "craft" || a.type === "pack")).toBe(false);
});

test("expeditionActions: return is offered even at zero energy (never a dead end, un-engaged)", () => {
  // Drain to a genuine 0 (stamina model, dtv): moves are all unaffordable and
  // (with no food to eat back) return must still stand. (Un-engaged only — while
  // engaged, return rejects and flee is the always-available out, D43.)
  const embarked = play("s", [{ type: "embark", mapSeed: OFFER_S }]).state;
  const zero: GameState = { ...embarked, expedition: { ...embarked.expedition!, energy: 0, loadout: { ...embarked.expedition!.loadout, food: [] } } };
  expect(expeditionActions(zero)).toContainEqual({ type: "return" });
});

test("expeditionActions: empty when not on expedition", () => {
  expect(expeditionActions(newGame("s"))).toEqual([]);
});

test("legalActions: dispatches by phase", () => {
  const town = newGame("s");
  expect(legalActions(town)).toEqual(townActions(town));
  const onMap = play("s", [
    { type: "pack", slot: "food", itemId: "ration" },
    { type: "embark", mapSeed: OFFER_S },
  ]).state;
  expect(legalActions(onMap)).toEqual(expeditionActions(onMap));
});

// Access gate (D78): a node whose material is gated by a tool you lack is "visible
// but locked" — legalActions must NOT offer gather there. This is the D29 "free"
// property: no parallel logic, the speculative reduce filters it.
test("expeditionActions: an access-locked node is not offered gather (D29 free)", () => {
  // find a gated gatherable node
  let seed = "";
  let poi: Poi | undefined;
  for (let i = 0; i < 300 && !poi; i++) {
    const s = `lock-${i}`;
    const g = generateGrid(s, rollBiome(s));
    poi = g.pois.find((p) => p.material !== null && p.material in MATERIAL_GATE);
    if (poi) seed = s;
  }
  expect(poi).toBeTruthy();
  const loadout = emptyLoadout();
  loadout.equipment.tools = ["pick", "axe", "knife"]; // only base tools — lack every gate key
  const state: GameState = {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: { mapSeed: seed, pos: { x: poi!.x, y: poi!.y }, energy: 100, hp: 30, loadout, carry: [], cleared: [] },
  };
  const actions = expeditionActions(state);
  for (const a of actions) expect(accepts(state, a)).toBe(true); // nothing offered is rejected
  expect(actions.some((a) => a.type === "gather")).toBe(false); // the locked node is not workable
});

// D83: hunting's trap+knife AND-gate must flow through legalActions for free (D29)
// — an animal node with only a knife is NOT offered gather; add the trap and it is.
test("expeditionActions: an animal node needs trap AND knife to be offered gather (D83)", () => {
  let seed = "";
  let poi: Poi | undefined;
  for (let i = 0; i < 300 && !poi; i++) {
    const s = `hunt-${i}`;
    const g = generateGrid(s, rollBiome(s));
    poi = g.pois.find((p) => p.kind === "animal" && p.material !== null && !(p.material in MATERIAL_GATE));
    if (poi) seed = s;
  }
  expect(poi).toBeTruthy();
  const mk = (tools: string[]): GameState => {
    const loadout = emptyLoadout();
    loadout.equipment.tools = tools;
    return {
      seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
      expedition: { mapSeed: seed, pos: { x: poi!.x, y: poi!.y }, energy: 100, hp: 30, loadout, carry: [], cleared: [] },
    };
  };
  const knifeOnly = mk(["knife"]);
  for (const a of expeditionActions(knifeOnly)) expect(accepts(knifeOnly, a)).toBe(true);
  expect(expeditionActions(knifeOnly).some((a) => a.type === "gather")).toBe(false); // no trap → not workable
  const both = mk(["knife", "trap"]);
  expect(expeditionActions(both).some((a) => a.type === "gather")).toBe(true); // trap + knife → offered
});

test("expeditionActions: drop-map offered per carried map (8ec)", () => {
  const onMap = play("s", [{ type: "embark", mapSeed: OFFER_S }]).state;
  const withMap: GameState = {
    ...onMap,
    expedition: {
      ...onMap.expedition!,
      carriedMaps: [{ mapSeed: "lm-1", biomeId: "desert", vintage: 0 }],
    },
  };
  const actions = expeditionActions(withMap);
  expect(actions).toContainEqual({ type: "drop-map", mapSeed: "lm-1" });
  expect(expeditionActions(onMap).some((a) => a.type === "drop-map")).toBe(false);
});

// Engaged legalActions (si7.1, D43): while engaged, flee is the ALWAYS-available
// out — return, move, gather, eat, drop, drop-map must all disappear. This pins
// that claim at the surface drivers actually consume (legalActions), not just at
// the reducer's rejection behaviour (engagement.test.ts covers that separately).
test("legalActions: engaged offers flee + quaff + toggle-auto-quaff, never move/gather/eat/return/drop/drop-map", () => {
  let seed = "";
  let poi: Poi | undefined;
  for (let i = 0; i < 400 && !poi; i++) {
    const s = `legal-eng-${i}`;
    const g = generateGrid(s, rollBiome(s));
    poi = g.pois.find((p) => p.kind === "monster" && p.creature !== null);
    if (poi) seed = s;
  }
  expect(poi).toBeTruthy();
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.potions = [{ defId: "potion", qty: 1 }];
  const stood: GameState = {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed, pos: { x: poi!.x, y: poi!.y }, energy: 300,
      hp: 15, loadout, carry: [], cleared: [],
    },
  };
  const engaged = reduce(stood, { type: "fight" }).state; // one fight call: engage, no exchange yet
  expect(engaged.expedition!.combat).toBeDefined();

  const actions = legalActions(engaged);
  expect(actions).toContainEqual({ type: "flee" });
  expect(actions).toContainEqual({ type: "quaff" });
  expect(actions).toContainEqual({ type: "toggle-auto-quaff" });
  const forbidden = ["move", "gather", "eat", "return", "drop", "drop-map"];
  for (const a of actions) expect(forbidden).not.toContain(a.type);
  // D29 acceptance check: everything legalActions offers, reduce genuinely accepts
  for (const a of actions) expect(accepts(engaged, a)).toBe(true);
});
