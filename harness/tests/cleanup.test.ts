// The persistent cleanup list (harness/lib/cleanup.ts, plans/full-pipeline.md "The 7th day"):
// survey merge and dedupe, confirmations and stale items, closing on a merged maintenance PR,
// tonight's candidates and the markdown the agents get.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HARNESS_MARKER, type GhPr } from '../lib/existing.ts';
import {
  candidates, cleanupMarker, emptyList, loadList, markDone, markerIds, matchItem, mergeSurvey, readSurvey, recordRejections, renderCandidates, renderList, saveList,
  similarity, staleMissing, syncPrs, type CleanupList, type Survey, type SurveyFinding,
} from '../lib/cleanup.ts';

const finding = (over: Partial<SurveyFinding> = {}): SurveyFinding => ({
  category: 'duplication', files: ['src/ui/hud.ts', 'src/ui/results-screen.ts'], line: 12,
  claim: 'formatLapTime is copied in hud.ts and results-screen.ts; both pad minutes and seconds the same way',
  evidence: 'hud.ts:12 and results-screen.ts:40', suggestedFix: 'use format.ts formatTime', worth: 'medium', estLines: 20, ...over,
});
const survey = (findings: SurveyFinding[], confirmations: Survey['confirmations'] = []): Survey => ({ findings, confirmations, dropped: [] });
const ids = (l: CleanupList, status?: string): string[] => l.items.filter((i) => !status || i.status === status).map((i) => i.id);

describe('survey merge and dedupe', () => {
  it('adds new findings with ids, dates and history', () => {
    const l = emptyList();
    const st = mergeSurvey(l, 'ui', survey([finding(), finding({ files: ['src/sim/car.ts'], category: 'dead-code', claim: 'skidFactor export is never imported anywhere in src or tests' })]), '2026-11-08');
    expect(st).toMatchObject({ findings: 2, new: 2, merged: 0 });
    expect(l.items.map((i) => [i.id, i.area, i.status, i.firstSeen, i.lastSeen, i.seenCount])).toEqual([
      ['C001', 'ui', 'open', '2026-11-08', '2026-11-08', 1], ['C002', 'ui', 'open', '2026-11-08', '2026-11-08', 1],
    ]);
    expect(l.nextId).toBe(3);
    expect(l.items[0]!.history[0]).toEqual({ date: '2026-11-08', event: 'reported by the ui survey' });
  });

  it('a finding that repeats an item (shared file, similar claim) updates it instead, once per survey', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), '2026-11-08');
    // The duplication pass, same night, words it differently but names the same copy.
    const st = mergeSurvey(l, 'duplication', survey([finding({ files: ['src/ui/results-screen.ts'], claim: 'results-screen.ts copies formatLapTime from hud.ts: same minute and second padding', worth: 'high' })]), '2026-11-08');
    expect(st).toMatchObject({ new: 0, merged: 1 });
    expect(l.items).toHaveLength(1);
    expect(l.items[0]).toMatchObject({ seenCount: 1, worth: 'high' });
    // A week later it is reported again: carried over, seen twice.
    mergeSurvey(l, 'ui', survey([finding()]), '2026-11-15');
    expect(l.items[0]).toMatchObject({ id: 'C001', firstSeen: '2026-11-08', lastSeen: '2026-11-15', seenCount: 2 });
  });

  it('does not merge unrelated claims about the same file, or the same claim about other files', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), '2026-11-08');
    mergeSurvey(l, 'ui', survey([finding({ category: 'performance', claim: 'sync() rebuilds the minimap path string every frame even when no car moved' })]), '2026-11-08');
    mergeSurvey(l, 'ui', survey([finding({ files: ['src/ui/pause-screen.ts'] })]), '2026-11-08');
    expect(ids(l)).toEqual(['C001', 'C002', 'C003']);
  });

  it('similarity and matching thresholds', () => {
    expect(similarity('formatLapTime duplicated in hud and results', 'formatLapTime duplicated in hud and results')).toBe(1);
    expect(similarity('a b', 'c d')).toBe(0);
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), 'd');
    expect(matchItem(l.items, 'ui', finding({ claim: 'formatLapTime is copied in hud.ts and results-screen.ts' }))?.id).toBe('C001');
    expect(matchItem(l.items, 'sim', finding({ claim: 'entirely different words about rendering' }))).toBeNull();
  });

  it('confirmations: still present → seen again; not reproduced → stale; a stale item reported again reopens', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding(), finding({ files: ['src/ui/hud.ts'], claim: 'hud.ts has an unused export legacyPanel kept from the first HUD' })]), '2026-11-08');
    const st = mergeSurvey(l, 'ui', survey([], [{ id: 'C001', stillPresent: true, note: '' }, { id: 'C002', stillPresent: false, note: 'deleted by #14' }]), '2026-11-15');
    expect(st).toMatchObject({ confirmed: 1, staled: 1 });
    expect(l.items.map((i) => [i.id, i.status, i.seenCount, i.lastSeen])).toEqual([['C001', 'open', 2, '2026-11-15'], ['C002', 'stale', 1, '2026-11-08']]);
    expect(l.items[1]!.history.at(-1)!.event).toBe('not reproduced by the ui survey: deleted by #14');
    mergeSurvey(l, 'ui', survey([finding({ files: ['src/ui/hud.ts'], claim: 'unused export legacyPanel in hud.ts from the first HUD' })]), '2026-11-22');
    expect(l.items[1]).toMatchObject({ status: 'open', lastSeen: '2026-11-22', seenCount: 2 });
  });

  it("a pass's confirmations only count for its own area", () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), 'd1');
    mergeSurvey(l, 'sim', survey([], [{ id: 'C001', stillPresent: false, note: 'not mine' }]), 'd2');
    expect(l.items[0]!.status).toBe('open');
  });

  it('items whose files are all gone go stale', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), 'd1');
    expect(staleMissing(l, 'd2', (f) => f === 'src/ui/hud.ts')).toBe(0);
    expect(staleMissing(l, 'd2', () => false)).toBe(1);
    expect(l.items[0]!.status).toBe('stale');
  });

  it('a closed item is never reopened by a repeat; the repeat is new and says what it resembles', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), 'd1');
    Object.assign(l.items[0]!, { status: 'closed', pr: 21 });
    mergeSurvey(l, 'ui', survey([finding()]), 'd2');
    expect(l.items.map((i) => [i.id, i.status])).toEqual([['C001', 'closed'], ['C002', 'open']]);
    expect(l.items[1]!.history[0]!.event).toBe('reported by the ui survey; resembles C001, closed in #21');
  });
});

describe('survey output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'survey-'));
  const result = (structured: unknown): string => {
    const p = join(dir, `${Math.random()}.json`);
    writeFileSync(p, JSON.stringify({ type: 'result', structured_output: structured }));
    return p;
  };
  it('keeps valid findings, drops ones naming owner-only or unknown paths, cleans paths', () => {
    const s = readSurvey(result({
      findings: [
        { ...finding({ files: ['./src/ui/hud.ts:12', 'src/ui/hud.ts'] }), category: 'nonsense', worth: 'huge' },
        finding({ files: ['src/driver/index.ts'] }), finding({ files: ['harness/daily.sh'] }), finding({ files: ['src/../etc/passwd'] }),
        finding({ files: ['CLAUDE.md'], category: 'docs', claim: 'CLAUDE.md says tracks live in src/tracks; they are in src/content/tracks' }),
      ],
      confirmations: [{ id: 'C001', stillPresent: true, note: 'yes' }, { id: 3, stillPresent: 'yes' }],
    }))!;
    expect(s.findings.map((f) => [f.files, f.category, f.worth])).toEqual([[['src/ui/hud.ts'], 'simplify', 'low'], [['CLAUDE.md'], 'docs', 'medium']]);
    expect(s.dropped).toHaveLength(3);
    expect(s.confirmations).toEqual([{ id: 'C001', stillPresent: true, note: 'yes' }]);
    expect(readSurvey(result(null))).toBeNull();
    expect(readSurvey(join(dir, 'missing.json'))).toBeNull();
  });
});

describe('GitHub sync: maintenance PRs close their items', () => {
  const pr = (number: number, state: string, body: string, login = 'owner', labels = ['daily', 'maintenance']): GhPr => ({ number, state, body, author: { login }, labels: labels.map((name) => ({ name })) });
  const list = (): CleanupList => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding(), finding({ files: ['src/sim/car.ts'], claim: 'skidFactor export is never imported anywhere' }), finding({ files: ['src/render/car.ts'], claim: 'two copies of the wheel builder in car.ts' })]), 'd1');
    return l;
  };

  it('the marker round-trips', () => {
    expect(markerIds(`x ${cleanupMarker(['C001', 'C012'])} y`)).toEqual(['C001', 'C012']);
    expect(markerIds('no marker')).toEqual([]);
  });

  it('merged → closed with the PR; open → in PR; closed unmerged → open again', () => {
    const l = list();
    const body = (...i: string[]): string => `## What changed\n${HARNESS_MARKER}\n${cleanupMarker(i)}`;
    expect(syncPrs(l, [pr(30, 'OPEN', body('C001', 'C002'))], 'owner', 'd2')).toEqual({ closed: 0, reopened: 0, inPr: 2 });
    expect(l.items.map((i) => [i.status, i.pr])).toEqual([['in-pr', 30], ['in-pr', 30], ['open', null]]);
    expect(syncPrs(l, [pr(30, 'MERGED', body('C001')), pr(31, 'CLOSED', body('C002'))], 'owner', 'd3')).toEqual({ closed: 1, reopened: 0, inPr: 0 });
    expect(syncPrs(l, [pr(30, 'CLOSED', body('C002'))], 'owner', 'd3')).toEqual({ closed: 0, reopened: 1, inPr: 0 });
    expect(l.items.map((i) => [i.id, i.status, i.pr, i.closedOn])).toEqual([['C001', 'closed', 30, 'd3'], ['C002', 'open', null, null], ['C003', 'open', null, null]]);
  });

  it('ignores PRs by other accounts, without the harness marker, or not labelled maintenance', () => {
    const l = list();
    const marked = `${HARNESS_MARKER}${cleanupMarker(['C001'])}`;
    syncPrs(l, [pr(40, 'MERGED', marked, 'wiz-bot'), pr(41, 'MERGED', cleanupMarker(['C001'])), pr(42, 'MERGED', marked, 'owner', ['daily'])], 'owner', 'd2');
    expect(l.items[0]!.status).toBe('open');
  });
});

describe("tonight's candidates", () => {
  it('ranks open items by worth and age; skips items touching open PR files; owner-only never eligible', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([
      finding({ worth: 'low', files: ['src/ui/a.ts'], claim: 'low worth item about alpha' }),
      finding({ worth: 'high', files: ['src/ui/b.ts'], claim: 'high worth item about beta' }),
      finding({ worth: 'high', files: ['src/ui/c.ts'], claim: 'high worth item about gamma touching an open PR' }),
      finding({ category: 'test-pins-internals', files: ['src/ui/finish-panel.ts', 'tests/ui/screens.test.ts'], claim: 'finish-panel.ts is dead code only tests import' }),
    ]), 'd1');
    l.items.push({ ...l.items[0]!, id: 'C099', status: 'stale' });
    const c = candidates(l, [{ number: 7, title: 'x', files: ['src/ui/c.ts', 'journal/runs/x/a.md'] }], 'd2');
    expect(c).toEqual({ eligible: ['C002', 'C001'], skipped: [{ id: 'C003', prs: [7] }], ownerOnly: ['C004'] });
    expect(l.items[2]!.history.at(-1)!.event).toBe('skipped: touches files of open PR #7');
    const md = renderCandidates(l, c);
    expect(md).toMatch(/## Eligible tonight \(2\), best first\n\n### C002 /);
    expect(md).toContain('- C003: touches files of open PR #7');
    expect(md).toContain('- C004: needs the owner');
  });

  it('rejections are noted on the item, which stays open', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), 'd1');
    recordRejections(l, [{ id: 'C001', reason: 'changes the HUD layout' }, { id: 'C404', reason: 'unknown' }], 'd2');
    expect(l.items[0]!.status).toBe('open');
    expect(l.items[0]!.history.at(-1)).toEqual({ date: 'd2', event: 'not chosen by the plan audit: changes the HUD layout' });
  });
});

describe('done items and persistence', () => {
  it('a live PR moves done items in-PR; a dry run only notes the branch', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding(), finding({ files: ['src/x.ts'], claim: 'other thing entirely unrelated' })]), 'd1');
    expect(markDone(l, ['C001'], 'd1', null, 'daily/d1')).toBe(1);
    expect(l.items[0]).toMatchObject({ status: 'open', pr: null });
    expect(l.items[0]!.history.at(-1)!.event).toContain('dry-run branch daily/d1');
    markDone(l, ['C002'], 'd1', 52, 'daily/d1');
    expect(l.items[1]).toMatchObject({ status: 'in-pr', pr: 52 });
  });

  it('saves atomically and loads back; a missing file is an empty list; a malformed one throws', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cleanup-'));
    const p = join(dir, 'cleanup.json');
    expect(loadList(p)).toEqual(emptyList());
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding()]), 'd1');
    saveList(p, l);
    expect(loadList(p)).toEqual(l);
    writeFileSync(p, '{"items": "nope"}');
    expect(() => loadList(p)).toThrow(/not a cleanup list/);
  });

  it('renders the list by status, owner-only items apart, closed ones last', () => {
    const l = emptyList();
    mergeSurvey(l, 'ui', survey([finding(), finding({ category: 'test-pins-internals', files: ['tests/ui/screens.test.ts'], claim: 'screens.test imports finish-panel internals' })]), 'd1');
    const md = renderList(l);
    expect(md.indexOf('## Open (1)')).toBeLessThan(md.indexOf('## Needs the owner (test pins internals) (1)'));
    expect(md).toContain('### C001 · ui · duplication · worth medium · ~20 lines');
    expect(md).toContain('## Closed: merged, do not report again (0)');
  });
});
