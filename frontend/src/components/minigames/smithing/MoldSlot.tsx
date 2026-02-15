/**
 * MoldSlot Component
 *
 * Shows the mold being filled with molten metal.
 * Features animated pour stream and glowing metal effects.
 */

import { MOLD } from './constants';
import { BAR_INFO, type BarType } from '../../../data/smithing';

interface MoldSlotProps {
  /** What bar type is being made */
  barType: BarType;
  /** Pour progress 0-1 */
  fillProgress: number;
  /** Whether metal is currently being poured */
  isPouring: boolean;
  /** Amount spilled (0-1) */
  spillAmount: number;
  /** Whether mold is complete */
  isComplete: boolean;
}

export function MoldSlot({
  barType,
  fillProgress,
  isPouring,
  spillAmount,
  isComplete,
}: MoldSlotProps) {
  const barInfo = BAR_INFO[barType];
  const fillPercent = fillProgress * 100;

  // Determine glow intensity based on fill state
  const glowIntensity = isComplete ? 0 : isPouring ? 20 : fillProgress > 0 ? 10 : 0;

  return (
    <div className="relative flex flex-col items-center">
      {/* Label */}
      <div className="text-xs text-app-muted text-center mb-2">
        {isComplete ? 'Complete!' : 'Mold'}
      </div>

      {/* Pour stream */}
      {isPouring && fillProgress < 1 && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20">
          {/* Main stream */}
          <div
            className="relative w-1.5 h-14 overflow-visible"
            style={{
              background: 'linear-gradient(to bottom, #fbbf24, #f97316, #ea580c)',
              boxShadow: '0 0 12px #f97316, 0 0 24px #fbbf2480',
              animation: 'pour-wobble 0.15s ease-in-out infinite',
            }}
          >
            {/* Droplets */}
            <div
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-orange-500"
              style={{
                animation: 'droplet-fall 0.3s ease-in infinite',
                boxShadow: '0 0 8px #f97316',
              }}
            />
          </div>

          {/* Splash at impact */}
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2"
            style={{
              animation: 'splash 0.4s ease-out infinite',
            }}
          >
            <div className="flex gap-0.5">
              <div className="w-1 h-2 bg-orange-400 rounded-full" style={{ transform: 'rotate(-30deg)' }} />
              <div className="w-1 h-1.5 bg-yellow-400 rounded-full" />
              <div className="w-1 h-2 bg-orange-400 rounded-full" style={{ transform: 'rotate(30deg)' }} />
            </div>
          </div>
        </div>
      )}

      {/* Mold container */}
      <div
        className="relative overflow-hidden transition-all duration-200"
        style={{
          width: MOLD.width,
          height: MOLD.height + 10,
          background: 'linear-gradient(to bottom, #4b5563, #374151)',
          borderRadius: '4px',
          border: '2px solid #6b7280',
          boxShadow: glowIntensity > 0
            ? `0 0 ${glowIntensity}px #f9731680, inset 0 -${fillPercent / 5}px ${fillPercent / 3}px #f9731640`
            : 'inset 0 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Bar shape outline (engraved in mold) */}
        <div
          className="absolute inset-x-2 top-2 bottom-2 rounded-sm border border-gray-500/50"
          style={{
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.1))',
          }}
        />

        {/* Metal fill */}
        <div
          className="absolute bottom-0 left-0 right-0 transition-all duration-100"
          style={{
            height: `${fillPercent}%`,
            background: isComplete
              ? `linear-gradient(to top, ${barInfo?.color ?? '#fbbf24'}cc, ${barInfo?.color ?? '#fbbf24'})`
              : 'linear-gradient(to top, #ea580c, #f97316, #fbbf24)',
            boxShadow: isComplete
              ? `inset 0 2px 4px rgba(255,255,255,0.3)`
              : `0 0 ${10 + fillPercent / 5}px #f9731680`,
          }}
        >
          {/* Surface shine on molten metal */}
          {!isComplete && fillProgress > 0.1 && (
            <div
              className="absolute top-0 inset-x-2 h-1"
              style={{
                background: 'linear-gradient(to bottom, rgba(255,255,200,0.6), transparent)',
                animation: 'surface-shimmer 1s ease-in-out infinite',
              }}
            />
          )}

          {/* Bubbles when hot and filling */}
          {!isComplete && isPouring && (
            <div className="absolute inset-0 overflow-hidden">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-1.5 h-1.5 bg-yellow-300/60 rounded-full"
                  style={{
                    left: `${20 + i * 25}%`,
                    animation: `bubble-rise ${0.6 + i * 0.2}s ease-in-out infinite`,
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Spill effect */}
        {spillAmount > 0 && (
          <>
            <div
              className="absolute -bottom-2 -right-2 w-10 h-6 rounded-full"
              style={{
                background: 'radial-gradient(ellipse, #f97316 0%, transparent 70%)',
                transform: `scale(${spillAmount})`,
                opacity: 0.6,
              }}
            />
            <div
              className="absolute -bottom-1 right-0 text-orange-500 text-sm"
              style={{ animation: 'spill-drip 0.5s ease-out' }}
            >
              💧
            </div>
          </>
        )}

        {/* Complete indicator */}
        {isComplete && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="text-2xl"
              style={{
                animation: 'complete-pop 0.4s ease-out',
                textShadow: '0 0 10px rgba(255,255,255,0.5)',
              }}
            >
              ✓
            </div>
          </div>
        )}

        {/* Cooling steam when complete */}
        {isComplete && (
          <div className="absolute -top-4 inset-x-0 flex justify-center gap-2 pointer-events-none">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-2 bg-gray-300/30 rounded-full"
                style={{
                  animation: 'steam-rise 2s ease-out infinite',
                  animationDelay: `${i * 0.5}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bar info */}
      <div className="text-center mt-2">
        <span className="text-sm">{barInfo?.icon}</span>
        <span className="text-xs text-app-muted ml-1">{barInfo?.name}</span>
      </div>

      {/* Fill percentage */}
      {!isComplete && (
        <div className="text-center text-xs text-app-muted">
          {Math.round(fillPercent)}% filled
        </div>
      )}

      {/* Spill warning */}
      {spillAmount > 0.1 && (
        <div
          className="text-center text-xs text-red-400 font-medium"
          style={{ animation: 'shake 0.3s ease-in-out' }}
        >
          Spilled!
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes pour-wobble {
          0%, 100% { transform: scaleX(1) translateX(0); }
          50% { transform: scaleX(0.8) translateX(1px); }
        }

        @keyframes droplet-fall {
          0% { transform: translateX(-50%) translateY(0) scale(1); opacity: 1; }
          100% { transform: translateX(-50%) translateY(8px) scale(0.5); opacity: 0; }
        }

        @keyframes splash {
          0% { transform: translateX(-50%) scale(0); opacity: 1; }
          50% { transform: translateX(-50%) scale(1); opacity: 0.8; }
          100% { transform: translateX(-50%) scale(0.5); opacity: 0; }
        }

        @keyframes surface-shimmer {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }

        @keyframes bubble-rise {
          0% { transform: translateY(100%) scale(0); opacity: 0; }
          50% { transform: translateY(50%) scale(1); opacity: 0.6; }
          100% { transform: translateY(0%) scale(0.5); opacity: 0; }
        }

        @keyframes steam-rise {
          0% { transform: translateY(0) scale(1); opacity: 0.4; }
          100% { transform: translateY(-20px) scale(2); opacity: 0; }
        }

        @keyframes complete-pop {
          0% { transform: scale(0); }
          60% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }

        @keyframes spill-drip {
          0% { transform: translateY(-5px); opacity: 0; }
          50% { opacity: 1; }
          100% { transform: translateY(5px); opacity: 0; }
        }

        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
      `}</style>
    </div>
  );
}
