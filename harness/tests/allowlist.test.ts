// Gate 8's allowlist rules (harness/lib/allowlist.ts): what a nightly branch may change.
import { describe, expect, it } from 'vitest';
import { checkDiff, isProtected, parseRaw, violation, type Change } from '../lib/allowlist.ts';

const day = { today: '2026-10-29', maintenance: false };
const sunday = { today: '2026-11-01', maintenance: true };
const change = (status: string, path: string, extra: Partial<Change> = {}): Change => ({
  status,
  path,
  oldMode: status === 'A' ? '000000' : '100644',
  newMode: status === 'D' ? '000000' : '100644',
  binary: false,
  ...extra,
});
const ok = (c: Change, rules = day): boolean => violation(c, rules) === null;

describe('allowlist', () => {
  it('allows any add, edit or delete in src/ except src/driver/', () => {
    for (const s of ['A', 'M', 'D']) expect(ok(change(s, 'src/sim/car.ts'))).toBe(true);
    for (const s of ['A', 'M', 'D']) expect(ok(change(s, 'src/driver/index.ts'))).toBe(false);
  });

  it('tests are append-only; edits only on maintenance days; baselines never', () => {
    expect(ok(change('A', 'tests/sim/new.test.ts'))).toBe(true);
    expect(ok(change('M', 'tests/sim/car.test.ts'))).toBe(false);
    expect(ok(change('M', 'tests/sim/car.test.ts'), sunday)).toBe(true);
    expect(ok(change('D', 'tests/sim/car.test.ts'), sunday)).toBe(false);
    for (const s of ['A', 'M', 'D']) expect(violation(change(s, 'tests/baselines/bot-laps.json'), sunday)).toMatch(/harness only/);
  });

  it("journal changes only under today's run folder", () => {
    expect(ok(change('A', 'journal/runs/2026-10-29/spec.md'))).toBe(true);
    expect(violation(change('A', 'journal/runs/2026-10-28/spec.md'), day)).toMatch(/limited to journal\/runs\/2026-10-29/);
    expect(ok(change('M', 'journal/fun.csv'))).toBe(false);
  });

  it('root CLAUDE.md only on maintenance days; control files never, at any depth', () => {
    expect(ok(change('M', 'CLAUDE.md'))).toBe(false);
    expect(ok(change('M', 'CLAUDE.md'), sunday)).toBe(true);
    for (const p of ['src/CLAUDE.md', 'src/.gitattributes', 'tests/.mcp.json', 'src/.claude/settings.json', '.gitmodules']) {
      expect(ok(change('A', p), sunday)).toBe(false);
    }
  });

  it('protects everything else: configs, harness, guardrails, public, root files', () => {
    for (const p of ['package.json', 'pnpm-lock.yaml', 'vite.config.ts', 'harness/daily.sh', 'guardrails/budgets.json', 'public/x.css', '.npmrc', 'index.html', 'README.md']) {
      expect(violation(change('M', p), sunday)).toBe('protected path');
    }
  });

  it('fails symlinks, submodules, executables, mode and type changes, binaries and asset files', () => {
    expect(ok(change('A', 'src/link.ts', { newMode: '120000' }))).toBe(false);
    expect(ok(change('A', 'src/sub', { newMode: '160000' }))).toBe(false);
    expect(ok(change('A', 'src/run.ts', { newMode: '100755' }))).toBe(false);
    expect(ok(change('M', 'src/run.ts', { oldMode: '100755' }))).toBe(false);
    expect(ok(change('T', 'src/a.ts'))).toBe(false);
    expect(ok(change('A', 'src/blob.ts', { binary: true }))).toBe(false);
    expect(ok(change('A', 'src/ui/icon.svg'))).toBe(false);
    expect(ok(change('D', 'src/ui/old.png'))).toBe(true);
  });

  it('isProtected covers what the manifest must hash', () => {
    for (const p of ['package.json', 'guardrails/gates/g2-verdict.ts', 'tests/baselines/bot-laps.json', 'src/driver/index.ts', 'harness/daily.sh']) {
      expect(isProtected(p)).toBe(true);
    }
    for (const p of ['src/sim/car.ts', 'tests/sim/car.test.ts', 'journal/runs/x/a.md', 'CLAUDE.md', 'guardrails/manifest.json']) {
      expect(isProtected(p)).toBe(false);
    }
  });
});

describe('git diff parsing', () => {
  const raw =
    ':000000 100644 0000000 1111111 A\0src/a.ts\0' +
    ':100644 120000 2222222 3333333 T\0src/b.ts\0' +
    ':100644 100644 4444444 5555555 M\0harness/x.sh\0';
  const numstat = '3\t0\tsrc/a.ts\0-\t-\tsrc/b.ts\0' + '1\t1\tharness/x.sh\0';

  it('parses raw entries', () => {
    expect(parseRaw(raw).map((c) => `${c.status} ${c.newMode} ${c.path}`)).toEqual(['A 100644 src/a.ts', 'T 120000 src/b.ts', 'M 100644 harness/x.sh']);
    expect(parseRaw('')).toEqual([]);
    expect(() => parseRaw('garbage\0x\0')).toThrow(/unparseable/);
  });

  it('reports one line per disallowed change', () => {
    expect(checkDiff(raw, numstat, day)).toEqual([
      'src/b.ts: status T (type changes, renames, copies are not allowed)',
      'harness/x.sh: protected path',
    ]);
  });

  it('marks numstat "-" entries binary', () => {
    expect(checkDiff(':000000 100644 0 1 A\0src/x.ts\0', '-\t-\tsrc/x.ts\0', day)).toEqual(['src/x.ts: binary, image, font or model file']);
  });
});
