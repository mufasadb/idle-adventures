# Routing rethink — direct-line + player-planned waypoints

**Bead:** idle-adventure-eot · **Date:** 2026-07-14 · **Spec status:** approved (design), pending user spec review

Reframes the routing model established by [[h61]] (console travel router) and [[237]]
(web adopts sim `routeTo`). Cites the core-loop spec
(`2026-06-30-idle-adventure-poc-core-loop-design.md`): the game is a **logistics
puzzle** — *finding the efficient path is the player's job, not the solver's.*

## Problem

Today, clicking a destination runs A* (`findPath` in `src/web/main.ts`, mirrored by
`routeTo`/`travel` in `src/sim/route.ts`) that picks the **energy-optimal** route
around walls and monsters. The solver solves the puzzle. That removes the decision
the game is supposed to be about.

## Design

Routing becomes the player's decision. A click proposes a **naive straight line**;
the player refines it into a multi-leg route with more clicks; only then does it
execute. The solver never *chooses* a path. `costToReach` still *costs* a given
path (Dijkstra stays valid for costing, not choosing).

### 1. Route model

A route is an ordered list of **waypoints**, with the player's tile as the implicit
head. Between each consecutive pair we draw a straight **Bresenham line** — the
connected 8-step tile sequence (one tile per step, orthogonal or diagonal, so
diagonals keep their √2× `moveCost`). No dodging, no optimization.

```
route: Pos[]                                    // waypoints; player pos is the implicit head
// derived per render, never stored:
legs: { tiles: Pos[]; cost: number; blockedAt: Pos | null }[]
```

A shared pure helper `lineTiles(a, b): Pos[]` produces the Bresenham step sequence
(exclusive of `a`, inclusive of `b`). It lives where both web and sim can import it
as pure data — `src/engine/line.ts` (new, engine-pure: no RNG/DOM/Date).

Per leg, walk its tiles accumulating `moveCost`. The **first impassable tile**
(`!Number.isFinite(moveCost)`) is that leg's `blockedAt`; cost accumulation for that
leg stops there.

- **Total cost** = sum of leg costs up to the first block.
- **Walkable?** = no leg has a `blockedAt`.

Monsters are **not** obstacles here (no route-around-monsters `blocked` set anymore).
A live monster on a leg is walked into and **fought when reached** (see §4).

### 2. Clicking — build / truncate / unwind

One click handler (`onTileClick`), three cases:

1. Click the player's **own tile** → clear the whole route.
2. Click a tile **already on the drawn path** — any leg tile *or* waypoint, snapped
   to the path → **truncate**: drop every waypoint/tile beyond it; that tile becomes
   the new final waypoint. This is the "un-click to unwind the last leg" mechanic,
   generalized to snap to any path tile.
3. Click **any other tile** → **append** it as a new waypoint; a fresh straight leg
   is drawn from the current end to it.

**Self-crossing routes.** A route may cross itself (draw a cross/plus). A clicked
tile can then appear at **multiple positions** along the walk order. Truncation
snaps to the **earliest occurrence in walk order** (the first time the walk would be
on that tile) — deterministic and least-surprising: you unwind back to the first
visit. Cost is summed over tiles *as walked*, so a route that revisits a tile pays
for it each time (correct — you walk it twice); the render must not double-highlight
in a way that breaks, and the energy bar must **clamp** (see §3), never overflow its
container when planned cost exceeds current energy.

Worked example (user's): on (1,1), click (4,4), a rock blocks the leg — the line
stays fully drawn, a red marker sits on the block tile, Walk is disabled. Click
(2,2) (a tile the line passes through) → the route becomes (1,1)→(2,2), the blocked
remainder dropped; click onward to route around.

### 3. Rendering

- Each leg drawn as its line of highlighted tiles.
- **Red marker** on every leg's `blockedAt` tile — the "this won't work" signal.
- Waypoints get a distinct marker (numbered pip) so multi-leg plans read clearly.
- The energy-bar keep/spend split (already implemented) reflects the **whole
  planned route's** total cost, and **clamps** the spend segment to the bar width
  when planned cost ≥ current energy (the `over` class flags it red) — a route that
  costs far more than you have must not blow out the bar's layout.
- **Projected cost is shown as a SPLIT — walk points + action points.** The
  preview breaks total energy into two labelled parts rather than one lumped number:
  `−32 walk + −5 gather = −37e`. The **action-points** part sums
  `gatherCost(node, tools)` for every node the line passes **over** whose identity
  is already **resolved** (near/surveyed) — and **only when auto-gather is ON**
  (toggle off ⇒ no action points projected, since you won't auto-do it). Unresolved
  nodes (fog) contribute nothing to the preview and surprise you when reached. A
  pure `gatherCost(poi, tools)` helper is extracted from `gather` (same
  `NODE_HARDNESS[kind] / toolQuality` math) so preview and execution never drift.
  Players wanting exact control route in smaller parts (separate legs / short
  routes) — the split display plus part-wise routing is the "get picky" affordance,
  no extra UI needed.
- **Walk ▶** is **disabled while any leg is blocked** (forces a clean plan rather
  than walking a partial prefix into a wall).
- The final-tile affordances re-key off the **last waypoint** instead of a single
  pending goal: **Fight/Shoot** if the last waypoint is a live monster, **Survey**
  if it is surveyable. Same legality source (speculative `reduce`, D29).

`pending` (the current single-goal proposal type) is replaced by the route/waypoint
state. `hint` (transient unreachable banner) stays for genuinely unreachable clicks
if we keep any (a straight line is always *drawable*, so "unreachable" mostly
becomes "blocked leg" instead — the red marker supersedes most `unreachableReason`
copy).

### 4. Execution — the Walk

A single **Walk ▶** runs every leg's tiles in order through
`reduce({type:"move", to})`, stopping the way it does today: a reached fight breaks
the loop and opens the engagement; an unexpected rejection stops and reports its
cause via `rejectCopy`.

**New — auto-interact with nodes on the way.** Gated by a persistent
`autoGather` toggle (Expedition field, default **on**, read `?? true`; flipped by a
new engine `toggle-auto-gather` action mirroring `toggle-auto-quaff`). When **off**,
the walk never auto-gathers — you cross nodes untouched and harvest manually with a
click (this is how you skip a node without routing around it). When **on**, after
each successful `move` the walk speculatively runs `reduce({type:"gather"})` (gather
acts on the tile the player stands on):

- node present + room in bag → auto-gather, keep the new state, log it, continue;
- **`carry-full`** → **pause** the walk at this tile ("bag full — dropped anchor at
  (x,y)"), route state left intact so the player makes room and resumes;
- any other rejection (`no-node`, `already-cleared`, `not-gatherable`,
  `missing-tool`, `tool-too-weak`, `exhausted`) → no gather happened, continue the
  walk (an un-workable node is silently skipped; a too-weak/`exhausted` gather does
  not stop movement).

Auto-eat (`autoEatFood`) and auto-quaff behave exactly as today; they already run
inside `move`/exchange resolution.

To resume after a pause, the remaining route is preserved and Walk is offered again
(it re-runs from the current player position through the unwalked tiles).

### 5. Sim layer

The agent-facing directive that mirrors this is **`route {waypoints: Pos[]}`**
(replaces the auto-routing `travel {to}`):

- each leg is a straight `lineTiles`, executed in order via `move`, auto-gathering
  per tile (same rules as §4);
- stops at the first blocked tile, first fight, or full bag;
- **reports** which waypoint index it reached and, on a block, the blocking tile —
  so the agent re-plans (issues another `route`) exactly as a human re-clicks.

A single-waypoint route is the honest analog of the old near-tile `travel`.

**`routeTo`/A* is retired from the agent path but NOT deleted.** It is left parked
(unused by the `route` directive) for a **future, separate large-scale
auto-routing balance calculator** — an automated harness that *may* auto-route for
mass balance sweeps, deliberately distinct from the agent playtest surface (which
must make routing decisions itself). That future work is filed as a follow-up bead;
this spec does not build it.

### 6. Files

- `src/engine/line.ts` — **new**, pure `lineTiles(a, b)`. Boundary-clean.
- **Engine additions (foundations):** `autoGather?: boolean` on `Expedition`
  (`types.ts`, documented default `?? true`); `toggle-auto-gather` Action +
  reducer case + `GameEvent` log line (exhaustive `fmt()` switch); a pure
  `gatherCost(poi, tools): number` helper extracted from `gather` and reused by
  both the cost preview and (implicitly) the existing gather path.
- `src/web/main.ts` — replace `findPath` A* + `pending`/`confirmWalk` with the
  route model (§1–4). Delete the web-local A*. Keep `expeditionGrid`, `moveCost`,
  the energy-bar split, Fight/Shoot/Survey affordances (re-keyed to last waypoint).
- `src/sim/route.ts` — add the `route` waypoint directive using `lineTiles`; keep
  `routeTo`/`dijkstraFrom`/`pathWaypoints` parked for the future balance calculator.
- `src/sim/play.ts` / `cli.ts` — swap the `travel` directive help/handling for
  `route`; keep output-append discipline (never reshape existing lines).
- `.claude/skills/blind-playtest/SKILL.md` — **update the routing methodology.**
  Today it calls web A* "the true human interface" and tells the synthesis to
  **discount single-step / no-pathfinding routing complaints as a harness artifact**
  (lines ~20, ~65). Post-change, manual routing is a *real mechanic on both
  surfaces* — routing friction findings are now signal, not artifact. Rewrite that
  guidance and the `travel`→`route` directive references so the next playtest reads
  routing findings correctly.
- `docs/decisions.md` — new **D74** row: "Routing is the player's job —
  direct-line + player-planned waypoints; retire the auto-router from play (park
  the solver for a future balance calculator). Cite core-loop spec." 
- `docs/balance-levers.md` — no new numeric lever (structural change); note the
  routing-model change if a levers cross-reference is warranted.
- Follow-up bead: **large-scale auto-routing balance calculator** (reuses
  `routeTo`), P3/P4, blocked on nothing but out of scope here.

## Testing

- **`line.ts` unit tests:** `lineTiles` is deterministic, connected (each step is an
  8-neighbour of the previous), endpoint-inclusive/start-exclusive, symmetric-ish
  cases (axis-aligned, pure diagonal, shallow/steep slopes), single-tile and
  zero-length.
- **Leg costing:** a leg over a wall reports `blockedAt` at the first impassable
  tile; total cost sums only pre-block tiles.
- **Sim `route` directive:** waypoint list executes leg-by-leg; stops + reports on
  block/fight/full-bag; auto-gathers a node it passes over; single-waypoint route
  equals a straight walk.
- **Auto-gather pause:** a walk over a node with a full bag pauses at that tile with
  route intact; over a node with room, gathers and continues; over a too-weak node,
  skips without stopping.
- **Self-crossing route:** build a cross/plus route; truncation on the shared centre
  tile snaps to the earliest walk-order occurrence (not the later leg); total cost
  double-counts the revisited tile correctly; the energy-bar spend segment clamps to
  the bar width when planned cost ≥ current energy (no layout overflow — the "bar
  explosion" guard).
- **Cost split + toggle:** with auto-gather ON, a route over a resolved node shows
  `walk + gather` split and the action-points part equals `gatherCost`; over an
  UNresolved node, action points stay 0; with auto-gather OFF, action points are 0
  regardless. `gatherCost` unit test matches the energy `gather` actually spends.
- **Auto-gather toggle:** `toggle-auto-gather` flips `autoGather`; default reads as
  `true` when absent; a walk with it OFF crosses nodes without harvesting.
- **Boundary test** (`test/boundary.test.ts`) still green — `line.ts` imports
  nothing from render/sim/web and uses no RNG/DOM/Date.
- Quality gates: `bun test` + `bun run typecheck` + `bun run lint` green.

## Non-goals

- The future large-scale auto-routing **balance calculator** (parked `routeTo`).
- Any change to combat, gather yields, terrain costs, or the energy/HP budget.
- Changing what `gather` does — we only *auto-invoke* the existing action.
