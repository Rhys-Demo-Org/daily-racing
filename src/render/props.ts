// Prop meshes (UI_RULES §8–9), all in a local frame with the prop at the origin on the ground,
// +x right, −z forward (along the prop's heading). Colours are BASE colours: vertical faces never
// reach N·L 0.7 under the §9 light, so they show one rung down the ladder.
//   hay bale   mustard box 1.2 wide × 1.2 tall × 2 long (sides show dirt)
//   tyre stack three ink tyres; upward bevels and the top are navy
//   cone tree  two grass cones (shaded facets show deep-green) on a trunk that reads dark-dirt
//   ramp       wedge from RampInstance: dark-dirt slope with rally-red/cream chevrons (geometry)
import type { PropKind, RampInstance } from '../sim/types.ts';
import { MeshBuilder, type Vec3 } from './geometry.ts';

type Built = ReturnType<MeshBuilder['build']>;

/** Footprint sizes used for placement and shadows. */
export const PROP_SIZE = {
  'hay-bale': { width: 1.2, height: 1.2, length: 2 },
  'tyre-stack': { radius: 0.8, height: 1.26 },
  'cone-tree': { radius: 1.1, height: 6.8 },
} as const;

export function buildHayBale(): Built {
  const { width, height, length } = PROP_SIZE['hay-bale'];
  return new MeshBuilder().box([-width / 2, 0, -length / 2], [width / 2, height, length / 2], 'mustard').build();
}

export function buildTyreStack(): Built {
  const b = new MeshBuilder();
  const tyreH = 0.42;
  const inner = 0.62;
  const outer = PROP_SIZE['tyre-stack'].radius;
  const profile: [number, number][] = [[0, 0]];
  for (let i = 0; i < 3; i++) {
    const y = i * tyreH;
    profile.push([inner, y], [outer, y + 0.1], [outer, y + tyreH - 0.1], [inner, y + tyreH]);
  }
  const top = 3 * tyreH;
  const holeR = 0.32;
  const holeFloor = top - 0.15;
  profile.push([holeR, top], [holeR, holeFloor]);
  b.lathe(profile, 10, (n) => (n.y > 0.3 ? 'navy' : 'ink'));
  b.lathe([[holeR, holeFloor], [0, holeFloor]], 10, 'ink');
  return b.build();
}

export function buildConeTree(): Built {
  const b = new MeshBuilder();
  // Trunk base colour is dirt: its vertical faces always step one rung, so it reads dark-dirt.
  // Its top is hidden inside the lower cone, so it has no top cap. Tall and narrow so the trunk
  // shows below the canopy from the 57° camera (canopy base y must exceed ~1.54 × its radius).
  b.lathe([[0, 0], [0.24, 0], [0.24, 2.6]], 6, 'dirt');
  b.lathe([[0, 2.3], [1.1, 2.3], [0, 5.3]], 7, 'grass');
  b.lathe([[0, 4.2], [0.8, 4.2], [0, PROP_SIZE['cone-tree'].height]], 7, 'grass', Math.PI / 7);
  return b.build();
}

export function buildProp(kind: PropKind): Built {
  switch (kind) {
    case 'hay-bale':
      return buildHayBale();
    case 'tyre-stack':
      return buildTyreStack();
    case 'cone-tree':
      return buildConeTree();
  }
}

/**
 * Chevron lines across the slope as fractions of the slope length (0 = foot, 1 = lip). Bands between
 * consecutive lines alternate CHEVRON_COLOURS; outside them the slope is dark-dirt. Each line is a
 * V pointing up the slope: its arms sit CHEVRON_DEPTH lower at the ramp's edges.
 */
const CHEVRON_LINES = [0.3, 0.44, 0.58, 0.72, 0.86] as const;
const CHEVRON_COLOURS = ['rally-red', 'cream', 'rally-red', 'cream'] as const;
const CHEVRON_DEPTH = 0.22;

/**
 * Ramp wedge in its local frame: the lip (highest edge) is centred on the origin line z = 0 and the
 * slope rises along −z (forward) from z = +length. The slope's normal is ≥ 0.95 up for any sane
 * ramp, so the toon shader treats it as a top face: it stays dark-dirt instead of dropping to ink.
 */
export function buildRamp(r: Pick<RampInstance, 'length' | 'width' | 'height'>): Built {
  const b = new MeshBuilder();
  const { length: L, width: W, height: H } = r;
  const hw = W / 2;
  const at = (u: number, s: number): Vec3 => [u, H * s, L * (1 - s)]; // u across, s along slope
  const slopeOut: Vec3 = [0, L, H];
  const lines = [...CHEVRON_LINES];
  const bands: { lo: number | null; hi: number | null; colour: 'dark-dirt' | 'rally-red' | 'cream' }[] = [];
  bands.push({ lo: null, hi: lines[0] ?? null, colour: 'dark-dirt' });
  for (let i = 0; i + 1 < lines.length; i++) bands.push({ lo: lines[i] ?? 0, hi: lines[i + 1] ?? 1, colour: CHEVRON_COLOURS[i % CHEVRON_COLOURS.length] ?? 'cream' });
  bands.push({ lo: lines[lines.length - 1] ?? null, hi: null, colour: 'dark-dirt' });
  for (const side of [-1, 1]) {
    for (const band of bands) {
      // Each half of each band is a quad: inner edge on the centreline, outer edge at the ramp side.
      const loC = band.lo ?? 0;
      const loE = band.lo === null ? 0 : band.lo - CHEVRON_DEPTH;
      const hiC = band.hi ?? 1;
      const hiE = band.hi === null ? 1 : band.hi - CHEVRON_DEPTH;
      b.quad(at(0, loC), at(side * hw, loE), at(side * hw, hiE), at(0, hiC), band.colour, slopeOut);
    }
  }
  // Lip face, sides and bottom.
  b.quad([-hw, 0, 0], [hw, 0, 0], [hw, H, 0], [-hw, H, 0], 'dark-dirt', [0, 0, -1]);
  b.tri([-hw, 0, 0], [-hw, H, 0], [-hw, 0, L], 'dark-dirt', [-1, 0, 0]);
  b.tri([hw, 0, 0], [hw, H, 0], [hw, 0, L], 'dark-dirt', [1, 0, 0]);
  b.quad([-hw, 0, 0], [hw, 0, 0], [hw, 0, L], [-hw, 0, L], 'dark-dirt', [0, -1, 0]);
  return b.build();
}

// ---- Blob shadows -------------------------------------------------------------------------------

/**
 * Shadows are flat ink shapes offset east/north-east (UI_RULES §8–9). The offset grows with the
 * caster's height: (east, north) units per unit of height.
 */
export const SHADOW_OFFSET_PER_HEIGHT = { east: 0.45, north: 0.2 } as const;

type Pt = [number, number];

/** A regular polygon / ellipse outline [x, z] around the origin. */
export function ellipse(rx: number, rz: number, segments: number): Pt[] {
  return Array.from({ length: segments }, (_, i): Pt => {
    const a = (i / segments) * Math.PI * 2;
    return [rx * Math.cos(a), rz * Math.sin(a)];
  });
}

/** Rectangle with chamfered corners, w across (x) by l along (z). */
export function chamferedRect(w: number, l: number, c: number): Pt[] {
  const x = w / 2;
  const z = l / 2;
  return [[-x + c, -z], [x - c, -z], [x, -z + c], [x, z - c], [x - c, z], [-x + c, z], [-x, z - c], [-x, -z + c]];
}

/** A shadow outline in the caster's LOCAL frame (rotated with it), plus the caster height. */
export interface ShadowShape {
  outline: Pt[];
  height: number;
}

export function propShadow(kind: PropKind): ShadowShape {
  switch (kind) {
    case 'hay-bale':
      return { outline: chamferedRect(1.3, 2.1, 0.1), height: PROP_SIZE['hay-bale'].height };
    case 'tyre-stack':
      return { outline: ellipse(0.85, 0.85, 10), height: PROP_SIZE['tyre-stack'].height };
    case 'cone-tree':
      // The canopy's blob. Offset as if 3 units tall: a true 6.8 would throw it far from the trunk.
      return { outline: ellipse(1.3, 1.1, 12), height: 3 };
  }
}

export function rampShadow(r: Pick<RampInstance, 'length' | 'width' | 'height'>): ShadowShape {
  const hw = r.width / 2;
  return { outline: [[-hw, 0], [hw, 0], [hw, r.length], [-hw, r.length]], height: r.height };
}

/** World-space outline of a shadow for a caster at (x, z) with `heading`, lifted `extraHeight` (jumps). */
export function placeShadow(shape: ShadowShape, x: number, z: number, heading: number, extraHeight = 0): Pt[] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const h = shape.height + extraHeight;
  const ox = x + SHADOW_OFFSET_PER_HEIGHT.east * h;
  const oz = z - SHADOW_OFFSET_PER_HEIGHT.north * h;
  // Local → world for heading h (rotation.y = −heading): x' = x cos h − z sin h, z' = x sin h + z cos h.
  return shape.outline.map(([lx, lz]): Pt => [ox + lx * c - lz * s, oz + lx * s + lz * c]);
}
