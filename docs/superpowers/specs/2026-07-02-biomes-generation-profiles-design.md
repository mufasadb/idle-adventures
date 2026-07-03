# Biomes as Generation Profiles — Design

**Date:** 2026-07-02
**Status:** Approved.
**Refines:** `2026-06-30-idle-adventure-poc-core-loop-design.md` §6 (Map) and §11 (Map entry & previews).

---

## 1. What a biome is

A biome is a **named parameter set consumed only at map generation**. After the grid exists, the engine never consults it.

```ts
BIOMES[biomeId] = {
  terrainWeights,    // Perlin thresholds / terrain palette mix
  nodeTypeWeights,   // POI type likelihoods (desert: mining ↑, animal ↓)
  creatureTable,     // which monsters/animals spawn here (biome-flavoured)
  materialTable,     // which materials its nodes yield
}
```

`generateGrid(mapSeed, biomeId)` — one biome per map. Each of the town's 3 candidate maps rolls a biome from its seed.

**Rejected alternatives:**
- *Biome as runtime rule* (biome-wide drains, thirst stats, "bring water for desert" counter-items) — a tax, not a decision. Explicitly cut.
- *Emergent biomes* (label derived from whatever terrain generated) — backwards; the preview needs the biome to *be* the generator.

## 2. The design principle

**Biomes never touch the rules — they only touch the dice.** A biome shifts what a map is likely made of (terrain mix, node mix, creature tables). Every actual decision stays where it already lives:

- route around/through terrain given your **transport**
- detour to a node given your **tools**
- fight or skip a monster given your **weapon/armour**

"Horses are great in desert" needs no horse×desert rule: desert maps are mostly flat-clear terrain, horses are fast on flat-clear terrain. The existing terrain×transport and node×tool systems carry all biome expression statistically.

## 3. Preview

The preview's headline **is the biome name** ("Desert", "Woodland", "Tundra"). `PREVIEW_FIDELITY` scales optional extra whispers on top ("reports of wolves", "rich ore veins"). What a biome implies — which transport shines, which tools pay, what loot is likely — is **learned by playing it, never stated**.

## 4. Content: start 3, structure for N

Working set: **woodland / desert / tundra** (maximally distinct terrain mixes; names swappable). Each biome:

- a distinct terrain-weight profile
- ~4–5 node types at different weights
- 2–3 biome-flavoured creatures wired into the hidden-affinity layer
- materials feeding one **shared** recipe tree, so cross-biome recipes create "I need to visit a desert" pulls

Adding biome #4 later = one data entry, zero engine work.

## 5. Deferred (noted, not POC)

- Biome variety/rarity scaling with progression ("more varied the further you go")
- Biome-specific hidden affinities
- Multi-biome region maps

## 6. Milestone impact

- **M1** — `generateGrid` takes `biomeId`; terrain thresholds & POI weights read from `BIOMES`.
- **M4** — creature tables keyed by biome.
- **M5** — candidate maps roll a biome; preview headline = biome name.
- **Levers** — new `BIOMES` group in `src/data/`; see `balance-levers.md`.

Decision recorded as **D21** in `docs/decisions.md`.
