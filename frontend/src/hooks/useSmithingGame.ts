/**
 * useSmithingGame
 *
 * Custom hook for managing smithing minigame state and logic.
 * Extracts all game state from SmithingScreen for better separation of concerns.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { playerStore } from '../stores/playerStore';
import {
  SMITHING_CONSTANTS,
  getAvailableRecipes,
  hasRequiredOres,
  calculateXpReward,
  calculateQuality,
  calculateHeatAccuracy,
  type SmithingRecipe,
  type OreType,
} from '../data/smithing';
import { type SmithingPhase } from '../components/minigames/smithing/constants';
import { useGameLoop } from './useGameLoop';

export interface SmithingGameState {
  // Phase
  phase: SmithingPhase;
  selectedRecipe: SmithingRecipe | null;

  // Game state
  heat: number;
  crucibleContents: Map<OreType, number>;
  fillProgress: number;
  isPouring: boolean;
  spillAmount: number;
  hammerHits: number;

  // Quality tracking
  heatWhenPoured: number;
  totalSpillPenalty: number;
  isAutoMode: boolean;
}

export interface SmithingGameActions {
  // Recipe selection
  selectRecipe: (recipe: SmithingRecipe) => void;
  canMakeRecipe: (recipe: SmithingRecipe) => boolean;

  // Game flow
  startManualSmithing: () => void;
  startAutoSmithing: () => void;
  resetGame: () => void;

  // Active gameplay
  addOre: (oreId: OreType) => void;
  pump: () => void;
  startPour: () => void;
  hammerHit: () => void;

  // Completion
  completeSmithing: () => void;
  smeltMore: () => void;

  // Helpers
  isHeatInZone: () => boolean;
  allOresLoaded: () => boolean;
  getFinalResults: () => {
    quality: number;
    xp: number;
    heatAccuracy: number;
    pourAccuracy: number;
  };
}

export interface UseSmithingGameReturn {
  state: SmithingGameState;
  actions: SmithingGameActions;
  availableRecipes: SmithingRecipe[];
  smithingLevel: number;
}

export function useSmithingGame(): UseSmithingGameReturn {
  // Get player smithing level from store
  const smithingLevel = playerStore.getSkill('smithing')?.level ?? 1;

  // Phase management
  const [phase, setPhase] = useState<SmithingPhase>('select');
  const [selectedRecipe, setSelectedRecipe] = useState<SmithingRecipe | null>(null);

  // Game state
  const [heat, setHeat] = useState(0);
  const [crucibleContents, setCrucibleContents] = useState<Map<OreType, number>>(new Map());
  const [fillProgress, setFillProgress] = useState(0);
  const [isPouring, setIsPouring] = useState(false);
  const [spillAmount, setSpillAmount] = useState(0);
  const [hammerHits, setHammerHits] = useState(0);

  // Quality tracking
  const [heatWhenPoured, setHeatWhenPoured] = useState(0);
  const [totalSpillPenalty, setTotalSpillPenalty] = useState(0);
  const [isAutoMode, setIsAutoMode] = useState(false);

  // Animation refs
  const lastTickRef = useRef(performance.now());

  // Get available recipes
  const availableRecipes = getAvailableRecipes(smithingLevel);

  // Check which recipes player can make
  const canMakeRecipe = useCallback(
    (recipe: SmithingRecipe) =>
      hasRequiredOres(recipe, (oreId) => playerStore.getItemCount(oreId)),
    []
  );

  // Reset game state
  const resetGame = useCallback(() => {
    setHeat(0);
    setCrucibleContents(new Map());
    setFillProgress(0);
    setIsPouring(false);
    setSpillAmount(0);
    setHammerHits(0);
    setHeatWhenPoured(0);
    setTotalSpillPenalty(0);
    setIsAutoMode(false);
  }, []);

  // Select recipe
  const selectRecipe = useCallback((recipe: SmithingRecipe) => {
    setSelectedRecipe(recipe);
  }, []);

  // Start manual smithing
  const startManualSmithing = useCallback(() => {
    if (!selectedRecipe || !canMakeRecipe(selectedRecipe)) return;

    // Remove ores from bank
    for (const ing of selectedRecipe.ingredients) {
      playerStore.removeFromBank(ing.oreId, ing.count);
    }

    resetGame();
    setPhase('loading');
  }, [selectedRecipe, canMakeRecipe, resetGame]);

  // Start auto smithing
  const startAutoSmithing = useCallback(() => {
    if (!selectedRecipe || !canMakeRecipe(selectedRecipe)) return;

    // Remove ores from bank
    for (const ing of selectedRecipe.ingredients) {
      playerStore.removeFromBank(ing.oreId, ing.count);
    }

    // Mark as auto mode
    setIsAutoMode(true);

    // Set fixed 70% quality results
    setHeatWhenPoured(selectedRecipe.heatTarget);
    setTotalSpillPenalty(0.3);

    // Add output to bank immediately
    playerStore.addToBank(selectedRecipe.outputId, selectedRecipe.outputCount);

    // Calculate XP at 70% quality
    const xp = calculateXpReward(selectedRecipe, 0.7);
    playerStore.addXp('smithing', xp);

    // Go straight to results
    setPhase('results');
  }, [selectedRecipe, canMakeRecipe]);

  // Add ore to crucible
  const addOre = useCallback(
    (oreId: OreType) => {
      if (!selectedRecipe) return;

      const ingredient = selectedRecipe.ingredients.find((i) => i.oreId === oreId);
      if (!ingredient) return;

      const currentCount = crucibleContents.get(oreId) ?? 0;
      const needed = ingredient.count - currentCount;
      if (needed <= 0) return;

      setCrucibleContents((prev) => {
        const next = new Map(prev);
        next.set(oreId, currentCount + 1);
        return next;
      });
    },
    [selectedRecipe, crucibleContents]
  );

  // Check if all ores are loaded
  const allOresLoaded = useCallback(() => {
    if (!selectedRecipe) return false;
    return selectedRecipe.ingredients.every((ing) => {
      const have = crucibleContents.get(ing.oreId) ?? 0;
      return have >= ing.count;
    });
  }, [selectedRecipe, crucibleContents]);

  // Transition to heating when ores are loaded
  useEffect(() => {
    if (phase === 'loading' && allOresLoaded()) {
      const timeout = setTimeout(() => setPhase('heating'), 500);
      return () => clearTimeout(timeout);
    }
  }, [phase, allOresLoaded]);

  // Pump bellows
  const pump = useCallback(() => {
    setHeat((prev) => Math.min(100, prev + SMITHING_CONSTANTS.HEAT_GAIN_PER_PUMP));
  }, []);

  // Heat decay during heating phase
  useGameLoop(phase === 'heating', (now) => {
    const elapsed = now - lastTickRef.current;
    if (elapsed >= SMITHING_CONSTANTS.TICK_MS) {
      lastTickRef.current = now;
      setHeat((prev) => Math.max(0, prev - SMITHING_CONSTANTS.HEAT_DECAY_PER_TICK));
    }
  });

  // Reset tick ref when entering heating phase
  useEffect(() => {
    if (phase === 'heating') {
      lastTickRef.current = performance.now();
    }
  }, [phase]);

  // Check if heat is in target zone
  const isHeatInZone = useCallback(() => {
    if (!selectedRecipe) return false;
    const deviation = Math.abs(heat - selectedRecipe.heatTarget);
    return deviation <= selectedRecipe.heatTolerance;
  }, [heat, selectedRecipe]);

  // Start pouring
  const startPour = useCallback(() => {
    if (!selectedRecipe || !isHeatInZone()) return;

    setHeatWhenPoured(heat);
    setIsPouring(true);
    setPhase('pouring');
  }, [selectedRecipe, isHeatInZone, heat]);

  // Pouring logic
  useGameLoop(phase === 'pouring' && isPouring, () => {
    setFillProgress((prev) => {
      const next = prev + 0.02;
      if (next >= 1) {
        setIsPouring(false);
        setTimeout(() => setPhase('hammering'), 300);
        return 1;
      }
      if (next > 1.05) {
        setSpillAmount((s) => Math.min(1, s + 0.1));
        setTotalSpillPenalty((p) => p + SMITHING_CONSTANTS.SPILL_PENALTY);
      }
      return next;
    });
  });

  // Hammer hit
  const hammerHit = useCallback(() => {
    if (!selectedRecipe) return;

    setHammerHits((prev) => {
      const next = prev + 1;
      if (next >= selectedRecipe.hammerHits) {
        setTimeout(() => setPhase('results'), 300);
      }
      return next;
    });
  }, [selectedRecipe]);

  // Calculate final quality and XP
  const getFinalResults = useCallback(() => {
    if (!selectedRecipe) return { quality: 0, xp: 0, heatAccuracy: 0, pourAccuracy: 0 };

    const heatAccuracy = calculateHeatAccuracy(
      heatWhenPoured,
      selectedRecipe.heatTarget,
      selectedRecipe.heatTolerance
    );

    const pourAccuracy = Math.max(0, 1 - totalSpillPenalty);
    const hammerAccuracy = 1.0;
    const quality = calculateQuality(heatAccuracy, pourAccuracy, hammerAccuracy);
    const xp = calculateXpReward(selectedRecipe, quality);

    return { quality, xp, heatAccuracy, pourAccuracy };
  }, [selectedRecipe, heatWhenPoured, totalSpillPenalty]);

  // Complete smithing - award items and XP (only for manual mode)
  const completeSmithing = useCallback(() => {
    if (!selectedRecipe || isAutoMode) return;

    const { xp } = getFinalResults();

    // Add bar to bank
    playerStore.addToBank(selectedRecipe.outputId, selectedRecipe.outputCount);

    // Add XP
    playerStore.addXp('smithing', xp);
  }, [selectedRecipe, getFinalResults, isAutoMode]);

  // Smelt more
  const smeltMore = useCallback(() => {
    completeSmithing();
    resetGame();
    setPhase('select');
    setSelectedRecipe(null);
  }, [completeSmithing, resetGame]);

  return {
    state: {
      phase,
      selectedRecipe,
      heat,
      crucibleContents,
      fillProgress,
      isPouring,
      spillAmount,
      hammerHits,
      heatWhenPoured,
      totalSpillPenalty,
      isAutoMode,
    },
    actions: {
      selectRecipe,
      canMakeRecipe,
      startManualSmithing,
      startAutoSmithing,
      resetGame,
      addOre,
      pump,
      startPour,
      hammerHit,
      completeSmithing,
      smeltMore,
      isHeatInZone,
      allOresLoaded,
      getFinalResults,
    },
    availableRecipes,
    smithingLevel,
  };
}
