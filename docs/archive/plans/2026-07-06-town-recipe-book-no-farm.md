# Town Recipe Book + No-Farm Map Choice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tech tree visible (full recipe book) and close the seed re-farm exploit (embark validates against the 3 offered candidate maps), both on the town screen.

**Architecture:** One engine change — the `embark` reducer validates `mapSeed ∈ candidateMaps(seed, runs)` with a new `"not-offered"` rejection reason (making `reduce` the source of truth `legalActions` already assumes). The rest is `townView` presentation over existing pure data: list all `RECIPE` entries, and offer all 3 candidate maps instead of one random pick.

**Tech Stack:** TypeScript, bun (`bun test`), ESLint flat config (engine-purity boundary).

## Global Constraints

- Engine is pure: `reduce(state, action) → {state, events}`, no DOM/`Math.random`/`Date.now`, no `render`/`sim`/`web` imports under `src/engine/**`. `RejectionReason` is a closed union (D30).
- `embark` carries only `mapSeed`; `candidateMaps(seed, runs)` is the pure source of the offer (town.ts).
- No magic numbers in engine logic.
- Gates every task: `bun test` + `bun run typecheck` + `bun run lint` green before commit.

---

### Task 1: `embark` validates the chosen map is offered

**Files:**
- Modify: `src/engine/types.ts` (add `"not-offered"` to `RejectionReason`)
- Modify: `src/engine/reduce.ts` (import `candidateMaps`; add the guard in `embark`)
- Test: `test/reduce-embark.test.ts`

**Interfaces:**
- Consumes: `candidateMaps(seed: string, runs?: number)` from `./town`.
- Produces: `embark` rejects `"not-offered"` for any `mapSeed` not in `candidateMaps(state.seed, state.runs ?? 0)`; candidate seeds still embark.

- [ ] **Step 1: Add the rejection reason.** In `src/engine/types.ts`, add `  | "not-offered"` to the `RejectionReason` union (near the other embark reasons like `"not-in-town"`/`"unaffordable"`).

- [ ] **Step 2: Update existing embark tests to use offered seeds + add the guard test.** In `test/reduce-embark.test.ts`:

Add the import:
```ts
import { candidateMaps } from "../src/engine/town";
```
Replace every ad-hoc embark `mapSeed` with the state's first offered candidate. Concretely:
- In the tests that use `townState()` (seed `"g"`, runs 0), replace `mapSeed: "m2-map"` with `mapSeed: candidateMaps("g", 0)[0]!.mapSeed` and replace the `mapSeed: "m2-map"` value in the expected `embarked` event with the same expression.
- In "embark: debits the packed loadout…" and "embark: unaffordable plan is rejected…" (seed `"e"`), replace `mapSeed: "map-1"` with `mapSeed: candidateMaps("e", 0)[0]!.mapSeed`.
- In "embark: zero-food embark falls back…" (seed `"e"`), replace `mapSeed: "map-1"` with `mapSeed: candidateMaps("e", 0)[0]!.mapSeed`.
- Leave "embark: rejected while already on expedition" unchanged — its second embark (`"other"`) is rejected `"not-in-town"` (phase check runs first), which still holds.

Then add the new guard test:
```ts
test("embark: an off-offer seed is rejected (no seed re-farming, 9u9.3)", () => {
  const { state, events } = reduce(townState(), { type: "embark", mapSeed: "not-a-real-offer" });
  expect(state.phase).toBe("town"); // no phase change, costs nothing
  expect(events).toEqual([
    { type: "action-rejected", action: "embark", reason: "not-offered" },
  ]);
});

test("embark: the offer rotates with runs — last visit's seed is no longer valid", () => {
  const s0 = { ...townState(), runs: 0 };
  const prevSeed = candidateMaps("g", 0)[0]!.mapSeed;
  const s1 = { ...townState(), runs: 1 };
  const offeredNow = candidateMaps("g", 1).map((m) => m.mapSeed);
  // prevSeed is (almost surely) not in the runs=1 offer → rejected.
  if (!offeredNow.includes(prevSeed)) {
    expect(reduce(s1, { type: "embark", mapSeed: prevSeed }).events).toEqual([
      { type: "action-rejected", action: "embark", reason: "not-offered" },
    ]);
  }
  // sanity: a current offer for runs=1 is accepted.
  expect(reduce(s1, { type: "embark", mapSeed: offeredNow[0]! }).events[0]!.type).toBe("embarked");
  void s0; void prevSeed;
});
```

- [ ] **Step 3: Run, verify fail.** Run: `bun test test/reduce-embark.test.ts`. Expected: the new `"not-offered"` test FAILS (embark still accepts any seed → no rejection). The updated existing tests should already pass (they now use valid offers) — if any fail, the offered-seed swap is the cause; fix the seed expression.

- [ ] **Step 4: Implement the guard.** In `src/engine/reduce.ts`, add to the imports from `./town` (or add the import if none): `import { candidateMaps } from "./town";`. In the `embark` function, immediately after the phase check (`if (state.phase !== "town") return rejected(state, "embark", "not-in-town");`), add:

```ts
  const offered = candidateMaps(state.seed, state.runs ?? 0).map((m) => m.mapSeed);
  if (!offered.includes(mapSeed)) return rejected(state, "embark", "not-offered");
```

- [ ] **Step 5: Run, verify pass + boundary.** Run: `bun test test/reduce-embark.test.ts test/boundary.test.ts`. Expected: all PASS (`reduce` → `town` is an engine→engine import; no purity violation).

- [ ] **Step 6: Full gates.** Run: `bun test && bun run typecheck && bun run lint`. Expected: green. (If `test/legal.test.ts` or `test/play.test.ts` embark ad-hoc seeds, update them to offered seeds the same way.)

- [ ] **Step 7: Commit.**

```bash
git add src/engine/types.ts src/engine/reduce.ts test/reduce-embark.test.ts
git commit -m "9u9.3: embark validates mapSeed is an offered candidate (no seed re-farming)"
```

---

### Task 2: Web — offer all 3 candidate maps

**Files:**
- Modify: `src/web/main.ts` (`townView` map card; remove `chosenMap`/`pickMap`)

**Interfaces:**
- Consumes: `candidateMaps` (already imported), `state.runs`.

- [ ] **Step 1: Replace the single-map state with the full offer.** In `src/web/main.ts`:

Remove the `chosenMap` module variable (line ~47) and the `pickMap` function (lines ~66-70). Remove the `if (action.type === "embark") chosenMap = null;` line (~77) and the `chosenMap = null;` in `newRun` (~63). Remove the `if (!chosenMap) chosenMap = pickMap();` line in `townView` (~212).

Replace the "Next map" card block (`townView`, lines ~220-227) with a 3-map offer:

```ts
    <section>
      <h2>Choose a map <span class="muted small">(3 fresh each visit — no going back)</span></h2>
      <div class="mapoffer">
        ${candidateMaps(state.seed, state.runs ?? 0).map((m) => `
          <div class="mapcard">
            <b>${m.preview.headline}</b>
            <button data-embark="${m.mapSeed}">Embark ▶</button>
          </div>`).join("")}
      </div>
      ${lo.food.length === 0 ? `<div class="warn">⚠ no food packed → you'll embark with 0 energy</div>` : ""}
      <div class="muted small">Pick a biome to work this run. The offer rotates every time you return.</div>
    </section>
```

- [ ] **Step 2: Typecheck + lint.** Run: `bun run typecheck && bun run lint`. Expected: green (no dangling `chosenMap`/`pickMap` references — if lint flags an unused import or var, remove it).

- [ ] **Step 3: Full test.** Run: `bun test`. Expected: green (town screen isn't snapshotted; no test depends on `pickMap`).

- [ ] **Step 4: Manual smoke (recommended).** Launch the web build; confirm town shows 3 map cards by biome, each Embark works, and after returning the offer changes.

- [ ] **Step 5: Commit.**

```bash
git add src/web/main.ts
git commit -m "9u9.3: web — offer all 3 candidate maps (biome choice is the per-visit lever)"
```

---

### Task 3: Web — full recipe book

**Files:**
- Modify: `src/web/main.ts` (`townView` Craft section)

**Interfaces:**
- Consumes: `RECIPE` (already imported), the existing `craftable` legal set, `name(defId)`.

- [ ] **Step 1: Replace the affordable-only craft list with a full book.** In `src/web/main.ts` `townView`, replace the Craft `<section>` (lines ~256-265) with:

```ts
    <section>
      <h2>Recipe book <span class="muted small">everything craftable · ingredients named, sources not</span></h2>
      <div class="craftlist">
        ${(() => {
          const affordable = new Set(craftable.map((a) => a.recipeId));
          const ids = Object.keys(RECIPE).sort((a, b) => {
            const av = affordable.has(a) ? 0 : 1, bv = affordable.has(b) ? 0 : 1;
            return av - bv; // affordable first, else stable insertion order
          });
          return ids.map((id) => {
            const r = RECIPE[id]!;
            const cost = r.inputs.map((i) => `${i.qty}× ${name(i.defId)}`).join(" + ");
            const can = affordable.has(id);
            const out = `${r.output.qty}× ${name(r.output.defId)}`;
            return `<div class="craftitem${can ? "" : " locked"}">${
              can
                ? `<button data-craft="${id}">${out}</button>`
                : `<span class="craftname">${out}</span>`
            }<span class="muted small">${cost}</span></div>`;
          }).join("");
        })()}
      </div>
    </section>
```

- [ ] **Step 2: Add a `.locked` style hint (optional, keep minimal).** In the web stylesheet (the `<style>` block in `src/web/index.html`, or wherever `.craftitem` is styled), add a muted rule so locked rows read as unavailable:

```css
.craftitem.locked { opacity: 0.55; }
.craftitem .craftname { font-weight: 600; }
```
(If the styles live inline in `main.ts`, add it there instead — match the existing pattern. If there's no obvious stylesheet, skip the CSS; the `(locked)` distinction still reads from the missing button.)

- [ ] **Step 3: Typecheck + lint.** Run: `bun run typecheck && bun run lint`. Expected: green.

- [ ] **Step 4: Full test.** Run: `bun test`. Expected: green.

- [ ] **Step 5: Manual smoke (recommended).** Launch the web build; confirm the town Craft panel lists *every* recipe (affordable ones with a button on top, locked ones greyed below), each showing ingredient names + quantities, and no source/location text.

- [ ] **Step 6: Commit.**

```bash
git add src/web/main.ts src/web/index.html
git commit -m "9u9.1: web — full recipe book (all outputs + ingredient names, no sources)"
```

---

### Task 4: Close beads + sync

- [ ] **Step 1: Final gates.** Run: `bun test && bun run typecheck && bun run lint`. Expected: all green.

- [ ] **Step 2: Close + push (per the active git/sync policy).**

```bash
bd close idle-adventure-9u9.1 idle-adventure-9u9.3 --reason="Town screen: full recipe book (all outputs + ingredient names) + embark validated against the 3 offered candidate maps (no seed re-farming). Plan: 2026-07-06-town-recipe-book-no-farm.md"
git push
bd dolt push
```

---

## Self-Review

**Spec coverage:**
- §2.A recipe book (all RECIPE, ingredient names+qty, affordable-first, no sources) → Task 3. ✓
- §2.B engine embark validation (`not-offered`, candidateMaps, D29) → Task 1. ✓
- §2.B web 3-map offer (replace random pickMap) → Task 2. ✓
- §4 testing (candidate seed still embarks, off-offer rejected, rotates with runs, existing embark tests updated) → Task 1. ✓

**Placeholder scan:** No TBD/TODO; the CSS step is explicitly optional-with-fallback, not a placeholder. Test bodies are complete.

**Type consistency:** `candidateMaps(seed, runs)` used identically in Task 1 (engine + tests) and Task 2 (web). `"not-offered"` added to the union in Task 1 and asserted in Task 1's tests. `craftable`/`RECIPE`/`name` reused as they already exist in `townView`. ✓
