// Tool gating for gathering (M3). NODE_TOOL names a CAPABILITY; equipped
// tool defIds map to capabilities via TOOL_CAPABILITY, so tiered tools
// (M5: "iron-pick") are pure data additions.
import { TOOL_CAPABILITY, TOOL_QUALITY } from "../data/constants";

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
