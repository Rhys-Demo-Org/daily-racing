// The race scene: track, props, ramps, blob shadows, cars, dust and the follow camera, built from
// the sim's TrackLayout. The game loop owns timing and interpolation; it calls update() with the
// (interpolated) car views every rendered frame, then render().
//
// Scene graph (names are stable; tests and gates walk them):
//   race
//   ├─ track    static: 'track-chunk' × ~64 centreline rows each: ribbon, start band, prop and ramp
//   │           blob shadows (ground meshes, no hull)
//   ├─ props    static: one 'prop-cell' toon mesh per CELL_SIZE world cell holding every prop and ramp
//   │           in it, userData.props = [{ kind, x, z }] (kind is a PropKind or 'ramp')
//   ├─ shadows  'car-shadow' × cars (ground meshes, no hull)
//   ├─ cars     one Group per car (userData.kind = 'car'), body mesh + player ▼ marker
//   └─ dust     pooled puffs
// Static geometry is baked in world space, so static objects never update their matrices.
import { Group, Matrix4, Scene, Vector2, type BufferGeometry, type Mesh, type PerspectiveCamera, type WebGLRenderer } from 'three';
import type { CarView, PropKind, TrackLayout } from '../sim/types.ts';
import { createCameraRig } from './camera.ts';
import { buildCar, CAR, poseCar, type CarLivery, type CarObject } from './car.ts';
import { createDust } from './dust.ts';
import { MeshBuilder } from './geometry.ts';
import { createMaterials } from './materials/index.ts';
import { groundMesh, mergePlaced, solidMesh } from './outline.ts';
import { addRamp, chamferedRect, placeShadow, PROPS, rampShadow, SHADOW_OFFSET_PER_HEIGHT, type ShadowShape } from './props.ts';
import { pixelRatio } from './renderer.ts';
import { buildGroundChunks, LAYER } from './track.ts';

export interface RaceScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  /** Index-aligned with the liveries passed in (and with the CarView arrays passed to update). */
  readonly cars: readonly CarObject[];
  /**
   * Moves cars (position, heading, jump height), their shadows, dust and the camera.
   * `cars` must be index-aligned with the liveries. `dtSeconds` is real time since the last call.
   */
  update(cars: readonly CarView[], dtSeconds: number): void;
  /** Jumps the camera to the player with no smoothing (race start, after a reset). */
  snapCamera(): void;
  /** Forgets the previous race (camera velocity, dust) so a reused scene starts like a new one. */
  reset(): void;
  /** Renders one frame with the renderer passed to createRaceScene. */
  render(): void;
  /** Viewport size in CSS pixels: resizes the renderer (if any, re-reading the pixel ratio), camera and outline width. */
  resize(width: number, height: number): void;
}

/** One entry of a prop cell's userData.props. */
export interface PlacedProp {
  kind: PropKind | 'ramp';
  x: number;
  z: number;
}

type Placement = { x: number; z: number; heading: number };

/** World-cell size in units for merging static props: one toon mesh, hull and crease set per cell. */
export const CELL_SIZE = 32;
/** Height of the car body used to offset its shadow. */
const CAR_SHADOW_HEIGHT = 1.6;
/** Velocity smoothing for camera look-ahead (half-life, seconds). */
const VELOCITY_HALF_LIFE = 0.1;

/**
 * Builds the scene. `liveries` are validated (player red + cream, AI never red). Pass the renderer
 * from createRenderer to use render()/resize() on the canvas; leave it out for headless tests.
 */
export function createRaceScene(layout: TrackLayout, liveries: readonly CarLivery[], renderer?: WebGLRenderer): RaceScene {
  const mats = createMaterials();
  const scene = new Scene();
  scene.name = 'race';
  const group = (name: string): Group => {
    const g = new Group();
    g.name = name;
    scene.add(g);
    return g;
  };
  const track = group('track');
  const props = group('props');
  const shadows = group('shadows');
  const carsGroup = group('cars');

  // Props and ramps: each kind is built once, then copied into its world cell (one mesh, hull and
  // crease set per cell, baked in world space). Their shadows go into the ground chunks.
  const cells = new Map<string, { parts: { geo: BufferGeometry; matrix: Matrix4 }[]; props: PlacedProp[] }>();
  const shadowOutlines: [number, number][][] = [];
  const place = (kind: PlacedProp['kind'], geo: BufferGeometry, shadow: ShadowShape, at: Placement, y: number): void => {
    const key = `${Math.floor(at.x / CELL_SIZE)},${Math.floor(at.z / CELL_SIZE)}`;
    let cell = cells.get(key);
    if (!cell) cells.set(key, (cell = { parts: [], props: [] }));
    cell.parts.push({ geo, matrix: new Matrix4().makeRotationY(-at.heading).setPosition(at.x, y, at.z) });
    cell.props.push({ kind, x: at.x, z: at.z });
    shadowOutlines.push(placeShadow(shadow, at.x, at.z, at.heading));
  };
  const geoByKind = new Map<PropKind, BufferGeometry>();
  for (const p of layout.props) {
    let geo = geoByKind.get(p.kind);
    if (!geo) geoByKind.set(p.kind, (geo = PROPS[p.kind].add(new MeshBuilder()).build()));
    place(p.kind, geo, PROPS[p.kind].shadow, p, LAYER.ground);
  }
  // A ramp sits just above the shadow layer so no shadow can poke through its thin foot.
  for (const r of layout.ramps) place('ramp', addRamp(new MeshBuilder(), r).build(), rampShadow(r), r, LAYER.shadow + 0.01);
  for (const cell of cells.values()) {
    const mesh = solidMesh(mergePlaced(cell.parts), mats, 'prop-cell');
    mesh.userData.props = cell.props;
    props.add(mesh);
  }
  for (const geo of buildGroundChunks(layout, shadowOutlines)) track.add(groundMesh(geo, mats, 'track-chunk'));
  for (const g of [track, props]) {
    g.traverse((o) => {
      o.matrixAutoUpdate = false;
      o.matrixWorldAutoUpdate = false;
    });
  }

  // Cars and their shadows (shadow geometry is in the car's local frame; the mesh follows the car).
  const carShadowGeo = new MeshBuilder().ground(chamferedRect(CAR.width + 0.3, CAR.length + 0.3, 0.45), 0, 'ink').build();
  const cars = liveries.map((l) => buildCar(l, mats));
  const carShadows = cars.map(() => groundMesh(carShadowGeo, mats, 'car-shadow', LAYER.shadow));
  shadows.add(...carShadows);
  carsGroup.add(...cars.map((c) => c.root));

  const dust = createDust(mats, 1);
  scene.add(dust.mesh);

  const rig = createCameraRig();
  const playerIndex = Math.max(0, liveries.findIndex((l) => l.player));

  // The followed car's velocity, estimated from position deltas (look-ahead follows travel, not the nose).
  let prevX = 0;
  let prevZ = 0;
  let velX = 0;
  let velZ = 0;
  let seen = false;

  /** Camera aspect/distance and outline width for a CSS-pixel viewport. */
  const applyViewport = (width: number, height: number): void => {
    const ratio = renderer ? renderer.getPixelRatio() : 1;
    mats.setViewport(Math.round(width * ratio), Math.round(height * ratio));
    rig.resize(width, height);
  };

  const api: RaceScene = {
    scene,
    camera: rig.camera,
    cars,
    update(views, dt) {
      for (let i = 0; i < cars.length; i++) {
        const v = views[i];
        const s = carShadows[i] as Mesh;
        if (!v) continue;
        poseCar(cars[i] as CarObject, v);
        const lift = CAR_SHADOW_HEIGHT + Math.max(0, v.y);
        s.position.set(v.x + SHADOW_OFFSET_PER_HEIGHT.east * lift, LAYER.shadow, v.z - SHADOW_OFFSET_PER_HEIGHT.north * lift);
        s.rotation.y = -v.heading;
      }
      dust.update(views, dt);
      const p = views[playerIndex];
      if (!p) return;
      if (!seen) {
        rig.snap(p.x, p.z);
      } else {
        if (dt > 0) {
          const k = 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE);
          const dx = p.x - prevX;
          const dz = p.z - prevZ;
          const teleport = Math.hypot(dx, dz) > 30;
          velX = teleport ? 0 : velX + (dx / dt - velX) * k;
          velZ = teleport ? 0 : velZ + (dz / dt - velZ) * k;
        }
        rig.follow(p.x, p.z, velX, velZ, dt);
      }
      prevX = p.x;
      prevZ = p.z;
      seen = true;
    },
    snapCamera() {
      const c = cars[playerIndex];
      if (c) rig.snap(c.root.position.x, c.root.position.z, velX, velZ);
    },
    reset() {
      velX = 0;
      velZ = 0;
      seen = false;
      dust.reset();
    },
    render() {
      if (!renderer) throw new Error('createRaceScene: no renderer was given');
      renderer.render(scene, rig.camera);
    },
    resize(width, height) {
      renderer?.setPixelRatio(pixelRatio());
      renderer?.setSize(width, height);
      applyViewport(width, height);
    },
  };
  // Start from the renderer's current size (or the 844×390 reference frame when headless).
  const initial = renderer ? renderer.getSize(new Vector2()) : new Vector2(844, 390);
  applyViewport(initial.x || 844, initial.y || 390);
  return api;
}
