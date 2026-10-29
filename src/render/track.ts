// Ground-level track meshes, built from the sim's TrackLayout. All flat, all normals straight up,
// so they use the flat material and need no hull (see outline.ts groundMesh).
import type { TrackLayout } from '../sim/types.ts';
import type { PaletteName } from '@tokens';
import { MeshBuilder } from './geometry.ts';

/** Heights of the stacked ground layers, so nothing z-fights. */
export const LAYER = { ground: 0, track: 0.02, startBand: 0.035, shadow: 0.05 } as const;

/**
 * Cross-section of the dirt ribbon, left edge to right edge, as fractions of the width with a
 * colour per band: darker edge lines, two rut lines (like the concept frames), dirt between.
 */
const RIBBON_BANDS: readonly { to: number; colour: PaletteName }[] = [
  { to: 0.025, colour: 'dark-dirt' },
  { to: 0.3, colour: 'dirt' },
  { to: 0.315, colour: 'dark-dirt' },
  { to: 0.685, colour: 'dirt' },
  { to: 0.7, colour: 'dark-dirt' },
  { to: 0.975, colour: 'dirt' },
  { to: 1, colour: 'dark-dirt' },
];

type Pt = [number, number];

/** Unit right-hand vector [x, z] of the centreline at index i (forward × up; +x when heading north). */
export function rightAt(centre: readonly Pt[], i: number): Pt {
  const n = centre.length;
  const prev = centre[(i - 1 + n) % n] as Pt;
  const next = centre[(i + 1) % n] as Pt;
  const fx = next[0] - prev[0];
  const fz = next[1] - prev[1];
  const len = Math.hypot(fx, fz) || 1;
  return [-fz / len, fx / len];
}

/** The dirt ribbon with edge and rut lines, one flat mesh around the whole closed centreline. */
export function buildTrackRibbon(layout: TrackLayout): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder();
  const { centre, width } = layout;
  const n = centre.length;
  const offsets = [0, ...RIBBON_BANDS.map((band) => band.to)].map((f) => (f - 0.5) * width);
  const rows = centre.map((p, i) => {
    const r = rightAt(centre, i);
    return offsets.map((o): Pt => [p[0] + r[0] * o, p[1] + r[1] * o]);
  });
  for (let i = 0; i < n; i++) {
    const a = rows[i] as Pt[];
    const c = rows[(i + 1) % n] as Pt[];
    RIBBON_BANDS.forEach((band, k) => {
      b.ground([a[k] as Pt, a[k + 1] as Pt, c[k + 1] as Pt, c[k] as Pt], LAYER.track, band.colour);
    });
  }
  return b.build();
}

/** Chequered cream/ink start band across the track at centreline index 0. */
export function buildStartBand(layout: TrackLayout, columns = 8, rows = 2): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder();
  const p = layout.centre[0] as Pt;
  const r = rightAt(layout.centre, 0);
  const f: Pt = [r[1], -r[0]]; // forward = right rotated back
  const cell = layout.width / columns;
  const depth = 0.85;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const u0 = -layout.width / 2 + col * cell;
      const v0 = (row - rows / 2) * depth;
      const at = (u: number, v: number): Pt => [p[0] + r[0] * u + f[0] * v, p[1] + r[1] * u + f[1] * v];
      const colour: PaletteName = (row + col) % 2 === 0 ? 'cream' : 'ink';
      b.ground([at(u0, v0), at(u0 + cell, v0), at(u0 + cell, v0 + depth), at(u0, v0 + depth)], LAYER.startBand, colour);
    }
  }
  return b.build();
}

/** Grass ground covering the layout's bounds plus a wide margin. */
export function buildGround(layout: TrackLayout, margin = 160): ReturnType<MeshBuilder['build']> {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of layout.centre) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return new MeshBuilder()
    .ground([[x0 - margin, z0 - margin], [x1 + margin, z0 - margin], [x1 + margin, z1 + margin], [x0 - margin, z1 + margin]], LAYER.ground, 'grass')
    .build();
}
