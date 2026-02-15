/**
 * useAnimationDelay
 *
 * A hook for requestAnimationFrame-based delays as an alternative to setTimeout.
 * This provides more precise timing that's synced to the display refresh rate
 * and won't be throttled by browser power-saving features.
 *
 * @example Basic usage
 * ```tsx
 * const delay = useAnimationDelay();
 *
 * const handleClick = () => {
 *   setIsFlashing(true);
 *   delay(200, () => setIsFlashing(false));
 * };
 * ```
 *
 * @example With cleanup on unmount
 * ```tsx
 * const delay = useAnimationDelay();
 * // All pending delays are automatically cancelled on unmount
 * ```
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type DelayId = number;

interface PendingDelay {
  startTime: number;
  durationMs: number;
  callback: () => void;
  animationId: number;
}

/**
 * Returns a function to schedule rAF-based delays.
 * All delays are automatically cancelled on unmount.
 */
export function useAnimationDelay(): (durationMs: number, callback: () => void) => DelayId {
  const pendingDelaysRef = useRef<Map<DelayId, PendingDelay>>(new Map());
  const nextIdRef = useRef(0);

  // Cleanup all pending delays on unmount
  useEffect(() => {
    return () => {
      pendingDelaysRef.current.forEach((pending) => {
        cancelAnimationFrame(pending.animationId);
      });
      pendingDelaysRef.current.clear();
    };
  }, []);

  const scheduleDelay = useCallback((durationMs: number, callback: () => void): DelayId => {
    const id = nextIdRef.current++;
    const startTime = performance.now();

    const check = () => {
      const pending = pendingDelaysRef.current.get(id);
      if (!pending) return;

      if (performance.now() - startTime >= durationMs) {
        pendingDelaysRef.current.delete(id);
        callback();
      } else {
        pending.animationId = requestAnimationFrame(check);
      }
    };

    const animationId = requestAnimationFrame(check);
    pendingDelaysRef.current.set(id, {
      startTime,
      durationMs,
      callback,
      animationId,
    });

    return id;
  }, []);

  return scheduleDelay;
}

/**
 * Cancels a pending delay by ID.
 */
export function useCancelDelay(): (id: DelayId) => void {
  const pendingDelaysRef = useRef<Map<DelayId, PendingDelay>>(new Map());

  return useCallback((id: DelayId) => {
    const pending = pendingDelaysRef.current.get(id);
    if (pending) {
      cancelAnimationFrame(pending.animationId);
      pendingDelaysRef.current.delete(id);
    }
  }, []);
}

/**
 * Simplified hook for a single delayed action that auto-cancels on re-trigger.
 * Good for things like damage flashes, feedback animations, etc.
 *
 * @example
 * ```tsx
 * const [isFlashing, triggerFlash] = useFlashState(200);
 *
 * const handleDamage = () => {
 *   triggerFlash(); // Sets isFlashing to true, then false after 200ms
 * };
 * ```
 */
export function useFlashState(
  durationMs: number
): [boolean, () => void] {
  const animationIdRef = useRef<number | null>(null);
  const [isActive, setIsActive] = useState(false);

  const trigger = useCallback(() => {
    // Cancel any pending reset
    if (animationIdRef.current) {
      cancelAnimationFrame(animationIdRef.current);
    }

    setIsActive(true);
    const startTime = performance.now();

    const check = () => {
      if (performance.now() - startTime >= durationMs) {
        setIsActive(false);
        animationIdRef.current = null;
      } else {
        animationIdRef.current = requestAnimationFrame(check);
      }
    };

    animationIdRef.current = requestAnimationFrame(check);
  }, [durationMs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, []);

  return [isActive, trigger];
}
