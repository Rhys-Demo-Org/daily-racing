// Owner decision 2026-11-03: Sundays may grow src/ by up to MAINT_MAX_NET_SRC_LINES (150) for
// performance items. Gate M1 enforces the cap; the prompts carry "performance items only".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkLimits } from '../lib/maintenance.ts';

const LIMITS = { maxFiles: 40, maxLines: 1500, maxNetSrc: 150 };
const diff = (rows: [status: string, path: string, added: number, deleted: number][]): { raw: string; numstat: string } => ({
  raw: rows.map(([st, p]) => `:${st === 'A' ? '000000' : '100644'} ${st === 'D' ? '000000' : '100644'} aaaa bbbb ${st}\0${p}\0`).join(''),
  numstat: rows.map(([, p, a, d]) => `${a}\t${d}\t${p}\0`).join(''),
});

describe('gate M1: net src growth cap', () => {
  it('config.env allows 150 net src lines', () => {
    expect(readFileSync(new URL('../config.env', import.meta.url), 'utf8')).toMatch(/^MAINT_MAX_NET_SRC_LINES=150$/m);
  });

  it('passes growth up to the cap and fails one line over, naming the cap', () => {
    const at = diff([['M', 'src/render/pool.ts', 170, 20]]);
    expect(checkLimits(at.raw, at.numstat, 'd', LIMITS)).toMatchObject({ pass: true, netSrc: 150, problems: [] });
    const over = diff([['M', 'src/render/pool.ts', 171, 20]]);
    expect(checkLimits(over.raw, over.numstat, 'd', LIMITS).problems).toEqual(['net src/ lines grew by 151 (+171 −20); a maintenance night may grow src/ by at most 150']);
  });
});
