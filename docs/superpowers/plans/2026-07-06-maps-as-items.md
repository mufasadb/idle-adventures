# Maps-as-Items — Implementation Plan

> Execute task-by-task; gate after each; commit per task. Spec: `docs/superpowers/specs/2026-07-06-maps-as-items-design.md`.

**Goal:** Maps become pocketable/stockpileable items; embarking a held map consumes it; "go nearby" (embark a currently-offered map) stays the free default.

**Architecture:** Add a `maps: MapItem[]` collection to `GameState` and a `pocket-map` action; `embark` accepts a currently-offered seed (unconsumed) OR a held-map seed (consumed). Reduce stays the source of truth; web/console surface the offer + held collection. No economy/lever change.

## Global Constraints
- Engine pure; `RejectionReason` is a closed union (D30). `maps` is optional on `GameState` (absent = `[]`).
- `embark` carries only `mapSeed`. No change to `candidateMaps`, rotation, energy, or levers.
- Gate after each task: `bun test` + `bun run typecheck` + `bun run lint` green before commit. Commit per task.

---

### Task 1: State + action types

**Files:** `src/engine/types.ts`.

- [ ] **Step 1.** Add the `MapItem` type (near `GameState`), export it:
```ts
export type MapItem = { mapSeed: string; biomeId: BiomeId; vintage: number };
```
- [ ] **Step 2.** Add `maps?: MapItem[]` to the `GameState` type (the held collection; absent = none).
- [ ] **Step 3.** Add the action to the `Action` union: `| { type: "pocket-map"; mapSeed: string }`.
- [ ] **Step 4.** Add `"already-pocketed"` to the `RejectionReason` union.
- [ ] **Step 5.** Gate (`bun run typecheck` will flag the reducer's non-exhaustive switch — that's Task 2). Run `bun test test/types.test.ts` if present; else proceed. Commit after Task 2 (types alone don't build clean).

---

### Task 2: Reducer — `pocket-map` + `embark` consumes held maps

**Files:** `src/engine/reduce.ts`; Test `test/reduce-map.test.ts` (new).

**Current `embark` (for reference)** starts:
```ts
if (state.phase !== "town") return rejected(state, "embark", "not-in-town");
const offered = candidateMaps(state.seed, state.runs ?? 0).map((m) => m.mapSeed);
if (!offered.includes(mapSeed)) return rejected(state, "embark", "not-offered");
// D28: settle the plan against the bank …
```

- [ ] **Step 1: Write failing tests.** Create `test/reduce-map.test.ts`:
```ts
import { test, expect } from "bun:test";
import { reduce } from "../src/engine/reduce";
import { emptyLoadout } from "../src/engine/loadout";
import { candidateMaps } from "../src/engine/town";
import { rollBiome } from "../src/engine/grid";
import type { GameState } from "../src/engine/types";

function town(seed = "m", runs = 0): GameState {
  return { seed, phase: "town", runs, bank: [], loadout: emptyLoadout(), expedition: null, maps: [] };
}

test("pocket-map: an offered map is added to the held collection with its biome + vintage", () => {
  const s = town("m", 0);
  const offer = candidateMaps("m", 0);
  const { state } = reduce(s, { type: "pocket-map", mapSeed: offer[0]!.mapSeed });
  expect(state.maps).toEqual([{ mapSeed: offer[0]!.mapSeed, biomeId: offer[0]!.biomeId, vintage: 0 }]);
});

test("pocket-map: pocketing the same map twice is rejected", () => {
  const offer = candidateMaps("m", 0);
  const once = reduce(town("m", 0), { type: "pocket-map", mapSeed: offer[0]!.mapSeed }).state;
  const { events } = reduce(once, { type: "pocket-map", mapSeed: offer[0]!.mapSeed });
  expect(events).toEqual([{ type: "action-rejected", action: "pocket-map", reason: "already-pocketed" }]);
});

test("pocket-map: a non-offered seed is rejected", () => {
  const { events } = reduce(town("m", 0), { type: "pocket-map", mapSeed: "not-real" });
  expect(events).toEqual([{ type: "action-rejected", action: "pocket-map", reason: "not-offered" }]);
});

test("embark: a HELD map embarks and is consumed (removed from maps)", () => {
  const offer = candidateMaps("m", 0);
  const held = reduce(town("m", 0), { type: "pocket-map", mapSeed: offer[0]!.mapSeed }).state;
  const { state, events } = reduce(held, { type: "embark", mapSeed: offer[0]!.mapSeed });
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(state.maps).toEqual([]); // consumed
});

test("embark: 'go nearby' (a currently-offered map, not held) does not touch the collection", () => {
  const offer = candidateMaps("m", 0);
  const s: GameState = { ...town("m", 0), maps: [{ mapSeed: "other:map:9:9", biomeId: rollBiome("other:map:9:9"), vintage: 0 }] };
  const { state, events } = reduce(s, { type: "embark", mapSeed: offer[1]!.mapSeed });
  expect(events.some((e) => e.type === "embarked")).toBe(true);
  expect(state.maps!.length).toBe(1); // untouched — go-nearby consumed nothing
});

test("embark: a seed neither offered nor held is rejected (farm loop stays closed)", () => {
  const { events } = reduce(town("m", 0), { type: "embark", mapSeed: "arbitrary" });
  expect(events).toEqual([{ type: "action-rejected", action: "embark", reason: "not-offered" }]);
});
```

- [ ] **Step 2: Run, verify fail.** `bun test test/reduce-map.test.ts` → FAIL (pocket-map unhandled; embark rejects held maps).

- [ ] **Step 3: Add the `pocket-map` case + function.** In `reduce.ts`, add to the action switch `case "pocket-map": return pocketMap(state, action.mapSeed);` and implement:
```ts
function pocketMap(state: GameState, mapSeed: string): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "pocket-map", "not-in-town");
  const offer = candidateMaps(state.seed, state.runs ?? 0);
  const found = offer.find((m) => m.mapSeed === mapSeed);
  if (!found) return rejected(state, "pocket-map", "not-offered");
  const maps = state.maps ?? [];
  if (maps.some((m) => m.mapSeed === mapSeed)) return rejected(state, "pocket-map", "already-pocketed");
  const item = { mapSeed: found.mapSeed, biomeId: found.biomeId, vintage: state.runs ?? 0 };
  return { state: { ...state, maps: [...maps, item] }, events: [{ type: "pocketed-map", mapSeed, biomeId: found.biomeId }] };
}
```
Add the `pocketed-map` event to the `GameEvent` union in `types.ts`: `| { type: "pocketed-map"; mapSeed: string; biomeId: BiomeId }`.

- [ ] **Step 4: Change `embark` to accept + consume held maps.** Replace the offered-only guard:
```ts
  const offered = candidateMaps(state.seed, state.runs ?? 0).map((m) => m.mapSeed);
  const held = state.maps ?? [];
  const wasHeld = held.some((m) => m.mapSeed === mapSeed);
  if (!offered.includes(mapSeed) && !wasHeld) return rejected(state, "embark", "not-offered");
```
Then, in the success-path returned state, consume the held map if it was one — set `maps: wasHeld ? held.filter((m) => m.mapSeed !== mapSeed) : held` in the new `state` object (alongside `phase`, `bank`, `loadout`, `expedition`). Leave everything else unchanged.

- [ ] **Step 5: Run, verify pass + full suite.** `bun test` → all green (reduce-map passes; existing embark tests still pull offered seeds so they still work). Fix any exhaustive-switch spots the compiler flags (e.g. `sim/report`, `web` fmt) — a new event type may need a case; a new action type is handled by `legalActions` in Task 3.

- [ ] **Step 6: Gate + commit.** `bun test && bun run typecheck && bun run lint`; `git add src/engine/types.ts src/engine/reduce.ts test/reduce-map.test.ts && git commit -m "xzx: maps-as-items — pocket-map + embark consumes held maps"`.

---

### Task 3: legalActions — pocket + embark-held

**Files:** `src/sim/legal.ts`; Test `test/legal.test.ts`.

- [ ] **Step 1: Write failing test.** Append to `test/legal.test.ts` a test: from a fresh `newGame("s")`, `legalActions` includes a `pocket-map` for each offered seed; after pocketing one, `legalActions` includes an `embark` for the held map's seed. (Use `candidateMaps("s",0)` for the seeds.)

- [ ] **Step 2: Implement.** In `townActions`, after the existing embark loop, add:
```ts
  // pocket each offered map you don't already hold; embark each held map (Task xzx)
  const held = new Set((state.maps ?? []).map((m) => m.mapSeed));
  for (const map of candidateMaps(state.seed, state.runs ?? 0)) {
    if (!held.has(map.mapSeed)) candidates.push({ type: "pocket-map", mapSeed: map.mapSeed });
  }
  for (const m of state.maps ?? []) candidates.push({ type: "embark", mapSeed: m.mapSeed });
```
(The existing embark-offered loop stays. `accepts()` filters via reduce, so held-map embarks that would fail bank checks drop out for free.)

- [ ] **Step 3: Run, gate, commit.** `bun test test/legal.test.ts && bun test && bun run typecheck && bun run lint`; `git add src/sim/legal.ts test/legal.test.ts && git commit -m "xzx: legalActions — pocket-map + embark held maps"`.

---

### Task 4: Web town — pocket buttons + "Your maps" section

**Files:** `src/web/main.ts`.

- [ ] **Step 1.** In `townView`, the map-offer section: for each offered map, keep the **Embark** button (go nearby) and add a **Pocket** button `<button data-pocket="${m.mapSeed}">Pocket</button>` (skip Pocket if already held).
- [ ] **Step 2.** Add a **"Your maps"** section listing `state.maps ?? []`: each row `{name(biomeId)} · ${(state.runs ?? 0) - m.vintage} runs old` + an **Embark ▶ (spend)** button `data-embark="${m.mapSeed}"`. Empty state: "(none — pocket a map to keep it for later)".
- [ ] **Step 3.** Wire the new button: `app.querySelectorAll("[data-pocket]").forEach((el) => el.onclick = () => apply({ type: "pocket-map", mapSeed: el.dataset.pocket! }));` (mirror the existing `[data-embark]` wiring). Add a `fmt` case for `pocketed-map` → `📜 pocketed a ${name(e.biomeId)} map`.
- [ ] **Step 4.** Gate; commit `git add src/web/main.ts && git commit -m "xzx: web town — pocket maps + held-maps section"`.

---

### Task 5: Console + docs + verify + push

**Files:** `src/sim/playtest.ts`, `docs/decisions.md`, `docs/balance-levers.md`.

- [ ] **Step 1: Console.** In `playtest.ts` `printTown`, after the offer, add pocketing hints (`pocket mapSeed="…"`) and a **"Your maps (held)"** list from `state.maps ?? []` (`{biomeId} · {n} runs old · embark mapSeed="…" (spends it)`). Note held maps embark even after the offer rotates.
- [ ] **Step 2: Docs.** `docs/decisions.md`: new `Dnn` — maps-as-items (pocketable/held, consumed on embark; "go nearby" default; extends the 9u9.3 no-farm model). `docs/balance-levers.md`: note the held-maps collection (no cap this pass).
- [ ] **Step 3: Full gates.** `bun test && bun run typecheck && bun run lint` → green.
- [ ] **Step 4: In-browser smoke.** Start `bun ./src/web/index.html`, drive with `agent-browser`: pocket a map from the offer → it appears in "Your maps"; embark a held map → it's consumed (leaves the list) and you're on that biome; the offer's plain Embark still works ("go nearby"). Screenshot the town with a held map. Stop the server.
- [ ] **Step 5: Push.** Merge branch to main (ff), `git push && bd dolt push`, delete branch. Then close the bead: `bd close idle-adventure-xzx --reason="Maps-as-items shipped: pocket/stockpile + consumed-on-embark + go-nearby default. Verified in-browser."`. Report commits, gate results, screenshot, and a short summary.

## Self-Review
- Spec §2 data/actions → Tasks 1–2. §3 surfaces → Tasks 3 (legal), 4 (web), 5 (console). §4 testing → Tasks 2 (reduce), 3 (legal). ✓
- Types consistent: `MapItem`/`GameState.maps`/`pocket-map`/`pocketed-map`/`already-pocketed` defined in Task 1–2, consumed in 3–5. ✓
- No placeholders; embark change is additive to the existing guard; existing embark tests unaffected (offered seeds still valid). ✓
