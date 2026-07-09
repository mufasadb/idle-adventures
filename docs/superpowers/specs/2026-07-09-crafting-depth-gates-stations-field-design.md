# Crafting Depth — Recipe Gates, Stations & Field Crafting (Design)

**Date:** 2026-07-09 · **Status:** design-of-record, pre-implementation · **Epic:** (new) Crafting depth
**Related:** si7.6 (breadth roadmap), si7.3/G2 (strategy on-rails), 57l (bow payoff invisible), m7 F1/F2 (plate walls / carry squeeze soft)

## 1. Why this exists

G2 said strategy is on-rails: a single dominant craft order, thoughtless. The long answer (si7.6) is **breadth** — more ways to solve a map, each with real tradeoffs. This spec adds the **connective tissue** that all future verticals hang off: an axis of *where* you can craft and *what infrastructure must be present*. Today crafting is a single undifferentiated pool — `craftAction` hard-rejects unless `phase === "town"`, and recipes are bare `inputs → output` with no gate beyond owning the mats. That flatness is why crafting has no texture and why "field vs home" doesn't exist.

The fix is **two gates on a recipe** plus **field crafting**. Once those land, verticals (alchemy, fishing, smithing, artificer…) all express themselves as *content* through the same grammar, and the field-vs-home split falls out for free rather than being bolted on per system.

## 2. The two-gate model

A recipe can require, in addition to its `inputs`:

- **Tools** — owned/craftable items. The **tree-intertwiner**, and inherently **cross-phase**: the same item can gate a *recipe* (town or field) and/or modify a *gather yield* (in expedition). Tools already exist (`TOOL_CAPABILITY`/`toolQualityFor`); a gate is just a presence check. Examples: *blacksmith's hammer* → gate for plate; *fletcher's knife* → +arrow shafts from wood **and** prerequisite for fletching; *rod* → field fishing; *glassware* → field alchemy.
- **Stations** — **non-bank, permanent, home-side** infrastructure (anvil, alchemical desk, smokehouse). They gate the **deep home recipes**, keep big permanent objects out of bank clutter, and later give the UI a way to **group crafts** (less noise). A station is a property of the base, not a stack you carry — so by definition it can never be satisfied in the field, which is exactly what keeps the hard recipes home-bound.

> **Naming note (user):** "station" is right *only* as "a category of thing that doesn't live in the bank." The gate that says "you need a specific item present" is usually a **tool**, not a station. Rod = tool. Hammer = tool. Anvil/desk/smokehouse = stations.

**The field-vs-home split is emergent, not a separate mode.** A recipe with a `station` requirement is home-only (stations don't travel). A recipe flagged `field` checks the *carried/equipped* tools and consumes from the *expedition* inventory. Nobody implements "field mode" — it's just "which gate can you satisfy, where."

## 3. Field crafting

- A recipe opts in with `field: true`. Default (absent) = **town-only**, preserving every current recipe's behavior byte-for-byte.
- Field craft is legal in `phase === "expedition"`: it checks `requires.tools` against **equipped/carried** items (`loadout.equipment.tools` + carry), consumes `inputs` from the **expedition inventory** (loadout food + carry materials), and deposits output into carry/food (slot fit-checked like a gather).
- A field recipe **must not** carry a `station` requirement (stations are uncarriable — enforced by a test).
- **Fire-kit = a carried kit-tool, fuel = a normal input.** No separate "lit campfire" state machine for the MVP: a field recipe lists the **`fire-kit`** tool (flint-and-steel style; nice tie-in — craftable from the existing `flint` forage + iron) in `requires.tools` and a fuel item (e.g. `{oak-log: 1}`) among its `inputs`. The deliberate-stop feel comes from spending real wood + the craft action. (A richer "light a persistent fire at a tile that also enables rest/multi-cook" is a **future** enhancement, explicitly out of scope here.)

## 4. Data-model & engine changes (concrete tech)

All engine-pure, all levers/catalog in `src/data/constants.ts`.

### 4.1 Recipe gate (foundational — blocks everything else)
- `src/data/constants.ts`: extend the `RECIPE` value type to
  `{ inputs; output; requires?: { station?: StationId; tools?: string[] }; field?: boolean }`.
- `src/engine/craft.ts` `craft()`: new signature takes the caller's **available tools** (a `string[]` of defIds) and **available stations** (so it stays pure — no phase logic inside; the *caller* decides which pool "available tools" means). Order of checks → reasons:
  1. `no-recipe` (unchanged)
  2. `missing-station` (new) — `requires.station` not in available stations
  3. `missing-tool` (reuse the existing gather reason) — a `requires.tools` defId not present in available tools
  4. `insufficient-materials` (unchanged)
- **Tool-presence pool is phase-dependent** (user decision): a `requires.tools` entry is satisfied if the tool is present in the phase-appropriate pool.
  - **Town craft:** the tool may be in **either the bank or the loadout** — it doesn't matter (you're home; everything's reachable). Pool = `bank defIds ∪ loadout.equipment.tools`.
  - **Field craft:** the tool **must be carried** — pool = `loadout.equipment.tools ∪ carry` only (the bank isn't reachable in the field).
- Tools are recognized via the existing **`TOOL_CAPABILITY`** map (user decision: *reuse it*, no dedicated crafting-tool list) — a gating/crafting tool gets a `TOOL_CAPABILITY` entry (a no-op capability is fine when `NODE_TOOL` never asks for it, exactly like `spyglass`/`tent`/`canteen` already do). That gives it `slotOf → "tool"` so it can be packed and carried into the field.
- `src/engine/reduce.ts` `craftAction`: build the town pool (`bank ∪ equipped`) + `state.stations`, pass to `craft()`.
- `src/engine/types.ts` `RejectionReason`: add `"missing-station"` (closed union — compile-forces handling).
- **Tests:** `craft.test.ts` — gate rejection per reason; a gated recipe still crafts when gates met; ungated recipes unchanged (existing snapshots must not move).

### 4.2 Stations category (non-bank state)
- `src/engine/types.ts`: `GameState.stations?: StationId[]` (optional/absent = `[]`, read `?? []` per the codebase's old-save convention). `StationId` = a string-literal union in constants.
- Station-building recipe: a recipe with `buildsStation?: StationId`. In `craftAction`, when a crafted recipe has `buildsStation`, route the "output" into `state.stations` (idempotent — no duplicates) **instead of** the bank. Consumes inputs normally (e.g. `steel ×N → anvil`).
- Station-built recipes are town-only by construction (`requires.station` can't be met in field).
- **Tests:** building a station adds it once; a station-gated recipe rejects `missing-station` before build and succeeds after; stations never enter carry/loadout math (assert `usedSlots`/`carryCap` untouched).

### 4.3 Tools as recipe-gates + recipe-output yield-mods
- **Recipe-gate:** covered by 4.1 (presence check).
- **Yield-mod is on a *craft*, not on gathering** (user decision). The intertwine is a **recipe** that turns raw material into a processed one, and the *tool's quality scales the output count*. Seed: a `arrow-shaft` recipe — `{ oak-log: 1 } → arrow-shaft`, `requires.tools: ["fletcher's-knife"]`; the number of shafts produced scales with the knife's `TOOL_QUALITY` (a better knife = more shafts per log). This laces the wood/smithing tree into the bow line and repays 57l (bow payoff invisible) with a *visible* tool payoff.
  - Mechanism: extend `RECIPE` output to allow a **tool-quality-scaled quantity**: `output` may carry `qtyPerToolQuality?: number` (or a small `outputScale` block) resolved in `craft()` from the best available tool for the gating capability via `toolQualityFor`. Absent = fixed qty (every existing recipe unchanged). Keep it data-driven; no magic numbers in the reducer.
- Tool catalog: gating/mod tools get a `TOOL_CAPABILITY` entry (§4.1) so they slot as `"tool"` and can be carried. `fletcher's-knife`, `rod`, `glassware`, `fire-kit` are all carriable tools; `blacksmith's-hammer` is one too (it just never needs to leave town — but reusing `TOOL_CAPABILITY` keeps one code path).
- **Tests:** the shaft recipe rejects `missing-tool` without the knife; output qty scales with knife quality; every existing recipe's output qty is unchanged (snapshots must not move).

### 4.4 Field crafting
- `src/engine/types.ts` `Action`: reuse the existing `{ type: "craft"; recipeId }` — no new action. `reduce.ts` routes `craft` to town vs field by `state.phase`.
- New `fieldCraftAction(state, recipeId)` in `reduce.ts` (phase === "expedition"): reject `not-field-craftable` (new reason) if `!recipe.field`; check `requires.tools` against equipped+carry; consume inputs from expedition inventory; deposit output to carry/food with slot fit-check (reuse `addToCarry`/food-front logic). Rejections reuse `missing-tool`, `insufficient-materials`, `carry-full`.
- `src/sim/legal.ts`: field-craft candidates surface automatically via speculative reduce (D29) — no bespoke legality.
- `GameEvent`: reuse `{ type: "crafted"; recipeId; output }`; the web `fmt()` already handles it. If field crafts need a distinct log line, add `where?: "field" | "town"` to the event (keeps the exhaustive switch honest).
- **Tests:** field-only recipe rejects in town-craft path and vice-versa; a `field:true` recipe with a `station` requirement is a catalog error (constants.test); end-to-end: equip campfire+glassware, carry herb, field-craft a draught, confirm carry/energy deltas.

## 5. Exemplar content — the proof slice

Content that exercises all four mechanics through the **real player surface** so the blind-playtest harness can feel it. Sequenced safe-core-first.

### 5.1 Spine: the food / cooking loop (touches the core energy economy, dodges every balance landmine)
- **Field cooking** (field crafting): `fire-kit` (tool) + raw meat/forage + `{oak-log:1}` fuel → a **cooked food** with higher `restore` than the raw input. Turns fresh forage into denser stamina *mid-run* — the most natural field craft, and it lands squarely on the energy loop. Reuses `FOOD` catalog + `eatToRefill` (food.ts).
- **Smokehouse** (station): gate the **already-existing `smoked-venison` recipe** behind `requires.station: "smokehouse"`. Near-zero new content — gives an orphan recipe a home and proves the station gate.
- **Cooking pot** (tool-gate): a `stew` recipe gated by a `cooking-pot` tool (multi-ingredient dense food), field- or town-craftable.

### 5.2 Probe: fletcher's knife → arrow-shaft recipe (cross-tree yield-mod)
- `arrow-shaft` recipe (`oak-log → arrow-shaft`, `requires.tools: ["fletcher's-knife"]`, output scales with knife quality — §4.3). In the proof slice because it exercises the tool-gate + recipe-output-scaling path *and* repays a known wound (57l).

### 5.3 Fuller alchemy thread (field-vs-home in one vertical)
- `glassware` (tool) + `fire-kit` + `{oak-log:1}` fuel + herb + water → **basic healing draught** (a `POTION` consumable, plugs into existing quaff/auto-quaff).
- `alchemical-desk` (station) → **strong potions / antidotes / buffs** that the field kit *can't* make. The cleanest demonstration of the home-deep vs field-slice split.

### 5.4 Follow-on content (captured, built after the core proves out — each rides the same 4 mechanics)
- **Anvil + blacksmith's hammer** → gate an **existing** plate recipe. Adds **no new armour**; it only moves an existing plate craft behind the anvil, so it can't worsen combat balance.
- **Quiver** (station- or anvil-crafted) → dedicated ammo slots — trades generality for ammo capacity.
- **Whetstone / grindstone** → weapon-damage buff (pokes G1 combat inertness; adds a buff-state — larger surface, its own spec).
- **Still / weapon oils** → alchemy→combat coating (intertwine; coating-state surface — its own spec).

These are **content, not m7 fixes**: the plate-walling (F1) and carry-squeeze (F2) problems they once brushed are already tuned out (§5.5). The only obligation is the normal one — the existing test/sim suite must stay green, i.e. don't *regress* the current balance. No re-verification of m7 findings is owned here.

### 5.5 m7 reconciliation (verified 2026-07-09 — resolved, do not re-touch)
The m7 feel-assessment (`docs/m7-feel-assessment.md` §8, bead **868.8**, dated 2026-07-04) predates si7.1/si7.2/D27/D34/tiers. Verified against current code: **F1/F2/F4 are already resolved** — recorded with evidence so future work doesn't re-open correct code:

| Finding | Status | Evidence |
|---|---|---|
| **F1** plate walls combat | ✅ resolved | `damageTaken` = diminishing `curve · K/(K+D)`, `MITIGATION_K=6`; full plate ≈ −50% not chip; `constants.ts:329` says "the M7 F1 collapse dies here"; tier-4 wyrm (magic→plate, D34) punishes plate. |
| **F2** soft carry squeeze | ✅ resolved | `STACK_CAP` 10→5; consumables don't stack (pqp). |
| **F4** iron slow | ✅ resolved | woodland mining `iron-ore:7` (D27). |
| **F3** preview fidelity | ⛔ open → own bead | `PREVIEW_FIDELITY=0`; the one survivor, its own legibility bead. |
| F5/F6 | ⚪ minor | harness artifact / cosmetic. |

**868.8 is closed on this reconciliation** (assessment written, triaged, ITERATE acted on, human verdict via v2/v3). F3/preview is carved into its own open bead so it isn't lost. This epic owns **none** of it — the reconciliation lives in the m7 doc; nothing to re-verify here.

## 6. Parked: the breadth charter (biomes + verticals + obstacles)

The session opened on biomes; captured here so it isn't lost. Gets its **own bead**, built incrementally — nothing below is committed by this spec.

**Composition principle (governing rule):** what appears on a map = **map tier × biome × affix**. Two legs exist (`tierProfile`, cxq affixes); the gap is *content in each slot*, not plumbing. At this stage, breadth-for-its-own-sake is legitimate — the real gap is horizontal thinness.

**10-biome slate.** Cheap reskins (pure `BIOMES` data): Swamp/Marsh (mid; feeds fishing+alchemy), Jungle (venom/antidote → alchemy), Savanna/Steppe (cheap-reach hunting highway), Highlands/Alpine (gentle rung woodland→tundra), Badlands/Mesa (maze-routing), Fungal Forest (spores → alchemy/magic), Blighted Ruins (deep; "of the ancients" home). New-terrain flagships (`TERRAINS` addition + move cost): Volcanic/Ashlands (lava; endgame fuel/weapon), Coastal/Shore (deep-water; fishing home), Crystal Caverns (chasm; deep mining/magic focuses).

**Hook discipline:** most hooks are **data-hooks** (a signature material/creature/economy skew — free, still pure data, e.g. woodland=bow country today); **rule-hooks** (new terrain/behavior) are reserved for a few flagships. Any hook may be **declared-now / built-later** and **tier-gated** — ship the biome as a reskin, name its deep signature, light it up when the tier/vertical lands (exactly how tundra shipped before mithril/wyrm mattered).

**Vertical map (sussed, not specced)** — biome hooks need destinations:

| Problem | Have | Sketched verticals |
|---|---|---|
| Fight | melee, bow | magic, alchemy (thrown potions), artificer (bombs), taming, followers |
| Reach | transport gear | boats/rafts, climbing/verticality (z-levels), magic mobility |
| Gather | pick/axe/knife | fishing, prospecting |
| Sustain/Perceive | food, armour, spyglass, cartography | pre-scouting, healing alchemy |

**Obstacle × vertical is the breadth engine.** Terrain obstacles (ice-slide puzzle, pushable blocks, river currents you wade *or* ride, cliffs/z-levels, lava, deep-water, fog) are interesting precisely because different verticals answer each one differently, with tradeoffs (ice-slide → fire spell *or* gripped boots *or* solve the puzzle). That grid is combinatorial, so hook-space is a multiplication table, not a scarce resource — and it *is* the "pick a style" answer to G2. Kept as a backlog menu we draw from; each obstacle/vertical gets its own brainstorm→spec when pulled.

## 7. Bead breakdown

New epic **Crafting depth — tools-as-gates, stations, field crafting** (own epic; shares the vertical map with si7.6 but is about crafting, not biomes):

1. **Recipe gating core** (§4.1) — `requires` on `RECIPE`, `craft()` gate checks, `missing-station` reason. *Foundational; blocks 2–4.*
2. **Stations category** (§4.2) — `state.stations`, `buildsStation`, town-only gating.
3. **Tools as gates + recipe-output yield-mods** (§4.3) — tool-quality-scaled output (`qtyPerToolQuality`), presence-gate seeds (hammer, fletcher's-knife → arrow-shaft).
4. **Field crafting** (§4.4) — `field:true`, expedition-phase craft path.
5. **Proof slice: food/cooking loop + fletcher probe** (§5.1–5.2) — depends on 1–4.
6. **Content: alchemy thread** (§5.3) — glassware/fire-kit draught + alchemical-desk potions.
7. **Follow-on content** (§5.4) — anvil/plate-gate, quiver, whetstone, still/oils (each its own child; whetstone + still/oils get their own mini-spec before build).

**Created as beads (2026-07-09):** epic `ke3` + children `ke3.1`–`ke3.7`; deps wired so only `ke3.1` is ready.

Separate parked bead (under si7.6): **Breadth charter** (§6) — `si7.6.4`, biome slate + vertical map + obstacle menu as the umbrella map.

**m7-close — DONE (2026-07-09):** F1/F2/F4 verified resolved and recorded in `m7-feel-assessment.md §8`; **F3/preview-fidelity filed as `3iq`** (open); human verdict via v2/v3; **868.8 closed**. Nothing pending here.

**Convention reminders for implementers:** every lever lands with a `decisions.md` D-row (next is **D54**) + `balance-levers.md` update; `GameEvent`/`RejectionReason` are closed unions (typecheck enforces exhaustiveness); optional state fields read with `?? default`; gates surface in `legalActions` for free via speculative reduce (D29); hand `docs/working-on-this-codebase.md` to any subagent. Quality gates: `bun test` + `bun run typecheck` + `bun run lint` green before landing.

## 8. Decisions locked (2026-07-09) + remaining choices

**Locked:**
1. **Fletcher yield-mod** → a **craft** recipe (`oak-log → arrow-shaft`) gated by the fletcher's-knife, with **output scaling on tool quality** — *not* a gather-time drop (§4.3).
2. **Tool gating reuses `TOOL_CAPABILITY`** (no dedicated list). Tool-presence pool is phase-scoped: town = **bank ∪ loadout**; field = **carried only** (§4.1).
3. **`fire-kit`** (renamed from campfire) = carried kit-tool + **fuel-as-input** MVP; persistent lit-fire tile deferred (§3).
4. **m7 is mostly already resolved** — §5.5 documents F1/F2/F4 as *already fixed* (do not re-touch); F3/preview is the one survivor, filed as its own bead (`3iq`) outside this epic; 868.8 closed.

**Locked in pre-handoff review (2026-07-09, second pass — user-answered):**
5. **`requires.tools` = defIds, AND semantics** (capability-gating rejected). Output scaling is a separate `outputScale?: { capability, qtyPer }` block resolved as `qtyPer × max TOOL_QUALITY` over available tools with that capability — gate and scale are decoupled, so the §4.1/§4.3 tension is resolved without capability gates. Known limitation (deliberate): a higher-tier tool alone does not satisfy a base-tool gate; revisit when tiered crafting tools land.
6. **Field crafting costs energy**: new lever `FIELD_CRAFT_ENERGY` (start 10; herb gather = 20). Pay → reject `exhausted` → waste-free auto-eat, same shape as gather.
7. **Re-crafting a built station is rejected** (`already-built`) and must not be presented — legalActions hides it via D29; the web town craftlist (which iterates `RECIPE` keys directly) must hide built-station and `field:true` recipes.
8. **Water**: no free-floating water item. `glass-vial` (material, `{flint:2}→×2`) fills at a **river** tile via a `fill-vial` field recipe gated by a new `requires.terrain` field-position gate (on/adjacent); at home the draught recipe simply omits water (two recipe ids, same potion output).

**Remaining:**
- **Content scope** — confirmed intent is "implement them all" (§5.1–5.4 built incrementally as content children), *not* proof-slice-only. Flag if you'd rather sequence §5.4 strictly after §5.1–5.3 prove out.
