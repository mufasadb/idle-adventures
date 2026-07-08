import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { simTables, mapTierReport } from "../src/sim/balance";
import { renderTablesMd } from "../src/sim/balance-cli";

test("map-tier report: emits a row per tier 1..5 with poiCount + bossPresence", () => {
  const rep = mapTierReport();
  expect(rep.rows.map((r) => r.tier)).toEqual([1, 2, 3, 4, 5]);
  const t1 = rep.rows.find((r) => r.tier === 1)!;
  const t3 = rep.rows.find((r) => r.tier === 3)!;
  expect(t1.bosses).not.toContain("ancient-wyrm");
  expect(t3.bosses).toContain("ancient-wyrm");
  expect(t3.poiCount).toBeGreaterThan(t1.poiCount);
});

// The committed tables are the citable balance surface. Any change to monsters,
// combat-affecting items, or the combat math shifts simTables() output — this
// test goes red until you regenerate: `bun run sim:tables` (then commit the
// docs/balance/ diff; reviewing it IS reviewing the balance change).
test("committed balance tables are current — run `bun run sim:tables` after combat changes", () => {
  const committed = JSON.parse(readFileSync("docs/balance/tables.json", "utf8"));
  expect(simTables()).toEqual(committed);
  // the human artifact is part of the gate too — a render change requires regeneration
  expect(readFileSync("docs/balance/tables.md", "utf8")).toBe(renderTablesMd(simTables()));
});
