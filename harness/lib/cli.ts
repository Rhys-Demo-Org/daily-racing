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
//   existing <prs.json|-> <backlog.md> <owner> <out.md> <open-files.json> [<owner-prs.json|->]
//                                                      existing-work list; open files of the daily PRs
//                                                      and the owner's other open PRs
//   draft <claude-result.json> <dir> <date> <mode> <backlogId|-> <open-files.json>
//                                                      dir/{draft.json,draft.md,overlap.md,lint.md}; OVERLAP
//   audit <claude-result.json> <overlap-count> <round> <out.json> <out.md>   VERDICT WAITS_ON
//   revise <audit.json>                                the revise brief for a fresh ideate
//   lock <draft.json> <audit.md> <spec.md> <spec.json> <date> <mode> <meta.json>   locks; prints sha256
//   inventory <repo> <changed.txt> <out-dir>          out-dir/{inventory.md,clones.md}
//   findings <review.json> <phases-dir> <R1,R2,...> [--failed=R3,...]   reviewer findings → review.json; COUNT
//                                                      (--failed: agent errors, recorded failed, findings ignored)
//   rulings <review.json> <verify-result.json> <written.txt> <max-fixes> <queue.txt>   VERIFIED
//   fixbrief <review.json> <id> <verify-tests-dir>     the brief for one fix agent
//   fixrecord <review.json> <id> <fix-result.json> <commit|->
//   fixkept <review.json> <id> <0|1>                   the gates' fate for that fix
//   fixstatus <fix-result.json>                        FIX_STATUS: fixed | not-fixed | agent-error
//   reviewmd <review.json> [--for-check]               review.md (--for-check: dropped findings only counted)
//   notreviewed <review.json> <reason>                 marks every reviewer skipped (PR: "Not reviewed")
//   planted <diff.patch>                               added lines aimed at an AI reader
//   judge <gates-pass 0|1> <blind-result> <check-result> <scan.txt> <round> <out.json> <out.md>   PASS
//   judgebrief <judge.json>                            the judge fix round's brief
//   metrics <run-dir> [--header]                       metrics.csv row (and header)
//   metricsheader                                      the metrics.csv header line
//   allowed <diff-raw> <numstat> <today> <maintenance 0|1>   G8's diff rules; exit 1 + reasons on a violation
//   prbody <run-dir> <preview-url>                     markdown PR body
//   feedback <gates.json>                              failed-gate text for the retry prompt
//   shots <raw-dir> <out-dir>                          copies the PNGs a valid index lists; prints the count
//   nojournal                                          a diff on stdin without its journal/ file sections
//   structured <claude-result.json>                    the agent's structured output as JSON, or null
//   redact <dir>...                                    token on stdin; exit 1 if it couldn't be scrubbed
//   result <run-dir> <outcome> [reason]                writes <run-dir>/result.json
//   report <run-dir>                                   markdown dry-run report
//
// Maintenance nights (plans/full-pipeline.md "The 7th day"); <list> is CLEANUP_LIST, <maint> the
// run's maintenance.json (what the PR body, result.json and metrics read):
//   areas                                              the survey areas, one per line (cleanup.ts AREAS)
//   cleanup-check <list>                               exit 1 (and why) when the list is unreadable or corrupt
//   cleanup-sync <list> <prs.json|-> <owner> <date> <maint>   maintenance PRs close / reopen items
//   survey <list> <phases-dir> <repo> <date> <maint> [--failed=sim,...]   merges every pass; SURVEY_FINDINGS SURVEY_NEW
//   cleanup-md <list> <out.md>                         the list as markdown
//   candidates <list> <open-files.json> <date> <out.md> <maint>   tonight's eligible items; ELIGIBLE
//   maintspec <list> <audit-result.json> <spec.md> <spec.json> <date> <meta.json> <audit.json> <maint>
//                                                      CHOSEN SPEC_SHA (spec locked only when CHOSEN > 0)
//   limits <raw> <numstat> <gates.json> <summary.md> <today> <src-grep>   adds gate M1 (with its numbers) to a gate run
//                                                      (<src-grep>: `git grep -z -n tests/ HEAD -- src` output)
//   refactor <result.json> <maint>                     records the refactor agent's per-item report
//   cleanup-done <list> <run-dir> <branch> <outcome>   items done tonight: in-PR (pr.json, outcome pass) or noted

import { readFileSync, writeFileSync } from 'node:fs';
import { runWindows } from './time.ts';
import { checkDiff } from './allowlist.ts';
import { chooseWork, parseBacklog, prState, type DailyPr } from './picker.ts';
import { redact } from './redact.ts';
import { lockSpec, renderSpec, structuredOutput, validateSpec, type SpecMode } from './spec.ts';
import { buildResult, gateFeedback, prBody, readJson, report } from './journal.ts';
import { dropJournal, existingWork, fileOverlap, openFiles, renderOverlap, type GhPr, type OpenFiles } from './existing.ts';
import { checkAudit, renderAudit, reviseBrief, type Audit } from './audit.ts';
import { internalsLint, type Spec } from './spec.ts';
import { checkRulings, fixBrief, fixQueue, readFindings, readFix, reviewMd, verifierTest, type ReviewState } from './review.ts';
import { judgeBrief, judgeVerdict, readBlind, readCheck, renderJudge, scanPlanted, type JudgeVerdict } from './judge.ts';
import { cloneReport, exportInventory, sourceFiles } from './inventory.ts';
import { METRICS_COLUMNS, metricsRow } from './metrics.ts';
import { keepShots } from './screens.ts';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AREAS, candidates, loadList, markDone, mergeSurvey, note, readSurvey, recordRejections, renderCandidates, renderList, saveList, staleMissing, syncPrs, type Area, type CleanupList } from './cleanup.ts';
import { checkLimits, checkMaintAudit, doneItems, limitsGate, readRefactor, renderMaintSpec, type MaintRecord } from './maintenance.ts';

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
const limits = () => ({ maxFiles: Number(env('MAINT_MAX_FILES')), maxLines: Number(env('MAINT_MAX_LINES')), maxNetSrc: Number(env('MAINT_MAX_NET_SRC_LINES')) });
const listCounts = (l: CleanupList): Record<string, number> => ({
  size: l.items.length, ...Object.fromEntries((['open', 'in-pr', 'stale', 'closed'] as const).map((st) => [st, l.items.filter((i) => i.status === st).length])),
});
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
    case 'existing': {
      const [prsPath, backlog, owner, out, open, ownerPrs] = a as [string, string, string, string, string, string?];
      const prs = prsPath === '-' ? [] : readJson<GhPr[]>(prsPath) ?? [];
      writeFileSync(out, existingWork(prs, parseBacklog(readFileSync(backlog, 'utf8')), owner));
      json(open, openFiles(prs, owner, ownerPrs && ownerPrs !== '-' ? readJson<GhPr[]>(ownerPrs) ?? [] : []));
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
      const [state, phases, ids, failedArg] = a as [string, string, string, string?];
      const failed = failedArg?.startsWith('--failed=') ? failedArg.slice(9).split(',') : [];
      const s = review(state);
      for (const id of ids.split(',')) {
        const f = failed.includes(id) ? null : readFindings(id, join(phases, `${id.toLowerCase()}-1`, 'result.json'));
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
      process.stdout.write(fixBrief(f, r, verifierTest(tests, r?.testFile)));
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
      process.stdout.write(reviewMd(review(a[0]!), a[1] === '--for-check'));
      break;
    case 'notreviewed': {
      const s = review(a[0]!);
      for (const id of ['R1', 'R2', 'R3', 'R4', 'R5']) s.reviewers[id] = 'skipped';
      s.notes.push(a[1]!);
      json(a[0]!, s);
      break;
    }
    case 'fixstatus':
      vars({ FIX_STATUS: readFix('-', a[0]!).status });
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
    case 'metricsheader':
      console.log(METRICS_COLUMNS.join(','));
      break;
    case 'metrics':
      if (a[1] === '--header') console.log(METRICS_COLUMNS.join(','));
      console.log(metricsRow(a[0]!));
      break;
    case 'shots': {
      try {
        const { kept, dropped } = keepShots(a[0]!, a[1]!);
        for (const d of dropped) console.error(`screenshot dropped: ${d}`);
        console.log(kept.length);
      } catch (e) { console.error(String(e)); process.exit(1); }
      break;
    }
    case 'nojournal':
      process.stdout.write(dropJournal(readFileSync(0, 'utf8')));
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
    case 'areas':
      console.log(AREAS.join('\n'));
      break;
    case 'cleanup-check':
      try { loadList(a[0]!); } catch (e) { console.error(String(e)); process.exit(1); }
      break;
    case 'cleanup-sync': {
      const [path, prs, owner, date, maint] = a as [string, string, string, string, string];
      const list = loadList(path);
      const synced = syncPrs(list, prs === '-' ? [] : readJson<GhPr[]>(prs) ?? [], owner, date);
      saveList(path, list);
      merge(maint, { synced, list: listCounts(list) });
      vars({ SYNC_CLOSED: synced.closed, SYNC_REOPENED: synced.reopened });
      break;
    }
    case 'survey': {
      const [path, phases, repo, date, maint] = a as [string, string, string, string, string];
      const failed = args.find((x) => x.startsWith('--failed='))?.slice(9).split(',') ?? [];
      const list = loadList(path);
      const total = { findings: 0, new: 0, merged: 0, confirmed: 0, staled: 0, reopened: 0, dropped: 0 };
      const passes: Record<string, 'ok' | 'failed'> = {};
      for (const area of AREAS) {
        const sv = failed.includes(area) ? null : readSurvey(join(phases, `survey-${area}-1`, 'result.json'));
        passes[area] = sv ? 'ok' : 'failed';
        if (!sv) continue;
        const st = mergeSurvey(list, area as Area, sv, date);
        for (const k of Object.keys(total) as (keyof typeof total)[]) total[k] += st[k];
        for (const d of sv.dropped) console.error(`survey ${area}: dropped ${d}`);
      }
      const gone = staleMissing(list, date, (f) => existsSync(join(repo, f)));
      saveList(path, list);
      merge(maint, { survey: { passes, ...total, gone }, list: listCounts(list) });
      vars({ SURVEY_FINDINGS: total.findings, SURVEY_NEW: total.new });
      break;
    }
    case 'cleanup-md':
      writeFileSync(a[1]!, renderList(loadList(a[0]!)));
      break;
    case 'candidates': {
      const [path, open, date, out, maint] = a as [string, string, string, string, string];
      const list = loadList(path);
      const c = candidates(list, readJson<OpenFiles[]>(open) ?? [], date);
      saveList(path, list);
      writeFileSync(out, renderCandidates(list, c));
      const ownerOnly = c.ownerOnly.map((id) => list.items.find((i) => i.id === id)!).map((i) => ({ id: i.id, claim: i.claim, files: i.files }));
      merge(maint, { candidates: c, ownerOnly });
      vars({ ELIGIBLE: c.eligible.length });
      break;
    }
    case 'maintspec': {
      const [path, result, specMd, specJson, date, meta, auditJson, maint] = a as [string, string, string, string, string, string, string, string];
      const list = loadList(path);
      const rec = readJson<MaintRecord>(maint) ?? {};
      const c = rec.candidates ?? { eligible: [], skipped: [], ownerOnly: [] };
      const audit = checkMaintAudit(structuredOutput(result), c.eligible, Number(env('MAINT_MAX_ITEMS')));
      if (!audit || !audit.chosen.length) {
        json(auditJson, { verdict: 'reject', rounds: 1, items: [], reason: audit ? 'the plan audit chose no item' : 'the plan audit returned no valid output' });
        if (audit) { recordRejections(list, audit.rejected, date); saveList(path, list); merge(maint, { rejected: audit.rejected, auditNotes: audit.notes }); }
        vars({ CHOSEN: 0, SPEC_SHA: '' });
        break;
      }
      recordRejections(list, audit.rejected, date);
      for (const ch of audit.chosen) note(list.items.find((i) => i.id === ch.id)!, date, 'chosen by the plan audit');
      saveList(path, list);
      const lim = limits();
      const skipped = c.skipped.map((s) => `${s.id}: open PR ${s.prs.map((n) => `#${n}`).join(', ')}`);
      const specSha256 = lockSpec(specMd, renderMaintSpec(audit, list, date, lim, skipped));
      const chosen = audit.chosen.map((ch) => { const i = list.items.find((x) => x.id === ch.id)!; return { id: i.id, category: i.category, files: i.files, claim: i.claim, why: ch.why }; });
      json(specJson, { backlogId: null, title: audit.title, summary: audit.summary, acceptanceCriteria: [], closestExisting: [], items: chosen.map((x) => x.id),
        expectedFiles: [...new Set(chosen.flatMap((x) => x.files))], supersedes: [], playtest: audit.playtest });
      json(auditJson, { verdict: 'approve', rounds: 1, items: [...chosen.map((x) => ({ id: x.id, verdict: 'chosen', rounds: 1, waitsOn: null })), ...audit.rejected.map((r) => ({ id: r.id, verdict: 'rejected', rounds: 1, waitsOn: null }))] });
      merge(meta, { specSha256 });
      merge(maint, { chosen, rejected: audit.rejected, auditNotes: audit.notes });
      vars({ CHOSEN: chosen.length, SPEC_SHA: specSha256 });
      break;
    }
    case 'limits': {
      const [raw, numstat, gatesPath, summary, today, srcGrep] = a as [string, string, string, string, string, string];
      const lim = limits();
      const r = checkLimits(readFileSync(raw, 'utf8'), readFileSync(numstat, 'utf8'), today, lim, readFileSync(srcGrep, 'utf8'));
      // The result rides on this gate run's M1 row: the journal reads HEAD's run (a fix reverted
      // after failing its gates leaves a later run that is not HEAD's), never the last one.
      const row = { ...limitsGate(r, lim), limits: r };
      const g = readJson<{ pass: boolean; gates: { id: string }[] }>(gatesPath);
      if (g && Array.isArray(g.gates)) {
        g.gates = [...g.gates.filter((x) => x.id !== 'M1'), row];
        g.pass = g.pass === true && r.pass;
        json(gatesPath, g);
      }
      writeFileSync(summary, `${existsSync(summary) ? readFileSync(summary, 'utf8') : ''}\n| M1 ${row.name} | ${row.pass ? 'pass' : '**FAIL**'} | - | ${row.summary} |\n${row.pass ? '' : `\n## M1 details\n\n\`\`\`\n${row.details}\n\`\`\`\n`}`);
      break;
    }
    case 'refactor': { // a retry without a valid report keeps the earlier attempt's
      const rec = readJson<MaintRecord>(a[1]!) ?? {};
      const items = readRefactor(a[0]!, (rec.chosen ?? []).map((c) => c.id));
      if (items || !rec.refactor) merge(a[1]!, { refactor: items });
      break;
    }
    case 'cleanup-done': {
      const [path, run, branch, outcome] = a as [string, string, string, string];
      const rec = readJson<MaintRecord>(join(run, 'maintenance.json')) ?? {};
      const pr = readJson<{ number?: unknown }>(join(run, 'pr.json'));
      const date = readJson<{ date?: string }>(join(run, 'meta.json'))?.date ?? '';
      const list = loadList(path);
      const n = markDone(list, doneItems(rec), date, typeof pr?.number === 'number' ? pr.number : null, branch, outcome);
      saveList(path, list);
      console.log(n);
      break;
    }
    default:
      console.error(`cli.ts: unknown command ${String(cmd)}`);
      process.exit(2);
  }
}
