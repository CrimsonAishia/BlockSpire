export interface DifficultyPolicy {
  omen: 0 | 1 | 2 | 3 | 4 | 5;
  name: string;
  summary: string;
  hpMul: number;
  atkMul: number;
  formationBudgetMul: number;
  encounterBias: number;
  synergyChance: number;
  supportChance: number;
  fifthCardChance: number;
  eliteWeight: number;
  shopPriceMul: number;
  restHeal: number;
  heartsPenalty: number;
  potionSlotsPenalty: number;
  weakenedSupportOnly: boolean;
  normalEnchant: boolean;
  eliteAffix: boolean;
  eliteBossEnchant: boolean;
  bossPhase: boolean;
  scoreMul: number;
  luckBonus: number;
  /** Cumulative rules in effect at this difficulty. */
  rules: string[];
  /** Rules newly introduced at this level. */
  newRules: string[];
}

export const DIFFICULTY_POLICIES: DifficultyPolicy[] = [
  {
    omen: 0,
    name: '探索',
    summary: '熟悉指挥官、羁绊和地形的基准冒险。',
    hpMul: 1.0,
    atkMul: 1.0,
    formationBudgetMul: 1.0,
    encounterBias: 0.0,
    synergyChance: 0.0,
    supportChance: 0.0,
    fifthCardChance: 0.0,
    eliteWeight: 15,
    shopPriceMul: 1.0,
    restHeal: 2,
    heartsPenalty: 0,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: false,
    normalEnchant: false,
    eliteAffix: false,
    eliteBossEnchant: false,
    bossPhase: false,
    scoreMul: 1.0,
    luckBonus: 0.0,
    newRules: ['基准遭遇与数值，无额外压力。'],
    rules: ['基准遭遇与数值，用于熟悉指挥官、羁绊和地形。'],
  },
  {
    omen: 1,
    name: '险路',
    summary: '精英战更多更早，普通战偶尔出现弱化支援卡。',
    hpMul: 1.03,
    atkMul: 1.02,
    formationBudgetMul: 1.04,
    encounterBias: 0.15,
    synergyChance: 0.15,
    supportChance: 0.15,
    fifthCardChance: 0.0,
    eliteWeight: 24,
    shopPriceMul: 1.0,
    restHeal: 2,
    heartsPenalty: 0,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: true,
    normalEnchant: false,
    eliteAffix: false,
    eliteBossEnchant: false,
    bossPhase: false,
    scoreMul: 1.2,
    luckBonus: 0.02,
    newRules: [
      '地图上的精英战更多，第 3 层起就会出现。',
      '普通战约 15% 增加弱化支援卡，敌方优先修正前后排职责脱节。',
    ],
    rules: [
      '地图上的精英战更多，第 3 层起就会出现。',
      '普通战约 15% 增加弱化支援卡，敌方优先修正前后排职责脱节。',
    ],
  },
  {
    omen: 2,
    name: '异化',
    summary: '精英附带致命词缀，敌方形成基础羁绊与支援。',
    hpMul: 1.06,
    atkMul: 1.04,
    formationBudgetMul: 1.08,
    encounterBias: 0.25,
    synergyChance: 0.25,
    supportChance: 0.25,
    fifthCardChance: 0.0,
    eliteWeight: 24,
    shopPriceMul: 1.0,
    restHeal: 2,
    heartsPenalty: 0,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: true,
    normalEnchant: false,
    eliteAffix: true,
    eliteBossEnchant: false,
    bossPhase: false,
    scoreMul: 1.4,
    luckBonus: 0.04,
    newRules: [
      '精英战敌人携带随机词缀（再生、荆棘、迅捷、坚韧或嗜血）。',
      '普通战约 25% 增加弱化支援卡，并有概率形成基础羁绊。',
    ],
    rules: [
      '地图上的精英战更多，第 3 层起就会出现。',
      '普通战约 15% 增加弱化支援卡，敌方优先修正前后排职责脱节。',
      '精英战敌人携带随机词缀（再生、荆棘、迅捷、坚韧或嗜血）。',
      '普通战约 25% 增加弱化支援卡，并有概率形成基础羁绊。',
    ],
  },
  {
    omen: 3,
    name: '武装',
    summary: '敌人装备附魔并补充战力，商店物价上涨。',
    hpMul: 1.1,
    atkMul: 1.07,
    formationBudgetMul: 1.15,
    encounterBias: 0.4,
    synergyChance: 0.45,
    supportChance: 0.35,
    fifthCardChance: 0.0,
    eliteWeight: 24,
    shopPriceMul: 1.15,
    restHeal: 2,
    heartsPenalty: 1,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: false,
    normalEnchant: true,
    eliteAffix: true,
    eliteBossEnchant: false,
    bossPhase: false,
    scoreMul: 1.6,
    luckBonus: 0.06,
    newRules: [
      '普通战斗中有一张敌方卡牌带随机附魔。',
      '第 1 阶级以上普通战约 35% 概率增加支援卡。',
      '商店价格上涨 15%，开局少 1 颗心。',
    ],
    rules: [
      '地图上的精英战更多，第 3 层起就会出现。',
      '普通战约 15% 增加弱化支援卡，敌方优先修正前后排职责脱节。',
      '精英战敌人携带随机词缀（再生、荆棘、迅捷、坚韧或嗜血）。',
      '普通战约 25% 增加弱化支援卡，并有概率形成基础羁绊。',
      '普通战斗中有一张敌方卡牌带随机附魔。',
      '第 1 阶级以上普通战约 35% 概率增加支援卡。',
      '商店价格上涨 15%，开局少 1 颗心。',
    ],
  },
  {
    omen: 4,
    name: '围猎',
    summary: '强敌附魔且支援更密集，扎营休息恢复减半，物品栏少一格。',
    hpMul: 1.15,
    atkMul: 1.1,
    formationBudgetMul: 1.24,
    encounterBias: 0.6,
    synergyChance: 0.65,
    supportChance: 0.65,
    fifthCardChance: 0.0,
    eliteWeight: 24,
    shopPriceMul: 1.15,
    restHeal: 1,
    heartsPenalty: 1,
    potionSlotsPenalty: 1,
    weakenedSupportOnly: false,
    normalEnchant: true,
    eliteAffix: true,
    eliteBossEnchant: true,
    bossPhase: false,
    scoreMul: 1.8,
    luckBonus: 0.08,
    newRules: [
      '精英战和首领战也有一张敌方卡牌带随机附魔。',
      '第 1 阶级以上普通战约 65% 概率补位，敌方羁绊倾向大幅提升。',
      '扎营休息只回复 1 颗心，开局物品栏少 1 格。',
    ],
    rules: [
      '地图上的精英战更多，第 3 层起就会出现。',
      '普通战约 15% 增加弱化支援卡，敌方优先修正前后排职责脱节。',
      '精英战敌人携带随机词缀（再生、荆棘、迅捷、坚韧或嗜血）。',
      '普通战约 25% 增加弱化支援卡，并有概率形成基础羁绊。',
      '普通战斗中有一张敌方卡牌带随机附魔。',
      '第 1 阶级以上普通战约 35% 概率增加支援卡。',
      '商店价格上涨 15%，开局少 1 颗心。',
      '精英战和首领战也有一张敌方卡牌带随机附魔。',
      '第 1 阶级以上普通战约 65% 概率补位，敌方羁绊倾向大幅提升。',
      '扎营休息只回复 1 颗心，开局物品栏少 1 格。',
    ],
  },
  {
    omen: 5,
    name: '终末',
    summary: '首领半血狂暴召唤护卫，后期可能遭遇五卡阵容。',
    hpMul: 1.2,
    atkMul: 1.14,
    formationBudgetMul: 1.36,
    encounterBias: 0.8,
    synergyChance: 0.8,
    supportChance: 0.95,
    fifthCardChance: 0.25,
    eliteWeight: 24,
    shopPriceMul: 1.15,
    restHeal: 1,
    heartsPenalty: 1,
    potionSlotsPenalty: 1,
    weakenedSupportOnly: false,
    normalEnchant: true,
    eliteAffix: true,
    eliteBossEnchant: true,
    bossPhase: true,
    scoreMul: 2.0,
    luckBonus: 0.1,
    newRules: [
      '首领生命低于一半时狂暴：攻速 +30%、受到伤害 -15%，并召唤一队护卫。',
      '第 1 阶级以上普通战稳定为四卡；第 2 阶级约 25% 概率出现第五张支援卡。',
      '敌方阵容高度协同并最大化羁绊可能。',
    ],
    rules: [
      '地图上的精英战更多，第 3 层起就会出现。',
      '普通战约 15% 增加弱化支援卡，敌方优先修正前后排职责脱节。',
      '精英战敌人携带随机词缀（再生、荆棘、迅捷、坚韧或嗜血）。',
      '普通战约 25% 增加弱化支援卡，并有概率形成基础羁绊。',
      '普通战斗中有一张敌方卡牌带随机附魔。',
      '第 1 阶级以上普通战约 35% 概率增加支援卡。',
      '商店价格上涨 15%，开局少 1 颗心。',
      '精英战和首领战也有一张敌方卡牌带随机附魔。',
      '第 1 阶级以上普通战约 65% 概率补位，敌方羁绊倾向大幅提升。',
      '扎营休息只回复 1 颗心，开局物品栏少 1 格。',
      '首领生命低于一半时狂暴：攻速 +30%、受到伤害 -15%，并召唤一队护卫。',
      '第 1 阶级以上普通战稳定为四卡；第 2 阶级约 25% 概率出现第五张支援卡。',
      '敌方阵容高度协同并最大化羁绊可能。',
    ],
  },
];

/**
 * Returns the difficulty policy for a given omen level (0–5).
 * Always clamps within valid range [0, 5].
 */
export function difficultyPolicy(omen = 0): DifficultyPolicy {
  const level = Math.max(0, Math.min(DIFFICULTY_POLICIES.length - 1, Math.floor(omen))) as 0 | 1 | 2 | 3 | 4 | 5;
  return DIFFICULTY_POLICIES[level];
}
