/**
 * CookingResultsPhase
 *
 * Results display for cooking minigame.
 * Shows success/failure counts and navigation options.
 */

import { ITEMS } from '../../../data/items';
import type { CookingResults } from '../../../hooks/useCookingGame';

interface CookingResultsPhaseProps {
  results: CookingResults;
  isAutoMode: boolean;
  onCookMore: () => void;
  onBack: () => void;
}

export function CookingResultsPhase({
  results,
  isAutoMode,
  onCookMore,
  onBack,
}: CookingResultsPhaseProps) {
  const outputItem = ITEMS[results.outputId];

  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* Header */}
      <div className="p-4 text-center border-b border-app">
        <h1 className="text-xl font-bold text-accent">Cooking Complete!</h1>
      </div>

      {/* Results */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">{outputItem?.icon ?? '?'}</div>

        {results.success > 0 && (
          <div className="text-center mb-4">
            <div className="text-3xl font-bold text-green-400">
              +{results.success} {outputItem?.name}
            </div>
            <div className="text-app-muted">Successfully cooked!</div>
          </div>
        )}

        {results.failed > 0 && (
          <div className="text-center text-red-400">
            <div className="text-xl">{results.failed} burnt</div>
          </div>
        )}

        {/* Auto mode indicator */}
        {isAutoMode && (
          <div className="mt-4 px-4 py-2 bg-amber-500/20 rounded-lg">
            <span className="text-amber-400 text-sm">
              Auto-cooked - 70% success rate
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 space-y-2 border-t border-app">
        <button
          onClick={onCookMore}
          className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          Cook More
        </button>
        <button
          onClick={onBack}
          className="w-full bg-app-secondary hover:bg-app-hover text-app-primary py-3 px-4 rounded-lg transition-colors"
        >
          Back to Town
        </button>
      </div>
    </div>
  );
}
