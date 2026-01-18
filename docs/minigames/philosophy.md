# Minigame Design Philosophy

This document outlines the core principles that guide how we design minigames in Idle Adventures. Every minigame should embody these values.

---

## The Core Principle

**Minigames should make you feel like you're actually doing the thing.**

Not abstractly. Not symbolically. When you're mining, you should feel the rhythm of swinging a pickaxe. When you're cooking, you should feel the chaos of managing a busy kitchen. When you're fishing, you should feel like you're hunting fish, not waiting for a notification.

### Feel Over Abstraction

Each minigame should capture both:
- **The physical feel** - What does your body do when doing this activity?
- **The mental challenge** - What decisions does this activity demand?

| Activity | Physical Feel | Mental Challenge |
|----------|---------------|------------------|
| Mining | Rhythmic swinging | Maintaining consistent tempo |
| Cooking | Juggling multiple tasks | Prioritization, timing |
| Fishing | Aiming, tracking | Leading targets, prediction |
| Combat | Positioning, dodging | Reading enemy, choosing attacks |
| Herbalism | Careful selection | Pattern recognition |

---

## The Anti-Patterns (What We Avoid)

### "Press Button When Thing Happens"
The worst minigame is: wait... wait... wait... NOW PRESS! This is:
- Boring during the wait
- Trivial during the action
- Zero skill expression

**Bad examples we avoid:**
- Fishing bobber bounces, press to catch
- Wait for food to brown, press to flip
- QTE prompts appearing randomly

### "Pure Timing Gates"
Minigames that are just "do X within Y milliseconds" with nothing else are shallow:
- No decisions to make
- No skill to develop beyond reaction time
- Becomes rote muscle memory

### "Idle With Extra Steps"
If the optimal strategy is "start it and look away," it's not a minigame - it's idle mode with a loading screen. Every moment should have something the player could be doing better.

---

## The Good Patterns (What We Embrace)

### Continuous Engagement
Every moment should have something to consider or do. Not frantic button-mashing, but thoughtful attention.

**Mining:** The rhythm circle grows continuously. You're always either:
- Watching the fill rate
- Timing your next hit
- Recovering from a miss

**Cooking:** Heat decays constantly. You're always either:
- Checking fish timelines
- Adjusting heat
- Applying spices

### Scalable Difficulty
Players should be able to choose their challenge level, with rewards matching risk.

| Activity | Easy Mode | Hard Mode |
|----------|-----------|-----------|
| Mining | Slow, forgiving rhythm | Fast tempo, tight windows |
| Cooking | 1-2 fish, simple recipes | 5 fish, complex recipes |
| Fishing | Slow fish, wide hitboxes | Fast fish, small targets, obstacles |
| Combat | Weak enemy, simple patterns | Strong enemy, complex attack sequences |

### Skill Expression
Better players should be able to:
1. **Achieve higher success rates** - Fewer misses, more perfect executions
2. **Increase throughput** - Handle more items, faster completion
3. **Attempt harder challenges** - Higher tier content earlier

### Multiple Simultaneous Concerns
The best minigames give you 2-3 things to track at once, creating natural prioritization decisions:

**Cooking example:**
- Heat level (is it in the right zone?)
- Fish A timeline (needs spice soon)
- Fish B timeline (needs heat change soon)
- Which do I handle first?

---

## Current Minigame Summary

### Mining (Rhythm)
**Feel:** Swinging a pickaxe in steady rhythm
**Challenge:** Establish your tempo, then maintain it precisely
**Scaling:** Rhythm tolerance, total hits required
**Status:** Implemented

### Fishing (Target Shooting)
**Feel:** Hunting fish with a harpoon
**Challenge:** Lead your targets, account for travel time
**Scaling:** Fish speed, fish size, harpoon speed, obstacles
**Status:** Implemented (basic)

### Herbalism (Pattern Matching)
**Feel:** Carefully identifying the right plant among similar ones
**Challenge:** Find the target herb among decoys
**Scaling:** Number of decoys, visual similarity, time pressure
**Status:** Implemented (basic)

### Combat (Positioning)
**Feel:** Reading your opponent, choosing your moment
**Challenge:** Be in the right place, avoid attacks, counter when open
**Scaling:** Enemy patterns, attack speed, arena hazards
**Status:** Implemented (basic - positioning only, attack/defense expansion planned)

**Planned expansion:**
- Watch enemy tells to predict attacks
- Choose defensive actions (block, dodge, parry)
- Choose attack types (fast/weak, slow/strong, special)
- Stamina/resource management

### Cooking (Multi-tasking)
**Feel:** Managing a busy stove
**Challenge:** Keep heat right, season at the right moment, across multiple dishes
**Scaling:** Number of fish, recipe complexity, heat decay rate
**Status:** Implemented

### Gem Mining (TBD)
**Ideas:**
- Precision cutting - trace patterns without touching edges
- Angle selection - choose cut angles for maximum yield
- Flaw avoidance - work around imperfections in the gem

### Woodcutting (TBD)
**Ideas:**
- Directional chopping - alternate sides to fell efficiently
- Weak point targeting - hit the marked spots
- Timing with tree sway

---

## Implementation Guidelines

### Timing
Always use `performance.now()` for timing-critical code, never `Date.now()`.

### Input
Use native event listeners for responsive input, not React synthetic events. Use refs to avoid stale closures.

### Game Loops
Use `requestAnimationFrame` for smooth updates, with tick-based logic for game state.

### Feedback
- Immediate visual feedback on all inputs
- Clear indicators for success/failure
- Progress visualization (bars, fills, counts)

---

## The Test

Before shipping a minigame, ask:

1. **Would I choose this over idle mode even if rewards were equal?**
2. **Can I identify 3 ways a skilled player beats a new player?**
3. **Is there something to think about at every moment?**
4. **Does it feel like the real activity, not just pressing buttons?**

If any answer is "no," iterate until it's "yes."
