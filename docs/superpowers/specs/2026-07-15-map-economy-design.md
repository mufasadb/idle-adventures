# Map Economy — maps as the managed progression resource (design)

**Date:** 2026-07-15
**Beads:** subsumes `idle-adventure-e5c` (embark flow) + `idle-adventure-ef8` (map economy); new epic + children created from this spec.
**Status:** APPROVED (design shape, 2026-07-15) — proceeding to bead decomposition + implementation.

## Intent

Make **maps the resource the loop is built around.** Today the town hands you a choice of 3 free T1 maps and the tier machinery, while built, is never exercised — so map tiers "keep looking done" and keep blocking downstream work. This spec finishes the economy end-to-end so the progression is: **run the free local map → earn better maps as drops → manage a scarce map-carry capacity → spend earned maps to climb tiers (harder + richer) → repeat.**

## What already exists (do NOT rebuild)

- **`tierProfile(biome, biomeId, mapTier)`** (grid.ts) scales a map by tier: material weights (`MATERIAL_MAP_TIER_WEIGHT`), creature mix (`MAP_TIER_CREATURE_ADD` — higher-tier creatures carry more HP via `MONSTER_TIER_HP_CURVE`), terrain shifts, and POI density (`POI_DENSITY_BY_TIER`). **Tier already delivers difficulty + richer loot on the generation side.**
- **Map drops (8ec):** humanoids drop `map-scroll` (`CATEGORY_LOOT_TABLE.humanoid`, `MAP_DROP_CHANCE` 0.5); `fightAt` intercepts it and **mints a `MapItem`** at **tier = min(sourceTier + 1, MAP_TIER_MAX)** into `expedition.carriedMaps`; `bank.ts` banks `carriedMaps` into `state.maps` at every run-end path. `drop-map` action sheds a carried map under pressure. **The climb's plumbing is done.**
- **`state.maps`** (held maps, `MapItem[]` with per-instance `mapSeed`/`tier`/`affixes`) + embark already consumes a held map at commit; cartography inks apply affixes to held maps.

Maps keep per-instance state (seed/tier/affixes) so they **cannot** be `{defId, qty}` bank items (a hard non-negotiable) — they stay the `state.maps` structure, just **presented** as a managed list. Confirmed OK with user.

## What's missing (this spec)

### ① The local fallback map

The town offers exactly **one** free "over the hill" map, replacing the 3-map offer (`CANDIDATE_MAP_COUNT` retired for the offer; a new `localMap(seed, runs)` returns a single deterministic map).

- **T1**, biome shown, **deterministic per run-count and rotating** each visit (not one fixed map forever — keeps it from going stale).
- **Infinite, not pocketable, not consumed** — always available.
- Purpose: cheap **food** + a shot at **humanoid map-drops** (the seed of the climb). Its creature table must include a humanoid so map-drops are reachable from a fresh start.

### ② Held maps as a managed list + two-step Plan→Embark

- Earned maps (`state.maps`) render as an inspectable list: **tier (prominent)**, biome, age (runs since vintage), affixes. No pocket buttons — **pocketing is retired** (`pocket-map` action + `pocketed-map` event removed; maps come from drops now).
- **Two-step:** selecting any map (local or held) enters a **prep view** (web view-mode `prep: { mapSeed } | null` in main.ts — no engine change): the loadout + bank + recipe columns with the chosen map pinned at the top, a final **Embark ▶** and a **← back** to reselect. Engine `embark` already consumes held-not-local at commit, so "spend only at final embark" (ef8) falls out for free.
- **UI distinction (first-pass, iterate live):** the local map is a single plain/muted card labelled *"Local expedition — over the hill"* with **no spend warning**; earned maps are a visually distinct *"Your maps"* section (tier badge, valued styling), and the prep-view final button reads **"Embark ▶"** for the local map vs **"Embark ▶ — spends this map"** for an earned one. The distinction must read at a glance so a player never burns a T3 thinking it's the freebie.

### ③ Dedicated map-carry capacity + holders (new mechanic)

Today a carried map steals a general loot slot. Replace that with a **dedicated, permanent map-carry cap**:

- New lever `MAP_CARRY_BASE = 1` — the "map pocket" in the starter bag.
- `mapCarryCap(state)` = base + the best owned **map-holder** tier's bonus (holders are **owned, not equipped** — a permanent bag upgrade; the only cost is the crafting materials). Tiered `map-holder` recipes raise the cap 1→2→3….
- The mint fit-check (reduce.ts, the `carried = carryWithLoot.length + carriedMaps.length < freeCarryStacks(...)` line) checks **map-cap**, not loot stacks; `drop-map` and carry accounting move to the map-cap pool. Carried maps no longer consume loot slots.
- **NEAR-THING:** holder tiers/costs (e.g. `map-satchel` +1 from leather+, `map-case` +2 from a T2 material) — pick sensible values, tune later.

### ④ Tier climb — wire + verify end-to-end

Mostly wiring, not new systems:

- Guarantee the local map is **T1**; confirm the climb is reachable: local (T1) → humanoid drop mints **T2** → embark T2 (harder + richer) → mints **T3** → … up to `MAP_TIER_MAX`.
- Surface tier clearly in the town list and prep view.
- **Verify higher tiers pay out better loot/items** (user wants "stronger item availability"). `tierProfile` biases materials + adds higher-tier creatures (better drops) already; **only add levers if a measured gap exists** — do not invent a parallel system. A full-loop harness test is the oracle.

### ⑤ ef8 rules — folded in

Free local not pocketable ✓ (no pocket action in the flow); consume at final embark ✓ (unchanged reducer behavior); `pocket-map` retired.

## Decomposition (child beads, dependency order)

1. **Local fallback map** — engine/town: `localMap(seed, runs)`; embark/legal accept it; retire `pocket-map` + `pocketed-map`; the 3-offer gone. Tests: single T1 local map, not consumed, not pocketable.
2. **Map-carry cap + holders** — data/engine: `MAP_CARRY_BASE`, `mapCarryCap`, holder recipes/tiers; mint + `drop-map` + carry accounting move to the map-cap pool. Tests: cap accounting, holders raise it, drop-map, maps no longer eat loot slots.
3. **Town two-step UI** — web: `prep` view-mode; local card vs earned-map list with the clear free-vs-cost distinction; final Embark. (Depends on 1 + 2.)
4. **Tier climb verify + tune** — engine/data/test: end-to-end climb reachable; verify tier loot payoff; full-loop harness (local → T2 → T3); add levers only for a measured gap.

Beads 1 & 2 both touch reduce.ts → land **sequentially** (subagent per bead, reviewed + committed before the next). Bead 3 (web) after 1 & 2. Bead 4 last.

## Testing

- **Engine:** local-map invariants (single, T1, not consumed, not pocketable); map-cap accounting (mint respects `mapCarryCap`, holders raise it, `drop-map` frees a slot, carried maps don't touch loot stacks); two-step embark consumes held-not-local.
- **Web:** view-mode is thin (state → string, re-rendered) — assert prep-view shows the chosen map + correct final-button copy per map type.
- **Full loop harness:** fresh game → local run earns a T2 → embark T2 earns a T3 → confirm difficulty + reward rise with tier.
- Gates: `bun test` + `bun run typecheck` + `bun run lint` green; every lever change lands with a `decisions.md` D-row + `balance-levers.md` update.

## Open near-thing calls (tune later)

- Local map rotation cadence (per-visit vs per-N-runs) and whether its loot is nudged toward food/map-drops.
- Map-holder tier count, cap bonuses, and recipe costs.
- Whether tier needs an explicit item-availability lever or generation bias suffices (measure first).
