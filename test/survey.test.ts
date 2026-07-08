import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { perceive, visionRadius } from "../src/engine/perceive";
import { newGame } from "../src/engine/town";
import { SURVEY_ENERGY } from "../src/data/constants";
import type { GameState, GameEvent, Expedition } from "../src/engine/types";

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// A grid + a POI that sits BEYOND the spyglass's passive radius from entry.
function farPoi() {
  for (let i = 0; i < 200; i++) {
    const seed = `survey-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed));
    const far = grid.pois.find((p) => cheb(p, grid.entry) > visionRadius(["spyglass"]));
    if (far) return { seed, grid, entry: grid.entry, poi: far };
  }
  throw new Error("no far POI in scan range");
}

function stateAt(seed: string, pos: { x: number; y: number }, opts: { tools?: string[]; energy?: number; surveyed?: { x: number; y: number }[]; combat?: boolean } = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.equipment.tools = opts.tools ?? ["spyglass"];
  const expedition: Expedition = {
    mapSeed: seed, pos, energy: opts.energy ?? 300, hp: 30,
    loadout, carry: [], cleared: [],
    ...(opts.surveyed ? { surveyed: opts.surveyed } : {}),
    ...(opts.combat ? { combat: { at: pos, creature: "forest-boar", monsterHp: 8, moveOnWin: false, damageAdd: 0, mitigationAdd: 0, startHp: 30, potionsUsed: 0 } } : {}),
  };
  return { seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(), expedition };
}

test("perceive: a surveyed position resolves detail even beyond the passive radius", () => {
  const { grid, entry, poi } = farPoi();
  const passive = perceive(grid, entry, ["spyglass"]).find((p) => p.x === poi.x && p.y === poi.y);
  expect(passive!.detail).toBeNull(); // out of range
  const surveyed = perceive(grid, entry, ["spyglass"], [{ x: poi.x, y: poi.y }]).find((p) => p.x === poi.x && p.y === poi.y);
  expect(surveyed!.detail).not.toBeNull(); // survey pulls it into focus
});

test("perceive: signature is backward-compatible (no surveyed arg = old behaviour)", () => {
  const { grid, entry, poi } = farPoi();
  const out = perceive(grid, entry, ["spyglass"]).find((p) => p.x === poi.x && p.y === poi.y);
  expect(out!.detail).toBeNull();
});

test("survey resolves a far POI, records it, costs SURVEY_ENERGY", () => {
  const { seed, grid, entry, poi } = farPoi();
  const s0 = stateAt(seed, entry);
  const { state, events } = reduce(s0, { type: "survey", at: { x: poi.x, y: poi.y } });
  const ev = events.find((e) => e.type === "surveyed") as Extract<GameEvent, { type: "surveyed" }>;
  expect(ev).toBeDefined();
  expect(ev.at).toEqual({ x: poi.x, y: poi.y });
  expect(ev.kind).toBe(poi.kind);
  expect(state.expedition!.surveyed).toContainEqual({ x: poi.x, y: poi.y });
  expect(state.expedition!.energy).toBe(300 - SURVEY_ENERGY);
  // now perceivable from the same spot
  const per = perceive(grid, entry, ["spyglass"], state.expedition!.surveyed).find((p) => p.x === poi.x && p.y === poi.y);
  expect(per!.detail).not.toBeNull();
});

test("surveyed detail persists after moving away", () => {
  const { seed, entry, poi } = farPoi();
  let s = reduce(stateAt(seed, entry), { type: "survey", at: { x: poi.x, y: poi.y } }).state;
  const before = s.expedition!.surveyed;
  s = reduce(s, { type: "move", to: { x: entry.x, y: entry.y - 1 } }).state;
  expect(s.expedition!.surveyed).toEqual(before!); // survey outlasts the step
});

test("survey rejected without a vision tool (missing-tool)", () => {
  const { seed, entry, poi } = farPoi();
  const s0 = stateAt(seed, entry, { tools: ["pick"] });
  const { state, events } = reduce(s0, { type: "survey", at: { x: poi.x, y: poi.y } });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "missing-tool" });
  expect(state).toBe(s0);
});

test("survey rejected while engaged", () => {
  const { seed, entry, poi } = farPoi();
  const { events } = reduce(stateAt(seed, entry, { combat: true }), { type: "survey", at: { x: poi.x, y: poi.y } });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "engaged" });
});

test("survey rejected on an empty (non-POI) tile (no-node)", () => {
  const { seed, entry, grid } = farPoi();
  // find a tile with no POI on it
  const empty = { x: entry.x, y: 0 };
  const hasPoi = grid.pois.some((p) => p.x === empty.x && p.y === empty.y);
  const target = hasPoi ? { x: entry.x === 0 ? 1 : 0, y: 0 } : empty;
  const { events } = reduce(stateAt(seed, entry), { type: "survey", at: target });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "no-node" });
});

test("survey rejected when the POI is already resolved (already-resolved)", () => {
  const { seed, entry, poi } = farPoi();
  const s0 = stateAt(seed, entry, { surveyed: [{ x: poi.x, y: poi.y }] });
  const { events } = reduce(s0, { type: "survey", at: { x: poi.x, y: poi.y } });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "already-resolved" });
});

test("survey rejected when too tired (exhausted)", () => {
  const { seed, entry, poi } = farPoi();
  const s0 = stateAt(seed, entry, { energy: SURVEY_ENERGY - 1 });
  const { events } = reduce(s0, { type: "survey", at: { x: poi.x, y: poi.y } });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "exhausted" });
});

test("survey rejected in town (not on expedition)", () => {
  const { events } = reduce(newGame("g"), { type: "survey", at: { x: 5, y: 5 } });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "not-on-expedition" });
});
