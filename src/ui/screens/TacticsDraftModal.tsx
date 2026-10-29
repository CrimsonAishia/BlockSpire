import { useEffect, useState } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { chooseDraftTactic } from '../../run/run.ts';
import { TACTIC_DEFS, type TacticId } from '../../data/tactics.ts';
import { url } from '../assets.ts';
import { Btn } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';

type DraftPending = Extract<Pending, { type: 'tactics_draft' }>;

export function TacticsDraftModal({ s, p }: { s: RunState; p: DraftPending; v?: number }) {
  const [selectedTactic, setSelectedTactic] = useState<string | null>(p.choices[0] ?? null);
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);

  useEffect(() => { setSelectedTactic(p.choices[0] ?? null); setReplaceTarget(null); }, [p]);

  const tState = s.tacticsState ?? { tactics: [], equipped: null, variants: {} };
  const isFull = tState.tactics.length >= 3;

  const canConfirm = !!selectedTactic && (!isFull || !!replaceTarget);

  const sourceTitle: Record<string, string> = {
    act1_boss: '战备整编 · 副战术研习',
    missive: '密函传书 · 战术破译',
    scroll: '战术卷轴 · 战法修习',
  };

  const title = p.title || sourceTitle[p.source] || '战术三选一';

  return (
    <div class="screen choice-screen" style={{ zIndex: 100 }}>
      <div class="choice-head">
        <div class="choice-title title-shadow">{title}</div>
        <div class="subtle" style={{ fontSize: 16 }}>
          挑选一项统领副战术。每位统领至多收藏 3 项副战术，每场战斗前可自由切换装备 1 项。
        </div>
      </div>

      <div class="relic-tiles" style={{ maxWidth: 900, margin: '20px auto 10px' }}>
        {p.choices.map((tid) => {
          const tdef = TACTIC_DEFS[tid as TacticId];
          if (!tdef) return null;
          const isSelected = selectedTactic === tid;
          const isOffense = tdef.category === 'offense';
          const themeColor = isOffense ? '#e17055' : '#00cec9';

          return (
            <div
              key={tid}
              class={`relic-tile ${isSelected ? 'active' : ''}`}
              style={{
                '--tc': themeColor,
                border: isSelected ? `2px solid ${themeColor}` : undefined,
                boxShadow: isSelected ? `0 0 16px ${themeColor}88` : undefined,
                cursor: 'pointer',
                minHeight: 220,
              } as never}
              onClick={() => {
                sfx('click');
                setSelectedTactic(tid);
              }}
            >
              <div class="rt-glow" />
              <img
                src={url.icon(tdef.icon)}
                class="pixelated float"
                style={{ width: 48, height: 48, objectFit: 'contain' }}
              />
              <div class="rt-name" style={{ color: themeColor, fontSize: 18, marginTop: 8 }}>
                {tdef.name}
              </div>
              <div
                class="rt-tier"
                style={{
                  color: isOffense ? '#fab1a0' : '#81ecec',
                  background: isOffense ? 'rgba(225,112,85,0.2)' : 'rgba(0,206,201,0.2)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {isOffense ? '⚔ 进攻型战术' : '🛡 防守型战术'} · 前摇 {tdef.windup}s
              </div>
              <div class="rt-desc" style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8 }}>
                {tdef.desc}
              </div>
            </div>
          );
        })}
      </div>

      {isFull && selectedTactic && (
        <div
          class="panel"
          style={{
            maxWidth: 680,
            margin: '10px auto',
            padding: '12px 20px',
            background: 'rgba(30, 20, 20, 0.85)',
            border: '1px solid #d63031',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <div style={{ color: '#ff7675', fontWeight: 'bold', marginBottom: 8, fontSize: 15 }}>
            ⚠ 战术库已满（3/3）：请选择被替换的旧战术（其精进变体将一同遗忘）
          </div>
          <div class="row gap12 center wrap">
            {tState.tactics.map((tid) => {
              const oldDef = TACTIC_DEFS[tid as TacticId];
              const isRep = replaceTarget === tid;
              const hasVar = tState.variants[tid];
              return (
                <button
                  key={tid}
                  class={`btn ${isRep ? 'active' : ''}`}
                  style={{
                    padding: '8px 14px',
                    borderColor: isRep ? '#e17055' : '#636e72',
                    background: isRep ? 'rgba(225,112,85,0.3)' : 'rgba(0,0,0,0.5)',
                    color: '#fff',
                  }}
                  onClick={() => {
                    sfx('click');
                    setReplaceTarget(tid);
                  }}
                >
                  <img
                    src={url.icon(oldDef?.icon ?? tid)}
                    style={{ width: 20, height: 20, verticalAlign: 'middle', marginRight: 6 }}
                  />
                  {oldDef?.name ?? tid}
                  {hasVar ? <span style={{ color: '#ffeaa7', fontSize: 12 }}>（已精进）</span> : ''}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div class="choice-foot" style={{ marginTop: 20, display: 'flex', gap: 16, justifyContent: 'center' }}>
        {p.skippable && (
          <Btn
            onClick={() => {
              sfx('click');
              act((r) => chooseDraftTactic(r, null));
            }}
          >
            跳过放弃
          </Btn>
        )}
        <Btn
          variant="green"
          size="big"
          disabled={!canConfirm}
          onClick={() => {
            if (!selectedTactic) return;
            sfx('enchant');
            act((r) => chooseDraftTactic(r, selectedTactic, replaceTarget ?? undefined));
          }}
        >
          {isFull ? '确认替换并领悟' : '确认领悟战术'}
        </Btn>
      </div>
    </div>
  );
}
