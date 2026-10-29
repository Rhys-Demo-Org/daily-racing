// Reads harness/config.env for TS harness code: KEY=value lines, '#' comments, $HOME / ${HOME}
// (any environment variable) expanded. The same file is sourced by bash, so keep it that simple.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Path of the checked-in config.env next to this module. */
export const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'config.env');

/** Parses config.env text; `$VAR` and `${VAR}` expand from `env` (empty when unset). */
export function parseConfig(text: string, env: Record<string, string | undefined> = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line);
    if (!m) throw new Error(`config.env: bad line "${line}"`);
    out[m[1]!] = m[2]!.replace(/^(["'])(.*)\1$/, '$2').replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g, (_, k: string) => env[k] ?? '');
  }
  return out;
}

/** Reads and parses config.env (default: the checked-in one). */
export function readConfig(path = CONFIG_PATH): Record<string, string> {
  return parseConfig(readFileSync(path, 'utf8'));
}

/** Returns a required key, throwing if it is missing. */
export function need(cfg: Record<string, string>, key: string): string {
  const v = cfg[key];
  if (v === undefined || v === '') throw new Error(`config.env: ${key} missing`);
  return v;
}
