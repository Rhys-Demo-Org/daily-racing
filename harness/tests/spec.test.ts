import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractSpec, lockSpec, renderSpec, validateSpec } from '../lib/spec.ts';

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
  it('the schema declares no $schema draft (Claude Code 2.1.304 rejects 2020-12 and the call fails)', () => {
    const schema = JSON.parse(readFileSync(new URL('../schemas/spec.json', import.meta.url), 'utf8')) as object;
    expect(schema).not.toHaveProperty('$schema');
  });

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

  it('locks the file read-only, hashes it and never overwrites', () => {
    dir = mkdtempSync(join(tmpdir(), 'spec-'));
    const path = join(dir, 'spec.md');
    expect(lockSpec(path, '# spec\n')).toBe(createHash('sha256').update('# spec\n').digest('hex'));
    expect(statSync(path).mode & 0o222).toBe(0);
    expect(() => lockSpec(path, 'again')).toThrow(/exists/);
  });
});
