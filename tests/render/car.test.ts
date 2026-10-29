import { describe, expect, it } from 'vitest';
import { paletteIndex, type PaletteName } from '@tokens';
import { buildCar, cabinColour, createMaterials, playerLivery, validateLivery, type CarLivery } from '../../src/render/index.ts';
import { paletteSet } from './helpers.ts';

const mats = createMaterials();
const ids = (...names: PaletteName[]): number[] => names.map(paletteIndex);

describe('car liveries', () => {
  it('player car: rally-red body, cream stripe and a red ▼ marker', () => {
    const l = playerLivery(1);
    expect(l).toEqual({ body: 'rally-red', stripe: 'cream', number: 1, player: true });
    const car = buildCar(l, mats);
    const all = paletteSet(car.body.geometry);
    for (const i of ids('rally-red', 'cream', 'navy', 'ink')) expect(all).toContain(i);
    // The stripe is a decal (after the solid part) and is cream; the roundel is cream with an ink number.
    const decals = paletteSet(car.body.geometry, car.body.geometry.userData.solidVertexCount as number);
    expect(decals).toEqual(new Set(ids('cream')));
    expect(paletteSet(car.roundel.geometry)).toEqual(new Set(ids('cream', 'ink')));
    expect(car.marker).not.toBeNull();
    expect(car.marker?.name).toBe('player-marker');
    expect(paletteSet(car.marker!.geometry)).toEqual(new Set(ids('rally-red', 'ink')));
    expect(car.marker!.position.y).toBeGreaterThan(3);
    expect(car.marker!.children.some((c) => c.userData.render === 'hull')).toBe(true);
  });

  it('rejects a non-player car with a rally-red body, and a player that is not red + cream', () => {
    expect(() => validateLivery({ body: 'rally-red', stripe: 'cream', number: 3, player: false })).toThrow(/never rally-red/);
    expect(() => buildCar({ body: 'rally-red', stripe: 'navy', number: 3, player: false }, mats)).toThrow();
    expect(() => validateLivery({ body: 'mustard', stripe: 'cream', number: 1, player: true })).toThrow();
    expect(() => validateLivery({ body: 'rally-red', stripe: 'navy', number: 1, player: true })).toThrow();
  });

  it('accepts every AI body colour from tokens, with no marker', () => {
    for (const body of ['mustard', 'teal', 'cream', 'navy', 'grass'] as const) {
      const l: CarLivery = { body, stripe: body === 'cream' ? 'navy' : 'cream', number: 23, player: false };
      const car = buildCar(l, mats);
      expect(car.marker).toBeNull();
      expect(paletteSet(car.body.geometry)).toContain(paletteIndex(body));
      expect(paletteSet(car.body.geometry)).not.toContain(paletteIndex('rally-red'));
    }
  });

  it('a navy body gets a teal cabin; others get navy', () => {
    expect(cabinColour('navy')).toBe('teal');
    expect(cabinColour('mustard')).toBe('navy');
    const navy = buildCar({ body: 'navy', stripe: 'cream', number: 4, player: false }, mats);
    expect(paletteSet(navy.body.geometry)).toContain(paletteIndex('teal'));
  });

  it('race numbers are built from geometry (more ink blocks for 88 than for 1)', () => {
    const inkFaces = (n: number): number => {
      const g = buildCar({ body: 'teal', stripe: 'cream', number: n, player: false }, mats).roundel.geometry;
      const a = g.getAttribute('paletteIndex');
      let c = 0;
      for (let i = g.userData.solidVertexCount as number; i < a.count; i++) if (a.getX(i) === paletteIndex('ink')) c++;
      return c;
    };
    expect(inkFaces(1)).toBeGreaterThan(0);
    expect(inkFaces(88)).toBeGreaterThan(inkFaces(1) * 5);
    expect(() => validateLivery({ body: 'teal', stripe: 'cream', number: 100, player: false })).toThrow();
  });
});
