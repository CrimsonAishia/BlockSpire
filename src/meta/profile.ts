// Persistent meta-progression: unlocks, codex discovery, achievements, settings.
import type { RunState } from '../run/run.ts';
import { PLAYABLE_MOBS } from '../data/mobs.ts';
import { computeSynergies } from '../data/families.ts';
import { mobDef } from '../data/mobs.ts';

export interface HistoryEntry {
  date: number;
  commander: string;
  omen: number;
  won: boolean;
  act: number;
  score: number;
  team: { mob: string; star: number }[];
}

export interface Profile {
  v: 1;
  discovered: string[];
  relicsSeen: string[];
  runs: number;
  wins: number;
  bestScore: number;
  maxOmen: number;
  /** Highest omen level cleared with each commander (absent = never cleared). */
  bestOmen: Record<string, number>;
  totalEmeralds: number;
  flags: Record<string, boolean>;
  achievements: Record<string, number>;
  classic: { played: number; guesses: number; correct: number; streak: number; best: number };
  history: HistoryEntry[];
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
    v: 1, discovered: [], relicsSeen: [], runs: 0, wins: 0, bestScore: 0, maxOmen: 0, bestOmen: {}, totalEmeralds: 0, flags: {}, achievements: {},
    classic: { played: 0, guesses: 0, correct: 0, streak: 0, best: 0 }, history: [],
  };
}

export function loadProfile(): Profile {
  const raw = safeGet(PK);
  if (!raw) return defaultProfile();
  try {
    return { ...defaultProfile(), ...JSON.parse(raw) };
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

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_open', name: '开箱人生', desc: '开启第一个补给箱。' },
  { id: 'first_red', name: '红光满面', desc: '开出隐秘级（红色）生物。' },
  { id: 'first_gold', name: '★ 金色传说', desc: '开出罕见特殊（金色）生物。' },
  { id: 'star3', name: '三星闪耀', desc: '将一张卡牌升至 ★3。' },
  { id: 'beat_raid', name: '村庄英雄', desc: '击败灾厄袭击。' },
  { id: 'beat_monument', name: '海底征服者', desc: '击败远古守卫者。' },
  { id: 'beat_wither', name: '凋零终结者', desc: '击败凋灵。' },
  { id: 'win_1', name: '屠龙者', desc: '击败末影龙，完成一次爬塔。' },
  { id: 'beat_sift', name: '筛界征服者', desc: '在第四幕击败幽匿巨像。' },
  { id: 'chain_end', name: '有始有终', desc: '把任意一条事件链走到最后一章。' },
  { id: 'full_team', name: '满编出征', desc: '以 5 张卡牌的阵容参战。' },
  { id: 'synergy_max', name: '羁绊大师', desc: '激活任意羁绊的最高层级。' },
  { id: 'rich', name: '绿宝石富翁', desc: '单局同时持有 400 绿宝石。' },
  { id: 'relics10', name: '收藏家', desc: '单局拥有 10 件宝物。' },
  { id: 'elite5', name: '精英猎人', desc: '单局击败 5 场精英战斗。' },
  { id: 'codex_half', name: '博物学家', desc: '图鉴发现一半的生物。' },
  { id: 'codex_full', name: '全图鉴', desc: '图鉴发现全部生物。' },
  { id: 'omen1', name: '不祥之兆 I', desc: '在不祥之兆 I 难度下通关。' },
  { id: 'omen2', name: '不祥之兆 II', desc: '在不祥之兆 II 难度下通关。' },
  { id: 'omen3', name: '不祥之兆 III', desc: '在不祥之兆 III 难度下通关。' },
  { id: 'omen4', name: '不祥之兆 IV', desc: '在不祥之兆 IV 难度下通关。' },
  { id: 'omen5', name: '不祥之兆 V', desc: '在不祥之兆 V 难度下通关。' },
  { id: 'omen5_all', name: '末日行者', desc: '用每一位统领在不祥之兆 V 难度下通关。' },
  { id: 'classic_5', name: '神预言家', desc: '经典对决中连续猜对 5 次。' },
];

/** Checks run state for newly earned achievements; returns their ids. */
export function checkRunAchievements(p: Profile, s: RunState): string[] {
  const got: string[] = [];
  const give = (id: string, cond: boolean) => {
    if (cond && !p.achievements[id]) {
      p.achievements[id] = Date.now();
      got.push(id);
    }
  };
  give('first_open', s.stats.crates > 0);
  give('first_red', s.stats.pulls.red > 0);
  give('first_gold', s.stats.pulls.gold > 0);
  give('star3', [...s.team, ...s.bench].some((c) => c.star >= 3));
  give('full_team', s.team.length >= 5);
  const syn = computeSynergies([...new Set(s.team.map((c) => c.mob))].map((m) => mobDef(m).families));
  give('synergy_max', Object.entries(syn.active).some(([f, t]) => t >= 0 && t === maxTier(f)));
  give('rich', s.emeralds >= 400);
  give('relics10', s.relics.length >= 10);
  give('elite5', s.stats.elitesWon >= 5);
  // Last chapters: trader gift/revenge settled, enderman returned, singer met, banner ambush won.
  const ch = s.chains ?? {};
  give('chain_end', ch.trader === 3 || ch.trader === -2 || ch.ender === 2 || (ch.song ?? 0) >= 2 || ch.banner === 2);
  const total = PLAYABLE_MOBS.length;
  give('codex_half', p.discovered.filter((d) => PLAYABLE_MOBS.some((m) => m.id === d)).length >= total / 2);
  give('codex_full', p.discovered.filter((d) => PLAYABLE_MOBS.some((m) => m.id === d)).length >= total);
  return got;
}

import { FAMILIES } from '../data/families.ts';
function maxTier(f: string) {
  return FAMILIES[f as keyof typeof FAMILIES].tiers.length - 1;
}
