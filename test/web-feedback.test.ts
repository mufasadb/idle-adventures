// beh / rx5 / mki: the pure half of the web's action feedback — events → tile cues,
// craft notes, and the packed-state counts the bank row reads.
import { describe, expect, test } from "bun:test";
import { pickupCues, craftNote, packedCounts, planWithout, toolsUsed, heldOnRun } from "../src/web/feedback";
import type { GameEvent } from "../src/engine/types";
import { newGame } from "../src/engine/town";
import { reduce } from "../src/engine/reduce";
import { name } from "../src/render/render";

const at = { x: 3, y: 4 };
const gathered = (material: string, qty: number, kind: "mining" | "wood" | "herb" | "animal" = "mining"): GameEvent =>
  ({ type: "gathered", at, kind, material, qty, cost: 5, energy: 90 });

describe("pickupCues (rx5)", () => {
  test("a gather becomes a gain cue on its tile, naming the tool(s) that worked it", () => {
    const [c] = pickupCues([gathered("copper-ore", 2)], [], () => null, ["iron-pick", "axe", "tent"]);
    expect(c).toEqual({ at, text: `+2 ${name("copper-ore")}`, kind: "gain", defId: "copper-ore", qty: 2, tools: ["iron-pick"] });
  });

  test("a hunt bounces both the trap and the knife; a forage bounces nothing", () => {
    expect(toolsUsed("animal", ["knife", "trap", "pick"])).toEqual(["knife", "trap"]);
    expect(toolsUsed("herb", ["knife", "pick"])).toEqual([]);
  });

  test("a victory's loot and a fished catch also fly to the bag; a loss does not", () => {
    const events: GameEvent[] = [
      { type: "fought", at, creature: "wolf", victory: true, hpLost: 1, potionsUsed: 0, loot: [{ defId: "wolf-pelt", qty: 1 }], hp: 9, matchup: {} as never },
      { type: "fought", at, creature: "wolf", victory: false, hpLost: 9, potionsUsed: 0, loot: [{ defId: "wolf-pelt", qty: 1 }], hp: 0, matchup: {} as never },
      { type: "fished", at, water: "river", catch: "trout", contents: [], cost: 3, energy: 50 },
    ];
    expect(pickupCues(events, [], () => null, []).map((c) => c.defId)).toEqual(["wolf-pelt", "trout"]);
  });

  test("a refused gather on a node becomes a short miss cue — named tool, bag full, tired", () => {
    const cues = pickupCues([], [
      { at, reason: "missing-tool" },
      { at: { x: 5, y: 5 }, reason: "missing-tool" },
      { at, reason: "carry-full" },
      { at, reason: "exhausted" },
      { at, reason: "tool-too-weak" },
    ], (p) => (p.x === 5 ? "animal" : "mining"), ["knife"]);
    expect(cues.map((c) => [c.kind, c.text])).toEqual([
      ["miss", "needs pick"],
      ["miss", "needs trap"],
      ["miss", "bag full"],
      ["miss", "too tired"],
      ["miss", "tool too weak"],
    ]);
    expect(cues[2]!.reason).toBe("carry-full"); // bag-full also shakes the bag count
  });

  test("walking over a cleared / non-gather tile says nothing", () => {
    expect(pickupCues([], [{ at, reason: "already-cleared" }, { at, reason: "not-gatherable" }], () => "mining", [])).toEqual([]);
  });
});

describe("craftNote (mki)", () => {
  test("a town craft names the output, where it went, and the new count", () => {
    const n = craftNote("r", [{ type: "crafted", recipeId: "r", output: { defId: "pick", qty: 1 } }], (d, w) => (d === "pick" && w === "town" ? 2 : 0));
    expect(n).toEqual({ recipeId: "r", ok: true, text: `+1 ${name("pick")} — in the bank (now 2)` });
  });
  test("a field craft lands in the bag", () => {
    const n = craftNote("r", [{ type: "crafted", recipeId: "r", output: { defId: "pick", qty: 1 }, where: "field" }], () => 1);
    expect(n?.text).toContain("in your bag");
  });
  test("a rejection carries the reject copy", () => {
    const n = craftNote("r", [{ type: "action-rejected", action: "craft", reason: "insufficient-materials" }], () => 0);
    expect(n).toEqual({ recipeId: "r", ok: false, text: "✗ insufficient-materials" });
  });
  test("no craft event → no note", () => {
    expect(craftNote("r", [], () => 0)).toBeNull();
  });
});

describe("packed state (beh)", () => {
  test("packedCounts reads the plan; planWithout drops one unit; heldOnRun adds carry + loadout", () => {
    let s = newGame("fb");
    s = { ...s, bank: [...s.bank, { defId: "pick", qty: 1 }] }; // starting bank: rations + potions
    for (const a of [{ slot: "tool", itemId: "pick" }, { slot: "food", itemId: "ration" }, { slot: "food", itemId: "ration" }] as const) {
      const r = reduce(s, { type: "pack", ...a });
      expect(r.events.some((e) => e.type === "action-rejected")).toBe(false);
      s = r.state;
    }
    const counts = packedCounts(s.loadout);
    expect(counts.get("pick")).toBe(1);
    expect(counts.get("ration")).toBe(2);
    const without = planWithout(s.loadout, "ration")!;
    expect(without.filter((p) => p.itemId === "ration").length).toBe(1);
    expect(without.some((p) => p.itemId === "pick")).toBe(true);
    expect(heldOnRun({ carry: [{ defId: "ration", qty: 3 }], loadout: s.loadout }, "ration")).toBe(5);
    expect(planWithout(s.loadout, "no-such-item")).toBeNull();
  });
});
