# Stone-Age Bootstrap — craft your own starters (design)

**Date:** 2026-07-14
**Beads:** `idle-adventure-9az` (sword dedup), `idle-adventure-xls` (tier-0 tools earn their keep)
**Status:** DRAFT — written autonomously overnight per user's "do as much as you can" authorization (2026-07-14). **Awaiting user review before implementation.** Every "near-thing" call below is flagged; the user asked to best-effort these and confirm in the morning.

## Intent

Today a fresh game *hands* you your entire starter kit: `pick`, `axe`, `knife`, `sword`, plus food. The user wants the opposite — **you arrive with (almost) nothing and craft your own starting gear**, giving the loop a deliberate stone-age opening. Two user decisions drive this:

- **9az (swords):** replace the starting `sword` with a crude **club** the player makes early *without a tool*.
- **xls (tools):** "you should have to make **all** the starters" — no pre-made `pick`/`axe`/`knife` either.

## The core knot: the bootstrap paradox

Gathering wood requires an `axe` (`NODE_TOOL.wood = "axe"`), but you need materials to craft your first tools — so what can **bare hands** do?

**Resolution (user-chosen):** add a **bare-hands wood source** so the club (which is conceptually wood) has an honest material, and let the existing bare-hands material **`flint`** carry the stone tools. `flint` is already gatherable bare-handed (`NODE_TOOL.herb = null`) in all three biomes and is already framed as the stone-age material (D45: "arrowheads without a pick"; `glassware` is "blown from flint"). So the bootstrap is: **forage flint + deadwood by hand → knap your tools + club → the existing ladder takes over.**

## Design

### 1. New material — `deadwood` (bare-hands wood)

A crude, foraged wood distinct from structural `oak-log`/`pine-log` (which stay `axe`-gated for the real recipes). Added to the **`herb` forage table** (bare hands) in all three biomes at a modest weight.

- **Proposed weights (NEAR-THING — tune in morning):** woodland herb `deadwood: 3`, desert `deadwood: 2`, tundra `deadwood: 2`. Common enough that one forage run reliably yields a few, low enough that it doesn't crowd out herbs/food.
- `deadwood` is a plain material defId (no food energy, no `FRESH_TO_STALE` transform). Registered wherever gatherable materials must appear (catalog invariant + biome table parity tests).
- It is **only** the bootstrap wood — nothing mid/late-game consumes it, so it doesn't inflate the wood economy.

### 2. New weapon — `club` (stone-age entry weapon)

- `WEAPONS.club = { dmgType: "melee", damage: 2, tags: [] }`. **Damage 2** sits below `sword` (3) and above `UNARMED_DAMAGE` (1) — a real weapon, clearly the bottom rung. (NEAR-THING: damage value.)
- New weapon ladder: **club (2) → sword (3) → iron-sword (3, +fae affinity) → silver-sword (3, +werewolf) / steel-sword (4) → mithril-sword (6).**

### 3. Craft-your-starters — new no-tool recipes

The tier-0 tools currently have **no recipe at all** (they only exist in `STARTER_BANK`). Add bare-hands, no-station recipes (`requires` empty → craftable in town with bare hands). All inputs are bare-hands forageable, so the whole kit is bootstrappable from one forage run:

| Recipe | Inputs | Output | Notes |
|---|---|---|---|
| `club`  | `deadwood ×2`            | `club`  | the entry weapon |
| `knife` | `flint ×1`              | `knife` | a knapped flint blade — the archetypal stone tool |
| `axe`   | `flint ×1` + `deadwood ×1` | `axe`   | stone head + wood handle |
| `pick`  | `flint ×1` + `deadwood ×1` | `pick`  | stone head + wood handle |

(Quantities are NEAR-THING — kept small so the bootstrap is ~1 forage run, not a grind.)

### 4. `STARTER_BANK` — food only

Remove `pick`, `axe`, `knife`, `sword`. **Keep** `ration ×5` + `potion ×2` so run 1 isn't a starvation/soft-lock trap. A fresh game therefore starts with food + potions; the arc is:

> **Run 1:** land bare-handed, forage `flint` + `deadwood` (and herbs/food), fight weakly if at all (`UNARMED_DAMAGE = 1` — never a soft-lock), return (free, D62). **Town:** knap `knife`/`axe`/`pick`/`club`. **Run 2:** your first tooled expedition.

- **NEAR-THING:** keeping the current food kit unchanged is the conservative choice (doesn't perturb the food economy). Alternative considered: seed a tiny bit of `flint`/`deadwood` so the player can knap **one** tool *before* run 1 (gentler onboarding). Left at food-only for the cleaner stone-age framing; flag for morning.

### 5. `sword` vs `iron-sword` (9az) — keep both, differentiate by cost

Deleting plain `sword` is **rejected**: it has 63 references across 28 files and is the canonical untagged dmg-3 weapon in the combat test-suite — high-churn, high-regret, and not unambiguously what the user asked. Once `sword` leaves `STARTER_BANK` it would be an orphan (no recipe → a dead item, exactly the `seal-blubber`/7pi bug). So instead:

- **Give `sword` a recipe:** `iron-ore ×2 → sword` (untagged, dmg 3 — the cheap generic metal sword).
- **`iron-sword` stays** `iron-ore ×3 → iron-sword` (dmg 3, **+fae affinity** via the `iron` tag).
- **Clear differentiation:** `sword` is the cheap generic; `iron-sword` pays **+1 ore** for the fae ×2 affinity edge. Both need a `pick` (to mine iron) → both are post-bootstrap. This answers "why two swords" by making the cost/benefit explicit instead of collapsing the catalog.
- **NEAR-THING:** the alternative (delete plain `sword`, club → iron-sword ladder) is cleaner catalog-wise but churns ~28 test files and rebalances combat-test damage baselines. Chose keep+recipe as low-regret. Flag for morning.

### 6. Unchanged

- `UNARMED_DAMAGE = 1` — bare-handed run-1 combat already works (D45: "arrows-out = a club, never a soft-lock").
- Gather gating (`NODE_TOOL`, the T2+ material gates) — untouched. `pick`/`axe`/`knife` remain quality-1/ungated entry tools. `deadwood` rides the existing bare-hands `herb` node. **Orthogonal to the 3du gate refactor.**

## Testing

- **New bootstrap test** (mirrors the 7pi sourced-input lesson): from a fresh `newGame` bank, forage `flint` + `deadwood`, craft `knife`/`axe`/`pick`/`club` end-to-end — assert each is obtainable from real gathers, not bank-injected.
- **Content-invariant:** `club` + `deadwood` are sourced; every new recipe input is sourced (aligns with bead `idle-adventure-7dt`).
- **Regression:** `STARTER_BANK` change — the harness playthrough tests (`harness-sustainability`, `harness-loop`) pack a knife only `if qty > 0` and forage herbs bare-handed, so they degrade gracefully; re-run and confirm the sustainability asserts still hold (herb forage nets positive). Update `town.test.ts` "functional starter bank" if it names the removed tools.
- Gates: `bun test` + `bun run typecheck` + `bun run lint` green.

## Levers touched (all in `src/data/`)

`STARTER_BANK` (remove tools), `WEAPONS` (+`club`), `RECIPE` (+`club`/`knife`/`axe`/`pick`/`sword`), biome `herb` tables (+`deadwood`), material catalog (+`deadwood`). Every lever change lands with a `decisions.md` D-row + `balance-levers.md` update per project convention.

## Open questions for morning (near-thing calls made autonomously)

1. **Club damage = 2** (between unarmed 1 and sword 3) — good?
2. **Keep plain `sword`** + give it `iron-ore ×2` recipe (vs delete it)? — chose keep (low-regret).
3. **`STARTER_BANK` keeps `ration ×5` + `potion ×2`** (vs a leaner kit, or seeding a little flint/deadwood to knap one tool pre-run-1)?
4. **`deadwood` forage weights** (~3 woodland / ~2 desert-tundra) and **recipe quantities** (club = deadwood ×2, tools = 1–2 mats)?
5. **Run-1 feel:** is a forage-then-knap first run the intended stone-age opening, or should the player start able to make one tool immediately?
