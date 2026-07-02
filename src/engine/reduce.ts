import type { GameState, Action, GameEvent } from "./types";
import { generateGrid, rollBiome } from "./grid";
import { emptyLoadout } from "./loadout";
import { stepToward, moveCost } from "./move";
import { ENERGY_PER_FOOD, PLAYER_BASE_HP, GRID_SIZE } from "../data/constants";

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
    case "move":
      return move(state, action.to);
    case "craft":
    case "pack":
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

function move(
  state: GameState,
  to: { x: number; y: number },
): { state: GameState; events: GameEvent[] } {
  const expedition = state.expedition;
  if (state.phase !== "expedition" || !expedition) {
    return rejected(state, "move", "not-on-expedition");
  }
  const from = expedition.pos;
  const step = stepToward(from, to);
  if (step.x === from.x && step.y === from.y) {
    return rejected(state, "move", "no-step");
  }
  if (step.x < 0 || step.x >= GRID_SIZE || step.y < 0 || step.y >= GRID_SIZE) {
    return rejected(state, "move", "out-of-bounds");
  }
  const grid = generateGrid(expedition.mapSeed, rollBiome(expedition.mapSeed));
  const terrain = grid.terrain[step.y]![step.x]!;
  const cost = moveCost(terrain, expedition.loadout.equipment.transport);
  if (!Number.isFinite(cost)) return rejected(state, "move", "impassable");
  if (cost > expedition.energy) return rejected(state, "move", "exhausted");
  const energy = expedition.energy - cost;
  return {
    state: {
      ...state,
      expedition: { ...expedition, pos: step, energy },
    },
    events: [{ type: "moved", from, to: step, terrain, cost, energy }],
  };
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
