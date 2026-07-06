// Movement math. GRADED model (svz): absolute terrain step-energy, minus any gear
// discounts (or an enable that turns Infinity finite), floored at MIN_STEP, then
// divided by the transport's per-terrain multiplier. Infinity = impassable.
// D21 guardrail: cost is terrain × gear × transport ONLY — no biome lookup.
import {
  TERRAIN_COST,
  TERRAIN_GATE,
  TRANSPORT_MULTIPLIER,
  MIN_STEP,
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

// Energy cost of stepping ONTO `terrain` with `transport` + `tools` equipped.
// Gear either ENABLES an impassable terrain (mountain → finite) or DISCOUNTS the
// step; the result floors at MIN_STEP, then transport divides it per-terrain.
export function moveCost(
  terrain: Terrain,
  transport: string | null,
  tools: string[] = [],
): number {
  let step = TERRAIN_COST[terrain];
  const mods = TERRAIN_GATE[terrain];
  if (mods) {
    for (const tool of tools) {
      const m = mods[tool];
      if (!m) continue;
      if (m.enable !== undefined && !Number.isFinite(step)) step = m.enable;
      if (m.discount) step -= m.discount;
    }
  }
  step = Number.isFinite(step) ? Math.max(MIN_STEP, step) : Infinity;
  const divisor =
    transport === null ? 1 : (TRANSPORT_MULTIPLIER[transport]?.[terrain] ?? 1);
  return step / divisor;
}
