// On-map item use (82r): spare gear packs into carry slots, don/doff swaps any
// equipment slot mid-run for DON_DOFF_ENERGY, and the candidate kit must fit its
// OWN capacity (backpack/transport/panniers swaps have no special cases).
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { legalActions } from "../src/sim/legal";
import { candidateMaps } from "../src/engine/town";
import { stackCapOf } from "../src/engine/carry";
import { generateGrid, rollBiome } from "../src/engine/grid";
import { rollLoot } from "../src/engine/combat";
import { DON_DOFF_ENERGY, STACK_CAP, BASE_CARRY_SLOTS, PLAYER_BASE_HP } from "../src/data/constants";
import type { GameState, ItemStack } from "../src/engine/types";

function onMap(opts: {
  carry?: ItemStack[];
  weapon?: string | null;
  tools?: string[];
  transport?: string | null;
  backpack?: string | null;
  panniers?: string | null;
  energy?: number;
} = {}): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = opts.weapon === undefined ? "sword" : opts.weapon;
  loadout.equipment.tools = opts.tools ?? [];
  loadout.equipment.transport = opts.transport ?? null;
  loadout.equipment.backpack = opts.backpack ?? null;
  loadout.equipment.panniers = opts.panniers ?? null;
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: "dd-seed", pos: { x: 0, y: 19 }, energy: opts.energy ?? 100,
      hp: 30, loadout, carry: opts.carry ?? [], cleared: [], // auto-eat off (no autoEatFood)
    },
  };
}

test("gear takes one slot per piece in carry; loot still stacks", () => {
  expect(stackCapOf("sword")).toBe(1);
  expect(stackCapOf("pick" as string)).toBe(1); // tools are gear
  expect(stackCapOf("iron-ore")).toBe(STACK_CAP);
});

test("pack slot=spare accepts gear, rejects non-gear and over-bank", () => {
  const town: GameState = { seed: "t", phase: "town", bank: [{ defId: "silver-sword", qty: 1 }, { defId: "potion", qty: 2 }], loadout: emptyLoadout(), expedition: null };
  const ok = reduce(town, { type: "pack", slot: "spare", itemId: "silver-sword" });
  expect(ok.events[0]).toMatchObject({ type: "packed", defId: "silver-sword", slot: "spare" });
  expect(ok.state.loadout.spares).toEqual([{ defId: "silver-sword", qty: 1 }]);
  // a potion is not gear — it has its own slot
  expect(reduce(town, { type: "pack", slot: "spare", itemId: "potion" }).events[0]).toMatchObject({ type: "action-rejected", reason: "wrong-slot" });
  // second copy exceeds the bank's single silver-sword
  expect(reduce(ok.state, { type: "pack", slot: "spare", itemId: "silver-sword" }).events[0]).toMatchObject({ type: "action-rejected", reason: "insufficient" });
});

test("embark expands spares into carry as one piece per stack and clears loadout.spares", () => {
  const seedState: GameState = { seed: "t2", phase: "town", bank: [{ defId: "silver-sword", qty: 2 }], loadout: emptyLoadout(), expedition: null };
  let s = reduce(seedState, { type: "pack", slot: "spare", itemId: "silver-sword" }).state;
  s = reduce(s, { type: "pack", slot: "spare", itemId: "silver-sword" }).state;
  expect(s.loadout.spares).toEqual([{ defId: "silver-sword", qty: 2 }]); // merged plan (slots counted per-unit)
  const offer = candidateMaps(s.seed, 0)[0]!;
  const embarked = reduce(s, { type: "embark", mapSeed: offer.mapSeed }).state;
  expect(embarked.expedition!.carry).toEqual([{ defId: "silver-sword", qty: 1 }, { defId: "silver-sword", qty: 1 }]); // per-piece stacks
  expect(embarked.expedition!.loadout.spares).toEqual([]); // no double slot-count
  expect(embarked.bank).toEqual([]); // both debited
});

test("don swaps the worn piece into carry and spends energy", () => {
  const s = onMap({ carry: [{ defId: "silver-sword", qty: 1 }] });
  const { state, events } = reduce(s, { type: "don", itemId: "silver-sword" });
  expect(events[0]).toMatchObject({ type: "donned", defId: "silver-sword", slot: "weapon", displaced: "sword", energy: 100 - DON_DOFF_ENERGY });
  expect(state.expedition!.loadout.equipment.weapon).toBe("silver-sword");
  expect(state.expedition!.carry).toEqual([{ defId: "sword", qty: 1 }]); // displaced piece stowed
  expect(state.expedition!.energy).toBe(100 - DON_DOFF_ENERGY);
});

test("don a tool adds it; doff removes it to carry", () => {
  const donned = reduce(onMap({ carry: [{ defId: "pick", qty: 1 }] }), { type: "don", itemId: "pick" });
  expect(donned.events[0]).toMatchObject({ type: "donned", defId: "pick", slot: "tool", displaced: null });
  expect(donned.state.expedition!.loadout.equipment.tools).toEqual(["pick"]);
  expect(donned.state.expedition!.carry).toEqual([]);
  const doffed = reduce(donned.state, { type: "doff", itemId: "pick" });
  expect(doffed.events[0]).toMatchObject({ type: "doffed", defId: "pick", slot: "tool" });
  expect(doffed.state.expedition!.loadout.equipment.tools).toEqual([]);
  expect(doffed.state.expedition!.carry).toEqual([{ defId: "pick", qty: 1 }]);
});

test("don/doff rejections: not-carried, not-worn, wrong-slot, exhausted", () => {
  expect(reduce(onMap(), { type: "don", itemId: "silver-sword" }).events[0]).toMatchObject({ type: "action-rejected", reason: "not-carried" });
  expect(reduce(onMap(), { type: "doff", itemId: "pick" }).events[0]).toMatchObject({ type: "action-rejected", reason: "not-worn" });
  expect(reduce(onMap({ carry: [{ defId: "iron-ore", qty: 1 }] }), { type: "don", itemId: "iron-ore" }).events[0]).toMatchObject({ type: "action-rejected", reason: "wrong-slot" });
  // exhausted only bites OUT of combat (67e: in-combat swap costs a monster turn, not energy)
  const tired = onMap({ carry: [{ defId: "silver-sword", qty: 1 }], energy: DON_DOFF_ENERGY - 1 });
  expect(reduce(tired, { type: "don", itemId: "silver-sword" }).events[0]).toMatchObject({ type: "action-rejected", reason: "exhausted" });
});

test("don while engaged is now allowed — it costs a monster turn, not energy (67e)", () => {
  const engaged = onMap({ carry: [{ defId: "silver-sword", qty: 1 }], energy: 0 }); // 0 energy: proves it's not an energy cost
  engaged.expedition!.combat = { at: { x: 0, y: 18 }, creature: "werewolf", monsterHp: 8, moveOnWin: false, damageAdd: 0, mitigationAdd: 0, startHp: 30, potionsUsed: 0 };
  const r = reduce(engaged, { type: "don", itemId: "silver-sword" });
  expect(r.events.find((e) => e.type === "donned")).toBeDefined(); // swap succeeded despite 0 energy
  expect(r.events.find((e) => e.type === "provoked")).toMatchObject({ creature: "werewolf" }); // the monster took its turn
  expect(r.state.expedition!.loadout.equipment.weapon).toBe("silver-sword");
});

test("doffing the backpack is rejected when the smaller kit can't hold the bag", () => {
  // starter pack = 8 slots; bare = BASE_CARRY_SLOTS (6). 7 loot stacks + the
  // doffed pack itself (8) exceed the bare cap → carry-full, state untouched.
  const loot = Array.from({ length: 7 }, (_, i) => ({ defId: `ore-${i}`, qty: 1 }));
  const s = onMap({ backpack: "small-backpack", carry: loot });
  const { state, events } = reduce(s, { type: "doff", itemId: "small-backpack" });
  expect(events[0]).toMatchObject({ type: "action-rejected", reason: "carry-full" });
  expect(state).toBe(s); // rejected actions return the ORIGINAL state
  // With a light bag it fits: 3 stacks + the pack = 4 ≤ 6 bare slots.
  const light = onMap({ backpack: "small-backpack", carry: loot.slice(0, 3) });
  const ok = reduce(light, { type: "doff", itemId: "small-backpack" });
  expect(ok.events[0]).toMatchObject({ type: "doffed", defId: "small-backpack", slot: "backpack" });
  expect(ok.state.expedition!.carry).toHaveLength(4);
});

test("doffing the beast under loaded panniers is rejected (capacity is the candidate's own)", () => {
  // horse (+2) + panniers (+4) on bare 6 = 12 slots. 11 loot stacks + the
  // doffed horse = 12 > bare 6 + inert panniers → carry-full.
  const loot = Array.from({ length: 11 }, (_, i) => ({ defId: `ore-${i}`, qty: 1 }));
  const s = onMap({ transport: "horse", panniers: "panniers", carry: loot });
  expect(reduce(s, { type: "doff", itemId: "horse" }).events[0]).toMatchObject({ type: "action-rejected", reason: "carry-full" });
  expect(BASE_CARRY_SLOTS).toBe(6); // the arithmetic above leans on this
});

test("legalActions surfaces don/doff/pack-spare candidates through speculative reduce (D29)", () => {
  const s = onMap({ carry: [{ defId: "silver-sword", qty: 1 }], tools: ["pick"] });
  const legal = legalActions(s);
  expect(legal).toContainEqual({ type: "don", itemId: "silver-sword" });
  expect(legal).toContainEqual({ type: "doff", itemId: "sword" });
  expect(legal).toContainEqual({ type: "doff", itemId: "pick" });
  const town: GameState = { seed: "t3", phase: "town", bank: [{ defId: "silver-sword", qty: 1 }], loadout: emptyLoadout(), expedition: null };
  expect(legalActions(town)).toContainEqual({ type: "pack", slot: "spare", itemId: "silver-sword" });
});

// idle-adventure-xe4: don/doff ARE legal mid-engagement (67e) and mutate carry.
// Doffing armour adds a carry stack without touching freeLootStacks, so the
// engage-time loot fit-check is invalidated — victory's addToCarry(...)! then
// returns null and carry:null gets written into state (silent corruption).
function mapWithMonster(creature: string): { seed: string; poi: { x: number; y: number; creature: string } } {
  for (let i = 0; i < 500; i++) {
    const seed = `xe4-scan-${i}`;
    const grid = generateGrid(seed, rollBiome(seed), 1);
    const poi = grid.pois.find((p) => p.kind === "monster" && p.creature === creature);
    if (poi) return { seed, poi: { x: poi.x, y: poi.y, creature: poi.creature! } };
  }
  throw new Error("no map with " + creature);
}

test("doff mid-fight with the bag at the loot edge is rejected carry-full (xe4)", () => {
  const { seed, poi } = mapWithMonster("forest-boar");
  const loot = rollLoot("g", poi.creature, { x: poi.x, y: poi.y }).filter((s) => s.defId !== "map-scroll");
  expect(loot.length).toBeGreaterThan(0); // the fit-check must have something to reject on
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  loadout.equipment.helmet = "light-helmet";
  // fill carry so exactly `loot.length` free stacks remain at engage
  const junk = Array.from({ length: BASE_CARRY_SLOTS - loot.length }, (_, i) => ({ defId: `junk-${i}`, qty: 1 }));
  const base: GameState = {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed, pos: { x: poi.x, y: poi.y }, energy: 50, hp: PLAYER_BASE_HP,
      loadout, carry: junk, cleared: [],
    },
  };
  // engage: fit-check passes because the loot exactly fits the free stacks
  const engaged = reduce(base, { type: "fight" });
  expect(engaged.state.expedition?.combat).toBeDefined();
  // doffing the helmet would add a carry stack and break the pending-loot fit —
  // it must be rejected so the invariant the victory path relies on holds.
  const afterDoff = reduce(engaged.state, { type: "doff", itemId: "light-helmet" });
  expect(afterDoff.events[0]).toMatchObject({ type: "action-rejected", reason: "carry-full" });
  // fight to the end; carry must never come out null
  let s = afterDoff.state;
  let guard = 0;
  while (s.expedition?.combat && ++guard < 100) s = reduce(s, { type: "fight" }).state;
  expect(s.expedition?.carry).not.toBeNull();
});
