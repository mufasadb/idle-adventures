/**
 * Crucible Component
 *
 * Container for ores being smelted.
 * Shows current contents, glows when heated, tilts when pouring.
 */

import { useMemo } from 'react';
import { ORE_INFO, type OreType } from '../../../data/smithing';

// Pre-generate stable random values for bubble animations
function generateBubbleConfig(count: number) {
  return Array.from({ length: count }, () => ({
    width: 3 + Math.random() * 2,
    height: 3 + Math.random() * 2,
    animationDuration: 0.8 + Math.random() * 0.5,
  }));
}

interface CrucibleProps {
  contents: Map<OreType, number>;
  heat: number;
  isPouring?: boolean;
  pourProgress?: number;  // 0-1
}

export function Crucible({ contents, heat, isPouring, pourProgress = 0 }: CrucibleProps) {
  const hasContents = contents.size > 0;
  const isMolten = heat > 60;
  const glowIntensity = Math.max(0, (heat - 40) / 2);

  // Stable bubble config - only regenerate when count changes
  const bubbleCount = Math.min(4, Math.floor(heat / 25));
  const bubbleConfig = useMemo(() => generateBubbleConfig(bubbleCount), [bubbleCount]);

  // Calculate pour tilt
  const tiltAngle = isPouring ? 45 * pourProgress : 0;

  return (
    <div
      className="relative transition-transform duration-150"
      style={{
        transform: `rotate(${tiltAngle}deg)`,
        transformOrigin: 'bottom right',
      }}
    >
      {/* Crucible body */}
      <div
        className="w-14 h-11 rounded-b-xl relative overflow-hidden transition-all duration-300"
        style={{
          background: 'linear-gradient(to bottom, #52525b, #3f3f46)',
          border: '2px solid #71717a',
          boxShadow: isMolten
            ? `0 0 ${glowIntensity}px #f97316,
               inset 0 0 ${glowIntensity / 2}px #f9731680`
            : 'inset 0 2px 4px rgba(0,0,0,0.3)',
        }}
      >
        {/* Lip/rim */}
        <div
          className="absolute -top-0.5 -left-0.5 -right-0.5 h-2 rounded-t"
          style={{
            background: 'linear-gradient(to bottom, #71717a, #52525b)',
            borderBottom: '1px solid #3f3f46',
          }}
        />

        {/* Pour spout */}
        <div
          className="absolute -top-1 -right-1 w-3 h-2"
          style={{
            background: '#71717a',
            clipPath: 'polygon(0% 100%, 100% 100%, 70% 0%)',
          }}
        />

        {/* Contents */}
        {hasContents && (
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-200"
            style={{
              height: `${Math.min(85, 40 + contents.size * 12)}%`,
              background: isMolten
                ? 'linear-gradient(to top, #ea580c, #f97316, #fbbf24)'
                : 'linear-gradient(to top, #57534e, #78716c)',
              borderTop: isMolten ? '2px solid #fbbf24' : 'none',
            }}
          >
            {/* Surface effects when molten */}
            {isMolten && (
              <>
                {/* Surface glow */}
                <div
                  className="absolute top-0 inset-x-1 h-1"
                  style={{
                    background: 'linear-gradient(to bottom, rgba(255,230,150,0.8), transparent)',
                    animation: 'shimmer 0.8s ease-in-out infinite',
                  }}
                />

                {/* Bubbles */}
                <div className="absolute inset-0 overflow-hidden">
                  {bubbleConfig.map((config, i) => (
                    <div
                      key={i}
                      className="absolute bg-yellow-300 rounded-full"
                      style={{
                        width: `${config.width}px`,
                        height: `${config.height}px`,
                        left: `${15 + i * 20}%`,
                        animation: `bubble ${config.animationDuration}s ease-in-out infinite`,
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Handle */}
        <div
          className="absolute -right-2.5 top-2 w-3 h-5 rounded-r"
          style={{
            background: 'linear-gradient(to right, #52525b, #3f3f46)',
            border: '1px solid #71717a',
            borderLeft: 'none',
          }}
        />
      </div>

      {/* Pour stream when tilting */}
      {isPouring && pourProgress > 0.3 && (
        <div className="absolute -right-1 -bottom-8 pointer-events-none">
          <div
            className="w-1 bg-gradient-to-b from-yellow-400 to-orange-500"
            style={{
              height: `${20 + pourProgress * 30}px`,
              boxShadow: '0 0 8px #f97316',
              animation: 'pour-stream 0.2s ease-in-out infinite',
              transformOrigin: 'top center',
            }}
          />
        </div>
      )}

      {/* Contents label */}
      {hasContents && !isPouring && (
        <div className="absolute -bottom-4 left-0 right-0 text-center">
          <div className="text-[10px] text-app-muted flex justify-center gap-0.5">
            {Array.from(contents.entries()).map(([oreId, count]) => (
              <span
                key={oreId}
                className={`transition-all duration-300 ${isMolten ? 'text-orange-300' : ''}`}
              >
                {ORE_INFO[oreId]?.icon}{count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CSS Animations */}
      <style>{`
        @keyframes shimmer {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }

        @keyframes bubble {
          0%, 100% {
            transform: translateY(100%) scale(0);
            opacity: 0;
          }
          50% {
            transform: translateY(50%) scale(1);
            opacity: 0.7;
          }
        }

        @keyframes pour-stream {
          0%, 100% { transform: scaleX(1); }
          50% { transform: scaleX(0.8); }
        }
      `}</style>
    </div>
  );
}
