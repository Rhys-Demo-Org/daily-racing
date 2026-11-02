// Command-line entry for the bash harness (daily.sh, dry-run-report.sh), run in the toolchain
// container via ts_node in harness/lib/common.sh, with harness/config.env as its environment.
// Commands that hand values back to bash print `KEY='value'` lines for `eval`. Exit 1 = a checked
// condition failed, 2 = usage error.
//
//   windows <nowSec> [--manual]                        DATE SUNDAY REFUSED NO_NEW_PHASE_AT HARD_AT
//   pick <sunday 0|1> <backlog.md> <ledger.json> <item-out.md> <meta.json> [<prs.json>] [--skip=B01,B02]
//                                                      KIND ITEM_ID ITEM_TITLE; with prs.json (live)
//                                                      state comes from the daily PRs, ledger untouched;
//                                                      --skip: items deferred or rejected tonight
//   existing <prs.json|-> <backlog.md> <owner> <out.md> <open-files.json>   existing-work list
//   draft <claude-result.json> <dir> <date> <mode> <backlogId|-> <open-files.json>
//                                                      dir/{draft.json,draft.md,overlap.md,lint.md}; OVERLAP
//   audit <claude-result.json> <overlap-count> <round> <out.json> <out.md>   VERDICT WAITS_ON
//   revise <audit.json>                                the revise brief for a fresh ideate
//   lock <draft.json> <audit.md> <spec.md> <spec.json> <date> <mode> <meta.json>   locks; prints sha256
//   inventory <repo> <changed.txt> <out-dir>          out-dir/{inventory.md,clones.md}
//   findings <review.json> <phases-dir> <R1,R2,...>    reviewer findings → review.json; COUNT
//   rulings <review.json> <verify-result.json> <written.txt> <max-fixes> <queue.txt>   VERIFIED
//   fixbrief <review.json> <id> <verify-tests-dir>     the brief for one fix agent
//   fixrecord <review.json> <id> <fix-result.json> <commit|->
//   fixkept <review.json> <id> <0|1>                   the gates' fate for that fix
//   reviewmd <review.json>                             review.md
//   planted <diff.patch>                               added lines aimed at an AI reader
//   judge <gates-pass 0|1> <blind-result> <check-result> <scan.txt> <round> <out.json> <out.md>   PASS
//   judgebrief <judge.json>                            the judge fix round's brief
//   metrics <run-dir> [--header]                       metrics.csv row (and header)
//   allowed <diff-raw> <numstat> <today> <maintenance 0|1>   G8's diff rules; exit 1 + reasons on a violation
//   prbody <run-dir> <preview-url>                     markdown PR body
//   spec <claude-result.json> <spec.md> <date> <mode> <backlogId|-> <meta.json>
//                                                      locks spec.md, prints (and records) its sha256
//   feedback <gates.json>                              failed-gate text for the retry prompt
//   structured <claude-result.json>                    the agent's structured output as JSON, or null
//   redact <dir>...                                    token on stdin; exit 1 if it couldn't be scrubbed
//   result <run-dir> <outcome> [reason]                writes <run-dir>/result.json
//   report <run-dir>                                   markdown dry-run report

import { readFileSync, writeFileSync } from 'node:fs';
import { runWindows } from './time.ts';
import { checkDiff } from './allowlist.ts';
import { chooseWork, parseBacklog, prState, type DailyPr } from './picker.ts';
import { redact } from './redact.ts';
import { lockSpec, renderSpec, structuredOutput, validateSpec, type SpecMode } from './spec.ts';
import { buildResult, gateFeedback, prBody, readJson, report } from './journal.ts';
import { existingWork, fileOverlap, openFiles, renderOverlap, type GhPr, type OpenFiles } from './existing.ts';
import { checkAudit, renderAudit, reviseBrief, type Audit } from './audit.ts';
import { internalsLint, type Spec } from './spec.ts';
import { checkRulings, fixBrief, fixQueue, readFindings, readFix, reviewMd, type ReviewState } from './review.ts';
import { judgeBrief, judgeVerdict, readBlind, readCheck, renderJudge, scanPlanted, type JudgeVerdict } from './judge.ts';
import { cloneReport, exportInventory, sourceFiles } from './inventory.ts';
import { METRICS_COLUMNS, metricsRow } from './metrics.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Single-quotes a value for bash `eval`. */
export const q = (v: unknown): string => `'${String(v).replace(/'/g, `'\\''`)}'`;
const vars = (o: Record<string, unknown>): void => console.log(Object.entries(o).map(([k, v]) => `${k}=${q(v)}`).join('\n'));
const json = (path: string, data: unknown): void => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
const merge = (path: string, data: object): void => json(path, { ...readJson<object>(path), ...data });
const env = (key: string): string => process.env[key] || (() => { throw new Error(`config.env: ${key} missing`); })();

const [cmd, ...args] = process.argv.slice(2);
const skip = args.find((x) => x.startsWith('--skip='))?.slice(7).split(',').filter(Boolean) ?? [];
const a = args.filter((x) => !x.startsWith('--skip='));
const review = (path: string): ReviewState => readJson<ReviewState>(path) ?? { reviewers: {}, findings: [], rulings: [], fixes: [], notes: [] };
const specOutput = (result: string): unknown => structuredOutput(result) ?? (() => { throw new Error('ideate result has no structured output'); })();
const lines = (path: string): string[] => (existsSync(path) ? readFileSync(path, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean) : []);
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
      // Items deferred or rejected by tonight's plan audit are passed over (a soft dependency);
      // the dry-run ledger still rotates through what is left.
      const items = parseBacklog(readFileSync(backlog, 'utf8'));
      const w = chooseWork(sunday === '1', items.filter((i) => !skip.includes(i.id)), live?.merged ?? new Set(), tried.filter((t) => !skip.includes(t)), !live);
      const id = w.kind === 'backlog' ? w.item.id : '';
      if (w.kind === 'backlog') {
        if (!live) json(ledger, { tried: [...new Set([...tried.filter((t) => skip.includes(t)), ...w.tried])] });
        writeFileSync(itemOut, w.item.text + '\n');
      }
      merge(meta, { phase: 1, ideaType: w.kind, backlogId: id || null });
      vars({ KIND: w.kind, ITEM_ID: id, ITEM_TITLE: w.kind === 'backlog' ? w.item.title : '' });
      break;
    }
    case 'spec': {
      const [result, out, date, mode, id, meta] = a as [string, string, string, SpecMode, string, string];
      const specSha256 = lockSpec(out, renderSpec(validateSpec(specOutput(result), mode, id === '-' ? null : id), date, mode));
      merge(meta, { specSha256 });
      console.log(specSha256);
      break;
    }
    case 'existing': {
      const [prsPath, backlog, owner, out, open] = a as [string, string, string, string, string];
      const prs = prsPath === '-' ? [] : readJson<GhPr[]>(prsPath) ?? [];
      writeFileSync(out, existingWork(prs, parseBacklog(readFileSync(backlog, 'utf8')), owner));
      json(open, openFiles(prs, owner));
      break;
    }
    case 'draft': {
      const [result, dir, , mode, id, open] = a as [string, string, string, SpecMode, string, string];
      let spec: Spec;
      try { spec = validateSpec(specOutput(result), mode, id === '-' ? null : id); } catch (e) { console.error(String(e)); process.exit(1); }
      const overlap = fileOverlap(spec.expectedFiles ?? [], readJson<OpenFiles[]>(open) ?? []);
      json(join(dir, 'draft.json'), spec);
      writeFileSync(join(dir, 'draft.md'), renderSpec(spec, a[2]!, mode));
      writeFileSync(join(dir, 'overlap.md'), renderOverlap(overlap));
      const lint = internalsLint(spec);
      writeFileSync(join(dir, 'lint.md'), lint.length ? lint.map((l) => `- ${l}`).join('\n') + '\n' : 'None.\n');
      vars({ OVERLAP: overlap.length });
      break;
    }
    case 'audit': {
      const [result, count, round, out, md] = a as [string, string, string, string, string];
      const audit = checkAudit(structuredOutput(result), Number(count)); // invalid output: a reject
      json(out, audit);
      writeFileSync(md, renderAudit(audit, Number(round)));
      vars({ VERDICT: audit.verdict, WAITS_ON: audit.waitsOn ?? '' });
      break;
    }
    case 'revise':
      process.stdout.write(reviseBrief(readJson<Audit>(a[0]!)!));
      break;
    case 'lock': {
      const [draft, auditMd, out, specJson, date, mode, meta] = a as [string, string, string, string, string, SpecMode, string];
      const spec = readJson<Spec>(draft)!;
      const specSha256 = lockSpec(out, `${renderSpec(spec, date, mode)}\n${readFileSync(auditMd, 'utf8')}`);
      json(specJson, spec);
      merge(meta, { specSha256 });
      console.log(specSha256);
      break;
    }
    case 'inventory': {
      const [repo, changed, out] = a as [string, string, string];
      const files = sourceFiles(repo);
      writeFileSync(join(out, 'inventory.md'), exportInventory(repo, files));
      writeFileSync(join(out, 'clones.md'), cloneReport(repo, files, lines(changed)));
      break;
    }
    case 'findings': {
      const [state, phases, ids] = a as [string, string, string];
      const s = review(state);
      for (const id of ids.split(',')) {
        const f = readFindings(id, join(phases, `${id.toLowerCase()}-1`, 'result.json'));
        s.reviewers[id] = f ? 'ok' : 'failed';
        s.findings.push(...(f ?? []));
      }
      json(state, s);
      vars({ COUNT: s.findings.length });
      break;
    }
    case 'rulings': {
      const [state, result, written, max, queue] = a as [string, string, string, string, string];
      const s = review(state);
      const raw = structuredOutput(result);
      if (raw === null) s.notes.push('The verifier returned no valid output, so every finding was dropped.');
      s.rulings = checkRulings(raw, s.findings, lines(written));
      const q = fixQueue(s.findings, s.rulings, Number(max));
      const verified = s.rulings.filter((r) => r.status === 'verified').length;
      if (verified > q.length) s.notes.push(`${verified - q.length} verified finding(s) beyond the ${max}-fix limit were not fixed.`);
      json(state, s);
      writeFileSync(queue, q.map((f) => f.id).join('\n') + (q.length ? '\n' : ''));
      vars({ VERIFIED: verified });
      break;
    }
    case 'fixbrief': {
      const [state, id, tests] = a as [string, string, string];
      const s = review(state);
      const f = s.findings.find((x) => x.id === id) ?? (() => { throw new Error(`no finding ${id}`); })();
      const r = s.rulings.find((x) => x.id === id);
      const src = r?.testFile && existsSync(join(tests, r.testFile)) ? readFileSync(join(tests, r.testFile), 'utf8') : null;
      process.stdout.write(fixBrief(f, r, src));
      break;
    }
    case 'fixrecord': {
      const [state, id, result, commit] = a as [string, string, string, string];
      const s = review(state);
      const rec = readFix(id, result);
      if (commit === '-') { if (rec.status === 'fixed') rec.status = 'no-change'; } else rec.commit = commit;
      s.fixes = [...s.fixes.filter((x) => x.id !== id), rec];
      json(state, s);
      break;
    }
    case 'fixkept': {
      const s = review(a[0]!);
      for (const f of s.fixes) if (f.id === a[1]) f.kept = a[2] === '1';
      json(a[0]!, s);
      break;
    }
    case 'reviewmd':
      process.stdout.write(reviewMd(review(a[0]!)));
      break;
    case 'planted':
      process.stdout.write(scanPlanted(readFileSync(a[0]!, 'utf8')).map((l) => `${l}\n`).join(''));
      break;
    case 'judge': {
      const [gatesPass, blind, check, scan, round, out, md] = a as [string, string, string, string, string, string, string];
      const v = judgeVerdict(gatesPass === '1', readBlind(blind), readCheck(check), lines(scan));
      json(out, v);
      writeFileSync(md, renderJudge(v, Number(round)));
      vars({ PASS: v.pass ? 1 : 0 });
      break;
    }
    case 'judgebrief':
      process.stdout.write(judgeBrief(readJson<JudgeVerdict>(a[0]!)!));
      break;
    case 'metrics':
      if (a[1] === '--header') console.log(METRICS_COLUMNS.join(','));
      console.log(metricsRow(a[0]!));
      break;
    case 'structured':
      console.log(JSON.stringify(structuredOutput(a[0]!)));
      break;
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
