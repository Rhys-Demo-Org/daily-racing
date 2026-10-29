// The game: wires the simulation, renderer, UI and input together.
//
// The sim advances in fixed 60 Hz ticks (src/sim); rendering runs once per animation frame and draws
// car positions interpolated between the last two ticks, so motion is smooth at any refresh rate.
// The UI only ever sees views (src/ui/race-ui.ts), never the sim itself.
import { TRACKS, getTrack } from './content/tracks.ts';
import { createInput } from './input/index.ts';
import { createRaceScene, createRenderer, playerLivery, type CarLivery, type RaceScene } from './render/index.ts';
import {
  DT,
  carViews,
  createBot,
  createWorld,
  raceView,
  stepWorld,
  type Bot,
  type CarInput,
  type CarView,
  type RaceView,
  type TrackData,
  type World,
} from './sim/index.ts';
import { createRaceUi } from './ui/race-ui.ts';
import { createStartScreen } from './ui/start-screen.ts';

/** At most this many sim ticks per animation frame; after a long stall the game slows instead of freezing. */
const MAX_TICKS_PER_FRAME = 5;
/** The minimap uses every Nth point of the dense centreline. */
const MINIMAP_STRIDE = 8;
const NO_INPUT: CarInput = { steer: 0, throttle: false, brake: false };
/** Player (car 0) and the bot opponent (car 1): KOSKI #7 from the mockups, mustard with a navy stripe. */
const LIVERIES: readonly CarLivery[] = [playerLivery(1), { body: 'mustard', stripe: 'navy', number: 7, player: false }];

export type GameMode = 'menu' | 'race';

export interface GameState {
  mode: GameMode;
  trackId: string;
  seed: number;
  race: RaceView | null;
  cars: CarView[];
}

/** Control surface used by the start screen, the finish panel and src/driver (gates). */
export interface Game {
  startRace(options?: { trackId?: string; seed?: number }): void;
  showMenu(): void;
  state(): GameState;
  /** Stops the real-time loop; the game then only advances through step(). */
  freeze(): void;
  /** Restarts the real-time loop after freeze(). */
  resume(): void;
  /** Advances `ticks` sim ticks with a fixed input (no real time), then renders one frame. */
  step(ticks: number, input?: CarInput): void;
  /** Advances one tick per input in `inputs` (no real time), then renders one frame. */
  play(inputs: readonly CarInput[]): void;
}

interface Race {
  track: TrackData;
  scene: RaceScene;
  world: World;
  bot: Bot;
  prev: CarView[];
  curr: CarView[];
  /** Interpolated views handed to the renderer; reused every frame. */
  drawn: CarView[];
}

const lerpAngle = (a: number, b: number, t: number): number => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/** Writes views `t` of the way from `prev` to `curr` into `out` (same length), allocating nothing. */
function interpolate(out: CarView[], prev: readonly CarView[], curr: readonly CarView[], t: number): void {
  for (let i = 0; i < out.length; i++) {
    const o = out[i] as CarView;
    const c = curr[i] as CarView;
    const p = prev[i] ?? c;
    Object.assign(o, c);
    o.x = p.x + (c.x - p.x) * t;
    o.y = p.y + (c.y - p.y) * t;
    o.z = p.z + (c.z - p.z) * t;
    o.heading = lerpAngle(p.heading, c.heading, t);
    o.pitch = p.pitch + (c.pitch - p.pitch) * t;
  }
}

export function createGame(root: HTMLElement): Game {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  const raceLayer = document.createElement('div');
  raceLayer.className = 'race-layer';
  const menuLayer = document.createElement('div');
  menuLayer.className = 'menu-layer';
  root.append(canvas, raceLayer, menuLayer);

  const renderer = createRenderer(canvas);
  const ui = createRaceUi(raceLayer, { onRaceAgain: () => game.startRace({ trackId: race?.track.id ?? menuTrack.id }) });
  const input = createInput({ touchZones: () => ui.touch.zones(), touchListener: ui.touch.machine });

  let mode: GameMode = 'menu';
  let race: Race | null = null;
  let menuTrack: TrackData = TRACKS[0] ?? getTrack('dust-bowl');
  let nextSeed = 1;
  let frozen = false;
  let rafId = 0;
  let lastFrame = 0;
  let accumulator = 0;
  // Only the current track's scene is kept: reused (after reset) on restart, disposed on track change.
  let sceneTrack = '';
  let scene: RaceScene | null = null;

  const startScreen = createStartScreen(menuLayer, {
    onRace: () => game.startRace({ trackId: menuTrack.id }),
    subtitle: `${menuTrack.name} · ${menuTrack.laps} laps`,
  });

  function sceneFor(world: World): RaceScene {
    if (!scene || sceneTrack !== world.track.data.id) {
      scene?.dispose();
      scene = createRaceScene(world.track.layout, LIVERIES, renderer);
      sceneTrack = world.track.data.id;
    } else {
      scene.reset();
    }
    scene.resize(window.innerWidth, window.innerHeight);
    return scene;
  }

  function setMode(next: GameMode): void {
    mode = next;
    raceLayer.hidden = next !== 'race';
    menuLayer.hidden = next !== 'menu';
  }

  function tick(r: Race, carInput: CarInput): void {
    // After the finish the player's car coasts; the panel takes over the controls. The bot drives on.
    const finished = r.world.racers[0]?.finishTick != null;
    stepWorld(r.world, [finished ? NO_INPUT : carInput, r.bot.input(r.world)]);
    r.prev = r.curr;
    r.curr = carViews(r.world);
  }

  function draw(r: Race, t: number, dt: number): void {
    interpolate(r.drawn, r.prev, r.curr, t);
    r.scene.update(r.drawn, dt);
    r.scene.render();
    ui.sync(raceView(r.world), r.curr);
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);
    const dt = lastFrame === 0 ? DT : Math.min((now - lastFrame) / 1000, 0.25);
    lastFrame = now;
    const r = race;
    if (mode !== 'race' || !r) return;
    accumulator += dt;
    let ticks = 0;
    while (accumulator >= DT && ticks < MAX_TICKS_PER_FRAME) {
      tick(r, input.read());
      accumulator -= DT;
      ticks++;
    }
    if (ticks === MAX_TICKS_PER_FRAME) accumulator = 0;
    draw(r, accumulator / DT, dt);
  }

  function startLoop(): void {
    if (rafId !== 0 || frozen) return;
    lastFrame = 0;
    accumulator = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop(): void {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  window.addEventListener('resize', () => race?.scene.resize(window.innerWidth, window.innerHeight));
  // Coming back to a backgrounded tab is a resume: wake the touch controls (UI_RULES §6).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && mode === 'race') ui.touch.wake();
  });

  const game: Game = {
    startRace(options = {}) {
      const track = getTrack(options.trackId ?? menuTrack.id);
      menuTrack = track;
      const world = createWorld(track, { seed: options.seed ?? nextSeed++, carCount: LIVERIES.length });
      const views = carViews(world);
      race = {
        track,
        scene: sceneFor(world),
        world,
        bot: createBot(world, 1),
        prev: views,
        curr: views,
        drawn: views.map((v) => ({ ...v })),
      };
      ui.reset(
        track.laps,
        world.track.layout.centre.filter((_, i) => i % MINIMAP_STRIDE === 0),
        LIVERIES.map((l) => l.body),
      );
      input.reset();
      startScreen.hide();
      setMode('race');
      draw(race, 1, 0);
      startLoop();
    },
    showMenu() {
      setMode('menu');
      startScreen.show();
    },
    state() {
      return {
        mode,
        trackId: race?.track.id ?? menuTrack.id,
        seed: race?.world.seed ?? 0,
        race: race ? raceView(race.world) : null,
        cars: race ? race.curr.map((c) => ({ ...c })) : [],
      };
    },
    freeze() {
      frozen = true;
      stopLoop();
    },
    resume() {
      frozen = false;
      startLoop();
    },
    step(ticks, carInput = NO_INPUT) {
      game.play(Array.from({ length: ticks }, () => carInput));
    },
    play(inputs) {
      const r = race;
      if (!r) throw new Error('step()/play() need a race; call startRace() first');
      // Each tick goes through the follow camera exactly as in play, so staged frames match real ones.
      for (const carInput of inputs) {
        tick(r, carInput);
        r.scene.update(r.curr, DT);
      }
      draw(r, 1, 0);
    },
  };

  game.showMenu();
  startLoop();
  return game;
}
