// Scene-graph measurements in Node (plans/full-pipeline.md "The 7th day"): every registered track's
// race scene and the car meshes, built headlessly (no WebGL) from a tree's own src/ with its own
// Three.js. Two uses:
//   hash   one hash per object over its geometry (every attribute's values, palette indices
//          included, the index, groups, draw range), its materials (kind, render state, uniforms)
//          and its world transform: gate P2 compares main's with the branch's (lib/preserve.ts).
//   stats  meshes, lines, triangles and draw calls (one per drawable object and material group)
//          per track and car, for the Sunday performance survey.
//
//   node harness/screens/scene.ts <tree> hash|stats
//
// Prints one JSON line, stamped with GATE_NONCE when set (a gate measure step's only way out).
// The scene is built through the public render seam only: src/render/index.ts (createRaceScene,
// buildCar, createMaterials, playerLivery) and src/sim/index.ts (validateTrack, trackLayout), with
// the tracks read from src/content/tracks/*.json. This file imports no Three.js itself, so the
// tree's copy is the only one.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** One object of a scene graph, as the hash and the stats see it. */
export interface SceneEntry {
  /** `/`-joined names (or `type[index]` for unnamed objects) from the root. */
  path: string;
  type: string;
  /** sha256 (16 hex) over everything that reaches the screen; '' for a plain group. */
  hash: string;
  /** Draw calls this object costs: material groups for a mesh or line, else 0. */
  draws: number;
  triangles: number;
  vertices: number;
}

/** Floats are compared at 1e-6 so equal geometry built with reordered arithmetic still matches. */
const q = (v: number): string => (Number.isInteger(v) ? String(v) : (Math.round(v * 1e6) / 1e6).toString());

type Obj = {
  name: string;
  type: string;
  visible: boolean;
  renderOrder: number;
  frustumCulled: boolean;
  children: Obj[];
  matrixWorld: { elements: ArrayLike<number> };
  userData: Record<string, unknown>;
  geometry?: Geo;
  material?: Mat | Mat[];
  isMesh?: boolean;
  isLine?: boolean;
  isPoints?: boolean;
  isLineSegments?: boolean;
};
type Attr = { array: ArrayLike<number>; itemSize: number; normalized: boolean; count: number };
type Geo = {
  attributes: Record<string, Attr>;
  index: Attr | null;
  groups: { start: number; count: number; materialIndex?: number }[];
  drawRange: { start: number; count: number };
};
type Mat = { type: string; userData: Record<string, unknown>; side: number; transparent: boolean; depthTest: boolean; depthWrite: boolean; visible: boolean; uniforms?: Record<string, { value: unknown }> };

/** A stable text form of a uniform or userData value (numbers quantised, objects key-sorted). */
function text(v: unknown): string {
  if (typeof v === 'number') return q(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'undefined';
  if (ArrayBuffer.isView(v)) return `[${Array.from(v as unknown as ArrayLike<number>, q).join(',')}]`;
  if (Array.isArray(v)) return `[${v.map(text).join(',')}]`;
  const o = v as Record<string, unknown>;
  if ('elements' in o && ArrayBuffer.isView(o.elements)) return text(o.elements);
  // Vector2/3/4, Quaternion and Color expose their components as own or accessor fields.
  for (const keys of [['x', 'y', 'z', 'w'], ['r', 'g', 'b']]) {
    if (typeof o[keys[0]!] === 'number' && typeof o[keys[1]!] === 'number') {
      return `(${keys.filter((k) => typeof o[k] === 'number').map((k) => q(o[k] as number)).join(',')})`;
    }
  }
  return `{${Object.keys(o).sort().filter((k) => typeof o[k] !== 'function').map((k) => `${k}:${text(o[k])}`).join(',')}}`;
}

const attrText = (a: Attr): string => `${a.itemSize}/${a.normalized ? 1 : 0}/${a.array.constructor.name}:${Array.from(a.array, q).join(',')}`;

function materialText(m: Mat): string {
  const u = m.uniforms ?? {};
  return [m.type, text(m.userData), m.side, m.transparent, m.depthTest, m.depthWrite, m.visible, ...Object.keys(u).sort().map((k) => `${k}=${text(u[k]?.value)}`)].join('|');
}

/** Every object under `root` in traversal order (depth first, children in order). */
export function sceneEntries(root: Obj, prefix = ''): SceneEntry[] {
  const out: SceneEntry[] = [];
  const walk = (o: Obj, path: string): void => {
    const g = o.geometry;
    const mats = o.material === undefined ? [] : Array.isArray(o.material) ? o.material : [o.material];
    const drawable = Boolean(o.isMesh || o.isLine || o.isPoints) && g !== undefined;
    let hash = '';
    let triangles = 0;
    let vertices = 0;
    let draws = 0;
    if (drawable || mats.length || Object.keys(o.userData).length) {
      const h = createHash('sha256');
      h.update(`${o.type}|${o.name}|${o.visible}|${o.renderOrder}|${o.frustumCulled}|${text(o.matrixWorld.elements)}|${text(o.userData)}\n`);
      if (g) {
        for (const name of Object.keys(g.attributes).sort()) h.update(`attr ${name} ${attrText(g.attributes[name]!)}\n`);
        if (g.index) h.update(`index ${attrText(g.index)}\n`);
        h.update(`groups ${text(g.groups)} range ${g.drawRange.start},${g.drawRange.count}\n`);
      }
      for (const m of mats) h.update(`material ${materialText(m)}\n`);
      hash = h.digest('hex').slice(0, 16);
    }
    if (drawable && g) {
      const count = g.index ? g.index.count : (g.attributes.position?.count ?? 0);
      const drawn = Math.min(count, g.drawRange.count === Infinity ? count : g.drawRange.count);
      vertices = g.attributes.position?.count ?? 0;
      draws = Array.isArray(o.material) ? Math.max(1, g.groups.length) : 1;
      if (o.isMesh) triangles = Math.floor(drawn / 3);
    }
    out.push({ path, type: o.type, hash, draws: o.visible ? draws : 0, triangles, vertices });
    const seen = new Map<string, number>();
    for (const c of o.children) {
      const base = c.name || c.type;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      walk(c, `${path}/${base}[${n}]`);
    }
  };
  walk(root, prefix || root.name || root.type);
  return out;
}

/** Totals over entries (visible drawables only for draws). */
export function sceneTotals(entries: readonly SceneEntry[]): { objects: number; meshes: number; lines: number; draws: number; triangles: number; vertices: number } {
  return {
    objects: entries.length,
    meshes: entries.filter((e) => e.type === 'Mesh').length,
    lines: entries.filter((e) => /Line/.test(e.type)).length,
    draws: entries.reduce((n, e) => n + e.draws, 0),
    triangles: entries.reduce((n, e) => n + e.triangles, 0),
    vertices: entries.reduce((n, e) => n + e.vertices, 0),
  };
}

/** What hash and stats report: per track (scene + camera after a few posed frames) and per car livery. */
export interface SceneMeasure {
  tracks: { id: string; entries: SceneEntry[]; camera: string; error?: string }[];
  cars: { livery: string; entries: SceneEntry[]; error?: string }[];
}

/** Fixed car views along a track's centreline (0..1 of a lap), so posed cars are hashed too. */
function views(centre: readonly [number, number][], at: readonly number[]): Record<string, unknown>[] {
  return at.map((f, i) => {
    const n = centre.length;
    const k = Math.floor(f * n) % n;
    const [x, z] = centre[k]!;
    const [bx, bz] = centre[(k + 1) % n]!;
    return { x, y: i === 0 ? 0 : 0.6, z, heading: Math.atan2(bx - x, -(bz - z)), pitch: 0.05 * i, speed: 20, slip: 0.2, surface: 'dirt', airborne: i === 1 };
  });
}

/** Builds and measures every track's scene and the car liveries from `tree`'s src/. */
export async function measureTree(tree: string): Promise<SceneMeasure> {
  const root = resolve(tree);
  const tokensUrl = pathToFileURL(join(root, 'guardrails/generated/tokens.ts')).href;
  registerHooks({ resolve: (spec, ctx, next) => next(spec === '@tokens' ? tokensUrl : spec, ctx) });
  const sim = await import(pathToFileURL(join(root, 'src/sim/index.ts')).href);
  const render = await import(pathToFileURL(join(root, 'src/render/index.ts')).href);
  const { tokens } = await import(tokensUrl);
  const ai = tokens.cars.ai as string[];
  const liveries = [render.playerLivery(1), { body: 'mustard', stripe: 'navy', number: 7, player: false }];
  const dir = join(root, 'src/content/tracks');
  const out: SceneMeasure = { tracks: [], cars: [] };
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const id = file.slice(0, -5);
    try {
      const layout = sim.trackLayout(sim.validateTrack(JSON.parse(readFileSync(join(dir, file), 'utf8'))));
      const race = render.createRaceScene(layout, liveries);
      const v = views(layout.centre, [0.02, 0.5]);
      for (let f = 0; f < 3; f++) race.update(v, 1 / 60);
      race.scene.updateMatrixWorld(true);
      race.camera.updateMatrixWorld(true);
      out.tracks.push({ id, entries: sceneEntries(race.scene), camera: `${text(race.camera.matrixWorld.elements)} ${text(race.camera.projectionMatrix.elements)}` });
    } catch (e) {
      out.tracks.push({ id, entries: [], camera: '', error: String(e) });
    }
  }
  const mats = render.createMaterials();
  const cars = [render.playerLivery(1), ...ai.map((body, i) => ({ body, stripe: ai[(i + 1) % ai.length] === body ? 'cream' : ai[(i + 1) % ai.length], number: 10 + i, player: false }))];
  for (const l of cars) {
    const name = `${l.body}/${l.stripe}#${l.number}${l.player ? ' (player)' : ''}`;
    try {
      const car = render.buildCar(l, mats);
      car.root.updateMatrixWorld(true);
      out.cars.push({ livery: name, entries: sceneEntries(car.root, 'car') });
    } catch (e) {
      out.cars.push({ livery: name, entries: [], error: String(e) });
    }
  }
  return out;
}

/** The stats view of a measurement: totals per track and car, plus the heaviest objects per track. */
export function sceneStats(m: SceneMeasure): Record<string, unknown> {
  return {
    tracks: m.tracks.map((t) => ({
      id: t.id, ...sceneTotals(t.entries), error: t.error,
      heaviest: [...t.entries].sort((a, b) => b.triangles - a.triangles).slice(0, 8).map((e) => ({ path: e.path, triangles: e.triangles, draws: e.draws })),
    })),
    cars: m.cars.map((c) => ({ livery: c.livery, ...sceneTotals(c.entries), error: c.error })),
  };
}

if (import.meta.main) {
  const [tree, mode] = process.argv.slice(2);
  if (!tree || (mode !== 'hash' && mode !== 'stats')) throw new Error('usage: node harness/screens/scene.ts <tree> hash|stats');
  const m = await measureTree(tree);
  const value = mode === 'hash' ? m : sceneStats(m);
  process.stdout.write(`\n${JSON.stringify({ nonce: process.env['GATE_NONCE'], ...value })}\n`);
}
