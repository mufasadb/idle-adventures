// Map-viewer demo driver (M1): pick a seed (and optionally force a biome)
// via query params, render the generated grid. ?seed=abc&biome=tundra
import { generateGrid, rollBiome } from "../engine/grid";
import { renderGridHtml } from "../render/render";
import { BIOME_IDS } from "../data/constants";
import type { BiomeId } from "../data/constants";

const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? "demo";
const forced = params.get("biome");
const biomeId: BiomeId = BIOME_IDS.includes(forced as BiomeId)
  ? (forced as BiomeId)
  : rollBiome(seed);
const grid = generateGrid(seed, biomeId);

document.querySelector("#app")!.innerHTML = `
  <h1>${biomeId} — seed "${seed}"</h1>
  ${renderGridHtml(grid, grid.entry)}
  <p>
    ${BIOME_IDS.map((b) => `<a href="?seed=${seed}&biome=${b}">${b}</a>`).join(" · ")}
    · <a href="?seed=${Math.floor(performance.now() * 997) % 100000}">random seed</a>
  </p>
`;
