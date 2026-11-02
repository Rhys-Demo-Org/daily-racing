// Review → verify → fix (plans/full-pipeline.md steps 7–10). Reviewers R1–R5 return findings; the
// harness renumbers them R<n>-<k>. Agent V marks each verified (a failing test it wrote, or a
// concrete trace) or dropped; the harness holds it to that. Agent F fixes one verified finding per
// call and the harness commits each fix on its own, so the gates can drop exactly the fixes that
// break them. review.md is assembled from those records for the judge and the PR.

import { readFileSync, realpathSync, statSync } from 'node:fs';
import { sep } from 'node:path';
import { structuredOutput, trimmed } from './spec.ts';

export const REVIEWERS = {
  R1: 'spec: every acceptance criterion is met and the play-test is true',
  R2: 'correctness and determinism',
  R3: 'duplication and dead code',
  R4: 'UI_RULES and screenshots',
  R5: 'test strength',
} as const;
export type ReviewerId = keyof typeof REVIEWERS;

export type Finding = { id: string; reviewer: string; severity: 'critical' | 'major' | 'minor'; file: string; line: number | null; claim: string; evidence: string; suggestedFix: string };
export type Ruling = { id: string; status: 'verified' | 'dropped'; method: 'test' | 'trace' | 'none'; testFile: string | null; trace: string; reason: string; harnessNote?: string };
export type FixRecord = { id: string; status: 'fixed' | 'not-fixed' | 'no-change' | 'agent-error'; summary: string; tests: string[]; commit: string | null; kept: boolean | null };

const SEV = ['critical', 'major', 'minor'] as const;

/**
 * Findings of one reviewer's `claude -p` result.json, renumbered `<reviewer>-<k>`. Unusable output
 * gives none (the reviewer is recorded as failed by the caller).
 */
export function readFindings(reviewer: string, resultPath: string): Finding[] | null {
  const out = structuredOutput(resultPath) as { findings?: unknown } | null;
  if (!out || !Array.isArray(out.findings)) return null;
  return out.findings.flatMap((f: Record<string, unknown>, i) => {
    if (!trimmed(f?.claim)) return [];
    return [{
      id: `${reviewer}-${i + 1}`, reviewer,
      severity: SEV.includes(f.severity as (typeof SEV)[number]) ? f.severity as Finding['severity'] : 'minor',
      file: trimmed(f.file), line: typeof f.line === 'number' ? f.line : null,
      claim: trimmed(f.claim), evidence: trimmed(f.evidence), suggestedFix: trimmed(f.suggestedFix),
    }];
  });
}

/**
 * Agent V's rulings, held to the rules: every finding gets exactly one ruling (missing = dropped);
 * a `test` ruling needs a test file V actually wrote (`written`), a `trace` ruling a real trace.
 * A ruling that fails its proof is dropped with a harness note. `testFile` is kept only when V
 * really wrote that file (on any ruling): it is later read into a fixer's brief.
 */
export function checkRulings(raw: unknown, findings: readonly Finding[], written: readonly string[]): Ruling[] {
  const out = (raw as { results?: unknown } | null)?.results;
  const given = new Map<string, Record<string, unknown>>();
  for (const r of Array.isArray(out) ? out : []) if (typeof r?.id === 'string' && !given.has(r.id)) given.set(r.id, r);
  return findings.map((f): Ruling => {
    const r = given.get(f.id);
    if (!r) return { id: f.id, status: 'dropped', method: 'none', testFile: null, trace: '', reason: 'The verifier gave no ruling.', harnessNote: 'no ruling' };
    const claimed = trimmed(r.testFile);
    const ruling: Ruling = {
      id: f.id, status: r.status === 'verified' ? 'verified' : 'dropped', method: r.method === 'test' || r.method === 'trace' ? r.method : 'none',
      testFile: claimed && written.includes(claimed) ? claimed : null, trace: trimmed(r.trace), reason: trimmed(r.reason),
    };
    if (ruling.status !== 'verified') return ruling;
    if (ruling.method === 'test' && !ruling.testFile) {
      const note = `test file ${claimed.slice(0, 200) || '(none)'} was not written`;
      if (ruling.trace.length >= 80) return { ...ruling, method: 'trace', harnessNote: `${note}; kept on its trace` };
      return { ...ruling, status: 'dropped', harnessNote: `${note} and there is no trace` };
    }
    if (ruling.method === 'trace' && ruling.trace.length < 80) return { ...ruling, status: 'dropped', harnessNote: 'trace too short to be concrete' };
    if (ruling.method === 'none') return { ...ruling, status: 'dropped', harnessNote: 'verified without a test or trace' };
    return ruling;
  });
}

/** Verified findings in fix order (critical first, then reviewer order), at most `max`. */
export function fixQueue(findings: readonly Finding[], rulings: readonly Ruling[], max: number): Finding[] {
  const ok = new Set(rulings.filter((r) => r.status === 'verified').map((r) => r.id));
  return findings.filter((f) => ok.has(f.id)).sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity)).slice(0, max);
}

/**
 * The source of the verifier's test `testFile` as the harness kept it under `dir` ($RUN/verify-tests),
 * or null. Only a regular file whose real path is inside `dir` is read, so no `..` or symlink can
 * pull another file (a token) into a fixer's prompt.
 */
export function verifierTest(dir: string, testFile: string | null | undefined): string | null {
  if (!testFile) return null;
  try {
    const root = realpathSync(dir);
    const path = realpathSync(`${root}${sep}${testFile}`);
    if (!path.startsWith(root + sep) || !statSync(path).isFile()) return null;
    return readFileSync(path, 'utf8');
  } catch { return null; }
}

/** The brief one fix agent gets: its finding, the verifier's proof and the test V wrote. */
export function fixBrief(f: Finding, r: Ruling | undefined, testSource: string | null): string {
  const lines = [`## Finding ${f.id} (${f.severity}, reviewer ${f.reviewer}: ${REVIEWERS[f.reviewer as ReviewerId] ?? ''})`, '',
    `- File: \`${f.file}\`${f.line ? ` line ${f.line}` : ''}`, `- Claim: ${f.claim}`, `- Evidence: ${f.evidence}`, `- Suggested fix: ${f.suggestedFix}`, ''];
  if (r) lines.push('### How the verifier reproduced it', '', `Method: ${r.method}. ${r.reason}`, '', ...(r.trace ? ['```', r.trace, '```', ''] : []));
  if (r?.testFile && testSource !== null) lines.push(`### The verifier's failing test (\`${r.testFile}\`; not in the tree: add it, or your own version, as a new test file)`, '', '```ts', testSource, '```', '');
  return lines.join('\n');
}

/** A fix agent's report (fix.json) as a record; the harness fills in the commit. */
export function readFix(id: string, resultPath: string): FixRecord {
  const out = structuredOutput(resultPath) as Record<string, unknown> | null;
  if (!out) return { id, status: 'agent-error', summary: 'The fix agent returned no valid report.', tests: [], commit: null, kept: null };
  return { id, status: out.status === 'fixed' ? 'fixed' : 'not-fixed', summary: trimmed(out.summary), tests: Array.isArray(out.tests) ? out.tests.map(trimmed).filter(Boolean) : [], commit: null, kept: null };
}

export type ReviewState = { reviewers: Record<string, 'ok' | 'failed' | 'skipped'>; findings: Finding[]; rulings: Ruling[]; fixes: FixRecord[]; notes: string[] };

/** review.md: what each reviewer found, what the verifier proved, what was fixed and kept. */
export function reviewMd(s: ReviewState): string {
  const ruling = new Map(s.rulings.map((r) => [r.id, r]));
  const fix = new Map(s.fixes.map((f) => [f.id, f]));
  const verified = s.rulings.filter((r) => r.status === 'verified').length;
  const kept = s.fixes.filter((f) => f.kept).length;
  const lines = ['## Review', '', `Reviewers: ${Object.entries(s.reviewers).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}.`,
    `${s.findings.length} findings, ${verified} verified, ${s.findings.length - verified} dropped; ${kept} fixes kept after the gates.`, ''];
  if (s.notes.length) lines.push(...s.notes.map((n) => `- ${n}`), '');
  for (const f of s.findings) {
    const r = ruling.get(f.id);
    const x = fix.get(f.id);
    lines.push(`### ${f.id} · ${f.severity} · ${r?.status ?? 'unverified'}`, '', `\`${f.file}\`${f.line ? `:${f.line}` : ''}: ${f.claim}`, '');
    if (r) lines.push(`Verifier (${r.method}): ${r.reason}${r.harnessNote ? ` (harness: ${r.harnessNote})` : ''}`, '');
    if (x) {
      lines.push(fixLine(x), '');
    }
  }
  const judgeFixes = s.fixes.filter((x) => !s.findings.some((f) => f.id === x.id));
  if (judgeFixes.length) lines.push('### Judge fix round', '', ...judgeFixes.flatMap((x) => [fixLine(x), '']));
  return lines.join('\n');
}

function fixLine(x: FixRecord): string {
  const fate = x.kept === null ? '' : x.kept ? ' Kept: the gates pass with it.' : ' Dropped: the gates failed with it.';
  return `Fix: ${x.status}${x.commit ? ` in \`${x.commit.slice(0, 12)}\`` : ''}. ${x.summary}${x.tests.length ? ` Tests: ${x.tests.map((t) => `\`${t}\``).join(', ')}.` : ''}${fate}`;
}
