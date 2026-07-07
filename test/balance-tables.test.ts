import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { simTables } from "../src/sim/balance";
import { renderTablesMd } from "../src/sim/balance-cli";

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
