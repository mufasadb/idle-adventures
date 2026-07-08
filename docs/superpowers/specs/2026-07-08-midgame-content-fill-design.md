# Mid-game Content Fill + Food-system Rework (m0a)

**Bead:** `idle-adventure-m0a` · **Date:** 2026-07-08 · **Resolves:** `si7.7` (folded in) · **Builds on:** si7.2 (tier food economy, landed)

## Problem

Playtest v3 §2: runs ~14–21 **sag** — nothing new unlocks between the horse (~run 6) and the wyrm gate (~run 24). It's a content gap, not a systems gap: 1–2 small additions per biome fill the window and give the bow line mid-tier targets (soft/robe-hide monsters ranged shreds). Separately, si7.2's final review surfaced **si7.7**: a food unit whose tent-boosted restore exceeds `maxEnergy` can't be auto-eaten and, front-of-queue, blocks the food behind it (silent starvation). m0a adds several dense foods, so it must fix the food system first — and the user chose a richer fix than a guard: a deliberate **over-eat** mechanic.

## Solution in one line

Rework the eat model (least-dense-first auto-eat + a manual over-eat past max), then land the pre-designed mid-game content table (3 monsters, 4 gather materials, ~5 recipes) that slots into si7.2's food ladder and gives the bow line its mid-tier prey.

---

## Part A — Food-system rework (lands first; resolves si7.7)

### A1. Auto-eat: least-dense-first

`eatToRefill` (`src/engine/food.ts`) currently eats whole units off the **front** of the queue while each fits under `maxEnergy`, stopping at the first that doesn't — so a dense front unit blocks everything behind it. Replace the front-to-back walk with **least-dense-first selection**: repeatedly pick the food stack with the lowest `foodEnergyOf(defId)` whose boosted restore still fits (`energy + restore × tentMult ≤ maxEnergy`), eat one unit, and repeat until no unit fits.

- **Never blocks:** a too-dense unit is passed over, not a wall — the starvation trap is gone regardless of pack order (resolves si7.7's auto-eat half).
- **Waste-free preserved:** only eats a unit whose full boosted restore fits; never overfills during auto-eat.
- **Minimises waste:** small units top you up precisely; dense food is naturally deferred into a *reserve*.
- **Fresh-first preserved for free:** fresh forage (`berries` 30, new `apple` 40) is the least-dense food, so it's still eaten before rations — the staleness intent holds without relying on queue position. The existing front-insert of fresh forage becomes cosmetic (leave it; do not churn).
- **Determinism:** ties in density break deterministically (stack order, then `defId`) — the reducer stays pure/seed-deterministic.

### A2. Manual `eat`: deliberate over-eat

The manual `eat` action (`{ type: "eat" }`) becomes how you cash in a dense reserve. It targets the **most-dense** available food unit (the one auto-eat leaves alone) and is allowed to **over-fill past `maxEnergy`, up to that food's boosted value** (`foodEnergy × tentMult`):

- New energy = `max(energy, foodEnergy × tentMult)` for the chosen unit — one unit per action. From energy 100, a 200-restore food (boosted 300) → 300; a 240-restore food (boosted 360) → 360 (over max).
- **Auto-eat never over-eats** — over-fill is a manual-only affordance (user decision).
- **Rejection:** if the most-dense unit's boosted value ≤ current energy (eating it would be pointless/lossy) or there's no food, reject with a clear reason (`insufficient` / a new `already-full`-style reason if clearer).
- The `ate` event already carries `restored`/`energy`; it reports the over-full total naturally.

### A3. Over-full energy is a first-class state

Energy may now exceed `maxEnergy` (e.g. `360/300`). It drains normally on subsequent move/gather (you burn the surplus first); auto-eat won't fire again until energy drops back under max (nothing fits while over-full). Requirements:

- **No clamp:** remove/avoid any assumption that `energy ≤ maxEnergy`. Audit readers of `expedition.energy`/`maxEnergy` (embark, `eat`, `autoRefill`, web bar, console, sim `report.ts`).
- **UI shows over-full:** the web energy bar must show the surplus (cap the bar fill visually at 100% and annotate the over-max amount, or a distinct over-full segment) rather than overflowing/clamping. Console `energy: cur/max` already reads correctly when `cur > max`.

### A4. si7.7 closes

With A1+A2 landed, the queue-block and the "can't eat dense food" trap are both gone. Close `si7.7`, cross-referencing this spec. Update the `FOOD_ENERGY.pemmican` comment and `balance-levers.md` note (added under si7.2) to describe the over-eat rule instead of the "needs a canteen" footgun.

---

## Part B — Mid-game content table (user-approved; stands post-si7.2)

Transcribe into `src/data/constants.ts` (`MONSTERS`, `MONSTER_TIER_*_CURVE` as needed, `LOOT_TABLE`, `RECIPE`, `MATERIAL_TIER`, biome `materialTable`/`creatureTable`). All values are **feel-pass** — tune within the pinned toll bands; do not edit the pinned gate tests.

### B1. Monsters (tier 2 unless noted; 2 of 3 are ROBE-hide = bow-bait, ranged ×1.5 vs robe)

| defId | biome | dmgType | hide (armourType) | drops | creatureTable weight |
|---|---|---|---|---|---|
| `giant-elk` | woodland | melee | **light** | `rich-venison ×2` (tier-food mat) + `elk-antler ×1` | 3 |
| `dust-djinn` | desert | magic | **robe** (bow shreds, melee slogs) | `djinn-ember ×1` | 3 |
| `frost-hatchling` | tundra | magic | **robe**; the wyrm **herald** | `hatchling-scale ×1` + `map-scroll` @ chance 0.15 (reuse D34 `rollLoot` `chance?`) | 3 |

- Each monster's toll must land inside the si7.1 **tier-2 band** (`combat-toll` / `roster` pinned tests stay **un-edited**). Tune HP/dmg curves or per-monster fields to fit, not the tests.
- The two robe-hide monsters give the bow line the mid-tier prey it lacked (playtest finding #1).

### B2. Gather materials

| material | node kind | biome (weight) | notes |
|---|---|---|---|
| `salt` | mining (T2) | desert (2) | the mining→food bridge; `MATERIAL_TIER salt = 2` |
| `thistle` | herb (T2) | tundra (2) / woodland (1) | potion-line input |
| `apple` (via `apple-tree`) | wood (T2) | woodland (2) | **fresh FOOD**, `FOOD_ENERGY.apple ≈ 40`, yields `apple ×3`; `FRESH_TO_STALE apple → bruised-apple` (like `berries → stale-berries`) |
| `seal` | animal (T2) | tundra (2) | `MATERIAL_TIER seal = 2`; yields `seal-blubber` |

### B3. Recipes (mid-window craft goals opened by B1/B2)

- `smoked-venison` ← `rich-venison ×1 + salt ×1` → `FOOD_ENERGY ≈ 200` (a si7.2 tier-food demonstrator; a manual-over-eat reserve under a tent).
- `blubber-stew` ← `seal-blubber ×1 + ice-moss ×1` → `FOOD_ENERGY ≈ 160`.
- apple-jam path: `bruised-apple ×3 → jam` (reuse `jam`, or add `apple-jam` if a distinct line reads better).
- elixir alt path: `thistle ×2 + djinn-ember ×1 → elixir-of-power` (breaks the vampire-only gate on the battle-item line).
- `antler-handle` upgrade (`elk-antler + iron-sword → ?`) — **OPTIONAL**; skip if toll/economy bands complain. The food + potion goals suffice.

### B4. Content constraints (from the bead)

- Every new drop feeds ≥1 recipe (`roster.test` enforces).
- `ration` floor ≥ 80 untouched; new foods slot into si7.2's ladder (`ration` 80 / `trail-ration` 130 / `jam` 120 / `pemmican` 240).
- New `FOOD_ENERGY` values documented; the over-eat rule (A2) means no tent-safe density cap is needed.
- Snapshots shift (new material rolls) — eyeball one, `bun test -u`.
- `sim:tables` regen required (new monsters) → commit `docs/balance/tables.{json,md}` + `tier-table.json`.
- New biome identity preserved (2g7.1): additions reinforce, not blur, each biome's tension.

---

## Acceptance criteria

- **Part A:** auto-eat is least-dense-first and never blocks; manual `eat` over-eats the most-dense unit up to `food × tentMult`; energy can exceed max and the web bar shows the over-full state; `harness-sustainability` + all food tests green (re-derived, not weakened); `si7.7` closed.
- **Part B:** 3 monsters (2 robe-hide), 4 gather materials, ≥3 recipes landed per the table; all drops feed recipes (`roster.test` green); pinned toll/gate tests green **un-edited**; `sim:tables` regenerated + committed; playtest v3 sag window has ≥2 new craft goals + 2 bow-favoured targets.
- Docs: `decisions.md` D48 (cite this spec) + `balance-levers.md` updated.

## Non-goals

- Fishing vertical + 4th biome (separate beads `si7.6.2` / `si7.6.3`).
- No new energy-capacity gear tiers beyond `canteen` (that's the si7.2 m0a-handoff note item (c) — a *later* fill, not this one, unless it falls out naturally).
- No combat-system changes; monsters use the existing tier curves and matchup matrix.
- No re-tuning of si7.2's food/harvest levers (they're calibrated and pinned).
