# Blind playtest v7 — 2026-09-30 (after Set 1, rivers D96, Set 2 D97–D101)

Four Sonnet 5.5 agents, blind (no repo reads), goal "obtain the rare end-game artifact".

| Agent | Surface | Seed | Length | Furthest point |
|---|---|---|---|---|
| Alpha | headless console | `bt-alpha` | ~120 expeditions, 31 min | full mithril plate, map chain to T5; scripted the grind |
| Bravo | headless console | `bt-bravo` | ~180 runs (~60 real), 90 min | **killed the ancient-wyrm** (spyglass survey + drake-oil + greater-potions), crafted the dragonscale-cuirass; no dragonheart (20% drop, one kill) |
| Charlie | web, 1280×800 | `bt-charlie` (:3461) | ~25 expeditions, 22 min | iron + silver swords, T3 "desert of the ancients"; stuck on oak for the anvil, never found coal |
| Delta | web, 844×390 + desktop | `bt-delta` (:3462) | ~30 expeditions, 23 min | iron sword, T2 swamp/coastal; never reached T3 |

Per-agent notes and verbatim answers were kept in the session scratchpad; the substance is below.

## Web vs headless: what's real

- **Real on both surfaces:** the bag squeeze, the free local-map reroll, the free return, mid-game grind, the early discovery wall, the invisible goal. Both web agents and both console agents hit these independently.
- **Console-only artifacts (discount):** "one-click same-as-last-run loadout" (Bravo's #2 fix) — the web already has *Repack last loadout*; the console lacks it (parity gap, filed). Replay time growing with ~1,100 actions is harness cost, not game.
- **Web-only, real (phone):** drawer covers the map on embark and reopens on the last tab; the route-cost panel covers bottom-left tiles; monster sprites are taller than their tile, so tapping the body selects the tile above; *drop* removes a whole stack with no confirmation (Delta lost 5 silver ore). Desktop was "much better" (Delta).
- **Web claims checked and discounted/reworded:** "bag full at 7/8" (Alpha, console) is correct — a kill whose loot is two different items needs two free slots — but the copy doesn't say so. No stale-bundle symptoms (fresh servers, per-agent sessions).

## Verdict: iterate

The **early game works**: discovering forage → tools, the tight bag, the fight preview ("kill in N", praised by 3/4), and map hints driving the loadout (Delta: "the game's best decision"; Bravo: "a lot"). The endgame is reachable blind (Bravo got to the wyrm and solved it with the intended tools). But **the middle loses its stakes**: 4/4 found repeatable thoughtless patterns, both console agents wrote scripts to play for them, and 3/4 said the middle turns into grind.

## Convergent signals

1. **Nothing is at stake mid-game (4/4).** The local map rerolls for free (return is free and instant), so every agent brute-forced map hints / camp proximity. Return also heals, so a bad run costs nothing (Delta: "I never risked anything"). Map choice became luck-by-reroll rather than judgement. This collides with D62 (free return, tension = depth-vs-haul): the haul tension exists *within* a run, but the reroll removes it *between* runs.
2. **The bag decides runs, not energy (4/4).** Runs end after 3–5 gathers because slots fill before energy runs out; each food unit, tool and loot stack takes a slot; a fight needs free slots for its loot. 2/2 web agents ranked a bag fix top-3.
3. **Power curve flattens (2/2 who got there).** Steel/mithril plate drops camp hits to 1–2; "walk to camp, press fight" beat every humanoid; raider-supplies → trail-ration 1:1 ended food scarcity (61 and 72 banked). Both late players asked for fights that stay dangerous or armour with a trade-off.
4. **The goal is invisible (3/4).** No agent learned what the artifact is; all inferred "dragon" from the recipe book. No in-world rumour of the wyrm, and the T5 "ancients" map that holds it is a long, luck-heavy chain to re-find.
5. **Early discovery wall (4/4).** Nothing says where flint/deadwood come from; node sprites don't reveal yield (a crystal is ice-moss; a herb can be flint). ~10 runs to find the tool chain (Delta).
6. **Set 2 barely reached (0/4 threw a flask).** Flasks sit behind the still (glass + copper) and mid-game materials; 3/4 never built one. Poison met by 1/4 (jungle, Alpha) — **the antidote recipe was undiscoverable** (field-only recipes are left out of the town recipe book; D98's "brew at home" never worked). Spores met by 2/4: a minor routing/HP tax, both routed around, neither built the mask.
7. **Water is a heavy energy tax (3/4)**; fishing is the best water payoff when found (Delta: perch nets +35e without a slot). Alpha crafted a rod but never realised where to cast.

## Follow-ups

Bugs / legibility (filed, fix without a design call):
- Antidote (and every field recipe) missing from the town recipe book.
- Loot-needs-N-slots copy on the "bag full" fight rejection.
- Console parity: a repack-last-loadout action.
- Phone: sprite tap target, drawer covering the map on embark, drop-stack confirmation.

Design calls for the user (the playtest's real questions):
- **Stakes between runs:** cost or limit the local-map reroll, and/or make retreating cost something — without undoing D62's free return inside a run.
- **Bag squeeze:** food stacking, a slot-cheaper food, or an earlier bag step.
- **Mid/late tension:** camp difficulty scaling with tier, or armour with a trade-off.
- **Goal visibility:** rumours of the wyrm / the ancients map, so the chase has a target.
- **Set 2 reach:** move a first flask or the still earlier so the alchemist path is met in the mid game.
