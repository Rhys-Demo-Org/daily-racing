// Shared helpers for gate scripts (guardrails/gates/*.ts). Gate code always runs from main's
// checkout; verdict scripts never import branch code. Plain Node 24, stdlib only.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

/** What a verdict script writes; harness/scripts/run-gates.sh turns these into gates.json. */
export interface GateResult {
  pass: boolean;
  /** One line for the gate table. */
  summary: string;
  /** Text fed back to the builder on failure. */
  details: string;
}

export type Flags = Record<string, string | boolean | undefined>;

/** `--name value` flags of this script; a flag followed by another flag (or nothing) is `true`. */
export function cli(argv = process.argv.slice(2)): { flags: Flags } {
  const flags: Flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    const next = argv[i + 1];
    const bare = next === undefined || next.startsWith('--');
    flags[a.slice(2)] = bare ? true : next;
    if (!bare) i++;
  }
  return { flags };
}

/** A required string flag. */
export function flag(flags: Flags, name: string): string {
  const v = flags[name];
  if (typeof v !== 'string') throw new Error(`missing --${name}`);
  return v;
}

/** `f()`, or null when it throws. */
export function attempt<T>(f: () => T): T | null {
  try {
    return f();
  } catch {
    return null;
  }
}

/** A file's text, or null when it is missing or unreadable. */
export const readText = (path: string): string | null => attempt(() => readFileSync(path, 'utf8'));

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** SHA-256 hex of a file, or null when it is missing or unreadable. */
export const hashFile = (path: string): string | null => attempt(() => createHash('sha256').update(readFileSync(path)).digest('hex'));

/** Ids (file names minus `.json`) of the `*.json` files in `dir`, sorted; empty when it doesn't exist. */
export const jsonFiles = (dir: string): string[] =>
  attempt(() => readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => f.slice(0, -5))) ?? [];

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** The last `max` characters of `text`. */
export const tail = (text: string, max = 4000): string => (text.length > max ? `…${text.slice(-max)}` : text);

/**
 * Loads a measure container's stdout (`--measure`, `--exit`, `--stderr`): its last line as JSON,
 * which must carry this run's `--nonce`. Returns the failing result to write instead when the
 * measurement crashed, timed out, printed malformed JSON or lacks the nonce.
 */
export function loadMeasure<T>(flags: Flags): T | GateResult {
  try {
    if (flags['exit'] !== '0') throw new Error(`measure exited ${String(flags['exit'])}`);
    const text = readText(flag(flags, 'measure')) ?? '';
    const v = JSON.parse(text.slice(text.lastIndexOf('\n', text.length - 2) + 1)) as T & { nonce?: unknown };
    if (flags['nonce'] === '' || v?.nonce !== flag(flags, 'nonce')) throw new Error("last line does not carry this run's nonce");
    return v;
  } catch (e) {
    return { pass: false, summary: `measurement failed: ${(e as Error).message}`, details: tail(readText(String(flags['stderr'])) ?? '') };
  }
}

export const isResult = (v: unknown): v is GateResult =>
  typeof v === 'object' && v !== null && typeof (v as GateResult).pass === 'boolean' && typeof (v as GateResult).summary === 'string';

/**
 * Flags and measurement of a verdict script: `--out <result.json>`, or (g2/g3, from rebaseline.sh)
 * `--baseline <file>` to write a baseline instead. A failed measurement ends the script here:
 * written as the result, or thrown in baseline mode.
 */
export function verdictArgs<T>(argv?: string[]): { flags: Flags; m: T; out: string; baseline: string | null } {
  const { flags } = cli(argv);
  const baseline = typeof flags['baseline'] === 'string' ? flags['baseline'] : null;
  const out = baseline === null ? flag(flags, 'out') : '';
  const m = loadMeasure<T>(flags);
  if (isResult(m)) {
    if (baseline !== null) throw new Error(`${m.summary}\n${m.details}`);
    finish(out, m);
  }
  return { flags, m, out, baseline };
}

/** The problem to report when a baseline was recorded with another Node, image (or `was` ≠ `now`). */
export function toolchainProblem(base: { node: string; image: string }, image: string, was = '', now = ''): string[] {
  if (base.node === process.version && base.image === image && was === now) return [];
  return [`toolchain mismatch: baseline from ${base.node} / ${base.image}${was}, now ${process.version} / ${image}${now} (owner: harness/scripts/rebaseline.sh)`];
}

/** Writes the verdict and exits 0 (the result file, not the exit code, carries pass/fail). */
export function finish(out: string, result: GateResult): never {
  writeFileSync(out, JSON.stringify(result, null, 2));
  process.exit(0);
}

/** One result from a list of problems: pass when empty. */
export function verdict(problems: readonly string[], okSummary: string, failSummary: (n: number) => string): GateResult {
  return problems.length === 0
    ? { pass: true, summary: okSummary, details: '' }
    : { pass: false, summary: failSummary(problems.length), details: problems.join('\n') };
}

/** Prints one JSON line, stamped with the run's nonce, to stdout: the only channel out of a measure container. */
export function emit(value: object): void {
  process.stdout.write(`\n${JSON.stringify({ nonce: process.env['GATE_NONCE'], ...value })}\n`);
}
