// Browser persistence for the web driver: the save (survive a page refresh — the
// run isn't lost), the structured log, and the repack-last-loadout plan. Every
// localStorage touch is try/caught — storage disabled is non-fatal.
import type { GameState, ItemStack, Loadout, LoadoutSlot } from "../engine/types";
import type { LogEntry } from "./log";

export function save(key: string, state: GameState, log: LogEntry[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    localStorage.setItem(`${key}:log2`, JSON.stringify(log));
  } catch { /* storage disabled — non-fatal */ }
}
export function load(key: string): GameState | null {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as GameState) : null; } catch { return null; }
}
export function loadLog(key: string): LogEntry[] {
  // :log2 is the structured log (exm). Old ":log" held pre-rendered strings — it's a
  // log, so it's dropped unread rather than migrated.
  try { const raw = localStorage.getItem(`${key}:log2`); return raw ? (JSON.parse(raw) as LogEntry[]) : []; } catch { return []; }
}

// --- repack-last-loadout (nuy) -----------------------------------------------
// The plan is consumed at embark by design (D22/D28) — correct, but it read as a
// silent reset, and hand-repacking the same kit cost 10+ clicks per run. We keep
// the engine untouched: serialize the JUST-CONSUMED plan as an ordered list of
// ordinary pack actions and replay them through reduce (D29 intact). Equipment
// that changes carry capacity (backpack/transport/panniers/quiver) is packed FIRST so
// later consumable slot checks see the real cap.
export type PackStep = { slot: LoadoutSlot; itemId: string };
export function planActions(lo: Loadout): PackStep[] {
  const eq = lo.equipment;
  const acts: PackStep[] = [];
  const equip: [LoadoutSlot, string | null][] = [
    ["backpack", eq.backpack], ["transport", eq.transport], ["panniers", eq.panniers], ["quiver", eq.quiver ?? null],
    ["weapon", eq.weapon], ["helmet", eq.helmet], ["chest", eq.chest], ["legs", eq.legs], ["boots", eq.boots], ["gloves", eq.gloves],
  ];
  for (const [slot, id] of equip) if (id) acts.push({ slot, itemId: id });
  for (const t of eq.tools) acts.push({ slot: "tool", itemId: t });
  const units = (list: ItemStack[], slot: LoadoutSlot) => { for (const s of list) for (let i = 0; i < s.qty; i++) acts.push({ slot, itemId: s.defId }); };
  units(lo.food, "food");
  units(lo.potions, "potion");
  units(lo.battleItems ?? [], "battle-item");
  units(lo.enhancements ?? [], "enhancement"); // weapon enhancements (D60)
  units(lo.spares ?? [], "spare");
  units(lo.ammo ?? [], "ammo");
  return acts;
}
export function saveLastPlan(key: string, lo: Loadout): void {
  const steps = planActions(lo);
  try { localStorage.setItem(`${key}:lastPlan`, JSON.stringify(steps)); } catch { /* storage disabled */ }
}
export function loadLastPlan(key: string): PackStep[] {
  try { const raw = localStorage.getItem(`${key}:lastPlan`); return raw ? (JSON.parse(raw) as PackStep[]) : []; } catch { return []; }
}
