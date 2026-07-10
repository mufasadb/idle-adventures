// Headless driver (M6): replay a seed + action list into a final state and the
// concatenated event log. Pure — same seed + actions always reproduce the run.
// This is the unit-test and AI entry point; the interactive web view is a
// separate driver over the same reduce.
import type { GameState, Action, GameEvent } from "../engine/types";
import { reduce } from "../engine/reduce";
import { newGame } from "../engine/town";
import { expeditionGrid } from "../engine/grid";
import { routeTo } from "./route";

// h61: a sim-layer directive (NOT an engine Action) that auto-routes to a tile so a
// headless agent reaches far nodes / combat in ONE step instead of hand-appending
// dozens of single moves around walls. Accepted by play() alongside real Actions.
export type TravelDirective = { type: "travel"; to: { x: number; y: number } };
export type DriverAction = Action | TravelDirective;

// Expand a travel into the routed sequence of single `move`s, applied through reduce
// so every step is legality-checked exactly like a hand-typed move (D29). Routes
// AROUND live monsters except the destination itself (so travelling onto a monster
// tile walks up and engages — the point is to reach combat). Stops early on the
// first rejection (exhausted) or when a step engages a monster.
export function travel(state: GameState, to: { x: number; y: number }): { state: GameState; events: GameEvent[] } {
  const exp = state.expedition;
  if (!exp) return { state, events: [{ type: "action-rejected", action: "move", reason: "not-on-expedition" }] };
  const grid = expeditionGrid(exp);
  const blocked = new Set(
    grid.pois
      .filter((p) => p.kind === "monster" && p.creature !== null && !(p.x === to.x && p.y === to.y))
      .filter((p) => !exp.cleared.some((c) => c.x === p.x && c.y === p.y))
      .map((p) => `${p.x},${p.y}`),
  );
  const path = routeTo(grid.terrain, exp.pos, to, exp.loadout.equipment.transport, exp.loadout.equipment.tools, blocked);
  if (path === null) return { state, events: [{ type: "action-rejected", action: "move", reason: "impassable" }] };
  let cur = state;
  const events: GameEvent[] = [];
  for (const wp of path) {
    const r = reduce(cur, { type: "move", to: wp });
    cur = r.state;
    events.push(...r.events);
    if (r.events.some((e) => e.type === "action-rejected")) break; // exhausted / blocked
    if (cur.expedition?.combat) break; // walked into a monster → engaged, stop here
  }
  return { state: cur, events };
}

export function play(
  seed: string,
  actions: DriverAction[],
): { state: GameState; events: GameEvent[] } {
  let state = newGame(seed);
  const events: GameEvent[] = [];
  for (const action of actions) {
    if (action.type === "travel") {
      const r = travel(state, action.to);
      state = r.state;
      events.push(...r.events);
      continue;
    }
    const result = reduce(state, action);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events };
}
