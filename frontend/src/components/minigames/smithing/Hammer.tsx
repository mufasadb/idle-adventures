/**
 * Hammer Component
 *
 * Tap to hammer the bar. Shows hit counter, visual feedback, and sparks.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

interface HammerProps {
  /** Required number of hits */
  requiredHits: number;
  /** Current hit count */
  currentHits: number;
  /** Called when hammer is tapped */
  onHit: () => void;
  /** Whether hammering is disabled */
  disabled?: boolean;
}

export function Hammer({ requiredHits, currentHits, onHit, disabled }: HammerProps) {
  const [isSwinging, setIsSwinging] = useState(false);
  const [sparks, setSparks] = useState<{ id: number; x: number; y: number; angle: number }[]>([]);
  const [impactRing, setImpactRing] = useState(false);
  const sparkIdRef = useRef(0);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback(() => {
    if (disabled || currentHits >= requiredHits) return;

    // Trigger swing animation
    setIsSwinging(true);
    setTimeout(() => setIsSwinging(false), 150);

    // Show impact ring
    setImpactRing(true);
    setTimeout(() => setImpactRing(false), 200);

    // Add sparks in a burst pattern
    const newSparks = [...Array(6)].map((_, i) => ({
      id: sparkIdRef.current++,
      x: Math.random() * 30 - 15,
      y: Math.random() * -20 - 10,
      angle: (i / 6) * 360 + Math.random() * 30,
    }));
    setSparks((prev) => [...prev, ...newSparks]);

    // Remove sparks after animation
    setTimeout(() => {
      setSparks((prev) => prev.filter((s) => !newSparks.find((n) => n.id === s.id)));
    }, 400);

    onHit();
  }, [disabled, currentHits, requiredHits, onHit]);

  // Native event listener for responsiveness
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    const handler = (e: PointerEvent) => {
      e.preventDefault();
      handleClick();
    };

    button.addEventListener('pointerdown', handler);
    return () => button.removeEventListener('pointerdown', handler);
  }, [handleClick]);

  const isComplete = currentHits >= requiredHits;

  return (
    <div className="relative flex flex-col items-center">
      {/* Label */}
      <div className="text-xs text-app-muted mb-2">
        {isComplete ? 'Done!' : 'Hammer'}
      </div>

      {/* Hit counter */}
      <div className="text-sm mb-2 font-mono">
        <span className={currentHits > 0 ? 'text-amber-400' : 'text-app-muted'}>
          {currentHits}
        </span>
        <span className="text-app-muted">/{requiredHits}</span>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1 mb-2">
        {[...Array(requiredHits)].map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all duration-200 ${
              i < currentHits
                ? 'bg-amber-400 shadow-sm shadow-amber-400/50'
                : 'bg-gray-600'
            }`}
            style={{
              transform: i === currentHits - 1 && isSwinging ? 'scale(1.5)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      {/* Hammer button */}
      <button
        ref={buttonRef}
        disabled={disabled || isComplete}
        className={`
          relative w-20 h-20 rounded-xl
          flex items-center justify-center
          transition-all duration-100
          select-none touch-none
          ${isComplete
            ? 'bg-gradient-to-b from-green-700 to-green-900 cursor-default'
            : disabled
              ? 'bg-gradient-to-b from-gray-600 to-gray-700 cursor-not-allowed opacity-50'
              : 'bg-gradient-to-b from-amber-700 to-amber-900 hover:from-amber-600 hover:to-amber-800 active:from-amber-800 active:to-amber-950 cursor-pointer'
          }
        `}
        style={{
          transform: isSwinging
            ? 'rotate(-20deg) scale(0.92) translateY(4px)'
            : 'rotate(0deg) scale(1)',
          boxShadow: isComplete
            ? '0 4px 12px rgba(34, 197, 94, 0.3)'
            : disabled
              ? 'none'
              : '0 4px 12px rgba(217, 119, 6, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        {/* Hammer icon with rotation animation */}
        <span
          className="text-4xl transition-transform duration-75"
          style={{
            transform: isSwinging ? 'rotate(-15deg) scale(1.1)' : 'rotate(0deg)',
            filter: isSwinging ? 'brightness(1.3)' : 'brightness(1)',
          }}
        >
          🔨
        </span>

        {/* Impact ring effect */}
        {impactRing && (
          <div
            className="absolute inset-0 rounded-xl border-4 border-yellow-400 pointer-events-none"
            style={{
              animation: 'impact-ring 0.2s ease-out forwards',
            }}
          />
        )}

        {/* Sparks */}
        {sparks.map((spark) => (
          <div
            key={spark.id}
            className="absolute w-2 h-2 pointer-events-none"
            style={{
              left: `calc(50% + ${spark.x}px)`,
              top: `calc(50% + ${spark.y}px)`,
              animation: 'spark-fly 0.4s ease-out forwards',
              transform: `rotate(${spark.angle}deg)`,
            }}
          >
            <div
              className="w-full h-full bg-yellow-300 rounded-full"
              style={{
                boxShadow: '0 0 6px #fbbf24, 0 0 12px #f97316',
              }}
            />
          </div>
        ))}

        {/* Complete checkmark */}
        {isComplete && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-green-800/80 rounded-xl"
            style={{
              animation: 'complete-fade 0.3s ease-out',
            }}
          >
            <span
              className="text-4xl text-green-400"
              style={{
                animation: 'checkmark-pop 0.4s ease-out',
                textShadow: '0 0 20px rgba(74, 222, 128, 0.5)',
              }}
            >
              ✓
            </span>
          </div>
        )}
      </button>

      {/* Anvil base visual */}
      <div className="relative mt-1">
        <div
          className="w-24 h-3 rounded-b"
          style={{
            background: 'linear-gradient(to bottom, #52525b, #3f3f46)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)',
          }}
        />
        {/* Glow when hitting */}
        {isSwinging && (
          <div
            className="absolute inset-0 rounded-b"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.4), transparent)',
            }}
          />
        )}
      </div>

      {/* Instructions */}
      <div className="text-[10px] text-app-muted mt-2">
        {isComplete
          ? 'Hammering complete'
          : disabled
            ? 'Wait for metal...'
            : 'Tap to hammer'}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes spark-fly {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-30px) translateX(var(--spark-x, 0)) scale(0.3);
            opacity: 0;
          }
        }

        @keyframes impact-ring {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }

        @keyframes complete-fade {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }

        @keyframes checkmark-pop {
          0% { transform: scale(0); }
          60% { transform: scale(1.3); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
