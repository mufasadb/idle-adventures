# Graded Movement Economy

**Bead:** `idle-adventure-svz` (rescoped up from `idle-adventure-8o5`, now superseded).

## 1. Problem

Movement is binary: terrain is either passable or `Infinity`, and gear flips it via *min-replace* (`TERRAIN_GATE`). The cost scale is coarse (`1, 1.5, 2, 3, ∞`), so there's no room for gear to shave a *portion* off a terrain — an item either enables a tile or it doesn't. We want a **graded** model: most terrain is passable-but-costly, gear/beasts subtract meaningful chunks, and only mountains remain a true wall. This turns "did I bring the right kit for this biome's terrain?" into a live loadout decision instead of an all-or-nothing gate.

## 2. Design goals

- **Graded, not gated:** gear gives *subtractive* point-discounts on a finer scale; terrain stays passable (mountains excepted).
- **Mountains stay the one hard gate** (`Infinity`, `climbing-pick` *enables*) — preserves Phase 3 barrier topology (`b91`) and `reach.ts` unchanged.
- **Terrain-conditional transport:** a horse is fast on open ground, useless in a river; a wagon answers ice.
- **Economy unchanged in feel:** rescale movement ×10 for headroom, recalibrate the energy budget ×10 so every ratio holds.

## 3. Scale + formula

`TERRAIN_COST` becomes **absolute step-energy** (was a multiplier); `MOVE_BASE_COST` is removed. New lever `MIN_STEP = 5` floors any discounted step.

| terrain | old | new `TERRAIN_COST` |
|---|---|---|
| plains | 1 | 10 |
| mud | 1.5 | 15 |
| ice | 2 | 20 |
| river | 3 | 30 |
| mountain | ∞ | Infinity |

`moveCost(terrain, transport, tools)` — subtract-then-floor, transport divides per-terrain:

```
let step = TERRAIN_COST[terrain];                 // may be Infinity (mountain)
const mods = TERRAIN_GATE[terrain];               // { toolDefId: { enable?, discount? } }
if (mods) for (const tool of tools) {
  const m = mods[tool];
  if (m?.enable !== undefined && !Number.isFinite(step)) step = m.enable; // only climbing-pick/mountain
  if (m?.discount) step -= m.discount;
}
step = Number.isFinite(step) ? Math.max(MIN_STEP, step) : Infinity;        // ∞ stays ∞ w/o an enable
return step / transportDivisor(transport, terrain);
```

Mountain stays `Infinity` unless *enabled*, so `reach.ts` (costToReach / reachableTiles), b91 topology, entry-selection, and the food-reachability guard are **untouched** — only the finite cost magnitudes scale (×10), and their ordering is identical.

## 4. Gear modifiers (`TERRAIN_GATE` shape change)

`TERRAIN_GATE: Partial<Record<Terrain, Record<string, { enable?: number; discount?: number }>>>`:

```ts
{
  mountain: { "climbing-pick": { enable: 40 } }, // ∞ → 40 (crossable at 4× plains)
  river:    { raft:            { discount: 20 } }, // 30 → 10 (≈ plains)
  mud:      { waders:          { discount: 5 } },  // 15 → 10
  ice:      { "ice-cleats":    { discount: 15 } }, // 20 → 5 (faster than plains — a tundra "highway")
}
```

- `climbing-pick` — keeps its enable role (was `4` in the old min-replace scale).
- `raft` — keeps its river role, now expressed as a discount.
- **`waders` (new)** and **`ice-cleats` (new)** — each a craftable tool (one tool slot = the cost). New `RECIPE` + `TOOL_CAPABILITY` (`"ford"`/`"ice"`) + `TOOL_QUALITY` (1) entries, mirroring climbing-pick/raft. Materials read from levers (proposed: waders = `deer-hide ×2` + `pine-log ×1`; ice-cleats = `iron-ore ×1` + `wolf-pelt ×1` — cheap-ish, tune in the plan).

## 5. Terrain-conditional transport

`TRANSPORT_MULTIPLIER` goes from `Record<string, number>` to **per-terrain divisors** with a default of 1:

`TRANSPORT_MULTIPLIER: Record<string, Partial<Record<Terrain, number>>>`

```ts
{
  horse: { plains: 2, mud: 1.2 },              // open-ground speed; ice/river/mountain default 1
  wagon: { ice: 2, plains: 1.5, mud: 1.2 },    // the ice answer + general hauler
  mule:  { plains: 0.8, mud: 0.8, ice: 0.8, river: 0.8 }, // slow everywhere, but the big carrier (carry role unchanged)
}
```

`transportDivisor(transport, terrain)` = `TRANSPORT_MULTIPLIER[transport]?.[terrain] ?? 1` (on-foot / unknown transport → 1). Carry contributions (`TRANSPORT_CARRY`, panniers) are unchanged — this only touches move cost.

## 6. Energy recalibration (×10)

All energy-denominated levers ×10 so movement:gather:food ratios are preserved (economy feel unchanged):

- `BASE_ENERGY_FLOOR` 20 → 200
- `ENERGY_PER_FOOD` 8 → 80; `FOOD_ENERGY` { ration 80, trail-ration 160 }
- `NODE_HARDNESS` { mining 60, wood 40, herb 20, animal 40 } (gather cost = hardness ÷ tool quality)

Combat (HP/damage), carry slots, gather yields, tiers, and crafting are **not** energy-denominated → unchanged. **Re-run `test/harness-sustainability.test.ts` — must stay green** (the ratio-preserving scale should keep it green; if not, the rescale is inconsistent and must be fixed before landing).

## 7. Testing

- **`move.test`:** rewrite for the new scale, subtractive discounts (raft/waders/ice-cleats), the `MIN_STEP` floor, mountain enable (climbing-pick), and per-terrain transport (horse fast on plains, no help on river; wagon on ice).
- **Catalog:** `waders`/`ice-cleats` classify as tools and are craftable (`slotOf`, constants invariants).
- **Lever-relative tests auto-scale** (reduce-embark energy, reduce-move costs read the levers) — spot-check and update any hardcoded numbers.
- **b91 preserved:** `reach.test`, grid determinism/guard/trend tests stay green (mountain still `Infinity`; finite costs scale but ordering holds).
- **Sustainability harness** re-run green (§6).
- Gates: `bun test` + `bun run typecheck` + `bun run lint`. Render snapshot unaffected (`TERRAIN_CHAR` unchanged). Update `docs/decisions.md` (new decision: graded movement, supersedes the flat-scale/min-replace model) + `docs/balance-levers.md`.

## 8. Out of scope

- New terrain types (dense-forest/machete) and new biomes — deferred; the graded scale makes them cheap to add later.
- Sub-tile / directional movement, real pathfinding in the engine (web A* stays a UI convenience).
- Rebalancing combat or carry.
