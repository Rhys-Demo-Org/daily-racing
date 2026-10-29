import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { tokens } from './guardrails/generated/tokens.ts';
import { PWA_ICONS, pwaIcons } from './guardrails/build/pwa-icons.ts';

const tokensDir = fileURLToPath(new URL('./guardrails/generated/', import.meta.url));

export const alias = [
  { find: /^@tokens$/, replacement: `${tokensDir}tokens.ts` },
  { find: /^@tokens\/css$/, replacement: `${tokensDir}tokens.css` },
];

export default defineConfig({
  resolve: { alias },
  build: { target: 'es2023', assetsInlineLimit: 0 },
  plugins: [
    pwaIcons(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Daily AI Racer',
        short_name: 'AI Racer',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: tokens.color.navy,
        theme_color: tokens.color.navy,
        icons: PWA_ICONS,
      },
      workbox: { globPatterns: ['**/*.{js,css,html,woff2,png}'] },
    }),
  ],
});
