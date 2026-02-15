/**
 * SmithingSelectPhase
 *
 * Recipe selection UI for the smithing minigame.
 * Displays available recipes and start buttons.
 */

import { observer } from 'mobx-react-lite';
import { playerStore } from '../../../stores/playerStore';
import { ITEMS } from '../../../data/items';
import type { SmithingRecipe } from '../../../data/smithing';

interface SmithingSelectPhaseProps {
  recipes: SmithingRecipe[];
  selectedRecipe: SmithingRecipe | null;
  smithingLevel: number;
  onSelectRecipe: (recipe: SmithingRecipe) => void;
  onStartManual: () => void;
  onStartAuto: () => void;
  onBack: () => void;
  canMakeRecipe: (recipe: SmithingRecipe) => boolean;
}

export const SmithingSelectPhase = observer(function SmithingSelectPhase({
  recipes,
  selectedRecipe,
  smithingLevel,
  onSelectRecipe,
  onStartManual,
  onStartAuto,
  onBack,
  canMakeRecipe,
}: SmithingSelectPhaseProps) {
  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* Header */}
      <div className="p-4 flex items-center gap-3 border-b border-app">
        <button
          onClick={onBack}
          className="p-2 hover:bg-app-hover rounded-lg"
        >
          <span className="text-xl">←</span>
        </button>
        <div>
          <h1 className="text-xl font-bold text-app-primary">Smithing</h1>
          <p className="text-sm text-app-muted">Level {smithingLevel}</p>
        </div>
      </div>

      {/* Recipe selection */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-app-muted text-sm font-medium uppercase tracking-wide">
          Select Bar to Smelt
        </h2>

        <div className="space-y-2">
          {recipes.map((recipe) => {
            const outputItem = ITEMS[recipe.outputId];
            const canMake = canMakeRecipe(recipe);
            const isSelected = selectedRecipe?.id === recipe.id;

            return (
              <button
                key={recipe.id}
                onClick={() => onSelectRecipe(recipe)}
                disabled={!canMake}
                className={`
                  w-full p-4 rounded-lg text-left transition-colors
                  ${isSelected ? 'bg-accent/20 ring-2 ring-accent' : 'bg-app-secondary'}
                  ${canMake ? 'hover:bg-app-hover' : 'opacity-50 cursor-not-allowed'}
                `}
              >
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{outputItem?.icon ?? '?'}</span>
                  <div className="flex-1">
                    <div className="font-medium text-app-primary">
                      {outputItem?.name ?? recipe.outputId}
                    </div>
                    <div className="text-sm text-app-muted flex flex-wrap gap-2">
                      {recipe.ingredients.map((ing, i) => {
                        const oreItem = ITEMS[ing.oreId];
                        const have = playerStore.getItemCount(ing.oreId);
                        const enough = have >= ing.count;
                        return (
                          <span
                            key={i}
                            className={enough ? 'text-green-400' : 'text-red-400'}
                          >
                            {oreItem?.icon} {ing.count} {oreItem?.name}
                            {!enough && ` (${have})`}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-app-muted">
                      Lvl {recipe.levelRequired}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Start buttons */}
      {selectedRecipe && canMakeRecipe(selectedRecipe) && (
        <div className="p-4 border-t border-app space-y-2">
          <button
            onClick={onStartManual}
            className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            <div>Manual Smelt</div>
            <div className="text-xs opacity-80">85-100% quality</div>
          </button>
          <button
            onClick={onStartAuto}
            className="w-full bg-app-secondary hover:bg-app-hover text-app-primary py-3 px-4 rounded-lg transition-colors"
          >
            <div>Auto Smelt</div>
            <div className="text-xs text-app-muted">70% quality - Hands-off</div>
          </button>
        </div>
      )}
    </div>
  );
});
