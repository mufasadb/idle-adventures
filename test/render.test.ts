import { test, expect } from "bun:test";
import { flavorDetail, matchupLessons } from "../src/render/render";

// 1z7: the three render.ts grid drawers (render/renderGridText/renderGridHtml) were
// used by zero shipped surfaces and have been removed — the web and headless console
// each draw their own grid from the shared glyph maps. What remains here covers the
// live selectors render.ts still exports.

// --- perception flavor (9u9.2): facts → vague human text, no numbers/outcome ---

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

test("flavorDetail names node magnitude variants", () => {
  expect(flavorDetail({ tier: 1, material: "iron-ore", magnitude: 2 }, "mining")).toBe("iron-ore cluster");
  expect(flavorDetail({ tier: 1, material: "iron-ore", magnitude: 3 }, "mining")).toBe("iron-ore cave");
  expect(flavorDetail({ tier: 1, material: "berries", magnitude: 2 }, "herb")).toBe("berries patch");
  // base (magnitude 1/absent) unchanged
  expect(flavorDetail({ tier: 1, material: "iron-ore" }, "mining")).toBe("iron-ore");
});
