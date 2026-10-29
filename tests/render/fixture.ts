// Hand-written TrackLayout fixture shaped like Dust Bowl, for render tests and the M2 render preview.
// It does NOT use the sim's trackLayout(): render must work from the TrackLayout type alone. The
// control points and prop rows are copied from src/content/tracks/dust-bowl.json (at M2 start) and
// expanded here with three's centripetal Catmull-Rom, roughly as the sim will.
import { CatmullRomCurve3, Vector3 } from 'three';
import type { PropInstance, PropKind, RampInstance, TrackLayout } from '../../src/sim/types.ts';

const WIDTH = 8.4;
const CONTROL: [number, number][] = [
  [-30, 40], [0, 40], [30, 40], [60, 40],
  [88, 28], [100, 0], [88, -28], [60, -40],
  [30, -40], [0, -31], [-30, -40], [-60, -40],
  [-88, -28], [-100, 0], [-88, 28], [-60, 40],
];
const ROWS: { kind: PropKind; side: 'left' | 'right'; from: number; to: number; spacing: number; offset: number }[] = [
  { kind: 'hay-bale', side: 'left', from: 0.02, to: 0.07, spacing: 2.1, offset: 2 },
  { kind: 'hay-bale', side: 'left', from: 0.5, to: 0.62, spacing: 2.1, offset: 2 },
  { kind: 'tyre-stack', side: 'right', from: 0.22, to: 0.42, spacing: 3, offset: 1.5 },
  { kind: 'tyre-stack', side: 'left', from: 0.75, to: 0.9, spacing: 3.2, offset: 1.5 },
  { kind: 'cone-tree', side: 'right', from: 0.46, to: 0.66, spacing: 14, offset: 8 },
  { kind: 'cone-tree', side: 'right', from: 0.0, to: 0.16, spacing: 16, offset: 9 },
];
const POINTS: { kind: PropKind; x: number; z: number }[] = [
  { kind: 'cone-tree', x: -40, z: 2 },
  { kind: 'cone-tree', x: -12, z: 10 },
  { kind: 'cone-tree', x: 18, z: -6 },
  { kind: 'cone-tree', x: 44, z: 12 },
  { kind: 'cone-tree', x: -26, z: -16 },
  { kind: 'cone-tree', x: 62, z: -8 },
];

/** Heading (0 = north, clockwise) of a direction [dx, dz]. */
export const headingOf = (dx: number, dz: number): number => Math.atan2(dx, -dz);

export interface Fixture {
  layout: TrackLayout;
  /** Lap length in units. */
  length: number;
  /** Centreline sample and heading at a lap fraction. */
  at(fraction: number): { x: number; z: number; heading: number };
}

export function dustBowlFixture(): Fixture {
  const curve = new CatmullRomCurve3(CONTROL.map(([x, z]) => new Vector3(x, 0, z)), true, 'centripetal');
  const length = curve.getLength();
  const n = Math.round(length);
  const centre: [number, number][] = curve.getSpacedPoints(n).slice(0, n).map((p) => [p.x, p.z]);
  const at = (f: number): { x: number; z: number; heading: number } => {
    const i = ((Math.round(f * n) % n) + n) % n;
    const p = centre[i] as [number, number];
    const a = centre[(i - 1 + n) % n] as [number, number];
    const b = centre[(i + 1) % n] as [number, number];
    return { x: p[0], z: p[1], heading: headingOf(b[0] - a[0], b[1] - a[1]) };
  };
  const props: PropInstance[] = [];
  for (const row of ROWS) {
    for (let d = row.from * length; d <= row.to * length + 1e-6; d += row.spacing) {
      const s = at(d / length);
      const right: [number, number] = [Math.cos(s.heading), Math.sin(s.heading)];
      const k = (row.side === 'right' ? 1 : -1) * (WIDTH / 2 + row.offset);
      props.push({ kind: row.kind, x: s.x + right[0] * k, z: s.z + right[1] * k, heading: s.heading });
    }
  }
  for (const p of POINTS) props.push({ ...p, heading: 0 });
  const lip = at(0.09);
  const ramps: RampInstance[] = [{ x: lip.x, z: lip.z, heading: lip.heading, length: 5, width: WIDTH, height: 1 }];
  return { layout: { width: WIDTH, centre, startHeading: at(0).heading, ramps, props }, length, at };
}
