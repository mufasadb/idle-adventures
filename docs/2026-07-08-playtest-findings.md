# Blind Playtest v3 — 2026-07-08 (post-D45 re-baseline)

Fleet: **pt3-alpha** (headless console, ~27 runs), **pt3-bravo** (headless console, 23 runs, ~2,500 actions), **pt3-web** (real web UI via agent-browser, ~26 runs). All blind: console/browser output only, goal stated only as "an ultimate, rare end-game artifact." Reflections taken after play with the standard 8 questions + targeted bow probes. Sponsor questions: (1) do the two power paths diverge? (2) is the farm loop still dominant? (3) is strategy still on-rails? (4) does energy tension still collapse?

## Headline

**The web agent killed the Ancient Wyrm** — the first playtest agent ever to reach the endgame — and did it by *planning*: read the forecast, priced the fight at 9 rounds / ~81 incoming, reframed potions as the real HP pool (30 + 3×greater ≈ 110 effective), and won with 12 HP left. "That margin is decision quality, not dice." Alpha independently got the wyrm to 22.5/54 and called the near-miss "genuinely tense… I could compute exactly how short I was." All three played 23–27 runs and stopped from external interruption or RNG walls, **not boredom**. The loop's own tester verdict: *"fix the friction and I'd call the core loop validated."*

**Verdict: the core loop is validated. Iterate on legibility and friction, not on systems.**

## Web-vs-headless comparison (trust filter)

- **Movement/pathfinding tax — CONSOLE ARTIFACT, do not file.** Both headless agents burned ~⅓ of their actions on `impassable` wall-groping and ASCII transcription and ranked "pathfind the move action" #1. The web agent — with A* click-routing — never mentioned routing pain and called the route preview "excellent." (Harness note for next time: a `travel-to` convenience in the console would double headless expeditions/hour; it's a playtest-tooling item, not a game item.)
- **Coordinate off-by-one confusion** (alpha) — console-only, same bucket.
- Everything else below converged across at least two interfaces, or is web-specific UI truth.

## Sponsor question answers

### 1. Bow/melee path divergence — NO, and the reason is precise: the bow's payoff is invisible

Three-for-three, each one step further down the line before abandoning it:
- **bravo** noticed the recipes, banked feather/flint knowledge, never crafted: "nothing hinted whether bow+arrows meant ranged pre-damage… or just another melee stat line"; arrows "smelled like recurring cost" against its scarcest resource.
- **alpha** crafted the bow, believed arrows were *optional* (the game let it pack a bow with no arrows and `fight` with it), dealt 1 to a vampire, and — unable to distinguish "no arrows" from "vampires resist pierce" from "needs silver" because **the log said nothing** — abandoned the line for 20 runs while owning composite-bow materials. "One line and the bow line stays alive; silence killed it."
- **web** crafted a *bowstring*, held flint ×6 + feather ×4 all game, and passed: "(d) the recipe book presents it as just another weapon row, with nothing signaling 'this one changes *how* you fight'… I had the materials for the entire line by run 9 and passed purely because its payoff was invisible while mithril's was printed in every combat log line." It also noted the Shoot verb would have solved its wary-monster deadlock — the exact situation the mechanic exists for.

The mechanics (D45) were never tested by anyone. **This is not a balance failure; it's a legibility failure**, and all three independently prescribed the same ≤1-sentence fix: a mechanical clause on weapon-class recipes ("ranged: strike first, from a tile away — needs arrows"), a no-arrows warning at pack time and/or in the exchange log, negative matchup flavor ("it shrugs off the blow"), and a greyed-out Shoot affordance when adjacent without a bow. Filed **P2** (below). The bow economics themselves may be fine — nobody got far enough to know.

### 2. Farm loop (2g7.3) — demoted from progression engine to background income; the residual problem is the mid-game sag

The thoughtless loop still exists (all three describe a near-zero-risk "sweep cheap nodes, teleport home" script) but nobody *progressed* by it — discovery and craft-unlock decisions drove all three arcs. The sharper residual: **runs ~14–21 sag** ("interest curve sagged once I knew the systems"; "~40 minutes of repacking the identical loadout hunting a rare spawn"). Two ingredients: no new systems between horse (~run 6) and the wyrm gate, and the **rare-spawn/RNG lottery** (wyrm ~1-in-4 tundras; bravo's coal drought). Matches the user's pull-economy direction (2g7.3 notes): the answer is richer higher-tier pull + offer legibility, not a nerf.

### 3. On-rails (si7.3) — meaningfully improved; the remaining rail is partly finding #1

Real strategic decisions with receipts this time: backpack-before-horse under scarcity, declining the run-4 werewolf on a read forecast, the potions-as-HP-pool insight that won the endgame, weapon-swap scouting, pocket-to-decouple-prep, `--reach`-as-tier-detector. Novelty landed (contrast v2's "novelty had nowhere to land"). Remaining rails: within-tier weapon choice barely matters (fire-staff/silver/steel cluster at 3–4.5), and the craft order stays convergent *partly because the alternative line was invisible* (finding #1). Verdict: keep si7.3 open but its next increment is finding #1 + battle-item/manual-use agency (90j), not new systems.

### 4. Energy tension (si7.2) — outbound risk is real; the collapse is on the return side

"Free return-from-anywhere means there is no risk pricing on the way out — the only failure mode is wasting a run, never losing one" (web). Death banks everything, so alpha "played strictly kamikaze-optimal after run 10"; two of three ranked "make death cost something" top-3. **Counter-analysis (user, on the record):** the anti-kamikaze is *map cost* — death forfeits the remaining unharvested value of the map you spent. Today that only bites on drop-maps (alpha visibly husbanded its one drop-map like treasure — the mechanism works where value exists); free "go nearby" offers make kamikaze rational precisely because the map is worthless. As map tiers/cartography (cxq) differentiate map value, the gradient strengthens without a death penalty. **Decision: no death-cost change now; re-evaluate after map-value work.** si7.2's food-loop half stands: auto-eat + pelts→rations makes energy upkeep a chore-treadmill more than a tension source ("rations evaporate via auto-eat"; waste at near-full).

## Real findings filed (beads)

1. **Ranged/weapon-class legibility** — the ≤1-sentence fixes above, all surfaces. Console parity half: the web shows "swinging it like a club!" on an empty quiver; the console shows nothing.
2. **Map-offer rumor layer** — telegraph one qualitative hint per offer ("rumors of something ancient in the north" / biome resource tendency). The wyrm lottery was web's #1 fun-killer; bravo's coal drought was a plan-formation failure (tundra is 2× coal-dense per node vs desert, woodland has none — undiscoverable from town). First real use of `PREVIEW_FIDELITY`; feeds cxq.
3. **Web UI bug batch** — (a) **wary-monster deadlock**: adjacent "Fight ▶" is a walk action the engine rejects (`stopped: blocked`) — aggressive monsters engage on adjacency, wary ones are unfightable; (b) walk-log energy numbers don't match deltas, including `−-45e` double negatives; auto-eat mid-walk logs nothing; (c) engagement panel below the fold while map copy still says "click to walk"; (d) cleared-monster tiles keep `X` + "monster" tooltip; (e) misleading unified rejection copy ("blocked / out of energy" for 3 causes).
4. **Repack-last-loadout** — the plan is consumed at embark by design, but it reads as a *silent reset* trap (web embarked near-naked once) and costs 10+ clicks/run at exactly the moment the game sags. Add a one-click repack; bundle a pack-time "bow without arrows" nudge.
5. **Consumable-state visibility** — auto-quaff state is invisible (alpha turned it OFF believing ON, died at the wyrm with 3 unused potions; console prints eat-when-hungry but not auto-quaff); battle items consume with **no log line** (web's elixir "vanished" — bundle with 90j's manual-use design); item constants (weapon dmg, potion heal, ration energy) are nowhere — web #3: "the game is already a deterministic math puzzle and proud of it; hiding the item constants just moves the math into notebook reverse-engineering."

Minor economy notes (no beads yet): copper reads as a trap (only spyglass wants it; two agents banked 19–43); silver piles up past potion needs; a "potion pouch caps at 3" claim from web (unverified — likely a slot-pressure artifact).

## Delights worth protecting

Ice-cleats deleting ~800e off tundra reach ("the map visibly opened"); the recipe book as quiet tutorial ("I knew to want wolf-pelts three runs before I knew where wolves were"); `--reach` as a skill-expression surface; monsters dropping maps ("retroactively made killing mid-tier humanoids feel like the map-tier lottery I'd been missing"); the fight forecast ("the single best UI element in the game"); fresh-forage auto-eat; matchup discovery ("fae resist magic!" — "the most interesting hidden system in the game").

## Reproduction

Seeds `pt3-alpha`, `pt3-bravo` (console), `pt3-web` (web, `?seed=pt3-web`). Sessions were interrupted twice by API limits/overloads and resumed via agent transcripts; play depth was unaffected (23–27 runs each).
