// Direct-line routing geometry (eot). The player plans routes by hand — clicking a
// destination draws the NAIVE straight line, not an energy-optimal path (finding the
// efficient route is the game). lineTiles turns two grid points into that line: a
// dominant-axis Bresenham walk that emits one tile per grid step, START-EXCLUSIVE and
// END-INCLUSIVE. Each consecutive pair is an 8-neighbour, so every step is a legal
// orthogonal or diagonal `move` — the caller costs/executes them tile by tile.
//
// Pure (engine boundary): no RNG/DOM/Date, no render/sim/web imports.

type Pos = { x: number; y: number };

export function lineTiles(a: Pos, b: Pos): Pos[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const n = Math.max(adx, ady);
  if (n === 0) return []; // a === b: no step

  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const out: Pos[] = [];
  let x = a.x;
  let y = a.y;

  // Walk the dominant axis one tile per iteration; accumulate error on the minor
  // axis and step it when the accumulator crosses half (the `2*acc >= major` tie
  // rule is deterministic — the minor step lands early, never on a coin flip).
  if (adx >= ady) {
    let acc = 0;
    for (let i = 0; i < adx; i++) {
      x += sx;
      acc += ady;
      if (2 * acc >= adx) {
        y += sy;
        acc -= adx;
      }
      out.push({ x, y });
    }
  } else {
    let acc = 0;
    for (let i = 0; i < ady; i++) {
      y += sy;
      acc += adx;
      if (2 * acc >= ady) {
        x += sx;
        acc -= ady;
      }
      out.push({ x, y });
    }
  }
  return out;
}
