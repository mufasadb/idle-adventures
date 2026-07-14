// Shared sim-layer pathfinding (h61): a monster-aware Dijkstra + path reconstruction
// over the expedition grid. Pure — honours transport/tools/diagonal cost via moveCost,
// exactly like the reducer's per-step charge. PARKED (eot): no longer backs an
// agent-facing directive — the `route` directive routes by hand (straight legs). This
// auto-router now serves only the harvest reference player (harvest.ts), and stays
// for a future large-scale auto-routing balance calculator (idle-adventure-s2e). NOT
// engine code: the engine stays single-step; this batches steps for the harness.
import { moveCost } from "../engine/move";
import type { Coord } from "../engine/move";
import { MAP_WIDTH, MAP_HEIGHT } from "../data/constants";
import type { Terrain } from "../data/constants";

type Pt = { x: number; y: number };
const NEIGHBORS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// One Dijkstra from `from` over passable, non-`blocked` tiles → cost grid + prev
// pointers. `blocked` = tiles to route AROUND (live monsters), so a path never steps
// onto them. Linear-scan frontier is fine at POC scale (20×60 = 1200 tiles).
export function dijkstraFrom(
  terrain: Terrain[][], from: Pt, transport: string | null, tools: string[], blocked: Set<string>,
): { cost: number[][]; prev: (string | null)[][] } {
  const cost: number[][] = Array.from({ length: MAP_HEIGHT }, () => new Array<number>(MAP_WIDTH).fill(Infinity));
  const prev: (string | null)[][] = Array.from({ length: MAP_HEIGHT }, () => new Array<string | null>(MAP_WIDTH).fill(null));
  cost[from.y]![from.x] = 0;
  const pq: [number, number, number][] = [[0, from.x, from.y]];
  while (pq.length) {
    let bi = 0;
    for (let i = 1; i < pq.length; i++) if (pq[i]![0] < pq[bi]![0]) bi = i;
    const [d, x, y] = pq.splice(bi, 1)[0]!;
    if (d > cost[y]![x]!) continue;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= MAP_WIDTH || ny < 0 || ny >= MAP_HEIGHT) continue;
      if (blocked.has(`${nx},${ny}`)) continue; // route around live monsters
      const c = moveCost(terrain[ny]![nx]!, transport, tools, dx !== 0 && dy !== 0); // l2w: diagonal steps cost √2×
      if (!Number.isFinite(c)) continue;
      const nd = d + c;
      if (nd < cost[ny]![nx]!) { cost[ny]![nx] = nd; prev[ny]![nx] = `${x},${y}`; pq.push([nd, nx, ny]); }
    }
  }
  return { cost, prev };
}

// Reconstruct the adjacent-waypoint path to (tx,ty) from a dijkstraFrom result.
export function pathWaypoints(prev: (string | null)[][], from: Pt, tx: number, ty: number): Pt[] {
  const start = `${from.x},${from.y}`;
  const steps: Pt[] = [];
  let cur = `${tx},${ty}`;
  while (cur !== start) {
    const [px, py] = cur.split(",").map(Number) as [number, number];
    steps.unshift({ x: px, y: py });
    const p = prev[py]![px];
    if (p === null) return []; // no path (caller checks finite cost first)
    cur = p;
  }
  return steps;
}

// The adjacent-step path from `from` to `to`, or null if `to` is unreachable.
// Each returned waypoint is one king-move; feed them to the reducer as `move`s.
export function routeTo(
  terrain: Terrain[][], from: Coord, to: Coord, transport: string | null, tools: string[], blocked: Set<string>,
): Coord[] | null {
  const { cost, prev } = dijkstraFrom(terrain, from, transport, tools, blocked);
  if (!Number.isFinite(cost[to.y]?.[to.x] ?? Infinity)) return null;
  if (to.x === from.x && to.y === from.y) return [];
  const path = pathWaypoints(prev, from, to.x, to.y);
  return path.length ? path : null;
}
