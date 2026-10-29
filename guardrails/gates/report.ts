// Assembles gates.json and summary.md from the verdict results run-gates.sh collected. Fails
// closed: a gate with no result file, malformed JSON or a harness note (timeout, cap) fails.
// Exit 0 only when every gate passed.
//
//   node report.ts --results <dir> --out <dir> --branch-sha <sha> --main-sha <sha>
//                  --started <ISO> --duration-ms <n> [--maintenance]
//   <results>/<id>.json  verdict result   <id>.ms  wall time   <id>.note  harness note
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, flag, isResult, readText, type GateResult } from './lib.ts';

const GATES = [
  ['G1', 'Build, types & unit tests'],
  ['G2', 'Bot laps'],
  ['G3', 'Physics replays'],
  ['G8', 'Protected files'],
] as const;

const { flags } = cli();
const dir = flag(flags, 'results');
const read = (name: string): string | null => readText(join(dir, name));

const gates = GATES.map(([id, name]) => {
  const note = read(`${id}.note`)?.trim().replace(/\n/g, '; ');
  let r: GateResult;
  try {
    const parsed: unknown = JSON.parse(read(`${id}.json`) ?? 'null');
    if (!isResult(parsed) || typeof parsed.details !== 'string') throw new Error('no result (crash or timeout)');
    r = parsed;
  } catch (e) {
    r = { pass: false, summary: (e as Error).message.slice(0, 200), details: '' };
  }
  if (note) r = { pass: false, summary: note, details: [r.summary, r.details].filter(Boolean).join('\n') };
  return { id, name, pass: r.pass, durationMs: Number(read(`${id}.ms`) ?? 0) || 0, summary: r.summary, details: r.pass ? '' : r.details.slice(0, 20000) };
});

const pass = gates.every((g) => g.pass);
const report = {
  branchSha: flag(flags, 'branch-sha'),
  mainSha: flag(flags, 'main-sha'),
  startedAt: flag(flags, 'started'),
  durationMs: Number(flag(flags, 'duration-ms')),
  pass,
  maintenance: flags['maintenance'] === true,
  gates,
};
const out = flag(flags, 'out');
writeFileSync(join(out, 'gates.json'), `${JSON.stringify(report, null, 2)}\n`);
const cell = (s: string): string => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const md = [
  `# Gates: ${pass ? 'PASS' : 'FAIL'}`,
  '',
  `Branch \`${report.branchSha.slice(0, 12)}\` vs main \`${report.mainSha.slice(0, 12)}\`${report.maintenance ? ' (maintenance)' : ''}, ${(report.durationMs / 1000).toFixed(1)} s`,
  '',
  '| Gate | Result | Time | Summary |',
  '|---|---|---|---|',
  ...gates.map((g) => `| ${g.id} ${g.name} | ${g.pass ? 'pass' : '**FAIL**'} | ${(g.durationMs / 1000).toFixed(1)} s | ${cell(g.summary)} |`),
  ...gates.filter((g) => !g.pass && g.details).map((g) => `\n## ${g.id} details\n\n\`\`\`\n${g.details}\n\`\`\``),
  '',
].join('\n');
writeFileSync(join(out, 'summary.md'), md);
process.exit(pass ? 0 : 1);
