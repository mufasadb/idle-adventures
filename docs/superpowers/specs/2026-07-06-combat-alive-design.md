# Combat Alive — stakes, percentage mitigation, variety, agency (si7.1 design)

**Date:** 2026-07-06 · **Bead:** `idle-adventure-si7.1` (G1; absorbs `2g7.6` agency + the manual-potion half of `82r`) · **Status:** approved (brainstorm 2026-07-06)

## Problem

Combat is dormant at both ends of the curve (playtest v2 G1 + M7 feel assessment F1):

- **Early:** a bare starter kit beats every reachable tier-1 monster for ~2 HP out of 30. The matchup matrix, affinities, and armour choices produce no experienced difference — players learn the whole gathering game and none of the fighting game.
- **Late:** mitigation is flat subtraction (`dmgIn = monsterDmg − Σ(defense ÷ matrix)`), so full plate (Σ9+) floors the entire bestiary to `CHIP_DAMAGE_MIN`. Once geared, combat collapses again.
- **Always:** fights are atomic (`resolveCombat` runs the whole exchange loop in one action) — no mid-fight decisions, no flee, no manual potion (2g7.6).

## Approved decisions

1. **Early-fight feel = meaningful toll** (option A): tier-1 fights are always winnable but cost real HP, scaled by matchup quality. HP becomes a second run-budget alongside energy. Death stays rare; attrition teaches.
2. **Percentage mitigation folded into this pass** — armour reduces damage by a ratio that never reaches zero; one coupled tuning pass instead of two.
3. **Variety is data-only**: new tier-1/2 monsters + weighted spawn tables. No new combat mechanics for variety's sake.
4. **Agency folded in** (absorbs 2g7.6): multi-round engagements with `fight` / `quaff` / `flee` decisions.
5. **82r split**: manual potion lands here as `quaff`; don/doff gear stays in `82r` (bumped to P2, scheduled after this pass — it needs carried-spare-gear mechanics that don't exist yet).

## §1 Percentage mitigation

Keep the per-piece matrix-adjusted defense sum exactly as today — `D = Σ(defense ÷ DMG_ARMOUR_MATRIX[dmgType][pieceArmourType])` — so plate still shines vs ranged and folds vs magic. Apply it as a ratio instead of a subtraction:

```
dmgIn = max(CHIP_DAMAGE_MIN, monsterDmg × MITIGATION_K / (MITIGATION_K + D))
```

New lever `MITIGATION_K` (feel-pass ~6, sim-tuned): bare kit takes full damage; full iron plate (Σ6) lands ≈ −55% vs neutral incoming and ≈ −67% vs its favoured type; even mithril (Σ15) caps around −70%, never chip-locks. Battle-item `mitigationAdd` folds into `D` (a warding-draught is temporary armour), keeping the bzd items meaningful under the new model.

## §2 Curves & toll targets

`MONSTER_TIER_DMG_CURVE` steepens at the bottom (direction: 2/5/11/20 → ~4/8/14/22); `MONSTER_TIER_HP_CURVE` adjusted so rounds-to-kill stays 2–5 at-tier. **Exact numbers are derived against the sim harness at plan time** (the D34 method — the spec pins targets, not constants):

- Neutral tier-1 fight, bare kit: **~15–25% of `PLAYER_BASE_HP`**.
- Good matchup (right weapon type, right armour class): **~5%**.
- Bad matchup: **~40%** — survivable, memorable, teachable.
- Full top-tier armour reduces the at-tier toll **~60–70%**, never to chip.

**Pinned invariants (must hold, verified by test):**
- The Wyrm **kill** gate: full mithril + mithril-sword + ≥3 greater-potions wins; 2 potions dies (D34 recalibrated under the new model, same feel).
- The sustainability harness's route-around-monsters forager stays viable un-edited.
- `wyrmfang` (×2 dragon affinity) still turns the Wyrm farmable after the first kill.

## §3 Roster & weighted spawns

- `BIOMES[*].creatureTable` changes shape: `string[]` (uniform pick) → `Record<string, number>` (weighted, same shape and pick path as `materialTable` entries). Tier-1/2 dominate; tier-3 uncommon; the tundra Wyrm drops from 1-in-5 to properly rare (~1-in-20, lever-tunable).
- 1–2 new tier-1/2 monsters per biome (data-only) so every biome's *reachable* band covers melee/ranged/magic incoming AND plate/light/robe hides. Candidates (final at plan time): woodland armoured tier-1 (plate hide — e.g. shell-beetle), desert magic tier-1 (robe — e.g. mirage-wisp), tundra melee tier-1 plate (e.g. ice-crab). Each new part feeds an existing recipe output (peu rule: routing around a fight always forfeits something).
- Perception already reveals monster dmg/armour type within `DETAIL_RADIUS` — no perception changes needed; the info loop exists, the stakes now make it worth reading.

## §4 Engagement model (the agency core)

Combat stops being atomic. Walking into (or using `fight` on) a live monster tile **starts an engagement**: `expedition.combat = { at: {x,y}, creature, monsterHp }` (absent = not engaged; optional-field guards like `autoEat`).

While engaged, legal actions narrow to:
- **`fight`** — one full exchange: player strike (existing `playerDamage`, affinity included), then monster retaliation if alive (new `dmgIn` from §1). Auto-quaff at `AUTO_POTION_THRESHOLD` runs inside the exchange when `autoQuaff` is on (new expedition toggle, default `true`, mirroring `autoEat`).
- **`quaff`** — drink one potion now, no exchange (front-of-stack order, same as today's queue). Rejects at full HP or no potions.
- **`flee`** — disengage: take one parting hit (`dmgIn`, evaluated before disengage; can soft-fail if it kills you — fleeing at 1 HP from a live monster is a real gamble), clear `expedition.combat`, player stays on their pre-engagement tile. The monster resets to full HP and keeps blocking — no wounded-monster bookkeeping.
- **`toggle-auto-quaff`** — mirrors `toggle-auto-eat`.

Non-combat actions (`move`, `gather`, `eat`, `return`, `drop`, …) reject with a new `engaged` reason while `expedition.combat` is set. Victory (monster HP ≤ 0 on your strike) lands exactly where it does today: loot roll, map drops, `cleared` push, `moveOnWin` relocation. Defeat (your HP hits 0) soft-fails through `endExpedition` unchanged.

Determinism holds — zero RNG in fight math — so `legalActions`/D29 speculative reduce keeps working, and the **forecast is computable**: your dmgOut, its dmgIn, rounds-to-kill vs rounds-to-die, shown to the player pre-engagement and per-round. The spyglass contract evolves from "precomputes the outcome" to "shows you the math; you make the call."

`resolveCombat` decomposes: a pure `strikeExchange(loadout, hp, monsterHp, creature)` (one round) that both the reducer (per `fight` action) and any remaining atomic callers (tests, sim forecasts) compose. The battle-item consume-at-start rule (bzd) now triggers on **engagement start**.

## §5 Surfaces

- **Engine:** `combat.ts` (mitigation formula, `strikeExchange` decomposition), `reduce.ts` (engagement state, four action cases, `engaged` rejections), `types.ts` (Action variants, `Expedition.combat`/`autoQuaff`, new events `engaged`/`fled`/`quaffed`/round-result).
- **Data:** `constants.ts` — `MITIGATION_K`, curve retunes, weighted `creatureTable` shape, new monsters + parts + recipes, Wyrm weight.
- **Web:** engagement panel (monster HP bar, per-round forecast, Fight/Flee/Potion buttons, auto-quaff toggle); walk-into-monster flow shows the forecast before committing.
- **Playtest console:** engagement rendering + driver round-loop.
- **Docs:** decisions.md D-row; balance-levers.md (mitigation model, curves, weighted tables).

## §6 Verification

- Toll-target sim test (new): across the roster, bare-kit tier-1 tolls land in the §2 bands; full-armour reduction lands in 60–70%.
- Wyrm gate invariant test recalibrated and pinned (3-potion win / 2-potion death).
- Engagement lifecycle tests: engage→fight→victory; engage→flee (parting hit, monster reset, tile still blocked); flee-at-low-HP soft-fail; quaff mid-fight; `engaged` rejections; auto-quaff toggle.
- Harnesses: sustainability green un-edited; loop/blind-playtest drivers updated for rounds.
- Quality gates: `bun test`, `bun run typecheck`, `bun run lint`.

## §7 Out of scope

- Don/doff gear on-map → `82r` (P2, after this pass; needs carried-spare-gear mechanics).
- Battle-item use mid-fight (they stay engagement-start buffs).
- Monster HP persistence across disengagement.
- Any new combat RNG; any perception changes.

## Bead structure

Three children under `si7.1` (mirrors the e3j split): **.a** mitigation + curves + roster (atomic resolver intact, sim-tuned numbers), **.b** engagement model + actions + UI, **.c** tuning & gate re-verification (toll bands, Wyrm invariant, harness/driver updates). `.b` depends on `.a`; `.c` on both.
