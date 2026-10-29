// M1.5 spike: a toon/outline test scene built the way M2's materials factory will build it.
// Throwaway. It exists to prove the colour pipeline produces only palette pixels under SwiftShader.
import * as THREE from 'three';
import { LADDER_INDEX, PALETTE_HEX, paletteIndex, type PaletteName } from '@tokens';

THREE.ColorManagement.enabled = false;

const hexToVec3 = (hex: string): THREE.Vector3 => {
  const n = Number.parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// Direction to light per UI_RULES §9: west −0.55, south −0.25, up 0.8. World axes: +x east, +y up,
// +z south (the camera faces north, −z), so "south −0.25" is z = −0.25.
const LIGHT = new THREE.Vector3(-0.55, 0.8, -0.25).normalize();

const toonVertex = /* glsl */ `
in vec3 position;
in vec3 normal;
in uint paletteIndex;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
uniform vec3 lightDir;
uniform int ladder[10];
flat out uint vIndex;
void main() {
  vec3 n = normalize(mat3(modelMatrix) * normal);
  float d = dot(n, lightDir);
  int idx = int(paletteIndex);
  if (d < 0.7) idx = ladder[idx];
  if (d < -0.6) idx = ladder[idx];
  vIndex = uint(idx);
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
uniform vec3 palette[10];
flat in uint vIndex;
out vec4 outColor;
void main() { outColor = vec4(palette[vIndex], 1.0); }`;

const outlineVertex = /* glsl */ `
in vec3 position;
in vec3 smoothNormal;
uniform mat4 modelMatrix, viewMatrix, projectionMatrix;
uniform vec2 resolution;
uniform float widthPx;
flat out uint vIndex;
void main() {
  vec4 clip = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  vec3 n = mat3(viewMatrix) * mat3(modelMatrix) * smoothNormal;
  vec2 dir = normalize((projectionMatrix * vec4(n, 0.0)).xy + 1e-6);
  clip.xy += dir * widthPx * 2.0 / resolution * clip.w;
  vIndex = ${paletteIndex('ink')}u;
  gl_Position = clip;
}`;

const uniformsBase = {
  palette: { value: PALETTE_HEX.map(hexToVec3) },
};

export function toonMaterial(): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: toonVertex,
    fragmentShader: fragment,
    uniforms: { ...uniformsBase, lightDir: { value: LIGHT }, ladder: { value: [...LADDER_INDEX] } },
  });
}

export function outlineMaterial(resolution: THREE.Vector2): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: outlineVertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    uniforms: { ...uniformsBase, resolution: { value: resolution }, widthPx: { value: 2 } },
  });
}

/** Non-indexed geometry with flat normals and one palette index per vertex. */
function paint(geo: THREE.BufferGeometry, colour: (faceNormal: THREE.Vector3) => PaletteName): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals(); // non-indexed → per-face (flat) normals
  const n = g.getAttribute('normal');
  const idx = new Uint8Array(n.count);
  const v = new THREE.Vector3();
  for (let i = 0; i < n.count; i += 3) {
    v.fromBufferAttribute(n, i);
    idx.fill(paletteIndex(colour(v)), i, i + 3);
  }
  const attr = new THREE.BufferAttribute(idx, 1);
  attr.gpuType = THREE.IntType;
  g.setAttribute('paletteIndex', attr);
  // Smoothed normals for the hull: merge by position, average.
  const pos = g.getAttribute('position');
  const sums = new Map<string, THREE.Vector3>();
  const key = (i: number): string => `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    const s = sums.get(k) ?? new THREE.Vector3();
    s.add(v.fromBufferAttribute(n, i));
    sums.set(k, s);
  }
  const smooth = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) (sums.get(key(i)) as THREE.Vector3).clone().normalize().toArray(smooth, i * 3);
  g.setAttribute('smoothNormal', new THREE.BufferAttribute(smooth, 3));
  return g;
}

export function buildScene(width: number, height: number, copies = 1): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  const res = new THREE.Vector2(width, height);
  const toon = toonMaterial();
  const outline = outlineMaterial(res);

  let ox = 0;
  let oz = 0;
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, withOutline = true): void => {
    const mesh = new THREE.Mesh(geo, toon);
    mesh.position.set(x + ox, y, z + oz);
    scene.add(mesh);
    if (withOutline) {
      const hull = new THREE.Mesh(geo, outline);
      hull.position.copy(mesh.position);
      scene.add(hull);
    }
  };

  // Ground: grass plane with a dirt strip (flat, straight up: no hull).
  add(paint(new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), () => 'grass'), 0, 0, 0, false);
  add(paint(new THREE.PlaneGeometry(60, 8.4).rotateX(-Math.PI / 2), () => 'dirt'), 0, 0.01, 0, false);
  // Hay bales, tyre stacks, cone trees, a ramp wedge, a car-ish box. Extra copies (perf runs only)
  // are scattered in view to approach a real race's mesh count.
  for (let c = 0; c < copies; c++) {
  ox = c === 0 ? 0 : ((c * 7919) % 41) - 20;
  oz = c === 0 ? 0 : ((c * 104729) % 17) - 8;
  for (let i = 0; i < 5; i++) add(paint(new THREE.BoxGeometry(2, 1.2, 1.2), () => 'mustard'), -12 + i * 2.1, 0.6, -6);
  for (let i = 0; i < 4; i++) add(paint(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 10), (n) => (n.y > 0.9 ? 'navy' : 'ink')), 10, 0.7, -8 + i * 2);
  for (let i = 0; i < 4; i++) {
    add(paint(new THREE.ConeGeometry(1.6, 3.6, 7), () => 'grass'), -20 + i * 6, 3.2, 10);
    add(paint(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 6), () => 'dark-dirt'), -20 + i * 6, 0.7, 10);
  }
  const wedge = new THREE.BufferGeometry();
  // prettier-ignore
  const w = [ -2,0,1.5, 2,0,1.5, 2,1.2,-1.5,  -2,0,1.5, 2,1.2,-1.5, -2,1.2,-1.5,  -2,0,-1.5, -2,1.2,-1.5, 2,1.2,-1.5,  -2,0,-1.5, 2,1.2,-1.5, 2,0,-1.5,
              -2,0,1.5, -2,1.2,-1.5, -2,0,-1.5,  2,0,1.5, 2,0,-1.5, 2,1.2,-1.5 ];
  wedge.setAttribute('position', new THREE.Float32BufferAttribute(w, 3));
  add(paint(wedge, () => 'dark-dirt'), 4, 0, 0);
  add(paint(new THREE.BoxGeometry(4.2, 1.1, 2.2), (n) => (n.y > 0.9 ? 'cream' : 'rally-red')), -4, 0.75, 1.5);
  }
  ox = 0;
  oz = 0;

  // Camera per UI_RULES §9: pitch 57°, vfov 19°, north-up, ~56 units across at the target.
  const aspect = width / height;
  const camera = new THREE.PerspectiveCamera(19, aspect, 1, 400);
  const hfov = 2 * Math.atan(Math.tan((19 * Math.PI) / 360) * aspect);
  const dist = 56 / 2 / Math.tan(hfov / 2);
  const pitch = (57 * Math.PI) / 180;
  camera.position.set(0, Math.sin(pitch) * dist, Math.cos(pitch) * dist);
  camera.lookAt(0, 0, 0);
  return { scene, camera };
}
