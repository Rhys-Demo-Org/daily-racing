// M2 render preview (throwaway spike): the race scene from the hand-written Dust Bowl fixture, with
// the player mid-track, two AI cars, props in view and some dust. Query: ?at=<lap fraction>.
import { createRaceScene, createRenderer, playerLivery, type CarLivery } from '../../src/render/index.ts';
import type { CarView } from '../../src/sim/types.ts';
import { dustBowlFixture } from '../../tests/render/fixture.ts';

declare global {
  interface Window {
    __preview: { ready: boolean; render: () => void; triangles: number; playerScreen: () => [number, number] };
  }
}

const fx = dustBowlFixture();
const liveries: CarLivery[] = [
  playerLivery(1),
  { body: 'mustard', stripe: 'navy', number: 7, player: false },
  { body: 'teal', stripe: 'cream', number: 4, player: false },
];
const canvas = document.getElementById('c') as HTMLCanvasElement;
const renderer = createRenderer(canvas);
const race = createRaceScene(fx.layout, liveries, renderer);
race.resize(window.innerWidth, window.innerHeight);
window.addEventListener('resize', () => race.resize(window.innerWidth, window.innerHeight));

const at0 = Number(new URLSearchParams(location.search).get('at') ?? 0.05);
const dt = 1 / 60;
const speed = 24;
/** A car `lead` units ahead of the player along the lap, `lane` units right of the centreline. */
const view = (f: number, lane: number, over: Partial<CarView>): CarView => {
  const s = fx.at(f);
  return {
    x: s.x + Math.cos(s.heading) * lane,
    y: 0,
    z: s.z + Math.sin(s.heading) * lane,
    heading: s.heading,
    pitch: 0,
    speed,
    slip: 0,
    surface: 'dirt',
    airborne: false,
    ...over,
  };
};
// Drive ~1 s so the camera settles and the player's slide leaves a dust trail.
const frames = 60;
for (let k = 0; k <= frames; k++) {
  const f = at0 + ((k - frames) * speed * dt) / fx.length;
  const p = view(f, 1.2, { slip: 0.8 });
  p.heading += 0.35; // sliding: nose turned into the corner
  // AI #7 just off the ramp lip (airborne), AI #4 behind the player.
  const jump = view(0.09 + 3.5 / fx.length, -1.2, { y: 1.1, airborne: true });
  race.update([p, jump, view(f - 11 / fx.length, -1.6, {})], dt);
}
race.render();

let triangles = 0;
race.scene.traverse((o) => {
  const g = (o as { geometry?: { getAttribute: (n: string) => { count: number } | undefined } }).geometry;
  if ((o as { isMesh?: boolean }).isMesh && g) triangles += (g.getAttribute('position')?.count ?? 0) / 3;
});
const playerScreen = (): [number, number] => {
  const v = race.cars[0]!.root.position.clone().project(race.camera);
  return [((v.x + 1) / 2) * window.innerWidth, ((1 - v.y) / 2) * window.innerHeight];
};
window.__preview = { ready: true, render: () => race.render(), triangles, playerScreen };
