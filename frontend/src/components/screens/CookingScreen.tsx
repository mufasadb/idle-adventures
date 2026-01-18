/**
 * CookingScreen
 *
 * Home-based cooking minigame where players cook raw fish.
 * - Select raw fish from inventory to cook
 * - Manage heat by tapping the fire pit
 * - Apply spices at the right time in the recipe
 * - Multiple fish can be cooked simultaneously
 *
 * TIMING: Uses performance.now() and requestAnimationFrame for accuracy.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { sessionStore } from '../../stores/sessionStore';
import { playerStore } from '../../stores/playerStore';
import { ITEMS } from '../../data/items';
import {
  COOKING_CONSTANTS,
  COOKING_RECIPES,
  getHeatLevel,
  getRecipeByInput,
  calculateSuccessRate,
  type CookingRecipe,
  type SpiceColor,
  type HeatLevel,
  type RecipeStep,
} from '../../data/cooking';
import { HeatMeter, FirePit, SpiceBowls, FishSlot, type FishState } from '../minigames/cooking';

/** State for a single fish being cooked */
interface CookingFish {
  id: string;
  recipe: CookingRecipe;
  state: FishState;
  currentStep: number;
  stepProgress: number; // 0-1 within current step
  ticksInStep: number;
  missedSteps: number;
}

/** Game phases */
type GamePhase = 'select' | 'cooking' | 'results';

export const CookingScreen = observer(() => {
  // Game state
  const [phase, setPhase] = useState<GamePhase>('select');
  const [heat, setHeat] = useState(50);
  const [selectedSpice, setSelectedSpice] = useState<SpiceColor | null>(null);
  const [selectedFishIndex, setSelectedFishIndex] = useState<number | null>(null);
  const [cookingFish, setCookingFish] = useState<CookingFish[]>([]);
  const [results, setResults] = useState<{ success: number; failed: number; outputId: string } | null>(null);

  // Selection state
  const [selectedRecipe, setSelectedRecipe] = useState<CookingRecipe | null>(null);
  const [fishCount, setFishCount] = useState(1);

  // Refs for game loop
  const lastTickRef = useRef<number>(0);
  const animationRef = useRef<number | null>(null);
  const firePitRef = useRef<HTMLDivElement>(null);
  const heatRef = useRef(50); // Ref for native event handler

  // Player cooking level (hardcoded for now, would come from skills)
  const cookingLevel = 30; // High enough to cook everything for testing

  // Get cookable items from player inventory
  const cookableItems = useMemo(() => {
    const items: { itemId: string; count: number; recipe: CookingRecipe }[] = [];

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

  // Get target heat for current fish (first fish that needs heat)
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

  // Current heat zone
  const currentZone = getHeatLevel(heat);

  // Keep heat ref in sync
  useEffect(() => {
    heatRef.current = heat;
  }, [heat]);

  // Native event listener for fire pit (uses ref to avoid stale closures)
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
  }, [phase]); // Only depends on phase, uses ref for heat

  // Handle spice selection
  const handleSelectSpice = useCallback((spice: SpiceColor) => {
    setSelectedSpice((prev) => (prev === spice ? null : spice));
  }, []);

  // Handle fish slot click (apply spice)
  const handleFishClick = useCallback(
    (index: number) => {
      if (!selectedSpice) {
        setSelectedFishIndex(index);
        return;
      }

      // Apply spice to fish
      setCookingFish((prev) => {
        const newFish = [...prev];
        const fish = newFish[index];

        if (fish.state !== 'cooking' || fish.currentStep >= fish.recipe.steps.length) {
          return prev;
        }

        const currentStep = fish.recipe.steps[fish.currentStep];

        // Check if this step expects this spice
        if (currentStep.type === 'spice' && currentStep.spice === selectedSpice) {
          // Success! Move to next step
          fish.currentStep++;
          fish.ticksInStep = 0;
          fish.stepProgress = 0;

          // Check if recipe complete
          if (fish.currentStep >= fish.recipe.steps.length) {
            fish.state = 'done';
          }
        } else {
          // Wrong spice or wrong time - count as missed
          fish.missedSteps++;
        }

        return newFish;
      });

      setSelectedSpice(null);
    },
    [selectedSpice]
  );

  // Start cooking
  const handleStartCooking = useCallback(() => {
    if (!selectedRecipe) return;

    // Check player has enough items
    const bankItem = playerStore.bank.find(
      (s) => s.itemId === selectedRecipe.inputId
    );
    if (!bankItem || bankItem.count < fishCount) return;

    // Remove items from bank
    playerStore.removeFromBank(selectedRecipe.inputId, fishCount);

    // Create cooking fish
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
    setPhase('cooking');
    lastTickRef.current = performance.now();
  }, [selectedRecipe, fishCount]);

  // Game loop
  useEffect(() => {
    if (phase !== 'cooking') return;

    const gameLoop = () => {
      const now = performance.now();
      const elapsed = now - lastTickRef.current;

      if (elapsed >= COOKING_CONSTANTS.TICK_MS) {
        lastTickRef.current = now;

        // Decay heat
        setHeat((prev) =>
          Math.max(0, prev - COOKING_CONSTANTS.HEAT_DECAY_PER_TICK)
        );

        // Process each fish
        setCookingFish((prev) => {
          let allDone = true;
          const newFish = prev.map((fish) => {
            if (fish.state !== 'cooking') return fish;

            allDone = false;
            const step = fish.recipe.steps[fish.currentStep];

            if (step.type === 'heat') {
              // Heat step - check if we're in the right zone
              const currentHeatZone = getHeatLevel(heat);

              if (currentHeatZone === step.heat) {
                // Correct heat - progress
                fish.ticksInStep++;
                fish.stepProgress = fish.ticksInStep / step.durationTicks;

                if (fish.ticksInStep >= step.durationTicks) {
                  // Step complete
                  fish.currentStep++;
                  fish.ticksInStep = 0;
                  fish.stepProgress = 0;

                  if (fish.currentStep >= fish.recipe.steps.length) {
                    fish.state = 'done';
                  }
                }
              } else {
                // Wrong heat - tick without progress, count as partial miss after tolerance
                fish.ticksInStep++;
                if (fish.ticksInStep > COOKING_CONSTANTS.HEAT_TOLERANCE_TICKS) {
                  fish.missedSteps += 0.5; // Partial penalty for being in wrong heat
                }
              }
            }
            // Spice steps don't auto-progress - player must tap

            return fish;
          });

          // Check if all fish are done
          if (allDone || newFish.every((f) => f.state !== 'cooking')) {
            // Calculate results
            const successCount = newFish.filter((f) => f.state === 'done').length;
            const failedCount = newFish.filter(
              (f) => f.state === 'burnt' || f.state === 'failed'
            ).length;

            // Add successful fish to bank
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

      animationRef.current = requestAnimationFrame(gameLoop);
    };

    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [phase, heat]);

  // Handle back to town
  const handleBack = useCallback(() => {
    sessionStore.navigateTo('town');
  }, []);

  // Handle cook more
  const handleCookMore = useCallback(() => {
    setPhase('select');
    setCookingFish([]);
    setResults(null);
    setSelectedRecipe(null);
    setFishCount(1);
  }, []);

  // Selection phase
  if (phase === 'select') {
    return (
      <div className="h-full flex flex-col bg-app-primary">
        {/* Header */}
        <div className="p-4 flex items-center gap-3 border-b border-app">
          <button
            onClick={handleBack}
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
                    onClick={() => {
                      setSelectedRecipe(item.recipe);
                      setFishCount(Math.min(item.count, COOKING_CONSTANTS.MAX_FISH_SLOTS));
                    }}
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
                  onClick={() => setFishCount((prev) => Math.max(1, prev - 1))}
                  className="w-10 h-10 bg-app-hover rounded-lg text-xl"
                  disabled={fishCount <= 1}
                >
                  -
                </button>
                <span className="text-2xl font-bold text-accent">{fishCount}</span>
                <button
                  onClick={() => {
                    const maxAvailable =
                      cookableItems.find((i) => i.itemId === selectedRecipe.inputId)
                        ?.count ?? 1;
                    setFishCount((prev) =>
                      Math.min(COOKING_CONSTANTS.MAX_FISH_SLOTS, maxAvailable, prev + 1)
                    );
                  }}
                  className="w-10 h-10 bg-app-hover rounded-lg text-xl"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-app-muted mt-2">
                Max {COOKING_CONSTANTS.MAX_FISH_SLOTS} at once. More fish = harder to
                manage!
              </p>
            </div>
          )}
        </div>

        {/* Start button */}
        {selectedRecipe && (
          <div className="p-4 border-t border-app">
            <button
              onClick={handleStartCooking}
              className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
            >
              Start Cooking ({fishCount}x {ITEMS[selectedRecipe.inputId]?.name})
            </button>
          </div>
        )}
      </div>
    );
  }

  // Results phase
  if (phase === 'results' && results) {
    const outputItem = ITEMS[results.outputId];

    return (
      <div className="h-full flex flex-col bg-app-primary">
        {/* Header */}
        <div className="p-4 text-center border-b border-app">
          <h1 className="text-xl font-bold text-accent">Cooking Complete!</h1>
        </div>

        {/* Results */}
        <div className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="text-6xl mb-4">{outputItem?.icon ?? '🍳'}</div>

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
        </div>

        {/* Actions */}
        <div className="p-4 space-y-2 border-t border-app">
          <button
            onClick={handleCookMore}
            className="w-full bg-accent hover:bg-accent/90 text-white font-bold py-3 px-4 rounded-lg transition-colors"
          >
            Cook More
          </button>
          <button
            onClick={handleBack}
            className="w-full bg-app-secondary hover:bg-app-hover text-app-primary py-3 px-4 rounded-lg transition-colors"
          >
            Back to Town
          </button>
        </div>
      </div>
    );
  }

  // Cooking phase
  return (
    <div className="h-full flex flex-col bg-app-primary">
      {/* Header */}
      <div className="p-3 text-center border-b border-app">
        <h2 className="text-lg font-bold text-accent">Cooking</h2>
        <p className="text-app-muted text-sm">
          {cookingFish.filter((f) => f.state === 'cooking').length} fish cooking
        </p>
      </div>

      {/* Spice bowls */}
      <div className="p-4 pb-8">
        <SpiceBowls
          selectedSpice={selectedSpice}
          onSelectSpice={handleSelectSpice}
        />
      </div>

      {/* Fish on stove */}
      <div className="flex-1 bg-gray-900/50 p-4">
        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto">
          {cookingFish.map((fish, index) => (
            <FishSlot
              key={fish.id}
              icon={ITEMS[fish.recipe.inputId]?.icon ?? '🐟'}
              state={fish.state}
              steps={fish.recipe.steps}
              currentStep={fish.currentStep}
              stepProgress={fish.stepProgress}
              isSelected={selectedFishIndex === index}
              onClick={() => handleFishClick(index)}
            />
          ))}
        </div>

        {selectedSpice && (
          <p className="text-center text-sm text-app-muted mt-4">
            Tap a fish to apply {selectedSpice} spice
          </p>
        )}
      </div>

      {/* Heat meter */}
      <div className="px-4 py-2">
        <HeatMeter heat={heat} targetHeat={targetHeat} />
      </div>

      {/* Fire pit */}
      <div className="p-4">
        <FirePit ref={firePitRef} heat={heat} currentZone={currentZone} />
      </div>
    </div>
  );
});
