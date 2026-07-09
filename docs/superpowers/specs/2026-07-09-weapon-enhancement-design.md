# Weapon Enhancement — whetstone + oils (coating/buff state) — Design

**Date:** 2026-07-09 · **Status:** design-of-record, pre-implementation
**Epic:** ke3 (crafting depth) · **Supersedes:** ke3.7 thread 3 (whetstone) + thread 4 (still/oils) — merged
**Related:** G1 (combat inertness), D50 (deliberate battle-item use — the interaction model this mirrors), si7.6.6 (blowgun-poison — reuses the poison state defined here)

## 1. Why this exists

G1 says combat is inert: once geared, fights are on-rails — you swing until it dies, the only lever is your printed weapon/armour numbers. The crafting-depth epic's last two follow-ons (ke3.7 threads 3+4) both poke this: a **whetstone** that buffs weapon damage, and **weapon oils** that coat your blade for a combat effect. They are the *same shape* — a temporary, charge-based weapon enhancement you apply mid-run, consumed by your strikes, with **no per-instance item state** — so this spec merges them into one system rather than building two overlapping ones.

The decision it adds: **which fight is worth the charges?** You craft enhancements at home, carry them, and apply them in the field — "sharpen for the goblin swarm, save the drake-oil for the Wyrm." That is exactly the deliberate-use tension D50 gave battle-items, now on the *offensive* side of combat.

## 2. The model (one state field, one data table, one action)

### 2.1 State — `Expedition.weaponBuff`
- `src/engine/types.ts`: `Expedition.weaponBuff?: { id: string; charges: number }`. Optional/absent = no enhancement (read with `?? undefined`; every existing state/save works untouched). It rides the **expedition**, not the weapon — honouring the no-per-instance-item-state rule. Applying a new enhancement **replaces** the current one (you can't stack a whetstone and an oil; that's the tradeoff).
- `src/engine/types.ts`: `Engagement.poison?: { dmg: number; rounds: number }`. Optional/absent = not poisoned. Set when a poison-coated strike lands; ticks down each round. **Independent of `charges`** — poison already delivered keeps ticking even after the coating wears off or you flee. This is the state si7.6.6's blowdart reuses.

### 2.2 Data — `WEAPON_ENHANCEMENT` (new lever/catalog, `src/data/constants.ts`)
`Record<string, { charges: number; flatDamage?: number; affinityTag?: string; poison?: { dmg: number; rounds: number } }>`
- `charges` — how many of **your** strikes the enhancement survives before clearing.
- `flatDamage?` — +N added to `playerDamage` per strike (the **whetstone** flavour).
- `affinityTag?` — if the engaged monster carries this tag, your damage is ×`AFFINITY_MULTIPLIER`, via the **existing** affinity path (the **oil** flavour: silver-oil→"werewolf", drake-oil→"dragon"). Binary, not stacking: if your weapon already has a matching tag, the coating doesn't double it (affinity is matched-or-not).
- `poison?` — on a coated hit, set/refresh `Engagement.poison` to this `{dmg, rounds}` (the **venom-oil** flavour). A DoT the monster suffers each round regardless of your swings.

An enhancement item is also a real carriable material (its `id` is a defId in a catalog list — see §5) so it packs and travels like a battle-item.

### 2.3 Apply — new Action `{ type: "enhance"; id }`
- `src/engine/types.ts`: add to `Action`; `LoadoutSlot` gains `"enhancement"` (packs like a battle-item — 1 slot/unit, no stacking); `slotOf` returns `"enhancement"` for `WEAPON_ENHANCEMENT` keys.
- `reduce.ts` `enhance(state, id)`: expedition-phase; usable **engaged or unengaged** (mirrors `use-item`/`quaff`), runs **no exchange**, costs **no energy** (it's prep, not a turn). Rejections (reuse existing reasons): `not-on-expedition`, `wrong-slot` (`slotOf(id) !== "enhancement"`), `insufficient` (not a held stack). On success: decrement one unit from the held enhancement stack, set `Expedition.weaponBuff = { id, charges: WEAPON_ENHANCEMENT[id].charges }`, emit `{ type: "enhanced"; id; charges }` (new `GameEvent`; web+console `fmt`/`fmtEvent` lines — the exhaustive switch forces both). Applying over an existing buff replaces it (the discarded charges are lost — a real "don't waste it" cost).
- `sim/legal.ts`: `expeditionActions` emits one `enhance` candidate per held enhancement stack (reduce filters, D29).

## 3. Combat integration (BOTH paths — atomic + interactive)

The reducer's per-exchange fight path (si7.1) and the atomic `resolveCombat` (sim/harness API) must produce identical math — the balance harness depends on it.

- **`playerDamage(loadout, creature, weaponBuff?)`** grows an optional 3rd param (absent = today's behaviour, all existing callers untouched). When present: add `flatDamage`; include `affinityTag` in the set of tags checked against the creature for the affinity multiplier. Pure; no new magic numbers (reads `AFFINITY_MULTIPLIER`).
- **Charges** decrement by 1 on each of the player's strikes; at 0 the buff clears (`weaponBuff` → undefined). Applies in `strikeExchange`/`resolveCombat` and the interactive `fight` reducer.
- **Poison** — on a coated player hit where `WEAPON_ENHANCEMENT[id].poison` is set, `Engagement.poison = { ...poison }` (refresh on re-hit). Each **round end**, the monster loses `poison.dmg` and `rounds` decrements; at 0, `poison` clears. Poison damage is dealt in the same place HP is applied so it can land the kill. `resolveCombat` loops this per exchange; the interactive `fight` applies one tick per exchange action.
- `explainMatchup`/forecast: the web fight forecast (`playerDamage`/`damageTaken`) passes the active `weaponBuff` so the "you hit N" preview reflects the coating.

**Atomic-parity note:** `resolveCombat` reads `Expedition.weaponBuff` at fight start and models it exactly as the interactive path does strike-by-strike (charges spent oldest-first, poison ticking each round). `combat-toll.test` + the balance harness must pass **un-edited** when no enhancement is present (the optional param defaults to none), and a dedicated test asserts atomic == interactive for a coated fight.

## 4. Levers & balance safety

- All magnitudes are levers in `WEAPON_ENHANCEMENT` (`docs/balance-levers.md` row + a D-row citing this spec).
- **Starting values (feel-pass, tune in playtest):** whetstone `{charges: 6, flatDamage: 2}`; silver-oil `{charges: 5, affinityTag: "werewolf"}`; drake-oil `{charges: 5, affinityTag: "dragon"}`; venom-oil `{charges: 5, poison: {dmg: 3, rounds: 4}}`.
- **No regression:** with no enhancement applied, every combat number is byte-identical (optional params default off) — `gear-tiers`/`combat-toll`/balance harness pass un-edited. Enhancements are purely additive, opt-in offense. Poking G1 (making combat *less* inert) is the intended effect, not a regression; the balance-tables regen will show the new items in the reference block (additive).
- **Affinity double-dip guard:** a coating's `affinityTag` can't push past ×`AFFINITY_MULTIPLIER` when the weapon already matches (asserted).

## 5. Content

- **`still`** — new `StationId` (`"still"`), home station. Recipe `buildsStation: "still"` (e.g. `glass-vial×3 + copper-ore×2` — a copper sink, reuses alchemy glass). Brews the **oils** (`requires: { station: "still" }`, town-only):
  - `silver-oil` ← `silver-ore + forest-herb` (affinity vs werewolf/silver-weak).
  - `drake-oil` ← `drake-hide + fae-dust` (affinity vs dragon — the Wyrm answer without full mithril).
  - `venom-oil` ← `thistle + fae-dust` (poison DoT).
- **`whetstone`** — a flat-damage enhancement, forged at the **anvil** (thread 1 tie-in: sharpening is smith work), `requires: { station: "anvil", tools: ["blacksmiths-hammer"] }`, recipe `flint×2 + iron-ore` (a grindstone block). No new station for the whetstone — reuses the forge.
- Enhancement defIds join a new `ENHANCEMENT: string[]` catalog list (like `BATTLE_ITEM`) so `slotOf`→`"enhancement"` and the "every recipe output is real" invariant recognises them.

## 6. Surfaces

- **Web (`main.ts`):** expedition panel shows the active coating + charges (e.g. "🗡️ drake-oil · 5 left"); an "Apply" control per carried enhancement (engaged panel too, mirroring the `use-item` button); `enhanced` + poison-tick `fmt` lines; the fight forecast reflects the coating. Town craftlist shows the still/whetstone recipes (station-gated, so locked until built — the existing gate rendering handles it).
- **Console (`playtest.ts`):** engaged header lists the active coating + held enhancements + the `enhance` action; `fmtEvent` for `enhanced` and poison ticks; `printExpedition` shows carried enhancements. Append-only (console-parity discipline).

## 7. Blowgun tie-in (si7.6.6 — NOT built here)

This spec defines `Engagement.poison` and the per-round tick. The blowgun/blowdart bead reuses that exact state: a ranged dart applies `{dmg, rounds}` poison, then you kite while it ticks. No coating-charges involved (a dart isn't a weapon coating). Speccing them on one poison surface is deliberate; the blowgun stays its own bead.

## 8. Test plan

- `constants.test`: every `ENHANCEMENT` defId has a `WEAPON_ENHANCEMENT` entry and vice-versa; `slotOf` → `"enhancement"`.
- `craft.test`: still/whetstone recipes gated (station/tool) reject then craft; enhancement outputs recognised by the "every output real" invariant.
- New `enhance.test`: apply sets `weaponBuff`; replace discards old charges; rejects `wrong-slot`/`insufficient`/`not-on-expedition`; works engaged (no exchange).
- New `weapon-enhancement-combat.test`: flatDamage raises `playerDamage`; affinityTag applies the multiplier (and doesn't double when the weapon already matches); poison ticks per round and can land the kill; charges decrement per strike and clear at 0; **atomic `resolveCombat` == interactive** for a coated fight.
- Regression: `combat-toll`, `gear-tiers`, balance harness pass un-edited with no enhancement; regenerate `docs/balance/tables.json` (additive).

## 9. Open/deferred (YAGNI)

- Multiple simultaneous coatings, coating a bow's arrows (vs the blowgun's darts), grindstone-as-its-own-station, oil tiers — all deferred. One buff at a time, field-applied, is the MVP.
