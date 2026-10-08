// eor (D103): the web's traffic-light fight verdict + the type/loot readouts that
// replace the round-count forecast. All pure selectors in render.ts.
import { describe, expect, test } from "bun:test";
import { emptyLoadout } from "../src/engine/loadout";
import type { Expedition, Loadout } from "../src/engine/types";
import {
  combatForecast, engagementForecast, fightVerdict, preFightVerdict, engagementVerdict, playerAttackType,
  armourTypesWorn, lootPreview, lootSlots, VERDICT_LABEL,
} from "../src/render/render";
import { rollLoot } from "../src/engine/combat";
import { MAP_SCROLL_ID, MONSTER_TIER_HP_CURVE } from "../src/data/constants";

const sword = (potions: Loadout["potions"] = []): Loadout => {
  const lo = emptyLoadout();
  lo.equipment.weapon = "sword";
  lo.potions = potions;
  return lo;
};

describe("fightVerdict (the classification)", () => {
  test("a winning bare race is a clean win, whatever the potion play-out says", () => {
    expect(fightVerdict(true, null)).toBe("win");
    expect(fightVerdict(true, { victory: false, potionsUsed: 3 })).toBe("win");
  });
  test("a losing race is costly only when potions turn it around", () => {
    expect(fightVerdict(false, { victory: true, potionsUsed: 2 })).toBe("costly");
    expect(fightVerdict(false, { victory: false, potionsUsed: 2 })).toBe("lose");
    expect(fightVerdict(false, null)).toBe("lose"); // no potions to try
  });
  test("a play-out that wins without drinking (poison finishing it) is still clean", () => {
    expect(fightVerdict(false, { victory: true, potionsUsed: 0 })).toBe("win");
  });
  test("every verdict has a short label (≤ 3 words)", () => {
    for (const l of Object.values(VERDICT_LABEL)) expect(l.split(" ").length).toBeLessThanOrEqual(3);
  });
});

describe("preFightVerdict (route end / standing on it)", () => {
  // sword vs forest-boar: you hit 3.75 (3 strikes to its 8 HP), it hits 4.
  test("green when the bare race already wins", () => {
    expect(combatForecast(sword(), "forest-boar", 30).winning).toBe(true);
    expect(preFightVerdict(sword(), "forest-boar", 30)).toBe("win");
  });
  test("orange when only the carried potions (auto-quaffed) win it", () => {
    // 8 HP: the boar's second hit (4+4) drops you before your third strike — bare race lost.
    expect(combatForecast(sword(), "forest-boar", 8).winning).toBe(false);
    expect(preFightVerdict(sword([{ defId: "potion", qty: 2 }]), "forest-boar", 8)).toBe("costly");
  });
  test("red when nothing you carry saves it", () => {
    expect(preFightVerdict(sword(), "forest-boar", 8)).toBe("lose"); // no potions
    // 4 HP: its first hit takes you to 0 before auto-quaff can fire.
    expect(preFightVerdict(sword([{ defId: "potion", qty: 2 }]), "forest-boar", 4)).toBe("lose");
    expect(preFightVerdict(sword([{ defId: "greater-potion", qty: 3 }]), "ancient-wyrm", 30)).toBe("lose");
  });
});

describe("engagementVerdict (mid-fight)", () => {
  const exp = (hp: number, monsterHp: number, potions: Loadout["potions"] = []): Expedition => ({
    mapSeed: "m", pos: { x: 0, y: 0 }, energy: 100, hp, loadout: sword(potions), carry: [], cleared: [],
    combat: { at: { x: 1, y: 1 }, creature: "forest-boar", monsterHp, moveOnWin: true, damageAdd: 0, mitigationAdd: 0, startHp: hp, potionsUsed: 0 },
  });
  test("reads the LIVE monster HP: a wounded boar is a clean win at low HP", () => {
    expect(engagementForecast(exp(5, 3)).winning).toBe(true);
    expect(engagementVerdict(exp(5, 3))).toBe("win");
  });
  test("full-HP boar at 8 HP: orange with potions, red without", () => {
    const full = MONSTER_TIER_HP_CURVE[1]!;
    expect(engagementVerdict(exp(8, full, [{ defId: "potion", qty: 2 }]))).toBe("costly");
    expect(engagementVerdict(exp(8, full))).toBe("lose");
  });
  test("a battle-item damage add can flip the verdict", () => {
    const e = exp(8, MONSTER_TIER_HP_CURVE[1]!);
    expect(engagementVerdict(e)).toBe("lose");
    expect(engagementVerdict({ ...e, combat: { ...e.combat!, damageAdd: 1 } })).toBe("win"); // 4.75 → 2 strikes
  });
});

describe("attack / armour types", () => {
  test("the weapon's damage type; bare hands and an empty bow are melee", () => {
    expect(playerAttackType(sword())).toBe("melee");
    const bow = emptyLoadout();
    bow.equipment.weapon = "bow";
    expect(playerAttackType(bow)).toBe("melee"); // no arrows = a club (D45)
    expect(playerAttackType({ ...bow, ammo: [{ defId: "arrows", qty: 5 }] })).toBe("ranged");
    const staff = emptyLoadout();
    staff.equipment.weapon = "fire-staff";
    expect(playerAttackType(staff)).toBe("magic");
    expect(playerAttackType(emptyLoadout())).toBe("melee");
  });
  test("worn armour classes, most pieces first", () => {
    const lo = emptyLoadout();
    expect(armourTypesWorn(lo.equipment)).toEqual([]);
    lo.equipment.helmet = "light-helmet";
    lo.equipment.chest = "plate-chest";
    lo.equipment.legs = "plate-legs";
    expect(armourTypesWorn(lo.equipment)).toEqual(["plate", "light"]);
  });
});

describe("loot preview + bag slots", () => {
  test("sure drops vs chance drops (a camp's map is a maybe)", () => {
    expect(lootPreview("forest-boar")).toEqual({ sure: [{ defId: "boar-hide", qty: 2 }], maybe: [] });
    const bandit = lootPreview("forest-bandit");
    expect(bandit.maybe).toContain(MAP_SCROLL_ID);
    expect(bandit.sure.map((s) => s.defId)).not.toContain(MAP_SCROLL_ID);
  });
  test("need = new stacks the rolled loot opens; free = stacks left — the engage() fit check as counts", () => {
    const lo = sword();
    const at = { x: 2, y: 3 };
    const loot = rollLoot("s", "forest-boar", at).filter((s) => s.defId !== MAP_SCROLL_ID);
    const empty = lootSlots("s", "forest-boar", at, lo, []);
    expect(empty.need).toBe(loot.length);
    // an existing partial stack of the same loot absorbs it — no new slot
    expect(lootSlots("s", "forest-boar", at, lo, [{ defId: "boar-hide", qty: 1 }]).need).toBe(0);
    expect(lootSlots("s", "forest-boar", at, lo, [{ defId: "flint", qty: 1 }]).free).toBe(empty.free - 1);
  });
});
