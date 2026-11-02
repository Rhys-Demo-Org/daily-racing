// The plan audit (plans/full-pipeline.md step 5): agent B's verdict on a draft spec, checked by the
// harness. The harness owns two rules the agent can't talk its way past: an approve that ignores
// file overlap with open PRs becomes a defer, and invalid output counts as a reject.

export type Verdict = 'approve' | 'revise' | 'defer' | 'reject';
export type AuditFinding = { check: string; severity: 'blocker' | 'major' | 'minor'; claim: string; suggestedFix: string };
export type Audit = {
  verdict: Verdict;
  summary: string;
  findings: AuditFinding[];
  overlapAssessment: string | null;
  waitsOn: string | null;
  designRequest: string | null;
  backlogChangeRequests: string[];
  /** Set when the harness changed the agent's verdict, with the reason. */
  harnessOverride?: string;
};

const VERDICTS: readonly Verdict[] = ['approve', 'revise', 'defer', 'reject'];
const SEVERITIES = ['blocker', 'major', 'minor'];
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const orNull = (v: unknown): string | null => text(v) || null;

/**
 * Validates agent B's structured output and applies the harness rules. `overlapCount` is the number
 * of open PRs whose files the draft's expectedFiles hit. Never throws: unusable output is a reject.
 */
export function checkAudit(x: unknown, overlapCount: number): Audit {
  const a = x as Record<string, unknown> | null;
  if (!a || typeof a !== 'object' || !VERDICTS.includes(a.verdict as Verdict) || !text(a.summary)) {
    return { verdict: 'reject', summary: 'The plan audit returned no valid verdict.', findings: [], overlapAssessment: null, waitsOn: null, designRequest: null, backlogChangeRequests: [], harnessOverride: 'invalid audit output' };
  }
  const findings = (Array.isArray(a.findings) ? a.findings : []).flatMap((f: Record<string, unknown>) =>
    text(f?.claim) ? [{ check: text(f.check) || 'other', severity: (SEVERITIES.includes(f.severity as string) ? f.severity : 'major') as AuditFinding['severity'], claim: text(f.claim), suggestedFix: text(f.suggestedFix) }] : []);
  const audit: Audit = {
    verdict: a.verdict as Verdict,
    summary: text(a.summary),
    findings,
    overlapAssessment: orNull(a.overlapAssessment),
    waitsOn: orNull(a.waitsOn),
    designRequest: orNull(a.designRequest),
    backlogChangeRequests: (Array.isArray(a.backlogChangeRequests) ? a.backlogChangeRequests : []).map(text).filter(Boolean),
  };
  if (audit.verdict === 'approve' && overlapCount > 0 && !audit.overlapAssessment) {
    return { ...audit, verdict: 'defer', waitsOn: audit.waitsOn ?? 'the open PRs it overlaps', harnessOverride: `approve ignored file overlap with ${overlapCount} open PR(s), so the harness deferred it` };
  }
  if (audit.verdict === 'approve' && findings.some((f) => f.severity === 'blocker')) {
    return { ...audit, verdict: 'revise', harnessOverride: 'approve with a blocker finding, so the harness asked for a revision' };
  }
  return audit;
}

/** The audit as markdown, attached to the locked spec and shown in the PR. */
export function renderAudit(a: Audit, round: number): string {
  const lines = ['## Plan audit', '', `Verdict: **${a.verdict}** (round ${round})${a.harnessOverride ? ` · harness: ${a.harnessOverride}` : ''}`, '', a.summary, ''];
  if (a.findings.length) lines.push(...a.findings.map((f) => `- ${f.severity} · ${f.check}: ${f.claim}${f.suggestedFix ? ` Fix: ${f.suggestedFix}` : ''}`), '');
  if (a.overlapAssessment) lines.push(`Overlap with open PRs: ${a.overlapAssessment}`, '');
  if (a.waitsOn) lines.push(`Waits on: ${a.waitsOn}`, '');
  if (a.backlogChangeRequests.length) lines.push('Backlog change requests for the owner:', '', ...a.backlogChangeRequests.map((r) => `- ${r}`), '');
  return lines.join('\n');
}

/** What a fresh ideate agent gets after a revise verdict. */
export function reviseBrief(a: Audit): string {
  return ['## Plan audit asked for a revision', '', 'A plan auditor reviewed your previous draft (shown below) and asked for these changes. Write a new spec that addresses every finding.', '', a.summary, '',
    ...a.findings.map((f) => `- ${f.severity} · ${f.check}: ${f.claim}${f.suggestedFix ? ` Fix: ${f.suggestedFix}` : ''}`), ''].join('\n');
}
