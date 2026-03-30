/**
 * MiningMinigameScreen
 *
 * Rhythm-based mining minigame for active mode.
 * - 10 total hits to complete
 * - Hits 1-2 establish the rhythm (can't fail)
 * - Hits 3-10 must be within ±5% of previous interval
 * - Visual: white circle outline with dark purple growing inner circle
 * - Rewards: 150% for perfect, -10% per miss, minimum 70%
 *
 * TIMING: Uses performance.now() and native event listeners for accuracy.
 * See /research/react-rhythm-game-timing-research.md for details.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { expeditionExecutionStore } from '../../engine/expeditionExecutionStore';
import { ITEMS } from '../../data/items';
import {
  RhythmCircle,
  RhythmCircleStyles,
  TOTAL_HITS,
  RHYTHM_ESTABLISH_HITS,
  TIMING_TOLERANCE,
  PERFECT_MULTIPLIER,
  FAIL_PENALTY,
  MIN_MULTIPLIER,
  type HitFeedback,
} from '../minigames/mining';

export const MiningMinigameScreen = observer(() => {
  const { pendingMinigame } = expeditionExecutionStore;

  // Game state (useState for rendering updates)
  const [hitCount, setHitCount] = useState(0);
  const [failedHits, setFailedHits] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [feedback, setFeedback] = useState<HitFeedback | null>(null);
  const [circleProgress, setCircleProgress] = useState(0);

  // Timing state (refs for precision - no render delays)
  const hitTimestampsRef = useRef<number[]>([]);
  const lastIntervalRef = useRef<number | null>(null);
  const hitCountRef = useRef(0);
  const failedHitsRef = useRef(0);
  const isCompleteRef = useRef(false);

  // Animation state
  const animationRef = useRef<number | null>(null);
  const animationStartTimeRef = useRef<number | null>(null);

  // Ref for the tap area element
  const tapAreaRef = useRef<HTMLDivElement>(null);

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Start growing animation after a hit - uses performance.now() for accuracy
  // Animation grows to 1 + TIMING_TOLERANCE (105%), then auto-resets if missed
  const startGrowAnimation = useCallback((tapTimestamp: number) => {
    if (!lastIntervalRef.current) return;

    const expectedInterval = lastIntervalRef.current;
    // Animation starts from the tap timestamp, not performance.now()
    // This keeps animation in sync with timing validation
    const animationOrigin = tapTimestamp;
    animationStartTimeRef.current = animationOrigin;
    const maxProgress = 1 + TIMING_TOLERANCE; // 1.05 - circle can overflow 5%

    const animate = () => {
      if (!animationStartTimeRef.current || !lastIntervalRef.current) return;

      const elapsed = performance.now() - animationOrigin;
      const progress = elapsed / expectedInterval;
      setCircleProgress(Math.min(progress, maxProgress));

      if (progress >= maxProgress) {
        // Missed the window - reset and update timing reference
        setCircleProgress(0);

        // Update the last timestamp reference to the expected beat time
        // This ensures the next tap is measured from the "virtual" beat
        const missedBeatTime = animationOrigin + expectedInterval;
        const prevTimestamps = hitTimestampsRef.current;
        if (prevTimestamps.length > 0) {
          // Replace the last timestamp with the missed beat time
          hitTimestampsRef.current = [...prevTimestamps.slice(0, -1), missedBeatTime];
        }

        // Start new animation from the missed beat time
        animationStartTimeRef.current = missedBeatTime;
        const newAnimationOrigin = missedBeatTime;

        const animateFromReset = () => {
          if (!lastIntervalRef.current) return;

          const elapsedSinceReset = performance.now() - newAnimationOrigin;
          const resetProgress = elapsedSinceReset / expectedInterval;
          setCircleProgress(Math.min(resetProgress, maxProgress));

          if (resetProgress >= maxProgress) {
            // Missed again - recurse
            setCircleProgress(0);
            const nextMissedBeat = newAnimationOrigin + expectedInterval;
            if (hitTimestampsRef.current.length > 0) {
              hitTimestampsRef.current = [...hitTimestampsRef.current.slice(0, -1), nextMissedBeat];
            }
            startGrowAnimation(nextMissedBeat);
          } else {
            animationRef.current = requestAnimationFrame(animateFromReset);
          }
        };
        animationRef.current = requestAnimationFrame(animateFromReset);
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, []);

  // Process a tap with precise timing
  const processTap = useCallback((eventTime: number) => {
    if (isCompleteRef.current) return;

    const previousTimestamps = hitTimestampsRef.current;

    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    // Reset circle
    setCircleProgress(0);

    // Record this hit with precise timestamp
    hitTimestampsRef.current = [...previousTimestamps, eventTime];
    hitCountRef.current++;
    const newHitCount = hitCountRef.current;

    // Calculate interval if we have previous hit
    if (previousTimestamps.length > 0) {
      const currentInterval = eventTime - previousTimestamps[previousTimestamps.length - 1];

      // After rhythm is established, check timing
      if (newHitCount > RHYTHM_ESTABLISH_HITS && lastIntervalRef.current) {
        const tolerance = lastIntervalRef.current * TIMING_TOLERANCE;
        const diff = Math.abs(currentInterval - lastIntervalRef.current);

        if (diff > tolerance) {
          failedHitsRef.current++;
          setFailedHits(failedHitsRef.current);
          setFeedback({ type: 'fail', timestamp: eventTime });
        } else {
          setFeedback({ type: 'success', timestamp: eventTime });
        }
        // Don't update interval after establish phase - keep the original rhythm locked
      } else {
        // Rhythm establishing phase - always success and set the interval
        setFeedback({ type: 'success', timestamp: eventTime });
        // Only update interval during establish phase (hits 1-2)
        lastIntervalRef.current = currentInterval;
      }
    }

    // Update display state
    setHitCount(newHitCount);

    // Check if complete
    if (newHitCount >= TOTAL_HITS) {
      isCompleteRef.current = true;
      setIsComplete(true);
    } else {
      // Start growing animation from the tap time
      // No delay - animation origin matches the timing validation reference
      startGrowAnimation(eventTime);
    }

    // Clear feedback after animation (use rAF-based timing)
    const feedbackStart = performance.now();
    const clearFeedback = () => {
      if (performance.now() - feedbackStart >= 300) {
        setFeedback(null);
      } else {
        requestAnimationFrame(clearFeedback);
      }
    };
    requestAnimationFrame(clearFeedback);
  }, [startGrowAnimation]);

  // Native event listener for precise timing (bypasses React's event delegation)
  useEffect(() => {
    const tapArea = tapAreaRef.current;
    if (!tapArea) return;

    const handlePointerDown = (e: PointerEvent) => {
      // Use event.timeStamp which is a DOMHighResTimeStamp (same clock as performance.now())
      processTap(e.timeStamp);
    };

    // Use pointerdown for both mouse and touch with unified handling
    tapArea.addEventListener('pointerdown', handlePointerDown);

    return () => {
      tapArea.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [processTap]);

  // Calculate final reward multiplier
  const calculateMultiplier = useCallback(() => {
    const penalty = failedHitsRef.current * FAIL_PENALTY;
    return Math.max(MIN_MULTIPLIER, PERFECT_MULTIPLIER - penalty);
  }, []);

  // Handle continue button
  const handleContinue = useCallback(() => {
    const multiplier = calculateMultiplier();
    expeditionExecutionStore.completeMinigame(multiplier);
  }, [calculateMultiplier]);

  if (!pendingMinigame) {
    return (
      <div className="h-full flex items-center justify-center bg-app-primary">
        <p className="text-app-muted">No minigame pending</p>
      </div>
    );
  }

  const item = ITEMS[pendingMinigame.baseReward.itemId];
  const multiplier = calculateMultiplier();
  const finalReward = Math.max(1, Math.round(pendingMinigame.baseReward.count * multiplier));

  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* Header */}
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold text-accent mb-1">Mining</h2>
        <p className="text-app-muted text-sm">
          Tap to the rhythm! ({hitCount}/{TOTAL_HITS})
        </p>
      </div>

      {/* Main tap area - uses ref for native event listener */}
      <div className="flex-1 flex items-center justify-center">
        <RhythmCircle
          ref={tapAreaRef}
          hitCount={hitCount}
          circleProgress={circleProgress}
          feedback={feedback}
        />
      </div>

      {/* Results / Continue section */}
      {isComplete ? (
        <div className="p-6 bg-app-secondary border-t border-app">
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-3xl">{item?.icon ?? '?'}</span>
              <span className="text-2xl font-bold text-accent">
                +{finalReward} {item?.name ?? 'Resource'}
              </span>
            </div>
            <p className="text-app-muted text-sm">
              {failedHits === 0
                ? 'Perfect rhythm! 150% bonus!'
                : `${failedHits} mistimed hits (-${failedHits * 10}%)`}
            </p>
          </div>

          <button
            onClick={handleContinue}
            className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Continue Expedition
          </button>
        </div>
      ) : (
        <div className="p-4 text-center">
          <p className="text-app-muted text-sm">
            {hitCount < RHYTHM_ESTABLISH_HITS
              ? 'Tap to establish rhythm...'
              : 'Keep the beat! ±5% tolerance'}
          </p>
          {failedHits > 0 && (
            <p className="text-red-400 text-sm mt-1">
              Mistimed: {failedHits}
            </p>
          )}
        </div>
      )}

      {/* CSS animations */}
      <style>{RhythmCircleStyles}</style>
    </div>
  );
});
