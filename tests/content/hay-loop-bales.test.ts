// R4-1: hay bales in Hay Loop's hairpin row must not overlap each other.
import { describe, expect, it } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { trackLayout } from '../../src/sim/index.ts';
import { HAY_BALE_LENGTH, HAY_BALE_WIDTH } from '../../src/sim/track.ts';

type Box = { x: number; z: number; heading: number };

function corners(b: Box): [number, number][] {
  // Length along heading (forward = (sin h, -cos h)), width across it.
  const fx = Math.sin(b.heading);
  const fz = -Math.cos(b.heading);
  const rx = Math.cos(b.heading);
  const rz = Math.sin(b.heading);
  const hl = HAY_BALE_LENGTH / 2;
  const hw = HAY_BALE_WIDTH / 2;
  return [
    [b.x + fx * hl + rx * hw, b.z + fz * hl + rz * hw],
    [b.x + fx * hl - rx * hw, b.z + fz * hl - rz * hw],
    [b.x - fx * hl - rx * hw, b.z - fz * hl - rz * hw],
    [b.x - fx * hl + rx * hw, b.z - fz * hl + rz * hw],
  ];
}

function overlap(a: Box, b: Box): boolean {
  const ca = corners(a);
  const cb = corners(b);
  for (const h of [a.heading, b.heading]) {
    for (const [ax, az] of [[Math.sin(h), -Math.cos(h)], [Math.cos(h), Math.sin(h)]] as [number, number][]) {
      const pa = ca.map(([x, z]) => x * ax + z * az);
      const pb = cb.map(([x, z]) => x * ax + z * az);
      if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
    }
  }
  return true;
}

describe('R4-1: Hay Loop hay bales', () => {
  it('no two hay bales in the hairpin inside row overlap', () => {
    const bales = trackLayout(getTrack('hay-loop')).props.filter((p) => p.kind === 'hay-bale' && p.x > 200); // the hairpin's inside row
    const bad: string[] = [];
    for (let i = 0; i < bales.length; i++)
      for (let j = i + 1; j < bales.length; j++) {
        const a = bales[i] as Box;
        const b = bales[j] as Box;
        if (overlap(a, b)) bad.push(`${i}(${a.x.toFixed(1)},${a.z.toFixed(1)}) x ${j}(${b.x.toFixed(1)},${b.z.toFixed(1)}) d=${Math.hypot(a.x - b.x, a.z - b.z).toFixed(2)}`);
      }
    expect(bad).toEqual([]);
  });
});
