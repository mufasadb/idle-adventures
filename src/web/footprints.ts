// Route footprints (seyh.10, D105/D112): boot prints drawn on each tile of the planned
// (and walked) route, instead of a map-wide cost tint. The COUNT comes from the engine's
// step cost (footprintCount in render.ts); here we only lay them out: n prints evenly
// along the direction of travel, alternating left/right, each sized to its share of the
// tile, so slow ground reads as many short, small steps. Pure (string out), no DOM.

export type Step = { n: number; dx: number; dy: number };

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

/** One tile's prints as an inline SVG. (dx, dy) = the step's direction (−1..1 each);
 *  a diagonal step spans the tile's diagonal. `walked` = the travelled trail (fainter). */
export function footprintSvg(step: Step, walked = false): string {
  const { n, dx, dy } = step;
  if (n < 1) return "";
  const diag = dx !== 0 && dy !== 0;
  const span = diag ? 100 * Math.SQRT2 : 100; // local x runs along the step
  const gap = span / n;
  const len = Math.min(34, gap * 0.85); // print length: its share of the stride
  const wid = len * 0.55;
  const side = Math.min(13, gap * 0.3) + 4; // left/right offset off the line of travel
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let prints = "";
  for (let i = 0; i < n; i++) {
    const cx = 50 - span / 2 + gap * (i + 0.5);
    const cy = 50 + (i % 2 ? side : -side);
    prints += `<ellipse cx="${fmt(cx + len * 0.16)}" cy="${fmt(cy)}" rx="${fmt(len * 0.32)}" ry="${fmt(wid / 2)}"/>`
      + `<ellipse cx="${fmt(cx - len * 0.32)}" cy="${fmt(cy)}" rx="${fmt(len * 0.17)}" ry="${fmt(wid * 0.4)}"/>`;
  }
  return `<svg class="fp${walked ? " walked" : ""}" viewBox="0 0 100 100" data-prints="${n}" aria-hidden="true"><g transform="rotate(${fmt(angle)} 50 50)">${prints}</g></svg>`;
}
