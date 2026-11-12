// Hay Loop second pass: the tight hairpin is the fun part, so the rest of the lap needs bite too:
// several genuinely tight corners (hairpin-like radius), both ways, besides the hairpin itself.
import { describe, expect, it } from 'vitest';
import { getTrack } from '../../src/content/tracks.ts';
import { trackLayout } from '../../src/sim/index.ts';
import { headingOf, wrapAngle } from '../../src/sim/vec.ts';

const DEG = Math.PI / 180;
/** A sample is in a corner when the line curves tighter than this radius. */
const CORNER_RADIUS = 80;
/** Curvature is measured over ± this many samples (about a unit apart). */
const SPAN = 5;
/** A tight corner turns at least this far and somewhere curves at this radius or tighter. */
const TIGHT_TURN = 40 * DEG;
const TIGHT_RADIUS = 16;

interface Corner {
  turn: number;
  minRadius: number;
}

/** Maximal runs of samples curving the same way tighter than CORNER_RADIUS, with their turn and tightest radius. */
function corners(): Corner[] {
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
  const step = length / n;
  const curve = (i: number): number => wrapAngle(heading(i + SPAN) - heading(i - SPAN)) / (2 * SPAN * step);
  const way = (i: number): number => (Math.abs(curve(i)) >= 1 / CORNER_RADIUS ? Math.sign(curve(i)) : 0);
  let start = 0;
  while (way(start) !== 0 && start < n) start++;
  const out: Corner[] = [];
  let prev = 0;
  for (let j = 0; j < n; j++) {
    const i = start + j;
    const w = way(i);
    if (w !== 0 && w !== prev) out.push({ turn: 0, minRadius: Infinity });
    const last = out[out.length - 1];
    if (w !== 0 && last) {
      last.turn += wrapAngle(heading(i + 1) - heading(i));
      last.minRadius = Math.min(last.minRadius, 1 / Math.abs(curve(i)));
    }
    prev = w;
  }
  return out;
}

describe('Hay Loop: tight corners beyond the hairpin', () => {
  it('AC1: besides the >= 150° hairpin, at least 4 corners of >= 40° tighten to radius 16 or less, at least 2 each way', () => {
    const tight = corners().filter((k) => Math.abs(k.turn) >= TIGHT_TURN && Math.abs(k.turn) < 150 * DEG && k.minRadius <= TIGHT_RADIUS);
    expect(tight.length).toBeGreaterThanOrEqual(4);
    expect(tight.filter((k) => k.turn > 0).length).toBeGreaterThanOrEqual(2);
    expect(tight.filter((k) => k.turn < 0).length).toBeGreaterThanOrEqual(2);
  });
});
