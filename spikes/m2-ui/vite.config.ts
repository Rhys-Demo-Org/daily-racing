import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { alias } from '../../vite.config.ts';

// M2 UI preview (throwaway). Serves the repo's public/ so the self-hosted fonts load.
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: fileURLToPath(new URL('../../public', import.meta.url)),
  resolve: { alias },
  build: { outDir: '/tmp/m2-ui-dist', emptyOutDir: true, target: 'es2023' },
});
