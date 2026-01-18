/**
 * EnemyDisplay Component
 *
 * Shows the enemy with:
 * - Attack timer bar on the left (fills with red, lerps between ticks)
 * - Enemy icon in the center
 * - Enemy HP bar below
 * - Sword swing animation when player attacks
 */

import { memo } from 'react';
import { Skull, Ghost, Sword } from 'lucide-react';
import type { EnemyDefinition } from '../../../data/combat';
import { TICK_MS } from '../../../data/combat';
import { SWORD_SWING_MS } from './constants';

/** CSS for sword swing animation */
export const EnemyDisplayStyles = `
  @keyframes swordSwing {
    0% {
      transform: rotate(-45deg) translateX(-20px);
      opacity: 0;
    }
    30% {
      opacity: 1;
    }
    100% {
      transform: rotate(45deg) translateX(20px);
      opacity: 0;
    }
  }
  .sword-swing {
    animation: swordSwing ${SWORD_SWING_MS}ms ease-out forwards;
  }
`;

/** Map enemy IDs to lucide icons */
const ENEMY_ICONS: Record<string, React.ReactNode> = {
  skeleton: <Skull className="w-16 h-16 text-gray-200" />,
  goblin: <Skull className="w-16 h-16 text-green-400" />,
  orc: <Skull className="w-16 h-16 text-red-400" />,
  wraith: <Ghost className="w-16 h-16 text-purple-400" />,
};

interface EnemyDisplayProps {
  enemy: EnemyDefinition;
  currentHp: number;
  attackProgress: number; // 0-1, how full the attack bar is
  isAttacking?: boolean; // Flash when attack lands
  isPlayerAttacking?: boolean; // Show sword swing when player attacks
  playerAttackKey?: number; // Key to trigger new sword animation
}

export const EnemyDisplay = memo(function EnemyDisplay({
  enemy,
  currentHp,
  attackProgress,
  isAttacking = false,
  isPlayerAttacking = false,
  playerAttackKey = 0,
}: EnemyDisplayProps) {
  const hpPercent = (currentHp / enemy.health) * 100;

  // Lerp duration slightly shorter than tick for smooth animation
  const lerpDuration = TICK_MS - 50;

  // Get lucide icon or fallback to emoji
  const enemyIcon = ENEMY_ICONS[enemy.id] ?? (
    <span className="text-6xl">{enemy.icon}</span>
  );

  return (
    <div className="flex items-center justify-center gap-4 h-full px-4">
      {/* Attack Timer Bar (left side) - lerps smoothly between tick positions */}
      <div className="w-4 h-32 bg-app-tertiary rounded-full overflow-hidden flex flex-col-reverse">
        <div
          className={`w-full ${isAttacking ? 'bg-red-300' : 'bg-red-500'}`}
          style={{
            height: `${attackProgress * 100}%`,
            transition: isAttacking ? 'none' : `height ${lerpDuration}ms linear`,
          }}
        />
      </div>

      {/* Enemy Display (center) */}
      <div className="flex flex-col items-center gap-2 relative">
        {/* Enemy Icon */}
        <div
          className={`transition-all duration-100 ${
            isAttacking ? 'scale-110 animate-pulse' : ''
          }`}
        >
          {enemyIcon}
        </div>

        {/* Sword swing overlay */}
        {isPlayerAttacking && (
          <div
            key={playerAttackKey}
            className="absolute top-0 left-1/2 -translate-x-1/2 sword-swing"
          >
            <Sword className="w-10 h-10 text-yellow-400" />
          </div>
        )}

        {/* Enemy Name */}
        <div className="text-app-primary font-medium">{enemy.name}</div>

        {/* HP Bar */}
        <div className="w-32 h-3 bg-app-tertiary rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-200"
            style={{ width: `${hpPercent}%` }}
          />
        </div>

        {/* HP Text */}
        <div className="text-app-muted text-sm">
          {currentHp} / {enemy.health}
        </div>
      </div>

      {/* Spacer to balance the attack bar */}
      <div className="w-4" />
    </div>
  );
});
