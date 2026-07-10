// Movement math. GRADED model (svz): absolute terrain step-energy, minus any gear
// discounts (or an enable that turns Infinity finite), floored at MIN_STEP, then
// divided by the transport's per-terrain multiplier. Infinity = impassable.
// D21 guardrail: cost is terrain × gear × transport ONLY — no biome lookup.
import {
  TERRAIN_COST,
  TERRAIN_GATE,
  TRANSPORT_MULTIPLIER,
  MIN_STEP,
  DIAGONAL_MULTIPLIER,
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

// A step is diagonal when BOTH axes change (l2w): it covers √2 tiles, so it costs
// more. Callers walking a neighbour grid pass `dx !== 0 && dy !== 0` directly.
export function isDiagonalStep(from: Coord, to: Coord): boolean {
  return from.x !== to.x && from.y !== to.y;
}

// Attribution of a single step's energy cost: which tool enabled the terrain,
// which tools discounted it, whether the floor was hit, and the transport divisor.
// `final` is guaranteed identical to `moveCost(terrain, transport, tools)`.
export type StepBreakdown = {
  terrain: Terrain;
  base: number;
  enabled?: { tool: string; to: number };
  discounts: { tool: string; amount: number }[];
  floored: boolean;
  transport?: { id: string; divisor: number };
  diagonal: boolean; // l2w: this step was costed as a diagonal (√2×, floored)
  final: number;
};

export function moveCostBreakdown(
  terrain: Terrain,
  transport: string | null,
  tools: string[] = [],
  diagonal = false,
): StepBreakdown {
  const base = TERRAIN_COST[terrain];
  let step = base;
  let enabled: StepBreakdown["enabled"];
  const discounts: StepBreakdown["discounts"] = [];
  const mods = TERRAIN_GATE[terrain];
  if (mods) {
    for (const tool of tools) {
      const m = mods[tool];
      if (!m) continue;
      if (m.enable !== undefined && !Number.isFinite(step)) {
        step = m.enable;
        enabled = { tool, to: m.enable };
      }
      if (m.discount) {
        step -= m.discount;
        discounts.push({ tool, amount: m.discount });
      }
    }
  }
  let floored = false;
  if (Number.isFinite(step)) {
    if (step <= MIN_STEP) {
      step = MIN_STEP;
      floored = true;
    }
  } else {
    step = Infinity;
  }
  const divisor =
    transport === null ? 1 : (TRANSPORT_MULTIPLIER[transport]?.[terrain] ?? 1);
  const transportInfo =
    transport !== null && divisor !== 1 ? { id: transport, divisor } : undefined;
  let final = step / divisor;
  // l2w: a diagonal step costs √2× the orthogonal final, rounded DOWN. Applied last
  // (after gear/floor/transport) so it scales the true per-step cost. Infinity stays
  // Infinity — an impassable tile is impassable on the diagonal too.
  if (diagonal && Number.isFinite(final)) final = Math.floor(final * DIAGONAL_MULTIPLIER);
  return { terrain, base, enabled, discounts, floored, transport: transportInfo, diagonal, final };
}

// Energy cost of stepping ONTO `terrain` with `transport` + `tools` equipped.
// Gear either ENABLES an impassable terrain (mountain → finite) or DISCOUNTS the
// step; the result floors at MIN_STEP, then transport divides it per-terrain.
export function moveCost(
  terrain: Terrain,
  transport: string | null,
  tools: string[] = [],
  diagonal = false,
): number {
  return moveCostBreakdown(terrain, transport, tools, diagonal).final;
}
