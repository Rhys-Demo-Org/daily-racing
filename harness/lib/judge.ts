// The judge (HANDOVER §6.2 step 5, plans/full-pipeline.md step 11). Two isolated, read-only calls:
// a blind call that scores the spec, diff, screenshots, gates and references, then a check call
// that gets review.md and tests its claims against the diff. The harness, not the agent, decides
// the verdict: all gates green, overall ≥ 6, no axis below 4, no planted instruction (whether the
// judge or the harness's own scan found it) and no review claim the diff contradicts.

import { structuredOutput } from './spec.ts';

export const AXES = ['specMet', 'styleMatch', 'notBroken', 'testsReal', 'noSniffing', 'scope', 'noDuplication'] as const;
export const PASS_OVERALL = 6;
export const MIN_AXIS = 4;

export type Blind = { scores: Record<(typeof AXES)[number], number>; overall: number; verdict: string; failures: { axis: string; file: string; claim: string; evidence: string }[]; plantedInstructions: string[]; summary: string };
export type Check = { claims: { claim: string; verdict: 'confirmed' | 'unconfirmed' | 'false'; evidence: string }[]; newRules: string[]; plantedInstructions: string[]; summary: string };
export type JudgeVerdict = { pass: boolean; reasons: string[]; blind: Blind | null; check: Check | null; scan: string[]; newRules: string[] };

const structured = (path: string): Record<string, unknown> | null => { const o = structuredOutput(path); return o && typeof o === 'object' ? o as Record<string, unknown> : null; };
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []);
const int = (v: unknown): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 10 ? v as number : null);

/** The blind call's output, or null when it is missing or breaks the schema. */
export function readBlind(path: string): Blind | null {
  const b = structured(path);
  if (!b || typeof b.scores !== 'object' || b.scores === null) return null;
  const s = b.scores as Record<string, unknown>;
  if (AXES.some((a) => int(s[a]) === null) || int(b.overall) === null) return null;
  return {
    scores: Object.fromEntries(AXES.map((a) => [a, s[a] as number])) as Blind['scores'], overall: b.overall as number, verdict: String(b.verdict),
    failures: (Array.isArray(b.failures) ? b.failures : []).map((f: Record<string, unknown>) => ({ axis: String(f?.axis ?? ''), file: String(f?.file ?? ''), claim: String(f?.claim ?? ''), evidence: String(f?.evidence ?? '') })),
    plantedInstructions: strs(b.plantedInstructions), summary: String(b.summary ?? ''),
  };
}

/** The check call's output, or null when it is missing or malformed. */
export function readCheck(path: string): Check | null {
  const c = structured(path);
  if (!c || !Array.isArray(c.claims)) return null;
  return {
    claims: c.claims.map((x: Record<string, unknown>) => ({ claim: String(x?.claim ?? ''), verdict: x?.verdict === 'confirmed' || x?.verdict === 'false' ? x.verdict : 'unconfirmed', evidence: String(x?.evidence ?? '') })),
    newRules: strs(c.newRules), plantedInstructions: strs(c.plantedInstructions), summary: String(c.summary ?? ''),
  };
}

// Text aimed at an AI reader. Run over the added lines of the diff only, so the repo's own docs
// and this harness never match.
const PLANTED = [
  /\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|earlier|all|your)\b.{0,20}\b(instructions?|rules|rubric|prompt)\b/i,
  /\b(dear|attention|hey|hi|to the)\s+(ai|llm|model|judge|reviewer|auditor|grader|evaluator|verifier|assistant|claude)s?\b/i,
  /\b(judge|reviewer|auditor|grader|evaluator|verifier)s?\s*[:,]\s*(please\s+)?(score|pass|approve|rate|ignore|give|mark|accept)\b/i,
  /\b(score|rate|grade|mark)\s+(this|it|the (pr|build|change|diff))\s+(a\s+)?(\d+|pass|full marks)/i,
  /\b(note|message|instructions?)\s+(to|for)\s+(the\s+)?(ai|llm|model|judge|reviewer|auditor|assistant|claude)\b/i,
  /\byou are (an? |the )?(ai|llm|language model|assistant|judge|reviewer|claude)\b/i,
];

/** Added diff lines that read as instructions to an AI reviewer, quoted with their file. */
export function scanPlanted(diff: string): string[] {
  const hits: string[] = [];
  let file = '';
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) { file = line.replace(/^\+\+\+ (b\/)?/, ''); continue; }
    if (!line.startsWith('+') || file.startsWith('journal/')) continue;
    if (PLANTED.some((re) => re.test(line))) hits.push(`${file}: ${line.slice(1).trim().slice(0, 300)}`);
  }
  return hits;
}

/** The harness's verdict over the gates, both judge calls and the scan. */
export function judgeVerdict(gatesPass: boolean, blind: Blind | null, check: Check | null, scan: readonly string[]): JudgeVerdict {
  const reasons: string[] = [];
  if (!gatesPass) reasons.push('gates did not pass');
  if (!blind) reasons.push('the blind judge returned no valid scores');
  else {
    if (blind.overall < PASS_OVERALL) reasons.push(`overall ${blind.overall}/10 is below ${PASS_OVERALL}`);
    const low = AXES.filter((a) => blind.scores[a] < MIN_AXIS);
    if (low.length) reasons.push(`axis below ${MIN_AXIS}: ${low.map((a) => `${a} ${blind.scores[a]}`).join(', ')}`);
    if (blind.verdict !== 'pass') reasons.push('the blind judge said fail');
  }
  if (!check) reasons.push('the review check returned no valid output');
  else {
    const bad = check.claims.filter((c) => c.verdict === 'false');
    if (bad.length) reasons.push(`review.md has ${bad.length} claim(s) the diff contradicts`);
  }
  const planted = [...scan, ...(blind?.plantedInstructions ?? []), ...(check?.plantedInstructions ?? [])];
  if (planted.length) reasons.push(`instructions planted for the judge or reviewers (${planted.length})`);
  return { pass: reasons.length === 0, reasons, blind, check, scan: [...scan], newRules: check?.newRules ?? [] };
}

/** What the judge fix round's agent gets: the judge's failures and the contradicted claims. */
export function judgeBrief(v: JudgeVerdict): string {
  const lines = ['## The judge failed the build', '', ...v.reasons.map((r) => `- ${r}`), ''];
  for (const f of v.blind?.failures ?? []) lines.push(`### ${f.axis}: ${f.file}`, '', f.claim, '', f.evidence, '');
  for (const c of v.check?.claims.filter((x) => x.verdict === 'false') ?? []) lines.push(`### Contradicted review claim`, '', c.claim, '', c.evidence, '');
  return lines.join('\n');
}

/** The verdict as markdown for the PR and journal. */
export function renderJudge(v: JudgeVerdict, round: number): string {
  const lines = ['## Judge', '', `Verdict: **${v.pass ? 'pass' : 'fail'}**${round > 1 ? ' (after the fix round)' : ''}${v.reasons.length ? `: ${v.reasons.join('; ')}` : ''}`, ''];
  if (v.blind) {
    lines.push(`Blind scores: overall **${v.blind.overall}/10** · ${AXES.map((a) => `${a} ${v.blind!.scores[a]}`).join(' · ')}`, '', v.blind.summary, '');
  }
  if (v.check) {
    const n = (k: string): number => v.check!.claims.filter((c) => c.verdict === k).length;
    lines.push(`Review claims: ${n('confirmed')} confirmed, ${n('unconfirmed')} unconfirmed, ${n('false')} contradicted.`, '');
  }
  const planted = [...v.scan, ...(v.blind?.plantedInstructions ?? []), ...(v.check?.plantedInstructions ?? [])];
  if (planted.length) lines.push('Planted instructions:', '', ...planted.map((p) => `- ${p}`), '');
  return lines.join('\n');
}
