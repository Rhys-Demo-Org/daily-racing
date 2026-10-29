// The race scene: track, props, ramps, blob shadows, cars, dust and the follow camera, built from
// the sim's TrackLayout. The game loop owns timing and interpolation; it calls update() with the
// (interpolated) car views every rendered frame, then render().
//
// Scene graph (names are stable; tests and gates walk them):
//   race
//   ├─ track      ground (grass), track-ribbon, start-band          (ground meshes, no hull)
//   ├─ shadows    static-shadows (props + ramps), car-shadow × cars (ground meshes, no hull)
//   ├─ props      one toon mesh per PropInstance, userData.kind = PropKind
//   ├─ ramps      one toon mesh per RampInstance, userData.kind = 'ramp'
//   ├─ cars       one Group per car (userData.kind = 'car'), body mesh + player ▼ marker
//   └─ dust       pooled puffs
import { Group, Mesh, Scene, Vector2, type BufferGeometry, type PerspectiveCamera, type WebGLRenderer } from 'three';
import type { CarView, PropKind, TrackLayout } from '../sim/types.ts';
import { createCameraRig, type CameraRig } from './camera.ts';
import { buildCar, CAR, poseCar, type CarLivery, type CarObject } from './car.ts';
import { createDust, type DustPool } from './dust.ts';
import { MeshBuilder } from './geometry.ts';
import { createMaterials, type Materials } from './materials/index.ts';
import { groundMesh, solidMesh } from './outline.ts';
import { buildProp, buildRamp, chamferedRect, placeShadow, propShadow, rampShadow, SHADOW_OFFSET_PER_HEIGHT } from './props.ts';
import { buildGround, buildStartBand, buildTrackRibbon, LAYER } from './track.ts';

export interface RaceScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly materials: Materials;
  readonly rig: CameraRig;
  /** Index-aligned with the liveries passed in (and with the CarView arrays passed to update). */
  readonly cars: readonly CarObject[];
  readonly dust: DustPool;
  /**
   * Moves cars (position, heading, jump height), their shadows, dust and the camera.
   * `cars` must be index-aligned with the liveries. `dtSeconds` is real time since the last call.
   */
  update(cars: readonly CarView[], dtSeconds: number): void;
  /** Jumps the camera to the player with no smoothing (race start, after a reset). */
  snapCamera(): void;
  /** Renders one frame with the renderer passed to createRaceScene. */
  render(): void;
  /** Viewport size in CSS pixels: resizes the renderer (if any), camera and outline width. */
  resize(width: number, height: number): void;
}

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
  const shadows = group('shadows');
  const props = group('props');
  const ramps = group('ramps');
  const carsGroup = group('cars');

  track.add(groundMesh(buildGround(layout), mats, 'ground'));
  track.add(groundMesh(buildTrackRibbon(layout), mats, 'track-ribbon'));
  track.add(groundMesh(buildStartBand(layout), mats, 'start-band'));

  // Props: one shared geometry per kind (and so one shared hull/crease per kind).
  const shadowBuilder = new MeshBuilder();
  const geoByKind = new Map<PropKind, BufferGeometry>();
  for (const p of layout.props) {
    let geo = geoByKind.get(p.kind);
    if (!geo) geoByKind.set(p.kind, (geo = buildProp(p.kind)));
    const mesh = solidMesh(geo, mats, p.kind);
    mesh.userData.kind = p.kind;
    mesh.position.set(p.x, LAYER.ground, p.z);
    mesh.rotation.y = -p.heading;
    props.add(mesh);
    shadowBuilder.ground(placeShadow(propShadow(p.kind), p.x, p.z, p.heading), LAYER.shadow, 'ink');
  }

  for (const r of layout.ramps) {
    const mesh = solidMesh(buildRamp(r), mats, 'ramp');
    mesh.userData.kind = 'ramp';
    // Sits just above the shadow layer so no shadow can poke through its thin foot.
    mesh.position.set(r.x, LAYER.shadow + 0.01, r.z);
    mesh.rotation.y = -r.heading;
    ramps.add(mesh);
    shadowBuilder.ground(placeShadow(rampShadow(r), r.x, r.z, r.heading), LAYER.shadow, 'ink');
  }
  if (shadowBuilder.triangleCount > 0) shadows.add(groundMesh(shadowBuilder.build(), mats, 'static-shadows'));

  // Cars and their shadows (shadow geometry is in the car's local frame; the mesh follows the car).
  const carShadowGeo = new MeshBuilder().ground(chamferedRect(CAR.width + 0.3, CAR.length + 0.3, 0.45), 0, 'ink').build();
  const cars = liveries.map((l) => buildCar(l, mats));
  const carShadows = cars.map(() => {
    const m = groundMesh(carShadowGeo, mats, 'car-shadow');
    m.position.y = LAYER.shadow;
    shadows.add(m);
    return m;
  });
  for (const c of cars) carsGroup.add(c.root);

  const dust = createDust(mats, 1);
  scene.add(dust.mesh);

  const rig = createCameraRig();
  const playerIndex = Math.max(0, liveries.findIndex((l) => l.player));

  // Per-car velocity estimate from position deltas (look-ahead follows travel, not the nose).
  const prevX = new Float64Array(cars.length);
  const prevZ = new Float64Array(cars.length);
  const velX = new Float64Array(cars.length);
  const velZ = new Float64Array(cars.length);
  let seen = false;

  const placeCars = (views: readonly CarView[]): void => {
    for (let i = 0; i < cars.length; i++) {
      const v = views[i];
      const c = cars[i] as CarObject;
      const s = carShadows[i] as Mesh;
      if (!v) continue;
      poseCar(c, v);
      const lift = CAR_SHADOW_HEIGHT + Math.max(0, v.y);
      s.position.set(v.x + SHADOW_OFFSET_PER_HEIGHT.east * lift, LAYER.shadow, v.z - SHADOW_OFFSET_PER_HEIGHT.north * lift);
      s.rotation.y = -v.heading;
    }
  };

  /** Camera aspect/distance and outline width for a CSS-pixel viewport. */
  const applyViewport = (width: number, height: number): void => {
    const ratio = renderer ? renderer.getPixelRatio() : 1;
    mats.setViewport(Math.round(width * ratio), Math.round(height * ratio));
    rig.resize(width, height);
  };

  const api: RaceScene = {
    scene,
    camera: rig.camera,
    materials: mats,
    rig,
    cars,
    dust,
    update(views, dt) {
      placeCars(views);
      const k = dt > 0 ? 1 - Math.pow(0.5, dt / VELOCITY_HALF_LIFE) : 0;
      for (let i = 0; i < cars.length; i++) {
        const v = views[i];
        if (!v) continue;
        if (seen && dt > 0) {
          const dx = v.x - (prevX[i] as number);
          const dz = v.z - (prevZ[i] as number);
          const teleport = Math.hypot(dx, dz) > 30;
          velX[i] = teleport ? 0 : (velX[i] as number) + (dx / dt - (velX[i] as number)) * k;
          velZ[i] = teleport ? 0 : (velZ[i] as number) + (dz / dt - (velZ[i] as number)) * k;
        }
        prevX[i] = v.x;
        prevZ[i] = v.z;
      }
      dust.update(views, dt);
      const p = views[playerIndex];
      if (p) {
        if (!seen) rig.snap(p.x, p.z);
        else rig.follow(p.x, p.z, velX[playerIndex] as number, velZ[playerIndex] as number, dt);
      }
      seen = true;
    },
    snapCamera() {
      const c = cars[playerIndex];
      if (c) rig.snap(c.root.position.x, c.root.position.z, velX[playerIndex], velZ[playerIndex]);
    },
    render() {
      if (!renderer) throw new Error('createRaceScene: no renderer was given');
      renderer.render(scene, rig.camera);
    },
    resize(width, height) {
      renderer?.setSize(width, height);
      applyViewport(width, height);
    },
  };
  // Start from the renderer's current size (or the 844×390 reference frame when headless).
  const initial = renderer ? renderer.getSize(new Vector2()) : new Vector2(844, 390);
  applyViewport(initial.x || 844, initial.y || 390);
  return api;
}
