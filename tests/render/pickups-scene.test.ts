// B12: pickup boxes in the race scene (AC9): one outlined mesh per layout pickup in a 'pickups'
// group, hidden (with its blob shadow) while the RaceView says the box is taken.
import { describe, expect, it } from 'vitest';
import type { Mesh } from 'three';
import { getTrack } from '../../src/content/tracks.ts';
import { createRaceScene, playerLivery } from '../../src/render/index.ts';
import { carViews, createBot, createWorld, raceView, stepWorld, trackLayout } from '../../src/sim/index.ts';

describe('B12: pickups in the race scene', () => {
  it('AC9: Dust Bowl has a pickups group with one outlined mesh per layout pickup, at the pickup', () => {
    const layout = trackLayout(getTrack('dust-bowl'));
    const race = createRaceScene(layout, [playerLivery(1)]);
    const boxes = (race.scene.getObjectByName('pickups')?.children ?? []) as Mesh[];
    expect(layout.pickups.length).toBeGreaterThan(0);
    expect(boxes).toHaveLength(layout.pickups.length);
    race.scene.updateMatrixWorld(true);
    boxes.forEach((box, i) => {
      expect(box.isMesh).toBe(true);
      expect(box.visible).toBe(true);
      expect(box.children.filter((c) => c.userData.render === 'hull')).toHaveLength(1);
      expect(box.position.x).toBeCloseTo(layout.pickups[i]?.x ?? NaN, 6);
      expect(box.position.z).toBeCloseTo(layout.pickups[i]?.z ?? NaN, 6);
    });
  });

  it('AC9: a box hides while its RaceView pickups entry is false and shows again when it is back', () => {
    const track = getTrack('dust-bowl');
    const world = createWorld(track, { seed: 1, carCount: 1 });
    const bot = createBot(world, 0);
    const race = createRaceScene(world.track.layout, [playerLivery(1)]);
    const boxes = (race.scene.getObjectByName('pickups')?.children ?? []) as Mesh[];
    const shadows = (race.scene.getObjectByName('shadows')?.children ?? []).filter((c) => c.name === 'pickup-shadow');
    expect(shadows).toHaveLength(boxes.length);
    let hidden = 0;
    let shownAgain = false;
    for (let t = 0; t < 1000; t++) {
      stepWorld(world, [bot.input(world)]);
      const present = raceView(world).pickups ?? [];
      race.update(carViews(world), 1 / 60, 0, 1, present);
      present.forEach((on, i) => {
        expect(boxes[i]?.visible).toBe(on);
        expect(shadows[i]?.visible).toBe(on);
      });
      if (present.includes(false)) hidden++;
      else if (hidden > 0) shownAgain = true;
    }
    expect(hidden).toBe(300);
    expect(shownAgain).toBe(true);
  });

  it('AC9: only pickup tracks get pickup meshes', () => {
    const count = (id: string): number => createRaceScene(trackLayout(getTrack(id)), [playerLivery(1)]).scene.getObjectByName('pickups')?.children.length ?? 0;
    expect(count('bends')).toBe(0);
    expect(count('hay-loop')).toBe(0);
    expect(count('dust-bowl')).toBe(trackLayout(getTrack('dust-bowl')).pickups.length);
    expect(count('dust-bowl')).toBeGreaterThan(0);
  });
});
