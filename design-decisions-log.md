# Idle RPG - Design Decisions Log

This document captures the key design decisions made during our design sessions. Use this as a reference if context is lost.

---

## Session Date: 2024-12-22

### Core Philosophy Shift

**FROM**: Idle game where numbers go up while AFK
**TO**: Active decision-making game with idle as a convenience fallback (70% efficiency)

Key quote: "Making an engaging game while you're holding the phone is more important than the AFK stuff"

---

### The Two Modes

1. **Expeditions** (Out in the world)
   - Navigate a 2D grid (e.g., 20x20)
   - Nodes contain resources, monsters, herbs, etc.
   - Movement costs time/actions based on terrain
   - Limited by carry capacity - must return home
   - Manual play = 85-100% yield, Auto = 70%

2. **Town Work** (Home base)
   - Processing raw materials (smelt ore, prepare herbs, etc.)
   - Crafting gear and items
   - Cooking rations for expeditions
   - Safe, no risk, no limits

---

### Map/Expedition System

**Maps are acquired by:**
- Buying from a shop (costs gold)
- Researching at the library (Cartography skill + time + materials)

**Cartography affects information quality:**
- Low Cartography: See icons only (⛏🌲👹)
- Medium: See resource names
- High: See quantities, action costs, hidden areas

**On arrival:**
- Grid is revealed with nodes visible
- Player lands at entry point
- Must navigate to nodes, gather, then return to entry to go home

---

### Grid Navigation

- Movement costs time/actions based on terrain
- Each node has an activity (mine, chop, fight, gather herbs)
- At each node, player chooses: Manual (minigame) OR Auto (70%)
- Shortest-path thinking encouraged but not forced

---

### Carry Capacity System

**Base capacity**: ~25 weight
**Backpacks** (Tailoring): +50 to +100
**Mounts** (Beastcraft): +20 to +50, plus speed bonuses
**Saddlebags** (Tailoring + mount): +25 to +40

**Items have:**
- Weight (how heavy)
- Size (how bulky) - TBD if we use this

**When full, options:**
- Head home now
- Drop lowest value items
- Manage manually
- Stop gathering, keep exploring

---

### Beasts/Mounts

Different beasts serve different purposes:

| Beast | Speed | Carry | Best For |
|-------|-------|-------|----------|
| Horse | Fast | +20 | Quick trips |
| Mule | Slow | +50 | Heavy hauls |
| Camel | Medium | +30 | Desert, low rations |
| Eagle | Very Fast | +10 | Skip terrain |

---

### Manual vs Auto Trade-off

The core tension: Your real-world time vs in-game efficiency

| Activity | Manual | Auto |
|----------|--------|------|
| Mining | 85-100% yield | 70% |
| Combat | Tactical, less damage taken | Basic attacks |
| Woodcutting | Combo bonuses | Flat rate |
| Herbalism | Rare finds possible | Common only |
| Research | Bonus discoveries | Standard |

**Philosophy**: Reward attention, don't demand it.

---

### Minigames

Each activity has an optional minigame (Mario Party style):
- Mining: Timing-based swing
- Combat: TBD (not rhythm game, something else)
- Woodcutting: TBD (not the scrolling marker idea)
- Herbalism: TBD
- Fishing: TBD

We're not locked into specific minigame designs yet.

---

### No Failure Punishment

**Removed**: Stranded, rescue, death mechanics

**New approach**:
- Bad preparation = less efficient expedition
- You always make it home
- "Failure" is just lower yield, not punishment

---

### Skills (23 Total)

**Gathering (6)**: Mining, Woodcutting, Herbalism, Fishing, Hunting, Bug Catching
**Crafting (9)**: Smithing, Alchemy, Cooking, Tailoring, Jewelcrafting, Carpentry, Engineering, Arcana, Brewing
**Production/Exploration (5)**: Farming, Beastcraft, Cartography, Sailing, Archaeology
**Combat (3)**: Melee, Magic, Ranged

---

### Cartography Specifics

**Research at library:**
- Choose region to research
- Select sources to consult (hunter's journal, herbalist notes, etc.)
- More sources = more detail on final map
- Optional research minigame

**Information tiers:**
| Carto Level | Before Trip | On Arrival |
|-------------|-------------|------------|
| 1-20 | "Forest, some resources" | Icons only |
| 21-40 | Resource types | Icons + names |
| 41-60 | Types + rough quantities | Names + ranges |
| 61-80 | Full detail + node costs | All info |
| 81-99 | Optimal routes suggested | Hidden nodes |

---

### Processing System

Most gathered materials need processing before crafting:
- Ore → Smelting → Ingots
- Logs → Milling → Planks
- Herbs → Preparing → Prepared herbs
- Fish → Cleaning → Cleaned fish (requires Beastcraft)
- Carcass → Skinning → Hides (requires Beastcraft)

Equipment tiers for processing stations:
- Basic (1-20)
- Intermediate (20-40)
- Advanced (40-60)
- Master (60+)

---

### Ration System

- Rations = travel fuel (days of food)
- Distance determines ration cost
- Better Cooking = more ration value per ingredient
- Same ingredients can make healing food OR rations (trade-off)

---

### Tech Stack Decision

**Frontend**: PWA (React/Vue + TypeScript, Service Worker)
**Backend**: Go + Gin + GORM
**Database**: PostgreSQL

---

### Documents To Update

1. **idle-rpg-dev-spec.md** - Add grid system, update models, revise core systems
2. **idle-rpg-skills.md** - Merge into new game design doc
3. **idle-rpg-ux-flows.md** - Already updated with new vision
4. **NEW: idle-rpg-game-design.md** - High-level design doc

---

### Open Questions

- [ ] Specific minigame mechanics for each activity
- [ ] Item size vs weight - do we need both?
- [ ] How does offline/AFK work in this new model? (70% efficiency on what?)
- [ ] Sailing/ships integration with grid system
- [ ] Combat minigame design
