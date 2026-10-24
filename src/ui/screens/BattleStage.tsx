import { useEffect, useState } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { battleConfig, battleTerrain, encounterThreat, golemCost, resolveBattle, setBuilds, setDeploy } from '../../run/run.ts';
import { mobDef, unitCount, RARITY_INFO } from '../../data/mobs.ts';
import { estimateCombatPower, evaluateMatchup, sideSynergies } from '../../battle/setup.ts';
import { FAMILIES } from '../../data/families.ts';
import type { Family } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, FamBadge, HeartIcon, MobTipContent, PotionTipContent, Tip, itemIcon } from '../components/common.tsx';
import { Arena3DView } from './Arena3DView.tsx';
import { act } from './RunView.tsx';
import { overlay } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { RichText } from '../components/rich.tsx';
import { Hint } from '../components/hints.tsx';
import { ComboList } from './TeamPanel.tsx';
import { AFFIX_MAP, ENCHANT_MAP, enchantName } from '../../data/items.ts';
import { BATTLE_MODIFIER_MAP } from '../../data/battleModifiers.ts';
import { COMMANDER_MAP } from '../../data/commanders.ts';
import { difficultyPolicy } from '../../data/difficulty.ts';
import { ENEMY_TACTIC_MAP, type EnemyTacticId } from '../../data/enemyTactics.ts';

type BattleP = Extract<Pending, { type: 'battle' }>;
const KIND_NAME = { battle: '战斗', elite: '精英战斗', boss: '首领战', event: '事件战斗' };

function BattleTacticsOverlay({ tactics, modifierId, attempt }: { tactics?: string[]; modifierId?: string; attempt: number }) {
  const tacticDefs = (tactics ?? []).map((id) => ENEMY_TACTIC_MAP[id as EnemyTacticId]).filter(Boolean);
  const mod = modifierId ? BATTLE_MODIFIER_MAP[modifierId] : undefined;
  if (!tacticDefs.length && !mod) return null;

  const [dismissed, setDismissed] = useState(false);
  const [fading, setFading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const displayTime = attempt > 1 ? 1200 : 2500;
    const fadeTimer = setTimeout(() => {
      setFading(true);
    }, displayTime);
    const removeTimer = setTimeout(() => {
      setDismissed(true);
    }, displayTime + 300);

    const onKey = (e: KeyboardEvent) => {
      if (['Space', 'Enter', 'Escape'].includes(e.code)) {
        setDismissed(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [attempt]);

  return (
    <>
      {(!dismissed || expanded) && (
        <div
          class={`bm-intro ${fading && !expanded ? 'fade-out' : ''}`}
          onClick={() => {
            setDismissed(true);
            setExpanded(false);
          }}
          role="button"
          tabIndex={0}
        >
          <div class="bm-intro-box" onClick={(e) => e.stopPropagation()}>
            {tacticDefs.map((t) => (
              <div key={t.id} style={{ marginBottom: 12 }}>
                <div class="bm-intro-k" style={{ color: t.color }}>⚔ 敌军战术</div>
                <div class="bm-intro-name" style={{ color: t.color }}>{t.name}</div>
                <div class="bm-intro-desc">{t.desc}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: '#ffd166' }}>💡 建议应对：{t.tips}</div>
              </div>
            ))}
            {mod && (
              <div style={{ marginTop: tacticDefs.length ? 12 : 0, borderTop: tacticDefs.length ? '1px solid rgba(255,255,255,0.1)' : 'none', paddingTop: tacticDefs.length ? 8 : 0 }}>
                <div class="bm-intro-k">⚔ 战场规则</div>
                <div class="bm-intro-name" style={{ color: mod.color }}>{mod.name}</div>
                <div class="bm-intro-desc">{mod.desc}</div>
                <div class="bm-intro-reward gold-t">胜利绿宝石 +{Math.round((mod.rewardMul - 1) * 100)}%</div>
              </div>
            )}
            <div class="bm-intro-dismiss faint" style={{ cursor: 'pointer', marginTop: 10 }} onClick={() => { setDismissed(true); setExpanded(false); }}>
              点击关闭或按键继续
            </div>
          </div>
        </div>
      )}
      <div class="bm-persistent-badge" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {tacticDefs.map((t) => (
          <Tip
            key={t.id}
            content={() => (
              <div>
                <div class="tt-title" style={{ color: t.color }}>⚔ 敌军战术「{t.name}」</div>
                <div class="tt-line">{t.desc}</div>
                <div class="tt-line tt-yellow">应对建议：{t.tips}</div>
                <div class="tt-sec tt-gray">点击卡片可重新展开大标题详情。</div>
              </div>
            )}
          >
            <div class="bm-pill" tabIndex={0} onClick={() => setExpanded(true)} style={{ cursor: 'pointer' }}>
              <span class="bm-pill-icon">⚔</span>
              <span class="bm-pill-title" style={{ color: t.color }}>战术：{t.name}</span>
              <span class="bm-pill-desc">· {t.summary}</span>
            </div>
          </Tip>
        ))}
        {mod && (
          <Tip
            content={() => (
              <div>
                <div class="tt-title" style={{ color: mod.color }}>⚔ 战场规则「{mod.name}」</div>
                <div class="tt-line">{mod.desc}</div>
                <div class="tt-line tt-yellow">本场胜利额外奖励绿宝石 +{Math.round((mod.rewardMul - 1) * 100)}%</div>
                <div class="tt-sec tt-gray">此规则对双方对称生效。</div>
              </div>
            )}
          >
            <div class="bm-pill" tabIndex={0} onClick={() => setExpanded(true)} style={{ cursor: 'pointer' }}>
              <span class="bm-pill-icon">⚔</span>
              <span class="bm-pill-title" style={{ color: mod.color }}>{mod.name}</span>
              <span class="bm-pill-desc">· {mod.desc.replace(/（[^）]+）/g, '')}</span>
            </div>
          </Tip>
        )}
      </div>
    </>
  );
}

export function BattleStage({ s, p }: { s: RunState; p: BattleP; v?: number }) {
  const [phase, setPhase] = useState<'deploy' | 'fight'>('deploy');
  const terrain = battleTerrain(p);
  const config = battleConfig(s, p);
  const key = JSON.stringify([p.deploy, p.build, s.team.map((c) => [c.uid, c.mob, c.star, c.enchant, c.bonus]), s.relics.length]);
  // The hotbar keeps the inventory as it was when the fight started.
  const [items] = useState(() => s.potions.slice());
  const floor = s.nodeId ? s.map.nodes[s.nodeId].row + 1 : 0;
  return (
    <Arena3DView
      key={`${p.seed}-${p.attempt}`}
      terrain={terrain}
      config={config}
      configKey={key}
      phase={phase}
      title={p.name}
      subtitle={`${KIND_NAME[p.kind]} · 第 ${floor} 层${p.attempt > 1 ? ` · 第 ${p.attempt} 次挑战` : ''}`}
      boss={p.kind === 'boss'}
      onDeployMove={(uid, pos) => act((r) => setDeploy(r, uid, pos))}
      onFinish={(r) => act((st) => resolveBattle(st, r))}
      items={items}
      temp={p.brew}
      golemCost={golemCost(s)}
      canPay={s.emeralds >= golemCost(s)}
      builds={p.build ?? []}
      onBuild={s.commander === 'steve' ? (list) => act((r) => setBuilds(r, list)) : undefined}
      extraOverlay={<BattleTacticsOverlay tactics={p.tactics} modifierId={p.modifier} attempt={p.attempt} />}
    >
      <DeployHud s={s} p={p} config={config} terrainName={terrain.name} effects={terrain.effects} onFight={() => (sfx('fight'), setPhase('fight'))} />
    </Arena3DView>
  );
}

function DeployHud({
  s, p, config, terrainName, effects, onFight,
}: {
  s: RunState;
  p: BattleP;
  config: ReturnType<typeof battleConfig>;
  terrainName: string;
  effects: string[];
  onFight: () => void;
}) {
  const mySyn = sideSynergies(s.team, s.relics);
  const foeSyn = sideSynergies(p.cards.map(([mob]) => ({ mob })), []);
  const stake = p.kind === 'battle' || p.kind === 'event' ? 1 : 2;
  const bossCard = p.cards.find(([m]) => mobDef(m).boss);
  const mineEst = estimateCombatPower(config.sides[0]);
  const theirsEst = estimateCombatPower(config.sides[1], { bossHp: p.bossHp });
  const mine = mineEst.power;
  const theirs = theirsEst.power;
  const hasHighVariance = mineEst.variance === 'high' || theirsEst.variance === 'high';
  const varianceReason = [mineEst.varianceReason, theirsEst.varianceReason].filter(Boolean).join('、');
  const evaluation = evaluateMatchup(mine, theirs, hasHighVariance ? 'high' : 'normal', varianceReason);
  const formationThreat = encounterThreat({ cards: p.cards });
  const modifier = p.modifier ? BATTLE_MODIFIER_MAP[p.modifier] : undefined;

  const tacticalItems: string[] = [];
  if (s.commander) {
    const cmd = COMMANDER_MAP[s.commander];
    const charges = config.sides[0].skill?.charges;
    if (cmd && charges !== undefined && charges > 0) {
      tacticalItems.push(`技能「${cmd.skill.name}」×${charges}`);
    }
  }
  const totalPotions = s.potions.length + (p.brew?.length ?? 0);
  if (totalPotions > 0) {
    tacticalItems.push(`药水 ×${totalPotions}`);
  }
  if (p.build?.length) {
    tacticalItems.push(`工事 ×${p.build.length}`);
  }
  const tacticalSummary = tacticalItems.length > 0 ? tacticalItems.join('、') : '无可用资源';
  return (
    <div class="deploy-hud">
      <div class="dh-top">
        <div class={`prep-kind k-${p.kind}`}>{KIND_NAME[p.kind]}</div>
        <div class="dh-title title-shadow">{p.name}</div>
        {p.desc && <div class="subtle">{p.desc}</div>}
        <div class="omen-note">
          敌方强度：{p.kind !== 'boss' && <>编队 {Math.round(formationThreat)} · </>}生命 ×{p.hpMul.toFixed(2)} · 攻击 ×{p.atkMul.toFixed(2)}
        </div>
        {modifier && (
          <div class="omen-note" style={{ color: modifier.color }}>
            ⚔ 战场规则「{modifier.name}」：{modifier.desc} 胜利绿宝石 +{Math.round((modifier.rewardMul - 1) * 100)}%。
          </div>
        )}
        {p.bossHp !== undefined && <div class="gold-t">首领带伤再战：剩余 {Math.round(p.bossHp * 100)}% 生命</div>}
        {p.affix && (
          <div class="omen-note" style={{ color: AFFIX_MAP[p.affix].color }}>
            ☠ 精英词缀「{AFFIX_MAP[p.affix].name}」：{AFFIX_MAP[p.affix].desc}
          </div>
        )}
        {p.kind === 'boss' && difficultyPolicy(s.omen).bossPhase && (
          <div class="omen-note">☠ 不祥之兆 V：首领生命低于一半时狂暴（攻速 +30%、受到伤害 -15%，召唤升级护卫）。</div>
        )}
        <div class="dh-terrain">
          <span class="dh-tname">战场 · {terrainName}</span>
          {effects.map((e) => (
            <span key={e} class="dh-tfx">
              <RichText text={e} />
            </span>
          ))}
        </div>
      </div>

      <div class="dh-panel left">
        <div class="dh-ptitle blue-t">我方阵容</div>
        {s.team.map((c) => {
          const m = mobDef(c.mob);
          return (
            <Tip key={c.uid} content={() => <MobTipContent mob={c.mob} star={c.star} enchant={c.enchant} enchantLv={c.enchantLv} bonus={c.bonus} />}>
              <div class={`dh-row r-${m.rarity}`}>
                <img src={url.mob(c.mob)} />
                <div class="dh-rinfo">
                  <div class="dh-rname rc">
                    {m.name} <span class="stars">{'★'.repeat(c.star)}</span>
                  </div>
                  <div class="dh-rsub">
                    ×{unitCount(m, c.star)} · {RARITY_INFO[m.rarity].short}
                    {c.enchant ? ' · ✦附魔' : ''}
                  </div>
                </div>
              </div>
            </Tip>
          );
        })}
        <SynRow syn={mySyn} />
        <ComboList mobs={s.team.map((c) => c.mob)} compact />
        <div class="row gap8" style={{ marginTop: 6 }}>
          <Btn
            size="tiny"
            onClick={() =>
              act((r) => {
                const q = r.queue[0];
                if (q?.type === 'battle') q.deploy = {};
              })
            }
          >
            推荐布阵
          </Btn>
          <Btn size="tiny" onClick={() => (sfx('page'), (overlay.value = 'team'))}>
            调整队伍
          </Btn>
        </div>
      </div>

      <div class="dh-panel right">
        <div class="dh-ptitle red-t">敌方阵容</div>
        {p.cards
          .filter(([m]) => !mobDef(m).structure)
          .map(([mob, star, , count, enchant, enchantLv], i) => {
            const m = mobDef(mob);
            return (
              <Tip key={i} content={() => <MobTipContent mob={mob} star={star} enchant={enchant} enchantLv={enchantLv} />}>
                <div class={`dh-row r-${m.rarity}`}>
                  <img src={url.mob(mob)} />
                  <div class="dh-rinfo">
                    <div class="dh-rname rc">
                      {m.name} <span class="stars">{'★'.repeat(star)}</span>
                    </div>
                    <div class="dh-rsub">
                      ×{count ?? unitCount(m, star)} · {m.boss ? '首领' : RARITY_INFO[m.rarity].short}
                      {enchant && <span style={{ color: ENCHANT_MAP[enchant]?.color }}> · ✦{enchantName(enchant, enchantLv)}</span>}
                    </div>
                  </div>
                </div>
              </Tip>
            );
          })}
        {bossCard && (
          <div class="boss-skill">
            <div class="gold-t">【{mobDef(bossCard[0]).skill.name}】</div>
            <div class="subtle" style={{ fontSize: 13 }}>
              <RichText text={mobDef(bossCard[0]).skill.desc} />
            </div>
          </div>
        )}
        <SynRow syn={foeSyn} />
      </div>

      <div class="dh-bottom">
        <div class="potion-bar">
          <span class="subtle">物品</span>
          {s.potions.length === 0 && <span class="faint">没有物品</span>}
          {s.potions.map((pt, i) => (
            <Tip key={i} content={() => <PotionTipContent id={pt} />}>
              <div class="slot dark">
                <img src={itemIcon(pt)} />
              </div>
            </Tip>
          ))}
          {(p.brew ?? []).map((pt, i) => (
            <Tip key={`b${i}`} content={() => <PotionTipContent id={pt} />}>
              <div class="slot dark brew">
                <img src={itemIcon(pt)} />
              </div>
            </Tip>
          ))}
          {p.brew?.length ? <span class="faint" style={{ fontSize: 13 }}>紫框：坩埚熬的限定药水</span> : null}
          {s.potions.length > 0 && <span class="faint" style={{ fontSize: 13 }}>开战后在下方物品栏使用</span>}
        </div>
        <div class="dh-hint">
          拖动我方生物到 <b class="blue-t">蓝色区域</b> 布阵
        </div>
        <Tip
          content={() => (
            <div>
              <div class="tt-title">预估战况结构拆解</div>
              <div class="tt-line">
                ① 基础兵力：我方 <b class="blue-t">{Math.round(mine)}</b> vs 敌方 <b class="red-t">{Math.round(theirs)}</b>
              </div>
              <div class="tt-line">
                ② 羁绊联动：我方 {Object.keys(mySyn.active).length} 项激活 vs 敌方 {Object.keys(foeSyn.active).length} 项激活
              </div>
              <div class="tt-line">
                ③ 敌军战术：{p.tactics?.length ? p.tactics.map((id) => ENEMY_TACTIC_MAP[id as EnemyTacticId]?.name).filter(Boolean).join('、') : '无额外战术'}
              </div>
              <div class="tt-line">
                ④ 场地规则：{modifier ? `${modifier.name}（${modifier.desc}）` : '标准平原场地'}
              </div>
              <div class="tt-line tt-yellow">⑤ 储备资源（未计入）：{tacticalSummary}</div>
              <div class="tt-line" style={{ marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
                综合研判：<b style={{ color: evaluation.color }}>{evaluation.verdict}</b>
              </div>
              {evaluation.variance === 'high' && (
                <div class="tt-sec tt-red">估算波动：较高（{evaluation.varianceReason || '召唤/复活阵容'}）</div>
              )}
              <div class="tt-sec tt-gray">基于有效生命、持续输出与机制加成估算；克制关系、布阵与战术资源往往能逆转局势。</div>
            </div>
          )}
        >
          <div class="power">
            <div class="power-bar">
              <div class="pb-me" style={{ width: `${(mine / (mine + theirs)) * 100}%` }} />
            </div>
            <div class="power-text">
              我方 <span class="blue-t">{Math.round(mine)}</span> vs 敌方 <span class="red-t">{Math.round(theirs)}</span> ·{' '}
              <b style={{ color: evaluation.color }}>预估：{evaluation.verdict}</b>
            </div>
            {evaluation.variance === 'high' && (
              <div class="power-variance" style={{ color: '#ffa64d', fontSize: '11px', textAlign: 'center', marginTop: '2px' }}>
                估算波动：较高（{evaluation.varianceReason}）
              </div>
            )}
          </div>
        </Tip>
        <div class="stake">
          失败将失去 {stake} <HeartIcon size={18} />
        </div>
        <Btn variant="green" size="big" onClick={onFight} disabled={!s.team.length}>
          ⚔ 开战！
        </Btn>
      </div>
      <Hint id="deploy">
        <b>布阵阶段</b>：每张卡牌是一支小队。按住我方生物拖到蓝色区域即可调整站位。
        <br />
        远程放在高处可以「居高临下」，坦克放在前面挡住敌人。鼠标移到地面上可以查看地形效果。
      </Hint>
    </div>
  );
}

export function SynRow({ syn }: { syn: ReturnType<typeof sideSynergies> }) {
  const entries = Object.entries(syn.counts).filter(([f]) => syn.active[f as Family] >= 0);
  if (!entries.length) return <div class="faint" style={{ fontSize: 12 }}>无激活羁绊</div>;
  return (
    <div class="row gap4 wrap" style={{ marginTop: 4 }}>
      {entries.map(([f, n]) => (
        <Tip
          key={f}
          content={() => (
            <div>
              <div class="tt-title" style={{ color: FAMILIES[f as Family].color }}>
                {FAMILIES[f as Family].name} ({n})
              </div>
              {FAMILIES[f as Family].tiers.map((t, i) => (
                <div key={i} class={syn.active[f as Family] >= i ? 'tt-yellow' : 'tt-gray'}>
                  ({t.n}) <RichText text={t.desc} />
                </div>
              ))}
            </div>
          )}
        >
          <FamBadge f={f as Family} count={n} />
        </Tip>
      ))}
    </div>
  );
}
