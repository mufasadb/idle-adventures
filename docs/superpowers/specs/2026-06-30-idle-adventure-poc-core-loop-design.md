# Idle Adventure — POC Core Loop Design

**Date:** 2026-06-30
**Status:** Design approved, ready for planning.
**Source notes:** Obsidian vault `Project Ideas/idle adventures/` (start at `Game Vision & Core Loop`, current focus in `POC — Core Loop Scope`).

---

## 1. Purpose

A deliberately stripped vertical slice built to answer **one question**:

> Is choosing a loadout for a given map, then making routing / gather / fight calls to extract **as much value as you can before fatigue forces you home**, fun — enough that you want to craft up and go again?

Fun gates everything else. If this slice is fun, the game is fun. If not, we learn it in days, not months. Everything in §8 is deferred, not cancelled.

**Framing note (xwp, D62).** The puzzle is *value-extraction under a fatigue budget*, not *turn-back timing*. Return is free and instant (anti-stranding — you can always get home), so "when do I turn back?" is a trivial call; the real, live decision is *how deep to push and how much to haul* before the trip home becomes a spent, exhausted slog. A cosmetic beat on return names this: limp home near-empty and the log reads as an exhausting trek; leave with energy and provisions to spare and it reads as boredom or disdain. No mechanic changes — the reframe is language plus flavor.

## 2. The Loop

Read map preview → craft & pack a loadout → expedition (navigate · gather · fight, under budgets) → return with haul → craft upgrades → better loadout → richer / harder maps → repeat.

The POC is a *loop*, not a *run*: the between-run crafting step is in scope precisely so the "one more run" pull can be tested.

## 3. Two Budgets (core tension)

| Budget | Spent on | Refilled by |
|--------|----------|-------------|
| **Energy** | Movement + gathering (shaped by terrain & gear) | Food |
| **HP** | Combat — always drains, even well-geared | Potions |

Refill items compete for the same **carry slots** as outbound loot. Every potion packed is a slot of loot you can't bring home. This is the deliberate adders/subtractors squeeze.

## 4. Items — all crafted

food · potions · weapons (melee / ranged / magic) · armour (plate / light / robe) · pick · backpack · transport/animal · spyglass.

- Crafting is **direct and instant**: `materials → item`. No skill levels, no processing chains, no craft-time for v1. (Those return later with the idle/skill systems that justify them.)
- All gear comes from crafting. No found loot in v1.

## 5. Combat — deterministic

`resolveCombat(loadout, monster, seed) → { hpLost, consumablesUsed, loot }`. No minigame; the decision lives entirely in preparation.

- **Visible type matrix** — damage-type × armour-type, learnable:

  | dmg ↓ / armour → | Plate | Light | Robe |
  |---|---|---|---|
  | Melee | 1.0 | 1.25 | 1.5 |
  | Ranged | 0.5 | 1.0 | 1.5 |
  | Magic | 1.5 | 1.0 | 0.5 |

- **Hidden affinities** — discoverable `(monsterTag, itemTag) → effect` quirks: `werewolf+silver ×2`, `fae+iron ×2`, `vampire+garlic-coated ×2`, `goblin+gold → distracted`. Anti-wiki flavour layer.
- **Spyglass** packs *information*: pre-compute the exact outcome, or gamble on a gut read.
- **Soft fail:** die early → run ends, keep what was already gathered. Hard-counter monsters are a tunable dial, not a fixed rule.

## 6. Map & biomes

- 20×20 grid, rudimentary Perlin terrain (seeded).
- **One biome per map** (D21, 2026-07-02): a biome is a named generation profile — `generateGrid(mapSeed, biomeId)` reads terrain weights, node-type weights, and creature/material tables from `BIOMES[id]`; the engine never consults the biome after generation. Biomes shift likelihoods, not rules — no biome-wide drains or counter-item taxes. Start with 3 biomes (woodland / desert / tundra) as pure data entries; adding one is data-only. See `2026-07-02-biomes-generation-profiles-design.md`.
- Terrain (ice / river / mountain / mud) = energy modifiers or gear-gated tiles. Transport/tool advantages per biome emerge statistically from its terrain/node mix (no transport×biome rules).
- POIs 3–4 tiles apart so routing has real choices.
- Forecasting: the preview headline is the biome name; `PREVIEW_FIDELITY` scales extra hints (see §11).

## 7. Architecture — the one discipline we keep

- Pure **`reduce(state, action, seed)`** engine — no DOM, no leaked randomness (seeded PRNG / Perlin).
- Renderer is a dumb **`render(state)`** — ASCII / rudimentary first, enough to see and test by hand.
- Same engine drives a **headless JSON-action harness** → unit-testable *and* AI-playable with zero UI.
- **No** server, DB, accounts, or monorepo ceremony yet.

## 8. Explicitly out (deferred)

minigames · skills / XP · fast-forward / idle catch-up · map enhancement (runewords) · town · shop / gold economy · real-time ticks.

## 9. Success criteria

The POC succeeds when a person (or the AI harness) can:
1. Generate a seeded 20×20 map and read a rough preview of it.
2. Craft items from materials and assemble a loadout within carry limits.
3. Play a full expedition via discrete actions — move, gather, fight, return — watching Energy and HP deplete.
4. Have a fight resolve deterministically through the type matrix + at least one hidden affinity, with the spyglass changing available information.
5. Return, craft an upgrade from the haul, and visibly improve the next run.
6. Do all of the above headlessly via JSON actions, with the rudimentary renderer as an optional view.

And — the real test — after playing it, we can give an honest read on whether the decisions felt fun.

---

## 10. Engine contract (settled 2026-06-30)

`reduce(state: GameState, action: Action): { state: GameState; events: Event[] }` — pure, seed in state, RNG = `hash(state.seed, context)`. `events` are a render byproduct; the action list lives in the driver.

```ts
type ItemStack = { defId: string; qty: number }       // fungible; gear referenced by defId too (no per-instance state)

type GameState = {
  seed: string
  phase: 'town' | 'expedition'
  bank: ItemStack[]                                    // materials + crafted gear (persists across runs)
  expedition: Expedition | null
}
type Expedition = {
  mapSeed: string
  pos: { x: number; y: number }
  energy: number                                       // from packed food; spent on move/gather
  hp: number                                           // drained by combat, refilled by potions
  loadout: Loadout
  carry: ItemStack[]                                   // capped by backpack slots
  // grid regenerated from mapSeed on demand, not stored
}
type Equipment = {
  weapon: string | null                                // { dmgType: melee|ranged|magic, tags:[silver|...] }
  helmet: string | null; chest: string | null; legs: string | null
  boots: string | null; gloves: string | null         // each: { armourType: plate|light|robe, defense }
  tools: string[]                                      // pick, axe, fishing rod, spyglass — capabilities
  transport: string | null; backpack: string | null
}
type Loadout = { equipment: Equipment; food: ItemStack[]; potions: ItemStack[] }

type Action =
  | { type: 'craft';  recipeId: string }
  | { type: 'pack';   slot: LoadoutSlot; itemId: string }
  | { type: 'embark'; mapSeed: string }
  | { type: 'move';   to: { x: number; y: number } }   // steps ONE tile toward target
  | { type: 'gather' } | { type: 'scout' } | { type: 'fight' }
  | { type: 'drop';   itemId: string } | { type: 'return' }
```

**Action cost is an output of reduction, not uniform:**

| Action | Energy | HP | Shaped by |
|--------|--------|----|-----------|
| `move` | base × terrain ÷ transport | — | terrain, transport, gating gear |
| `gather` | node hardness ÷ tool quality | — | tool in `tools`, node type |
| `scout` | small / 0 | — | requires spyglass tool |
| `fight` | — | `resolveCombat(...)` | matrix + affinity + armour + potions |
| `drop`/`craft`/`pack`/`embark`/`return` | 0 | 0 | town & transitions |

Combat defense aggregates per-piece: `Σ piece.defense × matrix[dmgType][piece.armourType]`.

## 11. Map entry & defaults

- Town offers **3 seeded candidate maps**, each rolling a biome from its seed; the **rough preview** headline is the biome name, with `PREVIEW_FIDELITY`-scaled hints on top (layout hidden). Pick → pack → embark; **full grid on arrival (no fog in v1)**.
- Carry = **slots** (not weight). Combat **resolves fully**, **auto-potions** at a threshold, **static monsters** (avoid = routing). Persistence **in-memory across runs**. A `legalActions(state)` helper feeds both UI and AI.

## 12. Tech & layout

All-TS, **single flat-but-disciplined package** — folders `engine`/`data`/`sim`/`render` mirror future `packages/`; an eslint boundary rule forbids `engine` importing from `render`/`sim`/`web`. **Vite + Vitest**, seeded Perlin, vanilla-TS CSS grid (React deferred). Two drivers over one `reduce`: headless `play(seed, actions[])` and the interactive web view.

## 13. Balance levers

Feel-pass values now; every tunable is a named lever in `src/data/`. See `docs/balance-levers.md`.
