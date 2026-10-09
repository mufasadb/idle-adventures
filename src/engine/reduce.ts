import type { GameState, Action, GameEvent } from "./types";
import { embark, inkMap, studyMap, craftAction, packAction, researchAction, buyResearch } from "./reduce-town";
import { trackKnowledge } from "./knowledge";
import { move, gather, fish, drop, dropMap, eat, setAutoEatFood, survey, returnHome, don, doff, toggleAutoQuaff, toggleAutoGather } from "./reduce-expedition";
import { fight, flee, quaff, useItem, enhance, throwFlask, toggleAutoFinish } from "./reduce-combat";

// Pure reducer. All rules live in the domain handler modules (reduce-town /
// reduce-expedition / reduce-combat / reduce-shared); this file is the single
// exhaustive dispatch switch — the drift guarantee lives HERE (assertNever), not
// in file colocation. Adding a new Action variant without a case is a compile error.
// 675 (D104): every result passes through the knowledge hook (trackKnowledge) — the ONE
// choke point that folds newly-held items into `seen` while the recipe fog is on (a
// no-op with fog off or on a rejection, so those states stay byte-identical).
export function reduce(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  return trackKnowledge(state, dispatch(state, action));
}

function dispatch(
  state: GameState,
  action: Action,
): { state: GameState; events: GameEvent[] } {
  switch (action.type) {
    case "embark":
      return embark(state, action.mapSeed);
    case "ink":
      return inkMap(state, action.mapSeed, action.inkId);
    case "study":
      return studyMap(state, action.mapSeed);
    case "move":
      return move(state, action.to);
    case "gather":
      return gather(state);
    case "fish":
      return fish(state);
    case "eat":
      return eat(state, action);
    case "set-auto-eat-food":
      return setAutoEatFood(state, action.defId);
    case "drop":
      return drop(state, action.itemId);
    case "drop-map":
      return dropMap(state, action.mapSeed);
    case "fight":
      return fight(state, action.at);
    case "flee":
      return flee(state);
    case "quaff":
      return quaff(state);
    case "use-item":
      return useItem(state, action.itemId);
    case "throw":
      return throwFlask(state, action.itemId, action.at);
    case "enhance":
      return enhance(state, action.id);
    case "survey":
      return survey(state, action.at);
    case "toggle-auto-quaff":
      return toggleAutoQuaff(state);
    case "toggle-auto-gather":
      return toggleAutoGather(state);
    case "toggle-auto-finish":
      return toggleAutoFinish(state);
    case "don":
      return don(state, action.itemId);
    case "doff":
      return doff(state, action.itemId);
    case "craft":
      return craftAction(state, action.recipeId);
    case "pack":
      return packAction(state, action.slot, action.itemId);
    case "research":
      return researchAction(state, action.query);
    case "buy-research":
      return buyResearch(state, action.inkId);
    case "return":
      return returnHome(state);
    default:
      return assertNever(action);
  }
}

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${JSON.stringify(x)}`);
}
