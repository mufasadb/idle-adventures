import { test, expect } from "bun:test";
import { resolveKit, simFight, simReach, KIT_PRESETS } from "../src/sim/balance";
import { run } from "../src/sim/balance-cli";
import { resolveCombat } from "../src/engine/combat";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { PLAYER_BASE_HP } from "../src/data/constants";

test("resolveKit: mithril preset is full mithril plate + mithril-sword", () => {
  const l = resolveKit("mithril");
  expect(l.equipment.weapon).toBe("mithril-sword");
  expect([l.equipment.helmet, l.equipment.chest, l.equipment.legs, l.equipment.boots, l.equipment.gloves]).toEqual([
    "mithril-plate-helmet", "mithril-plate-chest", "mithril-plate-legs", "mithril-plate-boots", "mithril-plate-gloves",
  ]);
  expect(l.potions).toEqual([]);
});

test("resolveKit: overrides replace preset fields", () => {
  const l = resolveKit("mithril", { weapon: "wyrmfang", potions: [{ defId: "greater-potion", qty: 3 }] });
  expect(l.equipment.weapon).toBe("wyrmfang");
  expect(l.equipment.chest).toBe("mithril-plate-chest"); // armour untouched by a weapon override
  expect(l.potions).toEqual([{ defId: "greater-potion", qty: 3 }]);
});

test("resolveKit: unknown ids fail fast naming the valid set", () => {
  expect(() => resolveKit("adamantium")).toThrow(/valid: .*mithril/);
  expect(() => resolveKit("bare", { weapon: "lightsaber" })).toThrow(/valid: /);
  expect(() => resolveKit("bare", { potions: [{ defId: "coffee", qty: 1 }] })).toThrow(/valid: /);
});

// The composition can't drift from the engine: simFight's verdict must equal
// resolveCombat's for every kit × monster × potion × battle item combination we sweep.
test("simFight matches resolveCombat across kits × monsters × potions × battle items", () => {
  const monsters = ["forest-boar", "giant-scorpion", "ice-troll", "ancient-wyrm"];
  const potionSets: { defId: string; qty: number }[][] = [[], [{ defId: "greater-potion", qty: 3 }]];
  const battleItemSets: { defId: string; qty: number }[][] = [[], [{ defId: "elixir-of-power", qty: 1 }, { defId: "warding-draught", qty: 1 }]];
  for (const kitName of Object.keys(KIT_PRESETS)) {
    for (const m of monsters) {
      for (const potions of potionSets) {
        for (const battleItems of battleItemSets) {
          const kit = resolveKit(kitName, { potions, battleItems });
          const report = simFight(kit, m);
          const atomic = resolveCombat(kit, PLAYER_BASE_HP, m);
          expect({ victory: report.victory, hpLost: report.hpLost, potionsUsed: report.potionsUsed })
            .toEqual({ victory: atomic.victory, hpLost: atomic.hpLost, potionsUsed: atomic.potionsUsed });
          expect(report.rounds.length).toBeGreaterThan(0);
        }
      }
    }
  }
});

test("simReach: every POI reported; on-foot all reachable; strip out-ranges one capacity", () => {
  const seed = "sim-reach-0";
  const report = simReach(resolveKit("bare"), seed);
  const grid = generateGrid(seed, rollBiome(seed));
  expect(report.summary.pois).toBe(grid.pois.length);
  expect(report.summary.reachable).toBe(report.summary.pois); // e3j: POIs sample walkable tiles, one component
  expect(report.summary.farthestCapacities).toBeGreaterThan(1); // e3j: the strip out-ranges one energy capacity
  const costs = report.pois.map((p) => p.cost!);
  expect([...costs].sort((a, b) => a - b)).toEqual(costs); // sorted ascending
});

test("CLI: fight smoke, json roundtrip, unknown monster exits 1", () => {
  const pretty = run(["fight", "--kit", "bare", "--vs", "forest-boar"]);
  expect(pretty.code).toBe(0);
  expect(pretty.output).toContain("forest-boar");
  expect(pretty.output.toLowerCase()).toContain("victory");
  const json = run(["fight", "--kit", "mithril", "--potions", "greater-potion:3", "--vs", "ancient-wyrm", "--json"]);
  expect(json.code).toBe(0);
  const parsed = JSON.parse(json.output);
  expect(parsed.victory).toBe(true); // the pinned Wyrm gate, via the CLI
  expect(parsed.potionsUsed).toBe(3);
  const bad = run(["fight", "--kit", "bare", "--vs", "nonsense"]);
  expect(bad.code).toBe(1);
  expect(bad.output).toContain("valid:");
  const noCmd = run([]);
  expect(noCmd.code).toBe(1);
  expect(noCmd.output).toContain("usage");
});
