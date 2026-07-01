import { test, expect } from "bun:test";
import { ESLint } from "eslint";

// Proves the engine-purity guardrail without committing a violating file:
// lintText with a src/engine/** filePath applies the engine-scoped rules.
const eslint = new ESLint();

async function lintAsEngineFile(code: string) {
  const results = await eslint.lintText(code, { filePath: "src/engine/__fixture__.ts" });
  return results[0]?.messages ?? [];
}

test("boundary: engine importing from render is a lint error", async () => {
  const messages = await lintAsEngineFile(`import { render } from "../render/render";\nexport const x = render;\n`);
  const restricted = messages.filter((m) => m.ruleId === "no-restricted-imports");
  expect(restricted.length).toBeGreaterThan(0);
});

test("boundary: engine using Math.random is a lint error", async () => {
  const messages = await lintAsEngineFile(`export const r = Math.random();\n`);
  const restricted = messages.filter((m) => m.ruleId === "no-restricted-properties");
  expect(restricted.length).toBeGreaterThan(0);
});

test("boundary: engine using Date.now is a lint error", async () => {
  const messages = await lintAsEngineFile(`export const t = Date.now();\n`);
  const restricted = messages.filter((m) => m.ruleId === "no-restricted-properties");
  expect(restricted.length).toBeGreaterThan(0);
});

test("boundary: a clean engine module passes", async () => {
  const messages = await lintAsEngineFile(`export const ok = 1 + 1;\n`);
  const errors = messages.filter((m) => m.severity === 2);
  expect(errors.length).toBe(0);
});
