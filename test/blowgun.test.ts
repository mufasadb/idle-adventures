// si7.6.6 — blowgun + poisoned darts: an alt-ranged style whose poison ignores armour.
import { test, expect } from "bun:test";
import { scanForPoi, isTier1Monster, isInterior } from "./helpers";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import type { Poi } from "../src/engine/grid";
import { hasAmmo, strikeExchange } from "../src/engine/combat";
import { PLAYER_BASE_HP, MAX_ENERGY, RECIPE, AMMO_POISON, WEAPONS, BIOMES, DARTS_PER_CRAFT } from "../src/data/constants";
import type { GameState, ItemStack } from "../src/engine/types";

const monsterMap = (): { seed: string; poi: Poi } => scanForPoi("blowgun-scan", (p) => isTier1Monster(p) && isInterior(p));

function shooter(seed: string, poi: Poi, weapon: string, ammo: ItemStack[]): GameState {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = weapon;
  loadout.ammo = ammo;
  return {
    seed: "g", phase: "expedition", bank: [], loadout: emptyLoadout(),
    expedition: {
      mapSeed: seed, pos: { x: poi.x, y: poi.y + 1 }, energy: MAX_ENERGY,
      hp: PLAYER_BASE_HP, loadout, carry: [], cleared: [],
    },
  };
}

test("a blowgun with darts engages at range and spends a DART, not an arrow", () => {
  const { seed, poi } = monsterMap();
  const s = shooter(seed, poi, "blowgun", [{ defId: "arrows", qty: 5 }, { defId: "blow-dart", qty: 5 }]);
  const engaged = reduce(s, { type: "fight", at: { x: poi.x, y: poi.y } });
  expect(engaged.events[0]).toMatchObject({ type: "engaged", ranged: true });
  const r = reduce(engaged.state, { type: "fight" });
  expect(r.events[0]).toMatchObject({ type: "exchanged", arrowSpent: true });
  const ammo = r.state.expedition!.loadout.ammo ?? [];
  expect(ammo.find((a) => a.defId === "arrows")?.qty).toBe(5);
  const darts = ammo.find((a) => a.defId === "blow-dart")?.qty ?? 0;
  expect(darts).toBeLessThan(5);
});

test("a bow ignores darts; a blowgun ignores arrows (weapon-specific ammo)", () => {
  const bow = emptyLoadout(); bow.equipment.weapon = "bow"; bow.ammo = [{ defId: "venom-dart", qty: 10 }];
  expect(hasAmmo(bow)).toBe(false);
  const gun = emptyLoadout(); gun.equipment.weapon = "blowgun"; gun.ammo = [{ defId: "arrows", qty: 10 }];
  expect(hasAmmo(gun)).toBe(false);
  const { seed, poi } = monsterMap();
  const r = reduce(shooter(seed, poi, "blowgun", [{ defId: "arrows", qty: 10 }]), { type: "fight", at: { x: poi.x, y: poi.y } });
  expect(r.events[0]).toMatchObject({ type: "action-rejected" }); // no darts → no ranged engage
});

test("a dart hit poisons the monster; venom darts poison harder than herb darts", () => {
  const { poi } = monsterMap();
  const hit = (ammo: string) => {
    const l = emptyLoadout(); l.equipment.weapon = "blowgun"; l.ammo = [{ defId: ammo, qty: 5 }];
    return strikeExchange(l, PLAYER_BASE_HP, 999, poi.creature!, {});
  };
  expect(hit("blow-dart").poisonDmg).toBe(AMMO_POISON["blow-dart"]!.dmg);
  expect(hit("venom-dart").poisonDmg).toBe(AMMO_POISON["venom-dart"]!.dmg);
  expect(hit("venom-dart").poisonDmg).toBeGreaterThan(hit("blow-dart").poisonDmg);
});

test("a weaker dart doesn't overwrite a stronger poison already ticking", () => {
  const { poi } = monsterMap();
  const l = emptyLoadout(); l.equipment.weapon = "blowgun"; l.ammo = [{ defId: "blow-dart", qty: 5 }];
  const r = strikeExchange(l, PLAYER_BASE_HP, 999, poi.creature!, { poison: { dmg: 3, rounds: 4 } });
  expect(r.poisonDmg).toBe(3);
});

test("the blowgun is a weaker shot than the bow — the poison is its edge", () => {
  expect(WEAPONS.blowgun!.damage).toBeLessThan(WEAPONS.bow!.damage);
  expect(WEAPONS.blowgun!.dmgType).toBe("ranged");
});

test("blowgun + darts are built from FISHED reed + amber; the dart's poison is the tier gate", () => {
  expect(RECIPE.blowgun!.inputs.map((i) => i.defId).sort()).toEqual(["amber", "reed"]);
  expect(RECIPE["blow-dart"]!.inputs.map((i) => i.defId)).toContain("forest-herb");
  expect(RECIPE["venom-dart"]!.inputs.map((i) => i.defId)).toContain("venom-oil");
  expect(RECIPE["blow-dart"]!.output.qty).toBe(DARTS_PER_CRAFT);
  const catches = new Set(Object.values(BIOMES).flatMap((b) => Object.values(b.fishTable ?? {}).flatMap((row) => Object.keys(row))));
  expect(catches.has("reed")).toBe(true);
  expect(catches.has("amber")).toBe(true);
});
