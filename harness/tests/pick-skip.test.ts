// cli.ts pick --skip: items the plan audit deferred or rejected tonight are passed over.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const cli = new URL('../lib/cli.ts', import.meta.url).pathname;
const backlog = `# Backlog

## B01 · One
depends_on: none
scope: a.
done_when: a.

## B02 · Two
depends_on: B01
scope: b.
done_when: b.

## B03 · Three
depends_on: none
scope: c.
done_when: c.
`;
let dir = '';
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pick-'));
  writeFileSync(join(dir, 'BACKLOG.md'), backlog);
  writeFileSync(join(dir, 'meta.json'), '{}');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const pick = (...extra: string[]): Record<string, string> => {
  const r = spawnSync('node', [cli, 'pick', '0', join(dir, 'BACKLOG.md'), join(dir, 'ledger.json'), join(dir, 'item.md'), join(dir, 'meta.json'), ...extra], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return Object.fromEntries(r.stdout.trim().split('\n').map((l) => { const [k, ...v] = l.split('='); return [k!, v.join('=').replace(/^'|'$/g, '')]; }));
};

describe('pick --skip', () => {
  it('live: passes over skipped items and never falls back to one with a PR', () => {
    writeFileSync(join(dir, 'prs.json'), JSON.stringify([{ state: 'OPEN', labels: [{ name: 'backlog:B03' }] }]));
    expect(pick(join(dir, 'prs.json'))).toMatchObject({ KIND: 'backlog', ITEM_ID: 'B01' });
    expect(pick(join(dir, 'prs.json'), '--skip=B01')).toMatchObject({ KIND: 'blocked' });
    expect(readFileSync(join(dir, 'item.md'), 'utf8')).toMatch(/^## B01/);
  });

  it('dry run: the next unblocked item, and the ledger keeps the skipped one', () => {
    expect(pick()).toMatchObject({ ITEM_ID: 'B01' });
    expect(pick('--skip=B01')).toMatchObject({ ITEM_ID: 'B03' });
    expect(JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8'))).toEqual({ tried: ['B01', 'B03'] });
    expect(JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))).toMatchObject({ backlogId: 'B03' });
  });
});
