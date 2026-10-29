// Geometry helpers: every render mesh is built with MeshBuilder.
//
// Output is non-indexed, flat-shaded BufferGeometry with:
// - `position`, `normal` (one face normal per triangle, so shading is faceted),
// - `paletteIndex` (Uint8, gpuType IntType): the face's BASE colour; the toon shader steps it down,
// - `smoothNormal`: per-position average of the touching face normals, used by the outline hull.
//
// "Decal" triangles (stripes, race numbers) sit a hair above a surface. They are stored after the
// solid triangles (geometry.userData.solidVertexCount marks the split) and are left out of the hull
// and crease lines, so they read as paint rather than as separate outlined blocks.
import { BufferAttribute, BufferGeometry, IntType, Vector3 } from 'three';
import { paletteIndex, type PaletteName } from '@tokens';

export type Vec3 = readonly [number, number, number];

/** A face colour: fixed, or chosen from the face's outward normal. */
export type Paint = PaletteName | ((normal: Vector3) => PaletteName);

/** Lathe profile point: [radius, y]. */
export type ProfilePoint = readonly [number, number];

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _n = new Vector3();
const _e1 = new Vector3();
const _e2 = new Vector3();

/** Builds flat-shaded, palette-indexed triangle soups. Build-time only; not for per-frame use. */
export class MeshBuilder {
  private readonly solid: { pos: number[]; col: number[] } = { pos: [], col: [] };
  private readonly decal: { pos: number[]; col: number[] } = { pos: [], col: [] };
  private target = this.solid;

  /** Everything added inside `fn` is a decal: no hull, no crease lines. */
  decals(fn: () => void): this {
    const prev = this.target;
    this.target = this.decal;
    try {
      fn();
    } finally {
      this.target = prev;
    }
    return this;
  }

  /**
   * One triangle. If `outward` is given, the winding is fixed so the face normal points along it
   * (so callers never have to get winding right by hand).
   */
  tri(a: Vec3, b: Vec3, c: Vec3, paint: Paint, outward?: Vec3): this {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    _c.set(c[0], c[1], c[2]);
    _n.crossVectors(_e1.subVectors(_b, _a), _e2.subVectors(_c, _a));
    if (_n.lengthSq() < 1e-12) return this; // degenerate
    if (outward && _n.dot(_e1.set(outward[0], outward[1], outward[2])) < 0) {
      _n.negate();
      const t = _b.clone();
      _b.copy(_c);
      _c.copy(t);
    }
    _n.normalize();
    const name = typeof paint === 'string' ? paint : paint(_n.clone());
    this.target.pos.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z, _c.x, _c.y, _c.z);
    this.target.col.push(paletteIndex(name));
    return this;
  }

  /** Convex polygon (points in order around it), fanned from the first point. */
  polygon(points: readonly Vec3[], paint: Paint, outward: Vec3): this {
    const first = points[0];
    if (!first) return this;
    for (let i = 1; i + 1 < points.length; i++) this.tri(first, points[i] as Vec3, points[i + 1] as Vec3, paint, outward);
    return this;
  }

  /** Quad a-b-c-d (in order around it). */
  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, paint: Paint, outward: Vec3): this {
    return this.polygon([a, b, c, d], paint, outward);
  }

  /** Flat polygon at height y facing straight up (ground-level shapes). Points are [x, z]. */
  ground(points: readonly (readonly [number, number])[], y: number, paint: Paint): this {
    return this.polygon(
      points.map(([x, z]) => [x, y, z] as const),
      paint,
      [0, 1, 0],
    );
  }

  /** Axis-aligned box from `min` to `max`. */
  box(min: Vec3, max: Vec3, paint: Paint): this {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], paint, [0, 1, 0]); // top
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], paint, [0, -1, 0]); // bottom
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], paint, [0, 0, 1]); // south
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], paint, [0, 0, -1]); // north
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], paint, [1, 0, 0]); // east
    this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], paint, [-1, 0, 0]); // west
    return this;
  }

  /**
   * Solid of revolution around +y. `profile` runs bottom to top along the outside, starting and
   * ending on the axis (r = 0) for closed caps, e.g. a cylinder is [[0,0],[r,0],[r,h],[0,h]].
   */
  lathe(profile: readonly ProfilePoint[], segments: number, paint: Paint, phase = 0): this {
    for (let p = 0; p + 1 < profile.length; p++) {
      const [r0, y0] = profile[p] as ProfilePoint;
      const [r1, y1] = profile[p + 1] as ProfilePoint;
      if (r0 === 0 && r1 === 0) continue;
      // Outward normal of this profile segment in the (r, y) plane: right-hand perpendicular.
      const nr = y1 - y0;
      const ny = -(r1 - r0);
      for (let s = 0; s < segments; s++) {
        const t0 = phase + (s / segments) * Math.PI * 2;
        const t1 = phase + ((s + 1) / segments) * Math.PI * 2;
        const tm = (t0 + t1) / 2;
        const out: Vec3 = [nr * Math.cos(tm), ny, nr * Math.sin(tm)];
        const p00: Vec3 = [r0 * Math.cos(t0), y0, r0 * Math.sin(t0)];
        const p01: Vec3 = [r0 * Math.cos(t1), y0, r0 * Math.sin(t1)];
        const p10: Vec3 = [r1 * Math.cos(t0), y1, r1 * Math.sin(t0)];
        const p11: Vec3 = [r1 * Math.cos(t1), y1, r1 * Math.sin(t1)];
        if (r0 === 0) this.tri(p00, p10, p11, paint, out);
        else if (r1 === 0) this.tri(p00, p01, p10, paint, out);
        else this.quad(p00, p01, p11, p10, paint, out);
      }
    }
    return this;
  }

  /** Number of triangles added so far. */
  get triangleCount(): number {
    return this.solid.col.length + this.decal.col.length;
  }

  /** Builds the geometry (solid triangles first, then decals). */
  build(): BufferGeometry {
    const pos = new Float32Array([...this.solid.pos, ...this.decal.pos]);
    const faces = [...this.solid.col, ...this.decal.col];
    const solidVertexCount = this.solid.col.length * 3;
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.computeVertexNormals(); // non-indexed: each vertex gets its triangle's face normal
    const idx = new Uint8Array(faces.length * 3);
    faces.forEach((c, f) => idx.fill(c, f * 3, f * 3 + 3));
    geo.setAttribute('paletteIndex', paletteAttribute(idx));
    geo.setAttribute('smoothNormal', new BufferAttribute(smoothNormals(geo, solidVertexCount), 3));
    geo.userData = { solidVertexCount };
    return geo;
  }
}

/** A Uint8 palette-index attribute read as an integer in GLSL (`in uint paletteIndex`). */
export function paletteAttribute(indices: Uint8Array): BufferAttribute {
  const attr = new BufferAttribute(indices, 1);
  attr.gpuType = IntType;
  return attr;
}

/**
 * Per-position average of the distinct face normals touching it (positions merged at 1e-3).
 * Vertices at or after `solidCount` (decals) just keep their face normal.
 */
export function smoothNormals(geo: BufferGeometry, solidCount: number): Float32Array {
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const out = new Float32Array(pos.count * 3);
  const key = (i: number): string => `${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`;
  const sums = new Map<string, { v: Vector3; seen: Set<string> }>();
  const n = new Vector3();
  for (let i = 0; i < solidCount; i++) {
    n.fromBufferAttribute(nrm, i);
    const k = key(i);
    const nk = `${Math.round(n.x * 100)},${Math.round(n.y * 100)},${Math.round(n.z * 100)}`;
    let s = sums.get(k);
    if (!s) sums.set(k, (s = { v: new Vector3(), seen: new Set() }));
    if (!s.seen.has(nk)) {
      s.seen.add(nk);
      s.v.add(n);
    }
  }
  for (let i = 0; i < pos.count; i++) {
    const s = i < solidCount ? sums.get(key(i)) : undefined;
    if (s && s.v.lengthSq() > 1e-10) n.copy(s.v).normalize();
    else n.fromBufferAttribute(nrm, i);
    n.toArray(out, i * 3);
  }
  return out;
}

/** True if every normal in the geometry points straight up (the flat-material hull exemption). */
export function allNormalsUp(geo: BufferGeometry): boolean {
  const nrm = geo.getAttribute('normal');
  if (!nrm) return false;
  for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0.9999) return false;
  return true;
}
