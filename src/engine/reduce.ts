import type { GameState, Action, GameEvent } from "./types";

// Pure reducer. M0 stub: every action is a no-op that returns state unchanged.
// The exhaustive switch is the skeleton later milestones fill in:
//   move/gather/scout/fight    → M2–M4
//   craft/pack/embark/return/drop → M2, M5
// Adding a new Action variant without a case here is a compile error (assertNever).
export function reduce(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case "craft":
    case "pack":
    case "embark":
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

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
