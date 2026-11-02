// Gate P2's material hash (harness/screens/scene.ts materialText): a change to a shader's source,
// defines or GLSL version, or to blending, polygon offset, wireframe or colour writes, changes the
// hash of every object drawn with that material.
import { describe, expect, it } from 'vitest';
import type { Mesh, RawShaderMaterial } from 'three';
import { createRaceScene, playerLivery } from '../../src/render/index.ts';
import { trackLayout } from '../../src/sim/index.ts';
import { getTrack } from '../../src/content/tracks.ts';
import { materialText, sceneEntries, type SceneEntry } from '../screens/scene.ts';

const layout = trackLayout(getTrack('dust-bowl'));
const build = () => {
  const race = createRaceScene(layout, [playerLivery(1)]);
  race.scene.updateMatrixWorld(true);
  return race;
};
type Walkable = Parameters<typeof sceneEntries>[0];
const entries = (race: ReturnType<typeof build>): SceneEntry[] => sceneEntries(race.scene as unknown as Walkable);
const changed = (a: SceneEntry[], b: SceneEntry[]): string[] => a.filter((e, i) => e.hash !== b[i]?.hash).map((e) => e.path);
const material = (race: ReturnType<typeof build>): RawShaderMaterial => (race.scene.getObjectByName('props')!.children[0] as Mesh).material as RawShaderMaterial;
type Text = Parameters<typeof materialText>[0];

describe('P2 material hash', { timeout: 60_000 }, () => {
  it('a one-character GLSL change fails P2: every object drawn with that material changes', () => {
    const base = entries(build());
    for (const edit of [(m: RawShaderMaterial) => { m.fragmentShader = m.fragmentShader.replace(/;/, ' ;'); }, (m: RawShaderMaterial) => { m.vertexShader += ' '; }]) {
      const race = build();
      edit(material(race));
      const diff = changed(base, entries(race));
      expect(diff).toContain('race/props[0]/prop-cell[0]');
      expect(diff.length).toBeGreaterThan(1); // the material is shared
    }
    expect(changed(base, entries(build()))).toEqual([]);
  });

  it('defines, GLSL version and render state are part of the hash', () => {
    const m = material(build());
    const base = materialText(m as unknown as Text);
    const edits: ((x: Record<string, unknown>) => void)[] = [
      (x) => { x.defines = { FOG: 1 }; }, (x) => { x.glslVersion = '100'; }, (x) => { x.blending = 2; }, (x) => { x.polygonOffset = !x.polygonOffset; },
      (x) => { x.polygonOffsetFactor = 3; }, (x) => { x.wireframe = true; }, (x) => { x.colorWrite = false; }, (x) => { x.blendSrc = 201; },
    ];
    for (const edit of edits) {
      const copy = Object.assign(Object.create(Object.getPrototypeOf(m) as object) as Record<string, unknown>, m);
      edit(copy);
      expect(materialText(copy as unknown as Text)).not.toBe(base);
    }
  });
});
