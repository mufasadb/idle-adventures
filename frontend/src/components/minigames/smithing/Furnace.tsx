/**
 * Furnace Component
 *
 * Visual furnace that glows based on heat level.
 * Features animated flames and heat-based glow effects.
 */

import { useMemo, useRef } from 'react';
import { getFurnaceColor, HEAT_THRESHOLDS } from './constants';

// Pre-generate stable random values for animations
function generateFlameConfig(count: number) {
  return Array.from({ length: count }, () => ({
    animationDuration: 0.3 + Math.random() * 0.3,
    width: 6 + Math.random() * 4,
    heightVariation: Math.random() * 8,
  }));
}

function generateSparkConfig(count: number) {
  return Array.from({ length: count }, () => ({
    left: 30 + Math.random() * 40,
    animationDuration: 1 + Math.random(),
  }));
}

interface FurnaceProps {
  heat: number;
  children?: React.ReactNode;
}

export function Furnace({ heat, children }: FurnaceProps) {
  const glowColor = getFurnaceColor(heat);
  const glowIntensity = Math.min(40, heat / 2);

  // Determine heat state for animations
  const heatState = useMemo(() => {
    if (heat >= HEAT_THRESHOLDS.blazing) return 'blazing';
    if (heat >= HEAT_THRESHOLDS.hot) return 'hot';
    if (heat >= HEAT_THRESHOLDS.warm) return 'warm';
    return 'cold';
  }, [heat]);

  // Number of flame elements based on heat
  const flameCount = heat > 20 ? Math.min(5, Math.floor(heat / 15)) : 0;

  // Stable random configs - regenerate only when count changes
  const flameConfigRef = useRef<ReturnType<typeof generateFlameConfig>>([]);
  const sparkConfigRef = useRef<ReturnType<typeof generateSparkConfig>>([]);

  // Update configs when counts change
  const flameConfig = useMemo(() => {
    if (flameConfigRef.current.length !== flameCount) {
      flameConfigRef.current = generateFlameConfig(flameCount);
    }
    return flameConfigRef.current;
  }, [flameCount]);

  const sparkConfig = useMemo(() => {
    const sparkCount = heat > 50 ? 3 : 0;
    if (sparkConfigRef.current.length !== sparkCount) {
      sparkConfigRef.current = generateSparkConfig(sparkCount);
    }
    return sparkConfigRef.current;
  }, [heat > 50]);

  return (
    <div
      className={`
        relative w-36 h-32 rounded-lg overflow-visible transition-all duration-300
        ${heatState === 'blazing' ? 'animate-pulse' : ''}
      `}
      style={{
        background: `linear-gradient(to bottom, #2a2a2a, #1a1a1a)`,
        boxShadow: heat > 20
          ? `0 0 ${glowIntensity}px ${glowColor},
             inset 0 0 ${glowIntensity / 2}px ${glowColor},
             0 ${glowIntensity / 3}px ${glowIntensity}px ${glowColor}40`
          : 'none',
      }}
    >
      {/* Brick texture overlay */}
      <div
        className="absolute inset-0 opacity-20 rounded-lg"
        style={{
          backgroundImage: `repeating-linear-gradient(
            0deg,
            transparent,
            transparent 8px,
            rgba(0,0,0,0.3) 8px,
            rgba(0,0,0,0.3) 9px
          ),
          repeating-linear-gradient(
            90deg,
            transparent,
            transparent 16px,
            rgba(0,0,0,0.2) 16px,
            rgba(0,0,0,0.2) 17px
          )`,
        }}
      />

      {/* Furnace opening */}
      <div className="absolute inset-3 rounded bg-gray-950 flex items-end justify-center overflow-hidden">
        {/* Fire container */}
        <div className="absolute bottom-0 inset-x-0 flex items-end justify-center">
          {/* Animated flames */}
          {flameCount > 0 && (
            <div className="relative flex items-end justify-center gap-0.5">
              {flameConfig.map((config, i) => (
                <div
                  key={i}
                  className="relative"
                  style={{
                    animation: `flame-flicker ${config.animationDuration}s ease-in-out infinite`,
                    animationDelay: `${i * 0.1}s`,
                  }}
                >
                  {/* Flame body */}
                  <div
                    className="rounded-t-full transition-all duration-200"
                    style={{
                      width: `${config.width}px`,
                      height: `${12 + (heat / 100) * 24 + config.heightVariation}px`,
                      background: `linear-gradient(to top,
                        ${glowColor} 0%,
                        #ff6600 30%,
                        #ffcc00 70%,
                        #fff8e0 100%)`,
                      filter: `blur(${heatState === 'blazing' ? 1 : 0}px)`,
                      boxShadow: `0 0 ${4 + heat / 20}px ${glowColor}`,
                    }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Ember glow at base */}
          {heat > 10 && (
            <div
              className="absolute bottom-0 inset-x-2 h-3 rounded-t-sm"
              style={{
                background: `radial-gradient(ellipse at bottom, ${glowColor}80, transparent)`,
                opacity: heat / 100,
              }}
            />
          )}
        </div>

        {/* Spark particles */}
        {heat > 50 && sparkConfig.length > 0 && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {sparkConfig.map((config, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-yellow-300 rounded-full"
                style={{
                  left: `${config.left}%`,
                  animation: `spark-rise ${config.animationDuration}s ease-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Crucible slot - centered above flames */}
        <div className="absolute inset-0 flex items-center justify-center z-10">
          {children}
        </div>
      </div>

      {/* Heat indicator light */}
      <div className="absolute top-2 right-2 w-3 h-3 rounded-full border border-gray-600">
        <div
          className={`w-full h-full rounded-full transition-colors duration-300 ${
            heat > 70 ? 'animate-pulse' : ''
          }`}
          style={{
            backgroundColor: heat > 70 ? '#ef4444' : heat > 40 ? '#f97316' : heat > 10 ? '#422006' : '#1a1a1a',
            boxShadow: heat > 40 ? `0 0 8px ${heat > 70 ? '#ef4444' : '#f97316'}` : 'none',
          }}
        />
      </div>

      {/* Furnace label */}
      <div className="absolute -bottom-5 left-0 right-0 text-center text-[10px] text-gray-500">
        Furnace
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes flame-flicker {
          0%, 100% { transform: scaleY(1) scaleX(1); }
          25% { transform: scaleY(1.1) scaleX(0.9); }
          50% { transform: scaleY(0.9) scaleX(1.1); }
          75% { transform: scaleY(1.05) scaleX(0.95); }
        }

        @keyframes spark-rise {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(-40px) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
