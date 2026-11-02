// The reviewers' optional `checked` list (schemas/findings.json): counted per reviewer into
// review.json, result.json, the report and metrics.csv, so "0 findings" can be audited.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildResult, report, reviewSummary } from '../lib/journal.ts';
import { METRICS_COLUMNS, metricsRow } from '../lib/metrics.ts';
import { readChecked } from '../lib/review.ts';

const schema = JSON.parse(readFileSync(new URL('../schemas/findings.json', import.meta.url), 'utf8')) as { required: string[]; properties: Record<string, { items?: { required?: string[] } }> };

describe('reviewer checked list', () => {
  it('is optional in the schema, with target and how', () => {
    expect(schema.required).toEqual(['findings']);
    expect(schema.properties.checked!.items!.required).toEqual(['target', 'how']);
  });

  it('is counted per reviewer and reaches result.json, the report and metrics', () => {
    const dir = mkdtempSync(join(tmpdir(), 'checked-'));
    const p = join(dir, 'r.json');
    writeFileSync(p, JSON.stringify({ structured_output: { findings: [], checked: [{ target: 'C001', how: 'grep formatStub: no users left' }, { target: 'C002', how: 'traced G2 runs it' }, { target: '', how: 'x' }] } }));
    expect(readChecked(p)).toBe(2);
    writeFileSync(p, JSON.stringify({ structured_output: { findings: [] } }));
    expect(readChecked(p)).toBe(0);
    expect(readChecked(join(dir, 'missing.json'))).toBeNull();

    const state = { reviewers: { R1: 'ok', R3: 'ok' }, findings: [], rulings: [], fixes: [], notes: [], checked: { R1: 4, R3: 0 } };
    expect(reviewSummary(state)).toMatchObject({ checked: { R1: 4, R3: 0 } });
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({ date: '2026-11-08', startedAt: 1, endedAt: 2, hardDeadlineAt: 3 }));
    writeFileSync(join(dir, 'review.json'), JSON.stringify(state));
    mkdirSync(join(dir, 'phases'));
    writeFileSync(join(dir, 'result.json'), JSON.stringify(buildResult(dir, 'pass', null)));
    expect(report(dir, 'Europe/London')).toContain('; checked R1 4, R3 0');
    const row = Object.fromEntries(METRICS_COLUMNS.map((c, i) => [c, metricsRow(dir).split(',')[i]]));
    expect(row).toMatchObject({ checkedR1: '4', checkedR3: '0', checkedR2: '' });
  });
});
