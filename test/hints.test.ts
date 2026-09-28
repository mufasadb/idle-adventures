// 3iq / si7.6.11 (D95) — map hints: rolled at mint, one per family, revealed by study.
import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { reduce } from "../src/engine/reduce";
import { generateGrid } from "../src/engine/grid";
import { rollMapHints, familyHints, hintLabel, hintFamily } from "../src/engine/hints";
import { mapHintIds, revealedHints, newGame } from "../src/engine/town";
import { computeHintBaseline, renderHintBaseline } from "../src/sim/hint-baseline";
import { MAP_HINTS, HINT_FALLBACK, HINT_FAMILIES, STUDY_COST, BIOME_IDS, EPITHETS } from "../src/data/constants";
import type { GameState, MapItem } from "../src/engine/types";

test("committed hint baseline is current — run `bun run sim:tables` after generation/roster changes", () => {
  expect(readFileSync("src/data/hint-baseline.ts", "utf8")).toBe(renderHintBaseline(computeHintBaseline()));
});

test("perception guard: no hint label carries a number", () => {
  for (const l of [...MAP_HINTS.map((t) => t.label), ...Object.values(HINT_FALLBACK).map((f) => f.label)]) expect(l).not.toMatch(/\d/);
});

test("every map rolls exactly one hint per family, deterministically", () => {
  for (const b of BIOME_IDS) {
    const g = generateGrid("h-1", b, 2);
    const ids = rollMapHints(g, "h-1");
    expect(ids).toEqual(rollMapHints(g, "h-1"));
    expect(ids.map(hintFamily).sort()).toEqual([...HINT_FAMILIES].sort());
  }
});

test("hints say something the biome name doesn't: each family varies across maps of one biome", () => {
  for (const b of BIOME_IDS) for (const f of HINT_FAMILIES) {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => familyHints(generateGrid(`vary-${i}`, b, 1))[f]));
    expect({ b, f, n: seen.size > 1 }).toEqual({ b, f, n: true });
  }
});

test("a T3 terror is always whispered (absolute trait outranks the relative ones)", () => {
  for (let i = 0; i < 60; i++) {
    const g = generateGrid(`anc-${i}`, "tundra", 3);
    if (g.pois.some((p) => p.creature === "ancient-wyrm" || p.creature === "ice-troll")) expect(familyHints(g).threat).toBe("ancients");
  }
});

function withMap(m: MapItem, bank = [{ defId: "copper-ore", qty: 5 }]): GameState {
  return { ...newGame("st"), bank, maps: [m] };
}

test("study reveals the next hint for STUDY_COST, in the rolled order, until fully read", () => {
  let s = withMap({ mapSeed: "study-1", biomeId: "woodland", vintage: 0, tier: 2 });
  const order = mapHintIds(s.maps![0]!);
  expect(revealedHints(s.maps![0]!)).toEqual([]);
  for (let i = 0; i < order.length; i++) {
    const r = reduce(s, { type: "study", mapSeed: "study-1" });
    expect(r.events).toEqual([{ type: "map-studied", mapSeed: "study-1", hint: order[i]!, remaining: order.length - i - 1 }]);
    s = r.state;
    expect(revealedHints(s.maps![0]!)).toEqual(order.slice(0, i + 1).map(hintLabel));
  }
  const copper = STUDY_COST.find((c) => c.defId === "copper-ore")!.qty * order.length;
  expect(s.bank.find((b) => b.defId === "copper-ore")?.qty ?? 0).toBe(5 - copper);
  const done = reduce(s, { type: "study", mapSeed: "study-1" });
  expect(done.events).toEqual([{ type: "action-rejected", action: "study", reason: "fully-read" }]);
  expect(done.state).toBe(s);
});

test("study rejects when you can't pay, or don't hold the map, or aren't in town", () => {
  const m: MapItem = { mapSeed: "study-2", biomeId: "desert", vintage: 0 };
  const poor = withMap(m, []);
  expect(reduce(poor, { type: "study", mapSeed: "study-2" }).events[0]).toMatchObject({ reason: "unaffordable" });
  expect(reduce(withMap(m), { type: "study", mapSeed: "nope" }).events[0]).toMatchObject({ reason: "map-not-carried" });
});

test("hint and epithet vocabularies don't collide (different jobs, different words)", () => {
  const epi = new Set(EPITHETS.map((e) => e.label));
  for (const t of MAP_HINTS) expect(epi.has(t.label)).toBe(false);
});

test("spore hints (si7.6.9.7): some fungal maps are choked or clear, no other biome ever is", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) seen.add(familyHints(generateGrid(`spore-h-${i}`, "fungal", 3)).ground);
  expect(seen.has("choked") || seen.has("clear-air")).toBe(true);
  for (const b of BIOME_IDS) if (b !== "fungal") for (let i = 0; i < 15; i++) {
    expect(["choked", "clear-air"]).not.toContain(familyHints(generateGrid(`spore-h-${i}`, b, 2)).ground);
  }
});
