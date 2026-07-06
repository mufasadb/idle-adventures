# Reach Economy on the Long Map — e3j design

**Date:** 2026-07-06 · **Bead:** `idle-adventure-e3j` (implements G3 / `si7.2`) · **Status:** approved (brainstorm 2026-07-06)

## Problem

The stamina rework (D41) + graded movement (D39) collapse once a player has movement gear. Geared cruising cost hits the `MIN_STEP` floor (5/step): a 300-energy tank buys 60 steps, which covers an entire 20×20 map with room to spare. Energy stops draining meaningfully, food degrades into a slot-opener, and the run's central question — "how far can I afford to go?" — evaporates (playtest v2, G3).

The fix direction (approved): **balance, don't nerf.** Gear stays capped-efficient (the `MIN_STEP` floor already guarantees energy is never free); the *map* outgrows the free tank so food buys reach again. Food splits into **fresh (good now)** vs **processed (good later)**.

## Approved decisions

1. **No upkeep/sustain-drain mechanics** (rejected: felt like tax, not decision).
2. **Uniform long strip, not a depth gradient** — the run's skill is *which pockets* + a navigation puzzle, not depth-pushing.
3. **All maps become 20×60** for now; per-map sizing is a noted follow-up, not this pass.
4. **Barriers from layered noise, not hand-stamped features** — plus a connectivity repair pass. Puzzle-quality variance across seeds (sometimes maze, sometimes open field) is accepted and tuned statistically, not guaranteed per-map.
5. **Food model C:** packed food = guaranteed range; on-map foraging = opportunistic extension that costs energy + routing. Fresh food is weak-but-immediate; hauled-home food processes into denser town-crafted food.

## §1 Map shape

- `GRID_SIZE` (20) is replaced by `MAP_WIDTH = 20` and `MAP_HEIGHT = 60`. Every consumer of `GRID_SIZE` (grid generation, `reach.ts`, `reduce.ts` bounds checks, web renderer, playtest console) becomes dimension-aware: `x` indexes `0..MAP_WIDTH-1`, `y` indexes `0..MAP_HEIGHT-1`; arrays stay `[y][x]`.
- **Entry stays on the south edge** (`y = MAP_HEIGHT - 1`) with the existing largest-reachable-region selection (b91) — the "town side" of the strip. Far pockets cost more purely by distance; that emergent gradient is desired and needs no generation changes.
- Phone constraint: the strip is portrait — the web map renders as a vertical scroll at unchanged tile size (see §5).

## §2 Barrier layer + connectivity pass

**Barrier noise.** A second, lower-frequency Perlin layer (`perlin2` with a distinct seed context, e.g. `"barrier"`) is composed with the base terrain: where the barrier sample exceeds `BARRIER_THRESHOLD`, the tile is overridden with the biome's barrier terrain. New levers in `src/data/`:

- `BARRIER_NOISE_FREQUENCY` — lower than `NOISE_FREQUENCY`, so barrier features are long/chunky (walls, not speckle).
- `BARRIER_THRESHOLD` — fraction of tiles converted; the master "how walled is the world" dial.
- `BIOMES[*].barrierTerrain` — what a wall is made of per biome (`mountain` default; a biome may choose `river`). Mountain stays the one hard gate (∞, climbing-pick enables); river barriers are expensive-but-passable (30, raft −20).

**Connectivity pass** (runs after terrain, before POI placement): flood-fill walkable (finite-cost, i.e. non-mountain) tiles; while more than one region exists, connect the largest region to the nearest other region by carving a corridor — a seeded-random straight-ish line of wall tiles converted to the biome's dominant cheap terrain (reads as a "pass"). Guarantee: **all non-mountain tiles form one connected component**, so nothing is ever literally unreachable barefoot; mountains only ever act as cost-walls to route around (or climbing-pick shortcuts through). The existing entry selection and the `FOOD_REACH_MIN` forage guard then operate on an always-connected field.

POI placement is unchanged in mechanism (rejection sampling + value-vs-reach pairing) and runs on the final terrain.

## §3 Density & tuning targets

- `POI_DENSITY` 18 → **60** (3× area, slightly denser per tile, per approved direction).
- `POI_PLACEMENT_ATTEMPTS` scales with density (keep the accept-rate margin); `POI_MIN_SPACING` unchanged unless placement starves.
- **Tuning targets** (verified by harness metrics, not hand-math; they are targets, not hard asserts):
  - Geared + provisioned + foraging-smartly run harvests **~50%** of the map's POIs — and must make *choices* about which half.
  - Starter-kit run harvests **~15–20%**.
  - Carry cap already ensures you never haul everything home; no carry changes this pass.
- **No gear nerfs.** `MIN_STEP` 5, subtractive discounts, and per-terrain transport multipliers all stay as-is — the long map is what restores scarcity.
- The sustainability harness (`test/harness-sustainability.test.ts`) must stay green on the new map; the loop harness gains a reach-fraction report so the 50% / 15–20% targets are observable.

## §4 Food: fresh vs processed

Engine constraint honored: items stay `{defId, qty}` — freshness is **defId transitions at run boundaries**, never per-instance state.

- **`berries`** — a new material in every biome's `herb` materialTable (woodland-heavy, desert/tundra light). `berries` is also in the `FOOD` catalog with `FOOD_ENERGY.berries = 30` — weak next to ration (80), but available *out there*.
- **Gather routing rule (new, general):** a gathered yield whose defId is in `FOOD` routes to `expedition.loadout.food` (one slot per unit, like packed food) instead of the loot carry — so foraged berries are immediately eatable and participate in auto-eat/`eat` unchanged. Gather still rejects if the food/potion slot cap is full.
- **Return transform:** in `endExpedition` banking, `berries` in the returning food supply bank as **`stale-berries`** (a tier-1 material, stacks normally). One defId-map applied at the existing bank step; both run-end paths (return + combat soft-fail) get it for free.
- **Town recipe:** `stale-berries ×3 → jam ×1`, with `FOOD_ENERGY.jam = 120` — denser than ration, cheaper than trail-ration, so hauling berries home is a real alternative to eating them.
- **Can't re-field staleness:** `stale-berries` is a material, and materials are not packable as food — the "old berries do nothing in the field" rule enforces itself with no new mechanism.
- Existing loops untouched: herbs→ration and hunting→ration stay the *reliable* food economy; berries add the eat-now-or-process-later decision on top.

## §5 Surfaces touched

- **Engine:** `grid.ts` (dimensions, barrier layer, connectivity pass), `reach.ts`/`reduce.ts` (dimension-aware bounds), gather routing (food-catalog yields → food supply), `bank.ts` (fresh→stale defId map).
- **Data:** `constants.ts` — `MAP_WIDTH`/`MAP_HEIGHT`, barrier levers, `berries`/`stale-berries`/`jam` entries (`FOOD`, `FOOD_ENERGY`, `MATERIAL_TIER`, biome herb tables, `RECIPE`), `POI_DENSITY`.
- **Web:** map container becomes a vertical-scroll viewport (portrait strip, unchanged tile size, thumb-friendly); minimap/jump affordance only if scrolling proves painful (follow-up, not this pass).
- **Playtest console:** dimension-aware render (already iterates grid arrays; verify no square assumptions).
- **Docs:** `decisions.md` new D-row; `balance-levers.md` new/changed levers.

## §6 Verification

- Connectivity property test: across many seeds × all biomes, all non-mountain tiles form one component; every carve is deterministic in the seed.
- Berries lifecycle tests: forage → food supply (slot-capped), auto-eat eats them, leftovers bank as `stale-berries`, jam recipe crafts, `stale-berries` not packable as food.
- Dimension tests: bounds, entry on south edge, POI placement within 20×60.
- Sustainability harness green; loop harness reports POI-harvest fraction for the §3 targets.
- Quality gates: `bun test`, `bun run typecheck`, `bun run lint` (engine purity — all generation stays seed-pure).

## §7 Follow-ups (explicitly out of scope)

- Per-map sizes (dropped humanoid maps skew larger/richer) — revisit after feel-testing flat 20×60.
- Biome-flavored barrier content (canyons/crevasses/thickets) — data tuning on §2's levers.
- `wine` (second stale-berries recipe; combat buff or trade good) and the fresh/processed arc for hunted meat (raw meat eat-now vs smoked).
- Higher-tier food sources + harvest tools (the "food present at all tiers" ticket note) — berries prove the axis first.
- Minimap / scroll-jump UI if the tall map is annoying on phone.
