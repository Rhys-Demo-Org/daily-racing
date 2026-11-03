// The Sunday maintenance night (plans/full-pipeline.md "The 7th day"), past the survey: the plan
// audit's choice of cleanup items checked by the harness, the locked maintenance spec, the size
// limits (gate M1, added to every maintenance gate run so per-fix gating enforces them too) and the
// refactor agent's per-item report.

import { posix } from 'node:path';
import { checkDiff, parseNumstat, parseRaw } from './allowlist.ts';
import { itemBlock, oneLine, type Candidates, type CleanupItem, type CleanupList, type syncPrs } from './cleanup.ts';
import type { Playtest } from './spec.ts';
import { structuredOutput, trimmed } from './spec.ts';

export type Choice = { id: string; why: string };
export type MaintAudit = { title: string; summary: string; chosen: Choice[]; rejected: { id: string; reason: string }[]; playtest: Playtest; notes: string[] };

/**
 * The plan audit's output (schemas/maint-audit.json) held to the harness rules: only eligible items
 * may be chosen (an owner-only, skipped or unknown id is dropped with a note), each at most once, at
 * most `max` of them; rejections count only for eligible items not chosen. Null when unusable.
 */
export function checkMaintAudit(raw: unknown, eligible: readonly string[], max: number): MaintAudit | null {
  const a = raw as Record<string, unknown> | null;
  if (!a || typeof a !== 'object' || !Array.isArray(a.chosen) || !trimmed(a.summary) || !trimmed(a.title)) return null;
  const notes: string[] = [];
  const chosen: Choice[] = [];
  for (const c of a.chosen as Record<string, unknown>[]) {
    const id = trimmed(c?.id);
    if (!eligible.includes(id)) { notes.push(`${id || '(no id)'} is not eligible tonight; ignored`); continue; }
    if (chosen.some((x) => x.id === id)) continue;
    if (chosen.length >= max) { notes.push(`${id} is over the ${max}-item limit; left for next week`); continue; }
    chosen.push({ id, why: trimmed(c.why) });
  }
  const rejected = (Array.isArray(a.rejected) ? a.rejected as Record<string, unknown>[] : []).flatMap((r) => {
    const id = trimmed(r?.id);
    return eligible.includes(id) && !chosen.some((x) => x.id === id) ? [{ id, reason: trimmed(r.reason) || 'no reason given' }] : [];
  });
  const p = (a.playtest ?? {}) as { whatYoullSee?: unknown; howToTest?: unknown };
  const steps = Array.isArray(p.howToTest) ? p.howToTest.map(trimmed).filter(Boolean) : [];
  const playtest: Playtest = {
    whatYoullSee: trimmed(p.whatYoullSee) || 'Nothing should look or feel different.',
    howToTest: steps.length ? steps : ['Play a full race on the preview and check that nothing looks or feels different from production.'],
  };
  return { title: trimmed(a.title), summary: trimmed(a.summary), chosen, rejected, playtest, notes };
}

export type Limits = { maxFiles: number; maxLines: number; maxNetSrc: number };

/** spec.md for a maintenance night: the chosen items in full, the play-test, the limits and the audit. */
export function renderMaintSpec(a: MaintAudit, list: CleanupList, date: string, limits: Limits, skipped: string[]): string {
  const item = (id: string): CleanupItem => list.items.find((x) => x.id === id)!;
  const lines = [`# Maintenance · ${a.title}`, '', `Date: ${date} · mode: maintenance · backlog: none`, '', '## Summary', '', a.summary, '',
    '## Cleanup items', '', 'Apply exactly these items from the cleanup list, nothing else. Behaviour must not change.', ''];
  for (const c of a.chosen) lines.push(itemBlock(item(c.id)), `- Why tonight (plan audit): ${oneLine(c.why, 600) || '-'}`, '');
  lines.push('## Acceptance criteria', '', 'None (maintenance: behaviour must not change).', '',
    "## What you'll see", '', a.playtest.whatYoullSee, '', '## How to play-test', '', ...a.playtest.howToTest.map((s, i) => `${i + 1}. ${s}`), '',
    '## Limits', '',
    `- At most ${limits.maxFiles} changed files and ${limits.maxLines} changed lines (journal excluded).`,
    `- Net \`src/\` lines (added − deleted) at most +${limits.maxNetSrc}; tests don't count. Only a performance item may grow \`src/\`; every other item should delete code.`,
    '- Existing tests and screen stages (`src/**/*.stage.ts`) are append-only tonight: add new files, never edit or delete one.',
    '- No `src/` file may import from `tests/`.',
    '- `CLAUDE.md` may change only to stay accurate about the code.',
    '- The gates check behaviour: exact bot laps and replays, every screen stage\'s DOM and computed styles, and every track\'s and car\'s scene geometry against `main`.', '',
    '## Expected files', '', ...[...new Set(a.chosen.flatMap((c) => item(c.id).files))].map((f) => `- \`${f}\``), '',
    '## Plan audit', '', `Chose ${a.chosen.map((c) => c.id).join(', ')}.`, '');
  if (a.rejected.length) lines.push('Not chosen tonight (they stay on the list):', '', ...a.rejected.map((r) => `- ${r.id}: ${r.reason}`), '');
  if (skipped.length) lines.push('Skipped (they touch files of open PRs):', '', ...skipped.map((s) => `- ${s}`), '');
  if (a.notes.length) lines.push('Harness notes:', '', ...a.notes.map((n) => `- ${n}`), '');
  return lines.join('\n');
}

export type LimitsResult = { pass: boolean; files: number; lines: number; srcAdded: number; srcDeleted: number; netSrc: number; problems: string[] };

/** A screen stage: P1's fixture, so existing ones are append-only like tests. */
const isStage = (p: string): boolean => p.startsWith('src/') && p.endsWith('.stage.ts');

/**
 * Quoted specifiers in `src/` files that point into `tests/` (`from '../../tests/x.ts'`, `import()`,
 * `@import`, `import.meta.glob`, `new URL(...)`), from `git grep -z -n` output (`<rev>:<path>\0<line>\0<text>`).
 * Moving src code into tests/ would dodge the net src/ limit, so any src → tests reference fails M1.
 */
export function srcTestImports(grep: string): string[] {
  const out: string[] = [];
  for (const row of grep.split('\n')) {
    const [where = '', line = '', text = ''] = row.split('\0');
    const file = where.replace(/^[^:]*:/, '');
    if (!file.startsWith('src/')) continue;
    for (const m of text.matchAll(/(['"`])([^'"`\n]*tests\/[^'"`\n]*)\1/g)) {
      const spec = m[2]!;
      const base = spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(file), spec)) : spec.replace(/^\/+/, '');
      if (base === 'tests' || base.startsWith('tests/')) out.push(`${file}:${line}: src/ may not import from tests/ (${spec})`);
    }
  }
  return [...new Set(out)];
}

/**
 * Gate M1 over the branch's diff against main (`git diff --raw -z --no-renames` and `--numstat -z`):
 * the allowlist (G8's rules), no existing test or screen stage (`src/**\/*.stage.ts`, P1's fixtures)
 * edited or deleted (append-only until mutation testing exists), no src/ file importing from tests/
 * (`srcToTests`, git grep output over HEAD's src/), at most `maxFiles` files and `maxLines` changed
 * lines outside journal/, and net src/ lines (added − deleted) at most `maxNetSrc`.
 */
export function checkLimits(raw: string, numstat: string, today: string, l: Limits, srcToTests = ''): LimitsResult {
  const own = new Map<string, string>();
  for (const c of parseRaw(raw)) {
    if (c.status !== 'M' && c.status !== 'D') continue;
    if (c.path.startsWith('tests/')) own.set(c.path, 'existing tests are append-only on maintenance nights (until mutation testing exists)');
    else if (isStage(c.path)) own.set(c.path, 'existing screen stages are fixtures for P1 and append-only, like tests');
  }
  // G8's rules, less its own line for a path flagged above (one message per file).
  const problems = checkDiff(raw, numstat, { today, maintenance: true }).filter((p) => ![...own.keys()].some((f) => p.startsWith(`${f}: `)));
  problems.push(...[...own].map(([f, why]) => `${f}: ${why}`), ...srcTestImports(srcToTests));
  const rows = parseNumstat(numstat).filter((r) => !r.path.startsWith('journal/'));
  const lines = rows.reduce((n, r) => n + r.added + r.deleted, 0);
  const src = rows.filter((r) => r.path.startsWith('src/'));
  const srcAdded = src.reduce((n, r) => n + r.added, 0);
  const srcDeleted = src.reduce((n, r) => n + r.deleted, 0);
  const netSrc = srcAdded - srcDeleted;
  if (rows.length > l.maxFiles) problems.push(`${rows.length} files changed (limit ${l.maxFiles})`);
  if (lines > l.maxLines) problems.push(`${lines} lines changed (limit ${l.maxLines})`);
  if (netSrc > l.maxNetSrc) problems.push(`net src/ lines grew by ${netSrc} (+${srcAdded} −${srcDeleted}); ${l.maxNetSrc > 0 ? `a maintenance night may grow src/ by at most ${l.maxNetSrc}` : 'a maintenance night must not grow src/'}`);
  return { pass: problems.length === 0, files: rows.length, lines, srcAdded, srcDeleted, netSrc, problems: [...new Set(problems)] };
}

/** The M1 row added to a maintenance gate run's gates.json. */
export function limitsGate(r: LimitsResult, l: Limits): { id: string; name: string; pass: boolean; durationMs: number; summary: string; details: string } {
  const size = `${r.files} files, ${r.lines} lines, net src ${r.netSrc >= 0 ? '+' : ''}${r.netSrc} (limits ${l.maxFiles} / ${l.maxLines} / ≤ ${l.maxNetSrc})`;
  return { id: 'M1', name: 'Maintenance limits', pass: r.pass, durationMs: 0, summary: r.pass ? size : `${r.problems.length} limit violation(s): ${size}`, details: r.problems.join('\n') };
}

export type RefactorItem = { id: string; status: 'done' | 'partial' | 'not-done'; summary: string };

/** The refactor agent's per-item report (schemas/refactor.json), for chosen items only; null when unusable. */
export function readRefactor(resultPath: string, chosen: readonly string[]): RefactorItem[] | null {
  const out = structuredOutput(resultPath) as { items?: unknown } | null;
  if (!out || !Array.isArray(out.items)) return null;
  const seen = new Set<string>();
  return (out.items as Record<string, unknown>[]).flatMap((x) => {
    const id = trimmed(x?.id);
    if (!chosen.includes(id) || seen.has(id)) return [];
    seen.add(id);
    const status = x.status === 'done' || x.status === 'partial' ? x.status : 'not-done';
    return [{ id, status, summary: trimmed(x.summary) }];
  });
}

/** maintenance.json in the run folder: what tonight's maintenance did, for the PR body, result.json and metrics. */
export type MaintRecord = {
  synced?: ReturnType<typeof syncPrs>;
  survey?: { passes: Record<string, 'ok' | 'failed'>; findings: number; new: number; merged: number; confirmed: number; staled: number; reopened: number; dropped: number; gone: number };
  list?: Record<string, number>;
  candidates?: Candidates;
  ownerOnly?: { id: string; claim: string; files: string[] }[];
  chosen?: { id: string; category: string; files: string[]; claim: string; why: string }[];
  rejected?: { id: string; reason: string }[];
  auditNotes?: string[];
  refactor?: RefactorItem[] | null;
  limits?: LimitsResult;
};

/** The cleanup items a maintenance night did: the refactor's `done` items, or every chosen item when it gave no report. */
export const doneItems = (rec: MaintRecord): string[] =>
  rec.refactor ? rec.refactor.filter((r) => r.status === 'done').map((r) => r.id) : (rec.chosen ?? []).map((c) => c.id);
