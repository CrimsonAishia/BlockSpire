import { useEffect, useState } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { battleConfig, battleTerrain, encounterThreat, golemCost, resolveBattle, setBuilds, setDeploy, equipTactic, signWager, cancelWager, markBattleStarted, chooseBrew } from '../../run/run.ts';
import { TACTIC_DEFS, TACTIC_VARIANTS, wagerStake, wagerProfit, type TacticId } from '../../data/tactics.ts';
import { mobDef, unitCount, RARITY_INFO } from '../../data/mobs.ts';
import { sideSynergies } from '../../battle/setup.ts';
import { FAMILIES } from '../../data/families.ts';
import type { Family } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, Emerald, FamBadge, HeartIcon, MobTipContent, PotionTipContent, Stars, Tip, itemIcon } from '../components/common.tsx';
import { Arena3DView } from './Arena3DView.tsx';
import { act } from './RunView.tsx';
import { overlay } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { RichText } from '../components/rich.tsx';
import { Hint } from '../components/hints.tsx';
import { ComboList } from './TeamPanel.tsx';
import { AFFIX_MAP, ENCHANT_MAP, ITEM_MAP, enchantName } from '../../data/items.ts';
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
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (expanded || hovered) return;
    const displayTime = attempt > 1 ? 1500 : 3500;
    const fadeTimer = setTimeout(() => {
      if (!hovered) setFading(true);
    }, displayTime);
    const removeTimer = setTimeout(() => {
      if (!hovered) setDismissed(true);
    }, displayTime + 300);

    const onKey = (e: KeyboardEvent) => {
      if (['Space', 'Enter', 'Escape'].includes(e.code)) {
        sfx('click');
        setDismissed(true);
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
      window.removeEventListener('keydown', onKey);
    };
  }, [attempt, hovered, expanded]);

  const close = () => {
    sfx('click');
    setDismissed(true);
    setExpanded(false);
  };

  return (
    <>
      {(!dismissed || expanded) && (
        <div
          class={`bm-intro ${fading && !expanded ? 'fade-out' : ''}`}
          onClick={close}
          role="button"
          tabIndex={0}
        >
          <div
            class="bm-intro-box"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div class="bm-modal-header">
              <img src={url.icon('iron_sword')} class="pixelated" width={22} height={22} />
              <div class="bm-modal-title">战场特殊机制</div>
            </div>
            <div class="divider" />
            <div class="bm-cards-scroll">
              {mod && (
                <div class="bm-card">
                  <div class="bm-card-badge" style={{ color: mod.color }}>
                    <img src={url.icon('iron_sword')} class="pixelated" width={16} height={16} />
                    <span>⚔ 战场规则</span>
                  </div>
                  <div class="bm-card-title" style={{ color: mod.color }}>
                    <span>{mod.name}</span>
                  </div>
                  <div class="bm-card-desc">{mod.desc}</div>
                  <div class="bm-reward-well">
                    <div class="reward-tag">
                      <Emerald size={18} />
                      <span>胜利额外奖励绿宝石 +{Math.round((mod.rewardMul - 1) * 100)}%</span>
                    </div>
                    <span class="symmetric-note">双边对称生效</span>
                  </div>
                </div>
              )}
              {tacticDefs.map((t) => (
                <div key={t.id} class="bm-card">
                  <div class="bm-card-badge" style={{ color: t.color }}>
                    <img src={url.icon('ominous_banner')} class="pixelated" width={16} height={16} />
                    <span>⚔ 敌军战术</span>
                  </div>
                  <div class="bm-card-title" style={{ color: t.color }}>
                    <span>{t.name}</span>
                  </div>
                  <div class="bm-card-desc">{t.desc}</div>
                  <div class="bm-tip-well">
                    <span class="bm-tip-icon">💡</span>
                    <div>
                      <span class="bm-tip-label">应对建议：</span>
                      <span>{t.tips}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div class="bm-modal-foot">
              <Btn variant="green" size="small" onClick={close}>
                准备迎战
              </Btn>
              <div class="bm-kbd-hint faint">
                按 <span class="kbd">空格</span> / <span class="kbd">ESC</span> 继续
              </div>
            </div>
          </div>
        </div>
      )}
      <div class="bm-persistent-badge">
        {mod && (
          <Tip
            content={() => (
              <div>
                <div class="tt-title" style={{ color: mod.color }}>⚔ 战场规则「{mod.name}」</div>
                <div class="tt-line">{mod.desc}</div>
                <div class="tt-line tt-yellow">本场胜利额外奖励绿宝石 +{Math.round((mod.rewardMul - 1) * 100)}%</div>
                <div class="tt-sec tt-gray">此规则对双方对称生效。点击可展开完整规则弹窗。</div>
              </div>
            )}
          >
            <div
              class="bm-pill"
              tabIndex={0}
              onClick={() => {
                sfx('click');
                setExpanded(true);
              }}
            >
              <img src={url.icon('iron_sword')} class="pixelated bm-pill-icon-img" width={16} height={16} />
              <span class="bm-pill-title" style={{ color: mod.color }}>规则：{mod.name}</span>
              <span class="bm-pill-desc">· {mod.desc.replace(/（[^）]+）/g, '')}</span>
              <span class="bm-pill-action">详情 ›</span>
            </div>
          </Tip>
        )}
        {tacticDefs.map((t) => (
          <Tip
            key={t.id}
            content={() => (
              <div>
                <div class="tt-title" style={{ color: t.color }}>⚔ 敌军战术「{t.name}」</div>
                <div class="tt-line">{t.desc}</div>
                <div class="tt-line tt-yellow">应对建议：{t.tips}</div>
                <div class="tt-sec tt-gray">点击可展开完整战术弹窗。</div>
              </div>
            )}
          >
            <div
              class="bm-pill"
              tabIndex={0}
              onClick={() => {
                sfx('click');
                setExpanded(true);
              }}
            >
              <img src={url.icon('ominous_banner')} class="pixelated bm-pill-icon-img" width={16} height={16} />
              <span class="bm-pill-title" style={{ color: t.color }}>战术：{t.name}</span>
              <span class="bm-pill-desc">· {t.summary}</span>
              <span class="bm-pill-action">详情 ›</span>
            </div>
          </Tip>
        ))}
      </div>
    </>
  );
}

export function BattleStage({ s, p }: { s: RunState; p: BattleP; v?: number }) {
  const [phase, setPhase] = useState<'deploy' | 'fight'>('deploy');
  const terrain = battleTerrain(p);
  const config = battleConfig(s, p);
  const key = JSON.stringify([
    p.deploy,
    p.build,
    s.team.map((c) => [c.uid, c.mob, c.star, c.enchant, c.bonus]),
    s.relics.length,
    s.tacticsState?.equipped,
    s.tacticsState?.variants,
    s.tacticsState?.wagers?.active,
  ]);
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
      <DeployHud s={s} p={p} config={config} terrainName={terrain.name} effects={terrain.effects} onFight={() => { act(r => markBattleStarted(r)); sfx('fight'); setPhase('fight'); }} />
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
  const myFront = s.team.filter((c) => ['tank', 'melee'].includes(mobDef(c.mob).role)).length;
  const myBack = s.team.filter((c) => ['ranged', 'support', 'caster'].includes(mobDef(c.mob).role)).length;
  const foeFront = p.cards.filter(([m]) => ['tank', 'melee'].includes(mobDef(m).role)).length;
  const foeBack = p.cards.filter(([m]) => ['ranged', 'support', 'caster'].includes(mobDef(m).role)).length;
  const mySynCount = Object.keys(mySyn.active).length;
  const foeSynCount = Object.keys(foeSyn.active).length;
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
          <Tip
            content={() => (
              <div>
                <div class="tt-title" style={{ color: modifier.color }}>⚔ 战场规则「{modifier.name}」</div>
                <div class="tt-line">{modifier.desc}</div>
                <div class="tt-line tt-yellow">本场胜利额外奖励绿宝石 +{Math.round((modifier.rewardMul - 1) * 100)}%</div>
                <div class="tt-sec tt-gray">此规则对双方对称生效。左上角可点击查看规则详情。</div>
              </div>
            )}
          >
            <div class="omen-note" style={{ color: modifier.color, cursor: 'help' }}>
              ⚔ 战场规则「{modifier.name}」：{modifier.desc} 胜利绿宝石 +{Math.round((modifier.rewardMul - 1) * 100)}%。
            </div>
          </Tip>
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
                  <div class="dh-rname rc" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{m.name}</span> <Stars star={c.star} mastery={c.mastery} size="sm" />
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
                    <div class="dh-rname rc" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{m.name}</span> <Stars star={star} size="sm" />
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

        {/* 副战术装备与切换 */}
        {s.tacticsState && s.tacticsState.tactics.length > 0 && (
          <div class="potion-bar" style={{ marginLeft: 8 }}>
            <span class="subtle">副战术</span>
            {s.tacticsState.tactics.map((tid) => {
              const tdef = TACTIC_DEFS[tid as TacticId];
              const isEquipped = s.tacticsState?.equipped === tid;
              const vId = s.tacticsState?.variants[tid];
              const variant = vId ? TACTIC_VARIANTS[tid as TacticId]?.find((v) => v.id === vId) : null;
              return (
                <Tip
                  key={tid}
                  content={() => (
                    <div>
                      <div class="tt-title" style={{ color: tdef?.category === 'offense' ? '#e17055' : '#00cec9' }}>
                        {tdef?.name}
                        {variant && <span style={{ color: '#ffeaa7', marginLeft: 6 }}>[{variant.name}]</span>}
                      </div>
                      <div class="tt-line">{tdef?.desc}{variant ? `；${variant.desc}` : ''}</div>
                      <div class="tt-sec tt-gold">{p.started || p.attempt > 1 || p.endgamePhase2 ? '本节点战斗装备已锁定' : isEquipped ? '✓ 当前已装备出战' : '点击切换装备此战术'}</div>
                    </div>
                  )}
                >
                  <div
                    class={`slot dark ${isEquipped ? 'active' : ''}`}
                    style={{
                      border: isEquipped ? '2px solid #55efc4' : '1px solid rgba(255,255,255,0.2)',
                      boxShadow: isEquipped ? '0 0 8px #55efc4aa' : undefined,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      sfx('click');
                      act((r) => equipTactic(r, isEquipped ? null : tid));
                    }}
                  >
                    <img src={url.icon(tdef?.icon ?? tid)} />
                  </div>
                </Tip>
              );
            })}
          </div>
        )}

        {/* 村民风险投资合同 */}
        {s.commander === 'villager' && s.tacticsState?.variants?.villager === 'venture' && (
          <div style={{ marginLeft: 8, display: 'flex', alignItems: 'center' }}>
            {s.tacticsState.wagers?.active ? (
              <div class="row gap8 center" style={{ background: 'rgba(255, 215, 0, 0.15)', padding: '4px 10px', borderRadius: 4, border: '1px solid #ffd700' }}>
                <span class="gold-t" style={{ fontSize: 13, fontWeight: 'bold' }}>
                  📜 风投生效中（押金 {s.tacticsState.wagers.active.stake}，18s内获胜净赚 +{s.tacticsState.wagers.active.profit}）
                </span>
                <button
                  class="btn"
                  style={{ padding: '2px 8px', fontSize: 12, background: 'rgba(214, 48, 49, 0.4)', borderColor: '#d63031', color: '#ff7675' }}
                  onClick={() => {
                    sfx('click');
                    act((r) => cancelWager(r));
                  }}
                >
                  取消签署
                </button>
              </div>
            ) : (
              <Tip
                content={() => (
                  <div>
                    <div class="tt-title gold-t">风险投资合同（专长 B）</div>
                    <div class="tt-line">下注 {wagerStake(s.act)} 绿宝石。若在 18 秒内首次尝试获胜，返还本金并净赚 {wagerProfit(s.act)} 绿宝石！</div>
                    <div class="tt-sec tt-red">其他结果（超时、失败、重试）将损失本金。</div>
                    <div class="tt-sec tt-gray">每幕至多签署 2 次（当前已签 {s.tacticsState?.wagers?.act === s.act ? s.tacticsState.wagers.count : 0}/2 次）。</div>
                  </div>
                )}
              >
                <button
                  class="btn"
                  disabled={p.attempt !== 1 || p.endgamePhase2 || p.started || (s.tacticsState?.wagers?.act === s.act ? s.tacticsState.wagers.count : 0) >= 2 || s.emeralds < wagerStake(s.act)}
                  style={{
                    padding: '6px 12px',
                    fontSize: 13,
                    borderColor: '#ffd700',
                    background: 'rgba(255, 215, 0, 0.2)',
                    color: '#ffeaa7',
                  }}
                  onClick={() => {
                    sfx('click');
                    act((r) => signWager(r));
                  }}
                >
                  ✍ 签署风险投资（下注 {wagerStake(s.act)} 💎）
                </button>
              </Tip>
            )}
          </div>
        )}
        {p.brewChoices && <div class="dh-hint" style={{ flexBasis: '100%', textAlign: 'center' }}>定向配方（每份选一瓶，当前选择带 ✓）
          {p.brewChoices.map((choices, slot) => <div class="row gap8" style={{ justifyContent: 'center', flexWrap: 'wrap' }} key={slot}>
            {choices.map(id => <Tip key={id} content={() => <PotionTipContent id={id} />}>
              <button class="btn" style={{ minHeight: 72, padding: '10px 16px', fontSize: 20, color: '#f0d0ff', border: p.brew?.[slot] === id ? '2px solid #e9c5ff' : '1px solid #876199', background: p.brew?.[slot] === id ? '#4c285e' : '#261e2c' }} disabled={p.started} aria-pressed={p.brew?.[slot] === id} onClick={() => act(r => chooseBrew(r, slot, id))}>
                {p.brew?.[slot] === id ? '✓ ' : ''}{ITEM_MAP[id]?.name ?? id}
              </button>
            </Tip>)}
          </div>)}
        </div>}
        {p.endgamePhase2 && <div class="dh-hint">连续作战：军令、冷却、主技能次数和剩余临时药水沿用上一阶段，副战术已锁定。</div>}
        <Tip
          class="dh-intel-wrap"
          content={() => (
            <div>
              <div class="tt-title">⚔ 战备态势推演简报</div>
              <div class="tt-line">
                ① 双方编制：我方 <b>{s.team.length}</b> 队 ({myFront} 前排 / {myBack} 后排) vs 敌方 <b>{p.cards.length}</b> 队 ({foeFront} 前排 / {foeBack} 后排)
              </div>
              <div class="tt-line">
                ② 羁绊联动：我方 <b>{mySynCount}</b> 项激活 vs 敌方 <b>{foeSynCount}</b> 项激活
              </div>
              {p.tactics?.length ? (
                <div class="tt-line tt-yellow">
                  ③ 敌军战术：{p.tactics.map((id) => ENEMY_TACTIC_MAP[id as EnemyTacticId]?.name).filter(Boolean).join('、')}
                </div>
              ) : null}
              {modifier ? (
                <div class="tt-line" style={{ color: modifier.color }}>
                  ④ 战场规则：{modifier.name}（{modifier.desc}）
                </div>
              ) : null}
              {tacticalItems.length > 0 && (
                <div class="tt-line tt-yellow">⑤ 战备储备：{tacticalSummary}</div>
              )}
              <div class="tt-sec tt-gray">战力不代表真实胜负。阵型站位、高地优势、控制链与战术调度才是克敌制胜的关键！</div>
            </div>
          )}
        >
          <div class="dh-intel">
            <div class="intel-summary">
              <div class="intel-item">
                <span class="intel-lbl">参战编制</span>
                <span class="intel-val">
                  我方 <b class="blue-t">{s.team.length}队</b> <span class="faint">({myFront}前/{myBack}后)</span> · 敌方 <b class="red-t">{p.cards.length}队</b> <span class="faint">({foeFront}前/{foeBack}后)</span>
                </span>
              </div>
              <div class="intel-item">
                <span class="intel-lbl">激活羁绊</span>
                <span class="intel-val">
                  我方 <b class="gold-t">{mySynCount}项</b> · 敌方 <b>{foeSynCount}项</b>
                </span>
              </div>
            </div>
            <div class="intel-hint">
              拖动我方生物到 <b class="blue-t">蓝色区域</b> 布阵 · 远程置于高台享居高临下
            </div>
          </div>
        </Tip>
        <div class="dh-right">
          <div class="stake">
            <div class="stake-title">失利代价</div>
            <div class="stake-hearts">
              -{stake} <HeartIcon size={18} />
            </div>
          </div>
          <Btn variant="green" size="big" onClick={onFight} disabled={!s.team.length}>
            ⚔ 开战！
          </Btn>
        </div>
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
