// The locked spec (HANDOVER §6.2 step 2): validates ideate's structured output against tonight's
// work, renders spec.md, makes it read-only and hashes it; later phases verify the hash.

import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Kind of night: a backlog item, a Sunday maintenance day, or phase 2 invention. */
export type SpecMode = 'backlog' | 'maintenance' | 'invent';

/** Ideate output, shape of harness/schemas/spec.json. */
export type Spec = {
  backlogId: string | null;
  title: string;
  summary: string;
  acceptanceCriteria: { id: string; text: string }[];
  closestExisting: { item: string; whyDifferent: string }[];
};

/** The structured output in claude's `--output-format json` result (`structured_output`, else `result` as JSON). */
export function extractSpec(claudeResult: unknown): unknown {
  const r = claudeResult as { structured_output?: unknown; result?: unknown } | null;
  if (r?.structured_output !== undefined) return r.structured_output;
  if (typeof r?.result === 'string') {
    try { return JSON.parse(r.result); } catch { /* fall through */ }
  }
  throw new Error('ideate result has no structured output');
}

const str = (v: unknown, what: string): string => {
  if (typeof v !== 'string' || v.trim() === '') throw new Error(`spec: ${what} must be a non-empty string`);
  return v.trim();
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
  return lines.join('\n');
}

/** SHA-256 hex of a string or buffer. */
export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');

/** Writes `text` to `path`, makes it read-only (a-w) and returns its SHA-256. Refuses to overwrite. */
export function lockSpec(path: string, text: string): string {
  if (existsSync(path)) throw new Error(`spec: ${path} already exists`);
  writeFileSync(path, text, { mode: 0o444 });
  chmodSync(path, 0o444);
  return sha256(text);
}

/** True if the file at `path` still hashes to `sha`. */
export function verifySpec(path: string, sha: string): boolean {
  return existsSync(path) && sha256(readFileSync(path)) === sha;
}
