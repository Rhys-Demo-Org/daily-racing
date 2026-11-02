// A failed or aborted live maintenance night locks none of its cleanup items (harness/lib/cleanup.ts):
// only a night that passed moves them to in-PR; its draft PR is noted on them and they stay open,
// and an open draft PR read back from GitHub marks nothing in-PR (merging it still closes them).
import { describe, expect, it } from 'vitest';
import { cleanupMarker, emptyList, markDone, mergeSurvey, syncPrs, type CleanupList } from '../lib/cleanup.ts';
import { HARNESS_MARKER, type GhPr } from '../lib/existing.ts';

const list = (): CleanupList => {
  const l = emptyList();
  mergeSurvey(l, 'ui', { findings: [{ category: 'dead-code', files: ['src/ui/format.ts'], line: 1, claim: 'formatStub is exported but never imported', evidence: 'grep', suggestedFix: 'delete', worth: 'medium', estLines: 3 }], confirmations: [], dropped: [] }, '2026-11-08');
  return l;
};
const pr = (over: Partial<GhPr>): GhPr => ({ number: 9, state: 'OPEN', labels: [{ name: 'daily' }, { name: 'maintenance' }], author: { login: 'owner' }, body: `${HARNESS_MARKER}\n${cleanupMarker(['C001'])}`, ...over });

describe('cleanup items after a live maintenance night', () => {
  it('a night that passed puts them in its PR; a failed or aborted one only notes its draft', () => {
    const ok = list();
    expect(markDone(ok, ['C001'], '2026-11-08', 9, 'daily/2026-11-08', 'pass')).toBe(1);
    expect(ok.items[0]).toMatchObject({ status: 'in-pr', pr: 9 });
    for (const outcome of ['fail', 'abort']) {
      const l = list();
      expect(markDone(l, ['C001'], '2026-11-08', 9, 'daily/2026-11-08', outcome)).toBe(1);
      expect(l.items[0]).toMatchObject({ status: 'open', pr: null });
      expect(l.items[0]!.history.at(-1)!.event).toBe(`attempted in draft PR #9 (night ${outcome}); stays open`);
    }
  });

  it('an open draft PR marks nothing in-PR next week; a ready one does; merging the draft still closes', () => {
    const draft = list();
    expect(syncPrs(draft, [pr({ isDraft: true })], 'owner', '2026-11-15')).toEqual({ closed: 0, reopened: 0, inPr: 0 });
    expect(draft.items[0]!.status).toBe('open');
    const ready = list();
    expect(syncPrs(ready, [pr({ isDraft: false })], 'owner', '2026-11-15').inPr).toBe(1);
    const merged = list();
    expect(syncPrs(merged, [pr({ isDraft: true, state: 'MERGED' })], 'owner', '2026-11-15').closed).toBe(1);
  });
});
