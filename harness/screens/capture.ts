// Screenshots every screen stage and a few race frames from a harness build
// (harness/screens/vite.config.ts) at each viewport, then writes <out>/index.json (see shots.ts).
// Runs inside the toolchain container via harness/scripts/screenshots.sh, offline.
//
//   node harness/screens/capture.ts <dist-dir> <out-dir>
//
// Determinism: a fixed race seed and bot inputs, Playwright's fake clock paused before any stage or
// race frame is shown (so the touch controls' timers never fire), CSS animations finished by the
// screenshot, software WebGL (SwiftShader) and device scale 1.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { assertNoErrors, context, GAME_READY, launch, open, renderStage, serve, stageNames as names } from './browser.ts';
import { PLAYER_CAR_COUNT } from '../../src/content/drivers.ts';
import { createBot, createWorld, raceView, stepWorld, validateTrack, type CarInput } from '../../src/sim/index.ts';
import { checkIndex, planShots, RACE_SEED, raceMoments, VIEWPORTS, viewportName, type RaceMoment, type ShotEntry } from './shots.ts';

const [distArg, outArg] = process.argv.slice(2);
if (!distArg || !outArg) throw new Error('usage: node harness/screens/capture.ts <dist-dir> <out-dir>');
const dist = resolve(distArg);
const out = resolve(outArg);

/** Cars per race, as in a race the player starts (YOU + every AI driver). */
const CARS = PLAYER_CAR_COUNT;
/** Give up on a race after this many ticks (5 minutes of sim time). */
const TICK_CAP = 60 * 300;

// --- race inputs: car 0 driven by a bot, exactly as the game's car 1 is, so the race is fixed ----
interface RacePlan {
  track: string;
  inputs: CarInput[];
  moments: RaceMoment[];
}

function planRace(file: string): RacePlan {
  const track = validateTrack(JSON.parse(readFileSync(file, 'utf8')));
  const world = createWorld(track, { seed: RACE_SEED, carCount: CARS });
  const bots = world.cars.map((_, i) => createBot(world, i));
  const inputs: CarInput[] = [];
  while (raceView(world).phase !== 'finished') {
    if (inputs.length >= TICK_CAP) throw new Error(`${track.id}: the bot did not finish in ${TICK_CAP} ticks`);
    const frame = bots.map((b) => b.input(world));
    inputs.push(frame[0] as CarInput);
    stepWorld(world, frame);
  }
  return { track: track.id, inputs, moments: raceMoments(inputs.length) };
}

const tracksDir = new URL('../../src/content/tracks/', import.meta.url).pathname;
const races = readdirSync(tracksDir)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => planRace(join(tracksDir, f)));

// --- browser ---------------------------------------------------------------------------------------
const { origin, server } = await serve(dist);
const browser = await launch();

async function shoot(page: Page, shot: ShotEntry): Promise<void> {
  // Layout first so every used font starts loading, then wait for them.
  await page.evaluate(async () => {
    void document.body.offsetHeight;
    await document.fonts.ready;
  });
  assertNoErrors(page, `${shot.viewport} ${shot.kind} ${shot.name}`);
  await page.screenshot({ path: join(out, shot.path), caret: 'hide', scale: 'css' });
}

const shots: ShotEntry[] = [];
try {
  for (const v of VIEWPORTS) rmSync(join(out, viewportName(v)), { recursive: true, force: true });
  rmSync(join(out, 'index.json'), { force: true });
  let stageNames: string[] = [];
  for (const v of VIEWPORTS) {
    const ctx = await context(browser, v);
    stageNames = await names(ctx, origin);
    const plan = planShots(
      stageNames,
      races.flatMap((r) => r.moments.map((m) => `${r.track}-${m.name}`)),
      [v],
    );
    mkdirSync(join(out, viewportName(v), 'stage'), { recursive: true });
    mkdirSync(join(out, viewportName(v), 'race'), { recursive: true });

    for (const shot of plan.filter((s) => s.kind === 'stage')) {
      const page = await renderStage(ctx, origin, shot.name);
      await shoot(page, shot);
      await page.close();
      shots.push(shot);
    }

    for (const race of races) {
      const page = await open(ctx, origin, '/', GAME_READY);
      await page.evaluate(
        ({ track, seed, carCount }) => {
          const r = (window as unknown as { __racer: { startRace(o: object): unknown; freeze(): void } }).__racer;
          r.startRace({ track, seed, carCount });
          r.freeze();
        },
        { track: race.track, seed: RACE_SEED, carCount: CARS },
      );
      let at = 0;
      for (const m of race.moments) {
        const phase = await page.evaluate(
          (chunk) => {
            const w = window as unknown as { __racer: { play(i: unknown[]): { race: { phase: string } | null } }; __settle(): void };
            const phase = w.__racer.play(chunk).race?.phase;
            w.__settle();
            return phase;
          },
          race.inputs.slice(at, m.tick),
        );
        at = m.tick;
        if (m.name === 'finished' && phase !== 'finished') throw new Error(`${race.track}: the game did not finish with the planned inputs (car count changed?)`);
        const shot = plan.find((s) => s.kind === 'race' && s.name === `${race.track}-${m.name}`) as ShotEntry;
        await shoot(page, shot);
        shots.push(shot);
      }
      await page.close();
    }
    await ctx.close();
  }
  const problems = checkIndex(shots);
  if (problems.length) throw new Error(`bad index: ${problems.join('; ')}`);
  writeFileSync(join(out, 'index.json'), `${JSON.stringify(shots, null, 2)}\n`);
  console.log(`captured ${shots.length} screenshots (${stageNames.length} stages, ${races.length} race(s)) into ${out}`);
} finally {
  await browser.close();
  server.close();
}
