// Track geometry built from TrackData: validation, the dense centreline, arc-length sampling,
// nearest-centreline queries, surface, ramp height and prop colliders.
import type {
  PropInstance,
  PropKind,
  RampInstance,
  Surface,
  TrackData,
  TrackLayout,
} from './types.ts';
import { clamp, headingOf } from './vec.ts';

/** Collision radius of a tyre stack. */
export const TYRE_STACK_RADIUS = 0.8;
/** Collision radius of a cone tree's trunk (the canopy does not collide). */
export const TREE_TRUNK_RADIUS = 0.5;
/** Hay bale footprint: length along its heading, width across it. */
export const HAY_BALE_LENGTH = 2;
export const HAY_BALE_WIDTH = 1.2;
/** Height of every prop collider; a car flying higher than this passes over it. */
export const PROP_COLLIDER_TOP = 1.1;

export interface CircleCollider {
  shape: 'circle';
  x: number;
  z: number;
  r: number;
  top: number;
  /** Radius of a circle enclosing the collider (broadphase). */
  bound: number;
}

/** Oriented box; halfLength runs along `heading`, halfWidth across it. */
export interface BoxCollider {
  shape: 'box';
  x: number;
  z: number;
  heading: number;
  halfLength: number;
  halfWidth: number;
  top: number;
  bound: number;
}

export type Collider = CircleCollider | BoxCollider;

/** Fully built track. Treat as immutable once built. */
export interface Track {
  data: TrackData;
  width: number;
  halfWidth: number;
  /** Lap length in units. */
  length: number;
  /** Number of dense centreline samples (and segments, since the loop is closed). */
  count: number;
  /** Arc length between consecutive samples (≈1). */
  spacing: number;
  /** Dense centreline; segment i runs from sample i to sample (i + 1) % count. */
  xs: Float64Array;
  zs: Float64Array;
  /** Heading of segment i. */
  headings: Float64Array;
  ramps: RampInstance[];
  props: PropInstance[];
  colliders: Collider[];
  layout: TrackLayout;
}

/** Where a point is relative to the centreline. */
export interface TrackPos {
  /** Segment index (from sample seg to seg + 1). */
  seg: number;
  /** Arc length along the lap of the projected point, in [0, length). */
  s: number;
  /** Signed distance from the centreline; positive = right of the driving direction. */
  lateral: number;
  /** Unsigned distance to the projected point. */
  distance: number;
}

const PROP_KINDS: readonly PropKind[] = ['hay-bale', 'tyre-stack', 'cone-tree'];
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------------------------
// Validation

function fail(id: string, msg: string): never {
  throw new Error(`Invalid track "${id}": ${msg}`);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function num(id: string, obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key];
  if (!isFiniteNumber(v)) fail(id, `${where}.${key} must be a finite number`);
  return v;
}

function kind(id: string, obj: Record<string, unknown>, where: string): PropKind {
  const k = obj['kind'];
  const found = PROP_KINDS.find((p) => p === k);
  if (found === undefined) fail(id, `${where}.kind must be one of ${PROP_KINDS.join(', ')}`);
  return found;
}

function list(id: string, obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  if (!Array.isArray(v)) fail(id, `${key} must be an array`);
  return v;
}

/**
 * Checks that `data` matches the TrackData schema and returns a clean copy.
 * Throws an Error naming the track and the offending field otherwise.
 */
export function validateTrack(data: unknown): TrackData {
  if (!isObject(data)) throw new Error('Invalid track: expected an object');
  const rawId = data['id'];
  const id = typeof rawId === 'string' ? rawId : '?';
  if (typeof rawId !== 'string' || !KEBAB.test(rawId)) fail(id, 'id must be a kebab-case string');
  const name = data['name'];
  if (typeof name !== 'string' || name.trim() === '') fail(id, 'name must be a non-empty string');
  const laps = data['laps'];
  if (!Number.isInteger(laps) || (laps as number) < 1 || (laps as number) > 99) {
    fail(id, 'laps must be an integer from 1 to 99');
  }
  const width = num(id, data, 'width', 'track');
  if (width <= 0) fail(id, 'width must be positive');

  const centreline: [number, number][] = list(id, data, 'centreline').map((p, i) => {
    if (!Array.isArray(p) || p.length !== 2 || !isFiniteNumber(p[0]) || !isFiniteNumber(p[1])) {
      fail(id, `centreline[${i}] must be [x, z] with finite numbers`);
    }
    return [p[0], p[1]];
  });
  if (centreline.length < 4) fail(id, 'centreline needs at least 4 points');
  centreline.forEach((p, i) => {
    const q = centreline[(i + 1) % centreline.length] as [number, number];
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.5) {
      fail(id, `centreline[${i}] and the next point are closer than 0.5 units`);
    }
  });

  const ramps = list(id, data, 'ramps').map((r, i) => {
    const where = `ramps[${i}]`;
    if (!isObject(r)) fail(id, `${where} must be an object`);
    const at = num(id, r, 'at', where);
    const length = num(id, r, 'length', where);
    const height = num(id, r, 'height', where);
    if (at < 0 || at >= 1) fail(id, `${where}.at must be in [0, 1)`);
    if (length <= 0) fail(id, `${where}.length must be positive`);
    if (height <= 0) fail(id, `${where}.height must be positive`);
    return { at, length, height };
  });

  const propRows = list(id, data, 'propRows').map((r, i) => {
    const where = `propRows[${i}]`;
    if (!isObject(r)) fail(id, `${where} must be an object`);
    const k = kind(id, r, where);
    const side = r['side'];
    if (side !== 'left' && side !== 'right') fail(id, `${where}.side must be "left" or "right"`);
    const from = num(id, r, 'from', where);
    const to = num(id, r, 'to', where);
    const spacing = num(id, r, 'spacing', where);
    const offset = num(id, r, 'offset', where);
    if (from < 0 || to > 1 || from >= to) fail(id, `${where} needs 0 <= from < to <= 1`);
    if (spacing < 0.5) fail(id, `${where}.spacing must be at least 0.5`);
    return { kind: k, side, from, to, spacing, offset } as const;
  });

  const props = list(id, data, 'props').map((p, i) => {
    const where = `props[${i}]`;
    if (!isObject(p)) fail(id, `${where} must be an object`);
    return { kind: kind(id, p, where), x: num(id, p, 'x', where), z: num(id, p, 'z', where) };
  });

  return {
    id: rawId,
    name,
    laps: laps as number,
    width,
    centreline,
    ramps,
    propRows: propRows.map((r) => ({ ...r })),
    props,
  };
}

// ---------------------------------------------------------------------------------------------
// Spline

/** Sub-samples per control segment used to measure the spline before resampling. */
const DENSE_SUBSAMPLES = 48;

/**
 * Evaluates one centripetal Catmull-Rom segment (P1→P2) at u ∈ [0, 1] using the Barry-Goldman
 * pyramid. Centripetal knots (alpha = 0.5) avoid cusps and self-loops on uneven point spacing.
 */
function catmullRom(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  u: number,
): [number, number] {
  const knot = (a: [number, number], b: [number, number]): number =>
    Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]));
  const t0 = 0;
  const t1 = t0 + knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
    const wa = (tb - t) / (tb - ta);
    const wb = (t - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** Closed spline through the control points, resampled to (almost) exactly 1-unit spacing. */
function resampleCentreline(points: [number, number][]): { xs: Float64Array; zs: Float64Array; length: number } {
  const n = points.length;
  const pt = (i: number): [number, number] => points[((i % n) + n) % n] as [number, number];
  const dense: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < DENSE_SUBSAMPLES; k++) {
      dense.push(catmullRom(pt(i - 1), pt(i), pt(i + 1), pt(i + 2), k / DENSE_SUBSAMPLES));
    }
  }
  dense.push(pt(0));
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1] as [number, number];
    const b = dense[i] as [number, number];
    cum.push((cum[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[cum.length - 1] as number;
  const count = Math.max(8, Math.round(length));
  const step = length / count;
  const xs = new Float64Array(count);
  const zs = new Float64Array(count);
  let j = 0;
  for (let i = 0; i < count; i++) {
    const s = i * step;
    while ((cum[j + 1] as number) < s) j++;
    const a = dense[j] as [number, number];
    const b = dense[j + 1] as [number, number];
    const ca = cum[j] as number;
    const span = (cum[j + 1] as number) - ca;
    const f = span > 0 ? (s - ca) / span : 0;
    xs[i] = a[0] + (b[0] - a[0]) * f;
    zs[i] = a[1] + (b[1] - a[1]) * f;
  }
  // The resampled polygon is a hair shorter than the curve; use its own perimeter so s is exact.
  let perimeter = 0;
  for (let i = 0; i < count; i++) {
    const k = (i + 1) % count;
    perimeter += Math.hypot((xs[k] as number) - (xs[i] as number), (zs[k] as number) - (zs[i] as number));
  }
  return { xs, zs, length: perimeter };
}

// ---------------------------------------------------------------------------------------------
// Building

/** Builds the full geometry for a (validated) track. Deterministic: same data, same result. */
export function buildTrack(data: TrackData): Track {
  const { xs, zs, length } = resampleCentreline(data.centreline);
  const count = xs.length;
  const headings = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const k = (i + 1) % count;
    headings[i] = headingOf((xs[k] as number) - (xs[i] as number), (zs[k] as number) - (zs[i] as number));
  }
  const halfWidth = data.width / 2;
  const partial = { data, width: data.width, halfWidth, length, count, spacing: length / count, xs, zs, headings };

  const ramps: RampInstance[] = data.ramps.map((r) => {
    const p = sampleAtRaw(partial, r.at * length);
    return { x: p.x, z: p.z, heading: p.heading, length: r.length, width: data.width, height: r.height };
  });

  const props: PropInstance[] = [];
  for (const row of data.propRows) {
    const span = (row.to - row.from) * length;
    const n = Math.floor(span / row.spacing + 1e-9) + 1;
    const sideSign = row.side === 'right' ? 1 : -1;
    const off = (halfWidth + row.offset) * sideSign;
    for (let i = 0; i < n; i++) {
      const p = sampleAtRaw(partial, row.from * length + i * row.spacing);
      props.push({
        kind: row.kind,
        x: p.x + Math.cos(p.heading) * off,
        z: p.z + Math.sin(p.heading) * off,
        heading: p.heading,
      });
    }
  }
  for (const p of data.props) props.push({ kind: p.kind, x: p.x, z: p.z, heading: 0 });

  const colliders = props.map(colliderFor);
  const centre: [number, number][] = [];
  for (let i = 0; i < count; i++) centre.push([xs[i] as number, zs[i] as number]);
  const layout: TrackLayout = {
    width: data.width,
    centre,
    startHeading: headings[0] as number,
    ramps: ramps.map((r) => ({ ...r })),
    props: props.map((p) => ({ ...p })),
  };
  return { ...partial, ramps, props, colliders, layout };
}

function colliderFor(p: PropInstance): Collider {
  if (p.kind === 'hay-bale') {
    const halfLength = HAY_BALE_LENGTH / 2;
    const halfWidth = HAY_BALE_WIDTH / 2;
    return {
      shape: 'box',
      x: p.x,
      z: p.z,
      heading: p.heading,
      halfLength,
      halfWidth,
      top: PROP_COLLIDER_TOP,
      bound: Math.hypot(halfLength, halfWidth),
    };
  }
  const r = p.kind === 'tyre-stack' ? TYRE_STACK_RADIUS : TREE_TRUNK_RADIUS;
  return { shape: 'circle', x: p.x, z: p.z, r, top: PROP_COLLIDER_TOP, bound: r };
}

/** Validates and builds the world-space layout render uses to build meshes. */
export function trackLayout(track: TrackData): TrackLayout {
  return buildTrack(validateTrack(track)).layout;
}

// ---------------------------------------------------------------------------------------------
// Queries

type CentrelineLike = Pick<Track, 'xs' | 'zs' | 'headings' | 'count' | 'length' | 'spacing'>;

function sampleAtRaw(t: CentrelineLike, s: number): { x: number; z: number; heading: number } {
  const wrapped = ((s % t.length) + t.length) % t.length;
  const f = wrapped / t.spacing;
  const i = Math.min(t.count - 1, Math.floor(f));
  const k = (i + 1) % t.count;
  const u = f - i;
  const x = (t.xs[i] as number) + ((t.xs[k] as number) - (t.xs[i] as number)) * u;
  const z = (t.zs[i] as number) + ((t.zs[k] as number) - (t.zs[i] as number)) * u;
  return { x, z, heading: t.headings[i] as number };
}

/** Point and driving heading on the centreline at arc length s (wraps around the lap). */
export function sampleAt(track: Track, s: number): { x: number; z: number; heading: number } {
  return sampleAtRaw(track, s);
}

/** Projects (x, z) onto one segment of the centreline. */
export function projectOnSegment(track: Track, seg: number, x: number, z: number): TrackPos {
  const i = ((seg % track.count) + track.count) % track.count;
  const k = (i + 1) % track.count;
  const ax = track.xs[i] as number;
  const az = track.zs[i] as number;
  const dx = (track.xs[k] as number) - ax;
  const dz = (track.zs[k] as number) - az;
  const len2 = dx * dx + dz * dz;
  const u = clamp(((x - ax) * dx + (z - az) * dz) / len2, 0, 1);
  const px = ax + dx * u;
  const pz = az + dz * u;
  const len = Math.sqrt(len2);
  // Right of the driving direction is (−dz, dx) / len (see vec.ts `right`).
  const lateral = ((x - px) * -dz + (z - pz) * dx) / len;
  const s = (i + u) * track.spacing;
  return { seg: i, s: s >= track.length ? s - track.length : s, lateral, distance: Math.hypot(x - px, z - pz) };
}

/** Exhaustive nearest-centreline search. Use only when there is no previous position to start from. */
export function nearestGlobal(track: Track, x: number, z: number): TrackPos {
  let best = projectOnSegment(track, 0, x, z);
  for (let i = 1; i < track.count; i++) {
    const p = projectOnSegment(track, i, x, z);
    if (p.distance < best.distance) best = p;
  }
  return best;
}

/** Half-width (in segments) of the window the local search scans around its centre. */
const LOCAL_WINDOW = 8;
/** How many times the window may re-centre in one query (bounds the distance it can travel). */
const LOCAL_MAX_STEPS = 16;

/**
 * Nearest-centreline search that starts from the segment found last tick and only walks along the
 * track (scanning a small window and re-centring while the best match sits on the window's edge).
 * It follows the closest *connected* piece of track, so on a hairpin or crossing it never jumps to
 * the other leg just because that leg is geometrically closer.
 */
export function nearestLocal(track: Track, x: number, z: number, hintSeg: number): TrackPos {
  let centre = hintSeg;
  let best = projectOnSegment(track, centre, x, z);
  for (let step = 0; step < LOCAL_MAX_STEPS; step++) {
    let bestOffset = 0;
    for (let o = -LOCAL_WINDOW; o <= LOCAL_WINDOW; o++) {
      if (o === 0) continue;
      const p = projectOnSegment(track, centre + o, x, z);
      if (p.distance < best.distance - 1e-12) {
        best = p;
        bestOffset = o;
      }
    }
    if (Math.abs(bestOffset) < LOCAL_WINDOW) break;
    centre = best.seg;
  }
  return best;
}

/** Distance beyond the track edge after which tracking may re-acquire elsewhere (see below). */
const REACQUIRE_MARGIN = 3;

/**
 * Per-tick tracked position: the local search from last tick's segment, except when the car is
 * well off that piece of track but standing on dirt somewhere else (it cut across or spun onto
 * another leg). Then we re-acquire globally. Lap counting requires sectors in order, so such a
 * jump never earns progress; it only keeps tracking sane. A car on grass between two legs never
 * re-acquires, so tracking does not hop across a hairpin.
 */
export function trackPosition(track: Track, x: number, z: number, prev: TrackPos): TrackPos {
  const local = nearestLocal(track, x, z, prev.seg);
  if (local.distance <= track.halfWidth + REACQUIRE_MARGIN) return local;
  const global = nearestGlobal(track, x, z);
  return global.distance <= track.halfWidth ? global : local;
}

/**
 * Surface under (x, z). `pos` is the car's tracked (local) position; if it says grass we also do a
 * global check, so a car that rejoins the track somewhere unexpected is still on dirt.
 */
export function surfaceAt(track: Track, pos: TrackPos, x: number, z: number): Surface {
  if (Math.abs(pos.lateral) <= track.halfWidth) return 'dirt';
  return nearestGlobal(track, x, z).distance <= track.halfWidth ? 'dirt' : 'grass';
}

/** Ground height and its gradient (dh/dx, dh/dz) at (x, z). Flat ground is 0; ramps are wedges. */
export function groundAt(track: Track, x: number, z: number): { h: number; gx: number; gz: number } {
  let h = 0;
  let gx = 0;
  let gz = 0;
  for (const r of track.ramps) {
    const fx = Math.sin(r.heading);
    const fz = -Math.cos(r.heading);
    const rx = x - r.x;
    const rz = z - r.z;
    const along = rx * fx + rz * fz; // 0 at the lip, −length at the foot
    const lat = rx * -fz + rz * fx;
    if (along > 0 || along < -r.length || Math.abs(lat) > r.width / 2) continue;
    const rh = r.height * (1 + along / r.length);
    if (rh > h) {
      h = rh;
      const slope = r.height / r.length;
      gx = fx * slope;
      gz = fz * slope;
    }
  }
  return { h, gx, gz };
}
