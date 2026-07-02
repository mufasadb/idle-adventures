# Balance Levers

The POC ships with *feel-pass* values, not balanced ones. The discipline that keeps the long game open: **every tunable is a named, documented constant in `src/data/`, grouped by system, commented with what pulling it does.** Engine logic never hardcodes a number — it reads a lever. Tuning = turning labelled dials, not hunting for stray `7`s.

## Lever groups

**Energy economy** — how far/long a trip lasts
- `ENERGY_PER_FOOD` — energy granted per food item packed
- `MOVE_BASE_COST` — energy per tile on neutral ground
- `TERRAIN_COST{plains, mud, ice, river, mountain}` — per-terrain multiplier (or "impassable without gear")
- `TRANSPORT_MULTIPLIER{horse, mule, …}` — move-cost reduction + carry bonus

**Carry** — loot vs supplies tension
- `BACKPACK_SLOTS{tier}` · `STACK_CAP`

**Gathering**
- `NODE_HARDNESS{type, tier}` · `TOOL_QUALITY{pick, …}` · `GATHER_YIELD{node}`

**Combat**
- `PLAYER_BASE_HP` · `DMG_ARMOUR_MATRIX[dmgType][armourType]` · `ARMOUR_DEFENSE{piece, tier}`
- `AFFINITY_MULTIPLIER` (e.g. silver↔werewolf) · `POTION_HEAL` · `AUTO_POTION_THRESHOLD`
- `MONSTER_TIER_HP_CURVE` · `MONSTER_TIER_DMG_CURVE` · `LOOT_TABLE{monster}`

**Crafting**
- `RECIPE{itemDefId} → {inputs, output}`

**Map & forecast** — where prep skill lives
- `GRID_SIZE` · `POI_DENSITY` · `POI_MIN_SPACING` · `POI_PLACEMENT_ATTEMPTS`
- `NOISE_FREQUENCY` — Perlin sample step per tile; lower = larger, chunkier terrain regions
- `BIOMES{id} → {terrainWeights, nodeTypeWeights, creatureTable, materialTable}` — a biome is a **generation profile only** (D21): consumed by `generateGrid(mapSeed, biomeId)`, never consulted at runtime. Biomes shift likelihoods, not rules. Start: woodland / desert / tundra; adding a biome = one data entry. (Subsumes the earlier flat `NOISE_THRESHOLDS` — thresholds now live per-biome in `terrainWeights`.)
- `CANDIDATE_MAP_COUNT` (3) · `PREVIEW_FIDELITY` — how much the map preview reveals beyond the biome-name headline (the master dial for how much preparation matters)

## Levers we most expect to tune long-term

`TERRAIN_COST` · `ENERGY_PER_FOOD` · `MONSTER_TIER_*_CURVE` · `AFFINITY_MULTIPLIER` · `BACKPACK_SLOTS` · `POI_DENSITY` · `PREVIEW_FIDELITY` · `BIOMES[*]` weights. These are the dials that most change *feel* and *difficulty*; keep them especially well-labelled and easy to find.
