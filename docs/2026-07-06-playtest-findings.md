# Blind Playtest Findings — 2026-07-06

**Method:** 3 blind agents (seeds `aldo`, `brin`, `cass`), each playing 12–16 expeditions through the headless player-console (`bun run playtest`) — the real player surface only (state, town offer + recipe book, perception-gated map, legal actions, matchup lessons); no repo/internals access. Played unbiased, then interrogated after on interest / decision-weight / thoughtless patterns / novelty / option-obviousness / fun. This is the first playtest since M7 shipped topology, graded movement, perception, recipe book, and no-farm.

**Verdict: ITERATE (not ship, not pivot).** All three independently reached the same shape: the *bones are good* (budget-routing loop, one-tool-slot tension, the craft-a-tier power spike) but **the current build rewards patience over judgment** — progress is gated by RNG and grind, not skill, and several systems are opaque or self-defeating. None of the three got past the **iron tier** in 12–16 runs; none reached combat reliably; none approached the endgame artifact.

## Convergent findings (all 3 agents, ranked)

### F1 — CRITICAL: the iron gate × map-RNG is a hard wall
All three stalled at iron and *believed iron was unreachable / that "harder biomes unlock later."* That belief is a **misconception** (iron-ore is in all three biomes' mining tables, dominant in woodland) — which is itself the finding: iron is real but **feels unfindable**. Why: desert `O` is a copper/iron coin-flip (one agent banked 9 useless copper), tundra iron is ice-taxed, and **woodland mining nodes are rare** (nodeTypeWeights mining 0.05) so its iron-rich `O` almost never appears; maps don't repeat, so you can't go back for it. Every upgrade needs iron, so the whole tree stalls on a slot machine. *"Decisions that feel high-stakes (irreversible!) but don't give agency, because the gating resource is behind a slot machine."* Confirms the earlier `F4` scarcity flag — now the #1 blocker. **Fix candidates:** reweight mining/iron so early iron is deliberately pursuable; raise woodland mining-node weight; or make biome resource-tendencies legible so "go to X for iron" is a real choice.

### F2 — CRITICAL: combat is largely unreachable
Monsters spawn at the far top edge (~19 tiles from the bottom entry) or inside mountain-walled pockets — both beyond the 200-energy budget. `brin` had ~8 failed approaches and *most runs literally couldn't start a fight*; the one clean fight came from a lucky open spawn, not planning. Combat is the marquee activity on the road to the artifact, and it's gated by spawn luck vs the energy cap + entry position. **Fix candidates:** monster placement relative to entry/budget; entry-selection interplay with b91 topology (topology may over-wall); a way to reach the top of the map on one budget.

### F3 — MAJOR: grind-to-win; a thoughtless treadmill dominates
"Monster/loot quality climbs with runs completed" → progress is a function of **run count, not play quality**. All three found a mindless positive-EV loop (desert: pick → copper + herbs→rations → home) that farms forever with zero thought. *"A thoughtless floor and an RNG ceiling, with not much skillful middle."* This is the core "is the loop fun?" question — current answer: **not yet**; it tests patience, not judgment.

### F4 — MAJOR: opaque / self-defeating items (decisions feel fake)
- **spyglass is a trap:** it's a *tool* (competes with your gather tool) and maps never repeat, so scout-then-mine is impossible — *"crafting it is only ever a mistake."* (Post-9u9.2 it grants passive vision *range*, but the slot cost vs a gather tool still reads as a bad trade — the value never landed.)
- **horse showed zero visible movement benefit** in play (two agents) — a strategic purchase the strategy layer never acknowledged. (Transport is now per-terrain ÷2 on plains — either it's not biting on their routes, or the effect isn't legible.)
- **food reads as optional** early — the 200 base floor ≥ a small food pack, so the food "decision" is a non-decision until later.

### F5 — MAJOR: no-farm map loss feels punitive (9u9.3 side effect)
*"Every return permanently rerolls maps; you can never revisit — learned the hard way after scouting a woodland then losing it… feels like a betrayal the first time."* The no-farm change is right in intent but currently unsignalled and interacts badly with scouting/spyglass. **Fix candidates:** telegraph the "no going back" cost loudly; or allow limited map memory / a way to re-pursue a known-good biome.

### F6 — MAJOR: combat has little agency
Walking onto a monster auto-resolves the *whole* fight; potions heal between fights only; strong monsters one-shot through armour (*"tore through your armour"* — armour payoff neutered). *"Combat is just a terrain hazard with extra steps."* The one system that should have the most agency has the least.

### F7 — MINOR: discovery-by-punishment / opacity
Too much was learned by eating a loss rather than by deduction: one-tool-per-run (stood on a hide with a pick, couldn't take it), `move` doesn't path around obstacles (impassable failure), spyglass-is-a-tool (after crafting it), the 200 cap ignoring a 2nd ration. Plus silent failures: **wrong ration recipe id fails with no feedback** (`ration` needs forest-herb, not `ration-sage`). *"Failure should come from a bad call, not a rule you couldn't see."*

## What worked (the good bones — keep these)
- The **craft-a-tier power spike**: iron-sword flipped combat from lethal (−20 HP) to trivial (−3.6 HP) — a clear, felt payoff. The one universally-liked beat.
- **The one-tool-slot constraint** — a real, legible logistics tradeoff (the central puzzle when it isn't biting by surprise).
- **Learning the world** — per-node resources, terrain-cost gradient, the weapon-vs-armour matchup hinted only in post-fight flavor — runs 1–6 had genuine hypothesis-and-test pull.
- **Terrain-aware prep** — maxing rations before an ice biome felt like earned adaptation.

## Harness notes (fix so future playtests are clean — NOT game findings)
- **Console showed `equipped: (nothing)` during expeditions** — it read the town loadout, not the active one. **Fixed** in this commit.
- Headless movement is single-step with no pathfinding (the web has A*), so agents spent effort hand-routing around mountains and miscounting grid columns → "no-node" on empty tiles. Consider a console convenience (path preview / coordinate labels) so playtest friction doesn't dominate feedback.

## Follow-up beads
Filed under a new epic `Playtest follow-ups — 2026-07-06` (see beads). Top priorities: **F1 iron availability** and **F2 combat reachability** (both block the loop from being testable end-to-end), then **F3 grind-vs-skill**, **F4 opaque items (spyglass/horse/food)**, **F5 no-farm telegraphing**, **F6 combat agency**.
