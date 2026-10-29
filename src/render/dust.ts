// Dust: a fixed pool of cream puffs (flat colour, ink hull), all in ONE dynamic geometry so the
// whole pool is two draw calls. Nothing is allocated per frame: emitting past capacity recycles the
// oldest puff. Puffs grow then shrink (scale only; opacity tricks are banned by UI_RULES §11).
//
// Emission: behind each car's rear wheels while it slides (slip) or drives on grass, and a burst on
// landing after a jump. Randomness comes from a small local seeded RNG (never Math.random), so a
// given input sequence always produces the same dust.
import { IcosahedronGeometry, Mesh, Vector3 } from 'three';
import type { CarView } from '../sim/types.ts';
import { MeshBuilder, type Vec3 } from './geometry.ts';
import type { Materials } from './materials/index.ts';
import { outlinedFlatMesh } from './outline.ts';

export const DUST = {
  capacity: 48,
  /** Seconds a puff lives. */
  life: 0.6,
  /** Puffs per second per car while emitting. */
  rate: 20,
  slipThreshold: 0.35,
  /** Below this speed (units/s) a car makes no dust. */
  minSpeed: 3,
  landingBurst: 6,
  /** Peak puff radius range in units. */
  size: [0.6, 0.95],
} as const;

/** Small deterministic RNG (mulberry32), local to render. Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 1831565813) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARKED_Y = -1000; // inactive puffs sit far below the ground, outside the camera frustum

export interface DustPool {
  readonly mesh: Mesh;
  readonly capacity: number;
  /** Number of live puffs. */
  active(): number;
  /** Spawns one puff at (x, y, z) drifting with (vx, vy, vz). Recycles the oldest when full. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number): void;
  /** Emits from cars (index-aligned with previous calls) and advances all puffs by dt seconds. */
  update(cars: readonly CarView[], dtSeconds: number): void;
}

export function createDust(mats: Materials, seed = 1): DustPool {
  const rnd = mulberry32(seed);
  const cap = DUST.capacity;

  // One low-poly puff template (20 faces), copied `cap` times into a single geometry.
  const ico = new IcosahedronGeometry(1, 0);
  const tp = ico.getAttribute('position');
  const template = new Float32Array(tp.array.length);
  template.set(tp.array as Float32Array);
  const perPuff = tp.count;
  const b = new MeshBuilder();
  for (let p = 0; p < cap; p++) {
    for (let i = 0; i < perPuff; i += 3) {
      const v = (k: number): Vec3 => [tp.getX(i + k), tp.getY(i + k), tp.getZ(i + k)];
      const c = new Vector3(...v(0)).add(new Vector3(...v(1))).add(new Vector3(...v(2)));
      b.tri(v(0), v(1), v(2), 'cream', [c.x, c.y, c.z]);
    }
  }
  ico.dispose();
  const geo = b.build();
  const pos = geo.getAttribute('position');
  const positions = pos.array as Float32Array;
  const mesh = outlinedFlatMesh(geo, mats, 'dust', { crease: false });
  mesh.frustumCulled = false;
  for (const child of mesh.children) child.frustumCulled = false;

  // Per-puff state in flat typed arrays.
  const age = new Float32Array(cap).fill(Infinity);
  const px = new Float32Array(cap);
  const py = new Float32Array(cap);
  const pz = new Float32Array(cap);
  const vx = new Float32Array(cap);
  const vy = new Float32Array(cap);
  const vz = new Float32Array(cap);
  const size = new Float32Array(cap);
  let next = 0;

  // Per-car emitter state (grown only when the car count grows, i.e. at most once per race).
  let acc = new Float32Array(0);
  let wasAirborne = new Uint8Array(0);

  const writePuff = (p: number, scale: number, x: number, y: number, z: number): void => {
    const base = p * perPuff * 3;
    for (let i = 0; i < perPuff * 3; i += 3) {
      positions[base + i] = x + (template[i] as number) * scale;
      positions[base + i + 1] = y + (template[i + 1] as number) * scale;
      positions[base + i + 2] = z + (template[i + 2] as number) * scale;
    }
  };
  for (let p = 0; p < cap; p++) writePuff(p, 0, 0, PARKED_Y, 0);

  const pool: DustPool = {
    mesh,
    capacity: cap,
    active() {
      let n = 0;
      for (let p = 0; p < cap; p++) if ((age[p] as number) < DUST.life) n++;
      return n;
    },
    emit(x, y, z, dx, dy, dz) {
      const p = next;
      next = (next + 1) % cap;
      age[p] = 0;
      px[p] = x;
      py[p] = y;
      pz[p] = z;
      vx[p] = dx;
      vy[p] = dy;
      vz[p] = dz;
      size[p] = DUST.size[0] + (DUST.size[1] - DUST.size[0]) * rnd();
    },
    update(cars, dt) {
      if (acc.length < cars.length) {
        acc = new Float32Array(cars.length);
        wasAirborne = new Uint8Array(cars.length);
      }
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i] as CarView;
        const fx = Math.sin(c.heading);
        const fz = -Math.cos(c.heading);
        const rx = -fz;
        const rz = fx;
        const landed = wasAirborne[i] === 1 && !c.airborne;
        wasAirborne[i] = c.airborne ? 1 : 0;
        if (landed) {
          for (let k = 0; k < DUST.landingBurst; k++) {
            const a = (k / DUST.landingBurst) * Math.PI * 2 + rnd();
            pool.emit(c.x + Math.cos(a) * 1.6, 0.3, c.z + Math.sin(a) * 1.2, Math.cos(a) * 2.5, 0.6, Math.sin(a) * 2);
          }
        }
        const making = !c.airborne && Math.abs(c.speed) >= DUST.minSpeed && (c.slip >= DUST.slipThreshold || c.surface === 'grass');
        if (!making) {
          acc[i] = 0;
          continue;
        }
        acc[i] = (acc[i] as number) + DUST.rate * dt;
        while ((acc[i] as number) >= 1) {
          acc[i] = (acc[i] as number) - 1;
          const side = rnd() < 0.5 ? -1 : 1;
          const back = Math.sign(c.speed) || 1;
          const ex = c.x - fx * 1.9 * back + rx * 0.9 * side;
          const ez = c.z - fz * 1.9 * back + rz * 0.9 * side;
          const spread = (rnd() - 0.5) * 2;
          pool.emit(ex, 0.35, ez, -fx * 1.5 * back + rx * spread, 0.7, -fz * 1.5 * back + rz * spread);
        }
      }

      const damp = Math.exp(-3 * dt);
      for (let p = 0; p < cap; p++) {
        const a = age[p] as number;
        if (a >= DUST.life) {
          if (a !== Infinity) {
            age[p] = Infinity;
            writePuff(p, 0, 0, PARKED_Y, 0);
          }
          continue;
        }
        const na = a + dt;
        age[p] = na;
        if (na >= DUST.life) {
          writePuff(p, 0, 0, PARKED_Y, 0);
          age[p] = Infinity;
          continue;
        }
        px[p] = (px[p] as number) + (vx[p] as number) * dt;
        py[p] = (py[p] as number) + (vy[p] as number) * dt;
        pz[p] = (pz[p] as number) + (vz[p] as number) * dt;
        vx[p] = (vx[p] as number) * damp;
        vy[p] = (vy[p] as number) * damp;
        vz[p] = (vz[p] as number) * damp;
        // Grow fast to full size, then shrink to a third and vanish.
        const t = na / DUST.life;
        const k = t < 0.25 ? 0.4 + 0.6 * (t / 0.25) : 1 - 0.65 * ((t - 0.25) / 0.75);
        writePuff(p, (size[p] as number) * k, px[p] as number, py[p] as number, pz[p] as number);
      }
      pos.needsUpdate = true;
    },
  };
  return pool;
}
