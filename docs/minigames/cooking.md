# Cooking Minigame

> **See also:** [Minigame Design Philosophy](./philosophy.md) - Core principles that apply to all minigames

## Design Intent

Cooking is a **home-based crafting activity** that transforms raw fish (caught during expeditions) into cooked food that provides actions for future expeditions. Unlike expedition minigames which are quick skill checks, cooking is a **multi-tasking management challenge** where players juggle heat control and seasoning across multiple items simultaneously.

### Core Fantasy
You're a cook managing a busy stove - keeping the fire at the right temperature while seasoning each dish at precisely the right moment. The more ambitious you are (cooking multiple fish at once), the more hectic it becomes.

### Design Goals
1. **Active engagement** - Not just waiting for timers; constant decisions about heat and when to season
2. **Scalable difficulty** - Cooking 1 fish is relaxed; cooking 5 is frantic
3. **Skill expression** - Better players can handle more fish, increasing throughput
4. **Clear feedback** - Always know what each fish needs next via timeline bars

### What Makes It Fun
- **Heat surfing** - The fire constantly cools, requiring regular attention
- **Plate spinning** - Each fish has its own recipe timeline progressing independently
- **Prioritization** - When multiple fish need attention, which do you handle first?
- **Risk/reward** - Cook more fish for efficiency, but risk burning some

---

## Gameplay Overview

### Layout (3 sections, top to bottom)
```
+---------------------------+
|   [Paprika] [Herbs] [Turmeric]   <- Spice bowls
+---------------------------+
|                           |
|   [Fish 1] [Fish 2] [Fish 3]     <- Stovetop with fish
|   [Fish 4] [Fish 5]              <- Up to 5 slots
|                           |
+---------------------------+
|   [====|====|====] 67%    <- Heat meter (Low/Med/High zones)
+---------------------------+
|                           |
|      [Fire Pit]           <- Tap to add heat
|      TAP TO ADD HEAT      |
+---------------------------+
```

### Recipe System
Each fish type has a recipe - a sequence of steps like:
```
Sardines:  HIGH heat (3 ticks) -> GREEN spice -> MEDIUM heat (4 ticks)
Trout:     HIGH (3) -> RED spice -> MEDIUM (3) -> GREEN spice -> LOW (3)
Salmon:    HIGH (4) -> YELLOW -> MEDIUM (3) -> RED -> MEDIUM (3) -> GREEN -> LOW (2)
Lobster:   HIGH (5) -> RED -> HIGH (3) -> YELLOW -> MEDIUM (4) -> GREEN -> MEDIUM (3) -> RED -> LOW (3)
```

### Timeline Bar
Each fish displays a horizontal bar showing:
- Completed steps (filled with step's color)
- Current step (partially filled, progressing)
- Upcoming steps (grey)
- Current requirement label below ("HIGH" or "+ GREEN")

### Heat Management
- Heat ranges 0-100%, divided into zones: Low (0-33), Medium (34-66), High (67-100)
- Heat **decays constantly** (2% per tick)
- Tapping fire pit **adds 15%** heat
- Heat steps only progress when in the correct zone

### Spice Application
- Tap a spice bowl to select it (highlighted)
- Tap a fish to apply the selected spice
- If the fish's current step expects that spice, it advances
- Wrong spice = wasted (counts as partial failure)

### Success/Failure
- **Success**: Complete all recipe steps
- **Failure**: Currently forgiving - fish don't burn from wrong heat (future: add burn timer)
- Results show successful vs failed count, cooked fish added to bank

---

## Implementation

### Data Layer (`/src/data/cooking.ts`)

**Key Types:**
```typescript
type HeatLevel = 'low' | 'medium' | 'high';
type SpiceColor = 'red' | 'green' | 'yellow';

interface RecipeStep {
  type: 'heat' | 'spice';
  heat?: HeatLevel;      // For heat steps
  spice?: SpiceColor;    // For spice steps
  durationTicks: number; // How long this step takes
}

interface CookingRecipe {
  inputId: string;       // e.g., 'raw-sardines'
  outputId: string;      // e.g., 'sardines'
  tier: number;          // 1-4
  levelRequired: number; // tier * 7
  steps: RecipeStep[];
  baseSuccessRate: number;
}
```

**Constants:**
- `TICK_MS`: 600ms (same as combat)
- `HEAT_DECAY_PER_TICK`: 2
- `HEAT_PER_LOG`: 15
- `MAX_FISH_SLOTS`: 5
- `SUCCESS_BONUS_PER_LEVEL`: 0.05 (5% per level above requirement)

### Component Layer (`/src/components/minigames/cooking/`)

| Component | Purpose |
|-----------|---------|
| `HeatMeter.tsx` | Visual heat bar with zone indicators and target highlighting |
| `FirePit.tsx` | Interactive fire area with animated flames |
| `SpiceBowls.tsx` | Three spice selection buttons |
| `FishSlot.tsx` | Single fish with recipe timeline visualization |
| `constants.ts` | UI constants (colors, animation timings) |

### Screen (`/src/components/screens/CookingScreen.tsx`)

**Game Phases:**
1. `select` - Choose fish type and quantity
2. `cooking` - Active minigame
3. `results` - Show success/failure counts

**State Management:**
- `heat` (number 0-100) - Current fire temperature
- `heatRef` (ref) - For native event handler (avoids stale closures)
- `selectedSpice` (SpiceColor | null) - Currently selected spice
- `cookingFish` (CookingFish[]) - Array of fish being cooked

**Game Loop (requestAnimationFrame):**
```typescript
// Every TICK_MS:
1. Decay heat by HEAT_DECAY_PER_TICK
2. For each cooking fish:
   - If current step is 'heat' type:
     - If in correct heat zone: increment progress
     - If step complete: advance to next step
   - If current step is 'spice' type:
     - Wait for player tap (no auto-progress)
3. Check if all fish done -> show results
```

**Native Event Handling:**
Fire pit uses native `pointerdown` listener with ref pattern to avoid React state closure issues:
```typescript
const heatRef = useRef(heat);
useEffect(() => { heatRef.current = heat; }, [heat]);

useEffect(() => {
  const handlePointerDown = () => {
    const newHeat = Math.min(100, heatRef.current + HEAT_PER_LOG);
    heatRef.current = newHeat;
    setHeat(newHeat);
  };
  firePit.addEventListener('pointerdown', handlePointerDown);
  // ...
}, [phase]);
```

---

## Future Improvements

### Planned
- [ ] Burn mechanic - fish burns if wrong heat too long
- [ ] Quality levels - perfect execution = bonus yield
- [ ] Visual polish - sizzle effects, steam, color changes as fish cooks
- [ ] Sound effects - sizzling, spice application sounds

### Possible Extensions
- Different recipe types (not just fish - bread, stew, potions)
- Unlockable spices with different effects
- Cooking skill XP gains
- Rare "perfect cook" bonus items
