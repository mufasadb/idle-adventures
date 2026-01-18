/**
 * PlayerHpDisplay Component
 *
 * Shows the player's HP with:
 * - HP bar that shrinks when damaged
 * - "Falling" chunk animation when HP is lost
 */

import { memo, useState, useEffect, useRef } from 'react';
import { Heart } from 'lucide-react';
import { PLAYER_COMBAT } from '../../../data/combat';

/** CSS for HP falling animation */
export const PlayerHpStyles = `
  @keyframes hpFall {
    0% {
      transform: translateY(0);
      opacity: 1;
    }
    100% {
      transform: translateY(20px);
      opacity: 0;
    }
  }
  .hp-falling {
    animation: hpFall 400ms ease-in forwards;
  }
`;

interface PlayerHpDisplayProps {
  currentHp: number;
  maxHp?: number;
  isDamaged?: boolean; // Flash when taking damage
}

export const PlayerHpDisplay = memo(function PlayerHpDisplay({
  currentHp,
  maxHp = PLAYER_COMBAT.maxHp,
  isDamaged = false,
}: PlayerHpDisplayProps) {
  const hpPercent = (currentHp / maxHp) * 100;

  // Track previous HP for falling animation
  const prevHpRef = useRef(currentHp);
  const [fallingChunk, setFallingChunk] = useState<{ width: number; left: number } | null>(null);

  useEffect(() => {
    if (currentHp < prevHpRef.current) {
      // HP decreased - show falling chunk
      const lostHp = prevHpRef.current - currentHp;
      const chunkWidth = (lostHp / maxHp) * 100;
      const chunkLeft = (currentHp / maxHp) * 100;

      setFallingChunk({ width: chunkWidth, left: chunkLeft });

      // Clear after animation
      const timer = setTimeout(() => setFallingChunk(null), 400);
      prevHpRef.current = currentHp;
      return () => clearTimeout(timer);
    }
    prevHpRef.current = currentHp;
  }, [currentHp, maxHp]);

  // Color based on HP percentage
  const getHpColor = () => {
    if (hpPercent <= 20) return 'bg-red-500';
    if (hpPercent <= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-app-secondary transition-all duration-100 ${
        isDamaged ? 'ring-2 ring-red-500 bg-red-500/20' : ''
      }`}
    >
      <Heart className="w-5 h-5 text-red-500 fill-red-500" />
      <div className="relative w-24 h-3 bg-app-tertiary rounded-full overflow-visible">
        {/* Current HP bar */}
        <div
          className={`h-full rounded-full transition-all duration-150 ${getHpColor()}`}
          style={{ width: `${hpPercent}%` }}
        />

        {/* Falling chunk when damaged */}
        {fallingChunk && (
          <div
            className="absolute top-0 h-full bg-red-400 rounded-full hp-falling"
            style={{
              width: `${fallingChunk.width}%`,
              left: `${fallingChunk.left}%`,
            }}
          />
        )}
      </div>
      <span className="text-app-primary text-sm font-medium min-w-[3rem]">
        {currentHp}/{maxHp}
      </span>
    </div>
  );
});
