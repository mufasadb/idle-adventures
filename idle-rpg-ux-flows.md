# Idle RPG - User Experience Flows

**Related Documents**:
- `idle-rpg-game-design.md` - High-level game design
- `idle-rpg-dev-spec.md` - Technical specification
- `design-decisions-log.md` - Design decision history

---

This document describes key user journeys: what the player does, why they're doing it, and what they expect to see.

**Core Philosophy**: Active play first, idle second. Meaningful micro-decisions. Trade real-world time for in-game efficiency.

---

## The Two Modes of Play

| Mode | Where | What Happens | Decisions |
|------|-------|--------------|-----------|
| **Expeditions** | Out in the world | Navigate grid, gather, fight, bring stuff back | Constant micro-decisions, minigames optional |
| **Town Work** | Home base | Process materials, craft gear, prepare | Planning, optimization, no risk |

```
Expedition (active, risky, limited by carry)
    ↓
Town (safe, process what you gathered)
    ↓
Expedition (better prepared)
    ↓
Repeat
```

---

## Flow 1: First Time User (Onboarding)

### Context
Player just downloaded the app. Never played before.

### Goal
Get them on their first expedition within 3 minutes. Teach through doing.

### Flow

```
1. LAUNCH APP
   ├── Brief splash (< 2 sec)
   └── "Create Your Character"
       ├── Choose name
       └── [BEGIN]

2. ARRIVE IN HOME TOWN
   ┌─────────────────────────────────────────────┐
   │  Welcome to Thornvale.                      │
   │                                             │
   │  "A new adventurer! The wilderness awaits.  │
   │   But first, you'll need supplies."        │
   │                                             │
   │  You receive:                               │
   │  • Worn Backpack (50 carry capacity)        │
   │  • Basic Pickaxe                           │
   │  • 3 days of rations                       │
   │  • Beginner's Map: Copper Hollow           │
   │                                             │
   │  [CONTINUE]                                 │
   └─────────────────────────────────────────────┘

3. FIRST MAP INSPECTION
   ┌─────────────────────────────────────────────┐
   │  📜 BEGINNER'S MAP: COPPER HOLLOW           │
   │                                             │
   │  Distance: Very Near (1 day travel)         │
   │  Rations needed: 1 day there + 1 day back   │
   │                                             │
   │  KNOWN CONTENTS:                            │
   │  • Copper ore deposits                      │
   │  • Some herbs                               │
   │  • Minor creatures (low danger)             │
   │                                             │
   │  "This beginner's map shows basic info.    │
   │   Higher Cartography reveals more detail." │
   │                                             │
   │  [PREPARE EXPEDITION]                       │
   └─────────────────────────────────────────────┘

4. EXPEDITION PREP (Simplified for tutorial)
   ┌─────────────────────────────────────────────┐
   │  PREPARE EXPEDITION                         │
   │                                             │
   │  Map: Copper Hollow                         │
   │  Travel: 1 day each way                     │
   │                                             │
   │  PACKING:                                   │
   │  ✓ Rations: 2 days (minimum for round trip)│
   │  ✓ Pickaxe: Basic Pickaxe                  │
   │  ✓ Backpack: 50 capacity                   │
   │                                             │
   │  Days at destination: 1                     │
   │  (Bring more rations = stay longer)        │
   │                                             │
   │  [BEGIN EXPEDITION]                         │
   └─────────────────────────────────────────────┘

5. TRAVEL (Brief)
   ├── "Traveling to Copper Hollow..."
   ├── Simple animation or progress
   └── Takes a few seconds (tutorial speed)

6. ARRIVAL: THE GRID REVEALS
   ┌─────────────────────────────────────────────┐
   │  COPPER HOLLOW                              │
   │  Days remaining: 1  |  Carry: 0/50         │
   │                                             │
   │    0   1   2   3   4                        │
   │  ┌───┬───┬───┬───┬───┐                     │
   │ 0│🚩│   │ ⛏ │   │   │  🚩 You are here    │
   │  ├───┼───┼───┼───┼───┤  ⛏ Mining node     │
   │ 1│   │ 🌿│   │ ⛏ │   │  🌿 Herbs          │
   │  ├───┼───┼───┼───┼───┤  🐀 Creature       │
   │ 2│   │   │ 🐀│   │ ⛏ │                     │
   │  └───┴───┴───┴───┴───┘                     │
   │                                             │
   │  Tutorial: "Tap a node to move there.      │
   │  Movement costs time. Choose wisely!"      │
   │                                             │
   └─────────────────────────────────────────────┘

7. FIRST MOVEMENT
   ├── Player taps the ⛏ at [2,0]
   ├── Character moves (1 "hour" passes)
   └── Arrives at mining node

8. FIRST GATHERING
   ┌─────────────────────────────────────────────┐
   │  ⛏ COPPER ORE DEPOSIT                       │
   │                                             │
   │  Ore available: ~15-20                      │
   │  Your Mining: Level 1                       │
   │  Time to clear: ~3 hours                    │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ ⛏ MINE (Manual)                     │   │
   │  │ Play the mining minigame            │   │
   │  │ Yield: 85-100%                      │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🔄 AUTO-MINE                        │   │
   │  │ Hands-off gathering                 │   │
   │  │ Yield: 70%                          │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  "Mining manually gets more ore.           │
   │   Auto is easier but less efficient."      │
   │                                             │
   └─────────────────────────────────────────────┘

9. MINING MINIGAME (First time)
   ┌─────────────────────────────────────────────┐
   │            SWING THE PICKAXE                │
   │                                             │
   │     Power: █████████░░░ 75%                │
   │                                             │
   │         ⛏                                  │
   │                                             │
   │   ┌─────────────────────────────────────┐  │
   │   │░░░░░░░░███████░░░░░░░░░░░░░░░░░░░░│  │
   │   │        ↑ GREEN = Perfect            │  │
   │   └─────────────────────────────────────┘  │
   │                                             │
   │   Tap [SWING] when power is in the zone!  │
   │                                             │
   │   [SWING]                                  │
   │                                             │
   └─────────────────────────────────────────────┘

   Player swings a few times...

   ┌─────────────────────────────────────────────┐
   │  ✓ NODE CLEARED                             │
   │                                             │
   │  Results:                                   │
   │  • 17 Copper Ore (94% efficiency!)         │
   │  • +85 Mining XP                           │
   │                                             │
   │  Time spent: 3 hours                       │
   │  Carry: 17/50                              │
   │  Day remaining: 21 hours                    │
   │                                             │
   │  [CONTINUE]                                 │
   └─────────────────────────────────────────────┘

10. EXPLORE MORE
    ├── Player visits more nodes
    ├── Gathers herbs (different minigame)
    ├── Maybe avoids or fights the creature
    └── Eventually: "Day ending, time to return"

11. RETURN JOURNEY
    ├── "Heading back to Thornvale..."
    ├── Brief travel (consumes return rations)
    └── Arrival home

12. EXPEDITION COMPLETE
   ┌─────────────────────────────────────────────┐
   │  🏠 WELCOME HOME                            │
   │                                             │
   │  EXPEDITION SUMMARY: Copper Hollow          │
   │                                             │
   │  YOU BROUGHT BACK:                          │
   │  • 17 Copper Ore                           │
   │  • 8 Common Herbs                          │
   │  • 3 Rat Hides (from combat)               │
   │                                             │
   │  XP EARNED:                                 │
   │  • Mining: +85                             │
   │  • Herbalism: +40                          │
   │  • Melee: +30                              │
   │                                             │
   │  Carry used: 28/50                         │
   │                                             │
   │  [UNLOAD & CONTINUE]                        │
   └─────────────────────────────────────────────┘

13. INTRODUCE TOWN WORK
   ┌─────────────────────────────────────────────┐
   │  Now you have raw materials.                │
   │                                             │
   │  In town, you can process them:            │
   │  • Smelt ore → ingots                      │
   │  • Craft ingots → gear                     │
   │  • Cook food → rations                     │
   │                                             │
   │  Better gear = better expeditions!         │
   │                                             │
   │  [GO TO SMITHING]                          │
   └─────────────────────────────────────────────┘

14. FIRST CRAFTING
    ├── Smelt copper ore → copper ingots
    ├── Craft: Bronze Pickaxe (copper + wood)
    └── Equip upgrade

15. TUTORIAL COMPLETE
   ┌─────────────────────────────────────────────┐
   │  You've learned the basics!                 │
   │                                             │
   │  THE LOOP:                                  │
   │  1. Get/make maps (Cartography)            │
   │  2. Prepare expedition (pack rations, gear)│
   │  3. Explore the grid, gather, fight        │
   │  4. Return home with loot                  │
   │  5. Process and craft in town              │
   │  6. Go again, better prepared              │
   │                                             │
   │  Explore at your own pace.                 │
   │                                             │
   │  [BEGIN YOUR ADVENTURE]                     │
   └─────────────────────────────────────────────┘
```

### What Player Should Feel
- "I understand the loop"
- "I made real decisions (where to go, manual vs auto)"
- "I want to go on another expedition"
- "The crafting makes expeditions better"

### Key Metrics
- Time to first expedition start: < 2 minutes
- Time to complete first expedition: 5-8 minutes
- Tutorial completion: > 85%

---

## Flow 2: Planning an Expedition

### Context
Player has played a few expeditions. They're planning a bigger one.

### Goal
Show the depth of planning, the trade-offs, the role of Cartography.

### Flow

```
1. ACQUIRING A MAP

   Option A: Buy from Store
   ┌─────────────────────────────────────────────┐
   │  🏪 CARTOGRAPHER'S SHOP                     │
   │                                             │
   │  MAPS FOR SALE:                             │
   │                                             │
   │  📜 Whisperwood Forest         150 gold    │
   │     Near | Forest | Tier 2                 │
   │     "Oak trees and common herbs"           │
   │                                             │
   │  📜 Iron Ridge                 300 gold    │
   │     Moderate | Mountain | Tier 3           │
   │     "Rich iron deposits, some danger"      │
   │                                             │
   │  📜 Darkwater Swamp            500 gold    │
   │     Far | Swamp | Tier 3                   │
   │     "Rare herbs, dangerous creatures"      │
   │     ⚠️ Requires: Cartography 20 to read    │
   │                                             │
   └─────────────────────────────────────────────┘

   Option B: Research at Library
   ┌─────────────────────────────────────────────┐
   │  📚 THORNVALE LIBRARY                       │
   │                                             │
   │  RESEARCH A NEW MAP                         │
   │                                             │
   │  Your Cartography: 28                       │
   │                                             │
   │  Available Research:                        │
   │  ┌─────────────────────────────────────┐   │
   │  │ Whisperwood Forest                  │   │
   │  │ Materials: Paper, Ink               │   │
   │  │ Time: 1 hour                        │   │
   │  │ Sources to consult:                 │   │
   │  │ ☐ Traveler's Journal (layout)      │   │
   │  │ ☐ Herbalist Notes (herb locations) │   │
   │  │ ☐ Woodcutter's Log (tree types)    │   │
   │  │ More sources = more detail          │   │
   │  │ [RESEARCH - 1 hr]                   │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

2. MAP INSPECTION (Before expedition)

   Low Cartography player sees:
   ┌─────────────────────────────────────────────┐
   │  📜 IRON RIDGE                              │
   │                                             │
   │  Distance: Moderate (2 days travel)         │
   │  Terrain: Mountain                          │
   │  Danger: Medium                             │
   │                                             │
   │  KNOWN CONTENTS:                            │
   │  • Mining opportunities                     │
   │  • Some creatures                           │
   │  • Unknown herbs                            │
   │                                             │
   │  "Your Cartography is too low to read      │
   │   more detail from this map."              │
   │                                             │
   └─────────────────────────────────────────────┘

   High Cartography player sees:
   ┌─────────────────────────────────────────────┐
   │  📜 IRON RIDGE                              │
   │                                             │
   │  Distance: Moderate (2 days travel)         │
   │  Terrain: Mountain (+2 movement cost)       │
   │  Danger: Medium                             │
   │                                             │
   │  DETAILED CONTENTS:                         │
   │  ⛏ Iron Ore Deposits (x4)                  │
   │    - Estimated: 60-80 iron ore total       │
   │    - Tier 2 quality                        │
   │    - Clearing time: ~4 hours each          │
   │                                             │
   │  ⛏ Gem Pocket (x1)                         │
   │    - Rare gems possible                    │
   │    - Requires Mining 25+                   │
   │                                             │
   │  👹 Mountain Wolves (x2)                   │
   │    - Combat difficulty: Medium             │
   │    - Drops: Pelts, Fangs                   │
   │                                             │
   │  🌿 Alpine Herbs (x2)                       │
   │    - Rare medicinal herbs                  │
   │                                             │
   │  RECOMMENDED:                               │
   │  - Rations: 6+ days                        │
   │  - Mining: 20+ for full value              │
   │  - Combat gear for wolves                  │
   │                                             │
   └─────────────────────────────────────────────┘

3. EXPEDITION PREP (Full)
   ┌─────────────────────────────────────────────┐
   │  PREPARE EXPEDITION: Iron Ridge             │
   │                                             │
   │  TRAVEL                                     │
   │  Distance: 2 days each way                  │
   │  Rations for travel: 4 days minimum        │
   │                                             │
   │  ─────────────────────────────────────────  │
   │  RATIONS                                    │
   │  Pack: [ 8 days ]  (4 travel + 4 on site) │
   │  Your supply: 12 days available            │
   │                                             │
   │  ─────────────────────────────────────────  │
   │  MOUNT                                      │
   │  [ None - Walking ]                 [CHANGE]│
   │  Speed: Slow | Carry: +0                   │
   │                                             │
   │  Available:                                │
   │  🐴 Horse - Fast travel, +20 carry         │
   │  🫏 Mule - Slow, +50 carry                 │
   │                                             │
   │  ─────────────────────────────────────────  │
   │  BAGS                                       │
   │  [ Leather Backpack ] Carry: 75     [CHANGE]│
   │  [ Saddlebags ] +25 (requires mount)       │
   │                                             │
   │  ─────────────────────────────────────────  │
   │  GEAR                                       │
   │  ⛏ Iron Pickaxe                            │
   │  ⚔️ Bronze Sword                           │
   │  🛡️ Leather Armor                          │
   │                                             │
   │  ─────────────────────────────────────────  │
   │  PROVISIONS (Food for combat/emergencies)  │
   │  [ Healing Bread x5 ]               [CHANGE]│
   │                                             │
   │  ─────────────────────────────────────────  │
   │  SUMMARY                                    │
   │  Travel: 4 days (2 each way)               │
   │  Time on site: 4 days                      │
   │  Carry capacity: 75 weight                 │
   │  Expected yield: ~70 ore, 15 herbs, pelts  │
   │                                             │
   │  [CANCEL]              [BEGIN EXPEDITION]   │
   └─────────────────────────────────────────────┘

4. DECISION POINTS

   Player realizes trade-offs:
   - Take Horse: Faster, some extra carry, but costs gold to stable
   - Take Mule: Slow travel (more rations used) but huge carry
   - More rations: Stay longer, gather more
   - Less rations: Lighter, more carry space for loot
```

### What Player Should Feel
- "Preparation matters"
- "Cartography gives me an advantage"
- "There are real trade-offs in what I bring"
- "I'm planning for success"

---

## Flow 3: Active Expedition (Core Gameplay)

### Context
Player has arrived at a location. This is THE gameplay loop.

### Goal
Constant micro-decisions. Trade-offs between time, efficiency, risk.

### Flow

```
1. ARRIVAL & GRID REVEAL
   ┌─────────────────────────────────────────────────────────────┐
   │  IRON RIDGE                                                  │
   │  Days: 4 | Hours today: 12 | Carry: 0/75                    │
   │                                                              │
   │    0   1   2   3   4   5   6   7                            │
   │  ┌───┬───┬───┬───┬───┬───┬───┬───┐                         │
   │ 0│🚩│   │   │ ▲ │ ▲ │   │   │   │  🚩 Entry (you)          │
   │  ├───┼───┼───┼───┼───┼───┼───┼───┤  ⛏ Mining node          │
   │ 1│   │ ⛏ │   │ ▲ │   │ ⛏ │   │ 🌿│  🌿 Herbs               │
   │  ├───┼───┼───┼───┼───┼───┼───┼───┤  👹 Wolf den            │
   │ 2│   │   │   │   │ 💎│   │ 👹│   │  💎 Gem pocket          │
   │  ├───┼───┼───┼───┼───┼───┼───┼───┤  ▲ Mountain (slow)      │
   │ 3│ ⛏ │   │ ▲ │ ▲ │   │ 🌿│   │ ⛏ │  · Open ground          │
   │  ├───┼───┼───┼───┼───┼───┼───┼───┤                         │
   │ 4│   │ 👹│   │   │   │   │   │   │                         │
   │  └───┴───┴───┴───┴───┴───┴───┴───┘                         │
   │                                                              │
   │  Movement costs: Open = 1hr, Mountain = 3hr                 │
   │                                                              │
   │  [TAP A NODE TO MOVE]                                       │
   └─────────────────────────────────────────────────────────────┘

2. NAVIGATION DECISIONS

   Player is at [0,0]. Where to go?

   ┌─────────────────────────────────────────────┐
   │  CHOOSE DESTINATION                         │
   │                                             │
   │  ⛏ [1,1] Iron Deposit                      │
   │     Movement: 2 hours (diagonal)            │
   │     Est. gather time: 4 hours              │
   │     Est. yield: 15-20 iron ore             │
   │                                             │
   │  💎 [4,2] Gem Pocket                        │
   │     Movement: 6 hours (through mountains)   │
   │     Est. gather time: 3 hours              │
   │     Est. yield: 3-5 raw gems               │
   │     ⚠️ Requires Mining 25 (You: 28 ✓)      │
   │                                             │
   │  Path shown on grid...                     │
   └─────────────────────────────────────────────┘

   Player thinks: "Gems are valuable but far. Iron is closer.
   I have 4 days... let me hit the close iron first."

3. MOVING
   ├── Player taps ⛏ at [1,1]
   ├── Character moves along path
   ├── Hours tick down: 12 → 10
   └── Arrive at node

4. GATHERING DECISION
   ┌─────────────────────────────────────────────┐
   │  ⛏ IRON ORE DEPOSIT                         │
   │                                             │
   │  Available: ~18 iron ore                    │
   │  Quality: Tier 2                           │
   │  Time to clear: ~4 hours                   │
   │                                             │
   │  YOUR MINING: Level 28                      │
   │  Bonus: +28% yield                         │
   │                                             │
   │  ─────────────────────────────────────────  │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ ⛏ MINE MANUALLY                     │   │
   │  │ Play minigame for each swing        │   │
   │  │ Yield: 85-100% based on performance │   │
   │  │ You stay engaged                    │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🔄 AUTO-MINE                        │   │
   │  │ Gather automatically                │   │
   │  │ Yield: 70% (less ore)              │   │
   │  │ Hands-off, do something else        │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ ⏭️ SKIP THIS NODE                   │   │
   │  │ Save time for other nodes           │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

5. MINING MINIGAME (If manual)

   [Minigame plays - timing/rhythm based]

   Results shown after each swing or at end:
   ┌─────────────────────────────────────────────┐
   │  MINING COMPLETE                            │
   │                                             │
   │  Swings: 12                                │
   │  Perfect: 7 | Good: 4 | Miss: 1            │
   │  Efficiency: 91%                           │
   │                                             │
   │  Yield: 21 Iron Ore (+28% skill bonus)     │
   │  Weight: 21                                │
   │  XP: +168 Mining                           │
   │                                             │
   │  Time spent: 4 hours                       │
   │  Hours remaining today: 6                  │
   │  Carry: 21/75                              │
   │                                             │
   │  [CONTINUE]                                 │
   └─────────────────────────────────────────────┘

6. CONTINUE NAVIGATING

   Player checks map, decides next move:
   - Another iron node? (safe, reliable)
   - The gem pocket? (valuable, far)
   - Wolf den? (combat, but valuable drops)
   - Herbs? (useful for rations later)

7. ENCOUNTER: WOLF DEN
   ┌─────────────────────────────────────────────┐
   │  👹 WOLF DEN                                │
   │                                             │
   │  2 Mountain Wolves guard this area.        │
   │                                             │
   │  Wolf Stats:                               │
   │  HP: ████████ each                         │
   │  Attack: Medium                            │
   │  Weakness: Fire                            │
   │                                             │
   │  Your Combat:                              │
   │  Melee: 22 | HP: Full                      │
   │  Weapon: Bronze Sword                      │
   │  Healing items: 5                          │
   │                                             │
   │  REWARDS IF VICTORIOUS:                     │
   │  • 2 Wolf Pelts (valuable)                 │
   │  • Wolf Fangs                              │
   │  • Access to herb patch behind den         │
   │                                             │
   │  ─────────────────────────────────────────  │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ ⚔️ FIGHT MANUALLY                   │   │
   │  │ Control combat, use tactics          │   │
   │  │ Better outcomes possible             │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🔄 AUTO-FIGHT                       │   │
   │  │ Resolve automatically               │   │
   │  │ Uses more healing items             │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🏃 AVOID (go around)                │   │
   │  │ Skip this node entirely             │   │
   │  │ Costs extra movement time           │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

8. COMBAT (If engaged)

   [Combat minigame - TBD mechanics]
   [Player makes decisions: attack, defend, use items]

   Result:
   ┌─────────────────────────────────────────────┐
   │  VICTORY!                                   │
   │                                             │
   │  Wolves defeated: 2                        │
   │  Healing items used: 1                     │
   │  Time spent: 2 hours                       │
   │                                             │
   │  LOOT:                                      │
   │  • 2 Wolf Pelts (weight: 4)               │
   │  • 4 Wolf Fangs (weight: 1)               │
   │                                             │
   │  XP: +180 Melee                            │
   │                                             │
   │  The path behind the den is now clear.     │
   │  You can see a rare herb patch!            │
   │                                             │
   │  [CONTINUE]                                 │
   └─────────────────────────────────────────────┘

9. END OF DAY
   ┌─────────────────────────────────────────────┐
   │  ☀️ → 🌙 DAY ENDING                         │
   │                                             │
   │  You've used today's hours.                │
   │  Time to rest and eat.                     │
   │                                             │
   │  Rations consumed: 1 day                   │
   │  Remaining rations: 5 days                 │
   │  Days at site remaining: 3                 │
   │                                             │
   │  TOMORROW'S OPTIONS:                        │
   │  • Continue exploring (3 more days)        │
   │  • Head home now (keep what you have)      │
   │                                             │
   │  Current haul: 42/75 weight                │
   │  • 21 Iron Ore                             │
   │  • 12 Iron Ore (from 2nd node)             │
   │  • 2 Wolf Pelts                            │
   │  • 4 Wolf Fangs                            │
   │  • 3 Alpine Herbs                          │
   │                                             │
   │  [REST & CONTINUE]      [HEAD HOME]        │
   └─────────────────────────────────────────────┘

10. INVENTORY MANAGEMENT (If full)
    ┌─────────────────────────────────────────────┐
    │  ⚠️ INVENTORY FULL                          │
    │                                             │
    │  You've gathered 75/75 weight.             │
    │  You found 5 more iron ore but can't carry.│
    │                                             │
    │  OPTIONS:                                   │
    │                                             │
    │  ┌─────────────────────────────────────┐   │
    │  │ 🏠 HEAD HOME                        │   │
    │  │ Keep everything, start return       │   │
    │  │ Days remaining unused: 2            │   │
    │  └─────────────────────────────────────┘   │
    │                                             │
    │  ┌─────────────────────────────────────┐   │
    │  │ 📦 DROP LOWEST VALUE                │   │
    │  │ Auto-drop wolf fangs (lowest gp/wt) │   │
    │  │ Make room for iron ore              │   │
    │  └─────────────────────────────────────┘   │
    │                                             │
    │  ┌─────────────────────────────────────┐   │
    │  │ 🎒 MANAGE MANUALLY                  │   │
    │  │ Choose what to drop                 │   │
    │  └─────────────────────────────────────┘   │
    │                                             │
    │  ┌─────────────────────────────────────┐   │
    │  │ ⏹️ STOP GATHERING                   │   │
    │  │ Keep moving, don't pick up more     │   │
    │  │ Can still fight/explore             │   │
    │  └─────────────────────────────────────┘   │
    │                                             │
    └─────────────────────────────────────────────┘

11. RETURN JOURNEY
    ├── Player chooses to head home (full bags or out of time)
    ├── "Traveling back to Thornvale... (2 days)"
    ├── Rations consumed for return
    └── Arrival home

12. EXPEDITION COMPLETE
    ┌─────────────────────────────────────────────┐
    │  🏠 EXPEDITION COMPLETE                     │
    │                                             │
    │  Iron Ridge - 4 day trip                   │
    │                                             │
    │  YOUR HAUL:                                │
    │  • 45 Iron Ore          (value: ~450g)    │
    │  • 8 Alpine Herbs       (value: ~120g)    │
    │  • 4 Raw Gems           (value: ~400g)    │
    │  • 2 Wolf Pelts         (value: ~100g)    │
    │  • 4 Wolf Fangs         (value: ~20g)     │
    │                                             │
    │  Total weight: 73/75                       │
    │  Estimated value: ~1,090 gold             │
    │                                             │
    │  XP EARNED:                                │
    │  • Mining: +523 (Level up! 28→29)         │
    │  • Herbalism: +96                         │
    │  • Melee: +180                            │
    │                                             │
    │  RATIONS USED: 6/8 days                   │
    │  (2 days saved for future)                │
    │                                             │
    │  [UNLOAD TO STORAGE]                       │
    └─────────────────────────────────────────────┘
```

### What Player Should Feel
- "Every move is a decision"
- "I'm optimizing my route and time"
- "Manual play gives better results"
- "Full bags feel satisfying"

---

## Flow 4: Town Work (Processing & Crafting)

### Context
Player returned from expedition with raw materials. Time to process.

### Goal
Transform raw materials into useful items. Plan next expedition.

### Flow

```
1. STORAGE VIEW
   ┌─────────────────────────────────────────────┐
   │  📦 STORAGE                                  │
   │                                             │
   │  RAW MATERIALS                              │
   │  • 45 Iron Ore                             │
   │  • 8 Alpine Herbs                          │
   │  • 4 Raw Gems                              │
   │  • 2 Wolf Pelts                            │
   │  • 4 Wolf Fangs                            │
   │  • 23 Copper Ore (previous trips)          │
   │                                             │
   │  PROCESSED                                  │
   │  • 15 Copper Ingots                        │
   │  • 8 Leather                               │
   │                                             │
   │  WHAT TO DO:                                │
   │  [SMITHING] [COOKING] [TAILORING] [SELL]   │
   └─────────────────────────────────────────────┘

2. SMELTING (Processing)
   ┌─────────────────────────────────────────────┐
   │  🔥 SMELTING                                │
   │                                             │
   │  Your Smithing: 18                          │
   │  Furnace: Basic (Tier 1)                   │
   │                                             │
   │  AVAILABLE TO SMELT:                        │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ Iron Ore → Iron Ingots              │   │
   │  │ You have: 45 ore                    │   │
   │  │ Produces: 22 ingots (50% ratio)     │   │
   │  │ Time: 45 minutes                    │   │
   │  │                                     │   │
   │  │ Smelt how many? [ 45 ]  [SMELT ALL] │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ Copper Ore → Copper Ingots          │   │
   │  │ You have: 23 ore                    │   │
   │  │ Produces: 11 ingots                 │   │
   │  │ Time: 23 minutes                    │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  💡 Better furnace = better ratio          │
   │     (Engineering can build upgrades)       │
   │                                             │
   └─────────────────────────────────────────────┘

3. SMELTING MINIGAME (Optional)
   ┌─────────────────────────────────────────────┐
   │  SMELTING: Iron Ore                         │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🔥 SMELT MANUALLY                   │   │
   │  │ Control the heat for better yield   │   │
   │  │ Ratio: 55-65% (skill matters)       │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🔄 AUTO-SMELT                       │   │
   │  │ Standard processing                 │   │
   │  │ Ratio: 50%                          │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

4. CRAFTING
   ┌─────────────────────────────────────────────┐
   │  ⚒️ SMITHING - CRAFTING                     │
   │                                             │
   │  Your Smithing: 18                          │
   │  Anvil: Basic                              │
   │                                             │
   │  AVAILABLE RECIPES:                         │
   │                                             │
   │  ⚔️ Iron Sword                              │
   │     Requires: 5 Iron Ingots, 2 Leather     │
   │     You have: 22 ingots ✓, 8 leather ✓    │
   │     Stats: Better than Bronze Sword        │
   │     [CRAFT]                                │
   │                                             │
   │  ⛏ Iron Pickaxe                            │
   │     Requires: 4 Iron Ingots, 2 Wood        │
   │     You have: 22 ingots ✓, 5 wood ✓       │
   │     Stats: +15% mining speed               │
   │     [CRAFT]                                │
   │                                             │
   │  🛡️ Iron Chainmail                         │
   │     Requires: 12 Iron Ingots               │
   │     🔒 Requires Smithing 25                │
   │                                             │
   └─────────────────────────────────────────────┘

5. COOKING RATIONS
   ┌─────────────────────────────────────────────┐
   │  🍳 COOKING                                 │
   │                                             │
   │  Your Cooking: 15                           │
   │  Kitchen: Basic                            │
   │                                             │
   │  RATION CRAFTING:                           │
   │                                             │
   │  🍞 Travel Rations                          │
   │     Ingredients: 3 Wheat, 1 Salt           │
   │     Produces: 2 days of rations            │
   │     [COOK]                                 │
   │                                             │
   │  🥘 Hearty Stew                             │
   │     Ingredients: 2 Meat, 2 Vegetables      │
   │     Produces: 3 days of rations            │
   │     Bonus: +1 hour/day energy              │
   │     [COOK]                                 │
   │                                             │
   │  Current ration supply: 2 days             │
   │  ⚠️ Low! Cook more before next expedition. │
   │                                             │
   └─────────────────────────────────────────────┘

6. PLANNING NEXT EXPEDITION
   ┌─────────────────────────────────────────────┐
   │  READY FOR NEXT TRIP?                       │
   │                                             │
   │  UPGRADES FROM THIS TRIP:                   │
   │  ✓ Iron Pickaxe equipped (+15% mining)     │
   │  ✓ Iron Sword equipped (+20% damage)       │
   │  ✓ 8 days of rations prepared              │
   │                                             │
   │  STILL NEEDED:                              │
   │  • Bigger backpack (Tailoring)             │
   │  • Mount for longer trips (Beastcraft)     │
   │                                             │
   │  AVAILABLE MAPS:                            │
   │  📜 Iron Ridge (been there)                │
   │  📜 Whisperwood (unexplored)               │
   │                                             │
   │  Or research new maps at the Library...    │
   │                                             │
   └─────────────────────────────────────────────┘
```

### What Player Should Feel
- "Processing turns raw stuff into power"
- "Better equipment = better expeditions"
- "I'm building toward something"
- "Ready to go again"

---

## Flow 5: Cartography & Map Research

### Context
Player wants to explore new areas. They need maps.

### Goal
Show how Cartography creates value through information and access.

### Flow

```
1. VISIT LIBRARY
   ┌─────────────────────────────────────────────┐
   │  📚 THORNVALE LIBRARY                       │
   │                                             │
   │  Your Cartography: 28                       │
   │                                             │
   │  "Welcome, explorer. What knowledge do     │
   │   you seek today?"                         │
   │                                             │
   │  [RESEARCH NEW MAP]                         │
   │  [STUDY EXISTING MAP] (reveal more detail) │
   │  [BROWSE RECORDS] (hints about locations)  │
   │                                             │
   └─────────────────────────────────────────────┘

2. RESEARCH NEW MAP
   ┌─────────────────────────────────────────────┐
   │  RESEARCH NEW MAP                           │
   │                                             │
   │  Choose a region to research:              │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🌲 Whisperwood Forest               │   │
   │  │ Distance: Near | Tier 2             │   │
   │  │ Research time: 2 hours              │   │
   │  │ Materials: Paper (1), Ink (1)       │   │
   │  │ [RESEARCH]                          │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🏔️ Frostpeak Mountains              │   │
   │  │ Distance: Far | Tier 4              │   │
   │  │ Research time: 6 hours              │   │
   │  │ Materials: Paper (3), Ink (2)       │   │
   │  │ 🔒 Requires Cartography 35          │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🌋 Ashlands                         │   │
   │  │ Distance: Far | Tier 5              │   │
   │  │ Research time: 10 hours             │   │
   │  │ 🔒 Requires Cartography 50          │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

3. RESEARCH PROCESS
   ┌─────────────────────────────────────────────┐
   │  RESEARCHING: Whisperwood Forest            │
   │                                             │
   │  Consulting available sources...            │
   │                                             │
   │  SOURCES FOUND:                             │
   │  ☐ Old Hunter's Journal                    │
   │    → Reveals: creature locations           │
   │    → Time: +30 min                         │
   │                                             │
   │  ☐ Herbalist Guild Records                 │
   │    → Reveals: herb locations & types       │
   │    → Time: +30 min                         │
   │                                             │
   │  ☐ Woodcutter's Survey                     │
   │    → Reveals: tree types & density         │
   │    → Time: +30 min                         │
   │                                             │
   │  ☐ Adventurer's Notes                      │
   │    → Reveals: hidden areas, shortcuts      │
   │    → Time: +45 min                         │
   │    → 🔒 Requires Cartography 30            │
   │                                             │
   │  Base research: 2 hours                    │
   │  With selected sources: 3 hours            │
   │                                             │
   │  More sources = more detail on final map   │
   │                                             │
   │  [BEGIN RESEARCH]                           │
   └─────────────────────────────────────────────┘

4. RESEARCH MINIGAME (Optional)
   ┌─────────────────────────────────────────────┐
   │  📖 RESEARCHING...                          │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 📝 RESEARCH MANUALLY                │   │
   │  │ Find connections, earn bonus detail │   │
   │  │ More engaged = better map           │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🔄 AUTO-RESEARCH                    │   │
   │  │ Standard map quality                │   │
   │  │ Come back when done                 │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

5. MAP COMPLETE
   ┌─────────────────────────────────────────────┐
   │  📜 MAP CREATED!                            │
   │                                             │
   │  Whisperwood Forest                         │
   │                                             │
   │  Quality: Detailed (3 sources consulted)   │
   │                                             │
   │  Your map shows:                           │
   │  • General layout & terrain                │
   │  • Oak groves (x4) with density estimates  │
   │  • Herb patches (x3) with types           │
   │  • Wolf territory (danger zone marked)     │
   │  • Hidden grove (bonus from research!)    │
   │                                             │
   │  This map can be used for expeditions.    │
   │                                             │
   │  [ADD TO MAP COLLECTION]                    │
   └─────────────────────────────────────────────┘
```

### What Player Should Feel
- "Cartography gives me real advantages"
- "Research is worth the time investment"
- "Better maps = better expeditions"
- "I'm uncovering the world"

---

## Flow 6: Skill Interconnection Discovery

### Context
Player has been playing for a while. They realize skills connect.

### Goal
The "aha" moment of horizontal progression.

### Flow

```
1. TRIGGER: PROBLEM ENCOUNTERED

   Player prepares for a long expedition but realizes:
   "I can only carry 75 weight. I need more capacity."

2. INVESTIGATING SOLUTIONS
   ┌─────────────────────────────────────────────┐
   │  HOW TO CARRY MORE?                         │
   │                                             │
   │  CURRENT: 75 weight capacity               │
   │  ├── Base: 25                              │
   │  └── Leather Backpack: +50                 │
   │                                             │
   │  UPGRADES AVAILABLE:                        │
   │                                             │
   │  🎒 Large Backpack (+75)                   │
   │     Craft with: Tailoring 25               │
   │     Materials: 10 Leather, 5 Iron Rings    │
   │     Your Tailoring: 12 ❌                  │
   │                                             │
   │  🫏 Pack Mule (+50, plus saddlebags)       │
   │     Requires: Beastcraft 15                │
   │     Your Beastcraft: 8 ❌                  │
   │                                             │
   │  🎒 Saddlebags (+30)                       │
   │     Craft with: Tailoring 20               │
   │     Requires: A mount                      │
   │                                             │
   └─────────────────────────────────────────────┘

3. THE REALIZATION

   Player thinks:
   "So to carry more, I need EITHER:
    - Level Tailoring to make bigger backpack
    - Level Beastcraft to get a mule
    - Level BOTH to get mount + saddlebags

   And Tailoring needs leather...
   Which comes from Hunting...
   Which is better with a combat companion...
   Which is Beastcraft!

   Everything connects!"

4. SKILL DETAIL SHOWS CONNECTIONS
   ┌─────────────────────────────────────────────┐
   │  🧵 TAILORING - Level 12                    │
   │                                             │
   │  UNLOCKS:                                   │
   │  Lv 15: Reinforced Backpack (+60)          │
   │  Lv 20: Saddlebags (+30 on mount)          │
   │  Lv 25: Large Backpack (+75)               │
   │  Lv 30: Explorer's Pack (+100)             │
   │                                             │
   │  SKILL SYNERGIES:                           │
   │                                             │
   │  📥 INPUTS (you need these):               │
   │  • Hunting → Leather (primary material)    │
   │  • Farming → Cloth fiber                   │
   │  • Beastcraft → Wool from sheep            │
   │                                             │
   │  📤 OUTPUTS (these benefit):               │
   │  • Expeditions → Better carry capacity     │
   │  • Sailing → Sails for ships              │
   │  • Beastcraft → Saddles and bags          │
   │                                             │
   │  Your Hunting: 22 ✓ (good leather supply) │
   │  Your Farming: 5 ❌ (need cloth)           │
   │                                             │
   └─────────────────────────────────────────────┘

5. NEW GOAL FORMS

   Player sets goal:
   "I'm going to:
   1. Do hunting expeditions for leather
   2. Level Beastcraft to get a mule
   3. Level Tailoring to make saddlebags
   4. Then I can carry WAY more loot"
```

### What Player Should Feel
- "OH! That's why the skills matter"
- "I have a plan now"
- "Everything is connected"
- "This is deeper than I thought"

---

## Flow 7: Beast & Mount System

### Context
Player wants a mount for faster travel and more carry capacity.

### Flow

```
1. FIRST ENCOUNTER

   During an expedition, player finds:
   ┌─────────────────────────────────────────────┐
   │  🐴 WILD HORSE SPOTTED                      │
   │                                             │
   │  A wild horse grazes nearby. It looks      │
   │  strong enough to serve as a mount.        │
   │                                             │
   │  Species: Plains Horse                      │
   │  Type: Mount (Travel)                      │
   │  Benefits: Fast travel, +20 carry          │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🥕 ATTEMPT TO TAME                  │   │
   │  │ Requires: Beastcraft 15 (You: 18) ✓│   │
   │  │ Uses: 3 Apples or Carrots           │   │
   │  │ Success: ~70%                       │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  ┌─────────────────────────────────────┐   │
   │  │ 👋 LEAVE IT                         │   │
   │  │ Continue your expedition            │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

2. TAMING MINIGAME

   [Some kind of patience/timing minigame]
   [Building trust with the animal]

   Success:
   ┌─────────────────────────────────────────────┐
   │  🎉 TAMING SUCCESSFUL!                      │
   │                                             │
   │  The horse accepts you as its rider.       │
   │                                             │
   │  🐴 Plains Horse                           │
   │  Type: Mount                               │
   │  Travel speed: Fast (-30% travel time)     │
   │  Carry bonus: +20                          │
   │                                             │
   │  Name your mount:                          │
   │  [ Storm_____________ ]                    │
   │                                             │
   │  [CONFIRM]                                  │
   └─────────────────────────────────────────────┘

3. MOUNT MANAGEMENT
   ┌─────────────────────────────────────────────┐
   │  🐾 BEASTCRAFT - YOUR ANIMALS               │
   │                                             │
   │  MOUNTS:                                    │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🐴 Storm (Plains Horse)             │   │
   │  │ Level: 1                            │   │
   │  │ Speed: Fast | Carry: +20            │   │
   │  │ Status: Stabled ✓                   │   │
   │  │ [EQUIP FOR EXPEDITION]              │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  COMPANIONS (Combat):                       │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🐺 Shadow (Forest Wolf)             │   │
   │  │ Type: Melee | Bonus: +15% damage    │   │
   │  │ [SET AS ACTIVE]                     │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   │  LIVESTOCK (Products):                      │
   │  ┌─────────────────────────────────────┐   │
   │  │ 🐄 2 Cows                           │   │
   │  │ Produces: Milk (daily)              │   │
   │  │ 🐑 3 Sheep                          │   │
   │  │ Produces: Wool (weekly)             │   │
   │  └─────────────────────────────────────┘   │
   │                                             │
   └─────────────────────────────────────────────┘

4. MOUNT TYPES & TRADE-OFFS
   ┌─────────────────────────────────────────────┐
   │  MOUNT COMPARISON                           │
   │                                             │
   │  🐴 Horse                                  │
   │  Speed: Fast | Carry: +20 | Feed: Grain   │
   │  Best for: Quick trips, moderate loot     │
   │                                             │
   │  🫏 Mule                                   │
   │  Speed: Slow | Carry: +50 | Feed: Hay     │
   │  Best for: Heavy hauls, mining trips      │
   │                                             │
   │  🐫 Camel                                  │
   │  Speed: Medium | Carry: +30 | Feed: Little│
   │  Best for: Desert, low ration use         │
   │                                             │
   │  🦅 Giant Eagle (Rare!)                    │
   │  Speed: Very Fast | Carry: +10 | Feed: Meat│
   │  Best for: Skip terrain, quick scouting   │
   │  🔒 Requires: Beastcraft 50               │
   │                                             │
   └─────────────────────────────────────────────┘
```

### What Player Should Feel
- "My mount is MINE"
- "Different beasts for different jobs"
- "Beastcraft has real value"
- "I want more/better animals"

---

## Summary: Core UX Principles

| Principle | Implementation |
|-----------|----------------|
| **Active play first** | Meaningful decisions while playing > idle accumulation |
| **Real-world time trade-off** | Manual = better results, Auto = convenience |
| **Micro-decisions matter** | Every movement, every node, every swing |
| **Preparation = success** | Cartography, rations, gear all matter |
| **Skills interconnect** | Every skill feeds into others |
| **Carry capacity creates tension** | Can't take everything, must choose |
| **No punishment, just efficiency** | Bad prep = less loot, not death |

---

## The Manual vs Auto Trade-off

| Activity | Manual | Auto | Difference |
|----------|--------|------|------------|
| Mining | 85-100% yield | 70% yield | ~20-30% more ore |
| Combat | Tactical choices | Basic attacks | Less damage taken, more drops |
| Woodcutting | Combo bonuses | Flat rate | ~25% more wood |
| Herbalism | Rare finds possible | Common only | Miss rare herbs |
| Research | Bonus discoveries | Standard detail | Hidden locations |

**The philosophy**: Your real-world attention is valuable. The game rewards it but doesn't demand it.

---

## Anti-Patterns to Avoid

| Don't | Why |
|-------|-----|
| Punish failure harshly | Players quit, not learn |
| Make auto-play useless | Some sessions are for convenience |
| Hide information | Players should understand trade-offs |
| Require constant attention | It's still a mobile game |
| Make travel boring | Events and decisions, not loading bars |
| Ignore horizontal progress | Depth comes from skill connections |
