// seyh.31 (owner playtest 2026-10-10: "if I have the same stuff as last time, default to
// having that packed"): the pack sheet replays last run's plan through ordinary `pack`
// actions; a partial replay leaves an honest "Repack the rest" offer only when the bank
// can supply more of it.
import { describe, expect, test } from "bun:test";
import { newGame } from "../src/engine/town";
import { reduce } from "../src/engine/reduce";
import type { GameState, ItemStack } from "../src/engine/types";
import { planActions, restOfPlan, replayPlan, repackOffer, type PackStep } from "../src/web/persist";
import { townView } from "../src/web/town-view";

const withBank = (bank: ItemStack[]): GameState => ({ ...newGame("rp"), bank });
const LAST: PackStep[] = [
  { slot: "weapon", itemId: "sword" },
  { slot: "food", itemId: "ration" },
  { slot: "food", itemId: "ration" },
  { slot: "potion", itemId: "potion" },
];
const localSeed = (s: GameState) => /data-prepare="([^"]+)"/.exec(townView(s, null, false))![1]!;

describe("auto-repack (seyh.31)", () => {
  test("the whole last plan is in the bank → it all packs, via pack actions, and no button is left", () => {
    const s = withBank([{ defId: "sword", qty: 1 }, { defId: "ration", qty: 5 }, { defId: "potion", qty: 2 }]);
    const r = replayPlan(s, LAST);
    expect(r).toMatchObject({ packed: 4, skipped: 0 });
    expect(planActions(r.state.loadout)).toEqual(LAST);
    // identical to driving the reducer by hand
    let hand = s;
    for (const st of LAST) hand = reduce(hand, { type: "pack", slot: st.slot, itemId: st.itemId }).state;
    expect(r.state.loadout).toEqual(hand.loadout);
    expect(repackOffer(r.state, LAST)).toBe(false);
    expect(townView(r.state, localSeed(r.state), repackOffer(r.state, LAST))).not.toContain("data-repack");
  });

  test("partly available → packs what's there; 'Repack the rest' only once the bank can supply more", () => {
    const s = withBank([{ defId: "ration", qty: 1 }, { defId: "potion", qty: 1 }]); // no sword, 1 of 2 rations
    const r = replayPlan(s, LAST);
    expect(r).toMatchObject({ packed: 2, skipped: 2 });
    expect(restOfPlan(LAST, r.state.loadout)).toEqual([{ slot: "weapon", itemId: "sword" }, { slot: "food", itemId: "ration" }]);
    // nothing more the reducer would accept → no button (a dead button would lie)
    expect(repackOffer(r.state, LAST)).toBe(false);
    // another ration arrives (crafted from the sheet's Recipes tab) → the rest is on offer
    const more = { ...r.state, bank: r.state.bank.map((b) => b.defId === "ration" ? { ...b, qty: b.qty + 1 } : b) };
    expect(repackOffer(more, LAST)).toBe("rest");
    const html = townView(more, localSeed(more), "rest");
    expect(html).toContain("↻ Repack the rest");
    // repacking the rest never doubles what's already packed
    const after = replayPlan(more, restOfPlan(LAST, more.loadout)).state;
    expect(after.loadout.food).toEqual([{ defId: "ration", qty: 2 }]);
    expect(after.loadout.potions).toEqual([{ defId: "potion", qty: 1 }]);
  });

  test("after Reset (empty plan) the button says 'Repack last' again", () => {
    const s = withBank([{ defId: "ration", qty: 2 }]);
    expect(repackOffer(s, LAST)).toBe("last");
    expect(townView(s, localSeed(s), "last")).toContain("↻ Repack last");
  });

  test("no last plan → no offer", () => {
    expect(repackOffer(withBank([{ defId: "ration", qty: 2 }]), [])).toBe(false);
  });
});
