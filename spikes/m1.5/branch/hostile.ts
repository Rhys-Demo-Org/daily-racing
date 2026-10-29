// Stand-in for branch code run by a Node-side gate under `node --permission`. Every probe below
// must be denied; the measurement itself (printing to stdout) must still work.
import { readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const probes: Record<string, () => unknown> = {
  readOutsideBranch: () => readFileSync('/repo/guardrails/palette.json', 'utf8'),
  readEtcPasswd: () => readFileSync('/etc/passwd', 'utf8'),
  writeInsideBranch: () => writeFileSync('/repo/spikes/m1.5/branch/pwned.txt', 'x'),
  writeTmp: () => writeFileSync('/tmp/pwned.txt', 'x'),
  symlink: () => symlinkSync('/etc/passwd', '/repo/spikes/m1.5/branch/link'),
  childProcess: () => spawnSync('sh', ['-c', 'echo hi']).error ?? 'spawned',
  worker: async () => {
    const { Worker } = await import('node:worker_threads');
    return new Worker('process.exit(0)', { eval: true });
  },
  addon: () => process.dlopen({ exports: {} } as NodeJS.Module, '/usr/lib/x86_64-linux-gnu/libc.so.6'),
  inspector: async () => (await import('node:inspector')).open(9229),
  wasi: async () => new (await import('node:wasi')).WASI({ version: 'preview1' }),
};

const out: Record<string, string> = {};
for (const [name, probe] of Object.entries(probes)) {
  try {
    const r = await probe();
    out[name] = r instanceof Error ? `denied (${(r as NodeJS.ErrnoException).code})` : 'ALLOWED';
  } catch (e) {
    out[name] = `denied (${(e as NodeJS.ErrnoException).code ?? (e as Error).message})`;
  }
}
out.readInsideBranch = readFileSync(new URL('./hostile.ts', import.meta.url), 'utf8').length > 0 ? 'ok' : 'fail';
out.permissionHas = String(process.permission.has('fs.write'));
console.log(JSON.stringify(out, null, 2));
