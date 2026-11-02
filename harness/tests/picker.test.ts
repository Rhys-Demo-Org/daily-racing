import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chooseWork, parseBacklog, prState, type BacklogItem } from '../lib/picker.ts';

const md = `# Backlog

Format:
- \`## <ID> · <Title>\` heading
- \`depends_on:\` list

## B01 · First thing
depends_on: none
scope: Build the first thing,
over two lines.
done_when: it works.

## B02 · Second
depends_on: B01
scope: More.
done_when: still works;
and more.

## B03 · Third
depends_on: none
scope: Other.
done_when: fine.
`;

const ids = (w: ReturnType<typeof chooseWork>): string | undefined => (w.kind === 'backlog' ? w.item.id : w.kind);

describe('parseBacklog', () => {
  it('parses headings, dependencies and multi-line fields', () => {
    const items = parseBacklog(md);
    expect(items.map((i) => [i.id, i.title, i.dependsOn])).toEqual([['B01', 'First thing', []], ['B02', 'Second', ['B01']], ['B03', 'Third', []]]);
    expect(items[0]!.scope).toBe('Build the first thing, over two lines.');
    expect(items[1]!.doneWhen).toBe('still works; and more.');
    expect(items[0]!.text).toMatch(/^## B01 · First thing\ndepends_on: none/);
  });

  it('parses the real BACKLOG.md', () => {
    const items = parseBacklog(readFileSync('guardrails/BACKLOG.md', 'utf8'));
    expect(items.length).toBeGreaterThanOrEqual(12);
    expect(items.find((i) => i.id === 'B11')!.dependsOn).toEqual(['B08', 'B10']);
    expect(items.every((i) => i.scope && i.doneWhen)).toBe(true);
  });

  it('rejects malformed entries', () => {
    expect(() => parseBacklog('## X1 · Bad\ndepends_on: none\nscope: a\ndone_when: b\n')).toThrow(/heading/);
    expect(() => parseBacklog('## B01 · A\nscope: a\ndone_when: b\n')).toThrow(/depends_on/);
    expect(() => parseBacklog('## B01 · A\ndepends_on: B09\nscope: a\ndone_when: b\n')).toThrow(/unknown B09/);
    expect(() => parseBacklog('## B01 · A\ndepends_on: none\nscope: a\ndone_when: b\n## B01 · A\ndepends_on: none\nscope: a\ndone_when: b\n')).toThrow(/duplicate/);
  });
});

describe('chooseWork', () => {
  const items: BacklogItem[] = parseBacklog(md);
  const none = new Set<string>();

  it('makes Sunday a maintenance day without touching the ledger', () => {
    expect(chooseWork(true, items, none, ['B01'])).toEqual({ kind: 'maintenance' });
  });

  it('rotates through unblocked items with the dry-run ledger, then starts over', () => {
    const a = chooseWork(false, items, none, []);
    expect(a).toMatchObject({ kind: 'backlog', tried: ['B01'] });
    const b = chooseWork(false, items, none, a.kind === 'backlog' ? a.tried : []);
    expect(b).toMatchObject({ kind: 'backlog', item: { id: 'B03' }, tried: ['B01', 'B03'] });
    // B02 depends on unmerged B01, so it is never picked; the cycle restarts.
    expect(chooseWork(false, items, none, ['B01', 'B03'])).toMatchObject({ item: { id: 'B01' }, tried: ['B01'] });
  });

  it('picks an item once every dependency is merged, and skips merged items', () => {
    expect(ids(chooseWork(false, items, new Set(['B01']), []))).toBe('B02');
    expect(ids(chooseWork(false, items, new Set(['B01', 'B02']), []))).toBe('B03');
  });

  it('reports blocked when every open item waits on unmerged deps', () => {
    const blocked = parseBacklog('## B01 · A\ndepends_on: B02\nscope: a\ndone_when: b\n## B02 · B\ndepends_on: B01\nscope: a\ndone_when: b\n');
    expect(chooseWork(false, blocked, none, []).kind).toBe('blocked');
  });

  it('returns phase 2 only when every item is merged', () => {
    expect(chooseWork(false, items, new Set(['B01', 'B02', 'B03']), []).kind).toBe('phase2');
    expect(chooseWork(false, items, new Set(['B01', 'B02']), []).kind).not.toBe('phase2');
  });
});

describe('live runs (daily PRs as state)', () => {
  const items: BacklogItem[] = parseBacklog(md);
  const pr = (state: string, ...labels: string[]) => ({ state, labels: labels.map((name) => ({ name })) });

  it('merged PRs are done; open and closed-unmerged PRs are tried', () => {
    const s = prState([pr('MERGED', 'daily', 'backlog:B01'), pr('OPEN', 'backlog:B03'), pr('CLOSED', 'failed', 'backlog:B02'), pr('OPEN', 'daily')]);
    expect([...s.merged]).toEqual(['B01']);
    expect(s.tried.sort()).toEqual(['B02', 'B03']);
  });

  it('an item merged after an earlier failed PR counts as merged only', () => {
    expect(prState([pr('CLOSED', 'backlog:B01'), pr('MERGED', 'backlog:B01')])).toEqual({ merged: new Set(['B01']), tried: [] });
  });

  it('never rotates back to a tried item', () => {
    expect(ids(chooseWork(false, items, new Set(), ['B01'], false))).toBe('B03');
    expect(chooseWork(false, items, new Set(), ['B01', 'B03'], false).kind).toBe('blocked');
  });
});
