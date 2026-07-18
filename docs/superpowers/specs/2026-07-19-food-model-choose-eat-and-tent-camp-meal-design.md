# Food model: choose-your-eat + tent "camp meal" — Design (7lr)

**Date:** 2026-07-19
**Decision row:** D87 (add on land)
**Origin:** blind playtest 2026-07-17 F4 (`docs/2026-07-17-playtest-findings.md`, bead `7lr`) — the manual 🍖 Eat button was confusing: it auto-picked your densest food and *jumped energy TO* that food's value (so a ration at 59 energy gave only +21), and it silently no-op'd when the densest food's value was ≤ current energy. Two eating models with different math read as "the Eat button is broken." Design dialogue (2026-07-19) reshaped it around the user's intent: **manual eat should let you CHOOSE the food, and the tent's power should be a deliberate, rationed "camp meal" — not a passive multiplier.**

**The model (three parts):**

## Part 1 — Manual eat: choose the food, additive
- The `eat` Action gains a food defId: `{ type: "eat", defId }` — eat ONE unit of the CHOSEN food (was: auto-target the densest unit).
- **Normal eat** (no tent, or camp charges spent): `energy = min(energy + foodEnergyOf(defId), maxEnergy)` — additive, ×1, capped at max. Reject when the named food isn't in the reserve, or when it can't raise energy (already at/over max) — so the affordance disables cleanly instead of silently no-op'ing (the F4 fix).
- **Web:** left-click a food unit in the bag to eat one (right-click still sets it as the auto-eat food — unchanged). **Console:** `legalActions` emits an `eat` per distinct packed food defId; the console lists them.

## Part 2 — The tent is a once-per-expedition "camp meal"
All of the tent's food power lives here — nothing passive.
- New lever `TENT_CAMP_MEALS = 1` (`src/data/constants.ts`) — camp meals per expedition.
- New state `Expedition.campMealsUsed?: number` (`types.ts`, default 0 via `?? 0`; fresh per embark so it resets each run).
- A **camp meal** fires when a manual `eat` happens with a **tent equipped** (`toolSpeedFor(tools, "camp") !== null`) AND `campMealsUsed < TENT_CAMP_MEALS`:
  - `restore = foodEnergyOf(defId) × TENT_FOOD_MULTIPLIER` (the +50%),
  - `energy += restore` **UNCAPPED** — the meal can push past `maxEnergy`, banking reach beyond the bar (over-full drains normally, as manual over-eat already did),
  - `campMealsUsed += 1`.
- So with a tent + an unused charge, a manual eat IS the camp meal (the tent's whole purpose — you brought it to eat huge). Without a tent, or once the charge is spent, manual eat is the normal capped meal (Part 1). Waste-free top-ups remain auto-eat's job.

## Part 3 — Auto-eat (and everything else) loses the tent bonus
- `tentMultOf` stays but is now read ONLY by the camp-meal path. `autoRefill` (`reduce.ts`) passes tent-mult **1** (plain waste-free refill) — the +50% no longer applies to auto-eat. Normal manual eat is ×1 too.
- **Parity with df3:** the web route-preview simulation (`src/web/route.ts`, `deriveRoute`) and the console `--reach` reserve calc must ALSO drop the tent-mult for auto-eat, so the just-landed df3 preview stays == the reducer. (df3's sim currently passes `tentMult` to `eatToRefill`; change to 1.)
- **Consequence (load-bearing):** a tent run's auto-eat reach drops (was ×1.5). The pinned harnesses (`harness-sustainability`, `harvest-fraction`) are calibrated with the old tent bonus — they may red. **Tune LEVERS until they green UN-EDITED** (never edit a harness assertion). Likely dials if needed: `TENT_FOOD_MULTIPLIER` (now camp-meal-only — can be raised without inflating auto-eat), `FOOD_ENERGY`, `TENT_CAMP_MEALS`. Regenerate `docs/balance/` only if a combat-affecting number moves (this change alone shouldn't).

## UI / legibility
- **Web:** the eat affordance reads the camp-meal state — when a tent + charge is available, surface "🏕 camp meal ready (+50% & over-max)" so eating-now is a legible deliberate spend; after it's used, "camp meal spent". A food that can't gain (at max, no camp meal) shows no active eat affordance (or disabled with a reason) — killing the silent no-op. Left-click a food = eat it.
- **Console:** the state line notes the camp meal ("🏕 camp meal: available / spent"); the per-food eat actions carry the defId.
- The `ate` GameEvent should distinguish a camp meal (e.g. add `campMeal?: boolean`) so the log reads "🏕 camp meal: ate pemmican · +360e → 660e (over max)" vs a plain "🍖 ate ration".

## Tests
- Manual eat a CHOSEN food: additive, capped at max; rejects an unpacked food and rejects at-max (no silent no-op).
- Camp meal: with a tent + charge, over-eats past max (×1.5, uncapped) and decrements the charge; a SECOND camp meal that run falls back to the normal capped eat; `campMealsUsed` resets on a fresh embark.
- Auto-eat: no tent bonus (a tent run's `autoRefill` restores ×1).
- `legalActions` offers an `eat` per packed food defId; each is `reduce`-accepted (D29).
- df3 route-preview stays honest with auto-eat at ×1 (its test still passes with the reducer).

## Levers introduced / changed (for `balance-levers.md`)
- `TENT_CAMP_MEALS` — new: camp meals per expedition (1).
- `TENT_FOOD_MULTIPLIER` — semantics narrowed: applies ONLY to the camp meal now (was auto-eat + manual jump-to).
- `Expedition.campMealsUsed` — new optional state, default 0.

## Explicitly out of scope
- The df3 preview-honesty half of F4 (already landed) — this spec only touches the food MODEL + its preview parity.
- Changing auto-eat's waste-free trickle behaviour (stays; it just loses the tent mult).
- New food content / recipes.
