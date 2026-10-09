# Idle Adventure — UI audit pack

78 screenshots of the web game at **723×623** (an unfolded Honor Magic V6 foldable, roughly landscape-square), one per distinct UI state, each paired below with what that screen is *meant* to do and convey. This pack describes intent only. It does not judge or propose fixes; that is the reviewer's job.

## Primer: the game in ten lines

1. You live in a **town** and go on **expeditions** onto a procedurally generated 35×35 tile map, starting at the centre.
2. Before leaving, you **pack a loadout**: tools (pick, axe, knife, fishing rod…), food, potions, a weapon and armour, and optionally a backpack, a mount (horse) and panniers.
3. On the map you **plan routes by tapping tiles**, then walk. Walking and gathering spend **energy** (starts at 300). Fighting costs **HP** (30). Food refills energy and potions refill HP.
4. Everything you carry competes for **bag slots**: 6 pockets, or a backpack that replaces them, plus extra slots from a horse and panniers. Worn gear (weapon, armour, mount, backpack) takes no slot. Each loot slot holds a stack of 5.
5. **Returning home is free and instant** from anywhere. The tension is not "when do I turn back" but **how deep to push and how much to haul** before energy and HP run out.
6. Nodes on the map (ore, trees, forage, animals, water) need the right **tool**, and some are tier-gated. **Monsters** drop materials, and humanoid "camps" can drop **maps**.
7. Back in town, materials become gear through **crafting**. The recipe list is **fogged**: you only see recipes you start with, have crafted, have researched, or whose every ingredient you have held. Each tier also shows a count of hidden recipes.
8. A **research table** in town reveals one hidden recipe per search word. You get one free search per trip, and spending an ink buys five more.
9. Some recipes need **stations** you build in town: smokehouse, anvil, still and alchemical desk.
10. **Maps** have tiers (T1–T5) and biomes. The local T1 map is free and never used up. Earned maps are spent on embark and carry sealed **scout-report hints** that you reveal by "studying" them (this costs ore).

## Capture notes (read before judging)
- Every shot is 723×623 from desktop Chromium (`agent-browser`), with a fine pointer. On a real touch device, `main.ts` sets the map zoom to **1.35×** (`pointer: coarse`), so map tiles there are larger than in these shots. Hover tooltips (`title=`) carry a lot of detail on desktop but never appear on touch, and none of them show in these shots.
- The default art set is in use: the "cel" woodcut frames, with the pixel atlas filling gaps (`?art=` not set).
- Hard states were built by injecting saves made with the pure engine (scripts in `build/`). Bank contents, maps and stations are a plausible mid-game, not a real playthrough.
- Commit `f6cf9ca` ("tint map tiles by step cost", on by default) landed partway through the session. All expedition shots (45–78) were re-taken on a fresh server after it.
- In several expedition shots taken after the camera re-centred (e.g. 50, 61, 68–70), thin dark vertical lines show between tile columns. This could be a sub-pixel transform artefact of the capture. It has not been checked on a device.
- Town has two modes. The default **square** (a walkable illustrated village) uses side panels; **≡ menus** is a plain tabbed fallback with the same content (shots 42–44).

---

## Town — the square

### 01 — Town square, brand-new game · `shots/01-town-square-new-game.jpg`
- **Reached:** first launch, or any time you're in town with no panel open.
- **Do:** tap a building and the hero walks over and opens its panel. Drag, swipe or mouse-wheel pans the square sideways (it is wider than the screen). Tap open ground to stroll there. The tab strip (Maps, Bank, Recipes, Research, Stable, Log) opens the same panels without walking. `≡ menus` switches to the plain fallback town and `new game` wipes the save.
- **Convey:** this is home, and each building is a function. Building labels appear only on a tapped or arrived-at station. Empty staked plots are stations you have not built yet.
- **Rules to make legible:** the town is the between-runs hub where you choose a map, pack, craft, research and see the run log. In the square, the plot/station art is the only sign of which stations are built.

### 02 — Town square, mid-game · `shots/02-town-square-midgame.jpg`
- **Reached:** in town after some runs. An anvil (built) now stands where a plot was.
- **Do:** as in 01. The bottom strip shows the latest log line and opens the Log panel when tapped.
- **Convey:** your progress shows in the place (built stations replace plots). The last line says what just happened, here the end-of-run summary.
- **Rules:** built stations (`state.stations`) gate deeper recipes, and the square shows them on their plots.

### 03 — Square panned right: gate, cloth, cart · `shots/03-town-square-panned-gate.jpg`
- **Reached:** drag or wheel the square to the right.
- **Do:** the **Town gate** opens the packing sheet for the chosen map, or the Map board if none is chosen. The **Packing cloth** does the same. The cart is decoration.
- **Convey:** where expeditions start. The cloth is where your planned kit is laid out (see 40).
- **Rules:** leaving town needs a chosen map, then a packed loadout, then Embark.

### 04 — Square panned left: bank, map board, smokehouse · `shots/04-town-square-panned-left.jpg`
- **Reached:** drag or wheel to the left.
- **Do:** the Bank opens bank contents, the Map board opens maps, and the smokehouse (built) and its plot open the workshop.
- **Convey:** the rest of the town's functions, spread across a wide scene.
- **Rules:** same as 01. The scene is wider than any phone screen, so part of the town is always off-screen.

### 05 — Walking to a station, label shown · `shots/05-town-walking-to-stable-label.jpg`
- **Reached:** tap a building (here the Stable).
- **Do:** wait. The hero walks there (long walks fade out and back in), then the panel opens.
- **Convey:** which building you picked (its name label lights up).
- **Rules:** none. This step is presentational.

### 06 — Arrived at a station; panel docks left · `shots/06-town-stable-arrived-panel-left.jpg`
- **Reached:** the hero arrives at a station on the right half of the square.
- **Do:** use the panel, close it with ✕, or pick another tab. The square stays live beside it.
- **Convey:** the panel docks on the side opposite the hero so that the hero stays visible.
- **Rules:** none beyond the panel's own (see 11).

### 07 — Map board panel (where to?) · `shots/07-town-panel-maps.jpg`
- **Reached:** the Maps tab, the Map board building, or the gate with no map chosen.
- **Do:** **Prepare ▶** on a map selects it, walks the hero to the cloth and opens packing. On an earned map, **Study (1 Copper Ore)** reveals the next sealed hint and an **ink** button rolls an affix onto the map.
- **Convey:** your options for the next trip. The free local map (always here, T1, never used up, "plain country, no hints") is set apart from earned maps, which show a tier badge, biome, age in runs and hint chips (`T:`/`G:`/`B:` for threat/ground/bounty, or "[sealed …]").
- **Decision supported:** a safe, renewable run, or spending a precious earned map? Is it worth studying this one first?
- **Rules:** earned maps come from humanoid drops and are **spent on embark**. Hints are rolled when the map drops and revealed one per study. Inks add affixes.

### 08 — Map board after studying a map · `shots/08-map-board-after-study.jpg`
- **Reached:** press Study on a map card (shown from a different save than 07, so the map list differs).
- **Do:** as in 07. One more hint chip on the card is now readable ("B: ore-rich").
- **Convey:** what studying bought you, and how many hints are still sealed.
- **Rules:** each study costs 1 copper ore and reveals one hint in a fixed order. "fully studied" replaces the button when all are read.

### 09 — Bank panel · `shots/09-town-panel-bank.jpg`
- **Reached:** the Bank tab or building.
- **Do:** **pack** puts one into the loadout plan, and **+spare** packs a spare worn piece into the bag. Materials only show the word "material". Hold any item for its card (37/73).
- **Convey:** everything you own, what can be packed, and what is crafting stock only.
- **Rules:** packing in town is a **plan**, and the bank is debited only at Embark. Materials can't be packed. "✓ packed" badges appear on planned items.

### 10 — Bank panel scrolled · `shots/10-town-panel-bank-scrolled.jpg`
- **Reached:** scroll the bank panel.
- **Do / Convey:** the rest of the bank (crafted gear, tools, inks). Same rules as 09.

### 11 — Stable panel · `shots/11-town-panel-stable.jpg`
- **Reached:** the Stable tab or building.
- **Do:** **take it** adds a horse (or cart) or panniers to the loadout plan.
- **Convey:** your animals and carts and what each is good for ("faster on open ground"). Taking one costs no bag slot.
- **Rules:** transport adds carry slots and divides the energy cost of some terrains. Panniers add slots but only on a beast.

### 12 — Log panel (town) · `shots/12-town-panel-log.jpg`
- **Reached:** the Log tab, tapping the bottom log strip, or automatically on returning from a run (see 78).
- **Do:** read only.
- **Convey:** what happened, newest first: the run-end summary, gathers with energy spent ("chopped 3× Oak Log · −40⚡ → 260⚡").
- **Rules:** the run-end flavour line reflects how spent you were on return. Returning near-empty reads as a trek, returning fresh as boredom (D62).

### 13 — Research table, ready · `shots/13-town-panel-research.jpg`
- **Reached:** the Research tab or the Research table building.
- **Do:** type a word ("what do you want to make? bag, boat, armour…") and press **Search**. **Spend 1 Ore Ink → 5 searches** buys more.
- **Convey:** how many searches you have ("1 free search this visit") and that words are the key.
- **Decision supported:** what you most want to unlock next.
- **Rules:** recipes are fogged (D104). A search reveals **one** unknown recipe matching the word, up to your progress tier +1. Every search costs one, hit or miss. One is free per town visit, and ink buys 5.

### 14 — Research: a hit · `shots/14-research-hit.jpg`
- **Reached:** search a matching word ("boat").
- **Do:** **find it in the workshop →** opens the tree and flashes the recipe. History entries are links.
- **Convey:** what was revealed (a recipe card: output, effect line, inputs, with never-held inputs greyed) and the remaining search budget (now "no searches left — come back from a trip, or spend an ink").
- **Rules:** the revealed recipe is marked "researched". Inputs you have never held become "heard of" (greyed, named).

### 15 — Research: a miss, after buying with ink · `shots/15-research-miss-after-ink.jpg`
- **Reached:** spend an ink, then search a word that matches nothing.
- **Convey:** "Nobody in town has heard of that." The budget now shows bought searches ("4 bought searches left"), and the "Asked so far" history lists every word and its result.
- **Rules:** a miss still costs a search, by design (learning the vocabulary pays off). The same miss text covers words that only match beyond-tier recipes, so nothing is spoiled.

---

## Town — the workshop (crafting tree)

### 16 — Workshop at rest · `shots/16-workshop-tree.jpg`
- **Reached:** the Recipes tab, the Workshop building, a station plot (29), or the Recipes tab on the packing sheet (38). It is full-screen.
- **Do:** pan the tree (drag with a mouse, native scroll on touch). Tap a node to select it (tray, 17). Filters are **All known / Can make (N) / Field**, plus **Materials ▾**. The **Make now** strip jumps to craftable items. ✕ closes.
- **Convey:** a Civ-style tech tree. Columns are tiers (I, II, III… each with "N known · M hidden"), rows group kinds (tools, weapons, armour, food/potions, carrying). Each node shows output, a mini cost and a badge: green ×N (can make N now), red "short" (missing materials), or 🔒 (missing a station or tool). Lines link an item to what it feeds, and dashed lines mean "is the tool for".
- **Decision supported:** what you can make right now and what you are working toward.
- **Rules:** fog (D104). Recipe tier is derived from where its inputs come from. Stations and tools gate some recipes.

### 17 — Node selected, detail tray · `shots/17-workshop-node-selected-tray.jpg`
- **Reached:** tap a node (Iron Pick).
- **Do:** the tray's craft bar has a − / + / max quantity stepper and **Craft N**. "Used in" chips jump to other nodes. Swipe the tray down to tuck it (22), or ✕ to deselect.
- **Convey:** tier, known/researched status and how many you hold. The description ("tool · pick — unlocks coal, salt, silver-ore") and per-ingredient "need X · you have Y ✓ / N short". The tree highlights the selected item's chain (inputs in, outputs out).
- **Rules:** "can make" is what the reducer would really accept N times in a row. The tray never calculates it separately.

### 18 — Tray with quantity at max · `shots/18-workshop-tray-qty-max.jpg`
- **Reached:** press **max** in the tray.
- **Convey:** costs restated for the batch ("Costs (×4)", need 8 · you have 9) and the button reads **Craft 4**.
- **Rules:** crafting is instant, materials → item, and each one is a real craft action.

### 19 — Node that's short of materials · `shots/19-workshop-node-short.jpg`
- **Reached:** select a red "short" node (Horse).
- **Convey:** which ingredient is short and by how much ("need 3 · you have 2 · 1 short"). Can make 0, Craft disabled. The description gives the item's effect (transport speed and carry).
- **Rules:** the only gap is materials, which a trip can fix.

### 20 — Node that's gated (tool/station) · `shots/20-workshop-node-gated.jpg`
- **Reached:** select a 🔒 node (Arrow Shaft).
- **Convey:** "🔒 needs [Fletchers Knife]", where the chip jumps to that node. The dashed tool edge on the tree is lit.
- **Rules:** some recipes need a tool held in town, or a built station.

### 21 — Researched node with unknown/unheld inputs · `shots/21-workshop-node-researched-unknown-inputs.jpg`
- **Reached:** select a node revealed by research (Longboat).
- **Convey:** "found at the research table". The ingredient Driftwood has never been held (no icon, letter placeholder), and short counts show in red.
- **Rules:** research reveals recipes ahead of your materials. "???" inputs would mean never encountered at all.

### 22 — Tray tucked to a minibar · `shots/22-workshop-tray-collapsed.jpg`
- **Reached:** swipe the tray down, or tap its grab handle.
- **Do:** tap the minibar to expand it again. The selection highlight stays on the tree.
- **Convey:** the selected item and "can make N" in one line, freeing the canvas.

### 23 — Materials dropdown · `shots/23-workshop-materials-dropdown.jpg`
- **Reached:** **Materials ▾** in the header.
- **Do:** tap a material to light up every node that uses it.
- **Convey:** the materials you hold that some visible recipe uses, with counts.
- **Decision supported:** "I have 9 iron ore, so what is it good for?"

### 24 — A material lit on the tree · `shots/24-workshop-material-lit-iron-ore.jpg`
- **Reached:** pick a material in 23, then close the dropdown.
- **Convey:** nodes that consume the chosen material (iron ore) are marked (`matuse` class). In this capture the marking is subtle.

### 25 — Filter: Can make · `shots/25-workshop-filter-can-make.jpg`
- **Reached:** the **Can make (56)** segment.
- **Convey:** nodes you can't make right now are dimmed. The count is in the button.

### 26 — Filter: Field · `shots/26-workshop-filter-field.jpg`
- **Reached:** the **Field** segment.
- **Convey:** recipes made out on an expedition rather than in town ("from the bag's Craft tab"), each with its own condition ("stand on or next to river"), and "+ N undiscovered".
- **Rules:** field crafting needs a kit (fire-kit, glassware…) carried in the bag and costs 10⚡ each.

### 27 — Fog node (undiscovered) · `shots/27-workshop-fog-node.jpg`
- **Reached:** scroll to the bottom of a tier column.
- **Convey:** "+12 undiscovered — research to find". This is the visible size of the fog in each tier.
- **Rules:** a hidden recipe becomes known once you hold all its inputs, craft it, or research it.

### 28 — Craft feedback (toast + inline note) · `shots/28-workshop-craft-toast.jpg`
- **Reached:** press Craft in the tray.
- **Convey:** "+1 Iron Axe — in the bank (now 1)" appears both as a top toast and inline under the craft bar. A refusal would read "✗ …" in red with the reason.
- **Rules:** town crafts go to the bank.

### 29 — Tapping an unbuilt station plot · `shots/29-unbuilt-plot-opens-workshop-at-station.jpg`
- **Reached:** tap an empty plot in the square (the Still plot).
- **Convey:** the workshop opens with that station's build recipe selected and flashed. Here it is short ("need 3 Glass Vial · you have 2"), and "Used in" shows what the station unlocks ("Silver Oil (as the tool)").
- **Rules:** stations are built by crafting them. If the station's recipe is still fogged, nothing is focused.

---

## Town — choosing a map, packing, embarking

### 30 — Gate tapped with no map chosen · `shots/30-gate-no-map-chosen-opens-board.jpg`
- **Reached:** tap the Town gate before picking a map.
- **Convey:** the gate redirects you to the Map board (docked left, since the hero is on the right).
- **Rules:** a map choice comes first.

### 31 — Map chosen; walking to the cloth · `shots/31-map-chosen-walking-to-cloth.jpg`
- **Reached:** **Prepare ▶** on a map.
- **Do:** the hero walks to the packing cloth and the Pack sheet opens. Closing the sheet keeps the choice: a **Pack ▶** tab appears in the strip and a hint sits bottom-right ("the local map chosen — the packing cloth is by the gate ▶").
- **Convey:** which map is chosen and where to go to pack.

### 32 — Packing sheet, empty · `shots/32-packing-empty.jpg`
- **Reached:** arrive at the cloth or gate with a map chosen, or press Pack ▶.
- **Do:** **← town** goes back. Tabs are **Pack | Recipes**. Tap a bank chip to pack one (greyed chips are materials or don't fit). **Reset** clears the plan and **Embark ▶** goes.
- **Convey:** a segmented **bag gauge** (6 Pockets → "loot ×5" cells, "BAG 0/6 · 6 free = room for 30 loot"), and the **map page** (biome, tier, scout reports: "plain country — no scout reports", "Expected haul: forage — pack a pick, axe or trap + knife to bring more home"). Also the **bag page** ("Nothing packed yet… worn gear is free"), the **Worn** strip ("free · no slots", empty slots), and the footer **Energy 300 + 0 from food** with warning "⚠ no food". The header notes whether embarking spends the map.
- **Decision supported:** what this trip needs and whether it will fit.
- **Rules:** these are the carry-slot rules, explained in the primer.

### 33 — Packing: just packed (glow) · `shots/33-packing-packed-with-glow.jpg`
- **Reached:** tap a bank chip (Fishing Rod).
- **Convey:** the new bag row and its gauge cell glow briefly to confirm where it landed.

### 34 — Packing sheet, packed · `shots/34-packing-packed.jpg`
- **Reached:** after packing backpack, horse, panniers, sword, helmet, chest, tools, food and potion.
- **Convey:** the gauge is now grouped by source ("8 Small Backpack | +2 Horse | +4 Panniers", BAG 8/14, 6 free = 30 loot). Each bag row shows what the item gives ("Iron Pick → ore", "Ration ×3 → +80 energy each"), its slot cost and a − (unpack one). Worn shows Sword, Plate Helmet, Light Chest, Horse +2, Small Backpack 8 slots, Panniers +4. The footer reads Energy 300 + 240 from food, and Expected haul lists ore · wood · forage · fish.
- **Decision supported:** fill slots with supplies (go further) or keep them free (bring more home).
- **Rules:** a backpack replaces the 6 pockets, while a mount and panniers add to it. Food, potion and tool units take 1 slot each. Arrows stack 10 and flasks 3 per slot.

### 35 — Worn slot swap menu · `shots/35-packing-worn-swap-menu.jpg`
- **Reached:** tap a worn row (Sword).
- **Do:** pick an alternative (Club, Bow) or **take off**.
- **Convey:** what else you own for that slot.

### 36 — Bag full, refusal + warnings · `shots/36-packing-full-refusal-warnings.jpg`
- **Reached:** keep packing until the bag is full, and swap to a bow with no arrows.
- **Convey:** a toast and inline note ("✗ can't pack Tent — bag full — every slot is taken (unpack something, or wear a bigger pack)"). The gauge shows "BAG 14/14 · 0 free: no room for loot!". Footer warnings: "⚠ Bow, no ammo", "⚠ bag full before you start". The worn row reads "Bow no ammo".
- **Rules:** a bow with no ammo swings like a club. A full bag at departure means nothing gathered will fit.

### 37 — Item card (press-and-hold) · `shots/37-item-card-hold.jpg`
- **Reached:** press and hold any item, anywhere (bank chip, bag slot, tree…). An item with no tap action of its own also opens on a plain tap.
- **Do:** close with ✕ or by tapping outside.
- **Convey:** what the item is and does ("weapon · 2 melee dmg — … strongest against soft, unarmoured hides") and **where it comes from**.
- **Rules:** this is the touch stand-in for hover tooltips (which phones never show).

### 38 — Packing sheet → Recipes tab · `shots/38-packing-recipes-tab.jpg`
- **Reached:** the **Recipes** tab on the packing sheet.
- **Convey:** the full-screen crafting tree (same as 16), so you can craft a missing item mid-pack. ✕ returns to the Pack tab.

### 39 — Packing for an earned map (scout reports) · `shots/39-packing-held-map-scout-reports.jpg`
- **Reached:** Prepare on an earned T2 map with one hint studied.
- **Convey:** the header says "⚠ embarking SPENDS this map" and Embark reads "spends map". The map page lists the scout reports, each checked against the plan ("ore-rich — Iron Pick ✓", "the usual dangers — nothing to bring", "sealed ground report — study to read") and a Study button. An unmet report adds a footer warning ("map wants …").
- **Decision supported:** does my kit answer what this map is known to hold?
- **Rules:** hints come in three families (ground/threat/bounty). Some name the gear they want, such as a pick for ore-rich or a filter-mask for spores.

### 40 — The packing cloth shows the plan · `shots/40-town-cloth-with-planned-items.jpg`
- **Reached:** in the square with a loadout planned, pan to the cloth.
- **Convey:** up to 12 planned items laid out as icons on the cloth, so the plan is visible in the world.

### 41 — Embark: walking out of the gate · `shots/41-embark-walk-out.jpg`
- **Reached:** press **Embark ▶**.
- **Convey:** the gate swings open and the hero walks out, then the expedition screen loads (45). A refused embark skips the animation and logs why.

### 42 — Fallback "≡ menus" town: Maps · `shots/42-menus-town-maps.jpg`
- **Reached:** `≡ menus` in the square's top-right. Remembered per device. `◱ the square` switches back.
- **Convey:** the same map board as 07 in a plain tabbed page (Maps | Bank | Recipes | Research). The header shows the seed.
- **Rules:** kept so every function stays reachable without the scene.

### 43 — Fallback town: Bank · `shots/43-menus-town-bank.jpg`
- Same content and rules as 09, in the plain page.

### 44 — Fallback town: Research · `shots/44-menus-town-research.jpg`
- Same content and rules as 13/15, in the plain page (history carries over).

---

## Expedition — the map

### 45 — First view after embarking · `shots/45-expedition-first-view-after-embark.jpg`
- **Reached:** embark (here on a desert local map with a fishing rod packed, landing beside a river).
- **Convey:** the map fills the screen. The HUD (top-left) shows biome, ⚡ Energy bar n/300 and HP. Top-right has ◎ recentre and 🏠 head home, and the edges have ▲▼◀▶ pan buttons. The bottom drawer handle names your tile and "9/14 bag". The quick action **🎣 Fish** sits bottom-right because water is adjacent, and the small red-white bobbers mark the fishable water tiles.
- **Rules:** you start at the map centre with full energy. The map is fixed by its seed and biome.

### 46 — Expedition, drawer closed · `shots/46-expedition-map-drawer-closed.jpg`
- **Reached:** the default expedition view.
- **Do:** **tap a tile to plan a route** (53+). Drag (one or two fingers), wheel or arrow/WASD pans. ◎ recentres, the pan buttons step, and tapping the handle opens the drawer.
- **Convey:** the terrain and what's on it. Node icons are rocks (ore), stumps (wood), plants (forage) and feathers (animal), and monster sprites sit on tiles. Each tile is tinted by what a step onto it costs with your current gear (green cheap → red slow), and impassable tiles are crosshatched. Far nodes don't reveal their details until in sight or surveyed.
- **Decision supported:** where to go, and what is worth the energy.
- **Rules:** energy spends per step by terrain (gear and mounts change it). Unreachable terrain needs specific gear (climbing pick, raft…).

### 47 — Drawer open: Here tab (landscape side sheet) · `shots/47-drawer-here.jpg`
- **Reached:** tap the drawer handle, or a tab. At this aspect the drawer is a right side sheet.
- **Convey:** "Here: open plains · nothing to do." A collapsed **Settings** sits below. The handle line repeats your tile and bag count.
- **Rules:** the Here tab is the context panel: gather/fight/fish availability and why not.

### 48 — Drawer: Bag tab · `shots/48-drawer-bag.jpg`
- **Reached:** the **Bag 9/14** tab.
- **Do:** tap a food to eat one. Long-press or right-click a food to make it the auto-eat food. **doff** stows a worn piece (−2⚡, then it takes a slot). Hold any slot for the item card.
- **Convey:** a slot grid: filled boxes (food, potions, tools), empty "·" boxes up to capacity, and a ghost strip of worn gear (free). Every worn item and tool is listed with a doff button.
- **Rules:** each food, potion or tool unit is its own box, loot stacks, and worn gear doesn't count.

### 49 — Drawer: Craft tab (nothing craftable) · `shots/49-drawer-craft.jpg`
- **Reached:** the **Craft** tab without a kit.
- **Convey:** "Nothing to craft here. Field recipes need a kit (fire-kit, glassware…) and their ingredients."

### 50 — Drawer: Log tab (expedition) · `shots/50-drawer-log.jpg`
- **Reached:** the **Log** tab after walking a route.
- **Convey:** a per-walk summary ("walked 8 tiles → (26,11) · −108⚡ · auto-gathered 2× nodes").
- **Rules:** walking auto-gathers nodes you land on (togglable). The summary nets out auto-eating along the way.

### 51 — Drawer: Bag with loot · `shots/51-drawer-bag-with-loot.jpg`
- **Reached:** the Bag tab after gathering.
- **Convey:** loot stacks (×N) fill the empty boxes, and carried items get drop buttons.
- **Decision supported:** is there room for the next node or kill, and what would I drop?

### 52 — Here tab: Settings expanded · `shots/52-drawer-here-settings-open.jpg`
- **Reached:** expand **Settings** in the Here tab.
- **Do:** toggles for **Cost colours** (map tint), **Auto-gather on walk**, **Auto-potion** (drink at low HP mid-fight) and **Auto-finish fights** (resolve in one tap), plus `new game`.
- **Convey:** the current state of each automation.

---

## Expedition — planning routes

### 53 — Route to a monster: pre-fight card · `shots/53-route-to-monster-prefight.jpg`
- **Reached:** tap a monster tile.
- **Do:** **Fight ▶** walks there and engages. ✕ clears. Tap more tiles to add waypoints, or tap a tile on the line to cut it back to there.
- **Convey:** the drawn route (blue outlined tiles). A label on the target names it and the walk cost ("Mirage Wisp · −28⚡"). The HUD energy bar splits into keep (green) and spend (orange) with "282/300 → 254". The **pre-fight card** shows portrait, a **verdict** ("CLEAN WIN" green), loot icons (×2, "?" for chance drops), and both sides' attack and armour types ("you ⚔ melee 🛡 plate 🧥 light · it ? attack ? hide"). The drawer handle shows "▸ ● Mirage Wisp".
- **Decision supported:** is this fight worth it, and can I afford the walk?
- **Rules:** fights are deterministic. The verdict is green (win without potions), orange (win only by drinking carried potions) or red (lose even with them), with no numbers shown (D103). The monster's types read "?" until it's in sight or surveyed (spyglass). Damage types and armour interact (melee/ranged/magic vs plate/light/robe).

### 54 — Pre-fight card: costly verdict · `shots/54-prefight-card-costly-verdict.jpg`
- **Reached:** same route at low HP (6).
- **Convey:** "COSTLY WIN" in orange: you'd need your potions. The label on the target gets an orange dot.

### 55 — Pre-fight card: lose verdict · `shots/55-prefight-card-lose-verdict.jpg`
- **Reached:** HP 4 and no potions.
- **Convey:** "YOU'D LOSE" in red.
- **Rules:** a lost fight ends the run on the spot (`run-ended: defeated`). The verdict exists to keep you from walking into that blind.

### 56 — Route to a far monster · `shots/56-route-to-far-monster-verdict.jpg`
- **Reached:** tap a monster several tiles away (Dust Djinn).
- **Convey:** the same card for a stronger monster, with the verdict computed even though its types are still "?".

### 57 — Route that runs into a monster (ambush warning) · `shots/57-route-ambush-warning.jpg`
- **Reached:** tap a tile whose straight line passes through a monster you would lose to.
- **Convey:** "⚠ runs into a Dust Djinn at (28,18) you'd LOSE to — reroute."
- **Rules:** routes are straight lines between waypoints with **no pathfinding**. Walking auto-engages the first monster on the line, so routing around it is your job.

### 58 — Blocked route · `shots/58-route-blocked.jpg`
- **Reached:** tap a tile beyond impassable terrain.
- **Convey:** the blocking tile is outlined in red and the tile label says "Mountain · can't reach". The bar reads "✗ The mountains block this path — only a climbing pick gets you across. Tap the line to unwind." **Walk** is disabled.
- **Rules:** terrain gates. The note names the wall and the gear that crosses it.

### 59 — Multi-waypoint route to nodes · `shots/59-route-multi-waypoint-gather.jpg`
- **Reached:** tap one node, then another.
- **Convey:** two legs drawn, waypoints marked, and the total "8 tiles · −48⚡". The target label reads "Ore vein · −48⚡" and the handle "▸ Ore vein → ?".
- **Decision supported:** how far can I get on my energy?
- **Rules:** the route bar adds a "(walk + gather)" split when gathering costs are included. Some terrain adds an HP cost (spore-thickets without a mask) or a "slower going" note.

### 60 — Route that strands you · `shots/60-route-strands-you.jpg`
- **Reached:** plan a route longer than your energy, with no food.
- **Convey:** the HUD reads "25/300 → 0 ⚠ strands you" with a red spend bar, and the cost in the route bar is red.
- **Rules:** the projection accounts for auto-eating along the way. Running dry isn't fatal (return is free), but it ends your ability to keep extracting.

### 61 — After a walk: pickup cues · `shots/61-after-walk-pickup-cues.jpg`
- **Reached:** press **Walk ▶** on a route over nodes.
- **Convey:** "+3" item icons rise off each auto-gathered node and fly toward the bag count. The camera re-centres on you, and the handle reads "Plains · worked out · 11/14 bag".
- **Rules:** a walk halts on a fight, an obstacle or a full bag. On a full bag the rest of the route is kept so you can make room and resume.

---

## Expedition — gathering, fishing

### 62 — Standing on a node: quick action · `shots/62-standing-on-node-quick-gather.jpg`
- **Reached:** be on a gatherable tile (here a stand of trees with an axe).
- **Do:** **🪓 Chop** (bottom-right) gathers without opening the drawer.
- **Convey:** the handle says what this tile yields ("Stand of trees → Oak Log").
- **Rules:** gathering costs energy and needs the right tool. Gated materials need a better tool tier.

### 63 — Here tab on a node · `shots/63-drawer-here-on-node.jpg`
- **Reached:** open the drawer on a node.
- **Convey:** "Here: a stand of trees — Oak Log." with a **Chop it** button. If you couldn't, it would show 🔒 and the reason ("needs a pick", "bag full"…).

### 64 — Next to water: Fish quick action · `shots/64-next-to-water-fish.jpg`
- **Reached:** be beside fishable water with a fishing rod.
- **Convey:** **🎣 Fish** in the quick-action spot, and a bobber dot on the water tile you'd cast into.
- **Rules:** a cast costs 25⚡. Each water spot bites once, and deeper water gives a bigger catch (deep water needs a boat).

### 65 — Here tab: fishing line · `shots/65-drawer-here-fish-line.jpg`
- **Reached:** open the drawer beside water.
- **Convey:** "🎣 Fish the deepest water beside you (−25⚡) · each spot bites once; deeper water, bigger catch."

### 66 — After a cast · `shots/66-fish-cast-feedback.jpg`
- **Reached:** press Fish.
- **Convey:** the catch's icon sits on the fished tile (the spot now shows as fished), energy dropped 300 → 275, and the bag count went 9 → 10.

---

## Expedition — fighting

### 67 — Fight sheet, mid-fight · `shots/67-fight-sheet-mid-fight.jpg`
- **Reached:** walk onto or Fight a monster. The drawer closes and the sheet covers the bottom of the map.
- **Do:** **⚔ Fight** (one round), **🏃 Flee** (take one parting hit), **🧪 Quaff** (drink a potion, costs a turn). Also Throw, Use battle item, Coat weapon, Don/Doff (each costs a turn), and toggles for auto-quaff and **⏩ auto-finish**. Only legal actions appear.
- **Convey:** **You** (portrait, HP bar 27.2/30, attack/armour type chips, 🧪 ×2 potions) ‖ **verdict** banner ("CLEAN WIN") with actions ‖ **Monster** (HP 3.5/8, its types ✨ magic 👘 robe, loot icons).
- **Decision supported:** keep swinging, drink, swap gear, or flee?
- **Rules:** deterministic exchanges, and the verdict pulses when an action changes it. Auto-quaff fires at 50% HP. Loot must fit the bag (checked at engage).

### 68 — Fight sheet after a round · `shots/68-fight-sheet-after-a-round.jpg`
- **Reached:** press ⚔ Fight once (vs Dust Djinn).
- **Convey:** both HP bars dropped (you 24.5/30, it 11.5/16), with the verdict still green.

### 69 — Fight sheet: costly · `shots/69-fight-sheet-costly.jpg`
- **Reached:** engage at HP 12.
- **Convey:** an orange verdict banner and an orange sheet border: winnable only by using potions.

### 70 — Fight sheet: you'd lose · `shots/70-fight-sheet-lose.jpg`
- **Reached:** engage at HP 5.
- **Convey:** "YOU'D LOSE" in red, with the red border signalling that Flee is the sensible move.

---

## Expedition — field crafting, items, going home

### 71 — Craft tab with field recipes · `shots/71-drawer-craft-field-recipes.jpg`
- **Reached:** the Craft tab while carrying a fire-kit + glassware and ingredients.
- **Do:** **🔥 Craft** per ready recipe (−10⚡ each).
- **Convey:** ready recipes with output, "← inputs", and "have N". Kit-locked recipes are greyed with what they need ("🔒 Stew — needs fire-kit + cooking-pot").
- **Rules:** field recipes cook or brew out of carried materials, so food can be made on the spot.

### 72 — Field-craft result note · `shots/72-field-craft-result-note.jpg`
- **Reached:** press Craft.
- **Convey:** "+1 Cooked Venison — in your bag (now 1)", shown as both toast and inline note.

### 73 — Item card for a material (sources) · `shots/73-item-card-material-sources.jpg`
- **Reached:** tap or hold a loot slot in the bag.
- **Convey:** "a crafting material", and "Where it comes from: Stand of trees in Woodland, Desert, Tundra, Swamp, Coastal, Jungle · needs a Axe".
- **Decision supported:** where do I get more of this?

### 74 — 🏠 Head home? confirm · `shots/74-head-home-confirm.jpg`
- **Reached:** tap 🏠 (top-right).
- **Do:** **🏠 Go home** or **Stay**.
- **Convey:** "You'll walk back to town with everything you carry. The trip home is free."
- **Rules:** return is free and instant from anywhere (D62). Ending early forfeits the remaining energy, not the haul.

### 75 — "You're exhausted" card · `shots/75-exhausted-card.jpg`
- **Reached:** comes up by itself when no move, eat or food-craft is possible (0 energy, no food, nothing to cook).
- **Do:** **🏠 Go home** or **Not yet**.
- **Convey:** "No energy left, nothing to eat, and nothing here to cook. Head home with what you carry?" The HUD shows 0/300.

### 76 — Exhausted, card dismissed · `shots/76-exhausted-dismissed.jpg`
- **Reached:** press **Not yet**.
- **Convey:** back on the map with 0 energy. 🏠 is still there, and the card returns after any accepted action.

### 77 — Arriving home: walk-in · `shots/77-home-walk-in.jpg`
- **Reached:** Go home.
- **Convey:** the town gate is open and the hero walks back in, then the gate shuts behind him.

### 78 — Home: Log opens with the run summary · `shots/78-home-arrived-log-panel.jpg`
- **Reached:** automatically, at the end of the walk-in.
- **Convey:** the Log panel with the run-end flavour line ("Nothing here worth your time, you amble home. — run ended (returned) —"). Carried loot is now in the bank.
- **Rules:** the loop closes here. From the haul you craft, research and pick the next map.

---

## Files
- `NN-*.png`: the screenshots (78).
- `build/`: the throwaway save builder (`build.ts`, `hard.ts`), injected saves (`aud-*.json`), and driver scripts (`inject.sh`, `exp-shots.sh`). These are not needed for review.
