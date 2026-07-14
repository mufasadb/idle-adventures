// Tool gating for gathering (M3). NODE_TOOL names a CAPABILITY; equipped
// tool defIds map to capabilities via TOOL_CAPABILITY, so tiered tools
// (M5: "iron-pick") are pure data additions.
import { TOOL_CAPABILITY, TOOL_QUALITY, NODE_TOOL, NODE_HARDNESS, MATERIAL_TIER } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";
import type { Poi } from "./grid";

// Best equipped quality for a capability. null capability = bare hands
// (quality 1). Returns null when no equipped tool provides the capability.
export function toolQualityFor(
  tools: string[],
  capability: string | null,
): number | null {
  if (capability === null) return 1;
  let best: number | null = null;
  for (const defId of tools) {
    if (TOOL_CAPABILITY[defId] !== capability) continue;
    const quality = TOOL_QUALITY[defId];
    if (quality === undefined) continue; // no quality entry = unusable; catalog consistency is enforced by constants.test
    if (best === null || quality > best) best = quality;
  }
  return best;
}

// Energy a gather WOULD cost at this node with these tools — the single source of
// truth shared by the gather reducer and the direct-line route cost-preview (eot),
// so the projected "action points" never drift from what the walk actually spends.
// Returns null when the node can't be worked: not a gatherable (monster / empty),
// no equipped tool provides the capability, or the tool's quality (doubling as its
// tier) is below the material's tier. cost = NODE_HARDNESS[kind] / quality.
export function gatherCost(poi: Poi, tools: string[]): number | null {
  if (poi.kind === "monster" || poi.material === null) return null;
  const kind = poi.kind as GatherableNodeType;
  const quality = toolQualityFor(tools, NODE_TOOL[kind]);
  if (quality === null) return null; // missing the required tool
  if (quality < (MATERIAL_TIER[poi.material] ?? 1)) return null; // tool too weak for the tier
  return NODE_HARDNESS[kind] / quality;
}
