// Writes guardrails/manifest.json: the SHA-256 of every protected tracked file (harness/lib/allowlist.ts
// `isProtected`). Gate 8 reads main's manifest and checks both main and the branch against it.
// Owner-only, via harness/scripts/rebaseline.sh, which pipes `git ls-files -z` in (the toolchain
// image has no git).
//
//   git ls-files -z | node guardrails/scripts/gen-manifest.ts
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isProtected } from '../../harness/lib/allowlist.ts';

export interface Manifest {
  files: Record<string, string>;
}

/** SHA-256 hex of a file, or null when it is missing or unreadable. */
export function hashFile(path: string): string | null {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
}

/** Protected paths of a NUL-separated file list, sorted. */
export const protectedPaths = (list: string): string[] => list.split('\0').filter((p) => p !== '' && isProtected(p)).sort();

if (import.meta.main) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const files: Manifest['files'] = {};
  for (const p of protectedPaths(readFileSync(0, 'utf8'))) {
    const hash = hashFile(join(root, p));
    if (hash === null) throw new Error(`gen-manifest: cannot read ${p}`);
    files[p] = hash;
  }
  writeFileSync(join(root, 'guardrails', 'manifest.json'), `${JSON.stringify({ files } satisfies Manifest, null, 2)}\n`);
  console.log(`manifest: ${Object.keys(files).length} protected files`);
}
