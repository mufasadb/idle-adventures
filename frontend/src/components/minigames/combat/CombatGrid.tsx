/**
 * CombatGrid Component
 *
 * 4x4 grid for combat movement and attack visualization.
 * - Shows player position
 * - Shows attack indicators (tetris-like shapes with dots)
 * - Dots pulse lightly on ticks, LARGE when attack lands
 * - Handles click to move with native pointer events for responsiveness
 *
 * TIMING: Uses native pointer events to bypass React's event delegation.
 */

import { memo, useRef, useEffect } from 'react';
import { Shield } from 'lucide-react';
import { GRID_SIZE } from '../../../data/combat';
import { CELL_SIZE, CELL_GAP } from './constants';

/** CSS for attack dot animations */
export const CombatGridStyles = `
  @keyframes dotTickPulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.3); }
    100% { transform: scale(1); }
  }
  @keyframes dotAttackPulse {
    0% { transform: scale(1); }
    30% { transform: scale(2.5); }
    100% { transform: scale(1); opacity: 0.5; }
  }
  .dot-tick-pulse {
    animation: dotTickPulse 150ms ease-out;
  }
  .dot-attack-pulse {
    animation: dotAttackPulse 300ms ease-out;
  }
`;

interface CombatGridProps {
  playerPosition: { x: number; y: number };
  attackTiles: Array<{ x: number; y: number }>;
  onTileClick: (x: number, y: number) => void;
  disabled?: boolean;
  /** Current tick count - changes trigger dot pulse */
  tickCount?: number;
  /** When true, dots do LARGE pulse (attack landing) */
  isAttacking?: boolean;
}

export const CombatGrid = memo(function CombatGrid({
  playerPosition,
  attackTiles,
  onTileClick,
  disabled = false,
  tickCount = 0,
  isAttacking = false,
}: CombatGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Create attack tile lookup for O(1) check
  const attackTileSet = new Set(attackTiles.map(t => `${t.x},${t.y}`));

  const gridSize = GRID_SIZE * CELL_SIZE + (GRID_SIZE - 1) * CELL_GAP;

  // Use refs to avoid stale closures in event handler
  const onTileClickRef = useRef(onTileClick);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    onTileClickRef.current = onTileClick;
    disabledRef.current = disabled;
  }, [onTileClick, disabled]);

  // Native pointer event handler for fast input response
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (disabledRef.current) return;

      const target = e.target as HTMLElement;
      const tile = target.closest('[data-tile]') as HTMLElement | null;
      if (!tile) return;

      const x = parseInt(tile.dataset.x ?? '0', 10);
      const y = parseInt(tile.dataset.y ?? '0', 10);

      onTileClickRef.current(x, y);
    };

    grid.addEventListener('pointerdown', handlePointerDown);

    return () => {
      grid.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  return (
    <div
      ref={gridRef}
      className="grid gap-1 mx-auto select-none touch-none"
      style={{
        gridTemplateColumns: `repeat(${GRID_SIZE}, ${CELL_SIZE}px)`,
        width: gridSize,
      }}
    >
      {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => {
        const x = index % GRID_SIZE;
        const y = Math.floor(index / GRID_SIZE);
        const isPlayer = playerPosition.x === x && playerPosition.y === y;
        const isAttack = attackTileSet.has(`${x},${y}`);

        return (
          <div
            key={`${x},${y}`}
            data-tile
            data-x={x}
            data-y={y}
            className={`
              relative flex items-center justify-center cursor-pointer
              rounded-lg border-2 transition-all duration-100
              ${isAttack ? 'border-red-500 bg-red-500/30' : 'border-app bg-app-secondary'}
              ${!disabled && 'hover:border-accent hover:bg-app-tertiary active:scale-95'}
              ${disabled && 'cursor-not-allowed opacity-60'}
            `}
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
          >
            {/* Attack indicator dot - pulses on ticks, LARGE on attack */}
            {isAttack && !isPlayer && (
              <div
                key={isAttacking ? 'attack' : `tick-${tickCount}`}
                className={`absolute w-3 h-3 rounded-full bg-red-500 ${
                  isAttacking ? 'dot-attack-pulse' : 'dot-tick-pulse'
                }`}
              />
            )}

            {/* Player icon */}
            {isPlayer && (
              <Shield
                className={`w-8 h-8 text-blue-400 ${isAttack ? 'animate-pulse text-red-400' : ''}`}
                style={{ filter: isAttack ? 'drop-shadow(0 0 8px red)' : undefined }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
});
