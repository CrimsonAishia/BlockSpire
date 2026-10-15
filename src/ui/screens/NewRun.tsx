import { useState } from 'preact/hooks';
import { COMMANDERS, COMMANDER_MAP, OMENS, OMEN_SCALING, RELICS } from '../../data/items.ts';
import { SKILL_INFO } from '../../data/commanders.ts';
import { url } from '../assets.ts';
import { Btn, Emerald, HeartIcon, RelicTipContent, Tip } from '../components/common.tsx';
import { RichText } from '../components/rich.tsx';
import { go, profile, setRun, commit } from '../store.ts';
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
  const [omen, setOmen] = useState(Math.min(p.maxOmen, 0));
  const start = () => {
    sfx('levelup');
    setRun(createRun(cmd, omen));
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
            const hearts = c.hearts - (omen >= 3 ? 1 : 0);
            const best = p.bestOmen?.[c.id];
            const tier = omenTier(best);
            return (
              <button
                key={c.id}
                class={`cmd-card ${cmd === c.id ? 'on' : ''} ${ok ? '' : 'locked'} ${tier ? `tier-${tier}` : ''}`}
                style={{ '--cc': c.color } as never}
                disabled={!ok}
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
                        <Emerald n={c.emeralds} size={16} />
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
        <div class="panel omen-panel">
          <div class="row between">
            <div class="panel-title" style={{ marginBottom: 4 }}>
              难度：{omen === 0 ? '普通' : OMENS[omen - 1].name}
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
                  {i === 0 ? '普' : ['I', 'II', 'III', 'IV', 'V'][i - 1]}
                </button>
              ))}
            </div>
          </div>
          {omen === 0 ? (
            <div class="subtle" style={{ marginTop: 8 }}>
              标准难度，适合第一次游玩。通关后解锁「不祥之兆」挑战等级：每一级保留之前的全部规则，再加上新的规则，敌人更强、物资更紧，开箱也更幸运。
            </div>
          ) : (
            <>
              <div class="omen-cur">
                <b>{OMENS[omen - 1].title}</b>
                {OMENS[omen - 1].rules.map((r) => (
                  <span key={r}>☠ {r}</span>
                ))}
              </div>
              {omen > 1 && (
                <div class="omen-prev">
                  <span class="faint">以及之前每一级的规则：</span>
                  {OMENS.slice(0, omen - 1).map((o) => (
                    <Tip
                      key={o.level}
                      content={() => (
                        <div>
                          <div class="tt-title">
                            {o.name} · {o.title}
                          </div>
                          {o.rules.map((r) => (
                            <div class="tt-line tt-red" key={r}>
                              ☠ {r}
                            </div>
                          ))}
                        </div>
                      )}
                    >
                      <span class="omen-chip">
                        {ROMAN_OMEN[o.level]} {o.title}
                      </span>
                    </Tip>
                  ))}
                </div>
              )}
              <div class="faint" style={{ fontSize: 13, marginTop: 4 }}>
                {OMEN_SCALING} 通关后解锁下一级，并为这位统领记录最高难度（铜 I–II · 银 III–IV · 金 V 统领边框）。
              </div>
            </>
          )}
        </div>
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
          <span class="cd-tag">统领技能</span>
          {icons.map((k) => (
            <img key={k} class="pixelated" src={url.icon(SKILL_INFO[k].icon)} />
          ))}
          {c.skill.id === 'brew' && <img class="pixelated" src={url.icon('skill_brew')} />}
          <b style={{ color: c.color }}>{c.skill.name}</b>
        </div>
        <div class="cd-text">
          <RichText text={c.skill.desc} />
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
          <span class="cd-tag">被动</span>
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
                <img class="pixelated" src={url.icon(r.id)} />
                <span>{r.name}</span>
              </div>
            </Tip>
          ))}
        </div>
      </div>
    </div>
  );
}
