# Stamina Energy Rework — max/current + eat-to-refill + tent

**Bead:** `idle-adventure-dtv`. **Supersedes D35/pqp** (front-loaded just-in-time food). Addresses playtest reach (F2) + "bump base energy."

## 1. Problem

Today energy is fixed at embark (`max(BASE_ENERGY_FLOOR, packedFoodEnergy)`); food auto-digests only to free slots — it never *adds* reach mid-run, and reach reads as opaque (playtest: "food seems optional"). We want the standard, legible **stamina** loop: a max/current energy bar you refill by eating, so food is an *ongoing* reach decision and a tent can make food go further.

## 2. Model

- **`MAX_ENERGY` (base ceiling, bumped up).** `expedition.maxEnergy` = `MAX_ENERGY` (later raisable by gear — a future progression axis). `expedition.energy` (current) **starts at max on embark**, regardless of food.
- **Draining.** move/gather subtract from current `energy`. When `energy` can't cover an action's cost *and* no food is left to eat, the action is rejected `exhausted` — with 0 energy your only move is `return` (return is always free).
- **Eating restores energy.** Consuming one food unit sets `energy = min(maxEnergy, energy + restore)`, where `restore = FOOD_ENERGY[defId] × tentMult`. `FOOD_ENERGY` (ration 80, trail-ration 160) is now the *restore per unit*; `tentMult = TENT_FOOD_MULTIPLIER` if a tent is equipped, else 1.
- **Total reach ≈ `maxEnergy + Σ(food restore × tentMult)`** — so food is additive reach (was previously the *source* of the whole budget), and a tent stretches each ration.
- **"Eat when hungry" toggle (waste-free auto-eat).** `expedition.autoEat` (default `true`). After each energy spend, if `autoEat` and there's food and a full unit's restore fits under max (`energy ≤ maxEnergy − restore`), auto-eat one unit; repeat while it fits. This never overfills/wastes food. A `toggle-auto-eat` action flips it; a manual `eat` action eats one unit now (player's choice, even if slightly wasteful).

**New levers (`constants.ts`):** `MAX_ENERGY` (propose **300**; tunable), `TENT_FOOD_MULTIPLIER` (propose **1.5**). **Remove `BASE_ENERGY_FLOOR`** (its "recoverable short run" role is now "start at max, no food to refill"). `FOOD_ENERGY`/`ENERGY_PER_FOOD` keep their values, new meaning (restore-per-unit).

## 3. Engine changes

- **`food.ts`:** replace `digest(food, energy)` with `eatToRefill(food, energy, maxEnergy, tentMult)` → `{ food, energy }`: while food remains and `energy ≤ maxEnergy − foodEnergyOf(front)×tentMult`, eat the front unit (`energy += that`, remove unit). Keep `foodEnergyOf`; `heldFoodEnergy` may stay for display (the reserve still in food).
- **`reduce.ts` embark:** set `maxEnergy = MAX_ENERGY`, `energy = maxEnergy`, `autoEat = true`; drop the `max(floor, foodEnergy)` computation. Food stays in `loadout.food` as the reserve.
- **`reduce.ts` move/gather:** after subtracting the action cost from `energy`, if `autoEat` run `eatToRefill(food, energy, maxEnergy, tentMult)` (tentMult from `equipment.tools.includes("tent")`), and write back both `food` and `energy`. Affordability check uses current `energy`.
- **New actions:** `eat` (eat one food unit now → `min(max, energy + restore)`, remove unit; reject `insufficient` if no food or already full) and `toggle-auto-eat` (flip `expedition.autoEat`). Add to the `Action` union + `legalActions`.
- **Expedition state (`types.ts`):** add `maxEnergy: number` and `autoEat: boolean`. Both set at embark.
- **Tent catalog:** `tent` as a durable tool — `TOOL_CAPABILITY.tent = "camp"`, `TOOL_QUALITY.tent = 1`, a `RECIPE` (propose `deer-hide ×2 + pine-log ×2`). Banks back like other tools. `NODE_TOOL` never asks for "camp" → no gather impact.

## 4. Surfaces

- **Web:** energy bar shows **current / max** (use `expedition.maxEnergy`); a `🍖 Eat` button and an `Eat-when-hungry: on/off` toggle; the loadout notes the tent's effect ("tent — food restores +50% energy").
- **Console (`playtest.ts`):** `energy: cur/max`; note the auto-eat toggle + tent effect; `eat` in legal actions.

## 5. Testing (the careful part)

- **`eatToRefill` units:** waste-free (won't eat if it'd overfill); eats when there's room; tent multiplier applied; stops when food is gone; never exceeds max.
- **embark:** `energy === maxEnergy === MAX_ENERGY` regardless of packed food; `autoEat` true.
- **move/gather:** draining then auto-eat refills from food; with food gone, energy floors and further actions reject `exhausted`; a tent makes the same food last measurably longer.
- **`eat` / `toggle-auto-eat`** actions behave; `legalActions` offers `eat` when food + room.
- **Test churn (expected, large):** every test asserting embark/energy numbers changes — `reduce-embark` (energy = MAX_ENERGY now), `consumable-transport-tiers` (food values are restores, embark = max), `reduce-move`/`reduce-gather` energy literals, any `BASE_ENERGY_FLOOR` reference. Update them to the new model.
- **HARD GATE — re-derive `test/harness-sustainability.test.ts`:** the greedy reference player now embarks at max and eats foraged food to refill. Re-derive its loop to the eat-to-refill model and confirm it never starves across the tundra + diverse rotations. **Do not merge with a red or hand-waved sustainability harness.**
- Gates: `bun test` + `bun run typecheck` + `bun run lint`. Update `docs/decisions.md` (new decision, supersedes D35) + `docs/balance-levers.md` (`MAX_ENERGY`, `TENT_FOOD_MULTIPLIER`, removed `BASE_ENERGY_FLOOR`).

## 6. Out of scope

- Gear that raises `maxEnergy` (the future progression axis) — the field exists; no gear grants it yet.
- Dedicated "energy potion" restore items — food + tent delivers the mechanic; add later.
- Difficulty re-tune for the increased reach (more energy → clear more nodes) — that's a **playtest** follow-up, not this rework; keep `POI_DENSITY` etc. as-is and let a playtest tell us.
