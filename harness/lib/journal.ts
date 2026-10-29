// Run journal (HANDOVER §9) from a run folder written by daily.sh:
//   meta.json  spec.md  run.log  gates-<n>.json  phases/<phase>-<n>/{meta.json,harness.json}  diffstat.txt
// Builds result.json, the gate feedback for a retry, and the morning dry-run report.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { zonedParts } from './time.ts';

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

const ORDER: Record<string, number> = { ideate: 0, build: 1, retry: 1 };

/** Agent phases in run order. */
export function readPhases(runDir: string): Phase[] {
  const dir = join(runDir, 'phases');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const m = /^(ideate|build|retry)-(\d+)$/.exec(name);
    return m ? [{ name, phase: m[1]!, attempt: Number(m[2]), meta: readJson(join(dir, name, 'meta.json')), harness: readJson(join(dir, name, 'harness.json')) }] : [];
  }).sort((a, b) => ORDER[a.phase]! - ORDER[b.phase]! || a.attempt - b.attempt);
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
  return {
    date: meta.date ?? null,
    dryRun: meta.dryRun ?? true,
    outcome,
    reason,
    abortReason: outcome === 'abort' ? reason : null,
    phase: meta.phase ?? null,
    attempts: 1,
    models: meta.models ?? null,
    claudeCodeVersion: meta.claudeCodeVersion ?? null,
    ideaType: meta.ideaType ?? null,
    backlogId: meta.backlogId ?? null,
    gates: gateMap(runs.at(-1)?.gates ?? null),
    gateRuns: runs.map((r) => ({ attempt: r.attempt, pass: r.gates?.pass ?? false, gates: gateMap(r.gates) })),
    retries: phases.filter((p) => p.phase === 'retry').length,
    judgeScore: null,
    medianLapTimes: null,
    p95FrameTimeMs: null,
    triangleCount: null,
    bundleSizeBytes: null,
    diffSize: diff,
    usage: phases.map((p) => ({ phase: p.phase, attempt: p.attempt, exit: p.harness?.exit ?? null, class: p.meta?.class ?? null, model: p.meta?.model ?? null, wallMs: p.meta?.wallMs ?? null, numTurns: p.meta?.num_turns ?? null, usage: p.meta?.usage ?? null, costUsd: p.meta?.total_cost_usd ?? null })),
    totalCostUsd: Math.round(cost * 100) / 100,
  };
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

/** Markdown morning report: item, outcome, phases against the deadlines, usage, gate table per attempt. */
export function report(runDir: string, tz: string): string {
  const meta = readJson(join(runDir, 'meta.json')) ?? {};
  const result = readJson(join(runDir, 'result.json'));
  const hard = Number(meta.hardDeadlineAt);
  const out = [
    `# Dry run ${String(meta.date)} · ${String(meta.ideaType ?? '?')} ${String(meta.backlogId ?? '')} · ${String(result?.outcome ?? 'unfinished')}`,
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
  return out.join('\n') + '\n';
}
