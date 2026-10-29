import { useState } from 'preact/hooks';
import { COMMANDERS, COMMANDER_MAP, OMENS, RELICS, difficultyPolicy } from '../../data/items.ts';
import { SKILL_INFO } from '../../data/commanders.ts';
import { url } from '../assets.ts';
import { Btn, Emerald, HeartIcon, RelicTipContent, Tip } from '../components/common.tsx';
import { RichText } from '../components/rich.tsx';
import { go, profile, setRun, commit, updateProfile } from '../store.ts';
import { createRun } from '../../run/run.ts';
import { sfx } from '../../audio/audio.ts';
import { OMEN_TIER_NAME, ROMAN_OMEN, omenTier } from '../../meta/profile.ts';

export function NewRun() {
  const p = profile.value;
  const unlocked = (id: string) => {
    const c = COMMANDERS.find((x) => x.id === id)!;
    return !c.unlock || p.flags[c.unlock.key];
  };
  const [cmd, setCmd] = useState('steve');
  const [omen, setOmen] = useState(Math.max(0, Math.min(p.maxOmen, p.lastOmen ?? 0, OMENS.length)));
  const start = () => {
    sfx('levelup');
    updateProfile((next) => {
      next.lastOmen = omen;
    });
    setRun(createRun(cmd, omen, undefined, p.discovered));
    commit();
    go('run');
  };
  return (
    <div class="screen newrun-screen bg-dirt bg-shade">
      <div class="newrun-inner">
        <div class="nr-title title-shadow">选择你的统领</div>
        <div class="cmd-cards">
          {COMMANDERS.map((c) => {
            const ok = unlocked(c.id);
            const hearts = c.hearts - difficultyPolicy(omen).heartsPenalty;
            const best = p.bestOmen?.[c.id];
            const tier = omenTier(best);
            return (
              <button
                key={c.id}
                class={`cmd-card ${cmd === c.id ? 'on' : ''} ${ok ? '' : 'locked'} ${tier ? `tier-${tier}` : ''}`}
                style={{ '--cc': c.color } as never}
                disabled={!ok}
                aria-label={ok ? `选择统领：${c.name}` : `未解锁统领：${c.title}`}
                aria-pressed={cmd === c.id}
                onClick={() => {
                  sfx('card_flip');
                  setCmd(c.id);
                }}
              >
                {ok && best !== undefined && (
                  <div class={`cc-best ${tier}`} title={tier ? `${OMEN_TIER_NAME[tier]}色边框：用这位统领通关的最高难度` : '用这位统领通关的最高难度'}>
                    {best > 0 ? `☠ ${ROMAN_OMEN[best]}` : '✔ 普通'}
                  </div>
                )}
                <img src={url.cmd(c.id)} />
                <div class="cc-name">{ok ? c.name : '？？？'}</div>
                <div class="cc-title" style={{ color: c.color }}>
                  {c.title}
                </div>
                {ok ? (
                  <>
                    <div class="cc-res">
                      <span class="row gap4">
                        <HeartIcon size={16} /> {hearts}
                      </span>
                      <span>
                        <Emerald n={c.emeralds + difficultyPolicy(omen).startingEmeraldBonus} size={16} />
                      </span>
                    </div>
                    <div class="cc-style">{c.style}</div>
                  </>
                ) : (
                  <div class="cc-lock">🔒 {c.unlock!.text}</div>
                )}
              </button>
            );
          })}
        </div>
        <CommanderDetail id={cmd} />
        {(() => {
          const policy = difficultyPolicy(omen);
          const roman = ROMAN_OMEN[omen];
          const prevRules = policy.rules.slice(0, policy.rules.length - policy.newRules.length);
          return (
            <div class="panel omen-panel">
              <div class="row between omen-header">
                <div class="row gap8 center">
                  <div class="panel-title" style={{ marginBottom: 0 }}>
                    {omen === 0 ? '难度：普通 · 探索' : `难度：不祥之兆 ${roman} · ${policy.name}`}
                  </div>
                  {omen === 5 && <span class="omen-badge-danger">终局挑战</span>}
                  {prevRules.length > 0 && (
                    <Tip
                      content={() => (
                        <div class="omen-history-tt">
                          <div class="tt-title">前置已生效规则（{prevRules.length} 条）：</div>
                          {prevRules.map((r, idx) => (
                            <div key={idx} class="tt-line tt-red">✔ {r}</div>
                          ))}
                        </div>
                      )}
                    >
                      <span class="omen-accum-tag">
                        ✔ 包含前置全部挑战规则（悬停查看）
                      </span>
                    </Tip>
                  )}
                </div>
                <div class="row gap8">
                  {Array.from({ length: 6 }, (_, i) => (
                    <button
                      key={i}
                      class={`omen-pip ${omen === i ? 'on' : ''} ${i > p.maxOmen ? 'locked' : ''}`}
                      disabled={i > p.maxOmen}
                      onClick={() => (sfx('click'), setOmen(i))}
                      title={i > p.maxOmen ? '在上一难度通关后解锁' : ''}
                    >
                      {i === 0 ? '普' : ROMAN_OMEN[i]}
                    </button>
                  ))}
                </div>
              </div>
              <div key={omen} class="omen-body">
                {omen === 0 ? (
                  <>
                    <div class="omen-rules-row">
                      <span class="omen-badge-std">标准模式</span>
                      <span class="omen-rule-item">{policy.summary}</span>
                    </div>
                    <div class="omen-stats-bar">
                      <span class="omen-stat-chip">💖 敌方生命 <b>基准</b></span>
                      <span class="omen-stat-chip">⚔️ 敌方攻击 <b>基准</b></span>
                      <span class="omen-stat-chip gold">🏆 通关积分 <b>1.0x</b></span>
                      <span class="omen-stat-sub">通关后解锁「不祥之兆」进阶挑战等级与统领勋标</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div class="omen-rules-row">
                      <span class="omen-badge-new">本级新增</span>
                      <div class="omen-new-list">
                        {policy.newRules.map((r) => (
                          <span key={r} class="omen-rule-item" title={r}>☠ {r}</span>
                        ))}
                      </div>
                    </div>
                    <div class="omen-stats-bar">
                      <span class="omen-stat-chip">💖 敌方生命 <b>+{Math.round((policy.hpMul - 1) * 100)}% + {Math.round(policy.dynamicStepRate * 100)}%/幕</b></span>
                      <span class="omen-stat-chip">⚔️ 敌方攻击 <b>+{Math.round((policy.atkMul - 1) * 100)}% + {Math.round(policy.dynamicStepRate * 100)}%/幕</b></span>
                      <span class="omen-stat-chip gold">🏆 通关积分 <b>+{Math.round((policy.scoreMul - 1) * 100)}%</b></span>
                      {policy.startingEmeraldBonus > 0 && <span class="omen-stat-chip gold">💎 起始补助 <b>+{policy.startingEmeraldBonus}</b></span>}
                      <span class="omen-stat-sub">通关后解锁下一级并点亮该统领勋标</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })()}
        <div class="row gap16 center">
          <Btn size="big" onClick={() => go('title')}>
            返回
          </Btn>
          <Btn variant="gold" size="big" onClick={start}>
            出发！
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** What makes the chosen commander play differently: skill, mechanic, passives, exclusive relics. */
function CommanderDetail({ id }: { id: string }) {
  const c = COMMANDER_MAP[id];
  const own = RELICS.filter((r) => r.commander === id);
  const icons = c.skill.id === 'build' ? ['wall', 'platform'] : c.skill.id === 'brew' ? [] : [c.skill.id];
  return (
    <div class="panel cmd-detail" style={{ '--cc': c.color } as never}>
      <div class="cd-col">
        <div class="cd-head">
          <span class="cd-tag">初始主技能</span>
          {icons.map((k) => (
            <img key={k} class="pixelated" src={url.icon(SKILL_INFO[k].icon)} />
          ))}
          {c.skill.id === 'brew' && <img class="pixelated" src={url.icon('skill_brew')} />}
          <b style={{ color: c.color }}>{c.skill.name}</b>
        </div>
        <div class="cd-text">
          <RichText text={c.skill.summary} />
        </div>
      </div>
      <div class="cd-col">
        {c.mechanic && (
          <>
            <div class="cd-head">
              <span class="cd-tag">特色机制</span>
              <b style={{ color: c.color }}>{c.mechanic.name}</b>
            </div>
            <div class="cd-text">
              <RichText text={c.mechanic.desc} />
            </div>
          </>
        )}
        <div class="cd-head" style={{ marginTop: c.mechanic ? 6 : 0 }}>
          <span class="cd-tag">基础被动</span>
        </div>
        <div class="cd-text">{c.desc.join(' ')}</div>
      </div>
      <div class="cd-col narrow">
        <div class="cd-head">
          <span class="cd-tag">专属宝物</span>
        </div>
        <div class="cd-relics">
          {own.map((r) => (
            <Tip key={r.id} content={() => <RelicTipContent id={r.id} />}>
              <div class="cd-relic">
                <img class="pixelated" src={url.icon(r.icon ?? r.id)} />
                <span>{r.name}</span>
              </div>
            </Tip>
          ))}
        </div>
      </div>
    </div>
  );
}
