import { useEffect, useRef, useState } from 'preact/hooks';
import type { RunState } from '../../run/run.ts';
import { finishRun, runScore } from '../../run/run.ts';
import { COMMANDERS, COMMANDER_MAP } from '../../data/items.ts';
import { mobDef } from '../../data/mobs.ts';
import { RARITY_INFO } from '../../data/mobs.ts';
import { RARITIES } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, MobCard } from '../components/common.tsx';
import { commit, go, profile, progress, setRun, updateProfile, pushToast } from '../store.ts';
import { SubmitPanel } from './SubmitPanel.tsx';
import { sfx } from '../../audio/audio.ts';
import { isHostConnected } from '../../net/bakaboxBridge.ts';
import { OMEN_TIER_NAME, ROMAN_OMEN, omenTier } from '../../meta/profile.ts';

import { computeSynergies, FAMILIES } from '../../data/families.ts';
import type { Family } from '../../core/types.ts';
import type { HistoryEntry } from '../../meta/profile.ts';
import { reportRunTelemetry } from '../../net/telemetry.ts';

export function RunEnd({ s, won }: { s: RunState; won: boolean }) {
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const [record, setRecord] = useState<HistoryEntry | null>(null);
  const done = useRef(false);
  const score = runScore({ ...s, won });

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    sfx(won ? 'victory' : 'defeat');
    const before = { ...profile.value };

    const syn = computeSynergies([...new Set(s.team.map((c) => c.mob))].map((m) => mobDef(m).families));
    const synergies = (Object.keys(syn.active) as Family[])
      .filter((f) => syn.active[f] >= 0)
      .map((f) => ({
        family: f,
        name: FAMILIES[f]?.name ?? f,
        tier: syn.active[f] + 1,
        count: syn.counts[f] || 0,
      }));

    const historyEntry: HistoryEntry = {
      date: Date.now(),
      commander: s.commander,
      omen: s.omen,
      won,
      act: s.act,
      score,
      team: s.team.map((c) => ({ mob: c.mob, star: c.star })),
      seed: s.seed,
      relics: [...s.relics],
      synergies,
      killedBy: won
        ? undefined
        : (s.stats.lastDefeat ?? (s.abandoned ? { encId: 'abandoned', encName: '放弃爬塔', kind: 'abandon', act: s.act } : undefined)),
      battles: s.stats.battleLogs ? [...s.stats.battleLogs] : [],
      runStats: {
        damage: s.stats.damage,
        battlesWon: s.stats.battlesWon,
        battlesLost: s.stats.battlesLost,
        elitesWon: s.stats.elitesWon,
        bossesWon: s.stats.bossesWon,
        emeraldsEarned: s.stats.emeraldsEarned,
        itemsUsed: s.stats.itemsUsed ?? 0,
        potionsUsed: s.stats.potionsUsed ?? 0,
        duration: Math.round((Date.now() - s.stats.startTime) / 1000),
      },
      tactics: s.tacticsState?.tactics ? [...s.tacticsState.tactics] : [],
      variants: s.tacticsState?.variants ? { ...s.tacticsState.variants } : {},
    };
    setRecord(historyEntry);
    // ── 自动推送本局遥测数据给服务器 (后台静默自动上报，无需手动操作) ──
    void reportRunTelemetry(historyEntry);

    updateProfile((p) => {
      p.runs++;
      if (won) p.wins++;
      p.bestScore = Math.max(p.bestScore, score);
      p.totalEmeralds += s.stats.emeraldsEarned;
      if (won && s.omen >= p.maxOmen && p.maxOmen < 5) p.maxOmen = s.omen + 1;
      // Per-commander record: the highest omen cleared earns that commander a frame.
      if (won && s.omen > (p.bestOmen[s.commander] ?? -1)) p.bestOmen = { ...p.bestOmen, [s.commander]: s.omen };
      if (s.daily) {
        const rec = p.daily?.[s.daily] ?? { tries: 1, best: -1 };
        p.daily = { ...(p.daily ?? {}), [s.daily]: { ...rec, best: Math.max(rec.best, score) } };
      }
      p.tacticsSeen = p.tacticsSeen ?? [];
      p.variantsSeen = p.variantsSeen ?? [];
      for (const t of s.tacticsState?.tactics ?? []) {
        if (!p.tacticsSeen.includes(t)) p.tacticsSeen.push(t);
      }
      for (const v of Object.values(s.tacticsState?.variants ?? {})) {
        if (v && !p.variantsSeen.includes(v)) p.variantsSeen.push(v);
      }
      p.history = [
        historyEntry,
        ...p.history,
      ].slice(0, 50);
    });
    const after = profile.value;
    // Achievements only the end of a run can tell (the rest come with every run action).
    const ids: string[] = [];
    if (won) for (let k = 1; k <= s.omen; k++) ids.push(`omen${k}`);
    if (COMMANDERS.every((c) => (after.bestOmen[c.id] ?? -1) >= 5)) ids.push('omen5_all');
    if (!won) ids.push('first_death');
    if (s.abandoned) ids.push('abandon');
    if (new Date().getHours() < 5) ids.push('night_owl');
    if (s.daily) ids.push('daily_1');
    if (won && s.stats.bossesWon >= 4) ids.push('beat_sift');
    finishRun(s, won);
    commit();
    progress(s, ids);
    const u = [...(s.unlocked ?? [])];
    const fresh: string[] = [];
    if (after.maxOmen > before.maxOmen) fresh.push(`解锁难度：不祥之兆 ${ROMAN_OMEN[after.maxOmen]}`);
    const was = before.bestOmen?.[s.commander];
    const now = after.bestOmen[s.commander];
    if (now !== undefined && now !== was && now > 0) {
      const name = COMMANDER_MAP[s.commander].name;
      fresh.push(`新纪录：${name}通关不祥之兆 ${ROMAN_OMEN[now]}`);
      const t = omenTier(now);
      if (t && t !== omenTier(was)) fresh.push(`解锁${name}的${OMEN_TIER_NAME[t]}色统领边框`);
    }
    setUnlocks([...u, ...fresh]);
    for (const x of fresh) pushToast(x, 'gold');
  }, []);

  const mvpMob = Object.entries(s.stats.mvp).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mins = Math.round((Date.now() - s.stats.startTime) / 60000);
  const cmd = COMMANDER_MAP[s.commander];
  const floorReached = (s.act - 1) * 14 + (s.nodeId ? s.map.nodes[s.nodeId].row + 1 : 0);
  const sift = won && s.stats.bossesWon >= 4;

  const inActFloor = ((floorReached - 1) % 14) + 1;
  const ACT_NUMS = ['', '一', '二', '三', '四', '五', '六', '七'];
  const ACT_NAMES = ['', '主世界', '下界', '末地', '筛界', '遗迹远征', '圣殿远征', '破碎堡垒'];

  return (
    <div class={`screen end-screen ${won ? 'won' : 'lost'}`} style={{ backgroundImage: `url(${url.bg(won ? 'arena_end' : 'title')})` }}>
      <div class="end-shade" />
      <div class="end-inner">
        <div class="end-title title-shadow">{!won ? '你死了！' : s.act >= 7 ? '终焉征服者！' : sift ? '筛界征服者！' : '屠龙者！'}</div>
        {s.daily && <div class="end-daily">每日挑战 · {s.daily}</div>}
        <div class="end-sub">
          {!won
            ? `倒在了第${ACT_NUMS[s.act] ?? s.act}幕 · ${ACT_NAMES[s.act] ?? ''} · 第 ${inActFloor} 层（累计第 ${floorReached} 层）。`
            : sift
              ? '幽匿巨像倒下了。你的怪物军团征服了全部四个维度。'
              : s.act === 4
                ? `末影龙已被你击败；你在筛界走到了第 ${inActFloor} 层。`
                : s.act >= 5
                  ? `末影龙已被你击败；你在第${ACT_NUMS[s.act] ?? s.act}幕 · ${ACT_NAMES[s.act] ?? ''}走到了第 ${inActFloor} 层。`
                  : '末影龙倒下了。你的怪物军团征服了三个维度。'}
        </div>
        <div class="end-grid">
          <div class="panel end-stats">
            <div class="panel-title">本局统计</div>
            <div class="es-row"><span>统领</span><span style={{ color: cmd.color }}>{cmd.name} · {cmd.title}</span></div>
            <div class="es-row"><span>难度</span><span>{s.omen ? `不祥之兆 ${ROMAN_OMEN[s.omen]}（得分 ×${(1 + 0.2 * s.omen).toFixed(1)}）` : '普通'}</span></div>
            <div class="es-row"><span>战斗胜/负</span><span>{s.stats.battlesWon} / {s.stats.battlesLost}</span></div>
            <div class="es-row"><span>精英 / 首领</span><span>{s.stats.elitesWon} / {s.stats.bossesWon}</span></div>
            <div class="es-row"><span>开箱次数</span><span>{s.stats.crates}</span></div>
            <div class="es-row">
              <span>出货</span>
              <span class="row gap8">
                {RARITIES.map((r) => (
                  <span key={r} style={{ color: RARITY_INFO[r].color }}>{s.stats.pulls[r]}</span>
                ))}
              </span>
            </div>
            <div class="es-row"><span>升星次数</span><span>{s.stats.starUps}</span></div>
            <div class="es-row"><span>累计伤害</span><span>{Math.round(s.stats.damage).toLocaleString()}</span></div>
            <div class="es-row"><span>获得绿宝石</span><span class="em">{s.stats.emeraldsEarned}</span></div>
            <div class="es-row"><span>用时</span><span>{mins} 分钟</span></div>
            <div class="divider" />
            <div class="es-row big"><span>得分</span><span class="gold-t">{score}</span></div>
          </div>
          <div class="panel end-team">
            <div class="panel-title">最终阵容</div>
            <div class="end-cards">
              {s.team.map((c) => <MobCard key={c.uid} mob={c.mob} card={c} size="sm" />)}
            </div>
            {mvpMob && (
              <div class="end-mvp">
                <img src={url.mob(mvpMob)} />
                <div>
                  <div class="gold-t">本局 MVP</div>
                  <div style={{ fontSize: 22 }}>{mobDef(mvpMob).name}</div>
                  <div class="faint">累计造成 {Math.round(s.stats.mvp[mvpMob]).toLocaleString()} 伤害</div>
                </div>
              </div>
            )}
            {unlocks.length > 0 && (
              <div class="end-unlocks">
                {unlocks.map((u) => <div key={u} class="gold-t">✦ {u}</div>)}
              </div>
            )}
            {isHostConnected.value && <SubmitPanel s={s} won={won} />}
          </div>
        </div>
        <div class="row gap16 center">
          {record && (
            <Btn
              onClick={() => {
                try {
                  navigator.clipboard.writeText(JSON.stringify(record, null, 2));
                  pushToast('本局对战数据已复制到剪贴板！', 'gold');
                } catch {
                  pushToast('复制失败，请在图鉴记录中查看', 'bad');
                }
              }}
            >
              📋 复制本局战报
            </Btn>
          )}
          <Btn size="big" onClick={() => (setRun(null), go('title'))}>返回主菜单</Btn>
          <Btn variant="green" size="big" onClick={() => (setRun(null), go('newrun'))}>再来一局</Btn>
        </div>
      </div>
    </div>
  );
}
