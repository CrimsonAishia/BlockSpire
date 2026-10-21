// 竞技场 setup: where the squads come from (random crates or hand-picked), who plays (one
// spectator or two players on one screen), and the match rules.
import { CRATES, CRATE_MAP } from '../../data/crates.ts';
import { BUDGETS, MAX_NAME, MAX_SQUAD, type Rules } from '../../classic/match.ts';
import { url } from '../assets.ts';
import { Btn } from '../components/common.tsx';
import { go, profile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { selfProfile } from '../../net/bakaboxBridge.ts';

export const CRATE_POOL = CRATES.filter((c) => c.id !== 'ominous');
const GRADES: { id: Rules['grade']; name: string; desc: string }[] = [
  { id: 'normal', name: '标准开箱', desc: '与主世界普通补给箱相同的概率' },
  { id: 'premium', name: '高级开箱', desc: '保密级与隐秘级更常见' },
  { id: 'elite', name: '欧皇模式', desc: '没有军规级，金色传说更多' },
];

const CARDS: { k: 'mode' | 'players'; v: Rules['mode'] | Rules['players']; art: string; name: string; desc: string }[] = [
  { k: 'mode', v: 'crate', art: 'mode_random', name: '随机抽取', desc: '双方轮流开箱，开到什么用什么' },
  { k: 'mode', v: 'lab', art: 'mode_pick', name: '自选阵容', desc: '亲手挑选双方的生物和星级' },
  { k: 'players', v: 1, art: 'mode_solo', name: '单人观战', desc: '开战前竞猜，看系统推演的胜率' },
  { k: 'players', v: 2, art: 'mode_duel', name: '双人同屏', desc: '两人各管一方：暗中选将、各自布阵' },
];

export function ClassicSetup({ rules, onChange, onStart }: { rules: Rules; onChange: (r: Rules) => void; onStart: (r: Rules) => void }) {
  const isLoggedIn = selfProfile.value ? selfProfile.value.isLoggedIn !== false : true;
  const set = (patch: Partial<Rules>) => (sfx('click'), onChange({ ...rules, ...patch }));
  const lab = rules.mode === 'lab';
  const duel = rules.players === 2;
  const c = profile.value.classic;
  const opt = <T,>(cur: T, list: [T, string, string?][], k: keyof Rules) => (
    <div class="row gap4 wrap" style={{ justifyContent: 'flex-end' }}>
      {list.map(([v, label, tip]) => (
        <button key={String(v)} class={`toggle ${cur === v ? 'on' : ''}`} title={tip} onClick={() => set({ [k]: v } as Partial<Rules>)}>
          {label}
        </button>
      ))}
    </div>
  );
  const sizes = (i: 0 | 1) => (
    <div class="row gap4" style={{ alignItems: 'center' }}>
      <span class={i === 0 ? 'blue-t' : 'red-t'} style={{ fontSize: 15, marginRight: 4 }}>
        {rules.names[i]}
      </span>
      {Array.from({ length: MAX_SQUAD }, (_, k) => k + 1).map((n) => (
        <button
          key={n}
          class={`toggle tight ${rules.sizes[i] === n ? 'on' : ''}`}
          onClick={() => set({ sizes: (i === 0 ? [n, rules.sizes[1]] : [rules.sizes[0], n]) as [number, number] })}
        >
          {n}
        </button>
      ))}
    </div>
  );
  const pickCard = (card: (typeof CARDS)[number]) => {
    const on = rules[card.k] === card.v;
    return (
      <button
        key={`${card.k}${card.v}`}
        class={`cl-mode ${on ? 'on' : ''}`}
        onClick={() => {
          // Two players picking by hand need a budget, or both just take the strongest mobs.
          if (card.k === 'players' && card.v === 2 && !rules.budget) set({ players: 2, budget: BUDGETS[1] });
          else set({ [card.k]: card.v } as Partial<Rules>);
        }}
      >
        <img src={url.arena(card.art)} />
        <div class="cl-mode-text">
          <b>{card.name}</b>
          <span>{card.desc}</span>
        </div>
      </button>
    );
  };
  return (
    <div class="screen classic-screen arena-bg">
      <div class="classic-inner setup-inner">
        <div class="row gap12" style={{ alignItems: 'center', marginBottom: 6 }}>
          <div class="cl-title title-shadow" style={{ marginBottom: 0 }}>竞技场</div>
          {!isLoggedIn && <span class="my-tag-pill" style={{ background: '#f59e0b' }}>未登录体验</span>}
        </div>
        <div class="cl-modes">
          <div class="cl-mode-group">
            <div class="cl-mode-label">阵容从哪来</div>
            <div class="row gap12">{CARDS.filter((x) => x.k === 'mode').map(pickCard)}</div>
          </div>
          <div class="cl-mode-group">
            <div class="cl-mode-label">谁来玩</div>
            <div class="row gap12">{CARDS.filter((x) => x.k === 'players').map(pickCard)}</div>
          </div>
        </div>
        <div class="panel cl-setup">
          <div class="set-row">
            <span>
              赛制<span class="faint cl-hint"> · 运气也是混战的一部分，多打几局更能分出真正的强弱</span>
            </span>
            {opt(rules.bo, [[1, '单局'], [3, '三局两胜'], [5, '五局三胜']], 'bo')}
          </div>
          <div class="set-row">
            <span>战场</span>
            {opt(rules.field, [['each', '每局换战场', '每局重新抽一张战场，地形各有利弊'], ['fixed', '固定一张', '整轮对决都在同一张战场上打']], 'field')}
          </div>
          {lab ? (
            <div class="set-row">
              <span>
                费用上限<span class="faint cl-hint"> · 每种生物按实测强度定价，{duel ? '双人对战建议设上限' : '不限就是随便搭'}</span>
              </span>
              {opt(rules.budget, [[0, '不限'], ...BUDGETS.map((b): [number, string] => [b, `${b} 点`])], 'budget')}
            </div>
          ) : (
            <>
              <div class="set-row">
                <span>
                  每方开箱<span class="faint cl-hint"> · 两边可以不一样多；重复开出会升星</span>
                </span>
                <div class="row gap16">
                  {sizes(0)}
                  {sizes(1)}
                </div>
              </div>
              <div class="set-row">
                <span>补给箱</span>
                {opt(rules.crate, [...CRATE_POOL.map((x): [string, string, string] => [x.id, x.name.replace(/「|」|补给箱/g, ''), x.desc]), ['random', '每次随机']], 'crate')}
              </div>
              <div class="set-row">
                <span>开箱品质</span>
                {opt(rules.grade, GRADES.map((g): [Rules['grade'], string, string] => [g.id, g.name, g.desc]), 'grade')}
              </div>
              <div class="set-row">
                <span>
                  败者补给<span class="faint cl-hint"> · 输掉一局的一方再开一箱，越是被碾压补给越好</span>
                </span>
                {opt(rules.comeback, [[false, '关闭'], [true, '开启']], 'comeback')}
              </div>
            </>
          )}
          <div class="set-row">
            <span>{duel ? '玩家名' : '队名'}</span>
            <div class="row gap8">
              {([0, 1] as const).map((i) => (
                <input
                  key={i}
                  class={`mc-input cl-name ${i === 0 ? 'blue' : 'red'}`}
                  value={rules.names[i]}
                  maxLength={MAX_NAME}
                  placeholder={i === 0 ? '蓝方' : '红方'}
                  onInput={(e) => {
                    const n: [string, string] = [...rules.names];
                    n[i] = (e.target as HTMLInputElement).value;
                    onChange({ ...rules, names: n });
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div class="faint" style={{ minHeight: 20 }}>
          {!isLoggedIn ? (
            <span style={{ color: '#f59e0b' }}>
              💡 当前为未登录体验状态：可体验全部竞技对战模式，但对决连胜与战绩不计入全服排位天梯（请在 BakaBox 大厅登录账号）。
            </span>
          ) : duel ? (
            `双人同屏：${lab ? '两人轮流暗中挑选阵容，互相看不到' : `开箱时每人有 2 次重开机会`}；每局开战前各自布阵，上一局输的一方后布阵。${c.duels ? ` 已进行 ${c.duels} 场双人对战` : ''}`
          ) : c.guesses > 0 ? (
            `竞猜战绩：猜中 ${c.correct}/${c.guesses} · 当前连胜 ${c.streak} · 最高连胜 ${c.best}${c.upsets ? ` · 爆冷命中 ${c.upsets}` : ''}`
          ) : !lab && rules.crate !== 'random' ? (
            CRATE_MAP[rules.crate].desc
          ) : (
            ''
          )}
        </div>
        <div class="row gap16 center">
          <Btn size="big" onClick={() => go('title')}>
            返回
          </Btn>
          <Btn variant="gold" size="big" onClick={() => onStart(rules)}>
            {lab ? '挑选阵容' : '开始开箱'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
