// The open-PR file list (harness/lib/existing.ts openFiles) behind the feature-night overlap check
// and the maintenance-night skip: the daily PRs and every other open PR of the owner's, by exact login.
import { describe, expect, it } from 'vitest';
import { fileOverlap, openFiles, type GhPr } from '../lib/existing.ts';

const pr = (number: number, over: Partial<GhPr>): GhPr => ({ number, title: `PR ${number}`, state: 'OPEN', labels: [], author: { login: 'owner' }, files: [{ path: `src/f${number}.ts` }], ...over });

describe('open files', () => {
  it("daily PRs (any author) plus the owner's other open PRs, once each", () => {
    const daily = [pr(1, { labels: [{ name: 'daily' }] }), pr(2, { labels: [{ name: 'daily' }], author: { login: 'bot' } }), pr(3, { labels: [{ name: 'daily' }], state: 'MERGED' })];
    const mine = [pr(1, { labels: [{ name: 'daily' }] }), pr(4, { title: 'harness: M1b' }), pr(5, { author: { login: 'owner-impostor' } }), pr(6, { state: 'CLOSED' })];
    expect(openFiles(daily, 'owner', mine)).toEqual([
      { number: 1, title: 'PR 1', files: ['src/f1.ts'] },
      { number: 2, title: '(PR by another account)', files: ['src/f2.ts'] },
      { number: 4, title: 'harness: M1b', files: ['src/f4.ts'] },
    ]);
    expect(openFiles(daily, 'owner')).toHaveLength(2);
    expect(fileOverlap(['src/f4.ts'], openFiles(daily, 'owner', mine))).toEqual([{ number: 4, title: 'harness: M1b', files: ['src/f4.ts'] }]);
  });
});
