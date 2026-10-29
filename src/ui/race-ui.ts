// The race screen's UI (HUD, countdown, touch controls, finish panel), driven once per frame from
// sim views. One HudState is kept and updated in place, so a frame where nothing changed allocates
// nothing here and the HUD touches no DOM.
import type { PaletteName } from '@tokens';
import { TICK_HZ, type CarView, type RaceView } from '../sim/types.ts';
import { createCountdown, type CountdownStep } from './countdown.ts';
import { createFinishPanel } from './finish-panel.ts';
import { createHud } from './hud.ts';
import { createTouchControls, type TouchControls } from './touch-controls.ts';
import type { HudState } from './types.ts';

/** GO! is cleared this many ticks after the start, in sim time, so staged frames are deterministic. */
export const GO_HIDE_TICKS = TICK_HZ;

const ticksToMs = (ticks: number): number => (ticks * 1000) / TICK_HZ;

export interface RaceUi {
  readonly touch: TouchControls;
  /** Prepares for a new race. `colours` are the car body colours, index-aligned with the cars (0 = player). */
  reset(laps: number, outline: [number, number][], colours: readonly PaletteName[]): void;
  /** Pushes the latest race state into the UI. */
  sync(view: RaceView, cars: readonly CarView[]): void;
}

export function createRaceUi(root: HTMLElement, opts: { onRaceAgain: () => void }): RaceUi {
  const hud = createHud(root);
  const countdown = createCountdown(root);
  const touch = createTouchControls(root);
  const finish = createFinishPanel(root, opts);
  let state: HudState | null = null;
  let lastStep = -1;
  let lapsSeen = 0;
  let finishShown = false;

  return {
    touch,
    reset(laps, outline, colours) {
      state = {
        position: 1,
        carCount: colours.length,
        lap: 1,
        laps,
        timeMs: null,
        bestLapMs: null,
        minimap: { outline, cars: colours.map((colour, i) => ({ x: 0, z: 0, colour, player: i === 0 })) },
      };
      lastStep = -1;
      lapsSeen = 0;
      finishShown = false;
      finish.hide();
      countdown.hide();
    },
    sync(view, cars) {
      if (!state) throw new Error('RaceUi.sync() before reset()');
      const me = view.racers[0];
      if (me) {
        state.position = me.position;
        state.lap = me.lap;
        if (me.lapTicks.length !== lapsSeen) {
          lapsSeen = me.lapTicks.length;
          state.bestLapMs = ticksToMs(Math.min(...me.lapTicks));
        }
      }
      state.timeMs = view.phase === 'countdown' ? null : ticksToMs(me?.finishTick ?? view.raceTick);
      for (let i = 0; i < state.minimap.cars.length; i++) {
        const dot = state.minimap.cars[i];
        const car = cars[i];
        if (dot && car) {
          dot.x = car.x;
          dot.z = car.z;
        }
      }
      hud.update(state);

      const step = view.phase === 'countdown' ? view.countdown : 0;
      if (step !== lastStep) {
        countdown.show(step as CountdownStep);
        if (step === 0) touch.wake();
        lastStep = step;
      }
      if (step === 0 && view.raceTick >= GO_HIDE_TICKS && countdown.current !== null) countdown.hide();
      if (view.phase === 'finished' && !finishShown) {
        finishShown = true;
        finish.show({ timeMs: state.timeMs ?? 0, bestLapMs: state.bestLapMs });
      }
    },
  };
}
