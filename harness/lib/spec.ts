// The locked spec (HANDOVER §6.2 step 2): validates ideate's structured output against tonight's
// work, renders spec.md, makes it read-only and hashes it; daily.sh verifies the hash later.

import { readFileSync, writeFileSync } from 'node:fs';
import { hashFile } from '../../guardrails/gates/lib.ts';

/** Kind of night: a backlog item, a Sunday maintenance day, or phase 2 invention. */
export type SpecMode = 'backlog' | 'maintenance' | 'invent';

/** Ideate output, shape of harness/schemas/spec.json. */
export type Spec = {
  backlogId: string | null;
  title: string;
  summary: string;
  acceptanceCriteria: { id: string; text: string }[];
  closestExisting: { item: string; whyDifferent: string }[];
  // plans/full-pipeline.md fields; validateSpec always sets them, older specs have none.
  /** Paths the build expects to add or change; the plan audit checks them against open PRs. */
  expectedFiles?: string[];
  /** Modules this feature retires (deleted with it, never left as dead code). */
  supersedes?: string[];
  /** The owner's play-test of the preview; null on maintenance nights. */
  playtest?: Playtest | null;
};

export type Playtest = { whatYoullSee: string; howToTest: string[] };

/** The structured output in claude's `--output-format json` result (`structured_output`, else `result` as JSON). */
export function extractSpec(claudeResult: unknown): unknown {
  const r = claudeResult as { structured_output?: unknown; result?: unknown } | null;
  if (r?.structured_output !== undefined) return r.structured_output;
  if (typeof r?.result === 'string') {
    try { return JSON.parse(r.result); } catch { /* fall through */ }
  }
  throw new Error('ideate result has no structured output');
}

/**
 * The structured output (`--json-schema`) of one agent call's result.json (a result object, or a
 * message array ending in one), or null when the file is missing, malformed or has none. The one
 * reader for every phase (and daily.sh, via `cli.ts structured`).
 */
export function structuredOutput(resultPath: string): unknown {
  let json: unknown;
  try { json = JSON.parse(readFileSync(resultPath, 'utf8')); } catch { return null; }
  const r = Array.isArray(json) ? json.findLast((m: { type?: unknown } | null) => m?.type === 'result') : json;
  try { return extractSpec(r) ?? null; } catch { return null; }
}

/** A string field of agent output, trimmed; anything else is ''. */
export const trimmed = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`spec: ${what} must be a non-empty string`);
  return v.trim();
};

// The new fields (plans/full-pipeline.md) are required by the schema; specs locked before them
// have none, so absent means empty.
const paths = (v: unknown, what: string, root: RegExp): string[] => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error(`spec: ${what} must be a list of paths`);
  return v.map((p) => {
    const t = str(p, what);
    if (!root.test(t) || t.split('/').includes('..')) throw new Error(`spec: ${what} has a bad path "${t}"`);
    return t;
  });
};
const playtest = (v: unknown): Playtest | null => {
  if (v === undefined || v === null) return null;
  const p = v as { whatYoullSee?: unknown; howToTest?: unknown };
  const steps = Array.isArray(p.howToTest) ? p.howToTest.map((x) => str(x, 'playtest.howToTest')) : [];
  if (!steps.length) throw new Error('spec: playtest.howToTest needs at least one step');
  return { whatYoullSee: str(p.whatYoullSee, 'playtest.whatYoullSee'), howToTest: steps };
};

/** Checks a candidate spec against the schema's rules and tonight's mode / backlog ID; throws if invalid. */
export function validateSpec(x: unknown, mode: SpecMode, backlogId: string | null): Spec {
  const s = x as Record<string, unknown> | null;
  if (!s || typeof s !== 'object') throw new Error('spec: not an object');
  if ((s.backlogId ?? null) !== backlogId) throw new Error(`spec: backlogId must be ${backlogId}, got ${String(s.backlogId)}`);
  const acs = Array.isArray(s.acceptanceCriteria) ? s.acceptanceCriteria : [];
  const near = Array.isArray(s.closestExisting) ? s.closestExisting : [];
  const spec: Spec = {
    backlogId,
    title: str(s.title, 'title'),
    summary: str(s.summary, 'summary'),
    acceptanceCriteria: acs.map((a: { id?: unknown; text?: unknown }, i) => {
      if (a.id !== `AC${i + 1}`) throw new Error(`spec: criterion ${i + 1} must be AC${i + 1}`);
      return { id: a.id, text: str(a.text, `AC${i + 1}`) };
    }),
    closestExisting: near.map((n: { item?: unknown; whyDifferent?: unknown }) => ({ item: str(n.item, 'closestExisting.item'), whyDifferent: str(n.whyDifferent, 'closestExisting.whyDifferent') })),
    expectedFiles: paths(s.expectedFiles, 'expectedFiles', /^(src|tests)\//),
    supersedes: paths(s.supersedes, 'supersedes', /^src\//),
    playtest: playtest(s.playtest),
  };
  if (mode !== 'maintenance' && spec.acceptanceCriteria.length === 0) throw new Error('spec: needs at least one acceptance criterion');
  if (mode === 'invent' && spec.closestExisting.length !== 3) throw new Error('spec: invention needs the 3 closest existing items');
  return spec;
}

/** Renders spec.md. Acceptance criteria read `- **AC<n>**: text`, one per line. */
export function renderSpec(s: Spec, date: string, mode: SpecMode): string {
  const head = mode === 'maintenance' ? 'Maintenance' : (s.backlogId ?? 'Invention');
  const lines = [`# ${head} · ${s.title}`, '', `Date: ${date} · mode: ${mode} · backlog: ${s.backlogId ?? 'none'}`, '', '## Summary', '', s.summary, ''];
  lines.push('## Acceptance criteria', '', ...(s.acceptanceCriteria.length ? s.acceptanceCriteria.map((a) => `- **${a.id}**: ${a.text}`) : ['None (maintenance: behaviour must not change).']), '');
  if (s.closestExisting.length) lines.push('## Closest existing items', '', ...s.closestExisting.map((n) => `- ${n.item}: ${n.whyDifferent}`), '');
  if (s.playtest) lines.push(...renderPlaytest(s.playtest));
  if (s.expectedFiles?.length) lines.push('## Expected files', '', ...s.expectedFiles.map((f) => `- \`${f}\``), '');
  if (s.supersedes?.length) lines.push('## Supersedes', '', 'Retired and deleted by this feature:', '', ...s.supersedes.map((f) => `- \`${f}\``), '');
  return lines.join('\n');
}

/** The owner's play-test sections, as spec.md and the PR body show them. */
export function renderPlaytest(p: Playtest): string[] {
  return ['## What you\'ll see', '', p.whatYoullSee, '', '## How to play-test', '', ...p.howToTest.map((step, i) => `${i + 1}. ${step}`), ''];
}

/**
 * Acceptance criteria that name internals instead of a public seam (file paths, `name()` calls,
 * private members). Advisory: the harness hands the hits to the plan auditor, which decides.
 */
export function internalsLint(s: Pick<Spec, 'acceptanceCriteria'>): string[] {
  const seam = /^(window\.__racer|__racer|RaceView|CarInput|document|localStorage)\b/;
  return s.acceptanceCriteria.flatMap(({ id, text }) => {
    const hits = [
      ...[...text.matchAll(/\b(?:src|tests)\/[\w./-]+|\b[\w-]+\.(?:ts|tsx|js|css)\b/g)].map((m) => m[0]),
      ...[...text.matchAll(/\b([\w$.]+)\(\)?/g)].map((m) => m[1]!).filter((n) => /[a-z][A-Z]|\.|^_/.test(n) && !seam.test(n)),
    ];
    return hits.length ? [`${id} names internals: ${[...new Set(hits)].join(', ')}`] : [];
  });
}

/** Writes `text` to `path` read-only (0444) and returns its SHA-256. Refuses to overwrite. */
export function lockSpec(path: string, text: string): string {
  writeFileSync(path, text, { mode: 0o444, flag: 'wx' });
  return hashFile(path)!;
}
