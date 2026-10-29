import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildResult, diffSize, gateFeedback, readPhases, report } from '../lib/journal.ts';

let dir = '';
const put = (rel: string, data: unknown): void => {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), typeof data === 'string' ? data : JSON.stringify(data));
};
const gates = (pass: boolean, g1: boolean) => ({ pass, durationMs: 61_000, gates: [
  { id: 'G1', name: 'build', pass: g1, summary: g1 ? 'ok' : '2 tests failed', details: 'AC2 expected 3 got 2' },
  { id: 'G8', name: 'protected', pass: true, summary: 'ok', details: '' },
] });
const phaseMeta = (phase: string, cost: number) => ({ phase, model: 'claude-opus-5-5', exit: 0, class: 'ok', wallMs: 90_000, usage: { input_tokens: 10, output_tokens: 20 }, total_cost_usd: cost, num_turns: 7 });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'journal-'));
  put('meta.json', { date: '2026-11-02', dryRun: true, phase: 1, ideaType: 'backlog', backlogId: 'B01', models: { build: 'claude-opus-5-5' }, claudeCodeVersion: '2.1.304', startedAt: 1793584800, noNewPhaseAt: 1793596500, hardDeadlineAt: 1793601000 });
  put('phases/ideate-1/meta.json', phaseMeta('ideate', 0.5));
  put('phases/ideate-1/harness.json', { startedAt: 1793584900, endedAt: 1793585000, exit: 0 });
  put('phases/build-1/meta.json', phaseMeta('build', 4));
  put('phases/build-1/harness.json', { startedAt: 1793585000, endedAt: 1793588000, exit: 0 });
  put('phases/retry-2/meta.json', phaseMeta('retry', 1.25));
  put('phases/retry-2/harness.json', { startedAt: 1793589000, endedAt: 1793590000, exit: 11 });
  put('gates-1.json', gates(false, false));
  put('gates-2.json', gates(true, true));
  put('diffstat.txt', '10\t2\tsrc/a.ts\n5\t0\ttests/a.test.ts\n-\t-\tsrc/img.bin\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('journal', () => {
  it('orders phases ideate, build, retries', () => {
    expect(readPhases(dir).map((p) => p.name)).toEqual(['ideate-1', 'build-1', 'retry-2']);
  });

  it('builds result.json with HANDOVER §9 fields, null where the thin harness has no data', () => {
    const r = buildResult(dir, 'pass', null);
    expect(r).toMatchObject({
      date: '2026-11-02', outcome: 'pass', abortReason: null, phase: 1, attempts: 1, ideaType: 'backlog', backlogId: 'B01',
      claudeCodeVersion: '2.1.304', gates: { G1: true, G8: true }, retries: 1, judgeScore: null, medianLapTimes: null,
      p95FrameTimeMs: null, triangleCount: null, bundleSizeBytes: null, diffSize: { files: 3, added: 15, deleted: 2 }, totalCostUsd: 5.75,
    });
    expect(r.gateRuns).toEqual([{ attempt: 1, pass: false, gates: { G1: false, G8: true } }, { attempt: 2, pass: true, gates: { G1: true, G8: true } }]);
    expect((r.usage as unknown[])[2]).toMatchObject({ phase: 'retry', attempt: 2, exit: 11, numTurns: 7, costUsd: 1.25 });
  });

  it('records an abort with no gate run', () => {
    rmSync(join(dir, 'gates-1.json')); rmSync(join(dir, 'gates-2.json'));
    expect(buildResult(dir, 'abort', 'usage limit')).toMatchObject({ outcome: 'abort', abortReason: 'usage limit', gates: null, gateRuns: [] });
    expect(buildResult(dir, 'fail', 'gates failed')).toMatchObject({ reason: 'gates failed', abortReason: null });
  });

  it('feeds only failed gates back, and treats a missing or malformed gates.json as a failure', () => {
    const fb = gateFeedback(join(dir, 'gates-1.json'));
    expect(fb).toContain('### G1 · build\n2 tests failed\n\nAC2 expected 3 got 2');
    expect(fb).not.toContain('G8');
    expect(gateFeedback(join(dir, 'nope.json'))).toMatch(/no valid gates.json/);
    put('bad.json', '{"pass":true,"gates":[]}');
    expect(gateFeedback(join(dir, 'bad.json'))).toMatch(/no valid gates.json/);
  });

  it('sums numstat lines', () => {
    expect(diffSize('')).toEqual({ files: 0, added: 0, deleted: 0 });
  });

  it('reports phases against the deadline and a gate table per attempt', () => {
    put('result.json', buildResult(dir, 'pass', null));
    const md = report(dir, 'Europe/London');
    expect(md).toContain('# Dry run 2026-11-02 · backlog B01 · pass');
    expect(md).toContain('hard deadline 06:30');
    expect(md).toContain('| build-1 | 02:03 | 02:53 | 1m30s | 3h36m | 0 ok | 7 | 10/20/- | 4 |');
    expect(md).toContain('| 1 | FAIL | FAIL | ok | 1m01s |');
    expect(md).toContain('- attempt 1 G1: 2 tests failed');
  });
});
