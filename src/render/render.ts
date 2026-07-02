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

// HTML twin of renderGridText: same tile walk, CSS classes instead of chars.
// Styling lives in the web page; this stays a pure string serialization.
export function renderGridHtml(grid: Grid, pos?: { x: number; y: number }): string {
  const poiAt = new Map(grid.pois.map((p) => [`${p.x},${p.y}`, p.kind]));
  const cols = grid.terrain[0]?.length ?? 0;
  const tiles = grid.terrain
    .map((row, y) =>
      row
        .map((terrain, x) => {
          const kind = poiAt.get(`${x},${y}`);
          const isPlayer = pos !== undefined && pos.x === x && pos.y === y;
          const classes = `tile terrain-${terrain}${kind ? ` poi poi-${kind}` : ""}${isPlayer ? " player" : ""}`;
          const char = isPlayer ? PLAYER_CHAR : kind ? POI_CHAR[kind] : TERRAIN_CHAR[terrain];
          return `<div class="${classes}">${char}</div>`;
        })
        .join(""),
    )
    .join("");
  return `<div class="grid" style="display: grid; grid-template-columns: repeat(${cols}, 1.5rem);">${tiles}</div>`;
}
