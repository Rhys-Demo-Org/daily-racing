// View models the UI renders. Built by the game loop from sim views; the UI never reads the sim.
import type { PaletteName } from '@tokens';

export interface HudState {
  position: number;
  carCount: number;
  lap: number;
  laps: number;
  /** Race time in ms (null before GO). */
  timeMs: number | null;
  /** Best lap of this race in ms, or null. Persistence is backlog B07. */
  bestLapMs: number | null;
  minimap: MinimapState;
}

export interface MinimapState {
  /** Closed track outline [x, z] in world units; the UI fits it into the panel. */
  outline: [number, number][];
  cars: { x: number; z: number; colour: PaletteName; player: boolean }[];
}
