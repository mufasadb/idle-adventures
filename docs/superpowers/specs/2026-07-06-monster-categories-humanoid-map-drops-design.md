# Monster Categories + Humanoid Map Drops — Design

**Date:** 2026-07-06
**Bead:** idle-adventure-8ec (implements G1, si7.1: combat needs a reason)
**Builds on:** maps-as-items (xzx, `docs/superpowers/specs/2026-07-06-maps-as-items-design.md`)
**Status:** approved in brainstorm 2026-07-06

## Goal

Make "do I fight this?" a logistics decision with a legible payoff. Every
monster belongs to a **category**, and categories telegraph what hunting them
is *for*: beasts → hides/meat, fae → potion ingredients, **humanoids → maps**.
Humanoid kills drop a **map scroll** — a carried item that costs a carry slot
for the rest of the run and becomes a held map (`state.maps`) when you get it
home. It is inventory pressure, not power: humanoids are not a tougher tier.

Out of scope (deferred, soon): map tiers / cartography / map editing (cxq).
The pickup-preview surface in this design is deliberately the seam where tier
info will slot in later.

## 1. Monster categories (catalog)

`Monster` gains a required single-valued `category` field. `tags` stays
affinity-only (werewolf/fae/vampire/dragon pairings) — classification and
affinity mechanics do not mix.

```ts
export type MonsterCategory = "beast" | "humanoid" | "fae" | "undead" | "giant" | "dragon";
export type Monster = { tier: number; dmgType: DmgType; armourType: ArmourType; category: MonsterCategory; tags: string[] };
```

Assignment for the existing ten: beast (forest-boar, snow-wolf, werewolf,
giant-scorpion), humanoid (sand-raider), fae (fae-sprite, frost-fae), undead
(dust-vampire), giant (ice-troll), dragon (ancient-wyrm).

Categories are pure data in this change — no combat effect. They exist for
loot rolls (§3), UI legibility ("hunt beasts for hides"), and future systems.

## 2. New humanoids — one per biome

"Hunt humanoids for maps" must be viable from any biome. Sand-raider covers
desert; add two ordinary tier-1/2 humanoids:

| Monster | Biome | Tier | Suggested stats | Own loot |
|---|---|---|---|---|
| `forest-bandit` | forest | 1 | melee / light | `raider-supplies` ×1 |
| `snow-marauder` | tundra | 2 | ranged / light | `raider-supplies` ×1 |

Exact dmg/armour types are implementation-tunable; the requirement is
ordinary difficulty for their tier (not a combat tier of their own) and
presence in their biome's spawn table.

## 3. Category loot tables

New `CATEGORY_LOOT_TABLE: Record<MonsterCategory, ItemStackSpec[]>` in
`src/data/constants.ts`, beside the per-monster `LOOT_TABLE`. On victory,
drops = the monster's `LOOT_TABLE` entries **plus** its category's
`CATEGORY_LOOT_TABLE` entries, both rolled through the same deterministic
per-entry `chance` logic in `rollLoot`. Loot can hang off a specific monster,
a whole category, or both.

Initial content: `humanoid: [{ defId: "map-scroll", qty: 1 }]` (other
categories start empty — the existing per-monster tables already express
beast/fae identity).

## 4. The map drop

`map-scroll` is a **special defId**: `fightAt` intercepts it out of the
rolled loot instead of adding a material stack.

- **Mint:** a `MapItem { mapSeed, biomeId, vintage }` is minted
  deterministically from `rand(state.seed, "map-drop", …, at.x, at.y)` — same
  namespaced-RNG discipline as everything else. `vintage = runs` at mint.
- **Biome:** uniform random across all biomes, current biome included.
- **Drop rate:** guaranteed (`MAP_DROP_CHANCE = 1.0`, a named lever in
  `balance-levers.md`) — "humanoids = maps" stays perfectly legible; the cost
  lives in inventory, not RNG.
- **Preview at pickup:** the `map-dropped` event carries `biomeId` + the same
  `previewHints` the town offer shows, so the haul-it-home decision is
  informed. Map tiers surface here later.

Items stay `{defId, qty}` — the minted map never enters `carry`. It lives in
a new run-state field:

```ts
export type Expedition = { …, carriedMaps?: MapItem[] }; // absent = [] (old saves)
```

## 5. Carry accounting & the decline decision

- Each carried map consumes **one carry slot**, no stacking (each is a
  distinct map). Implementation: everywhere `freeCarryStacks(loadout)` feeds
  a `maxStacks` (gather, fightAt fit-check), subtract
  `(expedition.carriedMaps ?? []).length`.
- The map is **not** part of fightAt's pre-fight fit check (it's an optional
  pickup, and rejecting the fight over it would be wrong). After victory: if
  a slot is free the map is auto-carried (`map-dropped` event, `carried:
  true`); if the pack is full it is left behind (`carried: false`) — the
  fight still resolves normally.
- **Decline / change of mind:** new action `{ type: "drop-map"; mapSeed }`
  discards a carried map mid-run, freeing its slot (event `map-discarded`;
  rejection `map-not-carried`). No re-pickup — discarded is gone.
- **Run end:** `carriedMaps` append to `state.maps` in `endExpedition`,
  following the carry's fate in every path — including defeat's soft fail
  (D26: carry is kept). A banked carried map is identical to a pocketed one:
  consumed on embark, vintage is flavour.

## 6. Surfaces

- **Web:** victory toast/panel shows the dropped map (biome + hints +
  carried/left); carried maps listed in the pack view with their slot cost;
  town shelf shows them merged into held maps.
- **Console (headless):** `--carry` output includes carried maps (count +
  biomes) — parity with si7.4 so headless playtests see the same economy.
- **Events:** `map-dropped { at, mapSeed, biomeId, hints, carried }`,
  `map-discarded { mapSeed }`. Existing pocket flow untouched.

## 7. Testing

- Category loot merge: monster-only, category-only, both; chance entries
  still roll deterministically.
- Mint determinism: same seed + position → same mapSeed/biomeId.
- Slot debit: carried map reduces gather/loot capacity by one; full pack →
  map left behind, fight unaffected.
- drop-map: frees the slot; rejects unknown mapSeed.
- Run-end banking: victory return, walk-home return, and defeat soft-fail all
  land carriedMaps in `state.maps`; embark consumes them like pocketed maps.
- Catalog completeness: every monster has a category (type-enforced); new
  humanoids spawn in their biomes.
- Engine purity boundary unchanged (`test/boundary.test.ts`).
