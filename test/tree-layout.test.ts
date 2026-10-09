// o9vr: the crafting tree's pure graph layout (src/web/tree-layout.ts) — tier columns,
// orthogonal connectors, no overlaps, deterministic — and the fog on the real tree model.
import { describe, expect, test } from "bun:test";
import { layoutGraph, TREE_GEOM } from "../src/web/tree-layout";
import type { GraphLayout, GNode, GEdge, Box } from "../src/web/tree-layout";
import { treeModel, treeEdges, treeLayout, makeable } from "../src/web/craft-tree";
import { newGame } from "../src/engine/town";
import { reduce } from "../src/engine/reduce";
import { recipeKnowledge } from "../src/engine/knowledge";
import { migrateFog } from "../src/web/persist";
import type { GameState, ItemStack } from "../src/engine/types";

const stacks = (o: Record<string, number>): ItemStack[] => Object.entries(o).map(([defId, qty]) => ({ defId, qty }));
const oldSave = (): GameState => ({
  ...newGame("ct-old"),
  runs: 4,
  bank: stacks({ flint: 4, deadwood: 3, "oak-log": 6, "iron-ore": 5, "copper-ore": 3, "deer-hide": 4, "forest-herb": 4, coal: 1, potion: 2, ration: 3, pick: 1, axe: 1, knife: 1, trap: 1, "ore-ink": 1, "fire-kit": 1 }),
});
// the states the tree is checked against: fog off (every town recipe — the biggest
// graph), a fresh fogged game, and a migrated mid-game save with a researched recipe
const states = (): [string, GameState][] => {
  const mid = migrateFog(oldSave())!;
  return [
    ["fog off", newGame("ct")],
    ["fresh fogged", newGame("ct", { recipeFog: true })],
    ["mid-game fogged", mid],
    ["mid-game + research", reduce(mid, { type: "research", query: "tent" }).state],
  ];
};

const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// does an axis-aligned segment pass through the inside of a box?
const cuts = (p: { x: number; y: number }, q: { x: number; y: number }, b: Box) => {
  const [x0, x1] = [Math.min(p.x, q.x), Math.max(p.x, q.x)], [y0, y1] = [Math.min(p.y, q.y), Math.max(p.y, q.y)];
  return x0 < b.x + b.w - 1 && x1 > b.x + 1 && y0 < b.y + b.h - 1 && y1 > b.y + 1;
};

function checkGeometry(g: GraphLayout): void {
  const boxes: (Box & { id: string })[] = [...Object.values(g.nodes), ...g.fogs.map((f) => ({ ...f, id: `fog${f.tier}` }))];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (overlap(boxes[i]!, boxes[j]!)) throw new Error(`overlap: ${boxes[i]!.id} / ${boxes[j]!.id}`);
  }
  for (const b of boxes) { expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(g.W); expect(b.y + b.h).toBeLessThanOrEqual(g.H); }
  for (const r of g.routes) {
    expect(r.pts.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1]!, b = r.pts[i]!;
      if (a.x !== b.x && a.y !== b.y) throw new Error(`diagonal segment in ${r.key}`);
      // a connector never runs through a node (it starts at its source's edge, ends at its target's)
      for (const n of boxes) if (cuts(a, b, n)) throw new Error(`${r.key} cuts through ${n.id}`);
    }
  }
}

describe("layoutGraph (pure)", () => {
  test("a chain sits in successive columns on one row — every connector straight", () => {
    const nodes: GNode[] = [{ id: "a", tier: 1, lane: 0, ord: 0 }, { id: "b", tier: 1, lane: 0, ord: 1 }, { id: "c", tier: 2, lane: 0, ord: 2 }];
    const g = layoutGraph(nodes, [{ s: "a", t: "b", kind: "in" }, { s: "b", t: "c", kind: "tool" }]);
    expect([g.nodes.a!.col, g.nodes.b!.col, g.nodes.c!.col]).toEqual([0, 1, 2]);
    expect(new Set([g.nodes.a!.row, g.nodes.b!.row, g.nodes.c!.row]).size).toBe(1);
    expect(g.routes.every((r) => r.pts.length === 2)).toBe(true);
    expect(g.routes.find((r) => r.key === "b>c")!.kind).toBe("tool");
    checkGeometry(g);
  });

  test("tiers run left → right; a crowded tier spreads into sub-columns; fog sits under its tier", () => {
    const nodes: GNode[] = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, tier: i < 17 ? 1 : 2, lane: i % 3, ord: i }));
    const g = layoutGraph(nodes, [], { 1: 4, 3: 2 }, TREE_GEOM);
    const t1 = g.tiers.find((t) => t.tier === 1)!, t2 = g.tiers.find((t) => t.tier === 2)!, t3 = g.tiers.find((t) => t.tier === 3)!;
    expect(t1.cols).toBe(Math.ceil(17 / TREE_GEOM.rowsTarget));
    expect(t2.col0).toBe(t1.col0 + t1.cols);
    expect(t3.known).toBe(0); // a tier with only hidden recipes still gets its column
    expect(t3.hidden).toBe(2);
    for (const n of Object.values(g.nodes)) {
      const band = g.tiers.find((t) => t.tier === n.tier)!;
      expect(n.col).toBeGreaterThanOrEqual(band.col0);
      expect(n.col).toBeLessThan(band.col0 + band.cols);
    }
    expect(g.fogs.map((f) => [f.tier, f.n, f.col])).toEqual([[1, 4, t1.col0], [3, 2, t3.col0]]);
    checkGeometry(g);
  });

  test("a source feeding many shares one trunk; a higher-tier feeder is not drawn backwards", () => {
    const nodes: GNode[] = [
      { id: "hammer", tier: 1, lane: 0, ord: 0 }, { id: "x", tier: 1, lane: 1, ord: 1 },
      { id: "p1", tier: 3, lane: 2, ord: 2 }, { id: "p2", tier: 3, lane: 2, ord: 3 }, { id: "p3", tier: 3, lane: 2, ord: 4 },
      { id: "late", tier: 2, lane: 0, ord: 5 },
    ];
    const edges: GEdge[] = [{ s: "hammer", t: "p1", kind: "tool" }, { s: "hammer", t: "p2", kind: "tool" }, { s: "hammer", t: "p3", kind: "tool" }, { s: "p1", t: "x", kind: "in" }];
    const g = layoutGraph(nodes, edges);
    expect(g.edges.some((e) => e.s === "p1" && e.t === "x")).toBe(false); // tier 3 can't feed tier 1 leftwards
    // the hammer's trunk crosses the empty tier-2 column once, carrying all three edges
    const trunk = g.routes.filter((r) => r.key.startsWith("hammer>"));
    expect(trunk.length).toBe(1);
    expect(trunk[0]!.edges.sort()).toEqual(["hammer>p1", "hammer>p2", "hammer>p3"]);
    checkGeometry(g);
  });
});

describe("the real tree (treeModel)", () => {
  for (const [label, s] of states()) {
    test(`${label}: no overlaps, every connector orthogonal and left → right, deterministic`, () => {
      const m = treeModel(s);
      checkGeometry(m.graph);
      for (const e of m.graph.edges) expect(m.graph.nodes[e.s]!.col).toBeLessThan(m.graph.nodes[e.t]!.col);
      expect(treeModel(s).graph).toEqual(m.graph);
    });

    test(`${label}: fog respected — every node is a known/revealed output; hidden counts match`, () => {
      const m = treeModel(s);
      const know = recipeKnowledge(s);
      const visibleOut = new Set(know.filter((r) => r.status !== "hidden").map((r) => r.output));
      for (const id of Object.keys(m.graph.nodes)) expect(visibleOut.has(id)).toBe(true);
      const l = treeLayout(s);
      for (const t of l.tiers) expect(m.graph.fogs.find((f) => f.tier === t.tier)?.n ?? 0).toBe(t.undiscovered);
    });
  }

  test("row alignment: a one-to-one link (its source feeds only it, it's fed only by that) runs dead straight; tool gates are dashed edges", () => {
    for (const [, s] of states()) {
      const g = treeModel(s).graph;
      const outDeg = new Map<string, number>(), inDeg = new Map<string, number>();
      for (const e of g.edges) { outDeg.set(e.s, (outDeg.get(e.s) ?? 0) + 1); inDeg.set(e.t, (inDeg.get(e.t) ?? 0) + 1); }
      const oneToOne = g.edges.filter((e) => outDeg.get(e.s) === 1 && inDeg.get(e.t) === 1).map((e) => `${e.s}>${e.t}`);
      // (≥ 85%, not all: a crowded column can leave the odd one a row off)
      const straight = oneToOne.filter((k) => g.routes.filter((r) => r.edges.includes(k)).every((r) => r.pts.length === 2));
      expect(straight.length).toBeGreaterThanOrEqual(Math.ceil(oneToOne.length * 0.85));
    }
    const edges = treeEdges(treeLayout(newGame("ct")));
    expect(edges).toContainEqual({ s: "blacksmiths-hammer", t: "plate-chest", kind: "tool" });
    expect(edges).toContainEqual({ s: "anvil", t: "plate-chest", kind: "tool" });
    const outs = new Set(treeLayout(newGame("ct")).tiers.flatMap((t) => t.cards.map((c) => c.output)));
    for (const e of edges) expect(outs.has(e.s) && outs.has(e.t)).toBe(true); // item → item only
    expect(edges.some((e) => e.s === "flint" || e.s === "oak-log")).toBe(false); // raw materials are never nodes
  });

  test("node state is the reducer's: ×N = how many crafts in a row reduce accepts", () => {
    const s = migrateFog(oldSave())!;
    const m = treeModel(s);
    const can = [...m.info.values()].filter((n) => n.st === "can");
    expect(can.length).toBeGreaterThan(0);
    for (const n of can) {
      const p = n.card.paths[n.pathMake.indexOf(n.make)]!;
      let st = s;
      for (let i = 0; i < n.make; i++) st = reduce(st, { type: "craft", recipeId: p.recipeId }).state;
      expect(reduce(st, { type: "craft", recipeId: p.recipeId }).events.some((e) => e.type === "action-rejected")).toBe(true);
      expect(makeable(s, p.recipeId)).toBe(n.make);
    }
    expect(m.info.get("plate-chest")?.st).toBe("gated");
  });
});
