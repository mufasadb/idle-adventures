// Passive, range-gated perception (9u9.2). Pure: node KIND is always visible;
// a node's qualitative identity resolves only within the effective detail radius
// (DETAIL_RADIUS + equipped VISION_RANGE_BONUS). Returns STRUCTURED FACTS ONLY —
// never a fight outcome, never the hidden affinity (discovered post-fight).
import { DETAIL_RADIUS, VISION_RANGE_BONUS, MONSTERS, MATERIAL_GATE } from "../data/constants";
import type { NodeType, DmgType, ArmourType } from "../data/constants";
import type { Grid } from "./grid";
import type { Coord } from "./move";

// A perceived node's resolved facts. `tier` is the MONSTER tier (size/threat
// curve) and is only set for monster details. Gatherable nodes instead carry
// `gatedBy` (D78): the ANY-OF tool list that unlocks the material, or null when
// ungated — the survey/vision surface names WHICH tool family opens it.
export type PoiDetail = {
  tier?: number;
  gatedBy?: string[] | null;
  dmgType?: DmgType;
  armourType?: ArmourType;
  creature?: string;
  material?: string;
  magnitude?: number;
};
export type PerceivedPoi = { x: number; y: number; kind: NodeType; detail: PoiDetail | null };

// Effective Chebyshev detail radius: base + the sum of equipped vision bonuses.
export function visionRadius(tools: string[]): number {
  let r = DETAIL_RADIUS;
  for (const t of tools) r += VISION_RANGE_BONUS[t] ?? 0;
  return r;
}

export function perceive(grid: Grid, playerPos: Coord, tools: string[], surveyed: { x: number; y: number }[] = []): PerceivedPoi[] {
  const radius = visionRadius(tools);
  return grid.pois.map((p) => {
    // In focus if within the passive radius OR surveyed at range (54f).
    const inRange =
      Math.max(Math.abs(p.x - playerPos.x), Math.abs(p.y - playerPos.y)) <= radius ||
      surveyed.some((s) => s.x === p.x && s.y === p.y);
    if (!inRange) return { x: p.x, y: p.y, kind: p.kind, detail: null };
    let detail: PoiDetail;
    if (p.kind === "monster" && p.creature) {
      const m = MONSTERS[p.creature]!;
      detail = { tier: m.tier, dmgType: m.dmgType, armourType: m.armourType, creature: p.creature };
    } else {
      const gatedBy = p.material ? (MATERIAL_GATE[p.material]?.tools ?? null) : null;
      detail = { gatedBy, ...(p.material ? { material: p.material } : {}), ...(p.magnitude ? { magnitude: p.magnitude } : {}) };
    }
    return { x: p.x, y: p.y, kind: p.kind, detail };
  });
}
