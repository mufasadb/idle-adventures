# Legibility Batch — Implementation Plan

> **For agentic workers:** execute task-by-task; run the gate after each; commit per task. Spec: `docs/superpowers/specs/2026-07-06-legibility-batch-design.md`.

**Goal:** Make movement cost, transport/gear effects, multi-tool packing, and the recipe tree legible — presentation only, no economy change.

**Architecture:** One pure engine helper (`moveCostBreakdown`) feeds a cost-transparent web route preview; the rest is web/console display copy. Mountains stay `Infinity`; no lever values change.

## Global Constraints
- Engine stays pure; `moveCostBreakdown` lives in `src/engine/move.ts` and imports only data/engine.
- No changes to `TERRAIN_COST`, `TERRAIN_GATE`, `TRANSPORT_MULTIPLIER`, `MIN_STEP` values — read them, don't edit them.
- Gate after every task: `bun test` + `bun run typecheck` + `bun run lint` green before commit.
- Active git policy: commit per task; push at the end.

---

### Task 1: `moveCostBreakdown` (engine) + tests

**Files:** Modify `src/engine/move.ts`; Test `test/move.test.ts`.

- [ ] **Step 1: Write failing tests.** Append to `test/move.test.ts`:

```ts
import { moveCostBreakdown } from "../src/engine/move";

test("moveCostBreakdown: plain terrain, no gear — base only, final matches moveCost", () => {
  const b = moveCostBreakdown("plains", null, []);
  expect(b.base).toBe(TERRAIN_COST.plains);
  expect(b.discounts).toEqual([]);
  expect(b.enabled).toBeUndefined();
  expect(b.transport).toBeUndefined();
  expect(b.final).toBe(moveCost("plains", null, []));
});

test("moveCostBreakdown: ice-cleats discount attributed, floor flagged", () => {
  const b = moveCostBreakdown("ice", null, ["ice-cleats"]); // 20 - 15 = 5 = MIN_STEP
  expect(b.discounts).toEqual([{ tool: "ice-cleats", amount: 15 }]);
  expect(b.floored).toBe(true);
  expect(b.final).toBe(MIN_STEP);
});

test("moveCostBreakdown: climbing-pick enables mountain", () => {
  const b = moveCostBreakdown("mountain", null, ["climbing-pick"]);
  expect(b.enabled).toEqual({ tool: "climbing-pick", to: 40 });
  expect(b.final).toBe(40);
});

test("moveCostBreakdown: transport divisor captured (horse on plains)", () => {
  const b = moveCostBreakdown("plains", "horse", []);
  expect(b.transport).toEqual({ id: "horse", divisor: 2 });
  expect(b.final).toBe(TERRAIN_COST.plains / 2);
});

test("moveCostBreakdown: final always equals moveCost across combos", () => {
  const combos: [import("../src/data/constants").Terrain, string | null, string[]][] = [
    ["mud", "horse", []], ["river", null, ["raft"]], ["mud", null, ["waders"]],
    ["mountain", "wagon", ["climbing-pick"]], ["ice", "wagon", ["ice-cleats"]],
  ];
  for (const [t, tr, tls] of combos) {
    expect(moveCostBreakdown(t, tr, tls).final).toBe(moveCost(t, tr, tls));
  }
});
```

- [ ] **Step 2: Run, verify fail.** `bun test test/move.test.ts` → new tests FAIL (not exported).

- [ ] **Step 3: Implement.** In `src/engine/move.ts`, add the type + function and refactor `moveCost` to delegate:

```ts
export type StepBreakdown = {
  terrain: Terrain;
  base: number;
  enabled?: { tool: string; to: number };
  discounts: { tool: string; amount: number }[];
  floored: boolean;
  transport?: { id: string; divisor: number };
  final: number;
};

export function moveCostBreakdown(
  terrain: Terrain,
  transport: string | null,
  tools: string[] = [],
): StepBreakdown {
  const base = TERRAIN_COST[terrain];
  let step = base;
  let enabled: StepBreakdown["enabled"];
  const discounts: StepBreakdown["discounts"] = [];
  const mods = TERRAIN_GATE[terrain];
  if (mods) {
    for (const tool of tools) {
      const m = mods[tool];
      if (!m) continue;
      if (m.enable !== undefined && !Number.isFinite(step)) { step = m.enable; enabled = { tool, to: m.enable }; }
      if (m.discount) { step -= m.discount; discounts.push({ tool, amount: m.discount }); }
    }
  }
  let floored = false;
  if (Number.isFinite(step)) {
    if (step < MIN_STEP) { step = MIN_STEP; floored = true; }
  } else {
    step = Infinity;
  }
  const divisor = transport === null ? 1 : (TRANSPORT_MULTIPLIER[transport]?.[terrain] ?? 1);
  const transportInfo = transport !== null && divisor !== 1 ? { id: transport, divisor } : undefined;
  return { terrain, base, enabled, discounts, floored, transport: transportInfo, final: step / divisor };
}

export function moveCost(terrain: Terrain, transport: string | null, tools: string[] = []): number {
  return moveCostBreakdown(terrain, transport, tools).final;
}
```
(Delete the old `moveCost` body; keep `stepToward`. `MIN_STEP` is already imported — if not, add it to the constants import.)

- [ ] **Step 4: Run, verify pass.** `bun test test/move.test.ts` → PASS (old + new).
- [ ] **Step 5: Gate + commit.** `bun test && bun run typecheck && bun run lint`; then `git add src/engine/move.ts test/move.test.ts && git commit -m "A1: moveCostBreakdown — cost attribution helper"`.

---

### Task 2: Cost-transparent route preview (web)

**Files:** Modify `src/web/main.ts`, `src/web/index.html`.

- [ ] **Step 1: Import the helper.** In `src/web/main.ts` add `moveCostBreakdown` to the `../engine/move` import (currently `import { moveCost } from "../engine/move";`).

- [ ] **Step 2: Tag each pending-path tile with its breakdown.** In `expeditionView` where cells render (the loop building `cells`, look for `const pathSet = new Set(pending ? pending.path.map(kk) : []);` and the per-cell `cls`/`title` construction). For tiles in `pathSet`, compute `const bd = moveCostBreakdown(grid.terrain[y]![x]!, exp.loadout.equipment.transport, exp.loadout.equipment.tools);` and:
  - Add a class: if `bd.enabled` → `"path-enabled"`; else if `bd.discounts.length` → `"path-tool"`; else if `bd.transport` → `"path-transport"` (in addition to the existing `"path"`).
  - Set the tile `title` to a human breakdown string via a helper:
    ```ts
    function stepExplain(bd: ReturnType<typeof moveCostBreakdown>): string {
      if (!Number.isFinite(bd.base) && !bd.enabled) return `${bd.terrain} — impassable`;
      const parts: string[] = [`${bd.terrain} ${Number.isFinite(bd.base) ? bd.base + "e" : "∞"}`];
      if (bd.enabled) parts.push(`→ ${bd.enabled.to} (${name(bd.enabled.tool)})`);
      for (const d of bd.discounts) parts.push(`− ${d.amount} (${name(d.tool)})`);
      if (bd.transport) parts.push(`÷${bd.transport.divisor} (${name(bd.transport.id)})`);
      return `${parts.join(" ")} = ${round(bd.final)}e`;
    }
    ```
    Use `stepExplain(bd)` as the `title` for path tiles (keep the existing POI/terrain title for non-path tiles).

- [ ] **Step 3: Banner saving vs on-foot.** Where `pending` is set (in `onTileClick`, after `findPath`), also compute the on-foot baseline cost of the same path and store it, OR compute in the banner: sum `moveCostBreakdown(terrain, null, []).final` over `pending.path` for the baseline, subtract `pending.cost`. In the `pathBanner` string, append when the saving > 0: ` · gear/transport saved ${round(saving)}e`. (Path terrains: `grid.terrain[p.y]![p.x]` for each `p` in `pending.path`.)

- [ ] **Step 4: Transport descriptor.** In `townView` (and optionally the expedition header) where the transport is shown, append a role hint when a transport is equipped, e.g. `horse — faster on open ground`, `wagon — faster on ice`, `mule — slow but hauls`. A small `Record<string,string>` in the web is fine.

- [ ] **Step 5: CSS.** In `src/web/index.html` `<style>`, near the existing `.path`/`.path-goal` rules, add:
```css
.tile.path-transport { box-shadow: inset 0 0 0 2px #4a90d9; }  /* transport-cheapened */
.tile.path-tool { box-shadow: inset 0 0 0 2px #48c774; }        /* gear-discounted */
.tile.path-enabled { box-shadow: inset 0 0 0 2px #f0a020; }     /* climbing-pick unlocked */
```
(Match whatever `.path` styling already exists; the point is three distinguishable outlines.)

- [ ] **Step 6: Gate.** `bun run typecheck && bun run lint && bun test`. Manual smoke deferred to Task 5.
- [ ] **Step 7: Commit.** `git add src/web/main.ts src/web/index.html && git commit -m "A1: cost-transparent route preview — coloured path + hover math + saving"`.

---

### Task 3: Multi-tool copy + recipe-book dedupe (web)

**Files:** Modify `src/web/main.ts`.

- [ ] **Step 1: Multi-tool copy.** In `townView`, the loadout tools row (`equipRow("tools", ...)`) and/or the muted helper line: make it read that tools each take a bag slot and you can bring several — e.g. change the helper `<div class="muted small">worn gear (ghosted) is free · each food / potion / battle-item / tool takes one slot · …` to also say `bring several tools to work different node types`.

- [ ] **Step 2: Recipe dedupe.** In `townView`'s Recipe book section, group `Object.keys(RECIPE)` by `RECIPE[id].output.defId`. Render one block per output defId: the output name once, then its ingredient paths as sub-lines (`← 2× forest-herb`, `← 1× deer-hide`), marking affordable paths (in the `affordable` set) with a ✓ and the active/craft button. Keep affordable outputs first. Example structure:
```ts
const byOutput = new Map<string, string[]>();
for (const id of Object.keys(RECIPE)) {
  const out = RECIPE[id]!.output.defId;
  (byOutput.get(out) ?? byOutput.set(out, []).get(out)!).push(id);
}
// order outputs: those with any affordable recipe first
```
For each output, render the output line; for each recipe id, a path line with its `inputs` and (if affordable) a Craft button `data-craft="${id}"`. Preserve the existing craft click wiring (`[data-craft]`).

- [ ] **Step 3: Gate + commit.** `bun run typecheck && bun run lint && bun test`; `git add src/web/main.ts && git commit -m "A2/A3: multi-tool copy + recipe book dedupe by output"`.

---

### Task 4: Playtest-console parity

**Files:** Modify `src/sim/playtest.ts`.

- [ ] **Step 1: Transport/gear effect in YOU line.** Import `moveCostBreakdown`. When a transport or gating tool is equipped, append a short effect note to the `equipped:` line, e.g. `(horse: plains ${moveCostBreakdown("plains","horse",[]).final}e vs ${moveCostBreakdown("plains",null,[]).final}e)` — or a compact static descriptor. Keep it one line.

- [ ] **Step 2: Tools-stack hint.** In `printTown`, add a one-line note under the recipe book or offer: `Tip: tools each take one bag slot — you can pack several (pick + axe + knife + …).`

- [ ] **Step 3: Node tier hint.** In `printExpedition`'s "What you can make out nearby", if a perceived gatherable's `detail.tier > 1`, append `(needs a tier-${tier} tool)`.

- [ ] **Step 4: Gate + commit.** `bun run typecheck && bun run lint && bun test`; `git add src/sim/playtest.ts && git commit -m "A4: playtest-console parity — transport/tool effect, tools-stack hint, tier hint"`.

---

### Task 5: Verify in-browser + push

- [ ] **Step 1: Full gates.** `bun test && bun run typecheck && bun run lint` → all green.
- [ ] **Step 2: Smoke the web.** Start `bun ./src/web/index.html` (background), open with a browser tool, and confirm: (a) with a horse packed + a walk previewed, path tiles are outlined and hovering shows `plains 10e ÷2 (horse) = 5e`, banner shows a saving; (b) the recipe book shows deduped outputs; (c) the tools line reads "bring several". Screenshot the route preview. Stop the server.
- [ ] **Step 3: Smoke the console.** `bun run playtest legdemo '[]'` and one short expedition — confirm the transport/tier hints render.
- [ ] **Step 4: Push.** `git push && bd dolt push`. Report back with the screenshot and a one-paragraph summary of what changed.
