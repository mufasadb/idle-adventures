import { rand } from "./rng";

// Classic 2D Perlin gradient noise, seeded via the stateless hash RNG.
// Gradients come from a fixed 8-direction set (no trig, no permutation
// table) — the lattice gradient for (xi, yi) is chosen by rand(seed, ...).

const GRADIENTS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

function gradient(seed: string, xi: number, yi: number): readonly [number, number] {
  const i = Math.floor(rand(seed, "grad", xi, yi) * GRADIENTS.length);
  return GRADIENTS[i] ?? GRADIENTS[0]!;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Returns noise normalized to [0, 1]. Raw Perlin with unit gradients spans
// ±SQRT1_2, so we rescale by 1/SQRT1_2 before shifting to [0, 1].
export function perlin2(seed: string, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const dot = (xi: number, yi: number): number => {
    const [gx, gy] = gradient(seed, xi, yi);
    return gx * (x - xi) + gy * (y - yi);
  };
  const u = fade(x - x0);
  const v = fade(y - y0);
  const top = lerp(dot(x0, y0), dot(x0 + 1, y0), u);
  const bottom = lerp(dot(x0, y0 + 1), dot(x0 + 1, y0 + 1), u);
  const raw = lerp(top, bottom, v);
  const normalized = (raw / Math.SQRT1_2) * 0.5 + 0.5;
  return Math.min(1, Math.max(0, normalized));
}
