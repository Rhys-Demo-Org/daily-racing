// Test driver for gates (protected: nightly runs may not edit src/driver/). Installed in every build
// as window.__racer, so gates never need test-only query strings or a special build. It only
// starts races, reads state and steps time; scene and renderer inspection is done from the gate side.
import { TRACKS } from '../content/tracks.ts';
import type { Game, GameState } from '../game.ts';
import type { CarInput } from '../sim/index.ts';

export interface RacerDriver {
  readonly version: 1;
  /** Registered track ids. */
  tracks(): string[];
  /** Starts a race immediately (skipping the menu) with a fixed seed. */
  startRace(options: { track: string; seed: number }): GameState;
  state(): GameState;
  /** Stops real time; afterwards the game only moves through step(). */
  freeze(): void;
  resume(): void;
  /** Advances `ticks` fixed sim ticks with one input held, renders a frame and returns the state. */
  step(ticks: number, input?: CarInput): GameState;
  /** Advances one tick per input (e.g. a recorded or computed input sequence), renders, returns state. */
  play(inputs: readonly CarInput[]): GameState;
  showMenu(): void;
}

declare global {
  interface Window {
    __racer?: RacerDriver;
  }
}

export function installDriver(game: Game): RacerDriver {
  const driver: RacerDriver = {
    version: 1,
    tracks: () => TRACKS.map((t) => t.id),
    startRace({ track, seed }) {
      game.startRace({ trackId: track, seed });
      return game.state();
    },
    state: () => game.state(),
    freeze: () => game.freeze(),
    resume: () => game.resume(),
    step(ticks, input) {
      game.step(ticks, input);
      return game.state();
    },
    play(inputs) {
      game.play(inputs);
      return game.state();
    },
    showMenu: () => game.showMenu(),
  };
  window.__racer = driver;
  return driver;
}
