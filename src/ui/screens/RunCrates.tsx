import { useState } from 'preact/hooks';
import type { Pending, RunState, GainOutcome } from '../../run/run.ts';
import {
  allCards, applyOpen, backToCrates, chooseCrate, decideCard, dustValue, finishOpen, openContext, rollStarter, shardsNeeded, skipCrates,
  chooseStarterStrategy, pickStarterMob, undoStarterPick, resetStarterStrategy,
} from '../../run/run.ts';
import { CRATE_MAP, GRADE_INFO, effectiveOdds } from '../../data/crates.ts';
import { MOB_MAP, PLAYABLE_BLUE_MOBS, PLAYABLE_PURPLE_MOBS, RARITY_INFO, mobDef } from '../../data/mobs.ts';
import { FAMILIES } from '../../data/families.ts';
import { RARITIES } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, Emerald, FamBadge, MobCard, MobTipContent, Tip } from '../components/common.tsx';
import { CrateOpen, type RevealInfo } from './CrateOpen.tsx';
import { act } from './RunView.tsx';
import { discover, profile } from '../store.ts';
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
      pool={s.queue[1]?.type === 'starter' ? s.queue[1].crates[s.queue[1].idx]?.pool : undefined}
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

export function StarterStrategyView({ s, p }: { s: RunState; p: P<'starter_strategy'>; v?: number }) {
  const discovered = profile.value.discovered;
  const isOmen5 = s.omen >= 5;
  return (
    <div class="screen choice-screen starter-strat-screen">
      <div class="choice-head" style={{ marginTop: 32, gap: 6 }}>
        <div class="choice-title title-shadow gold-t">
          {isOmen5 ? '不祥之兆 V · 终局初始战备' : '不祥之兆 IV · 初始阵容规划'}
        </div>
        <div class="subtle" style={{ fontSize: 18, maxWidth: 880 }}>
          {isOmen5
            ? '在不祥之兆 V 的终极挑战中，你可以选择全自选单核、全自选羁绊或全随机阵容：'
            : '在不祥之兆 IV 的严峻挑战中，你可以选择自选 3 蓝羁绊开局，或全随机 3 蓝开局：'}
        </div>
      </div>
      <div class="starter-strat-cards">
        {isOmen5 && (
          <div class="starter-strat-card strat-purple" onClick={() => (sfx('levelup'), act((r) => chooseStarterStrategy(r, 'purple_blue_random', discovered)))}>
            <div class="strat-badge badge-purple">推荐 · 核心突围</div>
            <div class="strat-title">单核突围</div>
            <div class="strat-subtitle">自选一紫 + 自选一蓝 + 随机一蓝</div>
            <div class="strat-desc">
              自选 1 名已解锁史诗核心与 1 名稀有搭档，第 3 张开启全图鉴随机稀有箱。兼具单核强度与应变上限。
            </div>
            <div class="strat-preview">
              <span class="strat-chip r-purple">★ 自选紫卡</span>
              <span class="strat-chip r-blue">★ 自选蓝卡</span>
              <span class="strat-chip r-random">? 随机蓝箱</span>
            </div>
            <Btn variant="gold" wide onClick={() => (sfx('levelup'), act((r) => chooseStarterStrategy(r, 'purple_blue_random', discovered)))}>
              选择此策略
            </Btn>
          </div>
        )}

        <div class="starter-strat-card strat-blue" onClick={() => (sfx('levelup'), act((r) => chooseStarterStrategy(r, 'three_blues', discovered)))}>
          <div class="strat-badge badge-blue">稳定 · 羁绊启动</div>
          <div class="strat-title">阵营协奏</div>
          <div class="strat-subtitle">自选三张蓝卡</div>
          <div class="strat-desc">
            自由挑选 3 名已解锁稀有卡牌。可开局直接激活 3 亡灵、3 野兽、3 节肢或 3 构造体等成型种族羁绊，下限扎实。
          </div>
          <div class="strat-preview">
            <span class="strat-chip r-blue">★ 自选蓝卡</span>
            <span class="strat-chip r-blue">★ 自选蓝卡</span>
            <span class="strat-chip r-blue">★ 自选蓝卡</span>
          </div>
          <Btn variant="gold" wide onClick={() => (sfx('levelup'), act((r) => chooseStarterStrategy(r, 'three_blues', discovered)))}>
            选择此策略
          </Btn>
        </div>

        <div class="starter-strat-card strat-random" onClick={() => (sfx('crate_open'), act((r) => chooseStarterStrategy(r, 'all_random', discovered)))}>
          <div class="strat-badge badge-gray">挑战 · 纯看运气</div>
          <div class="strat-title">全凭天意</div>
          <div class="strat-subtitle">三个箱子全随机蓝卡</div>
          <div class="strat-desc">
            全图鉴稀有卡池纯随机开启 3 个补给箱。纯粹看脸与临场应变，经典的随机开局挑战！
          </div>
          <div class="strat-preview">
            <span class="strat-chip r-random">? 随机蓝箱</span>
            <span class="strat-chip r-random">? 随机蓝箱</span>
            <span class="strat-chip r-random">? 随机蓝箱</span>
          </div>
          <Btn variant="" wide onClick={() => (sfx('crate_open'), act((r) => chooseStarterStrategy(r, 'all_random', discovered)))}>
            选择此策略
          </Btn>
        </div>
      </div>
    </div>
  );
}

export function StarterPickView({ s, p }: { s: RunState; p: P<'starter_pick'>; v?: number }) {
  const [famFilter, setFamFilter] = useState<string>('all');
  const isPurple = p.strategy === 'purple_blue_random' && p.step === 1;
  const poolIds = isPurple ? PLAYABLE_PURPLE_MOBS : PLAYABLE_BLUE_MOBS;
  const discSet = new Set(s.discovered ?? profile.value.discovered ?? []);
  const owned = new Set(allCards(s).map((c) => c.mob));

  const filteredMobs = poolIds
    .map((id) => mobDef(id))
    .filter((m) => {
      if (famFilter === 'all') return true;
      return discSet.has(m.id) && m.families.includes(famFilter as any);
    });

  const totalUnlocked = poolIds.filter((id) => discSet.has(id)).length;

  const title = isPurple
    ? '战备选拔 · 挑选史诗核心（紫卡）'
    : p.strategy === 'purple_blue_random'
    ? '战备选拔 · 挑选稀有搭档（蓝卡）'
    : `阵营组建 · 挑选第 ${p.step} 名稀有卡（蓝卡 ${p.step}/3）`;

  const desc = isPurple
    ? `挑选 1 张已解锁史诗生物（已解锁 ${totalUnlocked}/${poolIds.length}），未解锁卡牌以剪影显示。`
    : p.strategy === 'purple_blue_random'
    ? `挑选 1 张已解锁稀有生物（已解锁 ${totalUnlocked}/${poolIds.length}），第 3 位将随机抽取。`
    : `挑选 1 张已解锁稀有生物（已解锁 ${totalUnlocked}/${poolIds.length}），建议凑齐种族羁绊。`;

  return (
    <div class="screen choice-screen starter-pick-screen">
      <div class="choice-head" style={{ marginTop: 32, gap: 4 }}>
        <div class="choice-title title-shadow gold-t">{title}</div>
        <div class="subtle" style={{ fontSize: 16 }}>{desc}</div>

        <div class="starter-slots-bar">
          <div class="ss-slot-label">当前已选阵容（{s.team.length}/3）：</div>
          <div class="row gap12 center">
            {[0, 1, 2].map((slotIdx) => {
              const card = s.team[slotIdx];
              const isCur = slotIdx === s.team.length;
              const isLockedRandom = p.strategy === 'purple_blue_random' && slotIdx === 2;
              return (
                <div key={slotIdx} class={`ss-slot-box ${isCur ? 'cur' : ''} ${card ? 'filled' : ''}`}>
                  {card ? (
                    <div class="ss-slot-card">
                      <MobCard mob={card.mob} card={card} size="sm" />
                    </div>
                  ) : isLockedRandom ? (
                    <div class="ss-slot-placeholder">
                      <img src={url.crate('ominous')} style={{ width: 44, height: 44, opacity: 0.8 }} />
                      <span>第 3 箱随机</span>
                    </div>
                  ) : (
                    <div class="ss-slot-placeholder">
                      <span>{slotIdx === 0 && p.strategy === 'purple_blue_random' ? '待选紫卡' : '待选蓝卡'}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div class="row gap8 center" style={{ marginTop: 6 }}>
            {p.picked.length > 0 && (
              <Btn size="tiny" onClick={() => (sfx('page'), act((r) => undoStarterPick(r)))}>
                ↩ 撤销上一步
              </Btn>
            )}
            <Btn size="tiny" onClick={() => (sfx('page'), act((r) => resetStarterStrategy(r)))}>
              ⟲ 重选方案
            </Btn>
          </div>
        </div>

        <div class="row gap6 wrap center" style={{ marginTop: 8 }}>
          <button
            class={`fam-pill ${famFilter === 'all' ? 'active' : ''}`}
            onClick={() => setFamFilter('all')}
          >
            全部 ({totalUnlocked}/{poolIds.length})
          </button>
          {Object.values(FAMILIES).map((f) => {
            const famList = poolIds.filter((id) => mobDef(id).families.includes(f.id));
            if (famList.length === 0) return null;
            const famUnlocked = famList.filter((id) => discSet.has(id)).length;
            if (famUnlocked === 0) return null;
            return (
              <button
                key={f.id}
                class={`fam-pill ${famFilter === f.id ? 'active' : ''}`}
                style={{ '--fc': f.color } as never}
                onClick={() => setFamFilter(f.id)}
              >
                <FamBadge f={f.id} /> ({famUnlocked})
              </button>
            );
          })}
        </div>
      </div>

      <div class="starter-pick-grid">
        {filteredMobs.map((m) => {
          const isUnlocked = discSet.has(m.id);
          const isOwned = owned.has(m.id);
          const canPick = isUnlocked && !isOwned;
          return (
            <div
              key={m.id}
              class={`pick-mob-wrap ${!isUnlocked ? 'locked' : ''} ${isOwned ? 'owned' : ''}`}
              title={!isUnlocked ? '？？？（图鉴未解锁）' : isOwned ? '已在队伍中' : `点击自选：${m.name}`}
            >
              <MobCard
                mob={m.id}
                size="sm"
                locked={!isUnlocked}
                dim={isOwned}
                onClick={
                  canPick
                    ? () => {
                        discover(m.id);
                        sfx('card_flip');
                        act((r) => pickStarterMob(r, m.id));
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StarterView({ s, p }: { s: RunState; p: P<'starter'>; v?: number }) {
  const go = () => act((r) => r.queue.unshift(rollStarter(r)));
  const isOmen = s.omen >= 3;
  return (
    <div class="screen starter-screen">
      <div class="starter-inner">
        <div class="starter-title title-shadow">{isOmen ? '不祥战备 · 开启补给箱' : '组建初始阵容'}</div>
        <div class="subtle" style={{ fontSize: 18 }}>
          {isOmen
            ? '全图鉴稀有卡池随机抽取，组建你的高难初始小队。'
            : '连开三个新手补给箱，组成你的第一支怪物小队。之后每场胜利都能开出新的生物。'}
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
                    <img src={url.crate(c.crate ?? 'origin')} class={i === p.idx ? 'float' : ''} />
                  </div>
                )}
                <div class="ss-pool">
                  {c.pool.filter((m) => MOB_MAP[m]).slice(0, 10).map((m) => (
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
        {!isOmen && (
          <Hint id="starter" pos="bottom">
            <b>欢迎来到方块尖塔！</b>每张卡牌是一支怪物小队，战斗全自动进行。
            <br />
            先连开三个新手箱组成初始阵容；之后每赢一场都能挑一个补给箱继续开。
          </Hint>
        )}
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

