/**
 * FishSlot Component
 *
 * A single fish being cooked with its recipe timeline.
 */

import { SPICE_VISUALS, HEAT_ZONES, type FishState } from './constants';
import type { RecipeStep, SpiceColor, HeatLevel } from '../../../data/cooking';

interface FishSlotProps {
  /** Fish icon */
  icon: string;
  /** Current cooking state */
  state: FishState;
  /** Recipe steps */
  steps: RecipeStep[];
  /** Current step index */
  currentStep: number;
  /** Progress within current step (0-1) */
  stepProgress: number;
  /** Is this fish selected for spice application */
  isSelected: boolean;
  /** Click handler */
  onClick: () => void;
}

export function FishSlot({
  icon,
  state,
  steps,
  currentStep,
  stepProgress,
  isSelected,
  onClick,
}: FishSlotProps) {
  const isDone = state === 'done';
  const isBurnt = state === 'burnt';
  const isFailed = state === 'failed';

  // Background color based on state
  const getBgColor = () => {
    if (isDone) return 'bg-green-900/50';
    if (isBurnt) return 'bg-red-900/50';
    if (isFailed) return 'bg-gray-700/50';
    return 'bg-gray-800/50';
  };

  return (
    <button
      onClick={onClick}
      disabled={isDone || isBurnt || isFailed}
      className={`
        relative p-2 rounded-lg transition-all duration-150
        ${getBgColor()}
        ${isSelected ? 'ring-2 ring-white' : ''}
        ${!isDone && !isBurnt && !isFailed ? 'hover:bg-gray-700/70' : ''}
      `}
    >
      {/* Fish icon */}
      <div className="text-3xl mb-2">
        {isBurnt ? '🔥' : icon}
        {isDone && <span className="absolute top-0 right-0 text-lg">✅</span>}
        {isFailed && <span className="absolute top-0 right-0 text-lg">❌</span>}
      </div>

      {/* Recipe timeline */}
      <div className="flex gap-0.5 h-2">
        {steps.map((step, i) => {
          const isActive = i === currentStep;
          const isComplete = i < currentStep;
          const isPending = i > currentStep;

          // Get step color
          let color: string;
          if (step.type === 'heat') {
            color = HEAT_ZONES[step.heat as HeatLevel].color;
          } else {
            color = SPICE_VISUALS[step.spice as SpiceColor].color;
          }

          // Calculate width based on duration
          const widthPercent = (step.durationTicks / steps.reduce((sum, s) => sum + s.durationTicks, 0)) * 100;

          return (
            <div
              key={i}
              className="relative h-full rounded-sm overflow-hidden"
              style={{
                width: `${widthPercent}%`,
                backgroundColor: isPending ? '#374151' : isComplete ? color : '#374151',
              }}
            >
              {/* Active step progress fill */}
              {isActive && (
                <div
                  className="absolute inset-0 transition-all duration-100"
                  style={{
                    width: `${stepProgress * 100}%`,
                    backgroundColor: color,
                  }}
                />
              )}

              {/* Step type indicator */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[6px] opacity-70">
                  {step.type === 'heat'
                    ? step.heat?.[0].toUpperCase()
                    : step.spice?.[0].toUpperCase()}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current step indicator */}
      {currentStep < steps.length && !isDone && !isBurnt && !isFailed && (
        <div className="mt-1 text-xs text-center">
          {steps[currentStep].type === 'heat' ? (
            <span style={{ color: HEAT_ZONES[steps[currentStep].heat as HeatLevel].color }}>
              {steps[currentStep].heat?.toUpperCase()}
            </span>
          ) : (
            <span style={{ color: SPICE_VISUALS[steps[currentStep].spice as SpiceColor].color }}>
              + {steps[currentStep].spice?.toUpperCase()}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
