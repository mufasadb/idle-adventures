# Blind Playtest Findings — 2026-07-17 (re-validation of D83 + D84 + c67)

**Fleet:** 3 blind agents, no code access, aiming for the end-game artifact.
- **alpha** — headless console, seed `rvalpha` (~7 runs)
- **bravo** — headless console, seed `rvbravo` (~16 runs)
- **charlie** — **real web UI**, seed `rvweb1` — *primary signal; build-freshness self-check PASSED (trap recipe present)*

**Trigger:** re-test the three fixes that shipped since the 2026-07-15 run — **D83** (bootstrap abundance + trap/knife hunting), **D84** (square center map + tier-scaled roster, the F2 fix), **c67** (camera-follow). Probes: (A) how fast to a first weapon/tool + did hunting read? (B) does center-drill make direction a real choice + does an earned/higher-tier map feel different?

**Verdict: ITERATE — real progress, two on-ramp walls remain.** All three agents independently reported the *loop itself is fun once you're over the hump* (adversarial routing around terrain + mob camps, crisp combat forecasts, the gather→craft→upgrade ratchet). Several D83/D84/c67 fixes **validated**. But two discoverability walls still smother the on-ramp, and the #1 of them was ranked #1 by all three agents.

---

## What we shipped — did it work?

| Change | Verdict | Evidence |
|---|---|---|
| **D83 hunting (trap+knife)** | ✅ **Validated 3/3** | All three got the exact signpost on an animal node — *"you'll need both a trap to trap the animal and a knife to alleviate it of its parts."* alpha/charlie called it well-signposted. |
| **D83 bootstrap abundance** | ⚠️ **Half-worked** | Supply is fixed (flint/deadwood ARE abundant — agents found them), but the **legibility gap it left is now the #1 problem** (below). |
| **D84 direction (center-drill)** | ✅ **Validated** | charlie (web): "choosing a direction DID feel like a real decision" — mountains wall off regions, mobs camp corridors. bravo: terrain channels you into a quadrant. It's a *cluster-choice logistics* decision (free return + value-agnostic placement mean it's "which cluster this run", not depth-vs-return — as designed). |
| **D84 tier payoff** | ✅ **Validated when reached** (1/3) | bravo ran an earned **T2 desert map** and reported it *"distinctly different"*: more mountains, tougher monsters (16-HP drake), higher-tier materials — "you need better gear before running them." The F2 fix works. **But 2/3 never reached it** (below). |
| **c67 camera-follow** | ✅ **Validated** | charlie: "the map view DOES follow the player and re-centers on each walk — that worked well." |

---

## Web-vs-headless cross-check (the methodology payoff)

- **Forage legibility (below):** hit on BOTH surfaces (2 console + web), web build-fresh → **REAL, not an artifact.** The surface *divergence* (alpha missed deadwood, bravo missed flint) shares one root cause.
- **Console replay-tedium:** alpha + bravo complained the full-replay console model made hunting a humanoid tedious; charlie (web, persistent state) did **not** have this → **console harness artifact, discounted.** (But the *underlying* map-economy reachability problem is real — charlie also never found a reachable humanoid, for a different reason.)
- **Web bugs (energy-preview, eat, route-reset):** web-only, but confirmed against code — real primary-surface ergonomics, not stale-bundle artifacts.

---

## Findings (ranked)

### F1 — HIGH, CONFIRMED 3/3, ranked #1 by ALL THREE: the forage node is a legibility black box
D83 made flint/deadwood *abundant* (verified ~43% of T1 forage), but a player can't tell which `H` forage node holds what until they walk onto it, and the reach-view even **mislabels a flint/deadwood node as "herb"**. Result — the same wall, three ways:
- **alpha** found flint fast, **never realized deadwood is foraged** → stalled on the deadwood chicken-and-egg ("reads as a soft-lock").
- **bravo** found deadwood (→ club) but **never found flint** → hard-blocked (couldn't make knife/axe/pick/trap → 90% of the game unreachable).
- **charlie** (web) missed both for ~4 expeditions, then cracked it **"by accident"** on a node "labeled 'a herb node'" — *"the single biggest onboarding problem."*

Every tool/weapon needs flint/deadwood; every *wood/mining* node says "needs an axe/pick", so the natural (wrong) inference is "I'm locked out." Nothing links "club ← deadwood" to "deadwood is foraged", and the recipe book hides ingredient sources. **This is the forage-marker follow-up explicitly deferred in the D83 spec** ("if abundance alone doesn't close discovery, file it") — abundance alone did NOT close it. All three proposed the same fixes: a distinct forage marker + honest resolved flavor ("loose flint" / "fallen deadwood") + a breadcrumb, OR seed the starter bank with 2 deadwood + 1 flint so the first craft tutorializes the source.

### F2 — HIGH, new: the map economy is gated behind an unreachable first-humanoid kill
D84's tier payoff is real (bravo proved it), but **2/3 never reached it**: the earned-map loop requires killing a **humanoid** to loot your first map, and humanoids were either absent from the free-map biome rotation (alpha) or camped behind tougher monsters that intercept your route (charlie's drake ambush; bravo only got one via a lucky bandit). So the headline progression the whole game is built around was **invisible to most of the fleet the entire session**. Fix: guarantee a *reachable* early humanoid on low-tier free maps (or a breadcrumb pointing at one), so the tier climb actually starts.

### F3 — MED bug, CONFIRMED (web, primary): the energy preview lies about "stranding"
A route costing more than current energy shows red **"→ 0 ⚠ strands you"** even when designated auto-eat food will refill mid-walk (it did: charlie's walk completed via "+76e · auto-ate 2× ration"). Verified: the preview (`main.ts:848`, `total = walkCost + actionCost` vs `exp.energy`) never simulates auto-eat along the route. This erodes trust in energy — the one number the whole loop hinges on. Fix: fold designated-auto-eat refills into the route cost preview (show "→ 135 after eating 1 ration").

### F4 — MED, new: food UX is confusing (manual Eat + auto-eat overshoot)
charlie: the manual 🍖 Eat button "did nothing" at 59/300 with food present. Root cause (verified `reduce.ts:1062`): manual eat jumps energy *to* the food's value (not additive) and *rejects* when that value ≤ current energy — so low-value/fresh food at moderate energy is a silent no-op. Also auto-eat ate 2 rations when 1 would do (overshoot). The jump-to semantics + silent rejection read as broken. Fix: make manual eat's effect legible (disable + explain when it can't help), and consider least-overshoot auto-eat.

### F5 — MED, c67 follow-up: routing reset still traps players
Even with c67's "✕ clear route" button, charlie "burned several minutes on ghost-blocks": once a leg is blocked, clicking new destinations **appends more blocked legs** that never clear, and the clear-route affordance wasn't discoverable in that state (charlie only found the click-your-own-tile reset by trial). Also: a routed line silently triggers a fight with any monster it crosses — charlie committed 132 energy then got ambushed by a drake. Fix: don't append onto a blocked leg (auto-drop it or make "clear route" prominent when blocked); warn when a planned line crosses a monster you're forecast to lose to.

### F6 — MED, recurring (reinforces prior runs): autopilot combat + hidden recipe sources
- **Autopilot combat (Q3):** both console agents — auto-finish/quaff/eat make fights "press fight", and "farm the nearest 8-HP soft monster" is the dominant, thoughtless strategy. The weapon-vs-hide matchup triangle exists but "doesn't bite until far later than the boredom sets in" (bravo). Consider making an early monster genuinely require a matchup choice.
- **Recipe book hides sources (still-open `lsy`/F3-prior):** 80+ recipes, outputs + ingredients shown but never *where ingredients come from* — reinforced by all three as a core discoverability tax.
- **6-slot starter bag too tight** (3/3): 2 rations + 2 potions leaves ~2 loot slots; small-backpack "feels required, not an upgrade."

---

## What's working (don't break it)
- **Combat forecasts** ("you hit 2.5, it hits 4 — kill in 4") + the resolved "Here:" flavor — praised by all three; the clearest teaching surface.
- **Adversarial routing** around terrain + mob camps — charlie's "oh, routing is adversarial" drake-intercept beat; the center-drill + terrain channeling makes direction a real logistics puzzle.
- **The tier gradient** — when reached, it delivers (bravo). Soft-fail combat (keep loot on loss) makes over-tier experimentation feel fair.
- **The bootstrap→club→armor→beat-the-thing-that-killed-you loop** — alpha's drake-armor payoff and charlie's craft-unlock were each cited as the session's most satisfying beat.

## Reproducibility
Seeds: alpha `rvalpha`, bravo `rvbravo`, charlie `rvweb1` (web, `?seed=rvweb1`). Build green (579 tests). Web served on :3000, fresh + cache-busted; charlie's freshness check passed.
