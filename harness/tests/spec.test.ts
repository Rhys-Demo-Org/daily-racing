import { chmodSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractSpec, lockSpec, renderSpec, sha256, validateSpec, verifySpec } from '../lib/spec.ts';

const good = {
  backlogId: 'B01',
  title: 'Pause screen',
  summary: 'Pause button and Esc freeze the race.',
  acceptanceCriteria: [{ id: 'AC1', text: 'Esc pauses the sim.' }, { id: 'AC2', text: 'Resume continues identically.' }],
  closestExisting: [],
};

let dir = '';
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); dir = ''; });

describe('spec', () => {
  it('extracts structured output, or JSON in result', () => {
    expect(extractSpec({ structured_output: good })).toEqual(good);
    expect(extractSpec({ result: JSON.stringify(good) })).toEqual(good);
    expect(() => extractSpec({ result: 'I could not do it' })).toThrow();
    expect(() => extractSpec(null)).toThrow();
  });

  it('validates against tonight\'s mode and backlog ID', () => {
    expect(validateSpec(good, 'backlog', 'B01').acceptanceCriteria).toHaveLength(2);
    expect(() => validateSpec(good, 'backlog', 'B02')).toThrow(/backlogId/);
    expect(() => validateSpec({ ...good, acceptanceCriteria: [] }, 'backlog', 'B01')).toThrow(/acceptance/);
    expect(() => validateSpec({ ...good, acceptanceCriteria: [{ id: 'AC2', text: 'x' }] }, 'backlog', 'B01')).toThrow(/AC1/);
    expect(() => validateSpec({ ...good, title: ' ' }, 'backlog', 'B01')).toThrow(/title/);
    expect(validateSpec({ ...good, backlogId: null, acceptanceCriteria: [] }, 'maintenance', null).acceptanceCriteria).toEqual([]);
    expect(() => validateSpec({ ...good, backlogId: null }, 'invent', null)).toThrow(/3 closest/);
  });

  it('renders AC lines the gates can parse', () => {
    const md = renderSpec(validateSpec(good, 'backlog', 'B01'), '2026-11-02', 'backlog');
    expect(md).toMatch(/^# B01 · Pause screen\n/);
    expect(md).toContain('- **AC1**: Esc pauses the sim.\n- **AC2**: Resume continues identically.');
    expect(renderSpec({ ...good, backlogId: null, acceptanceCriteria: [] }, '2026-11-01', 'maintenance')).toMatch(/^# Maintenance · /);
  });

  it('locks the file read-only, hashes it and detects tampering', () => {
    dir = mkdtempSync(join(tmpdir(), 'spec-'));
    const path = join(dir, 'spec.md');
    const sha = lockSpec(path, '# spec\n');
    expect(sha).toBe(sha256('# spec\n'));
    expect(statSync(path).mode & 0o222).toBe(0);
    expect(verifySpec(path, sha)).toBe(true);
    expect(() => lockSpec(path, 'again')).toThrow(/exists/);
    chmodSync(path, 0o644);
    writeFileSync(path, '# spec\nAC9: free pass\n');
    expect(verifySpec(path, sha)).toBe(false);
    expect(verifySpec(join(dir, 'missing.md'), sha)).toBe(false);
  });
});
