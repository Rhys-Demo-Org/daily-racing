// Run journal (HANDOVER §9) from a run folder written by daily.sh:
//   meta.json  spec.md  run.log  gates-<n>.json  phases/<phase>-<n>/{meta.json,harness.json}  diffstat.txt
//   and, on feature nights (plans/full-pipeline.md): audit.json  review.json  review.md
//   judge-<round>.json  judge.md  loc.json  existing-work.md
// Builds result.json, the gate feedback for a retry, the morning report and the PR body.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zonedParts } from './time.ts';
import { HARNESS_MARKER } from './existing.ts';
import { renderPlaytest, type Playtest } from './spec.ts';

type Json = Record<string, unknown>;
type GateRow = { id: string; name?: string; pass: boolean; durationMs?: number; summary?: string; details?: string };
type Gates = { pass: boolean; durationMs?: number; gates: GateRow[] };
/** One agent phase: agent-run's meta.json plus the harness's own timing. */
type Phase = { name: string; phase: string; attempt: number; meta: Json | null; harness: Json | null };

/** Parses a JSON file, or null when it is missing or malformed. */
export function readJson<T = Json>(path: string): T | null {
  try { return JSON.parse(readFileSync(path, 'utf8')) as T; } catch { return null; }
}

/** A gates.json if it is well formed, else null (counted as a failed gate run). */
export function readGates(path: string): Gates | null {
  const g = readJson<Gates>(path);
  return g && typeof g.pass === 'boolean' && Array.isArray(g.gates) && g.gates.length > 0 ? g : null;
}

/** Text fed back to the builder on a retry: every failed gate's summary and details. */
export function gateFeedback(path: string): string {
  const g = readGates(path);
  if (!g) return 'The gate run produced no valid gates.json (a crash or timeout), so every gate counts as failed.\n';
  return g.gates.filter((x) => !x.pass).map((x) => `### ${x.id} · ${x.name ?? ''}\n${x.summary ?? ''}\n\n${x.details ?? ''}\n`).join('\n');
}

/** Agent phases (agent-run.sh --phase) in pipeline order; parallel reviewers share a step. */
export const PHASE_ORDER: Record<string, number> = { ideate: 0, audit: 1, build: 2, retry: 2, r1: 3, r2: 3, r3: 3, r4: 3, r5: 3, verify: 4, fix: 5, judge: 6, judgecheck: 7 };
const PHASE_DIR = new RegExp(`^(${Object.keys(PHASE_ORDER).join('|')})-(\\d+)$`);

/** Agent phases in run order: by start time (ideate and audit alternate), then pipeline order. */
export function readPhases(runDir: string): Phase[] {
  const dir = join(runDir, 'phases');
  if (!existsSync(dir)) return [];
  const start = (p: Phase): number => (typeof p.harness?.startedAt === 'number' ? p.harness.startedAt : Infinity);
  return readdirSync(dir).flatMap((name) => {
    const m = PHASE_DIR.exec(name);
    return m ? [{ name, phase: m[1]!, attempt: Number(m[2]), meta: readJson(join(dir, name, 'meta.json')), harness: readJson(join(dir, name, 'harness.json')) }] : [];
  }).sort((a, b) => start(a) - start(b) || PHASE_ORDER[a.phase]! - PHASE_ORDER[b.phase]! || a.attempt - b.attempt || a.name.localeCompare(b.name));
}

/** Gate runs in attempt order. `gates` is null for a missing or malformed gates.json. */
function readGateRuns(runDir: string): { attempt: number; gates: Gates | null }[] {
  if (!existsSync(runDir)) return [];
  return readdirSync(runDir).flatMap((f) => {
    const m = /^gates-(\d+)\.json$/.exec(f);
    return m ? [{ attempt: Number(m[1]), gates: readGates(join(runDir, f)) }] : [];
  }).sort((a, b) => a.attempt - b.attempt);
}

/** Sums a `git diff --numstat` listing; binary files count as changed files with 0 lines. */
export function diffSize(numstat: string): { files: number; added: number; deleted: number } {
  const rows = numstat.split('\n').filter((l) => l.trim() !== '').map((l) => l.split('\t'));
  return { files: rows.length, added: rows.reduce((n, r) => n + (Number(r[0]) || 0), 0), deleted: rows.reduce((n, r) => n + (Number(r[1]) || 0), 0) };
}

const gateMap = (g: Gates | null): Record<string, boolean> | null => (g ? Object.fromEntries(g.gates.map((x) => [x.id, x.pass])) : null);

/**
 * result.json: HANDOVER §9 fields. The thin harness has no judge, perf or lap-time capture, so
 * those are null; `gates` is the final gate run (the verdict), `gateRuns` every attempt.
 */
export function buildResult(runDir: string, outcome: string, reason: string | null): Json {
  const meta = readJson(join(runDir, 'meta.json')) ?? {};
  const phases = readPhases(runDir);
  const runs = readGateRuns(runDir);
  const diff = existsSync(join(runDir, 'diffstat.txt')) ? diffSize(readFileSync(join(runDir, 'diffstat.txt'), 'utf8')) : null;
  const cost = phases.reduce((n, p) => n + (Number(p.meta?.total_cost_usd) || 0), 0);
  const judgeRounds = readJudgeRounds(runDir);
  const judge = judgeRounds.at(-1)?.verdict ?? null;
  return {
    date: meta.date ?? null,
    dryRun: meta.dryRun ?? true,
    outcome,
    reason,
    abortReason: outcome === 'abort' ? reason : null,
    phase: meta.phase ?? null,
    attempts: typeof meta.attempts === 'number' ? meta.attempts : 1,
    models: meta.models ?? null,
    claudeCodeVersion: meta.claudeCodeVersion ?? null,
    ideaType: meta.ideaType ?? null,
    backlogId: meta.backlogId ?? null,
    gates: gateMap(runs.at(-1)?.gates ?? null),
    gateRuns: runs.map((r) => ({ attempt: r.attempt, pass: r.gates?.pass ?? false, gates: gateMap(r.gates) })),
    retries: phases.filter((p) => p.phase === 'retry').length,
    judgeScore: (judge?.blind as Json | null)?.overall ?? null,
    judge: judge ? { pass: judge.pass, reasons: judge.reasons, round: judgeRounds.at(-1)?.round, scores: (judge.blind as Json | null)?.scores ?? null } : null,
    audit: readJson(join(runDir, 'audit.json')),
    review: reviewSummary(readJson(join(runDir, 'review.json'))),
    loc: readJson(join(runDir, 'loc.json')),
    medianLapTimes: null,
    p95FrameTimeMs: null,
    triangleCount: null,
    bundleSizeBytes: null,
    diffSize: diff,
    usage: phases.map((p) => ({ phase: p.phase, attempt: p.attempt, exit: p.harness?.exit ?? null, class: p.meta?.class ?? null, model: p.meta?.model ?? null, wallMs: p.meta?.wallMs ?? null, numTurns: p.meta?.num_turns ?? null, usage: p.meta?.usage ?? null, costUsd: p.meta?.total_cost_usd ?? null })),
    totalCostUsd: Math.round(cost * 100) / 100,
  };
}

/** judge-<round>.json files (the harness's verdicts) in round order. */
function readJudgeRounds(runDir: string): { round: number; verdict: Json }[] {
  if (!existsSync(runDir)) return [];
  return readdirSync(runDir).flatMap((f) => {
    const m = /^judge-(\d+)\.json$/.exec(f);
    const v = m ? readJson(join(runDir, f)) : null;
    return m && v ? [{ round: Number(m[1]), verdict: v }] : [];
  }).sort((a, b) => a.round - b.round);
}

/** review.json (lib/review.ts ReviewState) reduced to counts for result.json and metrics. */
export function reviewSummary(s: Json | null): Json | null {
  if (!s) return null;
  const findings = (s.findings ?? []) as { reviewer: string }[];
  const rulings = (s.rulings ?? []) as { status: string }[];
  const fixes = (s.fixes ?? []) as { kept: boolean | null }[];
  const perReviewer = Object.fromEntries(Object.keys((s.reviewers ?? {}) as Json).map((r) => [r, findings.filter((f) => f.reviewer === r).length]));
  return { reviewers: s.reviewers ?? {}, findings: findings.length, perReviewer, verified: rulings.filter((r) => r.status === 'verified').length,
    dropped: rulings.filter((r) => r.status !== 'verified').length, fixesKept: fixes.filter((f) => f.kept === true).length, fixesDropped: fixes.filter((f) => f.kept === false).length };
}

const clock = (sec: unknown, tz: string): string => {
  if (typeof sec !== 'number') return '-';
  const m = zonedParts(sec * 1000, tz).minutes;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const mins = (ms: number): string => {
  const s = Math.round(ms / 1000);
  const two = (n: number): string => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}h${two(Math.floor(s / 60) % 60)}m` : `${Math.floor(s / 60)}m${two(s % 60)}s`;
};
const row = (cells: unknown[]): string => `| ${cells.map((c) => String(c ?? '-')).join(' | ')} |`;

/** GitHub's PR body limit is 65,536 characters; stay under it. */
const BODY_MAX = 60_000;

/**
 * Builder-written text made inert in a PR: no @mentions, no closing keywords (`Fixes #3` would close
 * an issue on merge), no hidden HTML comments. A zero-width space breaks each.
 */
export function defang(md: string): string {
  return md.replace(/@(?=[\w-])/g, '@\u200b').replace(/\b(close[sd]?|fix(?:e[sd])?|resolve[sd]?)(\s*:?\s*)(?=[\w./-]*#\d)/gi, '$1\u200b$2').replace(/<!--/g, '&lt;!--');
}

const text = (runDir: string, f: string): string | null => (existsSync(join(runDir, f)) ? readFileSync(join(runDir, f), 'utf8') : null);

/**
 * PR body, in the order of plans/full-pipeline.md "PR": how to play-test and what you'll see (when
 * the spec has them), the preview link and outcome (with the hidden harness marker), any CLAUDE.md
 * or rule change, then the spec with its audit, the review, the judge, the gate table and usage.
 */
export function prBody(runDir: string, tz: string, previewUrl: string): string {
  const result = readJson(join(runDir, 'result.json'));
  const specJson = readJson<{ playtest?: Playtest | null }>(join(runDir, 'spec.json'));
  let spec = text(runDir, 'spec.md')?.replace(/^# .*\n/, '') ?? 'No spec was locked.\n';
  if (specJson?.playtest) spec = spec.replace(/^## What you'll see\n[\s\S]*?^## How to play-test\n[\s\S]*?(?=^## |(?![\s\S]))/m, ''); // shown first instead
  const date = String(result?.date ?? '');
  const lines: string[] = [];
  if (specJson?.playtest) lines.push(...renderPlaytest(specJson.playtest).map((l) => defang(l)));
  lines.push(
    `**Preview:** ${previewUrl} (live once the deploy check passes)`,
    `**Outcome:** ${String(result?.outcome ?? '?')}${result?.reason ? ` (${String(result.reason)})` : ''}`,
    HARNESS_MARKER,
  );
  if (result?.outcome !== 'pass') lines.push('', '> Gates or judge did not pass. Kept as a draft so the attempt is on record; close it to drop the item.');
  const rules = text(runDir, 'rule-changes.md');
  if (rules?.trim()) lines.push('', '> [!WARNING]', '> **Rule change.** This PR changes text that every later agent loads as instructions. Read it before merging.', '', defang(rules.trim()));
  const parts = [...lines, '', defang(spec.trim())];
  for (const f of ['review.md', 'judge.md']) { const t = text(runDir, f); if (t?.trim()) parts.push('', defang(t.trim())); }
  const shots = readJson<unknown[]>(join(runDir, 'screenshots', 'index.json'));
  if (Array.isArray(shots) && shots.length) parts.push('', `Screenshots: ${shots.length} in the run folder (\`runs/${date}/screenshots/\` on the VM); the reviewers and judge saw them.`);
  const body = [...parts, '', report(runDir, tz).replace(/^# .*\n/, '').replace(/^## /gm, '### ').trim(), '',
    `Journal: \`journal/runs/${date}/\`. Built and reviewed unattended; play-test the preview before merging.`].join('\n');
  return (body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}\n\n…truncated; see the journal.` : body) + '\n';
}

/** Markdown morning report: item, outcome, phases against the deadlines, usage, gate table per attempt. */
export function report(runDir: string, tz: string): string {
  const meta = readJson(join(runDir, 'meta.json')) ?? {};
  const result = readJson(join(runDir, 'result.json'));
  const hard = Number(meta.hardDeadlineAt);
  const out = [
    `# ${meta.dryRun === false ? 'Run' : 'Dry run'} ${String(meta.date)} · ${String(meta.ideaType ?? '?')} ${String(meta.backlogId ?? '')} · ${String(result?.outcome ?? 'unfinished')}`,
    '',
    `Started ${clock(meta.startedAt, tz)} · no new phase after ${clock(meta.noNewPhaseAt, tz)} · hard deadline ${clock(hard, tz)}${meta.manual ? ' (manual run)' : ''}`,
  ];
  if (result?.reason) out.push(`${result.abortReason ? 'Abort reason' : 'Reason'}: ${String(result.reason)}`);
  out.push('', '## Phases', '', row(['phase', 'start', 'end', 'wall', 'margin to deadline', 'exit', 'turns', 'tokens in/out/cache-read', 'cost $']), row(Array(9).fill('---')));
  for (const p of readPhases(runDir)) {
    const u = (p.meta?.usage ?? {}) as Json;
    const end = Number(p.harness?.endedAt);
    out.push(row([p.name, clock(p.harness?.startedAt, tz), clock(p.harness?.endedAt, tz), typeof p.meta?.wallMs === 'number' ? mins(p.meta.wallMs) : '-',
      Number.isFinite(end) && hard ? mins((hard - end) * 1000) : '-', `${String(p.harness?.exit ?? '-')} ${String(p.meta?.class ?? '')}`.trim(), p.meta?.num_turns,
      `${String(u.input_tokens ?? '-')}/${String(u.output_tokens ?? '-')}/${String(u.cache_read_input_tokens ?? '-')}`, p.meta?.total_cost_usd]));
  }
  const runs = readGateRuns(runDir);
  const ids = [...new Set(runs.flatMap((r) => r.gates?.gates.map((g) => g.id) ?? []))];
  const failures: string[] = [];
  out.push('', '## Gates', '', row(['attempt', 'pass', ...ids, 'duration']), row(Array(ids.length + 3).fill('---')));
  for (const r of runs) {
    out.push(row([r.attempt, r.gates?.pass ? 'PASS' : 'FAIL', ...ids.map((id) => { const g = r.gates?.gates.find((x) => x.id === id); return g ? (g.pass ? 'ok' : 'FAIL') : '-'; }),
      typeof r.gates?.durationMs === 'number' ? mins(r.gates.durationMs) : '-']));
    if (!r.gates) failures.push(`- attempt ${r.attempt}: no valid gates.json`);
    for (const g of r.gates?.gates.filter((x) => !x.pass) ?? []) failures.push(`- attempt ${r.attempt} ${g.id}: ${g.summary ?? ''}`);
  }
  if (failures.length) out.push('', ...failures);
  out.push('', `Retries: ${String(result?.retries ?? '-')} · total notional cost: $${String(result?.totalCostUsd ?? '-')}`);
  const audit = result?.audit as Json | null | undefined;
  const review = result?.review as Json | null | undefined;
  const judge = result?.judge as Json | null | undefined;
  if (audit || review || judge) {
    out.push('', '## Pipeline', '');
    if (audit) out.push(`- Plan audit: ${String(audit.verdict ?? '-')} after ${String(audit.rounds ?? '-')} round(s); items tried: ${((audit.items ?? []) as Json[]).map((i) => `${String(i.id)} ${String(i.verdict)}`).join(', ') || '-'}`);
    if (review) out.push(`- Review: ${String(review.findings)} findings (${Object.entries((review.perReviewer ?? {}) as Json).map(([k, v]) => `${k} ${String(v)}`).join(', ')}), ${String(review.verified)} verified, ${String(review.dropped)} dropped; fixes kept ${String(review.fixesKept)}, dropped by gates ${String(review.fixesDropped)}`);
    if (judge) out.push(`- Judge: ${judge.pass ? 'pass' : 'fail'}${result?.judgeScore !== null && result?.judgeScore !== undefined ? ` (${String(result.judgeScore)}/10)` : ''}${(judge.reasons as string[] | undefined)?.length ? `: ${(judge.reasons as string[]).join('; ')}` : ''}`);
  }
  return out.join('\n') + '\n';
}
