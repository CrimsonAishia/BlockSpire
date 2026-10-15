import type { RunState } from '../../run/run.ts';
import { COMMANDER_MAP, OMENS, OMEN_SCALING, POTION_MAP } from '../../data/items.ts';
import { url } from '../assets.ts';
import { Emerald, Hearts, PotionTipContent, RelicSlot, Tip, itemIcon } from '../components/common.tsx';
import { overlay } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { quitToTitle } from './RunView.tsx';
import { useEffect } from 'preact/hooks';

const ACT_NAMES = ['', '主世界', '下界', '末地', '筛界'];

export function RunHud({ s }: { s: RunState }) {
  const cmd = COMMANDER_MAP[s.commander];
  const floor = s.nodeId ? s.map.nodes[s.nodeId].row + 1 : 0;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' || e.code === 'Tab') {
        e.preventDefault();
        overlay.value = overlay.value === 'team' ? null : 'team';
        sfx('page');
      }
      if (e.code === 'Escape' && overlay.value) overlay.value = null;
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  return (
    <div class="hud">
      <Tip content={() => (
        <div>
          <div class="tt-title" style={{ color: cmd.color }}>{cmd.name} · {cmd.title}</div>
          {cmd.desc.map((d) => <div class="tt-line" key={d}>{d}</div>)}
          {s.omen > 0 && (
            <>
              <div class="tt-sec tt-red">不祥之兆 {['', 'I', 'II', 'III', 'IV', 'V'][s.omen]}</div>
              {OMENS.slice(0, s.omen).flatMap((o) => o.rules.map((r) => <div class="tt-line tt-red" key={r}>☠ {r}</div>))}
              <div class="tt-line tt-gray">{OMEN_SCALING}</div>
            </>
          )}
        </div>
      )}>
        <img class="cmd-face" src={url.cmd(s.commander)} />
      </Tip>
      <div class="stat">
        <Hearts hearts={s.hearts} max={s.maxHearts} />
      </div>
      <div class="sep" />
      <div class="stat">
        <Emerald n={s.emeralds} size={26} />
      </div>
      <div class="sep" />
      <div class="row gap4">
        {Array.from({ length: s.potionSlots }, (_, i) => {
          const p = s.potions[i];
          return p ? (
            <Tip key={i} class="slot dark" content={() => <PotionTipContent id={p} />}>
              <img src={itemIcon(p)} />
            </Tip>
          ) : (
            <div key={i} class="slot dark" style={{ opacity: 0.5 }} title={POTION_MAP[p]?.name ?? '空物品栏'} />
          );
        })}
      </div>
      <div class="sep" />
      <div class="relic-row grow">
        {s.relics.map((r) => (
          <RelicSlot key={r} id={r} />
        ))}
        {!s.relics.length && <span class="faint" style={{ fontSize: 14 }}>暂无宝物</span>}
      </div>
      <div class="hud-act">
        <div class="act-name">第{['', '一', '二', '三', '四'][s.act]}幕 · {ACT_NAMES[s.act]}</div>
        <div class="faint" style={{ fontSize: 13 }}>
          第 {floor} 层 / 14
        </div>
      </div>
      <button class="mc-btn small" onClick={() => (sfx('page'), (overlay.value = 'team'))}>
        队伍 <span class="kbd">T</span>
      </button>
      <button class="mc-btn small icon-btn" title="设置" onClick={() => (sfx('click'), (overlay.value = 'settings'))}>
        ⚙
      </button>
      <button class="mc-btn small icon-btn" title="保存并返回主菜单" onClick={() => (sfx('click'), quitToTitle())}>
        ⌂
      </button>
    </div>
  );
}
