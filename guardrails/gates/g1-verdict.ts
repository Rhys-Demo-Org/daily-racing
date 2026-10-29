// Gate 1 verdict: build, types and unit tests, plus gate 9's test-integrity rules. Reads the branch's
// and main's measurements (g1-measure.ts stdout) and both trees as data; runs no branch code.
//
//   node g1-verdict.ts --measure <f> --exit <n> --stderr <f> --main-measure <f>
//                      --main <dir> --branch <dir> --out <result.json> [--maintenance]
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import type { G1Measure } from './g1-measure.ts';
import { cli, finish, flag, isResult, loadMeasure, readJson, verdict } from './lib.ts';

/** Comments that silence the type checker or linter; never added. */
const SUPPRESS = /@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable/g;
/** Ways to not run a test; never added under tests/. */
const SKIP = /\.(skip|only|todo|fails|skipIf|runIf)\b|passWithNoTests/g;

/** Every file under `dir` (relative paths), skipping tests/baselines/. */
function files(root: string, dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(join(root, rel));
    } catch {
      return;
    }
    for (const name of names) {
      const p = `${rel}/${name}`;
      if (p === 'tests/baselines') continue;
      const st = lstatSync(join(root, p), { throwIfNoEntry: false });
      if (st?.isDirectory()) walk(p);
      else if (st?.isFile()) out.push(p);
    }
  };
  walk(dir);
  return out.sort();
}

const read = (root: string, p: string): string | null => {
  try {
    return readFileSync(join(root, p), 'utf8');
  } catch {
    return null;
  }
};
const count = (text: string | null, re: RegExp): number => (text === null ? 0 : (text.match(re) ?? []).length);

const { flags } = cli();
const out = flag(flags, 'out');
const mainDir = flag(flags, 'main');
const branchDir = flag(flags, 'branch');
const maintenance = flags['maintenance'] === true;
const m = loadMeasure<G1Measure>(flags);
if (isResult(m)) finish(out, m);

const problems: string[] = [];
for (const s of m.steps) if (s.code !== 0) problems.push(`${s.name} failed (exit ${String(s.code)}):\n${s.output}`);

const tests = m.tests ?? [];
if (m.tests === null) problems.push('no Vitest JSON report');
else if (tests.length === 0) problems.push('zero tests executed');
for (const t of tests) if (t.status !== 'passed') problems.push(`test ${t.status}: ${t.file} › ${t.name}\n${t.failure}`);

let mainCount: number | null = null;
try {
  mainCount = readJson<G1Measure>(flag(flags, 'main-measure')).tests?.length ?? null;
} catch {
  /* reported below */
}
if (mainCount === null) problems.push("could not read main's test count");
else if (tests.length < mainCount) problems.push(`test count dropped: ${tests.length} on the branch, ${mainCount} on main`);

for (const p of [...files(branchDir, 'src'), ...files(branchDir, 'tests')]) {
  const text = read(branchDir, p);
  const before = read(mainDir, p);
  if (count(text, SUPPRESS) > count(before, SUPPRESS)) problems.push(`${p}: adds @ts-ignore/@ts-nocheck/@ts-expect-error/eslint-disable`);
  if (p.startsWith('tests/') && count(text, SKIP) > count(before, SKIP)) problems.push(`${p}: adds .skip/.only/.todo/.fails/skipIf/runIf/passWithNoTests`);
}
for (const p of files(mainDir, 'tests')) {
  const now = read(branchDir, p);
  if (now === null) problems.push(`${p}: test file from main deleted`);
  else if (!maintenance && now !== read(mainDir, p)) problems.push(`${p}: test file from main edited (only allowed on maintenance days)`);
}

const passed = tests.filter((t) => t.status === 'passed').length;
finish(out, verdict(problems, `typecheck, build ok; ${passed}/${tests.length} tests passed (main ${String(mainCount)})`, (n) => `${n} problem(s); ${passed}/${tests.length} tests passed`));
