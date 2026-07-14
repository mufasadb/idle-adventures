// Tool gating for gathering (M3). NODE_TOOL names a CAPABILITY; equipped
// tool defIds map to capabilities via TOOL_CAPABILITY, so tiered tools
// (M5: "iron-pick") are pure data additions.
import { TOOL_CAPABILITY, TOOL_SPEED, NODE_TOOL, NODE_HARDNESS, MATERIAL_GATE } from "../data/constants";
import type { Poi } from "./grid";

// Best equipped SPEED (cost divisor) for a capability. null capability = bare
// hands (speed 1). Returns null when no equipped tool provides the capability.
// A capable tool with no TOOL_SPEED entry counts as speed 1 (D78: absent = 1).
export function toolSpeedFor(
  tools: string[],
  capability: string | null,
): number | null {
  if (capability === null) return 1;
  let best: number | null = null;
  for (const defId of tools) {
    if (TOOL_CAPABILITY[defId] !== capability) continue;
    const speed = TOOL_SPEED[defId] ?? 1; // absent = speed 1 (D78)
    if (best === null || speed > best) best = speed;
  }
  return best;
}

// The ANY-OF tool list gating a material, or null when it's ungated (D78).
export function materialGate(material: string): string[] | null {
  return MATERIAL_GATE[material]?.tools ?? null;
}

// True when the material's ACCESS gate is satisfied by the equipped tools (D78):
// ungated materials are always satisfied; a gated one needs at least one of its
// listed tools equipped. Loadout-aware — the single source the reducer, legal
// filter, and web lock marker all read.
export function gateSatisfied(material: string, tools: string[]): boolean {
  const gate = materialGate(material);
  if (gate === null) return true;
  return gate.some((t) => tools.includes(t));
}

// Energy a gather WOULD cost at this node with these tools — the single source of
// truth shared by the gather reducer and the direct-line route cost-preview (eot),
// so the projected "action points" never drift from what the walk actually spends.
// Returns null when the node can't be worked: not a gatherable (monster / empty),
// no equipped tool provides the capability, or the material's ACCESS gate (D78,
// MATERIAL_GATE) is unsatisfied. cost = NODE_HARDNESS[kind] / speed.
export function gatherCost(poi: Poi, tools: string[]): number | null {
  if (poi.kind === "monster" || poi.material === null) return null;
  const kind = poi.kind; // narrowed to GatherableNodeType by the guard above (1gp: no cast)
  const speed = toolSpeedFor(tools, NODE_TOOL[kind]);
  if (speed === null) return null; // missing the required tool
  if (!gateSatisfied(poi.material, tools)) return null; // access-gated: lack an unlocking tool
  return NODE_HARDNESS[kind] / speed;
}
