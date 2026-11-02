// metrics.csv (plans/full-pipeline.md "Measuring it"): one row per night, appended by daily.sh to
// METRICS_CSV from the run folder's result.json and phases. Owner-outcome columns stay blank; a
// later script fills them from GitHub.

import { join } from 'node:path';
import { readJson, readPhases, reviewSummary, SURVEY_PHASES } from './journal.ts';
import { AXES } from './judge.ts';
import { doneItems, type MaintRecord } from './maintenance.ts';

type Json = Record<string, unknown>;

/** Phase groups with turns / tokens / wall-clock columns each. */
const GROUPS: Record<string, string[]> = {
  ideate: ['ideate'], audit: ['audit'], build: ['build', 'retry'], review: ['r1', 'r2', 'r3', 'r4', 'r5'], verify: ['verify'], fix: ['fix'], judge: ['judge', 'judgecheck'],
  survey: SURVEY_PHASES,
};
/** Parallel phases: their wall clock is first start to last end; others add up. */
const PARALLEL = new Set(['review', 'survey']);
/** Maintenance nights (plans/full-pipeline.md "The 7th day"): survey, list, choice, size, preservation. */
const MAINTENANCE = ['surveyFindings', 'surveyNew', 'surveyStaled', 'listOpen', 'listSize', 'itemsEligible', 'itemsSkippedOverlap', 'itemsOwnerOnly', 'itemsChosen', 'itemsDone',
  'netSrcLines', 'changedFiles', 'changedLines', 'preserveG2', 'preserveG3', 'preserveP1', 'preserveP2', 'limitsM1'];
const OWNER = ['ownerOutcome', 'timeToMergeH', 'ownerRating', 'escapedDefects', 'duplicationScore', 'mutationScore'];

export const METRICS_COLUMNS = [
  'date', 'dryRun', 'harnessSha', 'mode', 'backlogId', 'outcome', 'reason', 'attempts', 'retries',
  'auditVerdict', 'auditRounds', 'itemsTried',
  ...Object.keys(GROUPS).flatMap((g) => [`${g}Turns`, `${g}Tokens`, `${g}WallS`]),
  'findingsR1', 'findingsR2', 'findingsR3', 'findingsR4', 'findingsR5', 'findingsVerified', 'findingsDropped', 'fixesKept', 'fixesDropped',
  'srcLinesBeforeReview', 'srcLinesAfterReview', 'judgePass', 'judgeOverall', ...AXES.map((a) => `judge_${a}`), 'judgeRounds', 'costUsd', 'wallS',
  ...MAINTENANCE, ...OWNER,
];

/** A CSV cell: quoted when it holds a comma, quote or newline. */
export const cell = (v: unknown): string => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const tokens = (u: unknown): number => {
  const x = (u ?? {}) as Json;
  return ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].reduce((n, k) => n + (Number(x[k]) || 0), 0);
};

/** The night's row, in METRICS_COLUMNS order. */
export function metricsRow(runDir: string): string {
  const meta = readJson(join(runDir, 'meta.json')) ?? {};
  const r = readJson(join(runDir, 'result.json')) ?? {};
  const phases = readPhases(runDir);
  const audit = (r.audit ?? null) as Json | null;
  const review = (r.review ?? reviewSummary(readJson(join(runDir, 'review.json')))) as Json | null;
  const per = (review?.perReviewer ?? {}) as Json;
  const judge = (r.judge ?? null) as Json | null;
  const scores = (judge?.scores ?? {}) as Json;
  const loc = (r.loc ?? {}) as Json;
  const lines = (d: unknown): number | null => (d && typeof d === 'object' ? (Number((d as Json).added) || 0) + (Number((d as Json).deleted) || 0) : null);
  const row: Record<string, unknown> = {
    date: r.date ?? meta.date, dryRun: r.dryRun ?? meta.dryRun, harnessSha: meta.harnessSha, mode: meta.ideaType, backlogId: r.backlogId, outcome: r.outcome, reason: r.reason,
    attempts: r.attempts, retries: r.retries,
    auditVerdict: audit?.verdict, auditRounds: audit?.rounds, itemsTried: ((audit?.items ?? []) as Json[]).map((i) => i.id).join(' '),
    findingsVerified: review?.verified, findingsDropped: review?.dropped, fixesKept: review?.fixesKept, fixesDropped: review?.fixesDropped,
    srcLinesBeforeReview: lines(loc.beforeReview), srcLinesAfterReview: lines(loc.afterReview),
    judgePass: judge ? judge.pass : null, judgeOverall: r.judgeScore, judgeRounds: judge?.round, costUsd: r.totalCostUsd,
    wallS: typeof meta.startedAt === 'number' && typeof meta.endedAt === 'number' ? meta.endedAt - meta.startedAt : null,
  };
  const m = (r.maintenance ?? null) as MaintRecord | null;
  if (m) {
    const head = (r.gates ?? {}) as Record<string, boolean>;
    Object.assign(row, {
      surveyFindings: m.survey?.findings, surveyNew: m.survey?.new, surveyStaled: m.survey ? m.survey.staled + m.survey.gone : null,
      listOpen: m.list?.open, listSize: m.list?.size, itemsEligible: m.candidates?.eligible.length, itemsSkippedOverlap: m.candidates?.skipped.length,
      itemsOwnerOnly: m.candidates?.ownerOnly.length, itemsChosen: m.chosen?.length, itemsDone: m.chosen ? doneItems(m).length : null,
      netSrcLines: m.limits?.netSrc, changedFiles: m.limits?.files, changedLines: m.limits?.lines,
      preserveG2: head.G2, preserveG3: head.G3, preserveP1: head.P1, preserveP2: head.P2, limitsM1: head.M1,
    });
  }
  for (const id of ['R1', 'R2', 'R3', 'R4', 'R5']) row[`findings${id}`] = per[id];
  for (const a of AXES) row[`judge_${a}`] = scores[a];
  for (const [g, names] of Object.entries(GROUPS)) {
    const ps = phases.filter((p) => names.includes(p.phase));
    if (!ps.length) continue;
    row[`${g}Turns`] = ps.reduce((n, p) => n + (Number(p.meta?.num_turns) || 0), 0);
    row[`${g}Tokens`] = ps.reduce((n, p) => n + tokens(p.meta?.usage), 0);
    const starts = ps.map((p) => Number(p.harness?.startedAt)).filter(Number.isFinite);
    const ends = ps.map((p) => Number(p.harness?.endedAt)).filter(Number.isFinite);
    if (starts.length && starts.length === ends.length) {
      row[`${g}WallS`] = PARALLEL.has(g) ? Math.max(...ends) - Math.min(...starts) : ends.reduce((n, e, i) => n + e - starts[i]!, 0);
    }
  }
  return METRICS_COLUMNS.map((c) => cell(row[c])).join(',');
}
