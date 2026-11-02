// Screen stages: fixtures that each render one UI state from fixed data, like stories. Each
// src/ui/stages/*.stage.ts default-exports a StageFile, and registry.ts picks them up by glob.
// The game never imports this folder, so stages stay out of the production bundle; the harness
// renders them (harness/screens) and tests check they render.
import { tokens, type PaletteName } from '@tokens';
import { TRACKS } from '../../content/tracks.ts';
import { trackLayout, type CarView, type RacerView, type RaceView } from '../../sim/index.ts';
import { createRaceUi, type RaceUi } from '../race-ui.ts';

/** Renders one UI state into `root` (an empty, full-screen #app). Must be deterministic. */
export type Stage = (root: HTMLElement) => void;

/** A stage file's default export: stage names (kebab-case) to stages. */
export type StageFile = Readonly<Record<string, Stage>>;

export interface NamedStage {
  /** `<file>--<stage>`, e.g. `results--podium`. */
  readonly name: string;
  readonly render: Stage;
}

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Flattens glob results (`./<file>.stage.ts` → StageFile) into named stages, sorted by name. */
export function collectStages(files: Readonly<Record<string, StageFile>>): NamedStage[] {
  const stages = Object.entries(files).flatMap(([path, file]) => {
    const base = /([^/]+)\.stage\.ts$/.exec(path)?.[1] ?? '';
    if (!KEBAB.test(base)) throw new Error(`Stage file ${path} must be named <kebab-case>.stage.ts`);
    const entries = Object.entries(file ?? {});
    if (entries.length === 0) throw new Error(`Stage file ${path} has no stages (default-export a StageFile)`);
    return entries.map(([key, render]) => {
      if (!KEBAB.test(key)) throw new Error(`Stage "${key}" in ${path} must be kebab-case`);
      if (typeof render !== 'function') throw new Error(`Stage "${key}" in ${path} is not a function`);
      return { name: `${base}--${key}`, render };
    });
  });
  return stages.sort((a, b) => (a.name < b.name ? -1 : 1));
}

// --- fixture helpers ------------------------------------------------------------------------------

/** The game's layer for menus (start screen) inside `root`. */
export function menuLayer(root: HTMLElement): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'menu-layer';
  root.append(layer);
  return layer;
}

/** The game's race layer inside `root`. */
export function raceLayer(root: HTMLElement): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'race-layer';
  root.append(layer);
  return layer;
}

const noop = (): void => {};

/** Car body colours: the player first, then the AI liveries in token order (repeating). */
export function carColours(count: number): PaletteName[] {
  const ai = tokens.cars.ai as readonly PaletteName[];
  return Array.from({ length: count }, (_, i) => (i === 0 ? tokens.cars.player.body : (ai[(i - 1) % ai.length] as PaletteName)));
}

/** The first registered track: its name, laps and minimap outline (every 8th centreline point, as in the game). */
export function stageTrack(): { name: string; laps: number; outline: [number, number][]; centre: [number, number][] } {
  const track = TRACKS[0];
  if (!track) throw new Error('No registered tracks');
  const centre = trackLayout(track).centre;
  return { name: track.name, laps: track.laps, outline: centre.filter((_, i) => i % 8 === 0), centre };
}

/** A car parked on the centreline `at` (0..1) of the way round the lap. */
export function carOnTrack(centre: readonly [number, number][], at: number): CarView {
  const [x, z] = centre[Math.floor(at * centre.length) % centre.length] ?? [0, 0];
  return { x, y: 0, z, heading: 0, pitch: 0, speed: 0, slip: 0, surface: 'dirt', airborne: false };
}

/** A racer standing: `position` 1-based, `finishTick` null while still racing. */
export function racer(position: number, laps: number, lapTicks: number[], finishTick: number | null = null): RacerView {
  return { lapsCompleted: lapTicks.length, lap: Math.min(lapTicks.length + 1, laps), lapTicks, finishTick, position };
}

export interface RaceStageOptions {
  phase: RaceView['phase'];
  countdown: number;
  raceTick: number;
  /** Index-aligned with the cars; car 0 is the player. */
  racers: RacerView[];
  /** Where each car sits round the lap (0..1), index-aligned with `racers`. */
  at: number[];
}

/** The race screen's UI (HUD, countdown, touch controls, results, pause) in one fixed race state. */
export function raceStage(root: HTMLElement, o: RaceStageOptions): RaceUi {
  const track = stageTrack();
  const ui = createRaceUi(raceLayer(root), { onRaceAgain: noop, onNextRace: noop, onPause: noop, onResume: noop, onRestart: noop, onQuit: noop });
  const numbers = o.racers.map((_, i) => (i === 0 ? 1 : 3 + i * 4));
  ui.reset(track.laps, track.outline, carColours(o.racers.length), { trackName: track.name, carNumbers: numbers });
  ui.sync(
    { phase: o.phase, countdown: o.countdown, raceTick: o.raceTick, racers: o.racers },
    o.at.map((a) => carOnTrack(track.centre, a)),
  );
  return ui;
}
