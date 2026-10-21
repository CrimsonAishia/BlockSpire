// Deploys while people are playing: an open tab keeps running the build it loaded. It notices a
// newer build (dist/version.json, written by vite.config.ts or @plugin-web-update-notification) and
// offers a refresh outside of battles, and reloads by itself when a lazily loaded chunk of the old build is gone.
import { signal } from '@preact/signals';
import { freezeStorage } from './store.ts';

/** A newer build is live; the player can refresh when convenient. */
export const updateReady = signal(false);

/** Player clicked "稍后再说" (dismissed for current session). */
export const updateDismissed = signal(false);

export function dismissUpdate() {
  updateDismissed.value = true;
}

const RELOADED_AT = 'bs.reloadedAt';
const CHECK_EVERY = 2 * 60_000;

/** Saves and reloads into the new build. False if we already reloaded moments ago (no loops). */
export function reloadForUpdate(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT) || 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOADED_AT, String(Date.now()));
  } catch {
    /* no sessionStorage: reload anyway */
  }
  freezeStorage();
  location.reload();
  return true;
}

async function check() {
  if (updateReady.value) return;
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = (await res.json()) as { id?: string; version?: string };
    const remoteId = data.version || data.id;
    if (remoteId && remoteId !== __BUILD_ID__) {
      updateReady.value = true;
      updateDismissed.value = false;
    }
  } catch {
    /* offline: try again later */
  }
}

export function watchForUpdates() {
  if (import.meta.env.DEV) return;

  // Compatible with @plugin-web-update-notification/vite custom event
  const handlePluginNotice = () => {
    updateReady.value = true;
    updateDismissed.value = false;
  };
  document.body.addEventListener('plugin_web_update_notice', handlePluginNotice);

  // A chunk of the old build that is no longer deployed (e.g. the 3D battle module).
  window.addEventListener('vite:preloadError', (e) => {
    if (reloadForUpdate()) e.preventDefault();
  });

  setTimeout(check, 15_000);
  setInterval(check, CHECK_EVERY);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void check());
}
