# Game Design Document

## Core Systems

### Tick System

All game timing is based on a **tick system** where:

- **1 tick = 600ms (0.6 seconds)**
- All minigames, combat, and movement operate on multiples of this base tick
- This ensures consistent timing across all game systems

#### Tick Usage Examples

| Action | Ticks | Time |
|--------|-------|------|
| Player movement | 1 | 0.6s |
| Player attack | 2 | 1.2s |
| Activity node processing | 2 | 1.2s |
| Basic enemy attack | Variable | Multiples of 0.6s |

The tick constant is defined in:
- `frontend/src/data/combat.ts` - `TICK_MS`
- `frontend/src/engine/expeditionExecutionStore.ts` - `BASE_TICK_MS`

### Minigames

All minigames should respect the tick system for any timed interactions.

#### Mining Minigame
- Rhythm-based timing game
- 10 hits total, first 2 establish rhythm
- Rewards: 150% perfect, -10% per miss, minimum 70%

#### Herbs Minigame
- Point Blank-style target identification
- 6 second time limit
- Rewards: 2x * (correct picks / total good flowers)

#### Combat Minigame
- 4x4 grid-based AoE dodging
- Player moves on tick intervals (1 tick = 0.6s)
- Enemy attacks on tick multiples
- See `docs/combat.md` for detailed mechanics
