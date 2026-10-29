// Command-line entry for the bash harness (daily.sh, dry-run-report.sh), run in the toolchain
// container via ts_node in harness/lib/common.sh. Commands that hand values back to bash print
// `KEY='value'` lines for `eval`. Exit 1 = a checked condition failed, 2 = usage error.
//
//   windows <nowSec> [--manual]                       DATE SUNDAY REFUSED NO_NEW_PHASE_AT HARD_AT
//   pick <sunday 0|1> <backlog.md> <ledger.json> <item-out.md>        KIND ITEM_ID ITEM_TITLE
//   spec <claude-result.json> <spec.md> <date> <mode> <backlogId|->   prints sha256 (locks spec.md)
//   spec-verify <spec.md> <sha256>
//   set <file.json> key=string | key:=json ...        merge keys into a JSON file (created if missing)
//   feedback <gates.json>                             failed-gate text; exit 0 only if gates passed
//   result <run-dir> <outcome> [reason]               writes <run-dir>/result.json
//   report <run-dir>                                  markdown dry-run report

import { readFileSync, writeFileSync } from 'node:fs';
import { need, readConfig } from './config.ts';
import { runWindows } from './time.ts';
import { chooseWork, parseBacklog } from './picker.ts';
import { extractSpec, lockSpec, renderSpec, validateSpec, verifySpec, type SpecMode } from './spec.ts';
import { buildResult, gateFeedback, readGates, readJson, report } from './journal.ts';

const q = (v: unknown): string => `'${String(v).replace(/'/g, `'\\''`)}'`;
const vars = (o: Record<string, unknown>): void => console.log(Object.entries(o).map(([k, v]) => `${k}=${q(v)}`).join('\n'));
const json = (path: string, data: unknown): void => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

const [cmd, ...a] = process.argv.slice(2);
const cfg = readConfig();
const tz = need(cfg, 'TZ_NAME');

switch (cmd) {
  case 'windows': {
    const w = runWindows(Number(a[0]) * 1000, { tz, startAt: need(cfg, 'START_AT'), startCutoff: need(cfg, 'START_CUTOFF'), noNewPhaseAfter: need(cfg, 'NO_NEW_PHASE_AFTER'), hardDeadline: need(cfg, 'HARD_DEADLINE') }, a[1] === '--manual');
    vars({ DATE: w.date, SUNDAY: w.sunday ? 1 : 0, REFUSED: w.refused ?? '', NO_NEW_PHASE_AT: w.noNewPhaseAt, HARD_AT: w.hardDeadlineAt });
    break;
  }
  case 'pick': {
    const [sunday, backlog, ledger, itemOut] = a as [string, string, string, string];
    const tried = readJson<{ tried?: string[] }>(ledger)?.tried ?? [];
    // Thin dry runs read no GitHub state, so nothing counts as merged.
    const w = chooseWork(sunday === '1', parseBacklog(readFileSync(backlog, 'utf8')), new Set(), tried);
    if (w.kind === 'backlog') {
      json(ledger, { tried: w.tried });
      writeFileSync(itemOut, w.item.text + '\n');
    }
    vars({ KIND: w.kind, ITEM_ID: w.kind === 'backlog' ? w.item.id : '', ITEM_TITLE: w.kind === 'backlog' ? w.item.title : '' });
    break;
  }
  case 'spec': {
    const [result, out, date, mode, id] = a as [string, string, string, SpecMode, string];
    const spec = validateSpec(extractSpec(readJson(result)), mode, id === '-' ? null : id);
    console.log(lockSpec(out, renderSpec(spec, date, mode)));
    break;
  }
  case 'spec-verify':
    process.exit(verifySpec(a[0]!, a[1]!) ? 0 : 1);
    break;
  case 'set': {
    const [file, ...pairs] = a as [string, ...string[]];
    const data = readJson(file) ?? {};
    for (const p of pairs) {
      const m = /^(\w+)(:?)=(.*)$/s.exec(p);
      if (!m) throw new Error(`set: bad pair ${p}`);
      data[m[1]!] = m[2] ? JSON.parse(m[3]!) : m[3];
    }
    json(file, data);
    break;
  }
  case 'feedback':
    process.stdout.write(gateFeedback(a[0]!));
    process.exit(readGates(a[0]!)?.pass === true ? 0 : 1);
    break;
  case 'result':
    json(`${a[0]!}/result.json`, buildResult(a[0]!, a[1]!, a[2] || null));
    break;
  case 'report':
    process.stdout.write(report(a[0]!, tz));
    break;
  default:
    console.error(`cli.ts: unknown command ${String(cmd)}`);
    process.exit(2);
}
