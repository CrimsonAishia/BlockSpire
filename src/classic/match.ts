// 竞技场 (arena, formerly 经典对决 3v3): two squads of any size, best-of-N series, point costs for
// hand-picked squads, and the numbers shown between games. Pure logic (no DOM), shared by the
// screens and the prediction worker. The arena never touches the codex: every mob can be used.
import type { CrateGrade } from '../data/crates.ts';
import type { CardStat, SidePlan } from '../battle/sim.ts';
import { buildSide } from '../battle/setup.ts';
import { mobDef } from '../data/mobs.ts';
import type { Rarity } from '../core/types.ts';
import { MOB_COST } from './costs.ts';

export interface Pick {
  mob: string;
  star: number;
}
export type Teams = [Pick[], Pick[]];

/** A battlefield: biome and the seed its terrain is generated from. */
export interface Field {
  biome: string;
  seed: number;
}

export interface Rules {
  /** Squads from alternating crate pulls (随机抽取), or picked by hand (自选阵容). */
  mode: 'crate' | 'lab';
  /** One player watching and predicting, or two players sharing the screen. */
  players: 1 | 2;
  crate: string;
  grade: CrateGrade;
  /** Crate pulls per side (blue, red): squads need not be the same size. */
  sizes: [number, number];
  /** Hand-picked squads: points each side may spend (0 = no limit). */
  budget: number;
  /** Best of 1, 3 or 5. */
  bo: number;
  /** A new battlefield every game, or the same one for the whole series. */
  field: 'each' | 'fixed';
  /** The loser of each game (except the last) opens one more crate. */
  comeback: boolean;
  names: [string, string];
}

export const DEFAULT_RULES: Rules = {
  mode: 'crate', players: 1, crate: 'origin', grade: 'normal', sizes: [3, 3], budget: 0, bo: 3, field: 'each', comeback: false,
  names: ['蓝方', '红方'],
};
/** Kinds of mob per side (and crate pulls per side). */
export const MAX_SQUAD = 6;
/** Two players: crate rerolls each player gets per match. */
export const REROLLS = 2;
/** Budget choices for hand-picked squads; two players default to the middle one. */
export const BUDGETS = [16, 24, 32];

/**
 * Point costs: per mob and star, measured in the sim (costs.ts; 2 points ≈ one random blue ★1
 * card). Strength varies a lot inside a rarity (a gold giant is worth less than a red breeze),
 * so rarity alone is only the fallback for mobs added after the last measurement.
 */
export const COST: Record<Rarity, [number, number, number]> = {
  blue: [2, 4, 9],
  purple: [3, 4, 8],
  pink: [3, 5, 12],
  red: [5, 7, 14],
  gold: [12, 18, 24],
};
export const cardCost = (mob: string, star: number) => (MOB_COST[mob] ?? COST[mobDef(mob).rarity])[Math.max(1, Math.min(3, star)) - 1];
export const squadCost = (t: Pick[]) => t.reduce((n, p) => n + cardCost(p.mob, p.star), 0);
export const MAX_NAME = 8;

export interface GameRecord {
  field: Field;
  seed: number;
  /** The squads this game was played with (they can grow between games), for replays. */
  teams: Teams;
  /** null = draw (replayed, scores nothing). */
  winner: 0 | 1 | null;
  time: number;
  left: [number, number];
  cards: CardStat[];
  /** Simulated chance that blue wins this game, if the prediction had finished in time. */
  odds?: number;
  /** Two players: where they deployed (replays need it). */
  anchors?: Anchors;
}

/** Deployment positions by card uid (see `cardUid`); missing ones are placed automatically. */
export type Anchors = Record<string, [number, number]>;
export const cardUid = (side: 0 | 1, k: number, mob: string) => `${side}-${k}-${mob}`;

export function classicSide(t: Pick[], side: 0 | 1 = 0, anchors?: Anchors): SidePlan {
  return buildSide(
    t.map((p, k) => {
      const uid = cardUid(side, k, p.mob);
      return { mob: p.mob, star: p.star, row: mobDef(p.mob).defaultRow, uid, anchor: anchors?.[uid] };
    }),
    { relics: [], potions: [], act: 1 },
  );
}

export const winsNeeded = (bo: number) => Math.floor(bo / 2) + 1;

export function score(games: GameRecord[]): [number, number] {
  const s: [number, number] = [0, 0];
  for (const g of games) if (g.winner !== null) s[g.winner]++;
  return s;
}

export function seriesWinner(games: GameRecord[], bo: number): 0 | 1 | null {
  const s = score(games);
  const need = winsNeeded(bo);
  return s[0] >= need ? 0 : s[1] >= need ? 1 : null;
}

/** Both sides one win away from the series. */
export function isDecider(games: GameRecord[], bo: number) {
  const s = score(games);
  return bo > 1 && s[0] === winsNeeded(bo) - 1 && s[1] === s[0];
}

/** Chance that blue takes the series when it still needs a wins and red needs b, each game won with p. */
export function seriesChance(p: number, a: number, b: number): number {
  const memo = new Map<number, number>();
  const f = (x: number, y: number): number => {
    if (x <= 0) return 1;
    if (y <= 0) return 0;
    const k = x * 16 + y;
    let v = memo.get(k);
    if (v === undefined) memo.set(k, (v = p * f(x - 1, y) + (1 - p) * f(x, y - 1)));
    return v;
  };
  return f(a, b);
}

export interface Supply {
  /** Crate grade for the loser's extra crate; null = none. */
  grade: CrateGrade | null;
  note: string;
}

const GRADE_UP: CrateGrade[] = ['normal', 'premium', 'elite'];
const GRADE_NAME: Partial<Record<CrateGrade, string>> = { normal: '标准', premium: '高级', elite: '精良' };

/**
 * 败者补给, scaled by how outmatched the loser was: its predicted chance in the game it lost.
 * A favourite that lost to bad luck gets nothing (a crate would snowball the stronger side);
 * the worse the odds, the better the crate, counted up from the match's own crate grade.
 * Measured over 240 simulated best-of-3 series: the stronger squads take 72% of series
 * (95% without supplies, 79% if every loser got a standard crate), the first game's loser
 * comes back in 29%, and 69% go the distance.
 */
export function supplyFor(p: number | undefined, base: CrateGrade): Supply {
  const up = (n: number) => GRADE_UP[Math.min(GRADE_UP.length - 1, Math.max(0, GRADE_UP.indexOf(base)) + n)];
  const name = (g: CrateGrade) => `${GRADE_NAME[g] ?? ''}补给`;
  if (p === undefined) return { grade: base, note: `赛前推演没来得及完成，发${name(base)}` };
  const pc = `${Math.round(p * 100)}%`;
  if (p >= 0.5) return { grade: null, note: `赛前胜率 ${pc}，本来占优，只是这局运气不好：不发补给` };
  if (p < 0.2) return { grade: up(2), note: `赛前胜率只有 ${pc}，被碾压：发${name(up(2))}` };
  if (p < 0.35) return { grade: up(1), note: `赛前胜率 ${pc}，明显劣势：发${name(up(1))}` };
  return { grade: base, note: `赛前胜率 ${pc}，稍处下风：发${name(base)}` };
}

/** A win that the prediction gave less than this chance counts as an upset. */
export const UPSET = 0.3;

export interface Mvp {
  team: 0 | 1;
  mob: string;
  star: number;
  dmg: number;
  kills: number;
}

/** The series winner's card with the most damage (kills break ties); structures have no card. */
export function seriesMvp(games: GameRecord[], team: 0 | 1): Mvp | null {
  const sum = new Map<string, Mvp>();
  for (const g of games)
    for (const c of g.cards) {
      if (c.team !== team || mobDef(c.mob).structure) continue;
      const k = `${c.team}:${c.mob}`;
      const m = sum.get(k) ?? { team: c.team, mob: c.mob, star: c.star, dmg: 0, kills: 0 };
      m.dmg += c.dmg;
      m.kills += c.kills;
      m.star = Math.max(m.star, c.star);
      sum.set(k, m);
    }
  let best: Mvp | null = null;
  for (const m of sum.values()) if (!best || m.dmg > best.dmg || (m.dmg === best.dmg && m.kills > best.kills)) best = m;
  return best && best.dmg > 0 ? best : null;
}

/** Adds a pulled mob to a squad: a duplicate gains a star (up to ★3), otherwise it joins. */
export function addPull(t: Pick[], mob: string): { team: Pick[]; star: number; joined: boolean } {
  const team = t.map((p) => ({ ...p }));
  const ex = team.find((p) => p.mob === mob && p.star < 3);
  if (ex) {
    ex.star++;
    return { team, star: ex.star, joined: false };
  }
  team.push({ mob, star: 1 });
  return { team, star: 1, joined: true };
}

export function cleanName(s: string, fallback: string) {
  const t = s.replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return t || fallback;
}
