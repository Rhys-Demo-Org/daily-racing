import { describe, expect, it } from 'vitest';
import type { Material, Mesh, Texture } from 'three';
import { paletteIndex } from '@tokens';
import { allNormalsUp, createRaceScene, isFactoryMaterial, playerLivery, type CarLivery } from '../../src/render/index.ts';
import { dustBowlFixture } from './fixture.ts';
import { carView, linesOf, meshesOf } from './helpers.ts';

const liveries: CarLivery[] = [playerLivery(1), { body: 'mustard', stripe: 'navy', number: 7, player: false }];

function build() {
  const fx = dustBowlFixture();
  return { fx, race: createRaceScene(fx.layout, liveries) };
}

describe('race scene from a TrackLayout', () => {
  it('has one prop mesh per PropInstance, by kind, plus ramps, cars and track meshes', () => {
    const { fx, race } = build();
    const expected: Record<string, number> = {};
    for (const p of fx.layout.props) expected[p.kind] = (expected[p.kind] ?? 0) + 1;
    const got: Record<string, number> = {};
    for (const child of race.scene.getObjectByName('props')?.children ?? []) {
      const k = String(child.userData.kind);
      got[k] = (got[k] ?? 0) + 1;
    }
    expect(got).toEqual(expected);
    expect(expected['hay-bale']).toBeGreaterThan(20);
    expect(expected['tyre-stack']).toBeGreaterThan(20);
    expect(expected['cone-tree']).toBeGreaterThan(10);
    expect(race.scene.getObjectByName('ramps')?.children.filter((c) => c.userData.kind === 'ramp')).toHaveLength(fx.layout.ramps.length);
    expect(race.scene.getObjectByName('cars')?.children).toHaveLength(2);
    for (const name of ['ground', 'track-ribbon', 'start-band', 'static-shadows', 'dust']) {
      expect(race.scene.getObjectByName(name), name).toBeDefined();
    }
    expect(race.scene.getObjectByName('shadows')?.children.filter((c) => c.name === 'car-shadow')).toHaveLength(2);
  });

  it('every mesh uses a factory material, palette indices < 10, and a hull unless flat ground', () => {
    const { race } = build();
    const meshes = meshesOf(race.scene);
    expect(meshes.length).toBeGreaterThan(100);
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
        continue;
      }
      expect(['toon', 'flat']).toContain(role);
      const hulls = m.children.filter((c) => c.userData.render === 'hull') as Mesh[];
      expect(hulls, `${m.name} hull`).toHaveLength(1);
      expect(hulls[0]?.geometry.getAttribute('smoothNormal')).toBeDefined();
      hulled++;
    }
    expect(hulled).toBeGreaterThan(50);
  });

  it('crease lines are factory-material ink, and no material holds a texture', () => {
    const { race } = build();
    const lines = linesOf(race.scene);
    expect(lines.length).toBeGreaterThan(50);
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
    const { fx, race } = build();
    const s = fx.at(0.3);
    race.update([carView({ x: s.x, z: s.z, heading: s.heading, y: 1.5, airborne: true }), carView({ x: 5, z: 5 })], 1 / 60);
    const player = race.cars[0];
    expect(player?.root.position.toArray()).toEqual([s.x, 1.5, s.z]);
    expect(player?.body.rotation.y).toBeCloseTo(-s.heading);
    expect(player?.roundel.rotation.y).toBe(0); // the race number always reads upright
    const shadow = race.scene.getObjectByName('shadows')?.children.filter((c) => c.name === 'car-shadow')[0];
    expect(shadow?.position.y).toBeLessThan(0.1);
    expect(shadow?.position.x).toBeGreaterThan(s.x); // east
    expect(shadow?.position.z).toBeLessThan(s.z); // north
  });
});
