import type { GameState } from "../engine/types";

// Dumb view: state → string. M0 stub returns empty.
// M1 replaces this with the 20×20 grid serialization (text for snapshots, CSS grid for web).
export function render(_state: GameState): string {
  return "";
}
