import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkAudit, renderAudit, reviseBrief } from '../lib/audit.ts';
import { internalsLint, renderSpec, validateSpec } from '../lib/spec.ts';

const audit = (o: Record<string, unknown> = {}) => ({
  verdict: 'approve', summary: 'Fine as written.', findings: [], overlapAssessment: null, waitsOn: null, designRequest: null, backlogChangeRequests: [], ...o,
});

describe('plan audit', () => {
  it('passes a clean verdict through', () => {
    expect(checkAudit(audit(), 0)).toMatchObject({ verdict: 'approve', summary: 'Fine as written.' });
    expect(checkAudit(audit({ verdict: 'defer', waitsOn: '#11' }), 1)).toMatchObject({ verdict: 'defer', waitsOn: '#11' });
  });

  it('defers an approve that ignores file overlap with open PRs', () => {
    const a = checkAudit(audit(), 2);
    expect(a.verdict).toBe('defer');
    expect(a.harnessOverride).toMatch(/overlap with 2 open PR/);
    expect(checkAudit(audit({ overlapAssessment: 'Both add one line to the screen list; no conflict.' }), 2).verdict).toBe('approve');
  });

  it('turns an approve with a blocker finding into a revise', () => {
    const a = checkAudit(audit({ findings: [{ check: 'testability', severity: 'blocker', claim: 'AC2 names createBot()', suggestedFix: 'Use RaceView.' }] }), 0);
    expect(a.verdict).toBe('revise');
  });

  it('rejects unusable output', () => {
    for (const bad of [null, 'approve', {}, audit({ verdict: 'maybe' }), audit({ summary: '' })]) {
      expect(checkAudit(bad, 0)).toMatchObject({ verdict: 'reject', harnessOverride: 'invalid audit output' });
    }
  });

  it('renders the audit for the locked spec and briefs a fresh ideate on revise', () => {
    const a = checkAudit(audit({ verdict: 'revise', summary: 'AC2 names internals.', findings: [{ check: 'testability', severity: 'major', claim: 'AC2 names createBot().', suggestedFix: 'Assert on RaceView.' }],
      backlogChangeRequests: ['B03 should depend on B02'] }), 0);
    const md = renderAudit(a, 2);
    expect(md).toContain('## Plan audit');
    expect(md).toContain('Verdict: **revise** (round 2)');
    expect(md).toContain('- major · testability: AC2 names createBot(). Fix: Assert on RaceView.');
    expect(md).toContain('- B03 should depend on B02');
    expect(reviseBrief(a)).toMatch(/^## Plan audit asked for a revision/);
    expect(reviseBrief(a)).toContain('AC2 names createBot().');
  });

  it('the audit schema declares no $schema draft and requires the harness-checked fields', () => {
    const schema = JSON.parse(readFileSync(new URL('../schemas/audit.json', import.meta.url), 'utf8')) as { required: string[] };
    expect(schema).not.toHaveProperty('$schema');
    expect(schema.required).toEqual(expect.arrayContaining(['verdict', 'overlapAssessment', 'waitsOn', 'designRequest']));
  });
});

describe('spec: plans/full-pipeline.md fields', () => {
  const draft = {
    backlogId: 'B05', title: 'Desktop HUD', summary: 'Desktop sizes and a keycap legend.',
    acceptanceCriteria: [{ id: 'AC1', text: 'At 1440×900 the HUD has no touch controls.' }], closestExisting: [],
    expectedFiles: ['src/ui/hud.ts', 'tests/ui/desktop-hud.test.ts'], supersedes: ['src/ui/old-legend.ts'],
    playtest: { whatYoullSee: 'On a laptop the HUD is bigger and a keycap legend shows on lap 1.', howToTest: ['Open the preview on a laptop.', 'Start a race and check the legend.'] },
  };

  it('every schema requires the new fields', () => {
    const schema = JSON.parse(readFileSync(new URL('../schemas/spec.json', import.meta.url), 'utf8')) as { required: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(['expectedFiles', 'supersedes', 'playtest']));
  });

  it('validates and renders expectedFiles, supersedes and the play-test', () => {
    const s = validateSpec(draft, 'backlog', 'B05');
    expect(s.expectedFiles).toEqual(draft.expectedFiles);
    const md = renderSpec(s, '2026-11-03', 'backlog');
    expect(md).toContain("## What you'll see\n\nOn a laptop the HUD is bigger");
    expect(md).toContain('## How to play-test\n\n1. Open the preview on a laptop.\n2. Start a race and check the legend.');
    expect(md).toContain('## Expected files\n\n- `src/ui/hud.ts`');
    expect(md).toContain('## Supersedes\n\nRetired and deleted by this feature:\n\n- `src/ui/old-legend.ts`');
  });

  it('rejects paths outside src/ and tests/, and an empty play-test', () => {
    expect(() => validateSpec({ ...draft, expectedFiles: ['harness/daily.sh'] }, 'backlog', 'B05')).toThrow(/expectedFiles/);
    expect(() => validateSpec({ ...draft, expectedFiles: ['src/../harness/x.ts'] }, 'backlog', 'B05')).toThrow(/expectedFiles/);
    expect(() => validateSpec({ ...draft, supersedes: ['tests/a.test.ts'] }, 'backlog', 'B05')).toThrow(/supersedes/);
    expect(() => validateSpec({ ...draft, playtest: { whatYoullSee: 'x', howToTest: [] } }, 'backlog', 'B05')).toThrow(/howToTest/);
  });

  it('lints criteria that name internals, not public seams', () => {
    const acs = (...texts: string[]) => ({ acceptanceCriteria: texts.map((text, i) => ({ id: `AC${i + 1}`, text })) });
    expect(internalsLint(acs(
      'Pressing Esc shows a dialog named "Paused".',
      'window.__racer.start(1) then RaceView.paused is true.',
      'createBot(world, 2) returns a bot.',
      'src/ui/pause-menu.ts exports PauseMenu.',
      'The HUD calls this.updateTimer() once per frame.',
    ))).toEqual([
      'AC3 names internals: createBot',
      'AC4 names internals: src/ui/pause-menu.ts',
      'AC5 names internals: this.updateTimer',
    ]);
  });
});

describe('supersedes until the G1/G9 test-deletion exception exists', () => {
  const prompt = (f: string): string => readFileSync(new URL(`../prompts/${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  it('ideate, the plan audit and the builder never retire a module an existing test imports', () => {
    expect(prompt('ideate.md')).toMatch(/Never list a module that an existing test imports/);
    expect(prompt('plan-audit.md')).toMatch(/If any test imports one, the verdict is `revise`/);
    expect(prompt('build.md')).toMatch(/if an existing test imports a listed module, leave that module in place/);
  });
});
