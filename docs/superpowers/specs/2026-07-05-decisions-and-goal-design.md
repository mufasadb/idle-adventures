# Making the Decisions Real — Boss, Rewards & Loadout Tension

**Date:** 2026-07-05
**Status:** Design draft for review.
**Source:** M7 playtest findings (`docs/m7-playtest-findings.md`) + a three-agent design brainstorm (loadout economy / in-map pressure / combat rewards). This is the next milestone after the 2026-07-05 map-rotation + combat-rebalance + monster-blocking pass.

## 1. The problem

A judge-agent playtest of the current build found the combat *climb* now works, but almost every other decision is hollow:

- **Combat has no reward** — 6 of 8 monster drops feed zero recipes, so the rational play is always route *around* monsters, making the new monster-blocking pointless.
- **The loadout is near-dominant** — equipped gear (weapon, armour, tools, transport) costs no carry slots and a 5-ration stack is ~1 nearly-free slot, so "best of everything + max food + 2 potions" is just correct.
- **Food trivializes the map** — one ration stack = 50 energy = ~half a map; a second slot finishes it, so energy is never scarce and "how far / which nodes" isn't a real call.
- **No finish line** — the tier climb is accumulation with nothing to aim at.

## 2. Design goals

**Make every choice a real tradeoff, and give the player a finish line.** Concretely: fighting funds a real reward branch; the loadout forces gathering-vs-fighting-vs-reach competition; the map is richer than one run can harvest; and there's a boss to beat.

## 3. Player-decision constraints (settled with the user)

- **No return-cost.** The budget/planning tension comes from *outbound reach* and planning your route within your energy (the path-preview UI already supports pre-planning distance). Turn-back-early is not the target; smart reach/route planning is.
- **Slot-based carry, not weight.** Keep the RuneScape-style inventory model: **equipped gear is "worn" and free**; a bounded **inventory** (the backpack cap) holds tools, food, potions, combat-consumables, and loot, all competing. Show a **used/total slot counter**. Weight is rejected — too hard for a player to reason about.
- **No safety net, but no roguelike wipe either.** A small **base energy floor** (~5 actions with no food) plus (roadmap) tier-0 food maps make starvation a recoverable-by-effort fail state, not a soft-lock and not a full-progress wipe.
- Pure-engine, lever-driven; items are `{defId, qty}` referencing the code catalog (no per-instance state).

---

## 4. The design

### 4.1 The finish line — the Ancient Wyrm (the boss/goal)

A **tier-4** dragon that is the current "beat this" goal. The twist: it deals **magic** damage into a **plate** hide — so it punishes the plate strategy that carried you all game (plate is weak to magic, ÷1.5 mitigation), and stays a real fight even in full mithril.

| Field | Value |
|---|---|
| `MONSTER_TIER_HP_CURVE[4]` | 48 |
| `MONSTER_TIER_DMG_CURVE[4]` | 20 |
| `MONSTERS["ancient-wyrm"]` | `{ tier: 4, dmgType: "magic", armourType: "plate", tags: ["dragon"] }` |

- **Appears** by adding `"ancient-wyrm"` to `BIOMES.tundra.creatureTable` (uniform creature pick → ~1-in-4 of tundra monster POIs). **No spawn code** — the tier-4 lethality *is* the gate; the under-geared route around it (or scout and learn) until they've climbed.
- **Gate (sim-verified):** winnable only with the full mithril climb (mithril-sword + mithril plate) **and ≥3 greater-potions**; 2 greater-potions is death. The 2→3 breakpoint is the tension. Mixing in enchanted-robe pieces (magic resist) is a smarter answer than pure plate — teaching the capstone lesson.
- **Drops** (needs the `chance` change, §4.5):
  - `wyrm-scale ×3` (always) → **`dragonscale-cuirass`** (plate chest, **defense 5** — best chest in the game).
  - `dragonheart ×1` @ **20% (the 1/5 rare)** → **`wyrmfang`** (melee, damage 8, tag `wyrmbane`).
- **The rare closes the loop:** add affinity `{ monsterTag: "dragon", itemTag: "wyrmbane" }`. The first kill is brutal; once you craft `wyrmfang` (×2 vs dragons) the Wyrm becomes a **farmable node**. At 20%/kill, chasing a second Heart is the post-goal "one more run" hook.

### 4.2 Combat rewards — nearly every fight is worth it

Rule: **T1 drops → consumable fuel, T2 → gear shortcuts, T3 → exclusive combat consumables, boss → capstone.** Monster parts are the *only* source of the combat-optimized branch, so routing around a monster forfeits real power. `LOOT_TABLE` defIds are mostly unchanged — the fix is *what they craft into*.

| Monster | Drop | Crafts into |
|---|---|---|
| forest-boar | `boar-hide ×2` | `ration` (hide=meat) / `starter` backpack (`boar-hide ×2`) |
| sand-raider | `raider-supplies ×1` | `trail-ration` (T2 food) |
| snow-wolf | `wolf-pelt ×2` | already a material (light armour) — unchanged |
| fae-sprite / frost-fae | `fae-dust ×2` | staves — unchanged (fine) |
| werewolf | `werewolf-pelt ×2` | `warg-jerkin` (light chest def 3, no drake needed) |
| giant-scorpion | `scorpion-carapace ×2` | `scorpion-plate-chest` (plate chest def 3 — **no coal**, a combat shortcut to steel-grade plate) |
| dust-vampire | `vampire-ash ×2` | **`elixir-of-power`** (+2 dmg, one fight) |
| ice-troll | `troll-hide ×2` | **`warding-draught`** (+3 mitigation, one fight) / `large-pack` (alt route, `troll-hide ×2 + ironwood-log ×1`) |
| ancient-wyrm | `wyrm-scale ×3` + `dragonheart` @0.2 | capstone (§4.1) |

New catalog entries: `ARMOUR` (`warg-jerkin`, `scorpion-plate-chest`, `dragonscale-cuirass`), `WEAPONS` (`wyrmfang`), `AFFINITIES` (`dragon↔wyrmbane`), plus the recipes above. Almost all **pure data**.

### 4.3 Combat consumables — the "attack potion" branch

A new inventory category (the user's "damage potion" ask), and the piece that ties combat into map decisions.

- New `Loadout.battleItems: ItemStack[]` (parallel to `potions`), consumed at fight start.
- Lever `COMBAT_BUFF: Record<string, { damageAdd?: number; mitigationAdd?: number }>` — `elixir-of-power {damageAdd:2}`, `warding-draught {mitigationAdd:3}`.
- `resolveCombat` applies `damageAdd` to `dmgOut` and `mitigationAdd` to mitigation, decrementing the used stack.
- **Why load-bearing:** these are gated *only* behind fighting T3 monsters. Sim: **steel plate + mithril-sword + elixir + warding-draught + 3 greater-potions beats the Wyrm** — a player who *fought* their way up reaches the finish line without the full mithril grind, while mithril players just win more comfortably (doesn't trivialize the climb). So "do I fight this vampire?" becomes strategic. They consume **inventory slots** (§4.4) — a real adders/subtractors cost.

### 4.4 Carry — slot-based, consumables burn down over the run

Keep worn gear free (RuneScape "equipped" slots); make the **inventory** the scarce, legible resource with a filling used/total counter. The new twist (2026-07-05): **food is eaten as you travel, freeing its slot** — so you start food-heavy and end light, trading supply slots for loot slots *over time* rather than at pack time.

- **Equipped (free):** weapon, 5 armour pieces, transport, backpack (it's the container).
- **Inventory (counts against the cap):**
  - **Consumables are one item = one slot** (they do NOT stack): each ration, each potion, each combat-consumable occupies its own inventory slot. Packing 5 rations = 5 slots. This is what makes food a real, visible early-run commitment.
  - **Tools** each take a slot too — so pick + axe + knife + spyglass can't all come along with a full food supply. A mining run, a hunting run, and a boss run become *different* loadouts.
  - **Loot materials still stack** (`STACK_CAP`) so hauling stays viable.
- **Food is consumed as energy is spent (supersedes D23).** Food is no longer converted to energy wholly at embark; it's carried and **eaten just-in-time** to pay for move/gather. As each food item's energy is used up, its slot frees for loot. Energy-remaining tracks remaining food; **uneaten food banks back on return** (no duplication — it was never pre-converted). This makes the food↔loot squeeze *temporal*: heavy and cramped early, roomy late.
- **Carry sources stack up:** `BASE_CARRY_SLOTS` (bare) + **backpack** (the main tier) + **transport** (a small carry bonus for bringing a beast) + **panniers / "beast pack"** (a saddlebags item that adds more, usable only with a beast). So a mule-with-panniers is a hauler; a horse is fast with a little extra room.
- **UI:**
  - A filling `used / total` inventory grid (extends the existing slot-strip) in town and on the map.
  - **Packing view:** equipping an armour piece shows the **full copy in the equipment space** (its body slot) and a **semi-transparent ghost in the inventory grid** — so you see your whole kit in one place, while the ghost signals it's *worn* and doesn't spend a real inventory slot.
- **Optional companion — armour move-tax (decision for review):** since worn armour is slot-free, "wear your best plate always" still has no cost. An `ARMOUR_MOVE_TAX` (plate +0.5/pc move energy) would make heavy armour cost *reach* instead of slots — the cleanest fight-vs-reach trade, and it respects no-return-cost. Small, modular, but a slightly-hidden cost. **Flagged for the user: include it, or leave armour free and rely on the inventory squeeze + the magic boss?**

### 4.5 In-map pressure — make the map drive the decision

Sim-established: how many nodes you can clear is bound by *energy*, not node count; raising terrain *cost* does nothing (the path-planner routes around it); node density is the clean lever.

- **`POI_DENSITY` 12 → 18.** Maps become richer than one run can harvest (sim: a competent player goes from clearing ~91% with 3 food slots to ~55%), so "which region do I work?" is a real call. One-line, zero food risk.
- **`ENERGY_PER_FOOD` 10 → 8** and `FOOD_ENERGY {ration:8, trail-ration:16}` — one food stack no longer buys half a map, so max-food stops being dominant. **Must re-verify `test/harness-sustainability.test.ts`** (do not drop below 8 without re-running — 7 risks the forage-only tundra path).
- **`BASE_ENERGY_FLOOR = 20`** — `embark` energy = `max(BASE_ENERGY_FLOOR, packedFoodEnergy)`. Delivers the ~5-action floor (the user's dead-loop answer) and keeps the sustainability test green.
- **Deferred to a later pass (Tier 3):** barrier topology (bias prizes behind mountain/river bands so routing is a real path puzzle) + **terrain-gating gear** (`climbing-pick` opens mountains, `raft` cheapens rivers) so crafted gear *unlocks routes* — needs a generation reachability guard. Also the spyglass "what-if" forecast (surface which consumable/affinity flips a loss to a win).

---

## 5. Explicitly out of scope (roadmap, not this milestone)

Tiered map-**items** you find (tier-0 = safe/food-rich, higher tiers found on tiles / from humanoid monsters); the cartography system; the weight-based carry model (rejected); barrier topology + terrain-gating gear (Tier 3 above); a full game-over/restart UX beyond the base-energy floor.

## 6. Implementation phases

1. **Phase 1 — the goal & the reward (mostly data, low risk):** Ancient Wyrm + tier-4 curves; `chance?` on `LOOT_TABLE` + deterministic seeded roll in `fightAt` (`rand(state.seed, "loot", creature, at.x, at.y)`); the full useful-drops rework (new recipes/armour/weapon/affinity); `POI_DENSITY` 12→18; `BASE_ENERGY_FLOOR`. Ship first — playtest the goal + "fights are worth it."
2. **Phase 2 — the loadout tension:** slot-based carry — consumables/tools each take one inventory slot; **food eaten just-in-time so its slot frees over the run (supersedes D23)**; carry sources = base + backpack + transport + panniers; used/total counter + ghosted-equipped packing UI; rebalance caps. Combat consumables (`battleItems`, `COMBAT_BUFF`, `resolveCombat`). `ENERGY_PER_FOOD` 10→8 (+ re-verify sustainability — the food-banks-back change also shifts the economy, so re-derive the greedy harness). Optional armour move-tax per §4.4 decision.
3. **Phase 3 — structural (later):** barrier topology + terrain-gating gear; spyglass what-if; leads into the tiered-map / cartography roadmap.

Each phase is independently testable, committable, and gated by `bun test` + `bun run typecheck` + `bun run lint` (and the sustainability harness for the food changes).
