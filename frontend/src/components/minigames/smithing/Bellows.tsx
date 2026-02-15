/**
 * Bellows Component
 *
 * Drag up/down to pump and add heat.
 * Features steam particles and visual compression feedback.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import { BELLOWS } from './constants';

interface BellowsProps {
  /** Called when a pump cycle completes */
  onPump: () => void;
  /** Whether pumping is disabled */
  disabled?: boolean;
  /** Whether actively in pumping phase */
  isPumping?: boolean;
}

export function Bellows({ onPump, disabled, isPumping: isActivePhase }: BellowsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [compression, setCompression] = useState(0); // 0 = extended, 1 = compressed
  const [isDragging, setIsDragging] = useState(false);
  const [steamParticles, setSteamParticles] = useState<number[]>([]);
  const steamIdRef = useRef(0);

  // Track pump state
  const pumpStateRef = useRef({
    startY: 0,
    lastDirection: 0 as -1 | 0 | 1, // -1 = up, 0 = none, 1 = down
    cyclePhase: 'up' as 'up' | 'down',
  });

  // Spawn steam particles on pump
  const spawnSteam = useCallback(() => {
    const newIds = [...Array(3)].map(() => steamIdRef.current++);
    setSteamParticles((prev) => [...prev, ...newIds]);

    // Remove after animation
    setTimeout(() => {
      setSteamParticles((prev) => prev.filter((id) => !newIds.includes(id)));
    }, 1500);
  }, []);

  // Handle pointer down
  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (disabled) return;

    e.preventDefault();
    setIsDragging(true);
    pumpStateRef.current.startY = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [disabled]);

  // Handle pointer move
  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isDragging || disabled) return;

    const deltaY = e.clientY - pumpStateRef.current.startY;
    const maxDelta = 100; // Max drag distance in pixels

    // Calculate compression (0 to 1) - negative deltaY (dragging UP) = compression
    const newCompression = Math.max(0, Math.min(1, -deltaY / maxDelta));
    setCompression(newCompression);

    // Detect direction change for pump cycle
    // direction: -1 = dragging up (compressing), 1 = dragging down (releasing)
    const direction = deltaY > 10 ? 1 : deltaY < -10 ? -1 : 0;

    if (direction !== 0 && direction !== pumpStateRef.current.lastDirection) {
      const state = pumpStateRef.current;

      // Complete pump cycle: up (compress) then down (release)
      if (state.cyclePhase === 'up' && direction === -1) {
        // Started pulling up (compressing)
        state.cyclePhase = 'down';
      } else if (state.cyclePhase === 'down' && direction === 1) {
        // Pushed back down (released) - complete cycle!
        state.cyclePhase = 'up';
        onPump();
        spawnSteam();
      }

      state.lastDirection = direction;
    }
  }, [isDragging, disabled, onPump, spawnSteam]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setCompression(0);
    pumpStateRef.current = {
      startY: 0,
      lastDirection: 0,
      cyclePhase: 'up',
    };
  }, []);

  // Attach native event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [handlePointerDown, handlePointerMove, handlePointerUp]);

  // Calculate visual dimensions
  const height = BELLOWS.maxHeight - compression * (BELLOWS.maxHeight - BELLOWS.minHeight);

  return (
    <div
      ref={containerRef}
      className={`
        relative select-none touch-none
        ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
      `}
      style={{ width: 70 }}
    >
      {/* Label */}
      <div className="text-xs text-app-muted text-center mb-1">
        Bellows
      </div>

      {/* Bellows body */}
      <div className="relative flex flex-col items-center">
        {/* Handle */}
        <div
          className={`
            relative w-10 h-5 rounded-t-lg border-2 transition-colors
            flex items-center justify-center z-10
            ${isDragging ? 'bg-amber-600 border-amber-500' : 'bg-amber-700 border-amber-600'}
            ${!disabled && isActivePhase ? 'animate-bounce' : ''}
          `}
          style={{
            animationDuration: '2s',
            animationIterationCount: isDragging ? '0' : 'infinite',
          }}
        >
          {/* Handle grip */}
          <div className="w-6 h-1.5 bg-amber-500 rounded" />
        </div>

        {/* Top plate */}
        <div className="w-14 h-2 bg-amber-800 rounded-sm -mt-0.5" />

        {/* Accordion section */}
        <div
          className="w-12 transition-all duration-75 overflow-hidden"
          style={{
            height: height,
          }}
        >
          {/* Leather pleats */}
          <div className="h-full flex flex-col justify-evenly">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="relative"
                style={{
                  height: `${100 / 5}%`,
                }}
              >
                <div
                  className="absolute inset-x-0 h-full bg-amber-900"
                  style={{
                    clipPath: i % 2 === 0
                      ? 'polygon(5% 0%, 95% 0%, 100% 100%, 0% 100%)'
                      : 'polygon(0% 0%, 100% 0%, 95% 100%, 5% 100%)',
                  }}
                />
                <div className="absolute inset-x-1 h-0.5 top-1/2 bg-amber-950 rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom plate */}
        <div className="w-10 h-2 bg-amber-800 rounded-b" />

        {/* Nozzle */}
        <div className="absolute bottom-1 -left-4 flex items-center">
          <div className="w-5 h-3 bg-amber-700 rounded-l" />
          <div className="w-2 h-2 bg-gray-600 rounded-full -ml-1" />

          {/* Steam particles */}
          {steamParticles.map((id) => (
            <div
              key={id}
              className="absolute -left-2"
              style={{
                animation: 'steam-puff 1.5s ease-out forwards',
              }}
            >
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="absolute w-3 h-3 rounded-full bg-gray-300/40"
                  style={{
                    animation: `steam-particle 1.5s ease-out forwards`,
                    animationDelay: `${i * 0.1}s`,
                    left: `${-8 - i * 4}px`,
                    top: `${-2 + (i - 1) * 4}px`,
                  }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Air puff indicator when compressed */}
        {compression > 0.5 && (
          <div
            className="absolute bottom-1 -left-8 text-gray-400 text-lg"
            style={{
              animation: 'puff-out 0.3s ease-out',
              opacity: compression - 0.5,
            }}
          >
            💨
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="text-[10px] text-app-muted text-center mt-2">
        {disabled ? 'Wait...' : isDragging ? 'Push & Pull!' : 'Drag to pump'}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes steam-particle {
          0% {
            transform: translate(0, 0) scale(0.5);
            opacity: 0.6;
          }
          100% {
            transform: translate(-30px, -15px) scale(1.5);
            opacity: 0;
          }
        }

        @keyframes puff-out {
          0% {
            transform: translateX(0) scale(1);
            opacity: 0.8;
          }
          100% {
            transform: translateX(-10px) scale(1.2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
