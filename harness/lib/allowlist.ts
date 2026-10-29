// What a nightly branch may change (plan deviation 2: protected paths are an allowlist), as pure
// rules over `git diff --raw -z` / `--numstat -z` output. Gate 8 and gen-manifest use it; it has no
// I/O so it runs the same in a gate container, a test or a script.

export interface Change {
  /** git status letter: A added, M modified, D deleted, T type change (anything else fails). */
  status: string;
  path: string;
  oldMode: string;
  newMode: string;
  /** numstat reported `-` counts. */
  binary: boolean;
}

export interface Rules {
  /** YYYY-MM-DD of the run (London), for `journal/runs/<today>/`. */
  today: string;
  /** Sunday maintenance: existing tests and the root CLAUDE.md may be edited. */
  maintenance: boolean;
}

const REGULAR = '100644';
/** Files that steer git or agents, banned at any depth (a nested one would sit inside src/ or tests/). */
const CONTROL_FILES = new Set(['.gitattributes', '.gitmodules', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md', '.mcp.json']);
/** Binary, image, font and model files are never allowed (3D assets are code). */
const ASSET_EXT = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg|woff2?|ttf|otf|glb|gltf|obj|fbx|hdr|ktx2|mp3|wav|ogg|mp4|webm|wasm)$/i;

const inSrc = (p: string): boolean => p.startsWith('src/') && !p.startsWith('src/driver/');
const inTests = (p: string): boolean => p.startsWith('tests/') && !p.startsWith('tests/baselines/');

/**
 * True for files a nightly run may never touch and that only change in owner PRs, so their hashes
 * belong in the manifest. Existing tests (append-only, gate 1), journal folders and the root
 * CLAUDE.md (gate 8 diff rules) are policed elsewhere because daily merges legitimately add to them.
 */
export function isProtected(path: string): boolean {
  return !inSrc(path) && !inTests(path) && !path.startsWith('journal/') && path !== 'CLAUDE.md' && path !== 'guardrails/manifest.json';
}

/** Why `c` is not allowed, or null when it is. */
export function violation(c: Change, rules: Rules): string | null {
  const { path, status } = c;
  const parts = path.split('/');
  const base = parts[parts.length - 1] ?? '';
  if (parts.includes('.claude') || parts.includes('.git')) return 'agent/git control directory';
  if (CONTROL_FILES.has(base) && !(path === 'CLAUDE.md' && status === 'M' && rules.maintenance)) {
    return path === 'CLAUDE.md' ? 'CLAUDE.md may only be edited on maintenance days' : `control file ${base}`;
  }
  if (!['A', 'M', 'D'].includes(status)) return `status ${status} (type changes, renames, copies are not allowed)`;
  if (status !== 'D' && c.newMode !== REGULAR) return `mode ${c.newMode} (only regular non-executable files; no symlinks or submodules)`;
  if (status === 'M' && c.oldMode !== c.newMode) return `mode change ${c.oldMode} → ${c.newMode}`;
  if (status !== 'D' && (c.binary || ASSET_EXT.test(path))) return 'binary, image, font or model file';
  if (path === 'CLAUDE.md') return null; // maintenance edit, allowed above
  if (inSrc(path)) return null;
  if (inTests(path)) {
    if (status === 'A' || (status === 'M' && rules.maintenance)) return null;
    return status === 'M' ? 'existing tests are append-only (edits only on maintenance days)' : 'existing tests may not be deleted';
  }
  if (path.startsWith(`journal/runs/${rules.today}/`)) return null;
  if (path.startsWith('tests/baselines/')) return 'baselines are written by the harness only';
  if (path.startsWith('journal/')) return `journal changes are limited to journal/runs/${rules.today}/`;
  return 'protected path';
}

/** Parses `git diff --raw -z --no-renames` output. */
export function parseRaw(raw: string): Omit<Change, 'binary'>[] {
  const fields = raw.split('\0');
  const out: Omit<Change, 'binary'>[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) {
    const meta = (fields[i] as string).replace(/^\n/, '');
    const m = /^:(\d{6}) (\d{6}) [0-9a-f]+ [0-9a-f]+ ([A-Z])\d*$/.exec(meta);
    if (!m) throw new Error(`unparseable diff --raw entry: ${JSON.stringify(meta)}`);
    out.push({ oldMode: m[1] as string, newMode: m[2] as string, status: m[3] as string, path: fields[i + 1] as string });
  }
  return out;
}

/** Paths that `git diff --numstat -z --no-renames` reports as binary (`-\t-\t`). */
export function parseNumstatBinary(numstat: string): Set<string> {
  const binary = new Set<string>();
  for (const entry of numstat.split('\0')) {
    const m = /^\n?(-|\d+)\t(-|\d+)\t(.*)$/s.exec(entry);
    if (m && m[1] === '-') binary.add(m[3] as string);
  }
  return binary;
}

/** Every disallowed change in a diff, as `path: reason` lines. */
export function checkDiff(raw: string, numstat: string, rules: Rules): string[] {
  const binary = parseNumstatBinary(numstat);
  return parseRaw(raw).flatMap((c) => {
    const why = violation({ ...c, binary: binary.has(c.path) }, rules);
    return why === null ? [] : [`${c.path}: ${why}`];
  });
}
