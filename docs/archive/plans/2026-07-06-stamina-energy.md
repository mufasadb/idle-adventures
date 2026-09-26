# Stamina Energy Rework — Implementation Plan

> Execute task-by-task; gate after each; commit per task. Spec: `docs/superpowers/specs/2026-07-06-stamina-energy-design.md`. **This reworks the food economy — the sustainability harness re-derivation (Task 6) is a HARD merge gate.**

**Goal:** Replace front-loaded food with a max/current stamina model: start at max, drain on actions, eat food to refill (tent multiplies), waste-free auto-eat toggle.

**Architecture:** `expedition` gains `maxEnergy` + `autoEat`; `food.ts` swaps `digest`→`eatToRefill`; embark starts at max; move/gather drain then auto-eat; new `eat`/`toggle-auto-eat` actions; a `tent` tool. No pathfinding/topology/combat changes.

## Global Constraints
- Engine pure; closed unions (D30). New expedition fields set at embark; `maps`/optional-field pattern already exists — follow it.
- Levers only in `constants.ts`. `MAX_ENERGY=300`, `TENT_FOOD_MULTIPLIER=1.5` (tunable); remove `BASE_ENERGY_FLOOR`.
- Gate after each task: `bun test` + `bun run typecheck` + `bun run lint`. Commit per task. **Do NOT merge unless the sustainability harness (Task 6) is genuinely green.**

---

### Task 1: Levers
`src/data/constants.ts`: add `export const MAX_ENERGY = 300;` and `export const TENT_FOOD_MULTIPLIER = 1.5;` (with comments). Remove `BASE_ENERGY_FLOOR` (grep for its uses first — reduce.embark and tests; they change in later tasks). Keep `FOOD_ENERGY`/`ENERGY_PER_FOOD` (now = restore-per-unit). Add tent catalog: `TOOL_CAPABILITY.tent = "camp"`, `TOOL_QUALITY.tent = 1`, `RECIPE.tent = { inputs:[{defId:"deer-hide",qty:2},{defId:"pine-log",qty:2}], output:{defId:"tent",qty:1} }`. Gate (typecheck will flag removed-lever uses — those are Tasks 2-3); commit with Task 3.

### Task 2: `food.ts` — `eatToRefill` (TDD)
Replace `digest` with:
```ts
// Eat whole food units off the FRONT to refill CURRENT energy toward maxEnergy,
// but only when a full unit's restore fits (never overfills/wastes). tentMult
// multiplies restore-per-unit. Pure — returns the remaining food + new energy.
export function eatToRefill(
  food: ItemStack[], energy: number, maxEnergy: number, tentMult = 1,
): { food: ItemStack[]; energy: number } {
  const next = food.map((s) => ({ ...s }));
  let e = energy;
  while (next.length > 0) {
    const restore = foodEnergyOf(next[0]!.defId) * tentMult;
    if (e + restore > maxEnergy) break;      // would waste — stop
    e += restore;
    next[0]!.qty -= 1;
    if (next[0]!.qty <= 0) next.shift();
  }
  return { food: next, energy: e };
}
```
Keep `foodEnergyOf`/`heldFoodEnergy`. Tests (`test/food.test.ts` — create if absent): waste-free (energy near max → no eat); eats when room; tent multiplier (×1.5); stops when food empty; never exceeds max. TDD: write failing, implement, pass. Gate + commit `git commit -m "dtv: eatToRefill — refill current energy toward max, waste-free"`.

### Task 3: `types.ts` + reducer core (TDD)
- `types.ts`: add `maxEnergy: number` and `autoEat: boolean` to the `Expedition` type; add `| { type: "eat" }` and `| { type: "toggle-auto-eat" }` to `Action`.
- `reduce.ts` **embark**: set `maxEnergy = MAX_ENERGY`, `energy = MAX_ENERGY`, `autoEat: true` in the new expedition; delete the `foodEnergy`/`max(BASE_ENERGY_FLOOR, …)` lines and the `BASE_ENERGY_FLOOR`/`ENERGY_PER_FOOD`/`FOOD_ENERGY` embark imports no longer needed.
- `reduce.ts` **move + gather**: after subtracting the action cost from energy, replace the `digest(...)` call with:
```ts
const tentMult = expedition.loadout.equipment.tools.includes("tent") ? TENT_FOOD_MULTIPLIER : 1;
const fed = expedition.autoEat
  ? eatToRefill(expedition.loadout.food, energy, expedition.maxEnergy, tentMult)
  : { food: expedition.loadout.food, energy };
// use fed.food + fed.energy in the returned expedition
```
- New actions in the switch: `case "eat": return eat(state);` and `case "toggle-auto-eat": return toggleAutoEat(state);`.
  - `eat(state)`: expedition-phase; if no food or `energy >= maxEnergy` → reject `insufficient`; else eat ONE front unit at `restore = foodEnergyOf × tentMult`, `energy = min(maxEnergy, energy + restore)`, remove the unit; emit an `ate` event `{type:"ate", defId, energy}` (add to GameEvent union).
  - `toggleAutoEat(state)`: flip `expedition.autoEat`; emit nothing or a small event; keep simple.
- Tests (`test/reduce-embark.test.ts` + a new `test/reduce-eat.test.ts`): embark energy `=== MAX_ENERGY` (not food-based) and `maxEnergy`/`autoEat` set; `eat` refills one unit; `toggle-auto-eat` flips; auto-eat during move refills from food. TDD where practical. Gate + commit `git commit -m "dtv: stamina model — embark at max, drain+auto-eat, eat/toggle actions, tent"` (bundle Task 1 lever + tent here).

### Task 4: Reconcile the rest of the suite
Run `bun test`; fix every hardcoded energy/embark expectation to the new model:
- `reduce-embark`: energy = MAX_ENERGY; the zero-food/floor test now asserts `energy === MAX_ENERGY` (start at max regardless of food); the food-energy debit test still debits the bank but energy is MAX_ENERGY.
- `consumable-transport-tiers`: the ration/trail "energy" asserts (240/480) become about REFILL, not embark energy — rewrite that test to check that eating restores the right amounts (ration 80, trail 160; ×1.5 with tent), not embark energy.
- `reduce-move`/`reduce-gather`: energy literals — with MAX_ENERGY=300 the 200-based setups mostly still work; adjust any that assumed the old floor.
- `legal.test`: add `eat`/`toggle-auto-eat` where appropriate.
- Remove/replace any `BASE_ENERGY_FLOOR` import in tests. Gate + commit `git commit -m "dtv: reconcile test suite to the stamina model"`.

### Task 5: Web + console display
- Web (`src/web/main.ts`): energy bar → `current / maxEnergy` (use `exp.maxEnergy`); add a `🍖 Eat` action button (wired to `{type:"eat"}`) and an `Eat when hungry: [on/off]` toggle (`{type:"toggle-auto-eat"}`, reflect `exp.autoEat`); loadout tent note "tent — food restores +50%". Add `fmt` cases for `ate`.
- Console (`src/sim/playtest.ts`): `energy: cur/max`; show `autoEat` + tent effect; `eat` shows up in legal actions naturally. Gate + commit `git commit -m "dtv: web + console — current/max energy, eat button + toggle"`.

### Task 6: Sustainability re-derivation (HARD GATE) + docs + verify + push
- **Re-derive `test/harness-sustainability.test.ts`** to the stamina model: the greedy `oneRun` player embarks at MAX_ENERGY and relies on auto-eat to refill from foraged food; confirm both tests (herb-poor tundra + diverse rotation) stay green — i.e. the player never starves and still bootstraps a backpack. If they go red, the model or levers need adjustment BEFORE merge — do not hand-wave. If the greedy harness needs new logic (e.g. it embarked with a specific food count), update it to the new semantics.
- `docs/decisions.md`: new `Dnn` — stamina energy (max/current, eat-to-refill, tent multiplier, `MAX_ENERGY`/`TENT_FOOD_MULTIPLIER`, removed `BASE_ENERGY_FLOOR`); **supersedes D35**. `docs/balance-levers.md`: update the energy section.
- Full gates green. In-browser smoke: embark → energy shows `300/300`; walk to drain; confirm auto-eat refills from packed food and the bar tracks; toggle off + `Eat` manually; pack a tent and confirm food lasts longer. Screenshot.
- Merge to main (ff), `git push && bd dolt push`, delete branch, `bd close idle-adventure-dtv --reason="Stamina energy model shipped (max/current, eat-to-refill, tent ×1.5, waste-free auto-eat); sustainability re-derived green; supersedes D35."`. Report commits, final test count, screenshot, summary.

## Notes for the implementer
- This is the biggest churn of the recent reworks — expect ~10-15 test edits. Work task-by-task and keep the suite green at each commit.
- If a single action could cost more than MAX_ENERGY, it can't here (max 300, costs ≤ ~60) — no need to handle that.
- The `ate`/toggle events are new closed-union members: update every exhaustive `switch` on `GameEvent`/`Action` (web `fmt`, `sim/report`, `sim/legal`, `sim/playtest`).
