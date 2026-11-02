// Gate M1 against the dodges (harness/lib/maintenance.ts checkLimits): screen stages are P1's
// fixtures and append-only like tests, src/ may not import from tests/ (moving code there would
// dodge the net src/ limit), and G8's rules keep existing tests append-only on maintenance nights too.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDiff } from '../lib/allowlist.ts';
import { buildResult, prBody } from '../lib/journal.ts';
import { METRICS_COLUMNS, metricsRow } from '../lib/metrics.ts';
import { checkLimits, srcTestImports } from '../lib/maintenance.ts';

const LIMITS = { maxFiles: 40, maxLines: 1500, maxNetSrc: 0 };
const diff = (rows: [status: string, path: string, added: number, deleted: number][]): { raw: string; numstat: string } => ({
  raw: rows.map(([st, p]) => `:${st === 'A' ? '000000' : '100644'} ${st === 'D' ? '000000' : '100644'} aaaa bbbb ${st}\0${p}\0`).join(''),
  numstat: rows.map(([, p, a, d]) => `${a}\t${d}\t${p}\0`).join(''),
});
const grep = (rows: [path: string, line: number, text: string][]): string => rows.map(([p, l, t]) => `HEAD:${p}\0${l}\0${t}`).join('\n') + '\n';

describe('gate M1: screen stages are fixtures', () => {
  it('fails an edited or deleted existing stage; a new one and other src edits pass M1', () => {
    const d = diff([['M', 'src/ui/stages/hud.stage.ts', 2, 2], ['D', 'src/ui/stages/old.stage.ts', 0, 9], ['A', 'src/ui/stages/new.stage.ts', 3, 0], ['M', 'src/ui/hud.ts', 0, 9]]);
    const r = checkLimits(d.raw, d.numstat, 'd', LIMITS);
    expect(r.problems).toEqual([
      'src/ui/stages/hud.stage.ts: existing screen stages are fixtures for P1 and append-only, like tests',
      'src/ui/stages/old.stage.ts: existing screen stages are fixtures for P1 and append-only, like tests',
    ]);
  });
});

describe('gate M1: src/ may not import from tests/', () => {
  it('finds relative, rooted and dynamic references into tests/, and nothing else', () => {
    const g = grep([
      ['src/ui/hud.ts', 3, "import { pad } from '../../tests/helpers/pad.ts';"],
      ['src/sim/a.ts', 9, 'const m = await import("/tests/x.ts");'],
      ['src/ui/hud.css', 1, "@import '../../tests/ui/hud.css';"],
      ['src/content/glob.ts', 2, "const all = import.meta.glob('../../tests/**/*.ts');"],
      ['src/ui/copy.ts', 4, "export const label = 'Run the tests/ again';"], // a string, not a path into tests/
      ['src/ui/tests/local.ts', 1, "import x from './tests/y.ts';"], // src/ui/tests/tests/y.ts: still src/
      ['tests/ui/a.test.ts', 1, "import '../../tests/x.ts';"], // not under src/
    ]);
    expect(srcTestImports(g)).toEqual([
      'src/ui/hud.ts:3: src/ may not import from tests/ (../../tests/helpers/pad.ts)',
      'src/sim/a.ts:9: src/ may not import from tests/ (/tests/x.ts)',
      'src/ui/hud.css:1: src/ may not import from tests/ (../../tests/ui/hud.css)',
      'src/content/glob.ts:2: src/ may not import from tests/ (../../tests/**/*.ts)',
    ]);
  });

  it('fails M1 when moved code is imported back from tests/', () => {
    const d = diff([['M', 'src/ui/hud.ts', 1, 40], ['A', 'tests/helpers/pad.ts', 40, 0]]);
    const r = checkLimits(d.raw, d.numstat, 'd', LIMITS, grep([['src/ui/hud.ts', 3, "import { pad } from '../../tests/helpers/pad.ts';"]]));
    expect(r.pass).toBe(false);
    expect(r.problems).toEqual(['src/ui/hud.ts:3: src/ may not import from tests/ (../../tests/helpers/pad.ts)']);
    expect(checkLimits(d.raw, d.numstat, 'd', LIMITS, '').pass).toBe(true);
  });
});

describe('G8 and publish: tests append-only on maintenance nights too', () => {
  it('an edited or deleted existing test breaks the allowlist whatever the maintenance flag', () => {
    const d = diff([['M', 'tests/ui/screens.test.ts', 1, 1], ['D', 'tests/ui/old.test.ts', 0, 5], ['A', 'tests/ui/new.test.ts', 9, 0], ['M', 'CLAUDE.md', 1, 1]]);
    expect(checkDiff(d.raw, d.numstat, { today: 'd', maintenance: true })).toEqual([
      'tests/ui/screens.test.ts: existing tests are append-only (no edits, maintenance nights included)',
      'tests/ui/old.test.ts: existing tests may not be deleted',
    ]);
  });
});

describe("the journal reads M1's numbers from HEAD's gate run", () => {
  it('a fix reverted after failing its gates never reports its limits', () => {
    const dir = mkdtempSync(join(tmpdir(), 'm1-head-'));
    const put = (f: string, v: unknown): void => writeFileSync(join(dir, f), JSON.stringify(v));
    const lim = (netSrc: number, files: number) => ({ pass: netSrc <= 0, files, lines: 40, srcAdded: 5, srcDeleted: 5 - netSrc, netSrc, problems: [] });
    const m1 = (l: ReturnType<typeof lim>) => ({ id: 'M1', name: 'Maintenance limits', pass: l.pass, durationMs: 0, summary: 's', details: '', limits: l });
    put('meta.json', { date: '2026-11-08', dryRun: false, ideaType: 'maintenance', startedAt: 1000, endedAt: 1600, hardDeadlineAt: 20000, headGateRun: 1 });
    put('maintenance.json', { chosen: [{ id: 'C001', category: 'dead-code', files: ['src/a.ts'], claim: 'c', why: 'w' }] });
    put('gates-1.json', { pass: true, gates: [{ id: 'G1', pass: true }, m1(lim(-7, 2))] });
    put('gates-2.json', { pass: false, gates: [{ id: 'G1', pass: true }, m1(lim(12, 9))] }); // the reverted fix
    const r = buildResult(dir, 'pass', null);
    expect((r.maintenance as { limits: { netSrc: number; files: number } }).limits).toMatchObject({ netSrc: -7, files: 2 });
    put('result.json', r);
    expect(prBody(dir, 'Europe/London', 'https://p')).toContain('**−7** (src/: +5 −12) · 2 files');
    const row = Object.fromEntries(METRICS_COLUMNS.map((c, i) => [c, metricsRow(dir).split(',')[i]]));
    expect(row).toMatchObject({ netSrcLines: '-7', changedFiles: '2' });
    rmSync(dir, { recursive: true, force: true });
  });
});
