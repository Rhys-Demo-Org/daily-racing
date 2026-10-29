// Scrubs the Claude token out of everything daily.sh is about to commit (the builder had it in its
// environment and could have written it anywhere, its final message included).

import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { attempt } from '../../guardrails/gates/lib.ts';

/**
 * Replaces the token, raw or JSON-escaped, with `[REDACTED]` in every regular file under `roots`
 * (symlinks are never followed; `.git` and `node_modules` are skipped), then re-reads each file it
 * touched. Returns the files that still contain it (unwritable ones, say): empty means clean.
 */
export function redact(roots: string[], token: string): string[] {
  if (token.length < 8) return []; // never "redact" an empty or placeholder token
  const forms = [...new Set([token, JSON.stringify(token).slice(1, -1)])];
  const has = (text: string): boolean => forms.some((f) => text.includes(f));
  const left: string[] = [];
  const walk = (path: string): void => {
    const st = lstatSync(path, { throwIfNoEntry: false });
    if (st?.isDirectory()) {
      for (const name of readdirSync(path)) if (name !== '.git' && name !== 'node_modules') walk(join(path, name));
    } else if (st?.isFile()) {
      const text = readFileSync(path, 'latin1'); // byte-for-byte, so binary files survive intact
      if (!has(text)) return;
      attempt(() => writeFileSync(path, forms.reduce((t, f) => t.replaceAll(f, '[REDACTED]'), text), 'latin1'));
      if (has(readFileSync(path, 'latin1'))) left.push(path);
    }
  };
  for (const root of roots) walk(root);
  return left;
}
