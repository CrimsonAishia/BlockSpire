export const DIFFICULTY_RULES_VERSION = 4;

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
  requiredEliteGates: number;
  star3Chance: { tier0: number; tier1: number; tier2: number; elite: number };
  star3Cap: { tier0: number; tier1: number; tier2: number; elite: number };
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
  /** Chance for tier 1+ normal battles to carry an enemy tactic. */
  tacticsChanceNormal: number;
  /** Number of enemy tactics carried by elite encounters. */
  eliteTacticsCount: number;
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
    requiredEliteGates: 0,
    star3Chance: { tier0: 0, tier1: 0, tier2: 0, elite: 0 },
    star3Cap: { tier0: 0, tier1: 0, tier2: 0, elite: 0 },
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
    tacticsChanceNormal: 0.0,
    eliteTacticsCount: 0,
    newRules: ['基准遭遇与数值，无额外压力。'],
    rules: ['基准遭遇与数值，用于熟悉指挥官、羁绊和地形。'],
  },
  {
    omen: 1,
    name: '险路',
    summary: '敌方生命 +15%、攻击 +10%，精英更早出现且站位更合理。',
    hpMul: 1.15,
    atkMul: 1.1,
    formationBudgetMul: 1.15,
    encounterBias: 0.15,
    synergyChance: 0.25,
    supportChance: 0.35,
    fifthCardChance: 0.0,
    eliteWeight: 24,
    requiredEliteGates: 0,
    star3Chance: { tier0: 0, tier1: 0, tier2: 0, elite: 0 },
    star3Cap: { tier0: 0, tier1: 0, tier2: 0, elite: 0 },
    shopPriceMul: 1.0,
    restHeal: 2,
    heartsPenalty: 0,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: false,
    normalEnchant: false,
    eliteAffix: false,
    eliteBossEnchant: false,
    bossPhase: false,
    scoreMul: 1.25,
    luckBonus: 0.0,
    tacticsChanceNormal: 0.0,
    eliteTacticsCount: 0,
    newRules: [
      '敌方生命 +15%、攻击 +10%、编队预算 +15%。',
      '地图上的精英战更多，第 3 层起就会出现。',
      '敌方优先修正前后排职责脱节，常规遭遇偏向预算上半区。',
    ],
    rules: [
      '敌方生命 +15%、攻击 +10%、编队预算 +15%。',
      '地图上的精英战更多，第 3 层起就会出现。',
      '敌方优先修正前后排职责脱节，常规遭遇偏向预算上半区。',
    ],
  },
  {
    omen: 2,
    name: '异化',
    summary: '敌方生命 +35%、攻击 +20%，精英战固定配备 1 个敌军战术与词缀。',
    hpMul: 1.35,
    atkMul: 1.2,
    formationBudgetMul: 1.3,
    encounterBias: 0.3,
    synergyChance: 0.45,
    supportChance: 0.6,
    fifthCardChance: 0.0,
    eliteWeight: 26,
    requiredEliteGates: 0,
    star3Chance: { tier0: 0, tier1: 0, tier2: 0.05, elite: 0.1 },
    star3Cap: { tier0: 0, tier1: 0, tier2: 1, elite: 1 },
    shopPriceMul: 1.0,
    restHeal: 2,
    heartsPenalty: 0,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: false,
    normalEnchant: false,
    eliteAffix: true,
    eliteBossEnchant: false,
    bossPhase: false,
    scoreMul: 1.5,
    luckBonus: 0.0,
    tacticsChanceNormal: 0.0,
    eliteTacticsCount: 1,
    newRules: [
      '敌方生命 +35%、攻击 +20%、编队预算 +30%。',
      '精英战敌军固定拥有 1 个战术，且敌人携带随机词缀。',
      '敌方更容易形成基础家族羁绊与阵型协同；后期偶见 ★3 敌军。',
    ],
    rules: [
      '敌方生命 +15%、攻击 +10%、编队预算 +15%。',
      '地图上的精英战更多，第 3 层起就会出现。',
      '敌方优先修正前后排职责脱节，常规遭遇偏向预算上半区。',
      '敌方生命 +35%、攻击 +20%、编队预算 +30%。',
      '精英战敌军固定拥有 1 个战术，且敌人携带随机词缀。',
      '敌方更容易形成基础家族羁绊与阵型协同；后期偶见 ★3 敌军。',
    ],
  },
  {
    omen: 3,
    name: '武装',
    summary: '敌方生命 +55%、攻击 +30%，中后期普通战稳定四卡，敌卡配备附魔。',
    hpMul: 1.55,
    atkMul: 1.3,
    formationBudgetMul: 1.45,
    encounterBias: 0.5,
    synergyChance: 0.65,
    supportChance: 0.85,
    fifthCardChance: 0.0,
    eliteWeight: 30,
    requiredEliteGates: 1,
    star3Chance: { tier0: 0, tier1: 0.1, tier2: 0.3, elite: 0.5 },
    star3Cap: { tier0: 0, tier1: 1, tier2: 1, elite: 1 },
    shopPriceMul: 1.15,
    restHeal: 2,
    heartsPenalty: 1,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: false,
    normalEnchant: true,
    eliteAffix: true,
    eliteBossEnchant: false,
    bossPhase: false,
    scoreMul: 1.8,
    luckBonus: 0.0,
    tacticsChanceNormal: 0.35,
    eliteTacticsCount: 1,
    newRules: [
      '敌方生命 +55%、攻击 +30%、编队预算 +45%。',
      '中后期普通战稳定四卡，约 35% 获得 1 个战术；敌方卡牌配备附魔。',
      '每幕至少包含 1 场必经精英战，不可选路规避；高难敌军开始出现 ★3 晋升。',
      '商店价格上涨 15%，开局少 1 颗心。',
    ],
    rules: [
      '敌方生命 +15%、攻击 +10%、编队预算 +15%。',
      '地图上的精英战更多，第 3 层起就会出现。',
      '敌方优先修正前后排职责脱节，常规遭遇偏向预算上半区。',
      '敌方生命 +35%、攻击 +20%、编队预算 +30%。',
      '精英战敌军固定拥有 1 个战术，且敌人携带随机词缀。',
      '敌方更容易形成基础家族羁绊与阵型协同；后期偶见 ★3 敌军。',
      '敌方生命 +55%、攻击 +30%、编队预算 +45%。',
      '中后期普通战稳定四卡，约 35% 获得 1 个战术；敌方卡牌配备附魔。',
      '每幕至少包含 1 场必经精英战，不可选路规避；高难敌军开始出现 ★3 晋升。',
      '商店价格上涨 15%，开局少 1 颗心。',
    ],
  },
  {
    omen: 4,
    name: '围猎',
    summary: '敌方生命 +75%、攻击 +40%，扎营恢复减半，五卡与双战术精英开始出现。',
    hpMul: 1.75,
    atkMul: 1.4,
    formationBudgetMul: 1.62,
    encounterBias: 0.7,
    synergyChance: 0.8,
    supportChance: 0.95,
    fifthCardChance: 0.2,
    eliteWeight: 34,
    requiredEliteGates: 1,
    star3Chance: { tier0: 0.05, tier1: 0.25, tier2: 0.55, elite: 0.75 },
    star3Cap: { tier0: 1, tier1: 1, tier2: 1, elite: 2 },
    shopPriceMul: 1.15,
    restHeal: 2,
    heartsPenalty: 1,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: false,
    normalEnchant: true,
    eliteAffix: true,
    eliteBossEnchant: true,
    bossPhase: false,
    scoreMul: 2.2,
    luckBonus: 0.0,
    tacticsChanceNormal: 0.65,
    eliteTacticsCount: 2,
    newRules: [
      '敌方生命 +75%、攻击 +40%、编队预算 +62%。',
      '扎营休息只回复 1 颗心；五卡阵容与双战术精英开始出现。',
      '第 1 阶级以上普通战 65% 带战术，首领与精英配备强力附魔；敌军 ★3 明显增多。',
    ],
    rules: [
      '敌方生命 +15%、攻击 +10%、编队预算 +15%。',
      '地图上的精英战更多，第 3 层起就会出现。',
      '敌方优先修正前后排职责脱节，常规遭遇偏向预算上半区。',
      '敌方生命 +35%、攻击 +20%、编队预算 +30%。',
      '精英战敌军固定拥有 1 个战术，且敌人携带随机词缀。',
      '敌方更容易形成基础家族羁绊与阵型协同；后期偶见 ★3 敌军。',
      '敌方生命 +55%、攻击 +30%、编队预算 +45%。',
      '中后期普通战稳定四卡，约 35% 获得 1 个战术；敌方卡牌配备附魔。',
      '每幕至少包含 1 场必经精英战，不可选路规避；高难敌军开始出现 ★3 晋升。',
      '商店价格上涨 15%，开局少 1 颗心。',
      '敌方生命 +75%、攻击 +40%、编队预算 +62%。',
      '扎营休息只回复 1 颗心；五卡阵容与双战术精英开始出现。',
      '第 1 阶级以上普通战 65% 带战术，首领与精英配备强力附魔；敌军 ★3 明显增多。',
    ],
  },
  {
    omen: 5,
    name: '终末',
    summary: '终局挑战：敌方生命 +100%、攻击 +50%，中后期五卡成型常态化，首领强化与连续终局。',
    hpMul: 2.0,
    atkMul: 1.5,
    formationBudgetMul: 1.8,
    encounterBias: 0.9,
    synergyChance: 0.9,
    supportChance: 1.0,
    fifthCardChance: 0.6,
    eliteWeight: 38,
    requiredEliteGates: 2,
    star3Chance: { tier0: 0.1, tier1: 0.45, tier2: 0.8, elite: 1.0 },
    star3Cap: { tier0: 1, tier1: 1, tier2: 2, elite: 2 },
    shopPriceMul: 1.15,
    restHeal: 2,
    heartsPenalty: 1,
    potionSlotsPenalty: 0,
    weakenedSupportOnly: false,
    normalEnchant: true,
    eliteAffix: true,
    eliteBossEnchant: true,
    bossPhase: true,
    scoreMul: 2.6,
    luckBonus: 0.0,
    tacticsChanceNormal: 1.0,
    eliteTacticsCount: 2,
    newRules: [
      '终局挑战：敌方生命 +100%、攻击 +50%、编队预算 +80%。',
      '每幕至少包含 2 场必经精英战，无法通过选路规避；高难敌军高频配备 ★3 核心。',
      '中后期敌军以五卡成型编队为主，常规战必带战术，精英固定双战术。',
      '所有首领进入强化两阶段，最终首领需面对连续阶段作战。',
    ],
    rules: [
      '敌方生命 +15%、攻击 +10%、编队预算 +15%。',
      '地图上的精英战更多，第 3 层起就会出现。',
      '敌方优先修正前后排职责脱节，常规遭遇偏向预算上半区。',
      '敌方生命 +35%、攻击 +20%、编队预算 +30%。',
      '精英战敌军固定拥有 1 个战术，且敌人携带随机词缀。',
      '敌方更容易形成基础家族羁绊与阵型协同；后期偶见 ★3 敌军。',
      '敌方生命 +55%、攻击 +30%、编队预算 +45%。',
      '中后期普通战稳定四卡，约 35% 获得 1 个战术；敌方卡牌配备附魔。',
      '每幕至少包含 1 场必经精英战，不可选路规避；高难敌军开始出现 ★3 晋升。',
      '商店价格上涨 15%，开局少 1 颗心。',
      '敌方生命 +75%、攻击 +40%、编队预算 +62%。',
      '扎营休息只回复 1 颗心；五卡阵容与双战术精英开始出现。',
      '第 1 阶级以上普通战 65% 带战术，首领与精英配备强力附魔；敌军 ★3 明显增多。',
      '终局挑战：敌方生命 +100%、攻击 +50%、编队预算 +80%。',
      '每幕至少包含 2 场必经精英战，无法通过选路规避；高难敌军高频配备 ★3 核心。',
      '中后期敌军以五卡成型编队为主，常规战必带战术，精英固定双战术。',
      '所有首领进入强化两阶段，最终首领需面对连续阶段作战。',
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
