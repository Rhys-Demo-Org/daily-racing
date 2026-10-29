// Public contracts of the simulation. src/render, src/ui, src/input and src/driver depend only on
// these types and the functions exported from src/sim/index.ts, never on sim internals.
//
// World axes: +x east, +z south, +y up (metres-ish "units"). North (−z) is screen-up.
// Heading: radians, 0 = facing north (−z), increasing clockwise seen from above (π/2 = east).
// Time: fixed 60 Hz ticks. The simulation never reads clocks, globals or Math.random.

/** Track file schema (src/content/tracks/*.json). Pure data; gates load it without running branch code. */
export interface TrackData {
  /** Kebab-case id; must equal the file name without .json. */
  id: string;
  /** Display name, upper case in UI. */
  name: string;
  laps: number;
  /** Track ribbon width in units (8.4 per UI_RULES §9). */
  width: number;
  /**
   * Closed centreline control points [x, z] in driving order. The sim fits a closed centripetal
   * Catmull-Rom spline through them. The start/finish line is at the first point.
   */
  centreline: [number, number][];
  /** Jump ramps spanning the full track width. */
  ramps: RampData[];
  /** Rows of props running alongside the track. */
  propRows: PropRowData[];
  /** Individually placed props (scenery). */
  props: PropPointData[];
}

export interface RampData {
  /** Position of the ramp's lip along the lap, as a fraction 0..1 of lap length. */
  at: number;
  /** Length of the up-slope in units, ending at the lip. */
  length: number;
  /** Lip height in units. */
  height: number;
}

export type PropKind = 'hay-bale' | 'tyre-stack' | 'cone-tree';

export interface PropRowData {
  kind: PropKind;
  /** Side of the track relative to the driving direction. */
  side: 'left' | 'right';
  /** Start and end along the lap as fractions 0..1 (from < to; a row may not wrap past 1). */
  from: number;
  to: number;
  /** Distance between prop centres along the row, in units. */
  spacing: number;
  /** Distance from the track edge to the prop centre, in units (positive = away from the track). */
  offset: number;
}

export interface PropPointData {
  kind: PropKind;
  x: number;
  z: number;
}

/** A placed prop, expanded deterministically from TrackData by the sim. Render places meshes here. */
export interface PropInstance {
  kind: PropKind;
  x: number;
  z: number;
  /** Heading per the convention above; rows align props with the track direction. */
  heading: number;
}

/** One tick of driver input. Replays store steer as int8 (round(steer * 127)) and flags as bits. */
export interface CarInput {
  /** −1 full left … +1 full right. */
  steer: number;
  throttle: boolean;
  /** Brake, then reverse once stopped. */
  brake: boolean;
}

export type Surface = 'dirt' | 'grass';

/** Read-only view of a car that render/UI may use. The sim may keep more internal state. */
export interface CarView {
  x: number;
  /** Height of the body's base above flat ground (ramps and jumps). */
  y: number;
  z: number;
  heading: number;
  /**
   * Visual nose-up tilt in radians. The body rests on the ground under its nose and tail, so it
   * follows a ramp instead of clipping into it. Visual only: physics never reads it.
   */
  pitch: number;
  /** Forward speed in units/s (negative when reversing). */
  speed: number;
  /** 0 = gripping, 1 = fully sliding. Drives dust and tyre visuals. */
  slip: number;
  surface: Surface;
  airborne: boolean;
}

export type RacePhase = 'countdown' | 'racing' | 'finished';

export interface RacerView {
  /** Laps completed (0 before crossing the line the first time after the start). */
  lapsCompleted: number;
  /** Current lap shown in the HUD: min(lapsCompleted + 1, laps). */
  lap: number;
  /** Lap times in ticks for completed laps. */
  lapTicks: number[];
  /** Tick (race time) the car finished, or null. */
  finishTick: number | null;
  /** 1-based race position. */
  position: number;
}

export interface RaceView {
  phase: RacePhase;
  /** Whole seconds left in the countdown: 3, 2, 1, then 0 = GO (racing has started). */
  countdown: number;
  /** Ticks since GO (0 during the countdown). */
  raceTick: number;
  racers: RacerView[];
}

export const TICK_HZ = 60;

/**
 * World-space layout of a track, computed by the sim from TrackData (sim exports
 * `trackLayout(track): TrackLayout`). Render builds all track meshes from this, so the sim stays the
 * single source of geometry.
 */
export interface TrackLayout {
  width: number;
  /** Dense closed centreline [x, z], about 1 unit apart. Index 0 is on the start/finish line. */
  centre: [number, number][];
  /** Driving heading at the start/finish line. */
  startHeading: number;
  ramps: RampInstance[];
  props: PropInstance[];
}

export interface RampInstance {
  /** Centre of the ramp's lip (its highest edge). */
  x: number;
  z: number;
  /** Driving direction over the ramp; the slope rises along it and ends at the lip. */
  heading: number;
  /** Up-slope length, footprint width (= track width) and lip height, in units. */
  length: number;
  width: number;
  height: number;
}
