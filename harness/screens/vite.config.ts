// Harness build: the game's own config with a second page, harness/screens/stages.html, so the
// screenshot script gets the game and the screen stages from one build. `pnpm build` never sees it.
//   vite build --config harness/screens/vite.config.ts --outDir <dir>
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';
import base from '../../vite.config.ts';

const at = (path: string): string => fileURLToPath(new URL(path, import.meta.url));

export default mergeConfig(base, {
  build: { rolldownOptions: { input: { main: at('../../index.html'), stages: at('./stages.html') } } },
});
