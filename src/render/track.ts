// Ground-level track meshes, built from the sim's TrackLayout. All flat, all normals straight up,
// so they use the flat material and need no hull (see outline.ts groundMesh). There is no grass mesh:
// the renderer's clear colour is the grass.
import type { BufferGeometry } from 'three';
import type { TrackLayout } from '../sim/types.ts';
import type { PaletteName } from '@tokens';
import { MeshBuilder } from './geometry.ts';

/** Heights of the stacked ground layers, so nothing z-fights. */
export const LAYER = { ground: 0, track: 0.02, startBand: 0.035, shadow: 0.05 } as const;

/** Centreline rows per ground chunk: one chunk per draw, small enough for frustum culling to bite. */
export const CHUNK_ROWS = 64;

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
function rightAt(centre: readonly Pt[], i: number): Pt {
  const n = centre.length;
  const prev = centre[(i - 1 + n) % n] as Pt;
  const next = centre[(i + 1) % n] as Pt;
  const fx = next[0] - prev[0];
  const fz = next[1] - prev[1];
  const len = Math.hypot(fx, fz) || 1;
  return [-fz / len, fx / len];
}

/** Index of the centreline row nearest (x, z). Build-time only. */
function nearestRow(centre: readonly Pt[], x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  centre.forEach(([cx, cz], i) => {
    const d = (cx - x) ** 2 + (cz - z) ** 2;
    if (d < bestD) [best, bestD] = [i, d];
  });
  return best;
}

/**
 * The static ground, split along the centreline into chunks of about CHUNK_ROWS rows (one mesh each,
 * so each gets its own bounding sphere): the dirt ribbon with edge and rut lines, the start band
 * (in chunk 0) and the static blob `shadows` (world-space outlines, each in its nearest row's chunk).
 */
export function buildGroundChunks(layout: TrackLayout, shadows: readonly Pt[][]): BufferGeometry[] {
  const { centre, width } = layout;
  const n = centre.length;
  const count = Math.max(1, Math.round(n / CHUNK_ROWS));
  const chunks = Array.from({ length: count }, () => new MeshBuilder());
  const chunkOf = (row: number): MeshBuilder => chunks[Math.floor((row * count) / n)] as MeshBuilder;
  const offsets = [0, ...RIBBON_BANDS.map((band) => band.to)].map((f) => (f - 0.5) * width);
  const rows = centre.map((p, i) => {
    const r = rightAt(centre, i);
    return offsets.map((o): Pt => [p[0] + r[0] * o, p[1] + r[1] * o]);
  });
  for (let i = 0; i < n; i++) {
    const a = rows[i] as Pt[];
    const c = rows[(i + 1) % n] as Pt[];
    const b = chunkOf(i);
    RIBBON_BANDS.forEach((band, k) => b.ground([a[k] as Pt, a[k + 1] as Pt, c[k + 1] as Pt, c[k] as Pt], LAYER.track, band.colour));
  }
  addStartBand(chunks[0] as MeshBuilder, layout);
  for (const s of shadows) {
    const [x, z] = s[0] as Pt;
    chunkOf(nearestRow(centre, x, z)).ground(s, LAYER.shadow, 'ink');
  }
  return chunks.map((b) => b.build());
}

/** Chequered cream/ink start band across the track at centreline index 0. */
function addStartBand(b: MeshBuilder, layout: TrackLayout, columns = 8, rows = 2): void {
  const p = layout.centre[0] as Pt;
  const r = rightAt(layout.centre, 0);
  const f: Pt = [r[1], -r[0]]; // forward = right rotated back
  const cell = layout.width / columns;
  const depth = 0.85;
  const at = (u: number, v: number): Pt => [p[0] + r[0] * u + f[0] * v, p[1] + r[1] * u + f[1] * v];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const u0 = -layout.width / 2 + col * cell;
      const v0 = (row - rows / 2) * depth;
      const colour: PaletteName = (row + col) % 2 === 0 ? 'cream' : 'ink';
      b.ground([at(u0, v0), at(u0 + cell, v0), at(u0 + cell, v0 + depth), at(u0, v0 + depth)], LAYER.startBand, colour);
    }
  }
}
