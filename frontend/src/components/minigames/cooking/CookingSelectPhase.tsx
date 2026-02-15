/**
 * CookingSelectPhase
 *
 * Recipe selection UI for the cooking minigame.
 * Displays cookable fish and quantity selection.
 */

import { observer } from 'mobx-react-lite';
import { ITEMS } from '../../../data/items';
import { COOKING_CONSTANTS, type CookingRecipe } from '../../../data/cooking';
import type { CookableItem } from '../../../hooks/useCookingGame';

interface CookingSelectPhaseProps {
  cookableItems: CookableItem[];
  selectedRecipe: CookingRecipe | null;
  fishCount: number;
  cookingLevel: number;
  onSelectRecipe: (recipe: CookingRecipe) => void;
  onSetFishCount: (count: number) => void;
  onStartCooking: () => void;
  onAutoCook: () => void;
  onBack: () => void;
}

export const CookingSelectPhase = observer(function CookingSelectPhase({
  cookableItems,
  selectedRecipe,
  fishCount,
  cookingLevel,
  onSelectRecipe,
  onSetFishCount,
  onStartCooking,
  onAutoCook,
  onBack,
}: CookingSelectPhaseProps) {
  const maxAvailable = selectedRecipe
    ? cookableItems.find((i) => i.itemId === selectedRecipe.inputId)?.count ?? 1
    : 1;

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
          <h1 className="text-xl font-bold text-app-primary">Cooking</h1>
          <p className="text-sm text-app-muted">Level {cookingLevel}</p>
        </div>
      </div>

      {/* Recipe selection */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-app-muted text-sm font-medium uppercase tracking-wide">
          Select Fish to Cook
        </h2>

        {cookableItems.length === 0 ? (
          <div className="text-center py-8 text-app-muted">
            <p>No raw fish to cook!</p>
            <p className="text-sm mt-2">Go fishing to catch some fish.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {cookableItems.map((item) => {
              const itemDef = ITEMS[item.itemId];
              const outputDef = ITEMS[item.recipe.outputId];
              const isSelected = selectedRecipe?.inputId === item.itemId;

              return (
                <button
                  key={item.itemId}
                  onClick={() => onSelectRecipe(item.recipe)}
                  className={`
                    w-full p-4 rounded-lg text-left transition-colors
                    ${isSelected ? 'bg-accent/20 ring-2 ring-accent' : 'bg-app-secondary hover:bg-app-hover'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{itemDef?.icon ?? '?'}</span>
                    <div className="flex-1">
                      <div className="font-medium text-app-primary">
                        {itemDef?.name ?? item.itemId}
                      </div>
                      <div className="text-sm text-app-muted">
                        → {outputDef?.icon} {outputDef?.name} ({outputDef?.actions} actions)
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-accent font-medium">x{item.count}</div>
                      <div className="text-xs text-app-muted">
                        Lvl {item.recipe.levelRequired}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Quantity selector */}
        {selectedRecipe && (
          <div className="bg-app-secondary rounded-lg p-4">
            <h3 className="text-sm font-medium text-app-muted mb-2">
              How many to cook?
            </h3>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onSetFishCount(Math.max(1, fishCount - 1))}
                className="w-10 h-10 bg-app-hover rounded-lg text-xl"
                disabled={fishCount <= 1}
              >
                -
              </button>
              <span className="text-2xl font-bold text-accent">{fishCount}</span>
              <button
                onClick={() =>
                  onSetFishCount(
                    Math.min(COOKING_CONSTANTS.MAX_FISH_SLOTS, maxAvailable, fishCount + 1)
                  )
                }
                className="w-10 h-10 bg-app-hover rounded-lg text-xl"
              >
                +
              </button>
            </div>
            <p className="text-xs text-app-muted mt-2">
              Max {COOKING_CONSTANTS.MAX_FISH_SLOTS} at once. More fish = harder to manage!
            </p>
          </div>
        )}
      </div>

      {/* Start buttons */}
      {selectedRecipe && (
        <div className="p-4 border-t border-app space-y-2">
          <button
            onClick={onStartCooking}
            className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            <div>Manual Cook ({fishCount}x)</div>
            <div className="text-xs opacity-80">85-100% success</div>
          </button>
          <button
            onClick={onAutoCook}
            className="w-full bg-app-secondary hover:bg-app-hover text-app-primary py-3 px-4 rounded-lg transition-colors"
          >
            <div>Auto Cook ({fishCount}x)</div>
            <div className="text-xs text-app-muted">70% success - Hands-off</div>
          </button>
        </div>
      )}
    </div>
  );
});
