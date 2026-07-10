// JSON-driven CLI (M6): replay a seed + action list and print the result, so a
// human or an AI can drive the game headlessly by editing the action array.
//   bun run play <seed> '[{"type":"pack","slot":"food","itemId":"ration"}]'
// Because it is just play() underneath, advance the game by appending one action
// to the JSON array and re-running.
import { play } from "./play";
import type { DriverAction } from "./play";
import { legalActions } from "./legal";
import { summarize } from "./report";

const [seed, actionsArg] = process.argv.slice(2);
if (!seed) {
  console.error("usage: bun run play <seed> '[actions json]'");
  // h61: besides the engine actions listed under legalActions, the driver accepts a
  // TRAVEL directive that auto-routes around walls to a tile in one step:
  //   {"type":"travel","to":{"x":10,"y":42}}
  // It walks the Dijkstra path (spending energy per step) and stops on arrival, on
  // exhaustion, or when it walks into a monster (engaging it). Use it instead of
  // hand-appending many single "move" actions.
  console.error('travel directive: {"type":"travel","to":{"x":N,"y":N}} — auto-routes to a tile (reach a far node / combat in one step)');
  process.exit(1);
}
const actions: DriverAction[] = actionsArg ? (JSON.parse(actionsArg) as DriverAction[]) : [];
const { state, events } = play(seed, actions);

console.log("=== events ===");
for (const e of events) console.log(JSON.stringify(e));
console.log("=== state ===");
console.log(JSON.stringify(summarize(state), null, 2));
console.log("=== legalActions ===");
for (const a of legalActions(state)) console.log(JSON.stringify(a));
