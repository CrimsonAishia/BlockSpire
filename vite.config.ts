import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { devApi } from './server/devApi.ts';

/** Build id baked into the game and written to version.json, so open tabs can tell a new deploy is live. */
const BUILD_ID = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || Date.now().toString(36);

export default defineConfig(async () => {
  // Support @plugin-web-update-notification/vite if installed, or gracefully fallback
  let updatePlugin: Plugin | null = null;
  try {
    const { webUpdateNotice } = await import('@plugin-web-update-notification/vite');
    updatePlugin = webUpdateNotice({
      logVersion: true,
      locale: 'zh_CN',
      hiddenDefaultNotification: true,
      notificationProps: {
        title: '📢 发现新版本',
        description: '游戏已更新，请刷新后使用最新版本',
        buttonText: '刷新页面',
        dismissButtonText: '稍后再说',
      },
    }) as Plugin;
  } catch {
    /* Dependency not yet installed in node_modules, native fallback used below */
  }

  return {
    plugins: [
      preact(),
      devApi(),
      updatePlugin,
      {
        name: 'block-spire-version',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'version.json',
            source: JSON.stringify({ id: BUILD_ID, version: BUILD_ID }),
          });
        },
      },
    ].filter(Boolean),
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
  };
});
