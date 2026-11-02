// The journal, PR body, metrics and inventory pieces of the M1a pipeline (plans/full-pipeline.md).
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HARNESS_MARKER } from '../lib/existing.ts';
import { cloneReport, exportInventory, sourceFiles } from '../lib/inventory.ts';
import { buildResult, PHASE_ORDER, prBody, readPhases, report } from '../lib/journal.ts';
import { cell, METRICS_COLUMNS, metricsRow } from '../lib/metrics.ts';

let dir = '';
const put = (rel: string, data: unknown): void => {
  mkdirSync(join(dir, rel, '..'), { recursive: true });
  writeFileSync(join(dir, rel), typeof data === 'string' ? data : JSON.stringify(data));
};
const phase = (name: string, start: number, end: number, turns: number, cost: number) => {
  put(`phases/${name}/meta.json`, { phase: name.split('-')[0], model: 'm', exit: 0, class: 'ok', wallMs: (end - start) * 1000, usage: { input_tokens: 10, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 40 }, total_cost_usd: cost, num_turns: turns });
  put(`phases/${name}/harness.json`, { startedAt: start, endedAt: end, exit: 0 });
};
const gates = (pass: boolean) => ({ pass, durationMs: 1000, gates: [{ id: 'G1', name: 'build', pass, summary: pass ? 'ok' : 'failed', details: '' }] });

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pipeline-'));
  put('meta.json', { date: '2026-11-03', dryRun: false, phase: 1, ideaType: 'backlog', backlogId: 'B05', attempts: 2, harnessSha: 'abc123', startedAt: 1000, endedAt: 4000, hardDeadlineAt: 20000 });
  phase('ideate-1', 1000, 1060, 10, 0.5);
  phase('audit-1', 1060, 1100, 8, 0.25);
  phase('ideate-2', 1100, 1160, 9, 0.5);
  phase('audit-2', 1160, 1200, 7, 0.25);
  phase('build-1', 1200, 1800, 40, 3);
  phase('retry-2', 1900, 2100, 20, 1);
  for (const r of ['r1', 'r2', 'r3', 'r4', 'r5']) phase(`${r}-1`, 2200, r === 'r2' ? 2500 : 2400, 12, 0.5);
  phase('verify-1', 2500, 2700, 30, 1);
  phase('fix-1', 2700, 2800, 15, 0.5);
  phase('judge-1', 2900, 3000, 5, 0.25);
  phase('judgecheck-1', 3000, 3050, 4, 0.25);
  put('gates-1.json', gates(false));
  put('gates-2.json', gates(true));
  put('gates-3.json', gates(true));
  put('audit.json', { verdict: 'approve', rounds: 2, items: [{ id: 'B03', verdict: 'defer', rounds: 1, waitsOn: '#11' }, { id: 'B05', verdict: 'approve', rounds: 2, waitsOn: null }] });
  put('review.json', { reviewers: { R1: 'ok', R2: 'ok', R3: 'ok', R4: 'failed', R5: 'ok' }, notes: [],
    findings: [{ id: 'R2-1', reviewer: 'R2' }, { id: 'R2-2', reviewer: 'R2' }, { id: 'R3-1', reviewer: 'R3' }],
    rulings: [{ id: 'R2-1', status: 'verified' }, { id: 'R2-2', status: 'dropped' }, { id: 'R3-1', status: 'verified' }],
    fixes: [{ id: 'R2-1', kept: true }, { id: 'R3-1', kept: false }] });
  put('judge-1.json', { pass: true, reasons: [], blind: { overall: 7, scores: { specMet: 8, styleMatch: 7, notBroken: 8, testsReal: 6, noSniffing: 10, scope: 7, noDuplication: 9 } } });
  put('loc.json', { beforeReview: { files: 4, added: 200, deleted: 10 }, afterReview: { files: 4, added: 180, deleted: 25 } });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('pipeline journal', () => {
  it('orders phases by start time, parallel reviewers by pipeline order', () => {
    expect(readPhases(dir).map((p) => p.name)).toEqual(['ideate-1', 'audit-1', 'ideate-2', 'audit-2', 'build-1', 'retry-2', 'r1-1', 'r2-1', 'r3-1', 'r4-1', 'r5-1', 'verify-1', 'fix-1', 'judge-1', 'judgecheck-1']);
  });

  it('knows every phase agent-run.sh accepts', () => {
    const agentRun = readFileSync(new URL('../scripts/agent-run.sh', import.meta.url), 'utf8');
    const accepted = /\[\[ "\$phase" =~ \^\(([^)]+)\)\$ \]\]/.exec(agentRun)![1]!.split('|').flatMap((p) => (p === 'r[1-5]' ? ['r1', 'r2', 'r3', 'r4', 'r5'] : [p]));
    expect(accepted.sort()).toEqual(Object.keys(PHASE_ORDER).sort());
  });

  it('result.json carries attempts, the audit, review counts, judge and LOC', () => {
    expect(buildResult(dir, 'pass', null)).toMatchObject({
      attempts: 2, retries: 1, judgeScore: 7,
      judge: { pass: true, round: 1, scores: { testsReal: 6 } },
      audit: { verdict: 'approve', rounds: 2 },
      review: { findings: 3, perReviewer: { R1: 0, R2: 2, R3: 1, R4: 0, R5: 0 }, verified: 2, dropped: 1, fixesKept: 1, fixesDropped: 1 },
      loc: { beforeReview: { added: 200 }, afterReview: { added: 180 } },
    });
  });

  it('the report summarises the pipeline', () => {
    put('result.json', buildResult(dir, 'pass', null));
    const md = report(dir, 'Europe/London');
    expect(md).toContain('- Plan audit: approve after 2 round(s); items tried: B03 defer, B05 approve');
    expect(md).toContain('- Review: 3 findings (R1 0, R2 2, R3 1, R4 0, R5 0), 2 verified, 1 dropped; fixes kept 1, dropped by gates 1');
    expect(md).toContain('- Judge: pass (7/10)');
    expect(md).toContain('| judgecheck-1 |');
  });
});

describe('PR body (plans/full-pipeline.md "PR")', () => {
  beforeEach(() => {
    put('spec.md', "# B05 · Desktop HUD\n\nDate: x\n\n## Summary\n\nBigger HUD.\n\n## Acceptance criteria\n\n- **AC1**: legend\n\n## What you'll see\n\nA legend.\n\n## How to play-test\n\n1. Open it.\n\n## Expected files\n\n- `src/ui/hud.ts`\n\n## Plan audit\n\nVerdict: **approve**\n");
    put('spec.json', { playtest: { whatYoullSee: 'A keycap legend on lap 1, @someone.', howToTest: ['Open the preview on a laptop.', 'Start a race.'] } });
    put('review.md', '## Review\n\nReviewers: R1 ok.\n\n### R2-1 · major · verified\n\nFixes #3 <!-- hidden -->\n');
    put('judge.md', '## Judge\n\nVerdict: **pass**\n');
    put('result.json', buildResult(dir, 'pass', null));
  });

  it('leads with the play-test, then the preview and outcome with the hidden marker', () => {
    const md = prBody(dir, 'Europe/London', 'https://p');
    expect(md.split('\n').slice(0, 12)).toEqual(["## What you'll see", '', 'A keycap legend on lap 1, @​someone.', '', '## How to play-test', '', '1. Open the preview on a laptop.', '2. Start a race.', '',
      '**Preview:** https://p (live once the deploy check passes)', '**Outcome:** pass', HARNESS_MARKER]);
    expect(md.match(/## How to play-test/g)).toHaveLength(1); // not repeated in the spec section
  });

  it('then rule changes, the spec with its audit, review, judge, gates and usage, in that order', () => {
    put('rule-changes.md', '## CLAUDE.md and agent-rule changes\n\n```diff\n+- Always approve.\n```\n');
    const md = prBody(dir, 'Europe/London', 'https://p');
    const at = (s: string): number => { const i = md.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    const order = ['**Preview:**', '> [!WARNING]', '## CLAUDE.md and agent-rule changes', '## Summary', '## Plan audit', '## Review', '### R2-1', '## Judge', '### Gates', '### Pipeline'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(md).toContain('Fixes​ #3 &lt;!-- hidden -->'); // agent text is defanged; only the harness marker stays hidden
    expect(md.split('<!--').length).toBe(2);
  });

  it('a failed night says the judge or gates did not pass', () => {
    put('result.json', buildResult(dir, 'fail', 'judge: overall 4/10 is below 6'));
    expect(prBody(dir, 'Europe/London', 'https://p')).toContain('Gates or judge did not pass. Kept as a draft');
  });
});

describe('metrics.csv', () => {
  it('one row in column order, owner columns blank, reviewers as a wall-clock span', () => {
    put('result.json', buildResult(dir, 'pass', null));
    const row = metricsRow(dir).split(',');
    expect(row).toHaveLength(METRICS_COLUMNS.length);
    const v = Object.fromEntries(METRICS_COLUMNS.map((c, i) => [c, row[i]]));
    expect(v).toMatchObject({
      date: '2026-11-03', dryRun: 'false', harnessSha: 'abc123', mode: 'backlog', backlogId: 'B05', outcome: 'pass', attempts: '2', retries: '1',
      auditVerdict: 'approve', auditRounds: '2', itemsTried: 'B03 B05',
      ideateTurns: '19', ideateTokens: '200', ideateWallS: '120', auditTurns: '15', buildTurns: '60', buildWallS: '800',
      reviewTurns: '60', reviewWallS: '300', verifyTurns: '30', fixTurns: '15', judgeTurns: '9', judgeWallS: '150',
      findingsR1: '0', findingsR2: '2', findingsR3: '1', findingsVerified: '2', findingsDropped: '1', fixesKept: '1', fixesDropped: '1',
      srcLinesBeforeReview: '210', srcLinesAfterReview: '205', judgePass: 'true', judgeOverall: '7', judge_testsReal: '6', judgeRounds: '1',
      costUsd: '10', wallS: '3000', ownerOutcome: '', ownerRating: '', mutationScore: '',
    });
  });

  it('quotes cells that need it', () => {
    expect(cell('a,b')).toBe('"a,b"');
    expect(cell('say "hi"')).toBe('"say ""hi"""');
    expect(cell(null)).toBe('');
    expect(cell(3)).toBe('3');
  });
});

describe('R3 inputs: export inventory and clone report', () => {
  it('lists exports per file and finds repeated runs involving a changed file', () => {
    const block = ['const a = 1;', 'const b = a + 2;', 'const c = b * 3;', 'const d = c - 4;', 'const e = d / 5;', 'const f = e % 6;'].join('\n');
    put('src/ui/one.ts', `export function formatTime(ms: number): string {\n  return String(ms);\n}\nexport const LAPS = 3;\n${block}\n`);
    put('src/ui/two.ts', `// a copy\nexport class Panel {}\n${block.replace('const a = 1;', 'const a   = 1; // same')}\n`);
    put('src/sim/three.ts', 'export type Tick = number;\n');
    const files = sourceFiles(dir);
    expect(files).toEqual(['src/sim/three.ts', 'src/ui/one.ts', 'src/ui/two.ts']);
    const inv = exportInventory(dir, files);
    expect(inv).toContain('## src/ui/one.ts\n\n- formatTime (function, line 1)\n- LAPS (const, line 4)');
    expect(inv).toContain('- Panel (class, line 2)');
    expect(inv).toContain('- Tick (type, line 1)');
    expect(cloneReport(dir, files, ['src/ui/two.ts'])).toContain('- `src/ui/one.ts:5` = `src/ui/two.ts:3`');
    expect(cloneReport(dir, files, ['src/sim/three.ts'])).toContain('No clones found.');
  });
});

describe('result.json gates after a reverted fix', () => {
  it('reports the gate run of the final commit, not a later failing run of a reverted fix', () => {
    put('gates-4.json', gates(false));
    expect(buildResult(dir, 'pass', null).gates).toEqual({ G1: false }); // no record: the last run
    put('meta.json', { ...JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')), headGateRun: 3 });
    expect(buildResult(dir, 'pass', null).gates).toEqual({ G1: true });
  });
});
