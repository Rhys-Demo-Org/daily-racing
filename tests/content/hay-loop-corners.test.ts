// Hay Loop play-test: "the tight part of the track is fun and perfect but the rest of it is so
// boring. please make this one lots of corners with a small-ish straight." The lap must be a run of
// many distinct corners, both ways, with only one short straight.
import { describe, expect, it } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { trackLayout } from '../../src/sim/index.ts';
import { headingOf, wrapAngle } from '../../src/sim/vec.ts';

const DEG = Math.PI / 180;
/** A sample is in a corner when the line curves tighter than this radius. */
const CORNER_RADIUS = 80;
/** Curvature is measured over ± this many samples (about a unit apart). */
const SPAN = 5;
/** A straight is a run whose heading stays within a band this wide. */
const STRAIGHT_BAND = 6 * DEG;

function lap() {
  const c = trackLayout(getTrack('hay-loop')).centre;
  const n = c.length;
  const pt = (i: number): [number, number] => c[((i % n) + n) % n] as [number, number];
  const heading = (i: number): number => {
    const [ax, az] = pt(i);
    const [bx, bz] = pt(i + 1);
    return headingOf(bx - ax, bz - az);
  };
  let length = 0;
  for (let i = 0; i < n; i++) {
    const [ax, az] = pt(i);
    const [bx, bz] = pt(i + 1);
    length += Math.hypot(bx - ax, bz - az);
  }
  return { n, heading, step: length / n, length };
}

/** Signed turn of every corner: maximal runs of samples curving the same way tighter than CORNER_RADIUS. */
function corners(): number[] {
  const { n, heading, step } = lap();
  const curve = (i: number): number => wrapAngle(heading(i + SPAN) - heading(i - SPAN)) / (2 * SPAN * step);
  const way = (i: number): number => (Math.abs(curve(i)) >= 1 / CORNER_RADIUS ? Math.sign(curve(i)) : 0);
  // Start where the line is not curving, so no corner is split across the start.
  let start = 0;
  while (way(start) !== 0 && start < n) start++;
  const turns: number[] = [];
  let prev = 0;
  for (let j = 0; j < n; j++) {
    const i = start + j;
    const w = way(i);
    if (w !== 0 && w !== prev) turns.push(0);
    if (w !== 0) turns[turns.length - 1] = (turns[turns.length - 1] as number) + wrapAngle(heading(i + 1) - heading(i));
    prev = w;
  }
  return turns;
}

/** Lengths of the straights, longest first: the lap cut greedily into runs whose heading stays within STRAIGHT_BAND. */
function straights(): { lengths: number[]; length: number } {
  const { n, heading, step, length } = lap();
  const lengths: number[] = [];
  for (let i = 0; i < n; ) {
    let lo = 0;
    let hi = 0;
    let turned = 0;
    let j = 1;
    for (; i + j <= n; j++) {
      turned += wrapAngle(heading(i + j) - heading(i + j - 1));
      lo = Math.min(lo, turned);
      hi = Math.max(hi, turned);
      if (hi - lo > STRAIGHT_BAND) break;
    }
    lengths.push(j * step);
    i += j;
  }
  return { lengths: lengths.sort((a, b) => b - a), length };
}

describe('Hay Loop: lots of corners, one small-ish straight', () => {
  it('AC1: the lap has at least 12 distinct corners of 30° or more, at least 4 each way', () => {
    const big = corners().filter((t) => Math.abs(t) >= 30 * DEG);
    expect(big.length).toBeGreaterThanOrEqual(12);
    expect(big.filter((t) => t > 0).length).toBeGreaterThanOrEqual(4);
    expect(big.filter((t) => t < 0).length).toBeGreaterThanOrEqual(4);
  });

  it('AC2: the longest straight is at most 12% of the lap, and it is the only one longer than 60 units', () => {
    const { lengths, length } = straights();
    expect(lengths[0] as number).toBeLessThanOrEqual(0.12 * length);
    expect(lengths.filter((l) => l > 60)).toHaveLength(1);
  });
});
