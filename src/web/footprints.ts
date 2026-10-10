// Route footprints (seyh.10, D105/D112): boot prints drawn on each tile of the planned
// (and walked) route, instead of a map-wide cost tint. The COUNT comes from the engine's
// step cost (footprintCount in render.ts); here we only lay them out: n prints evenly
// along the direction of travel, alternating left/right. Print SIZE comes from the
// ground (`unit` = the prints a straight step on it gets), not from n, so a diagonal
// step on the same ground shows the same-size prints, just more of them over its √2
// span. Pure (string out), no DOM.

/** n = prints this step gets (engine cost of THIS step, diagonal included); unit = prints
 *  a straight step on the same ground gets (sets their size; absent = n); (dx, dy) = the
 *  step's direction (−1..1 each); dry = past where your energy runs out (hollow prints);
 *  stop = the last step you can afford before the run-out (a mark across the trail). */
export type Step = { n: number; unit?: number; dx: number; dy: number; dry?: boolean; stop?: boolean };

const fmt = (v: number) => (Math.round(v * 10) / 10).toString();

/** One tile's prints as an inline SVG. A diagonal step spans the tile's diagonal.
 *  `walked` = the travelled trail (fainter). */
export function footprintSvg(step: Step, walked = false): string {
  const { n, dx, dy } = step;
  if (n < 1) return "";
  const unit = Math.max(1, step.unit ?? n);
  const diag = dx !== 0 && dy !== 0;
  const span = diag ? 100 * Math.SQRT2 : 100; // local x runs along the step
  const gap = span / n;
  const stride = 100 / unit; // a straight step's spacing on this ground: sizes the print
  const len = Math.min(34, stride * 0.85); // print length: its share of the stride
  const wid = len * 0.55;
  const side = Math.min(13, stride * 0.3) + 4; // left/right offset off the line of travel
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  let prints = "";
  for (let i = 0; i < n; i++) {
    const cx = 50 - span / 2 + gap * (i + 0.5);
    const cy = 50 + (i % 2 ? side : -side);
    prints += `<ellipse cx="${fmt(cx + len * 0.16)}" cy="${fmt(cy)}" rx="${fmt(len * 0.32)}" ry="${fmt(wid / 2)}"/>`
      + `<ellipse cx="${fmt(cx - len * 0.32)}" cy="${fmt(cy)}" rx="${fmt(len * 0.17)}" ry="${fmt(wid * 0.4)}"/>`;
  }
  // the run-out mark: a short bar across the trail at the tile's leading edge
  const stop = step.stop ? `<rect class="stop" x="86" y="20" width="10" height="60" rx="3"/>` : "";
  const cls = ["fp", walked ? "walked" : "", step.dry ? "dry" : ""].filter(Boolean).join(" ");
  return `<svg class="${cls}" viewBox="0 0 100 100" data-prints="${n}" aria-hidden="true"><g transform="rotate(${fmt(angle)} 50 50)">${prints}${stop}</g></svg>`;
}
