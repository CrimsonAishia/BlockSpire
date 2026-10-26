import type { Rng } from '../core/rng.ts';

export type EnemyTacticId = 'shield_wall' | 'hunt_backline' | 'salvo' | 'reinforcements';

export interface EnemyTacticDef {
  id: EnemyTacticId;
  name: string;
  summary: string;
  desc: string;
  tips: string;
  color: string;
  incompatible?: EnemyTacticId[];
}

export const ENEMY_TACTICS: EnemyTacticDef[] = [
  {
    id: 'shield_wall',
    name: '盾墙推进',
    summary: '前排存活时保护后排，缓慢压缩阵地。',
    desc: '当敌军前排单位存活时，后排单位受到来自所有来源的伤害降低 35%。',
    tips: '破甲、集火前排、侧翼突袭或高额真实伤害。',
    color: '#55a6ff',
    incompatible: ['salvo'],
  },
  {
    id: 'hunt_backline',
    name: '猎杀后排',
    summary: '开战数秒后机动单位切入我方后排。',
    desc: '战斗进行 4 秒后，一队机动突袭单位直接潜入玩家后排阵线。',
    tips: '蜘蛛网、蜂蜜块、冰冻减速、留存后排护卫。',
    color: '#ff6b6b',
    incompatible: [],
  },
  {
    id: 'salvo',
    name: '火力齐射',
    summary: '远程单位周期同步齐射并造成额外伤害。',
    desc: '敌方所有远程单位每 6 秒同步发射一次强化齐射，伤害提升 40%。',
    tips: '掩体建筑、投射物闪避、虚弱诅咒、范围控制。',
    color: '#ffaa44',
    incompatible: ['shield_wall'],
  },
  {
    id: 'reinforcements',
    name: '增援波次',
    summary: '倒计时结束后自底线加入后续支援。',
    desc: '战斗进行 9 秒后（第 6 秒发出警报），敌方底线呼叫一组低强度增援单位加入战斗。',
    tips: '留存范围法术、范围控制、提前清理先头部队。',
    color: '#c06bff',
    incompatible: [],
  },
];

export const ENEMY_TACTIC_MAP: Record<EnemyTacticId, EnemyTacticDef> = Object.fromEntries(
  ENEMY_TACTICS.map((t) => [t.id, t]),
) as Record<EnemyTacticId, EnemyTacticDef>;

/**
 * Rolls tactics for an encounter according to Omen rules and Act progression:
 * - Act 1 (Development Runway):
 *   - Elites get at most 1 tactic (even on Omen 4-5) and exclude hunt_backline.
 *   - Tier 0-1 regular battles get 0 tactics.
 *   - Tier 2 regular battles get 1 tactic preview (Omen 4: 35%, Omen 5: 50%).
 * - Act 2 (Smooth Transition & Difficulty Recovery):
 *   - Tier 0 regular battles get 1 tactic (Omen 4: 35%, Omen 5: 50%) to adapt to 4th slot.
 *   - Tier 1+ regular battles get 1 tactic (Omen 3: 30%, Omen 4: 60%, Omen 5: 100%).
 *   - Elites restore dual tactics (Omen 4-5 get 2 tactics).
 * - Act >= 3 (Endgame Peak):
 *   - Full original intensity rules.
 */
export function rollEnemyTactics(
  rng: Rng,
  omen: number,
  kind: 'battle' | 'elite' | 'boss',
  tier: 0 | 1 | 2,
  act = 2,
): EnemyTacticId[] {
  if (omen <= 0) return [];
  if (kind === 'boss') return []; // Bosses have custom phase 2 mechanics

  let count = 0;
  if (act === 1) {
    if (kind === 'elite') {
      if (omen === 1) count = 0;
      else count = 1; // Even on Omen 4-5, Act 1 elites are capped at 1 tactic
    } else if (kind === 'battle' && tier === 2) {
      if (omen <= 3) count = 0;
      else if (omen === 4) count = rng.chance(0.35) ? 1 : 0;
      else if (omen >= 5) count = rng.chance(0.50) ? 1 : 0;
    }
  } else if (act === 2) {
    if (kind === 'elite') {
      if (omen === 1) count = 0;
      else if (omen <= 3) count = 1;
      else count = 2; // Omen 4-5 restore 2 tactics in Act 2
    } else if (kind === 'battle') {
      if (tier === 0) {
        if (omen <= 3) count = 0;
        else if (omen === 4) count = rng.chance(0.35) ? 1 : 0;
        else if (omen >= 5) count = rng.chance(0.50) ? 1 : 0;
      } else {
        if (omen <= 2) count = 0;
        else if (omen === 3) count = rng.chance(0.30) ? 1 : 0;
        else if (omen === 4) count = rng.chance(0.60) ? 1 : 0;
        else if (omen >= 5) count = 1;
      }
    }
  } else {
    // Act >= 3 or default general check
    if (kind === 'elite') {
      if (omen === 1) count = 0;
      else if (omen <= 3) count = 1;
      else count = 2; // omen 4, 5
    } else if (kind === 'battle' && tier >= 1) {
      if (omen <= 2) count = 0;
      else if (omen === 3) count = rng.chance(0.30) ? 1 : 0;
      else if (omen === 4) count = rng.chance(0.60) ? 1 : 0;
      else if (omen >= 5) count = 1;
    }
  }

  if (count <= 0) return [];

  let available = ENEMY_TACTICS.map((t) => t.id);
  // In Act 1, exclude hunt_backline because the player only has 3 slots and cannot protect backline yet
  if (act === 1) {
    available = available.filter((id) => id !== 'hunt_backline');
  }

  const picked: EnemyTacticId[] = [];
  for (let i = 0; i < count; i++) {
    const valid = available.filter((id) => {
      if (picked.includes(id)) return false;
      const def = ENEMY_TACTIC_MAP[id];
      if (def.incompatible?.some((inc) => picked.includes(inc))) return false;
      return true;
    });
    if (!valid.length) break;
    const choice = rng.pick(valid);
    picked.push(choice);
  }

  return picked;
}

