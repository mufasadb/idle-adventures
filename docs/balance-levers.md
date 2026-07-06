# Balance Levers

The POC ships with *feel-pass* values, not balanced ones. The discipline that keeps the long game open: **every tunable is a named, documented constant in `src/data/`, grouped by system, commented with what pulling it does.** Engine logic never hardcodes a number — it reads a lever. Tuning = turning labelled dials, not hunting for stray `7`s.

## Lever groups

**Energy economy** — how far/long a trip lasts
- `ENERGY_PER_FOOD` — default energy per food item (fallback for `FOOD_ENERGY`)
- `FOOD_ENERGY{foodDefId}` (2026-07-04; ff7 2026-07-05: cut to `ration` 8 / `trail-ration` 16) — per-food energy; tiered food stays 2× denser so progression earns slot efficiency. `ENERGY_PER_FOOD` (fallback) 10→8 too. Do NOT drop below 8 (7 risks the forage-only tundra path). Absent = `ENERGY_PER_FOOD`
- `BASE_ENERGY_FLOOR` (2026-07-05, qrl) — embark energy = `max(BASE_ENERGY_FLOOR, packedFoodEnergy)`; a no-food embark still gets ~5 actions, so starvation is recoverable-by-effort, not a 0-energy dead-loop (spec §3/§4.5)
- `TERRAIN_COST{plains 10, mud 15, ice 20, river 30, mountain ∞}` — **absolute** step energy on a ×10 scale (svz, graded movement); `Infinity` = the one hard gate (mountain), enabled by `climbing-pick`
- `MIN_STEP` (5) — floor: a discounted step never costs less than this
- `TERRAIN_GATE{terrain → toolDefId → {enable?, discount?}}` — gear modifiers: `enable` turns an impassable terrain finite (climbing-pick/mountain → 40); `discount` subtracts points (raft/river −20, waders/mud −5, ice-cleats/ice −15 → glide). Each tool = one slot
- `TRANSPORT_MULTIPLIER{transport → terrain → divisor}` — **per-terrain** move-cost divisor (svz): horse fast on open ground (plains ÷2), wagon the ice answer (ice ÷2), mule slow-but-hauler (÷0.8); absent terrain / on-foot = ÷1

**Carry** — loot vs supplies tension (UNIT-based since Phase 2 / pqp)
- `BASE_CARRY_SLOTS` — inventory slots with NO backpack (**6** since pqp) · `BACKPACK_SLOTS{tier}` — total slots per backpack (replaces the base): `starter` 8 / `leather` 12 / `large-pack` 16 · `STACK_CAP` — max qty per **loot** stack (**5**); consumables/tools do NOT stack
- **pqp (2026-07-05, supersedes D23):** each food/potion/battleItem **unit** and **each tool** is one slot; only loot stacks. Food is eaten just-in-time (`food.digest`) and its slot frees mid-run; **uneaten food banks back** on return. So the squeeze is *temporal* — cramped early (heavy food), roomy late — and packing a supply is a live, visible loot slot given up. Caps were bumped (3→6, 4/6/8→8/12/16) for the ~5× consumable pressure vs the old per-stack model. Re-tuning: keep the sustainability harness green (`test/harness-sustainability.test.ts`).
- **Carry sources stack (zhn, 2026-07-05):** `carryCap(equipment)` = backpack tier + `TRANSPORT_CARRY{transport}` (a beast/cart bonus: horse 2, mule 4, wagon 6) + `PANNIERS_SLOTS{panniers}` (4) — panniers only count with a `BEAST_TRANSPORTS` (horse/mule), so a mule+panniers is a hauler and a wagon can't wear them. `panniers` is a new equipment slot (worn/free, durable, banks back).

**Gathering**
- `NODE_HARDNESS{nodeType}` — energy cost numerator · `TOOL_QUALITY{toolDefId}` — cost divisor **AND tier** (D31): quality doubles as the max material tier the tool can work · `GATHER_YIELD{nodeType}` — qty per (one-shot) node
- `NODE_TOOL{nodeType}` — required capability (herb = bare hands) · `TOOL_CAPABILITY{toolDefId}` — tiered tools are data-only (D21: all per node type, never per biome)
- `MATERIAL_TIER{materialDefId}` (D31, 2026-07-04) — a material's tier; gather rejects `tool-too-weak` when the best held tool's quality < this. Absent = tier 1. This **one lever gates the whole tech tree** (no smelting step): coal/silver (T2) need an iron-pick, mithril (T3) needs a steel-pick. The visible-but-locked node is the pull up the ladder.
- Yield defIds come from `BIOMES{id}.materialTable`, stamped onto POIs at generation (D25) — materials across 3 biomes feed one shared recipe tree (M5); tiered materials (coal/ironwood/drake-hide T2, mithril T3) are data additions

**Combat**
- `PLAYER_BASE_HP` · `DMG_ARMOUR_MATRIX[dmgType][armourType]` — read BOTH ways: damage multiplier vs the monster's hide class going out, mitigation divisor per armour piece coming in (`defense ÷ matrix`) · `ARMOUR{pieceDefId} → {armourType, defense}` · `WEAPONS{defId} → {dmgType, damage, tags}` · `UNARMED_DAMAGE`
- `AFFINITIES[{monsterTag, itemTag}]` + `AFFINITY_MULTIPLIER` — the hidden discoverable layer (silver↔werewolf, iron↔fae, garlic↔vampire); never shown by perception, **discovered post-fight** via `matchup.affinityFired` (D38)
- `POTION_HEAL` (default) · `POTION_HEAL_BY{potionDefId}` (2026-07-04, `potion` 10 / `greater-potion` 20; absent = `POTION_HEAL`) · `AUTO_POTION_THRESHOLD` (fraction of base HP) · `CHIP_DAMAGE_MIN` — the "HP always drains" floor, both directions
- `COMBAT_BUFF{battleItemDefId} → {damageAdd?, mitigationAdd?}` (bzd, 2026-07-05) — packed battle items, summed into `dmgOut`/mitigation and **consumed at fight start** (`elixir-of-power` +2 dmg, `warding-draught` +3 mitigation). The T3-fight-only reward branch; they cost inventory slots (pqp) and let a fought-up player beat the Wyrm without full mithril (§4.3). `BATTLE_ITEM[]` is the catalog list (`slotOf` → `"battle-item"`).
- `MONSTER_TIER_HP_CURVE` / `MONSTER_TIER_DMG_CURVE` · `MONSTERS{defId} → {tier, dmgType, armourType, tags}` · `LOOT_TABLE{monster}` (fixed drops — determinism needs no RNG) · `BIOMES{id}.creatureTable` (uniform pick, stamped at generation)
- `DETAIL_RADIUS` (2) + `VISION_RANGE_BONUS{toolDefId}` (spyglass +3) — passive perception (9u9.2, D38): node KIND always visible; qualitative `detail` (species/material/tier/dmg+armour type — **never the outcome**) resolves only within `DETAIL_RADIUS + Σ bonuses` of the player. Future glasses/cartography/scent items slot into `VISION_RANGE_BONUS`. (Replaced `SCOUT_ENERGY_COST`/`SCOUT_RADIUS`/`SCOUT_TOOL`.)

**Crafting**
- `RECIPE{itemDefId} → {inputs, output}` — the shared tree (M5, filled): tiered tools (`iron-pick` halves mining cost — the "cheaper second run" demonstrator), backpacks, weapons incl. affinity gear (`silver-sword`), armour pieces, transport, food, potions. Cross-biome inputs are a **soft pull** (D27: silver best-farmed in tundra, obtainable anywhere), not a hard gate. `FOOD`/`POTION` catalogs list which defIds `pack`/`slotOf` accept in the consumable slots.

**Map & forecast** — where prep skill lives
- `GRID_SIZE` · `POI_DENSITY` · `POI_MIN_SPACING` · `POI_PLACEMENT_ATTEMPTS`
- `NOISE_FREQUENCY` — Perlin sample step per tile; lower = larger, chunkier terrain regions
- `BIOMES{id} → {terrainWeights, nodeTypeWeights, creatureTable, materialTable}` — a biome is a **generation profile only** (D21): consumed by `generateGrid(mapSeed, biomeId)`, never consulted at runtime. Biomes shift likelihoods, not rules. Start: woodland / desert / tundra; adding a biome = one data entry. (Subsumes the earlier flat `NOISE_THRESHOLDS` — thresholds now live per-biome in `terrainWeights`.)
- **Held maps (D40, xzx, 2026-07-06):** `GameState.maps: MapItem[]` is the pocketed-map collection — no lever this pass (`pocket-map` has **no cost and no cap**: "go nearby" means you're never gated, so hoarding buys nothing). If hoarding ever needs friction, add a `MAX_HELD_MAPS` cap lever here; `vintage` (runs-at-pocket) is flavour-only today but is the natural hook for a future map-decay lever.
- `CANDIDATE_MAP_COUNT` (3) · `PREVIEW_FIDELITY` — how much the map preview reveals beyond the biome-name headline (the master dial for how much preparation matters). Ships at **0** (biome-name headline only; `candidateMaps` returns empty `hints`); `town.previewHints` is structured so higher tiers — and a later **cartography** system (craftable/editable maps) — plug in without reshaping the preview.

## Levers we most expect to tune long-term

`TERRAIN_COST` · `ENERGY_PER_FOOD`/`FOOD_ENERGY` · `MONSTER_TIER_*_CURVE` · `AFFINITY_MULTIPLIER` · `BACKPACK_SLOTS` · `STACK_CAP` · `MATERIAL_TIER` (which materials sit behind which tool tier) · `POI_DENSITY` · `PREVIEW_FIDELITY` · `BIOMES[*]` weights. These are the dials that most change *feel* and *difficulty*; keep them especially well-labelled and easy to find.
