/**
 * FishingMinigameScreen
 *
 * Harpoon-based fishing minigame for active mode.
 * - 5 harpoons to throw
 * - Fish swim across the pool
 * - Tap to throw harpoon at position
 * - Rewards: based on fish caught
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Fish } from 'lucide-react';
import { expeditionExecutionStore } from '../../engine/expeditionExecutionStore';
import { ITEMS } from '../../data/items';
import {
  TOTAL_HARPOONS,
  FISH_SPAWN_INTERVAL,
  FISH_SWIM_DURATION,
  HARPOON_FLY_DURATION,
  HIT_RADIUS,
  GAME_DURATION,
  type SwimmingFish,
  type FlyingHarpoon,
} from '../minigames/fishing';

export const FishingMinigameScreen = observer(() => {
  const { pendingMinigame } = expeditionExecutionStore;

  // Game state
  const [harpoonsLeft, setHarpoonsLeft] = useState(TOTAL_HARPOONS);
  const [fishCaught, setFishCaught] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [fish, setFish] = useState<SwimmingFish[]>([]);
  const [harpoons, setHarpoons] = useState<FlyingHarpoon[]>([]);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);

  // Refs for game loop
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const fishIdRef = useRef(0);
  const harpoonIdRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const lastFishSpawnRef = useRef<number>(0);
  const gameStartRef = useRef<number | null>(null);
  const isCompleteRef = useRef(false);

  // Fish swimming animation loop
  useEffect(() => {
    if (isComplete) return;

    gameStartRef.current = performance.now();

    const animate = (now: number) => {
      if (isCompleteRef.current) return;

      const elapsed = now - (gameStartRef.current ?? now);
      const remaining = Math.max(0, GAME_DURATION - elapsed);
      setTimeLeft(remaining);

      // Check if game over
      if (remaining <= 0) {
        isCompleteRef.current = true;
        setIsComplete(true);
        return;
      }

      // Spawn new fish periodically
      if (now - lastFishSpawnRef.current > FISH_SPAWN_INTERVAL) {
        lastFishSpawnRef.current = now;
        const newFish: SwimmingFish = {
          id: fishIdRef.current++,
          startTime: now,
          y: 0.2 + Math.random() * 0.6, // Keep fish in middle 60% of pool
          speed: 0.7 + Math.random() * 0.6, // Random speed
          direction: Math.random() > 0.5 ? 'left' : 'right',
          caught: false,
        };
        setFish(prev => [...prev, newFish]);
      }

      // Update fish positions and remove off-screen fish
      setFish(prev => prev.filter(f => {
        if (f.caught) return false;
        const age = now - f.startTime;
        const duration = FISH_SWIM_DURATION / f.speed;
        return age < duration;
      }));

      // Update harpoons and remove completed ones
      setHarpoons(prev => prev.filter(h => {
        const age = now - h.startTime;
        return age < HARPOON_FLY_DURATION + 200; // Keep briefly after landing
      }));

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isComplete]);

  // Calculate fish position based on time
  const getFishPosition = useCallback((f: SwimmingFish, now: number): { x: number; y: number } => {
    const age = now - f.startTime;
    const duration = FISH_SWIM_DURATION / f.speed;
    const progress = Math.min(age / duration, 1);

    const x = f.direction === 'right' ? progress : 1 - progress;
    return { x, y: f.y };
  }, []);

  // Calculate where a ray from start through target intersects the screen edge
  const calculateEdgePoint = useCallback((startX: number, startY: number, targetX: number, targetY: number) => {
    const dx = targetX - startX;
    const dy = targetY - startY;

    // Find intersection with each edge and pick the closest valid one
    let minT = Infinity;

    // Right edge (x = 1)
    if (dx > 0) {
      const t = (1 - startX) / dx;
      if (t > 0 && t < minT) minT = t;
    }
    // Left edge (x = 0)
    if (dx < 0) {
      const t = (0 - startX) / dx;
      if (t > 0 && t < minT) minT = t;
    }
    // Bottom edge (y = 1)
    if (dy > 0) {
      const t = (1 - startY) / dy;
      if (t > 0 && t < minT) minT = t;
    }
    // Top edge (y = 0)
    if (dy < 0) {
      const t = (0 - startY) / dy;
      if (t > 0 && t < minT) minT = t;
    }

    return {
      x: startX + dx * minT,
      y: startY + dy * minT,
    };
  }, []);

  // Handle tap to throw harpoon
  const handleThrow = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (isCompleteRef.current || harpoonsLeft <= 0) return;

    const rect = gameAreaRef.current?.getBoundingClientRect();
    if (!rect) return;

    const targetX = (e.clientX - rect.left) / rect.width;
    const targetY = (e.clientY - rect.top) / rect.height;
    const now = performance.now();

    const startX = 0.1;
    const startY = 0.9;

    // Calculate where harpoon exits the screen
    const edge = calculateEdgePoint(startX, startY, targetX, targetY);

    // Pre-calculate angle
    const angle = Math.atan2(edge.y - startY, edge.x - startX) * (180 / Math.PI);

    // Create flying harpoon
    const newHarpoon: FlyingHarpoon = {
      id: harpoonIdRef.current++,
      startX,
      startY,
      targetX,
      targetY,
      endX: edge.x,
      endY: edge.y,
      angle,
      startTime: now,
    };

    setHarpoons(prev => [...prev, newHarpoon]);
    setHarpoonsLeft(prev => prev - 1);

    // Check for hits when harpoon reaches the click position
    setTimeout(() => {
      if (isCompleteRef.current) return;

      setFish(prev => {
        let hitAny = false;
        const updated = prev.map(f => {
          if (f.caught) return f;

          const pos = getFishPosition(f, now + HARPOON_FLY_DURATION);
          const dx = (pos.x - targetX) * (rect.width);
          const dy = (pos.y - targetY) * (rect.height);
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < HIT_RADIUS) {
            hitAny = true;
            return { ...f, caught: true };
          }
          return f;
        });

        if (hitAny) {
          setFishCaught(c => c + 1);
        }

        return updated;
      });
    }, HARPOON_FLY_DURATION);

    // End game if out of harpoons (after a brief delay)
    if (harpoonsLeft <= 1) {
      setTimeout(() => {
        isCompleteRef.current = true;
        setIsComplete(true);
      }, HARPOON_FLY_DURATION + 500);
    }
  }, [harpoonsLeft, getFishPosition]);

  // Calculate reward multiplier based on fish caught
  const calculateMultiplier = useCallback(() => {
    // 0 fish = 0.5x, 1 fish = 0.8x, 2 fish = 1.0x, 3 fish = 1.2x, 4 fish = 1.4x, 5+ fish = 1.5x
    if (fishCaught === 0) return 0.5;
    if (fishCaught === 1) return 0.8;
    if (fishCaught === 2) return 1.0;
    if (fishCaught === 3) return 1.2;
    if (fishCaught === 4) return 1.4;
    return 1.5;
  }, [fishCaught]);

  // Handle continue button
  const handleContinue = useCallback(() => {
    const multiplier = calculateMultiplier();
    expeditionExecutionStore.completeMinigame(multiplier);
  }, [calculateMultiplier]);

  if (!pendingMinigame) {
    return (
      <div className="h-full flex items-center justify-center bg-app-primary">
        <p className="text-app-muted">No minigame pending</p>
      </div>
    );
  }

  const item = ITEMS[pendingMinigame.baseReward.itemId];
  const multiplier = calculateMultiplier();
  const finalReward = Math.max(1, Math.round(pendingMinigame.baseReward.count * multiplier));
  const now = performance.now();

  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* Header */}
      <div className="p-4 text-center">
        <h2 className="text-xl font-bold text-accent mb-1">Fishing</h2>
        <p className="text-app-muted text-sm">
          Tap to throw harpoons at the fish!
        </p>
        <div className="flex justify-center gap-4 mt-2 text-sm">
          <span className="text-app-secondary">Fish: {fishCaught}</span>
          <span className="text-app-secondary">Time: {Math.ceil(timeLeft / 1000)}s</span>
        </div>
      </div>

      {/* Game area - water pool */}
      <div
        ref={gameAreaRef}
        onPointerDown={!isComplete ? handleThrow : undefined}
        className="flex-1 relative overflow-hidden mx-4 rounded-xl cursor-crosshair"
        style={{
          background: 'linear-gradient(180deg, #1e3a5f 0%, #0d1b2a 100%)',
          touchAction: 'none',
        }}
      >
        {/* Water ripple effect */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 10px, rgba(255,255,255,0.05) 10px, rgba(255,255,255,0.05) 20px)',
            animation: 'waterRipple 2s linear infinite',
          }}
        />

        {/* Swimming fish */}
        {fish.map(f => {
          const pos = getFishPosition(f, now);
          return (
            <div
              key={f.id}
              className="absolute transition-transform"
              style={{
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                transform: `translate(-50%, -50%) scaleX(${f.direction === 'left' ? -1 : 1})`,
                opacity: f.caught ? 0 : 1,
                transition: f.caught ? 'opacity 0.2s' : 'none',
              }}
            >
              <Fish className="w-10 h-10 text-orange-400" />
            </div>
          );
        })}

        {/* Flying harpoons with trail */}
        {harpoons.map(h => {
          const age = now - h.startTime;
          // Calculate progress towards edge (not just click point)
          const totalDistance = Math.sqrt(
            Math.pow(h.endX - h.startX, 2) + Math.pow(h.endY - h.startY, 2)
          );
          const clickDistance = Math.sqrt(
            Math.pow(h.targetX - h.startX, 2) + Math.pow(h.targetY - h.startY, 2)
          );
          // Time to reach click point is HARPOON_FLY_DURATION, scale for full distance
          const fullDuration = (totalDistance / clickDistance) * HARPOON_FLY_DURATION;
          const progress = Math.min(age / fullDuration, 1);

          const x = h.startX + (h.endX - h.startX) * progress;
          const y = h.startY + (h.endY - h.startY) * progress;

          return (
            <div key={h.id}>
              {/* Trail line - from start to current position */}
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ overflow: 'visible' }}
              >
                <line
                  x1={`${h.startX * 100}%`}
                  y1={`${h.startY * 100}%`}
                  x2={`${x * 100}%`}
                  y2={`${y * 100}%`}
                  stroke="#8B4513"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity={0.8}
                />
              </svg>
              {/* Harpoon head */}
              <div
                className="absolute"
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${h.angle + 90}deg)`,
                }}
              >
                <div className="text-2xl">🔱</div>
              </div>
            </div>
          );
        })}

        {/* Harpoon ammo display - bottom left */}
        <div className="absolute bottom-4 left-4 flex gap-1">
          {Array.from({ length: TOTAL_HARPOONS }).map((_, i) => (
            <div
              key={i}
              className={`text-2xl transition-opacity ${
                i < harpoonsLeft ? 'opacity-100' : 'opacity-30'
              }`}
            >
              🔱
            </div>
          ))}
        </div>

        {/* Completion overlay */}
        {isComplete && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-4xl font-bold text-white animate-pulse">
              {fishCaught > 0 ? '🎣' : '💨'}
            </div>
          </div>
        )}
      </div>

      {/* Results / Continue section */}
      {isComplete ? (
        <div className="p-6 bg-app-secondary border-t border-app">
          <div className="text-center mb-4">
            <div className="flex items-center justify-center gap-2 mb-2">
              <span className="text-3xl">{item?.icon ?? '?'}</span>
              <span className="text-2xl font-bold text-accent">
                +{finalReward} {item?.name ?? 'Resource'}
              </span>
            </div>
            <p className="text-app-muted text-sm">
              {fishCaught === 0
                ? 'No fish caught...'
                : fishCaught >= 5
                  ? `Amazing! ${fishCaught} fish! 150% bonus!`
                  : `Caught ${fishCaught} fish (${Math.round(multiplier * 100)}%)`}
            </p>
          </div>

          <button
            onClick={handleContinue}
            className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Continue Expedition
          </button>
        </div>
      ) : (
        <div className="p-4 text-center">
          <p className="text-app-muted text-sm">
            Tap to throw harpoons at passing fish!
          </p>
        </div>
      )}

      {/* CSS animations */}
      <style>{`
        @keyframes waterRipple {
          0% { transform: translateY(0); }
          100% { transform: translateY(20px); }
        }
      `}</style>
    </div>
  );
});
