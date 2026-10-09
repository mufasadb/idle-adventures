# Crafting fog + the research table — design (bead 675, D104)

**Date:** 2026-10-09 · **Decisions:** user, 2026-10-08/09 · **Status:** engine + data + console built; web UI is a follow-up pass.

## Why

A playtester couldn't find the bag recipe: the town book listed ~130 recipes at once, most of them for materials they'd never seen. The book is a wall, not a tree. The fix is to make crafting read as a tree you grow into: you see what's next, and a research table lets you ask after things you want.

## User decisions (settled)

1. Crafting is a **tree** whose nodes are hidden except what's "next". At the start only the main tools are visible: knife, axe, pick, trap.
2. A town **research table**: you type a word; if it semantically matches something in the tree, **one** matching recipe (random) is revealed, shown greyed with its **direct inputs only** (one step, not the whole path).
3. Budget: **one free search per trip to town** (per return from an expedition); spending an **ink** (ore-ink or herb-ink, existing items) buys **5 searches**.
4. **Every search costs** (2026-10-09 revision): a miss spends the search exactly like a hit (free search first, else a charge). Only "no search available" refuses. Learning the game's vocabulary should pay off; meta knowledge helps.
5. **Matching is generous** (2026-10-09 revision): semantic words, synonyms, plurals (incl. irregulars), multi-word names, category words and US/UK spellings all count.
6. **Tiers**: every recipe has a tier, so things that don't strictly require anything rare but are meant for later still sit higher. Research only finds recipes up to **one tier above** the player's progress, so "dragon" on day one returns the miss line, not a spoiler.

## Knowledge

A recipe is **known** if any of:

- it's in `STARTER_RECIPES` (knife, axe, pick, trap);
- you've crafted it (`state.crafted`);
- research revealed it (`state.revealed`);
- it's **next**: every one of its inputs is an item you have **ever held** (`state.seen`). Tool and station requirements don't count here; they're still enforced at craft time.

Book states: **known** (shown; greyed when you can't afford it), **revealed** (research-only so far: shown greyed with its direct inputs, and inputs you've never held are "heard of", `state.heard`), **hidden** (not shown).

`seen` is kept up to date by **one choke point**: `reduce` wraps its dispatch switch in `trackKnowledge`. After every accepted action, while the fog is on, it folds in everything you hold (bank, town loadout, built stations, and on a run the carry and run loadout), plus `crafted` events and the run's map tier. That catches gather, loot, fishing, lockboxes, town and field crafts, and banking without touching any handler. A rejected action (the original state object comes back) or a fog-off game is left byte-identical.

### The fog flag

`GameState.recipeFog?: boolean`, read as `?? false`. Old saves, hand-built test states, the balance sim and the harness are unfogged, so every recipe stays known and no sustainability number moves. `newGame(seed, { recipeFog: true })` is used by web and console new games (`src/web/main.ts`, `src/sim/playtest.ts`, `src/sim/cli.ts` via `play(seed, actions, { recipeFog: true })`). A fresh fogged game's `seen` = its starter bank (ration, potion).

`enableRecipeFog(state)` is a pure, idempotent migration for an existing save. It seeds `seen` from everything held, `crafted` from recipes whose output you own (excluding starter-kit items like ration and potion, which aren't evidence of crafting) and from built stations, and `maxTier` from held maps and the current run. The web pass decides whether to offer it.

### Craft gating

With the fog on, crafting an unknown recipe (in town **or** in the field) rejects `recipe-unknown`. It's the first check after the recipe exists, so a rejection says nothing about the recipe. `legalActions` drops unknown crafts automatically (D29: speculative reduce). `whyNot` returns the reason, and `rejectCopy` points at the two ways to learn a recipe.

## Tiers

`recipeTier(id)` is **derived** by a fixed point over the item graph (an item's tier is the MIN over its sources; a recipe's tier is the MAX over its requirements):

- starter-bank items: T1;
- gathered materials: the biome's minimum tier (`RARE_BIOMES[b].minTier`, else 1);
- a `MATERIAL_GATE`d material: never below its cheapest opening tool's tier + `GATED_MATERIAL_TIER_STEP` (1), whatever the source, so silver, coal, salt and ironwood are T2 and mithril is T3, matching the gates' design comments (a lucky lockbox silver doesn't make silver a T1 material);
- fish and lockbox contents: biome tier, floored by the gear the water needs (`FISH_WATER_GEAR`: a rod, plus a raft or longboat for deep water);
- monster loot: max(the monster's `tier`, the first map tier it spawns on, including `MAP_TIER_CREATURE_ADD` bosses);
- stale forms (`FRESH_TO_STALE`): the fresh item's tier;
- a recipe: `RECIPE_TIER_OVERRIDE[id]`, else max(1, its inputs, its `requires.tools`, its `requires.station`), clamped to `MAP_TIER_MAX`. The output item takes the cheapest recipe's tier.

`RECIPE_TIER_OVERRIDE` lifts things meant for later: canteen, ice-cleats, tent, waders, climbing-pick, horse, panniers, map-satchel, smokehouse and anvil are T2; alchemical-desk and still are T3; dragonscale-cuirass is T4; wyrmfang is T5. A station override feeds forward: every recipe that requires the anvil is at least T2.

The resulting table (T1 = 56, T2 = 58, T3 = 19, T4 = 1, T5 = 1) is pinned in `test/research.test.ts`, so a data change that moves a tier shows up as a reviewable diff.

**Progress tier** = max(`state.maxTier ?? 1` (highest map tier embarked on, maintained by the hook while fogged), the tiers of held and carried maps, the current run's tier).

## Research table

- `{ type: "research", query }` (town only).
  - Rejects `not-in-town` away from town, and `no-research` when you have no free search and no charges.
  - **Matching (generous):** the query is lowercased, split on non-letters and stripped of `RESEARCH_STOPWORDS`. Plurals are singularised on both sides: irregulars first from `RESEARCH_IRREGULAR_PLURALS` (knives → knife, wolves → wolf, leaves, geese, …), then the rules -ies → -y, -ches/-shes/-sses/-xes/-zes/-oes → drop -es, and -s → drop it (but not -ss/-us/-is). The query terms are its tokens, its run-together form ("small backpack" → "smallbackpack"), and one level of `RESEARCH_SYNONYMS` expansion. That table covers category words (weapon → sword/bow/staff/club/blade…, armour → plate/chest/helm/boots/gloves/legs…, food → ration/jam/stew/fish/meat…, boat → raft/longboat, bag → backpack/pack/satchel/panniers…, potion → draught/elixir/flask…) and US/UK spellings (armor/armour, defense/defence). A recipe matches when any term hits its output's vocabulary, either exactly or as a prefix once the term is at least `RESEARCH_MIN_PREFIX` (4) letters long. That vocabulary is: the output defId's tokens, the defId run together ("firekit"), and `RESEARCH_KEYWORDS[output]` (6–12 words each: synonyms, category, use, what it's made from). `dragon` deliberately expands only to `wyrm`, not `drake`, so a day-one "dragon" can't surface the T2 drake-hide recipes.
  - **Candidates:** matching recipes you **don't know**, with `recipeTier ≤ progressTier + RESEARCH_TIER_LOOKAHEAD` (1).
  - **Cost:** every search, hit or miss, spends the free search first, otherwise one charge.
  - **Hit:** `weightedPick` (equal weights) over the sorted candidate ids with `rand(seed, "research", revealed.length, candidates)`. This is deterministic, and the reveal counter moves the roll so repeating a word walks through its matches. The recipe joins `revealed` and its never-held inputs join `heard`. Event: `research-hit { recipeId, inputs, free, charges }`.
  - **Miss** (no candidate, including when only beyond-tier recipes match): **costs the search** like a hit. Event: `research-miss { query, free, charges }` → "Nobody in town has heard of that." The line is the same for a word that matches nothing and for one that's beyond your tier. When every in-reach match is already known, the event carries `alreadyKnown: true` → "you already know everything the town can tell you about that." (This judgement call leaks nothing beyond-tier.)
- `{ type: "buy-research", inkId }` (town only): consumes 1 `ore-ink`/`herb-ink` (`RESEARCH_INKS`) and adds `RESEARCH_SEARCHES_PER_INK` (5) to `researchCharges`. Rejects `insufficient` for no ink or a non-research ink. Event: `research-bought { inkId, charges }`.
- **Free search:** `RESEARCH_FREE_PER_TRIP` (1) per town visit. `freeResearchRun` records the `runs` value at which free searches were spent, and `freeResearchUsed` how many. They refresh when `runs` advances (every return home). A brand-new game has its free search.

## API for the web pass

All are pure and importable by any surface:

- `engine/knowledge.ts`: `recipeKnowledge(state) → RecipeKnowledge[]`, where each row is `{ recipeId, output, status: 'known'|'revealed'|'hidden', affordable, tier, inputs: [{ defId, qty, status: 'seen'|'heard'|'unknown' }] }`. Also `isRecipeKnown(state, id)`, `recipeTier(id)`, `recipeTierTable()`, `itemTier(defId)`, `progressTier(state)`, and `enableRecipeFog(state)`.
- `engine/research.ts`: `researchStatus(state) → { freeAvailable, freeLeft, charges, searches, inks: [{inkId, qty}], reachTier }`, `researchMatches(query)`, `researchCandidates(state, query)` and `queryTerms(query)` (the expanded terms, if the UI wants to echo "searched for: …").
- Actions: `research { query }`, `buy-research { inkId }`. Copy: `formatEvent` (three new events) and `rejectCopy` (`recipe-unknown`, `no-research`).
- Interim note: web **new** games are fogged now, but the web book still lists every recipe until the web pass filters on `recipeKnowledge`. Crafting a hidden row there is refused with the `recipe-unknown` copy.

## Console (blind-playtest surface)

Append-only. The town book prints known and revealed recipes only, using the same row shape. A revealed row gets a `[revealed at the research table — not yet held: …]` suffix, and a closing line reads "+ N recipes not yet discovered — …". Field recipes are filtered the same way. A research block follows: free/bought searches, inks held, and the `research`/`buy-research` JSON. `research` takes free text, so it never appears in LEGAL ACTIONS; `buy-research` does.
