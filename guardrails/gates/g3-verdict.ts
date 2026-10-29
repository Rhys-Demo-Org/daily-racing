// Gate 3 verdict: physics replays. Every recording on main must reproduce main's expected end
// state (tests/baselines/replay-states.json): numbers within 1e-6, exactly on maintenance days.
//
//   node g3-verdict.ts --measure <f> --exit <n> --stderr <f> --main <dir> --image <tag>
//                      (--out <result.json> [--maintenance] | --baseline <replay-states.json>)
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CarView } from '../../src/sim/types.ts';
import type { G3Measure } from './g3-measure.ts';
import { cli, finish, flag, isResult, jsonFiles, loadMeasure, readJson, verdict } from './lib.ts';

const TOLERANCE = 1e-6;

export interface ReplayBaseline {
  node: string;
  image: string;
  /** Final car views per recording (tests/baselines/replays/<name>.json). */
  states: Record<string, CarView[]>;
}

/** Fields of `now` that differ from `was` beyond `tol` (or at all, for non-numbers). */
function diff(was: CarView[], now: CarView[], tol: number): string[] {
  if (now.length !== was.length) return [`${now.length} cars, expected ${was.length}`];
  return was.flatMap((w, i) =>
    (Object.keys(w) as (keyof CarView)[]).flatMap((k) => {
      const a = w[k];
      const b = now[i]?.[k];
      const same = typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= tol : a === b;
      return same ? [] : [`car ${i} ${k}: ${String(b)}, expected ${String(a)}`];
    }),
  );
}

const { flags } = cli();
const mainDir = flag(flags, 'main');
const image = flag(flags, 'image');
const baselineOut = flags['baseline'];
const out = typeof baselineOut === 'string' ? '' : flag(flags, 'out');
const m = loadMeasure<G3Measure>(flags);
if (isResult(m)) {
  if (out === '') throw new Error(`${m.summary}\n${m.details}`);
  finish(out, m);
}
const got = new Map(m.replays.map((r) => [r.name, r]));

if (typeof baselineOut === 'string') {
  const states: ReplayBaseline['states'] = {};
  for (const r of m.replays) {
    if (r.cars === undefined) throw new Error(`${r.name}: ${String(r.error)}`);
    states[r.name] = r.cars;
  }
  writeFileSync(baselineOut, `${JSON.stringify({ node: process.version, image, states } satisfies ReplayBaseline, null, 2)}\n`);
  process.exit(0);
}

const tol = flags['maintenance'] === true ? 0 : TOLERANCE;
const base = readJson<ReplayBaseline>(join(mainDir, 'tests', 'baselines', 'replay-states.json'));
const problems: string[] = [];
if (base.node !== process.version || base.image !== image) {
  problems.push(`toolchain mismatch: baseline from ${base.node} / ${base.image}, now ${process.version} / ${image} (owner: harness/scripts/rebaseline.sh)`);
}
const names = jsonFiles(join(mainDir, 'tests', 'baselines', 'replays')).map((f) => f.slice(0, -5));
if (names.length === 0) problems.push('no recordings on main');
for (const name of names) {
  const was = base.states[name];
  const r = got.get(name);
  if (was === undefined) problems.push(`${name}: no expected state on main (owner: rebaseline)`);
  else if (r?.cars === undefined) problems.push(`${name}: ${r?.error ?? 'not replayed'}`);
  else problems.push(...diff(was, r.cars, tol).map((d) => `${name}: ${d}`));
}
finish(
  out,
  verdict(problems, `${names.length} replays reproduce main's end states (${tol === 0 ? 'exact' : `±${tol}`})`, (n) => `${n} difference(s) from main's recorded end states`),
);
