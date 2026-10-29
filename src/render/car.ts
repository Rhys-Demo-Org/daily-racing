// Car meshes (UI_RULES §8): boxy body 4.2 × 2.2, big ink wheels, navy cabin (teal on a navy body),
// cream roof roundel with the race number in segment-style blocks, one stripe along the body.
// The player car is rally-red with a cream stripe and a floating red ▼ marker; AI cars are never red.
//
// Local car frame: +x right, +y up, −z forward (the nose). poseCar() sets body.rotation.y = −heading
// (three's +y rotation is anticlockwise from above; sim headings run clockwise from north). The roundel and the ▼ marker are NOT
// rotated: like the concept frames, the race number always reads upright on screen. The roundel is
// round, so only its position follows the cabin as the car turns.
import { Group, Mesh } from 'three';
import { tokens, type PaletteName } from '@tokens';
import type { CarView } from '../sim/types.ts';
import { CAMERA } from './camera.ts';
import { MeshBuilder, type Vec3 } from './geometry.ts';
import type { Materials } from './materials/index.ts';
import { outlinedFlatMesh, solidMesh } from './outline.ts';

export interface CarLivery {
  body: PaletteName;
  stripe: PaletteName;
  /** Race number shown on the roof roundel, 0..99. */
  number: number;
  player: boolean;
}

/** Car dimensions in world units (local frame). */
export const CAR = {
  length: 4.2,
  width: 2.2,
  wheelRadius: 0.5, // tops stay 0.05 under the body top so their crease lines never bleed through
  bodyBottom: 0.35,
  bodyTop: 1.05,
  roof: 1.62,
  cabin: { halfWidth: 0.86, zFront: -0.55, zBack: 1.05 },
  roundelRadius: 0.8,
  markerHeight: 5.8,
} as const;

/** Roundel centre along the car (local z): the middle of the cabin roof. */
const ROUNDEL_Z = (CAR.cabin.zFront + CAR.cabin.zBack) / 2;

/** The player's livery: always rally-red with a cream stripe (tokens.cars.player). */
export function playerLivery(number: number): CarLivery {
  return { body: tokens.cars.player.body, stripe: tokens.cars.player.stripe, number, player: true };
}

/** Throws if the livery breaks UI_RULES §8 (player red + cream; AI from the AI list, never red). */
export function validateLivery(l: CarLivery): void {
  if (!Number.isInteger(l.number) || l.number < 0 || l.number > 99) throw new Error(`car number must be 0..99, got ${l.number}`);
  if (l.player) {
    if (l.body !== tokens.cars.player.body || l.stripe !== tokens.cars.player.stripe) {
      throw new Error(`player livery must be ${tokens.cars.player.body} with a ${tokens.cars.player.stripe} stripe`);
    }
    return;
  }
  if (l.body === tokens.cars.player.body) throw new Error('AI cars are never rally-red');
  if (!(tokens.cars.ai as readonly string[]).includes(l.body)) throw new Error(`AI body must be one of ${tokens.cars.ai.join(', ')}`);
  if (l.stripe === l.body) throw new Error('stripe must differ from the body colour');
}

/** Cabin colour: navy, or teal on a navy body. */
export function cabinColour(body: PaletteName): PaletteName {
  return body === 'navy' ? tokens.cars.cabinOnNavy : tokens.cars.cabin;
}

/** Body geometry (body, cabin, wheels, stripe decal) in the local car frame. */
export function buildCarGeometry(l: CarLivery): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder();
  const hw = CAR.width / 2;
  const hl = CAR.length / 2;
  const { cabin } = CAR;

  b.box([-hw, CAR.bodyBottom, -hl], [hw, CAR.bodyTop, hl], l.body);
  b.box([-cabin.halfWidth, CAR.bodyTop, cabin.zFront], [cabin.halfWidth, CAR.roof, cabin.zBack], cabinColour(l.body));

  // Wheels: 12-sided ink cylinders with their axis along x; half the tyre sticks out past the body.
  const r = CAR.wheelRadius;
  const wheelW = 0.42;
  for (const sx of [-1, 1]) {
    for (const z of [-1.35, 1.35]) {
      const x = sx * (hw - 0.02);
      const ring = Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2);
      const inner = ring.map((a): Vec3 => [x - wheelW / 2, r + r * Math.sin(a), z + r * Math.cos(a)]);
      const outer = ring.map((a): Vec3 => [x + wheelW / 2, r + r * Math.sin(a), z + r * Math.cos(a)]);
      b.polygon(outer, tokens.cars.wheels, [1, 0, 0]);
      b.polygon(inner, tokens.cars.wheels, [-1, 0, 0]);
      for (let i = 0; i < 12; i++) {
        const j = (i + 1) % 12;
        const a = ((i + 0.5) / 12) * Math.PI * 2;
        b.quad(inner[i] as Vec3, inner[j] as Vec3, outer[j] as Vec3, outer[i] as Vec3, tokens.cars.wheels, [0, Math.sin(a), Math.cos(a)]);
      }
    }
  }

  // Stripe along the hood and boot: paint, so a decal (no hull or crease of its own).
  b.decals(() => {
    const sw = 0.32;
    b.box([-sw, CAR.bodyTop, -hl], [sw, CAR.bodyTop + 0.03, cabin.zFront], l.stripe);
    b.box([-sw, CAR.bodyTop, cabin.zBack], [sw, CAR.bodyTop + 0.03, hl], l.stripe);
  });
  return b.build();
}

// Seven-segment digits: which of a b c d e f g are lit.
const DIGIT_SEGMENTS = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'acdefg', 'abc', 'abcdefg', 'abcdfg'] as const;

/** One digit as ink decal blocks; (u0, v0) is its bottom-left with u = east (+x), v = north (−z). */
function addDigit(b: MeshBuilder, digit: number, u0: number, v0: number, w: number, h: number, t: number, y: number): void {
  const rects: Record<string, readonly [number, number, number, number]> = {
    a: [0, h - t, w, h],
    d: [0, 0, w, t],
    g: [0, h / 2 - t / 2, w, h / 2 + t / 2],
    f: [0, h / 2, t, h],
    b: [w - t, h / 2, w, h],
    e: [0, 0, t, h / 2],
    c: [w - t, 0, w, h / 2],
  };
  for (const s of DIGIT_SEGMENTS[digit] ?? '') {
    const [ua, va, ub, vb] = rects[s] ?? [0, 0, 0, 0];
    b.box([u0 + ua, y, -(v0 + vb)], [u0 + ub, y + 0.02, -(v0 + va)], 'ink');
  }
}

/**
 * Roundel geometry: a cream disc with the race number on top, origin at the disc's bottom centre.
 * Digits read upright when the mesh is not rotated (up = north = screen-up).
 */
export function buildRoundelGeometry(number: number): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder();
  const thick = 0.05;
  b.lathe([[0, 0], [CAR.roundelRadius, 0], [CAR.roundelRadius, thick], [0, thick]], 14, tokens.cars.roundel);
  b.decals(() => {
    const digits = String(number).split('').map(Number);
    const two = digits.length === 2;
    const h = two ? 0.78 : 0.9;
    const w = two ? 0.4 : 0.5;
    const t = two ? 0.14 : 0.16;
    const gap = 0.1;
    const total = digits.length * w + (digits.length - 1) * gap;
    digits.forEach((d, i) => addDigit(b, d, -total / 2 + i * (w + gap), -h / 2, w, h, t, thick));
  });
  return b.build();
}

/** Triangular prism from z0 to z1 (z1 > z0) with the triangle scaled about its centroid. */
function prism(b: MeshBuilder, scale: number, z0: number, z1: number, paint: PaletteName): void {
  const base = [[-0.95, 0.8], [0.95, 0.8], [0, -0.8]] as const;
  const cy = (0.8 + 0.8 - 0.8) / 3;
  const tri = base.map(([x, y]) => [x * scale, cy + (y - cy) * scale] as const);
  const front = tri.map(([x, y]): Vec3 => [x, y, z1]);
  const back = tri.map(([x, y]): Vec3 => [x, y, z0]);
  b.polygon(front, paint, [0, 0, 1]);
  b.polygon(back, paint, [0, 0, -1]);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    const [x0, y0] = tri[i] as readonly [number, number];
    const [x1, y1] = tri[j] as readonly [number, number];
    const out: Vec3 = [(x0 + x1) / 2, (y0 + y1) / 2 - cy, 0]; // edge midpoint, away from the centroid
    b.quad(front[i] as Vec3, front[j] as Vec3, back[j] as Vec3, back[i] as Vec3, paint, out);
  }
}

/**
 * The player's red ▼ marker: a triangular slab facing +z, unlit so it stays rally-red, on a slightly
 * larger ink plate behind it. A hull alone draws a thin line on such sharp corners; the plate gives
 * the ▼ the same chunky ink border as everything else.
 */
export function buildMarkerGeometry(): ReturnType<MeshBuilder['build']> {
  const b = new MeshBuilder();
  prism(b, 1, -0.2, 0.2, tokens.role.player);
  prism(b, 1.32, -0.32, -0.22, tokens.role.outline);
  return b.build();
}

/** A car: `root` sits at the car's (x, y, z); `body` turns with the heading; roundel/marker don't. */
export interface CarObject {
  root: Group;
  body: Mesh;
  roundel: Mesh;
  marker: Mesh | null;
  livery: CarLivery;
}

/** Builds a car from its livery (validated). The ▼ marker is added for the player only. */
export function buildCar(l: CarLivery, mats: Materials): CarObject {
  validateLivery(l);
  const root = new Group();
  root.name = l.player ? 'car:player' : `car:${l.number}`;
  root.userData = { kind: 'car', livery: { ...l } };
  const body = solidMesh(buildCarGeometry(l), mats, 'car-body');
  const roundel = solidMesh(buildRoundelGeometry(l.number), mats, 'car-roundel');
  root.add(body, roundel);
  let marker: Mesh | null = null;
  if (l.player) {
    marker = outlinedFlatMesh(buildMarkerGeometry(), mats, 'player-marker', { crease: false });
    marker.position.y = CAR.markerHeight;
    // Tilt the slab so its face points at the camera: the ▼ reads at full size.
    marker.rotation.x = -(CAMERA.pitchDeg * Math.PI) / 180;
    root.add(marker);
  }
  const car: CarObject = { root, body, roundel, marker, livery: { ...l } };
  poseCar(car, { x: 0, y: 0, z: 0, heading: 0 });
  return car;
}

/** Places a car from a sim view: position, jump height and heading. */
export function poseCar(car: CarObject, v: Pick<CarView, 'x' | 'y' | 'z' | 'heading'>): void {
  car.root.position.set(v.x, v.y, v.z);
  car.body.rotation.y = -v.heading;
  // Local (0, roof, ROUNDEL_Z) turned by the heading: x' = −z sin h, z' = z cos h.
  car.roundel.position.set(-ROUNDEL_Z * Math.sin(v.heading), CAR.roof, ROUNDEL_Z * Math.cos(v.heading));
}
