/**
 * FirePit Component
 *
 * Interactive fire pit with logs. Tap to add heat.
 */

import { forwardRef } from 'react';
import { HEAT_ZONES } from './constants';
import type { HeatLevel } from '../../../data/cooking';

interface FirePitProps {
  heat: number;
  currentZone: HeatLevel;
}

export const FirePit = forwardRef<HTMLDivElement, FirePitProps>(
  function FirePit({ heat, currentZone }, ref) {
    // Fire intensity based on heat
    const fireScale = 0.5 + (heat / 100) * 0.8;
    const fireColor = HEAT_ZONES[currentZone].color;

    return (
      <div
        ref={ref}
        className="relative w-full h-32 bg-gray-900 rounded-lg overflow-hidden cursor-pointer select-none touch-none"
        style={{
          boxShadow: `0 0 ${heat / 2}px ${fireColor}`,
        }}
      >
        {/* Logs */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          <div className="w-16 h-4 bg-amber-900 rounded-sm rotate-[-15deg]" />
          <div className="w-14 h-4 bg-amber-800 rounded-sm rotate-[10deg]" />
          <div className="w-12 h-3 bg-amber-900 rounded-sm rotate-[-5deg]" />
        </div>

        {/* Fire flames */}
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-end justify-center gap-1 transition-transform duration-200"
          style={{ transform: `translateX(-50%) scale(${fireScale})` }}
        >
          {/* Main flame */}
          <div
            className="w-8 h-16 rounded-t-full animate-pulse"
            style={{
              background: `linear-gradient(to top, ${fireColor}, #fef08a)`,
              animationDuration: '400ms',
            }}
          />
          {/* Side flames */}
          <div
            className="w-5 h-10 rounded-t-full animate-pulse -ml-3"
            style={{
              background: `linear-gradient(to top, ${fireColor}, #fde047)`,
              animationDuration: '350ms',
            }}
          />
          <div
            className="w-6 h-12 rounded-t-full animate-pulse -ml-4"
            style={{
              background: `linear-gradient(to top, ${fireColor}, #fef08a)`,
              animationDuration: '450ms',
            }}
          />
        </div>

        {/* Tap instruction */}
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-gray-400 text-xs">
          TAP TO ADD HEAT
        </div>

        {/* Heat indicator flames */}
        <div className="absolute top-2 right-2 text-lg">
          {heat < 34 ? '🔥' : heat < 67 ? '🔥🔥' : '🔥🔥🔥'}
        </div>
      </div>
    );
  }
);
