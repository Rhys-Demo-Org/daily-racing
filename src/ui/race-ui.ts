// The race screen's UI (HUD, countdown, touch controls, results and pause screens), driven once per
// frame from sim views. One HudState is kept and updated in place, so a frame where nothing changed allocates
// nothing here and the HUD touches no DOM.
import { tokens, type PaletteName } from '@tokens';
import { TICK_HZ, type CarView, type RaceView } from '../sim/types.ts';
import { localBestLaps, type BestLapStore } from './best-laps.ts';
import { createCountdown, type CountdownStep } from './countdown.ts';
import { ticksToMs } from './format.ts';
import { createHud, type NewBestPhase } from './hud.ts';
import { createPauseScreen, type PauseScreenOptions } from './pause-screen.ts';
import { createResultsScreen } from './results-screen.ts';
import { createTouchControls, type TouchControls } from './touch-controls.ts';
import type { HudState } from './types.ts';

/** GO! is cleared this many ticks after the start, in sim time, so staged frames are deterministic. */
export const GO_HIDE_TICKS = TICK_HZ;

/** The NEW BEST chip holds this long between sliding out and sliding back (board 05 #3). */
const NEW_BEST_HOLD_MS = 2000;
const msToTicks = (ms: number): number => Math.ceil((ms * TICK_HZ) / 1000);
/** Ticks after the lap that the chip starts sliding back, and is gone. */
const NEW_BEST_BACK_TICKS = msToTicks(tokens.motion.durationMs.slide + NEW_BEST_HOLD_MS);
const NEW_BEST_GONE_TICKS = msToTicks(2 * tokens.motion.durationMs.slide + NEW_BEST_HOLD_MS);

/** Optional race details for the results screen. */
export interface RaceInfo {
  /** The track's id: its best lap is read from and saved to the best-lap store. Without one nothing is saved. */
  trackId?: string;
  trackName?: string;
  /** Livery numbers, index-aligned with the cars (default: 1, 2, 3…). */
  carNumbers?: readonly number[];
  /** Driver names, index-aligned with the cars (default: YOU for car 0, CPU for the rest), e.g. KOSKI. */
  driverNames?: readonly string[];
}

export interface RaceUi {
  readonly touch: TouchControls;
  /** Prepares for a new race. `colours` are the car body colours, index-aligned with the cars (0 = player). */
  reset(laps: number, outline: [number, number][], colours: readonly PaletteName[], info?: RaceInfo): void;
  /** Pushes the latest race state into the UI. */
  sync(view: RaceView, cars: readonly CarView[]): void;
  /** Shows the pause screen with the HUD's current lap and time. */
  pause(): void;
  /** Hides the pause screen and wakes the touch controls (a resume, UI_RULES §6). */
  resume(): void;
}

export interface RaceUiOptions extends Partial<PauseScreenOptions> {
  /** RETRY on the results screen. */
  onRaceAgain: () => void;
  /** NEXT RACE on the results screen (default: race again). */
  onNextRace?: () => void;
  /** The HUD PAUSE button was pressed (it toggles pause). */
  onPause?: () => void;
  /** Where best laps are kept (default: localStorage). */
  bestLaps?: BestLapStore;
}

export function createRaceUi(root: HTMLElement, opts: RaceUiOptions): RaceUi {
  const hud = createHud(root, opts);
  const countdown = createCountdown(root);
  const touch = createTouchControls(root);
  const results = createResultsScreen(root, { onRaceAgain: opts.onRaceAgain, onNextRace: opts.onNextRace ?? opts.onRaceAgain });
  const pauseScreen = createPauseScreen(root, {
    onResume: () => opts.onResume?.(),
    onRestart: () => opts.onRestart?.(),
    onQuit: () => opts.onQuit?.(),
  });
  let state: HudState | null = null;
  let lastStep = -1;
  let lapsSeen = 0;
  let finishShown = false;
  let race: RaceInfo = {};
  const bestLaps = opts.bestLaps ?? localBestLaps;
  /** This race's best lap in ms (the HUD shows the lower of this and the stored best). */
  let raceBestMs: number | null = null;
  /** raceTick at the end of the last lap that set a new stored best, or null. */
  let newBestTick: number | null = null;

  function newBestPhase(raceTick: number): NewBestPhase {
    if (newBestTick === null) return null;
    const since = raceTick - newBestTick;
    return since < 0 || since >= NEW_BEST_GONE_TICKS ? null : since < NEW_BEST_BACK_TICKS ? 'out' : 'back';
  }

  return {
    touch,
    reset(laps, outline, colours, info = {}) {
      state = {
        position: 1,
        carCount: colours.length,
        lap: 1,
        laps,
        timeMs: null,
        bestLapMs: info.trackId === undefined ? null : bestLaps.read(info.trackId),
        minimap: { outline, cars: colours.map((colour, i) => ({ x: 0, z: 0, colour, player: i === 0 })) },
      };
      lastStep = -1;
      lapsSeen = 0;
      finishShown = false;
      race = info;
      raceBestMs = null;
      newBestTick = null;
      hud.newBest(null);
      results.hide();
      countdown.hide();
      pauseScreen.hide();
    },
    sync(view, cars) {
      if (!state) throw new Error('RaceUi.sync() before reset()');
      const me = view.racers[0];
      if (me) {
        state.position = me.position;
        state.lap = me.lap;
        if (me.lapTicks.length !== lapsSeen) {
          // Several laps may end between syncs (driver steps): take them in order.
          let lapEnd = me.lapTicks.slice(0, lapsSeen).reduce((a, b) => a + b, 0);
          for (const ticks of me.lapTicks.slice(lapsSeen)) {
            const ms = ticksToMs(ticks);
            lapEnd += ticks;
            if (raceBestMs === null || ms < raceBestMs) raceBestMs = ms;
            if (state.bestLapMs !== null && ms >= state.bestLapMs) continue;
            state.bestLapMs = ms;
            if (race.trackId !== undefined) {
              bestLaps.write(race.trackId, ms);
              newBestTick = lapEnd;
            }
          }
          lapsSeen = me.lapTicks.length;
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
      hud.newBest(newBestPhase(view.raceTick));

      const step = view.phase === 'countdown' ? view.countdown : 0;
      if (step !== lastStep) {
        countdown.show(step as CountdownStep);
        if (step === 0) touch.wake();
        lastStep = step;
      }
      if (step === 0 && view.raceTick >= GO_HIDE_TICKS && countdown.current !== null) countdown.hide();
      if (view.phase === 'finished') {
        if (finishShown) {
          results.update(view.racers);
        } else {
          finishShown = true;
          const carNumbers = race.carNumbers ?? view.racers.map((_, i) => i + 1);
          const driverNames = race.driverNames ?? [];
          results.show({ laps: state.laps, trackName: race.trackName ?? '', carNumbers, driverNames, bestLapMs: raceBestMs, newBest: newBestTick !== null }, view.racers);
        }
      }
    },
    pause() {
      if (!state) throw new Error('RaceUi.pause() before reset()');
      pauseScreen.show(state);
    },
    resume() {
      pauseScreen.hide();
      touch.wake();
    },
  };
}
