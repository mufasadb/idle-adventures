import { test, expect } from "bun:test";
import { flavorDetail, matchupLessons, combatForecast, poiGlyph, kindLabel, POI_CHAR, itemSources, formatEvent, setEnergyUnit, costBand, haulRoom, haulLine } from "../src/render/render";
import { emptyLoadout } from "../src/engine/loadout";
import { playerDamage, damageTaken } from "../src/engine/combat";
import { MONSTERS, MONSTER_TIER_HP_CURVE, BACKPACK_SLOTS, STACK_CAP } from "../src/data/constants";
import type { ItemStack } from "../src/engine/types";

// 1z7: the three render.ts grid drawers (render/renderGridText/renderGridHtml) were
// used by zero shipped surfaces and have been removed — the web and headless console
// each draw their own grid from the shared glyph maps. What remains here covers the
// live selectors render.ts still exports.

// --- perception flavor (9u9.2): facts → vague human text, no numbers/outcome ---

// cww (playtest 2026-07-17 F1): a RESOLVED forage node must show its MATERIAL, not the
// generic "H"/"herb" — the black box that made 3/3 blind players miss flint/deadwood.
test("poiGlyph: a resolved forage node shows its material glyph; unresolved/other kinds show the kind glyph", () => {
  // unresolved (no detail) → generic kind glyph
  expect(poiGlyph("herb", null)).toBe(POI_CHAR.herb); // "H"
  expect(poiGlyph("mining", null)).toBe(POI_CHAR.mining);
  // resolved forage → material glyph
  expect(poiGlyph("herb", { gatedBy: null, material: "flint" })).toBe("f");
  expect(poiGlyph("herb", { gatedBy: null, material: "deadwood" })).toBe("d");
  expect(poiGlyph("herb", { gatedBy: null, material: "berries" })).toBe("b");
  // resolved forage that's an actual herb keeps the generic glyph (no material char)
  expect(poiGlyph("herb", { gatedBy: null, material: "forest-herb" })).toBe(POI_CHAR.herb);
  // non-forage kinds are unaffected even when resolved
  expect(poiGlyph("mining", { gatedBy: null, material: "iron-ore" })).toBe(POI_CHAR.mining);
});

test("kindLabel: the 'herb' kind reads as 'forage' (it yields flint/deadwood too), others unchanged", () => {
  expect(kindLabel("herb")).toBe("forage");
  expect(kindLabel("mining")).toBe("mining");
  expect(kindLabel("monster")).toBe("monster");
  // flavorDetail uses it: an unresolved forage node reads "a forage node", not "a herb node"
  expect(flavorDetail(null, "herb")).toBe("a forage node");
});

test("flavorDetail: null detail gives kind-only text; monster detail is vague, no numbers", () => {
  expect(flavorDetail(null, "monster")).toBe("a monster");
  const txt = flavorDetail({ tier: 3, dmgType: "magic", armourType: "plate", creature: "ice-troll" }, "monster");
  expect(txt).not.toMatch(/\d/); // no exact numbers leak
  expect(txt.length).toBeGreaterThan(0);
});

test("matchupLessons: surfaces affinity + weapon-vs-hide + armour result", () => {
  const l = matchupLessons({ weaponVsHide: 0.5, affinityFired: true, armourVsAttack: "exposed" });
  expect(l.length).toBeGreaterThan(0);
  expect(l.join(" ")).toMatch(/savaged|something/i); // affinity line present
  const none = matchupLessons({ weaponVsHide: 1, affinityFired: false, armourVsAttack: "neutral" });
  expect(none.length).toBe(0); // nothing notable → no noise
});

// eho: combatForecast is the pure data selector behind the web's fight forecast —
// it composes the combat primitives into a "win-the-race" verdict any UI can format.
test("combatForecast composes playerDamage/damageTaken into a win-race forecast", () => {
  const loadout = emptyLoadout();
  loadout.equipment.weapon = "sword";
  const foe = "forest-boar"; // tier-1 woodland beast
  const f = combatForecast(loadout, foe, 30);
  expect(f.dmgOut).toBe(playerDamage(loadout, foe));
  expect(f.dmgIn).toBe(damageTaken(loadout, foe, 0));
  expect(f.toKill).toBe(Math.ceil(MONSTER_TIER_HP_CURVE[MONSTERS[foe]!.tier]! / f.dmgOut));
  expect(f.toDie).toBe(Math.ceil(30 / f.dmgIn));
  expect(f.winning).toBe(f.toKill <= f.toDie);
});

test("flavorDetail names node magnitude variants", () => {
  expect(flavorDetail({ tier: 1, material: "iron-ore", magnitude: 2 }, "mining")).toBe("iron-ore cluster");
  expect(flavorDetail({ tier: 1, material: "iron-ore", magnitude: 3 }, "mining")).toBe("iron-ore cave");
  expect(flavorDetail({ tier: 1, material: "berries", magnitude: 2 }, "herb")).toBe("berries patch");
  // base (magnitude 1/absent) unchanged
  expect(flavorDetail({ tier: 1, material: "iron-ore" }, "mining")).toBe("iron-ore");
});

test("itemSources says where a material comes from (user 2026-10-10: 'where do I get flint?')", () => {
  const flint = itemSources("flint");
  expect(flint.some((s) => s.includes("bare hands") && s.includes("Woodland"))).toBe(true);
  expect(itemSources("iron-ore").some((s) => s.includes("Pick"))).toBe(true);
  expect(itemSources("werewolf-pelt")).toContain("Dropped by Werewolf");
  expect(itemSources("club")).toEqual(["Crafted"]);
});

test("energy unit: the console keeps 'e'; the web swaps in ⚡ (user 2026-10-10)", () => {
  const ev = { type: "doffed", defId: "club", energy: 40 } as unknown as Parameters<typeof formatEvent>[0];
  expect(formatEvent(ev, String)).toMatch(/\de → 40e$/);
  setEnergyUnit("⚡");
  try { expect(formatEvent(ev, String)).toMatch(/\d⚡ → 40⚡$/); } finally { setEnergyUnit("e"); }
});

test("costBand: cheap → slow bands, impassable has none (user 2026-10-10 cost tint)", () => {
  expect(costBand(5)).toBe(1);
  expect(costBand(10)).toBe(1);
  expect(costBand(15)).toBe(2);
  expect(costBand(20)).toBe(3);
  expect(costBand(30)).toBe(4);
  expect(costBand(Infinity)).toBeNull();
});

// seyh.2: the HUD shows the haul (loot units) and the room left for loot, not a merged bag count.
function bag(carry: ItemStack[], supplies = 11) {
  const loadout = emptyLoadout();
  loadout.equipment.backpack = "large-pack"; // 16 slots
  loadout.equipment.tools = ["axe", "pick"]; // 2 slots
  loadout.food = [{ defId: "ration", qty: supplies - 2 }]; // one slot per unit
  return { loadout, carry };
}

test("haulRoom: empty carry → haul 0, room = free slots × STACK_CAP", () => {
  expect(BACKPACK_SLOTS["large-pack"]).toBe(16);
  const h = haulRoom(bag([]));
  // 16 slots − 11 supplies = 5 free slots × 5 = 25
  expect(h).toEqual({ haul: 0, stacks: 0, roomUnits: 5 * STACK_CAP, full: false });
  expect(haulLine(h)).toBe("Haul 0 · room for 25");
});

test("haulRoom: a partial stack's top-up counts as room (same-material gathers merge)", () => {
  const h = haulRoom(bag([{ defId: "oak-log", qty: 3 }]));
  // 4 free slots × 5 + (5 − 3) top-up = 22
  expect(h).toEqual({ haul: 3, stacks: 1, roomUnits: 22, full: false });
  expect(haulLine(h)).toBe("Haul 3 · room for 22");
});

test("haulRoom: every slot full of full stacks → bag full", () => {
  const carry = Array.from({ length: 5 }, () => ({ defId: "oak-log", qty: STACK_CAP }));
  const h = haulRoom(bag(carry));
  expect(h).toEqual({ haul: 25, stacks: 5, roomUnits: 0, full: true });
  expect(haulLine(h)).toBe("Haul 25 · bag full");
});

test("haulRoom: no free slot but a partial stack → still room for that top-up", () => {
  const carry = [...Array.from({ length: 4 }, () => ({ defId: "oak-log", qty: STACK_CAP })), { defId: "iron-ore", qty: 1 }];
  expect(haulRoom(bag(carry))).toMatchObject({ haul: 21, roomUnits: 4, full: false });
});

test("haulRoom: carried maps take no loot room (their own pool, zpm.2)", () => {
  const withMap = { ...bag([]), carriedMaps: [{ mapSeed: "m", biomeId: "woodland" as const }] };
  expect(haulRoom(withMap).roomUnits).toBe(25);
});
