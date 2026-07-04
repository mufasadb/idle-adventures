// Headless driver (M6): replay a seed + action list into a final state and the
// concatenated event log. Pure — same seed + actions always reproduce the run.
// This is the unit-test and AI entry point; the interactive web view is a
// separate driver over the same reduce.
import type { GameState, Action, GameEvent } from "../engine/types";
import { reduce } from "../engine/reduce";
import { newGame } from "../engine/town";

export function play(
  seed: string,
  actions: Action[],
): { state: GameState; events: GameEvent[] } {
  let state = newGame(seed);
  const events: GameEvent[] = [];
  for (const action of actions) {
    const result = reduce(state, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
