// BlockSpire 玩家对战数据模型复盘与难度调整分析引擎 (Difficulty Telemetry & Balance Analyzer)
// 运行命令: node --experimental-strip-types scripts/analyze-difficulty-telemetry.ts [--file=path/to/runs.json] [--demo]

import fs from 'node:fs';
import path from 'node:path';
import type { HistoryEntry } from '../src/meta/profile.ts';
import { ROMAN_OMEN } from '../src/meta/profile.ts';
import { mobDef } from '../src/data/mobs.ts';

// ─────────────────────────────────────────────────────────────────────────────
// 1. 数据加载与命令行参数解析
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let filePath: string | null = null;
let rawJson: string | null = null;
let serverUrl: string | null = null;
let isDemo = false;

for (const arg of args) {
  if (arg.startsWith('--file=')) filePath = arg.slice(7);
  else if (arg.startsWith('--json=')) rawJson = arg.slice(7);
  else if (arg.startsWith('--server=')) serverUrl = arg.slice(9);
  else if (arg === '--demo' || arg === '--mock') isDemo = true;
}

let runs: HistoryEntry[] = [];

if (serverUrl) {
  try {
    const target = serverUrl.replace(/\/$/, '') + '/api/telemetry?limit=500';
    console.log(`[Info] 正在从远程服务器拉取对战遥测数据: ${target}...`);
    const res = await fetch(target);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { ok: boolean; runs?: HistoryEntry[] };
    runs = data.runs ?? [];
    console.log(`[Info] 成功拉取到 ${runs.length} 局对战数据！\n`);
  } catch (err) {
    console.error(`[Error] 无法从服务器获取数据: ${(err as Error).message}`);
    process.exit(1);
  }
} else if (filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) {
    console.error(`[Error] 文件不存在: ${abs}`);
    process.exit(1);
  }
  const content = fs.readFileSync(abs, 'utf-8');
  runs = JSON.parse(content);
} else if (rawJson) {
  runs = JSON.parse(rawJson);
} else {
  // 默认检查根目录下是否有自动沉淀的 runs-telemetry.json，若无则运行生成实测沙盒演示数据
  const defaultExportPath = path.resolve(process.cwd(), 'runs-telemetry.json');
  if (fs.existsSync(defaultExportPath)) {
    console.log(`[Info] 检测到本地服务器沉淀战报: ${defaultExportPath}，自动加载分析...\n`);
    runs = JSON.parse(fs.readFileSync(defaultExportPath, 'utf-8'));
  } else {
    isDemo = true;
  }
}

if (!Array.isArray(runs)) {
  runs = [runs];
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 仿真样本生成器 (用于首次运行即刻进行数据模型演示)
// ─────────────────────────────────────────────────────────────────────────────

if (isDemo || runs.length === 0) {
  console.log('========================================================================');
  console.log('  [DEMO 模式] 未检测到外部输入战报，自动合成 120 场典型玩家爬塔对局数据');
  console.log('  基于真实首领机制 (凋灵、远古守护者、末影龙、唤魔者) 与 Omen 0~5 阶梯演练');
  console.log('========================================================================\n');

  const DEMO_ENCOUNTERS = [
    { encId: 'a1b_witch', name: '沼泽女巫集会', kind: 'boss' as const, act: 1, baseLethality: 0.08 },
    { encId: 'a2e_ravager', name: '灾厄掠夺兽冲阵', kind: 'elite' as const, act: 2, baseLethality: 0.18 },
    { encId: 'a2b_evoker', name: '唤魔者 · 尖牙炼狱', kind: 'boss' as const, act: 2, baseLethality: 0.28 },
    { encId: 'a3e_shulker', name: '潜影贝浮空哨所', kind: 'elite' as const, act: 3, baseLethality: 0.15 },
    { encId: 'a3b_dragon', name: '末影龙 · 终末之巢', kind: 'boss' as const, act: 3, baseLethality: 0.35 },
    { encId: 'a4b_wither', name: '凋灵 · 毁灭之主', kind: 'boss' as const, act: 4, baseLethality: 0.48 },
    { encId: 'a5b_elder_guardian', name: '远古守护者 · 深海神殿', kind: 'boss' as const, act: 5, baseLethality: 0.52 },
    { encId: 'a6b_warden', name: '监守者 · 幽匿死寂', kind: 'boss' as const, act: 6, baseLethality: 0.62 },
    { encId: 'a7b_jean_awakened', name: '末影龙 · 终末余响 (Awakened)', kind: 'boss' as const, act: 7, baseLethality: 0.70 },
  ];

  const FAMILIES_POOL = ['illager', 'undead', 'nether', 'ender', 'aquatic', 'golem', 'beast', 'villager'];
  const COMMANDERS_POOL = ['steve', 'alex', 'witch', 'villager'];

  for (let i = 0; i < 120; i++) {
    const omen = Math.min(5, Math.floor(i / 20)); // Omen 0~5 均匀分布
    const commander = COMMANDERS_POOL[i % COMMANDERS_POOL.length];
    
    // 胜率模型：Omen 0(75%) -> Omen 1(62%) -> Omen 2(50%) -> Omen 3(18% 断崖) -> Omen 4(12%) -> Omen 5(6%)
    const omenPenalty = omen === 0 ? 0 : omen === 1 ? 0.12 : omen === 2 ? 0.24 : omen === 3 ? 0.58 : omen === 4 ? 0.65 : 0.72;
    const baseWinRoll = Math.random();
    const won = baseWinRoll > (0.25 + omenPenalty);

    let failAct = 1;
    let fatalEnc = DEMO_ENCOUNTERS[0];
    let bossHpLeft: number | undefined;
    let failTime = 22;

    if (!won) {
      // 决定在第几幕阵亡
      const actRoll = Math.random();
      if (omen >= 3 && actRoll < 0.4) {
        failAct = 2; // 早期被唤魔者或掠夺兽截胡
        fatalEnc = Math.random() < 0.6 ? DEMO_ENCOUNTERS[2] : DEMO_ENCOUNTERS[1];
        failTime = 8.5 + Math.random() * 6; // 猝死
      } else if (actRoll < 0.7) {
        failAct = 4;
        fatalEnc = DEMO_ENCOUNTERS[5]; // 凋灵
        bossHpLeft = Math.floor(10 + Math.random() * 35);
        failTime = 28 + Math.random() * 12;
      } else {
        failAct = Math.min(6, 3 + Math.floor(Math.random() * 4));
        fatalEnc = DEMO_ENCOUNTERS.find((e) => e.act === failAct) || DEMO_ENCOUNTERS[4];
        bossHpLeft = Math.floor(15 + Math.random() * 45);
        failTime = 24 + Math.random() * 15;
      }
    } else {
      failAct = 7;
    }

    const primaryFam = FAMILIES_POOL[i % FAMILIES_POOL.length];
    const secondaryFam = FAMILIES_POOL[(i + 3) % FAMILIES_POOL.length];

    runs.push({
      date: Date.now() - (120 - i) * 1800000,
      commander,
      omen,
      won,
      act: failAct,
      score: won ? 4200 + omen * 800 + Math.floor(Math.random() * 500) : failAct * 600 + Math.floor(Math.random() * 300),
      seed: 100000 + i * 777,
      team: [
        { mob: 'polar_bear', star: failAct >= 3 ? 3 : 2 },
        { mob: 'pillager', star: failAct >= 4 ? 4 : 2 },
        { mob: 'witch', star: failAct >= 2 ? 2 : 1 },
      ],
      relics: ['shield', 'iron_sword', failAct >= 3 ? 'totem' : 'compass'],
      synergies: [
        { family: primaryFam, name: primaryFam, tier: failAct >= 4 ? 2 : 1, count: failAct >= 4 ? 4 : 2 },
        { family: secondaryFam, name: secondaryFam, tier: 1, count: 2 },
      ],
      killedBy: won
        ? undefined
        : {
            encId: fatalEnc.encId,
            encName: fatalEnc.name,
            kind: fatalEnc.kind,
            act: failAct,
            bossHp: bossHpLeft,
            time: Math.round(failTime * 10) / 10,
          },
      runStats: {
        damage: (failAct * 18000) + Math.floor(Math.random() * 5000),
        battlesWon: failAct * 3,
        battlesLost: won ? 0 : 1,
        elitesWon: Math.max(0, failAct - 1),
        bossesWon: won ? failAct : Math.max(0, failAct - 1),
        emeraldsEarned: failAct * 85,
        itemsUsed: failAct * 2,
        potionsUsed: failAct,
        duration: failAct * 210,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 数据模型深度计算与诊断
// ─────────────────────────────────────────────────────────────────────────────

console.log(`========================================================================`);
console.log(`=== BlockSpire 对战数据模型与难度平衡分析报告 (共 ${runs.length} 局遥测) ===`);
console.log(`========================================================================\n`);

// 1. 难度梯度阶梯分析 (Difficulty Ladder & Cliff Detection)
console.log('────────────────────────────────────────────────────────────────────────');
console.log('一、 难度梯度阶梯与通关率 (Difficulty Progression & Cliff Analysis)');
console.log('────────────────────────────────────────────────────────────────────────');

interface OmenMetric {
  omen: number;
  total: number;
  wins: number;
  winRate: number;
  avgAct: number;
  avgScore: number;
}

const omenMetrics: OmenMetric[] = [0, 1, 2, 3, 4, 5].map((omen) => {
  const subset = runs.filter((r) => r.omen === omen);
  const total = subset.length;
  const wins = subset.filter((r) => r.won).length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const avgAct = total > 0 ? Math.round((subset.reduce((acc, cur) => acc + cur.act, 0) / total) * 10) / 10 : 0;
  const avgScore = total > 0 ? Math.round(subset.reduce((acc, cur) => acc + cur.score, 0) / total) : 0;
  return { omen, total, wins, winRate, avgAct, avgScore };
});

console.log('| 难度等级 | 局数 | 胜场 | 胜率 (%) | 平均存活深度 | 平均得分 | 状态诊断 |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

for (let i = 0; i < omenMetrics.length; i++) {
  const m = omenMetrics[i];
  let status = '健康';
  if (m.total === 0) status = '暂无样本';
  else if (i > 0 && omenMetrics[i - 1].total > 0) {
    const drop = omenMetrics[i - 1].winRate - m.winRate;
    if (drop >= 30) {
      status = `🚨 严重断崖 (跌幅 -${drop}%)`;
    } else if (drop >= 20) {
      status = `⚠️ 陡峭爬升 (跌幅 -${drop}%)`;
    } else if (m.winRate < 10) {
      status = '⚡ 极限死斗 (<10%)';
    }
  }

  const roman = m.omen === 0 ? '普通难度' : `不祥 ${ROMAN_OMEN[m.omen] || m.omen}`;
  const bar = '█'.repeat(Math.round(m.winRate / 5)) + '░'.repeat(20 - Math.round(m.winRate / 5));
  console.log(
    `| ${roman.padEnd(8)} | ${String(m.total).padStart(4)} | ${String(m.wins).padStart(4)} | ${String(m.winRate + '%').padStart(6)} [${bar}] | 第 ${m.avgAct} 幕 | ${String(m.avgScore).padStart(5)} | ${status} |`
  );
}

// 2. 头号致命团灭杀手 (Deadliest Run Killers)
console.log('\n────────────────────────────────────────────────────────────────────────');
console.log('二、 头号致命团灭杀手排行榜 (Top Run Killers & Lethality Audit)');
console.log('────────────────────────────────────────────────────────────────────────');

interface KillerStat {
  encId: string;
  name: string;
  kind: string;
  deaths: number;
  times: number[];
  bossHpLefts: number[];
}

const killers: Record<string, KillerStat> = {};

for (const r of runs) {
  if (!r.won && r.killedBy) {
    const k = r.killedBy;
    const key = k.encId || k.encName;
    if (!killers[key]) {
      killers[key] = {
        encId: k.encId,
        name: k.encName || k.encId,
        kind: k.kind,
        deaths: 0,
        times: [],
        bossHpLefts: [],
      };
    }
    killers[key].deaths++;
    if (k.time !== undefined) killers[key].times.push(k.time);
    if (k.bossHp !== undefined) killers[key].bossHpLefts.push(k.bossHp);
  }
}

const killerList = Object.values(killers).sort((a, b) => b.deaths - a.deaths);

console.log('| 遭遇名称 | 类型 | 团灭人次 | 占总死因% | 平均战斗用时 | 残血中位数 | 危险特征判定 |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- | :--- |');

const totalDeaths = runs.filter((r) => !r.won).length;

for (const k of killerList.slice(0, 8)) {
  const share = totalDeaths > 0 ? Math.round((k.deaths / totalDeaths) * 100) : 0;
  const avgTime = k.times.length > 0 ? Math.round((k.times.reduce((a, b) => a + b, 0) / k.times.length) * 10) / 10 : 0;
  const avgHp = k.bossHpLefts.length > 0 ? Math.round(k.bossHpLefts.reduce((a, b) => a + b, 0) / k.bossHpLefts.length) : 0;

  let trait = '均衡考核';
  if (avgTime < 10 && avgTime > 0) {
    trait = '⚡ 爆发秒杀/初见杀';
  } else if (avgHp < 20 && avgHp > 0) {
    trait = '🎯 濒死惜败 (狂暴冲刺)';
  } else if (avgHp > 60) {
    trait = '🧱 数值高墙 (打不动)';
  } else if (avgTime > 35) {
    trait = '⏳ 软狂暴超时拖死';
  }

  console.log(
    `| ${k.name.padEnd(16)} | ${k.kind.padEnd(5)} | ${String(k.deaths).padStart(6)} | ${String(share + '%').padStart(7)} | ${String(avgTime + 's').padStart(10)} | ${String(avgHp ? avgHp + '%' : '—').padStart(8)} | ${trait} |`
  );
}

// 3. 家族羁绊构筑平衡分析 (Synergy Meta Balance)
console.log('\n────────────────────────────────────────────────────────────────────────');
console.log('三、 家族羁绊构筑出场率与胜率 (Synergy Power & Win Rates)');
console.log('────────────────────────────────────────────────────────────────────────');

interface SynStat {
  family: string;
  name: string;
  picks: number;
  wins: number;
}

const synMap: Record<string, SynStat> = {};

for (const r of runs) {
  if (r.synergies) {
    for (const s of r.synergies) {
      if (!synMap[s.family]) {
        synMap[s.family] = { family: s.family, name: s.name || s.family, picks: 0, wins: 0 };
      }
      synMap[s.family].picks++;
      if (r.won) synMap[s.family].wins++;
    }
  }
}

const synList = Object.values(synMap).sort((a, b) => b.picks - a.picks);

console.log('| 家族羁绊 | 出场次数 | 胜率 (%) | 偏离基准 | 构筑健康度评估 |');
console.log('| :--- | :--- | :--- | :--- | :--- |');

const globalWinRate = runs.length > 0 ? (runs.filter((r) => r.won).length / runs.length) * 100 : 0;

for (const s of synList) {
  const wr = s.picks > 0 ? Math.round((s.wins / s.picks) * 100) : 0;
  const delta = Math.round(wr - globalWinRate);
  const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;
  
  let evalLabel = '健康平衡';
  if (delta >= 18) evalLabel = '🔥 强力通关霸权 (考虑微调加成)';
  else if (delta <= -18) evalLabel = '❄️ 弱势陷阱羁绊 (急需数值补强)';

  console.log(
    `| ${s.name.padEnd(10)} | ${String(s.picks).padStart(6)} | ${String(wr + '%').padStart(6)} | ${deltaStr.padStart(6)} | ${evalLabel} |`
  );
}

// 4. 生物单卡出场率、胜率与 Carry 能力评估 (Card Performance Audit)
console.log('\n────────────────────────────────────────────────────────────────────────');
console.log('四、 生物单卡出场率、胜率与 Carry 能力 (Card Performance Audit)');
console.log('────────────────────────────────────────────────────────────────────────');

interface CardMetric {
  mob: string;
  name: string;
  picks: number;
  wins: number;
  totalStars: number;
  mvpCount: number;
}

const cardMap: Record<string, CardMetric> = {};

for (const r of runs) {
  const mvpMobs = new Set<string>();
  if (r.battles) {
    for (const b of r.battles) {
      if (b.mvp?.mob) mvpMobs.add(b.mvp.mob);
    }
  }

  for (const c of r.team) {
    if (!cardMap[c.mob]) {
      cardMap[c.mob] = {
        mob: c.mob,
        name: mobDef(c.mob)?.name || c.mob,
        picks: 0,
        wins: 0,
        totalStars: 0,
        mvpCount: 0,
      };
    }
    cardMap[c.mob].picks++;
    if (r.won) cardMap[c.mob].wins++;
    cardMap[c.mob].totalStars += c.star;
    if (mvpMobs.has(c.mob)) cardMap[c.mob].mvpCount++;
  }
}

const cardList = Object.values(cardMap).sort((a, b) => b.picks - a.picks);

console.log('| 生物卡牌 | 出场局数 | 胜率 (%) | 平均星级 | MVP场次 | 平衡评估与定位 |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');

for (const c of cardList.slice(0, 10)) {
  const wr = c.picks > 0 ? Math.round((c.wins / c.picks) * 100) : 0;
  const avgStar = c.picks > 0 ? (c.totalStars / c.picks).toFixed(1) : '1.0';
  const delta = Math.round(wr - globalWinRate);

  let tag = '常规主力';
  if (c.picks >= 10 && delta >= 15) tag = '🔥 核心人权卡 (Carry)';
  else if (c.picks >= 10 && delta <= -15) tag = '⚠️ 下水道陷阱卡 (需加强)';
  else if (c.picks < 10 && wr >= 60) tag = '💎 冷门特解卡';

  console.log(
    `| ${c.name.padEnd(10)} | ${String(c.picks).padStart(6)} | ${String(wr + '%').padStart(6)} | ${avgStar.padStart(6)}★ | ${String(c.mvpCount).padStart(5)}次 | ${tag} |`
  );
}

// 5. 常见双羁绊组合联动胜率 (Synergy Combo Archetypes)
console.log('\n────────────────────────────────────────────────────────────────────────');
console.log('五、 主流双羁绊体系协同表现 (Dual-Synergy Archetypes)');
console.log('────────────────────────────────────────────────────────────────────────');

interface ComboStat {
  combo: string;
  picks: number;
  wins: number;
}

const comboMap: Record<string, ComboStat> = {};

for (const r of runs) {
  if (r.synergies && r.synergies.length >= 2) {
    const active = r.synergies.map((s) => s.name || s.family).sort();
    for (let i = 0; i < active.length; i++) {
      for (let j = i + 1; j < active.length; j++) {
        const pair = `${active[i]} + ${active[j]}`;
        if (!comboMap[pair]) comboMap[pair] = { combo: pair, picks: 0, wins: 0 };
        comboMap[pair].picks++;
        if (r.won) comboMap[pair].wins++;
      }
    }
  }
}

const comboList = Object.values(comboMap).sort((a, b) => b.picks - a.picks);

console.log('| 组合体系 | 出场构筑数 | 胜率 (%) | 偏离基准 | 体系状态判定 |');
console.log('| :--- | :--- | :--- | :--- | :--- |');

for (const cb of comboList.slice(0, 6)) {
  const wr = cb.picks > 0 ? Math.round((cb.wins / cb.picks) * 100) : 0;
  const delta = Math.round(wr - globalWinRate);
  const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;
  const tag = delta >= 15 ? '🔥 热门统治体系' : delta <= -15 ? '❄️ 协同不足 (弱势)' : '均衡';

  console.log(
    `| ${cb.combo.padEnd(16)} | ${String(cb.picks).padStart(8)} | ${String(wr + '%').padStart(6)} | ${deltaStr.padStart(6)} | ${tag} |`
  );
}

// 6. 战局战况与心流微观审计 (Combat Situation & Heart Loss Audit)
console.log('\n────────────────────────────────────────────────────────────────────────');
console.log('六、 战斗战况与心流微观审计 (Combat Situation & Heart Loss Audit)');
console.log('────────────────────────────────────────────────────────────────────────');

interface ActCombatStat {
  act: number;
  totalBattles: number;
  times: number[];
  heartsLost: number;
  suddenWipes: number;
  attritionFights: number;
}

const actMap: Record<number, ActCombatStat> = {};
for (let a = 1; a <= 7; a++) {
  actMap[a] = { act: a, totalBattles: 0, times: [], heartsLost: 0, suddenWipes: 0, attritionFights: 0 };
}

for (const r of runs) {
  if (r.battles) {
    for (const b of r.battles) {
      const st = actMap[b.act] || (actMap[b.act] = { act: b.act, totalBattles: 0, times: [], heartsLost: 0, suddenWipes: 0, attritionFights: 0 });
      st.totalBattles++;
      st.times.push(b.time);
      st.heartsLost += b.heartsLost;
      if (!b.win && b.time < 10) st.suddenWipes++;
      if (b.time > 35) st.attritionFights++;
    }
  }
}

console.log('| 幕次 | 遭遇战总数 | 平均战斗时长 | 战损心数总量 | 猝死秒杀率 (<10s) | 焦灼超时率 (>35s) |');
console.log('| :--- | :--- | :--- | :--- | :--- | :--- |');

for (let a = 1; a <= 7; a++) {
  const st = actMap[a];
  if (st.totalBattles === 0) continue;
  const avgT = st.times.length > 0 ? (st.times.reduce((x, y) => x + y, 0) / st.times.length).toFixed(1) + 's' : '—';
  const suddenRate = st.totalBattles > 0 ? Math.round((st.suddenWipes / st.totalBattles) * 100) + '%' : '0%';
  const attrRate = st.totalBattles > 0 ? Math.round((st.attritionFights / st.totalBattles) * 100) + '%' : '0%';

  console.log(
    `| 第 ${a} 幕 | ${String(st.totalBattles).padStart(8)} | ${avgT.padStart(10)} | ${String(st.heartsLost).padStart(10)} ❤️ | ${suddenRate.padStart(15)} | ${attrRate.padStart(15)} |`
  );
}

// 7. 自动生成难度微调建议 (Actionable Rebalancing Prescriptions)
console.log('\n────────────────────────────────────────────────────────────────────────');
console.log('七、 自动化难度调优建议处方 (Actionable Rebalancing Prescriptions)');
console.log('────────────────────────────────────────────────────────────────────────\n');

const prescriptions: string[] = [];

// 检查断崖
for (let i = 1; i < omenMetrics.length; i++) {
  const prev = omenMetrics[i - 1];
  const cur = omenMetrics[i];
  if (prev.total > 0 && cur.total > 0 && prev.winRate - cur.winRate >= 30) {
    prescriptions.push(
      `[难度梯度调整] Omen ${prev.omen} -> Omen ${cur.omen} 胜率骤降 ${prev.winRate - cur.winRate}% (从 ${prev.winRate}% 跌至 ${cur.winRate}%)。\n` +
      `  • 诊断: 难度跃迁幅度过激，易导致玩家产生挫败感弃坑。\n` +
      `  • 调整建议: 检查 \`src/data/difficulty.ts\` 中 Omen ${cur.omen} 的首领伤害倍率 (+40% -> +25%) 或放宽开局战备补给。`
    );
  }
}

// 检查超模初见杀怪物
for (const k of killerList.slice(0, 3)) {
  const avgTime = k.times.length > 0 ? k.times.reduce((a, b) => a + b, 0) / k.times.length : 0;
  if (avgTime < 10 && avgTime > 0) {
    prescriptions.push(
      `[怪物秒杀削弱] 【${k.name}】导致了大量猝死，平均团灭战斗耗时仅 ${avgTime.toFixed(1)} 秒！\n` +
      `  • 诊断: 敌方开场高爆发技能造成无前摇减员，缺乏博弈对抗窗口。\n` +
      `  • 调整建议: 增加怪物核心技能吟唱前摇 0.4 秒，或降低首轮爆发伤害 15%。`
    );
  }
}

// 检查高血量死墙怪物
for (const k of killerList.slice(0, 3)) {
  const avgHp = k.bossHpLefts.length > 0 ? k.bossHpLefts.reduce((a, b) => a + b, 0) / k.bossHpLefts.length : 0;
  if (avgHp > 55) {
    prescriptions.push(
      `[首领护甲穿透优化] 【${k.name}】阵亡时首领平均残血高达 ${avgHp.toFixed(0)}%！\n` +
      `  • 诊断: 玩家阵容在进入此幕时输出完全无法穿透首领防御护甲与霸体韧性条。\n` +
      `  • 调整建议: 将 \`src/data/encounters.ts\` 中该 Boss 的 hpMul 调降 10~15%，或提高破势（Poise Break）后的易伤收益。`
    );
  }
}

// 检查弱势卡牌与羁绊
for (const c of cardList.slice(0, 10)) {
  const wr = c.picks > 0 ? (c.wins / c.picks) * 100 : 0;
  if (c.picks >= 10 && wr - globalWinRate <= -18) {
    prescriptions.push(
      `[弱势单卡补强] 【${c.name}】出场胜率仅为 ${wr.toFixed(0)}% (显著低于大盘 ${(globalWinRate - wr).toFixed(0)}%)。\n` +
      `  • 诊断: 属性成长或技能收益跟不上游戏节奏。\n` +
      `  • 调整建议: 在 \`src/data/mobs.ts\` 中提高该生物的基础生命或攻击力 10~20%。`
    );
  }
}

if (prescriptions.length === 0) {
  console.log('✓ 数据模型检测正常，各难度阶梯胜率平滑，首领战损在健康心流区间内！\n');
} else {
  prescriptions.forEach((p, idx) => {
    console.log(`${idx + 1}. ${p}\n`);
  });
}

console.log('────────────────────────────────────────────────────────────────────────');
console.log('八、 调优参数文件定位速查 (Where & How to Adjust Balance)');
console.log('────────────────────────────────────────────────────────────────────────');
console.log('1. 单卡属性/攻速/生命/技能:  -> src/data/mobs.ts (mobDef / starStatMul)');
console.log('2. 羁绊激活阈值与属性加成:  -> src/data/families.ts (FAMILIES tiers & buffs)');
console.log('3. 怪物数值/攻击倍率/阵容:    -> src/data/encounters.ts (ENC_MAP hpMul/atkMul)');
console.log('4. 首领技能AI/前摇/转阶段血量: -> src/battle/ai-dungeons.ts & ai-post-sift.ts');
console.log('5. 不祥之兆词缀与全局规则:    -> src/data/difficulty.ts (DIFFICULTY_POLICIES)');
console.log('6. 开箱概率与卡池动态星级:    -> src/run/run.ts (crateOffers / rollCrate)\n');

console.log('========================================================================');
console.log('提示: 可通过导出游戏内 Codex 记录的 JSON，执行:');
console.log('node --experimental-strip-types scripts/analyze-difficulty-telemetry.ts --file=my-runs.json');
console.log('或直接连通服务器: node --experimental-strip-types scripts/analyze-difficulty-telemetry.ts --server=http://localhost:5199');
console.log('进行真实玩家数据的秒级平衡诊断与调优推演。');
console.log('========================================================================\n');
