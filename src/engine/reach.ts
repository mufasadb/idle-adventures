// Pure cost-to-reach (Dijkstra) from an entry tile over finite-cost terrain
// (Phase 3, b91). No RNG, no biome lookup — reused by generation and, later, by
// previews. Uses moveCost so it honours transport + gating tools identically to
// the move reducer. mountain (Infinity) is a wall unless a gating tool cheapens it.
import { GRID_SIZE } from "../data/constants";
import type { Terrain } from "../data/constants";
import { moveCost } from "./move";
import type { Coord } from "./move";

// Count tiles reachable on foot from `entry` (plain flood over finite-cost
// terrain). Cheaper than costToReach — used to pick an entry that opens onto a
// real basin rather than a boxed-in corner pocket (b91). The entry tile itself
// counts (you are placed there); expansion uses the same passability as movement.
export function reachableTiles(
  terrain: Terrain[][],
  entry: Coord,
  transport: string | null = null,
  tools: string[] = [],
): number {
  const seen = new Set<string>([`${entry.x},${entry.y}`]);
  const stack: Coord[] = [entry];
  let count = 1;
  while (stack.length) {
    const cur = stack.pop()!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
        const k = `${nx},${ny}`;
        if (seen.has(k)) continue;
        if (!Number.isFinite(moveCost(terrain[ny]![nx]!, transport, tools))) continue;
        seen.add(k);
        count++;
        stack.push({ x: nx, y: ny });
      }
    }
  }
  return count;
}

export function costToReach(
  terrain: Terrain[][],
  entry: Coord,
  transport: string | null = null,
  tools: string[] = [],
): number[][] {
  const cost = Array.from({ length: GRID_SIZE }, () =>
    Array<number>(GRID_SIZE).fill(Infinity),
  );
  cost[entry.y]![entry.x] = 0;
  const visited = new Set<string>();
  // Grid is 20×20 = 400 tiles; a plain min-scan Dijkstra is fine (no heap needed).
  for (;;) {
    let bx = -1, by = -1, best = Infinity;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (visited.has(`${x},${y}`)) continue;
        if (cost[y]![x]! < best) { best = cost[y]![x]!; bx = x; by = y; }
      }
    }
    if (bx < 0 || !Number.isFinite(best)) break; // all remaining tiles unreachable
    visited.add(`${bx},${by}`);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = bx + dx, ny = by + dy;
        if (nx < 0 || ny < 0 || nx >= GRID_SIZE || ny >= GRID_SIZE) continue;
        const step = moveCost(terrain[ny]![nx]!, transport, tools);
        if (!Number.isFinite(step)) continue; // impassable neighbor
        const nc = best + step;
        if (nc < cost[ny]![nx]!) cost[ny]![nx] = nc;
      }
    }
  }
  return cost;
}
