/**
 * HeatMeter Component
 *
 * Visual display of current heat level with zone indicators.
 */

import { HEAT_ZONES } from './constants';
import { COOKING_CONSTANTS, type HeatLevel } from '../../../data/cooking';

interface HeatMeterProps {
  heat: number; // 0-100
  targetHeat?: HeatLevel;
}

export function HeatMeter({ heat, targetHeat }: HeatMeterProps) {
  const { HEAT_THRESHOLDS } = COOKING_CONSTANTS;

  // Determine which zone we're in
  const currentZone: HeatLevel =
    heat >= HEAT_THRESHOLDS.high.min
      ? 'high'
      : heat >= HEAT_THRESHOLDS.medium.min
        ? 'medium'
        : 'low';

  const isInTarget = targetHeat === currentZone;

  return (
    <div className="w-full">
      {/* Zone labels */}
      <div className="flex justify-between text-xs mb-1">
        <span
          className={`${targetHeat === 'low' ? 'text-white font-bold' : 'text-gray-400'}`}
        >
          Low
        </span>
        <span
          className={`${targetHeat === 'medium' ? 'text-white font-bold' : 'text-gray-400'}`}
        >
          Med
        </span>
        <span
          className={`${targetHeat === 'high' ? 'text-white font-bold' : 'text-gray-400'}`}
        >
          High
        </span>
      </div>

      {/* Heat bar */}
      <div className="relative h-6 rounded-full overflow-hidden bg-gray-800">
        {/* Zone backgrounds */}
        <div className="absolute inset-0 flex">
          <div
            className="h-full"
            style={{
              width: '33.33%',
              backgroundColor:
                targetHeat === 'low' ? HEAT_ZONES.low.color + '40' : '#1f2937',
            }}
          />
          <div
            className="h-full"
            style={{
              width: '33.33%',
              backgroundColor:
                targetHeat === 'medium'
                  ? HEAT_ZONES.medium.color + '40'
                  : '#1f2937',
            }}
          />
          <div
            className="h-full"
            style={{
              width: '33.34%',
              backgroundColor:
                targetHeat === 'high' ? HEAT_ZONES.high.color + '40' : '#1f2937',
            }}
          />
        </div>

        {/* Heat level indicator */}
        <div
          className="absolute h-full transition-all duration-200"
          style={{
            width: `${heat}%`,
            background: `linear-gradient(to right, ${HEAT_ZONES.low.color}, ${HEAT_ZONES.medium.color}, ${HEAT_ZONES.high.color})`,
          }}
        />

        {/* Target zone highlight */}
        {targetHeat && (
          <div
            className={`absolute top-0 h-full border-2 ${isInTarget ? 'border-green-400' : 'border-white/30'}`}
            style={{
              left:
                targetHeat === 'low'
                  ? '0%'
                  : targetHeat === 'medium'
                    ? '33.33%'
                    : '66.66%',
              width: '33.33%',
            }}
          />
        )}
      </div>

      {/* Current heat value */}
      <div className="text-center mt-1">
        <span
          className={`text-sm font-mono ${isInTarget ? 'text-green-400' : 'text-gray-300'}`}
        >
          {Math.round(heat)}%
        </span>
      </div>
    </div>
  );
}
