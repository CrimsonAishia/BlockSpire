import { useEffect, useState } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { studyHallTactic, refineSkillVariant, leaveHall } from '../../run/run.ts';
import { TACTIC_DEFS, type TacticId } from '../../data/tactics.ts';
import { url } from '../assets.ts';
import { Btn } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';

type HallPending = Extract<Pending, { type: 'tactics_hall' }>;

export function TacticsHallView({ s, p }: { s: RunState; p: HallPending; v?: number }) {
  const [tab, setTab] = useState<'study' | 'refine'>('study');
  const [selectedStudy, setSelectedStudy] = useState<string | null>(p.offer.studyChoices[0] ?? null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  // 精进状态
  const [targetId, setTargetId] = useState<string>(p.offer.eligibleTargets[0]?.id ?? s.commander);
  const [variantId, setVariantId] = useState<string | null>(null);

  useEffect(() => {
    setTab('study'); setSelectedStudy(p.offer.studyChoices[0] ?? null); setReplaceTarget(null);
    setTargetId(p.offer.eligibleTargets[0]?.id ?? s.commander); setVariantId(null);
  }, [p]);

  const tState = s.tacticsState ?? { tactics: [], equipped: null, variants: {} };
  const isFull = tState.tactics.length >= 3;
  const canAffordRefine = s.emeralds >= p.offer.trainingCost;

  const currentTarget = p.offer.eligibleTargets.find((t) => t.id === targetId);

  return (
    <div class="screen event-screen" style={{ zIndex: 90 }}>
      {/* 战技殿堂背景图 */}
      <div
        class="event-art"
        style={{
          backgroundImage: `url(${url.event('bg_tactics')})`,
          backgroundPosition: 'center',
          backgroundSize: 'cover',
        }}
      />

      <div
        class="event-panel panel"
        style={{
          maxWidth: 780,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(18, 22, 28, 0.95)',
          border: '1px solid rgba(255, 215, 0, 0.3)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          overflowY: 'auto',
        }}
      >
        <div class="row between center" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
          <div>
            <div class="event-name title-shadow" style={{ color: '#ffeaa7', fontSize: 24 }}>
              🏛️ 战技殿堂 · 兵韬演武
            </div>
            <div class="subtle" style={{ fontSize: 13, marginTop: 4 }}>
              驻守古老战术导师的演武圣地。每座殿堂可完成一项服务：免费研习新战术，或消耗绿宝石精进变体。
            </div>
          </div>
          <div class="row gap12 center">
            <span class="gold-t" style={{ fontSize: 15, fontWeight: 'bold' }}>
              💎 {s.emeralds} 绿宝石
            </span>
            <span class="subtle" style={{ fontSize: 13 }}>
              副战术库：{tState.tactics.length}/3
            </span>
          </div>
        </div>

        {/* 顶部服务切换选项卡 */}
        <div class="row gap8" style={{ marginTop: 14, marginBottom: 14 }}>
          <button
            class={`btn ${tab === 'study' ? 'active' : ''}`}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: 15,
              background: tab === 'study' ? 'rgba(0, 206, 201, 0.25)' : 'rgba(0,0,0,0.4)',
              borderColor: tab === 'study' ? '#00cec9' : '#636e72',
              color: tab === 'study' ? '#81ecec' : '#b2bec3',
              borderRadius: 6,
            }}
            onClick={() => {
              sfx('click');
              setTab('study');
            }}
          >
            📜 免费研习新战术（1次）
          </button>
          <button
            class={`btn ${tab === 'refine' ? 'active' : ''}`}
            style={{
              flex: 1,
              padding: '10px 16px',
              fontSize: 15,
              background: tab === 'refine' ? 'rgba(255, 177, 66, 0.25)' : 'rgba(0,0,0,0.4)',
              borderColor: tab === 'refine' ? '#ffa502' : '#636e72',
              color: tab === 'refine' ? '#ffeaa7' : '#b2bec3',
              borderRadius: 6,
            }}
            onClick={() => {
              sfx('click');
              setTab('refine');
            }}
          >
            ⚡ 精进专长变体（需 {p.offer.trainingCost} 绿宝石）
          </button>
        </div>

        {/* Tab 1: 研习服务 */}
        {tab === 'study' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div class="subtle" style={{ fontSize: 14 }}>
              从殿堂战术秘录中选择领悟一项副战术。已有战术满 3 项时需指定替换一项：
            </div>

            {p.offer.studyChoices.length === 0 ? (
              <div class="panel" style={{ textAlign: 'center', padding: '30px 20px', color: '#b2bec3' }}>
                已将殿堂全部战术修习完毕！请前往「精进专长变体」或直接离开。
              </div>
            ) : (
              <div class="row gap12 wrap" style={{ justifyContent: 'center' }}>
                {p.offer.studyChoices.map((tid) => {
                  const tdef = TACTIC_DEFS[tid as TacticId];
                  if (!tdef) return null;
                  const isSel = selectedStudy === tid;
                  const isOffense = tdef.category === 'offense';
                  const color = isOffense ? '#e17055' : '#00cec9';

                  return (
                    <div
                      key={tid}
                      class={`relic-tile ${isSel ? 'active' : ''}`}
                      style={{
                        flex: '1 1 200px',
                        maxWidth: 240,
                        minHeight: 200,
                        cursor: 'pointer',
                        border: isSel ? `2px solid ${color}` : '1px solid rgba(255,255,255,0.15)',
                        boxShadow: isSel ? `0 0 12px ${color}88` : undefined,
                        background: 'rgba(25, 30, 38, 0.8)',
                      } as never}
                      onClick={() => {
                        sfx('click');
                        setSelectedStudy(tid);
                      }}
                    >
                      <div class="rt-glow" />
                      <img
                        src={url.icon(tdef.icon)}
                        class="pixelated"
                        style={{ width: 44, height: 44, objectFit: 'contain' }}
                      />
                      <div class="rt-name" style={{ color, fontSize: 16, marginTop: 6 }}>
                        {tdef.name}
                      </div>
                      <div
                        class="rt-tier"
                        style={{
                          fontSize: 11,
                          padding: '2px 6px',
                          color: isOffense ? '#fab1a0' : '#81ecec',
                        }}
                      >
                        {isOffense ? '⚔ 进攻战术' : '🛡 防守战术'} · 前摇 {tdef.windup}s
                      </div>
                      <div class="rt-desc" style={{ fontSize: 12, lineHeight: 1.4, marginTop: 6 }}>
                        {tdef.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {isFull && selectedStudy && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(40, 20, 20, 0.8)',
                  border: '1px solid #e17055',
                  borderRadius: 6,
                  textAlign: 'center',
                }}
              >
                <div style={{ color: '#ff7675', fontSize: 13, marginBottom: 6 }}>
                  ⚠ 当前战术库已满（3/3），请选择替换哪项旧战术：
                </div>
                <div class="row gap8 center wrap">
                  {tState.tactics.map((tid) => {
                    const oldDef = TACTIC_DEFS[tid as TacticId];
                    const isRep = replaceTarget === tid;
                    return (
                      <button
                        key={tid}
                        class={`btn ${isRep ? 'active' : ''}`}
                        style={{
                          padding: '6px 12px',
                          fontSize: 13,
                          borderColor: isRep ? '#e17055' : '#636e72',
                          background: isRep ? 'rgba(225,112,85,0.3)' : 'rgba(0,0,0,0.5)',
                        }}
                        onClick={() => {
                          sfx('click');
                          setReplaceTarget(tid);
                        }}
                      >
                        <img
                          src={url.icon(oldDef?.icon ?? tid)}
                          style={{ width: 18, height: 18, verticalAlign: 'middle', marginRight: 4 }}
                        />
                        {oldDef?.name ?? tid}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div class="row center gap16" style={{ marginTop: 12 }}>
              <Btn
                variant="green"
                size="big"
                disabled={!selectedStudy || (isFull && !replaceTarget)}
                onClick={() => {
                  if (!selectedStudy) return;
                  sfx('enchant');
                  act((r) => studyHallTactic(r, selectedStudy, replaceTarget ?? undefined));
                }}
              >
                {isFull ? '确认替换并领悟新战术' : '确认领悟新战术（免费）'}
              </Btn>
            </div>
          </div>
        )}

        {/* Tab 2: 精进服务 */}
        {tab === 'refine' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div class="subtle" style={{ fontSize: 14 }}>
              选择一项统领身份本领或已收藏副战术，从两项互斥精进变体中选择其一。每个技能至多激活一项变体：
            </div>

            {/* 目标技能选择 */}
            <div class="row gap8 wrap">
              {p.offer.eligibleTargets.map((tgt) => {
                const isSel = targetId === tgt.id;
                const activeVar = tgt.variants.find((v) => v.id === tgt.currentVariant);
                return (
                  <button
                    key={tgt.id}
                    class={`btn ${isSel ? 'active' : ''}`}
                    style={{
                      padding: '8px 12px',
                      fontSize: 13,
                      borderColor: isSel ? '#ffa502' : 'rgba(255,255,255,0.2)',
                      background: isSel ? 'rgba(255, 177, 66, 0.3)' : 'rgba(0,0,0,0.4)',
                      color: isSel ? '#ffeaa7' : '#dfe6e9',
                      borderRadius: 6,
                    }}
                    onClick={() => {
                      sfx('click');
                      setTargetId(tgt.id);
                      setVariantId(null);
                    }}
                  >
                    {tgt.isMain ? '👑 ' : '⚔ '}
                    {tgt.name}
                    {activeVar ? (
                      <span style={{ color: '#55efc4', marginLeft: 6, fontSize: 12 }}>
                        [{activeVar.tag} · {activeVar.name}]
                      </span>
                    ) : (
                      <span style={{ color: '#b2bec3', marginLeft: 6, fontSize: 12 }}>[基础版]</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* 当前目标技能的变体 A 与 B */}
            {currentTarget && (
              <div class="row gap12" style={{ marginTop: 8 }}>
                {currentTarget.variants.map((v) => {
                  const isCurrentActive = currentTarget.currentVariant === v.id;
                  const isSel = variantId === v.id;
                  const tagColor = v.tag === 'A' ? '#0984e3' : '#e84393';

                  return (
                    <div
                      key={v.id}
                      class={`panel ${isSel ? 'active' : ''}`}
                      style={{
                        flex: 1,
                        padding: '14px 16px',
                        cursor: 'pointer',
                        borderRadius: 8,
                        border: isSel
                          ? `2px solid ${tagColor}`
                          : isCurrentActive
                          ? '2px solid #00b894'
                          : '1px solid rgba(255,255,255,0.15)',
                        background: isSel ? 'rgba(40, 50, 70, 0.7)' : 'rgba(20, 25, 32, 0.7)',
                        boxShadow: isSel ? `0 0 12px ${tagColor}88` : undefined,
                      }}
                      onClick={() => {
                        sfx('click');
                        setVariantId(v.id);
                      }}
                    >
                      <div class="row between center">
                        <span
                          style={{
                            background: tagColor,
                            color: '#fff',
                            fontWeight: 'bold',
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          变体 {v.tag}
                        </span>
                        {isCurrentActive && (
                          <span style={{ color: '#00b894', fontSize: 12, fontWeight: 'bold' }}>
                            ✓ 当前激活中
                          </span>
                        )}
                      </div>
                      <div style={{ color: '#ffeaa7', fontSize: 17, fontWeight: 'bold', margin: '8px 0 6px' }}>
                        {v.name}
                      </div>
                      <div class="subtle" style={{ fontSize: 13, lineHeight: 1.5 }}>
                        {v.desc}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div class="row center gap16" style={{ marginTop: 12 }}>
              <Btn
                variant="green"
                size="big"
                disabled={!variantId || !canAffordRefine}
                onClick={() => {
                  if (!variantId) return;
                  sfx('enchant');
                  act((r) => refineSkillVariant(r, targetId, variantId));
                }}
              >
                {canAffordRefine
                  ? `精进专长（消耗 ${p.offer.trainingCost} 绿宝石）`
                  : `绿宝石不足（需 ${p.offer.trainingCost}，当前 ${s.emeralds}）`}
              </Btn>
            </div>
          </div>
        )}

        {/* 底部离开殿堂 */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 16, paddingTop: 12, textAlign: 'center' }}>
          <Btn
            onClick={() => {
              sfx('click');
              act((r) => leaveHall(r));
            }}
          >
            离开战技殿堂
          </Btn>
        </div>
      </div>
    </div>
  );
}
