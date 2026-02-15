/**
 * SmithingResultsPhase
 *
 * Results display for smithing minigame.
 * Shows quality breakdown, XP earned, and navigation options.
 */

import { ITEMS } from '../../../data/items';
import type { SmithingRecipe } from '../../../data/smithing';

interface ResultsData {
  quality: number;
  xp: number;
  heatAccuracy: number;
  pourAccuracy: number;
}

interface SmithingResultsPhaseProps {
  recipe: SmithingRecipe;
  results: ResultsData;
  isAutoMode: boolean;
  onSmeltMore: () => void;
  onDone: () => void;
}

function getQualityLabel(quality: number): { label: string; color: string } {
  if (quality >= 0.9) return { label: 'Perfect!', color: 'text-yellow-400' };
  if (quality >= 0.7) return { label: 'Great', color: 'text-green-400' };
  if (quality >= 0.5) return { label: 'Good', color: 'text-blue-400' };
  return { label: 'Okay', color: 'text-gray-400' };
}

export function SmithingResultsPhase({
  recipe,
  results,
  isAutoMode,
  onSmeltMore,
  onDone,
}: SmithingResultsPhaseProps) {
  const outputItem = ITEMS[recipe.outputId];
  const qualityInfo = getQualityLabel(results.quality);

  return (
    <div className="h-full flex flex-col bg-app-primary">
      <div className="p-4 text-center border-b border-app">
        <h1 className="text-xl font-bold text-accent">Smithing Complete!</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-8">
        <div className="text-6xl mb-4">{outputItem?.icon ?? '?'}</div>
        <div className="text-center mb-4">
          <div className="text-3xl font-bold text-green-400">
            +{recipe.outputCount} {outputItem?.name}
          </div>
          <div className={`text-lg font-medium ${qualityInfo.color}`}>
            {qualityInfo.label}
          </div>
        </div>

        {/* Quality breakdown */}
        <div className="bg-app-secondary rounded-lg p-4 mb-4 w-full max-w-xs">
          {isAutoMode ? (
            <div className="text-center text-app-muted">
              <div className="text-sm mb-1">Auto-smelted</div>
              <div className="text-lg font-medium text-gray-400">70% quality</div>
            </div>
          ) : (
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-app-muted">Heat accuracy:</span>
                <span>{Math.round(results.heatAccuracy * 100)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-app-muted">Pour accuracy:</span>
                <span>{Math.round(results.pourAccuracy * 100)}%</span>
              </div>
              <div className="flex justify-between border-t border-app pt-2">
                <span className="text-app-muted">Overall quality:</span>
                <span className={qualityInfo.color}>{Math.round(results.quality * 100)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="text-accent text-lg">+{results.xp} Smithing XP</div>
      </div>

      <div className="p-4 space-y-2 border-t border-app">
        <button
          onClick={onSmeltMore}
          className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
        >
          Smelt More
        </button>
        <button
          onClick={onDone}
          className="w-full bg-app-secondary hover:bg-app-hover text-app-primary py-3 px-4 rounded-lg transition-colors"
        >
          Back to Town
        </button>
      </div>
    </div>
  );
}
