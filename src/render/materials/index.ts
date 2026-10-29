// The ONE materials factory. Nothing else in src/ may construct a Three.js material or shader.
//
// Colour pipeline (proved in the M1.5 spike, see PHASE0_STATUS.md):
// - Every geometry carries a Uint8 `paletteIndex` attribute (0..9, PALETTE order from @tokens).
// - Shaders are GLSL3 RawShaderMaterials. The vertex shader picks the final palette index and passes
//   it through a `flat` varying; the fragment shader looks it up in `palette[10]`. Shading only steps
//   down `ladder[10]` (LADDER_INDEX), so a pixel can never be anything but one of the 10 colours.
// - Renderer side: ColorManagement disabled, LinearSRGB output, no tone mapping (see ../renderer.ts).
//
// Kinds (also stored in material.userData.kind):
// - toon:   lit, 3 hard steps per UI_RULES §9. For every solid mesh; needs an outline hull.
// - flat:   unlit base colour. Ground-level meshes (track, shadows, ground) whose normals all point
//           straight up need no hull; anything else using it (dust, the ▼ marker) still gets one.
// - hull:   inverted-hull ink outline, pushed out in clip space along `smoothNormal`.
// - crease: ink edge lines (LineSegments) between faces.
import { BackSide, FrontSide, GLSL3, RawShaderMaterial, Vector2, Vector3, type Material } from 'three';
import { LADDER_INDEX, PALETTE_HEX, paletteIndex } from '@tokens';

export type MaterialKind = 'toon' | 'flat' | 'hull' | 'crease';

/** Direction TO the light (UI_RULES §9): west −0.55, south −0.25, up 0.8. +x east, +y up, +z south. */
export const LIGHT_DIRECTION: Readonly<Vector3> = new Vector3(-0.55, 0.8, -0.25).normalize();

/** Toon thresholds on N·L (UI_RULES §9): ≥ 0.7 base colour, ≥ −0.6 one rung down, else two rungs. */
export const TOON_STEPS = { base: 0.7, oneRung: -0.6 } as const;

/**
 * UI_RULES §8: "Top faces take the base colour". A face whose world normal has y ≥ this is a top
 * face and stays base colour even if it tilts slightly away from the light (a ramp slope driven
 * eastwards would otherwise drop to ink).
 */
export const TOP_FACE_MIN_Y = 0.95;

/** Outline width in pixels for an 844-px-wide drawing buffer; scales with buffer width (world-proportional). */
export const OUTLINE_PX_AT_844 = 2.5;

/**
 * CPU mirror of the toon vertex shader's colour pick (same constants), for tests and tooling:
 * the palette index a face with base colour `base` and world-space unit `normal` is drawn in.
 */
export function toonShade(base: number, normal: { x: number; y: number; z: number }): number {
  if (normal.y >= TOP_FACE_MIN_Y) return base;
  const d = normal.x * LIGHT_DIRECTION.x + normal.y * LIGHT_DIRECTION.y + normal.z * LIGHT_DIRECTION.z;
  let idx = base;
  if (d < TOON_STEPS.base) idx = LADDER_INDEX[idx] as number;
  if (d < TOON_STEPS.oneRung) idx = LADDER_INDEX[idx] as number;
  return idx;
}

/** Every material this factory created. Gates and tests use it to spot foreign materials. */
const FACTORY_MATERIALS = new WeakSet<Material>();

/** True if the material came from this factory. */
export function isFactoryMaterial(material: Material): boolean {
  return FACTORY_MATERIALS.has(material) && material.userData.factory === true;
}

/** A PALETTE_HEX entry → 0..1 RGB, byte for byte (no colour management: the bytes are the colour). */
function hexToVec3(hex: string): Vector3 {
  const n = Number.parseInt(hex.slice(1), 16);
  return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const INK = `${paletteIndex('ink')}u`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 palette[10];
flat in uint vIndex;
out vec4 outColor;
void main() { outColor = vec4(palette[vIndex], 1.0); }`;

const TOON_VERTEX = /* glsl */ `
in vec3 position;
in vec3 normal;
in uint paletteIndex;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
uniform vec3 lightDir;
uniform int ladder[10];
flat out uint vIndex;
void main() {
  vec3 n = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  float d = dot(n, lightDir);
  int idx = int(paletteIndex);
  bool top = n.y >= ${TOP_FACE_MIN_Y.toFixed(3)};
  if (!top && d < ${TOON_STEPS.base.toFixed(3)}) idx = ladder[idx];
  if (!top && d < ${TOON_STEPS.oneRung.toFixed(3)}) idx = ladder[idx];
  vIndex = uint(idx);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const FLAT_VERTEX = /* glsl */ `
in vec3 position;
in uint paletteIndex;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
flat out uint vIndex;
void main() {
  vIndex = paletteIndex;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const HULL_VERTEX = /* glsl */ `
in vec3 position;
in vec3 smoothNormal;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
uniform vec2 resolution;
uniform float widthPx;
flat out uint vIndex;
void main() {
  vec4 clip = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  vec3 n = mat3(viewMatrix) * (transpose(inverse(mat3(modelMatrix))) * smoothNormal);
  vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(0.0);
  clip.xy += dir * widthPx * 2.0 / resolution * clip.w;
  vIndex = ${INK};
  gl_Position = clip;
}`;

const CREASE_VERTEX = /* glsl */ `
in vec3 position;
in uint paletteIndex;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
flat out uint vIndex;
void main() {
  vIndex = paletteIndex;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position.z -= 0.0003 * gl_Position.w; // pull edges just in front of the faces they sit on
}`;

/** The shared material set for one scene. Meshes share these instances. */
export interface Materials {
  readonly toon: RawShaderMaterial;
  readonly flat: RawShaderMaterial;
  readonly hull: RawShaderMaterial;
  readonly crease: RawShaderMaterial;
  /** Call with the drawing-buffer size (CSS size × pixel ratio) whenever it changes. */
  setViewport(bufferWidth: number, bufferHeight: number): void;
  /** Current outline width in drawing-buffer pixels. */
  outlinePx(): number;
}

function make(kind: MaterialKind, params: ConstructorParameters<typeof RawShaderMaterial>[0]): RawShaderMaterial {
  const m = new RawShaderMaterial({ glslVersion: GLSL3, fragmentShader: FRAGMENT, ...params });
  m.name = `factory:${kind}`;
  m.userData = { factory: true, kind };
  FACTORY_MATERIALS.add(m);
  return m;
}

/** Creates the four shared materials. One set per scene is enough. */
export function createMaterials(): Materials {
  const palette = { value: PALETTE_HEX.map(hexToVec3) };
  const resolution = { value: new Vector2(844, 390) };
  const widthPx = { value: OUTLINE_PX_AT_844 };

  const toon = make('toon', {
    vertexShader: TOON_VERTEX,
    side: FrontSide,
    uniforms: { palette, lightDir: { value: LIGHT_DIRECTION.clone() }, ladder: { value: [...LADDER_INDEX] } },
  });
  const flat = make('flat', { vertexShader: FLAT_VERTEX, side: FrontSide, uniforms: { palette } });
  const hull = make('hull', {
    vertexShader: HULL_VERTEX,
    side: BackSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    uniforms: { palette, resolution, widthPx },
  });
  const crease = make('crease', { vertexShader: CREASE_VERTEX, uniforms: { palette } });

  return {
    toon,
    flat,
    hull,
    crease,
    setViewport(bufferWidth, bufferHeight) {
      resolution.value.set(Math.max(1, bufferWidth), Math.max(1, bufferHeight));
      widthPx.value = (OUTLINE_PX_AT_844 * Math.max(1, bufferWidth)) / 844;
    },
    outlinePx: () => widthPx.value,
  };
}
