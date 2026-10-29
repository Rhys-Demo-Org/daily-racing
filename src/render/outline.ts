// Outline helpers: attach an ink inverted hull and crease lines to a mesh, and build meshes with the
// right material + outline in one call. Every non-ground mesh in the scene goes through `solidMesh`
// or `outlinedFlatMesh`; ground-level meshes use `groundMesh`, which refuses non-up normals.
//
// Scene-graph conventions (used by tests and the gate's scene walk):
//   mesh.userData.render = 'toon' | 'flat' | 'ground' | 'hull' | 'crease'
//   a 'toon' or 'flat' mesh has exactly one child with render === 'hull' (and maybe a 'crease' child)
//   a 'ground' mesh uses the flat material and every normal is straight up, so it has no hull.
import { BufferAttribute, BufferGeometry, EdgesGeometry, LineSegments, Mesh } from 'three';
import { paletteIndex } from '@tokens';
import { allNormalsUp, paletteAttribute } from './geometry.ts';
import type { Materials } from './materials/index.ts';

/** Faces meeting at more than this angle (degrees) get a crease line. */
export const CREASE_ANGLE_DEG = 25;

export type RenderRole = 'toon' | 'flat' | 'ground' | 'hull' | 'crease';

interface OutlineGeometries {
  hull: BufferGeometry;
  crease: BufferGeometry;
}

/** Shared geometries are outlined once; every mesh using them reuses the same hull/crease data. */
const cache = new WeakMap<BufferGeometry, OutlineGeometries>();

/**
 * The solid (non-decal) part of a MeshBuilder geometry, used for the hull and crease lines. With no
 * decals it is the mesh's own geometry (so dynamic meshes like dust stay in sync). The hull shader
 * draws ink whatever paletteIndex says; a decal-stripped copy gets ink indices to match.
 */
function solidPart(geo: BufferGeometry): BufferGeometry {
  const total = geo.getAttribute('position').count;
  const marked = geo.userData.solidVertexCount;
  const count = typeof marked === 'number' ? marked : total;
  if (count === total) return geo; // no decals: the hull shares the mesh's geometry (and its updates)
  const out = new BufferGeometry();
  for (const name of ['position', 'normal', 'smoothNormal'] as const) {
    const a = geo.getAttribute(name);
    if (!a) continue;
    out.setAttribute(name, new BufferAttribute((a.array as Float32Array).slice(0, count * a.itemSize), a.itemSize));
  }
  out.setAttribute('paletteIndex', paletteAttribute(new Uint8Array(count).fill(paletteIndex('ink'))));
  return out;
}

function outlineGeometries(geo: BufferGeometry): OutlineGeometries {
  let g = cache.get(geo);
  if (!g) {
    const hull = solidPart(geo);
    const crease = new EdgesGeometry(hull, CREASE_ANGLE_DEG);
    const n = crease.getAttribute('position').count;
    crease.setAttribute('paletteIndex', paletteAttribute(new Uint8Array(n).fill(paletteIndex('ink'))));
    g = { hull, crease };
    cache.set(geo, g);
  }
  return g;
}

/** Adds an ink hull (and, unless `crease` is false, crease lines) as children of `mesh`. */
export function attachOutline(mesh: Mesh, mats: Materials, opts: { crease?: boolean } = {}): Mesh {
  const g = outlineGeometries(mesh.geometry);
  const hull = new Mesh(g.hull, mats.hull);
  hull.userData.render = 'hull' satisfies RenderRole;
  hull.name = 'hull';
  mesh.add(hull);
  if (opts.crease !== false) {
    const lines = new LineSegments(g.crease, mats.crease);
    lines.userData.render = 'crease' satisfies RenderRole;
    lines.name = 'crease';
    mesh.add(lines);
  }
  return mesh;
}

/** A toon-lit mesh with hull and crease lines. */
export function solidMesh(geo: BufferGeometry, mats: Materials, name: string, opts: { crease?: boolean } = {}): Mesh {
  const mesh = new Mesh(geo, mats.toon);
  mesh.name = name;
  mesh.userData.render = 'toon' satisfies RenderRole;
  return attachOutline(mesh, mats, opts);
}

/** An unlit (base colour) mesh that is not ground-level, so it still gets a hull (dust, the ▼ marker). */
export function outlinedFlatMesh(geo: BufferGeometry, mats: Materials, name: string, opts: { crease?: boolean } = {}): Mesh {
  const mesh = new Mesh(geo, mats.flat);
  mesh.name = name;
  mesh.userData.render = 'flat' satisfies RenderRole;
  return attachOutline(mesh, mats, opts);
}

/** A ground-level mesh (track, shadows, grass). Throws unless every normal points straight up. */
export function groundMesh(geo: BufferGeometry, mats: Materials, name: string): Mesh {
  if (!allNormalsUp(geo)) throw new Error(`groundMesh "${name}": every normal must point straight up`);
  const mesh = new Mesh(geo, mats.flat);
  mesh.name = name;
  mesh.userData.render = 'ground' satisfies RenderRole;
  return mesh;
}
