// B12 pickups: a layout pickup sits |lateral| from the centreline, on the documented side (AC1).
import { describe, expect, it } from 'vitest';
import { trackLayout, validateTrack, type TrackData } from '../../src/sim/index.ts';
import { dustBowl, TRACKS } from './helpers.ts';

type Pt = { x: number; z: number };
const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.z - b.z);

describe('B12 pickups: lateral offset in the layout', () => {
  for (const base of [dustBowl, TRACKS.find((t) => t.name === 'Bramble Bends') as TrackData]) {
    it(`AC1: on ${base.name}, lateral ±3 puts boxes 3 units right/left of the centreline`, () => {
      const t = structuredClone(base);
      t.pickups = [
        { at: 0.5, lateral: 3 },
        { at: 0.5, lateral: -3 },
        { at: 0.25, lateral: 0 },
      ];
      const layout = trackLayout(validateTrack(t));
      const [right, left, centre] = layout.pickups as [Pt, Pt, Pt];
      expect(dist(right, left)).toBeCloseTo(6, 1);

      // The midpoint is the centreline point; each box is 3 from it, perpendicular to the track.
      const mid = { x: (right.x + left.x) / 2, z: (right.z + left.z) / 2 };
      const n = layout.centre.length;
      const near = layout.centre.reduce((best, c, i) => (Math.hypot(c[0] - mid.x, c[1] - mid.z) < Math.hypot((layout.centre[best] as [number, number])[0] - mid.x, (layout.centre[best] as [number, number])[1] - mid.z) ? i : best), 0);
      const [cx, cz] = layout.centre[near] as [number, number];
      expect(Math.hypot(cx - mid.x, cz - mid.z)).toBeLessThan(1.5);
      expect(dist(right, mid)).toBeCloseTo(3, 1);

      // Driving direction from the centreline samples; right of it is (-dz, dx) (x right, -z ahead).
      const [ax, az] = layout.centre[(near - 1 + n) % n] as [number, number];
      const [bx, bz] = layout.centre[(near + 1) % n] as [number, number];
      const len = Math.hypot(bx - ax, bz - az);
      const dir = { x: (bx - ax) / len, z: (bz - az) / len };
      const off = { x: right.x - mid.x, z: right.z - mid.z };
      expect(off.x * -dir.z + off.z * dir.x).toBeGreaterThan(2.9);
      expect(Math.abs(off.x * dir.x + off.z * dir.z)).toBeLessThan(0.3);

      // A zero lateral box sits on the centreline.
      const minC = Math.min(...layout.centre.map(([x, z]) => Math.hypot(x - centre.x, z - centre.z)));
      expect(minC).toBeLessThan(len);
    });
  }

  it('AC1: Dust Bowl rows keep their lateral spread in the layout', () => {
    const data = dustBowl.pickups ?? [];
    const layout = trackLayout(dustBowl);
    data.forEach((a, i) => {
      data.forEach((b, j) => {
        if (j <= i || a.at !== b.at) return;
        const d = dist(layout.pickups[i] as Pt, layout.pickups[j] as Pt);
        expect(d).toBeCloseTo(Math.abs(a.lateral - b.lateral), 1);
      });
    });
  });
});
