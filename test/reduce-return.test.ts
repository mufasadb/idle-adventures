import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { GameState, ItemStack, Loadout } from "../src/engine/types";

function onExpedition(over: { carry?: ItemStack[]; loadout?: Loadout; bank?: ItemStack[] } = {}): GameState {
  const loadout = over.loadout ?? emptyLoadout();
  return {
    seed: "r", phase: "expedition", bank: over.bank ?? [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "m", pos: { x: 0, y: 0 }, energy: 5, hp: 20,
      loadout, carry: over.carry ?? [], cleared: [],
    },
  };
}

test("return: banks carry + durables + potions + uneaten food (D26, pqp), back to town", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "iron-sword";
  loadout.equipment.tools = ["pick"];
  loadout.food = [{ defId: "ration", qty: 2 }]; // uneaten — banks back (pqp)
  loadout.potions = [{ defId: "potion", qty: 1 }];
  const { state, events } = reduce(
    onExpedition({ carry: [{ defId: "silver-ore", qty: 4 }], loadout, bank: [{ defId: "iron-ore", qty: 1 }] }),
    { type: "return" },
  );
  expect(state.phase).toBe("town");
  expect(state.expedition).toBeNull();
  expect(state.bank).toEqual([
    { defId: "iron-ore", qty: 1 },
    { defId: "silver-ore", qty: 4 },
    { defId: "iron-sword", qty: 1 },
    { defId: "pick", qty: 1 },
    { defId: "potion", qty: 1 },
    { defId: "ration", qty: 2 }, // uneaten food banks back (pqp)
  ]);
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({ type: "run-ended", reason: "returned" });
  // a voluntary return carries a cosmetic flavor beat (xwp)
  expect(typeof (events[0] as { flavor?: string }).flavor).toBe("string");
});

test("return: rejected in town", () => {
  const town: GameState = { seed: "r", phase: "town", bank: [], loadout: emptyLoadout(), expedition: null };
  const { events } = reduce(town, { type: "return" });
  expect(events).toEqual([{ type: "action-rejected", action: "return", reason: "not-on-expedition" }]);
});
