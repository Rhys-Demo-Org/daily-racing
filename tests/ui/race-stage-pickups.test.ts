// @vitest-environment happy-dom
// raceStage can set up a pickup track's race screen directly: its `pickups` option reaches the
// RaceView it syncs, so the desktop keycap legend lists SPACE · POWER-UP on the first sync.
import { describe, expect, it, vi } from 'vitest';
import { racer, raceStage } from '../../src/ui/stages/stage.ts';
import './helpers.ts';

/** matchMedia for a 1440×900 desktop (fine pointer). */
function useDesktop(): void {
  vi.stubGlobal('matchMedia', (query: string) => {
    const list = new EventTarget() as MediaQueryList;
    const matches = query.includes('(pointer: fine)');
    Object.assign(list, { media: query, matches, onchange: null, addListener() {}, removeListener() {} });
    return list;
  });
}

const labels = (): string[] =>
  [...(document.querySelector('[role="group"][aria-label="Keyboard controls"]')?.querySelectorAll('.ui-label') ?? [])].map((l) =>
    (l.textContent ?? '').trim().toUpperCase(),
  );

describe('raceStage pickups option', () => {
  it('syncs a pickup RaceView: the legend shows POWER-UP, and without the option it does not', () => {
    useDesktop();
    const racers = [0, 1].map((i) => ({ ...racer(i + 1, 3, []), armed: false, boostTicks: 0 }));
    const root = document.createElement('div');
    document.body.append(root);
    raceStage(root, { phase: 'racing', countdown: 0, raceTick: 600, racers, at: [0.5, 0.4], pickups: [true, false] });
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'POWER-UP', 'PAUSE']);

    document.body.replaceChildren();
    const plain = document.createElement('div');
    document.body.append(plain);
    raceStage(plain, { phase: 'racing', countdown: 0, raceTick: 600, racers: [racer(1, 3, []), racer(2, 3, [])], at: [0.5, 0.4] });
    expect(labels()).toEqual(['STEER', 'GAS', 'BRAKE', 'PAUSE']);
  });
});
