/**
 * SmithingActivePhase
 *
 * Active gameplay UI for smithing (loading, heating, pouring, hammering).
 * Contains the main forge interface with all interactive elements.
 */

import { ITEMS } from '../../../data/items';
import type { SmithingRecipe, OreType } from '../../../data/smithing';
import type { SmithingPhase } from './constants';
import { OrePile } from './OrePile';
import { Crucible } from './Crucible';
import { Furnace } from './Furnace';
import { HeatMeter } from './HeatMeter';
import { Bellows } from './Bellows';
import { MoldSlot } from './MoldSlot';
import { Hammer } from './Hammer';

interface SmithingActivePhaseProps {
  phase: SmithingPhase;
  recipe: SmithingRecipe;
  heat: number;
  crucibleContents: Map<OreType, number>;
  fillProgress: number;
  isPouring: boolean;
  spillAmount: number;
  hammerHits: number;
  isHeatInZone: boolean;
  onAddOre: (oreId: OreType) => void;
  onPump: () => void;
  onPour: () => void;
  onHammer: () => void;
  onCancel: () => void;
}

export function SmithingActivePhase({
  phase,
  recipe,
  heat,
  crucibleContents,
  fillProgress,
  isPouring,
  spillAmount,
  hammerHits,
  isHeatInZone,
  onAddOre,
  onPump,
  onPour,
  onHammer,
  onCancel,
}: SmithingActivePhaseProps) {
  const outputItem = ITEMS[recipe.outputId];

  // Build available ores from recipe (remaining needed)
  const availableOres = new Map<OreType, number>();
  for (const ing of recipe.ingredients) {
    const inCrucible = crucibleContents.get(ing.oreId) ?? 0;
    const remaining = ing.count - inCrucible;
    if (remaining > 0) {
      availableOres.set(ing.oreId, remaining);
    }
  }

  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* Header */}
      <div className="p-3 flex items-center justify-between border-b border-app">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{outputItem?.icon}</span>
          <div>
            <div className="font-medium text-app-primary text-sm">
              {outputItem?.name}
            </div>
            <div className="text-xs text-app-muted capitalize">{phase}</div>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="text-app-muted hover:text-app-primary text-sm"
        >
          Cancel
        </button>
      </div>

      {/* Main smithing area - fixed grid layout */}
      <div className="flex-1 p-3 overflow-hidden flex flex-col">
        {/* Top section: Forge area with furnace, bellows, crucible */}
        <div className="flex-shrink-0 mb-3">
          <div className="flex items-start gap-3">
            {/* Left column: Ore pile */}
            <div className="w-1/3 min-h-[140px]">
              <OrePile
                available={availableOres}
                required={recipe.ingredients}
                inCrucible={crucibleContents}
                onAddOre={onAddOre}
                disabled={phase !== 'loading'}
              />
            </div>

            {/* Center/Right: Forge station */}
            <div className="flex-1 flex justify-center">
              <div className="relative">
                {/* Furnace with crucible inside */}
                <Furnace heat={heat}>
                  <Crucible
                    contents={crucibleContents}
                    heat={heat}
                    isPouring={phase === 'pouring'}
                    pourProgress={fillProgress}
                  />
                </Furnace>

                {/* Bellows positioned to the right */}
                <div className="absolute -right-20 top-8">
                  <Bellows
                    onPump={onPump}
                    disabled={phase !== 'heating'}
                    isPumping={phase === 'heating'}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Heat meter - always visible */}
        <div className="flex-shrink-0 mb-3">
          <HeatMeter
            heat={heat}
            targetHeat={recipe.heatTarget}
            tolerance={recipe.heatTolerance}
          />
        </div>

        {/* Action area - fixed height to prevent layout shift */}
        <div className="flex-shrink-0 h-14 flex items-center justify-center mb-3">
          {phase === 'heating' && isHeatInZone && (
            <button
              onClick={onPour}
              className="bg-gradient-to-b from-orange-500 to-orange-700 hover:from-orange-400 hover:to-orange-600
                       text-white font-bold py-3 px-8 rounded-lg shadow-lg shadow-orange-500/50
                       animate-pulse transition-all hover:scale-105 active:scale-95"
            >
              Pour Now!
            </button>
          )}
          {phase === 'heating' && !isHeatInZone && (
            <div className="text-app-muted text-sm">
              {heat < recipe.heatTarget - recipe.heatTolerance
                ? 'Keep pumping to heat the metal...'
                : 'Too hot! Let it cool down a bit...'}
            </div>
          )}
          {phase === 'loading' && (
            <div className="text-app-muted text-sm">Add all ores to continue</div>
          )}
          {phase === 'pouring' && (
            <div className="text-orange-400 text-sm animate-pulse">Pouring molten metal...</div>
          )}
          {phase === 'hammering' && (
            <div className="text-amber-400 text-sm">Shape the bar with the hammer!</div>
          )}
        </div>

        {/* Bottom row: Mold + Hammer - fixed positions */}
        <div className="flex-1 flex items-start justify-around min-h-[150px]">
          <MoldSlot
            barType={recipe.outputId as any}
            fillProgress={fillProgress}
            isPouring={isPouring}
            spillAmount={spillAmount}
            isComplete={fillProgress >= 1 && !isPouring}
          />
          <Hammer
            requiredHits={recipe.hammerHits}
            currentHits={hammerHits}
            onHit={onHammer}
            disabled={phase !== 'hammering'}
          />
        </div>
      </div>

      {/* Phase-specific instructions */}
      <div className="p-3 bg-app-secondary text-center text-sm text-app-muted border-t border-app">
        {phase === 'loading' && 'Tap ores to add them to the crucible'}
        {phase === 'heating' && (
          isHeatInZone
            ? 'Heat is ready! Press Pour Now!'
            : 'Pump the bellows to heat up the crucible'
        )}
        {phase === 'pouring' && 'Pouring molten metal...'}
        {phase === 'hammering' && `Tap the hammer! ${hammerHits}/${recipe.hammerHits}`}
      </div>
    </div>
  );
}
