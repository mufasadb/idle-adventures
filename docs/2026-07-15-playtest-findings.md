# Blind Playtest Findings — 2026-07-15

**Fleet:** 3 blind agents, no code access, aiming for the end-game artifact.
- **alpha** — headless console, seed `12345` (~12 runs)
- **bravo** — headless console, seed `73019` (15 runs)
- **charlie** — **real web UI**, seed `webrun1` (6 runs) — *primary signal; build-freshness self-check PASSED*

**Trigger:** re-validate the map-economy epic (zpm) that just shipped (free local map vs. earned/spent maps, map tiers, two-step Plan→Embark town flow), and re-check early-game feel (bead **ksu**, post-wzk/D63 legibility).

**Verdict: ITERATE.** The loop's *bones* are good and all three agents felt it the instant it opened (the club→first-kill beat, the combat forecast, the humanoid→map-drop loop were each cited as genuinely good hooks). But **the loop cannot spin for a blind player**: rung one (first tool/weapon) is effectively undiscoverable, and the just-shipped map economy has **no accessible payoff** yet, so both probes collapsed to "click the free map." Fix the bootstrap legibility first — nothing downstream matters until a normal player reliably reaches their first weapon.

---

## Web-vs-headless cross-check (the methodology payoff)

Every headline finding was checked for "is this a harness artifact or a real game problem?" — the result is that the two biggest findings are **confirmed real on both surfaces**, which is the strongest signal this method produces.

| Finding | Console (alpha, bravo) | Web (charlie, build-fresh) | Verdict |
|---|---|---|---|
| **Bootstrap wall** (can't reach first tool) | 2/2 blocked | Blocked (6 runs) | **REAL — 3/3, both surfaces.** Also confirmed against `constants.ts`. Not an artifact. |
| **Map economy inert** | Never even *reached* it (weapon-locked, no humanoid kills) | **Activated it** (killed humanoids → T2 map banked) and *still* found tier payoff-less | **REAL — web proves the economy runs and is still inert.** Strongest possible form of this finding. |
| **Combat quality** | Fine; matchup lessons land | Praised — the forecast ("you hit 1, it hits 4 — kill in 8" / "it wins the race") is a highlight | No parity gap; combat is a strength. |
| Unarmed winnability | "unarmed mostly loses; only soft 8-HP animals" | "kill-in-8 humanoids winnable at 30 HP + 1 potion" | **Divergence = seed variance**, not a parity gap (HP resets per embark; charlie's seed had reachable kill-in-8 humanoids). Both surfaces share the same combat. |

**No console-parity gaps found this run** (pre-flight verified: console signposts walk-onto-monster combat, the carry counter, near-node perception, gate hints, and `route` works through `bun run playtest`). The web build-freshness check passed, so charlie's feature-existence claims are trustworthy.

---

## Convergent findings (ranked)

### F1 — CRITICAL: the first-tool bootstrap is effectively undiscoverable
**3/3 agents, both surfaces.** Every tool/weapon needs **flint** or **deadwood** (club ← 2 deadwood; knife ← 1 flint; pick ← flint + deadwood). Those materials **do** exist bare-hand — but they're buried as rare rolls in the single generic **`herb` forage node** (woodland weights: forest-herb **7**, deadwood **3**, flint **2** of 13; verified in `src/data/constants.ts:84`). Consequences:
- Every forage node shows the same "H"/"herb" marker at range; you can't tell which one holds flint/deadwood without walking onto it, and most (7/13) are just forest-herb.
- **Nothing links** the recipe book's "club ← deadwood" to "deadwood is a forage drop." The book shows 100+ recipes but never hints where tier-1 materials come from.
- **Result:** alpha never found either and concluded "deadlock"; bravo found deadwood *by accident on run 12*, never found flint; charlie found neither in 6 runs. All three spent most of their session *proving the wall was real* — "engagement shifted from playing to QA" (charlie).

**This is not a data deadlock — it's a legibility/discoverability failure**, and it directly answers bead **ksu**: the wzk/D63 legibility pass did **not** make the bootstrap discoverable in a reasonable number of runs. 3/3 blind agents with infinite patience still failed.

> **Design decision for the user (not auto-fixable):** wzk deliberately *relaxed* the "~3–4 runs" acceptance in favor of "deliberate/incremental progression; no onboarding tell." This playtest shows that philosophy currently yields *"the game looks broken"* for a blind player, not *"a satisfying slow burn."* Options range from a hard tell (start with a knife / guaranteed first-humanoid flint drop) to a soft one (a distinct forage-node marker or flavor when it holds a tool-material; a first-tier ingredient-source whisper). **The call on how much to signpost is yours** — F1 files the problem, not a mandated fix.

### F2 — HIGH: the map economy has no accessible payoff (the thing that just shipped)
**Both probes, 3/3.** The free-vs-earned distinction is *understood* — the UI teaches it well (charlie: "FREE · ALWAYS HERE" vs "Your maps — earned from humanoid drops · each spent on embark"; the SPEND warning sits right on the Embark button). But:
- **"Which map to embark" is a confirm button, not a decision.** There is only ever one free local map + an (empty, for console) earned list. No branch point. Both consoles: "clicked through." A real decision needs **≥2 maps on the table at once** with legible tradeoffs.
- **Tier is cosmetic in practice.** charlie spent a **T2 Desert** map and got *the same Sand Raider with the same Raider Supplies drop* as T1; its richer copper/ore nodes were tool-locked (see F1). "Creativity was punished with wasted energy, not rewarded" — a 21-tile, ~250-energy trek to a "deep" monster yielded another identical Sand Raider. Higher tiers must deliver **visibly better/different haul** (better drops, or the flint/ore you can't get on T1) for the SPEND decision to have teeth.
- Console agents never even reached the economy (weapon-locked → couldn't kill humanoids → never earned a map → **tier was 100% invisible across 27 combined runs**). So F1 also starves F2.

### F3 — HIGH: the recipe book is over-exposed; it hides the 3 recipes that matter
**alpha + bravo.** 100+ recipes (including endgame dragonscale-cuirass, mithril plate) are dumped at run 0, drowning club/knife/pick. bravo: *"obvious where it should be mysterious, mysterious where it should be obvious."* Consider progressive reveal (recipes surface as their tier becomes reachable) and a soft first-tier ingredient-source hint. (Note: deliberate ingredient-source hiding is a design choice — but the *first* tier being hidden is what produces the F1 confusion.)

### F4 — MEDIUM: routing / map friction (real mechanic per eot/D74, not artifact)
- **Web (charlie):** the portrait map is **taller than the viewport** → constant scrolling to keep player+target on screen (a tile must be scrolled into view to click/waypoint it). Route **"cancel" only drops the last waypoint**; fully clearing a botched route requires the non-obvious "click your own tile." Fixes: **auto-scroll to follow the player**, add an explicit **"clear route"** button. (Overlaps beads **4gm** wide-layout/no-scroll and **9e0** terrain legibility.)
- **Console (alpha):** mountain-maze spawn + straight legs that silently stall on corners made traversal the dominant activity.
- The ✗-blocked-leg warning and energy preview were both praised — the friction is in *scrolling and route-clearing*, not the straight-line model itself.

### F5 — LOW / possible bug: spurious map-loot log line
**Web (charlie):** after killing a **non-humanoid** Mirage Wisp, the log printed *"🗺️ looted a T2 Desert map (takes 1 slot — banks home with you)"* but **no map banked** (the "Your maps" list stayed empty). Likely a full map-pocket (1/1) with no legible "pocket full, map dropped" reason, or a loot line firing on a non-map kill. Worth a quick repro.

---

## What's working (don't break these)
- **Combat feel + the forecast** — the single most-praised element across all three. Round-by-round panel, "kill in 8" vs "it wins the race," HP-not-energy cost, matchup lessons.
- **The eat-to-free-a-slot / food-as-range mechanic** — "genuinely good" (charlie); alpha's one high-impact novel idea was packing food purely as fuel to double range.
- **The map-economy UI teaching** — the free-vs-spend distinction is legible *in the moment*; the problem is payoff (F2), not comprehension.
- **The aspirational endgame tree** — all three saw the dragonheart→wyrmfang / dragonscale chain and found it a real hook. The problem is nobody can climb toward it.

## Q2/Q3 summary (decisions mattering / thoughtless patterns)
All three independently reported the loop collapses to **one mindless pattern** once found — console: "pack rations → route to soft monster → punch 8× → grab drop → return"; web: "embark free map → walk to nearest kill-in-8 humanoid → auto-finish with a potion → collect map → return." Q2: the *only* consequential decision was loadout (how much food = range); map choice, target choice, and route were forced or inert. This is the on-rails signal the method is built to catch, and here it traces entirely to F1+F2 (the branches don't exist yet because progression is walled at rung one).

## Reproducibility
Seeds: alpha `12345`, bravo `73019`, charlie `webrun1` (web, `?seed=webrun1`). Build green at time of run (576 tests). Web served on `:3111` with cache-buster; freshness check passed.
