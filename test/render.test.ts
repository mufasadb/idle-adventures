import { test, expect } from "bun:test";
import { flavorDetail, matchupLessons, combatForecast, poiGlyph, kindLabel, POI_CHAR } from "../src/render/render";
import { emptyLoadout } from "../src/engine/loadout";
import { playerDamage, damageTaken } from "../src/engine/combat";
import { MONSTERS, MONSTER_TIER_HP_CURVE } from "../src/data/constants";

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
  const l = matchupLessons({ weaponVsHide: 0.5, affinityFired: true, armourVsAttack: "exposed" }, "bow");
  expect(l.length).toBeGreaterThan(0);
  expect(l.join(" ")).toMatch(/savaged|something/i); // affinity line present
  const none = matchupLessons({ weaponVsHide: 1, affinityFired: false, armourVsAttack: "neutral" }, "sword");
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
