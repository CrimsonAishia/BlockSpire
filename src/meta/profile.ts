// Persistent meta-progression: unlocks, codex discovery, achievements, settings.
import { recoverPendingInteractions, type RunState } from '../run/run.ts';
import type { Rules, Teams } from '../classic/match.ts';
import { PLAYABLE_MOBS } from '../data/mobs.ts';
import { computeSynergies } from '../data/families.ts';
import { mobDef } from '../data/mobs.ts';

export interface BattleRecord {
  act: number;
  row: number;
  kind: 'battle' | 'elite' | 'boss' | 'event';
  encId: string;
  encName: string;
  win: boolean;
  time: number;
  heartsLost: number;
  bossHp?: number;
  playerLost?: number;
  playerLeft?: number;
  mvp?: { mob: string; dmg: number };
  itemsUsed?: string[];
}

export interface DefeatCause {
  encId: string;
  encName: string;
  kind: string;
  act: number;
  bossHp?: number;
  time?: number;
}

export interface SynergyRecord {
  family: string;
  name?: string;
  tier: number;
  count: number;
}

export interface RunTelemetryStats {
  damage: number;
  battlesWon: number;
  battlesLost: number;
  elitesWon: number;
  bossesWon: number;
  emeraldsEarned: number;
  itemsUsed: number;
  potionsUsed: number;
  duration: number; // in seconds
}

export interface HistoryEntry {
  date: number;
  commander: string;
  omen: number;
  won: boolean;
  act: number;
  score: number;
  team: { mob: string; star: number }[];
  /** Detailed telemetry for difficulty review & data modeling */
  seed?: number;
  relics?: string[];
  synergies?: SynergyRecord[];
  killedBy?: DefeatCause;
  battles?: BattleRecord[];
  runStats?: RunTelemetryStats;
  tactics?: string[];
  variants?: Record<string, string>;
}

export interface Profile {
  v: 1;
  discovered: string[];
  relicsSeen: string[];
  tacticsSeen: string[];
  variantsSeen: string[];
  runs: number;
  wins: number;
  bestScore: number;
  maxOmen: number;
  /** Last difficulty chosen on the new-run screen. */
  lastOmen?: number;
  /** Highest omen level cleared with each commander (absent = never cleared). */
  bestOmen: Record<string, number>;
  totalEmeralds: number;
  flags: Record<string, boolean>;
  achievements: Record<string, number>;
  /** 竞技场 (classic): series watched, predictions (one per series), correct calls on the underdog, two-player series. */
  classic: { played: number; guesses: number; correct: number; streak: number; best: number; upsets?: number; duels?: number };
  history: HistoryEntry[];
  /** 2 once old unlock flags were carried over to the commander chain. */
  unlockV?: number;
  /** Leaderboard identity: random id (kept private) and the public nickname. */
  playerId?: string;
  nickname?: string;
  /** Daily challenges by date. */
  daily?: Record<string, DailyRecord>;
}

export interface DailyRecord {
  /** Attempts started (each one counts, finished or not). */
  tries: number;
  /** Best finished score (-1 = none yet). */
  best: number;
}

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  speed: number;
  shake: boolean;
  numbers: boolean;
  particles: 'high' | 'medium' | 'low';
  fps: boolean;
  /** Old toggle, kept so older saves map onto `spin`. */
  fastSpin: boolean;
  /** Crate opening animation: full roll, a short roll, or straight to the result. */
  spin: 'full' | 'fast' | 'skip';
  hints: boolean;
  /** Battlefield animation frames: high = 7 per mob, medium = 3, low = the card art alone. */
  frames: 'high' | 'medium' | 'low';
  /** 竞技场: the last rules used and the last hand-picked squads (one player). */
  classic?: { rules?: Partial<Rules>; lab?: Teams };
}

const PK = 'mca.profile.v1';
const SK = 'mca.settings.v1';
const RK = 'mca.run.v3';

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
}
function safeDel(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}

export function defaultProfile(): Profile {
  return {
    v: 1, discovered: [], relicsSeen: [], tacticsSeen: [], variantsSeen: [], runs: 0, wins: 0, bestScore: 0, maxOmen: 0, lastOmen: 0, bestOmen: {}, totalEmeralds: 0, flags: {}, achievements: {},
    classic: { played: 0, guesses: 0, correct: 0, streak: 0, best: 0 }, history: [], unlockV: 2, daily: {},
  };
}

export function loadProfile(): Profile {
  const raw = safeGet(PK);
  if (!raw) return defaultProfile();
  try {
    const p: Profile = { ...defaultProfile(), unlockV: undefined, ...JSON.parse(raw) };
    p.tacticsSeen = Array.isArray(p.tacticsSeen) ? p.tacticsSeen : [];
    p.variantsSeen = Array.isArray(p.variantsSeen) ? p.variantsSeen : [];
    // Early daily records were a bare score (-1 = started).
    for (const [d, v] of Object.entries(p.daily ?? {})) if (typeof v === 'number') p.daily![d] = { tries: 1, best: v };
    // Commanders used to unlock independently; profiles from then keep what they had unlocked.
    if (!p.unlockV) {
      const old: Record<string, string> = { beat_act1: 'unlock_alex', emeralds_1500: 'unlock_villager', win_1: 'unlock_witch' };
      p.flags = { ...p.flags };
      for (const [k, v] of Object.entries(old)) if (p.flags[k]) p.flags[v] = true;
      // Clears recorded per commander count toward 四海为家.
      for (const c of Object.keys(p.bestOmen ?? {})) p.flags[`won_${c}`] = true;
      p.unlockV = 2;
    }
    return p;
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile) {
  safeSet(PK, JSON.stringify(p));
}

export function defaultSettings(): Settings {
  return { master: 0.8, music: 0.5, sfx: 0.8, speed: 1, shake: true, numbers: true, particles: 'high', fps: false, fastSpin: false, spin: 'full', hints: true, frames: 'high' };
}

export function loadSettings(): Settings {
  const raw = safeGet(SK);
  if (!raw) return defaultSettings();
  try {
    const saved = JSON.parse(raw) as Partial<Settings>;
    const out = { ...defaultSettings(), ...saved };
    if (!saved.spin) out.spin = saved.fastSpin ? 'fast' : 'full';
    return out;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s: Settings) {
  safeSet(SK, JSON.stringify(s));
}

export function loadRun(): RunState | null {
  const raw = safeGet(RK);
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as RunState;
    if (!r || r.over) return null;
    recoverPendingInteractions(r);
    return r;
  } catch {
    return null;
  }
}

export function saveRun(r: RunState | null) {
  if (!r || r.over) safeDel(RK);
  else safeSet(RK, JSON.stringify(r));
}

export function wipeAll() {
  safeDel(PK);
  safeDel(SK);
  safeDel(RK);
}

// ───────────────────────── Omen records ─────────────────────────

/** Commander frame earned by the highest omen cleared with them: bronze I–II, silver III–IV, gold V. */
export function omenTier(level: number | undefined): '' | 'bronze' | 'silver' | 'gold' {
  if (level === undefined || level < 1) return '';
  return level >= 5 ? 'gold' : level >= 3 ? 'silver' : 'bronze';
}
export const OMEN_TIER_NAME = { bronze: '铜', silver: '银', gold: '金' } as const;
export const ROMAN_OMEN = ['', 'I', 'II', 'III', 'IV', 'V'];

// ───────────────────────── Achievements ─────────────────────────

export type AchCat = 'journey' | 'challenge' | 'collection' | 'secret';
export const ACH_CAT: [AchCat, string][] = [
  ['journey', '历程'],
  ['challenge', '挑战'],
  ['collection', '收集'],
  ['secret', '隐藏'],
];

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  cat: AchCat;
  /** Secret achievements show only this until earned. */
  hint?: string;
}

const A = (cat: AchCat, list: [string, string, string, string?][]): AchievementDef[] =>
  list.map(([id, name, desc, hint]) => ({ id, name, desc, cat, hint }));

export const ACHIEVEMENTS: AchievementDef[] = [
  ...A('journey', [
    ['first_open', '开箱人生', '开启第一个补给箱。'],
    ['first_red', '红光满面', '开出隐秘级（红色）生物。'],
    ['first_gold', '★ 金色传说', '开出罕见特殊（金色）生物。'],
    ['star3', '三星闪耀', '将一张卡牌升至 ★3。'],
    ['full_team', '满编出征', '以 5 张卡牌的阵容参战。'],
    ['synergy_max', '羁绊大师', '激活任意羁绊的最高层级。'],
    ['enchant3', '附魔大师', '让一张卡牌拥有 III 级附魔。'],
    ['chain_end', '有始有终', '把任意一条事件链走到最后一章。'],
    ['beat_raid', '村庄英雄', '击败灾厄袭击。'],
    ['beat_monument', '海底征服者', '击败远古守卫者。'],
    ['beat_wither', '凋零终结者', '击败凋灵。'],
    ['win_1', '屠龙者', '击败末影龙，完成一次爬塔。'],
    ['boss_retry', '卷土重来', '首领战失败后再次挑战，并将其击败。'],
    ['cmd_all', '群英汇聚', '解锁全部统领。'],
    ['runs_10', '身经百战', '完成 10 局爬塔（胜负不限）。'],
    ['daily_1', '每日一塔', '完成一次每日挑战。'],
    ['classic_decider', '巅峰对决', '在竞技场看完一场打满五局的五局三胜。'],
  ]),
  ...A('challenge', [
    ['elite5', '精英猎人', '单局击败 5 场精英战斗。'],
    ['rich', '绿宝石富翁', '单局同时持有 400 绿宝石。'],
    ['relics10', '收藏家', '单局拥有 10 件宝物。'],
    ['one_heart', '命悬一线', '只剩 1 颗心时击败一名首领。'],
    ['last_stand', '绝境翻盘', '赢下一场首领战时，我方只剩最后 1 个单位。'],
    ['flawless_boss', '毫发无伤', '赢下一场首领战，我方没有任何单位阵亡（召唤物不算）。'],
    ['capture_rare', '驯兽大师', '用亚历克斯收服一只隐秘级或罕见特殊生物。'],
    ['witch_potions', '药罐子', '用女巫在单局中喝掉、扔出 15 瓶药水。'],
    ['star3_5', '全员三星', '5 张出战卡牌全部升至 ★3。'],
    ['team_seven', '千军万马', '部署 7 张卡牌全满编队出战。'],
    ['break_posture', '破势一击', '在一场首领战中成功触发【破势】打断首领技能。'],
    ['gold_star3', '传说降临', '将一张罕见特殊（金色）卡牌升至 ★3。'],
    ['no_loss', '完美爬塔', '一场战斗都不输，击败末影龙。'],
    ['no_items', '赤手空拳', '整局不使用任何战斗物品，击败末影龙。'],
    ['all_blue', '平民英雄', '出战卡牌全是军规级（蓝色）时击败末影龙。'],
    ['trio', '精兵简政', '只派出不超过 3 张卡牌击败末影龙。'],
    ['pure_family', '纯血军团', '出战的 4 张以上卡牌同属一个羁绊时击败末影龙。'],
    ['speedrun', '速通', '开局后 30 分钟内击败末影龙。'],
    ['win_all', '四海为家', '用每一位统领各击败一次末影龙。'],
    ['omen1', '不祥之兆 I', '在不祥之兆 I 难度下通关。'],
    ['omen2', '不祥之兆 II', '在不祥之兆 II 难度下通关。'],
    ['omen3', '不祥之兆 III', '在不祥之兆 III 难度下通关。'],
    ['omen4', '不祥之兆 IV', '在不祥之兆 IV 难度下通关。'],
    ['omen5', '不祥之兆 V', '在不祥之兆 V 难度下通关。'],
    ['omen5_all', '末日行者', '用每一位统领在不祥之兆 V 难度下通关。'],
    ['classic_5', '神预言家', '竞技场竞猜连续猜对 5 次。'],
    ['classic_10', '未卜先知', '竞技场竞猜连续猜对 10 次。'],
    ['classic_upset', '慧眼识珠', '竞技场竞猜押中赛前推演胜率不到 30% 的一方。'],
    ['daily_top10', '每日十强', '在至少 20 人参加的每日挑战中进入前 10 名。'],
  ]),
  ...A('collection', [
    ['codex_half', '博物学家', '图鉴发现一半的生物。'],
    ['codex_full', '全图鉴', '图鉴发现全部生物。'],
    ['relic_half', '宝物鉴赏家', '图鉴中见过一半的宝物。'],
    ['emerald_10k', '村庄首富', '累计获得 10000 绿宝石。'],
    ['chain_all', '故事收集者', '把每一条事件链都走到最后一章。'],
  ]),
  ...A('secret', [
    ['wither_pull', '是凋灵！', '从补给箱里开出凋灵。', '下一箱，是僵尸，还是……'],
    ['unlucky', '非酋认证', '连续 10 次开箱都开出军规级（蓝色）生物。', '运气也是实力的一部分。'],
    ['dinnerbone', 'Dinnerbone', '在战场上遇见头朝下的 Dinnerbone 或 Grumm。', '有些名字会让生物头朝下。'],
    ['jeb', '彩虹野兽', '在战场上遇见流光溢彩的 jeb_。', '某只野兽身上似乎在变色。'],
    ['johnny', "Here's Johnny!", '在战场上遇见名叫 Johnny 的卫道士。', '有个卫道士好像有自己的名字。'],
    ['first_fight_loss', '出师未捷', '在一局的第一场战斗中就败下阵来。', '万事开头难。'],
    ['first_death', '你死了！', '第一次在爬塔中倒下。', '每个屠龙者都曾倒下过。'],
    ['abandon', '战略性撤退', '主动放弃一局爬塔。', '有时候，离开也需要勇气。'],
    ['totem_save', '不死图腾', '被不死图腾从死亡边缘拉回来。', '有一件宝物能让你多活一次。'],
    ['night_owl', '夜猫子', '在凌晨 0 点到 5 点之间结束一局爬塔。', '屠龙不分昼夜。'],
    ['reach_sift', '裂隙另一边', '踏入第四幕：筛界。', '末影龙倒下之后，故事还没有结束。'],
    ['beat_sift', '筛界征服者', '在第四幕击败幽匿巨像。', '去裂隙的尽头看看。'],
    ['reach_expedition', '踏入远征', '踏入第五幕：遗迹远征。', '去探访深邃的古老地下城遗迹。'],
    ['beat_warden', '远古誓约', '击败远古契约守卫。', '沉睡的重装石卫重新倒下。'],
    ['beat_heart', '终焉救赎', '在第七幕击败首领 · 复仇之心。', '彻底粉碎虚空废墟的核心意志。'],
    ['classic_reverse', '让二追三', '竞技场五局三胜中，一方在 0 : 2 落后时连赢三局。', '0 : 2 落后，也别急着离场。'],
    ['classic_gods', '神仙打架', '竞技场随机抽取时，红蓝双方都开出了罕见特殊（金色）生物。', '一方开出金色已经很难得了，如果两边都……'],
  ]),
];
export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Marks an achievement as earned; true if it is new. */
export function grant(p: Profile, id: string): boolean {
  if (p.achievements[id] || !ACHIEVEMENT_MAP[id]) return false;
  p.achievements = { ...p.achievements, [id]: Date.now() };
  return true;
}

/** Everything a run state can earn right now: achievements and commander unlocks. Mutates the profile. */
export function checkProgress(p: Profile, s: RunState | null): { achievements: string[]; unlocks: string[] } {
  const got: string[] = [];
  const unlocks: string[] = [];
  const give = (id: string, cond: boolean) => {
    if (cond && grant(p, id)) got.push(id);
  };
  const flag = (k: string) => {
    if (p.flags[k]) return false;
    p.flags = { ...p.flags, [k]: true };
    return true;
  };
  if (s) {
    give('first_open', s.stats.crates > 0);
    give('first_red', s.stats.pulls.red > 0);
    give('first_gold', s.stats.pulls.gold > 0);
    const cards = [...s.team, ...s.bench];
    give('star3', cards.some((c) => c.star >= 3));
    give('gold_star3', cards.some((c) => c.star >= 3 && mobDef(c.mob).rarity === 'gold'));
    give('enchant3', cards.some((c) => c.enchant && c.enchantLv === 3));
    give('full_team', s.team.length >= 5);
    give('star3_5', s.team.length >= 5 && s.team.every((c) => c.star >= 3));
    const syn = computeSynergies([...new Set(s.team.map((c) => c.mob))].map((m) => mobDef(m).families));
    give('synergy_max', Object.entries(syn.active).some(([f, t]) => t >= 0 && t === maxTier(f)));
    give('rich', s.emeralds >= 400);
    give('relics10', s.relics.length >= 10);
    give('elite5', s.stats.elitesWon >= 5);
    give('witch_potions', s.commander === 'witch' && (s.stats.potionsUsed ?? 0) >= 15);
    give('unlucky', (s.stats.blueBest ?? 0) >= 10);
    give('reach_sift', s.act >= 4);
    give('reach_expedition', s.act >= 5);
    give('team_seven', s.team.length >= 7);
    give('beat_heart', s.won && s.act >= 7);
    give('beat_warden', !!(s.stats as any).beat_warden);
    give('break_posture', !!(s.stats as any).break_posture);
    // Bosses: the first one depends on the run; the 2nd is the Wither and the 3rd the dragon.
    const bosses = s.stats.bossesWon;
    if (bosses >= 1) give(s.bosses[0] === 'a1b_raid' ? 'beat_raid' : 'beat_monument', true);
    give('beat_wither', bosses >= 2);
    give('win_1', bosses >= 3);
    if (bosses >= 3 && flag(`won_${s.commander}`)) give('win_all', COMMANDERS.every((c) => p.flags[`won_${c.id}`]));
    // Last chapters: trader gift/revenge settled, enderman returned, singer met, banner ambush won.
    const ch = s.chains ?? {};
    const ends: [string, boolean][] = [
      ['trader', ch.trader === 3 || ch.trader === -2],
      ['ender', ch.ender === 2],
      ['song', (ch.song ?? 0) >= 2],
      ['banner', ch.banner === 2],
    ];
    for (const [k, done] of ends) if (done) flag(`chain_${k}`);
    give('chain_end', ends.some(([, d]) => d));
    give('chain_all', ends.every(([k]) => p.flags[`chain_${k}`]));
    // Commander chain: each one is unlocked by slaying the dragon with the one before it, on a
    // minimum omen level (daily runs count once the previous commander is unlocked).
    for (const c of COMMANDERS) {
      const u = c.unlock;
      if (u && s.commander === u.prev && isUnlocked(p, u.prev) && bosses >= 3 && s.omen >= u.omen && flag(u.key)) unlocks.push(`解锁统领：${c.name} · ${c.title}`);
    }
  }
  give('cmd_all', COMMANDERS.every((c) => !c.unlock || p.flags[c.unlock.key]));
  const total = PLAYABLE_MOBS.length;
  const found = p.discovered.filter((d) => PLAYABLE_MOBS.some((m) => m.id === d)).length;
  give('codex_half', found >= total / 2);
  give('codex_full', found >= total);
  give('relic_half', p.relicsSeen.filter((r) => RELICS.some((x) => x.id === r)).length >= RELICS.length / 2);
  give('emerald_10k', p.totalEmeralds >= 10000);
  give('runs_10', p.runs >= 10);
  return { achievements: got, unlocks };
}

export function isUnlocked(p: Profile, commander: string) {
  const c = COMMANDERS.find((x) => x.id === commander);
  return !!c && (!c.unlock || !!p.flags[c.unlock.key]);
}

import { FAMILIES } from '../data/families.ts';
import { COMMANDERS } from '../data/commanders.ts';
import { RELICS } from '../data/items.ts';
function maxTier(f: string) {
  return FAMILIES[f as keyof typeof FAMILIES].tiers.length - 1;
}
