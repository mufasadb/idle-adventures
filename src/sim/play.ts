// Headless driver (M6): replay a seed + action list into a final state and the
// concatenated event log. Pure — same seed + actions always reproduce the run.
// This is the unit-test and AI entry point; the interactive web view is a
// separate driver over the same reduce.
import type { GameState, Action, GameEvent, RejectionReason } from "../engine/types";
import { reduce } from "../engine/reduce";
import { newGame } from "../engine/town";
import { lineTiles } from "../engine/line";

// eot: routing is the PLAYER's job. `route` is a sim-layer directive (NOT an engine
// Action) mirroring the web: it draws a STRAIGHT line (lineTiles) per waypoint — no
// auto-routing around walls — and walks each tile through reduce, auto-gathering
// nodes it crosses (gated by autoGather). The agent plans the whole multi-leg route
// up front, exactly as a human clicks waypoints. Dijkstra auto-routing is retired
// from the agent surface (routeTo in route.ts stays parked for bead s2e).
export type RouteDirective = { type: "route"; waypoints: { x: number; y: number }[] };
export type DriverAction = Action | RouteDirective;

// Walk the planned waypoints in order. Each leg is the straight lineTiles from the
// current position to the waypoint, applied as single `move`s (legality-checked like
// a hand-typed move, D29). Auto-gather (autoGather ?? true) harvests each node the
// line steps ONTO. The whole route halts on the first blocking tile (impassable /
// exhausted), a walked-into fight, or a full bag on an auto-gather — so the agent
// re-plans from where it stopped, exactly as a human re-clicks. The web's Walk
// button drives this same function, so the two surfaces can't drift.
export type RouteHalt =
  | { kind: "rejected"; reason: RejectionReason } // wall / exhausted — the move's true cause
  | { kind: "engaged" } // walked into a monster
  | { kind: "bag-full" }; // an auto-gather found no room — pause, the rest of the route stands
export type RouteResult = {
  state: GameState;
  events: GameEvent[];
  steps: number; // tiles actually moved
  gathered: number; // auto-gathers that landed
  halt: RouteHalt | null; // null = every waypoint reached
  remaining: { x: number; y: number }[]; // waypoints not yet reached (the current one included)
  // Auto-gathers the walk TRIED and the reducer rejected (missing-tool / tool-too-weak /
  // exhausted / carry-full …), with the tile — the web paints a "needs pick" cue there
  // (rx5). Additive: the console never reads it. "no-node" steps are not recorded.
  misses: { at: { x: number; y: number }; reason: RejectionReason }[];
};

export function route(state: GameState, waypoints: { x: number; y: number }[]): RouteResult {
  if (!state.expedition) {
    return { state, events: [{ type: "action-rejected", action: "move", reason: "not-on-expedition" }], steps: 0, gathered: 0, halt: { kind: "rejected", reason: "not-on-expedition" }, remaining: [...waypoints], misses: [] };
  }
  let cur = state;
  const events: GameEvent[] = [];
  let steps = 0;
  let gathered = 0;
  const misses: RouteResult["misses"] = [];
  for (let i = 0; i < waypoints.length; i++) {
    const halt = (h: RouteHalt): RouteResult => ({ state: cur, events, steps, gathered, halt: h, remaining: waypoints.slice(i), misses });
    for (const tile of lineTiles(cur.expedition!.pos, waypoints[i]!)) {
      const moved = reduce(cur, { type: "move", to: tile });
      events.push(...moved.events);
      const rej = moved.events.find((e): e is Extract<GameEvent, { type: "action-rejected" }> => e.type === "action-rejected");
      if (rej) return halt({ kind: "rejected", reason: rej.reason }); // wall / exhausted
      cur = moved.state;
      if (cur.expedition?.combat) return halt({ kind: "engaged" }); // walked into a monster → engaged
      steps += 1;

      if (cur.expedition && (cur.expedition.autoGather ?? true)) {
        const g = reduce(cur, { type: "gather" });
        const gRej = g.events.find((e): e is Extract<GameEvent, { type: "action-rejected" }> => e.type === "action-rejected");
        if (gRej && gRej.reason !== "no-node") misses.push({ at: { ...cur.expedition.pos }, reason: gRej.reason });
        if (g.events.some((e) => e.type === "gathered")) {
          cur = g.state;
          events.push(...g.events);
          gathered += 1;
        } else if (gRej?.reason === "carry-full") {
          events.push(...g.events); // bag full → pause the route here
          return halt({ kind: "bag-full" });
        }
        // any other gather rejection (no node / too weak / exhausted) — skip, keep walking
      }
    }
  }
  return { state: cur, events, steps, gathered, halt: null, remaining: [], misses };
}

// opts.recipeFog (675): the console surfaces (playtest/cli) start fogged like a real
// player; tests and the harness keep the default (fog off — every recipe known).
export function play(
  seed: string,
  actions: DriverAction[],
  opts: { recipeFog?: boolean } = {},
): { state: GameState; events: GameEvent[] } {
  let state = newGame(seed, opts);
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
