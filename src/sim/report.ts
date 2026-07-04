// Compact, JSON-serializable snapshot of a GameState for the CLI (M6). Read-only.
import type { GameState, ItemStack } from "../engine/types";

type ExpeditionSummary = {
  mapSeed: string;
  pos: { x: number; y: number };
  energy: number;
  hp: number;
  carry: ItemStack[];
  cleared: number;
};

export function summarize(state: GameState): {
  phase: GameState["phase"];
  bank: ItemStack[];
  loadout: GameState["loadout"];
  expedition: ExpeditionSummary | null;
} {
  const e = state.expedition;
  return {
    phase: state.phase,
    bank: state.bank,
    loadout: state.loadout,
    expedition: e
      ? {
          mapSeed: e.mapSeed,
          pos: e.pos,
          energy: e.energy,
          hp: e.hp,
          carry: e.carry,
          cleared: e.cleared.length,
        }
      : null,
  };
}
