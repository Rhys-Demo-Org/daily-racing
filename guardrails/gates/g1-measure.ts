// Gate 1 measure step: typecheck, build and unit tests of the tree it is run in (a measure tree:
// main's configs with the branch's src/ and tests/), all in parallel. Runs inside a measure
// container with no output mount; prints one JSON line to stdout. --tests-only runs just the unit
// tests (for main's test count).
//
//   node guardrails/gates/g1-measure.ts <tree> [--tests-only]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { attempt, emit, readText, tail } from './lib.ts';

type Step = { name: string; code: number | null; output: string };
export interface G1Measure {
  steps: Step[];
  tests: { file: string; name: string; status: string; failure: string }[] | null;
}

interface VitestJson {
  testResults: { name: string; message?: string; assertionResults: { fullName: string; status: string; failureMessages: string[] }[] }[];
}

const [root = process.cwd(), mode] = process.argv.slice(2);
const report = join(mkdtempSync('/tmp/g1-'), 'vitest.json');
// Each step runs in its own process group, killed the moment the step exits, so nothing a test
// spawned outlives it (to rewrite the report, say); none of them sees the nonce.
const run = (name: string, script: string, args: string[]): Promise<Step> =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [join(root, 'node_modules', script), ...args], {
      cwd: root, detached: true, env: { ...process.env, GATE_NONCE: '' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const add = (d: Buffer): void => void (output = tail(output + d.toString(), 8000));
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    child.on('error', (e) => add(Buffer.from(String(e))));
    child.on('exit', () => attempt(() => process.kill(-child.pid!, 'SIGKILL')));
    child.on('close', (code) => resolve({ name, code, output: tail(output) }));
  });

const tests = run('unit tests', 'vitest/vitest.mjs', ['run', '--config', join(root, 'vitest.config.ts'), '--reporter=json', `--outputFile=${report}`]);
const steps = await Promise.all(mode === '--tests-only' ? [tests] : [
  run('typecheck src', 'typescript/bin/tsc', ['-p', join(root, 'tsconfig.json')]),
  run('typecheck node', 'typescript/bin/tsc', ['-p', join(root, 'tsconfig.node.json')]),
  run('build', 'vite/bin/vite.js', ['build', '--config', join(root, 'vite.config.ts'), '--outDir', '/tmp/dist', '--emptyOutDir', '--logLevel', 'warn']),
  tests,
]);

// No report leaves tests null, which the verdict fails.
const rows = attempt(() => (JSON.parse(readText(report) ?? '') as VitestJson).testResults.flatMap((file) => {
  const rel = file.name.startsWith(root) ? file.name.slice(root.length + 1) : file.name;
  // A file that fails to load has no assertions; keep it as a failed row so it is never silent.
  if (file.assertionResults.length === 0) return [{ file: rel, name: '(file)', status: 'failed', failure: tail(file.message ?? 'no tests in file', 2000) }];
  return file.assertionResults.map((a) => ({ file: rel, name: a.fullName, status: a.status, failure: tail(a.failureMessages.join('\n'), 2000) }));
}));
emit({ steps, tests: rows } satisfies G1Measure);
