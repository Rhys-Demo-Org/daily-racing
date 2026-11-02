// Gate 3 measure step: runs main's recorded replays (<replays>/*.json, the frozen format of
// src/sim/replay.ts) on main's track data (<tracks>/<id>.json) with the tree's own sim and prints
// the final car views. Runs under `node --permission` in a measure container; it never sees the
// expected end states. A replay's track is looked up in each <tracks> dir in turn: the registered
// tracks, then frozen test-only ones (tests/fixtures/tracks), so replays recorded on a track that
// has since changed keep reproducing.
//
//   node guardrails/gates/g3-measure.ts <replays> <tracks> [<more tracks>...]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CarView, TrackData } from '../../src/sim/index.ts';
import { decodeReplay, runReplay } from '../../src/sim/index.ts';
import { emit, jsonFiles } from './lib.ts';

export interface G3Measure {
  replays: { name: string; cars?: CarView[]; error?: string }[];
}

const [replayDir = '', ...trackDirs] = process.argv.slice(2);
const replays = jsonFiles(replayDir).map((name) => {
  try {
    const replay = decodeReplay(readFileSync(join(replayDir, `${name}.json`), 'utf8'));
    const file = `${replay.track}.json`;
    const trackDir = trackDirs.find((d) => existsSync(join(d, file))) ?? trackDirs[0] ?? '';
    const track = JSON.parse(readFileSync(join(trackDir, file), 'utf8')) as TrackData;
    return { name, cars: runReplay(track, replay) };
  } catch (e) {
    return { name, error: String(e) };
  }
});
emit({ replays } satisfies G3Measure);
