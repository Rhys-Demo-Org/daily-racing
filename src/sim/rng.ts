// Seeded mulberry32 PRNG. The state lives in an object that callers pass around explicitly, so the
// simulation never has hidden module-level randomness and is reproducible from its seed.

export interface Rng {
  /** Current 32-bit state. Copying this number snapshots the generator. */
  state: number;
}

/** Creates a generator from any number; non-integers are truncated to 32 bits. */
export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Next float in [0, 1). Advances the generator. */
export function nextFloat(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Next float in [lo, hi). */
export function nextRange(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(rng);
}

/** Next integer in [0, n). */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(nextFloat(rng) * n);
}
