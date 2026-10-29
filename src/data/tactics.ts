// Commander sub-tactics, variants, economy and draft rules
// Implements specs from docs/design/commander-rebalance-proposal.md
import type { Rng } from '../core/rng.ts';

export type TacticId = 'tnt' | 'horn' | 'acid' | 'cannon' | 'smoke' | 'ward';
export type TacticCategory = 'offense' | 'defense';

export interface TacticDef {
  id: TacticId;
  name: string;
  category: TacticCategory;
  icon: string;
  desc: string;
  windup: number;
  radius?: number;
  maxTargets?: number;
  targetType: 'enemy_area' | 'ally_area' | 'enemy_single' | 'ally_move';
}

export interface VariantDef {
  id: string;
  targetId: string; // TacticId or commander id
  name: string;
  desc: string;
  tag: 'A' | 'B';
}

export const TACTIC_DEFS: Record<TacticId, TacticDef> = {
  tnt: {
    id: 'tnt',
    name: '遥控爆破',
    category: 'offense',
    icon: 'skill_tactic_tnt',
    desc: '半径 90 范围内最多 5 个敌人：造成 40K 物理伤害（总伤害上限 120K），击退并眩晕 0.5 秒。首领免疫击退，眩晕至多 0.15 秒。',
    windup: 0.6,
    radius: 90,
    maxTargets: 5,
    targetType: 'enemy_area',
  },
  horn: {
    id: 'horn',
    name: '战术撤退',
    category: 'defense',
    icon: 'skill_tactic_horn',
    desc: '半径 120 范围内最多 4 个友军：向所选集结点撤退，移速 +40%，持续 3 秒。撤退期间专心跑位不攻击。',
    windup: 0.6,
    radius: 120,
    maxTargets: 4,
    targetType: 'ally_move',
  },
  acid: {
    id: 'acid',
    name: '强酸喷溅',
    category: 'offense',
    icon: 'skill_tactic_acid',
    desc: '半径 70 范围内最多 3 个敌人：破除 35% 护盾（首领 15%），并削弱 10% 护甲，持续 4 秒。',
    windup: 0.6,
    radius: 70,
    maxTargets: 3,
    targetType: 'enemy_area',
  },
  cannon: {
    id: 'cannon',
    name: '应急钱炮',
    category: 'offense',
    icon: 'skill_tactic_cannon',
    desc: '单体敌方目标：消耗 8 绿宝石（随幕数微幅上涨）造成 60K 物理伤害，危急时花钱补刀斩杀。',
    windup: 0.6,
    targetType: 'enemy_single',
  },
  smoke: {
    id: 'smoke',
    name: '烟幕掩护',
    category: 'defense',
    icon: 'skill_tactic_smoke',
    desc: '半径 100 范围内最多 4 个友军：获得烟幕掩护，受到的远程与投射物伤害减少 30%，持续 3 秒。',
    windup: 0.4,
    radius: 100,
    maxTargets: 4,
    targetType: 'ally_area',
  },
  ward: {
    id: 'ward',
    name: '应急护符',
    category: 'defense',
    icon: 'skill_tactic_ward',
    desc: '半径 90 范围内最多 3 个友军：紧急套上 30K 临时护盾（全队总上限 75K），持续 4 秒。',
    windup: 0.4,
    radius: 90,
    maxTargets: 3,
    targetType: 'ally_area',
  },
};

export const TACTIC_POOL: TacticId[] = ['tnt', 'horn', 'acid', 'cannon', 'smoke', 'ward'];
export const OFFENSE_TACTICS: TacticId[] = ['tnt', 'acid', 'cannon'];
export const DEFENSE_TACTICS: TacticId[] = ['horn', 'smoke', 'ward'];

export const TACTIC_VARIANTS: Record<TacticId, [VariantDef, VariantDef]> = {
  tnt: [
    {
      id: 'directional',
      targetId: 'tnt',
      tag: 'A',
      name: '定向装药',
      desc: '最多 2 目标，造成 65K 强力物理伤害（总上限 130K）；击退减半，取消眩晕。',
    },
    {
      id: 'concussion',
      targetId: 'tnt',
      tag: 'B',
      name: '震荡装药',
      desc: '伤害降低至 20K（总上限 60K）；普通敌人眩晕延长至 0.9 秒（对首领仍为 0.15 秒）。',
    },
  ],
  horn: [
    {
      id: 'cover',
      targetId: 'horn',
      tag: 'A',
      name: '掩护撤退',
      desc: '移速加成改为 20%，撤退期间受到的伤害减少 15%。',
    },
    {
      id: 'pack',
      targetId: 'horn',
      tag: 'B',
      name: '猎群回旋',
      desc: '集结更快（持续 2 秒、最多 3 目标）；全员抵达后攻速提升 15% 持续 3 秒，就地反打！',
    },
  ],
  acid: [
    {
      id: 'dearmor',
      targetId: 'acid',
      tag: 'A',
      name: '去甲试剂',
      desc: '不再削减护盾；目标护甲大幅削弱 18%，持续 3 秒。',
    },
    {
      id: 'corrode',
      targetId: 'acid',
      tag: 'B',
      name: '腐盾试剂',
      desc: '破盾效果大幅增强：普通敌人削盾 50%、首领 20%；不再削减护甲。',
    },
  ],
  cannon: [
    {
      id: 'scatter',
      targetId: 'cannon',
      tag: 'A',
      name: '散钞弹',
      desc: '改为范围群射：半径 70 范围内最多 3 目标各 30K 物理伤害；单发消耗 10 绿宝石。',
    },
    {
      id: 'heavy',
      targetId: 'cannon',
      tag: 'B',
      name: '重铸弹',
      desc: '超重型炮击：单体造成 90K 物理伤害；蓄力 1.0 秒，单发消耗 14 绿宝石。',
    },
  ],
  smoke: [
    {
      id: 'wide',
      targetId: 'smoke',
      tag: 'A',
      name: '宽幅烟幕',
      desc: '大范围掩护：最多保护 6 个友军，远程受到伤害减少 15%，持续 3 秒。',
    },
    {
      id: 'cleanse',
      targetId: 'smoke',
      tag: 'B',
      name: '净化烟幕',
      desc: '远程受到伤害减少 15%；释放瞬间驱散范围内友军身上的中毒与燃烧状态。',
    },
  ],
  ward: [
    {
      id: 'lone',
      targetId: 'ward',
      tag: 'A',
      name: '孤军护符',
      desc: '单体强力护盾：只为 1 个最关键的友军套上 65K 护盾，持续 4 秒。',
    },
    {
      id: 'relay',
      targetId: 'ward',
      tag: 'B',
      name: '接力护符',
      desc: '群体均摊护盾：最多给 5 个友军各套上 18K 护盾（全队总上限 75K），持续 4 秒。',
    },
  ],
};

export const COMMANDER_VARIANTS: Record<string, [VariantDef, VariantDef]> = {
  steve: [
    {
      id: 'bulwark',
      targetId: 'steve',
      tag: 'A',
      name: '坚垒工程',
      desc: '建造次数由 4 次减为 3 次；己方掩体减伤强化至 25%（受到伤害减少 25%）。',
    },
    {
      id: 'fire_support',
      targetId: 'steve',
      tag: 'B',
      name: '火力工事',
      desc: '建造次数由 4 次减为 3 次，掩体减伤降为 10%；己方土台上的友军开战前 4 秒攻速提升 10%。',
    },
  ],
  alex: [
    {
      id: 'soothing',
      targetId: 'alex',
      tag: 'A',
      name: '安抚契约',
      desc: '更容易驯服（残血门槛放宽 10%，最高 95%）；驯服后不再额外回复生命。',
    },
    {
      id: 'mercenary',
      targetId: 'alex',
      tag: 'B',
      name: '短期借兵',
      desc: '借兵作战：驯服敌人攻击力提升 20%，但战斗结束后它会离开，不会变成卡牌。',
    },
  ],
  villager: [
    {
      id: 'light_hire',
      targetId: 'villager',
      tag: 'A',
      name: '轻装雇佣',
      desc: '雇佣铁傀儡费用打八折；铁傀儡的生命与攻击力变为原来的 85%。',
    },
    {
      id: 'venture',
      targetId: 'villager',
      tag: 'B',
      name: '风险投资',
      desc: '战前对赌：每幕可签 2 次对赌，下注 20 绿宝石，18 秒内首胜拿回本金并净赚 8 绿宝石！',
    },
  ],
  witch: [
    {
      id: 'targeted',
      targetId: 'witch',
      tag: 'A',
      name: '定向配方',
      desc: '定向配制：开战时临时药水提供 2 选 1 自选；本场临时药水不享受额外 20% 效果加成。',
    },
    {
      id: 'twin',
      targetId: 'witch',
      tag: 'B',
      name: '应急双酿',
      desc: '应急双酿：开战时直接多熬 1 瓶临时药水（共 2 瓶）；所有临时药水效果变为原来的 60%。',
    },
  ],
};

// 7-Act income scale G from proposal 7.1
export const ACT_INCOME_SCALE = [1, 1, 1.3, 1.6, 1.9, 1.9, 1.9, 1.9];

export function incomeScale(act: number): number {
  return ACT_INCOME_SCALE[act] ?? ACT_INCOME_SCALE[ACT_INCOME_SCALE.length - 1];
}

export const ORDER_INITIAL = 1;
export const ORDER_TOTAL = 2;
export const ORDER_REFILL_AT = 12;
export const ORDER_COOLDOWN = 8;

/** The preview and simulation must use the same effective targeting rules. */
export function tacticProfile(id: TacticId, variant?: string): string {
  const aliases: Record<string, string> = { concussion: 'concussive', dearmor: 'strip_armor', corrode: 'dissolve_shield', scatter: 'buckshot', heavy: 'recast', wide: 'broad' };
  return variant ? `${id}__${aliases[variant] ?? variant}` : id;
}

export function tacticConfig(id: TacticId, variant?: string): TacticDef {
  const def = { ...TACTIC_DEFS[id] };
  if (id === 'cannon' && variant === 'scatter') Object.assign(def, { targetType: 'enemy_area', radius: 70, maxTargets: 3 });
  if (id === 'cannon' && variant === 'heavy') def.windup = 1;
  if (id === 'tnt' && variant === 'directional') def.maxTargets = 2;
  if (id === 'horn' && variant === 'pack') def.maxTargets = 3;
  if (id === 'smoke' && variant === 'wide') def.maxTargets = 6;
  if (id === 'ward') def.maxTargets = variant === 'lone' ? 1 : variant === 'relay' ? 5 : 3;
  return def;
}

export function cannonCost(act: number, variant?: string): number {
  const base = variant === 'scatter' ? 10 : variant === 'heavy' ? 14 : 8;
  return Math.round(base * incomeScale(act));
}

export function hallTrainingCost(act: number): number {
  return Math.round(25 * incomeScale(act));
}

export function wagerStake(act: number): number {
  return Math.round(20 * incomeScale(act));
}

export function wagerProfit(act: number): number {
  return Math.round(8 * incomeScale(act));
}

export const SCROLL_BASE_PRICE = 48;

export function scrollPrice(act: number, shopPriceMul: number): number {
  return Math.round(SCROLL_BASE_PRICE * shopPriceMul);
}

/**
 * Draft 3 tactics from pool, excluding already owned tactics.
 * Guarantees 1 offense and 1 defense if both categories have eligible candidates.
 */
export function draftTactics(rng: Rng, library: string[]): TacticId[] {
  const owned = new Set(library);
  const availOffense = OFFENSE_TACTICS.filter((id) => !owned.has(id));
  const availDefense = DEFENSE_TACTICS.filter((id) => !owned.has(id));
  const pool = TACTIC_POOL.filter((id) => !owned.has(id));

  if (pool.length <= 3) return [...pool];

  const picked: TacticId[] = [];
  if (availOffense.length > 0) {
    const off = rng.pick(availOffense);
    picked.push(off);
  }
  if (availDefense.length > 0) {
    const def = rng.pick(availDefense);
    picked.push(def);
  }
  const remaining = pool.filter((id) => !picked.includes(id));
  while (picked.length < 3 && remaining.length > 0) {
    const next = rng.pick(remaining);
    picked.push(next);
    const at = remaining.indexOf(next);
    if (at >= 0) remaining.splice(at, 1);
  }
  return picked;
}
