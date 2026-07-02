import type { GameState } from "../engine/types";
import { generateGrid, rollBiome } from "../engine/grid";
import type { Grid } from "../engine/grid";
import type { Terrain, NodeType } from "../data/constants";

// Dumb view: state → string. The grid is REGENERATED from mapSeed (D14) —
// render holds no state and makes no decisions.

export const TERRAIN_CHAR: Record<Terrain, string> = {
  river: "~",
  mud: ",",
  plains: ".",
  ice: "*",
  mountain: "^",
};

export const POI_CHAR: Record<NodeType, string> = {
  mining: "O",
  wood: "T",
  herb: "H",
  animal: "A",
  monster: "X",
};

export const PLAYER_CHAR = "@";

export function render(state: GameState): string {
  if (!state.expedition) return "(town)";
  const { mapSeed, pos } = state.expedition;
  const grid = generateGrid(mapSeed, rollBiome(mapSeed));
  return renderGridText(grid, pos);
}

export function renderGridText(grid: Grid, pos?: { x: number; y: number }): string {
  const poiAt = new Map(grid.pois.map((p) => [`${p.x},${p.y}`, p.kind]));
  return grid.terrain
    .map((row, y) =>
      row
        .map((terrain, x) => {
          if (pos && pos.x === x && pos.y === y) return PLAYER_CHAR;
          const kind = poiAt.get(`${x},${y}`);
          return kind ? POI_CHAR[kind] : TERRAIN_CHAR[terrain];
        })
        .join(""),
    )
    .join("\n");
}
