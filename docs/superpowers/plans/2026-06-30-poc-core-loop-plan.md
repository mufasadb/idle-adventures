# POC Core Loop — Implementation Plan (M0→M7)

> Work is tracked as **beads** (`bd ready` / `bd list`). This doc is the narrative companion: the milestone breakdown, acceptance criteria, and which balance levers each milestone introduces. Detailed TDD steps are authored per-bead at execution time (see `superpowers:subagent-driven-development`).

**Goal:** Build a stripped vertical slice to answer one question — *is choosing a loadout for a given map, then making routing / gather / fight / turn-back calls under tight budgets, fun enough to want to craft up and go again?*

**Architecture:** Pure `reduce(state, action) → {state, events}` engine (seed lives in state). One flat-but-disciplined TS package; folders (`engine` / `data` / `sim` / `render`) mirror the eventual monorepo packages; an eslint boundary rule forbids the engine importing anything from render/sim/web. Two drivers over one engine: a headless `play(seed, actions[])` harness (tests + AI) and an interactive Vite/CSS-grid web view (human). Every tunable is a named lever in `src/data/` — see `balance-levers.md`.

**Tech Stack:** TypeScript · Vite · Vitest · seeded Perlin noise · vanilla-TS DOM grid (React deferred).

## Global Constraints

- Engine is pure: no DOM, no `Math.random`/`Date.now`, no imports from `render`/`sim`/`web`. RNG = `hash(state.seed, context)`.
- `GameState` holds **only the present**. The action list lives in the driver, not in state.
- All items are `{defId, qty}` referencing a code-side catalog. No per-instance item state in the POC.
- No magic numbers in engine logic — read every tunable from `src/data/`.
- 1 action = 1 tile of movement. Turn-based; "time" is the energy/HP budget, not wall-clock.

---

## M0 — Skeleton & guardrails
TS single package; Vite + Vitest; eslint with the engine-purity boundary rule; `src/data/constants.ts` lever-file scaffold; empty typed `reduce` and `render`.
**Acceptance:** `bun test` runs green on a trivial test; an import from `engine` → `render` fails lint; `GameState`/`Action` types compile.

## M1 — Deterministic map generation + render
Seeded Perlin → terrain via thresholds; seeded POI placement with a min-distance rule (POIs 3–4 tiles apart); `render(state)` paints a 20×20 CSS grid; a text serialization exists for snapshot tests.
**Acceptance:** same seed → byte-identical grid (snapshot); 20×20 renders; POIs respect min spacing. *Levers:* grid size, noise thresholds, POI density & spacing.

## M2 — Player, movement, energy budget
`embark` sets energy from packed food; `move` steps one tile (8-dir) toward a target; terrain cost multiplier; transport reduces cost; gated/impassable tiles; energy depletes and bottoms out.
**Acceptance:** ice costs more than plains; transport lowers cost; energy hitting 0 stops further moves; deterministic. *Levers:* `ENERGY_PER_FOOD`, base move cost, `TERRAIN_COST[*]`, transport multipliers.

## M3 — Nodes, gathering, carry
`gather` requires the right tool (cost = node hardness ÷ tool quality), fills carry; backpack defines slot cap; `drop` frees a slot.
**Acceptance:** gathering ore without a pick fails; carry respects the slot cap; yields land in carry. *Levers:* node hardness, tool quality, yield amounts, `BACKPACK_SLOTS`, `STACK_CAP`.

## M4 — Deterministic combat
`fight` resolves attrition: per-piece armour aggregation `Σ defense×matrix[dmgType][armourType]`, hidden affinities, auto-potions at a threshold, HP drain, soft-fail on HP→0 (run ends, keep carry); `scout` reveals monster stats when a spyglass is equipped; loot deterministic from seed.
**Acceptance:** silver vs werewolf ×2; plate cuts ranged more than magic; HP→0 soft-fails and keeps carry; scout changes available info; same seed → same outcome. *Levers:* `PLAYER_BASE_HP`, the matrix, per-piece defense, `AFFINITY_MULTIPLIER`, potion heal, auto-potion threshold, monster tier curves, loot tables.

## M5 — Return, crafting, loadout, map entry (close the loop)
`return` hauls carry → bank; `craft` consumes materials → item (instant, recipe from catalog); `pack` builds a loadout within slot limits; town offers 3 seeded candidate maps with rough previews (hints, hidden layout); pick → embark.
**Acceptance:** craft consumes inputs & yields output; can't pack beyond slots; preview shows hints not layout; a second run with a crafted upgrade is measurably cheaper. *Levers:* recipe costs, candidate-map count, preview fidelity.

## M6 — Headless harness + AI-drivable
`play(seed, actions[]) → {state, events}`; `legalActions(state)`; a scripted full-loop test; an AI plays a complete town→expedition→return→craft loop via JSON actions, no UI.
**Acceptance:** a JSON action list drives a full loop headlessly; `legalActions` matches what `reduce` accepts.

## M7 — Play & judge
Play several runs (human via web, AI via harness); score against the spec's success criteria; write a feel-assessment; identify the top balance levers to tune; decide go / iterate / pivot.
**Acceptance:** a written feel-assessment exists; lever-tuning candidates listed.
