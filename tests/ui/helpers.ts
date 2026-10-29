// Shared helpers for UI tests (happy-dom). Importing this module also resets the DOM, timers and
// mocks after each test.
import { afterEach, vi } from 'vitest';
import type { HudState } from '../../src/ui/types.ts';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

export const outline: [number, number][] = [
  [0, 0],
  [40, -10],
  [80, 0],
  [70, 30],
  [10, 30],
];

/** A HUD view model: P2 of 6 on lap 1/3 at 0:06.12, no best lap, player first in the car list. */
export function hudState(over: Partial<HudState> = {}): HudState {
  return {
    position: 2,
    carCount: 6,
    lap: 1,
    laps: 3,
    timeMs: 6120,
    bestLapMs: null,
    minimap: {
      outline,
      cars: [
        { x: 0, z: 0, colour: 'rally-red', player: true },
        { x: 40, z: -10, colour: 'mustard', player: false },
        { x: 80, z: 0, colour: 'navy', player: false },
      ],
    },
    ...over,
  };
}
