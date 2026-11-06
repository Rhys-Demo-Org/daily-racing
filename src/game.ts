// The game: wires the simulation, renderer, UI and input together.
//
// The sim advances in fixed 60 Hz ticks (src/sim); rendering runs once per animation frame and draws
// car positions interpolated between the last two ticks, so motion is smooth at any refresh rate.
// The UI only ever sees views (src/ui/race-ui.ts), never the sim itself.
import { PLAYER_CAR_COUNT, raceDrivers, type Driver } from './content/drivers.ts';
import { TRACKS, getTrack, nextTrackId } from './content/tracks.ts';
import { createInput } from './input/index.ts';
import { createRaceScene, createRenderer, type RaceScene } from './render/index.ts';
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
/** startRace() without a car count: YOU #1 and KOSKI #7, as the driver (gates) and older tests expect. */
const DEFAULT_CAR_COUNT = 2;

export type GameMode = 'menu' | 'race';

export interface GameState {
  mode: GameMode;
  trackId: string;
  seed: number;
  race: RaceView | null;
  cars: CarView[];
  /** The player paused the race (PAUSE button or Esc); the real-time loop steps nothing. */
  paused: boolean;
}

/** Control surface used by the start screen, the results screen and src/driver (gates). */
export interface Game {
  /** `carCount` (1–6, default 2): the player (car 0) then the roster AI drivers in order, one bot each. */
  startRace(options?: { trackId?: string; seed?: number; carCount?: number }): void;
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
  /** bots[i] drives car i + 1. */
  bots: Bot[];
  /** Reused every tick: the player's input, then each bot's. */
  inputs: CarInput[];
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
  // RESTART RACE (pause) and RETRY (results) are one action: a fresh race on the same track.
  const restart = (): void => game.startRace({ trackId: race?.track.id ?? menuTrack.id, carCount: PLAYER_CAR_COUNT });
  const ui = createRaceUi(raceLayer, {
    onRaceAgain: restart,
    onNextRace: () => game.startRace({ trackId: nextTrackId(race?.track.id ?? menuTrack.id), carCount: PLAYER_CAR_COUNT }),
    onPause: () => setPaused(!paused),
    onResume: () => setPaused(false),
    onRestart: restart,
    onQuit: () => game.showMenu(),
  });
  const input = createInput({
    // Nothing on the race screen can be pressed through the pause overlay.
    touchZones: () => (paused ? [] : ui.touch.zones()),
    touchListener: ui.touch.machine,
    onPause: () => setPaused(!paused),
  });

  let mode: GameMode = 'menu';
  let race: Race | null = null;
  let menuTrack: TrackData = TRACKS[0] ?? getTrack('dust-bowl');
  let nextSeed = 1;
  let frozen = false;
  let paused = false;
  let rafId = 0;
  let lastFrame = 0;
  let accumulator = 0;
  // Only the current scene is kept: reused (after reset) on restart, disposed when the track or the
  // driver list changes.
  let sceneKey = '';
  let scene: RaceScene | null = null;

  const startScreen = createStartScreen(menuLayer, {
    onRace: () => game.startRace({ trackId: menuTrack.id, carCount: PLAYER_CAR_COUNT }),
    subtitle: `${menuTrack.name} · ${menuTrack.laps} laps`,
  });

  function sceneFor(world: World, drivers: readonly Driver[]): RaceScene {
    const key = `${world.track.data.id}|${drivers.length}`;
    if (!scene || sceneKey !== key) {
      scene?.dispose();
      scene = createRaceScene(world.track.layout, drivers, renderer);
      sceneKey = key;
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

  /**
   * Pauses or resumes the race in progress (not on the menu, not once the player has finished).
   * Pausing stops the loop; resuming restarts it from a fresh frame, so paused time is never caught up.
   */
  function setPaused(next: boolean): void {
    if (next === paused || (next && (mode !== 'race' || race?.world.racers[0]?.finishTick != null))) return;
    paused = next;
    if (paused) {
      stopLoop();
      input.reset();
      ui.pause();
    } else {
      ui.resume();
      startLoop();
    }
  }

  function tick(r: Race, carInput: CarInput): void {
    // After the finish the player's car coasts; the panel takes over the controls. The bots drive on.
    const finished = r.world.racers[0]?.finishTick != null;
    r.inputs[0] = finished ? NO_INPUT : carInput;
    for (let i = 0; i < r.bots.length; i++) r.inputs[i + 1] = (r.bots[i] as Bot).input(r.world);
    stepWorld(r.world, r.inputs);
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
    if (rafId !== 0 || frozen || paused) return;
    lastFrame = 0;
    accumulator = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stopLoop(): void {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  window.addEventListener('resize', () => {
    race?.scene.resize(window.innerWidth, window.innerHeight);
    // Resizing clears the canvas; with the loop stopped, redraw the frozen race under the overlay.
    if (paused) race?.scene.render();
  });
  // Coming back to a backgrounded tab is a resume: wake the touch controls (UI_RULES §6).
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && mode === 'race') ui.touch.wake();
  });

  const game: Game = {
    startRace(options = {}) {
      const track = getTrack(options.trackId ?? menuTrack.id);
      const drivers = raceDrivers(options.carCount ?? DEFAULT_CAR_COUNT);
      const world = createWorld(track, { seed: options.seed ?? nextSeed++, carCount: drivers.length });
      const views = carViews(world);
      menuTrack = track;
      race = {
        track,
        scene: sceneFor(world, drivers),
        world,
        bots: drivers.slice(1).map((_, i) => createBot(world, i + 1)),
        inputs: drivers.map(() => NO_INPUT),
        prev: views,
        curr: views,
        drawn: views.map((v) => ({ ...v })),
      };
      ui.reset(
        track.laps,
        world.track.layout.centre.filter((_, i) => i % MINIMAP_STRIDE === 0),
        drivers.map((d) => d.body),
        { trackId: track.id, trackName: track.name, carNumbers: drivers.map((d) => d.number), driverNames: drivers.map((d) => d.name) },
      );
      input.reset();
      paused = false; // ui.reset() hid the pause screen
      startScreen.hide();
      setMode('race');
      draw(race, 1, 0);
      startLoop();
    },
    showMenu() {
      setPaused(false);
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
        paused,
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
      // Driver steps run even while paused; if the player finishes, the results screen replaces the pause.
      if (paused && r.world.racers[0]?.finishTick != null) setPaused(false);
      draw(r, 1, 0);
    },
  };

  game.showMenu();
  startLoop();
  return game;
}
