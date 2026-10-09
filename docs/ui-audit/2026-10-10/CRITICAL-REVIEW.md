# Idle Adventure: a critical UI review

Scope: the 78 screenshots (723×623, touch device), README.md's statement of intent, the Jim Brown GDC talk (transcript + visual notes) and the principles sheet. Screenshot numbers are in brackets. Every criticism names the principle it breaks and the source of that principle. Sources are abbreviated as follows: **Brown** (the talk), **Hodent** (UX pillars), **Norman**, **Nielsen #n** (heuristics), **Gestalt**, **Fitts/Hick**, **GAG** (Game Accessibility Guidelines), **F&L** (Fagerholt & Lorentzon diegetic layers), **Swink/Juice** (game feel).

My headline differs from the earlier review. **This UI's biggest problem is not that it looks inconsistent. It is that it never shows the player what they are trying to achieve, and in three places it teaches the wrong rules.** Unifying colours and panels (REVIEW.md's top priority) gives you a tidier screen that still mis-teaches the core loop.

---

## 1. What Brown argues, and what it means for this game

| # | Brown's idea (with his example) | How it maps onto Idle Adventure |
|---|---|---|
| 1 | **Three shared goals of UX and design: clarify intent, show empathy, provide meaning.** Clarifying intent runs both ways: the player must understand the designer's intent, *and* the designer must be able to read the player's intent. | The designer's intent is stated in one sentence: *depth vs haul under an energy + HP budget; return is free* (README primer 5). That sentence appears on no screen except a confirm dialog shown after the player has already decided to go home (74). The other direction fails too: the route planner reads "tap a tile" as "straight line through anything" (57), so it can't tell that the player wants to *go around* the djinn. |
| 2 | **Perception is interpretation shaped by context and prior knowledge** ("B" vs "13"; colour stripes vs Street Fighter cast). | The same red reads as HP (45), "slow tile" (62), "impassable" (58), "you'd lose" (55), "1 slot" (33), "doff" (67) and water (45, 64). The player's prior knowledge says red means danger, and this context can't override that. |
| 3 | **Gestalt similarity and proximity set how many things the player has to parse** (Serious Sam groups; the biggest threat is missed because it is neither similar nor near anything). | Map monsters (45, 61, 64, 75) are individual sprites whose sizes come from the art, not their threat: the scorpion in 45 is huge, the wisp in 53 is tiny. Nothing groups them into "I beat these / I lose to these" until you tap one. The verdict already exists in the engine but appears only on the card. |
| 4 | **Teach threat categories by visual family** (Fortnite husks are humanoid, mist monsters are big and purple, so a new enemy is pre-categorised). | Animals (hide/feather icons, gatherable), monsters (sprites) and humanoid camps (which drop maps, the most valuable item) share one visual language. Humanoid camps, the source of the map economy, look like any other monster (64: the axe-man; 75: two outlined figures). |
| 5 | **Funnel to reduce cognitive load and line up the player's intent with the designer's** (luring husks into a chokepoint so a squad becomes one target). | The equivalent here is batching: a multi-waypoint route that sweeps several nodes (59) is the "funnel". The UI shows the cost of the sweep (−48⚡) but not its payoff (what the nodes yield, whether it fits in the bag), so the player can't judge whether this sweep beats another one. |
| 6 | **Negative space and contrast direct attention** (Unreal Tournament towers; Fortnite landing zones read as dark rooftops). | The cost tint (45, 62, 64) fills the whole map with mid-saturation colour, so it has **no negative space**. Nothing pops: not the hero, not nodes, not monsters. On the desert map (46–60) the tint is nearly uniform and carries no information at all. |
| 7 | **Shape affordances: round = safe, rectangular = useful, pointy = danger** (Naughty Dog, Fortnite overlays). | Every interactive element here is the same rounded rectangle with a gold outline: Fight, Flee, Doff Axe, Stay, Prepare, take it, Cost colours: on (52, 67). Form never carries function (see Hodent below). |
| 8 | **Never let the game lie: if it looks like cover it must be cover** (Gears' cover all one height). | "⚠ strands you" (60) lies: return is free, so you cannot be stranded. "Iron Pick (worn)" (48) lies: tools take slots and are not worn. "9/14 bag" (45) half-lies: 9 of those 14 are supplies, not haul. The "Can make" filter (25) nominally filters, but in practice changes one node. |
| 9 | **Systems should be designed in "4D": how they feel over time, not as a spreadsheet** (the Zap-Zapp pistol's stats vs the journey to max it). | The crafting tree (16) is a 2D spreadsheet of 34+30+4 nodes with ×N badges. Nothing says which item is the next *upgrade* (Iron Pick vs Pick), what it changes on the next run, or where the journey ends. |
| 10 | **Chunk long goals into visible, trackable steps with feedback and shown rewards** (Fortnite quest circles). | There's no goal chunking anywhere. The closest thing is "34 known · 12 hidden" per tier (16). No run summary (78), no "next unlock", no visible end goal. The loop's payoff screen is two lines of flavour text. |
| 11 | **Use systems to manufacture the feeling you want, and make it readable to every skill level** (Gears' Crimson Omen: one central sign with layered cues; magic bullets that reward novices' habits). | The verdict pill (53–56, 67–70) is this game's Crimson Omen and is its best idea. It stops short, though: it doesn't follow you onto the map, doesn't show the HP the fight will cost, and the primary button ignores it (Fight stays gold at YOU'D LOSE, 55/70). The "magic bullets" lesson applies to novices who pack nothing but tools and food: the UI should make sure they still bring something home (see §4). |
| 12 | **"Don't be the bear": speak the other side's language. Systems are about the player, not the data.** | Dev language leaks everywhere: `silver-ore`, `ironwood-log` (17, 28), `fire-kit + cooking-pot` (71), `(26,11)` (50), `(28,18)` (57), `seed "aud-gather"` (42), T:/G:/B: (07), "doff", "+spare", "quaff". This is the data talking, not the player. |

---

## 2. Scorecard

Scale: 1 = actively harms play, 3 = adequate with clear gaps, 5 = exemplary.

### Hodent usability pillars
| Pillar | Score | Evidence |
|---|---|---|
| **Signs & feedback** | **3** | *Good:* pickup "+3" cues fly to the bag (61); the new bag row glows (33); the energy projection "282/300 → 254" (53); the verdict pill (53–56); the gate opens and closes (41, 77). *Bad:* the HP cost of a fight is never projected, although energy is (53 vs 54); there's no run-end haul (78); the material-lit filter shows nothing visible (24); "Not yet" at 0⚡ (76) leaves you with no visible available action; toasts cover the energy number at the moment it changes (52, 72, 73). |
| **Clarity** | **2** | The cost tint destroys figure/ground (45, 62, 64). Nodes and monsters are 16–24px, bobbers about 6px (45). Tree mini-costs are about 10px (16). Red carries 10+ meanings (§3). In the tree, 56 green "can make" badges (16, 25) make green meaningless: when everything glows, nothing does. |
| **Form follows function** | **2** | Settings toggles look like action buttons (52). Worn rows look like labels but open a menu (34→35). Staked plots look like decoration but open a build recipe (01, 29). The bottom log strip looks like a status bar but is a button (02). ⚔ renders as × ("× Fight", 53, 67), which reads as close/none. Fight at YOU'D LOSE looks as inviting as at CLEAN WIN (55, 70). |
| **Consistency** | **2** | Six panel surfaces (REVIEW §4.1 is right). Four verbs for "add to plan" (pack, +spare, take it, Prepare). Tier is written "TIER I" (16), "Tier 1" (17), "T1" (07) and "TI" (32). The tool edge is gold-dashed (20) or blue-dashed (29). Locks are grey (16), green-ish (20) or orange (71). Horse and Panniers appear in both Bank (10) and Stable (11) with different verbs. |
| **Minimum workload** | **2** | Packing makes the player do the core arithmetic in their head: each ration = +80⚡ ≈ N tiles, but also −1 slot = −5 loot. The two halves sit at opposite ends of the screen (footer vs header, 34, 36). Research is free-text **recall** (13), and a miss still costs a search. Routing has no pathfinding, so going around a monster means placing waypoints by hand (57). The bank is an unsorted 30-row list (09, 10). |
| **Error prevention / recovery** | **3** | *Good:* the verdict, the ambush warning (57), the blocked route naming the gear that fixes it (58), and "⚠ embarking SPENDS this map" (39). *Bad:* Embark stays gold-primary with "⚠ bag full before you start" (36). Fight stays primary at YOU'D LOSE (55, 70). `new game` (wipe save) is a plain link next to the view toggle (01) and inside expedition Settings (52). A research miss is irreversible and has no preview. |
| **Flexibility** | **3** | Auto-gather, auto-potion, auto-finish (52), the ≡ menus fallback (42), WASD/pan buttons (46). Missing: text size, colour-blind safe palette (the verdict and the tint are colour-dependent, GAG), reduced motion, a "hide tint" that doesn't also hide terrain. |

### Engage-ability (Hodent)
| Pillar | Score | Evidence |
|---|---|---|
| Motivation (competence/autonomy) | 2 | Autonomy is high (open map, free routing). Competence feedback is near zero: the player never learns whether a run was good (78) or what the next run should change. |
| Emotion / game feel | 2 | The woodcut town is lovely (01–04). The payoff moments are flat: a craft gives a toast plus a duplicate inline line (28); returning home gives two lines in a black panel (78); a fight is a button grid (67). Swink/Juice: the biggest payoff (the haul) gets the least celebration. |
| Game flow / onboarding | 1 | No first verb is shown on first launch (01: no gate on screen, no labels). No "tap a tile" hint on the first expedition (45). The rules that matter (return free, slots, fog, tiers) are taught in body copy, after the fact, or never. |

### Brown's three goals
| Goal | Score | Evidence |
|---|---|---|
| **Clarify intent** | **2** | The designer's thesis (depth vs haul; return is free) is invisible until 74 and contradicted by 60. Player intent is mis-read by the straight-line router (57) and by the auto-engage on the line. |
| **Empathy** | **3** | The game is kind where it chooses to be: verdicts, ambush warnings, "the trip home is free" copy, and the exhausted card that prevents a soft-lock (75). It is careless elsewhere: the colour noise, dev text, a miss costing a search, and the hidden gestures. |
| **Meaning** | **1.5** | No haul value, no run summary, no visible long-term goal, no "this upgrade lets you reach X next time". The tree is a 2D spreadsheet (Brown's Zap-Zapp anti-example). The research hit card (14) is the one place where a reward and its "why" appear together. |

**Overall: 2.3 / 5.** The bones (verdict, route projection, packing gauge) are better than the score suggests. The score is low because the bones aren't connected to the loop's purpose.

---

## 3. Critique by screen group

### 3.1 Town square (01–05, 31, 40, 41, 77)
| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| The square has **no primary action**. Six equal tabs (Maps, Bank, Recipes, Research, Stable, Log) compete, and the loop's verb ("go out") is not among them until a map is picked, when **Pack ▶** appears (31). | 01, 02 | Visual hierarchy / one primary per screen (principles §4); Hick's law; Hodent onboarding by doing | One persistent primary CTA, bottom-right in the thumb zone: **"Set out ▶"** (it opens the map board, then becomes "Pack ▶", then "Embark ▶"). Demote the six tabs to a quieter nav. |
| Buildings unlabelled, and the gate is off-screen on first launch. REVIEW said this; I agree. Additional point: the tabs are named for functions (Recipes, Maps) while the buildings are objects (anvil shed, notice board), so the player has to learn a two-way mapping. | 01, 03, 04 | Norman mapping; Nielsen #6 recognition over recall | Permanent nameplates **named the same as the tabs** ("Workshop", "Map board"). Rename the Recipes tab to "Workshop". |
| Plots look like dig sites. Tapping one throws you into a full-screen spreadsheet (29) instead of building in place. | 01, 29 | Form follows function (Hodent); F&L: the diegetic object should own its interaction | A plot shows a signboard "Build: Still (3 vials, 2 copper)" with need/have, and builds in the square. The workshop tray is for recipes, not real estate. |
| `new game` (destructive) is the same weight as the `≡ menus` view toggle and sits beside it. | 01–05 | Error prevention (Hodent, Nielsen #5); Fitts: destructive actions small and far | Move it into Settings behind a typed confirm. |
| The bottom strip's "Nothing here worth your time, you amble home" after a run in which you **chopped 3 oak logs** (12). It reads as "the world was empty", not "you came back with 260⚡ unspent". | 02, 77 | Brown: don't let the game lie; Nielsen #2 match the real world | See §4: the run-end line must state the haul and the unspent budget. |
| Stale guidance: the "packing cloth is by the gate ▶" chip still shows while you're walking out of the gate (41). The plan is visible on the cloth (40, good), but **which map** is chosen is never visible in the world. | 40, 41 | Visibility of system status (Nielsen #1) | Kill the chip once you're at the cloth. Pin the chosen map on the gate (a small parchment nailed to the post). |

### 3.2 Town panels: maps, bank, stable, log, research (06–15, 30, 42–44)
| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| **Map board offers no decision support.** You choose between a free T1 and a spent T2/T3, but no card says what the tier *gets you* (better nodes? harder monsters? which recipes become reachable?). "3 runs old" is shown but its meaning isn't. "Desert Map **Of Carbon**" (08) is an affix with no explanation. | 07, 08, 30, 42 | Brown "meaning" (systems show rewards up front, as in the quest screen); Into the Breach preview (principles §6) | Each map card gets a one-line **"what's out there"** summary: *T2 · iron & silver ore · monsters hit harder · affix: more coal*, and a risk/reward chip matched to your current kit ("your Iron Pick ✓", "no answer to magic ✗"). |
| T:/G:/B: hint chips with no key; "[sealed bounty]" looks disabled. REVIEW is right. Additional point: three Study buttons in a row at 1 copper each invite blind spending with no preview of what *kind* of info it buys. | 07, 08 | Nielsen #6, #2 | Spell out "Threat / Ground / Bounty" and use a padlock-parchment visual for sealed hints ("Study to unseal"). |
| **Bank is a debug dump**, as REVIEW says. Its deeper problem is that it is a *second packing UI* with worse affordances: Horse shows **pack** and **+spare** in the Bank (10) and **take it** in the Stable (11), three verbs for one item in two places. "+spare horse" is meaningless. | 09, 10, 11, 43 | Consistency (Hodent); Nielsen #4 | Bank becomes **read-only storage** grouped by kind with icons and counts. All packing happens on the packing sheet. Stable folds into Bank as "Animals". |
| **Research is pure recall.** Free-text guessing with a keyboard that will cover half the screen on a phone. A miss ("spaceship") costs a search. The design wants "learning the vocabulary to pay off" (README 15), but the UI gives no vocabulary to learn *from*. REVIEW calls this screen one that works, and I disagree. | 13–15, 44 | Nielsen #6 recognition over recall; Hodent minimum workload; error prevention | Keep typing, but add **suggestion chips** built from words the player has already met: item names, hint words ("boat", "ore", "spores"), and the tree's hidden-count categories ("Tier II · carrying: 3 hidden"). A miss on a suggested word becomes impossible, and a typed word still costs. |
| The Research hit card (14) is a dark ink card inside parchment inside an ink panel, three surfaces deep. Its inputs use a letter placeholder "D" for Driftwood. | 14 | Consistency; form follows function | Show the recipe card on parchment and use a silhouette for unheld items. |
| Log is a flat text dump, and the expedition's per-walk log (50) does not survive the trip home (78 shows only the end line). | 12, 50, 78 | Visibility of status; Brown meaning | See fix #1 in §7 (the run report). |
| The ≡ menus fallback leaks the seed, lacks Stable, and puts Log under Research (42–44). REVIEW is right. | 42–44 | Consistency | Same panels, same tabs. |

### 3.3 Crafting tree (16–29, 38)
| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| **Green ×N on 56 nodes = no signal.** When nearly everything is craftable, the badge that should mean "do this" is ambient noise. Brown's Serious Sam point in reverse: the one node that matters (an *upgrade* to something in your kit) has no similarity or proximity cue. | 16, 25, 38 | Gestalt similarity (Brown); pre-attentive attributes reserved for what matters (principles §4) | Quiet the ×N to ink. Add **one** highlight state, **"Upgrade"** (gold ★), on nodes that beat an item you own in the same slot (Iron Pick over Pick, Iron Axe over Axe). The Make now strip lists upgrades first, not Ration/Jam. |
| **2D spreadsheet, no 4D.** The tray says "tool · pick — unlocks coal, salt, silver-ore" (17) in dev ids, and never states the consequence in *run terms*: "lets you mine coal on T1/T2 maps; Pick can't". | 17, 28 | Brown 4D systems / "systems are about the player, not the data" | The tray's description line becomes **"On your next run:"** + plain consequence. Drop raw ids. |
| **Stations, tools and materials are conflated.** The Still (a building) is "a crafting material" and "Used in: Silver Oil (as the tool)" (29). Arrow Shaft "needs Fletchers Knife", but the knife is ×8 craftable in Make now. The real rule (must be *held* in town) is never stated. | 20, 29 | Norman conceptual model; Nielsen #2 | Three distinct lock reasons with three icons: 🏠 *needs station built*, ⚒ *needs tool in the bank*, ✗ *short materials*. The Still's tray reads "Station · build in town square". |
| "Can make" dims one node (25). The material-lit filter is invisible (24), and nothing shows that a filter is active. REVIEW is right. | 23–25 | Signs & feedback | Hide non-matching nodes, and show an active-filter chip in the header ("Iron Ore ✕"). |
| Field view is a different UI (26) and still shows the town Make now strip. | 26 | Consistency | Same node component, plus a "made in the field" ribbon. |
| Double feedback: the toast covers the filter tabs **and** an inline line appears (28). Toast and inline note also disagree on position across screens (28 vs 72). | 28 | Aesthetic & minimalist (Nielsen #8) | Inline only when the source panel is open. |
| Row bands are unlabelled (16). The tier header reads "TIER I" while the tray reads "Tier 1". | 16, 17, 19 | Consistency | Label the rows; use one numeral system. |

### 3.4 Gate and packing (30–39)
The packing sheet is the most informative screen in the game, and REVIEW calls it the best. It is also where the core decision is made, and it **doesn't frame that decision**.

| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| **The core trade-off isn't shown as one trade-off.** Food lives in the footer as "Energy 300 + 720 from food"; slots live in the header as "BAG 14/14 · 0 free: no room for loot". The player must work out: 9 rations = +720⚡ and −45 loot capacity. That is the whole game, and the UI makes you do it in your head. | 34, 36, 39 | Hodent minimum workload ("show the answer, not the inputs"); Brown clarify intent | One **trade-off bar** under the gauge: *"Reach ≈ 64 tiles of walking or 25 gathers · Room for 30 loot"*, recomputed on every pack/unpack, and a delta flash on change ("+80⚡ ≈ +6 tiles · −5 loot"). |
| Filled supply cells are **red-brown** and loot cells are dashed green (33–36). This may be deliberate (supplies cost haul), but red already means error. | 33, 34 | Colour semantics (principles §4) | Supplies cells = neutral parchment/ink; free cells = outlined; loot after the run = gold. |
| Embark ▶ stays gold-primary with "⚠ bag full before you start" (36), and with "⚠ no food" (32). | 32, 36 | Error prevention (Hodent); Into the Breach preview | Warnings become blocking chips: Embark turns secondary and asks "Embark anyway?" on a bag-full start. |
| Two kinds of grey chip (material vs doesn't fit) look identical (32, 36). REVIEW is right. Additional point: materials shouldn't be in the pack list at all. They can never be packed, so showing them is pure Hick's-law cost. | 32, 36, 39 | Hick; minimalist design (Nielsen #8) | Hide materials from the packing bank; keep "doesn't fit" chips with a small slot icon. |
| Worn swap is a hidden affordance (34→35), and "take off" is red. | 34, 35 | Norman signifiers | ▾ on each worn chip; neutral "Take off". |
| "Expected haul" (32, 34) is the best line on the sheet and is buried in 11px body text on the left page. | 32, 34, 39 | Visual hierarchy | Promote it: icons of expected resources, each ticked/crossed against the tools packed (the same mechanism as the scout-report checks in 39). |
| Recipes tab swaps to a full-screen tree with ✕ (38). REVIEW is right. | 38 | Consistency of navigation | Keep the Pack/Recipes tabs visible on the tree. |
| Item card copy: "melee dmg — melee — hand-to-hand"; "Where it comes from: Crafted" (37). | 37 | Nielsen #2 | "Crafted at the Workshop from 2 Oak Log". |

### 3.5 Expedition map and drawer (45–52, 61–66)
| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| **The HUD doesn't show the objective.** It shows Energy and HP (the budget) but not the haul (the score). "9/14 bag" on the handle counts *supplies + loot* together, so at embark the player sees a bag that is already "mostly full" (45). | 45–66 | Brown clarify intent + meaning; Nielsen #1 | HUD third row: **"Haul: 6 · room for 24"** (loot only), in gold. The bag tab grid separates supplies (top) from loot (bottom). |
| **Cost tint kills figure/ground and terrain identity**, as REVIEW says. Water becomes maroon (45, 64), and woodland is a patchwork (62). Additional point: on the desert maps (46–60) the tint is almost uniform, so it costs clarity and gives nothing back. | 45, 46, 62, 64, 74–76 | Brown negative space & contrast; GAG colour-only | Default **off**. Show cost only along a planned route (per-tile step numbers on the blue outline) or as a hold-to-preview. Keep terrain hue. |
| **Monsters carry no threat category on the map.** You learn "you'd lose" only by tapping each one. Unexplained teal tile outlines appear on some monsters (64, 75, 76) as yet another colour meaning. | 45, 53, 61, 64, 75, 76 | Brown/Gestalt similarity (Fortnite husks vs mist monsters) | A small verdict pip (●green/●amber/●red **plus a shape**: circle/diamond/triangle, after Brown's shape affordances) under every visible monster. A distinct banner or flag silhouette for humanoid camps (map droppers). Define or remove the teal. |
| Tools labelled "(worn)" and given doff (48, 51, 73). That is the wrong model (§4). Ten "doff" rows bury the two "drop" rows that are the real in-bag decision (51). | 48, 51, 73 | Brown don't lie; Hick | Tools sit in the slot grid. Long-press a slot gives Drop/Take off. The list below the grid disappears. |
| Settings under "Here" (47, 52); toggles that look like buttons; `new game` inside the expedition. REVIEW is right. | 47, 52 | Form follows function | Settings move to a ⚙ in the HUD and use real switches. |
| Pan buttons ▲▼◀▶ sit at mid-edges, overlapping content and the drawer seam (47, 48). ▲ clips the "Mountain · can't reach" label (58). On a 723px-wide touch screen, drag already pans. | 45–76 | Fitts; minimalist design | Hide pan buttons on `pointer: coarse`; keep ◎. |
| Desktop language on a phone: "long-press / right-click" (48). There's no indicator of which food auto-eats. | 48 | GAG; Nielsen #1 | "Hold a food to set it as auto-eat"; ★ badge on that food. |
| Quick-action button (🎣 Fish / 🪓 Chop, bottom-right) is **good** (Fitts, thumb zone). Inconsistent label with the drawer ("Chop" vs "Chop it", 62/63), and the Here tab embeds the Fish button mid-sentence (65). | 62–65 | Consistency | One action row component: [icon verb] · cost · result. |
| Fishing: a 6px bobber marks the castable water (45, 64). Feedback after a cast is a catch icon on the tile and a bag tick (66). There's no "+1 Salmon" lift like the gather cue (61). | 45, 64, 66 | Signs & feedback consistency | Reuse the 61 pickup cue for every gain. |
| Black void at the map edge (61, 64, 66–70) and the column hairlines (50, 61, 67–70). | — | Clarity | Paint an edge (fog, cliff, map border). |

### 3.6 Routing and pre-fight (53–60)
| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| **"⚠ strands you" teaches the wrong rule.** Return is free (README 5; 74). Running dry ends *extraction*, not the run. A player who believes "strands" will turn back early, which is exactly the behaviour D62 tries to remove. | 60 | Brown don't let the game lie; Norman conceptual model | "→ 0⚡ · **ends your gathering here** (going home is still free)". Amber, not red. |
| **Energy is previewed but HP is not.** The HUD shows "282 → 254" for energy (53) and nothing for HP, although the fight is the bigger risk. "CLEAN WIN" at full HP and at half HP look identical. | 53–56 | Consistency; Into the Breach preview = trust (principles §6) | Project HP too: a "30 → ~22" ghost segment on the HP bar. The verdict-without-numbers rule (D103) can stay for the card; a bar *segment* isn't a number. |
| **Route card shows cost, never reward.** "8 tiles · −48⚡" (59), but not "→ 2 ore veins · +6 iron ore · fits ✓". The label "Ore vein → ?" (59) uses "?" with no meaning. Pre-fight loot doesn't say whether it will fit in the bag (53). | 53, 56, 59 | Brown funnel/batching = aligned intent; Hodent "show the answer" | Route card line 2: **yield icons ×N + "fits"/"won't fit (2 short)"**. |
| **The router ignores obvious intent.** Straight lines, no pathfinding, auto-engage on the line. The warning (57) quotes coordinates the map never shows and doesn't highlight the djinn. The target label names the empty tile ("Plains"). | 57 | Brown clarify (designer must read player intent); Nielsen #9 diagnose errors | Ring the blocking monster red on the map; add a one-tap **"route around"** (insert the waypoint for the player). If straight lines are a design pillar, at least draw the line through the monster in red. |
| Fight ▶ / Walk ▶ stay gold-primary at YOU'D LOSE (55) and on an ambush route (57). The blocked route still projects an energy spend in the HUD (58: "→ 262") for a route that can't be walked. | 55, 57, 58 | Error prevention; form follows function | The primary button follows the verdict. No projection for an illegal route. |
| ⚔ renders as × (53–56, 67–70). REVIEW is right. | — | Clarity | SVG glyph set. |
| The pre-fight card floats over the bottom-left map quadrant and covers the ▼ pan control and part of the route (53–60). | 53–60 | Fitts/occlusion | Dock it to the drawer edge (landscape) or bottom sheet. |

### 3.7 Fight (67–70)
| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| **Eight Doff buttons with red bag icons** dominate the action area. Fight/Flee/Quaff are a small row above them. REVIEW is right about the hierarchy. My additional point is that this is a Hick's-law failure at the *most time-pressured* decision: 11 options when 3 matter. | 67–70 | Hick; visual hierarchy; Brown cognitive load in encounters | Three large buttons (Fight · Quaff · Flee). One "Gear ▾" for swaps that **change the verdict** (preview the verdict inside the menu). Hide doff for tools entirely. |
| Primary styling doesn't follow the verdict: "Fight" keeps the gold outline at YOU'D LOSE (70). Flee looks like any other button. | 69, 70 | Error prevention; Brown Crimson Omen (one strong, central cue that tells you to retreat) | At red: Flee becomes the filled primary, Fight goes secondary, and the sheet border pulses once. At amber: Quaff gets a highlight. |
| HP shown as 27.2, 24.5, 3.5/8 (67, 68). The HUD's HP lacks "/30". | 67, 68 | Nielsen #2 | Integer HP or a bar-only display; "27/30". |
| No fight payoff: the win just closes the sheet. | — | Juice (Swink) | Loot burst into the bag (reuse 61) and a "+2 Ember" lift. |

### 3.8 Field craft, dialogs, return (71–78)
| Breaks | Screens | Principle (source) | Fix |
|---|---|---|---|
| Field craft shows input → output but **not why you'd do it**. Cooked Venison's energy value isn't shown, though food = energy is the only reason to cook out there. | 71, 72 | Brown meaning; Hodent show the answer | "🔥 Cook → +120⚡ (net +110)". Plain names instead of `fire-kit + cooking-pot`. |
| Toast covers the HUD energy number (52, 72, 73). REVIEW is right. | 52, 72, 73 | Signs & feedback | Toast slot below the HUD. |
| "Head home?" (74) is the **only** place the game says return is free. | 74 | Onboarding by doing (Hodent) | Teach it at embark ("Home is free from anywhere. Spend everything.") and on the 🏠 button itself (a "free" tag). |
| "Not yet" at 0⚡ with no food (75→76) dismisses into a state where nothing useful is possible, and the card returns after any action. | 75, 76 | User control (Nielsen #3) without a dead end | Keep "Not yet" only if an action is actually possible (fight adjacent, drop items). Otherwise say what's left: "You can still fight next to you or drop items." |
| **No payoff at home** (78). Two lines of flavour, then "— run ended (returned) —". The loot silently lands in the bank. REVIEW is right, and I rank it as fix #1, not #3. | 77, 78, 02 | Brown meaning; Juice; results-screen pattern (principles §6) | A **Run report** card: haul with icons into the bank, ⚡ spent / unspent, tiles, fights, "new: you can now make Iron Pick ★", "next time: pack a pick, 3 ore veins skipped". |

---

## 4. The conceptual-model problem

A player has to build five models. This table shows what the UI teaches for each one.

| Model the player needs | What the UI teaches | Verdict |
|---|---|---|
| **1. Energy is a spend-all budget; return is free, so leftover energy is waste.** | HUD bar plus projection (53) is good. "⚠ strands you" (60) teaches *danger of being stuck*. The exhausted card (75) frames 0⚡ as a crisis. The home flavour "Nothing here worth your time" (12, 78) after an early return blames the *world*, not the unspent budget. "Return is free" appears once, in a confirm dialog (74). | **Wrong model.** It teaches survival-horror retreat timing, the exact tension the design removed (D62). Fix: an "unspent ⚡" line in the run report, "spend it all" copy at embark, and "strands" removed. |
| **2. Slots are the haul's ceiling; supplies compete with loot.** | The packing gauge (34) teaches it well: "6 free = room for 30 loot". The map then switches to "9/14 bag" (45), merging supplies and loot. Tools are "(worn)" (48), which contradicts "worn gear is free" (32). The bag grid colours differ from the gauge. | **Taught in town, untaught in the field.** Fix: show the same gauge in the field (supplies | loot | free), one name ("Haul room"), and no "(worn)" on tools. |
| **3. Food converts to range at a fixed rate.** | "+80 energy each" (34) and "Energy 300 + 240 from food". Energy never converts into distance or gathers anywhere. | **No model.** Fix: express energy in *tiles* and *gathers* wherever it's projected (packing, route card). |
| **4. Fog: recipes appear when you hold all inputs, craft, or research. Research reveals one per word.** | "34 known · 12 hidden" (16) and the fog node (27) are good signs. Research is a text box (13), and a miss is a lost search (15). "+ more you haven't found" in every tray (17–21) is the same message on every item, so it carries no information. Nothing says "hold all of an item's ingredients to discover it", so the player never learns that *gathering broadly* is research. | **Half a model.** The player learns "there's hidden stuff" but not how to reveal it except by guessing words. Fix: the fog node says "found by holding all ingredients, or ask at the Research table"; per-row hidden counts; research suggestion chips. |
| **5. Tiers: maps T1–T5 gate which materials exist, which gate recipes, which gate deeper maps.** | Tier appears as T2 badges (07), "TIER II" columns (19), "Tier 2" text (19), "TI" (32), and "up to your progress tier +1" (README 13) with no visible "progress tier" anywhere. Map cards don't connect a tier to its materials. | **No model.** The player sees four tier notations and no chain. Fix: one tier glyph (Roman, I–V) everywhere; a "Your tier: II" chip in the town header; map cards and tree columns both use "Tier II materials: iron, silver, coal". |

Plus two smaller models the UI gets wrong:
- **Stations vs tools vs materials** (20, 29): the UI calls a Still "a crafting material" used "as the tool". The player can't tell why a craftable knife still locks Arrow Shaft.
- **Monsters vs animals vs camps** (45, 64): all are sprites. Camps drop *maps*, the progression currency, and are indistinguishable.

The root cause is the same in every row: **the UI exposes the engine's state (numbers, ids, flags) instead of the player's question** ("how far can I go?", "how much can I bring back?", "what do I unlock next?"). That is Brown's "systems are about the player, not the data", and it's the change that moves the score most.

---

## 5. Where REVIEW.md is wrong, shallow or missing things

**Where it's right (and I won't repeat it):** the panel-surface catalogue (§4.1), button-style catalogue (§4.3), colour-overload table (§4.4), the fight-sheet doff wall, the bank as debug dump, map tint destroying water, ⚔→×, toasts over the HUD, the missing payoff at 78, and the copy QA list. Its consistency catalogue is thorough and useful as an inventory.

**Where it's wrong:**
1. **Priority order.** It ranks "fix the colour language" #1 and "show the haul" #3. The colour language is a *symptom* of having no information hierarchy. The missing objective is the *disease*. A perfectly coloured UI that still says "strands you" and never shows the haul fails Brown's first and third goals. Meaning and the mental model come first.
2. **"The route bar works" / "the best screens already do this" (§1).** The route card answers *can I* and *what does it cost* but never *what do I get* (59), the third of REVIEW's own three questions. The pre-fight card doesn't say whether the loot fits. REVIEW sets out the right framework and then doesn't apply it to these two screens.
3. **"Research works" (§2).** Free-text guessing is the textbook recall-over-recognition failure (Nielsen #6), punished per miss, on a phone keyboard. REVIEW only notes surface issues (nested frames, blue links).
4. **"Parchment for all content" (§5.1).** Making the fight sheet, drawer, route card and HUD-adjacent cards parchment puts large bright cream panels over a dark map. That damages the figure/ground the map most needs and fights the F&L layer distinction. My rule is by **layer, not content**: parchment = town documents (things you'd hold at a table: map board, research, packing, tray); ink = field instruments (HUD, drawer, route/fight). This is consistent *and* meaningful (the surface tells you where you are).
5. **"Packing sheet: the best screen in the game."** It is the most *informative*. It is not the best *designed*, because the core trade-off (energy vs loot room) is split across the header and footer and left to mental arithmetic.
6. **"Tools labelled (worn) contradicts the primer"**: this is filed under copy. It's a model error (§4 row 2), not a wording slip.

**Where it's shallow:**
- It never engages the talk. Brown's encounter lesson (threat categories by similarity, 3/4 in my §1) translates directly into verdict pips on map monsters, and REVIEW has no equivalent.
- No HP projection point, although it praises the energy projection next to it.
- No point about green ×N on 56 nodes being noise, and no "Upgrade" signal in the tree.
- "Make the town readable" stops at labels. The deeper issue is that the town has no primary action and the loop's verb isn't in the nav.

**What it missed entirely:**
- "⚠ strands you" (60) contradicts free return (the single most important rule).
- The run-end flavour blames the world for the player's unspent energy (12, 78).
- "9/14 bag" merges supplies and loot; the HUD has no haul.
- Dev ids in player copy: `silver-ore`, `ironwood-log` (17, 28), `fire-kit`, `cooking-pot` (71), `(26,11)` (50).
- Station = "crafting material" / "(as the tool)" as a model problem (29), and the "held in town" rule for tool locks (20).
- Horse/Panniers duplicated across Bank and Stable with three verbs (10, 11).
- Field craft omits the energy value of what you cook (71).
- Unexplained teal monster outlines (64, 75, 76).
- Map cards give no reward/risk preview per tier or affix ("Of Carbon", 08).
- The stale cloth hint during the embark walk (41).
- The blocked route still projects an energy spend (58).
- "Not yet" at 0⚡ leads to a dead end (76).
- No onboarding at all (first verb, first tap on the map).
- No visible long-term goal (Brown's quest-chunking example).

---

## 6. Design-system proposal

The rules come from the principles. Each rule names what it serves. Where I differ from REVIEW §5, I say so.

### 6.1 Layers (F&L; Brown "respect the environment")
| Layer | Used for | Surface |
|---|---|---|
| **World** (diegetic) | town square, map tiles, sprites, the cloth, pinned map on the gate, plot signboards | the art. Nothing else draws on it except pips and route lines. |
| **Documents** (town) | map board, research table, packing sheet, workshop tray, run report, item card in town | **parchment**, ink header bar, ✕ right |
| **Instruments** (field) | HUD, drawer, route card, fight sheet, quick action, item card in the field | **ink**, gold hairline, 85% opacity so the map shows through |
| **Interrupts** | confirms, exhausted, embark-anyway | centred; parchment in town, ink in the field; no ✕; two buttons |

*Differs from REVIEW:* surface by place, not by content type.

### 6.2 Information hierarchy for every decision surface ("Can I / Cost / Get")
Every card that precedes a commitment (map card, packing, route card, pre-fight, tray, field craft, Study, Search) has **three lines in fixed order**:
1. **Verdict**: status pill (see 6.4).
2. **Cost**: ⚡ / ♥ / slots / materials, as ghost segments on the relevant bars plus numbers.
3. **Get**: icons ×N, plus "fits ✓ / won't fit".

The primary button sits under line 3 and **inherits the verdict** (green/amber = primary filled; red = demoted and the safe alternative promoted). This is one component, `DecisionCard`, used everywhere. It serves Into the Breach preview, Hodent show-the-answer, and Brown clarify intent.

### 6.3 Components
| Component | Rule | Replaces |
|---|---|---|
| `BudgetBar` | Energy (yellow ⚡), HP (rose ♥), Haul room (gold ⛁). Each has **current + ghost projection** in the same style. Integer values, "n/max". | HUD bars, packing footer, "9/14 bag" |
| `HaulGauge` | segmented: supplies | loot | free. Same in packing (34), field bag (48) and run report. | packing gauge, bag grid colours |
| `DecisionCard` | §6.2 | pre-fight, route card, map card, tray craft bar, field craft rows |
| `VerdictPip` | colour **plus shape** (● ok, ◆ costly, ▲ lose, ◌ unknown). On map monsters, the route target, the fight banner and map cards. | coloured dots and pills only |
| `ItemChip` | icon + name + qty. States: selected (gold ring), planned (✓ corner), unavailable (faded + reason glyph), unknown (silhouette, dashed), **upgrade (★)**. Hold for the card; a corner tick shows holdability. | bank text rows, letter placeholders |
| `ActionRow` | [icon verb] · cost · result, right-aligned button column | Here tab lines, field craft, bag drop |
| `Switch` | real toggle | "Cost colours: on" buttons, auto-quaff chip |
| `LockReason` | three glyphs only: 🏠 station, ⚒ tool held, ✗ short. Always with the named fix. | four lock styles |
| `Toast` | one slot under the HUD/header; **toast xor inline** | dual feedback |
| `RunReport` | haul (icons into bank), ⚡ unspent, tiles, fights, new unlocks (★), one "next time" tip | log panel at 78 |
| `GoalTracker` | one pinned goal (player-chosen or suggested: "Craft a Climbing Pick: 2/3 parts") in the town header and the expedition HUD | none (Brown quest chunking) |

### 6.4 Colour rules
- Status uses green/amber/red/grey and **always pairs with a shape** (GAG). Red only for *can't / lose / blocked*.
- Resource colours never double as status: ⚡ yellow, ♥ rose, haul gold.
- Gold ring = selection only. Gold fill = the one primary button. Gold text = haul.
- Map: terrain keeps its hue. Cost appears **only on the planned route**. Impassable = grey hatch.
- Neutral numbers are ink. Only the shortfall part is red ("need 3 · have 2 · **1 short**").

### 6.5 Interaction rules
- One primary action per screen, in the bottom-right thumb zone (Fitts): Set out / Embark / Walk / Fight / Craft / Go home.
- Destructive actions (new game, drop, spend map) are small, away from the primary, and confirmed.
- Every hidden gesture gets a signifier (Norman): hold tick on chips, ▾ on worn rows, label on plots, ⌄ on the log strip.
- On `pointer: coarse`, no pan buttons and no hover-only info. Touch targets ≥ 44px (the bank/drawer chips are about 22px tall today: 09, 48).

### 6.6 Copy rules
- One verb per concept: **Pack / Unpack**, **Wear / Take off**, **Drop**, **Eat**, **Drink** (not quaff), **Study**, **Set out**.
- No ids, coordinates or seeds. Hyphenated ids become display names.
- Energy is phrased in tiles and gathers wherever it's projected.
- Flavour belongs in the run report and research replies only, and it must agree with the numbers.

### 6.7 Type
Three sizes (18 / 15 / 13px minimum on phone). Roman numerals for tiers everywhere (I–V). Lining numerals elsewhere. REVIEW's 12px floor is too small for a phone held at arm's length with this serif face; the tree mini-costs (16) and field craft (71) prove it.

---

## 7. Prioritised fix plan (top 10)

★ = the three I'd make first if I could only make three.

| # | Change | Screens | Principle served | Size |
|---|---|---|---|---|
| **1 ★** | **Run report on return + haul in the HUD.** Haul into the bank with icons, ⚡ unspent, new unlocks, one "next time" tip. HUD gets a gold Haul row; "9/14 bag" becomes "Haul 3 · room 21". Run-end flavour must agree with the numbers. | 02, 12, 45–66, 77, 78 | Brown *meaning* + *clarify intent*; Juice; Nielsen #1 | M |
| **2 ★** | **Teach the right energy model.** Kill "strands you" ("ends your gathering, home is still free"), express energy as tiles/gathers in packing and route cards, a "free" tag on 🏠, one-line embark coach "Home is free from anywhere: spend it all". | 32–36, 45, 53–60, 74–76 | Brown *don't lie*; Norman conceptual model; Hodent onboarding | S |
| **3 ★** | **`DecisionCard` everywhere a commitment happens.** Route card gains yield + "fits"; HP ghost projection beside energy; the primary button inherits the verdict (Flee primary at red, Walk demoted on ambush, Embark demoted on bag-full); ring the blocking monster instead of coordinates. | 36, 53–60, 67–70 | Into the Breach preview; Hodent error prevention; Brown Crimson Omen | M |
| 4 | **Verdict pips + camp silhouettes on the map; cost tint off by default and shown only on the planned route.** Terrain keeps its hue; grey hatch for impassable; define or remove the teal outline. | 45–76 | Brown similarity/threat categories, negative space; GAG colour+shape | M |
| 5 | **Packing trade-off bar.** One line: "Reach ≈ N tiles · Room for M loot", with deltas on each pack. Hide materials from the packing bank; neutral supply cells; Expected haul promoted and ticked against tools. | 32–39 | Hodent minimum workload; Hick | S–M |
| 6 | **Fight sheet: 3 big actions + "Gear ▾" with verdict preview.** Integer HP; ⚔ glyph; loot burst on win. | 67–70 | Hick; hierarchy; Juice | S–M |
| 7 | **Town primary CTA + nameplates.** "Set out ▶" → "Pack ▶" → "Embark ▶" bottom-right; permanent nameplates matching tab names; plot signboards that build in place; `new game` into Settings. | 01–06, 29–31, 40, 41 | Visual hierarchy; Norman mapping; onboarding | M |
| 8 | **Crafting tree speaks in runs, not ids.** ★ Upgrade state; quiet ×N; "On your next run:" line; three `LockReason` glyphs (station / tool held / short); stations not "materials"; visible filter state. | 16–29, 38 | Brown 4D systems; Gestalt similarity; Norman model | M |
| 9 | **Research by recognition.** Suggestion chips from met vocabulary + per-row hidden counts; the fog node explains "hold all ingredients to discover". | 13–15, 27, 44 | Nielsen #6; error prevention | S–M |
| 10 | **Layer-based surfaces + copy/glyph pass.** Parchment = town documents, ink = field instruments; one toast slot; one verb per concept; SVG glyphs; no ids/coords/seeds; Bank read-only (Stable merged); real switches in a ⚙ Settings. | all; esp. 07–12, 37, 42–52, 71 | Hodent consistency; F&L layers; Nielsen #2/#4 | L |

**Why these three first:** #1 and #2 are cheap and fix *meaning* and *model*, the two goals the UI fails worst (scores 1.5 and 2). #3 turns the game's best existing idea (the verdict) into a rule that applies to every decision, which also fixes the worst error-prevention gaps. Colour and surface unification (#4, #10) matter, but they polish screens that, until 1–3 land, are still pointing the player at the wrong goal.
