import { useEffect, useState } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { captureTamed, leaveNode, swapLoot } from '../../run/run.ts';
import { RARITY_INFO, mobDef } from '../../data/mobs.ts';
import { POTION_MAP } from '../../data/items.ts';
import { url } from '../assets.ts';
import { Btn, Emerald, HeartIcon, MobTipContent, PotionTipContent, Tip, itemIcon } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';

type P = Extract<Pending, { type: 'result' }>;

function CountUp({ to, ms = 800 }: { to: number; ms?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const f = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(f);
    };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{v}</>;
}

export function BattleResultView({ s, p }: { s: RunState; p: P }) {
  const mine = p.summary.cards.filter((c) => c.team === 0 && !mobDef(c.mob).structure);
  const foes = p.summary.cards.filter((c) => c.team === 1 && !mobDef(c.mob).structure);
  const maxDmg = Math.max(1, ...mine.map((c) => c.dmg));
  const mvp = mine.reduce((a, c) => (c.dmg > a.dmg ? c : a), mine[0]);
  useEffect(() => {
    if (p.win) setTimeout(() => sfx('coin'), 300);
    else if (p.heartsLost) setTimeout(() => sfx('heart_lose'), 300);
  }, []);
  return (
    <div class={`screen result-screen ${p.win ? 'win' : 'lose'}`}>
      <div class="result-banner title-shadow">{p.win ? '战斗胜利' : '战斗失败'}</div>
      <div class="result-sub subtle">
        用时 {Math.round(p.summary.time)} 秒
        {p.totem && <span class="gold-t"> · 不死图腾碎裂了，你以 2 颗心复活！</span>}
      </div>
      <div class="result-body">
        <div class="panel result-table">
          <div class="panel-title">战斗统计</div>
          <div class="rt-head">
            <span>卡牌</span>
            <span>伤害</span>
            <span>击杀</span>
            <span>治疗</span>
            <span>存活</span>
          </div>
          {mine.map((c, i) => {
            const m = mobDef(c.mob);
            return (
              <div key={i} class={`rt-row r-${m.rarity} ${c === mvp && c.dmg > 0 ? 'mvp' : ''}`}>
                <span class="rt-card">
                  <img src={url.mob(c.mob)} />
                  <span class="rc">{m.name}</span>
                  <span class="stars">{'★'.repeat(c.star)}</span>
                  {c === mvp && c.dmg > 0 && <span class="mvp-tag">MVP</span>}
                </span>
                <span class="rt-dmg">
                  <span class="rt-bar" style={{ width: `${(c.dmg / maxDmg) * 100}%` }} />
                  <span>{Math.round(c.dmg)}</span>
                </span>
                <span>{c.kills}</span>
                <span>{Math.round(c.heal)}</span>
                <span class={c.alive > 0 ? 'em' : 'red-t'}>
                  {c.alive}/{c.spawned}
                </span>
              </div>
            );
          })}
          <div class="divider" />
          <div class="rt-foes">
            <span class="faint">敌方：</span>
            {foes.map((c, i) => (
              <span key={i} class={`rt-foe ${c.alive > 0 ? '' : 'dead'}`}>
                <img src={url.mob(c.mob)} />
                {c.alive}/{c.spawned}
              </span>
            ))}
          </div>
        </div>
        <div class="panel result-rewards">
          <div class="panel-title">{p.win ? '战利品' : '损失'}</div>
          <div class="rr-line">
            <Emerald size={30} />
            <span class="em" style={{ fontSize: 30 }}>
              +<CountUp to={p.emeralds} />
            </span>
          </div>
          {p.potion && (
            <div class="rr-line">
              <img src={itemIcon(p.potion)} width={34} class="pixelated" />
              <span>获得 {POTION_MAP[p.potion].name}</span>
            </div>
          )}
          {p.golemCost ? (
            <div class="rr-line">
              <Emerald size={24} />
              <span class="red-t">-{p.golemCost}</span>
              <span class="subtle">雇佣铁傀儡</span>
            </div>
          ) : null}
          {p.capture && p.capture.length > 0 && (
            <div class="rr-capture">
              <div class="gold-t">驯服的生物还活着——收服一只加入你的卡牌：</div>
              <div class="row gap8 wrap">
                {p.capture.map((m) => {
                  const d = mobDef(m);
                  return (
                    <Tip key={m} content={() => <MobTipContent mob={m} />}>
                      <button class={`cap-btn r-${d.rarity}`} onClick={() => (sfx('levelup'), act((r) => captureTamed(r, m)))}>
                        <img src={url.mob(m)} />
                        <span class="rc">{d.name}</span>
                        <span class="faint" style={{ fontSize: 12 }}>{RARITY_INFO[d.rarity].short} · ★1</span>
                      </button>
                    </Tip>
                  );
                })}
              </div>
            </div>
          )}
          {p.missed && (
            <div class="rr-missed">
              <div class="rr-line">
                <Tip content={() => <PotionTipContent id={p.missed!} />}>
                  <img src={itemIcon(p.missed)} width={34} class="pixelated" />
                </Tip>
                <span>
                  掉落 {POTION_MAP[p.missed].name}，但<span class="red-t">物品栏已满</span>
                </span>
              </div>
              <div class="faint" style={{ fontSize: 13 }}>点击一件物品把它换掉（被换掉的物品会丢弃），或直接继续放弃掉落：</div>
              <div class="row gap4 wrap">
                {s.potions.map((it, i) => (
                  <Tip key={i} class="slot dark swap-slot" content={() => <PotionTipContent id={it} />}>
                    <img src={itemIcon(it)} onClick={() => (sfx('card_flip'), act((r) => swapLoot(r, i)))} />
                  </Tip>
                ))}
              </div>
            </div>
          )}
          {p.heartsLost > 0 && (
            <div class="rr-line lost">
              {Array.from({ length: p.heartsLost }, (_, i) => (
                <span key={i} class="heart-break">
                  <HeartIcon size={30} />
                </span>
              ))}
              <span class="red-t">失去 {p.heartsLost} 颗心（剩余 {s.hearts}）</span>
            </div>
          )}
          {p.win && p.kind !== 'event' && <div class="faint">接下来：挑选补给箱{p.kind === 'elite' ? '与宝物' : ''}</div>}
          {!p.win && p.kind === 'boss' && s.hearts > 0 && <div class="gold-t">首领带伤：再次挑战时，它将保留你造成的一半伤害。</div>}
          <Btn variant="green" size="big" wide onClick={() => act((r) => leaveNode(r))} style={{ marginTop: 'auto' }}>
            继续
          </Btn>
        </div>
      </div>
    </div>
  );
}
