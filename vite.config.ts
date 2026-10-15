import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { devApi } from './server/devApi.ts';

/** Build id baked into the game and written to version.json, so open tabs can tell a new deploy is live. */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || Date.now().toString(36);

export default defineConfig({
  plugins: [
    preact(),
    devApi(),
    {
      name: 'block-spire-version',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID }) });
      },
    },
  ],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
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
