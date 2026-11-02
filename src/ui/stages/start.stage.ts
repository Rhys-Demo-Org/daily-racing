// The menu: the start screen as the game first shows it.
import { createStartScreen } from '../start-screen.ts';
import { menuLayer, stageTrack, type StageFile } from './stage.ts';

export default {
  menu(root) {
    const track = stageTrack();
    createStartScreen(menuLayer(root), { onRace: () => {}, subtitle: `${track.name} · ${track.laps} laps` }).show();
  },
} satisfies StageFile;
