import { test, expect } from "bun:test";

// D102 end-to-end: the console (blind-playtest surface) offers the free local map with
// no hints — it's plain; hinted maps come from drops.
test("console town: the free local map shows no hints", () => {
  const r = Bun.spawnSync(["bun", "run", "src/sim/playtest.ts", "plain-e2e", "[]"], { cwd: import.meta.dir + "/.." });
  const out = r.stdout.toString();
  expect(out).toContain("Local map");
  expect(out).toContain("hints: none — plain country (hinted maps come from drops)");
});
