// B10: the race scene built from Hay Loop's layout places all of its props and its ramp.
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import { getTrack } from '../../src/content/tracks.ts';
import { createRaceScene, playerLivery, type PlacedProp } from '../../src/render/index.ts';
import { trackLayout } from '../../src/sim/index.ts';

describe('B10: Hay Loop race scene', () => {
  it('AC7: prop cells list its hay bales, tyre stacks, cone trees and one ramp, matching the layout', () => {
    const layout = trackLayout(getTrack('hay-loop'));
    const race = createRaceScene(layout, [playerLivery(1)]);
    const expected: Record<string, number> = { ramp: layout.ramps.length };
    for (const p of layout.props) expected[p.kind] = (expected[p.kind] ?? 0) + 1;
    const got: Record<string, number> = {};
    const cells = (race.scene.getObjectByName('props')?.children ?? []).filter((c) => c.name === 'prop-cell') as Mesh[];
    for (const cell of cells) {
      for (const p of cell.userData.props as PlacedProp[]) got[p.kind] = (got[p.kind] ?? 0) + 1;
    }
    expect(got).toEqual(expected);
    expect(got['ramp']).toBe(1);
    for (const kind of ['hay-bale', 'tyre-stack', 'cone-tree']) expect(got[kind]).toBeGreaterThan(0);
  });
});
