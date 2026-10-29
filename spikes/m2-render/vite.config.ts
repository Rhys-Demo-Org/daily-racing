import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { alias } from '../../vite.config.ts';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias },
  build: { outDir: '/tmp/m2-render-dist', emptyOutDir: true, target: 'es2023' },
});
