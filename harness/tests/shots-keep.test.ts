// The harness's copy of the screenshots (lib/screens.ts keepShots): the screenshot folder ran the
// builder's code, so only the PNGs a valid index lists reach the reviewers and the judge.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { keepShots, MAX_SHOTS } from '../lib/screens.ts';

let dir = '';
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'shots-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const entry = (name: string, kind = 'stage') => ({ name, kind, viewport: '844x390', path: `844x390/${kind}/${name}.png` });
const put = (rel: string, data: Buffer | string): void => { mkdirSync(join(dir, 'raw', rel, '..'), { recursive: true }); writeFileSync(join(dir, 'raw', rel), data); };

describe('keepShots', () => {
  it('copies only listed, regular, PNG-signed files inside the folder, with a new index', () => {
    put('844x390/stage/start--menu.png', Buffer.concat([PNG, Buffer.from('a')]));
    put('844x390/race/track-start.png', Buffer.concat([PNG, Buffer.from('b')]));
    put('844x390/stage/fake.png', 'not a png');
    put('unlisted.png', PNG);
    writeFileSync(join(dir, 'secret.png'), PNG);
    mkdirSync(join(dir, 'raw', '844x390', 'stage'), { recursive: true });
    symlinkSync(join(dir, 'secret.png'), join(dir, 'raw', '844x390', 'stage', 'link.png'));
    put('index.json', JSON.stringify([entry('start--menu'), entry('track-start', 'race'), entry('fake'), entry('link'), entry('missing')]));
    const out = join(dir, 'out');
    const { kept, dropped } = keepShots(join(dir, 'raw'), out);
    expect(kept.map((e) => e.name)).toEqual(['start--menu', 'track-start']);
    expect(dropped).toHaveLength(3);
    expect(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8'))).toEqual(kept);
    expect(existsSync(join(out, '844x390/stage/start--menu.png'))).toBe(true);
    for (const p of ['844x390/stage/fake.png', '844x390/stage/link.png', 'unlisted.png']) expect(existsSync(join(out, p)), p).toBe(false);
  });

  it('copies nothing from a malformed, overlong or empty index', () => {
    put('844x390/stage/a.png', PNG);
    const out = join(dir, 'out');
    for (const index of ['nope', JSON.stringify([{ ...entry('a'), path: '../a.png' }]), JSON.stringify(Array.from({ length: MAX_SHOTS + 1 }, (_, i) => entry(`a${i}`))), JSON.stringify([entry('missing')])]) {
      put('index.json', index);
      expect(() => keepShots(join(dir, 'raw'), out), index.slice(0, 40)).toThrow(/screenshots/);
      expect(existsSync(join(out, 'index.json'))).toBe(false);
    }
  });
});
