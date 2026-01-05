/**
 * FloatingResource
 *
 * Animated resource icon that floats up and fades out when earned.
 */

import { useEffect, useState } from 'react';
import { ITEMS } from '../data/items';

interface FloatingResourceProps {
  itemId: string;
  count: number;
  /** X position on screen (pixels) */
  x: number;
  /** Y position on screen (pixels) */
  y: number;
  /** Called when animation completes */
  onComplete: () => void;
}

const ANIMATION_DURATION_MS = 800;
const FLOAT_DISTANCE = 60; // pixels to float up

export function FloatingResource({
  itemId,
  count,
  x,
  y,
  onComplete,
}: FloatingResourceProps) {
  const [opacity, setOpacity] = useState(1);
  const [offsetY, setOffsetY] = useState(0);

  const item = ITEMS[itemId];
  const icon = item?.icon ?? '?';

  useEffect(() => {
    // Start animation
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION_MS, 1);

      // Ease out for smooth deceleration
      const eased = 1 - Math.pow(1 - progress, 3);

      setOffsetY(-FLOAT_DISTANCE * eased);
      setOpacity(1 - progress);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [onComplete]);

  return (
    <div
      className="fixed pointer-events-none z-50 flex items-center gap-1 text-lg font-bold"
      style={{
        left: x,
        top: y + offsetY,
        opacity,
        transform: 'translate(-50%, -50%)',
        textShadow: '0 2px 4px rgba(0,0,0,0.5)',
      }}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-white">+{count}</span>
    </div>
  );
}
