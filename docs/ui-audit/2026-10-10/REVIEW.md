# Idle Adventure: UI review

Scope: the 78 screenshots (723×623) and the stated intent in README.md, nothing else. Numbers in brackets are screenshot numbers.

---

## 1. What do these screens have in common, and what should they convey together?

Nearly every screen does the same job: it shows a **budget**, and asks the player to decide whether something is worth spending it on.

| Budget | Where it is spent | Where it is shown |
|---|---|---|
| Energy ⚡ | walking, gathering, fishing, field crafts | HUD bar, route card, log lines (45–66, 71) |
| HP | fights | HUD bar, verdicts, fight sheet (53–70) |
| Bag slots | everything you carry out and bring back | packing gauge, bag grid, handle "9/14 bag" (32–36, 48, 51) |
| Materials | crafts, studying maps | tree badges, tray "need · have" (16–29, 07) |
| Searches / ink | research | research table (13–15) |
| Earned maps | embarking | map board, "spends map" (07, 39) |

Together the screens should convey one idea: **"You have a limited budget. Here is what this costs, here is what you have, and here is what you'd get."** The loop's payoff is how much value you bring home before the budget runs out. A good screen in this game answers three questions at a glance:

1. **Can I?** (ok / tight / no, and why not)
2. **What does it cost?** (⚡, HP, slots, materials)
3. **What do I get?** (loot, an item, an unlock, information)

The best screens already do this: the packing sheet (34, 36, 39), the pre-fight card (53–56), the crafting tray (17–21) and the route bar (58–60). The weakest screens either hide one of the three answers or answer it in a visual language the player has not learned anywhere else. The biggest gap is the **"what did I get"** answer at the end of a run (78), because that is the payoff the whole loop exists for.

---

## 2. Does each screen convey its message? Screen by screen

### Town square (01–05, 31, 40, 41, 77)
- **Works:** the woodcut scene is charming and reads as "home". Built stations replacing plots (01→02) is a lovely way to show progress. The cloth showing the planned kit (40) and the gate opening (41, 77) are great in-world feedback.
- **Fails, "each building is a function":** nothing labels a building until you tap it (01, 04). A first-time player cannot tell the bank (04, a stone house with a coin sign) from the house in 01, the map board from a notice board, or a staked plot (01, bottom) from a decorative dig site. Building names are the main content of this screen, and they are hidden.
- **Fails, "the square is wider than the screen":** nothing hints that you can pan: no edge fade, no arrow, no peeking building. In 01/02 the gate, cloth and bank are all off-screen, so the start of the loop ("go to the gate") is invisible on first launch.
- **Fails, "the last line says what just happened" (02):** the strip says "Nothing here worth your time, you amble home." It does not say what you brought home, which is the thing a returning player wants to know.
- **Mixed:** `≡ menus` and `new game` are blue web links in the top-right corner (01). `new game` wipes the save, yet it has the same weight as a view toggle and sits right next to it.

### Town side panels: Maps, Bank, Stable, Log, Research (06–15, 30, 78)
- **Map board (07, 08, 30):** the strongest town panel. The free map is set apart with a green rule and a "FREE · ALWAYS HERE" tag, and earned maps carry tier badges. It fails on the hint chips: `T: the usual dangers`, `G: cut by rivers` and `B: game-rich` rely on a T/G/B key the player is never shown. `[sealed bounty]` in italic grey reads as disabled rather than as "unknown, study to reveal". All three buttons (Prepare, Study, Ore Ink) share one style, so nothing marks Prepare as the main action. "Ore Ink" does not say what it does ("rolls an affix" is never stated). "1 runs old" is ungrammatical (08).
- **Bank (09, 10, 43):** the weakest screen. It has no item icons, while the same bank inside packing (32) has them. It is one flat list with materials mixed in among gear, and the word "material" repeated 17 times as a label. The `pack` / `+spare` buttons sit at ragged x-positions because they start wherever the name ends. "+spare" is jargon, and no "✓ packed" badge is visible. The panel does not convey "what can be packed vs what is crafting stock". It conveys a debug dump.
- **Stable (06, 11):** two rows in a full-height panel that is otherwise 85% empty. "take it" is the third verb for "add to plan" (after "pack" and "+spare"). The 16px icons are too small to read.
- **Log (12, 78):** a flat, unstyled text list. Nothing separates runs, and nothing summarises the haul. Screen 78 is the end of the loop and shows two lines of flavour text plus "— run ended (returned) —". It does **not** convey "carried loot is now in the bank". This is the most important missed message in the game.
- **Research (13–15, 44):** the research table works. It is a clear input, the budget sits in green/red under the field, and a hit shows a real recipe card (14). It fails on consistency: it is a parchment card floating in a black panel, with a dark recipe card nested inside the parchment (three surfaces deep). The links ("find it in the workshop →", "Longboat") are underlined web-blue. The panel is ~60% empty (13).

### Workshop / crafting tree (16–29, 38)
- **Works:** tier columns with "34 known · 12 hidden", the fog node (27, "+12 undiscovered — research to find"), and the tray's "need 2 · you have 9 ✓ / 1 short" rows (17–21) are excellent. They answer can-I / cost / get exactly. The Make now strip is a good shortcut.
- **Fails, "rows group kinds":** the row groups have no labels (16). The player sees unexplained blank bands between rows (16, the gap above Blacksmiths Hammer).
- **Fails, mini costs:** the ingredient icons on nodes are about 10px (16, 21). They cannot be read at this size, and at 1.35× zoom on touch they are still tiny.
- **Fails, "material lit" (24):** the README admits the marking is subtle. In the screenshot it is invisible. The Materials ▾ button also does not show which material is active, so the player has no way to know a filter is on.
- **Fails, the Can make filter (25):** with almost everything craftable, the filter changes one node. It needs to hide nodes, or at least dim them strongly.
- **Fails, the Field view (26):** a completely different layout (flat grey cards, "+ 9 undiscovered" as loose italic text, not the dashed fog node of 27). The Make now strip still shows town crafts, which have nothing to do with field crafting.
- **Wrong content:** the Still (29), a station, is described as "a crafting material". The Horse description repeats itself (19: "×2 on plains, ×1.2 on mud speed · carries 2 slots — ×2 on plains, ×1.2 on mud speed, +2 carry"). Arrow Shaft shows "needs Fletchers Knife" in red, while Fletchers Knife sits in the Make now strip with ×8 (20). The player will ask why they can't use the knife they can make (the answer is that it has to be *held*, which the screen never says).
- **Ambiguous highlight:** in 28 two nodes have the gold "selected" border (Iron Axe and Cooking Pot), because the chain highlight reuses the selection style. In 29 Silver Oil gets a **blue** border and a blue dashed edge, while the same tool edge in 20 is gold dashed.
- **Craft feedback (28):** the toast covers the filter tabs, and the same text appears again inline. One of the two is enough.

### Choosing a map → packing → embark (30–41)
- **Packing sheet (32–36, 39):** the best screen in the game. The segmented gauge ("8 Small Backpack | +2 Horse | +4 Panniers", "6 free = room for 30 loot") teaches the slot rules visually. The bag rows show what each tool unlocks ("→ ore"). The footer projects energy and lists warnings. Scout reports checked against the plan (39, "ore-rich — Iron Pick ✓") are exactly the "does my kit answer this map" message.
- **Fails:** "1 slot" / "3 slots" is printed in **red** (33, 34), so a neutral cost looks like an error. Materials (can't be packed) and items that don't fit are both shown as the same faded chip (32, 36). The left map page is ~70% empty on the free map (32). "Tundra · T1" renders as "TUNDRA · TI" in the small-caps face (32, 34), which reads as a Roman numeral and clashes with the tree's "Tier I". The worn strip lists empty slots as faint "· helm · chest · legs" text that looks like broken placeholder copy (32).
- **Worn swap (35):** works, but the swap row appears inline and shoves the strip around. "take off" is red text, red meaning "error" everywhere else.
- **Refusal (36):** the same message shows twice at once: a red toast that covers the tabs and header, and an inline red block in the bank list.
- **Recipes tab (38):** pressing a tab in packing replaces the whole screen with the full tree, which has a ✕ and no "Pack" tab. The tab metaphor breaks: you leave via ✕, not via the other tab.
- **Item card (37, 73):** good idea (the touch stand-in for tooltips). The copy is weak: "melee dmg — melee — hand-to-hand" (37) and "needs a Axe" (73). "Where it comes from: • Crafted" (37) does not say from what.
- **Hint after choosing a map (31):** "the local map chosen — the packing cloth is by the gate ▶" is good guidance in a bad spot. It is a tiny bottom-right chip far from the cloth.

### Fallback "≡ menus" town (42–44)
- Not the "same content" the README claims: it has **no Stable tab and no Log tab**. The Log is appended under Research (44). The header shows a dev seed (`seed "aud-gather"`). Its tab style (underlined) differs from the square's (boxed buttons).

### Expedition map and drawer (45–52, 61–66)
- **Works:** the HUD (biome, ⚡ bar, HP), the handle line ("Stand of trees → Oak Log · 11/14 bag", 62), the context quick action (🎣 Fish / 🪓 Chop) and the "+3" pickup cues flying off nodes (61) are strong.
- **Fails, the cost tint (45, 62, 64, 74–76):** this is the single most damaging visual on the map. Water is tinted dark maroon (45 desert river, 64 tundra river), so it reads as a dried blood trail or a road, not water. In Woodland (62) the mix of green, olive, brown, maroon, pink and blue-with-red-hatch tiles has no readable terrain identity. Red tint ("slow") sits next to red crosshatch ("impassable"), the red HP bar and red "you'd lose". The player cannot separate "costly" from "deadly" from "blocked".
- **Fails, small-object legibility:** nodes and monsters are ~16–24px on 32px tiles, and the bobbers that mark fishable water (45) are ~6px dots. The README says touch gets 1.35× zoom, which helps but does not fix it.
- **Drawer (47–52):** the "Bag 9/14" count appears twice (handle and tab). Settings sits under the **Here** tab (47, 52), where nobody will look for it. The Settings toggles look exactly like action buttons ("Cost colours: on"). `new game`, a blue link, sits inside expedition settings. In Bag, tools are listed as "Iron Pick (worn) · doff" (48, 51), which contradicts the primer: tools take slots and are not worn. Bag-grid colours (green food, purple potion, slate tools) do not match the packing gauge (all filled cells red-brown, 33). Bag help text says "long-press / right-click", which is desktop wording on a phone, and nothing shows which food is the auto-eat food.
- **Here tab (63, 65):** actions are embedded inconsistently. "Chop it" is a button below a sentence (63), "Fish" is a button in the middle of a sentence (65), and the quick action says "Chop" while the drawer says "Chop it".
- **Black band at the right edge (61, 64, 66–70):** the map edge shows as raw black, which looks like a rendering hole rather than "the world ends here".

### Route planning and pre-fight (53–60)
- **Works:** the HUD energy split "282/300 → 254" (53), the red "→ 0 ⚠ strands you" (60), the blocked tile outlined red with the gear that fixes it named (58), and the verdict pill (CLEAN WIN / COSTLY WIN / YOU'D LOSE) all convey the decision cleanly. The verdict-with-no-numbers rule reads well.
- **Fails:** the ⚔ glyph renders as "×" ("YOU ×melee", 53; "× Fight", 67; "× Mirage Wisp", 67 handle), which reads as "no melee". The ambush warning (57) quotes raw coordinates, "(28,18)", that the map never shows, and the monster on the line is not highlighted. The target label instead names the empty tile ("Plains · −37⚡"). At YOU'D LOSE (55) and with an ambush (57), **Fight ▶ / Walk ▶ keep the same inviting gold style**, so the card's colour and its main button disagree. The "Mountain · can't reach" label is clipped under the ▲ pan button (58). The handle shows "Ore vein → ?" (59), and the "?" means nothing. The route card covers the ▼ pan button and the bottom-left quarter of the map (53–60). The HUD box grows sideways when text gets long (60).

### Fight sheet (67–70)
- **Works:** the You ‖ verdict ‖ Monster layout, the HP bars and the full-width verdict banner that turns orange or red (69, 70).
- **Fails:** the action area holds **eight "Doff X" buttons** (Sword, Plate Helmet, Light Chest, Small Backpack, Iron Pick, Axe, Knife, Fishing Rod), and they dominate it. Fight / Flee / Quaff, the three moves that matter, are a small row lost above them. Doffing an Axe mid-fight is never a sensible move, so it does not need equal weight. At YOU'D LOSE (70) Flee looks no different from any other button, even though the README says the red state is meant to steer you to Flee. "auto-quaff on" is a chip and "auto-finish off" is a button, two styles for the same kind of toggle. The 🏠 button disappears from the HUD during the fight (67), which is right but unexplained. HP shows decimals ("27.2", "3.5/8"), and the HUD shows "27.2" without "/30".

### Field craft, dialogs, going home (71–78)
- **Field craft (71, 72):** functional but cramped. The text is ~11px, the recipe reads backwards ("1× Cooked Venison ← 1× Rich Venison + 1× Oak Log"), and the locked recipe uses **orange** text, where the tray (20) uses red for the same "needs X" lock. The toast lands on top of the HUD energy number (52, 72, 73), so the number you most want to watch change is covered at the moment it changes.
- **Head home / exhausted (74, 75):** clean, consistent dialogs with a primary/secondary pair and good copy. The exhausted card uses an orange title and border, the right severity.
- **Home (77, 78):** the walk-in animation is good, but the payoff screen (78) is missing (see Log above).

---

## 3. Can a player infer how to interact from the UI alone?

Partly. Wherever there is a button, it is obvious. Most of the game's *distinctive* interactions are invisible.

| Interaction | Visible affordance? | Screens | Verdict |
|---|---|---|---|
| Tap a building to go there | No labels, no hover on touch, no tappable outline | 01–04 | **Hidden** |
| Pan the square sideways | None | 01–04 | **Hidden** |
| Tap a staked plot = build a station | Plot looks decorative | 01, 29 | **Hidden** |
| Tap the bottom log strip to open the Log | Looks like a status bar | 02 | Hidden |
| Press-and-hold any item for its card | Only the packing text "HOLD FOR DETAILS" (32) and the bag's desktop text (48) | 09, 16, 37, 48, 73 | **Mostly hidden** |
| Long-press a food to make it auto-eat | Text only, desktop wording, no indicator of the current choice | 48 | Hidden |
| Tap a worn row to swap | Worn rows look like static labels | 34→35 | **Hidden** |
| Swipe the tray down / tap the grab handle | Grab bar visible | 17, 22 | OK |
| Pan the tree | Partial nodes at the edges hint at it | 16 | OK |
| Tap a material to light up its uses | The button is clear, the result is invisible | 23→24 | **Broken feedback** |
| Tap a tile to plan a route | No hint on the first expedition view | 45, 46 | Hidden on first use |
| Tap more tiles to add waypoints, tap the line to cut it back | "Tap the line to unwind" appears only in the blocked state | 58, 59 | Hidden |
| Drag the map, WASD | Pan buttons give a fallback | 46 | OK |
| Drawer handle opens the drawer | A tiny ▴ at the far right | 45 | Weak |
| Which slot cells are tappable in Bag | Food vs tools look alike apart from tint | 48 | Weak |
| Settings toggles vs actions | Identical boxes | 52 | **Misleading** |
| ⚔/✕ glyph confusion | "×" reads as close or none | 53, 67 | **Misleading** |
| Fight ▶ when you'd lose | Same gold primary | 55, 70 | **Misleading** |
| What a tap on a greyed bank chip does | Two kinds of grey, no reason shown until tapped | 32, 36 | Weak |
| Hint chips T:/G:/B: | No key | 07, 08 | Opaque |

Desktop hover tooltips (`title=`) carry a lot of detail and never appear on touch, so any meaning stored only in tooltips is effectively absent on the target device.

---

## 4. Consistency catalogue

### 4.1 Panel surfaces, frames and backgrounds: at least six languages
| Surface | Look | Screens |
|---|---|---|
| A. Woodcut scene | painted, warm, textured | 01–05, 31, 40, 41, 77 |
| B. Flat ink panel | near-black #111, thin gold rule under title, no texture | 06, 09–12, 47–52 |
| C. Dark-brown cards with a coloured left rule | brown fill, gold/green left border | 07, 08, 30, 42 |
| D. Parchment | cream paper with border and shadow | 13–15 (research), 17–22, 28, 29 (tray), 32–39 (packing pages) |
| E. Dark floating card or modal, gold or tinted border | ink, rounded, centred or bottom-left | 37, 53–60, 73–75 |
| F. Pixel-art map | flat pixel tiles with a hard grid | 45–76 |
| (G.) Dark recipe card nested inside parchment | ink inside D | 14 |
| (H.) Flat grey cards | Field view | 26 |

Nothing decides when a panel is parchment and when it is ink. Research is parchment inside ink (13). The tray is parchment over an ink canvas (17). Packing is parchment pages on an ink frame (32). The Bank, Stable and Log are pure ink (09–12). The drawer is ink (47). The item card is ink (37), but the tray describing the same item is parchment (17).

### 4.2 Typography
- The display face (small-caps serif) is used for titles, tabs, verdicts and node names. Body serif everywhere else. Sizes span roughly 9–20px with no clear steps. The smallest text is unreadable: tree mini-costs (16), tier sub-labels (16 "34 known · 12 hidden"), field craft list (71), bag help text (48), stable description (11).
- In small caps, "T1" renders as "TI" (32, 34, 39 "SWAMP · T2" is fine), which collides with Roman tier numerals ("TIER I", "TIER II", 16, 19).
- Case varies between ALL-CAPS tabs (47 "HERE BAG CRAFT LOG"), Small-Caps tabs (01 "Maps Bank"), sentence-case buttons ("take it", "pack", "doff") and Title Case buttons ("Prepare", "Study", "Go home", "Craft").

### 4.3 Buttons
| Style | Example | Screens |
|---|---|---|
| Gold-filled, large | Embark ▶ | 32–39 |
| Dark-brown filled | Craft, Search, Spend 1 Ore Ink, Study (on packing) | 13, 17, 39 |
| Outlined ink, gold border | Prepare ▶, Study, Ore Ink, pack, +spare, take it, doff, drop, Fight ▶, Walk ▶, Go home | 07, 09, 11, 48, 53, 74 |
| Outlined, white text | Reset, Stay, Not yet, ✕ (route card) | 32, 74, 75, 53 |
| Dashed chip-button | +spare (packing) | 33 |
| Red-text button | take off | 35 |
| Square icon-and-label tile | 🔥 Craft | 71 |
| Web-blue text link | ≡ menus, new game, ← town, find it in the workshop →, Longboat, the square | 01, 14, 32, 42, 52 |
| Toggle disguised as a button | Cost colours: on | 52 |
| Toggle as a chip | auto-quaff on | 67 |

Study is outlined on the map board (07) and filled dark on packing (39). The primary action is gold-filled only on the packing sheet. Everywhere else the main action (Prepare, Fight, Go home, Craft) has the same weight as its siblings.

### 4.4 Colour meanings (overloaded)
| Colour | Meanings in use |
|---|---|
| **Red** | HP bar (45), short (19), "you'd lose" (55, 70), refusal toast (36), impassable crosshatch (58), slow tile tint (62), *neutral* slot cost "1 slot" (33), "needs" lock (20), "take off" (35), "Bow no ammo" (36), "no food" (32), "can make 0" (19) |
| **Orange / amber** | costly win (54, 69), energy spend segment (53), "embarking SPENDS this map" (39), locked field recipe (71), exhausted card (75) |
| **Green** | can make ×N (16), clean win (53), energy bar (45), "1 free search" (13), food bag tint (48), "→ ore" tool output (33), toast background (28, 72), "free · no slots" (32), free-map rule (07), node borders (16) |
| **Gold** | selection (17), chain highlight (28), primary button (32), Fight button (67), titles, map-card rule (07), tab active (47), hero tile outline (45) |
| **Blue** | web links (01, 14), route outline (53), tool-edge highlight (29), "RESEARCHED" tag (14) |
| **Purple** | potion bag tint (48), "found at the research table" (21) |

Energy is green and HP is red, so a full HP bar reads as "danger" and a full energy bar reads as "ok". Neither is a status.

### 4.5 Iconography
- Item icons come from two art sets: woodcut item frames (tree 16, packing 33) and pixel sprites (map 45, stable 11), with a letter placeholder ("L", "D") for unheld items (21).
- UI glyphs are a mix of system emoji (🏠 🎣 🪓 🧪 🏃 ⏩ 📖 🔥 ✨ 👘 ⚠ ⚡ 🔒) and font glyphs (✕ ▶ ▸ ▴ ◎ ✓ ✗). Emoji render differently per OS, and some come out wrong (⚔ → "×").
- The lock appears as a grey badge (16), a green-ish padlock (20) and an orange-text padlock (71).
- The bank (09) has no icons, while the same items have icons in packing (32) and the materials dropdown (23).

### 4.6 Close and back controls
| Control | Where | Screens |
|---|---|---|
| ✕ top-right of panel header | town side panels, tree header, tray, item card | 06, 16, 17, 37 |
| ✕ as a sibling button beside the primary | route card | 53–60 |
| "← town" blue link top-left | packing | 32 |
| "◱ the square" link | fallback town | 42 |
| ▾ on the handle | drawer | 47 |
| Grab bar + ✕ (two controls) | tray | 17 |
| Word buttons ("Stay", "Not yet") | dialogs | 74, 75 |
| No close at all | Materials dropdown (23), worn swap (35) | |

### 4.7 Where panels dock
- Town panels dock **left or right depending on where the hero stands** (06/08/30 left, 07/09–14 right). The tab strip jumps with them: it sits top-right in 06/08/30 and wraps to two rows at top-left in 07–14. The player's navigation moves every time a panel opens.
- The workshop and packing are full-screen. The tray is a bottom sheet. The drawer is a right side sheet (47). The route card floats bottom-left (53). The fight sheet is a bottom sheet (67). Dialogs are centred (74). Toasts sit at top-centre, over the header (28, 36) or the HUD (52, 72, 73).
- The town log strip is hidden under side panels (06 shows "ft"; 07 "— ru").

### 4.8 How state is shown (selected / locked / short / ok / packed / unknown)
| State | Tree | Packing | Bank | Bag | Map |
|---|---|---|---|---|---|
| ok / can | green ×N badge + green border (16) | green "→ ore" (33) | — | — | green verdict (53) |
| short | red "short" tag, node sometimes dimmed (Horse 21) and sometimes not (Bowstring 27) | — | — | — | — |
| locked | grey 🔒 badge + dim (16) | — | — | — | red crosshatch (58) |
| selected | gold border (17) | darker chip (33 Club) | — | — | gold tile (45) |
| packed / planned | — | darker border, no ✓ (33) | "✓ packed" promised, not visible (09) | — | — |
| unknown | dashed "?" node (27), letter placeholder (21) | — | — | — | "? attack ? hide" chips (53) |
| unavailable | — | faded chip (both "material" and "doesn't fit", 32/36) | grey word "material" (09) | — | disabled Walk (58) |

### 4.9 Wording and tone
- **One concept, many verbs.** Add to plan: *pack*, *take it*, *+spare*, *Prepare*. Remove: *−*, *Reset*, *take off*, *doff*, *drop*, *stow*. Wear: *worn*, *Don*.
- **Dev shorthand leaks through:** T:/G:/B: (07), "(28,18)" (57), `seed "aud-gather"` (42), "doff", "+spare", "max", "1 runs old" (08), "needs a Axe" (73), "melee — melee" (37), duplicated Horse text (19), Still as "a crafting material" (29), tools labelled "(worn)" (48).
- **Diegetic flavour** sits alongside the shorthand ("Nobody in town has heard of that", "over the hill — a fresh T1 map", "Nothing here worth your time, you amble home"). The flavour is good. The mix is jarring.
- Instructions name desktop inputs on a phone ("right-click", 48).

### 4.10 Density and spacing
- Too sparse: Stable (11), Log (12, 78), Research (13), Field view (26), the packing map page (32), the drawer Here tab (47).
- Too dense: the Bank (09: 30 rows, no grouping), the fight actions (67: 11 buttons), the field craft list (71), tree nodes (16, 10px costs).
- Spacing does not follow a grid. Bank buttons sit at ragged x-offsets (09). Chips have different paddings in packing (32) and the map board (07).

---

## 5. A small, coherent UI system

The aim is seven component rules, each with a defined scope. Keep the woodcut world, keep the parchment (it is the best-looking and most readable surface you have), and retire flat ink panels and web-blue links.

### 5.1 Two surfaces only
- **Parchment = content** (anything you read or decide on): every town panel, the tray, the packing pages, the drawer body, the item card, the pre-fight card, the fight sheet, dialogs and the research table. One frame: parchment body, a dark ink **header bar** holding the title on the left and ✕ on the right, an 8px radius and one drop shadow.
- **Ink = chrome** (sits over the world and holds no decisions): the top nav, the HUD, the drawer handle, toasts, the tree canvas background and the map edges.
- Changes: 06, 09–12, 37, 47–52, 53–60, 67–75 move to parchment content. 13–15 lose the nested frame (the research card becomes the panel). 14's dark recipe card becomes a parchment "item row". 26 uses tree nodes plus the fog node.

### 5.2 One docking rule
- **Town:** side panels always dock **right**, at a fixed width of about 46%. The nav strip never moves or wraps (06/07/08 differences go away). The camera pans so the chosen building sits in the left half. The bottom log strip shortens to stay visible.
- **Expedition:** the drawer is the right side sheet in landscape (as 47) and a bottom sheet in portrait. Route card, verdict and fight all appear **in the drawer area** (or as a bottom sheet that does not cover pan controls), never as a floating card over the bottom-left of the map (53).
- **Full-screen "rooms"** (Workshop, Packing): the header holds "← Town" (or "← Pack") top-left, the title, then tabs. ✕ is never used on a room.
- **Dialogs** (74, 75): centred, with no ✕. Two buttons: primary on the right, secondary on the left.
- **Toasts:** one spot only, below the HUD/nav and never over a number. Show a toast **or** an inline note, never both. Rule: inline when the panel that caused it is open (28, 36, 72), toast otherwise.

### 5.3 One button hierarchy (4 levels)
1. **Primary:** gold fill, dark text, **at most one per surface**: Embark, Craft N, Prepare, Fight / Walk, Go home, Search.
2. **Secondary:** parchment fill with ink outline: Study, Flee, Quaff, Reset, Stay, pack/unpack.
3. **Quiet:** text with a gold underline, for links and jumps: "find it in the workshop →", "Used in" jumps. This replaces web blue.
4. **Destructive:** red outline, always behind a confirm: New game, Drop.

Toggles become a real **switch** component (Settings 52, auto-quaff/auto-finish 67).
Disabled = 40% opacity **plus a one-line reason underneath**. Never disable silently.
When the verdict is red, Fight demotes to secondary and **Flee becomes primary** (55, 70). When a route has an ambush, Walk demotes to secondary (57).

### 5.4 One item chip, one item row
- **Chip** (icon + name + qty) for every inline item mention: bank, packing bank, Make now, Used in, materials dropdown, research inputs, worn row, loot icons, hint chips (as text chips). Its states use the status scale (5.5): **selected** = gold ring; **packed** = ✓ corner badge; **unavailable** = faded, with the reason in the item card; **unknown** = dashed outline with "?".
- **Row** (icon · name · what it does · cost · action) for every list where you act on items: bag rows (33), bank (09), stable (11), field recipes (71), the tray's cost rows (17), bag doff/drop (48). The action always sits in a right-aligned column, which fixes the ragged bank.

### 5.5 One status scale, plus separate resource colours
- **Status (only these four):** **Green** = ok / can / win. **Amber** = costs something scarce or is at risk (costly win, spends this map, strands you, short by a little). **Red** = can't / lose / blocked / error. **Grey** = unknown / fogged / not yet.
- **Resource colours are not status colours:** Energy = **yellow ⚡** (not green). HP = **rose** with a ♥ glyph (not alarm red). Bag = parchment brown. These appear only on their bars and numbers.
- **Selection = gold ring, and nothing else is gold-ringed.** The chain highlight (28, 29) uses a glow along edges or a faint gold fill instead.
- **Neutral numbers are ink:** "1 slot" (33) and "need 2" stay ink, and only the shortfall goes red.
- **Map tint:** drop the red end. Show cost as a **luminance/saturation dim** (cheap = normal, expensive = darker) that keeps every terrain's own hue, so water stays blue. Show it only while a route is being planned, or as a per-tile number on hold. Impassable becomes a **grey diagonal hatch**, not red.

### 5.6 One icon rule
- **Items:** one art set per surface type, with woodcut frames everywhere outside the map. Unheld items get a silhouette, not a letter.
- **UI glyphs:** one small custom SVG set in the woodcut line style, covering ⚡ ♥ ⚔ 🛡 🔒 ✓ ⚠ ✕ ← ▶ ⌂ ◎ 🎣 ⛏ 🪓 🔥 ⏩. No system emoji (this fixes ⚔ → ×, and keeps 🏠 🧪 👘 looking the same on every OS).
- One lock icon everywhere, grey (status: not yet).

### 5.7 One copy voice
- **Buttons:** verb + object, sentence case, one verb per concept. *Pack* / *Unpack*, *Wear* / *Take off*, *Drop*, *Eat*, *Craft 4*, *Study map (1 copper ore)*, *Add ink affix*, *Take horse* becomes *Pack*.
- **Labels:** plain words. "Threat · Ground · Bounty" spelled out (or as icons with a key). No coordinates (show the monster highlighted instead), no seeds, no "doff", no "+spare" ("Pack a spare").
- **Flavour** lives in exactly two places: run-end lines and research replies. Everything else is plain.
- **Copy QA list:** "1 runs old", "needs a Axe", "melee — melee", Horse duplicate, Still = "a crafting material", tools "(worn)", "right-click", "Ore vein → ?", "T1"→"TI".

### 5.8 Type scale (supporting)
Use three sizes only: **Title** 18px small caps. **Body** 14px. **Label** 12px minimum, with nothing smaller on a phone. Use lining numerals so "T1" stays T1.

---

## 6. Plan to fix this UI, biggest win first

| # | Change | Screens | Size |
|---|---|---|---|
| 1 | **Fix the colour language.** Apply the 4-colour status scale and separate resource colours (⚡ yellow, HP rose). Neutral costs go ink ("1 slot"). The chain highlight stops using the gold selection ring. Red stays only for can't / lose / error. | 16–29, 32–39, 45–75 | M |
| 2 | **Fix the map tint.** Keep terrain hue (water must look like water). Express cost as darkening, ideally only while planning. Impassable becomes a grey hatch. Fix the black right-edge void and the column lines (61, 64, 66–70). | 45–76 | M |
| 3 | **Show the haul when you get home.** Add a "Brought home" card on return (items with icons, energy used, tiles walked, what you could now craft), and make the bottom strip read "Home with 3 Oak Log, 3 Salt…". This is the loop's payoff and it is currently invisible. | 02, 12, 77, 78 | S–M |
| 4 | **Rebuild the Bank as the packing bank.** Same chip grid with icons, grouped (Gear · Tools · Food & potions · Materials), ✓ packed badges, actions in an aligned column, "Pack spare" spelled out. Merge Stable into it as a "Mounts" group. | 09, 10, 11, 43 | M |
| 5 | **Fight sheet hierarchy.** Fight / Flee / Quaff become one big row. Gear swaps move into a single "Gear ▾" menu that offers only sensible swaps (weapon, armour). The main button follows the verdict (red → Flee primary). Toggles become switches. Fix the ⚔ glyph. Round HP display. | 53–57, 67–70 | S–M |
| 6 | **Make the town readable without tapping.** Always show building nameplates (faint, brightening on approach). Label plots "Build: Still". Add edge chevrons or a peek so the square visibly pans. First-run coach: "Tap a building". | 01–05, 29, 31, 40 | S–M |
| 7 | **One panel frame and dock rule.** Parchment content with an ink header and ✕. Town panels always right, with the nav fixed (no wrap, no jump). The route card moves into the drawer or a bottom sheet clear of the pan controls. One toast spot below the HUD, toast **or** inline. | 06–15, 28, 36, 37, 47–60, 71–75 | L |
| 8 | **Unify tabs and back controls.** One tab component (underlined parchment tabs) for town nav, packing, drawer and fallback. Rooms get "← Town". The Packing → Recipes tab keeps a Pack tab instead of switching to ✕. Remove web-blue links. Move `new game` into a Settings screen behind a confirm. | 01, 16, 32, 38, 42–44, 47, 52 | M |
| 9 | **Workshop legibility.** Row labels (Tools, Weapons, Armour, Food & potions, Carrying). Bigger mini-costs (or name + count on 2 lines). A material filter that visibly rings the nodes and shows "Iron Ore ✕" in the header. Can make hides rather than dims. Field view built from the same nodes + fog node. Hide the Make now strip in Field. | 16, 19–27, 29 | M |
| 10 | **Copy pass.** Apply the voice rules and the QA list in 5.7. Spell out T/G/B. Replace "(28,18)" with a red ring on the monster. Settings leaves the Here tab. | 07, 08, 19, 29, 37, 47, 48, 52, 57, 59, 63, 65, 73 | S |
| 11 | **Discoverability of holds and gestures.** A small "hold" corner tick on chips that open cards. A one-time hint for "tap a tile to plan" on the first expedition and "tap the line to cut back". Show the current auto-eat food with a badge. Worn rows get a ▾ swap affordance. | 32–35, 37, 45, 46, 48, 53, 58 | S |
| 12 | **Type and icon pass.** 3-size scale with a 12px floor, lining numerals (T1), custom SVG UI glyph set to replace emoji, one lock icon, silhouettes instead of letter placeholders. | all | M |
| 13 | **Fallback town parity.** Add Stable and Log tabs, drop the seed from the header, share the same panels as the square. | 42–44 | S |

**Order of work:** items 1–3 change how *every* expedition screen reads and fix the loop's missing payoff, so do them first. Items 4–6 fix the three worst individual screens. Item 7 is the big structural unification. Do it once 1 and 5 have defined the components it needs, rather than before.
