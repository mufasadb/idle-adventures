import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Restricted-import patterns for the engine boundary. Engine code must not reach
// into render/sim/web — by path (../render/...) or by any specifier containing those segments.
const engineForbiddenZones = [
  { group: ["**/render/**", "**/render", "*/render/*"], message: "engine must not import from render (purity boundary)" },
  { group: ["**/sim/**", "**/sim", "*/sim/*"], message: "engine must not import from sim (purity boundary)" },
  { group: ["**/web/**", "**/web", "*/web/*"], message: "engine must not import from web (purity boundary)" },
];

export default tseslint.config(
  { ignores: ["node_modules/**", "bun.lock", ".claude/worktrees/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // `_`-prefixed args/vars are intentionally unused (mirrors tsconfig's
    // noUnusedParameters convention) — e.g. stubs like render(_state).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Engine-purity boundary — the one discipline we keep (spec §7, §12; decision D17).
    files: ["src/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: engineForbiddenZones }],
      "no-restricted-globals": [
        "error",
        { name: "document", message: "engine is pure: no DOM" },
        { name: "window", message: "engine is pure: no DOM" },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "engine is deterministic: use hash(state.seed, ctx)" },
        { object: "Date", property: "now", message: "engine is deterministic: no wall-clock" },
      ],
    },
  },
);
