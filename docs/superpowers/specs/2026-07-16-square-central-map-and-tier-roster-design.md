# Square Central Map + Tier-Scaled Roster — Design (F2)

**Date:** 2026-07-16
**Decision row:** D84 (add on land)
**Origin:** blind playtest 2026-07-15 F2 (`docs/2026-07-15-playtest-findings.md`, bead `93d`) — the map economy is inert: "which map to embark" is a confirm button and **map tier feels cosmetic** (a T2 map played like T1 — same monsters, same drops; its richer nodes tool-locked). Design dialogue (2026-07-16) reframed the fix around two linked ideas.

**The reframing:** there are two "depths" and only one should carry reward.
- **Within a single map** (far vs near from entry) — reward is *value-agnostic to distance* by design (D57r). It should STAY that way — **depth-within-a-map does not matter**.
- **Map tier** (a T1 vs a T3 map) — this is the axis meant to mean "deeper = better", and it's the one falling flat.

The 20×60 portrait strip with a south-edge entry actively *lies*: its shape screams "there's a deep north frontier worth reaching", contradicting D57r and sending players (per the playtest) on 21-tile treks that don't pay off. The fix is two halves of one idea:

1. **Reshape the map to a square, entered dead center** — kill the false spatial-depth signal; make routing a 360° directional commitment ("which way do I spend my budget?") instead of "how far north".
2. **Make map tier scale the monster roster gracefully** — a new `CREATURE_MAP_TIER_WEIGHT` lever so higher-tier maps *field tougher fights with gear-crafting drops*, delivering the real "deeper = better" through the thing players actually fight and read (the combat forecast).

`c67` (camera-follow, shipped 2026-07-16) is the enabler for #1: the viewport already pans to the player, so map shape is decoupled from screen shape — a square map scrolls fine on both landscape desktop and portrait phone.

**Non-negotiables honored:** engine stays pure/deterministic; all values are named levers in `src/data/`; D57r's value-agnostic placement is preserved; every change lands with a `decisions.md` D84 row + `balance-levers.md` update; combat-affecting changes regenerate `docs/balance/` via `bun run sim:tables`.

---

## Part 1 — Square map, drilled in the center

**Change.** `MAP_WIDTH = 35`, `MAP_HEIGHT = 35` (was 20×60). Area 1225 ≈ the old 1200, so POI count and total gatherable value stay in the same ballpark (`POI_DENSITY` stays 60; `POI_DENSITY_BY_TIER` unchanged — still identity-at-T1).

**Entry → center.** Replace the south-edge entry search (`grid.ts` ~261–279) with a **center-seeking** entry: target `{x: ⌊W/2⌋, y: ⌊H/2⌋}` = (17,17). The center tile MUST be walkable and in the main component (same invariant as today's entry). Reuse the existing pattern: pick the walkable tile nearest the center that maximizes `reachableTiles`, ties broken toward center; fallback carves the center tile to native walkable terrain + re-runs connectivity (mirrors the current bottom-row fallback). The entry tile stays clear of POIs (unchanged rule).

**Why center.** From an edge, "far" is one direction; from the center, "far" is any of 360°, so the run's opening decision becomes *which sector to exploit* under the energy budget — the logistics puzzle the loop is built on, minus the misleading "deep end".

### The load-bearing work: reach-economy recalibration
Moving entry from the south *edge* of a 60-tall strip to the *center* of a 35-square drops the farthest tile from ~59 king-moves to ~17. Keeping area ≈ constant means you still can't reach **all** of the map in one run — but the *shape* of "out of reach" flips from "the far frontier" to "every direction you didn't pick". Consequences:

- **`test/reach-fraction.test.ts` structural assert reframes (premise-break, not a weakening).** Today it asserts `max(reach over POIs) > MAX_ENERGY` — a *strip-specific* proxy for "you can't reach the deep end". On a center map any single point is cheaply reachable, so that exact assert is no longer the right invariant. Rewrite it to the REAL contract: **you can reach any given point, but not clear the whole map in one run** — e.g. assert that the total energy to visit *all* reachable POIs far exceeds `MAX_ENERGY` (even with a generous food allowance), and that `reachableTiles(entry)` is a healthy fraction of the map (connectivity holds from center). Keep it a structural guard, not a tuned number.
- **The sustainability / harvest / reach harnesses are the oracle.** `harness-sustainability`, `harvest-fraction`, `reach-fraction`'s harvest report, and `map-climb` all run over generated maps; the reshape shifts their numbers. Levers that MAY need a nudge to keep "harvest ~half, choose which half" true from the center: `MAX_ENERGY` (300), `TERRAIN_COST`, the food economy (`FOOD_ENERGY`/`ENERGY_PER_FOOD`), `POI_DENSITY`. **Tune levers until the pinned harnesses green UN-EDITED** (except the deliberately-reframed reach-fraction structural assert). Do NOT edit a harness assertion to pass — a red pin means a lever is wrong.
- **Barrier layer re-eyeball.** `BARRIER_NOISE_FREQUENCY` (0.06) / `BARRIER_THRESHOLD` (0.68) were tuned for a 20-wide strip; on a 35-square the ridge pattern differs. Regenerate a few maps and eyeball: the world should stay a navigable field of cost-walls (one walkable component — `barrier.test` still guards this), not a maze or an open plain. Nudge the two dials only if the character is off.
- **Snapshots.** All generation snapshots change (new dims). Eyeball ONE diff for shape sanity (square, central entry, connected), then `bun test -u`.

### Web / render
- The grid is `grid-template-columns: repeat(MAP_WIDTH, …)`; 35 columns × 1.4rem ≈ 49rem — wider than the old 20, but `c67` camera-follow + `.gridscroll` `overflow-x:auto` already handle a map bigger than the viewport in both axes. Verify the camera centers correctly on the central entry at embark (it should — `centerOnPlayer` is dimension-agnostic).
- The console map render (`playtest.ts`) prints the full grid regardless of shape — no change needed, but the ASCII will now be 35 wide.
- Grep for any hard-coded assumption of a tall/narrow map or south entry (flavor text "over the hill", "deep north", directional hints) and neutralize — the map is now a field you drill into the middle of, not a strip you ascend.

---

## Part 2 — Tier scales the monster roster (graceful, not a switch)

**Change.** New lever `CREATURE_MAP_TIER_WEIGHT: Record<string, Record<number, number>>` (sibling of `MATERIAL_MAP_TIER_WEIGHT`) — per-creature weight multiplier by map tier, sparse, **identity at T1** (absent defId/tier = ×1, so the T1 experience and all snapshots-at-T1 are byte-identical). Applied in `grid.ts` `tierProfile`, in the creature step, BEFORE the existing additive `MAP_TIER_CREATURE_ADD` boss injection:

```
// (b) creatureTable weights × per-creature tier multiplier (D84), THEN boss adds
for (const defId of Object.keys(creatureTable))
  creatureTable[defId] *= (CREATURE_MAP_TIER_WEIGHT[defId]?.[mapTier] ?? 1);
for (const [defId, w] of Object.entries(MAP_TIER_CREATURE_ADD[biomeId]?.[mapTier] ?? {}))
  creatureTable[defId] = (creatureTable[defId] ?? 0) + w;   // unchanged
```

**Design of the weights** — low tiers scale *out*, high tiers scale *in*, rosters OVERLAP (a T2 map is *mostly* familiar with tougher things creeping in; a T3 map is mostly tough with the odd straggler). Proposed:

- **Tier-1 trash scales DOWN** (sand-raider, mirage-wisp, forest-boar, snow-wolf, shell-beetle, ice-crab, fae-sprite, forest-bandit): `{3: 0.6, 4: 0.4, 5: 0.3}` (untouched at T1/T2 so early maps are unchanged; thinning starts at T3).
- **Tier-2 mid scales UP** (giant-scorpion, dust-djinn, drake, giant-elk, werewolf, snow-marauder, frost-fae, frost-hatchling): `{2: 1.5, 3: 2, 4: 2.5, 5: 3}`.
- **Bosses** keep fading in via the existing `MAP_TIER_CREATURE_ADD` (no change).

The exact multipliers are levers — the goal is that a T2/T3 map's fights read visibly tougher on the combat forecast and its drops (scorpion-carapace→plate, djinn-ember→elixir, drake-hide→studded/bag) craft into **gear, not just food**. `test/roster.test.ts` (type-spread + boss-rarity) and `balance-tables` are the guards; regenerate tables and confirm the roster invariants still hold at every tier (the Wyrm must stay rare; the tier-1 type-spread — melee/ranged/magic + plate/light/robe — must still be present at T1, which the identity-at-T1 rule guarantees).

**Woodland gets a real tier climb.** Today `MAP_TIER_CREATURE_ADD.woodland = {}` (the D82 near-thing: woodland difficulty is flat). Part 2 fixes this for free — scaling giant-elk/werewolf UP with tier gives woodland a genuine high-tier feel without adding a native boss (leave the boss policy as-is per D82).

---

## Consequences & test surface (whole change)
- **Balance regen:** map dims + creature weights change generation and combat exposure → one `bun run sim:tables --write` after both parts land; commit the table diff (the review artifact).
- **Pinned harnesses tune-not-edit:** `harness-sustainability`, `combat-toll`, `roster`, `barrier`, `map-climb`, `harvest-fraction` must green UN-EDITED by moving LEVERS. The ONE sanctioned test rewrite is the `reach-fraction` structural assert (premise genuinely changed — center vs edge).
- **Snapshots:** regenerate after eyeballing shape.
- **Determinism / purity:** unchanged — new lever is pure data; entry/gen stay seeded.
- **Bead 93d (F2):** this is its fix. Also revisits the D82 woodland-flatness near-thing (closed by Part 2's up-scaling).

## Levers introduced / changed (for `balance-levers.md`)
- `MAP_WIDTH` / `MAP_HEIGHT` → 35 / 35 (square); entry now center-seeking.
- `CREATURE_MAP_TIER_WEIGHT` — new: per-creature weight multiplier by map tier (identity at T1).
- Possible nudges (only if harnesses demand): `MAX_ENERGY`, `TERRAIN_COST`, food economy, `POI_DENSITY`, `BARRIER_NOISE_FREQUENCY`/`BARRIER_THRESHOLD`.

## Explicitly out of scope
- Within-map depth paying off (D57r stays — depth-within-a-map deliberately does NOT matter).
- Putting 2+ maps on the town table (D80's one-local-map shape stands; the real embark choice is "free T1 vs spend an earned higher-tier map", which Part 2 finally gives teeth).
- Preview fidelity (`3iq`, `PREVIEW_FIDELITY`) — a legibility follow-up; not required for this change, but pairs naturally (a later bead).
- New monsters/materials — Part 2 re-weights the EXISTING roster; invents nothing.
