# Blind Playtest v2 — 2026-07-06 (post-reworks)

**Method:** 3 blind agents, fresh seeds — **2 headless-console** (`delta` 11 runs, `echo` 4 runs, now with the `--reach` query) + **1 real web UI** (`foxtrot` 5 runs, A\* pathfinding + shaded energy bar). Played blind toward the endgame artifact, no lookups; interrogated after on the 7 questions. First test since graded movement, perception, recipe book, no-farm, maps-as-items, the legibility batch, the stamina energy rework, and the reach-visibility work.

**Verdict: ITERATE — with clearly positive momentum.** The gather → craft → reach loop is now *"legible and moreish"* and genuinely fun for the optimizer brain; last time everyone stalled at the iron wall — this time `delta` reached **steel/silver** and `foxtrot` reached **tier-3 steel-pick**. The reach-visibility work is a unanimous hit. The remaining drags are **combat** (inert and walled too deep), the **energy tension collapsing once you own movement gear**, and **console-parity gaps** that misled the headless agents.

## The headline: web vs headless comparison

Running one agent on the real web UI was the right call — it separated real problems from harness artifacts:

- **F2 "combat unreachable" ≈ a headless artifact.** `foxtrot` reached and fought monsters fine (click a monster → "walk in & fight"); a Frost Fae cost a real **15/30 HP**. The headless agents' "can't reach / can't engage combat" was the no-A\* single-step console + mis-signposting, not the game.
- **"Carry is a black box" ≈ mostly a console-parity gap.** The web shows `bag 6/6`; `foxtrot` understood carry and even discovered the food-as-slot-opener dynamic. The headless agents (no slot counter) called it the #1 frustration.
- **What ALL THREE agreed on (real, both interfaces):** the reach/energy-preview layer is the best part; combat is under-cooked; strategy is on-rails; food/energy stalls progression.

## Real findings (ranked)

### G1 — Combat is inert and walled too deep (top priority)
Every *reachable* monster is a trivial weak creature (`delta`: 0 HP; `foxtrot`: 15 HP but still the lowest tier). The matchup system, rare-hide rewards, and the whole endgame sit behind ~⅓+ of progression, so **players experience the gathering/crafting game fully but never the fighting game.** `delta`'s #2 fix verbatim: *"front-load combat variety so the matchup system shows up early instead of after many tiers."* This absorbs the old F2 (reachability was the artifact; *depth/earliness* is the real issue) and sharpens F6.

### G2 — Strategy is on-rails; a thoughtless line dominates (sharpens F3)
Tactics (routing) matter, but strategy is near-linear: the tiered-tool gate forces one craft order, so *"different players converge on the same sequence."* The dominant pattern needs no thought: *"always craft the next tier tool, always bring the horse, step on every monster (free damage)."* Auto-stepping into combat is *"strictly correct and thoughtless."*

### G3 — Energy tension collapses with movement gear + no sustainable food loop (new, from the stamina rework)
Two linked issues both interfaces hit: (a) **no obvious sustainable food loop** — you stall on running out of *rations* (a mundane resource) rather than on a compelling challenge; (b) once terrain gear (ice-cleats/horse) trivializes movement, **energy stops draining, so the whole stamina tension evaporates** and food becomes just a slot-opener you manually eat. `foxtrot`: *"almost too well — it removed the whole tension."* The stamina rework is good early; it needs a reason for energy to still matter once you're geared.

### G4 — Playtest-console parity gaps (harness fidelity, high-value)
The headless console **mis-signposts combat** (the `fight` action is rejected "no-monster" and never listed; you actually engage by *moving onto* the tile, which also isn't listed, and it needs a free loot slot — `echo` burned ~6 actions discovering this) and **doesn't show carry used/cap**. These *misled* the headless agents into false findings. Fixing them keeps future headless playtests faithful (the web already handles both).

### G5 — Carry/backpack friction (real but secondary)
Starter backpack is tiny → many clipped trips; biomes silo resources (tundra has no wood) → ping-ponging between maps for food vs. materials. Even on the web the food/slot micro between runs was the main drag.

### G6 — Boxed-in nodes give no "why" (legibility)
A node walled off by mountains/water simply previews no route with no explanation — *"read as a bug"* on both interfaces. Should say "walled off — needs climbing-pick/raft."

### Minor / verify
- **Pocket may have a bug:** `foxtrot`'s one Pocket attempt "didn't register — I lost a Woodland." Verify the web pocket flow.
- `echo` hit a desert drop boxed into a one-node corner with no exit — check whether entry-selection (b91) is doing its job early, or it's just a no-gear situation.

## What's working (protect these)
- **Reach visibility is the win of the session** — `--reach`, the shaded energy bar, and the gear-saving telegraph "drove almost every decision" and made ice-cleats/horse value instantly legible ("saved 240e").
- **The tier-gate reveal** ("tool-too-weak" → craft iron-pick → silver/coal appear + mine cheaper) was *"the single most satisfying aha moment."*
- **Progression is healthy now** — iron is findable; steel/silver reached in a session. The reworks landed.

## Prioritized follow-ups
G1 (combat depth/earliness) and G3 (energy-tension + food loop) are the two that gate "is the *whole* loop fun." G4 (console parity) is cheap and protects our test fidelity. G5/G6/pocket-bug are smaller polish. See beads (epic updated / v2 items filed).
