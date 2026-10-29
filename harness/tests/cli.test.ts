// The bash-facing pieces of harness/lib: cli.ts quoting for `eval` and the token redaction.
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { q } from '../lib/cli.ts';
import { redact } from '../lib/redact.ts';

describe('cli q()', () => {
  it('quotes any value (BACKLOG.md titles included) so bash eval gives it back verbatim', () => {
    for (const v of [`it's`, '$(touch /tmp/pwned)', '`id`', 'a\nb "c" \\d $HOME', '']) {
      expect(spawnSync('bash', ['-c', 'eval "X=$1"; printf %s "$X"', '_', q(v)], { encoding: 'utf8' }).stdout).toBe(v);
    }
  });
});

describe('redact', () => {
  const token = 'sk-ant-oat01-a"b\\c-0123456789';
  it('scrubs raw and JSON-escaped forms, keeps binary bytes, skips symlinks and reports what it could not fix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'redact-'));
    const outside = mkdtempSync(join(tmpdir(), 'redact-out-'));
    const put = (rel: string, data: string | Buffer): string => {
      mkdirSync(join(dir, rel, '..'), { recursive: true });
      writeFileSync(join(dir, rel), data);
      return join(dir, rel);
    };
    put('src/a.ts', `const t = '${token}';\n`);
    put('phases/build-1/result.json', JSON.stringify({ result: `here: ${token}` }));
    const bin = put('src/b.bin', Buffer.concat([Buffer.from([0xff, 0x00]), Buffer.from(token), Buffer.from([0xfe])]));
    put('node_modules/x.js', token);
    writeFileSync(join(outside, 'host.txt'), token);
    symlinkSync(join(outside, 'host.txt'), join(dir, 'src', 'link'));
    const ro = put('spec.md', token);
    chmodSync(ro, 0o444);

    expect(redact([dir], token)).toEqual([ro]);
    expect(readFileSync(join(dir, 'src/a.ts'), 'utf8')).toBe("const t = '[REDACTED]';\n");
    expect(readFileSync(join(dir, 'phases/build-1/result.json'), 'utf8')).toBe('{"result":"here: [REDACTED]"}');
    expect(readFileSync(bin)).toEqual(Buffer.concat([Buffer.from([0xff, 0x00]), Buffer.from('[REDACTED]'), Buffer.from([0xfe])]));
    expect(readFileSync(join(outside, 'host.txt'), 'utf8')).toBe(token);
    expect(readFileSync(join(dir, 'node_modules/x.js'), 'utf8')).toBe(token);
    expect(redact([dir], '')).toEqual([]);
  });
});
