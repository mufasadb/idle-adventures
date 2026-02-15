/**
 * HeatMeter Component
 *
 * Displays current heat level with target zone indicator.
 */

interface HeatMeterProps {
  heat: number;           // 0-100
  targetHeat: number;     // Target heat level
  tolerance: number;      // Acceptable range (+/-)
}

export function HeatMeter({ heat, targetHeat, tolerance }: HeatMeterProps) {
  const targetMin = Math.max(0, targetHeat - tolerance);
  const targetMax = Math.min(100, targetHeat + tolerance);

  // Calculate if current heat is in target zone
  const inZone = heat >= targetMin && heat <= targetMax;

  return (
    <div className="w-full">
      {/* Label */}
      <div className="flex justify-between text-xs text-app-muted mb-1">
        <span>Heat</span>
        <span className={inZone ? 'text-green-400' : ''}>
          {Math.round(heat)}%
        </span>
      </div>

      {/* Bar container */}
      <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden">
        {/* Target zone indicator */}
        <div
          className="absolute h-full bg-green-900/50 border-x-2 border-green-500"
          style={{
            left: `${targetMin}%`,
            width: `${targetMax - targetMin}%`,
          }}
        />

        {/* Current heat fill */}
        <div
          className="absolute h-full transition-all duration-100"
          style={{
            width: `${heat}%`,
            background: `linear-gradient(to right, #f97316, ${heat > 70 ? '#ef4444' : '#f97316'}, ${heat > 90 ? '#fbbf24' : '#ef4444'})`,
          }}
        />

        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white"
          style={{ left: `${targetHeat}%` }}
        />
      </div>

      {/* Zone labels */}
      <div className="flex justify-between text-[10px] text-app-muted mt-0.5">
        <span>Cold</span>
        <span>Hot</span>
      </div>
    </div>
  );
}
