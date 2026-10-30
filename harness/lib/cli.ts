// Command-line entry for the bash harness (daily.sh, dry-run-report.sh), run in the toolchain
// container via ts_node in harness/lib/common.sh, with harness/config.env as its environment.
// Commands that hand values back to bash print `KEY='value'` lines for `eval`. Exit 1 = a checked
// condition failed, 2 = usage error.
//
//   windows <nowSec> [--manual]                        DATE SUNDAY REFUSED NO_NEW_PHASE_AT HARD_AT
//   pick <sunday 0|1> <backlog.md> <ledger.json> <item-out.md> <meta.json> [<prs.json>]
//                                                      KIND ITEM_ID ITEM_TITLE; with prs.json (live)
//                                                      state comes from the daily PRs, ledger untouched
//   allowed <diff-raw> <numstat> <today> <maintenance 0|1>   G8's diff rules; exit 1 + reasons on a violation
//   prbody <run-dir> <preview-url>                     markdown PR body
//   spec <claude-result.json> <spec.md> <date> <mode> <backlogId|-> <meta.json>
//                                                      locks spec.md, prints (and records) its sha256
//   feedback <gates.json>                              failed-gate text for the retry prompt
//   redact <dir>...                                    token on stdin; exit 1 if it couldn't be scrubbed
//   result <run-dir> <outcome> [reason]                writes <run-dir>/result.json
//   report <run-dir>                                   markdown dry-run report

import { readFileSync, writeFileSync } from 'node:fs';
import { runWindows } from './time.ts';
import { checkDiff } from './allowlist.ts';
import { chooseWork, parseBacklog, prState, type DailyPr } from './picker.ts';
import { redact } from './redact.ts';
import { extractSpec, lockSpec, renderSpec, validateSpec, type SpecMode } from './spec.ts';
import { buildResult, gateFeedback, prBody, readJson, report } from './journal.ts';

/** Single-quotes a value for bash `eval`. */
export const q = (v: unknown): string => `'${String(v).replace(/'/g, `'\\''`)}'`;
const vars = (o: Record<string, unknown>): void => console.log(Object.entries(o).map(([k, v]) => `${k}=${q(v)}`).join('\n'));
const json = (path: string, data: unknown): void => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
const merge = (path: string, data: object): void => json(path, { ...readJson<object>(path), ...data });
const env = (key: string): string => process.env[key] || (() => { throw new Error(`config.env: ${key} missing`); })();

const [cmd, ...a] = process.argv.slice(2);
if (import.meta.main) {
  switch (cmd) {
    case 'windows': {
      const c = { tz: env('TZ_NAME'), startAt: env('START_AT'), startCutoff: env('START_CUTOFF'), noNewPhaseAfter: env('NO_NEW_PHASE_AFTER'), hardDeadline: env('HARD_DEADLINE') };
      const w = runWindows(Number(a[0]) * 1000, c, a[1] === '--manual');
      vars({ DATE: w.date, SUNDAY: w.sunday ? 1 : 0, REFUSED: w.refused ?? '', NO_NEW_PHASE_AT: w.noNewPhaseAt, HARD_AT: w.hardDeadlineAt });
      break;
    }
    case 'pick': {
      const [sunday, backlog, ledger, itemOut, meta, prs] = a as [string, string, string, string, string, string?];
      // Dry runs read no GitHub state, so nothing counts as merged and the ledger rotates.
      const live = prs === undefined ? null : prState(readJson<DailyPr[]>(prs) ?? (() => { throw new Error(`${prs}: not a PR list`); })());
      const tried = live?.tried ?? readJson<{ tried?: string[] }>(ledger)?.tried ?? [];
      const w = chooseWork(sunday === '1', parseBacklog(readFileSync(backlog, 'utf8')), live?.merged ?? new Set(), tried, !live);
      const id = w.kind === 'backlog' ? w.item.id : '';
      if (w.kind === 'backlog') {
        if (!live) json(ledger, { tried: w.tried });
        writeFileSync(itemOut, w.item.text + '\n');
      }
      merge(meta, { phase: 1, ideaType: w.kind, backlogId: id || null });
      vars({ KIND: w.kind, ITEM_ID: id, ITEM_TITLE: w.kind === 'backlog' ? w.item.title : '' });
      break;
    }
    case 'spec': {
      const [result, out, date, mode, id, meta] = a as [string, string, string, SpecMode, string, string];
      const specSha256 = lockSpec(out, renderSpec(validateSpec(extractSpec(readJson(result)), mode, id === '-' ? null : id), date, mode));
      merge(meta, { specSha256 });
      console.log(specSha256);
      break;
    }
    case 'feedback':
      process.stdout.write(gateFeedback(a[0]!));
      break;
    case 'redact': {
      const left = redact(a, readFileSync(0, 'utf8').trim());
      for (const f of left) console.error(`token still in ${f}`);
      process.exit(left.length ? 1 : 0);
      break;
    }
    case 'result':
      json(`${a[0]!}/result.json`, buildResult(a[0]!, a[1]!, a[2] || null));
      break;
    case 'allowed': {
      const bad = checkDiff(readFileSync(a[0]!, 'utf8'), readFileSync(a[1]!, 'utf8'), { today: a[2]!, maintenance: a[3] === '1' });
      for (const b of bad) console.error(b);
      process.exit(bad.length ? 1 : 0);
      break;
    }
    case 'prbody':
      process.stdout.write(prBody(a[0]!, env('TZ_NAME'), a[1]!));
      break;
    case 'report':
      process.stdout.write(report(a[0]!, env('TZ_NAME')));
      break;
    default:
      console.error(`cli.ts: unknown command ${String(cmd)}`);
      process.exit(2);
  }
}
