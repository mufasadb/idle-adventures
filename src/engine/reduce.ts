import type { GameState, Action, GameEvent } from "./types";
import { generateGrid, rollBiome } from "./grid";
import { emptyLoadout } from "./loadout";
import { ENERGY_PER_FOOD, PLAYER_BASE_HP } from "../data/constants";

// Pure reducer. M2 fills embark/move; remaining cases are no-op stubs:
//   gather/scout/fight            → M3–M4
//   craft/pack/return/drop        → M5
// Adding a new Action variant without a case here is a compile error (assertNever).
export function reduce(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case "embark":
      return embark(state, action.mapSeed);
    case "craft":
    case "pack":
    case "move":
    case "gather":
    case "scout":
    case "fight":
    case "drop":
    case "return":
      return { state, events: [] };
    default:
      return assertNever(action);
  }
}

function rejected(
  state: GameState,
  action: Action["type"],
  reason: string,
): { state: GameState; events: GameEvent[] } {
  return { state, events: [{ type: "action-rejected", action, reason }] };
}

function embark(
  state: GameState,
  mapSeed: string,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== "town") return rejected(state, "embark", "not-in-town");
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  const foodQty = state.loadout.food.reduce((sum, stack) => sum + stack.qty, 0);
  const energy = foodQty * ENERGY_PER_FOOD;
  return {
    state: {
      ...state,
      phase: "expedition",
      loadout: emptyLoadout(),
      expedition: {
        mapSeed,
        pos: grid.entry,
        energy,
        hp: PLAYER_BASE_HP, // placeholder 0 until M4 fills the lever
        loadout: state.loadout,
        carry: [],
      },
    },
    events: [
      { type: "embarked", mapSeed, biomeId: grid.biomeId, pos: grid.entry, energy },
    ],
  };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
