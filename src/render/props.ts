// Prop meshes (UI_RULES §8–9), each added to a MeshBuilder in a local frame with the prop at the
// origin on the ground, +x right, −z forward (along the prop's heading). Colours are BASE colours:
// vertical faces never reach N·L 0.7 under the §9 light, so they show one rung down the ladder.
//   hay bale   mustard box the size of the sim's collider (sides show dirt)
//   tyre stack three ink tyres; upward bevels and the top are navy
//   cone tree  two grass cones (shaded facets show deep-green) on a trunk that reads dark-dirt
//   ramp       wedge from RampInstance: dark-dirt slope with rally-red/cream chevrons (geometry)
import type { PropKind, RampInstance } from '../sim/types.ts';
import { HAY_BALE_LENGTH, HAY_BALE_WIDTH, TYRE_STACK_RADIUS } from '../sim/track.ts';
import { MeshBuilder, type Vec3 } from './geometry.ts';

type Pt = [number, number];

/** A shadow outline in the caster's LOCAL frame (rotated with it), plus the caster height. */
export interface ShadowShape {
  outline: Pt[];
  height: number;
}

/** A regular polygon / ellipse outline [x, z] around the origin. */
function ellipse(rx: number, rz: number, segments: number): Pt[] {
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

const BALE_HEIGHT = 1.2;
const TYRE_HEIGHT = 0.42;

/** Every prop kind: how to add its mesh to a builder, and its blob shadow. */
export const PROPS: Record<PropKind, { add(b: MeshBuilder): MeshBuilder; shadow: ShadowShape }> = {
  'hay-bale': {
    add: (b) => b.box([-HAY_BALE_WIDTH / 2, 0, -HAY_BALE_LENGTH / 2], [HAY_BALE_WIDTH / 2, BALE_HEIGHT, HAY_BALE_LENGTH / 2], 'mustard'),
    shadow: { outline: chamferedRect(HAY_BALE_WIDTH + 0.1, HAY_BALE_LENGTH + 0.1, 0.1), height: BALE_HEIGHT },
  },
  'tyre-stack': {
    add(b) {
      const inner = 0.62;
      const profile: [number, number][] = [[0, 0]];
      for (let i = 0; i < 3; i++) {
        const y = i * TYRE_HEIGHT;
        profile.push([inner, y], [TYRE_STACK_RADIUS, y + 0.1], [TYRE_STACK_RADIUS, y + TYRE_HEIGHT - 0.1], [inner, y + TYRE_HEIGHT]);
      }
      const top = 3 * TYRE_HEIGHT;
      const holeR = 0.32;
      const holeFloor = top - 0.15;
      profile.push([holeR, top], [holeR, holeFloor]);
      b.lathe(profile, 10, (n) => (n.y > 0.3 ? 'navy' : 'ink'));
      return b.lathe([[holeR, holeFloor], [0, holeFloor]], 10, 'ink');
    },
    shadow: { outline: ellipse(TYRE_STACK_RADIUS + 0.05, TYRE_STACK_RADIUS + 0.05, 10), height: 3 * TYRE_HEIGHT },
  },
  'cone-tree': {
    // Trunk base colour is dirt: its vertical faces always step one rung, so it reads dark-dirt.
    // Its top is hidden inside the lower cone, so it has no top cap. Tall and narrow so the trunk
    // shows below the canopy from the 57° camera (canopy base y must exceed ~1.54 × its radius).
    add: (b) =>
      b
        .lathe([[0, 0], [0.24, 0], [0.24, 2.6]], 6, 'dirt')
        .lathe([[0, 2.3], [1.1, 2.3], [0, 5.3]], 7, 'grass')
        .lathe([[0, 4.2], [0.8, 4.2], [0, 6.8]], 7, 'grass', Math.PI / 7),
    // The canopy's blob. Offset as if 3 units tall: the true 6.8 would throw it far from the trunk.
    shadow: { outline: ellipse(1.3, 1.1, 12), height: 3 },
  },
};

/**
 * Chevron lines across the slope as fractions of the slope length (0 = foot, 1 = lip). Bands between
 * consecutive lines alternate CHEVRON_COLOURS; outside them the slope is dark-dirt. Each line is a
 * V pointing up the slope: its arms sit CHEVRON_DEPTH lower at the ramp's edges.
 */
const CHEVRON_LINES = [0.3, 0.44, 0.58, 0.72, 0.86] as const;
const CHEVRON_COLOURS = ['rally-red', 'cream', 'rally-red', 'cream'] as const;
const CHEVRON_DEPTH = 0.22;

/**
 * Adds a ramp wedge in its local frame: the lip (highest edge) is centred on the origin line z = 0
 * and the slope rises along −z (forward) from z = +length. The slope's normal is ≥ 0.95 up for any
 * sane ramp, so the toon shader treats it as a top face: it stays dark-dirt instead of dropping to ink.
 */
export function addRamp(b: MeshBuilder, r: Pick<RampInstance, 'length' | 'width' | 'height'>): MeshBuilder {
  const { length: L, width: W, height: H } = r;
  const hw = W / 2;
  const at = (u: number, s: number): Vec3 => [u, H * s, L * (1 - s)]; // u across, s along slope
  // Band edges as [s at the centreline, s at the ramp's side]: straight foot and lip, V'd chevrons.
  const cuts = [[0, 0], ...CHEVRON_LINES.map((s) => [s, s - CHEVRON_DEPTH]), [1, 1]] as Pt[];
  const colours = ['dark-dirt', ...CHEVRON_COLOURS, 'dark-dirt'] as const;
  for (const side of [-hw, hw]) {
    colours.forEach((colour, i) => {
      const [loC, loE] = cuts[i] as Pt;
      const [hiC, hiE] = cuts[i + 1] as Pt;
      b.quad(at(0, loC), at(side, loE), at(side, hiE), at(0, hiC), colour, [0, L, H]);
    });
  }
  // Lip face, sides and bottom.
  b.quad([-hw, 0, 0], [hw, 0, 0], [hw, H, 0], [-hw, H, 0], 'dark-dirt', [0, 0, -1]);
  b.tri([-hw, 0, 0], [-hw, H, 0], [-hw, 0, L], 'dark-dirt', [-1, 0, 0]);
  b.tri([hw, 0, 0], [hw, H, 0], [hw, 0, L], 'dark-dirt', [1, 0, 0]);
  return b.quad([-hw, 0, 0], [hw, 0, 0], [hw, 0, L], [-hw, 0, L], 'dark-dirt', [0, -1, 0]);
}

// ---- Blob shadows -------------------------------------------------------------------------------

/**
 * Shadows are flat ink shapes offset east/north-east (UI_RULES §8–9). The offset grows with the
 * caster's height: (east, north) units per unit of height.
 */
export const SHADOW_OFFSET_PER_HEIGHT = { east: 0.45, north: 0.2 } as const;

export function rampShadow(r: Pick<RampInstance, 'length' | 'width' | 'height'>): ShadowShape {
  const hw = r.width / 2;
  return { outline: [[-hw, 0], [hw, 0], [hw, r.length], [-hw, r.length]], height: r.height };
}

/** World-space outline of a shadow for a caster at (x, z) with `heading`. */
export function placeShadow(shape: ShadowShape, x: number, z: number, heading: number): Pt[] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const ox = x + SHADOW_OFFSET_PER_HEIGHT.east * shape.height;
  const oz = z - SHADOW_OFFSET_PER_HEIGHT.north * shape.height;
  // Local → world for heading h (rotation.y = −heading): x' = x cos h − z sin h, z' = x sin h + z cos h.
  return shape.outline.map(([lx, lz]): Pt => [ox + lx * c - lz * s, oz + lx * s + lz * c]);
}
