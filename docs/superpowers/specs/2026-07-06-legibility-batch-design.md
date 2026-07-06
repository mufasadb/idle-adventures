# Legibility Batch — Cost-Transparent Movement, Multi-Tool, Recipe Dedupe

**Beads:** playtest follow-ups `idle-adventure-2g7` — addresses F4 (opaque items, esp. horse) and F7 (discovery-by-punishment), and the one-tool *misconception* under F1/F7.

## 1. Problem

The 2026-07-06 blind playtest found decisions that *feel fake* because their effects are invisible, and misconceptions because the interface doesn't telegraph what's allowed:
- The **horse's movement benefit was invisible** — all agents thought it did nothing (it halves plains cost per-terrain, but nothing shows it).
- Agents believed there was a **one-tool-per-run limit** — there isn't (tools stack in the bag, one slot each); the UI just didn't make it read that way.
- The **recipe book lists the same output six times** (`ration` from herb/sage/hides/…), reading as noise.

None of these are mechanics bugs — they're legibility gaps. Fix by making cost/effect visible; no engine economy changes.

## 2. A1 — Cost-transparent route preview (web) + `moveCostBreakdown` (engine)

New **pure** helper in `src/engine/move.ts`:
```ts
export type StepBreakdown = {
  terrain: Terrain;
  base: number;                         // TERRAIN_COST[terrain] (may be Infinity)
  enabled?: { tool: string; to: number }; // climbing-pick turning ∞ finite
  discounts: { tool: string; amount: number }[]; // subtractive gear applied
  floored: boolean;                     // hit MIN_STEP
  transport?: { id: string; divisor: number };
  final: number;                        // === moveCost(terrain, transport, tools)
};
export function moveCostBreakdown(terrain: Terrain, transport: string | null, tools: string[]): StepBreakdown;
```
`moveCost` may delegate to it (`return moveCostBreakdown(...).final`) so the two can never diverge. Deterministic, engine-pure, fully unit-testable.

**Web (`src/web/main.ts`) route preview:**
- When a path is pending, each path tile is **colour-coded by what's acting on its cost**: cheapened by a **discount tool** (raft/waders/ice-cleats) → one class; cheapened by **transport** (horse/wagon) → another; an impassable tile **enabled by climbing-pick** → a distinct "unlocked" class. (Add `.path-tool`, `.path-transport`, `.path-enabled` CSS in `index.html`.)
- **Hover a path tile → the math** via the tile `title`: e.g. `ice 20e − 15 (ice-cleats) = 5e`, `plains 10e ÷2 (horse) = 5e`, `mountain ∞ → 40 (climbing-pick)`, or plain `plains 10e` when nothing acts.
- The banner keeps the inline total and adds a saving vs on-foot: `−120e · your gear/horse saved 45e` (sum the same path with `transport:null` and no tools for the baseline; omit the clause when zero).
- Loadout descriptor line already lists transport; append its role — `transport: horse — halves move on open ground`.

## 3. A2 — Multi-tool clarity (web, copy only)

Town loadout tool row label becomes: `tools (each takes a bag slot — bring several to work different node types): …`. Keep the `bag N/cap slots` counter prominent (already present). No engine change — the engine already allows multiple tools (`pack.ts` appends to `equipment.tools`, capped by carry).

## 4. A3 — Recipe book dedupe by output (web)

Group `RECIPE` entries by `output.defId` in the town recipe book. Show each output once with its ingredient paths listed beneath; mark/highlight the path the player can currently afford (`ration ← 1× deer-hide ✓`). Preserve affordable-first ordering. Render-only.

## 5. A4 — Playtest-console parity (`src/sim/playtest.ts`)

So future blind agents aren't misled the same way:
- In the `YOU` line, when a transport/gating tool is equipped, note its effect (reuse `moveCostBreakdown` on a sample terrain, or a short static descriptor per equipped item).
- Add a one-line hint that **tools stack in the bag** (bring several).
- On perceived gatherable nodes, include the material tier hint so "tool-too-weak" is anticipable.

## 6. Testing

- `moveCostBreakdown` unit tests (`test/move.test.ts`): discount attributed to the right tool with the right amount; transport divisor captured; climbing-pick `enabled`; `floored` true when a discount hits `MIN_STEP`; `final === moveCost(...)` for a spread of terrain/tool/transport combos.
- A2/A3/A4 are display — manual in-browser smoke (drive the web + re-run the console) since the town screen isn't snapshot-tested.
- Gates: `bun test` + `bun run typecheck` + `bun run lint`. No data/economy changes → sustainability + b91 untouched; render snapshot (ASCII map) unaffected.

## 7. Out of scope

- The tent/reach mechanic (thread B) and maps-as-items (thread C) — separate specs.
- Any change to move costs, transport values, or the economy — this is presentation only.
- Killing the base-energy "food feels optional" signal (thread B / balance) — not here.
