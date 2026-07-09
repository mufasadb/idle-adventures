// Compact, JSON-serializable snapshot of a GameState for the CLI (M6). Read-only.
import type { GameState, ItemStack } from "../engine/types";
import { MAX_ENERGY } from "../data/constants";

type ExpeditionSummary = {
  mapSeed: string;
  pos: { x: number; y: number };
  energy: number;
  maxEnergy: number;
  autoEatFood: string | null;
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
          maxEnergy: e.maxEnergy ?? MAX_ENERGY,
          autoEatFood: e.autoEatFood ?? null,
          hp: e.hp,
          carry: e.carry,
          cleared: e.cleared.length,
        }
      : null,
  };
}
