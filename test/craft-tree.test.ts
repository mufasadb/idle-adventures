// 675 web pass: the crafting tree's card model (tiers, undiscovered counts,
// connector pairs), the rendered workshop (o9vr: Civ-style; geometry in tree-layout.test.ts) + research table, and the one-time fog
// migration for a pre-fog save.
import { describe, expect, test } from "bun:test";
import { newGame } from "../src/engine/town";
import { reduce } from "../src/engine/reduce";
import { recipeKnowledge, recipeTier } from "../src/engine/knowledge";
import { legalActions } from "../src/sim/legal";
import { townRecipeIds, fieldRecipeIds } from "../src/render/render";
import { STARTER_RECIPES, RESEARCH_SEARCHES_PER_INK } from "../src/data/constants";
import type { GameState, ItemStack } from "../src/engine/types";
import { treeLayout, connectorPairs, workshopSection, researchSection, researchStatusLine, freshTreeUi } from "../src/web/craft-tree";
import { migrateFog } from "../src/web/persist";

const stacks = (o: Record<string, number>): ItemStack[] => Object.entries(o).map(([defId, qty]) => ({ defId, qty }));
const fresh = (): GameState => newGame("ct", { recipeFog: true });
// A mid-game save from before the fog: materials + the tools you'd have crafted.
const oldSave = (): GameState => ({
  ...newGame("ct-old"),
  runs: 4,
  bank: stacks({ flint: 4, deadwood: 3, "oak-log": 6, "iron-ore": 5, "copper-ore": 3, "deer-hide": 4, "forest-herb": 4, coal: 1, potion: 2, ration: 3, pick: 1, axe: 1, knife: 1, trap: 1, "ore-ink": 1, "fire-kit": 1 }),
});
const crafts = (s: GameState) => new Set(legalActions(s).flatMap((a) => (a.type === "craft" ? [a.recipeId] : [])));

describe("treeLayout", () => {
  test("a fresh fogged game shows only the starters (Tier 1); every other town recipe is counted as undiscovered in its tier", () => {
    const s = fresh();
    const l = treeLayout(s);
    expect(l.tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(l.tiers[0]!.cards.map((c) => c.output).sort()).toEqual([...STARTER_RECIPES].sort());
    for (const t of l.tiers.slice(1)) expect(t.cards).toEqual([]);
    const town = townRecipeIds([]);
    for (const t of l.tiers) {
      const inTier = town.filter((id) => recipeTier(id) === t.tier).length;
      expect(t.undiscovered + t.cards.reduce((n, c) => n + c.paths.length, 0)).toBe(inTier);
    }
    expect(l.field.cards).toEqual([]);
    expect(l.field.undiscovered).toBe(fieldRecipeIds().length);
  });

  test("fog off (old saves, tests): every town recipe is on the tree, nothing undiscovered", () => {
    const l = treeLayout(newGame("ct"));
    expect(l.tiers.every((t) => t.undiscovered === 0)).toBe(true);
    expect(l.tiers.reduce((n, t) => n + t.cards.reduce((k, c) => k + c.paths.length, 0), 0)).toBe(townRecipeIds([]).length);
  });

  test("one card per output (alternate recipes are its paths), at the lowest visible path's tier; craftable cards sort first", () => {
    const l = treeLayout(newGame("ct"));
    const ration = l.tiers.flatMap((t) => t.cards).find((c) => c.output === "ration")!;
    expect(ration.paths.length).toBeGreaterThan(1);
    expect(ration.tier).toBe(Math.min(...ration.paths.map((p) => p.tier)));
    const outs = l.tiers.flatMap((t) => t.cards.map((c) => c.output));
    expect(new Set(outs).size).toBe(outs.length);
    const s = migrateFog(oldSave())!;
    const can = crafts(s);
    for (const t of treeLayout(s, can).tiers) {
      const flags = t.cards.map((c) => c.paths.some((p) => can.has(p.recipeId)));
      expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a))); // all trues before falses
    }
  });

  test("connectorPairs link an input chip to the visible card that makes it — never to itself or a hidden card", () => {
    const s = migrateFog(oldSave())!;
    const l = treeLayout(s);
    const pairs = connectorPairs(l);
    const visible = new Set(l.tiers.flatMap((t) => t.cards.map((c) => c.output)));
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairs).toContainEqual({ from: "ration", to: "trail-ration", input: "ration" });
    for (const p of pairs) {
      expect(p.from).not.toBe(p.to);
      expect(visible.has(p.from) && visible.has(p.to)).toBe(true);
    }
    expect(connectorPairs(treeLayout(fresh()))).toEqual([]); // starters are made from raw materials only
  });
});

describe("workshopSection (rendered — o9vr: the Civ-style tree)", () => {
  test("fresh: the four starter nodes with named (not ???) inputs, tier columns left → right with known/hidden counts and a fog node each", () => {
    const html = workshopSection(fresh(), freshTreeUi());
    for (const id of STARTER_RECIPES) expect(html).toContain(`data-ct-node="${id}"`);
    expect(html).not.toContain('data-ct-node="canteen"');
    expect(html).not.toContain('class="u">?');
    const tiers = [...html.matchAll(/class="ct-era"[^>]*>Tier ([IVX]+)<small>(\d+) known · (\d+) hidden/g)].map((m) => m[1]);
    expect(tiers).toEqual(["I", "II", "III", "IV", "V"]);
    expect(html).toMatch(/\+\d+ undiscovered/);
    expect(html).toContain("<svg class=\"ct-links\"");
    expect(html).toContain('data-tree-close');
  });

  test("a craftable node shows ×N and sits in the make-now strip; its tray crafts that recipe; a station-gated node is 🔒 and its tray names the gate as jump chips", () => {
    const s = migrateFog(oldSave())!;
    const ui = freshTreeUi();
    const html = workshopSection(s, ui);
    expect(html).toMatch(/class="ct-node can[^"]*" data-ct-node="canteen"[^]*?class="ct-badge">×\d+/);
    expect(html).toMatch(/class="ct-now"[^]*data-ct-go="canteen"/);
    expect(html).toMatch(/Can make \(\d+\)/);
    expect(html).not.toContain("data-ct-tray"); // nothing selected: no tray
    const tray = workshopSection(s, { ...ui, sel: "canteen" });
    expect(tray).toContain('data-ct-craft="canteen"');
    expect(tray).toMatch(/need \d+ · you have \d+ ✓/);
    expect(tray).toMatch(/class="ct-node can[^"]* sel"/);
    expect(html).toMatch(/class="ct-node gated[^"]*" data-ct-node="plate-chest"[^]*?🔒/);
    const gated = workshopSection(s, { ...ui, sel: "plate-chest" });
    expect(gated).toMatch(/class="ct-gatebox">🔒 needs [^]*data-ct-go="(anvil|blacksmiths-hammer)"/);
    expect(gated).toMatch(/data-ct-craft="plate-chest"[^>]*disabled/);
  });

  test("selecting lights its path: feeders gold (hl-in / path.in), what it feeds blue (hl-out / path.out), the rest quiet", () => {
    const s = migrateFog(oldSave())!;
    const html = workshopSection(s, { ...freshTreeUi(), sel: "plate-chest" });
    expect(html).toMatch(/class="ct-node [^"]*hl-in" data-ct-node="blacksmiths-hammer"/);
    expect(html).toMatch(/<path class="k-tool in"/);
    expect(html).toMatch(/class="ct-node [^"]*quiet" data-ct-node="ration"/);
  });

  test("a researched recipe is a dashed (revealed) node; its tray says where it was found", () => {
    const s0 = migrateFog(oldSave())!;
    const r = reduce(s0, { type: "research", query: "tent" });
    const hit = r.events.find((e) => e.type === "research-hit");
    expect(hit?.type === "research-hit" && hit.recipeId).toBe("tent");
    const html = workshopSection(r.state, freshTreeUi());
    expect(html).toMatch(/class="ct-node (short|gated) revealed" data-ct-node="tent"/);
    expect(workshopSection(r.state, { ...freshTreeUi(), sel: "tent" })).toContain("found at the research table");
  });

  test("Field filter lists the field recipes; Materials lights the recipes that use a held material", () => {
    const s = migrateFog(oldSave())!;
    const field = workshopSection(s, { ...freshTreeUi(), filter: "field" });
    expect(field).toContain("ct-fieldview");
    expect(field).not.toContain("ct-canvas");
    const mats = workshopSection(s, { ...freshTreeUi(), matsOpen: true, mat: "forest-herb" });
    expect(mats).toMatch(/class="ct-mchip on" data-ct-mat="forest-herb"/);
    expect(mats).toMatch(/class="ct-node [^"]*matuse" data-ct-node="ration"/);
  });
});

describe("researchSection (rendered)", () => {
  test("before a search: the hint, the free search, no result", () => {
    const s = fresh();
    expect(researchStatusLine(s)).toBe("1 free search this visit");
    const html = researchSection(s);
    expect(html).toContain("The Research Table");
    expect(html).toContain("Try a word");
    expect(html).toContain("data-research-form");
    expect(html).not.toContain("rs-result");
  });

  test("out of searches: says so, disables Search, offers each ink", () => {
    const s0 = migrateFog(oldSave())!;
    const s = reduce(s0, { type: "research", query: "tent" }).state;
    expect(researchStatusLine(s)).toBe("no searches left — come back from a trip, or spend an ink");
    const html = researchSection(s);
    expect(html).toMatch(/<button type="submit" class="craftbtn" disabled/);
    expect(html).toContain(`data-buy-research="ore-ink"`);
    expect(html).toContain(`→ ${RESEARCH_SEARCHES_PER_INK} searches`);
    const bought = reduce(s, { type: "buy-research", inkId: "ore-ink" }).state;
    expect(researchStatusLine(bought)).toBe(`${RESEARCH_SEARCHES_PER_INK} bought searches left`);
  });

  test("a hit shows the revealed card + a find-it link; a miss shows the miss line; the query is escaped", () => {
    const s0 = migrateFog(oldSave())!;
    const s = reduce(s0, { type: "research", query: "tent" }).state;
    const hit = researchSection(s, [{ q: "tent", hit: "tent" }], { q: "tent", hit: "tent" });
    expect(hit).toContain('data-card="tent"');
    expect(hit).toContain('data-find-recipe="tent"');
    const miss = researchSection(s, [{ q: "<b>x" }], { q: "<b>x" });
    expect(miss).toContain("Nobody in town has heard of that.");
    expect(miss).not.toContain("<b>x");
    expect(miss).toContain("&lt;b&gt;x");
  });
});

describe("migrateFog — turning the fog on for a pre-fog save", () => {
  test("only a save with no recipeFog flag migrates; it's idempotent", () => {
    expect(migrateFog(fresh())).toBeNull();
    const m = migrateFog(oldSave())!;
    expect(m.recipeFog).toBe(true);
    expect(migrateFog(m)).toBeNull();
  });

  test("strands nothing: same bank, every recipe whose output you own is known, and everything craftable from the bank stays craftable", () => {
    const old = oldSave();
    const m = migrateFog(old)!;
    expect(m.bank).toEqual(old.bank);
    const know = new Map(recipeKnowledge(m).map((r) => [r.recipeId, r.status]));
    for (const id of ["pick", "axe", "knife", "trap", "fire-kit"]) expect(know.get(id)).toBe("known");
    const before = crafts(old), after = crafts(m);
    for (const id of before) expect(after.has(id)).toBe(true);
  });

  test("mid-run save: carried and run-loadout items count as held", () => {
    let s = oldSave();
    s = reduce(s, { type: "pack", slot: "tool", itemId: "pick" }).state;
    const emb = legalActions(s).find((a) => a.type === "embark");
    if (emb?.type !== "embark") throw new Error("no embark offered");
    s = reduce(s, emb).state;
    expect(s.phase).not.toBe("town");
    const m = migrateFog({ ...s, expedition: { ...s.expedition!, carry: stacks({ "wolf-pelt": 1 }) } })!;
    expect(m.seen).toContain("wolf-pelt");
    expect(m.seen).toContain("pick");
  });
});
