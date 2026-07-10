import { test, expect } from "bun:test";
import { affixMaterialHint } from "../src/render/render";
import { AFFIX_EFFECTS, INKS } from "../src/data/constants";

// egd: applying an ink gave no legible confirmation. The hint names the material
// the affix favours (material-specific, user call) so the ink both pays off and
// teaches the "of gleaming = mithril" vocabulary.

test("affixMaterialHint: names the top-weighted material of an affix", () => {
  expect(affixMaterialHint("of-gleaming")).toBe("mithril-ore"); // ×5, the headline
  expect(affixMaterialHint("of-carbon")).toBe("coal"); // ×4
  expect(affixMaterialHint("of-sage")).toBe("desert-sage");
  expect(affixMaterialHint("of-thorns")).toBe("thistle");
});

test("affixMaterialHint: every affix in every ink pool has a hint", () => {
  for (const ink of Object.values(INKS)) {
    for (const affix of ink.pool) {
      expect(affixMaterialHint(affix)).toBe(
        Object.entries(AFFIX_EFFECTS[affix]!.materialWeightMul!).sort((a, b) => b[1] - a[1])[0]![0],
      );
    }
  }
});

test("affixMaterialHint: unknown / material-less affix returns null", () => {
  expect(affixMaterialHint("of-nothing")).toBeNull();
});
