import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BufferGeometry } from 'three';
import { paletteIndex, tokens, type PaletteName } from '@tokens';
import { ROSTER, raceDrivers } from '../../src/content/drivers.ts';
import { CAR, buildCar, buildCarGeometry, buildRoundelGeometry, validateLivery } from '../../src/render/car.ts';
import { createMaterials } from '../../src/render/index.ts';
import { paletteSet } from '../render/helpers.ts';

const mats = createMaterials();
const ids = (...names: PaletteName[]): Set<number> => new Set(names.map(paletteIndex));

/** Palette indices of the solid triangles that rise above the body top: the cabin's faces. */
function cabinFaces(geo: BufferGeometry): number[] {
  const pos = geo.getAttribute('position');
  const pal = geo.getAttribute('paletteIndex');
  const solid = geo.userData.solidVertexCount as number;
  const out: number[] = [];
  for (let v = 0; v < solid; v += 3) {
    const ys = [pos.getY(v), pos.getY(v + 1), pos.getY(v + 2)];
    if (ys.every((y) => y >= CAR.bodyTop - 1e-6) && ys.some((y) => y > CAR.bodyTop + 0.1)) out.push(pal.getX(v));
  }
  return out;
}

describe('driver roster', () => {
  it('AC1: ROSTER has the six drivers in order with exact liveries, all valid', () => {
    expect(ROSTER.map((d) => [d.name, d.number, d.body, d.stripe, d.player])).toEqual([
      ['YOU', 1, 'rally-red', 'cream', true],
      ['KOSKI', 7, 'mustard', 'navy', false],
      ['BRUNO', 23, 'navy', 'mustard', false],
      ['DEL RIO', 4, 'teal', 'cream', false],
      ['MAGS', 9, 'cream', 'rally-red', false],
      ['OTTO', 12, 'grass', 'cream', false],
    ]);
    for (const d of ROSTER) expect(() => validateLivery(d)).not.toThrow();
  });

  it('AC2: one player; AI bodies are never red, distinct, and equal tokens.cars.ai', () => {
    expect(ROSTER.filter((d) => d.player)).toHaveLength(1);
    const ai = ROSTER.filter((d) => !d.player).map((d) => d.body);
    expect(ai).not.toContain('rally-red');
    expect(new Set(ai).size).toBe(ai.length);
    expect(new Set(ai)).toEqual(new Set(tokens.cars.ai));
  });

  it('AC3: each car uses exactly body, stripe, cabin and ink; roundel cream + ink; ▼ for YOU only', () => {
    for (const d of ROSTER) {
      const cabin: PaletteName = d.body === 'navy' ? 'teal' : 'navy';
      expect(paletteSet(buildCarGeometry(d)), d.name).toEqual(ids(d.body, d.stripe, cabin, 'ink'));
      expect(paletteSet(buildRoundelGeometry(d.number)), d.name).toEqual(ids('cream', 'ink'));
      expect(buildCar(d, mats).marker !== null, d.name).toBe(d.name === 'YOU');
    }
  });

  it('AC4: BRUNO #23 (navy) has a teal cabin with no navy faces; every other cabin is navy', () => {
    for (const d of ROSTER) {
      const faces = cabinFaces(buildCarGeometry(d));
      expect(faces.length, d.name).toBeGreaterThan(0);
      const want = d.name === 'BRUNO' ? 'teal' : 'navy';
      expect(new Set(faces), d.name).toEqual(ids(want));
    }
    const bruno = ROSTER.find((d) => d.name === 'BRUNO');
    expect(bruno?.body).toBe('navy');
    expect(cabinFaces(buildCarGeometry(bruno!))).not.toContain(paletteIndex('navy'));
  });

  it('AC5: raceDrivers(2) is YOU #1 then KOSKI #7, and game.ts uses it with no livery literal', () => {
    expect(raceDrivers(2).map((d) => [d.name, d.number, d.player])).toEqual([
      ['YOU', 1, true],
      ['KOSKI', 7, false],
    ]);
    expect(raceDrivers(6)).toEqual([...ROSTER]);
    expect(raceDrivers(1).map((d) => d.name)).toEqual(['YOU']);
    expect(() => raceDrivers(7)).toThrow();
    const game = readFileSync('src/game.ts', 'utf8');
    expect(game).toMatch(/import \{[^}]*\braceDrivers\b[^}]*\} from '\.\/content\/drivers\.ts'/);
    expect(game).not.toMatch(/LIVERIES/);
    expect(game).not.toMatch(/\bbody:\s*'/);
    expect(game).not.toMatch(/playerLivery/);
  });
});
