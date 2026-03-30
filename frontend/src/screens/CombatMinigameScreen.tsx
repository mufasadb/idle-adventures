/**
 * CombatMinigameScreen
 *
 * 4x4 grid-based combat minigame.
 * - Dodge enemy AoE attacks (tetris-like shapes)
 * - Auto-attack enemy on tick intervals
 * - Survive to win and earn gold
 *
 * All timing based on tick system (1 tick = 600ms).
 * See docs/combat.md for full documentation.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { expeditionExecutionStore } from '../../engine/expeditionExecutionStore';
import { sessionStore } from '../../stores/sessionStore';
import {
  TICK_MS,
  PLAYER_COMBAT,
  PLAYER_START,
  getEnemyForTier,
  generateAttackPattern,
  getMoveDirection,
  isInBounds,
  type EnemyDefinition,
} from '../../data/combat';
import { Trophy, Skull, Coins } from 'lucide-react';
import {
  CombatGrid,
  CombatGridStyles,
  EnemyDisplay,
  EnemyDisplayStyles,
  PlayerHpDisplay,
  PlayerHpStyles,
} from '../minigames/combat';

type CombatPhase = 'intro' | 'playing' | 'victory' | 'defeat';

export const CombatMinigameScreen = observer(() => {
  const { pendingMinigame } = expeditionExecutionStore;

  // Get enemy based on map tier
  const enemy = useMemo<EnemyDefinition>(() => {
    const tier = sessionStore.expedition?.map.tier ?? 1;
    return getEnemyForTier(tier);
  }, []);

  // Game phase
  const [phase, setPhase] = useState<CombatPhase>('intro');

  // Player state
  const [playerPos, setPlayerPos] = useState(PLAYER_START);
  const [playerHp, setPlayerHp] = useState(sessionStore.combatHp);
  const [isDamaged, setIsDamaged] = useState(false);

  // Enemy state
  const [enemyHp, setEnemyHp] = useState(enemy.health);
  const [attackProgress, setAttackProgress] = useState(0);
  const [attackTiles, setAttackTiles] = useState<Array<{ x: number; y: number }>>([]);
  const [isAttacking, setIsAttacking] = useState(false);
  const [tickCount, setTickCount] = useState(0);

  // Player attack state (for sword swing animation)
  const [isPlayerAttacking, setIsPlayerAttacking] = useState(false);
  const [playerAttackKey, setPlayerAttackKey] = useState(0);

  // Queued movement (player clicked a tile)
  const queuedMoveRef = useRef<{ x: number; y: number } | null>(null);

  // Timing refs
  const gameLoopRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);
  const playerAttackTickRef = useRef<number>(0);
  const enemyAttackTickRef = useRef<number>(0);
  const tickCountRef = useRef<number>(0);

  // Refs for rAF-based delays (instead of setTimeout)
  const damageFlashRef = useRef<number | null>(null);
  const attackPatternRef = useRef<number | null>(null);
  const playerAttackRef = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
      if (damageFlashRef.current) {
        cancelAnimationFrame(damageFlashRef.current);
      }
      if (attackPatternRef.current) {
        cancelAnimationFrame(attackPatternRef.current);
      }
      if (playerAttackRef.current) {
        cancelAnimationFrame(playerAttackRef.current);
      }
    };
  }, []);

  // Start the fight
  const handleStart = useCallback(() => {
    lastTickRef.current = performance.now();
    playerAttackTickRef.current = 0;
    enemyAttackTickRef.current = 0;
    tickCountRef.current = 0;

    // Generate first attack pattern
    setAttackTiles(generateAttackPattern(enemy));

    setPhase('playing');
  }, [enemy]);

  // Handle auto-combat
  const handleAutoCombat = useCallback(() => {
    // Auto-combat always deals 3 damage
    const survived = sessionStore.takeDamage(PLAYER_COMBAT.autoCombatDamage);

    if (!survived) {
      setPhase('defeat');
    } else {
      // Add gold reward
      sessionStore.addToBag('gold', enemy.goldReward);
      setPhase('victory');
    }
  }, [enemy]);

  // Handle tile click (queue movement)
  const handleTileClick = useCallback(
    (x: number, y: number) => {
      if (phase !== 'playing') return;

      // If clicking current position, no movement
      if (x === playerPos.x && y === playerPos.y) {
        queuedMoveRef.current = null;
        return;
      }

      // Queue the move
      queuedMoveRef.current = { x, y };
    },
    [phase, playerPos]
  );

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return;

    const gameLoop = () => {
      const now = performance.now();
      const elapsed = now - lastTickRef.current;

      // Check if a tick has passed
      if (elapsed >= TICK_MS) {
        lastTickRef.current = now;
        tickCountRef.current++;
        setTickCount(tickCountRef.current);

        // === Process Player Movement ===
        if (queuedMoveRef.current) {
          const target = queuedMoveRef.current;
          const newPos = getMoveDirection(playerPos, target);

          if (isInBounds(newPos.x, newPos.y)) {
            setPlayerPos(newPos);

            // Check if we reached the target
            if (newPos.x === target.x && newPos.y === target.y) {
              queuedMoveRef.current = null;
            }
          }
        }

        // === Process Player Attack ===
        playerAttackTickRef.current++;
        if (playerAttackTickRef.current >= PLAYER_COMBAT.attackSpeedTicks) {
          playerAttackTickRef.current = 0;

          // Trigger sword swing animation
          setIsPlayerAttacking(true);
          setPlayerAttackKey(prev => prev + 1);

          // Clear sword swing using rAF-based timing
          const swingStart = performance.now();
          const clearSwing = () => {
            if (performance.now() - swingStart >= 300) {
              setIsPlayerAttacking(false);
            } else {
              playerAttackRef.current = requestAnimationFrame(clearSwing);
            }
          };
          playerAttackRef.current = requestAnimationFrame(clearSwing);

          // Deal damage to enemy
          setEnemyHp(prev => {
            const newHp = prev - PLAYER_COMBAT.damage;
            if (newHp <= 0) {
              // Victory!
              setPhase('victory');
              sessionStore.addToBag('gold', enemy.goldReward);
            }
            return Math.max(0, newHp);
          });
        }

        // === Process Enemy Attack ===
        enemyAttackTickRef.current++;
        const attackDuration = enemy.attackSpeedTicks;
        setAttackProgress(enemyAttackTickRef.current / attackDuration);

        if (enemyAttackTickRef.current >= attackDuration) {
          enemyAttackTickRef.current = 0;
          setAttackProgress(0);
          setIsAttacking(true);

          // Check if player is in attack zone
          const isHit = attackTiles.some(
            tile => tile.x === playerPos.x && tile.y === playerPos.y
          );

          if (isHit) {
            // Player takes damage
            const newHp = playerHp - enemy.damage;
            setPlayerHp(newHp);
            setIsDamaged(true);

            // Update session store
            sessionStore.takeDamage(enemy.damage);

            if (newHp <= 0) {
              // Defeat!
              setPhase('defeat');
              return;
            }

            // Clear damage flash using rAF-based timing
            const damageStart = performance.now();
            const clearDamageFlash = () => {
              if (performance.now() - damageStart >= 200) {
                setIsDamaged(false);
              } else {
                damageFlashRef.current = requestAnimationFrame(clearDamageFlash);
              }
            };
            damageFlashRef.current = requestAnimationFrame(clearDamageFlash);
          }

          // Generate new attack pattern using rAF-based timing
          const patternStart = performance.now();
          const updatePattern = () => {
            if (performance.now() - patternStart >= 150) {
              setAttackTiles(generateAttackPattern(enemy));
              setIsAttacking(false);
            } else {
              attackPatternRef.current = requestAnimationFrame(updatePattern);
            }
          };
          attackPatternRef.current = requestAnimationFrame(updatePattern);
        }
      }

      // Continue loop if still playing
      if (phase === 'playing') {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
      }
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [phase, playerPos, playerHp, attackTiles, enemy]);

  // Handle continue after victory
  const handleContinue = useCallback(() => {
    // Complete the minigame with multiplier of 1 (combat rewards don't scale)
    expeditionExecutionStore.completeMinigame(1);
  }, []);

  // Handle defeat
  const handleDefeat = useCallback(() => {
    // End the expedition
    expeditionExecutionStore.stop();
    sessionStore.endExpedition();
  }, []);

  if (!pendingMinigame) {
    return (
      <div className="h-full flex items-center justify-center bg-app-primary">
        <p className="text-app-muted">No combat pending</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* CSS Animations */}
      <style>{CombatGridStyles}{PlayerHpStyles}{EnemyDisplayStyles}</style>

      {/* Top Section - Enemy Display (1/3 of screen) */}
      <div className="h-1/3 border-b border-app">
        <EnemyDisplay
          enemy={enemy}
          currentHp={enemyHp}
          attackProgress={attackProgress}
          isAttacking={isAttacking}
          isPlayerAttacking={isPlayerAttacking}
          playerAttackKey={playerAttackKey}
        />
      </div>

      {/* Bottom Section - Combat Grid (2/3 of screen) */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4">
        {/* Player HP Display */}
        <PlayerHpDisplay currentHp={playerHp} isDamaged={isDamaged} />

        {/* Combat Grid */}
        <CombatGrid
          playerPosition={playerPos}
          attackTiles={phase === 'playing' ? attackTiles : []}
          onTileClick={handleTileClick}
          disabled={phase !== 'playing'}
          tickCount={tickCount}
          isAttacking={isAttacking}
        />

        {/* Phase-specific controls */}
        {phase === 'intro' && (
          <div className="flex flex-col items-center gap-3 mt-4">
            <button
              onClick={handleStart}
              className="bg-accent hover:bg-accent/90 text-white font-bold py-3 px-8 rounded-lg transition-colors"
            >
              Fight!
            </button>
            <button
              onClick={handleAutoCombat}
              className="text-app-muted hover:text-app-primary text-sm underline transition-colors"
            >
              Auto-combat (take {PLAYER_COMBAT.autoCombatDamage} damage)
            </button>
          </div>
        )}

        {phase === 'playing' && (
          <p className="text-app-muted text-sm text-center">
            Tap tiles to move. Avoid red zones!
          </p>
        )}
      </div>

      {/* Victory Overlay */}
      {phase === 'victory' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
          <div className="text-center mb-6">
            <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-green-400 mb-2">Victory!</h2>
            <p className="text-app-primary text-lg flex items-center justify-center gap-2">
              +{enemy.goldReward} <Coins className="w-5 h-5 text-yellow-400" /> Gold
            </p>
          </div>

          <button
            onClick={handleContinue}
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg transition-colors"
          >
            Continue Expedition
          </button>
        </div>
      )}

      {/* Defeat Overlay */}
      {phase === 'defeat' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
          <div className="text-center mb-6">
            <Skull className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-400 mb-2">Defeated!</h2>
            <p className="text-app-muted">Your expedition has ended.</p>
          </div>

          <button
            onClick={handleDefeat}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-8 rounded-lg transition-colors"
          >
            Return to Town
          </button>
        </div>
      )}
    </div>
  );
});
