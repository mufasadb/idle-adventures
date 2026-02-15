/**
 * CookingActivePhase
 *
 * Active cooking gameplay UI.
 * Shows fish slots, spice bowls, heat meter, and fire pit.
 */

import { ITEMS } from '../../../data/items';
import type { SpiceColor, HeatLevel } from '../../../data/cooking';
import type { CookingFish } from '../../../hooks/useCookingGame';
import { HeatMeter } from './HeatMeter';
import { FirePit } from './FirePit';
import { SpiceBowls } from './SpiceBowls';
import { FishSlot } from './FishSlot';

interface CookingActivePhaseProps {
  cookingFish: CookingFish[];
  heat: number;
  targetHeat: HeatLevel | undefined;
  currentHeatZone: HeatLevel;
  selectedSpice: SpiceColor | null;
  selectedFishIndex: number | null;
  firePitRef: React.RefObject<HTMLDivElement | null>;
  onSelectSpice: (spice: SpiceColor) => void;
  onClickFish: (index: number) => void;
}

export function CookingActivePhase({
  cookingFish,
  heat,
  targetHeat,
  currentHeatZone,
  selectedSpice,
  selectedFishIndex,
  firePitRef,
  onSelectSpice,
  onClickFish,
}: CookingActivePhaseProps) {
  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* Header */}
      <div className="p-3 text-center border-b border-app">
        <h2 className="text-lg font-bold text-accent">Cooking</h2>
        <p className="text-app-muted text-sm">
          {cookingFish.filter((f) => f.state === 'cooking').length} fish cooking
        </p>
      </div>

      {/* Spice bowls */}
      <div className="p-4 pb-8">
        <SpiceBowls
          selectedSpice={selectedSpice}
          onSelectSpice={onSelectSpice}
        />
      </div>

      {/* Fish on stove */}
      <div className="flex-1 bg-gray-900/50 p-4">
        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
          {cookingFish.map((fish, index) => (
            <FishSlot
              key={fish.id}
              icon={ITEMS[fish.recipe.inputId]?.icon ?? '?'}
              state={fish.state}
              steps={fish.recipe.steps}
              currentStep={fish.currentStep}
              stepProgress={fish.stepProgress}
              isSelected={selectedFishIndex === index}
              onClick={() => onClickFish(index)}
            />
          ))}
        </div>

        {selectedSpice && (
          <p className="text-center text-sm text-app-muted mt-4">
            Tap a fish to apply {selectedSpice} spice
          </p>
        )}
      </div>

      {/* Heat meter */}
      <div className="px-4 py-2">
        <HeatMeter heat={heat} targetHeat={targetHeat} />
      </div>

      {/* Fire pit */}
      <div className="p-4">
        <FirePit ref={firePitRef} heat={heat} currentZone={currentHeatZone} />
      </div>
    </div>
  );
}
