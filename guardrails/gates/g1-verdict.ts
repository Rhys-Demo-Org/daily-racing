// Gate 1 verdict: build, types and unit tests, plus gate 9's test-integrity rules. Reads the branch's
// and main's measurements (g1-measure.ts stdout) and both trees as data; runs no branch code.
//
//   node g1-verdict.ts --measure <f> --exit <n> --stderr <f> --nonce <s> --main-measure <f>
//                      --main <dir> --branch <dir> --out <result.json> [--maintenance]
import { readdirSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import type { G1Measure } from './g1-measure.ts';
import { attempt, finish, flag, readJson, readText, verdict, verdictArgs } from './lib.ts';

/** Comments that silence the type checker or linter; never added. */
const SUPPRESS = /@ts-ignore|@ts-nocheck|@ts-expect-error|eslint-disable/g;
/** Ways to not run a test; never added under tests/. */
const SKIP = /\.(skip|only|todo|fails|skipIf|runIf)\b|passWithNoTests/g;

/** Every file under `dir` (relative paths), skipping tests/baselines/. */
function files(root: string, dir: string): string[] {
  const out: string[] = [];
  const walk = (rel: string): void => {
    for (const name of attempt(() => readdirSync(join(root, rel))) ?? []) {
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

const read = (root: string, p: string): string | null => readText(join(root, p));
const count = (text: string | null, re: RegExp): number => (text === null ? 0 : (text.match(re) ?? []).length);

const { flags, m, out } = verdictArgs<G1Measure>();
const mainDir = flag(flags, 'main');
const branchDir = flag(flags, 'branch');
const maintenance = flags['maintenance'] === true;

const problems: string[] = [];
for (const s of m.steps) if (s.code !== 0) problems.push(`${s.name} failed (exit ${String(s.code)}):\n${s.output}`);

const tests = m.tests ?? [];
if (m.tests === null) problems.push('no Vitest JSON report');
else if (tests.length === 0) problems.push('zero tests executed');
for (const t of tests) if (t.status !== 'passed') problems.push(`test ${t.status}: ${t.file} › ${t.name}\n${t.failure}`);

// main's own unit tests: trusted code, cached per main SHA (so it carries an older run's nonce)
const mainCount = attempt(() => readJson<G1Measure>(flag(flags, 'main-measure')).tests?.length) ?? null;
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
