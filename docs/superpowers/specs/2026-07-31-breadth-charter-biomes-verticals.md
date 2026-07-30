# Breadth Charter — biomes × verticals, ordered into buildable sets

**Status:** charter (durable frame; nothing here is committed content — each set gets its own brainstorm→spec when pulled).
**Bead:** `idle-adventure-si7.6.4` (delivers this doc). Parent epic: `idle-adventure-si7.6` (horizontal breadth roadmap).
**Supersedes:** the parked §6 sketch in `2026-07-09-crafting-depth-gates-stations-field-design.md` (that section is the seed; this is the worked-out map).

## Why this exists

The G2 problem is horizontal thinness — one dominant craft/fight line, no "pick a style." The answer is **breadth**: harder problems solvable multiple ways (bow / magic / thrown potions / bombs / tamed beasts / followers) plus reach and perception options, each with real tradeoffs. This charter is the **map** so future specs have a frame, and the **order** so we can pull work top-down instead of re-deciding each time.

## Governing rule

What appears on a map = **map tier × biome × affix**. The plumbing exists (`tierProfile`, cxq affixes); the gap is *content per slot*, not engine. A biome is **not itself a tier** — it has two coordinates:

- **Entry tier** — when it first appears in offers (woodland/desert/tundra enter at T1).
- **Signature ceiling** — its deep hook (tundra = mithril-ore + ancient-wyrm at T3).

"Higher-tier biome" = enters later and/or tops out deeper. Ordering biomes = deciding entry tiers, which is driven by where each biome's signature material/creature sits on the material ladder AND which vertical it showcases.

## Hook discipline

- **data-hooks** (a signature material/creature/economy skew) are free — pure `BIOMES` data, like woodland = bow country today.
- **rule-hooks** (new terrain/behavior) are reserved for a few flagships (water, lava, chasm).
- Any hook may be **declared-now / built-later** and **tier-gated** — ship the biome as a reskin, name its deep signature, light it up when the tier/vertical lands (exactly how tundra shipped before mithril/wyrm mattered).

## The material ladder we build against (as of 2026-07-31)

| Rung | Materials | Gate |
|---|---|---|
| **T1 bootstrap** | flint, deadwood, forest-herb, berries, oak/pine/cactus-log, copper-ore, iron-ore, hides, stringybark, feather | bare hands / base tools; abundant at T1, tapers deeper (`MATERIAL_MAP_TIER_WEIGHT`) |
| **T2 mid** | silver-ore, coal (fuel), ironwood-log, salt, drake-hide *(combat drop)* | hardened tools (iron/steel pick·axe) |
| **T3 deep** | mithril-ore, boss drops | steel-pick only; wyrm/vampire bosses |

Current biomes: **woodland** (T1, bow country, light mining), **desert** (T1, fuel: coal/salt, copper), **tundra** (T1 opener but the *deep mine* — silver/coal/mithril + ice-troll T2 / ancient-wyrm T3, i.e. the current endgame biome).

## The 10-biome slate

| Biome | Entry | Signature hook | Showcase vertical | Terrain hook |
|---|---|---|---|---|
| **Savanna/Steppe** | T1 | cheap-reach hunting highway | — (melee/bow); taming later | data |
| **Swamp/Marsh** | T2 | reeds, bog-iron; mud/river movement-gear demand | fishing + alchemy | data (mud/river heavy) |
| **Jungle** | T2 | venom → antidote/poison | alchemy (combat) | data |
| **Highlands/Alpine** | T2 | gentle rung woodland→tundra | climbing/reach | data |
| **Fungal Forest** | T2–3 | spores → magic/alchemy | magic + alchemy | data |
| **Badlands/Mesa** | T2–3 | maze-routing challenge | reach/prospecting | data |
| **Coastal/Shore** | T2 | deep-water; the fishing *home* | fishing + boats | **rule** (water terrain) |
| **Blighted Ruins** | T3 | "of the ancients" deep endgame | fight-dense; followers | data |
| **Volcanic/Ashlands** | T3–4 | lava; endgame weapon-fuel | artificer/prospecting | **rule** (lava) |
| **Crystal Caverns** | T4 | deep mithril+ mining, magic focus | magic + prospecting | **rule** (chasm) |

## The vertical roster (the "pick a style" answer)

**⚔️ Fight:** bow ✅ · alchemy-combat (thrown/coatings — coatings partly landed ke3.7.3) · blowgun (specced si7.6.6) · magic (large) · artificer/bombs · taming · followers
**🥾 Reach:** boats/rafts (transport-gate water, small) · climbing/z-levels (large) · magic mobility (rides magic)
**⛏️ Gather:** fishing (specced si7.6.2 + water si7.6.5) · prospecting
**👁️ Sustain/Perceive:** pre-scouting (= `3iq` preview fidelity) · healing alchemy (rides alchemy)

**Coupling insight:** biome order is coupled to vertical order — a biome whose identity is a not-yet-built vertical ships as an empty reskin. So we sequence by "which biome showcases a vertical we're about to build."

## The obstacle × vertical engine (backlog menu)

Terrain obstacles (ice-slide, pushable blocks, river currents, cliffs/z-levels, lava, deep-water, fog) are interesting because different verticals answer each differently, with tradeoffs (ice-slide → fire spell *or* gripped boots *or* solve the puzzle). This grid is combinatorial — hook-space is a multiplication table, not scarce. Drawn from per set; each obstacle gets its own spec when pulled.

## Ordered build sets — pull top-down

Each set = a vertical (+ its terrain) shipped with the biome that showcases it. **Every leaf still gets its own brainstorm→spec when pulled** — this is the order, not the design.

### Set 1 — Water & Fishing *(T2, ready, lowest new-engine risk)*
Water terrains (rule-hook) → fishing → blowgun → **Swamp** + **Coastal** biomes. Chains off already-landed alchemy. Swamp's mud/river terrain makes movement-gear matter even before fishing.
Existing beads: `si7.6.5` (water), `si7.6.2` (fishing), `si7.6.6` (blowgun), `si7.6.3` (swamp). New leaf: coastal biome (spec when pulled).

### Set 2 — Alchemy-combat & poison biomes *(T2)*
Thrown potions + finish weapon-coatings → **Jungle** + **Fungal Forest**. Healing alchemy rides along.

### Set 3 — Reach breadth *(T2–3)*
Boats (rides Set 1's water) + climbing/verticality → **Highlands**; deepens Coastal/Swamp routing.

### Set 4 — Perception *(cross-cutting, can lead)*
Pre-scouting = `3iq` (preview fidelity). Sharpens the packing decision in *every* biome, new or existing — the one set that improves the current game with no new biome. Candidate to jump earlier.

### Set 5 — Deep verticals & endgame biomes *(T3–4, highest engine cost, last)*
Magic + prospecting → **Crystal Caverns**; artificer → **Volcanic**; taming / followers → **Savanna** / **Blighted Ruins**. Both the most content-risk and the gate on the T3+ biomes.

**Open low-confidence bets** (gut-check before they get beads): **followers** and **z-level climbing** — largest engine cost vs. payoff.

## Conventions when a set is pulled

Each biome = one `BIOMES` entry (generation profile only, D21) + materials/creatures/recipes + `BIOME_IDS` type ripple. New terrain = `TERRAINS` addition (identity-at-base: zero-weight in existing biomes so their maps stay byte-identical) + `moveCost`. Every lever lands with a `decisions.md` D-row (next: **D88**) + `balance-levers.md` update. Tier-gated biomes ride `r51` (biome-rarity weights) if they also need to be rarer within their entry pool.
