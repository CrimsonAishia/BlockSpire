import { useState } from 'preact/hooks';
import type { RunState } from '../../run/run.ts';
import { decompose, discardItem, dustValue, moveCard, setRow } from '../../run/run.ts';
import type { Card, Family, Row } from '../../core/types.ts';
import { FAMILIES, FAMILY_LIST } from '../../data/families.ts';
import { sideSynergies } from '../../battle/setup.ts';
import { mobDef } from '../../data/mobs.ts';
import { Btn, Emerald, FamBadge, MobCard, PotionTipContent, RelicSlot, Tip, itemIcon } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { RichText } from '../components/rich.tsx';
import { COMBOS, activeCombos } from '../../data/combos.ts';
import { Hint } from '../components/hints.tsx';
import { sfx } from '../../audio/audio.ts';

const ROW_NAME: Record<Row, string> = { front: '前排', mid: '中排', back: '后排' };

export function TeamPanel({ s, onClose }: { s: RunState; onClose: () => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [selItem, setSelItem] = useState<number | null>(null);
  const syn = sideSynergies(s.team, s.relics);
  const selCard = [...s.team, ...s.bench].find((c) => c.uid === sel);
  const selInTeam = !!s.team.find((c) => c.uid === sel);

  const clickCard = (c: Card, inTeam: boolean) => {
    if (sel && sel !== c.uid && selCard) {
      // Swap between team and bench.
      if (selInTeam !== inTeam) {
        act((r) => moveCard(r, selInTeam ? sel : c.uid, selInTeam ? 'bench' : 'team', selInTeam ? c.uid : sel));
        sfx('card_flip');
        setSel(null);
        return;
      }
    }
    setSel(sel === c.uid ? null : c.uid);
  };

  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div class="panel team-panel">
        <div class="row between">
          <div class="panel-title">队伍管理</div>
          <Btn size="small" onClick={onClose}>
            关闭 <span class="kbd">T</span>
          </Btn>
        </div>
        <Hint id="team" pos="center">
          <b>队伍管理</b>：只有「出战队伍」里的卡牌会参战，背包里的卡牌是替补。点击一张卡牌，再点击另一区域的卡牌即可交换。
          <br />
          羁绊按出战队伍中「不同生物」的数量计算，凑齐同一羁绊能获得强力加成。
        </Hint>
        <div class="team-cols">
          <div class="team-main">
            <div class="tp-sec">
              出战队伍 <span class="faint">{s.team.length}/{s.slots}</span>
              <span class="faint" style={{ fontSize: 13, marginLeft: 12 }}>点击选中卡牌，再点击另一区域的卡牌进行交换</span>
            </div>
            <div class="tp-cards">
              {s.team.map((c) => (
                <div key={c.uid} class="tp-card">
                  <MobCard mob={c.mob} card={c} onClick={() => clickCard(c, true)} selected={sel === c.uid} />
                  <div class="row-pick">
                    {(['front', 'mid', 'back'] as Row[]).map((r) => (
                      <button key={r} class={c.row === r ? 'on' : ''} onClick={() => act((st) => setRow(st, c.uid, r))}>
                        {ROW_NAME[r]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {Array.from({ length: s.slots - s.team.length }, (_, i) => (
                <div
                  key={i}
                  class={`empty-slot ${sel && !selInTeam ? 'target' : ''}`}
                  onClick={() => {
                    if (sel && !selInTeam) {
                      act((r) => moveCard(r, sel, 'team'));
                      setSel(null);
                    }
                  }}
                >
                  {sel && !selInTeam ? '放到这里' : '空位'}
                </div>
              ))}
            </div>
            <div class="tp-sec">
              背包 <span class="faint">{s.bench.length}/{s.benchSize}</span>
            </div>
            <div class="tp-cards">
              {s.bench.map((c) => (
                <div key={c.uid} class="tp-card">
                  <MobCard mob={c.mob} card={c} size="sm" onClick={() => clickCard(c, false)} selected={sel === c.uid} />
                </div>
              ))}
              {Array.from({ length: s.benchSize - s.bench.length }, (_, i) => (
                <div
                  key={i}
                  class={`empty-slot sm ${sel && selInTeam && s.team.length > 1 ? 'target' : ''}`}
                  onClick={() => {
                    if (sel && selInTeam) {
                      act((r) => moveCard(r, sel, 'bench'));
                      setSel(null);
                    }
                  }}
                >
                  {sel && selInTeam && s.team.length > 1 ? '放到这里' : '空'}
                </div>
              ))}
            </div>
            {selCard && (
              <div class="tp-actions">
                <span>
                  已选中：<b>{mobDef(selCard.mob).name}</b>
                </span>
                {confirm === selCard.uid ? (
                  <>
                    <span class="red-t">确定分解？</span>
                    <Btn
                      size="small"
                      variant="red"
                      onClick={() => {
                        sfx('coin');
                        act((r) => decompose(r, selCard.uid));
                        setSel(null);
                        setConfirm(null);
                      }}
                    >
                      确定
                    </Btn>
                    <Btn size="small" onClick={() => setConfirm(null)}>
                      取消
                    </Btn>
                  </>
                ) : (
                  <Btn size="small" variant="red" disabled={selInTeam && s.team.length <= 1} onClick={() => setConfirm(selCard.uid)}>
                    分解 <span class="price">+{Math.round(dustValue(selCard.mob, selCard.star))} <Emerald size={16} /></span>
                  </Btn>
                )}
              </div>
            )}
          </div>
          <div class="team-side">
            <div class="tp-sec">羁绊</div>
            <div class="syn-full">
              {FAMILY_LIST.map((f) => {
                const n = syn.counts[f.id] ?? 0;
                const tier = syn.active[f.id] ?? -1;
                if (!n) return null;
                return (
                  <div key={f.id} class={`syn-card ${tier >= 0 ? 'on' : ''}`}>
                    <div class="row between">
                      <FamBadge f={f.id as Family} count={n} active={tier >= 0} />
                    </div>
                    {f.tiers.map((t, i) => (
                      <div key={i} class={`syn-tier ${tier >= i ? 'on' : ''}`}>
                        ({t.n}) <RichText text={t.desc} />
                      </div>
                    ))}
                  </div>
                );
              })}
              {!Object.keys(syn.counts).length && <div class="faint">没有羁绊</div>}
              <div class="faint" style={{ fontSize: 13 }}>
                羁绊按出战队伍中不同生物的数量计算。可组合：{FAMILY_LIST.map((f) => FAMILIES[f.id].name).join('、')}
              </div>
            </div>
            <ComboList mobs={s.team.map((c) => c.mob)} />
            <div class="tp-sec">宝物 ({s.relics.length})</div>
            <div class="row gap4 wrap">{s.relics.length ? s.relics.map((r) => <RelicSlot key={r} id={r} />) : <span class="faint">暂无</span>}</div>
            <div class="tp-sec">物品（战斗中使用）</div>
            <div class="row gap4 wrap">
              {s.potions.length ? (
                s.potions.map((p, i) => (
                  <Tip key={i} class={`slot dark ${selItem === i ? 'sel' : ''}`} content={() => <PotionTipContent id={p} />}>
                    <img src={itemIcon(p)} onClick={() => setSelItem(selItem === i ? null : i)} style={{ cursor: 'pointer' }} />
                  </Tip>
                ))
              ) : (
                <span class="faint">暂无</span>
              )}
            </div>
            {selItem !== null && s.potions[selItem] && (
              <div class="row gap8" style={{ marginTop: 6 }}>
                <span class="faint" style={{ fontSize: 13 }}>丢弃这件物品？（商店里可以半价卖出）</span>
                <Btn
                  size="tiny"
                  variant="red"
                  onClick={() => {
                    act((r) => discardItem(r, selItem));
                    setSelItem(null);
                  }}
                >
                  丢弃
                </Btn>
                <Btn size="tiny" onClick={() => setSelItem(null)}>
                  取消
                </Btn>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Active combos, plus the ones a single missing mob away (greyed, with what is missing). */
export function ComboList({ mobs, compact }: { mobs: string[]; compact?: boolean }) {
  const on = new Set(activeCombos(mobs));
  const near = COMBOS.filter((c) => !on.has(c.id) && c.needs.some((g) => g.some((m) => mobs.includes(m))));
  if (!on.size && (compact || !near.length)) return compact ? null : null;
  return (
    <>
      {!compact && <div class="tp-sec">联动</div>}
      <div class="combo-list">
        {COMBOS.filter((c) => on.has(c.id)).map((c) => (
          <div key={c.id} class="combo on" style={{ '--cc': c.color } as never}>
            <b>{c.name}</b> <RichText text={c.desc} />
          </div>
        ))}
        {!compact &&
          near.slice(0, 6).map((c) => {
            const set = [...new Set(mobs)];
            const missingGroups = c.needs.filter((g) => !g.some((m) => set.includes(m)));
            const missingDesc = missingGroups.length
              ? missingGroups.map((g) => g.map((m) => mobName(m)).join(' / ')).join('、')
              : '另一种同类生物';
            return (
              <div key={c.id} class="combo off">
                <b>{c.name}</b> 还差：{missingDesc}
              </div>
            );
          })}
      </div>
    </>
  );
}

function mobName(id: string) {
  try {
    return mobDef(id).name;
  } catch {
    return id;
  }
}
