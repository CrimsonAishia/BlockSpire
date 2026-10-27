export const DIFFICULTY_RULES_VERSION = 5;

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
    newRules: ['标准遭遇与敌人强度，无额外附加限制。'],
    rules: ['标准遭遇与敌人强度，无额外附加限制。'],
  },
  {
    omen: 1,
    name: '险路',
    summary: '精英战更早出现，敌军编队配合更为严密。',
    hpMul: 1.075,
    atkMul: 1.05,
    formationBudgetMul: 1.075,
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
      '地图上的精英战出现更早（第 3 层起），数量增多。',
      '敌方编队更为合理，常规遭遇战力小幅提升。',
    ],
    rules: [
      '地图上的精英战出现更早（第 3 层起），数量增多。',
      '敌方编队更为合理，常规遭遇战力小幅提升。',
    ],
  },
  {
    omen: 2,
    name: '异化',
    summary: '精英战固定配备 1 个敌军战术与随机词缀。',
    hpMul: 1.175,
    atkMul: 1.1,
    formationBudgetMul: 1.15,
    encounterBias: 0.3,
    synergyChance: 0.45,
    supportChance: 0.6,
    fifthCardChance: 0.0,
    eliteWeight: 26,
    requiredEliteGates: 0,
    star3Chance: { tier0: 0, tier1: 0, tier2: 0.05, elite: 0.1 },
    star3Cap: { tier0: 0, tier1: 0, tier2: 1, elite: 1 },
    shopPriceMul: 1.05,
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
      '精英战敌军固定拥有 1 个专属战术，且携带随机词缀。',
      '敌方更容易形成羁绊协同；商店价格微涨 5%。',
    ],
    rules: [
      '地图上的精英战出现更早（第 3 层起），数量增多。',
      '敌方编队更为合理，常规遭遇战力小幅提升。',
      '精英战敌军固定拥有 1 个专属战术，且携带随机词缀。',
      '敌方更容易形成羁绊协同；商店价格微涨 5%。',
    ],
  },
  {
    omen: 3,
    name: '武装',
    summary: '开局生命 -1，物价上涨 10%，每幕强制遭遇精英。',
    hpMul: 1.275,
    atkMul: 1.15,
    formationBudgetMul: 1.225,
    encounterBias: 0.5,
    synergyChance: 0.65,
    supportChance: 0.85,
    fifthCardChance: 0.0,
    eliteWeight: 30,
    requiredEliteGates: 1,
    star3Chance: { tier0: 0, tier1: 0.1, tier2: 0.3, elite: 0.5 },
    star3Cap: { tier0: 0, tier1: 1, tier2: 1, elite: 1 },
    shopPriceMul: 1.10,
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
    tacticsChanceNormal: 0.30,
    eliteTacticsCount: 1,
    newRules: [
      '开局生命上限少 1 颗心，商店价格上涨 10%。',
      '每幕至少包含 1 场必经精英战，无法绕路规避。',
      '普通战敌人配备战术与强力附魔；高难敌军出现 ★3 晋升。',
      '战备机制：开局初始 3 补给箱固定为全图鉴随机稀有蓝卡。',
    ],
    rules: [
      '地图上的精英战出现更早（第 3 层起），数量增多。',
      '敌方编队更为合理，常规遭遇战力小幅提升。',
      '精英战敌军固定拥有 1 个专属战术，且携带随机词缀。',
      '敌方更容易形成羁绊协同；商店价格微涨 5%。',
      '开局生命上限少 1 颗心，商店价格上浮至 10%。',
      '每幕至少包含 1 场必经精英战，无法绕路规避。',
      '普通战敌人配备战术与强力附魔；高难敌军出现 ★3 晋升。',
      '战备机制：开局初始 3 补给箱固定为全图鉴随机稀有蓝卡。',
    ],
  },
  {
    omen: 4,
    name: '围猎',
    summary: '扎营恢复减半，普通战带战术，精英常驻双战术。',
    hpMul: 1.375,
    atkMul: 1.2,
    formationBudgetMul: 1.31,
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
    tacticsChanceNormal: 0.60,
    eliteTacticsCount: 2,
    newRules: [
      '商店价格上涨至 15%；五卡满编敌人更早出现。',
      '精英战敌军固定拥有 2 个战术，普通战普遍带战术。',
      '首领与精英配备强力附魔；敌军 ★3 单位明显增多。',
      '战备特权：开局可规划小队策略（自选三蓝或全随机三蓝）。',
    ],
    rules: [
      '地图上的精英战出现更早（第 3 层起），数量增多。',
      '敌方编队更为合理，常规遭遇战力小幅提升。',
      '精英战敌军固定拥有 1 个专属战术，且携带随机词缀。',
      '敌方更容易形成羁绊协同；商店价格微涨 5%。',
      '开局生命上限少 1 颗心，商店价格上浮至 10%。',
      '每幕至少包含 1 场必经精英战，无法绕路规避。',
      '普通战敌人配备战术与强力附魔；高难敌军出现 ★3 晋升。',
      '战备机制：开局初始 3 补给箱固定为全图鉴随机稀有蓝卡。',
      '商店价格上涨至 15%；五卡满编敌人更早出现。',
      '精英战敌军固定拥有 2 个战术，普通战普遍带战术。',
      '首领与精英配备强力附魔；敌军 ★3 单位明显增多。',
      '战备特权：开局可规划小队策略（自选三蓝或全随机三蓝）。',
    ],
  },
  {
    omen: 5,
    name: '终末',
    summary: '终局挑战：每幕双精英闸门，首领强化与连战。',
    hpMul: 1.5,
    atkMul: 1.25,
    formationBudgetMul: 1.4,
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
      '每幕必须突破 2 场必经精英战，无法绕路规避。',
      '中后期敌军常态化五卡满编，精英固定双战术。',
      '所有首领进入强化二阶段，最终决战需连续阶段作战。',
      '战备特权：开局可规划终极策略（自选一紫一蓝一随机蓝、自选三蓝或全随机三蓝）。',
    ],
    rules: [
      '地图上的精英战出现更早（第 3 层起），数量增多。',
      '敌方编队更为合理，常规遭遇战力小幅提升。',
      '精英战敌军固定拥有 1 个专属战术，且携带随机词缀。',
      '敌方更容易形成羁绊协同；商店价格微涨 5%。',
      '开局生命上限少 1 颗心，商店价格上浮至 10%。',
      '每幕至少包含 1 场必经精英战，无法绕路规避。',
      '普通战敌人配备战术与强力附魔；高难敌军出现 ★3 晋升。',
      '战备机制：开局初始 3 补给箱固定为全图鉴随机稀有蓝卡。',
      '商店价格上涨至 15%；五卡满编敌人更早出现。',
      '精英战敌军固定拥有 2 个战术，普通战普遍带战术。',
      '首领与精英配备强力附魔；敌军 ★3 单位明显增多。',
      '战备特权：开局可规划小队策略（自选三蓝或全随机三蓝）。',
      '每幕必须突破 2 场必经精英战，无法绕路规避。',
      '中后期敌军常态化五卡满编，精英固定双战术。',
      '所有首领进入强化二阶段，最终决战需连续阶段作战。',
      '战备特权：开局可规划终极策略（自选一紫一蓝一随机蓝、自选三蓝或全随机三蓝）。',
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
