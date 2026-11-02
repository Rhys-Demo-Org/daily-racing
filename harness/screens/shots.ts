// What harness/scripts/screenshots.sh captures and the index.json it writes (pure; capture.ts does
// the browser work). Other harness steps read the index, so its shape is an interface:
//   [{ "name": "...", "kind": "stage" | "race", "viewport": "844x390", "path": "relative.png" }]
import { COUNTDOWN_TICKS } from '../../src/sim/index.ts';

export interface Viewport {
  width: number;
  height: number;
  /** Phone: touch + mobile emulation, so the touch controls show (pointer: coarse). */
  touch: boolean;
}

/** Phone landscape (the UI_RULES reference frame), then desktop. */
export const VIEWPORTS: readonly Viewport[] = [
  { width: 844, height: 390, touch: true },
  { width: 1440, height: 900, touch: false },
];

export const viewportName = (v: Viewport): string => `${v.width}x${v.height}`;

export type ShotKind = 'stage' | 'race';

export interface ShotEntry {
  name: string;
  kind: ShotKind;
  viewport: string;
  /** Relative to the index file. */
  path: string;
}

/** Race frames use this seed, so they are the same every run. */
export const RACE_SEED = 1;

export interface RaceMoment {
  /** e.g. `countdown`; the frame is named `<track>-<moment>`. */
  name: string;
  /** World ticks (countdown included) from the start of the race. */
  tick: number;
}

/** Frames of one race, given the world tick at which the player has finished (phase `finished`). */
export function raceMoments(finishedAt: number): RaceMoment[] {
  return [
    { name: 'countdown', tick: Math.floor(COUNTDOWN_TICKS / 6) },
    { name: 'start', tick: COUNTDOWN_TICKS + 20 },
    { name: 'mid-race', tick: Math.round(finishedAt / 2) },
    { name: 'finished', tick: finishedAt },
  ];
}

/** Every shot, per viewport: the stages (sorted as given) then the race frames. */
export function planShots(stages: readonly string[], raceFrames: readonly string[], viewports: readonly Viewport[] = VIEWPORTS): ShotEntry[] {
  return viewports.flatMap((v) => {
    const vp = viewportName(v);
    return [
      ...stages.map((name) => ({ name, kind: 'stage' as const, viewport: vp, path: `${vp}/stage/${name}.png` })),
      ...raceFrames.map((name) => ({ name, kind: 'race' as const, viewport: vp, path: `${vp}/race/${name}.png` })),
    ];
  });
}

const NAME = /^[a-z0-9]+(-[a-z0-9]+)*(--[a-z0-9]+(-[a-z0-9]+)*)?$/;

/** Problems with an index.json value (empty when it is well formed). */
export function checkIndex(value: unknown): string[] {
  if (!Array.isArray(value)) return ['index is not an array'];
  if (value.length === 0) return ['index is empty'];
  const problems: string[] = [];
  const paths = new Set<string>();
  const keys = new Set<string>();
  value.forEach((e: unknown, i) => {
    const at = `entry ${i}`;
    if (typeof e !== 'object' || e === null || Array.isArray(e)) return void problems.push(`${at} is not an object`);
    const r = e as Record<string, unknown>;
    const extra = Object.keys(r).filter((k) => !['name', 'kind', 'viewport', 'path'].includes(k));
    if (extra.length) problems.push(`${at} has unknown keys ${extra.join(', ')}`);
    if (typeof r.name !== 'string' || !NAME.test(r.name)) problems.push(`${at} has a bad name`);
    if (r.kind !== 'stage' && r.kind !== 'race') problems.push(`${at} has a bad kind`);
    if (typeof r.viewport !== 'string' || !/^\d+x\d+$/.test(r.viewport)) problems.push(`${at} has a bad viewport`);
    if (typeof r.path !== 'string' || !/^[\w./-]+\.png$/.test(r.path) || r.path.startsWith('/') || r.path.split('/').includes('..')) {
      problems.push(`${at} has a bad path`);
    } else if (paths.has(r.path)) problems.push(`${at} repeats path ${r.path}`);
    else paths.add(r.path);
    const key = `${String(r.kind)} ${String(r.name)} ${String(r.viewport)}`;
    if (keys.has(key)) problems.push(`${at} repeats ${key}`);
    keys.add(key);
  });
  return problems;
}
