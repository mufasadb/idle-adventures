/**
 * useMinigameBase
 *
 * Base hook providing common functionality for all minigames.
 * Includes phase management, heat mechanics, and game loop integration.
 *
 * Specific minigame hooks extend this with their unique behaviors.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { playerStore } from '../stores/playerStore';
import { useGameLoop } from './useGameLoop';

/**
 * Configuration for the base minigame hook
 */
export interface MinigameConfig<TPhase extends string, TRecipe> {
  /** Skill ID for this minigame (e.g., 'cooking', 'smithing') */
  skillId: string;

  /** Initial phase when the game starts */
  initialPhase: TPhase;

  /** Phase that indicates active gameplay (triggers game loop) */
  activePhase: TPhase;

  /** Phase shown after completion */
  resultsPhase: TPhase;

  /** Tick duration in ms (default: 600) */
  tickMs?: number;

  /** Heat decay per tick (0 to disable heat) */
  heatDecayPerTick?: number;

  /** Heat gain per interaction */
  heatGainPerAction?: number;

  /** Maximum heat value (default: 100) */
  maxHeat?: number;

  /** Initial heat value (default: 50) */
  initialHeat?: number;

  /** Auto mode success rate (0-1, default: 0.7) */
  autoModeSuccessRate?: number;

  /** Function to get available recipes based on player level */
  getAvailableRecipes?: (level: number) => TRecipe[];
}

/**
 * Base state returned by the minigame hook
 */
export interface MinigameBaseState<TPhase extends string, TRecipe> {
  phase: TPhase;
  selectedRecipe: TRecipe | null;
  heat: number;
  isAutoMode: boolean;
  skillLevel: number;
}

/**
 * Base actions for minigame control
 */
export interface MinigameBaseActions<TPhase extends string, TRecipe> {
  setPhase: (phase: TPhase) => void;
  selectRecipe: (recipe: TRecipe | null) => void;
  setHeat: React.Dispatch<React.SetStateAction<number>>;
  addHeat: (amount?: number) => void;
  setAutoMode: (isAuto: boolean) => void;
  resetToSelect: () => void;
}

/**
 * Return type for the base minigame hook
 */
export interface UseMinigameBaseReturn<TPhase extends string, TRecipe> {
  state: MinigameBaseState<TPhase, TRecipe>;
  actions: MinigameBaseActions<TPhase, TRecipe>;
  refs: {
    lastTick: React.MutableRefObject<number>;
    heat: React.MutableRefObject<number>;
  };
  skillLevel: number;
  availableRecipes: TRecipe[];
  isGameLoopActive: boolean;
}

/**
 * Base minigame hook with common functionality
 */
export function useMinigameBase<TPhase extends string, TRecipe>(
  config: MinigameConfig<TPhase, TRecipe>
): UseMinigameBaseReturn<TPhase, TRecipe> {
  const {
    skillId,
    initialPhase,
    activePhase,
    tickMs = 600,
    heatDecayPerTick = 0,
    heatGainPerAction = 10,
    maxHeat = 100,
    initialHeat = 50,
    getAvailableRecipes,
  } = config;

  // Get player skill level
  const skillLevel = playerStore.getSkill(skillId)?.level ?? 1;

  // Phase management
  const [phase, setPhase] = useState<TPhase>(initialPhase);

  // Recipe selection
  const [selectedRecipe, setSelectedRecipe] = useState<TRecipe | null>(null);

  // Heat state
  const [heat, setHeat] = useState(initialHeat);

  // Auto mode
  const [isAutoMode, setIsAutoMode] = useState(false);

  // Refs for game loop
  const lastTickRef = useRef(performance.now());
  const heatRef = useRef(initialHeat);

  // Keep heat ref in sync
  useEffect(() => {
    heatRef.current = heat;
  }, [heat]);

  // Get available recipes
  const availableRecipes = getAvailableRecipes?.(skillLevel) ?? [];

  // Whether game loop should be active
  const isGameLoopActive = phase === activePhase;

  // Reset tick ref when entering active phase
  useEffect(() => {
    if (isGameLoopActive) {
      lastTickRef.current = performance.now();
    }
  }, [isGameLoopActive]);

  // Select recipe action
  const selectRecipe = useCallback((recipe: TRecipe | null) => {
    setSelectedRecipe(recipe);
  }, []);

  // Add heat action
  const addHeat = useCallback((amount?: number) => {
    const gain = amount ?? heatGainPerAction;
    setHeat(prev => Math.min(maxHeat, prev + gain));
  }, [heatGainPerAction, maxHeat]);

  // Reset to selection phase
  const resetToSelect = useCallback(() => {
    setPhase(initialPhase);
    setSelectedRecipe(null);
    setHeat(initialHeat);
    setIsAutoMode(false);
  }, [initialPhase, initialHeat]);

  // Heat decay game loop (if heat mechanics are enabled)
  useGameLoop(isGameLoopActive && heatDecayPerTick > 0, (now) => {
    const elapsed = now - lastTickRef.current;

    if (elapsed >= tickMs) {
      lastTickRef.current = now;
      setHeat(prev => Math.max(0, prev - heatDecayPerTick));
    }
  });

  return {
    state: {
      phase,
      selectedRecipe,
      heat,
      isAutoMode,
      skillLevel,
    },
    actions: {
      setPhase,
      selectRecipe,
      setHeat,
      addHeat,
      setAutoMode: setIsAutoMode,
      resetToSelect,
    },
    refs: {
      lastTick: lastTickRef,
      heat: heatRef,
    },
    skillLevel,
    availableRecipes,
    isGameLoopActive,
  };
}

/**
 * Helper to handle auto-mode completion with fixed success rate
 */
export function calculateAutoModeResults(
  count: number,
  successRate: number = 0.7
): { success: number; failed: number } {
  const success = Math.round(count * successRate);
  return {
    success,
    failed: count - success,
  };
}

/**
 * Helper to add XP to a skill
 */
export function awardXp(skillId: string, amount: number): void {
  playerStore.addXp(skillId, amount);
}

/**
 * Helper to check if player has enough items
 */
export function hasItems(itemId: string, count: number): boolean {
  return playerStore.getItemCount(itemId) >= count;
}

/**
 * Helper to consume items from bank
 */
export function consumeItems(itemId: string, count: number): boolean {
  return playerStore.removeFromBank(itemId, count);
}

/**
 * Helper to reward items to bank
 */
export function rewardItems(itemId: string, count: number): void {
  playerStore.addToBank(itemId, count);
}
