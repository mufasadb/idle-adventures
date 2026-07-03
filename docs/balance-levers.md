# Balance Levers

The POC ships with *feel-pass* values, not balanced ones. The discipline that keeps the long game open: **every tunable is a named, documented constant in `src/data/`, grouped by system, commented with what pulling it does.** Engine logic never hardcodes a number — it reads a lever. Tuning = turning labelled dials, not hunting for stray `7`s.

## Lever groups

**Energy economy** — how far/long a trip lasts
- `ENERGY_PER_FOOD` — energy granted per food item packed
- `MOVE_BASE_COST` — energy per tile on neutral ground
- `TERRAIN_COST{plains, mud, ice, river, mountain}` — per-terrain multiplier; `Infinity` = impassable without gear (mountain, until gating gear exists)
- `TRANSPORT_MULTIPLIER{horse, mule, …}` — move-cost **divisor** (spec §10: base × terrain ÷ transport): >1 faster than foot (horse), <1 slower (mule — pays for future carry bonus); carry bonuses arrive with M3/M5

**Carry** — loot vs supplies tension
- `BASE_CARRY_SLOTS` — carry stacks with no backpack · `BACKPACK_SLOTS{tier}` — total stacks per backpack (replaces the base) · `STACK_CAP` — max qty per stack
- D23: packed food/potion stacks count against the same cap (ballast) — every ration packed is a loot slot spent

**Gathering**
- `NODE_HARDNESS{nodeType}` — energy cost numerator · `TOOL_QUALITY{toolDefId}` — cost divisor · `GATHER_YIELD{nodeType}` — qty per (one-shot) node
- `NODE_TOOL{nodeType}` — required capability (herb = bare hands) · `TOOL_CAPABILITY{toolDefId}` — tiered tools are data-only (D21: all per node type, never per biome)
- Yield defIds come from `BIOMES{id}.materialTable`, stamped onto POIs at generation (D25) — 12 distinct materials across 3 biomes feed one shared recipe tree (M5)

**Combat**
- `PLAYER_BASE_HP` · `DMG_ARMOUR_MATRIX[dmgType][armourType]` — read BOTH ways: damage multiplier vs the monster's hide class going out, mitigation divisor per armour piece coming in (`defense ÷ matrix`) · `ARMOUR{pieceDefId} → {armourType, defense}` · `WEAPONS{defId} → {dmgType, damage, tags}` · `UNARMED_DAMAGE`
- `AFFINITIES[{monsterTag, itemTag}]` + `AFFINITY_MULTIPLIER` — the hidden discoverable layer (silver↔werewolf, iron↔fae, garlic↔vampire); scout forecasts price it in without naming it
- `POTION_HEAL` · `AUTO_POTION_THRESHOLD` (fraction of base HP) · `CHIP_DAMAGE_MIN` — the "HP always drains" floor, both directions
- `MONSTER_TIER_HP_CURVE` / `MONSTER_TIER_DMG_CURVE` · `MONSTERS{defId} → {tier, dmgType, armourType, tags}` · `LOOT_TABLE{monster}` (fixed drops — determinism needs no RNG) · `BIOMES{id}.creatureTable` (uniform pick, stamped at generation)
- `SCOUT_ENERGY_COST` · `SCOUT_RADIUS` · `SCOUT_TOOL`

**Crafting**
- `RECIPE{itemDefId} → {inputs, output}`

**Map & forecast** — where prep skill lives
- `GRID_SIZE` · `POI_DENSITY` · `POI_MIN_SPACING` · `POI_PLACEMENT_ATTEMPTS`
- `NOISE_FREQUENCY` — Perlin sample step per tile; lower = larger, chunkier terrain regions
- `BIOMES{id} → {terrainWeights, nodeTypeWeights, creatureTable, materialTable}` — a biome is a **generation profile only** (D21): consumed by `generateGrid(mapSeed, biomeId)`, never consulted at runtime. Biomes shift likelihoods, not rules. Start: woodland / desert / tundra; adding a biome = one data entry. (Subsumes the earlier flat `NOISE_THRESHOLDS` — thresholds now live per-biome in `terrainWeights`.)
- `CANDIDATE_MAP_COUNT` (3) · `PREVIEW_FIDELITY` — how much the map preview reveals beyond the biome-name headline (the master dial for how much preparation matters)

## Levers we most expect to tune long-term

`TERRAIN_COST` · `ENERGY_PER_FOOD` · `MONSTER_TIER_*_CURVE` · `AFFINITY_MULTIPLIER` · `BACKPACK_SLOTS` · `POI_DENSITY` · `PREVIEW_FIDELITY` · `BIOMES[*]` weights. These are the dials that most change *feel* and *difficulty*; keep them especially well-labelled and easy to find.
