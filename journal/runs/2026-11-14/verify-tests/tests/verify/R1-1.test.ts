// @vitest-environment happy-dom
// R1-1: a race reset during the countdown (pause → RESTART RACE) must replay the race entry: the
// HUD and touch layers have to drop and re-apply their entry state so the CSS slide restarts.
import { describe, expect, it } from 'vitest';
import type { CarView, RaceView, RacerView } from '../../src/sim/types.ts';
import { createRaceUi } from '../../src/ui/race-ui.ts';
import { outline } from '../ui/helpers.ts';

const car = (x: number): CarView => ({ x, y: 0, z: 0, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false });
const racer = (over: Partial<RacerView> = {}): RacerView => ({ lapsCompleted: 0, lap: 1, lapTicks: [], finishTick: null, position: 1, ...over });
const countdown: RaceView = { phase: 'countdown', countdown: 3, raceTick: 0, racers: [racer(), racer({ position: 2 })] };
const cars = [car(0), car(10)];

describe('R1-1', () => {
  it('a reset during the countdown restarts the entry on the HUD and touch layers', () => {
    const ui = createRaceUi(document.body, { onRaceAgain: () => {} });
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(countdown, cars);
    const hud = document.querySelector('.ui-hud') as HTMLElement;
    const touch = ui.touch.element;
    expect(hud.classList.contains('is-entering')).toBe(true);

    const records: MutationRecord[] = [];
    const obs = new MutationObserver((r) => records.push(...r));
    obs.observe(hud, { attributes: true, attributeFilter: ['class'] });
    obs.observe(touch, { attributes: true, attributeFilter: ['class'] });
    // Pause during the countdown, then RESTART RACE: game.startRace → ui.reset → countdown again.
    ui.pause();
    ui.reset(3, outline, ['rally-red', 'mustard']);
    ui.sync(countdown, cars);
    records.push(...obs.takeRecords());
    obs.disconnect();

    expect(records.filter((r) => r.target === hud).length, 'HUD entry restarted').toBeGreaterThan(0);
    expect(records.filter((r) => r.target === touch).length, 'touch entry restarted').toBeGreaterThan(0);
    expect(hud.classList.contains('is-entering')).toBe(true);
  });
});
