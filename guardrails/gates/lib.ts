// Shared helpers for gate scripts (guardrails/gates/*.ts). Gate code always runs from main's
// checkout; verdict scripts never import branch code. Plain Node 24, stdlib only.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

/** What a verdict script writes; harness/scripts/run-gates.sh turns these into gates.json. */
export interface GateResult {
  pass: boolean;
  /** One line for the gate table. */
  summary: string;
  /** Text fed back to the builder on failure. */
  details: string;
}

/** `--name value` flags of this script; a flag followed by another flag (or nothing) is `true`. */
export function cli(argv = process.argv.slice(2)): { flags: Record<string, string | boolean | undefined> } {
  const flags: Record<string, string | boolean> = {};
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
export function flag(flags: Record<string, string | boolean | undefined>, name: string): string {
  const v = flags[name];
  if (typeof v !== 'string') throw new Error(`missing --${name}`);
  return v;
}

export const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

/** `*.json` file names in `dir`, sorted (empty when the folder doesn't exist). */
export function jsonFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  } catch {
    return [];
  }
}

export function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

/** The last `max` characters of `text`. */
export const tail = (text: string, max = 4000): string => (text.length > max ? `…${text.slice(-max)}` : text);

/**
 * Loads a measure container's stdout (`--measure`, `--exit`, `--stderr`), or returns the failing
 * result to write when the measurement crashed, timed out or printed malformed JSON.
 */
export function loadMeasure<T>(flags: Record<string, string | boolean | undefined>): T | GateResult {
  const exit = flags['exit'];
  let stderr = '';
  try {
    stderr = readFileSync(flag(flags, 'stderr'), 'utf8');
  } catch {
    /* missing stderr is reported with the rest */
  }
  try {
    if (exit !== '0') throw new Error(`measure exited ${String(exit)}`);
    const text = readFileSync(flag(flags, 'measure'), 'utf8');
    return JSON.parse(text.slice(text.lastIndexOf('\n', text.length - 2) + 1)) as T;
  } catch (e) {
    return { pass: false, summary: `measurement failed: ${(e as Error).message}`, details: tail(stderr) };
  }
}

export const isResult = (v: unknown): v is GateResult =>
  typeof v === 'object' && v !== null && typeof (v as GateResult).pass === 'boolean' && typeof (v as GateResult).summary === 'string';

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

/** Prints one JSON line to stdout: the only channel out of a measure container. */
export function emit(value: unknown): void {
  process.stdout.write(`\n${JSON.stringify(value)}\n`);
}
