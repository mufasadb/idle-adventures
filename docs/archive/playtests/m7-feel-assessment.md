# M7 — Feel Assessment & Lever-Tuning Candidates

**Date:** 2026-07-04 · **Bead:** `idle-adventure-868.8` · **Method:** headless harness (AI/CLI) — `play` + `legalActions` + direct `resolveCombat` probes over the pure engine. Human web play still pending (this doc tees it up).

> The POC exists to answer one question: **is choosing a loadout for a given map, then making routing / gather / fight / turn-back calls under tight budgets, fun enough to want to craft up and go again?** This is the harness-side read. It scores the spec's six success criteria, judges the biome-inference loop (D21), and lists the levers to turn — but the *fun* verdict needs a human at the web view, so the last section is a "what to feel for" guide.

---

## 1. Success-criteria scorecard (spec §9)

| # | Criterion | Status | Note |
|---|-----------|--------|------|
| 1 | Generate a seeded map + read a **rough preview** | ⚠️ **thin** | Works, but `PREVIEW_FIDELITY = 0` → the preview is *only* the biome name. There is nothing else to "read." The read-forecast → pack-to-match decision is currently "pick a biome word." |
| 2 | Craft items + assemble a loadout within carry limits | ✅ | `craft` consumes bank → item; `pack` validates against `bank − reservations`; slot cap enforced. Solid. |
| 3 | Full expedition via discrete actions, watching E/HP deplete | ✅ | move/gather/fight/return all work headlessly; energy & HP visibly drain. |
| 4 | Fight through the matrix + ≥1 hidden affinity; spyglass changes info | ✅ | Matrix legible; 3 affinities live (silver/werewolf, iron/fae, garlic/vampire); `scout` reveals stats. |
| 5 | Return, craft an upgrade, **visibly improve** the next run | ✅ mechanic / ⚠️ pace | iron-pick halves mining cost — real. But the materials to craft it are scarce & cross-biome (see §4), so the payoff is several runs away, not next-run. |
| 6 | Do all of the above **headlessly via JSON** | ✅ | M6 harness. 183 tests green. |

**All six are mechanically satisfied.** The vertical slice is complete and runs. The open question is entirely *feel*, and two criteria (1 and 5) are thinner in practice than the spec hoped.

---

## 2. What genuinely works (keep)

- **Biome movement economy is emergent and real.** Terrain cost does the work the design wanted with *no* biome-wide rules: tundra is 88% ice (cost 2×) and a full-map clear cost **~150–300 energy**; desert is ~89% plains (cost 1×) and cleared for **~60 energy**. Tundra genuinely *feels* expensive to cross — you want a horse (÷1.5) or a second food slot. Desert lets you range freely. This is exactly the "horses are great in desert" statistical emergence from D21, and it lands.
- **Combat matrix is legible and creates real weapon/armour reads.** Plate halves ranged and doubles vs magic; robe monsters (fae, vampire) shrug off a fire-staff (magic×robe 0.5 → the staff is *worse* than a sword there). Learnable without a wiki.
- **The affinity pull is felt — when ungeared.** Naked sword vs werewolf = −12 HP; silver-sword = −4. That's a visceral "oh, I need silver" moment, and silver is best-farmed in tundra → a cross-biome pull. (Caveat in §3.)
- **Tier-3 monsters are correctly lethal ungeared**, and **potions carry the ungeared economy**: dust-vampire is an auto-loss bare, a win with 1 potion; ice-troll needs 2. Potions matter.
- **Cross-biome recipe pulls exist in the tree.** spyglass = desert copper + tundra ice-moss; silver-sword pulls tundra; iron-pick pulls woodland oak + desert iron. The "I need to visit a desert" pull is designed in.

---

## 3. Findings that need tuning (the real output)

### F1 — Full plate trivializes *all* combat (severity: high, #1 dial) — confirms & extends the M4 bead note
A full plate set (Σ9 defense) floors **every one of the 9 monsters to the chip-damage minimum (1)** — including *both* tier-3s. Worst case in full plate: ice-troll −7, dust-vampire −5; everything else −1 to −3. Once a player owns full plate, armour type, weapon choice, *and the affinity pull all stop mattering* — the game is solved. The mitigation math is the culprit: `defense ÷ matrix`, so Σ9 vs ranged = **18 effective mitigation** against a raw damage of 2. Damage curves (tier dmg 2/4/7) can't out-scale flat mitigation that large.
*Mitigant in practice:* full plate costs **9 iron-ore** (scarce, see F4), so it's an endgame state, not turn-1 — but it's a terminal one.

### F2 — The slot "squeeze" is soft, not the dynamic tension the spec sells
Spec §3: "every potion packed is a slot of loot you can't bring home." In practice, food and potions **stack to 10 per slot** and gathered materials **merge by defId**, so:
- 10 rations (100 energy) + 10 potions = **2 slots**, flat, regardless of how much you pack within a stack.
- A full-map haul rarely exceeds **3–5 distinct materials** → 3–5 slots. A 6-slot leather backpack comfortably carries a whole map.

So the adders/subtractors squeeze reduces to a **fixed ~2-slot consumable tax**, not a live "more supplies ⇄ less loot" decision. The interesting choice (how much food to bring) is nearly free because the *first* 10 rations cost the same one slot as a single ration.

### F3 — `PREVIEW_FIDELITY = 0` leaves criterion 1 with nothing to read
The whole "read the map, pack to match" loop upstream of embark is currently "the word `tundra`." The master dial for *how much preparation matters* is turned off. This is the single biggest lever on whether the *preparation* half of the loop is fun.

### F4 — Iron-ore scarcity makes the first upgrade slow
iron-ore is the backbone of tools *and* all plate, but it's weighted low everywhere (desert 19%, woodland 5%, tundra 7%) and desert mining rolls **copper 7 : iron 2 : silver 1**, so most desert mining still yields copper. A harness desert run banked copper×3 and **zero iron**. Crafting even the iron-pick (2 iron + 1 oak, cross-biome) realistically takes several runs. For a *feel-test* that wants to show "craft an upgrade, feel the next run improve" quickly, this is too slow. (For a shipped game it might be fine progression — but the POC needs to demonstrate the payoff fast.)

### F5 — No pathfinding; mountains can wedge naive routing
`move` steps one tile toward a target and rejects if that tile is impassable (mountain = ∞). There's no auto-route, so a straight-line beeline can strand you against a mountain wall (the harness driver wedged on one desert map, clearing 0 nodes). Fine for a human clicking adjacent tiles; worth a note for the AI-play path and a future "move toward = A* one step" convenience.

### F6 — Fractional HP leaks into events (cosmetic)
Light/robe mitigation produces values like `25.199999…` in the event log (known, M4 bead note c). Round at the render boundary.

---

## 4. The biome-inference loop (D21) — explicit judgment

- **Did knowing the biome name change what you packed?** *Partially, and only via movement.* Knowing "tundra" should mean "pack more food or a horse" (ice is 2× cost) — that read is real and correct. But because `PREVIEW_FIDELITY = 0`, the name is the *only* signal, and the node/creature implications ("desert = mining-rich, animal-poor") are learnable only by having played the biome before — there's no in-run forecast to pack against.
- **Could you feel the profiles?** *Yes, statistically.* desert = flat + mining-heavy (40% mining nodes) + monster-heavy (25%); tundra = ice + animal/silver + expensive movement; woodland = mild plains, wood/herb, few mines (4%). The material tables reinforce it (silver best in tundra, copper in desert). After a couple of runs per biome the identity is legible.
- **Cross-biome "I need to visit a desert" pull?** *Designed in and present* (spyglass, silver-sword, iron-pick all span biomes) — but blunted by F4: if the first upgrade takes many runs, the pull is felt slowly.
- **Is 3 biomes enough for "go again"?** For the POC, *the movement-economy difference alone* gives 3 distinct feels. But with the preview at 0 and the slot squeeze soft, the "go again" motor is currently **crafting progression**, not map variety — and progression is throttled by F4.

**Net:** the biome system's *bones* are good and the emergence is real, but the loop leans on a preparation phase (F3) and a squeeze (F2) that are currently under-powered.

---

## 5. Top lever-tuning candidates (prioritized)

1. **`PREVIEW_FIDELITY` (→ 1+).** Turn on real hints (node-mix / terrain-roughness / a monster-tier whisper). This is the master dial for whether *preparation* is a decision. Highest fun-leverage, lowest risk. (F3)
2. **Combat mitigation shape — cap or curve it.** Options: raise `MONSTER_TIER_DMG_CURVE` (esp. tier 3), cut per-piece `defense`, raise `CHIP_DAMAGE_MIN`, or (best) change mitigation from flat subtraction to a **percentage / diminishing** model so Σ9 can't hit an 18 wall. Goal: keep armour *type* a live choice even when fully geared. (F1)
3. **Slot tension — lower `STACK_CAP` and/or `BACKPACK_SLOTS`.** A `STACK_CAP` of ~4–5 and tighter packs make "how much food vs loot" a real per-run call and make backpack upgrades matter. Re-introduces the spec's core squeeze. (F2)
4. **iron-ore economy — reweight or re-cost.** Bump iron's weight in desert mining, or lower iron counts in the tool/armour recipes, so the *first* upgrade lands within 1–2 runs and the payoff is felt during the test. Keep full-plate's total iron cost high (it's the F1 backstop). (F4)
5. **`ENERGY_PER_FOOD` / `TERRAIN_COST` co-tune.** If STACK_CAP drops, revisit these so a normal run still crosses the map. Tundra's 2× ice is the biome-differentiator — keep it, but make sure horse/food answers are affordable early.
6. *(convenience, not balance)* one-step pathfinding for `move toward` + round HP at the render boundary. (F5, F6)

---

## 6. Go / iterate / pivot

**Recommendation: ITERATE, don't pivot.** The engine, the loop's skeleton, and the biome emergence are sound — the slice does everything the spec asked and the *movement/biome* half already produces distinct, legible decisions. But the two halves that carry "fun" — **preparation** (preview) and the **carry squeeze** — are currently under-tuned, and **combat collapses at full gear**. None of that is structural; all of it is levers (§5). Turn dials 1–3, then re-run this assessment. Do **not** conclude on fun until `PREVIEW_FIDELITY > 0` and the slot squeeze bite — right now we'd be judging the loop with its two most important tensions switched off.

---

## 7. For the human play-test (what to feel for)

When you play the web view, the harness can't judge *fun* — you can. Specifically:

- **Preparation:** with only a biome name to go on, does packing feel like a decision or a formality? (This is F3 — expect "formality" until we raise `PREVIEW_FIDELITY`.)
- **The squeeze:** did you ever agonize over food-vs-loot, or just pack a food stack + a potion stack and forget it? (F2 — expect "forget it.")
- **Routing:** on a tundra map, did the ice cost make you turn back or re-route? Did you wish for a horse? (This should feel good — F-none.)
- **Combat reads:** did the type matrix / affinity create a satisfying "I should've packed silver" moment? And once you geared up in plate, did fights stop being interesting? (F1.)
- **The pull:** after a run, did you *want* to craft something and go again — and did you know *which biome* to go to for the materials? (F4 — the want should be there; the pace may frustrate.)

Jot which of these felt alive vs flat; that plus this doc is the go/iterate decision.

---

## 8. Reconciliation (2026-07-09) — most findings already resolved; DO NOT re-touch

Re-verified against current code while designing the crafting-depth epic (`docs/superpowers/specs/2026-07-09-crafting-depth-gates-stations-field-design.md` §5.5). **The reworks since 2026-07-04 (si7.1 combat-alive, pqp/STACK_CAP, D27 iron reweight, D34 wyrm) already resolved F1/F2/F4.** Recording the evidence here so future work does **not** re-open fixed code and "correct" what is already correct.

| Finding | Status | Evidence (current code) — the fix, so don't redo it |
|---|---|---|
| **F1** plate walls combat | ✅ **RESOLVED** | `combat.ts:damageTaken` uses diminishing `MONSTER_TIER_DMG_CURVE[tier] · K/(K+D)`, `D=Σ(def÷matrix)`, `MITIGATION_K=6` — full plate ≈ −50% (not chip). Comment at `constants.ts:329` explicitly notes "the M7 F1 collapse dies here." Plate is now weak-to-magic (÷1.5) and the **tier-4 ancient-wyrm (magic→plate, D34)** punishes the plate line. |
| **F2** soft carry squeeze | ✅ **RESOLVED** | `STACK_CAP` 10→**5**; consumables **do not stack** (pqp) — food/potions are 1 slot/unit. The "how much food vs loot" call is live again. |
| **F4** iron scarce / slow first upgrade | ✅ **RESOLVED (spot-check on play)** | Woodland mining now `iron-ore:7` (starter biome is the iron source, D27) — first upgrade lands early. |
| **F3** preview fidelity | ⛔ **OPEN → own bead** | `PREVIEW_FIDELITY = 0` still. The one real survivor; the master dial on whether *preparation* is a decision. Also the playtest-v3 legibility drag. Tracked separately (not the crafting epic). |
| **F5** pathfinding / **F6** frac-HP | ⚪ minor | v3: console-pathfinding is a harness artifact (web A* fine). HP rounding cosmetic. Not blocking. |

**Bead 868.8 closed on this reconciliation:** the assessment exists, findings are triaged, the ITERATE decision was made and acted on, and the human-play verdict came via playtests v2/v3 ("core loop VALIDATED"). The only live thread — F3/preview — is carved into its own bead so it isn't lost.
