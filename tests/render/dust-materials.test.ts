import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, Vector3 } from 'three';
import { paletteIndex, PALETTE } from '@tokens';
import { createDust, createMaterials, DUST, isFactoryMaterial, toonShade } from '../../src/render/index.ts';
import { buildConeTree, buildRamp } from '../../src/render/props.ts';
import { carView } from './helpers.ts';

describe('dust pool', () => {
  it('never grows: fixed capacity and buffer size however much is emitted', () => {
    const dust = createDust(createMaterials(), 7);
    const pos = dust.mesh.geometry.getAttribute('position');
    const length = pos.array.length;
    const sliding = carView({ speed: 25, slip: 1 });
    for (let i = 0; i < 600; i++) {
      for (let k = 0; k < 5; k++) dust.emit(0, 0.3, 0, 1, 1, 1);
      dust.update([sliding, carView({ speed: 20, surface: 'grass', x: 10 })], 1 / 60);
      expect(dust.active()).toBeLessThanOrEqual(DUST.capacity);
    }
    expect(dust.capacity).toBe(DUST.capacity);
    expect(dust.mesh.geometry.getAttribute('position')).toBe(pos);
    expect(pos.array.length).toBe(length);
  });

  it('emits behind sliding or grass-driving cars and on landing, not when gripping on dirt', () => {
    const dust = createDust(createMaterials(), 7);
    for (let i = 0; i < 60; i++) dust.update([carView({ speed: 25, slip: 0 })], 1 / 60);
    expect(dust.active()).toBe(0);
    for (let i = 0; i < 10; i++) dust.update([carView({ speed: 25, slip: 0.9 })], 1 / 60);
    expect(dust.active()).toBeGreaterThan(0);

    const landing = createDust(createMaterials(), 7);
    landing.update([carView({ speed: 25, airborne: true, y: 1 })], 1 / 60);
    expect(landing.active()).toBe(0);
    landing.update([carView({ speed: 25 })], 1 / 60);
    expect(landing.active()).toBe(DUST.landingBurst);
  });

  it('is deterministic for a given seed', () => {
    const run = (): number[] => {
      const d = createDust(createMaterials(), 3);
      for (let i = 0; i < 30; i++) d.update([carView({ speed: 25, slip: 1, heading: i / 10 })], 1 / 60);
      return Array.from(d.mesh.geometry.getAttribute('position').array as Float32Array);
    };
    expect(run()).toEqual(run());
  });

  it('puffs are cream with an ink hull', () => {
    const dust = createDust(createMaterials(), 1);
    expect(new Set(dust.mesh.geometry.getAttribute('paletteIndex').array)).toEqual(new Set([paletteIndex('cream')]));
    expect(dust.mesh.children.filter((c) => c.userData.render === 'hull')).toHaveLength(1);
  });
});

describe('materials factory and toon steps', () => {
  it('registers its materials and nothing else', () => {
    const m = createMaterials();
    for (const mat of [m.toon, m.flat, m.hull, m.crease]) expect(isFactoryMaterial(mat)).toBe(true);
    const foreign = new MeshBasicMaterial();
    expect(isFactoryMaterial(foreign)).toBe(false);
    foreign.userData.factory = true; // forging the flag is not enough
    expect(isFactoryMaterial(foreign)).toBe(false);
  });

  it('steps down the ladder at N·L 0.7 and −0.6, keeping top faces at base', () => {
    const red = paletteIndex('rally-red');
    expect(toonShade(red, { x: 0, y: 1, z: 0 })).toBe(red);
    expect(PALETTE[toonShade(red, { x: 0, y: 0, z: 1 })]).toBe('dark-dirt'); // south side: one rung
    expect(PALETTE[toonShade(red, { x: 0, y: -1, z: 0 })]).toBe('ink'); // underside: two rungs
    const toLight = new Vector3(-0.55, 0.8, -0.25).normalize();
    expect(toonShade(red, toLight)).toBe(red);
  });

  it('a ramp slope reads dark-dirt (not ink) whichever way the ramp faces', () => {
    const geo = buildRamp({ length: 5, width: 8.4, height: 1 });
    const n = geo.getAttribute('normal');
    const c = geo.getAttribute('paletteIndex');
    for (let h = 0; h < 16; h++) {
      const rot = (h / 16) * Math.PI * 2;
      for (let i = 0; i < n.count; i += 3) {
        const v = new Vector3().fromBufferAttribute(n, i).applyAxisAngle(new Vector3(0, 1, 0), -rot);
        if (v.y < 0.5) continue; // slope faces only
        const base = c.getX(i);
        expect(toonShade(base, v), `heading ${h}/16`).toBe(base);
      }
    }
  });

  it('cone tree trunk reads dark-dirt and canopy shows grass and deep-green facets', () => {
    const geo = buildConeTree();
    const n = geo.getAttribute('normal');
    const c = geo.getAttribute('paletteIndex');
    const trunk = new Set<string>();
    const canopy = new Set<string>();
    for (let i = 0; i < n.count; i += 3) {
      const v = new Vector3().fromBufferAttribute(n, i);
      if (v.y < 0) continue; // undersides are never seen
      const shown = PALETTE[toonShade(c.getX(i), v)] as string;
      (PALETTE[c.getX(i)] === 'dirt' ? trunk : canopy).add(shown);
    }
    expect(trunk).toEqual(new Set(['dark-dirt']));
    expect(canopy).toEqual(new Set(['grass', 'deep-green']));
  });
});
