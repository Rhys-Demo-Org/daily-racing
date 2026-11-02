// A maintenance night past the survey (harness/lib/maintenance.ts): the plan audit's choice held
// to the harness rules, the locked spec, gate M1's limits, the refactor report, and what the PR
// body, result.json and metrics.csv make of maintenance.json.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanupMarker, emptyList, mergeSurvey, type SurveyFinding } from '../lib/cleanup.ts';
import { HARNESS_MARKER } from '../lib/existing.ts';
import { buildResult, prBody, report } from '../lib/journal.ts';
import { checkLimits, checkMaintAudit, doneItems, limitsGate, readRefactor, renderMaintSpec, type MaintRecord } from '../lib/maintenance.ts';
import { METRICS_COLUMNS, metricsRow } from '../lib/metrics.ts';

const LIMITS = { maxFiles: 40, maxLines: 1500, maxNetSrc: 0 };

describe('maintenance plan audit', () => {
  const raw = (over: Record<string, unknown> = {}) => ({
    title: 'Shared lap-time formatting', summary: 'Use one formatter for lap times everywhere; behaviour is unchanged.',
    chosen: [{ id: 'C002', why: 'deletes a copy' }, { id: 'C002', why: 'twice' }, { id: 'C009', why: 'owner-only' }, { id: 'C003', why: 'dead export' }],
    rejected: [{ id: 'C004', reason: 'changes layout' }, { id: 'C003', reason: 'also chosen' }, { id: 'C777', reason: 'unknown' }],
    playtest: { whatYoullSee: 'Nothing should look or feel different.', howToTest: ['Finish a race: the results times read as before.'] }, ...over,
  });

  it('keeps eligible choices once, notes the rest, and only rejections of eligible unchosen items', () => {
    const a = checkMaintAudit(raw(), ['C002', 'C003', 'C004'], 8)!;
    expect(a.chosen.map((c) => c.id)).toEqual(['C002', 'C003']);
    expect(a.rejected).toEqual([{ id: 'C004', reason: 'changes layout' }]);
    expect(a.notes).toEqual(['C009 is not eligible tonight; ignored']);
  });

  it('caps the number of items and fills in a default play-test', () => {
    const a = checkMaintAudit(raw({ playtest: null }), ['C002', 'C003', 'C004'], 1)!;
    expect(a.chosen.map((c) => c.id)).toEqual(['C002']);
    expect(a.notes).toContain('C003 is over the 1-item limit; left for next week');
    expect(a.playtest.whatYoullSee).toBe('Nothing should look or feel different.');
  });

  it('unusable output is null', () => {
    expect(checkMaintAudit(null, ['C001'], 8)).toBeNull();
    expect(checkMaintAudit({ title: 'x', summary: '', chosen: [] }, ['C001'], 8)).toBeNull();
  });

  it('the spec lists the chosen items in full, the play-test, the limits and the audit', () => {
    const l = emptyList();
    const f = (claim: string, files: string[]): SurveyFinding => ({ category: 'duplication', files, line: null, claim, evidence: 'e', suggestedFix: 'fix it', worth: 'high', estLines: 30 });
    mergeSurvey(l, 'ui', { findings: [f('lap time formatting copied in two places', ['src/ui/hud.ts', 'src/ui/format.ts']), f('dead export in results', ['src/ui/results-screen.ts'])], confirmations: [], dropped: [] }, 'd');
    const a = checkMaintAudit(raw({ chosen: [{ id: 'C001', why: 'deletes a copy' }], rejected: [{ id: 'C002', reason: 'too risky' }] }), ['C001', 'C002'], 8)!;
    const md = renderMaintSpec(a, l, '2026-11-08', LIMITS, ['C003: open PR #7']);
    expect(md).toMatch(/^# Maintenance · Shared lap-time formatting\n/);
    expect(md).toContain('### C001 · ui · duplication · worth high · ~30 lines');
    expect(md).toContain('- Why tonight (plan audit): deletes a copy');
    expect(md).not.toContain('### C002');
    expect(md).toContain("## What you'll see\n\nNothing should look or feel different.");
    expect(md).toContain('- At most 40 changed files and 1500 changed lines (journal excluded).');
    expect(md).toContain('- `src/ui/hud.ts`\n- `src/ui/format.ts`');
    expect(md).toContain('- C002: too risky');
    expect(md).toContain('- C003: open PR #7');
  });
});

// `git diff --raw -z --no-renames` and `--numstat -z` for a list of changes.
const diff = (rows: [status: string, path: string, added: number, deleted: number][]): { raw: string; numstat: string } => ({
  raw: rows.map(([st, p]) => `:${st === 'A' ? '000000' : '100644'} ${st === 'D' ? '000000' : '100644'} aaaa bbbb ${st}\0${p}\0`).join(''),
  numstat: rows.map(([, p, a, d]) => `${a}\t${d}\t${p}\0`).join(''),
});

describe('gate M1: maintenance limits', () => {
  it('passes a shrinking refactor with a new test and a CLAUDE.md fix', () => {
    const d = diff([['M', 'src/ui/hud.ts', 10, 40], ['D', 'src/ui/old.ts', 0, 25], ['A', 'tests/ui/format-seam.test.ts', 60, 0], ['M', 'CLAUDE.md', 1, 1], ['A', 'journal/runs/2026-11-08/x.md', 900, 0]]);
    const r = checkLimits(d.raw, d.numstat, '2026-11-08', LIMITS);
    expect(r).toEqual({ pass: true, files: 4, lines: 137, srcAdded: 10, srcDeleted: 65, netSrc: -55, problems: [] });
    expect(limitsGate(r, LIMITS)).toMatchObject({ id: 'M1', pass: true, summary: '4 files, 137 lines, net src -55 (limits 40 / 1500 / ≤ 0)' });
  });

  it('fails net src growth (tests not counted), too many files or lines', () => {
    const grow = diff([['M', 'src/ui/hud.ts', 30, 10], ['A', 'tests/x.test.ts', 500, 0]]);
    expect(checkLimits(grow.raw, grow.numstat, 'd', LIMITS).problems).toEqual(['net src/ lines grew by 20 (+30 −10); a maintenance night must not grow src/']);
    const many = diff(Array.from({ length: 41 }, (_, i): [string, string, number, number] => ['M', `src/m${i}.ts`, 0, 1]));
    expect(checkLimits(many.raw, many.numstat, 'd', LIMITS).problems).toEqual(['41 files changed (limit 40)']);
    const big = diff([['M', 'src/a.ts', 700, 900]]);
    expect(checkLimits(big.raw, big.numstat, 'd', LIMITS).problems).toEqual(['1600 lines changed (limit 1500)']);
  });

  it('fails an edited or deleted existing test and any protected path', () => {
    const d = diff([['M', 'tests/ui/screens.test.ts', 1, 1], ['D', 'tests/ui/old.test.ts', 0, 5], ['M', 'harness/daily.sh', 1, 0], ['M', 'src/ui/a.ts', 0, 9]]);
    const r = checkLimits(d.raw, d.numstat, 'd', LIMITS);
    expect(r.pass).toBe(false);
    expect(r.problems).toEqual([
      'harness/daily.sh: protected path',
      'tests/ui/screens.test.ts: existing tests are append-only on maintenance nights (until mutation testing exists)',
      'tests/ui/old.test.ts: existing tests are append-only on maintenance nights (until mutation testing exists)',
    ]);
    expect(limitsGate(r, LIMITS).summary).toMatch(/^3 limit violation\(s\): /);
  });
});

describe('refactor report', () => {
  it('keeps chosen items once; anything else in status is not-done', () => {
    const dir = mkdtempSync(join(tmpdir(), 'refactor-'));
    const p = join(dir, 'r.json');
    writeFileSync(p, JSON.stringify({ type: 'result', structured_output: { items: [{ id: 'C001', status: 'done', summary: 'one formatter' }, { id: 'C001', status: 'partial', summary: 'dup' }, { id: 'C002', status: 'weird', summary: '?' }, { id: 'C9', status: 'done', summary: 'not chosen' }], claudeMd: null } }));
    expect(readRefactor(p, ['C001', 'C002'])).toEqual([{ id: 'C001', status: 'done', summary: 'one formatter' }, { id: 'C002', status: 'not-done', summary: '?' }]);
    expect(readRefactor(join(dir, 'missing.json'), ['C001'])).toBeNull();
  });

  it('done items: the refactor’s done ones, or every chosen item without a report', () => {
    const chosen = [{ id: 'C001', category: 'x', files: [], claim: 'c', why: 'w' }, { id: 'C002', category: 'x', files: [], claim: 'c', why: 'w' }];
    expect(doneItems({ chosen, refactor: [{ id: 'C002', status: 'done', summary: '' }, { id: 'C001', status: 'partial', summary: '' }] })).toEqual(['C002']);
    expect(doneItems({ chosen, refactor: null })).toEqual(['C001', 'C002']);
  });
});

describe('maintenance journal, PR body and metrics', () => {
  let dir = '';
  const put = (rel: string, data: unknown): void => {
    mkdirSync(join(dir, rel, '..'), { recursive: true });
    writeFileSync(join(dir, rel), typeof data === 'string' ? data : JSON.stringify(data));
  };
  const maint: MaintRecord = {
    survey: { passes: { sim: 'ok', render: 'ok', ui: 'ok', content: 'ok', tests: 'failed', seams: 'ok', duplication: 'ok', performance: 'ok' }, findings: 9, new: 4, merged: 5, confirmed: 3, staled: 1, reopened: 0, dropped: 0, gone: 1 },
    list: { size: 12, open: 7, 'in-pr': 0, stale: 2, closed: 3 },
    candidates: { eligible: ['C001', 'C002'], skipped: [{ id: 'C005', prs: [7] }], ownerOnly: ['C006'] },
    ownerOnly: [{ id: 'C006', claim: 'finish-panel.ts is dead code that only tests import', files: ['src/ui/finish-panel.ts', 'tests/ui/screens.test.ts'] }],
    chosen: [{ id: 'C001', category: 'duplication', files: ['src/ui/hud.ts'], claim: 'lap time formatting copied @someone', why: 'deletes a copy' }],
    rejected: [{ id: 'C002', reason: 'too risky' }],
    refactor: [{ id: 'C001', status: 'done', summary: 'hud.ts now uses formatTime. Fixes #3' }],
    limits: { pass: true, files: 3, lines: 90, srcAdded: 10, srcDeleted: 52, netSrc: -42, problems: [] },
  };
  const gate = (id: string, pass = true) => ({ id, name: id, pass, durationMs: 1, summary: `${id} summary`, details: '' });

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'maint-'));
    put('meta.json', { date: '2026-11-08', dryRun: false, ideaType: 'maintenance', backlogId: null, harnessSha: 'abc', startedAt: 1000, endedAt: 1600, hardDeadlineAt: 20000, headGateRun: 2 });
    put('maintenance.json', maint);
    put('spec.md', '# Maintenance · Shared formatting\n\n## Summary\n\nOne formatter.\n\n## Cleanup items\n\n### C001\n\n## What you\'ll see\n\nNothing.\n\n## How to play-test\n\n1. Race.\n\n## Plan audit\n\nChose C001.\n\nNot chosen tonight (they stay on the list):\n\n- C002: too risky\n');
    put('spec.json', { playtest: { whatYoullSee: 'Nothing should look or feel different.', howToTest: ['Finish a race and check the results times.'] } });
    put('gates-1.json', { pass: false, gates: [gate('G1'), gate('P1', false), gate('M1')] });
    put('gates-2.json', { pass: true, gates: ['G1', 'G2', 'G3', 'G8', 'P1', 'P2', 'M1'].map((id) => gate(id)) });
    put('gates-3.json', { pass: false, gates: [gate('G1'), gate('P2', false)] });
    put('review.md', '## Review\n\nReviewers: R1 ok.\n');
    put('judge.md', '## Judge\n\nVerdict: **pass**\n');
    put('result.json', buildResult(dir, 'pass', null));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('the body: changes by item, play-test, preview and markers, rule changes, net LOC, preservation, owner items, audit, review, judge, gates', () => {
    put('rule-changes.md', '## CLAUDE.md and agent-rule changes\n\n```diff\n-old\n+new\n```\n');
    const md = prBody(dir, 'Europe/London', 'https://p');
    const at = (s: string): number => { const i = md.indexOf(s); expect(i, s).toBeGreaterThan(-1); return i; };
    const order = ['## What changed (by cleanup item)', '### C001 · duplication', "## What you'll see", '## How to play-test', '**Preview:**', HARNESS_MARKER, cleanupMarker(['C001']),
      '## CLAUDE.md and agent-rule changes', '## Net `src/` lines', '## Behaviour preservation', '## Needs the owner', '## Plan audit', '## Review', '## Judge', '### Gates'].map(at);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(md).toContain('**−42** (src/: +10 −52) · 3 files and 90 lines changed');
    expect(md).toContain('| P1 Every screen stage: DOM + computed styles identical | pass | P1 summary |'); // HEAD's run (2), not the later failed one
    expect(md).toContain("- Refactor agent's report: done. hud.ts now uses formatTime. Fixes​ #3");
    expect(md).toContain('copied @​someone');
    expect(md).toContain('- C006: finish-panel.ts is dead code that only tests import');
    expect(md).toContain('- C002: too risky');
    expect(md.split('<!--').length).toBe(3); // only the harness's two markers stay hidden
  });

  it('result.json, the report and metrics.csv carry the maintenance numbers', () => {
    expect(buildResult(dir, 'pass', null).maintenance).toMatchObject({ chosen: [{ id: 'C001' }] });
    expect(report(dir, 'Europe/London')).toContain('- Maintenance: survey 9 findings (4 new, 5 repeats; 3 confirmed, 2 gone stale), failed passes: tests; list 7 open, 0 in PR, 2 stale, 3 closed; 2 eligible, 1 skipped (open PRs), 1 for the owner; chosen C001; done C001; net src -42 lines, 3 files, 90 lines changed');
    const row = metricsRow(dir).split(',');
    const v = Object.fromEntries(METRICS_COLUMNS.map((c, i) => [c, row[i]]));
    expect(v).toMatchObject({ mode: 'maintenance', surveyFindings: '9', surveyNew: '4', surveyStaled: '2', listOpen: '7', listSize: '12', itemsEligible: '2', itemsSkippedOverlap: '1',
      itemsOwnerOnly: '1', itemsChosen: '1', itemsDone: '1', netSrcLines: '-42', changedFiles: '3', changedLines: '90', preserveP1: 'true', preserveP2: 'true', limitsM1: 'true' });
  });
});
