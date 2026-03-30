/**
 * SmithingScreen
 *
 * Home-based smithing minigame where players smelt ores into bars.
 * Multi-step process: add ores → pump bellows → pour into mold → hammer
 *
 * Now uses useSmithingGame hook for state management and
 * phase components for cleaner separation of concerns.
 */

import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { sessionStore } from '../../stores/sessionStore';
import { useSmithingGame } from '../../hooks/useSmithingGame';
import {
  SmithingSelectPhase,
  SmithingActivePhase,
  SmithingResultsPhase,
} from '../minigames/smithing';

export const SmithingScreen = observer(() => {
  const { state, actions, availableRecipes, smithingLevel } = useSmithingGame();

  // Navigation handlers
  const handleBack = useCallback(() => {
    sessionStore.navigateTo('town');
  }, []);

  const handleDone = useCallback(() => {
    actions.completeSmithing();
    sessionStore.navigateTo('town');
  }, [actions]);

  // Selection phase
  if (state.phase === 'select') {
    return (
      <SmithingSelectPhase
        recipes={availableRecipes}
        selectedRecipe={state.selectedRecipe}
        smithingLevel={smithingLevel}
        onSelectRecipe={actions.selectRecipe}
        onStartManual={actions.startManualSmithing}
        onStartAuto={actions.startAutoSmithing}
        onBack={handleBack}
        canMakeRecipe={actions.canMakeRecipe}
      />
    );
  }

  // Active smithing phases (loading, heating, pouring, hammering)
  if (
    state.phase === 'loading' ||
    state.phase === 'heating' ||
    state.phase === 'pouring' ||
    state.phase === 'hammering'
  ) {
    return (
      <SmithingActivePhase
        phase={state.phase}
        recipe={state.selectedRecipe!}
        heat={state.heat}
        crucibleContents={state.crucibleContents}
        fillProgress={state.fillProgress}
        isPouring={state.isPouring}
        spillAmount={state.spillAmount}
        hammerHits={state.hammerHits}
        isHeatInZone={actions.isHeatInZone()}
        onAddOre={actions.addOre}
        onPump={actions.pump}
        onPour={actions.startPour}
        onHammer={actions.hammerHit}
        onCancel={handleBack}
      />
    );
  }

  // Results phase
  if (state.phase === 'results' && state.selectedRecipe) {
    return (
      <SmithingResultsPhase
        recipe={state.selectedRecipe}
        results={actions.getFinalResults()}
        isAutoMode={state.isAutoMode}
        onSmeltMore={actions.smeltMore}
        onDone={handleDone}
      />
    );
  }

  return null;
});
