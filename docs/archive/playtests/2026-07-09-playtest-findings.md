# Playtest Findings — 2026-07-09 (post crafting-depth epic, ke3.1–ke3.7-thread-1)

**Fleet:** 3 blind agents. Seeds: `pt-alpha` (headless console), `pt-bravo` (headless console), default `play` (**real web UI, A\* pathfinding — primary signal**). Each played ~10–16 expeditions from a blind start, no repo access.
**Context:** first playtest since the crafting-depth epic landed (recipe gates, stations, field crafting, the fletching yield-mod, cooking + alchemy verticals, the forge). Probes targeted the new depth: (1) did tool/station/field gates add good decisions or confusion? (2) did you ever cook/brew mid-expedition?

## Verdict: **ITERATE** (not pivot). The loop is sound; the debt is *legibility*.

The web agent — the one who reached the full loop — was clear: *"the combat push is genuinely fun… the route/energy previews are top-notch… the loop underneath is solid. Fix the signposting and [it works]."* Both console agents independently praised the same spine (energy-budget logistics, tool-tier gates, the ice-cleats/canteen "aha"). Nobody said the systems are wrong. Everybody said the systems are **hidden**.

## The web-vs-headless comparison (do this first — it's the whole method)

Two of the loudest, most unanimous complaints were **console-movement artifacts**, disproven by the web agent. Filing them would have "fixed" non-problems (the v1→v2 lesson):

| Complaint | Console agents | Web agent (A\*) | Ruling |
|---|---|---|---|
| **Navigation friction** — hand-routing around mountains, tile-by-tile | **#1 fun-killer for BOTH** (alpha: 55 rejected moves at one massif; bravo wrote a Python pathfinder) | Praised the click-to-route + energy-preview bar as *"excellent, load-bearing"*; never flagged it | **ARTIFACT** — the console `move` single-steps and doesn't path around walls; the web has A\*. Discount. |
| **Combat unreachable / "hopeless"** | alpha never reached a monster in 10 runs; bravo fought once and lost | Deep-struck 57 tiles north on a food budget, won 3 fights cleanly, called the combat forecast *"the best-designed screen"* | **ARTIFACT** — single-step console movement makes the deep-strike impractical; the bootstrap is real but reachable. Discount the "hopeless" framing. |

Without the web agent we'd have rebuilt navigation and combat balance — both fine. **Never run headless-only.**

## Convergent REAL findings (ranked — file these)

### 1. Gate legibility is the #1 problem (3/3 agents, BOTH interfaces)
We added the gates; we didn't add the signposting. This is the crafting-depth epic's legibility debt, and it's what makes blind players bounce before the loop clicks (web: *"most humans would bounce off around run 4–6"*).
- **Lock messages don't name the requirement.** "can't hunt (no tool)" never says *which* tool; `missing-tool` on `draught` never says *which*; `missing-station` never says *build an anvil*. The web agent *"burned ~4 runs guessing"* the hunting tool; both console agents finished not knowing what `draught` needs. A locked recipe row shows ingredients but no "needs a Smokehouse first" — you only *infer* "I lack mats."
- **Tier-locks are invisible until you physically stand on the node.** A tier-2 Silver vein looks identical to a shallow Iron node from town and at range. The web agent mined **~12 nodes fishing for Silver** that could never appear at their reach, then trekked ~50 tiles to finally read "🔒 needs a tier-2 tool" — *on a tool they already had*.
- **The Spyglass doesn't reveal node contents/tiers** despite its name — a direct letdown that feeds the tier-invisibility problem. (The `survey` mechanic exists but went undiscovered or doesn't surface tier.)
- **Field crafting is invisible (3/3).** Zero prompt, hint, or affordance. The console agents got a teasing `not-field-craftable` on ~20 town recipes and never found the fire-kit key; the web agent *never saw a field-craft panel at all* (it only appears once the kit is equipped, which they never did). The fire-kit/glassware are unmarked keys; the cooking-pot felt broken because stew needs fire-kit *too* (the AND-gate).

### 2. Creative mechanics give no feedback (web agent, high-signal)
Players who tried the *clever* things got silence — the worst outcome (punishes exactly the experimentation the game secretly requires):
- **Ore Ink (cxq cartography)** — the web agent sought it out as a smart route to Silver, applied it, the map still read "of gleaming," and they *"couldn't tell if my idea worked."* The ink's effect (and even that it *took*) is invisible. (Note: ink flavour is deliberately vague by design — but "did it apply / what does this map now favour" is a *confirmation* gap, not a spoiler.)
- **Spyglass** — crafted hoping to reveal node tiers; *"no visible impact at all."*

### 3. Onboarding / early-game pacing (web + both console)
The real bootstrap is **non-obvious and inverted**: hunting is a red herring (the knife→silver chain is a wall), while **monster drops** — reached by a deep food-stockpile strike — are the actual early unlock. The first ~11 web runs were dead-ends before this clicked. Compounding it, the **early food economy is ~break-even** (low-tier food auto-eats as travel fuel), forcing a boring farm-run/push-run alternation. Web + both console independently called the pre-click stretch *"debugging, not playing"* / *"a thoughtless treadmill."*

### 4. Combat is mash-friendly early (G1 — validates the weapon-enhancement spec)
The web agent: *"I clicked Fight twice for every monster; never a reason to Flee or Potion."* The RPS affinity system never forces a decision with a single sword (every early monster is "soft hide" → melee always wins); auto-eat/auto-potion remove the micro-decisions. This is exactly the combat-inertness (G1) the **weapon-enhancement design spec** (`docs/superpowers/specs/2026-07-09-weapon-enhancement-design.md`) targets — the playtest independently confirms the problem it's built to fix.

### 5. Starter combat is a hopeless first fight (bravo)
Bravo's only fight — starter kit vs a snow-marauder — was mathematically unwinnable (3.8 dmg out vs 8 in, no armour) after a 37-tile walk. *"Teaches combat is hopeless instead of gear up."* Real, but a pre-existing G1/onboarding concern, entangled with #3 and #4.

## Console-parity / harness notes (file separately — not game problems)
- **Console `move` has no pathfinding** — the dominant console artifact (#1 above). Prior runs already flagged this (playtest v3). A console "route to node" helper (Dijkstra path, not just `--reach` cost) would make future console playtests trustworthy instead of crippled. Harness improvement, low priority.
- **Parity fix already shipped this session** (pre-flight): the console town recipe book was listing `field:true` + already-built-station recipes; now hidden to match the web. Without it the console agents' "why can't I cook at home?" would have been even noisier.

## What's working (protect these)
- **Route preview + energy bar** (web) — "excellent, load-bearing." The A\* click-to-travel with a "⚠ strands you" warning is the ergonomic backbone.
- **Combat forecast** — "the best-designed screen": *you hit X · it hits Y · kill in N · potions extend that.* Combat felt fair and readable *once reached*.
- **Station gates as a concept** — independently praised by multiple agents: *"building your workshop to unlock a branch is a strong, legible decision."* The mechanics we shipped are validated; only their signposting is missing.
- **Return-from-anywhere**, **auto-eat/auto-potion**, **the deep-strike gamble**, **the biome tech-map** (carbon=coal, gleaming=silver) — all called out as good.

## Follow-up beads filed
- **Gate legibility (epic)** — lock-reason messaging (name the missing tool/station), node tier/reach visibility (Spyglass/survey reveals tier), field-craft affordance (surface the panel + signpost the fire-kit). Finding #1.
- **Cartography/tool feedback** — Ore Ink applies-confirmation + "this map now favours…" hint; Spyglass reveals node tier. Finding #2.
- **Early-game bootstrap & food economy** — make the first range-extender reachable without the hunting circular-dependency; nudge early food net-positive; telegraph the combat-drop bootstrap. Finding #3.
- **(Existing) weapon-enhancement spec** — addresses Finding #4 (combat inertness); spec already written, awaiting build.
- **(Harness) console pathfinding helper** — route-to-node for trustworthy future console playtests.
