/**
 * useGameLoop
 *
 * A hook for running continuous game animation loops with proper cleanup.
 * Uses performance.now() for high-resolution timing and requestAnimationFrame
 * for smooth, battery-efficient animations.
 *
 * @example Basic usage - continuous animation
 * ```tsx
 * useGameLoop(isPlaying, (now, delta) => {
 *   setProgress(prev => prev + delta * 0.001);
 * });
 * ```
 *
 * @example Tick-based game loop
 * ```tsx
 * const lastTickRef = useRef(0);
 * useGameLoop(isPlaying, (now) => {
 *   if (now - lastTickRef.current >= TICK_MS) {
 *     lastTickRef.current = now;
 *     processGameTick();
 *   }
 * });
 * ```
 */

import { useEffect, useRef } from 'react';

export type GameLoopCallback = (now: number, deltaMs: number) => void | boolean;

/**
 * Runs a continuous animation loop while `isRunning` is true.
 *
 * @param isRunning - Whether the loop should be active
 * @param callback - Called each frame with current time and delta since last frame.
 *                   Return `false` to stop the loop early.
 * @param deps - Additional dependencies that should restart the loop when changed
 */
export function useGameLoop(
  isRunning: boolean,
  callback: GameLoopCallback,
  deps: React.DependencyList = []
): void {
  const callbackRef = useRef(callback);
  const animationRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number>(0);

  // Keep callback ref updated to avoid stale closures
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!isRunning) return;

    lastFrameRef.current = performance.now();

    const animate = (now: number) => {
      const delta = now - lastFrameRef.current;
      lastFrameRef.current = now;

      // Call the callback, stop if it returns false
      const result = callbackRef.current(now, delta);
      if (result === false) return;

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, ...deps]);
}

/**
 * Creates a tick-based game loop that calls the callback at fixed intervals.
 *
 * @param isRunning - Whether the loop should be active
 * @param tickMs - Milliseconds between ticks
 * @param onTick - Called each tick with the tick count
 * @param deps - Additional dependencies that should restart the loop when changed
 */
export function useTickLoop(
  isRunning: boolean,
  tickMs: number,
  onTick: (tickCount: number) => void | boolean,
  deps: React.DependencyList = []
): void {
  const onTickRef = useRef(onTick);
  const lastTickRef = useRef<number>(0);
  const tickCountRef = useRef(0);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  useGameLoop(
    isRunning,
    (now) => {
      if (now - lastTickRef.current >= tickMs) {
        lastTickRef.current = now;
        tickCountRef.current++;
        return onTickRef.current(tickCountRef.current);
      }
    },
    [tickMs, ...deps]
  );

  // Reset tick count when loop restarts
  useEffect(() => {
    if (isRunning) {
      lastTickRef.current = performance.now();
      tickCountRef.current = 0;
    }
  }, [isRunning]);
}
