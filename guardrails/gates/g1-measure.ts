// Gate 1 measure step: typecheck, build and unit tests of the tree it is run in (a measure tree:
// main's configs with the branch's src/ and tests/). Runs inside a measure container with no
// output mount; prints one JSON line to stdout.
//
//   node guardrails/gates/g1-measure.ts <tree>
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emit, tail } from './lib.ts';

/** One test from Vitest's JSON reporter, trimmed to what the verdict needs. */
export interface TestRow {
  file: string;
  name: string;
  status: string;
  failure: string;
}

export interface G1Measure {
  steps: { name: string; code: number | null; output: string }[];
  tests: TestRow[] | null;
}

interface VitestJson {
  testResults: { name: string; message?: string; assertionResults: { fullName: string; status: string; failureMessages: string[] }[] }[];
}

const root = process.argv[2] ?? process.cwd();
const report = '/tmp/vitest.json';
const run = (name: string, script: string, args: string[]) => {
  const r = spawnSync(process.execPath, [join(root, 'node_modules', script), ...args], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { name, code: r.status, output: tail(`${r.stdout}${r.stderr}${r.error ? String(r.error) : ''}`) };
};

const steps = [
  run('typecheck src', 'typescript/bin/tsc', ['-p', join(root, 'tsconfig.json')]),
  run('typecheck node', 'typescript/bin/tsc', ['-p', join(root, 'tsconfig.node.json')]),
  run('build', 'vite/bin/vite.js', ['build', '--config', join(root, 'vite.config.ts'), '--outDir', '/tmp/dist', '--emptyOutDir', '--logLevel', 'warn']),
  run('unit tests', 'vitest/vitest.mjs', ['run', '--config', join(root, 'vitest.config.ts'), '--reporter=json', `--outputFile=${report}`]),
];

let tests: TestRow[] | null = null;
try {
  const json = JSON.parse(readFileSync(report, 'utf8')) as VitestJson;
  tests = json.testResults.flatMap((file) => {
    const rel = file.name.startsWith(root) ? file.name.slice(root.length + 1) : file.name;
    // A file that fails to load has no assertions; keep it as a failed row so it is never silent.
    if (file.assertionResults.length === 0) return [{ file: rel, name: '(file)', status: 'failed', failure: tail(file.message ?? 'no tests in file', 2000) }];
    return file.assertionResults.map((a) => ({ file: rel, name: a.fullName, status: a.status, failure: tail(a.failureMessages.join('\n'), 2000) }));
  });
} catch {
  /* no report: the verdict fails on tests === null */
}
emit({ steps, tests } satisfies G1Measure);
