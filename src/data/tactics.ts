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
    desc: '半径 90 内最多 5 个敌人，每目标最多 40K 物理伤害；总上限 120K，超额均摊。击退并眩晕 0.5 秒；首领不被击退，眩晕至多 0.15 秒，控制免疫仍生效。',
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
    desc: '先选半径 120 内最多 4 个友军，再选己方安全集合点；目的地须在每个选中单位后方或侧方，不能向前进攻。移速 +40%，最多行军 3 秒、路程 140；期间停止攻击，仍会受伤和控制。',
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
    desc: '半径 70 内最多 3 个敌人：削减当前护盾的 35%（首领 15%），每目标至多 120K、全体至多 180K。护甲降低 10 个百分点，持续 4 秒，最低降至 0；不直接伤害生命。',
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
    desc: '点选 1 个敌方生物，消耗 8G 绿宝石，造成 60K 物理伤害。不能指定建筑；费用与雇佣铁傀儡共用可用余额。',
    windup: 0.6,
    targetType: 'enemy_single',
  },
  smoke: {
    id: 'smoke',
    name: '烟幕掩护',
    category: 'defense',
    icon: 'skill_tactic_smoke',
    desc: '半径 100 内最多 4 个友军：获得随身烟幕，受到的远程与投射物伤害减少 30%，持续 3 秒；不减免近战和持续伤害。',
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
    desc: '半径 90 内最多 3 个友军，每目标最多获得 30K 临时护盾；总上限 75K，超额均摊，并受单位护盾上限限制。持续 4 秒，到期移除剩余护盾。',
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
      desc: '移速加成由 40% 降为 20%，最大路程由 140 降为 110；行军期间受到的伤害减少 15%。仍只能后撤或横移。',
    },
    {
      id: 'pack',
      targetId: 'horn',
      tag: 'B',
      name: '猎群回旋',
      desc: '行军时限由 3 秒缩短为 2 秒，最多选择 3 个友军；只有全员实际抵达才获得攻速 +15%，持续 3 秒。超时或有人阵亡不触发；仍只能后撤或横移。',
    },
  ],
  acid: [
    {
      id: 'dearmor',
      targetId: 'acid',
      tag: 'A',
      name: '去甲试剂',
      desc: '不再削盾；护甲降低 18 个百分点，持续 3 秒，最低降至 0。',
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
      desc: '改为范围群射：半径 70 范围内最多 3 目标各 30K 物理伤害；单发消耗 10G 绿宝石。',
    },
    {
      id: 'heavy',
      targetId: 'cannon',
      tag: 'B',
      name: '重铸弹',
      desc: '超重型炮击：单体造成 90K 物理伤害；蓄力 1.0 秒，单发消耗 14G 绿宝石。',
    },
  ],
  smoke: [
    {
      id: 'wide',
      targetId: 'smoke',
      tag: 'A',
      name: '宽幅烟幕',
      desc: '目标上限由 4 增至 6，远程与投射物减伤由 30% 降为 15%，持续 3 秒；选取半径仍为 100。',
    },
    {
      id: 'cleanse',
      targetId: 'smoke',
      tag: 'B',
      name: '净化烟幕',
      desc: '远程与投射物减伤由 30% 降为 15%；选中友军各清除 1 种燃烧或中毒，优先清除燃烧。目标上限仍为 4，烟幕持续 3 秒。',
    },
  ],
  ward: [
    {
      id: 'lone',
      targetId: 'ward',
      tag: 'A',
      name: '孤军护符',
      desc: '只选择距选点最近的 1 个友军，提供最多 65K 护盾，持续 4 秒；仍受单位护盾上限限制。',
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
      desc: '驯服生命门槛放宽 10 个百分点，仍封顶 95%；移除自带的 30% 最大生命回复。有小麦时，改为回复已损生命的 70%，保留小麦的攻击加成。',
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
      desc: '每幕最多签 2 次战前合同，预付 20G 绿宝石；首次尝试在 18 秒内获胜，返还本金并净赚 8G 绿宝石。失败或超时损失本金，重试不能签约，开战后不能撤押；连续阶段合计计时。',
    },
  ],
  witch: [
    {
      id: 'targeted',
      targetId: 'witch',
      tag: 'A',
      name: '定向配方',
      desc: '部署时，每份临时药水从固定的两瓶中选择一瓶；本场临时药水不享受药剂学的 20% 效果加成，范围加成保留。',
    },
    {
      id: 'twin',
      targetId: 'witch',
      tag: 'B',
      name: '应急双酿',
      desc: '额外熬制 1 瓶临时药水，基础共 2 瓶，酿造台的额外份数保留；临时药水效果与状态持续时间降至原来的 60%。',
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

export const TACTIC_GUIDE = {
  acquisition: '第一幕首领胜利后，可从随机候选中免费选 1 项副战术；之后还能通过战技殿堂、精英密函和商店卷轴获取。',
  loadout: '本局最多收藏 3 项副战术，每场至多装备 1 项；本节点首次开战后锁定，重试和连续阶段不能换装。',
  orders: `开战获得 ${ORDER_INITIAL} 点军令，第 ${ORDER_REFILL_AT} 秒补充 1 点，本场共 ${ORDER_TOTAL} 点；每次消耗 1 点，共享 ${ORDER_COOLDOWN} 秒冷却，与主技能次数独立。`,
  casting: '选点阶段不消耗军令；前摇中可取消并返还资源，已生效后不退款。暂停会冻结前摇、冷却和军令补充。',
  refinement: '每座战技殿堂可免费研习 1 项副战术，或付费精进主技能／已有副战术，二者选一；同一技能的两种变体互斥，收益与代价一同生效。',
};

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
