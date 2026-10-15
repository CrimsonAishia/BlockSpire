import { useEffect, useRef, useState } from 'preact/hooks';
import type { RunState } from '../../run/run.ts';
import { finishRun, runScore } from '../../run/run.ts';
import { COMMANDERS, COMMANDER_MAP } from '../../data/items.ts';
import { mobDef } from '../../data/mobs.ts';
import { RARITY_INFO } from '../../data/mobs.ts';
import { RARITIES } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, MobCard } from '../components/common.tsx';
import { commit, go, profile, setRun, updateProfile, pushToast } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { OMEN_TIER_NAME, ROMAN_OMEN, omenTier } from '../../meta/profile.ts';

export function RunEnd({ s, won }: { s: RunState; won: boolean }) {
  const [unlocks, setUnlocks] = useState<string[]>([]);
  const done = useRef(false);
  const score = runScore({ ...s, won });

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    sfx(won ? 'victory' : 'defeat');
    const before = { ...profile.value, flags: { ...profile.value.flags } };
    const got: string[] = [];
    updateProfile((p) => {
      p.runs++;
      if (won) p.wins++;
      p.bestScore = Math.max(p.bestScore, score);
      p.totalEmeralds += s.stats.emeraldsEarned;
      p.flags = { ...p.flags };
      p.achievements = { ...p.achievements };
      if (s.stats.bossesWon >= 1) p.flags.beat_act1 = true;
      if (p.totalEmeralds >= 1500) p.flags.emeralds_1500 = true;
      if (won) p.flags.win_1 = true;
      const ach = (id: string) => {
        if (!p.achievements[id]) {
          p.achievements[id] = Date.now();
          got.push(id);
        }
      };
      if (s.stats.bossesWon >= 1) ach(s.bosses[0] === 'a1b_raid' ? 'beat_raid' : 'beat_monument');
      if (s.stats.bossesWon >= 2) ach('beat_wither');
      if (won) ach('win_1');
      if (won && s.stats.bossesWon >= 4) ach('beat_sift');
      if (won) for (let k = 1; k <= s.omen; k++) ach(`omen${k}`);
      if (won && s.omen >= p.maxOmen && p.maxOmen < 5) p.maxOmen = s.omen + 1;
      // Per-commander record: the highest omen cleared earns that commander a frame.
      if (won && s.omen > (p.bestOmen[s.commander] ?? -1)) p.bestOmen = { ...p.bestOmen, [s.commander]: s.omen };
      if (COMMANDERS.every((c) => (p.bestOmen[c.id] ?? -1) >= 5)) ach('omen5_all');
      p.history = [
        { date: Date.now(), commander: s.commander, omen: s.omen, won, act: s.act, score, team: s.team.map((c) => ({ mob: c.mob, star: c.star })) },
        ...p.history,
      ].slice(0, 30);
    });
    const after = profile.value;
    const u: string[] = [];
    for (const c of COMMANDERS) if (c.unlock && !before.flags[c.unlock.key] && after.flags[c.unlock.key]) u.push(`解锁统领：${c.name} · ${c.title}`);
    if (after.maxOmen > before.maxOmen) u.push(`解锁难度：不祥之兆 ${ROMAN_OMEN[after.maxOmen]}`);
    const was = before.bestOmen?.[s.commander];
    const now = after.bestOmen[s.commander];
    if (now !== undefined && now !== was && now > 0) {
      const name = COMMANDER_MAP[s.commander].name;
      u.push(`新纪录：${name}通关不祥之兆 ${ROMAN_OMEN[now]}`);
      const t = omenTier(now);
      if (t && t !== omenTier(was)) u.push(`解锁${name}的${OMEN_TIER_NAME[t]}色统领边框`);
    }
    setUnlocks(u);
    for (const x of u) pushToast(x, 'gold');
    finishRun(s, won);
    commit();
  }, []);

  const mvpMob = Object.entries(s.stats.mvp).sort((a, b) => b[1] - a[1])[0]?.[0];
  const mins = Math.round((Date.now() - s.stats.startTime) / 60000);
  const cmd = COMMANDER_MAP[s.commander];
  const floorReached = (s.act - 1) * 14 + (s.nodeId ? s.map.nodes[s.nodeId].row + 1 : 0);
  const sift = won && s.stats.bossesWon >= 4;

  return (
    <div class={`screen end-screen ${won ? 'won' : 'lost'}`} style={{ backgroundImage: `url(${url.bg(won ? 'arena_end' : 'title')})` }}>
      <div class="end-shade" />
      <div class="end-inner">
        <div class="end-title title-shadow">{!won ? '你死了！' : sift ? '筛界征服者！' : '屠龙者！'}</div>
        <div class="end-sub">
          {!won
            ? `倒在了第${['', '一', '二', '三', '四'][s.act]}幕 · 第 ${floorReached} 层。`
            : sift
              ? '幽匿巨像倒下了。你的怪物军团征服了全部四个维度。'
              : s.act >= 4
                ? `末影龙已被你击败；你在筛界走到了第 ${floorReached - 42} 层。`
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
          </div>
        </div>
        <div class="row gap16 center">
          <Btn size="big" onClick={() => (setRun(null), go('title'))}>返回主菜单</Btn>
          <Btn variant="green" size="big" onClick={() => (setRun(null), go('newrun'))}>再来一局</Btn>
        </div>
      </div>
    </div>
  );
}
