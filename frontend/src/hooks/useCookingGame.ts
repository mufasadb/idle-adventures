/**
 * useCookingGame
 *
 * Custom hook for managing cooking minigame state and logic.
 * Extracts all game state from CookingScreen for better separation of concerns.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { playerStore } from '../stores/playerStore';
import {
  COOKING_CONSTANTS,
  getHeatLevel,
  getRecipeByInput,
  type CookingRecipe,
  type SpiceColor,
  type HeatLevel,
} from '../data/cooking';
import type { FishState } from '../components/minigames/cooking';
import { useGameLoop } from './useGameLoop';

/** State for a single fish being cooked */
export interface CookingFish {
  id: string;
  recipe: CookingRecipe;
  state: FishState;
  currentStep: number;
  stepProgress: number;
  ticksInStep: number;
  missedSteps: number;
}

/** Game phases */
export type CookingPhase = 'select' | 'cooking' | 'results';

/** Results of a cooking session */
export interface CookingResults {
  success: number;
  failed: number;
  outputId: string;
}

/** Cookable item from player inventory */
export interface CookableItem {
  itemId: string;
  count: number;
  recipe: CookingRecipe;
}

export interface CookingGameState {
  phase: CookingPhase;
  heat: number;
  selectedSpice: SpiceColor | null;
  selectedFishIndex: number | null;
  cookingFish: CookingFish[];
  results: CookingResults | null;
  selectedRecipe: CookingRecipe | null;
  fishCount: number;
  isAutoMode: boolean;
  currentHeatZone: HeatLevel;
  targetHeat: HeatLevel | undefined;
}

export interface CookingGameActions {
  selectRecipe: (recipe: CookingRecipe) => void;
  setFishCount: (count: number) => void;
  selectSpice: (spice: SpiceColor) => void;
  clickFish: (index: number) => void;
  startCooking: () => void;
  autoCook: () => void;
  addHeat: () => void;
  cookMore: () => void;
}

export interface UseCookingGameReturn {
  state: CookingGameState;
  actions: CookingGameActions;
  cookableItems: CookableItem[];
  cookingLevel: number;
  firePitRef: React.RefObject<HTMLDivElement | null>;
}

export function useCookingGame(): UseCookingGameReturn {
  // Get player cooking level from store
  const cookingLevel = playerStore.getSkill('cooking')?.level ?? 1;

  // Phase management
  const [phase, setPhase] = useState<CookingPhase>('select');

  // Game state
  const [heat, setHeat] = useState(50);
  const [selectedSpice, setSelectedSpice] = useState<SpiceColor | null>(null);
  const [selectedFishIndex, setSelectedFishIndex] = useState<number | null>(null);
  const [cookingFish, setCookingFish] = useState<CookingFish[]>([]);
  const [results, setResults] = useState<CookingResults | null>(null);

  // Selection state
  const [selectedRecipe, setSelectedRecipe] = useState<CookingRecipe | null>(null);
  const [fishCount, setFishCount] = useState(1);
  const [isAutoMode, setIsAutoMode] = useState(false);

  // Refs
  const lastTickRef = useRef<number>(0);
  const firePitRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef(50);

  // Keep heat ref in sync
  useEffect(() => {
    heatRef.current = heat;
  }, [heat]);

  // Get cookable items from player inventory
  const cookableItems = useMemo(() => {
    const items: CookableItem[] = [];
    for (const stack of playerStore.bank) {
      const recipe = getRecipeByInput(stack.itemId);
      if (recipe && recipe.levelRequired <= cookingLevel) {
        items.push({
          itemId: stack.itemId,
          count: stack.count,
          recipe,
        });
      }
    }
    return items;
  }, [cookingLevel]);

  // Get target heat for current fish
  const targetHeat = useMemo((): HeatLevel | undefined => {
    for (const fish of cookingFish) {
      if (fish.state === 'cooking' && fish.currentStep < fish.recipe.steps.length) {
        const step = fish.recipe.steps[fish.currentStep];
        if (step.type === 'heat') {
          return step.heat;
        }
      }
    }
    return undefined;
  }, [cookingFish]);

  const currentHeatZone = getHeatLevel(heat);

  // Native event listener for fire pit
  useEffect(() => {
    const firePit = firePitRef.current;
    if (!firePit || phase !== 'cooking') return;

    const handlePointerDown = () => {
      const newHeat = Math.min(100, heatRef.current + COOKING_CONSTANTS.HEAT_PER_LOG);
      heatRef.current = newHeat;
      setHeat(newHeat);
    };

    firePit.addEventListener('pointerdown', handlePointerDown);
    return () => firePit.removeEventListener('pointerdown', handlePointerDown);
  }, [phase]);

  // Select recipe
  const selectRecipe = useCallback((recipe: CookingRecipe) => {
    setSelectedRecipe(recipe);
    const maxAvailable = cookableItems.find((i) => i.itemId === recipe.inputId)?.count ?? 1;
    setFishCount(Math.min(maxAvailable, COOKING_CONSTANTS.MAX_FISH_SLOTS));
  }, [cookableItems]);

  // Select spice
  const selectSpice = useCallback((spice: SpiceColor) => {
    setSelectedSpice((prev) => (prev === spice ? null : spice));
  }, []);

  // Click fish (apply spice)
  const clickFish = useCallback((index: number) => {
    if (!selectedSpice) {
      setSelectedFishIndex(index);
      return;
    }

    setCookingFish((prev) => {
      const newFish = [...prev];
      const fish = newFish[index];

      if (fish.state !== 'cooking' || fish.currentStep >= fish.recipe.steps.length) {
        return prev;
      }

      const currentStep = fish.recipe.steps[fish.currentStep];

      if (currentStep.type === 'spice' && currentStep.spice === selectedSpice) {
        fish.currentStep++;
        fish.ticksInStep = 0;
        fish.stepProgress = 0;

        if (fish.currentStep >= fish.recipe.steps.length) {
          fish.state = 'done';
        }
      } else {
        fish.missedSteps++;
      }

      return newFish;
    });

    setSelectedSpice(null);
  }, [selectedSpice]);

  // Start cooking
  const startCooking = useCallback(() => {
    if (!selectedRecipe) return;

    const bankItem = playerStore.bank.find((s) => s.itemId === selectedRecipe.inputId);
    if (!bankItem || bankItem.count < fishCount) return;

    playerStore.removeFromBank(selectedRecipe.inputId, fishCount);

    const fish: CookingFish[] = [];
    for (let i = 0; i < fishCount; i++) {
      fish.push({
        id: `fish-${i}-${Date.now()}`,
        recipe: selectedRecipe,
        state: 'cooking',
        currentStep: 0,
        stepProgress: 0,
        ticksInStep: 0,
        missedSteps: 0,
      });
    }

    setCookingFish(fish);
    setHeat(50);
    setIsAutoMode(false);
    setPhase('cooking');
    lastTickRef.current = performance.now();
  }, [selectedRecipe, fishCount]);

  // Auto cook
  const autoCook = useCallback(() => {
    if (!selectedRecipe) return;

    const bankItem = playerStore.bank.find((s) => s.itemId === selectedRecipe.inputId);
    if (!bankItem || bankItem.count < fishCount) return;

    playerStore.removeFromBank(selectedRecipe.inputId, fishCount);

    const successCount = Math.round(fishCount * 0.7);
    const failedCount = fishCount - successCount;

    if (successCount > 0) {
      playerStore.addToBank(selectedRecipe.outputId, successCount);
    }

    setIsAutoMode(true);
    setResults({
      success: successCount,
      failed: failedCount,
      outputId: selectedRecipe.outputId,
    });
    setPhase('results');
  }, [selectedRecipe, fishCount]);

  // Add heat (for programmatic use)
  const addHeat = useCallback(() => {
    setHeat((prev) => Math.min(100, prev + COOKING_CONSTANTS.HEAT_PER_LOG));
  }, []);

  // Cook more
  const cookMore = useCallback(() => {
    setPhase('select');
    setCookingFish([]);
    setResults(null);
    setSelectedRecipe(null);
    setFishCount(1);
  }, []);

  // Game loop
  useGameLoop(phase === 'cooking', (now) => {
    const elapsed = now - lastTickRef.current;

    if (elapsed >= COOKING_CONSTANTS.TICK_MS) {
      lastTickRef.current = now;

      // Decay heat
      setHeat((prev) => Math.max(0, prev - COOKING_CONSTANTS.HEAT_DECAY_PER_TICK));

      // Process each fish
      setCookingFish((prev) => {
        let allDone = true;
        const newFish = prev.map((fish) => {
          if (fish.state !== 'cooking') return fish;

          allDone = false;
          const step = fish.recipe.steps[fish.currentStep];

          if (step.type === 'heat') {
            const currentHeatZone = getHeatLevel(heatRef.current);

            if (currentHeatZone === step.heat) {
              fish.ticksInStep++;
              fish.stepProgress = fish.ticksInStep / step.durationTicks;

              if (fish.ticksInStep >= step.durationTicks) {
                fish.currentStep++;
                fish.ticksInStep = 0;
                fish.stepProgress = 0;

                if (fish.currentStep >= fish.recipe.steps.length) {
                  fish.state = 'done';
                }
              }
            } else {
              fish.ticksInStep++;
              if (fish.ticksInStep > COOKING_CONSTANTS.HEAT_TOLERANCE_TICKS) {
                fish.missedSteps += 0.5;
              }
            }
          }

          return fish;
        });

        // Check if all fish are done
        if (allDone || newFish.every((f) => f.state !== 'cooking')) {
          const successCount = newFish.filter((f) => f.state === 'done').length;
          const failedCount = newFish.filter(
            (f) => f.state === 'burnt' || f.state === 'failed'
          ).length;

          if (successCount > 0 && newFish[0]) {
            playerStore.addToBank(newFish[0].recipe.outputId, successCount);
          }

          setResults({
            success: successCount,
            failed: failedCount,
            outputId: newFish[0]?.recipe.outputId ?? '',
          });
          setPhase('results');
        }

        return newFish;
      });
    }
  });

  return {
    state: {
      phase,
      heat,
      selectedSpice,
      selectedFishIndex,
      cookingFish,
      results,
      selectedRecipe,
      fishCount,
      isAutoMode,
      currentHeatZone,
      targetHeat,
    },
    actions: {
      selectRecipe,
      setFishCount,
      selectSpice,
      clickFish,
      startCooking,
      autoCook,
      addHeat,
      cookMore,
    },
    cookableItems,
    cookingLevel,
    firePitRef,
  };
}
