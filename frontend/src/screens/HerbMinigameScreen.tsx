/**
 * HerbMinigameScreen
 *
 * Point Blank-style herb picking minigame for active mode.
 * - Field with flowers (good and bad)
 * - Sun arcs across sky, flowers fade in/out with saturation
 * - 6 seconds to click all good herbs (10 petals)
 * - Bad herbs (8 petals) crumble and fade when clicked
 * - Good herbs pulse and swoosh to bag icon
 * - Reward = 2x number of good herbs * correctPicks
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { expeditionExecutionStore } from '../../engine/expeditionExecutionStore';
import { ITEMS } from '../../data/items';
import { useGameLoop, useAnimationDelay } from '../../hooks';
import {
  GoodHerb,
  BadHerb,
  TargetHerbDisplay,
  GAME_DURATION_MS,
  TOTAL_FLOWERS,
  GOOD_FLOWER_RATIO,
  FLOWER_SIZE,
  checkOverlap,
  isPointInFlower,
  type Flower,
} from '../minigames/herbs';

export const HerbMinigameScreen = observer(() => {
  const { pendingMinigame } = expeditionExecutionStore;

  // Game phases
  const [phase, setPhase] = useState<'intro' | 'playing' | 'complete'>('intro');
  const [timeRemaining, setTimeRemaining] = useState(GAME_DURATION_MS);
  const [flowers, setFlowers] = useState<Flower[]>([]);
  const [correctPicks, setCorrectPicks] = useState(0);
  const [wrongPicks, setWrongPicks] = useState(0);
  const [collectingFlowers, setCollectingFlowers] = useState<Set<number>>(new Set());

  // Refs for animation and container
  const gameStartRef = useRef<number>(0);
  const fieldRef = useRef<HTMLDivElement>(null);
  const delay = useAnimationDelay();

  // Calculate good flower count and max reward
  const goodFlowerCount = useMemo(() => {
    return Math.max(3, Math.floor(TOTAL_FLOWERS * GOOD_FLOWER_RATIO));
  }, []);

  // Generate flowers on mount with collision detection
  useEffect(() => {
    // Use approximate container size for collision detection
    // Actual size will vary but this gives reasonable spacing
    const containerWidth = 400;
    const containerHeight = 400;

    const newFlowers: Flower[] = [];
    const goodCount = goodFlowerCount;
    const badCount = TOTAL_FLOWERS - goodCount;

    // Helper to find a valid position with max attempts
    const findValidPosition = (
      isGood: boolean,
      existingFlowers: Flower[],
      maxAttempts = 50
    ): { x: number; y: number; scale: number } | null => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = {
          x: 8 + Math.random() * 84, // 8-92% to avoid edges
          y: 8 + Math.random() * 84,
          scale: 0.9 + Math.random() * 0.2, // 0.9-1.1 (tighter range)
        };

        // Check overlap with existing flowers
        let hasExcessiveOverlap = false;

        for (const existing of existingFlowers) {
          if (checkOverlap(candidate, existing, containerWidth, containerHeight)) {
            // For good flowers, reject any excessive overlap
            // For bad flowers, only reject if overlapping too much with GOOD flowers
            if (isGood || existing.isGood) {
              hasExcessiveOverlap = true;
              break;
            }
          }
        }

        if (!hasExcessiveOverlap) {
          return candidate;
        }
      }

      return null; // Couldn't find valid position
    };

    // Place GOOD flowers first (they get priority positioning)
    for (let i = 0; i < goodCount; i++) {
      const position = findValidPosition(true, newFlowers);
      if (position) {
        newFlowers.push({
          id: i,
          x: position.x,
          y: position.y,
          isGood: true,
          state: 'active',
          scale: position.scale,
          rotation: -15 + Math.random() * 30,
        });
      }
    }

    // Place BAD flowers (can overlap each other, but not excessively with good ones)
    for (let i = 0; i < badCount; i++) {
      const position = findValidPosition(false, newFlowers, 30);
      if (position) {
        newFlowers.push({
          id: goodCount + i,
          x: position.x,
          y: position.y,
          isGood: false,
          state: 'active',
          scale: position.scale,
          rotation: -15 + Math.random() * 30,
        });
      }
    }

    // Shuffle to randomize render order (but good flowers still placed first)
    for (let i = newFlowers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newFlowers[i], newFlowers[j]] = [newFlowers[j], newFlowers[i]];
    }

    setFlowers(newFlowers);
  }, [goodFlowerCount]);

  // Sun position (0-100%) and saturation based on time
  const sunProgress = useMemo(() => {
    if (phase !== 'playing') return 0;
    return 1 - timeRemaining / GAME_DURATION_MS;
  }, [phase, timeRemaining]);

  // Saturation follows a sharp peak curve - stays dark most of the time
  const saturation = useMemo(() => {
    // Sharp peak: only bright briefly in the middle
    // Using a higher power to make the curve steeper
    const x = sunProgress;
    // Sharper parabola with power of 3 - stays low much longer
    const base = 4 * x * (1 - x);
    // Raise to power and scale to make it peak sharply
    return Math.max(0, Math.min(1, Math.pow(base, 2)));
  }, [sunProgress]);

  // Game timer using useGameLoop hook
  useGameLoop(phase === 'playing', (now) => {
    const elapsed = now - gameStartRef.current;
    const remaining = Math.max(0, GAME_DURATION_MS - elapsed);
    setTimeRemaining(remaining);

    if (remaining <= 0) {
      setPhase('complete');
      return false; // Stop the loop
    }
  });

  // Start the game
  const handleStart = useCallback(() => {
    gameStartRef.current = performance.now();
    setPhase('playing');
  }, []);

  // Handle field click - prioritizes good flowers over bad ones
  const handleFieldClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (phase !== 'playing') return;

      const field = fieldRef.current;
      if (!field) return;

      // Get click position as percentage of field
      const rect = field.getBoundingClientRect();
      const clickX = ((e.clientX - rect.left) / rect.width) * 100;
      const clickY = ((e.clientY - rect.top) / rect.height) * 100;

      // Find all active flowers under the click point
      const activeFlowers = flowers.filter(f => f.state === 'active');
      const flowersUnderClick = activeFlowers.filter(f =>
        isPointInFlower(clickX, clickY, f, rect.width, rect.height)
      );

      if (flowersUnderClick.length === 0) return;

      // PRIORITY: If any good flower is under the click, select it
      const goodFlower = flowersUnderClick.find(f => f.isGood);
      const selectedFlower = goodFlower ?? flowersUnderClick[0];

      if (selectedFlower.isGood) {
        // Good flower - collect it
        setCollectingFlowers(prev => new Set(prev).add(selectedFlower.id));
        setCorrectPicks(prev => prev + 1);

        // After animation, mark as collected
        delay(500, () => {
          setFlowers(prev =>
            prev.map(f =>
              f.id === selectedFlower.id ? { ...f, state: 'collected' } : f
            )
          );
          setCollectingFlowers(prev => {
            const next = new Set(prev);
            next.delete(selectedFlower.id);
            return next;
          });
        });
      } else {
        // Bad flower - crumble it
        setWrongPicks(prev => prev + 1);
        setFlowers(prev =>
          prev.map(f =>
            f.id === selectedFlower.id ? { ...f, state: 'crumbled' } : f
          )
        );
      }
    },
    [phase, flowers, delay]
  );

  // Calculate final reward
  const calculateReward = useCallback(() => {
    // Base reward = 2x number of good herbs on field
    // Actual reward = base * (correctPicks / goodFlowerCount)
    const baseReward = pendingMinigame?.baseReward.count ?? 10;
    const multiplier = correctPicks / goodFlowerCount;
    return Math.max(1, Math.round(baseReward * 2 * multiplier));
  }, [correctPicks, goodFlowerCount, pendingMinigame]);

  // Handle continue
  const handleContinue = useCallback(() => {
    const multiplier = (correctPicks / goodFlowerCount) * 2;
    expeditionExecutionStore.completeMinigame(multiplier);
  }, [correctPicks, goodFlowerCount]);

  if (!pendingMinigame) {
    return (
      <div className="h-full flex items-center justify-center bg-app-primary">
        <p className="text-app-muted">No minigame pending</p>
      </div>
    );
  }

  const item = ITEMS[pendingMinigame.baseReward.itemId];
  const finalReward = calculateReward();

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Sky section - top 1/3 */}
      <div
        className="relative h-1/3 overflow-hidden"
        style={{
          background: `linear-gradient(to bottom,
            hsl(200, ${70 * saturation}%, ${60 + 20 * saturation}%),
            hsl(40, ${80 * saturation}%, ${75 + 15 * saturation}%))`,
          filter: `saturate(${0.3 + 0.7 * saturation})`,
          transition: 'filter 0.1s',
        }}
      >
        {/* Sun */}
        <div
          className="absolute w-16 h-16 rounded-full transition-all duration-100"
          style={{
            background: `radial-gradient(circle,
              hsl(45, 100%, ${70 + 20 * saturation}%) 0%,
              hsl(35, 100%, ${60 + 20 * saturation}%) 100%)`,
            boxShadow: `0 0 ${30 + 30 * saturation}px ${10 + 20 * saturation}px hsla(45, 100%, 70%, ${0.3 + 0.4 * saturation})`,
            // Arc path: right to left, peaking in middle
            left: `${85 - sunProgress * 70}%`,
            top: `${60 - Math.sin(sunProgress * Math.PI) * 50}%`,
            transform: 'translate(-50%, -50%)',
          }}
        />
      </div>

      {/* Grass field section - bottom 2/3 */}
      <div
        ref={fieldRef}
        className="relative flex-1 overflow-hidden cursor-pointer"
        style={{
          background: `linear-gradient(to bottom,
            hsl(100, ${50 * saturation}%, ${35 + 15 * saturation}%),
            hsl(100, ${45 * saturation}%, ${25 + 10 * saturation}%))`,
          filter: `saturate(${0.3 + 0.7 * saturation})`,
          transition: 'filter 0.1s',
        }}
        onClick={handleFieldClick}
      >
        {/* Flowers */}
        {flowers.map(flower => {
          if (flower.state === 'collected') return null;

          const isCollecting = collectingFlowers.has(flower.id);
          const isCrumbled = flower.state === 'crumbled';

          return (
            <div
              key={flower.id}
              className="absolute pointer-events-none transition-all"
              style={{
                left: `${flower.x}%`,
                top: `${flower.y}%`,
                transform: `translate(-50%, -50%) scale(${flower.scale}) rotate(${flower.rotation}deg)`,
                opacity: isCrumbled ? 0 : 1,
                transition: isCollecting
                  ? 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
                  : isCrumbled
                    ? 'opacity 0.5s, transform 0.5s'
                    : 'none',
                ...(isCollecting && {
                  left: '95%',
                  top: '5%',
                  transform: 'translate(-50%, -50%) scale(0.3)',
                }),
                ...(isCrumbled && {
                  transform: `translate(-50%, -50%) scale(0.2) rotate(${flower.rotation + 180}deg)`,
                }),
              }}
            >
              {flower.isGood ? (
                <GoodHerb size={FLOWER_SIZE} />
              ) : (
                <BadHerb size={FLOWER_SIZE} />
              )}
            </div>
          );
        })}

        {/* Bag icon in top right */}
        <div className="absolute top-2 right-2 bg-amber-800/80 rounded-lg p-2 flex items-center gap-2">
          <span className="text-2xl">🎒</span>
          <span className="text-white font-bold">{correctPicks}</span>
        </div>

        {/* Timer bar */}
        {phase === 'playing' && (
          <div className="absolute bottom-4 left-4 right-4">
            <div className="bg-black/30 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-100"
                style={{ width: `${(timeRemaining / GAME_DURATION_MS) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Intro overlay */}
      {phase === 'intro' && <TargetHerbDisplay onStart={handleStart} />}

      {/* Results overlay */}
      {phase === 'complete' && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-4xl">{item?.icon ?? '🌿'}</span>
              <span className="text-3xl font-bold text-green-400">
                +{finalReward} {item?.name ?? 'Herbs'}
              </span>
            </div>
            <p className="text-white/80 text-lg">
              Picked {correctPicks} of {goodFlowerCount} herbs
            </p>
            {wrongPicks > 0 && (
              <p className="text-red-400 text-sm mt-1">
                Clicked {wrongPicks} wrong flower{wrongPicks > 1 ? 's' : ''}
              </p>
            )}
          </div>

          <button
            onClick={handleContinue}
            className="bg-green-600 hover:bg-green-500 text-white font-bold py-3 px-8 rounded-lg transition-colors"
          >
            Continue Expedition
          </button>
        </div>
      )}
    </div>
  );
});
