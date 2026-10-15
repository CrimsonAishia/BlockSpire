// 竞技场 · 自选阵容: pick any mob for either side ("who would win?"), optionally within a point
// budget. With two players each side is picked in secret: only `only` is shown and editable.
// The arena never reads or writes the codex, so every mob is available here.
import { useState } from 'preact/hooks';
import { PLAYABLE_MOBS, RARITY_INFO, mobDef } from '../../data/mobs.ts';
import { RARITIES } from '../../core/types.ts';
import { MAX_SQUAD, cardCost, squadCost, type Pick, type Teams } from '../../classic/match.ts';
import { url } from '../assets.ts';
import { Btn, MobCard, MobTipContent, Tip } from '../components/common.tsx';
import { sfx } from '../../audio/audio.ts';

const ORDER = [...PLAYABLE_MOBS].sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity));

/** A random squad: three ★1 mobs, or as much as the budget buys (up to the squad limit). */
export function randomSquad(budget: number): Pick[] {
  const pool = ORDER.map((m) => m.id).sort(() => Math.random() - 0.5);
  if (!budget) return pool.slice(0, 3).map((mob) => ({ mob, star: 1 }));
  const t: Pick[] = [];
  let left = budget;
  for (let tries = 0; tries < 300 && left > 0; tries++) {
    if (t.length && (t.length >= MAX_SQUAD || Math.random() < 0.3)) {
      const c = t[Math.floor(Math.random() * t.length)];
      const d = c.star < 3 ? cardCost(c.mob, c.star + 1) - cardCost(c.mob, c.star) : Infinity;
      if (d <= left) {
        left -= d;
        c.star++;
      }
      continue;
    }
    const mob = pool[tries % pool.length];
    if (t.some((c) => c.mob === mob) || cardCost(mob, 1) > left) continue;
    t.push({ mob, star: 1 });
    left -= cardCost(mob, 1);
  }
  return t;
}

interface Props {
  initial: Teams;
  names: [string, string];
  /** Points each side may spend (0 = no limit). */
  budget: number;
  /** Two players: the side picking now (the other side stays hidden). */
  only?: 0 | 1;
  onBack: () => void;
  onDone: (t: Teams) => void;
}

export function ClassicPicker({ initial, names, budget, only, onBack, onDone }: Props) {
  const [teams, setTeams] = useState<Teams>(() => [initial[0].map((p) => ({ ...p })), initial[1].map((p) => ({ ...p }))]);
  const [side, setSide] = useState<0 | 1>(only ?? 0);
  const [note, setNote] = useState<string | null>(null);
  const duel = only !== undefined;

  const flash = (t: string) => {
    setNote(t);
    sfx('error', { vol: 0.5 });
    window.setTimeout(() => setNote((n) => (n === t ? null : n)), 1800);
  };
  const edit = (i: 0 | 1, fn: (t: Pick[]) => Pick[]) => setTeams((t) => (i === 0 ? [fn(t[0]), t[1]] : [t[0], fn(t[1])]));
  const left = (i: 0 | 1) => (budget ? budget - squadCost(teams[i]) : Infinity);

  const starUp = (i: 0 | 1, mob: string) => {
    const c = teams[i].find((p) => p.mob === mob)!;
    if (c.star >= 3) return flash(`${mobDef(mob).name} 已经是 ★3 了`);
    const d = cardCost(mob, c.star + 1) - cardCost(mob, c.star);
    if (d > left(i)) return flash(`费用不够：升到 ★${c.star + 1} 还要 ${d} 点`);
    sfx('levelup', { vol: 0.4 });
    edit(i, (s) => s.map((p) => (p.mob === mob ? { ...p, star: p.star + 1 } : p)));
  };

  const add = (mob: string) => {
    if (teams[side].some((p) => p.mob === mob)) return starUp(side, mob);
    if (teams[side].length >= MAX_SQUAD) return flash(`${names[side]}已经有 ${MAX_SQUAD} 种生物了`);
    if (cardCost(mob, 1) > left(side)) return flash(`费用不够：${mobDef(mob).name} 要 ${cardCost(mob, 1)} 点，只剩 ${left(side)} 点`);
    sfx('card_flip', { vol: 0.5 });
    edit(side, (s) => [...s, { mob, star: 1 }]);
  };

  const random = () => {
    sfx('page');
    if (duel) edit(side, () => randomSquad(budget));
    else setTeams([randomSquad(budget), randomSquad(budget)]);
  };

  const shown: (0 | 1)[] = [0, 1];
  const ready = duel ? teams[side].length > 0 : teams[0].length > 0 && teams[1].length > 0;

  return (
    <div class="screen classic-screen arena-bg">
      <div class="classic-inner pick-inner">
        <div class="cl-title title-shadow">{duel ? `${names[side]}挑选阵容` : '自选阵容'}</div>
        <div class="subtle">
          点下方的生物加入{duel ? '你的阵容' : '选中的一方'}，再点一次升星。每方最多 {MAX_SQUAD} 种
          {budget ? `，费用上限 ${budget} 点（2 点约等于一只军规级 ★1）` : '，不限费用'}。
        </div>
        <div class="pick-sides">
          {shown.map((i) => {
            const hidden = duel && i !== side;
            if (hidden)
              return (
                <div key={i} class={`cl-team pick-side ${i === 0 ? 'blue' : 'red'} hidden-side`}>
                  <div class="cl-team-name">{names[i]}</div>
                  <div class="pick-lock">{teams[i].length ? `${names[i]}的阵容已锁定，开战前揭晓` : `等你锁定阵容后，轮到${names[i]}挑选`}</div>
                </div>
              );
            const spent = squadCost(teams[i]);
            return (
              <div key={i} class={`cl-team pick-side ${i === 0 ? 'blue' : 'red'} ${side === i ? 'on' : ''}`} onClick={() => !duel && side !== i && (sfx('click'), setSide(i))}>
                <div class="cl-team-name">
                  {names[i]}
                  <span class="faint" style={{ fontSize: 15 }}>
                    {' '}
                    {teams[i].length}/{MAX_SQUAD} 种{!duel && (side === i ? ' · 正在挑选' : ' · 点这里切换')}
                  </span>
                </div>
                {budget > 0 && (
                  <div class="pick-budget">
                    <div class="pick-budget-bar">
                      <div style={{ width: `${Math.min(100, (spent / budget) * 100)}%` }} />
                    </div>
                    <span>
                      费用 {spent}/{budget}
                    </span>
                  </div>
                )}
                <div class="row gap8 center pick-row">
                  {teams[i].map((p) => (
                    <div key={p.mob} class="col gap4 pick-card" style={{ alignItems: 'center' }}>
                      <MobCard mob={p.mob} star={p.star} size="sm" onClick={() => starUp(i, p.mob)} />
                      <div class="row gap4" style={{ alignItems: 'center' }}>
                        {budget > 0 && <span class="pick-cost">{cardCost(p.mob, p.star)}点</span>}
                        {p.star > 1 && (
                          <button
                            class="pick-x"
                            title="降一星"
                            onClick={(e) => {
                              e.stopPropagation();
                              sfx('click');
                              edit(i, (s) => s.map((q) => (q.mob === p.mob ? { ...q, star: q.star - 1 } : q)));
                            }}
                          >
                            降星
                          </button>
                        )}
                        <button
                          class="pick-x"
                          onClick={(e) => {
                            e.stopPropagation();
                            sfx('click');
                            edit(i, (s) => s.filter((q) => q.mob !== p.mob));
                          }}
                        >
                          移除
                        </button>
                      </div>
                    </div>
                  ))}
                  {Array.from({ length: MAX_SQUAD - teams[i].length }, (_, k) => (
                    <div key={`e${k}`} class="pick-empty" />
                  ))}
                </div>
              </div>
            );
          })}
          <div class="cl-vs">VS</div>
        </div>
        <div class="panel pick-pool">
          {ORDER.map((m) => {
            const cost = cardCost(m.id, 1);
            const owned = teams[side].some((p) => p.mob === m.id);
            const poor = budget > 0 && !owned && cost > left(side);
            return (
              <Tip key={m.id} content={() => <MobTipContent mob={m.id} />}>
                <button class={`pick-mob r-${m.rarity} ${owned ? 'owned' : ''} ${poor ? 'poor' : ''}`} style={{ '--rc': RARITY_INFO[m.rarity].color } as never} onClick={() => add(m.id)}>
                  <img src={url.mob(m.id)} loading="lazy" />
                  <span>{m.name}</span>
                  {budget > 0 && <b class="pick-mob-cost">{cost}</b>}
                </button>
              </Tip>
            );
          })}
        </div>
        {note && <div class="pick-note">{note}</div>}
        <div class="row gap16 center">
          <Btn size="big" onClick={onBack}>
            返回
          </Btn>
          <Btn size="big" onClick={random}>
            随机阵容
          </Btn>
          {!duel && (
            <Btn size="big" onClick={() => (sfx('page'), setTeams([teams[1], teams[0]]))} disabled={!teams[0].length && !teams[1].length}>
              交换双方
            </Btn>
          )}
          <Btn size="big" onClick={() => (duel ? edit(side, () => []) : setTeams([[], []]))} disabled={duel ? !teams[side].length : !teams[0].length && !teams[1].length}>
            清空
          </Btn>
          <Btn variant="gold" size="big" disabled={!ready} onClick={() => onDone(teams)}>
            {duel ? '锁定阵容' : '确定阵容'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
