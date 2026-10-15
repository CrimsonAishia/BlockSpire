import { useEffect, useState } from 'preact/hooks';
import { screen, stageScale, overlay, toasts, settings, go } from './store.ts';
import { TooltipLayer } from './components/common.tsx';
import { Title } from './screens/Title.tsx';
import { NewRun } from './screens/NewRun.tsx';
import { RunView } from './screens/RunView.tsx';
import { Codex } from './screens/Codex.tsx';
import { Classic } from './screens/Classic.tsx';
import { SettingsModal } from './screens/Settings.tsx';
import { preload, url } from './assets.ts';
import { MOBS } from '../data/mobs.ts';
import { RELICS, POTIONS } from '../data/items.ts';
import { CRATES } from '../data/crates.ts';
import { COMMANDERS } from '../data/items.ts';
import { setVolumes, unlockAudio } from '../audio/audio.ts';

const W = 1600;
const H = 900;

function useStageScale() {
  const [layout, setLayout] = useState({ s: 1, x: 0, y: 0 });
  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / W, window.innerHeight / H);
      setLayout({ s, x: (window.innerWidth - W * s) / 2, y: (window.innerHeight - H * s) / 2 });
      stageScale.value = s;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return layout;
}

function Boot() {
  const [prog, setProg] = useState(0);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Only what the first screens need blocks the boot; everything else streams in afterwards.
    const core = [url.bg('title'), ...COMMANDERS.map((c) => url.cmd(c.id)), ...['stone', 'dirt'].map(url.tex), url.icon('emerald')];
    const fontReady = document.fonts?.load('16px Pixel').catch(() => null);
    Promise.all([preload(core, setProg), fontReady]).then(() => {
      setReady(true);
      const rest = [
        ...MOBS.map((m) => url.mob(m.id)).filter((v, i, a) => a.indexOf(v) === i),
        ...CRATES.map((c) => url.crate(c.id)),
        ...RELICS.map((r) => url.icon(r.id)),
        ...POTIONS.map((p) => url.icon(`potion_${p.id}`)),
        ...['enchanted_book', 'node_battle', 'node_elite', 'node_shop', 'node_event', 'node_rest', 'node_treasure', 'node_boss', 'smithing', 'bed', 'golden_apple'].map(url.icon),
        ...['netherrack', 'endstone'].map(url.tex),
        url.bg('arena_overworld'),
        url.bg('arena_nether'),
        url.bg('arena_end'),
      ];
      void preload(rest);
      // Warm up the 3D battle module while the player is in menus.
      setTimeout(() => void import('../battle3d/arena3d.ts'), 1200);
    });
  }, []);
  const enter = () => {
    if (!ready) return;
    unlockAudio();
    const s = settings.value;
    setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    go('title');
  };
  useEffect(() => {
    if (!ready) return;
    const k = () => enter();
    window.addEventListener('keydown', k, { once: true });
    return () => window.removeEventListener('keydown', k);
  }, [ready]);
  return (
    <div class="screen boot-screen bg-dirt" onClick={enter}>
      <div class="boot-inner">
        <div class="logo">
          <div class="logo-main">方块斗兽场</div>
          <div class="logo-sub">MOB CRATE ARENA</div>
        </div>
        <div class="boot-bar">
          <div class="boot-fill" style={{ width: `${Math.round(prog * 100)}%` }} />
        </div>
        <div class={`boot-hint ${ready ? 'blink' : ''}`}>{ready ? '点击任意处开始' : `正在生成世界…… ${Math.round(prog * 100)}%`}</div>
      </div>
    </div>
  );
}

export function App() {
  const layout = useStageScale();
  const sc = screen.value;
  let body;
  switch (sc) {
    case 'boot':
      body = <Boot />;
      break;
    case 'title':
      body = <Title />;
      break;
    case 'newrun':
      body = <NewRun />;
      break;
    case 'run':
      body = <RunView />;
      break;
    case 'codex':
      body = <Codex />;
      break;
    case 'classic':
      body = <Classic />;
      break;
    default:
      body = <Title />;
  }
  return (
    <div class="stage" style={{ transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.s})`, left: 0, top: 0 }}>
      {body}
      {overlay.value === 'settings' && <SettingsModal />}
      <div class="toasts">
        {toasts.value.map((t) => (
          <div key={t.id} class={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
      <TooltipLayer />
      {settings.value.fps && <div id="fps" class="fps" />}
    </div>
  );
}
