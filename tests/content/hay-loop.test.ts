// B10: Hay Loop, the third track. A long dirt ribbon with an S-bend and a teardrop hairpin at the far
// end, hay bales inside the hairpin, tyre stacks outside it, cone trees in the infield.
import { describe, expect, it } from 'vitest';
import { TRACKS, getTrack, nextTrackId } from '../../src/content/tracks.ts';
import { trackLayout, validateTrack } from '../../src/sim/index.ts';
import { headingOf, wrapAngle } from '../../src/sim/vec.ts';

const DEG = Math.PI / 180;
const track = (): ReturnType<typeof getTrack> => getTrack('hay-loop');

/** The layout's dense centreline with each segment's cumulative (unwrapped) heading and lap distance. */
function geometry() {
  const layout = trackLayout(track());
  const c = layout.centre;
  const n = c.length;
  const pt = (i: number): [number, number] => c[((i % n) + n) % n] as [number, number];
  const heading = (i: number): number => {
    const [ax, az] = pt(i);
    const [bx, bz] = pt(i + 1);
    return headingOf(bx - ax, bz - az);
  };
  // Two laps' worth, so windows may wrap past the start line.
  const turned = [0];
  const dist = [0];
  for (let i = 1; i < 2 * n; i++) {
    const d = heading(i) - heading(i - 1);
    turned.push((turned[i - 1] as number) + wrapAngle(d));
    const [ax, az] = pt(i - 1);
    const [bx, bz] = pt(i);
    dist.push((dist[i - 1] as number) + Math.hypot(bx - ax, bz - az));
  }
  const length = dist[n] as number;
  return { layout, c, n, pt, turned: (i: number) => turned[i] as number, dist: (i: number) => dist[i] as number, length };
}

/** Index range [from, to] of the sharpest turn within 50 units of lap distance. */
function hairpin(g: ReturnType<typeof geometry>): { from: number; to: number; turn: number } {
  let best = { from: 0, to: 0, turn: 0 };
  for (let i = 0; i < g.n; i++) {
    for (let k = i + 1; g.dist(k) - g.dist(i) <= 50; k++) {
      const turn = g.turned(k) - g.turned(i);
      if (Math.abs(turn) > Math.abs(best.turn)) best = { from: i, to: k, turn };
    }
  }
  return best;
}

/** Even-odd test: is (x, z) inside the closed centreline polygon? */
function insideLoop(c: readonly (readonly [number, number])[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = c.length - 1; i < c.length; j = i++) {
    const [xi, zi] = c[i] as [number, number];
    const [xj, zj] = c[j] as [number, number];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, z) to the nearest centreline sample, and that sample's index. */
function nearest(c: readonly (readonly [number, number])[], x: number, z: number): { d: number; i: number } {
  let best = { d: Infinity, i: 0 };
  c.forEach(([px, pz], i) => {
    const d = Math.hypot(px - x, pz - z);
    if (d < best.d) best = { d, i };
  });
  return best;
}

describe('B10: Hay Loop', () => {
  it('AC1: registers as "Hay Loop" (3 laps, width >= 11, valid), after Dust Bowl, wrapping back to Bramble Bends', () => {
    const t = track();
    expect(t.name).toBe('Hay Loop');
    expect(t.laps).toBe(3);
    expect(t.width).toBeGreaterThanOrEqual(11);
    expect(validateTrack(t)).toEqual(t);
    expect(TRACKS.map((x) => x.id)).toContain('hay-loop');
    expect(TRACKS[0]?.id).toBe('bends');
    expect(nextTrackId('dust-bowl')).toBe('hay-loop');
    expect(nextTrackId('hay-loop')).toBe('bends');
  });

  it('AC2: is 1000-1400 units long with a >= 150° hairpin within 50 units and a separate >= 40° S-bend', () => {
    const g = geometry();
    expect(g.length).toBeGreaterThanOrEqual(1000);
    expect(g.length).toBeLessThanOrEqual(1400);
    const pin = hairpin(g);
    expect(Math.abs(pin.turn)).toBeGreaterThanOrEqual(150 * DEG);

    // Lap distance (unwrapped) at index i, measured from the hairpin's start: the S-bend must lie
    // entirely outside the hairpin's window.
    const outsidePin = (i: number): boolean => {
      const s = (((g.dist(i) - g.dist(pin.from)) % g.length) + g.length) % g.length;
      return s > g.dist(pin.to) - g.dist(pin.from);
    };
    let sBend = false;
    const step = 2;
    for (let a = 0; a < g.n && !sBend; a += step) {
      for (let b = a + step; g.dist(b) - g.dist(a) <= 80 && !sBend; b += step) {
        const first = g.turned(b) - g.turned(a);
        if (Math.abs(first) < 40 * DEG) continue;
        for (let c = b; g.dist(c) - g.dist(b) <= 120 && !sBend; c += step) {
          for (let d = c + step; g.dist(d) - g.dist(c) <= 80; d += step) {
            const second = g.turned(d) - g.turned(c);
            if (Math.sign(second) === -Math.sign(first) && Math.abs(second) >= 40 * DEG) {
              if ([a, b, c, d].every(outsidePin)) sBend = true;
              break;
            }
          }
        }
      }
    }
    expect(sBend).toBe(true);
  });

  it('AC3: the ribbon never overlaps itself, and its one ramp lips between 35% and 65% of the lap', () => {
    const g = geometry();
    const minGap = track().width + 2;
    for (let i = 0; i < g.n; i++) {
      for (let j = i + 1; j < g.n; j++) {
        const along = Math.min(g.dist(j) - g.dist(i), g.length - (g.dist(j) - g.dist(i)));
        if (along <= 60) continue;
        const [ax, az] = g.pt(i);
        const [bx, bz] = g.pt(j);
        if (Math.hypot(ax - bx, az - bz) < minGap) expect.fail(`samples ${i} and ${j} are ${Math.hypot(ax - bx, az - bz).toFixed(2)} apart`);
      }
    }
    expect(track().ramps).toHaveLength(1);
    expect(g.layout.ramps).toHaveLength(1);
    const lip = track().ramps[0]?.at ?? -1;
    expect(lip).toBeGreaterThanOrEqual(0.35);
    expect(lip).toBeLessThanOrEqual(0.65);
  });

  it('AC6: >= 6 hay bales inside and >= 6 tyre stacks outside the hairpin, near its edge; no prop on the ribbon', () => {
    const g = geometry();
    const pin = hairpin(g);
    const half = track().width / 2;
    let bales = 0;
    let tyres = 0;
    for (const p of g.layout.props) {
      const { d, i } = nearest(g.c, p.x, p.z);
      expect(d, `${p.kind} at ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`).toBeGreaterThanOrEqual(half + 1);
      const inPin = (((i - pin.from) % g.n) + g.n) % g.n <= pin.to - pin.from;
      if (!inPin || Math.abs(d - half) > 5) continue;
      const inside = insideLoop(g.c, p.x, p.z);
      if (p.kind === 'hay-bale' && inside) bales++;
      if (p.kind === 'tyre-stack' && !inside) tyres++;
    }
    expect(bales).toBeGreaterThanOrEqual(6);
    expect(tyres).toBeGreaterThanOrEqual(6);
  });

  it('AC7: at least 8 cone trees stand in the infield, inside the loop and off the ribbon', () => {
    const g = geometry();
    const half = track().width / 2;
    const infield = g.layout.props.filter((p) => p.kind === 'cone-tree' && insideLoop(g.c, p.x, p.z) && nearest(g.c, p.x, p.z).d > half);
    expect(infield.length).toBeGreaterThanOrEqual(8);
  });
});
