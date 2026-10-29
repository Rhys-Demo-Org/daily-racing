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
/**
 * Steepest ramp allowed (height / length). Grounded cars climb at most `maxStepUp` per tick, so a
 * slope must rise less than that at top speed (0.3 / (25 / 60) = 0.72), and render keeps ramp tops
 * at their base colour only up to sqrt(1 / TOP_FACE_MIN_Y² − 1) ≈ 0.329.
 */
export const MAX_RAMP_SLOPE = 0.32;
/** Highest ramp allowed. At 2 high every full-speed jump (at most ~23.1 units) lands inside the
 * 25-unit run-out after the lip, so the bot needs no lip-speed planning. */
export const MAX_RAMP_HEIGHT = 2;
/** Every ramp needs this much track after its lip within RAMP_RUNOUT_DRIFT of the line a car
 * leaves the lip on, so a jump lands on the track rather than in a corner's run-off. */
const RAMP_RUNOUT = 25;
const RAMP_RUNOUT_DRIFT = 1.5;

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

/** Uniform grid over the colliders, so the broadphase only looks at props near a car. */
export interface ColliderGrid {
  /** Cell side in units, the corner of cell (0, 0), and the size in cells. */
  cell: number;
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  /** cells[col * rows + row]: ascending indices into `colliders` of the colliders centred in it. */
  cells: number[][];
  /** Largest collider bound. */
  maxBound: number;
}

/** A placed ramp plus its unit forward vector (heading 0 = −z), precomputed for the hot path. */
export interface Ramp extends RampInstance {
  fx: number;
  fz: number;
}

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
  ramps: Ramp[];
  props: PropInstance[];
  colliders: Collider[];
  grid: ColliderGrid;
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

/** Side of a broadphase grid cell, in units. */
const GRID_CELL = 16;
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
    if (height / length > MAX_RAMP_SLOPE) fail(id, `${where} is too steep: height / length must be at most ${MAX_RAMP_SLOPE}`);
    if (height > MAX_RAMP_HEIGHT) fail(id, `${where}.height must be at most ${MAX_RAMP_HEIGHT}`);
    return { at, length, height };
  });
  const line = buildCentreline(centreline);
  ramps.forEach((r, i) => {
    const lip = sampleAt(line, r.at * line.length);
    const fx = Math.sin(lip.heading);
    const fz = -Math.cos(lip.heading);
    for (let d = 1; d <= RAMP_RUNOUT; d++) {
      const p = sampleAt(line, r.at * line.length + d);
      if (Math.abs((p.x - lip.x) * -fz + (p.z - lip.z) * fx) > RAMP_RUNOUT_DRIFT) {
        fail(id, `ramps[${i}] needs ${RAMP_RUNOUT} units of straight track after its lip`);
      }
    }
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

/** Closed spline through the control points, resampled to (almost) exactly 1-unit spacing, with
 * each segment's heading. */
function buildCentreline(points: [number, number][]): CentrelineLike {
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
  const headings = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const k = (i + 1) % count;
    perimeter += Math.hypot((xs[k] as number) - (xs[i] as number), (zs[k] as number) - (zs[i] as number));
    headings[i] = headingOf((xs[k] as number) - (xs[i] as number), (zs[k] as number) - (zs[i] as number));
  }
  return { xs, zs, headings, count, length: perimeter, spacing: perimeter / count };
}

// ---------------------------------------------------------------------------------------------
// Building

/** Builds the full geometry for a (validated) track. Deterministic: same data, same result. */
export function buildTrack(data: TrackData): Track {
  const line = buildCentreline(data.centreline);
  const { xs, zs, headings, count, length } = line;
  const halfWidth = data.width / 2;
  const partial = { ...line, data, width: data.width, halfWidth };

  const layoutRamps: RampInstance[] = data.ramps.map((r) => {
    const p = sampleAt(partial, r.at * length);
    return { x: p.x, z: p.z, heading: p.heading, length: r.length, width: data.width, height: r.height };
  });
  const ramps: Ramp[] = layoutRamps.map((r) => ({ ...r, fx: Math.sin(r.heading), fz: -Math.cos(r.heading) }));

  const props: PropInstance[] = [];
  for (const row of data.propRows) {
    const span = (row.to - row.from) * length;
    const n = Math.floor(span / row.spacing + 1e-9) + 1;
    const sideSign = row.side === 'right' ? 1 : -1;
    const off = (halfWidth + row.offset) * sideSign;
    for (let i = 0; i < n; i++) {
      const p = sampleAt(partial, row.from * length + i * row.spacing);
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
    ramps: layoutRamps,
    props: props.map((p) => ({ ...p })),
  };
  return { ...partial, ramps, props, colliders, grid: buildGrid(colliders), layout };
}

function buildGrid(colliders: readonly Collider[]): ColliderGrid {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  let maxBound = 0;
  for (const c of colliders) {
    x0 = Math.min(x0, c.x);
    z0 = Math.min(z0, c.z);
    x1 = Math.max(x1, c.x);
    z1 = Math.max(z1, c.z);
    maxBound = Math.max(maxBound, c.bound);
  }
  // No colliders: 0 × 0 cells (and the infinite corner never yields a cell index either).
  const cols = Math.max(0, Math.floor((x1 - x0) / GRID_CELL) + 1);
  const rows = Math.max(0, Math.floor((z1 - z0) / GRID_CELL) + 1);
  const cells = Array.from({ length: cols * rows }, (): number[] => []);
  colliders.forEach((c, id) => {
    (cells[Math.floor((c.x - x0) / GRID_CELL) * rows + Math.floor((c.z - z0) / GRID_CELL)] as number[]).push(id);
  });
  return { cell: GRID_CELL, x0, z0, cols, rows, cells, maxBound };
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

/** Point and driving heading on the centreline at arc length s (wraps around the lap). */
export function sampleAt(t: CentrelineLike, s: number): { x: number; z: number; heading: number } {
  const wrapped = ((s % t.length) + t.length) % t.length;
  const f = wrapped / t.spacing;
  const i = Math.min(t.count - 1, Math.floor(f));
  const k = (i + 1) % t.count;
  const u = f - i;
  const x = (t.xs[i] as number) + ((t.xs[k] as number) - (t.xs[i] as number)) * u;
  const z = (t.zs[i] as number) + ((t.zs[k] as number) - (t.zs[i] as number)) * u;
  return { x, z, heading: t.headings[i] as number };
}

/** Written by `closest`: the segment vector, and the closest point and its fraction along the
 * segment. Module scratch (fields store numbers in place), so the nearest searches don't allocate. */
const seg = { dx: 0, dz: 0, px: 0, pz: 0, u: 0 };

/** Squared distance from (x, z) to segment i (0 ≤ i < count); fills `seg`. */
function closest(t: Track, i: number, x: number, z: number): number {
  const k = (i + 1) % t.count;
  const ax = t.xs[i] as number;
  const az = t.zs[i] as number;
  const dx = (t.xs[k] as number) - ax;
  const dz = (t.zs[k] as number) - az;
  const u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
  seg.dx = dx;
  seg.dz = dz;
  seg.u = u;
  seg.px = ax + dx * u;
  seg.pz = az + dz * u;
  return (x - seg.px) * (x - seg.px) + (z - seg.pz) * (z - seg.pz);
}

/** Projects (x, z) onto one segment of the centreline. */
export function projectOnSegment(track: Track, segment: number, x: number, z: number): TrackPos {
  const i = ((segment % track.count) + track.count) % track.count;
  closest(track, i, x, z);
  const { dx, dz, px, pz } = seg;
  // Right of the driving direction is (−dz, dx) / len.
  const lateral = ((x - px) * -dz + (z - pz) * dx) / Math.sqrt(dx * dx + dz * dz);
  const s = (i + seg.u) * track.spacing;
  return { seg: i, s: s >= track.length ? s - track.length : s, lateral, distance: Math.hypot(x - px, z - pz) };
}

/** Exhaustive nearest-centreline search. Use only when there is no previous position to start from. */
export function nearestGlobal(track: Track, x: number, z: number): TrackPos {
  let best = 0;
  let bestD2 = closest(track, 0, x, z);
  for (let i = 1; i < track.count; i++) {
    const d2 = closest(track, i, x, z);
    if (d2 < bestD2) {
      best = i;
      bestD2 = d2;
    }
  }
  return projectOnSegment(track, best, x, z);
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
  const n = track.count;
  let best = ((hintSeg % n) + n) % n;
  let bestD = Math.sqrt(closest(track, best, x, z));
  for (let step = 0; step < LOCAL_MAX_STEPS; step++) {
    const centre = best;
    let bestOffset = 0;
    for (let o = -LOCAL_WINDOW; o <= LOCAL_WINDOW; o++) {
      if (o === 0) continue;
      const i = (((centre + o) % n) + n) % n;
      const d = Math.sqrt(closest(track, i, x, z));
      if (d < bestD - 1e-12) {
        best = i;
        bestD = d;
        bestOffset = o;
      }
    }
    if (Math.abs(bestOffset) < LOCAL_WINDOW) break;
  }
  return projectOnSegment(track, best, x, z);
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
 * Surface under (x, z). `pos` is the car's position from trackPosition (or nearestGlobal). If it
 * says grass we also check globally, so a car that rejoins the track somewhere unexpected is still
 * on dirt. Beyond the re-acquire margin trackPosition has already made that check.
 */
export function surfaceAt(track: Track, pos: TrackPos, x: number, z: number): Surface {
  if (Math.abs(pos.lateral) <= track.halfWidth) return 'dirt';
  if (pos.distance > track.halfWidth + REACQUIRE_MARGIN) return 'grass';
  return nearestGlobal(track, x, z).distance <= track.halfWidth ? 'dirt' : 'grass';
}

export interface Ground {
  h: number;
  /** Gradient dh/dx, dh/dz. */
  gx: number;
  gz: number;
  ramp: Ramp | null;
}

/** Ground height, gradient and ramp (if any) at (x, z), written to `out` (the hot path passes a
 * reused object). Flat ground is 0; ramps are wedges. */
export function groundAt(track: Track, x: number, z: number, out: Ground = { h: 0, gx: 0, gz: 0, ramp: null }): Ground {
  out.h = 0;
  out.gx = 0;
  out.gz = 0;
  out.ramp = null;
  for (const r of track.ramps) {
    const rx = x - r.x;
    const rz = z - r.z;
    const along = rx * r.fx + rz * r.fz; // 0 at the lip, −length at the foot
    const lat = rx * -r.fz + rz * r.fx;
    if (along > 0 || along < -r.length || Math.abs(lat) > r.width / 2) continue;
    const rh = r.height * (1 + along / r.length);
    if (rh > out.h) {
      const slope = r.height / r.length;
      out.h = rh;
      out.gx = r.fx * slope;
      out.gz = r.fz * slope;
      out.ramp = r;
    }
  }
  return out;
}
