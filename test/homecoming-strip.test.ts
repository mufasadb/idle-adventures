// seyh.1 follow-up (owner 2026-10-10): new recipes on the homecoming strip are small
// item icons + one "recipe unlocked" tag — no ★, and never the recipe's name.
import { describe, expect, test } from "bun:test";
import { RECIPE } from "../src/data/constants";
import { name } from "../src/render/render";
import type { Homecoming } from "../src/render/render";
import { homeStripHtml } from "../src/web/homecoming";

const base: Homecoming = { haul: [{ defId: "flint", qty: 3 }], maps: [], unspent: 120, maxEnergy: 300, newRecipes: [], defeated: false };
const ids = Object.keys(RECIPE).slice(0, 6);

describe("homeStripHtml new recipes", () => {
  test("none → no tag", () => {
    expect(homeStripHtml(base)).not.toContain("unlocked");
  });
  test("one → an icon button + 'recipe unlocked', no star, no name", () => {
    const html = homeStripHtml({ ...base, newRecipes: [ids[0]!] });
    expect(html).toContain("recipe unlocked");
    expect(html).not.toContain("★");
    expect(html).not.toContain(`>${name(RECIPE[ids[0]!]!.output.defId)}<`);
    expect(html.match(/data-find-recipe=/g)?.length).toBe(1);
  });
  test("many → plural tag, folds past the strip's room into +N", () => {
    const html = homeStripHtml({ ...base, newRecipes: ids });
    expect(html).toContain("recipes unlocked");
    expect(html).toMatch(/>\+\d+</);
    for (const id of ids) expect(html).not.toContain(`title="${name(RECIPE[id]!.output.defId)}`);
  });
});
