// @vitest-environment happy-dom
// B11 · Only the player's (car 0's) finish saves racer.finished.<id>: a bot crossing the line on
// Hay Loop while the player sits on the grid must not unlock Pine Ridge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PINE, card, padlock, setup } from './pine-ridge-helpers.ts';

vi.mock('../../src/render/index.ts', () => ({
  createRenderer: () => ({}),
  createRaceScene: () => ({ update() {}, render() {}, reset() {}, resize() {}, dispose() {} }),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('B11 only a player finish unlocks', () => {
  it('AC6: a bot finishing on Hay Loop while car 0 has not finished saves nothing and Pine Ridge stays locked', () => {
    const { game, root } = setup();
    game.startRace({ trackId: 'hay-loop', seed: 3, carCount: 2 });
    let ticks = 0;
    while (game.state().race?.racers[1]?.finishTick == null && ticks < 10800) {
      game.step(60);
      ticks += 60;
    }
    const racers = game.state().race?.racers;
    expect(racers?.[1]?.finishTick).not.toBeNull();
    expect(racers?.[0]?.finishTick).toBeNull();
    expect(localStorage.getItem('racer.finished.hay-loop')).toBeNull();
    game.showMenu();
    expect(card(root, PINE).getAttribute('aria-disabled')).toBe('true');
    expect(padlock(card(root, PINE))).not.toBeNull();
  });
});
