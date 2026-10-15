import { render } from 'preact';
import './styles/main.css';
import './styles/screens.css';
import './styles/battle.css';
import { App } from './ui/App.tsx';
import { unlockAudio } from './audio/audio.ts';

render(<App />, document.getElementById('app')!);

// Prevent accidental browser zoom / context menu inside the game.
window.addEventListener('contextmenu', (e) => e.preventDefault());

// Browsers require a user gesture before audio can play (and may suspend it later).
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => unlockAudio(), { passive: true });

// Dev-only hooks for automated render/stress testing from the browser console.
if (import.meta.env.DEV) {
  Promise.all([import('./battle/sim.ts'), import('./battle/setup.ts'), import('./battle/terrain.ts'), import('./data/encounters.ts'), import('./data/mobs.ts'), import('./ui/assets.ts')]).then(
    ([sim, setup, renderer, enc, mobs, assets]) => {
      (window as unknown as Record<string, unknown>).__dev = { ...sim, ...setup, ...renderer, ...enc, ...mobs, ...assets };
    },
  );
}
