import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { RECIPE, ARMOUR } from "../src/data/constants";
import { slotOf } from "../src/engine/catalog";
import type { GameState, ItemStack } from "../src/engine/types";

// ke3.7: the forge — anvil station + blacksmith's hammer gate all metal plate.

function town(bank: ItemStack[], stations?: GameState["stations"], tools?: string[]): GameState {
  const loadout = emptyLoadout();
  if (tools) loadout.equipment.tools = tools;
  return { seed: "c", phase: "town", bank, loadout, expedition: null, ...(stations ? { stations } : {}) };
}

test("forge: blacksmiths-hammer is a town-crafted, carriable tool (ke3.7)", () => {
  expect(slotOf("blacksmiths-hammer")).toBe("tool");
  const { state } = reduce(town([{ defId: "iron-ore", qty: 2 }]), { type: "craft", recipeId: "blacksmiths-hammer" });
  expect(state.bank.find((s) => s.defId === "blacksmiths-hammer")?.qty).toBe(1);
});

test("forge: anvil builds as a station, output not banked (ke3.7)", () => {
  const { state } = reduce(town([{ defId: "iron-ore", qty: 3 }, { defId: "oak-log", qty: 2 }]), { type: "craft", recipeId: "anvil" });
  expect(state.stations).toEqual(["anvil"]);
  expect(state.bank.find((s) => s.defId === "anvil")).toBeUndefined();
});

test("forge: plate rejects missing-station, then missing-tool, then crafts (ke3.7)", () => {
  const bank: ItemStack[] = [{ defId: "iron-ore", qty: 3 }];
  // no anvil → missing-station
  const noAnvil = reduce(town(bank), { type: "craft", recipeId: "plate-chest" });
  expect(noAnvil.events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-station" }]);
  // anvil built but no hammer → missing-tool
  const noHammer = reduce(town(bank, ["anvil"]), { type: "craft", recipeId: "plate-chest" });
  expect(noHammer.events).toEqual([{ type: "action-rejected", action: "craft", reason: "missing-tool" }]);
  // anvil + hammer (in bank) → crafts
  const forged = reduce(town([...bank, { defId: "blacksmiths-hammer", qty: 1 }], ["anvil"]), { type: "craft", recipeId: "plate-chest" });
  expect(forged.state.bank.find((s) => s.defId === "plate-chest")?.qty).toBe(1);
});

test("forge: the hammer counts whether it's in the bank OR equipped (town pool) (ke3.7)", () => {
  const forged = reduce(town([{ defId: "iron-ore", qty: 3 }], ["anvil"], ["blacksmiths-hammer"]), { type: "craft", recipeId: "plate-helmet" });
  expect(forged.state.bank.find((s) => s.defId === "plate-helmet")?.qty).toBe(1);
});

test("forge: ALL metal plate (iron/steel/mithril) is anvil+hammer-gated (ke3.7)", () => {
  const metalPlate = Object.entries(RECIPE).filter(([, r]) =>
    ARMOUR[r.output.defId]?.armourType === "plate" && r.inputs.some((i) => ["iron-ore", "coal", "mithril-ore"].includes(i.defId)),
  );
  expect(metalPlate.length).toBeGreaterThanOrEqual(15); // 5 iron + 5 steel + 5 mithril
  for (const [, r] of metalPlate) {
    expect(r.requires?.station).toBe("anvil");
    expect(r.requires?.tools).toEqual(["blacksmiths-hammer"]);
  }
});

test("forge: chitin/carapace plate alternates stay UNGATED — plate without a forge (ke3.7)", () => {
  // beetle-shell → plate-boots and scorpion-carapace → chest are the deliberate
  // no-forge paths; they must NOT require the anvil.
  expect(RECIPE["plate-boots-beetle"]!.requires).toBeUndefined();
  expect(RECIPE["scorpion-plate-chest"]!.requires).toBeUndefined();
});
