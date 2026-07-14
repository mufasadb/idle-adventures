// Headless driver (M6): replay a seed + action list into a final state and the
// concatenated event log. Pure — same seed + actions always reproduce the run.
// This is the unit-test and AI entry point; the interactive web view is a
// separate driver over the same reduce.
import type { GameState, Action, GameEvent } from "../engine/types";
import { reduce } from "../engine/reduce";
import { newGame } from "../engine/town";
import { lineTiles } from "../engine/line";

// eot: routing is the PLAYER's job. `route` is a sim-layer directive (NOT an engine
// Action) mirroring the web: it draws a STRAIGHT line (lineTiles) per waypoint — no
// auto-routing around walls — and walks each tile through reduce, auto-gathering
// nodes it crosses (gated by autoGather). The agent plans the whole multi-leg route
// up front, exactly as a human clicks waypoints. Dijkstra auto-routing is retired
// from the agent surface (routeTo stays parked for the balance player, harvest.ts).
export type RouteDirective = { type: "route"; waypoints: { x: number; y: number }[] };
export type DriverAction = Action | RouteDirective;

// Walk the planned waypoints in order. Each leg is the straight lineTiles from the
// current position to the waypoint, applied as single `move`s (legality-checked like
// a hand-typed move, D29). Auto-gather (autoGather ?? true) harvests each node the
// line steps ONTO. The whole route halts on the first blocking tile (impassable /
// exhausted), a walked-into fight, or a full bag on an auto-gather — so the agent
// re-plans from where it stopped, exactly as a human re-clicks.
export function route(state: GameState, waypoints: { x: number; y: number }[]): { state: GameState; events: GameEvent[] } {
  if (!state.expedition) return { state, events: [{ type: "action-rejected", action: "move", reason: "not-on-expedition" }] };
  let cur = state;
  const events: GameEvent[] = [];
  for (const wp of waypoints) {
    let halted = false;
    for (const tile of lineTiles(cur.expedition!.pos, wp)) {
      const moved = reduce(cur, { type: "move", to: tile });
      cur = moved.state;
      events.push(...moved.events);
      if (moved.events.some((e) => e.type === "action-rejected")) { halted = true; break; } // wall / exhausted
      if (cur.expedition?.combat) { halted = true; break; } // walked into a monster → engaged

      if (cur.expedition && (cur.expedition.autoGather ?? true)) {
        const g = reduce(cur, { type: "gather" });
        if (g.events.some((e) => e.type === "gathered")) {
          cur = g.state;
          events.push(...g.events);
        } else if (g.events.some((e) => e.type === "action-rejected" && e.reason === "carry-full")) {
          events.push(...g.events); // bag full → pause the route here
          halted = true;
          break;
        }
        // any other gather rejection (no node / too weak / exhausted) — skip, keep walking
      }
    }
    if (halted) break;
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
    if (action.type === "route") {
      const r = route(state, action.waypoints);
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
