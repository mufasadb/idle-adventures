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

/** Total hits required */
const TOTAL_HITS = 10;

/** First N hits establish rhythm (can't fail) */
const RHYTHM_ESTABLISH_HITS = 2;

/** Timing tolerance (±5%) */
const TIMING_TOLERANCE = 0.05;

/** Perfect reward multiplier */
const PERFECT_MULTIPLIER = 1.5;

/** Penalty per failed hit */
const FAIL_PENALTY = 0.1;

/** Minimum reward multiplier */
const MIN_MULTIPLIER = 0.7;

/** Delay before starting circle growth (ms) */
const GROWTH_START_DELAY_MS = 50;

interface HitFeedback {
  type: 'success' | 'fail';
  timestamp: number;
}

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
  const startGrowAnimation = useCallback(() => {
    if (!lastIntervalRef.current) return;

    const expectedInterval = lastIntervalRef.current;
    animationStartTimeRef.current = performance.now();

    const animate = () => {
      if (!animationStartTimeRef.current || !lastIntervalRef.current) return;

      const elapsed = performance.now() - animationStartTimeRef.current;
      const progress = Math.min(elapsed / expectedInterval, 1);
      setCircleProgress(progress);

      if (progress < 1) {
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
      } else {
        // Rhythm establishing phase - always success
        setFeedback({ type: 'success', timestamp: eventTime });
      }

      // Update expected interval for next hit
      lastIntervalRef.current = currentInterval;
    }

    // Update display state
    setHitCount(newHitCount);

    // Check if complete
    if (newHitCount >= TOTAL_HITS) {
      isCompleteRef.current = true;
      setIsComplete(true);
    } else {
      // Start growing animation for next expected hit
      // Use requestAnimationFrame for precise timing instead of setTimeout
      requestAnimationFrame(() => {
        // Small delay before starting growth
        const delayStart = performance.now();
        const startAfterDelay = () => {
          if (performance.now() - delayStart >= GROWTH_START_DELAY_MS) {
            startGrowAnimation();
          } else {
            requestAnimationFrame(startAfterDelay);
          }
        };
        requestAnimationFrame(startAfterDelay);
      });
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

  // Circle sizes - 60% of viewport width
  const circleSize = '60vw';
  const maxCirclePx = 'calc(60vw - 8px)'; // Inner circle slightly smaller

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
        <div
          ref={tapAreaRef}
          className="relative cursor-pointer select-none touch-none"
          style={{ width: circleSize, height: circleSize }}
        >
          {/* Outer circle - white outline */}
          <div
            className="absolute inset-0 rounded-full border-4 border-white/80 pointer-events-none"
            style={{ boxSizing: 'border-box' }}
          />

          {/* Inner growing circle - dark purple */}
          <div
            className="absolute rounded-full transition-none pointer-events-none"
            style={{
              width: `calc(${circleProgress * 100}% - 8px)`,
              height: `calc(${circleProgress * 100}% - 8px)`,
              maxWidth: maxCirclePx,
              maxHeight: maxCirclePx,
              backgroundColor: '#4a1d6e', // Dark purple
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              minWidth: circleProgress > 0 ? '1px' : '0',
              minHeight: circleProgress > 0 ? '1px' : '0',
            }}
          />

          {/* Success feedback - yellow glow */}
          {feedback?.type === 'success' && (
            <div
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                boxShadow: '0 0 40px 20px rgba(255, 255, 180, 0.6)',
                animation: 'pulse 0.3s ease-out',
              }}
            />
          )}

          {/* Fail feedback - black spark */}
          {feedback?.type === 'fail' && (
            <div
              className="absolute rounded-full bg-black pointer-events-none"
              style={{
                width: '20px',
                height: '20px',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                animation: 'shrink 0.3s ease-out forwards',
              }}
            />
          )}

          {/* Hit count display */}
          <div
            className="absolute text-white font-bold text-4xl pointer-events-none"
            style={{
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textShadow: '0 2px 8px rgba(0,0,0,0.8)',
            }}
          >
            {hitCount}
          </div>
        </div>
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
            Continue Adventure
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
      <style>{`
        @keyframes pulse {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes shrink {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
        }
      `}</style>
    </div>
  );
});
