import { useEffect, useState } from 'preact/hooks';
import { screen, stageScale, stageSize, compact, overlay, toasts, settings, go, getRun, runVersion } from './store.ts';
import { dismissUpdate, reloadForUpdate, updateDismissed, updateReady } from './update.ts';
import { TooltipLayer } from './components/common.tsx';
import { FullscreenButton, canFullscreen } from './components/fullscreen.tsx';
import { Title } from './screens/Title.tsx';
import { NewRun } from './screens/NewRun.tsx';
import { RunView } from './screens/RunView.tsx';
import { Codex } from './screens/Codex.tsx';
import { Classic } from './screens/Classic.tsx';
import { Leaderboard } from './screens/Leaderboard.tsx';
import { SettingsModal } from './screens/Settings.tsx';
import { preload, url } from './assets.ts';
import { MOBS } from '../data/mobs.ts';
import { RELICS, POTIONS } from '../data/items.ts';
import { CRATES } from '../data/crates.ts';
import { COMMANDERS } from '../data/items.ts';
import { setVolumes, unlockAudio } from '../audio/audio.ts';

const W = 1600;
const H = 900;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Fits the stage to the window. Phones, tablets and very small windows get a smaller design canvas
 * (down to 1280×600, matching the screen's shape) so the UI renders larger, plus the compact styles.
 */
function useStageScale() {
  const [layout, setLayout] = useState({ s: 1, x: 0, y: 0, portrait: false });
  useEffect(() => {
    const coarse = window.matchMedia?.('(pointer: coarse)');
    const fit = () => {
      // A phone's on-screen keyboard shrinks the window: keep the layout while typing.
      if (compact.value && document.activeElement?.matches('input, textarea')) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const small = vh < 560 || vw < 900 || (!!coarse?.matches && Math.min(vw, vh) < 820);
      let w = W;
      let h = H;
      if (small) {
        // Aim for ~0.6 CSS px per stage px; in portrait, size it for the landscape it should be turned to.
        const [lw, lh] = vw >= vh ? [vw, vh] : [vh, vw];
        w = clamp(Math.round(lw / 0.6), 1280, W);
        h = clamp(Math.round((w * lh) / lw), 600, H);
      }
      const s = Math.min(vw / w, vh / h);
      setLayout({ s, x: (vw - w * s) / 2, y: (vh - h * s) / 2, portrait: small && vh > vw });
      stageSize.value = { w, h };
      compact.value = small;
      stageScale.value = s;
    };
    // After typing, once the keyboard has closed (or focus moved to another field).
    const refit = () => setTimeout(fit, 250);
    fit();
    window.addEventListener('resize', fit);
    window.addEventListener('focusout', refit);
    coarse?.addEventListener?.('change', fit);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('focusout', refit);
      coarse?.removeEventListener?.('change', fit);
    };
  }, []);
  return layout;
}

/** Phones held upright: the game is landscape only. */
function RotateHint() {
  return (
    <div class="rotate-hint">
      <div class="rotate-phone" />
      <div class="rotate-text">请把手机横过来玩</div>
      <div class="rotate-sub">方块尖塔是横屏游戏</div>
      {canFullscreen() && <FullscreenButton label="全屏并横屏" />}
    </div>
  );
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
          <div class="logo-main">方块尖塔</div>
          <div class="logo-sub">BLOCK SPIRE</div>
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
    case 'leaderboard':
      body = <Leaderboard />;
      break;
    default:
      body = <Title />;
  }
  const size = stageSize.value;
  return (
    <>
    <div
      class={`stage ${compact.value ? 'compact' : ''}`}
      style={{ transform: `translate(${layout.x}px, ${layout.y}px) scale(${layout.s})`, left: 0, top: 0, width: size.w, height: size.h }}
    >
      {body}
      {overlay.value === 'settings' && <SettingsModal />}
      {updateReady.value && <UpdateTip />}
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
    {layout.portrait && <RotateHint />}
    </>
  );
}

/** Offered outside battles only: refreshing mid-fight would restart the fight. */
function UpdateTip() {
  runVersion.value;
  const sc = screen.value;
  if (updateDismissed.value || sc === 'boot' || sc === 'classic' || (sc === 'run' && getRun()?.queue[0]?.type === 'battle')) return null;
  return (
    <div class="update-tip">
      <div class="update-tip-icon">📢</div>
      <div class="update-tip-info">
        <div class="update-tip-title">发现新版本</div>
        <div class="update-tip-desc">游戏已更新，请刷新以获取最新内容</div>
      </div>
      <div class="row gap8">
        <button class="mc-btn small green" onClick={() => reloadForUpdate()}>
          立即刷新
        </button>
        <button class="mc-btn small" onClick={() => dismissUpdate()} title="稍后再说">
          稍后再说
        </button>
      </div>
    </div>
  );
}
