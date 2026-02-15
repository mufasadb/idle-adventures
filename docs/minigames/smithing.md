# Smithing Minigame

> **See also:** [Minigame Design Philosophy](./philosophy.md) - Core principles that apply to all minigames

## Design Intent

Smithing is a **home-based crafting activity** that transforms raw ores into bars (smelting) and bars into tools/gear (forging). Unlike cooking's parallel multi-tasking, smithing is a **sequential multi-step process** where each step requires different active input.

### Core Fantasy
You're a blacksmith at your forge - stoking the fire with bellows, carefully adding materials to the crucible, pouring molten metal into molds, and hammering the result into shape. Every step is hands-on.

### Design Goals
1. **Sequential active engagement** - Each phase has different inputs (pump, add, pour, hammer)
2. **No waiting** - Always something to do or prepare for
3. **Skill expression** - Smooth bellows rhythm, accurate pours, consistent hammering
4. **Visual satisfaction** - See the metal flow, hear the hammer ring

### What Makes It Fun
- **Bellows rhythm** - Smooth up/down dragging to maintain heat
- **Pouring precision** - Speed control matters (too fast = spill)
- **Hammering finish** - Satisfying taps to complete the item
- **Material progression** - Unlock better alloys as you level

---

## Gameplay Overview

### Layout
```
┌─────────────────────────────────────────────────────────┐
│                       SMITHING                           │
├─────────────────────────────────────────────────────────┤
│                                                          │
│   ┌─────────┐                                           │
│   │ORE PILE │  ← tap ore to add to crucible             │
│   │ ●●● ●●  │                                           │
│   └────┬────┘                                           │
│        ↓                                                │
│   ┌─────────┐      ┌──────────────┐                     │
│   │CRUCIBLE │ ───► │   FURNACE    │      ┌───────┐     │
│   │  Cu: 3  │      │    🔥🔥🔥     │      │HAMMER │     │
│   │  Sn: 1  │      │  ┌────────┐  │      │  🔨   │     │
│   └─────────┘      │  │crucible│  │      └───────┘     │
│                    │  └────────┘  │                     │
│   ┌─────────┐      └──────────────┘                     │
│   │ BELLOWS │                                           │
│   │   ═══   │  ← drag handle up/down                    │
│   │   │█│   │                                           │
│   │   ═══   │      HEAT [░░░░████████░░] 72%           │
│   └─────────┘                                           │
│                                                          │
├──────────────────────┬──────────────────────────────────┤
│                      │                                   │
│   ┌─────────┐        │     ┌─────────────────┐          │
│   │  MOLDS  │        │     │                 │          │
│   │ ▢ ▢ ▢   │ ──────►│     │    ▢ MOLD       │          │
│   │  tap to │        │     │   [████░░░░]    │ ← fill   │
│   │  choose │        │     │    pouring...   │          │
│   └─────────┘        │     └─────────────────┘          │
│                      │                                   │
└──────────────────────┴──────────────────────────────────┘
```

### Game Flow

| Phase | Player Action | What Happens |
|-------|--------------|--------------|
| **1. Select Recipe** | Tap ore pile, choose what to make | Recipe shown, required ores highlighted |
| **2. Add Ores** | Tap ores to add to crucible | Ores move to crucible, counts update |
| **3. Heat** | Drag bellows up/down smoothly | Heat rises, must reach target zone |
| **4. Select Mold** | Tap mold pile | Choose mold popup |
| **5. Pour** | Drag crucible down slowly | Metal fills mold, too fast = spill |
| **6. Hammer** | Tap mold 2-3 times | Shape the bar/item |
| **7. Complete** | Auto | Bar added to bank, XP gained |

### Phases Detail

#### Phase 1-2: Material Setup
- Player sees available ores from bank
- Tapping an ore adds one to the crucible
- Recipe requirements shown (e.g., "Bronze: 3 Copper + 1 Tin")
- Can't proceed until requirements met

#### Phase 3: Heating (Bellows)
- Drag-based input (not tap-tap-tap)
- Smooth consistent motion = faster heat gain
- Jerky/stopped motion = heat decays
- Target zone varies by material (iron needs higher temp than copper)
- Visual: bellows animate with drag, furnace glows brighter

#### Phase 4: Mold Selection
- Tap mold pile opens selection
- Initially just "bar" mold available
- Later: tool molds (pickaxe, axe, etc.) unlock with level

#### Phase 5: Pouring
- Drag crucible downward to pour
- Pour speed affects quality:
  - Too fast: spillage, reduced yield
  - Too slow: metal cools, clumps
  - Just right: clean pour, full quality
- Fill meter shows mold filling up
- Visual: molten metal stream

#### Phase 6: Hammering
- 2-3 taps required
- Timing doesn't need to be precise (not rhythm-based)
- Visual feedback: sparks, metal flattening
- More of a satisfying finish than a challenge

---

## Data Layer

### Types (`/src/data/smithing.ts`)

```typescript
/** Metal ore types */
export type OreType =
  | 'copper-ore' | 'tin-ore' | 'iron-ore' | 'coal'
  | 'silver-ore' | 'gold-ore' | 'mithril-ore' | 'adamant-ore';

/** Bar/ingot types */
export type BarType =
  | 'copper-bar' | 'bronze-bar' | 'iron-bar' | 'steel-bar'
  | 'silver-bar' | 'gold-bar' | 'mithril-bar' | 'adamant-bar';

/** Mold types */
export type MoldType = 'bar' | 'pickaxe-head' | 'axe-head' | 'sword-blade';

/** Recipe ingredient */
export interface SmithingIngredient {
  oreId: OreType;
  count: number;
}

/** Smithing recipe */
export interface SmithingRecipe {
  id: string;
  outputId: string;          // Bar or tool ID
  outputCount: number;       // Usually 1
  ingredients: SmithingIngredient[];
  moldType: MoldType;
  tier: number;
  levelRequired: number;
  heatTarget: number;        // 0-100, what heat level needed
  heatTolerance: number;     // How close to target is acceptable
  hammerHits: number;        // How many hammer taps
}
```

### Constants

```typescript
export const SMITHING_CONSTANTS = {
  TICK_MS: 600,

  // Bellows
  HEAT_GAIN_PER_PUMP: 8,      // Heat added per full pump cycle
  HEAT_DECAY_PER_TICK: 1.5,   // Heat loss when not pumping
  PUMP_CYCLE_MS: 400,         // Time for one up-down cycle

  // Pouring
  POUR_SPEED_MIN: 0.3,        // Minimum pour rate (too slow)
  POUR_SPEED_MAX: 0.8,        // Maximum pour rate (too fast)
  POUR_SPEED_OPTIMAL: 0.5,    // Optimal pour rate
  SPILL_THRESHOLD: 0.9,       // Pour faster than this = spill

  // Quality
  QUALITY_HEAT_WEIGHT: 0.4,   // How much heat accuracy affects quality
  QUALITY_POUR_WEIGHT: 0.4,   // How much pour accuracy affects quality
  QUALITY_HAMMER_WEIGHT: 0.2, // How much hammer timing affects quality

  // XP
  BASE_XP_PER_BAR: 25,
  XP_MULTIPLIER_PER_TIER: 1.5,
};
```

### Recipes

```typescript
export const SMITHING_RECIPES: SmithingRecipe[] = [
  // Tier 1: Copper (level 1)
  {
    id: 'smelt-copper',
    outputId: 'copper-bar',
    outputCount: 1,
    ingredients: [{ oreId: 'copper-ore', count: 1 }],
    moldType: 'bar',
    tier: 1,
    levelRequired: 1,
    heatTarget: 50,
    heatTolerance: 20,
    hammerHits: 2,
  },
  // Tier 2: Bronze (level 7) - First alloy!
  {
    id: 'smelt-bronze',
    outputId: 'bronze-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'copper-ore', count: 3 },
      { oreId: 'tin-ore', count: 1 },
    ],
    moldType: 'bar',
    tier: 2,
    levelRequired: 7,
    heatTarget: 60,
    heatTolerance: 15,
    hammerHits: 2,
  },
  // Tier 3: Steel (level 15) - Iron + Coal
  {
    id: 'smelt-steel',
    outputId: 'steel-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'iron-ore', count: 1 },
      { oreId: 'coal', count: 1 },
    ],
    moldType: 'bar',
    tier: 3,
    levelRequired: 15,
    heatTarget: 75,
    heatTolerance: 12,
    hammerHits: 3,
  },
  // Tier 4: Mithril (level 30)
  {
    id: 'smelt-mithril',
    outputId: 'mithril-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'mithril-ore', count: 1 },
      { oreId: 'coal', count: 2 },
    ],
    moldType: 'bar',
    tier: 4,
    levelRequired: 30,
    heatTarget: 85,
    heatTolerance: 10,
    hammerHits: 3,
  },
  // Tier 5: Adamant (level 45)
  {
    id: 'smelt-adamant',
    outputId: 'adamant-bar',
    outputCount: 1,
    ingredients: [
      { oreId: 'adamant-ore', count: 1 },
      { oreId: 'coal', count: 3 },
    ],
    moldType: 'bar',
    tier: 5,
    levelRequired: 45,
    heatTarget: 95,
    heatTolerance: 8,
    hammerHits: 3,
  },
];
```

---

## Component Layer (`/src/components/minigames/smithing/`)

| Component | Purpose |
|-----------|---------|
| `OrePile.tsx` | Display available ores, tap to add to crucible |
| `Crucible.tsx` | Shows current ore contents, draggable for pouring |
| `Furnace.tsx` | Visual furnace with heat glow, holds crucible |
| `Bellows.tsx` | Drag up/down to pump, drives heat |
| `HeatMeter.tsx` | Heat bar with target zone indicator |
| `MoldPile.tsx` | Tap to open mold selection |
| `MoldSlot.tsx` | Active mold being filled, shows pour progress |
| `Hammer.tsx` | Tap to hammer, visual feedback |
| `constants.ts` | UI colors, animation timings |
| `index.ts` | Barrel exports |

### Key Interactions

**Bellows (drag input):**
```typescript
// Track drag position
const handlePointerMove = (e: PointerEvent) => {
  const deltaY = e.clientY - lastY.current;
  // Positive deltaY = moving down = push phase
  // Negative deltaY = moving up = pull phase
  // Full cycle = one push + one pull = heat gain
};
```

**Crucible (pour gesture):**
```typescript
// Drag down to pour, speed matters
const handlePour = (e: PointerEvent) => {
  const pourSpeed = calculateSpeed(e);
  if (pourSpeed > SPILL_THRESHOLD) {
    // Too fast - spill!
    spillAmount += overflow;
  }
  fillAmount += pourSpeed * POUR_RATE;
};
```

---

## Screen (`/src/components/screens/SmithingScreen.tsx`)

### Game Phases

```typescript
type SmithingPhase =
  | 'select'    // Choose recipe
  | 'loading'   // Adding ores to crucible
  | 'heating'   // Pumping bellows
  | 'molding'   // Selecting mold
  | 'pouring'   // Pouring metal
  | 'hammering' // Finishing taps
  | 'results';  // Show outcome
```

### State

```typescript
interface SmithingState {
  phase: SmithingPhase;
  selectedRecipe: SmithingRecipe | null;
  crucibleContents: Map<OreType, number>;
  heat: number;
  selectedMold: MoldType | null;
  pourProgress: number;      // 0-1
  pourQuality: number;       // 0-1 based on pour speed
  hammerHits: number;
  spillAmount: number;
  result: { success: boolean; quality: number } | null;
}
```

### Game Loop

```typescript
// Uses requestAnimationFrame like other minigames
useEffect(() => {
  if (phase !== 'heating') return;

  const loop = () => {
    const now = performance.now();
    if (now - lastTick.current >= TICK_MS) {
      // Decay heat if not actively pumping
      if (!isPumping) {
        setHeat(h => Math.max(0, h - HEAT_DECAY_PER_TICK));
      }
      lastTick.current = now;
    }
    animationId = requestAnimationFrame(loop);
  };
  // ...
}, [phase]);
```

---

## New Items Required

### Bars (add to items.ts)

```typescript
'copper-bar': {
  id: 'copper-bar',
  name: 'Copper Bar',
  icon: '🟤',
  category: 'material',
  stackSize: 50,
  description: 'Soft metal bar.',
},
'bronze-bar': {
  id: 'bronze-bar',
  name: 'Bronze Bar',
  icon: '🟫',
  category: 'material',
  stackSize: 50,
  description: 'Sturdy alloy of copper and tin.',
},
'steel-bar': {
  id: 'steel-bar',
  name: 'Steel Bar',
  icon: '⬜',
  category: 'material',
  stackSize: 50,
  description: 'Strong iron-carbon alloy.',
},
// ... etc
```

---

## Implementation Plan

### Phase 1: Foundation
1. Create `data/smithing.ts` with types, constants, initial recipes
2. Add bar items to `data/items.ts`
3. Add 'smithing' to GameScreen type
4. Create empty `SmithingScreen.tsx`
5. Wire up in `Game.tsx` and `TownScreen.tsx`

### Phase 2: Components
6. Create `components/minigames/smithing/` folder structure
7. Implement `OrePile.tsx` - displays ores, tap to add
8. Implement `Crucible.tsx` - shows contents
9. Implement `Furnace.tsx` - visual container
10. Implement `Bellows.tsx` - drag interaction for heat
11. Implement `HeatMeter.tsx` - reuse/adapt from cooking

### Phase 3: Core Gameplay
12. Implement `MoldPile.tsx` and `MoldSlot.tsx`
13. Implement pour gesture and fill animation
14. Implement `Hammer.tsx` with tap feedback
15. Wire up full game flow in `SmithingScreen.tsx`

### Phase 4: Polish
16. Add quality calculation based on heat/pour/hammer accuracy
17. Add XP gain on completion
18. Add result screen with stats
19. Add visual polish (particles, glow effects)
20. Test and balance

---

## Future Enhancements

### Planned
- [ ] Tool crafting (pickaxes, axes) with multi-step recipes
- [ ] Multi-bar batches (bigger crucible upgrade)
- [ ] Quality tiers (poor/normal/fine/masterwork)
- [ ] Furnace upgrades (holds heat longer)

### Possible
- [ ] Rare ore discoveries during smelting
- [ ] Special alloys with unique properties
- [ ] Smithing orders/quests from NPCs
