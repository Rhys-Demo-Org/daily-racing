import { describe, expect, it } from 'vitest';
import { createRng, nextFloat, nextInt, nextRange } from '../../src/sim/rng.ts';
import { clamp, headingOf, wrapAngle } from '../../src/sim/vec.ts';

describe('rng (mulberry32)', () => {
  it('matches the reference mulberry32 sequence for seed 1', () => {
    // Reference values from the canonical mulberry32 implementation.
    const ref = (seed: number): number[] => {
      let a = seed >>> 0;
      const out: number[] = [];
      for (let i = 0; i < 5; i++) {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        out.push(((t ^ (t >>> 14)) >>> 0) / 4294967296);
      }
      return out;
    };
    const rng = createRng(1);
    expect(Array.from({ length: 5 }, () => nextFloat(rng))).toEqual(ref(1));
  });

  it('is reproducible from its seed and differs between seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const c = createRng(43);
    const sa = Array.from({ length: 100 }, () => nextFloat(a));
    const sb = Array.from({ length: 100 }, () => nextFloat(b));
    const sc = Array.from({ length: 100 }, () => nextFloat(c));
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });

  it('keeps all state in the object it is given', () => {
    const a = createRng(7);
    nextFloat(a);
    const snapshot = { ...a };
    const x = nextFloat(a);
    expect(nextFloat(snapshot)).toBe(x);
  });

  it('stays within range and is roughly uniform', () => {
    const rng = createRng(123);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 20000; i++) {
      const v = nextFloat(rng);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]! += 1;
    }
    for (const b of buckets) expect(b).toBeGreaterThan(1700);
    for (let i = 0; i < 1000; i++) {
      const r = nextRange(rng, -2, 3);
      expect(r).toBeGreaterThanOrEqual(-2);
      expect(r).toBeLessThan(3);
      const n = nextInt(rng, 6);
      expect(Number.isInteger(n) && n >= 0 && n < 6).toBe(true);
    }
  });
});

describe('vec', () => {
  it('headingOf follows the heading convention: 0 = north (−z), π/2 = east (+x), clockwise', () => {
    expect(headingOf(0, -1)).toBe(0);
    expect(headingOf(1, 0)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingOf(0, 1)).toBeCloseTo(Math.PI, 12);
    for (const h of [-3, -1.2, 0, 0.4, 1.5707, 2.9]) expect(headingOf(Math.sin(h), -Math.cos(h))).toBeCloseTo(h, 12);
  });

  it('wrapAngle maps into (−π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(wrapAngle(3 * Math.PI + 0.5)).toBeCloseTo(-Math.PI + 0.5, 12);
    expect(wrapAngle(-7)).toBeCloseTo(-7 + 2 * Math.PI, 12);
  });

  it('scalar helpers', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});
