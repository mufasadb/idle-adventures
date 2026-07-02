// Deterministic, stateless randomness per the engine contract: RNG = hash(seed, context).
// No PRNG state is ever carried — every roll names its context explicitly.

export function hashString(s: string): number {
  // FNV-1a 32-bit, then a murmur3-style finalizer so near-identical
  // strings (e.g. "poi-x|1" vs "poi-x|2") don't produce correlated values.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function rand(seed: string, ...context: (string | number)[]): number {
  return hashString([seed, ...context].join("|")) / 0x100000000;
}

// Maps roll ∈ [0,1) onto cumulative bands of `weights`, walked in `order`.
// Zero/absent weights are skipped; remaining weights are normalized.
export function weightedPick<K extends string>(
  weights: Partial<Record<K, number>>,
  order: readonly K[],
  roll: number,
): K {
  let total = 0;
  for (const k of order) total += weights[k] ?? 0;
  if (total <= 0) throw new Error("weightedPick: all weights zero");
  let acc = 0;
  for (const k of order) {
    const w = weights[k] ?? 0;
    if (w === 0) continue;
    acc += w / total;
    if (roll < acc) return k;
  }
  for (const k of [...order].reverse()) {
    if ((weights[k] ?? 0) > 0) return k;
  }
  throw new Error("weightedPick: unreachable");
}
