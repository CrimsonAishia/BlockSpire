import type { RunState } from '../../run/run.ts';
import { COMMANDER_MAP, OMEN_SCALING, POTION_MAP, difficultyPolicy } from '../../data/items.ts';
import { url } from '../assets.ts';
import { Emerald, Hearts, PotionTipContent, RelicSlot, Tip, itemIcon } from '../components/common.tsx';
import { overlay } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { quitToTitle } from './RunView.tsx';
import { useEffect } from 'preact/hooks';

const ACT_NUMS = ['', '一', '二', '三', '四', '五', '六', '七'];
const THEME_NAMES: Record<string, string> = {
  lonely_fortress: '孤独堡垒',
  overgrown_temple: '蔓生神殿',
  abyssal_monument: '深渊纪念碑',
  nether_fortress: '下界堡垒',
  gale_sanctum: '疾风圣殿',
  broken_citadel: '破碎堡垒',
};
const ACT_DEFAULT_NAMES = ['', '主世界', '下界', '末地', '筛界', '遗迹远征', '圣殿远征', '破碎堡垒'];

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
          {(() => {
            const pol = difficultyPolicy(s.omen);
            return (
              <>
                <div class="tt-sec tt-red">难度 {pol.omen === 0 ? '0 · 探索' : `${['', 'I', 'II', 'III', 'IV', 'V'][pol.omen]} · ${pol.name}`}（{pol.summary}）</div>
                {pol.rules.map((r) => <div class="tt-line tt-red" key={r}>☠ {r}</div>)}
                <div class="tt-line tt-gray">
                  敌方倍率：生命 ×{pol.hpMul.toFixed(2)} · 攻击 ×{pol.atkMul.toFixed(2)} · 编队预算 ×{pol.formationBudgetMul.toFixed(2)}
                </div>
                <div class="tt-line tt-gray">{OMEN_SCALING}</div>
              </>
            );
          })()}
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
        <div class="act-name">第{ACT_NUMS[s.act] ?? s.act}幕 · {(s.actTheme ? THEME_NAMES[s.actTheme] : null) ?? ACT_DEFAULT_NAMES[s.act] ?? `第${s.act}幕`}</div>
        <div class="faint" style={{ fontSize: 13 }}>
          {s.daily && <span class="gold-t">每日挑战 · </span>}第 {floor} 层 / 14
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
