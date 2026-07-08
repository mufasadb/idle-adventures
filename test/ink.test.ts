import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { newGame } from "../src/engine/town";
import { emptyLoadout } from "../src/engine/loadout";
import { INKS, AFFIX_EFFECTS } from "../src/data/constants";
import type { GameState, GameEvent, MapItem } from "../src/engine/types";

// A town holding one map, with `inks` in the bank.
function townWithMap(inks: { defId: string; qty: number }[], map: Partial<MapItem> = {}): GameState {
  const s = newGame("ink-g");
  const held: MapItem = { mapSeed: "ink-g:held:0", biomeId: "tundra", vintage: 0, tier: 2, ...map };
  return { ...s, bank: [...s.bank, ...inks], maps: [held] };
}

const oreInk = () => [{ defId: "ore-ink", qty: 1 }];

test("INKS + AFFIX_EFFECTS: every ink's pool entries are real affixes with labels", () => {
  for (const ink of Object.values(INKS)) {
    expect(ink.pool.length).toBeGreaterThan(0);
    for (const affixId of ink.pool) {
      expect(AFFIX_EFFECTS[affixId]).toBeDefined();
      expect(AFFIX_EFFECTS[affixId]!.label).toMatch(/^[a-z][a-z -]*$/);
    }
  }
});

test("ink: applies an affix to the held map, consumes the ink, emits inked", () => {
  const s = townWithMap(oreInk());
  const { state, events } = reduce(s, { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" });
  const ev = events.find((e) => e.type === "inked") as Extract<GameEvent, { type: "inked" }>;
  expect(ev).toBeDefined();
  expect(INKS["ore-ink"]!.pool).toContain(ev.affix);
  const map = state.maps!.find((m) => m.mapSeed === "ink-g:held:0")!;
  expect(map.affixes).toContain(ev.affix);
  expect(state.bank.find((b) => b.defId === "ore-ink")).toBeUndefined(); // consumed
});

test("ink: re-inking the SAME domain replaces the affix (never stacks a domain)", () => {
  const s = townWithMap([{ defId: "ore-ink", qty: 2 }]);
  const s1 = reduce(s, { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" }).state;
  const s2 = reduce(s1, { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" }).state;
  const map = s2.maps!.find((m) => m.mapSeed === "ink-g:held:0")!;
  const oreAffixes = (map.affixes ?? []).filter((a) => INKS["ore-ink"]!.pool.includes(a));
  expect(oreAffixes.length).toBe(1); // one ore affix, not two
});

test("ink: a second domain ADDS a distinct affix", () => {
  const s = townWithMap([{ defId: "ore-ink", qty: 1 }, { defId: "herb-ink", qty: 1 }]);
  const s1 = reduce(s, { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" }).state;
  const s2 = reduce(s1, { type: "ink", mapSeed: "ink-g:held:0", inkId: "herb-ink" }).state;
  const map = s2.maps!.find((m) => m.mapSeed === "ink-g:held:0")!;
  expect((map.affixes ?? []).length).toBe(2);
});

test("ink: deterministic — same state rolls the same affix", () => {
  const a = reduce(townWithMap(oreInk()), { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" });
  const b = reduce(townWithMap(oreInk()), { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" });
  const ea = a.events.find((e) => e.type === "inked") as Extract<GameEvent, { type: "inked" }>;
  const eb = b.events.find((e) => e.type === "inked") as Extract<GameEvent, { type: "inked" }>;
  expect(ea.affix).toBe(eb.affix);
});

test("ink: rejected off-town", () => {
  const s = townWithMap(oreInk());
  const expeditionState: GameState = { ...s, phase: "expedition", expedition: { mapSeed: "x", pos: { x: 0, y: 0 }, energy: 300, hp: 30, loadout: emptyLoadout(), carry: [], cleared: [] } };
  const { events } = reduce(expeditionState, { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "not-in-town" });
});

test("ink: rejected when the map isn't held", () => {
  const { events } = reduce(townWithMap(oreInk()), { type: "ink", mapSeed: "no-such-map", inkId: "ore-ink" });
  expect(events.find((e) => e.type === "action-rejected")?.type).toBe("action-rejected");
});

test("ink: rejected when the ink isn't in the bank (insufficient)", () => {
  const { events } = reduce(townWithMap([]), { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" });
  expect(events.find((e) => e.type === "action-rejected")).toMatchObject({ reason: "insufficient" });
});

test("generateGrid: no affixes == explicit empty affixes (identity at base)", () => {
  const seed = "aff-base-1";
  const b = rollBiome(seed);
  expect(generateGrid(seed, b, 1)).toEqual(generateGrid(seed, b, 1, []));
});

test("generateGrid: an affix changes the map, and is stable across repeat calls", () => {
  const seed = "aff-effect-1";
  const b = rollBiome(seed);
  const base = generateGrid(seed, b, 2);
  const inked = generateGrid(seed, b, 2, ["of-carbon"]);
  expect(JSON.stringify(inked.pois)).not.toBe(JSON.stringify(base.pois)); // the bias shows up
  expect(generateGrid(seed, b, 2, ["of-carbon"])).toBe(inked); // memoized: same reference
});

test("generateGrid: affix order doesn't matter (memo key sorts)", () => {
  const seed = "aff-order-1";
  const b = rollBiome(seed);
  expect(generateGrid(seed, b, 2, ["of-carbon", "of-gleaming"])).toBe(generateGrid(seed, b, 2, ["of-gleaming", "of-carbon"]));
});

test("embark: a held map's affixes ride onto the expedition and into its grid", () => {
  const s = townWithMap(oreInk());
  const inked = reduce(s, { type: "ink", mapSeed: "ink-g:held:0", inkId: "ore-ink" }).state;
  const affix = inked.maps!.find((m) => m.mapSeed === "ink-g:held:0")!.affixes!;
  const embarked = reduce(inked, { type: "embark", mapSeed: "ink-g:held:0" }).state;
  expect(embarked.expedition!.affixes).toEqual(affix);
});
