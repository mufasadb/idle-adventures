# Ranged combat — bow + ammo, the first breadth style (si7.6 increment 1)

**Date:** 2026-07-07 · **Parent epic:** idle-adventure-si7.6 (horizontal breadth) · **Attacks:** si7.3/G2 (strategy on-rails) + 2g7.3/F3 (grind-to-win) · **Status:** user-approved in brainstorm (2026-07-07)

## Why

Both playtests found the same disease at two levels: the tiered-tool gate forces ONE craft order (G2), and the mindless mining→melee treadmill wins without thought (F3). The agreed first increment: one alternative combat style whose **acquisition path never runs through the pick ladder**, so there are two genuinely different ways to get strong. Farm-decay (the incentive-level fix) is deliberately a SEPARATE follow-up increment.

Bow already exists as a stat row (`WEAPONS.bow`, dmgType ranged) — but a stat row is not a style. This spec gives ranged its own action economy: ammo that costs slots, an opener advantage for engaging at range, and a pick-free resource line to acquire it all.

## User decisions captured (2026-07-07 brainstorm)

- Trees of varied density, "steal trees from Australia" — wood density is the bow-quality axis; stringybark is the string source.
- Arrows from three pick-free inputs: tree limbs + flint ("or something, for flint") + feathers (birds) — "given it's three different things to grab it should give you quite a lot of them."
- Ammo you have to manage.
- Engage from a tile away with "some brief period where you don't take damage" — since combat is rounds of exchanges (si7.1), **"just skip the first one"** (the monster's first retaliation). Evasion math deferred.
- Later (out of scope now): monsters get range/melee types too.
- Arrows-out behaviour: **bow fights on, weakly** (a club) — never soft-locks; ammo is a pack-time judgment.

## Design

### A. The pick-free resource line

New materials (all `{defId, qty}`, no instance state):

- **`stringybark`** — T1 wood-node material (axe, starter kit). Weights: woodland `wood` table gets `stringybark: 3` (rebalance existing weights down proportionally, keep totals sane); tundra `wood` gets `stringybark: 1`. Bark strips twist into bowstring.
- **`flint`** — T1 bare-hands material in **herb** node tables (foraged from creek beds/scree — the "doesn't require picks" head material). Weights: desert `herb` +3 (flint country), woodland +2, tundra +1.
- **`feather`** — T1 material in **animal** node tables (knife, starter kit). All three biomes +2 weight.

New recipes:

- `bowstring ← stringybark ×2`
- `bow ← oak-log ×2 + bowstring` (**reworks** the existing `oak-log×2 + deer-hide` recipe — string replaces hide; still fully pick-free with the starter axe)
- `composite-bow ← ironwood-log ×2 + bowstring` (reworks likewise; ironwood is T2/iron-axe, so the TOP bow crosses into the mining path but the style never requires it — flagged and accepted)
- **`arrows ×ARROWS_PER_CRAFT ← pine-log ×1 + flint ×1 + feather ×1`** — three cheap inputs, generous batch.

No renames of existing logs (oak/pine/ironwood/cactus are load-bearing in recipes + snapshots). Australian flavour arrives via stringybark now; more species (mulga, river red gum) can join later increments if wood wants more rungs.

### B. Ranged engagement (rides on si7.1)

- **Engage at range:** `fight` gains an optional target — `{ type: "fight"; at?: {x,y} }`. With a bow wielded AND ≥1 arrow held, `at` may be an ADJACENT (8-neighbour) live monster tile: engages it without stepping in. Without `at`, `fight` behaves exactly as today (own tile / run an exchange). Rejections: no bow or no arrows → `missing-tool`; non-adjacent or no monster → `no-monster`.
- **`Engagement.ranged?: boolean`** (optional, absent = false) + **`Engagement.opener?: boolean`** — set on ranged engage; the FIRST exchange of a ranged engagement skips the monster's retaliation (dmgTaken 0), then `opener` clears. One rule, no evasion model.
- **Arrow spend:** every exchange while wielding a bow with ammo spends 1 arrow (front stack). This applies to walk-in/stand fights with a bow too — the bow always shoots if it can.
- **Arrows out:** bow deals `UNARMED_DAMAGE` (existing lever — a club). No new lever unless playtest wants one.
- **Win at range:** tile clears, loot rolls as normal, you do NOT relocate (`moveOnWin` false for ranged engagements — you never stepped in).
- **Flee/quaff/auto-quaff:** unchanged (you're adjacent; the parting hit stands).

### C. Ammo economy

- `Loadout.ammo?: ItemStack[]` (optional, `?? []`) + LoadoutSlot `"ammo"`. Packed at town like potions; validated against bank; unspent arrows bank back at run end (existing endExpedition path).
- **Slot cost = stacks, not units:** arrows stack to **`ARROW_STACK_CAP`** per slot via `stackCapOf` (the hook from D44) — `consumableSlots` counts ammo as `ceil(units / ARROW_STACK_CAP)`. A slot of arrows ≈ 20 shots: real slot cost, light bookkeeping.
- Levers: `ARROW_STACK_CAP = 20`, `ARROWS_PER_CRAFT = 10`. Both documented in balance-levers.md + a decisions.md D-row.

### D. Surfaces

- **Events:** `engaged` gains optional `ranged?: boolean`; `exchanged` gains optional `arrowSpent?: boolean` (web/console can show quiver count instead). New rejection reasons only if the existing set can't express a case (prefer reuse: `missing-tool`, `no-monster`, `insufficient`).
- **legal.ts:** candidates add `fight at` for each adjacent live monster tile (reduce filters bow/ammo per D29).
- **Web:** clicking an adjacent monster offers "Shoot" alongside walk-in fight; ammo count in the bag panel; fmt() lines for ranged engage/opener.
- **Console (playtest.ts):** append-only — arrows in the equipped line, a shoot hint on adjacent monsters, legal-action JSON picks `fight at` up automatically.
- **Balance:** combat-affecting (new opener rule) — run `bun run sim:tables` and commit the table diff if the staleness gate reds. The existing pinned gates (Wyrm 3-potion, toll bands) must stay green UNEDITED — melee math is untouched, so any red means the implementation leaked.

### Strategy result (why this earns its complexity)

Two power paths that don't share a gate: mining→melee tiers (pick ladder) vs forestry→bow+ammo (axe/knife/hands). Ammo-vs-food-vs-loot slot tension. Don/doff (D44) makes sword+spare-bow a real mid-run kit choice. The opener gives ranged a mechanical identity — first-strike safety — that a stat row never had.

## Out of scope (explicit)

- Monster range/melee types denying the opener (user's "later").
- Farm-decay / repeat-farm nerf — the next increment, separate spec.
- Magic, followers, taming, artificer, pre-scout (si7.6 later systems; 90j/54f already filed).
- Wood-species expansion beyond stringybark.

## Testing

New `test/ranged.test.ts`: ranged engage from each adjacency direction; opener skips exactly one retaliation; arrow spend per exchange incl. FIFO stack; arrows-out club damage; no-bow/no-ammo rejections; no relocation on ranged win; ammo slot math (`ceil(units/ARROW_STACK_CAP)`); pack/bank round-trip; legalActions surfaces `fight at` candidates. Craft tests for bowstring/arrows/reworked bow recipes (existing bow-recipe tests will need the input swap — premise change, cite this spec). Harness invariants: `test/harness-sustainability.test.ts` and pinned combat gates run UNEDITED.
