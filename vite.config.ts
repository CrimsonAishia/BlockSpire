import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { devApi } from './server/devApi.ts';

export default defineConfig({
  plugins: [preact(), devApi()],
  base: './',
  build: {
    target: 'es2022',
    // Hashed bundles get their own folder so they can be cached forever (public/assets is not hashed).
    assetsDir: 'bundle',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5199, host: true },
});
