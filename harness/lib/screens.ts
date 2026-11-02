// The screenshots the reviewers and the judge may see. scripts/screenshots.sh builds and runs the
// builder's code, so its output folder is builder-influenced: only a well-formed index.json
// (harness/screens/shots.ts checkIndex) of at most MAX_SHOTS entries is trusted, and of its entries
// only regular files (no symlink) inside the folder that start with the PNG signature and are at
// most MAX_SHOT_BYTES are copied. Nothing else in the folder is ever copied.

import { copyFileSync, lstatSync, mkdirSync, openSync, readSync, closeSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { checkIndex, type ShotEntry } from '../screens/shots.ts';

export const MAX_SHOTS = 120;
export const MAX_SHOT_BYTES = 5_000_000;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(path: string): boolean {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(PNG.length);
    return readSync(fd, head, 0, PNG.length, 0) === PNG.length && head.equals(PNG);
  } finally { closeSync(fd); }
}

/**
 * Copies the screenshots `raw/index.json` lists into `out` (same relative paths) with a new
 * index.json of what was copied. Throws when the index is missing, malformed or too long, or when
 * no entry survives; then nothing is copied.
 */
export function keepShots(raw: string, out: string): { kept: ShotEntry[]; dropped: string[] } {
  let index: unknown;
  try { index = JSON.parse(readFileSync(join(raw, 'index.json'), 'utf8')); } catch { throw new Error('screenshots: no readable index.json'); }
  const problems = checkIndex(index);
  if (problems.length) throw new Error(`screenshots: bad index.json (${problems.slice(0, 5).join('; ')})`);
  const entries = index as ShotEntry[];
  if (entries.length > MAX_SHOTS) throw new Error(`screenshots: ${entries.length} entries (limit ${MAX_SHOTS})`);
  const root = realpathSync(raw);
  const kept: ShotEntry[] = [];
  const dropped: string[] = [];
  for (const e of entries) {
    const path = join(root, e.path);
    try {
      const st = lstatSync(path);
      if (!st.isFile()) throw new Error('not a regular file');
      if (!realpathSync(path).startsWith(root + sep)) throw new Error('outside the folder');
      if (st.size > MAX_SHOT_BYTES) throw new Error(`over ${MAX_SHOT_BYTES} bytes`);
      if (!isPng(path)) throw new Error('not a PNG');
    } catch (err) {
      dropped.push(`${e.path}: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
    kept.push(e);
  }
  if (!kept.length) throw new Error(`screenshots: no valid PNG (${dropped.slice(0, 5).join('; ')})`);
  for (const e of kept) {
    mkdirSync(dirname(join(out, e.path)), { recursive: true });
    copyFileSync(join(root, e.path), join(out, e.path));
  }
  writeFileSync(join(out, 'index.json'), `${JSON.stringify(kept, null, 2)}\n`);
  return { kept, dropped };
}
