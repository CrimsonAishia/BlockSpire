import { useEffect, useMemo } from 'preact/hooks';
import { url } from '../assets.ts';
import { Btn } from '../components/common.tsx';
import { compact, go, overlay, profile, setRun } from '../store.ts';
import { FullscreenButton } from '../components/fullscreen.tsx';
import { loadRun } from '../../meta/profile.ts';
import { playMusic } from '../../audio/audio.ts';
import { PLAYABLE_MOBS } from '../../data/mobs.ts';
import { COMMANDER_MAP } from '../../data/items.ts';
import { ACHIEVEMENTS, ROMAN_OMEN } from '../../meta/profile.ts';
import { dailyState, lbTab } from './Leaderboard.tsx';
import { isHostConnected } from '../../net/bakaboxBridge.ts';

const SPLASHES = [
  '开箱即战斗！',
  '保底已就绪！',
  '嘶……',
  '金色传说！',
  '别盯着末影人看！',
  '数值魔改版！',
  '100% 不含 Herobrine！',
  '僵尸也能升三星！',
  '史莱姆越打越多！',
  '蠹虫一窝端！',
  '也去竞技场看看！',
  '欧皇附体！',
];

export function Title() {
  const save = useMemo(() => loadRun(), []);
  const splash = useMemo(() => SPLASHES[Math.floor(Math.random() * SPLASHES.length)], []);
  const p = profile.value;
  const found = p.discovered.filter((d) => PLAYABLE_MOBS.some((m) => m.id === d)).length;
  const daily = dailyState();
  const ach = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
  useEffect(() => {
    playMusic('menu');
  }, []);
  return (
    <div class="screen title-screen" style={{ backgroundImage: `url(${url.bg('title')})` }}>
      <div class="title-shade" />
      <div class="title-left">
        <div class="logo">
          <div class="logo-main">方块尖塔</div>
          <div class="logo-sub">BLOCK SPIRE</div>
          <div class="splash">{splash}</div>
        </div>
        <div class="tagline">开箱 · 爬塔 · 自走混战</div>
        <div class="menu">
          {save && (
            <Btn
              variant="green"
              size="big"
              wide
              onClick={() => {
                setRun(save);
                go('run');
              }}
            >
              继续冒险
              <span class="menu-note">
                {save.daily ? '每日挑战 · ' : ''}第{['', '一', '二', '三', '四'][save.act]}幕 · ❤{save.hearts}
              </span>
            </Btn>
          )}
          <Btn variant={save ? '' : 'green'} size="big" wide onClick={() => go('newrun')}>
            {save ? '新的爬塔' : '开始爬塔'}
          </Btn>
          {isHostConnected.value && (
            <Btn size="big" wide onClick={() => ((lbTab.value = 'daily'), go('leaderboard'))}>
            每日挑战
            <span class="menu-note">
              {daily.status === 'done' ? '今日次数已用完' : `今日：${COMMANDER_MAP[daily.cfg.commander].name} · 不祥之兆 ${ROMAN_OMEN[daily.cfg.omen]}`}
            </span>
          </Btn>
          )}
          <Btn size="big" wide onClick={() => go('classic')}>
            竞技场
            <span class="menu-note">自选 · 随机 · 双人同屏</span>
          </Btn>
          <Btn size="big" wide disabled>
            联机对战 <span class="menu-note">敬请期待</span>
          </Btn>
          <div class="row gap12 menu-row">
            <Btn size="big" wide onClick={() => go('codex')}>
              图鉴
            </Btn>
            {isHostConnected.value && (
              <Btn size="big" wide onClick={() => ((lbTab.value = 'week'), go('leaderboard'))}>
              排行榜
            </Btn>
            )}
            <Btn size="big" wide onClick={() => (overlay.value = 'settings')}>
              设置
            </Btn>
          </div>
        </div>
        <div class="title-stats faint">
          通关 {p.wins} / {p.runs} 局 · 图鉴 {found}/{PLAYABLE_MOBS.length} · 成就 {ach}/{ACHIEVEMENTS.length} · 最高分 {p.bestScore}
        </div>
      </div>
      <div class="title-corner">
        {compact.value && <FullscreenButton />}

      </div>
      <div class="title-foot faint">v1.0 · 非 Mojang 官方作品 · 美术由 AI 生成 · 字体 Fusion Pixel (OFL)</div>
    </div>
  );
}
