# Playtest v5 Findings — 2026-07-09/10 (post gate-legibility D59 + weapon-enhancement D60)

**Fleet:** 3 agents. Seeds: `pt5-console` (headless), `pt5-web-a` + `pt5-web-b` (real web UI — weighted 2 web because the newly-shipped oils are combat-gated/deep, only reachable with A\*). Purpose: a before/after on v4's findings — did gate-legibility fix the discoverability dead-ends, and did weapon-enhancement move G1 (combat inertness)?

## Verdict: the two shipped fixes LANDED — but a harness bug meant weapon-enhancement's *fun* was never actually tested.

### Validated (cross-agent, confirmed on a fresh server)
- ✅ **Gate legibility (v4 #1) is fixed.** "Impressively so" (console) / "excellent" (web): `[needs anvil + blacksmiths-hammer]`, `[needs still]`, in-context node locks ("needs a knife"). Unlocking exactly the annotated recipes after building the anvil was called a genuine "aha."
- ✅ **Field crafting is now discoverable.** The panel + kit requirements are clear; carrying a fire-kit visibly unlocks the fire recipes. (Execution is still awkward — see below.)

### ⚠ The harness invalidated the web signal on weapon-enhancement
**Both web agents ran stale cached bundles** (bun HMR + a caching shared browser; they opened the plain URL without a cache-buster, getting bundles from earlier in the session). Web-A "found" a game-breaking `slotOf` crash; web-B "found" that weapon-enhancement "does not exist in this build." **Both are false** — a fresh cache-busted server banks berries fine and shows Whetstone/Silver Oil/Drake Oil/Still in the craftlist, and 502 engine tests + atomic==interactive parity pass. So **the core question — do oils de-mash combat? — was not tested.** Fix folded into the blind-playtest skill (Protocol step 0b: fresh server + `?cb=` + build self-check per web agent). This is the new #1 harness trust risk.

### The deepest real finding — the core-loop pitch (web-B #1, high confidence)
Web-B (combat bundle worked): *"Free instant return is the single biggest fun-killer — it deletes route planning and any 'can I make it back?' tension. The game's own pitch is 'make the turn-back call under a budget' — currently that call doesn't exist."* Free-return was an intentional anti-stranding choice; the tension it removes is real. **Design decision → its own bead** (the resolution the team is pursuing: reframe the pitch to *value-extraction under a fatigue budget*, not turn-back timing — see bead).

### Other real findings (cross-agent)
- **Combat degenerates to click-Fight with a favorable matchup** (web-B #3) — the "save a special oil for a tough enemy" fantasy has no felt mechanism *in the fight* (even though `enhance` mid-fight technically exists). Web-B independently asked for exactly weapon-enhancement's premise → validates the feature, and points at a combat-decision-texture pass (bead).
- **Node *instance* choice is noise** (3/3) — a node is a node; only *category* choices (backpack, food qty, weapon class) matter. Greedy-grab-nearest is a thoughtless optimum (echoes v4).
- **Onboarding hides the interesting game** (web-B #2) — combat/T2-map spine sits ~45 tiles north behind a wall of identical gather runs; a human likely bounces by run 4–6 before it reveals itself. (v4 `wzk`.)
- **Ingredient sourcing is unsignposted, esp. flint** (both) — flint gates the whole fire/glass/still/whetstone branch and its herb-node source is undiscoverable. (v4 `wzk`.)
- **Field crafting is signposted but ergonomically awkward** (web-B) — auto-eat silently eats your foraged berries before you can cook them (→ addressed by the auto-eat rework bead); "no obvious Cook action" (partly stale-bundle-confounded).
- **Whetstone/oils have no combat-effect description** (console) — buildable with "zero hint what they do," unlike weapons' matchup flavor. Small `describe()` fix (bead).

### Console artifacts (do NOT file as game problems)
- Manual tile-by-tile routing around mountains (both console + web-A's automation friction) — the `h61` no-pathfinding artifact; the web A\* is fine.
- "Never reached combat" (console) — single-step movement; web-B reached it easily.

## Follow-up beads
- Core-loop pitch reframe (value-extraction-under-fatigue) — resolves the free-return finding.
- Combat decision texture (turn-by-turn depth: coat/gear/potion/flee with weight) — resolves click-Fight; rides the shipped weapon-enhancement.
- Auto-eat rework (opt-in, per-food select) — resolves the berries-eaten-before-cooking friction.
- Whetstone/oils `describe()` clause.
- (Skill, not a bead) blind-playtest web-freshness mitigation — landed in the skill directly.
- Pre-existing: `egd` (ink/spyglass feedback), `wzk` (onboarding/food bootstrap + flint sourcing), `h61` (console pathfinder).
