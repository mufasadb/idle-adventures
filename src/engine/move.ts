// Movement math (M2). D21 guardrail: cost is terrain × transport ONLY —
// this module's signatures make a biome lookup impossible by construction.
import {
  MOVE_BASE_COST,
  TERRAIN_COST,
  TRANSPORT_MULTIPLIER,
} from "../data/constants";
import type { Terrain } from "../data/constants";

export type Coord = { x: number; y: number };

// One 8-directional step: each axis independently moves by sign(delta).
export function stepToward(from: Coord, to: Coord): Coord {
  return {
    x: from.x + Math.sign(to.x - from.x),
    y: from.y + Math.sign(to.y - from.y),
  };
}

// Energy cost of stepping ONTO `terrain` with `transport` equipped.
// Spec §10: base × terrain ÷ transport. Infinity = impassable.
export function moveCost(terrain: Terrain, transport: string | null): number {
  const multiplier =
    transport === null ? 1 : (TRANSPORT_MULTIPLIER[transport] ?? 1);
  return (MOVE_BASE_COST * TERRAIN_COST[terrain]) / multiplier;
}
