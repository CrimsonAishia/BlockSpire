import type { Pending, RunState, GainOutcome } from '../../run/run.ts';
import {
  allCards, applyOpen, backToCrates, chooseCrate, decideCard, dustValue, finishOpen, openContext, rollStarter, shardsNeeded, skipCrates,
} from '../../run/run.ts';
import { CRATE_MAP, GRADE_INFO, effectiveOdds } from '../../data/crates.ts';
import { MOB_MAP, RARITY_INFO, mobDef } from '../../data/mobs.ts';
import { RARITIES } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, Emerald, FamBadge, MobCard, MobTipContent, Tip } from '../components/common.tsx';
import { CrateOpen, type RevealInfo } from './CrateOpen.tsx';
import { act } from './RunView.tsx';
import { discover } from '../store.ts';
import { Hint } from '../components/hints.tsx';
import { sfx } from '../../audio/audio.ts';

type P<T extends Pending['type']> = Extract<Pending, { type: T }>;

export function outcomeInfo(out: GainOutcome, mob: string): RevealInfo {
  const name = mobDef(mob).name;
  switch (out.kind) {
    case 'team':
      return { headline: `${name} 加入了出战队伍！`, tone: 'new' };
    case 'bench':
      return { headline: `${name} 放入了背包`, detail: '队伍已满，可在「队伍」界面调整上阵卡牌。', tone: 'new' };
    case 'merge':
      return out.starUp
        ? { headline: `★ 升星！${name} 升至 ★${out.card.star}`, detail: out.card.star === 3 ? `解锁 ★3 能力：${mobDef(mob).star3}` : '生命、攻击与出战数量全面提升。', tone: 'star' }
        : { headline: `重复！${name} 升星进度 ${out.card.shards}/${shardsNeeded(out.card.star)}`, detail: `再获得 ${shardsNeeded(out.card.star) - out.card.shards} 张即可升至 ★${out.card.star + 1}`, tone: 'merge' };
    case 'dust':
      return { headline: `${name} 已满星`, detail: `自动分解为 ${out.emeralds} 绿宝石`, tone: 'dust' };
    case 'decide':
      return { headline: '队伍与背包都已满', detail: '选择替换一张卡牌，或分解这张新卡牌。', tone: 'decide' };
  }
}

export function RunCrateOpen({ s, p }: { s: RunState; p: P<'open'>; v?: number }) {
  return (
    <CrateOpen
      key={`open-${p.seq}`}
      crate={p.crate}
      grade={p.grade}
      mob={p.result.mob}
      lucky={p.result.lucky}
      title={p.title}
      act={s.act}
      startRevealed={!!p.applied}
      pool={s.queue[1]?.type === 'starter' ? s.queue[1].crates[s.queue[1].idx].pool : undefined}
      onReveal={() => {
        discover(p.result.mob);
        const fresh = !p.applied;
        let info: RevealInfo | null = null;
        act((r) => {
          const out = applyOpen(r);
          info = outcomeInfo(out, p.result.mob);
          if (fresh && out.kind === 'merge' && out.starUp) setTimeout(() => sfx('star_up'), 500);
        });
        return info;
      }}
      onContinue={() => act((r) => finishOpen(r))}
      onBack={p.from && !p.applied ? () => (sfx('page'), act((r) => backToCrates(r))) : undefined}
    />
  );
}

export function StarterView({ s, p }: { s: RunState; p: P<'starter'>; v?: number }) {
  const go = () => act((r) => r.queue.unshift(rollStarter(r)));
  return (
    <div class="screen starter-screen">
      <div class="starter-inner">
        <div class="starter-title title-shadow">组建初始阵容</div>
        <div class="subtle" style={{ fontSize: 18 }}>
          连开三个新手补给箱，组成你的第一支怪物小队。之后每场胜利都能开出新的生物。
        </div>
        <div class="starter-steps">
          {p.crates.map((c, i) => {
            const card = s.team[i];
            return (
              <div key={i} class={`starter-step ${i === p.idx ? 'cur' : ''} ${i < p.idx ? 'done' : ''}`}>
                <div class="ss-label">
                  第 {i + 1} 箱 · {c.label}
                </div>
                {card ? (
                  <MobCard mob={card.mob} card={card} />
                ) : (
                  <div class="ss-crate">
                    <img src={url.crate('origin')} class={i === p.idx ? 'float' : ''} />
                  </div>
                )}
                <div class="ss-pool">
                  {c.pool.filter((m) => MOB_MAP[m]).slice(0, 8).map((m) => (
                    <img key={m} src={url.mob(m)} title={mobDef(m).name} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <Btn variant="gold" size="big" onClick={go}>
          打开第 {p.idx + 1} 个补给箱
        </Btn>
        <Hint id="starter" pos="bottom">
          <b>欢迎来到方块尖塔！</b>每张卡牌是一支怪物小队，战斗全自动进行。
          <br />
          先连开三个新手箱组成初始阵容；之后每赢一场都能挑一个补给箱继续开。
        </Hint>
      </div>
    </div>
  );
}

export function CrateChoice({ s, p }: { s: RunState; p: P<'crates'>; v?: number }) {
  const ctx = openContext(s);
  const fams = new Set(s.team.flatMap((c) => mobDef(c.mob).families));
  const owned = new Set(allCards(s).map((c) => c.mob));
  return (
    <div class="screen choice-screen">
      <div class="choice-head">
        <div class="choice-title title-shadow">{p.title}</div>
        <div class="subtle">
          已拥有的生物再次开出会自动合成升星（★1→★2 需 1 张，★2→★3 需 2 张）。
          {ctx.pity > 8 && <span class="gold-t"> 保底机制生效中：红/金几率提升！</span>}
        </div>
      </div>
      <div class="crate-offers">
        {p.offers.map((o, i) => {
          const def = CRATE_MAP[o.crate];
          const odds = effectiveOdds(def, o.grade, ctx);
          const themed = def.theme.some((t) => fams.has(t));
          return (
            <div key={i} class="crate-offer" style={{ '--cc': def.color } as never} onClick={() => (sfx('door'), act((r) => chooseCrate(r, i)))}>
              <div class="co-grade" style={{ color: GRADE_INFO[o.grade].color }}>
                {GRADE_INFO[o.grade].name}
              </div>
              <img class="co-art" src={url.crate(o.crate)} />
              <div class="co-name">{def.name}</div>
              <div class="co-desc">{def.desc}</div>
              <div class="row gap4 center wrap" style={{ minHeight: 24 }}>
                {def.theme.map((t) => (
                  <FamBadge key={t} f={t} />
                ))}
                {themed && <span class="tag gold-t">契合阵容</span>}
              </div>
              <div class="co-odds">
                {RARITIES.map((r, k) =>
                  odds[k] > 0.0001 ? (
                    <div key={r} class={`co-odd r-${r}`}>
                      <div class="bar" style={{ width: `${Math.max(2, odds[k] * 100)}%` }} />
                      <span>
                        {RARITY_INFO[r].short} {(odds[k] * 100).toFixed(odds[k] < 0.1 ? 1 : 0)}%
                      </span>
                    </div>
                  ) : null,
                )}
              </div>
              <div class="co-pool">
                {RARITIES.flatMap((r) =>
                  def.pool[r].map((m) => (
                    <Tip key={m} content={() => <MobTipContent mob={m} />} class={`co-mob r-${r} ${owned.has(m) ? 'owned' : ''}`}>
                      <img src={url.mob(m)} />
                    </Tip>
                  )),
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Hint id="crates" pos="top">
        <b>选择补给箱</b>：每个箱子的生物池不同，下方条形图是各品质的出货概率。
        <br />
        标着「契合阵容」的箱子更容易开出与你羁绊相同的生物；已拥有的生物（金框）再开出会自动升星。
      </Hint>
      <div class="choice-foot flow">
        <Btn onClick={() => act((r) => skipCrates(r))}>
          放弃战利品 <span class="price">+{p.skip} <Emerald size={18} /></span>
        </Btn>
      </div>
    </div>
  );
}

export function CardDecide({ s, p }: { s: RunState; p: P<'card_decide'>; v?: number }) {
  const m = mobDef(p.mob);
  return (
    <div class="screen choice-screen">
      <div class="choice-head">
        <div class="choice-title title-shadow">队伍与背包都满了</div>
        <div class="subtle">选择一张卡牌分解（获得绿宝石）为 {m.name} 腾出位置，或直接分解新卡牌。</div>
      </div>
      <div class="decide-body">
        <div class="decide-new">
          <div class="gold-t" style={{ marginBottom: 8 }}>新获得</div>
          <MobCard mob={p.mob} size="lg" />
          <Btn variant="red" onClick={() => act((r) => decideCard(r, null))}>
            分解新卡 <span class="price">+{Math.round(p.dust)} <Emerald size={18} /></span>
          </Btn>
        </div>
        <div class="decide-old">
          <div class="subtle">出战队伍</div>
          <div class="row gap12 wrap">
            {s.team.map((c) => (
              <div key={c.uid} class="col gap8 center" style={{ alignItems: 'center' }}>
                <MobCard mob={c.mob} card={c} size="sm" />
                <Btn size="tiny" onClick={() => act((r) => decideCard(r, c.uid))}>
                  替换 +{Math.round(dustValue(c.mob, c.star))}
                </Btn>
              </div>
            ))}
          </div>
          <div class="subtle" style={{ marginTop: 12 }}>背包</div>
          <div class="row gap12 wrap">
            {s.bench.map((c) => (
              <div key={c.uid} class="col gap8" style={{ alignItems: 'center' }}>
                <MobCard mob={c.mob} card={c} size="sm" />
                <Btn size="tiny" onClick={() => act((r) => decideCard(r, c.uid))}>
                  替换 +{Math.round(dustValue(c.mob, c.star))}
                </Btn>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

