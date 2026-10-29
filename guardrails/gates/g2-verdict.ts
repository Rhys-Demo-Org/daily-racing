// Gate 2 verdict: bot laps. Re-derives laps from the measured trajectories with main's track and
// race code (main's track JSON for tracks that exist on main), then checks every main track still
// exists, every race finishes, nobody is stuck or teleports, and each existing track's median lap
// is within 10% of main's baseline (identical on maintenance days).
//
//   node g2-verdict.ts --measure <f> --exit <n> --stderr <f> --main <dir> --image <tag>
//                      (--out <result.json> [--maintenance] | --baseline <bot-laps.json>)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DT, SURFACES } from '../../src/sim/car.ts';
import { COUNTDOWN_TICKS, createRacer, updateRacer } from '../../src/sim/race.ts';
import { buildTrack, nearestGlobal, trackPosition, validateTrack, type Track } from '../../src/sim/track.ts';
import type { TrackData } from '../../src/sim/types.ts';
import type { G2Measure, G2Race } from './g2-measure.ts';
import { cli, finish, flag, isResult, jsonFiles, loadMeasure, median, readJson, verdict } from './lib.ts';

/** Largest per-tick move that is driving, not teleporting: dirt top speed × DT × 1.5 (0.625). */
const MAX_STEP = SURFACES.dirt.topSpeed * DT * 1.5;
/** Stuck: slower than 1 unit/s for 3 s after GO, before finishing. */
const STUCK_SPEED = 1;
const STUCK_TICKS = 180;
const LAP_TOLERANCE = 0.1;

export interface BotLapBaseline {
  node: string;
  image: string;
  seeds: number[];
  /** Per track: every lap of every car, seed-major, in ticks, and their median. */
  tracks: Record<string, { medianLapTicks: number; lapTicks: number[] }>;
}

/** Laps and problems of one car's trajectory, judged against `data` with main's code. */
function judgeCar(data: TrackData, track: Track, car: G2Race['cars'][number], label: string) {
  const problems: string[] = [];
  const n = Math.min(car.x.length, car.z.length);
  let pos = nearestGlobal(track, car.x[0]!, car.z[0]!);
  const racer = createRacer(pos.s, track.length);
  let slow = 0;
  let worstStep = 0;
  for (let t = 1; t < n && racer.finishTick === null; t++) {
    const x = car.x[t]!;
    const z = car.z[t]!;
    const step = Math.hypot(x - car.x[t - 1]!, z - car.z[t - 1]!);
    if (!Number.isFinite(step)) {
      problems.push(`${label}: non-finite position at tick ${t}`);
      break;
    }
    worstStep = Math.max(worstStep, step);
    if (step > MAX_STEP) problems.push(`${label}: teleport at tick ${t}: moved ${step.toFixed(3)} units in one tick (limit ${MAX_STEP.toFixed(3)})`);
    if (t <= COUNTDOWN_TICKS) continue;
    slow = step / DT < STUCK_SPEED ? slow + 1 : 0;
    if (slow === STUCK_TICKS) problems.push(`${label}: stuck: under ${STUCK_SPEED} unit/s for ${STUCK_TICKS / 60} s by tick ${t}`);
    pos = trackPosition(track, x, z, pos);
    updateRacer(racer, pos.s, track.length, t - COUNTDOWN_TICKS, data.laps);
  }
  if (racer.finishTick === null) problems.push(`${label}: did not finish (${racer.lapsCompleted}/${data.laps} laps in ${n - 1} ticks)`);
  return { laps: racer.lapTicks, problems: problems.slice(0, 5), worstStep };
}

const { flags } = cli();
const mainDir = flag(flags, 'main');
const image = flag(flags, 'image');
const baselineOut = flags['baseline'];
const out = typeof baselineOut === 'string' ? '' : flag(flags, 'out');
const maintenance = flags['maintenance'] === true;
const m = loadMeasure<G2Measure>(flags);
if (isResult(m)) {
  if (out === '') throw new Error(`${m.summary}\n${m.details}`);
  finish(out, m);
}

const problems: string[] = [];
const tracksDir = join(mainDir, 'src', 'content', 'tracks');
const mainIds = jsonFiles(tracksDir).map((f) => f.slice(0, -5));
const measuredIds = m.tracks.map((t) => t.file.slice(0, -5));
for (const id of mainIds) if (!measuredIds.includes(id)) problems.push(`track "${id}" exists on main but is no longer registered`);

const measured: BotLapBaseline['tracks'] = {};
let worst = 0;
for (const t of m.tracks) {
  const id = t.file.slice(0, -5);
  if (t.error !== undefined) {
    problems.push(`${id}: ${t.error}`);
    continue;
  }
  const existing = mainIds.includes(id);
  const data = (existing ? readJson<unknown>(join(tracksDir, t.file)) : t.data) as TrackData;
  if (data?.id !== id) problems.push(`${t.file}: id "${String(data?.id)}" must equal the file name`);
  if (t.races.map((r) => r.seed).join() !== m.seeds.join()) problems.push(`${id}: races do not match the seeds`);
  const laps: number[] = [];
  try {
    const track = buildTrack(validateTrack(data));
    for (const r of t.races) {
      r.cars.forEach((car, i) => {
        const judged = judgeCar(data, track, car, `${id} seed ${r.seed} car ${i}`);
        problems.push(...judged.problems);
        laps.push(...judged.laps);
        worst = Math.max(worst, judged.worstStep);
      });
    }
  } catch (e) {
    problems.push(`${id}: ${(e as Error).message}`);
  }
  measured[id] = { medianLapTicks: laps.length ? median(laps) : 0, lapTicks: laps };
}

if (typeof baselineOut === 'string') {
  if (problems.length) throw new Error(problems.join('\n'));
  const baseline: BotLapBaseline = { node: process.version, image, seeds: m.seeds, tracks: measured };
  writeFileSync(baselineOut, `${JSON.stringify(baseline, null, 2)}\n`);
  process.exit(0);
}

const base = readJson<BotLapBaseline>(join(mainDir, 'tests', 'baselines', 'bot-laps.json'));
if (base.node !== process.version || base.image !== image || base.seeds.join() !== m.seeds.join()) {
  problems.push(`toolchain mismatch: baseline from ${base.node} / ${base.image} / seeds ${base.seeds.join()}, now ${process.version} / ${image} / seeds ${m.seeds.join()} (owner: harness/scripts/rebaseline.sh)`);
}
const lines: string[] = [];
for (const [id, now] of Object.entries(measured)) {
  const was = mainIds.includes(id) ? base.tracks[id] : undefined;
  const sec = (ticks: number): string => (ticks * DT).toFixed(2);
  if (was === undefined) {
    lines.push(`${id} ${sec(now.medianLapTicks)} s (new)`);
    continue;
  }
  const change = now.medianLapTicks / was.medianLapTicks - 1;
  lines.push(`${id} ${sec(now.medianLapTicks)} s (${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%)`);
  if (maintenance ? now.lapTicks.join() !== was.lapTicks.join() : Math.abs(change) > LAP_TOLERANCE) {
    problems.push(
      `${id}: median lap ${sec(now.medianLapTicks)} s vs main ${sec(was.medianLapTicks)} s (${(change * 100).toFixed(1)}%; ` +
        `${maintenance ? 'maintenance days require identical laps' : `limit ±${LAP_TOLERANCE * 100}%`})`,
    );
  }
}
const summary = `${lines.join(', ')}; worst step ${worst.toFixed(3)}`;
finish(out, verdict(problems, summary, (n) => `${n} problem(s); ${summary}`));
