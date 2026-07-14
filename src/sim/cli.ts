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
  // eot: besides the engine actions listed under legalActions, the driver accepts a
  // ROUTE directive — YOU plan the path (routing efficiently is the game, not the
  // solver's job). Each waypoint draws a STRAIGHT line from the previous point; it
  // does NOT route around walls. It walks each tile (spending energy), auto-gathering
  // nodes it crosses, and STOPS at the first wall on the line, a walked-into monster,
  // or a full bag — then you re-plan from where it stopped:
  //   {"type":"route","waypoints":[{"x":10,"y":42},{"x":10,"y":30}]}
  console.error('route directive: {"type":"route","waypoints":[{"x":N,"y":N},...]} — walk STRAIGHT legs you plan (no auto-routing around walls); stops at a wall/monster/full bag');
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
