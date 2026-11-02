import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkRulings, fixBrief, fixQueue, readFindings, readFix, REVIEWERS, reviewMd, verifierTest, type Finding } from '../lib/review.ts';
import { structuredOutput } from '../lib/spec.ts';

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'review-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const result = (name: string, structured: unknown): string => {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, 'result.json'), JSON.stringify({ type: 'result', subtype: 'success', is_error: false, structured_output: structured }));
  return join(dir, name, 'result.json');
};
const raw = (id: string, severity: string, claim = `claim ${id}`) => ({ id, severity, file: 'src/ui/x.ts', line: 3, claim, evidence: 'e', suggestedFix: 'f' });
const f = (id: string, severity: Finding['severity']): Finding => ({ id, reviewer: id.slice(0, 2), severity, file: 'src/ui/x.ts', line: 3, claim: `claim ${id}`, evidence: 'e', suggestedFix: 'f' });
const trace = 'Step 1: start a race with seed 1. Step 2: pause at tick 30. Step 3: the Esc listener is still attached at src/ui/x.ts:3.';

describe('review findings', () => {
  it('renumbers a reviewer\'s findings and skips empty claims', () => {
    const p = result('r2-1', { findings: [raw('F7', 'critical'), raw('F8', 'bogus'), raw('F9', 'minor', '')] });
    expect(readFindings('R2', p)).toEqual([
      { id: 'R2-1', reviewer: 'R2', severity: 'critical', file: 'src/ui/x.ts', line: 3, claim: 'claim F7', evidence: 'e', suggestedFix: 'f' },
      { id: 'R2-2', reviewer: 'R2', severity: 'minor', file: 'src/ui/x.ts', line: 3, claim: 'claim F8', evidence: 'e', suggestedFix: 'f' },
    ]);
    expect(readFindings('R1', join(dir, 'missing.json'))).toBeNull();
  });
});

describe('verification', () => {
  const findings = [f('R1-1', 'major'), f('R2-1', 'critical'), f('R2-2', 'minor'), f('R3-1', 'major'), f('R5-1', 'major')];
  const rule = (id: string, o: Record<string, unknown>) => ({ id, status: 'verified', method: 'trace', testFile: null, trace, reason: 'r', ...o });

  it('holds every ruling to its proof', () => {
    const r = checkRulings({ results: [
      rule('R1-1', { method: 'test', testFile: 'tests/verify/R1-1.test.ts' }),
      rule('R2-1', { method: 'test', testFile: 'tests/verify/nope.test.ts', trace: 'short' }),
      rule('R2-2', { method: 'test', testFile: 'tests/verify/nope.test.ts' }),
      rule('R3-1', { trace: 'it is so' }),
      rule('R3-1', { status: 'dropped', method: 'none' }),
    ] }, findings, ['tests/verify/R1-1.test.ts']);
    expect(r.map((x) => [x.id, x.status, x.method])).toEqual([
      ['R1-1', 'verified', 'test'],
      ['R2-1', 'dropped', 'test'],
      ['R2-2', 'verified', 'trace'],
      ['R3-1', 'dropped', 'trace'],
      ['R5-1', 'dropped', 'none'],
    ]);
    expect(r[1]!.harnessNote).toMatch(/not written and there is no trace/);
    expect(r[2]!.harnessNote).toMatch(/kept on its trace/);
    expect(r[3]!.harnessNote).toMatch(/too short/);
    expect(r[4]!.harnessNote).toBe('no ruling');
  });

  it('drops everything when the verifier gave nothing usable', () => {
    expect(checkRulings(null, findings, []).every((x) => x.status === 'dropped')).toBe(true);
  });

  it('queues only verified findings, most severe first, capped', () => {
    const r = checkRulings({ results: findings.map((x) => rule(x.id, {})) }, findings, []);
    expect(fixQueue(findings, r, 10).map((x) => x.id)).toEqual(['R2-1', 'R1-1', 'R3-1', 'R5-1', 'R2-2']);
    expect(fixQueue(findings, r, 2).map((x) => x.id)).toEqual(['R2-1', 'R1-1']);
    expect(fixQueue(findings, checkRulings({ results: [rule('R2-2', {})] }, findings, []), 10).map((x) => x.id)).toEqual(['R2-2']);
  });

  it('briefs a fixer with the finding, the proof and the verifier\'s test', () => {
    const r = checkRulings({ results: [rule('R1-1', { method: 'test', testFile: 'tests/verify/R1-1.test.ts' })] }, findings, ['tests/verify/R1-1.test.ts'])[0];
    const brief = fixBrief(findings[0]!, r, "it('AC1: fails', () => {});");
    expect(brief).toMatch(/^## Finding R1-1 \(major, reviewer R1: spec/);
    expect(brief).toContain('- Claim: claim R1-1');
    expect(brief).toContain("```ts\nit('AC1: fails', () => {});\n```");
  });
});

describe('fixes and review.md', () => {
  it('reads a fix report, or records a failed agent', () => {
    expect(readFix('R2-1', result('fix-1', { id: 'R2-1', status: 'fixed', summary: 'Removed the listener on dispose.', tests: ['tests/fix/r2-1.test.ts'] })))
      .toEqual({ id: 'R2-1', status: 'fixed', summary: 'Removed the listener on dispose.', tests: ['tests/fix/r2-1.test.ts'], commit: null, kept: null });
    expect(readFix('R2-1', join(dir, 'none.json'))).toMatchObject({ status: 'agent-error' });
  });

  it('records each finding\'s ruling and fix fate, and the judge fix round', () => {
    const findings = [f('R2-1', 'critical'), f('R3-1', 'minor'), f('R4-1', 'minor')];
    const rulings = checkRulings({ results: [{ id: 'R2-1', status: 'verified', method: 'trace', testFile: null, trace, reason: 'Reproduced.' }, { id: 'R3-1', status: 'verified', method: 'trace', testFile: null, trace, reason: 'Both copies shown.' }] }, findings, []);
    const md = reviewMd({
      reviewers: { R1: 'ok', R2: 'ok', R3: 'ok', R4: 'failed', R5: 'ok' }, findings, rulings, notes: ['1 verified finding beyond the limit was not fixed.'],
      fixes: [
        { id: 'R2-1', status: 'fixed', summary: 'Removed the listener.', tests: ['tests/fix/a.test.ts'], commit: 'abcdef0123456789', kept: true },
        { id: 'R3-1', status: 'fixed', summary: 'Reused formatTime.', tests: [], commit: '0123456789abcdef', kept: false },
        { id: 'J1', status: 'fixed', summary: 'Judge: fixed the label.', tests: [], commit: 'fedcba9876543210', kept: true },
      ],
    });
    expect(md).toContain('Reviewers: R1 ok, R2 ok, R3 ok, R4 failed, R5 ok.');
    expect(md).toContain('3 findings, 2 verified, 1 dropped; 2 fixes kept after the gates.');
    expect(md).toContain('### R2-1 · critical · verified');
    expect(md).toContain('Fix: fixed in `abcdef012345`. Removed the listener. Tests: `tests/fix/a.test.ts`. Kept: the gates pass with it.');
    expect(md).toContain('Reused formatTime. Dropped: the gates failed with it.');
    expect(md).toContain('### R4-1 · minor · dropped');
    expect(md).toContain('### Judge fix round\n\nFix: fixed in `fedcba987654`. Judge: fixed the label. Kept');
  });
});

describe('the verifier\'s test file reaches a fixer only from verify-tests/', () => {
  const secret = 'github_pat_SECRET0123456789';
  const traceRuling = (testFile: string) => ({ id: 'R2-1', status: 'verified', method: 'trace', testFile, trace, reason: 'Reproduced.' });

  it('nulls a claimed testFile the verifier did not write, on any ruling', () => {
    const findings = [f('R2-1', 'major')];
    expect(checkRulings({ results: [traceRuling('../../../github-token')] }, findings, ['tests/verify/R2-1.test.ts'])[0]).toMatchObject({ status: 'verified', method: 'trace', testFile: null });
    expect(checkRulings({ results: [traceRuling('tests/verify/R2-1.test.ts')] }, findings, ['tests/verify/R2-1.test.ts'])[0]?.testFile).toBe('tests/verify/R2-1.test.ts');
  });

  it('reads only a regular file whose real path is inside the folder', () => {
    const home = join(dir, 'home');
    const tests = join(home, 'runs', '2026-11-02', 'verify-tests');
    mkdirSync(join(tests, 'tests', 'verify'), { recursive: true });
    writeFileSync(join(home, 'github-token'), secret);
    writeFileSync(join(tests, 'tests', 'verify', 'R2-1.test.ts'), "it('fails', () => {});");
    symlinkSync(join(home, 'github-token'), join(tests, 'tests', 'verify', 'link.test.ts'));
    expect(verifierTest(tests, 'tests/verify/R2-1.test.ts')).toBe("it('fails', () => {});");
    for (const bad of ['../../../github-token', `${home}/github-token`, 'tests/verify/link.test.ts', 'tests/verify', 'tests/verify/none.test.ts', '', null]) {
      expect(verifierTest(tests, bad), String(bad)).toBeNull();
    }
  });

  it('cli fixbrief never puts a file outside verify-tests/ in the brief (regression: PAT leak)', () => {
    const home = join(dir, 'home2');
    const run = join(home, 'runs', '2026-11-02');
    mkdirSync(join(run, 'verify-tests'), { recursive: true });
    writeFileSync(join(home, 'github-token'), secret);
    const finding = f('R2-1', 'major');
    // A review.json written before this fix (or by hand) still carries the traversal: fixbrief must refuse it.
    const state = { reviewers: { R2: 'ok' }, findings: [finding], rulings: [{ ...traceRuling('../../../github-token'), method: 'trace', harnessNote: undefined }], fixes: [], notes: [] };
    writeFileSync(join(run, 'review.json'), JSON.stringify(state));
    const out = spawnSync(process.execPath, ['harness/lib/cli.ts', 'fixbrief', join(run, 'review.json'), 'R2-1', join(run, 'verify-tests')], { encoding: 'utf8' });
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('## Finding R2-1');
    expect(out.stdout).not.toContain(secret);
  });
});

describe('structured output', () => {
  it('reads it from a result object, a message array or a JSON result string; null otherwise', () => {
    const p = (name: string, v: unknown): string => { const x = join(dir, name); writeFileSync(x, typeof v === 'string' ? v : JSON.stringify(v)); return x; };
    expect(structuredOutput(p('a.json', { type: 'result', structured_output: { a: 1 } }))).toEqual({ a: 1 });
    expect(structuredOutput(p('b.json', [{ type: 'system' }, { type: 'result', structured_output: { b: 2 } }]))).toEqual({ b: 2 });
    expect(structuredOutput(p('c.json', { type: 'result', result: '{"c":3}' }))).toEqual({ c: 3 });
    expect(structuredOutput(p('d.json', { type: 'result', result: 'no JSON here' }))).toBeNull();
    expect(structuredOutput(p('e.json', 'not json'))).toBeNull();
    expect(structuredOutput(join(dir, 'missing.json'))).toBeNull();
  });
});

describe('reviewer focus and verifier duplicates', () => {
  const prompt = (f: string): string => readFileSync(new URL(`../prompts/${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  it('R1 covers the criteria and the play-test only; test strength is R5\'s', () => {
    expect(REVIEWERS.R1).toBe('spec: every acceptance criterion is met and the play-test is true');
    expect(prompt('review-r1.md')).not.toMatch(/really prove|fail without the feature|Supersedes/);
    expect(prompt('review-r5.md')).toMatch(/test strength/);
  });
  it('the verifier drops cross-reviewer duplicates by name', () => {
    expect(prompt('verify.md')).toContain('reason `duplicate of Rx-y`');
  });
});

describe('review.md for the judge check call and for a skipped review', () => {
  const findings = [f('R2-1', 'critical'), f('R4-1', 'minor')];
  const rulings = checkRulings({ results: [{ id: 'R2-1', status: 'verified', method: 'trace', testFile: null, trace, reason: 'Reproduced.' }, { id: 'R4-1', status: 'dropped', method: 'none', testFile: null, trace: '', reason: 'Not real.' }] }, findings, []);
  const s = { reviewers: { R2: 'ok' as const, R4: 'ok' as const }, findings, rulings, fixes: [], notes: [] };

  it('leaves dropped findings out of the check call\'s copy, but not the PR\'s', () => {
    expect(reviewMd(s)).toContain('claim R4-1');
    const check = reviewMd(s, true);
    expect(check).toContain('claim R2-1');
    expect(check).not.toContain('claim R4-1');
    expect(check).toContain('Dropped findings are left out here');
  });

  it('says "Not reviewed" when every reviewer was skipped', () => {
    const md = reviewMd({ reviewers: { R1: 'skipped', R2: 'skipped', R3: 'skipped', R4: 'skipped', R5: 'skipped' }, findings: [], rulings: [], fixes: [], notes: ['No time.'] });
    expect(md).toContain('**Not reviewed.**');
    expect(md).toContain('- No time.');
  });
});
