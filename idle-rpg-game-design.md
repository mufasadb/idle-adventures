# Idle RPG - Game Design Document

## The Elevator Pitch

An **active exploration RPG** where you venture into procedurally-generated grid maps, make constant micro-decisions about what to gather and where to go, then return home to process materials and craft better gear.

**The hook**: Decisions Matter, Play minigames for 85-100% efficiency, or tap "Auto" for 70% and go hands-off. Your real-world time is valuable - the game rewards attention but doesn't demand it.

---

## Core Philosophy

### 1. Active Play First, Idle Second

Unlike typical idle games where you wait for numbers to go up, this game is designed to be **engaging when you're holding your phone**. The idle/auto mode is a convenience feature, not the core experience.

```
Priority 1: Fun moment-to-moment decisions while playing
Priority 2: Convenient auto-mode when you can't engage
```

### 2. Adders & Subtractors

The game runs on a simple economy of resources that **add** or **subtract** from your expedition potential.

**Adders** (things that give you more capacity):
| Resource | What It Adds |
|----------|--------------|
| Rations | Time at destination (more days = more actions) |
| Backpack | Carry capacity for loot |
| Mount | Speed (less travel time) + carry capacity |
| Saddlebags | Even more carry capacity |
| Potions | Combat sustain, letting you fight more |

**Subtractors** (things that consume your capacity):
| Action | What It Costs |
|--------|---------------|
| Travel distance | Rations consumed |
| Moving on grid | Hours/actions |
| Gathering | Time + fills carry space |
| Combat | Consumes healing items/potions |
| Magic | Consumes runes |

**The Tension**: Everything competes for bag space.

```
Your Bag
├── Rations (lets you stay longer)
├── Healing food (lets you fight more)
├── Potions (combat buffs)
├── Runes (magic ammo)
├── Arrows (ranged ammo)
└── Empty space (for loot!)

More supplies = stay longer, fight more
More empty space = bring more loot home
```

You can't max both. Every expedition is a trade-off.

*Future consideration: Multipliers (skill bonuses, equipment, etc.)*

### 3. Horizontal Progression > Vertical Power

There's no single "best" path. A player focused on:
- **Gathering** supplies crafters with materials
- **Crafting** makes gear for gatherers
- **Exploration** (Cartography) unlocks better locations for everyone
- **Combat** clears dangerous nodes for valuable loot

The interesting part is where skills **overlap and multiply each other**.

### 4. Trade-off: Your Time vs Efficiency

| Approach | Yield | Your Effort |
|----------|-------|-------------|
| **Manual (Minigame)** | 85-100% | Active play |
| **Auto** | 70% | Hands-off |

You choose based on:
- How valuable is this resource?
- How much time do I have?
- Am I in a "play" mood or "chill" mood?

---

## The Core Loop

```
┌─────────────────────────────────────────────────────────────────┐
│                         THE GAME LOOP                            │
│                                                                  │
│   ┌──────────────┐                                              │
│   │   IN TOWN    │ ◄────────────────────────────────────┐       │
│   │              │                                       │       │
│   │  • Process   │                                       │       │
│   │  • Craft     │                                       │       │
│   │  • Cook      │                                       │       │
│   │  • Plan      │                                       │       │
│   └──────┬───────┘                                       │       │
│          │                                               │       │
│          ▼                                               │       │
│   ┌──────────────┐                                       │       │
│   │   PREPARE    │                                       │       │
│   │              │                                       │       │
│   │  • Get map   │                                       │       │
│   │  • Pack gear │                                       │       │
│   │  • Rations   │                                       │       │
│   │  • Mount     │                                       │       │
│   └──────┬───────┘                                       │       │
│          │                                               │       │
│          ▼                                               │       │
│   ┌──────────────┐                                       │       │
│   │   TRAVEL     │                                       │       │
│   │              │                                       │       │
│   │  Consumes    │                                       │       │
│   │  rations     │                                       │       │
│   └──────┬───────┘                                       │       │
│          │                                               │       │
│          ▼                                               │       │
│   ┌──────────────┐                                       │       │
│   │   EXPLORE    │ ◄─── THE CORE GAMEPLAY               │       │
│   │   THE GRID   │                                       │       │
│   │              │                                       │       │
│   │  • Navigate  │                                       │       │
│   │  • Gather    │                                       │       │
│   │  • Fight     │                                       │       │
│   │  • Fill bags │                                       │       │
│   └──────┬───────┘                                       │       │
│          │                                               │       │
│          ▼                                               │       │
│   ┌──────────────┐                                       │       │
│   │   RETURN     │                                       │       │
│   │              │                                       │       │
│   │  Bring loot  ├───────────────────────────────────────┘       │
│   │  back home   │                                               │
│   └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Expedition: The Core Gameplay

### What Is An Expedition?

An expedition is a trip to a **grid-based location** to gather resources, fight monsters, and bring loot home.

### The Grid

When you arrive at a location, you see a grid (e.g., 8x8) with various **nodes**:

```
    0   1   2   3   4   5   6   7
  ┌───┬───┬───┬───┬───┬───┬───┬───┐
0 │🚩│   │ ⛏ │   │   │ 🌲│   │   │
  ├───┼───┼───┼───┼───┼───┼───┼───┤
1 │   │ 🌿│   │ ▲ │ ▲ │   │ ⛏ │   │
  ├───┼───┼───┼───┼───┼───┼───┼───┤
2 │   │   │   │ ▲ │   │ 🌿│   │   │
  ├───┼───┼───┼───┼───┼───┼───┼───┤
3 │ 🌲│   │   │   │ 👹│   │   │ ⛏ │
  ├───┼───┼───┼───┼───┼───┼───┼───┤
4 │   │   │ 👹│   │   │   │ 🌲│   │
  └───┴───┴───┴───┴───┴───┴───┴───┘

🚩 = Entry point (you start here)
⛏ = Mining node
🌲 = Trees (woodcutting)
🌿 = Herbs
👹 = Monster
▲ = Mountain (slow terrain)
```

### Grid Mechanics

| Mechanic | How It Works |
|----------|--------------|
| **Movement** | Move to adjacent tiles, costs hours based on terrain |
| **Fog of War** | Only nearby nodes visible, more revealed as you explore |
| **Node Interaction** | At a node, choose: Gather/Fight, Manual or Auto, or Skip |
| **Time Limit** | You have X hours per day, Y days based on rations |
| **Carry Limit** | You can only bring back what you can carry |

### At Each Node: The Decision

When you reach a resource node:

```
┌─────────────────────────────────────┐
│ ⛏ IRON ORE DEPOSIT                 │
│                                     │
│ Available: ~18 ore                  │
│ Time to clear: 4 hours              │
│ Your Mining: Level 28 (+28% yield)  │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⛏ MINE MANUALLY                │ │
│ │ Play minigame                  │ │
│ │ Yield: 85-100%                 │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ 🔄 AUTO-MINE                   │ │
│ │ Hands-off                      │ │
│ │ Yield: 70%                     │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ ⏭️ SKIP                        │ │
│ │ Save time for other nodes      │ │
│ └─────────────────────────────────┘ │
│                                     │
└─────────────────────────────────────┘
```

### The Decisions That Matter

1. **Where to go first?** - Closest nodes vs most valuable?
2. **Manual or Auto?** - Worth the effort for this resource?
3. **When to head back?** - Full bags vs more time?
4. **What to drop?** - If you find something better, what gets left behind?

---

## Carry Capacity System

You can only bring back what you can carry.

### Capacity Sources

| Source | Carry Bonus | How to Get |
|--------|-------------|------------|
| Base (on foot) | 25 | Default |
| Backpack | +50 to +100 | Tailoring |
| Mount | +20 to +50 | Beastcraft |
| Saddlebags | +25 to +40 | Tailoring (requires mount) |

### Items Have Weight

| Item | Weight | Notes |
|------|--------|-------|
| Iron Ore | 1 | Heavy but stackable |
| Oak Logs | 3 | Bulky |
| Herbs | 0.5 | Light |
| Wolf Pelt | 4 | Medium |

### When Full

When your inventory hits capacity:

1. **Head home** - Keep everything, leave now
2. **Drop lowest value** - Auto-drop cheapest items to make room
3. **Manual manage** - Choose what to drop
4. **Stop gathering** - Explore but don't pick up more

---

## Maps & Cartography

### Getting Maps

**Option A: Buy from shop**
- Costs gold
- Basic info only

**Option B: Research at library**
- Uses Cartography skill
- Consult sources for more detail
- Takes time and materials (paper, ink)

### Cartography Affects Information

| Cartography Level | What You See Before Going | What You See On Grid |
|-------------------|---------------------------|----------------------|
| 1-20 | "Forest with resources" | Icons only |
| 21-40 | Resource types listed | Icons + names |
| 41-60 | Types + rough quantities | Names + quantity ranges |
| 61-80 | Full detail + recommendations | All info + move costs |
| 81-99 | Optimal routes suggested | Hidden nodes revealed |

Higher Cartography = better planning = more efficient expeditions.

---

## Town: The Safe Zone

### What You Do In Town

| Activity | Skill | What Happens |
|----------|-------|--------------|
| **Smelting** | Smithing | Ore → Ingots |
| **Milling** | Carpentry | Logs → Planks |
| **Preparing** | Herbalism | Raw herbs → Prepared herbs |
| **Cleaning** | Beastcraft | Raw fish → Cleaned fish |
| **Cooking** | Cooking | Ingredients → Rations/Meals |
| **Crafting** | Various | Materials → Gear |

### Town Has No Limits

- No time pressure
- No carry limits
- No risk
- Work through your backlog at your own pace

### The Town/Expedition Rhythm

```
Expedition: Intense, limited, risky
     ↓
Town: Calm, unlimited, safe
     ↓
Expedition: Better prepared
```

---

## Skills (23 Total)

### Gathering (6)
Used during expeditions to extract resources.

| Skill | What You Gather | Where |
|-------|-----------------|-------|
| **Mining** | Ore, gems, stone | Mining nodes |
| **Woodcutting** | Logs, sap, bark | Tree nodes |
| **Herbalism** | Herbs, mushrooms | Herb nodes |
| **Fishing** | Fish | Water nodes |
| **Hunting** | Meat, hides, bones | Animal nodes |
| **Bug Catching** | Insects, reagents | Various |

### Crafting (9)
Used in town to transform materials.

| Skill | What You Make |
|-------|---------------|
| **Smithing** | Weapons, armor, tools |
| **Alchemy** | Coatings, oils, transmutation |
| **Cooking** | Rations, healing food, buffs |
| **Tailoring** | Cloth/leather gear, backpacks, sails |
| **Jewelcrafting** | Rings, amulets, gem cutting |
| **Carpentry** | Bows, furniture, ship parts, arrows |
| **Engineering** | Gadgets, machines, traps |
| **Arcana** | Enchantments, runes, scrolls |
| **Brewing** | Drinks, stat buffs, healing |

### Production/Exploration (5)

| Skill | Role |
|-------|------|
| **Farming** | Grow crops and fiber plants |
| **Beastcraft** | Tame mounts, raise animals, process hides |
| **Cartography** | Research maps, unlock locations |
| **Sailing** | Access water routes and ocean maps |
| **Archaeology** | Find artifacts, unlock special recipes |

### Combat (3)

| Skill | Style | Consumable |
|-------|-------|------------|
| **Melee** | Close combat | Healing food |
| **Magic** | Spells | Runes |
| **Ranged** | Arrows | Ammunition |

---

## Mounts & Companions

### Mounts (Travel & Carry)

Different beasts for different jobs:

| Mount | Speed | Carry | Best For |
|-------|-------|-------|----------|
| **Horse** | Fast (+30%) | +20 | Quick trips |
| **Mule** | Slow (-20%) | +50 | Heavy hauls |
| **Camel** | Normal | +30 | Desert, low rations |
| **Giant Eagle** | Very Fast | +10 | Skip terrain |

### Companions (Combat)

One active companion that helps in fights:

| Type | Combat Style | Bonus |
|------|--------------|-------|
| **Tank (Wolf, Bear)** | Melee | Absorbs damage |
| **Mystic (Owl, Sprite)** | Magic | Mana efficiency |
| **Scout (Hawk, Cat)** | Ranged | Crit chance |

---

## Combat System

### Monster Nodes

Some grid nodes contain monsters that must be defeated to:
- Get loot drops
- Access resources behind them
- Clear a path

### Combat Options

| Approach | What Happens | Outcome |
|----------|--------------|---------|
| **Manual** | Play combat minigame | Better results, less damage taken |
| **Auto** | Resolved automatically | More healing items used |
| **Avoid** | Go around the node | Costs extra movement time |

### Combat Minigame (TBD)

We want something that:
- Has tactical decisions
- Rewards skill/attention
- Can be learned and mastered
- Is satisfying when you do well

*Specific mechanics to be designed - NOT rhythm-game based.*

---

## Minigames

Each activity type has an optional minigame that increases efficiency.

### Design Principles

1. **Easy to learn, depth to master**
2. **Quick** - 10-30 seconds, not minutes
3. **Satisfying** - Good feedback on success
4. **Optional** - Auto is always available

### Ideas (To Be Finalized)

| Activity | Minigame Concept |
|----------|------------------|
| **Mining** | Timing-based power swing |
| **Woodcutting** | TBD |
| **Herbalism** | TBD |
| **Fishing** | TBD |
| **Combat** | TBD (tactical, not rhythm) |
| **Smelting** | Heat management? |
| **Research** | Pattern matching? |

*We want a "Mario Party" feel - variety of quick, fun challenges.*

---

## Rations & Travel

### How Rations Work

- Rations = days of food
- Travel consumes rations based on distance
- Staying at a location consumes 1 ration per day
- Run out = expedition ends, must return

### Distance & Ration Cost

| Distance | Travel Cost | Round Trip |
|----------|-------------|------------|
| Near | 1 day | 2 days |
| Moderate | 2 days | 4 days |
| Far | 3-4 days | 6-8 days |
| Extreme | 5+ days | 10+ days |

### The Ration Trade-off

Cooking ingredients can make:
- **Healing food** - Sustain in combat
- **Travel rations** - Fuel expeditions

You can't have both from the same fish. Choose wisely.

---

## Progression Pacing

| Milestone | Target Time |
|-----------|-------------|
| First expedition complete | 10 minutes |
| First crafted upgrade | 30 minutes |
| First skill to 50 | 1-2 weeks |
| First skill to 99 | 4-6 weeks |
| 5 skills maxed | 2-3 months |
| All 23 skills maxed | 8-12 months |

---

## Setting & Tone

### High Fantasy

- LotR / Skyrim inspired
- Medieval technology + magic
- Forests, mountains, dungeons, ancient ruins
- No steampunk, no sci-fi

### Tone

- **Adventurous** - Exploration and discovery
- **Cozy** - Town is your safe home base
- **Satisfying** - Full bags, good hauls, level ups
- **Not punishing** - Bad prep = less loot, not death

---

## What This Game Is NOT

| Not This | This Instead |
|----------|--------------|
| Watch numbers go up AFK | Make decisions while playing |
| Optimal single path | Many valid strategies |
| Punishing failure | Learning from inefficiency |
| Pay-to-win | Pay for cosmetics/convenience |
| Require 8hr sessions | 10-15 min sessions work great |
| Combat-focused RPG | Gathering/crafting with combat |

---

## Open Questions

- [ ] Specific minigame mechanics for each activity
- [ ] How does "auto" work when app is backgrounded?
- [ ] Sailing and ship mechanics
- [ ] Item size vs weight - do we need both?
- [ ] Social features (trading, leaderboards?)
- [ ] Monetization model specifics
