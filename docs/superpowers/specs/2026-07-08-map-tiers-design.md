# Map Tiers — value-scaling generation axis (2yn, pull economy increment 1)

**Bead:** `idle-adventure-2yn` · **Date:** 2026-07-08 · **Depends into:** si7.2 (tier food), cxq (cartography)

## Problem

Unlocking progression is difficult to impliment mechanically and signal to a player
Playtest v3: map **value** differentiation is the missing gradient. It powers the
anti-kamikaze (dying on a valuable map wastes it), fixes the wyrm/coal spawn lottery
(bosses/rare ore are a blind roll on free maps), and is the skeleton of the pull
economy (higher-value maps cost more energy, carry denser food/loot). Drop-maps from
monsters already read as "treasure maps" to players — formalize that instinct.

## Solution in one line

Every map carries a **map tier** (1–5). One tier value drives all generation scaling.
T1 is the free, infinitely-repeatable town offer; higher tiers exist **only** as map
items dropped by monsters (`min(sourceTier+1, MAP_TIER_MAX)`). Endgame bosses migrate
off free maps onto the drop ladder — that ladder *is* the pull economy.

## The naming trap (non-negotiable)

Two distinct "tiers" now coexist:

- **map tier** — NEW. 1–5. The generation-scaling axis. Lives on `MapItem.tier` and
  `Expedition.mapTier`. Referred to as `mapTier` **everywhere** in generation code.
- **monster tier** — EXISTING. 1–4. Combat-HP scaling on `Monster.tier`
  (`MONSTER_TIER_HP_CURVE`). Untouched. Combat code keeps bare `tier` for monsters.

Never write bare `tier` in generation code. `MapItem.tier` is the field name (matches
the bead's acceptance wording + additive-for-affixes plan); everywhere it is *read*,
bind it to a `mapTier` local.

## Scope (decided with user, 2026-07-08)

- **5 map tiers.** `MAP_TIER_MAX = 5`. Full coal-curve vision (rare@T2 → common@T4 →
  rare@T5 as future ores enter). Creature ceiling is the wyrm at T3 — T4/T5 are
  *richer materials/food/terrain*, not tougher monsters (the POC has nothing above
  the wyrm).
- **Graduated boss gate.** `ice-troll` + `dust-vampire` → map-tier ≥ 2; `ancient-wyrm`
  → map-tier ≥ 3. T1 keeps its meaty monster-tier-1/2 fights.
- **Node magnitude variants on mining + food(herb/berries) + wood.** Three magnitude
  classes. The magnitude *mechanic* rolls generically on every gatherable node (the
  yield multiplier is node-agnostic); the *verification + tuning focus* is these three
  capabilities. Note the "food source" is the **herb** node (berries → jam) — animal
  nodes yield hides, not food.

## The one design tension, resolved

Acceptance asks for both *"T1 behaves exactly like today, pinned harness green
un-edited"* and *"wyrm unreachable from free offers."* These reconcile as:

1. **Economy is byte-identical at mapTier 1.** All tier scaling is a *profile transform
   that is identity at mapTier 1* — it rewrites the weight tables fed to `weightedPick`,
   and it never changes the RNG seed strings (`rand(mapSeed, "poi-x", i)` etc.). So the
   terrain / movement / gather / carry / food economy and the reach-fraction pins are
   untouched and stay green **un-edited**.
2. **Creature spawn is the intended T1 delta.** Bosses leave the base `creatureTable`s
   and re-enter through a per-mapTier additive layer at their gate tier. This *is* the
   "wyrm/coal lottery" fix. Combat/creature **snapshot** sims regenerate (acceptance
   explicitly allows "sim tables regenerated if combat surfaces change"); the economy
   pins do not move.

**Consequence to verify:** any pinned test that happened to roll a boss on a T1 seed
regenerates its expectation. The `boundary`, `reach-fraction`, and movement/gather
economy tests must pass with **zero edits**.

## §1 — Type changes (`src/engine/types.ts`)

All optional-with-documented-default, per the codebase convention (§ "Conventions").

```ts
// A pocketed / dropped map. tier drives all generation scaling (2yn). Additive so
// affixes?: string[] slots in later (cxq) without reshaping. Optional/absent = 1.
export type MapItem = { mapSeed: string; biomeId: BiomeId; vintage: number; tier?: number };
```

```ts
// Expedition gains:
mapTier?: number; // this run's map tier (2yn): set at embark from the chosen map's
                  // tier (offered map = 1, held MapItem = its tier). Drives the
                  // drop-mint's source tier. Optional/absent = 1; read with `?? 1`.
```

```ts
// Poi (src/engine/grid.ts) gains:
magnitude?: number; // node-variant level (2yn): 1 base, 2 mid, 3 rich. Multiplies
                    // GATHER_YIELD via NODE_MAGNITUDE_YIELD; render maps it to a
                    // flavor name. Only meaningful for gatherable kinds. Absent = 1.
```

Events that carry a map gain `tier`:
- `pocketed-map` → add `tier: number`
- `map-dropped` → add `tier: number`

(`GameEvent` is a closed union with an exhaustive `fmt()` switch — the web/console
formatters must be updated in the same change or typecheck breaks. That is by design.)

## §2 — Generation (`src/engine/grid.ts`)

### Signature + memoization

```ts
export function generateGrid(
  mapSeed: string,
  biomeId: BiomeId,
  mapTier = 1,
  affixes?: string[], // reserved for cxq; unused here, present so the memo key is stable
): Grid
```

- Memo key: `` `${mapSeed.length}:${mapSeed}:${biomeId}:${mapTier}` ``. (Affixes append
  later; leaving the param unused now keeps the cartography-readiness contract from the
  bead's NOTES — one `(tier, affixes)` modifier input, tier applied first.)
- Every existing call site defaults `mapTier` to 1 → **identical output at T1**. But the
  DISTINCTION that matters is *town-side vs in-run*, not *engine vs surface*:
  - **In-run grid regens MUST thread the run's tier** — the reducer sites
    (`reduce.ts` move/gather/fight) AND every VIEW/render site that redraws the CURRENT
    expedition's grid (`render.ts` `render()`, `web/main.ts` `expeditionView` + path
    planner, `sim/playtest.ts` `printExpedition`) pass `expedition.mapTier ?? 1`.
    Omitting it on a view site silently draws a T1 grid over a T2+ run — a view↔engine
    desync (caught in final review; corrected 2026-07-08). Embark reads the chosen
    map's tier (see §4).
  - **Town-side / offer-preview regens stay T1** — `candidateMaps` and any offer preview
    in `town.ts`; the balance-sim (`sim/balance.ts`) passes an EXPLICIT tier per report
    row. These are correct as-is.

### `tierProfile(biome, mapTier) → Biome` — the identity-at-1 transform

A new pure helper in `grid.ts`. Returns a Biome whose tables are the base biome
tables *modified by the mapTier levers*. **At mapTier 1 it returns the biome
unchanged** (deep-equal), which is what guarantees byte-identical T1 generation.

It composes these transforms (each identity at T1):
- **materialTable weights** ← multiply each `defId` weight by
  `MATERIAL_TIER_WEIGHT[defId]?.[mapTier] ?? 1`.
- **creatureTable** ← start from the (boss-free) base table, then *add* the per-mapTier
  boss weights from the additive layer `MAP_TIER_CREATURE_ADD[mapTier]` (see §3). The
  additive layer is the **single source** of the boss gate — bosses live only there, so
  a boss simply cannot appear below its lowest listed tier. At T1 the layer is absent,
  so T1's creatureTable is exactly today's-minus-bosses. **This is the intended T1
  creature delta.**
- **nodeTypeWeights / terrainWeights** ← apply `TERRAIN_WEIGHT_TIER_SHIFT[mapTier]`
  (a per-terrain multiplier; absent tier / terrain = 1 → identity at T1). Harsher mix
  upward is the energy cost that makes si7.2's tier-food matter.
- POI count is not part of the profile object; it is read directly in `buildGrid` from
  `POI_DENSITY_BY_TIER[mapTier] ?? POI_DENSITY` (identity at T1).

`buildGrid(mapSeed, biomeId, mapTier)` calls `tierProfile` once, then runs today's
algorithm verbatim against the transformed biome. **No seed string mentions mapTier.**

### Node magnitude

After the existing spec roll (kind/creature/material), roll a magnitude per accepted
POI index on a NEW namespace:

```ts
const magnitude = rollMagnitude(NODE_MAGNITUDE_WEIGHTS[mapTier] ?? { 1: 1 }, rand(mapSeed, "poi-magnitude", i));
```

- `rollMagnitude` mirrors `rollMaterial`: `weightedPick` over sorted numeric keys.
- Only gatherable kinds carry it; monster POIs stay `magnitude` undefined (they scale
  via creatureTable, not yield).
- A *fresh* stateless-hash draw does not shift the existing `poi-x`/`poi-kind`/… draws
  (rng is keyed by (seed, ...parts), not a consumed stream).
- At T1, `NODE_MAGNITUDE_WEIGHTS[1] = { 1: 1 }` → magnitude always 1. Store it as
  `undefined` (or omit) when 1 so the Poi JSON snapshot is byte-identical to today.

`Poi.magnitude` flows to gather yield in the reducer (§4) and to flavor in perceive/render (§5).

## §3 — Levers (`src/data/constants.ts`) — all named, each a D-row

```ts
export const MAP_TIER_MAX = 5; // deepest map tier (2yn); drop-mint caps here

// Per-material weight multiplier by map tier (2yn). Sparse: absent defId/tier = 1
// (identity at every tier for un-listed materials; MUST be 1 at tier 1 for all —
// asserted in test). Prove the ladder on coal + iron-ore + one more.
export const MATERIAL_TIER_WEIGHT: Record<string, Record<number, number>> = {
  coal:       { 2: 1, 3: 2, 4: 4, 5: 2 },   // rare@T2 → common@T4 → rarer@T5 (new ores crowd in)
  "iron-ore": { 2: 1.5, 3: 2, 4: 2, 5: 1.5 },
  "mithril-ore": { 3: 1, 4: 2, 5: 3 },       // deep-tier reward climbs
};

// Node-variant magnitude distribution by map tier (2yn). Weighted over magnitude
// class {1,2,3}. T1 = {1:1} (always base — identity). Higher tiers shift toward rich.
export const NODE_MAGNITUDE_WEIGHTS: Record<number, Record<number, number>> = {
  1: { 1: 1 },
  2: { 1: 6, 2: 3, 3: 1 },
  3: { 1: 4, 2: 4, 3: 2 },
  4: { 1: 3, 2: 4, 3: 3 },
  5: { 1: 2, 2: 4, 3: 4 },
};

// Yield multiplier per magnitude class (2yn). Multiplies GATHER_YIELD[kind].
export const NODE_MAGNITUDE_YIELD: Record<number, number> = { 1: 1, 2: 2, 3: 3 };

// Boss gate = the SINGLE source of where bosses spawn (2yn). Bosses are REMOVED from
// the base biome creatureTables and live ONLY here; tierProfile ADDS these to the
// boss-free base creatureTable at each map tier. A boss cannot appear below its lowest
// listed tier — that IS the gate (no separate min-tier lever). Weights chosen so
// bosses stay a discovery. Graduated: minibosses enter at T2, the wyrm at T3.
export const MAP_TIER_CREATURE_ADD: Record<number, Record<string, number>> = {
  2: { "ice-troll": 1, "dust-vampire": 1 },
  3: { "ice-troll": 2, "dust-vampire": 2, "ancient-wyrm": 1 },
  4: { "ice-troll": 2, "dust-vampire": 2, "ancient-wyrm": 2 },
  5: { "ice-troll": 3, "dust-vampire": 3, "ancient-wyrm": 3 },
};

// POI count by map tier (2yn). Absent = POI_DENSITY (identity at T1). Richer maps
// upward. Starting curve (tune via sim); T1 MUST be omitted so it stays == POI_DENSITY.
export const POI_DENSITY_BY_TIER: Record<number, number> = {
  2: POI_DENSITY + 2,
  3: POI_DENSITY + 4,
  4: POI_DENSITY + 6,
  5: POI_DENSITY + 8,
};

// Per-terrain weight multiplier by map tier (2yn). Absent tier/terrain = 1 (identity
// at T1). Shifts the mix harsher upward (more costly terrain), pricing longer runs —
// the energy cost that makes si7.2's tier-food matter. Starting curve (tune via sim).
export const TERRAIN_WEIGHT_TIER_SHIFT: Record<number, Partial<Record<Terrain, number>>> = {
  2: { mountain: 1.15, river: 1.15 },
  3: { mountain: 1.3, river: 1.3, ice: 1.15 },
  4: { mountain: 1.5, river: 1.4, ice: 1.3 },
  5: { mountain: 1.7, river: 1.5, ice: 1.4 },
};
```

**Data edit:** remove `ice-troll`, `dust-vampire`, `ancient-wyrm` from the base
`BIOMES.*.creatureTable`s (they now live only in `MAP_TIER_CREATURE_ADD`). This is the
intended T1 creature delta from §0.

Concrete magnitude weights / POI density / terrain-shift numbers are **balance-tuned in
`balance-levers.md`** once the sim report lands; the values above are starting points.

## §4 — Offer / drop / embark (`src/engine/reduce.ts`, `town.ts`)

- **`candidateMaps`** (`town.ts`): every offered map's item gets `tier: 1`. The
  `pocket-map` handler (`reduce.ts:144`) already builds the MapItem — add `tier: 1`
  (from the offer), and the `pocketed-map` event carries it.
- **Embark** (`reduce.ts:85–122`): derive `mapTier` from the source:
  ```ts
  const heldMap = held.find((m) => m.mapSeed === mapSeed);
  const mapTier = heldMap?.tier ?? 1; // offered map = 1
  const grid = generateGrid(mapSeed, rollBiome(mapSeed), mapTier);
  ```
  Set `expedition.mapTier = mapTier`. The `embarked` event may optionally carry it
  (nice for console/web; not required).
- **All other in-run `generateGrid` calls** (`reduce.ts:207,237,409`) pass
  `expedition.mapTier ?? 1`.
- **Map-drop mint** (`reduce.ts:488–496`): stamp the new tier:
  ```ts
  const sourceTier = expedition.mapTier ?? 1;
  const tier = Math.min(sourceTier + 1, MAP_TIER_MAX);
  // ...{ mapSeed, biomeId, vintage: state.runs ?? 0, tier }
  ```
  The `map-dropped` event carries `tier`.
- **Banking** (`bank.ts:67`): `carriedMaps` already flow to `state.maps` unchanged —
  `tier` rides along on the MapItem, no edit needed.
- **Gather yield** (`reduce.ts` gather handler, near the `GATHER_YIELD` read): multiply
  by `NODE_MAGNITUDE_YIELD[poi.magnitude ?? 1] ?? 1`. Everything else in gather is
  unchanged; energy cost is per-node hardness (not scaled by magnitude — a richer node
  yields more for the same dig, which is the reward).

## §5 — Flavor + verification

### Perception / render (`src/engine/perceive.ts`, `src/render/render.ts`)

- `PoiDetail` gains `magnitude?: number` (passed through from `Poi.magnitude`).
- Render maps `(kind, magnitude)` → a flavor name, engine stays numeric. Template
  keyed by kind, material interpolated (all four gatherable kinds get names so the
  generic magnitude roll always reads well; the *food* one is herb):
  - mining: 2 = `{mat} cluster`, 3 = `{mat} cave`
  - wood: 2 = `{mat} stand`, 3 = `{mat} grove`
  - herb: 2 = `{mat} patch`, 3 = `{mat} thicket`   ← the food/forage line (berries)
  - animal: 2 = `{mat} herd`, 3 = `{mat} warren`
  - magnitude 1 or absent → today's `{mat}` text unchanged.
- Web + console show the held/dropped map's **tier** explicitly ("T3 tundra map") —
  you looted it, you know it. The map-drop log line announces the tier.

### Balance sim (`src/sim/balance.ts`, `balance-cli.ts`)

Add a per-mapTier report proving the ladder:
- material weight curve (coal/iron/mithril effective probability by tier),
- node-yield scaling (expected yield per gather by tier via magnitude distribution),
- POI density by tier,
- creatureTable by tier (boss presence appears at gate tier, absent below).

Regenerate the combat/table snapshots (allowed by acceptance). The reach-fraction and
movement-economy pins must pass **un-edited**.

### Tests (`test/`)

- **`map-tier.test.ts`** (new):
  - *Identity at T1:* `generateGrid(seed, biome, 1)` deep-equals `generateGrid(seed, biome)`
    for a batch of seeds/biomes (the byte-identical guarantee).
  - *Lever hygiene:* for every material, `MATERIAL_TIER_WEIGHT[m]?.[1] ?? 1 === 1`;
    `NODE_MAGNITUDE_WEIGHTS[1]` is `{1:1}`.
  - *Boss ladder (the headline acceptance):* across a large seed sample, the
    `ancient-wyrm` never appears on any T1 offered map's grid, but **does** appear on
    T3 grids; `ice-troll`/`dust-vampire` absent at T1, present from T2. Prove the drop
    ladder reaches T3: embark T1 → (forced) humanoid drop mints T2 → embark T2 → drop
    mints T3 → wyrm reachable.
  - *Drop cap:* a drop on a T5 map mints T5 (not T6).
  - *Magnitude yield:* a gathered magnitude-2 node yields `2× GATHER_YIELD[kind]`.
- Existing `boundary`, `reach-fraction`, gather/movement economy tests: **must pass
  with zero edits** (the T1-identity proof). Combat/creature snapshot tests: regenerate.

## Files touched

`types.ts` (MapItem/Expedition/Poi/events), `grid.ts` (signature, memo key,
`tierProfile`, `rollMagnitude`, magnitude roll), `constants.ts` (levers + base
creatureTable edit), `reduce.ts` (embark tier derivation, in-run generateGrid tier,
drop-mint tier, gather magnitude yield, pocket-map tier), `town.ts` (candidateMaps
tier), `perceive.ts` + `render.ts` (magnitude flavor, map-tier display), `web/main.ts`
+ `sim/playtest.ts` (event tier formatting, map-tier display), `sim/balance.ts` +
`balance-cli.ts` (per-tier report). `bank.ts` needs no change.

## Docs to land with the code

- `decisions.md` — one dense D-row (next is **D46**) citing this spec, covering: map
  tier axis, drop-ladder access rule, boss gate, node-magnitude variants, identity-at-T1
  contract.
- `balance-levers.md` — the new lever families (`MAP_TIER_MAX`,
  `MATERIAL_TIER_WEIGHT`, `NODE_MAGNITUDE_WEIGHTS`, `NODE_MAGNITUDE_YIELD`,
  `MAP_TIER_CREATURE_ADD`, `POI_DENSITY_BY_TIER`, `TERRAIN_WEIGHT_TIER_SHIFT`), each
  with its starting value and what it tunes.

## Out of scope (explicit)

- Affixes (`MapItem.affixes`, cxq) — the memo key and `tierProfile` signature are
  *shaped* to accept them, but no affix logic lands here.
- Tier-scaled food *targets* (60%/30% harvest fractions) — that is si7.2, which
  consumes this bead's magnitude/food-node machinery.
- New ores/creatures beyond the existing catalog — T4/T5 richness is expressed through
  the *existing* materials' weight curves; new content is m0a.
