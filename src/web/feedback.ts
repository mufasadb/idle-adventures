// Action feedback (beh / rx5 / mki): the PURE half — turns what the reducer said
// (GameEvents, the walk's gather misses) into small presentational records the web
// paints for a moment: a floating "+2 Copper Ore" over a tile, a "needs pick" over a
// node you walked across, a "+1 Pick — in bank" next to the craft button. Nothing
// here decides legality — every record is read off an event or a rejection reason.
// The DOM painting lives in fx.ts.
import type { Expedition, GameEvent, Loadout, LoadoutSlot, RejectionReason } from "../engine/types";
import { NODE_TOOL, NODE_SECONDARY_TOOL, TOOL_CAPABILITY } from "../data/constants";
import type { GatherableNodeType } from "../data/constants";
import { name, nodeToolShort, rejectCopy } from "../render/render";
import { planActions } from "./persist";
import type { PackStep } from "./persist";
import type { Pos } from "./route";

// A tile cue: "gain" = something went into the bag here (its icon flies to the bag;
// `tools` = the equipped tools of the capability that worked the node — they bounce);
// "miss" = you stood on a node and the reducer refused the gather (the tile shakes +
// a short "needs pick"; `reason` lets bag-full also shake the bag count) — rx5.
export type Cue = { at: Pos; text: string; kind: "gain" | "miss"; defId?: string; qty?: number; tools?: string[]; reason?: RejectionReason };

// rx5: the tools that did a gather on a `kind` node — every equipped tool whose
// capability is the node's primary or secondary one (presentation only: which slot to
// bounce; the reducer already accepted the gather).
export function toolsUsed(kind: GatherableNodeType, tools: string[]): string[] {
  const caps = [NODE_TOOL[kind], NODE_SECONDARY_TOOL[kind] ?? null].filter((c): c is string => c !== null);
  return tools.filter((t) => caps.includes(TOOL_CAPABILITY[t] ?? ""));
}
export type GatherMiss = { at: Pos; reason: RejectionReason };

// Short on-tile copy per gather rejection. Reasons that aren't "you stood on a node
// you could have worked" (cleared, not a gather node, mid-fight…) get no cue.
function missText(reason: RejectionReason, kind: GatherableNodeType | null, tools: string[]): string | null {
  switch (reason) {
    case "missing-tool": return (kind ? nodeToolShort(kind, tools) : null) ?? "needs a tool";
    case "tool-too-weak": return "tool too weak";
    case "carry-full": return "bag full";
    case "exhausted": return "too tired";
    default: return null;
  }
}

// Events (+ the walk's gather misses) → tile cues, in event order. `kindAt` names the
// node kind on a tile (for "needs pick" vs "needs axe"); `tools` = equipped tools.
export function pickupCues(
  events: GameEvent[],
  misses: GatherMiss[],
  kindAt: (p: Pos) => GatherableNodeType | null,
  tools: string[],
): Cue[] {
  const cues: Cue[] = [];
  const gain = (at: Pos, defId: string, qty: number, used: string[] = []) =>
    cues.push({ at: { x: at.x, y: at.y }, text: `+${qty} ${name(defId)}`, kind: "gain", defId, qty, tools: used });
  for (const e of events) {
    if (e.type === "gathered") gain(e.at, e.material, e.qty, e.kind === "monster" ? [] : toolsUsed(e.kind, tools));
    else if (e.type === "fished") {
      if (e.contents.length) for (const c of e.contents) gain(e.at, c.defId, c.qty);
      else if (e.catch !== "sodden-map" && e.catch !== "sunken-lockbox") gain(e.at, e.catch, 1);
    } else if (e.type === "fought" && e.victory) for (const l of e.loot) gain(e.at, l.defId, l.qty);
  }
  for (const m of misses) {
    const text = missText(m.reason, kindAt(m.at), tools);
    if (text) cues.push({ at: { x: m.at.x, y: m.at.y }, text, kind: "miss", reason: m.reason });
  }
  return cues;
}

// Inline craft confirmation (mki): what to say next to the craft button after a
// craft action, read off its events. `have` = how many of a defId you now hold where
// the craft put it (bank in town, bag in the field).
export type CraftNote = { recipeId: string; ok: boolean; text: string };
export function craftNote(recipeId: string, events: GameEvent[], have: (defId: string, where: "field" | "town") => number): CraftNote | null {
  for (const e of events) {
    if (e.type === "crafted") {
      const where = e.where ?? "town";
      const n = have(e.output.defId, where);
      return { recipeId, ok: true, text: `+${e.output.qty} ${name(e.output.defId)} — ${where === "field" ? "in your bag" : "in the bank"} (now ${n})` };
    }
    if (e.type === "action-rejected" && e.action === "craft") {
      return { recipeId, ok: false, text: `✗ ${rejectCopy(e.reason, recipeId)}` };
    }
  }
  return null;
}

// beh: how many of each defId the loadout PLAN holds (D28: the bank is untouched until
// embark, so the bank alone can't say what's packed). Counted off planActions so it
// covers every slot kind the repack path knows.
export function packedCounts(lo: Loadout): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of planActions(lo)) m.set(s.itemId, (m.get(s.itemId) ?? 0) + 1);
  return m;
}

// beh: the plan with ONE `defId` taken out (its last occurrence) — replayed through
// reduce from an empty loadout, that is "unpack one". Null when it isn't packed.
// d13: `slot` narrows it to that pack slot, so taking off a worn sword doesn't drop
// the spare sword in the bag instead (and vice versa).
export function planWithout(lo: Loadout, defId: string, slot?: LoadoutSlot): PackStep[] | null {
  const steps = planActions(lo);
  let i = -1;
  for (let j = steps.length - 1; j >= 0; j--) if (steps[j]!.itemId === defId && (slot === undefined || steps[j]!.slot === slot)) { i = j; break; }
  if (i === -1) return null;
  return [...steps.slice(0, i), ...steps.slice(i + 1)];
}

// mki: how many of `defId` you hold on the run — carried stacks plus loadout units (a
// field-crafted food/potion lands in the loadout, a material in carry).
export function heldOnRun(exp: Pick<Expedition, "carry" | "loadout">, defId: string): number {
  return exp.carry.filter((s) => s.defId === defId).reduce((n, s) => n + s.qty, 0) + (packedCounts(exp.loadout).get(defId) ?? 0);
}
