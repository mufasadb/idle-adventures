import { test, expect } from "bun:test";
import { damageTaken } from "../src/engine/combat";
import { combatForecast } from "../src/render/render";
import { emptyLoadout } from "../src/engine/loadout";
import { CAMP_DMG_BY_MAP_TIER, MONSTERS } from "../src/data/constants";
import type { Loadout } from "../src/engine/types";

// D102 (cv8): humanoid camps hit harder on deeper maps; nothing else does.
const mithril: Loadout = {
  ...emptyLoadout(),
  equipment: {
    ...emptyLoadout().equipment,
    weapon: "mithril-sword",
    helmet: "mithril-plate-helmet", chest: "mithril-plate-chest", legs: "mithril-plate-legs",
    boots: "mithril-plate-boots", gloves: "mithril-plate-gloves",
  },
};

test("a humanoid camp hits harder on a T5 map than on T1, by the lever", () => {
  expect(MONSTERS["snow-marauder"]!.category).toBe("humanoid");
  const t1 = damageTaken(mithril, "snow-marauder", 0, 1);
  const t5 = damageTaken(mithril, "snow-marauder", 0, 5);
  expect(t5).toBeCloseTo(t1 * CAMP_DMG_BY_MAP_TIER[5]!, 5);
  expect(damageTaken(mithril, "snow-marauder")).toBe(t1); // absent tier = unscaled
});

test("non-humanoids are unaffected by map tier", () => {
  expect(damageTaken(mithril, "ice-troll", 0, 5)).toBe(damageTaken(mithril, "ice-troll", 0, 1));
});

test("still a reward: full mithril clears a T5 camp for well under half its HP", () => {
  const f = combatForecast(mithril, "snow-marauder", 30, undefined, 5);
  expect(f.winning).toBe(true);
  expect(f.dmgIn * (f.toKill - 1)).toBeLessThan(15); // costs HP now, but a fighter with supplies keeps going
  expect(f.dmgIn).toBeGreaterThan(combatForecast(mithril, "snow-marauder", 30, undefined, 1).dmgIn);
});
