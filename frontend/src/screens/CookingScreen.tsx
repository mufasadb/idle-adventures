/**
 * CookingScreen
 *
 * Home-based cooking minigame where players cook raw fish.
 * - Select raw fish from inventory to cook
 * - Manage heat by tapping the fire pit
 * - Apply spices at the right time in the recipe
 * - Multiple fish can be cooked simultaneously
 *
 * Now uses useCookingGame hook for state management and
 * phase components for cleaner separation of concerns.
 */

import { useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { sessionStore } from '../../stores/sessionStore';
import { useCookingGame } from '../../hooks/useCookingGame';
import {
  CookingSelectPhase,
  CookingActivePhase,
  CookingResultsPhase,
} from '../minigames/cooking';

export const CookingScreen = observer(() => {
  const { state, actions, cookableItems, cookingLevel, firePitRef } = useCookingGame();

  // Navigation handlers
  const handleBack = useCallback(() => {
    sessionStore.navigateTo('town');
  }, []);

  // Selection phase
  if (state.phase === 'select') {
    return (
      <CookingSelectPhase
        cookableItems={cookableItems}
        selectedRecipe={state.selectedRecipe}
        fishCount={state.fishCount}
        cookingLevel={cookingLevel}
        onSelectRecipe={actions.selectRecipe}
        onSetFishCount={actions.setFishCount}
        onStartCooking={actions.startCooking}
        onAutoCook={actions.autoCook}
        onBack={handleBack}
      />
    );
  }

  // Results phase
  if (state.phase === 'results' && state.results) {
    return (
      <CookingResultsPhase
        results={state.results}
        isAutoMode={state.isAutoMode}
        onCookMore={actions.cookMore}
        onBack={handleBack}
      />
    );
  }

  // Cooking phase
  return (
    <CookingActivePhase
      cookingFish={state.cookingFish}
      heat={state.heat}
      targetHeat={state.targetHeat}
      currentHeatZone={state.currentHeatZone}
      selectedSpice={state.selectedSpice}
      selectedFishIndex={state.selectedFishIndex}
      firePitRef={firePitRef}
      onSelectSpice={actions.selectSpice}
      onClickFish={actions.clickFish}
    />
  );
});
