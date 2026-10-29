import { describe, expect, it } from 'vitest';
import { Box3, type Material, type Mesh, type Texture } from 'three';
import { paletteIndex } from '@tokens';
import { allNormalsUp, CELL_SIZE, CHUNK_ROWS, createRaceScene, isFactoryMaterial, LAYER, playerLivery, type CarLivery, type PlacedProp } from '../../src/render/index.ts';
import { at, carView, layout, linesOf, meshesOf } from './helpers.ts';

const liveries: CarLivery[] = [playerLivery(1), { body: 'mustard', stripe: 'navy', number: 7, player: false }];

const build = () => createRaceScene(layout, liveries);
const named = (race: ReturnType<typeof build>, group: string, name: string): Mesh[] =>
  (race.scene.getObjectByName(group)?.children ?? []).filter((c) => c.name === name) as Mesh[];

describe('race scene from the Dust Bowl TrackLayout', () => {
  it('prop cells list every prop and ramp by kind; plus cars, track chunks and car shadows', () => {
    const race = build();
    const expected: Record<string, number> = { ramp: layout.ramps.length };
    for (const p of layout.props) expected[p.kind] = (expected[p.kind] ?? 0) + 1;
    const got: Record<string, number> = {};
    const cells = named(race, 'props', 'prop-cell');
    for (const cell of cells) {
      const placed = cell.userData.props as PlacedProp[];
      cell.geometry.computeBoundingBox();
      const box = cell.geometry.boundingBox as Box3;
      expect(new Set(placed.map((p) => `${Math.floor(p.x / CELL_SIZE)},${Math.floor(p.z / CELL_SIZE)}`)).size).toBe(1);
      for (const p of placed) {
        got[p.kind] = (got[p.kind] ?? 0) + 1;
        expect(box.containsPoint(box.min.clone().set(p.x, box.min.y, p.z)), `${p.kind} at ${p.x},${p.z}`).toBe(true);
      }
    }
    expect(got).toEqual(expected);
    expect(layout.props).toHaveLength(398);
    expect(expected['hay-bale']).toBeGreaterThan(20);
    expect(expected['tyre-stack']).toBeGreaterThan(20);
    expect(expected['cone-tree']).toBeGreaterThan(10);
    expect(cells.length).toBeGreaterThan(10);
    expect(cells.length).toBeLessThan(layout.props.length / 4);
    expect(race.scene.getObjectByName('cars')?.children).toHaveLength(2);
    expect(named(race, 'shadows', 'car-shadow')).toHaveLength(2);
    expect(race.scene.getObjectByName('dust')).toBeDefined();
  });

  it('splits the ribbon (with start band and static shadows) into ~CHUNK_ROWS-row chunks with their own bounds', () => {
    const race = build();
    const chunks = named(race, 'track', 'track-chunk');
    expect(chunks).toHaveLength(Math.round(layout.centre.length / CHUNK_ROWS));
    const colours = new Set<number>();
    let triangles = 0;
    for (const c of chunks) {
      c.geometry.computeBoundingSphere();
      expect(c.geometry.boundingSphere!.radius).toBeLessThan(80); // a whole-track mesh is ~210
      for (const i of c.geometry.getAttribute('paletteIndex').array) colours.add(i);
      triangles += c.geometry.getAttribute('position').count / 3;
    }
    for (const name of ['dirt', 'dark-dirt', 'cream', 'ink'] as const) expect(colours).toContain(paletteIndex(name));
    expect(colours).not.toContain(paletteIndex('grass')); // no grass mesh: the clear colour is the ground
    expect(triangles).toBeGreaterThan(layout.centre.length * 14); // ribbon + start band + shadows
  });

  it('static groups never update their matrices', () => {
    const race = build();
    for (const name of ['track', 'props']) {
      race.scene.getObjectByName(name)?.traverse((o) => {
        expect(o.matrixAutoUpdate, o.name).toBe(false);
        expect(o.matrixWorldAutoUpdate, o.name).toBe(false);
      });
    }
  });

  it('every mesh uses a factory material, palette indices < 10, and a hull unless flat on the ground', () => {
    const race = build();
    race.update([carView({ x: 5, z: 5 }), carView({ x: 9, z: 5 })], 1 / 60);
    race.scene.updateMatrixWorld(true);
    const meshes = meshesOf(race.scene);
    let hulled = 0;
    for (const m of meshes) {
      const mat = m.material as Material;
      expect(isFactoryMaterial(mat), `${m.name} material`).toBe(true);
      const idx = m.geometry.getAttribute('paletteIndex');
      expect(idx, `${m.name} paletteIndex`).toBeDefined();
      expect(idx.array).toBeInstanceOf(Uint8Array);
      expect(Math.max(...(idx.array as Uint8Array))).toBeLessThan(10);
      const role = m.userData.render;
      if (role === 'hull') {
        expect(mat.userData.kind).toBe('hull');
        continue;
      }
      if (role === 'ground') {
        expect(mat.userData.kind, m.name).toBe('flat');
        expect(allNormalsUp(m.geometry), `${m.name} normals all up`).toBe(true);
        expect(new Box3().setFromObject(m).max.y, `${m.name} on the ground`).toBeLessThanOrEqual(LAYER.shadow + 1e-6);
        continue;
      }
      expect(['toon', 'flat']).toContain(role);
      const hulls = m.children.filter((c) => c.userData.render === 'hull') as Mesh[];
      expect(hulls, `${m.name} hull`).toHaveLength(1);
      expect(hulls[0]?.geometry.getAttribute('smoothNormal')).toBeDefined();
      hulled++;
    }
    expect(hulled).toBeGreaterThan(10);
  });

  it('crease lines are factory-material ink, and no material holds a texture', () => {
    const race = build();
    const lines = linesOf(race.scene);
    expect(lines.length).toBeGreaterThan(10);
    for (const l of lines) {
      expect(isFactoryMaterial(l.material as Material)).toBe(true);
      expect(new Set(l.geometry.getAttribute('paletteIndex').array)).toEqual(new Set([paletteIndex('ink')]));
    }
    race.scene.traverse((o) => {
      const mat = (o as Mesh).material as Material | undefined;
      if (!mat) return;
      const uniforms = (mat as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms ?? {};
      for (const u of Object.values(uniforms)) expect((u.value as Texture | null)?.isTexture).not.toBe(true);
      expect((mat as Material & { map?: unknown }).map ?? null).toBeNull();
    });
  });

  it('update places cars by position, heading and jump height, with an east/north-east shadow', () => {
    const race = build();
    const s = at(0.3);
    race.update([carView({ x: s.x, z: s.z, heading: s.heading, y: 1.5, airborne: true }), carView({ x: 5, z: 5 })], 1 / 60);
    const player = race.cars[0];
    expect(player?.root.position.toArray()).toEqual([s.x, 1.5, s.z]);
    expect(player?.body.rotation.y).toBeCloseTo(-s.heading);
    expect(player?.roundel.rotation.y).toBe(0); // the race number always reads upright
    const shadow = named(race, 'shadows', 'car-shadow')[0];
    expect(shadow?.position.y).toBeLessThan(0.1);
    expect(shadow?.position.x).toBeGreaterThan(s.x); // east
    expect(shadow?.position.z).toBeLessThan(s.z); // north
  });

  it('after a race, reset() makes a reused scene start exactly like a fresh one', () => {
    const drive = (race: ReturnType<typeof build>, from: number, frames: number): void => {
      for (let i = 0; i < frames; i++) {
        const s = at(from + i / 600);
        const v = carView({ x: s.x, z: s.z, heading: s.heading, speed: 30, slip: 0.8 });
        race.update([v, carView({ ...v, x: v.x + 3 })], 1 / 60);
      }
    };
    const reused = build();
    drive(reused, 0.4, 200); // fast and sliding: velocity look-ahead and plenty of dust
    reused.reset();
    const fresh = build();
    const start = at(0);
    const views = [carView({ x: start.x, z: start.z, heading: start.heading }), carView({ x: start.x + 3, z: start.z })];
    for (const race of [reused, fresh]) {
      race.update(views, 0);
      race.snapCamera();
    }
    expect(reused.camera.position.toArray()).toEqual(fresh.camera.position.toArray());
    const dust = (race: ReturnType<typeof build>): Mesh => race.scene.getObjectByName('dust') as Mesh;
    expect(dust(reused).visible).toBe(false);
    expect(dust(reused).geometry.getAttribute('position').array).toEqual(dust(fresh).geometry.getAttribute('position').array);
    drive(reused, 0, 30);
    drive(fresh, 0, 30);
    expect(reused.camera.position.toArray()).toEqual(fresh.camera.position.toArray());
    expect(dust(reused).geometry.getAttribute('position').array).toEqual(dust(fresh).geometry.getAttribute('position').array);
  });
});
