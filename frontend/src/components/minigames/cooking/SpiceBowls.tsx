/**
 * SpiceBowls Component
 *
 * Three spice bowls that can be tapped to select a spice.
 */

import { forwardRef } from 'react';
import { SPICE_VISUALS } from './constants';
import { SPICES, type SpiceColor } from '../../../data/cooking';

interface SpiceBowlsProps {
  selectedSpice: SpiceColor | null;
  onSelectSpice: (spice: SpiceColor) => void;
}

export const SpiceBowls = forwardRef<HTMLDivElement, SpiceBowlsProps>(
  function SpiceBowls({ selectedSpice, onSelectSpice }, ref) {
    const spiceColors: SpiceColor[] = ['red', 'green', 'yellow'];

    return (
      <div ref={ref} className="flex justify-center gap-4">
        {spiceColors.map((color) => {
          const isSelected = selectedSpice === color;
          const visuals = SPICE_VISUALS[color];
          const spice = SPICES[color];

          return (
            <button
              key={color}
              onClick={() => onSelectSpice(color)}
              className={`
                relative w-16 h-16 rounded-full transition-all duration-150
                ${isSelected ? 'ring-4 ring-white scale-110' : 'hover:scale-105'}
              `}
              style={{
                backgroundColor: visuals.bgColor,
                boxShadow: isSelected ? `0 0 20px ${visuals.color}` : 'none',
              }}
            >
              {/* Spice contents */}
              <div
                className="absolute inset-2 rounded-full"
                style={{ backgroundColor: visuals.color }}
              />

              {/* Icon */}
              <span className="absolute inset-0 flex items-center justify-center text-2xl">
                {spice.icon}
              </span>

              {/* Label */}
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-400 whitespace-nowrap">
                {spice.name}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
);
