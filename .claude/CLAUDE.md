# Idle Adventures - Project Instructions

## Game Engine

### Tick System
All game timing is based on a tick system:
- **1 tick = 600ms (0.6 seconds)**
- Defined in `frontend/src/data/combat.ts` as `TICK_MS`
- Also in `frontend/src/engine/expeditionExecutionStore.ts` as `BASE_TICK_MS`

## Performance & Responsiveness

### Timing - Use `performance.now()` NOT `Date.now()`

For any timing-critical code (minigames, animations, game loops), always use:

```typescript
// GOOD - High-resolution timing
const start = performance.now();
const elapsed = performance.now() - start;

// BAD - Lower resolution, can be affected by system clock
const start = Date.now();
```

### Delays - Use `requestAnimationFrame` NOT `setTimeout`

For short visual delays (damage flashes, transitions), use rAF-based timing:

```typescript
// GOOD - Precise timing synced to display refresh
const delayStart = performance.now();
const runDelay = () => {
  if (performance.now() - delayStart >= 200) {
    // Do the thing
  } else {
    requestAnimationFrame(runDelay);
  }
};
requestAnimationFrame(runDelay);

// BAD - Can be throttled, less precise
setTimeout(() => {
  // Do the thing
}, 200);
```

### Input Events - Use Native Listeners NOT React Events

For responsive input (especially in minigames), bypass React's synthetic event system:

```typescript
// GOOD - Native events, faster response
useEffect(() => {
  const element = elementRef.current;
  if (!element) return;

  const handlePointerDown = (e: PointerEvent) => {
    // Use e.timeStamp for precise timing
    processInput(e.timeStamp);
  };

  element.addEventListener('pointerdown', handlePointerDown);
  return () => element.removeEventListener('pointerdown', handlePointerDown);
}, []);

// BAD - React synthetic events add latency
<div onClick={(e) => processInput(Date.now())} />
```

### Refs for Event Handler State

When using native event listeners, use refs to avoid stale closures:

```typescript
const onClickRef = useRef(onClick);
const disabledRef = useRef(disabled);

useEffect(() => {
  onClickRef.current = onClick;
  disabledRef.current = disabled;
}, [onClick, disabled]);

useEffect(() => {
  const handler = () => {
    if (disabledRef.current) return;
    onClickRef.current();
  };
  element.addEventListener('pointerdown', handler);
  // ...
}, []); // Empty deps - handler uses refs
```

### Game Loops

Use `requestAnimationFrame` for game loops:

```typescript
useEffect(() => {
  if (phase !== 'playing') return;

  let animationId: number;
  const lastTick = { current: performance.now() };

  const gameLoop = () => {
    const now = performance.now();
    const elapsed = now - lastTick.current;

    if (elapsed >= TICK_MS) {
      lastTick.current = now;
      // Process tick
    }

    animationId = requestAnimationFrame(gameLoop);
  };

  animationId = requestAnimationFrame(gameLoop);
  return () => cancelAnimationFrame(animationId);
}, [phase]);
```

## File Structure

- `docs/` - Game design documentation
- `frontend/src/data/` - Game configuration (items, activities, combat, etc.)
- `frontend/src/engine/` - Game logic stores
- `frontend/src/components/minigames/` - Minigame components by type
- `frontend/src/components/screens/` - Full-screen game views

## Minigame Pattern

Each minigame follows this structure:
```
frontend/src/components/minigames/{type}/
  ├── constants.ts      # UI constants, timing values
  ├── {Component}.tsx   # Reusable visual components
  └── index.ts          # Barrel exports

frontend/src/components/screens/{Type}MinigameScreen.tsx  # Main screen with game logic
```
