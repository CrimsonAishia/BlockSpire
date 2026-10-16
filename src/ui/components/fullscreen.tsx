import { signal } from '@preact/signals';
import { sfx } from '../../audio/audio.ts';

/** Bumped on fullscreen changes so buttons re-render. */
const fsVersion = signal(0);
document.addEventListener('fullscreenchange', () => fsVersion.value++);

/** Fullscreen is available (Android browsers, iPad; not iPhone Safari) and not already on. */
export function canFullscreen() {
  void fsVersion.value;
  return !!document.fullscreenEnabled && !document.fullscreenElement;
}

/** Fullscreen hides the browser bars; phones are also locked to landscape where the browser allows it. */
export async function goFullscreen() {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const o = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    await o.lock?.('landscape').catch(() => undefined);
  } catch {
    /* refused (no user gesture, or not supported here) */
  }
}

/** Settings: enter or leave fullscreen (only where the browser supports it). */
export function FullscreenToggle() {
  void fsVersion.value;
  if (!document.fullscreenEnabled) return null;
  if (!document.fullscreenElement) return <FullscreenButton label="进入全屏" />;
  return (
    <button
      class="mc-btn small fs-btn"
      onClick={() => {
        sfx('click');
        void document.exitFullscreen().catch(() => undefined);
      }}
    >
      退出全屏
    </button>
  );
}

export function FullscreenButton({ label = '全屏', class: cls = '' }: { label?: string; class?: string }) {
  if (!canFullscreen()) return null;
  return (
    <button
      class={`mc-btn small fs-btn ${cls}`}
      onClick={() => {
        sfx('click');
        void goFullscreen();
      }}
    >
      ⛶ {label}
    </button>
  );
}
