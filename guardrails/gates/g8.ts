// Gate 8: protected files. No branch code runs; it reads git metadata the harness wrote on the host
// and both trees as data. Checks the allowlist diff against the merge base, that main's manifest is
// current and the branch matches it, and that main's generated token files match a regeneration.
//
//   node g8.ts --main <dir> --branch <dir> --in <dir> --today <YYYY-MM-DD> --out <result.json> [--maintenance]
//   <in>: diff-raw (git diff --raw -z --no-renames), diff-numstat (--numstat -z),
//         main-files / branch-files (git ls-tree -r -z --name-only)
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkDiff } from '../../harness/lib/allowlist.ts';
import { hashFile, protectedPaths, type Manifest } from '../scripts/gen-manifest.ts';
import { cli, finish, flag, readJson, tail, verdict } from './lib.ts';

const { flags } = cli();
const out = flag(flags, 'out');
const mainDir = flag(flags, 'main');
const branchDir = flag(flags, 'branch');
const input = (name: string): string => readFileSync(join(flag(flags, 'in'), name), 'utf8');
const problems: string[] = [];

try {
  problems.push(...checkDiff(input('diff-raw'), input('diff-numstat'), { today: flag(flags, 'today'), maintenance: flags['maintenance'] === true }));

  const manifest = readJson<Manifest>(join(mainDir, 'guardrails', 'manifest.json')).files;
  const listed = Object.keys(manifest).sort();
  const onMain = protectedPaths(input('main-files'));
  const stale = onMain.join('\0') !== listed.join('\0') || listed.some((p) => hashFile(join(mainDir, p)) !== manifest[p]);
  if (stale) problems.push("guardrails/manifest.json on main is stale (owner: harness/scripts/rebaseline.sh)");
  for (const p of listed) if (hashFile(join(branchDir, p)) !== manifest[p]) problems.push(`${p}: differs from main's manifest`);
  for (const p of protectedPaths(input('branch-files'))) if (!(p in manifest)) problems.push(`${p}: protected file not in main's manifest`);

  const tokens = spawnSync(process.execPath, [join(mainDir, 'guardrails', 'scripts', 'gen-tokens.ts'), '--check'], { encoding: 'utf8' });
  if (tokens.status !== 0) problems.push(`generated tokens are stale on main:\n${tail(tokens.stdout + tokens.stderr, 1000)}`);
} catch (e) {
  problems.push(`gate 8 could not run: ${(e as Error).message}`);
}
finish(out, verdict([...new Set(problems)], 'only allowed paths changed; manifest and tokens match', (n) => `${n} protected-file violation(s)`));
