/**
 * RhythmCircle - The visual tap area for the mining minigame.
 *
 * Features:
 * - White circle outline with growing inner circle
 * - Light purple when approaching target (0-95%)
 * - Dark purple during hit window (95-105%)
 * - Yellow glow on successful hits
 * - Black spark on failed hits
 * - Hit count display in center
 */

import { forwardRef } from 'react';
import { TIMING_TOLERANCE } from './constants';
import type { HitFeedback } from './constants';

interface RhythmCircleProps {
  /** Current hit count to display */
  hitCount: number;
  /** Progress of the growing circle (0 to 1+TOLERANCE) */
  circleProgress: number;
  /** Current feedback state */
  feedback: HitFeedback | null;
}

/** CSS animations for the rhythm circle */
export const RhythmCircleStyles = `
  @keyframes pulse {
    0% { opacity: 1; }
    100% { opacity: 0; }
  }
  @keyframes shrink {
    0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(0); opacity: 0; }
  }
`;

export const RhythmCircle = forwardRef<HTMLDivElement, RhythmCircleProps>(
  ({ hitCount, circleProgress, feedback }, ref) => {
    // Circle size - 240px fits well in iPhone container (430px max)
    const circleSize = 240;
    // Inner circle target size (matches white outline at progress=1.0)
    const innerTargetSize = circleSize - 8;

    // Determine if we're in the "hit window" (95%-105%)
    const hitWindowStart = 1 - TIMING_TOLERANCE; // 0.95
    const isInHitWindow = circleProgress >= hitWindowStart;

    // Light purple for approaching, dark purple for hit window
    const circleColor = isInHitWindow ? '#4a1d6e' : '#8b5eb0';

    return (
      <div
        ref={ref}
        className="relative cursor-pointer select-none touch-none overflow-visible"
        style={{ width: circleSize, height: circleSize }}
      >
        {/* Outer circle - white outline */}
        <div
          className="absolute inset-0 rounded-full border-4 border-white/80 pointer-events-none"
          style={{ boxSizing: 'border-box' }}
        />

        {/* Inner growing circle - color changes based on timing phase */}
        <div
          className="absolute rounded-full transition-none pointer-events-none"
          style={{
            width: circleProgress * innerTargetSize,
            height: circleProgress * innerTargetSize,
            backgroundColor: circleColor,
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
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
    );
  }
);

RhythmCircle.displayName = 'RhythmCircle';
