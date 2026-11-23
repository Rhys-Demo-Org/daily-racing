// B11 · Pine Ridge (pine-ridge): a registered, sharp, angular 3-lap track with two ramps and dense
// cone trees, locked until a Hay Loop finish. Checked through the exported content data and the
// sim's public layout.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRACKS, TRACK_LOCKS, getTrack } from '../../src/content/tracks.ts';
import { trackLayout, validateTrack, type TrackLayout } from '../../src/sim/index.ts';

const ID = 'pine-ridge';
const layout = (): TrackLayout => trackLayout(getTrack(ID));

/** Distance along the lap at each centreline sample (the centreline is resampled to ~1 unit). */
function arcLengths(centre: readonly [number, number][]): { s: number[]; length: number } {
  const s = [0];
  for (let i = 1; i < centre.length; i++) {
    const [ax, az] = centre[i - 1] as [number, number];
    const [bx, bz] = centre[i] as [number, number];
    s.push((s[i - 1] as number) + Math.hypot(bx - ax, bz - az));
  }
  const [lx, lz] = centre[centre.length - 1] as [number, number];
  const [fx, fz] = centre[0] as [number, number];
  return { s, length: (s[s.length - 1] as number) + Math.hypot(fx - lx, fz - lz) };
}

/** Signed heading change (degrees) from sample i over the next `span` units of lap. */
function turnOver(centre: readonly [number, number][], i: number, span: number): number {
  const n = centre.length;
  const at = (k: number): [number, number] => centre[((k % n) + n) % n] as [number, number];
  const heading = (k: number): number => {
    const [ax, az] = at(k);
    const [bx, bz] = at(k + 1);
    return Math.atan2(bz - az, bx - ax);
  };
  let total = 0;
  let travelled = 0;
  for (let k = i; travelled < span; k++) {
    const d = heading(k + 1) - heading(k);
    total += Math.atan2(Math.sin(d), Math.cos(d));
    const [ax, az] = at(k);
    const [bx, bz] = at(k + 1);
    travelled += Math.hypot(bx - ax, bz - az);
  }
  return (total * 180) / Math.PI;
}

const nearest = (centre: readonly [number, number][], x: number, z: number): { i: number; d: number } => {
  let best = { i: 0, d: Infinity };
  centre.forEach(([cx, cz], i) => {
    const d = Math.hypot(cx - x, cz - z);
    if (d < best.d) best = { i, d };
  });
  return best;
};

const trees = (l: TrackLayout): TrackLayout['props'] => l.props.filter((p) => p.kind === 'cone-tree');

describe('B11 Pine Ridge', () => {
  it('AC1: pine-ridge is "Pine Ridge", 3 laps, width ≥ 11, valid, registered fourth (last), and locked behind Hay Loop', () => {
    const raw: unknown = JSON.parse(readFileSync('src/content/tracks/pine-ridge.json', 'utf8'));
    expect(() => validateTrack(raw)).not.toThrow();
    const track = getTrack(ID);
    expect(track.name).toBe('Pine Ridge');
    expect(track.laps).toBe(3);
    expect(track.width).toBeGreaterThanOrEqual(11);
    expect(TRACKS.map((t) => t.id)).toEqual(['bends', 'dust-bowl', 'hay-loop', 'pine-ridge']);
    expect(TRACK_LOCKS).toEqual({ 'pine-ridge': { afterFinishOn: 'hay-loop' } });
    for (const t of TRACKS) if (t.id !== ID) expect(Object.keys(TRACK_LOCKS)).not.toContain(t.id);
  });

  it('AC2: exactly 2 ramps and ≥ 4 sharp corners (≥ 60° within 30 units, ≥ 40 units apart); the road never overlaps itself', () => {
    const track = getTrack(ID);
    expect(track.ramps).toHaveLength(2);
    const { centre } = layout();
    const { s, length } = arcLengths(centre);
    // Corners: greedy along the lap, each a window turning ≥ 60° that starts ≥ 40 units after the last
    // corner's window ended (so two corners never share any of their turn).
    const corners: number[] = [];
    let freeFrom = 0;
    for (let i = 0; i < centre.length; i++) {
      const si = s[i] as number;
      if (si < freeFrom) continue;
      if (Math.abs(turnOver(centre, i, 30)) < 60) continue;
      if (corners.length > 0 && length - si + (corners[0] as number) < 40) continue;
      corners.push(si);
      freeFrom = si + 30 + 40;
    }
    expect(corners.length).toBeGreaterThanOrEqual(4);
    // Any two samples more than 60 units apart along the lap are at least width + 2 apart.
    let closest = Infinity;
    for (let i = 0; i < centre.length; i++) {
      for (let j = i + 1; j < centre.length; j++) {
        const along = Math.min((s[j] as number) - (s[i] as number), length - ((s[j] as number) - (s[i] as number)));
        if (along <= 60) continue;
        const [ax, az] = centre[i] as [number, number];
        const [bx, bz] = centre[j] as [number, number];
        closest = Math.min(closest, Math.hypot(bx - ax, bz - az));
      }
    }
    expect(closest).toBeGreaterThanOrEqual(track.width + 2);
  });

  it('AC3: ≥ 60 cone trees, more than any other track, on both sides of the road; no prop within half the width + 1 of the centreline', () => {
    const track = getTrack(ID);
    const l = layout();
    const mine = trees(l);
    expect(mine.length).toBeGreaterThanOrEqual(60);
    for (const other of TRACKS) if (other.id !== ID) expect(mine.length).toBeGreaterThan(trees(trackLayout(other)).length);
    const sides = new Set<number>();
    const n = l.centre.length;
    for (const p of mine) {
      const { i } = nearest(l.centre, p.x, p.z);
      const [ax, az] = l.centre[i] as [number, number];
      const [bx, bz] = l.centre[(i + 1) % n] as [number, number];
      sides.add(Math.sign((bx - ax) * (p.z - az) - (bz - az) * (p.x - ax)));
    }
    expect(sides).toEqual(new Set([-1, 1]));
    for (const p of l.props) expect(nearest(l.centre, p.x, p.z).d).toBeGreaterThanOrEqual(track.width / 2 + 1);
  });
});
