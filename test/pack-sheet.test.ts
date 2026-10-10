// d13: the packing screen's pure selectors (render.ts) and the rendered sheet. Every
// number the screen shows must come from the engine's own carry math, so these tests
// pin the selectors to carryCap / consumableSlots / freeLootStacks rather than to
// hand-computed values.
import { describe, expect, test } from "bun:test";
import { carryBreakdown, bagRows, bagCells, hintNeed, expectedHaul, toolGloss, POCKET_SLOTS, rejectCopy, tradeoff, tradeoffDelta, tradeoffDeltaText, energyReach } from "../src/render/render";
import { energyCapOf } from "../src/engine/carry";
import { heldFoodEnergy, foodEnergyOf } from "../src/engine/food";
import { moveCost } from "../src/engine/move";
import { toolSpeedFor } from "../src/engine/tools";
import { carryCap, consumableSlots, freeLootStacks } from "../src/engine/carry";
import { newGame } from "../src/engine/town";
import { reduce } from "../src/engine/reduce";
import { BACKPACK_SLOTS, TRANSPORT_CARRY, PANNIERS, BASE_CARRY_SLOTS, HINT_FALLBACK, STACK_CAP, MAX_ENERGY, NODE_HARDNESS, NODE_TOOL } from "../src/data/constants";
import type { Equipment, GameState, Loadout, LoadoutSlot } from "../src/engine/types";
import { planWithout } from "../src/web/feedback";
import { townView } from "../src/web/town-view";

const bareEq = (): Equipment => newGame("d13").loadout.equipment;
const lo = (patch: Partial<Loadout> = {}, eq: Partial<Equipment> = {}): Loadout => ({ ...newGame("d13").loadout, ...patch, equipment: { ...bareEq(), ...eq } });

function packAll(s: GameState, steps: [LoadoutSlot, string, number?][]): GameState {
  for (const [slot, itemId, n = 1] of steps) for (let i = 0; i < n; i++) {
    const r = reduce(s, { type: "pack", slot, itemId });
    expect(r.events.find((e) => e.type === "action-rejected")).toBeUndefined();
    s = r.state;
  }
  return s;
}

describe("carryBreakdown — capacity by source", () => {
  test("parts always sum to the engine's carryCap, for every backpack × transport × panniers", () => {
    for (const backpack of [null, ...Object.keys(BACKPACK_SLOTS)]) {
      for (const transport of [null, ...Object.keys(TRANSPORT_CARRY)]) {
        for (const panniers of [null, ...PANNIERS]) {
          const eq = { ...bareEq(), backpack, transport, panniers };
          const parts = carryBreakdown(eq);
          expect(parts.reduce((n, p) => n + p.slots, 0)).toBe(carryCap(eq));
          expect(parts.every((p) => p.slots > 0)).toBe(true);
        }
      }
    }
  });

  test("a backpack REPLACES the pockets (one group), transport and panniers add on", () => {
    expect(carryBreakdown(bareEq())).toEqual([{ source: "pockets", defId: null, slots: BASE_CARRY_SLOTS }]);
    expect(POCKET_SLOTS).toBe(BASE_CARRY_SLOTS);
    const parts = carryBreakdown({ ...bareEq(), backpack: "leather", transport: "horse" });
    expect(parts.map((p) => p.source)).toEqual(["backpack", "transport"]);
    expect(parts[0]!.slots).toBe(BACKPACK_SLOTS.leather!);
  });

  test("panniers without a beast add nothing (no group); on a mule they do", () => {
    expect(carryBreakdown({ ...bareEq(), transport: "wagon", panniers: "panniers" }).map((p) => p.source)).toEqual(["pockets", "transport"]);
    expect(carryBreakdown({ ...bareEq(), transport: "mule", panniers: "panniers" }).map((p) => p.source)).toEqual(["pockets", "transport", "panniers"]);
  });
});

describe("bagRows / bagCells — slot cost per packed item", () => {
  const loadouts: Loadout[] = [
    lo(),
    lo({ food: [{ defId: "ration", qty: 3 }], potions: [{ defId: "potion", qty: 2 }] }, { tools: ["pick", "axe"] }),
    lo({ ammo: [{ defId: "arrows", qty: 25 }], flasks: [{ defId: "fire-flask", qty: 4 }] }), // 3 + 2 slots
    lo({ ammo: [{ defId: "arrows", qty: 120 }] }, { quiver: "quiver" }), // 12 slots, the quiver takes 10
    lo({ ammo: [{ defId: "arrows", qty: 40 }] }, { quiver: "quiver" }), // all in the quiver
    lo({ spares: [{ defId: "iron-sword", qty: 1 }] }, { tools: ["tent"] }),
  ];

  test("rows' slots sum to consumableSlots; cells are one per slot", () => {
    for (const l of loadouts) {
      const slots = consumableSlots(l);
      expect(bagRows(l).reduce((n, r) => n + r.slots, 0)).toBe(slots);
      expect(bagCells(l).length).toBe(slots);
    }
  });

  test("flasks and arrows show per-slot counts; the quiver holds the first slots' worth", () => {
    expect(bagCells(loadouts[2]!).map((c) => `${c.defId}:${c.qty}`)).toEqual(["arrows:10", "arrows:10", "arrows:5", "fire-flask:3", "fire-flask:1"]);
    const q = bagRows(loadouts[3]!).find((r) => r.defId === "arrows")!;
    expect(q).toMatchObject({ qty: 120, slots: 2, quivered: 10, perSlot: 10 });
    expect(bagCells(loadouts[3]!).map((c) => c.qty)).toEqual([10, 10]);
    expect(bagRows(loadouts[4]!)[0]).toMatchObject({ slots: 0, quivered: 4 });
  });

  test("tools list first with their pack slot, then the registry's kinds", () => {
    expect(bagRows(loadouts[1]!).map((r) => [r.defId, r.packSlot])).toEqual([["pick", "tool"], ["axe", "tool"], ["ration", "food"], ["potion", "potion"]]);
  });
});

describe("hintNeed — scout reports checked against the plan", () => {
  test("a bounty hint names its node's tools; AND-gated hunting needs both", () => {
    expect(hintNeed("timber", lo())).toMatchObject({ want: "Axe", ok: false, node: "wood" });
    expect(hintNeed("timber", lo({}, { tools: ["iron-axe"] }))).toMatchObject({ have: "Iron Axe", ok: true });
    expect(hintNeed("game", lo({}, { tools: ["trap"] }))!.ok).toBe(false);
    expect(hintNeed("game", lo({}, { tools: ["trap", "knife"] }))!.ok).toBe(true);
    expect(hintNeed("forage", lo())).toBeNull(); // bare hands
  });

  test("a ground hint is answered by any gear that opens, speeds or wards its terrain", () => {
    expect(hintNeed("ridges", lo())).toMatchObject({ ok: false, gear: "climbing-pick" });
    expect(hintNeed("ridges", lo({}, { tools: ["climbing-pick"] }))!.ok).toBe(true);
    expect(hintNeed("boggy", lo({}, { transport: "horse" }))).toMatchObject({ ok: true, have: "Horse" }); // horse ×1.2 on mud
    expect(hintNeed("choked", lo({}, { tools: ["filter-mask"] }))!.ok).toBe(true); // TERRAIN_HP_WARD
    expect(hintNeed("open-country", lo())).toBeNull();
  });

  test("a threat hint asks for the armour that resists it / the attack that beats it", () => {
    expect(hintNeed("archers", lo())!.want).toBe("plate armour");
    expect(hintNeed("spells", lo())!.want).toBe("robe armour");
    expect(hintNeed("steel", lo({}, { chest: "light-chest" }))!.ok).toBe(false);
    expect(hintNeed("shells", lo())!.want).toBe("a magic weapon");
    expect(hintNeed("ancients", lo({ potions: [{ defId: "potion", qty: 2 }] }))).toMatchObject({ ok: true, have: "2 potions" });
    expect(hintNeed("quiet", lo())).toBeNull();
  });

  test("fallback (nothing remarkable) hints ask for nothing; thin forage asks for food", () => {
    for (const f of Object.values(HINT_FALLBACK)) expect(hintNeed(f.id, lo())).toBeNull();
    expect(hintNeed("thin", lo())!.ok).toBe(false);
    expect(hintNeed("thin", lo({ food: [{ defId: "ration", qty: 1 }] }))!.ok).toBe(true);
  });
});

describe("expected haul + tool gloss", () => {
  test("forage always; each tool adds its kind; a rod adds fish", () => {
    expect(expectedHaul([])).toEqual(["forage"]);
    expect(expectedHaul(["pick", "trap"])).toEqual(["ore", "forage"]); // a trap alone can't hunt
    expect(expectedHaul(["pick", "axe", "trap", "knife", "fishing-rod"])).toEqual(["ore", "wood", "forage", "animals", "fish"]);
  });

  test("a tool says what it opens, naming the partner a hunt still needs", () => {
    expect(toolGloss("pick", [])).toBe("ore");
    expect(toolGloss("trap", ["trap"])).toBe("animals, with a knife");
    expect(toolGloss("trap", ["trap", "knife"])).toBe("animals");
    expect(toolGloss("climbing-pick", [])).toContain("mountain");
    expect(toolGloss("ration", [])).toBeNull();
  });

  test("pack refusals read as sentences, not reason codes", () => {
    expect(rejectCopy("no-slot", undefined, "pack")).toContain("bag full");
    expect(rejectCopy("insufficient", undefined, "pack")).toBe("none left in the bank");
  });
});

describe("planWithout — unpack one from a given slot", () => {
  test("taking off a worn sword leaves the spare sword (and vice versa)", () => {
    let s: GameState = { ...newGame("d13"), bank: [{ defId: "iron-sword", qty: 2 }] };
    s = packAll(s, [["weapon", "iron-sword"], ["spare", "iron-sword"]]);
    expect(planWithout(s.loadout, "iron-sword", "weapon")).toEqual([{ slot: "spare", itemId: "iron-sword" }]);
    expect(planWithout(s.loadout, "iron-sword", "spare")).toEqual([{ slot: "weapon", itemId: "iron-sword" }]);
    expect(planWithout(s.loadout, "iron-sword", "chest")).toBeNull();
  });
});

describe("townView prep — the rendered packing sheet", () => {
  const build = () => {
    let s: GameState = { ...newGame("d13-view"), bank: [
      { defId: "leather", qty: 1 }, { defId: "horse", qty: 1 }, { defId: "iron-sword", qty: 1 }, { defId: "pick", qty: 1 },
      { defId: "ration", qty: 5 }, { defId: "oak-log", qty: 4 },
    ] };
    s = packAll(s, [["backpack", "leather"], ["transport", "horse"], ["weapon", "iron-sword"], ["tool", "pick"], ["food", "ration", 3]]);
    return s;
  };
  const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

  test("the gauge has one cell per capacity slot — packed ones filled, the rest loot ×STACK_CAP", () => {
    const s = build();
    const seed = /data-prepare="([^"]+)"/.exec(townView(s, null, false))![1]!; // the overview's free local map
    const prepHtml = townView(s, seed, false);
    const cap = carryCap(s.loadout.equipment), free = freeLootStacks(s.loadout);
    expect(count(prepHtml, /class="pk-cell full"/g)).toBe(consumableSlots(s.loadout));
    expect(count(prepHtml, /class="pk-cell free"/g)).toBe(free);
    expect(prepHtml).toContain(`BAG ${cap - free}/${cap}`);
    expect(prepHtml).toContain(`room for <b>${free * STACK_CAP}</b> loot`); // seyh.4: the trade-off line
  });

  test("bank: packables are tappable, materials are not; bag rows unpack by slot", () => {
    const s = build();
    const seed = /data-prepare="([^"]+)"/.exec(townView(s, null, false))![1]!;
    const html = townView(s, seed, false);
    expect(html).toMatch(/data-bank="ration"[^>]*data-pack="ration" data-slot="food"/);
    expect(html).not.toContain('data-pack="oak-log"');
    expect(html).toContain('class="pk-chip mat"');
    expect(html).toContain('data-unpack="pick" data-unpack-slot="tool"');
    expect(html).toContain(`data-embark="${seed}"`);
  });
});

// seyh.4: the packing trade-off — reach (energy as tiles of open ground / gathers) vs
// room for loot. Pinned to the engine's own helpers, never hand numbers.
describe("tradeoff / energyReach — the one packing trade-off", () => {
  const withBank = (bank: { defId: string; qty: number }[]): GameState => ({ ...newGame("seyh4"), bank });

  test("tradeoff reads MAX_ENERGY + gear, the packed food's energy and free slots × STACK_CAP", () => {
    let s = withBank([{ defId: "ration", qty: 5 }, { defId: "canteen", qty: 1 }, { defId: "axe", qty: 1 }]);
    s = packAll(s, [["tool", "canteen"], ["tool", "axe"], ["food", "ration", 3]]);
    const t = tradeoff(s.loadout);
    expect(t.startEnergy).toBe(MAX_ENERGY + energyCapOf(s.loadout.equipment));
    expect(t.foodEnergy).toBe(heldFoodEnergy(s.loadout.food));
    expect(t.foodEnergy).toBe(3 * foodEnergyOf("ration"));
    expect(t.energy).toBe(t.startEnergy + t.foodEnergy);
    expect(t.freeSlots).toBe(freeLootStacks(s.loadout));
    expect(t.lootRoom).toBe(freeLootStacks(s.loadout) * STACK_CAP);
    expect(t.tiles).toBe(Math.floor(t.energy / moveCost("plains", null, s.loadout.equipment.tools)));
    // an axe packed: a gather is a chop, at the engine's hardness ÷ the axe's speed
    expect(t.gatherKind).toBe("wood");
    expect(t.gathers).toBe(Math.floor(t.energy / (NODE_HARDNESS.wood / toolSpeedFor(["canteen", "axe"], NODE_TOOL.wood)!)));
  });

  test("packing one ration: + its energy ≈ + energy ÷ open-ground step tiles, and − one loot stack", () => {
    const s0 = withBank([{ defId: "ration", qty: 5 }]);
    const s1 = packAll(s0, [["food", "ration"]]);
    const a = tradeoff(s0.loadout), b = tradeoff(s1.loadout);
    const step = moveCost("plains", null, []);
    expect(b.energy - a.energy).toBe(foodEnergyOf("ration"));
    expect(b.tiles - a.tiles).toBe(Math.round(foodEnergyOf("ration") / step));
    expect(b.lootRoom - a.lootRoom).toBe(-STACK_CAP);
    const d = tradeoffDelta(a, b)!;
    expect(d).toEqual({ energy: foodEnergyOf("ration"), tiles: Math.round(foodEnergyOf("ration") / step), loot: -STACK_CAP });
    expect(tradeoffDeltaText(d)).toBe(`+${d.energy}e ≈ +${d.tiles} tiles · −${STACK_CAP} loot`);
    expect(tradeoffDelta(a, a)).toBeNull();
  });

  test("a horse changes the tile estimate (transport divisor) and the loot room (+slots) in the same line", () => {
    const s0 = packAll(withBank([{ defId: "ration", qty: 5 }, { defId: "horse", qty: 1 }]), [["food", "ration", 2]]);
    const s1 = packAll(s0, [["transport", "horse"]]);
    const a = tradeoff(s0.loadout), b = tradeoff(s1.loadout);
    expect(b.energy).toBe(a.energy); // a horse adds no energy…
    expect(b.tiles).toBe(Math.floor(b.energy / moveCost("plains", "horse", [])));
    expect(b.tiles).toBeGreaterThan(a.tiles); // …but each open-ground step is cheaper
    expect(b.lootRoom - a.lootRoom).toBe((carryCap(s1.loadout.equipment) - carryCap(s0.loadout.equipment)) * STACK_CAP);
    expect(b.lootRoom).toBeGreaterThan(a.lootRoom);
    const d = tradeoffDelta(a, b)!;
    expect(tradeoffDeltaText(d)).toBe(`≈ +${d.tiles} tiles · +${d.loot} loot`); // no "0e" when only the reach moved
  });

  test("energyReach: transport divides the open-ground step; no gathering tool = a bare-handed forage", () => {
    const foot = energyReach(600, { transport: null, tools: [] });
    const horse = energyReach(600, { transport: "horse", tools: [] });
    expect(foot.tiles).toBe(Math.floor(600 / moveCost("plains", null, [])));
    expect(horse.tiles).toBe(Math.floor(600 / moveCost("plains", "horse", [])));
    expect(horse.tiles).toBeGreaterThan(foot.tiles);
    expect(foot.gatherKind).toBe("herb");
    expect(foot.gathers).toBe(Math.floor(600 / NODE_HARDNESS.herb));
    // a trap alone can't hunt (D83 AND-gate) — still forage; trap + knife opens animals
    expect(energyReach(600, { transport: null, tools: ["trap"] }).gatherKind).toBe("herb");
    expect(energyReach(600, { transport: null, tools: ["trap", "knife"] }).gatherKind).toBe("animal");
    expect(energyReach(-5, { transport: null, tools: [] })).toMatchObject({ tiles: 0, gathers: 0 });
  });

  test("the packing sheet renders the trade-off line from tradeoff()", () => {
    let s: GameState = withBank([{ defId: "ration", qty: 5 }, { defId: "pick", qty: 1 }]);
    s = packAll(s, [["tool", "pick"], ["food", "ration", 2]]);
    const seed = /data-prepare="([^"]+)"/.exec(townView(s, null, false))![1]!;
    const html = townView(s, seed, false);
    const t = tradeoff(s.loadout);
    expect(html).toContain("data-trade-delta");
    expect(html).toContain(`reach ≈ <b>${t.tiles}</b> tiles of open ground or <b>${t.gathers}</b> gathers`);
    expect(html).toContain(`room for <b>${t.lootRoom}</b> loot`);
    expect(html).toContain(`⚡ <b>${t.startEnergy}</b> + <b>${t.foodEnergy}</b> food`);
  });
});
