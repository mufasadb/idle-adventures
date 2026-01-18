# Combat System Design

## Overview

Combat is a 4x4 grid-based AoE dodging minigame where players must avoid enemy attacks while automatically dealing damage.

## Screen Layout

```
+----------------------------------+
|  [HP Bar]     [Enemy]            |  <- Top 1/3
|  [Atk Bar]    [Skeleton]         |
|               [HP: 6/6]          |
+----------------------------------+
|                                  |
|    [ ][ ][ ][ ]                  |  <- Bottom 2/3
|    [ ][ ][P][ ]   <- 4x4 Grid    |
|    [ ][ ][ ][ ]                  |
|    [ ][ ][ ][ ]                  |
|                                  |
+----------------------------------+
```

## Player Mechanics

| Stat | Value | Notes |
|------|-------|-------|
| Max HP | 10 | Persists between combats, resets at expedition end |
| Attack Speed | 2 ticks (1.2s) | Derived from equipment (future) |
| Damage | 1 | Derived from equipment (future) |
| Move Speed | 1 tick (0.6s) | Time between moves when clicking |

### Movement
- 8-directional movement (including diagonals)
- Click a tile to move toward it
- If clicked tile is 2+ squares away, move 1 square in that direction
- Movement executes on tick intervals (every 0.6s)
- Player starts in center of grid (position 1,1 in 0-indexed 4x4)

### Combat HP
- Starts at 10 for each expedition
- Persists between combat encounters
- Resets to 10 when expedition ends
- If HP reaches 0, expedition ends immediately

## Enemy Mechanics

Enemies are defined in `frontend/src/data/combat.ts`.

### Attack Patterns
- Attack telegraphed as tetris-like shapes on grid
- Dots appear in center of affected tiles
- Attack bar fills on left side of screen
- When bar is full, damage is dealt to any player in marked tiles

### Example Enemy: Skeleton

| Stat | Value (Ticks) | Time |
|------|---------------|------|
| Health | 6 | - |
| Attack Speed | 3 ticks | 1.8s |
| Damage | 1 | - |

## Rewards

| Outcome | Reward |
|---------|--------|
| Victory (survived) | 10 gold |
| Auto-combat | 10 gold, but always take 3 damage |
| Death | Expedition ends, no reward |

**Note:** Combat rewards do not scale with performance - you either survive and get the reward, or you don't.

## Attack Shapes

Attack patterns are tetris-like shapes. Examples:

```
Line (horizontal):    Line (vertical):    L-Shape:
[X][X][X][ ]          [X][ ][ ][ ]        [X][ ][ ][ ]
[ ][ ][ ][ ]          [X][ ][ ][ ]        [X][ ][ ][ ]
[ ][ ][ ][ ]          [X][ ][ ][ ]        [X][X][ ][ ]
[ ][ ][ ][ ]          [ ][ ][ ][ ]        [ ][ ][ ][ ]

T-Shape:              Square:             Cross:
[X][X][X][ ]          [X][X][ ][ ]        [ ][X][ ][ ]
[ ][X][ ][ ]          [X][X][ ][ ]        [X][X][X][ ]
[ ][ ][ ][ ]          [ ][ ][ ][ ]        [ ][X][ ][ ]
[ ][ ][ ][ ]          [ ][ ][ ][ ]        [ ][ ][ ][ ]
```

Shapes can be rotated and positioned anywhere on the grid.
