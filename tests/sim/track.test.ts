import { describe, expect, it } from 'vitest';
import type { TrackData } from '../../src/sim/types.ts';
import {
  HAY_BALE_LENGTH,
  HAY_BALE_WIDTH,
  TREE_TRUNK_RADIUS,
  TYRE_STACK_RADIUS,
  buildTrack,
  groundAt,
  nearestGlobal,
  nearestLocal,
  projectOnSegment,
  sampleAt,
  surfaceAt,
  trackLayout,
  trackPosition,
  validateTrack,
} from '../../src/sim/track.ts';
import { wrapAngle } from '../../src/sim/vec.ts';
import { dustBowl, hairpinTrack } from './helpers.ts';

describe('validateTrack', () => {
  it('accepts Dust Bowl and returns an equal copy', () => {
    const t = validateTrack(dustBowl);
    expect(t).toEqual(dustBowl);
    expect(t).not.toBe(dustBowl);
  });

  const bad: [string, (t: Record<string, unknown>) => void, RegExp][] = [
    ['id not kebab-case', (t) => (t['id'] = 'Dust Bowl'), /id/],
    ['missing name', (t) => delete t['name'], /name/],
    ['zero laps', (t) => (t['laps'] = 0), /laps/],
    ['fractional laps', (t) => (t['laps'] = 2.5), /laps/],
    ['negative width', (t) => (t['width'] = -1), /width/],
    ['width as string', (t) => (t['width'] = '8.4'), /width/],
    ['too few points', (t) => (t['centreline'] = [[0, 0], [10, 0], [10, 10]]), /at least 4/],
    ['NaN point', (t) => (t['centreline'] = [[0, 0], [10, 0], [10, Number.NaN], [0, 10]]), /centreline\[2\]/],
    ['3-number point', (t) => (t['centreline'] = [[0, 0, 1], [10, 0], [10, 10], [0, 10]]), /centreline\[0\]/],
    ['duplicate points', (t) => (t['centreline'] = [[0, 0], [10, 0], [10, 0], [0, 10]]), /closer/],
    ['ramp past the lap', (t) => (t['ramps'] = [{ at: 1.2, length: 5, height: 1 }]), /ramps\[0\]\.at/],
    ['ramp without height', (t) => (t['ramps'] = [{ at: 0.2, length: 5 }]), /ramps\[0\]\.height/],
    ['unknown prop kind', (t) => (t['props'] = [{ kind: 'rock', x: 0, z: 0 }]), /props\[0\]\.kind/],
    ['prop x as string', (t) => (t['props'] = [{ kind: 'cone-tree', x: '1', z: 0 }]), /props\[0\]\.x/],
    [
      'row side',
      (t) => (t['propRows'] = [{ kind: 'hay-bale', side: 'up', from: 0, to: 0.1, spacing: 2, offset: 1 }]),
      /propRows\[0\]\.side/,
    ],
    [
      'row from > to',
      (t) => (t['propRows'] = [{ kind: 'hay-bale', side: 'left', from: 0.5, to: 0.1, spacing: 2, offset: 1 }]),
      /propRows\[0\]/,
    ],
    ['ramps not an array', (t) => (t['ramps'] = {}), /ramps must be an array/],
  ];
  for (const [label, mutate, message] of bad) {
    it(`rejects ${label}`, () => {
      const t = structuredClone(dustBowl) as unknown as Record<string, unknown>;
      mutate(t);
      expect(() => validateTrack(t)).toThrow(message);
    });
  }

  it('rejects non-objects', () => {
    expect(() => validateTrack(null)).toThrow(/expected an object/);
    expect(() => validateTrack([1, 2])).toThrow(/expected an object/);
    expect(() => validateTrack('dust-bowl')).toThrow(/expected an object/);
  });

  it('names the track in the error', () => {
    const t = { ...structuredClone(dustBowl), laps: -1 };
    expect(() => validateTrack(t)).toThrow(/Invalid track "dust-bowl"/);
  });
});

describe('Dust Bowl geometry', () => {
  const track = buildTrack(validateTrack(dustBowl));

  it('is resampled to about 1 unit spacing, closed, starting on the first control point', () => {
    expect(track.spacing).toBeGreaterThan(0.95);
    expect(track.spacing).toBeLessThan(1.05);
    for (let i = 0; i < track.count; i++) {
      const k = (i + 1) % track.count;
      const d = Math.hypot(track.xs[k]! - track.xs[i]!, track.zs[k]! - track.zs[i]!);
      expect(Math.abs(d - track.spacing)).toBeLessThan(0.05);
    }
    expect(track.xs[0]).toBeCloseTo(dustBowl.centreline[0]![0], 9);
    expect(track.zs[0]).toBeCloseTo(dustBowl.centreline[0]![1], 9);
    expect(track.length).toBeGreaterThan(900);
    expect(track.length).toBeLessThan(1100);
  });

  it('passes through every control point', () => {
    for (const [x, z] of dustBowl.centreline) {
      expect(nearestGlobal(track, x, z).distance).toBeLessThan(0.05);
    }
  });

  it('drives east along the south straight with the infield on the left', () => {
    expect(track.layout.startHeading).toBeCloseTo(Math.PI / 2, 2);
    // The middle of the infield is left (negative lateral) of the nearest centreline.
    expect(nearestGlobal(track, 0, 10).lateral).toBeLessThan(0);
    expect(nearestGlobal(track, 0, 120).lateral).toBeGreaterThan(0);
  });

  it('samples by arc length and wraps around the lap', () => {
    const a = sampleAt(track, 0);
    expect(a.x).toBeCloseTo(track.xs[0]!, 9);
    const b = sampleAt(track, track.length);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.z).toBeCloseTo(a.z, 6);
    const c = sampleAt(track, -10);
    const d = sampleAt(track, track.length - 10);
    expect(c.x).toBeCloseTo(d.x, 6);
    // 10 units along the straight is 10 units east.
    expect(sampleAt(track, 10).x - a.x).toBeCloseTo(10, 1);
  });

  it('projects points to arc length and signed lateral offset', () => {
    for (const s of [3.3, 100, 400.5, 777, track.length - 2]) {
      const p = sampleAt(track, s);
      const off = 2.5;
      const x = p.x + Math.cos(p.heading) * off;
      const z = p.z + Math.sin(p.heading) * off;
      const pos = nearestGlobal(track, x, z);
      expect(pos.s).toBeCloseTo(s, 0);
      expect(pos.lateral).toBeCloseTo(off, 1);
    }
  });

  it('reports dirt within half the width and grass beyond it', () => {
    const p = sampleAt(track, 200);
    const at = (off: number): string => {
      const x = p.x + Math.cos(p.heading) * off;
      const z = p.z + Math.sin(p.heading) * off;
      return surfaceAt(track, nearestGlobal(track, x, z), x, z);
    };
    expect(at(0)).toBe('dirt');
    expect(at(4.1)).toBe('dirt');
    expect(at(-4.1)).toBe('dirt');
    expect(at(4.3)).toBe('grass');
    expect(at(-4.3)).toBe('grass');
    expect(at(30)).toBe('grass');
  });

  it('has a ramp shortly after the start whose height rises to the lip', () => {
    expect(track.ramps).toHaveLength(1);
    const r = track.ramps[0]!;
    expect(nearestGlobal(track, r.x, r.z).s).toBeCloseTo(0.09 * track.length, 0);
    expect(r.width).toBe(dustBowl.width);
    const fx = Math.sin(r.heading);
    const fz = -Math.cos(r.heading);
    const at = (along: number, lat = 0): number =>
      groundAt(track, r.x + fx * along - fz * lat, r.z + fz * along + fx * lat).h;
    expect(at(-0.001)).toBeCloseTo(r.height, 2);
    expect(at(-r.length / 2)).toBeCloseTo(r.height / 2, 6);
    expect(at(-r.length - 0.01)).toBe(0);
    expect(at(0.01)).toBe(0);
    expect(at(-1, r.width / 2 + 0.01)).toBe(0);
    expect(at(-1, r.width / 2 - 0.01)).toBeGreaterThan(0);
  });

  it('expands props deterministically with the expected kinds', () => {
    const a = trackLayout(dustBowl);
    const b = trackLayout(structuredClone(dustBowl));
    expect(a).toEqual(b);
    const kinds = new Set(a.props.map((p) => p.kind));
    expect(kinds).toEqual(new Set(['hay-bale', 'tyre-stack', 'cone-tree']));
    expect(a.centre).toHaveLength(track.count);
    expect(a.width).toBe(8.4);
    expect(a.ramps).toEqual(track.ramps);
  });

  it('aligns hay bales with their row and puts infield bales on the left', () => {
    const bales = track.props.filter((p) => p.kind === 'hay-bale');
    expect(bales.length).toBeGreaterThan(10);
    for (const b of bales) {
      const pos = nearestGlobal(track, b.x, b.z);
      expect(Math.abs(wrapAngle(b.heading - track.headings[pos.seg]!))).toBeLessThan(0.1);
      expect(pos.lateral).toBeLessThan(0);
    }
  });

  it('keeps every prop collider off the dirt', () => {
    for (const c of track.colliders) {
      const d = nearestGlobal(track, c.x, c.z).distance;
      expect(d - c.bound).toBeGreaterThan(track.halfWidth);
    }
  });

  it('builds colliders of the right shape and size', () => {
    track.props.forEach((p, i) => {
      const c = track.colliders[i]!;
      expect(c.x).toBe(p.x);
      expect(c.z).toBe(p.z);
      if (p.kind === 'hay-bale') {
        expect(c.shape).toBe('box');
        if (c.shape === 'box') {
          expect(c.halfLength * 2).toBe(HAY_BALE_LENGTH);
          expect(c.halfWidth * 2).toBe(HAY_BALE_WIDTH);
          expect(c.heading).toBe(p.heading);
        }
      } else {
        expect(c.shape).toBe('circle');
        if (c.shape === 'circle') {
          expect(c.r).toBe(p.kind === 'tyre-stack' ? TYRE_STACK_RADIUS : TREE_TRUNK_RADIUS);
        }
      }
    });
  });
});

describe('nearest-centreline search on a hairpin', () => {
  const track = buildTrack(validateTrack(hairpinTrack()));
  /** Arc-length range of leg A (z = 0, x 10..170) and leg B (z = −16). */
  const legA = [nearestGlobal(track, 10, 0).s, nearestGlobal(track, 170, 0).s] as const;
  const onLegA = (s: number): boolean => s >= legA[0] && s <= legA[1];

  it('the fixture really has a point closer to leg B than leg A', () => {
    const g = nearestGlobal(track, 150, -11);
    const toA = projectOnSegment(track, nearestGlobal(track, 150, 0).seg, 150, -11).distance;
    expect(onLegA(g.s)).toBe(false);
    expect(g.distance).toBeGreaterThan(track.halfWidth); // on grass, not on leg B's dirt
    expect(g.distance).toBeLessThan(toA - 4);
  });

  it('local search stays on leg A while a car drifts across the grass toward leg B', () => {
    let pos = nearestGlobal(track, 140, 0);
    for (let k = 0; k <= 60; k++) {
      // Drift north-east from leg A into the grass gap, ending 5 from leg B (still on grass).
      const x = 140 + k * 0.2;
      const z = -k * (11 / 60);
      pos = nearestLocal(track, x, z, pos.seg);
      expect(onLegA(pos.s)).toBe(true);
      const tracked = trackPosition(track, x, z, pos);
      expect(onLegA(tracked.s)).toBe(true);
    }
    expect(pos.lateral).toBeLessThan(-10);
    expect(pos.lateral).toBeGreaterThan(-12);
  });

  it('re-acquires only once the car is on the other leg’s dirt', () => {
    const start = nearestGlobal(track, 100, 0);
    const onB = trackPosition(track, 100, -15, start);
    expect(onLegA(onB.s)).toBe(false);
    expect(onB.distance).toBeLessThan(1.01);
  });

  it('progress advances smoothly around the whole lap, hairpin included', () => {
    let pos = nearestGlobal(track, track.xs[0]!, track.zs[0]!);
    let travelled = 0;
    const step = 0.5;
    for (let s = step; s <= track.length; s += step) {
      const p = sampleAt(track, s);
      // Ride 2 units right of the centreline (outside of the hairpin).
      const x = p.x + Math.cos(p.heading) * 2;
      const z = p.z + Math.sin(p.heading) * 2;
      const next = nearestLocal(track, x, z, pos.seg);
      let ds = next.s - pos.s;
      if (ds < -track.length / 2) ds += track.length;
      expect(ds).toBeGreaterThan(0);
      expect(ds).toBeLessThan(1.5);
      travelled += ds;
      pos = next;
    }
    expect(travelled).toBeCloseTo(track.length, -1);
  });
});

describe('trackLayout', () => {
  it('validates its input', () => {
    const broken = { ...structuredClone(dustBowl), centreline: [] } as TrackData;
    expect(() => trackLayout(broken)).toThrow(/centreline/);
  });
});
