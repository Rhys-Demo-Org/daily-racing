// Classifies one `claude -p --output-format json` call and writes its meta.json (agent-run.sh).
//   node harness/lib/classify.ts <out-dir> <claude-exit> <phase> <model> <wall-ms> [--timed-out]
// Reads <out-dir>/result.json, writes <out-dir>/meta.json, exits with agent-run.sh's exit code.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJson } from './journal.ts';

export type AgentClass = 'ok' | 'usage-limit' | 'max-turns' | 'error';

/** agent-run.sh exit code per class; unrecognised errors stop the night like a usage limit. */
export const EXIT_CODE: Record<AgentClass | 'timeout', number> = {
  ok: 0, 'usage-limit': 10, error: 10, 'max-turns': 11, timeout: 12,
};

const LIMIT = /usage limit|rate limit|rate_limit|\b429\b|overloaded/i;

type Result = Record<string, unknown>;

/** The final `type: "result"` object (a bare object, or the last one in an array of messages). */
function resultObject(json: unknown): Result | undefined {
  const items = Array.isArray(json) ? json : [json];
  const isResult = (v: unknown): v is Result =>
    typeof v === 'object' && v !== null && (v as Result)['type'] === 'result';
  return items.findLast(isResult);
}

/** Classifies a parsed result (or `undefined` when output was missing or not JSON). */
export function classify(resultJson: unknown, exitCode: number): AgentClass {
  const r = resultObject(resultJson);
  if (!r) return 'error';
  if (r['subtype'] === 'error_max_turns') return 'max-turns';
  if (exitCode === 0 && r['subtype'] === 'success' && r['is_error'] === false) return 'ok';
  return LIMIT.test(JSON.stringify(r)) ? 'usage-limit' : 'error';
}

if (import.meta.main) {
  const [outDir = '', exitArg = '', phase = '', model = '', wallArg = ''] = process.argv.slice(2);
  const json = readJson<unknown>(join(outDir, 'result.json')); // null when missing or malformed: an error
  const cls = process.argv.includes('--timed-out') ? 'timeout' : classify(json, Number(exitArg));
  const r = resultObject(json);
  const meta = {
    phase, model, exit: EXIT_CODE[cls], class: cls, claudeExit: Number(exitArg), wallMs: Number(wallArg),
    usage: r?.['usage'] ?? null, total_cost_usd: r?.['total_cost_usd'] ?? null, num_turns: r?.['num_turns'] ?? null,
  };
  writeFileSync(join(outDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);
  console.log(cls);
  process.exitCode = EXIT_CODE[cls];
}
