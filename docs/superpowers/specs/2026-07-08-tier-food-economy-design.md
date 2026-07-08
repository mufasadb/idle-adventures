# Tier-scaled Food Economy (si7.2)

**Bead:** `idle-adventure-si7.2` · **Date:** 2026-07-08 · **Depends on:** 2yn (map tiers, landed) · **Feeds:** m0a (mid-game content fill)

## Problem

Playtest v3 (`docs/2026-07-08-playtest-findings.md` §4) re-baselined the stamina
rework. The **outbound** reach-budgeting half is alive and praised ("routing under
budget" was a top delight) — do **not** nerf movement gear. The live problem is the
**food side**: there is no obvious *sustainable, tier-appropriate* food loop. Once
you have base rations, higher-tier maps give you no reason to bring better food, and
auto-eat + pelts→rations turns energy upkeep into a chore-treadmill rather than a
tension source. Food reads as a slot-opener, not a progression axis.

2yn (map tiers) already scales the *demand* side — higher tiers add POIs
(`POI_DENSITY_BY_TIER`), make terrain costlier to cross (`TERRAIN_WEIGHT_TIER_SHIFT`),
and yield 2–3× per gatherable node (`NODE_MAGNITUDE_*`). This bead **consumes** that
demand and builds the matching **supply** side: food whose density scales with tier,
plus a stamina-ceiling axis so denser food is actually usable.

## Solution in one line

Food **density** (energy/slot) climbs with tier, and a new **energy-capacity** gear
axis raises the stamina ceiling so denser food stays auto-eatable — the two scale
together. Sim-proven target: with tier-matched food you can harvest ~60% of a
high-tier map's POIs; with base rations on that same map, ~30% (bringing cheap food
visibly under-values the map).

## The reach model (why two levers, not one)

Total reach on a run is:

```
reach ≈ energyCapacity + Σ(food_restore × tentMult)
```

`eatToRefill` (D41) is **waste-free**: it eats a whole food unit off the FRONT of the
queue only when that unit's full restore fits under `maxEnergy`. Two consequences that
drive this design:

1. **Per-unit density is capped by the ceiling.** A food unit denser than `maxEnergy`
   can never be eaten (and, worse, blocks the queue behind it — a 290-restore unit at
   the front can't be eaten until energy ≤ 10). So a steep per-unit ladder
   (320, 640, …) is *not viable* under the current model without growing the ceiling.
2. **Total-reach-per-slot still scales with modest density.** A slot of 200-food
   out-reaches a slot of 80-food regardless of the ceiling. Denser food buys more
   reach per carry-slot, or the same reach in fewer slots (freeing loot capacity).

So density alone plateaus at the 300 wall. Pairing it with a **growing ceiling**
(capacity gear) is what lets the ladder breathe across all five tiers.

## Design

### 1. Food-density ladder (rebased for headroom)

- **Protect the T1 sustainability floor.** `ration` stays at `FOOD_ENERGY.ration = 80`.
  `balance-levers.md` is explicit: dropping it risks the forage-only tundra
  sustainability floor (a T1 concern, sim-gated). Untouched.
- **Compress the mid.** Pull `trail-ration` **down** from its current 160 so there is
  room to climb *into* above it. Exact value is a sim outcome (see §5), bounded so the
  existing sustainability harness stays green.
- **New tier-food line (the proof line).** One new denser food defId sitting above
  trail-ration, sourced at tier (§4). Density chosen by the harvest-fraction sim to
  hit the 60/30 target while staying safely auto-eatable at tier-appropriate capacity.
  **One line only** in this bead; biome-flavored variants are m0a (§6).
- **New lever:** `FOOD_ENERGY` gains the new defId. If a clean per-tier density
  intent emerges from the sim, name it explicitly (e.g. a documented ladder comment on
  `FOOD_ENERGY`) rather than a magic number.

### 2. Energy-capacity gear (new axis)

The `maxEnergy?` field already exists on `Expedition` (D41 built it "gear-raisable
later"). This bead cashes that in, following the **tent pattern** exactly:

- Capacity gear is a durable tool capability (like `tent` = "camp"), lives in
  `equipment.tools`.
- New lever `ENERGY_CAP_BONUS: Record<defId, number>` — a **flat additive** bonus per
  gear piece (decided with user over a multiplier: additive composes predictably and
  reads as "+N stamina ceiling").
- Embark computes `maxEnergy = MAX_ENERGY + Σ ENERGY_CAP_BONUS[tool]` over equipped
  tools (a helper `energyCapOf(equipment)` mirroring `tentMultOf`).
- **One capacity-gear line as proof**, crafted at tier; tier variants captured for m0a.
- As capacity grows (300 → 400+), the denser tier foods from §1 become safely
  whole-unit auto-eatable — this is the coupling that makes the ladder work.

### 3. "Reason to go further" — consumed from 2yn, tuned if needed

Point (2) of the bead ("higher-tier maps must give a reason to go further") largely
**already exists** in 2yn: `POI_DENSITY_BY_TIER` (more POIs at tier) and
`TERRAIN_WEIGHT_TIER_SHIFT` (costlier crossings). This bead does **not** add new
demand mechanisms; if the harvest-fraction sim shows the 60/30 split doesn't
materialize at current values, we **tune those existing 2yn levers up** (documented as
a D-row amendment), rather than inventing a new axis.

### 4. Sourcing — unrestricted, fresh→dense

Per user: "no reason to limit it." The tier-food line is a **recipe** whose fresh
inputs can come from **either** a forage node **or** a monster drop — extending the
existing patterns:

- `jam` ← `stale-berries` (fresh forage that staled) — the fresh→stale→processed spine.
- `trail-ration` ← `raider-supplies` (monster drop).

The new tier food copies this spine: a fresh/perishable input (forage node *or*
monster drop) → a denser processed food. Occasionally a high-tier node/drop hands the
denser food directly (the "sometimes tier just gives better food" case). No source is
mechanically fenced off. The fresh→stale→processed template ("grapes going stale") is
the model; the vault's cooking-station vision (`Town & Processing.md`) is the
long-term home but is **not** in POC scope.

### 5. Balance targets + sim (the core deliverable)

**Calibration note (added 2026-07-08, after controller feasibility probes).** The
harvest-fraction is measured by a *reference player* — a headless greedy walker, not a
human. Probes established that even a monster-aware, cost-optimal-greedy walker caps
tier-food harvest at **~50%** on a tier-matched map: the ceiling is the map's energy
economy (the far half out-ranges your tank), not walker cleverness, and provisioning
past ~9 food units *collapses* (flee-damage death / slot pressure). So the literal 60%
is **not a point any reference player reliably occupies**. What *is* rock-solid and is
the real design contract: **tier-appropriate food harvests ≈2× what base rations do.**

- The reference walker is **monster-aware**: it routes *around* live monster tiles
  (Dijkstra over passable, monster-free tiles; walks the waypoints) and never engages —
  a realistic unarmed forager, and the reason it survives to spend its whole energy
  budget. This upgrades `src/sim/harvest.ts`'s walker (Task 4 shipped the simpler
  nearest-neighbour version).
- **Named levers, calibrated to the instrument:**
  - `HARVEST_FRACTION_TIER_TARGET` ≈ **0.50** — tier-matched food on a tier map.
  - `HARVEST_FRACTION_BASE_TARGET` ≈ **0.25** — same map, base rations only.
  - `60/30` is retained in prose as the **design aspiration**; the no-optimal-router
    reference player is a conservative floor (a real player harvests more) — the **2×
    ratio** is the invariant. Which ~half the player takes stays a live routing choice.
- **Hard gate** — `test/harvest-fraction.test.ts` (modeled on `reach-fraction.test.ts`),
  over a seeded sample, asserts on tier-matched maps: `base ≈ BASE_TARGET (±band)`,
  `tier ≥ ~0.45`, **and `tier ≥ 1.8 × base`** (bring-cheap-food visibly ≈halves the map).
- Lands with docs: a `decisions.md` D-row (next is **D47**; cite this spec) and a
  `balance-levers.md` update naming every new lever.

### 6. Scope boundary (proof now, capture for m0a)

**si7.2 ships:** the density×capacity mechanism, the trail-ration rebase, **one**
tier-food line + **one** capacity-gear line as vertical proof, the named 60/30 levers,
the harvest-fraction sim + test, and the tank→capacity rename (§7).

**m0a inherits:** biome-flavored food/gear variants slotting into the ladder (the
"1–2 additions per biome between horse and wyrm gate"). During implementation, every
biome-variant idea surfaced (fresh-forage names, monster-drop foods, per-biome
capacity gear) gets captured into the m0a bead's DESIGN so it's turnkey.

### 7. Terminology: "tank" → "capacity"

Rename the energy-capacity sense of "tank" so it stops colliding with the new
capacity axis (user finds "tank" confusing):

- `src/sim/balance.ts`: `ReachRow.tanks` → `.capacities`; `summary.farthestTanks` →
  `.farthestCapacities`; the `c / MAX_ENERGY` computations.
- `src/sim/balance-cli.ts`: the two output lines using "tank".
- `test/entry-reach.test.ts`: `WITHIN_TANK_FLOOR` → `WITHIN_CAPACITY_FLOOR`, the
  "within-tank" phrasing.
- `test/reach-fraction.test.ts` + `test/balance-sim.test.ts`: test names / assertions
  mentioning "tank".
- `src/data/constants.ts:7` comment.
- Docs (`decisions.md` D42, the reach-economy spec) updated in passing where touched.

**Not touched:** `test/combat.test.ts`'s `tank` local — that's a "damage-tank"
loadout, an unrelated sense.

## Acceptance criteria (from the bead)

- New tier-scaled food defId(s) exist with a documented `FOOD_ENERGY` density,
  gatherable/craftable at their tier.
- New `ENERGY_CAP_BONUS` gear axis raises `maxEnergy` at embark (tent-pattern,
  additive).
- Sim proves the calibrated contract: on tier-matched maps a monster-aware reference
  player harvests `tier ≥ ~0.45` with tier food and `≈0.25` with base rations, with
  `tier ≥ 1.8 × base`; levers named (`HARVEST_FRACTION_TIER_TARGET` ≈ 0.50 /
  `_BASE_TARGET` ≈ 0.25); `decisions.md` D47 + `balance-levers.md` updated (incl. the
  calibration rationale: 60/30 is the design aspiration, the reference floor is ~50/25).
- Playtest console + web expose food-density hints no worse than current (recipe
  book / gather flavor) — no legibility regression.
- Sustainability harness stays green after the trail-ration rebase.
- "tank" renamed to "capacity" in the energy sense (combat "tank" untouched).

## Non-goals

- No new death-cost / return-risk mechanic (declined in v3; map value is the
  anti-kamikaze — see 2yn/cxq).
- No auto-eat waste redesign (`eatToRefill` is already waste-free; manual-eat waste
  *display* rides with vb8).
- No cooking-station minigame (vault vision, post-POC).
- No biome-specific food/gear breadth (that's m0a).
- No new "reason to go further" mechanism beyond tuning 2yn's existing tier levers.
