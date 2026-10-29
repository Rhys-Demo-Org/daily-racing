// Shared helpers for render tests: the real Dust Bowl layout, car views and a scene-graph walk.
import type { BufferGeometry, Line, Mesh, Object3D } from 'three';
import { trackLayout, type CarView } from '../../src/sim/index.ts';
import { dustBowl } from '../sim/helpers.ts';

export const layout = trackLayout(dustBowl);

/** Centreline point and driving heading (0 = north, clockwise) at a lap fraction of Dust Bowl. */
export function at(fraction: number): { x: number; z: number; heading: number } {
  const c = layout.centre;
  const n = c.length;
  const i = ((Math.round(fraction * n) % n) + n) % n;
  const [x, z] = c[i] as [number, number];
  const [ax, az] = c[(i - 1 + n) % n] as [number, number];
  const [bx, bz] = c[(i + 1) % n] as [number, number];
  return { x, z, heading: Math.atan2(bx - ax, -(bz - az)) };
}

export function carView(over: Partial<CarView> = {}): CarView {
  return { x: 0, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false, ...over };
}

export function meshesOf(root: Object3D): Mesh[] {
  const out: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
}

export function linesOf(root: Object3D): Line[] {
  const out: Line[] = [];
  root.traverse((o) => {
    if ((o as Line).isLine) out.push(o as Line);
  });
  return out;
}

/** Distinct palette indices used by a geometry (optionally only from vertex `from` onward). */
export function paletteSet(geo: BufferGeometry, from = 0): Set<number> {
  const a = geo.getAttribute('paletteIndex');
  const s = new Set<number>();
  for (let i = from; i < a.count; i++) s.add(a.getX(i));
  return s;
}
