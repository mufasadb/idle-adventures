// JSON-driven CLI (M6): replay a seed + action list and print the result, so a
// human or an AI can drive the game headlessly by editing the action array.
//   bun run play <seed> '[{"type":"pack","slot":"food","itemId":"ration"}]'
// Because it is just play() underneath, advance the game by appending one action
// to the JSON array and re-running.
import { play } from "./play";
import { legalActions } from "./legal";
import { summarize } from "./report";
import type { Action } from "../engine/types";

const [seed, actionsArg] = process.argv.slice(2);
if (!seed) {
  console.error("usage: bun run play <seed> '[actions json]'");
  process.exit(1);
}
const actions: Action[] = actionsArg ? (JSON.parse(actionsArg) as Action[]) : [];
const { state, events } = play(seed, actions);

console.log("=== events ===");
for (const e of events) console.log(JSON.stringify(e));
console.log("=== state ===");
console.log(JSON.stringify(summarize(state), null, 2));
console.log("=== legalActions ===");
for (const a of legalActions(state)) console.log(JSON.stringify(a));
