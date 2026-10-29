// The game: wires the simulation, renderer, UI and input together.
//
// The sim advances in fixed 60 Hz ticks (src/sim); rendering runs once per animation frame and draws
// car positions interpolated between the last two ticks, so motion is smooth at any refresh rate.
// The UI only ever sees view models built here (HudState etc.), never the sim itself.
import type { PaletteName } from '@tokens';
import { TRACKS, getTrack } from './content/tracks.ts';
import { createInput, type Input } from './input/index.ts';
import { createRaceScene, createRenderer, playerLivery, type CarLivery, type RaceScene } from './render/index.ts';
import {
  DT,
  TICK_HZ,
  carViews,
  createWorld,
  raceView,
  stepWorld,
  trackLayout,
  type CarInput,
  type CarView,
  type RaceView,
  type TrackData,
  type TrackLayout,
  type World,
} from './sim/index.ts';
import { createCountdown, type CountdownStep } from './ui/countdown.ts';
import { createFinishPanel } from './ui/finish-panel.ts';
import { createHud } from './ui/hud.ts';
import { createStartScreen } from './ui/start-screen.ts';
import { createTouchControls } from './ui/touch-controls.ts';
import type { HudState } from './ui/types.ts';

/** At most this many sim ticks per animation frame; after a long stall the game slows instead of freezing. */
const MAX_TICKS_PER_FRAME = 5;
/** The minimap uses every Nth point of the dense centreline. */
const MINIMAP_STRIDE = 8;
const NO_INPUT: CarInput = { steer: 0, throttle: false, brake: false };
/** GO! is cleared this many ticks after the start, in sim time, so staged frames are deterministic. */
const GO_HIDE_TICKS = TICK_HZ;

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
  layout: TrackLayout;
  scene: RaceScene;
  world: World;
  seed: number;
  prev: CarView[];
  curr: CarView[];
  lastCountdown: number;
  finishShown: boolean;
  minimapOutline: [number, number][];
  liveries: CarLivery[];
}

const lerpAngle = (a: number, b: number, t: number): number => {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
};

function interpolate(prev: readonly CarView[], curr: readonly CarView[], t: number): CarView[] {
  return curr.map((c, i) => {
    const p = prev[i] ?? c;
    return {
      ...c,
      x: p.x + (c.x - p.x) * t,
      y: p.y + (c.y - p.y) * t,
      z: p.z + (c.z - p.z) * t,
      heading: lerpAngle(p.heading, c.heading, t),
      pitch: p.pitch + (c.pitch - p.pitch) * t,
    };
  });
}

const ticksToMs = (ticks: number): number => (ticks * 1000) / TICK_HZ;

export function createGame(root: HTMLElement): Game {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  const raceLayer = document.createElement('div');
  raceLayer.className = 'race-layer';
  const menuLayer = document.createElement('div');
  menuLayer.className = 'menu-layer';
  root.append(canvas, raceLayer, menuLayer);

  const renderer = createRenderer(canvas);
  const hud = createHud(raceLayer);
  const countdown = createCountdown(raceLayer);
  const touch = createTouchControls(raceLayer);
  const input: Input = createInput({ touchZones: () => touch.zones(), touchListener: touch.machine });

  let mode: GameMode = 'menu';
  let race: Race | null = null;
  let menuTrack: TrackData = TRACKS[0] ?? getTrack('dust-bowl');
  let nextSeed = 1;
  let frozen = false;
  let rafId = 0;
  let lastFrame = 0;
  let accumulator = 0;
  // Scenes are built once per track and reused across restarts.
  const scenes = new Map<string, { layout: TrackLayout; scene: RaceScene }>();

  const startScreen = createStartScreen(menuLayer, {
    onRace: () => game.startRace({ trackId: menuTrack.id }),
    subtitle: `${menuTrack.name} · ${menuTrack.laps} laps`,
  });
  const finishPanel = createFinishPanel(raceLayer, {
    onRaceAgain: () => game.startRace({ trackId: race?.track.id ?? menuTrack.id }),
  });

  function sceneFor(track: TrackData, liveries: CarLivery[]): { layout: TrackLayout; scene: RaceScene } {
    let entry = scenes.get(track.id);
    if (!entry) {
      const layout = trackLayout(track);
      entry = { layout, scene: createRaceScene(layout, liveries, renderer) };
      scenes.set(track.id, entry);
    }
    entry.scene.resize(window.innerWidth, window.innerHeight);
    return entry;
  }

  function setMode(next: GameMode): void {
    mode = next;
    raceLayer.hidden = next !== 'race';
    menuLayer.hidden = next !== 'menu';
  }

  function hudState(r: Race, view: RaceView): HudState {
    const me = view.racers[0];
    const best = me && me.lapTicks.length > 0 ? Math.min(...me.lapTicks) : null;
    const colourOf = (l: CarLivery): PaletteName => l.body;
    return {
      position: me?.position ?? 1,
      carCount: r.curr.length,
      lap: me?.lap ?? 1,
      laps: r.track.laps,
      timeMs: view.phase === 'countdown' ? null : ticksToMs(me?.finishTick ?? view.raceTick),
      bestLapMs: best === null ? null : ticksToMs(best),
      minimap: {
        outline: r.minimapOutline,
        cars: r.curr.map((c, i) => ({ x: c.x, z: c.z, colour: colourOf(r.liveries[i] as CarLivery), player: i === 0 })),
      },
    };
  }

  /** Pushes race state into the UI: HUD, countdown roundels, touch wake at GO, finish panel. */
  function syncUi(r: Race): void {
    const view = raceView(r.world);
    hud.update(hudState(r, view));
    const step = view.phase === 'countdown' ? view.countdown : 0;
    if (step !== r.lastCountdown) {
      countdown.show(step as CountdownStep);
      if (step === 0) touch.wake();
      r.lastCountdown = step;
    }
    if (view.phase !== 'countdown' && view.raceTick >= GO_HIDE_TICKS && countdown.current !== null) countdown.hide();
    if (view.phase === 'finished' && !r.finishShown) {
      r.finishShown = true;
      const me = view.racers[0];
      finishPanel.show({
        timeMs: ticksToMs(me?.finishTick ?? view.raceTick),
        bestLapMs: me && me.lapTicks.length > 0 ? ticksToMs(Math.min(...me.lapTicks)) : null,
      });
    }
  }

  function tick(r: Race, carInput: CarInput): void {
    // After the finish the player's car coasts; the panel takes over the controls.
    const phase = raceView(r.world).phase;
    stepWorld(r.world, [phase === 'finished' ? NO_INPUT : carInput]);
    r.prev = r.curr;
    r.curr = carViews(r.world);
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
    r.scene.update(interpolate(r.prev, r.curr, accumulator / DT), dt);
    r.scene.render();
    syncUi(r);
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

  const game: Game = {
    startRace(options = {}) {
      const track = getTrack(options.trackId ?? menuTrack.id);
      menuTrack = track;
      const seed = options.seed ?? nextSeed++;
      const liveries = [playerLivery(1)];
      const { layout, scene } = sceneFor(track, liveries);
      const world = createWorld(track, { seed, carCount: liveries.length });
      const views = carViews(world);
      race = {
        track,
        layout,
        scene,
        world,
        seed,
        prev: views,
        curr: views,
        lastCountdown: -1,
        finishShown: false,
        minimapOutline: layout.centre.filter((_, i) => i % MINIMAP_STRIDE === 0),
        liveries,
      };
      input.reset();
      finishPanel.hide();
      countdown.hide();
      startScreen.hide();
      setMode('race');
      scene.update(views, 0);
      scene.snapCamera();
      scene.render();
      syncUi(race);
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
        seed: race?.seed ?? 0,
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
      for (const carInput of inputs) {
        tick(r, carInput);
        r.scene.update(r.curr, DT);
      }
      r.scene.snapCamera();
      r.scene.render();
      syncUi(r);
    },
  };

  game.showMenu();
  startLoop();
  return game;
}
