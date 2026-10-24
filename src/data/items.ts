// Enchantments, potions, relics, commanders and difficulty modifiers.

export interface EnchantDef {
  id: string;
  name: string;
  /** Effect text; {0}, {1} are filled with the per-level values below. */
  text: string;
  /** Per placeholder: values at levels I, II, III. */
  vals: number[][];
  only?: 'melee' | 'ranged';
  color: string;
  /** Level-II text (what older code shows when it doesn't know the level). */
  desc: string;
}

const ROMAN = ['', 'I', 'II', 'III'];
const E = (id: string, name: string, text: string, vals: number[][], color: string, only?: 'melee' | 'ranged'): EnchantDef => ({
  id, name, text, vals, color, only, desc: text.replace(/\{(\d)\}/g, (_, k) => String(vals[Number(k)][1])),
});

/**
 * Enchantments come in levels I–III. A book of the same enchantment on a card that already has
 * it raises the level (merging), a different one replaces it.
 */
export const ENCHANTS: EnchantDef[] = [
  E('sharpness', '锋利', '攻击力 +{0}%。', [[15, 30, 45]], '#ff6b6b', 'melee'),
  E('power', '力量', '攻击力 +{0}%。', [[15, 30, 45]], '#ff9f43', 'ranged'),
  E('protection', '保护', '最大生命 +{0}%。', [[15, 30, 45]], '#74b9ff'),
  E('fire_aspect', '火焰附加', '攻击点燃目标 4 秒（每秒 {0}% 攻击力伤害）。', [[15, 25, 35]], '#ff7a1a', 'melee'),
  E('knockback', '击退', '攻击强力击退目标，{0}% 几率眩晕 0.4 秒。', [[10, 15, 20]], '#dfe6e9', 'melee'),
  E('thorns', '荆棘', '反弹 {0}% 受到的近战伤害。', [[15, 30, 45]], '#55efc4'),
  E('unbreaking', '耐久', '{0}% 几率完全免疫一次伤害。', [[10, 18, 25]], '#b2bec3'),
  E('looting', '抢夺', '本卡牌每次击杀获得 {0} 绿宝石（每场最多 20）。', [[1, 2, 3]], '#2ecc71'),
  E('sweeping', '横扫之刃', '近战攻击对周围其他敌人造成 {0}% 溅射伤害。', [[30, 45, 60]], '#fdcb6e', 'melee'),
  E('piercing', '穿透', '投射物额外贯穿 {0} 个目标，伤害 +{1}%。', [[1, 1, 2], [5, 10, 15]], '#a29bfe', 'ranged'),
  E('mending', '经验修补', '获得 {0}% 吸血。', [[8, 14, 20]], '#badc58'),
  E('soul_speed', '灵魂疾行', '移速 +{0}%，攻速 +{1}%。', [[15, 30, 45], [6, 12, 18]], '#6c5ce7'),
  E('channeling', '引雷', '每第 {0} 次攻击召唤闪电，对目标周围造成 150% 攻击力伤害。', [[6, 5, 4]], '#00cec9'),
  E('multishot', '多重射击', '额外射出 2 发 {0}% 伤害的投射物。', [[35, 45, 60]], '#e17055', 'ranged'),
  E('smite', '亡灵杀手', '对亡灵伤害 +{0}%。', [[25, 50, 75]], '#f5e6a8'),
  E('bane', '节肢杀手', '对节肢伤害 +{0}%，并使其迟缓 {1} 秒。', [[25, 50, 75], [1, 1.5, 2]], '#c8a27a'),
  E('breach', '破甲', '攻击无视目标 {0}% 的护甲。', [[15, 30, 45]], '#9aa4b0', 'melee'),
  E('density', '致密', '对浮空、被挑飞或眩晕中的目标伤害 +{0}%。', [[30, 60, 90]], '#7f8c99', 'melee'),
  E('wind_burst', '风爆', '每第 {0} 次攻击爆开一阵风，把目标周围的敌人吹飞。', [[5, 4, 3]], '#bfe6ff', 'melee'),
  E('flame', '火矢', '投射物点燃目标 3 秒（每秒 {0}% 攻击力伤害）。', [[15, 25, 35]], '#ff8c42', 'ranged'),
  E('punch', '冲击', '投射物把目标击退，{0}% 几率眩晕 0.3 秒。', [[8, 12, 16]], '#e8e8e8', 'ranged'),
  E('frost', '冰霜', '攻击使目标冰冻 2 秒（每秒 {0}% 攻击力伤害并减速；对烈焰人、岩浆怪伤害 ×3）。', [[8, 12, 16]], '#9fd8ff'),
];
export const ENCHANT_MAP: Record<string, EnchantDef> = Object.fromEntries(ENCHANTS.map((e) => [e.id, e]));

/** Value of an enchantment's k-th number at a level (1–3). */
export function enchantVal(id: string, lv: number, k = 0) {
  return ENCHANT_MAP[id]?.vals[k]?.[Math.max(1, Math.min(3, lv)) - 1] ?? 0;
}
export function enchantName(id: string, lv?: number) {
  return `${ENCHANT_MAP[id]?.name ?? id} ${ROMAN[Math.max(1, Math.min(3, lv ?? 2))]}`;
}
export function enchantText(id: string, lv?: number) {
  const e = ENCHANT_MAP[id];
  if (!e) return '';
  const L = Math.max(1, Math.min(3, lv ?? 2));
  return e.text.replace(/\{(\d)\}/g, (_, k) => String(e.vals[Number(k)][L - 1]));
}

export type ItemKind = 'drink' | 'splash' | 'lingering' | 'tool' | 'egg';
/** none = takes effect at once; area = aim anywhere; own = our half only (spawn eggs). */
export type ItemTarget = 'none' | 'area' | 'own';
export type ItemTier = 'common' | 'uncommon' | 'rare';

/** Consumables, used from the hotbar during a fight. */
export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  target: ItemTarget;
  /** Effect radius in blocks (area items). */
  radius: number;
  tier: ItemTier;
  price: number;
  desc: string;
  color: string;
  /** Icon asset name. */
  icon: string;
  /** Potions (affected by 龙息). */
  potion?: boolean;
  /** Spawn eggs: mob and how many. */
  spawn?: [string, number];
}

const I = (o: ItemDef) => o;

export const ITEMS: ItemDef[] = [
  // ── 饮用药水：立即对全体友军生效 ──
  I({ id: 'strength', name: '力量药水', kind: 'drink', target: 'none', radius: 0, tier: 'common', price: 30, potion: true, icon: 'potion_strength', color: '#c0392b', desc: '友军攻击力 +25%，持续到战斗结束。' }),
  I({ id: 'swiftness', name: '迅捷药水', kind: 'drink', target: 'none', radius: 0, tier: 'common', price: 26, potion: true, icon: 'potion_swiftness', color: '#7ec8ff', desc: '友军移速 +25%、攻速 +15%，持续到战斗结束。' }),
  I({ id: 'regeneration', name: '再生药水', kind: 'drink', target: 'none', radius: 0, tier: 'common', price: 28, potion: true, icon: 'potion_regeneration', color: '#ff7eb6', desc: '20 秒内友军每秒回复 2% 最大生命。' }),
  I({ id: 'turtle', name: '神龟药水', kind: 'drink', target: 'none', radius: 0, tier: 'uncommon', price: 32, potion: true, icon: 'potion_turtle', color: '#7c8f3c', desc: '友军受到伤害 -25%、移速 -15%，持续到战斗结束。' }),
  I({ id: 'fire_resistance', name: '抗火药水', kind: 'drink', target: 'none', radius: 0, tier: 'common', price: 20, potion: true, icon: 'potion_fire_resistance', color: '#ff9d2e', desc: '友军立即熄火，之后免疫燃烧，火焰伤害 -40%。' }),
  I({ id: 'invisibility', name: '隐身药水', kind: 'drink', target: 'none', radius: 0, tier: 'uncommon', price: 28, potion: true, icon: 'potion_invisibility', color: '#c9ced6', desc: '5 秒内友军无法被选为目标，期间首次攻击伤害 +50%。' }),
  // ── 喷溅 / 滞留药水：扔到目标处 ──
  I({ id: 'splash_healing', name: '喷溅型治疗药水', kind: 'splash', target: 'area', radius: 2.5, tier: 'common', price: 28, potion: true, icon: 'item_splash_healing', color: '#ff4d6d', desc: '范围内友军回复 30% 最大生命。亡灵敌人反而受到伤害。' }),
  I({ id: 'splash_harming', name: '喷溅型伤害药水', kind: 'splash', target: 'area', radius: 2.5, tier: 'common', price: 28, potion: true, icon: 'item_splash_harming', color: '#8e2a5e', desc: '范围内敌人受到 70 点魔法伤害（随幕数提升）。亡灵敌人反而被治疗。' }),
  I({ id: 'poison', name: '喷溅型剧毒药水', kind: 'splash', target: 'area', radius: 3, tier: 'common', price: 26, potion: true, icon: 'potion_poison', color: '#4caf50', desc: '范围内敌人中毒 8 秒（每秒 3% 最大生命，不致死）。' }),
  I({ id: 'weakness', name: '喷溅型虚弱药水', kind: 'splash', target: 'area', radius: 3, tier: 'common', price: 24, potion: true, icon: 'potion_weakness', color: '#57606f', desc: '范围内敌人攻击力 -30%，持续 12 秒。' }),
  I({ id: 'splash_slowness', name: '喷溅型迟缓药水', kind: 'splash', target: 'area', radius: 3, tier: 'common', price: 22, potion: true, icon: 'item_splash_slowness', color: '#6d7f9e', desc: '范围内敌人移速 -50%、攻速 -20%，持续 8 秒。' }),
  I({ id: 'lingering_regen', name: '滞留型再生药水', kind: 'lingering', target: 'area', radius: 2.5, tier: 'uncommon', price: 34, potion: true, icon: 'item_lingering_regen', color: '#ff9cc8', desc: '留下 8 秒药雾：雾中友军每秒回复 4% 最大生命。' }),
  // ── 工具 ──
  I({ id: 'wind_charge', name: '风弹', kind: 'tool', target: 'area', radius: 2.2, tier: 'uncommon', price: 30, icon: 'item_wind_charge', color: '#bfe6ff', desc: '爆开一团强风：把范围内敌人猛烈吹飞（撞下高台会摔伤），并造成少量伤害。' }),
  I({ id: 'cobweb', name: '蜘蛛网', kind: 'tool', target: 'area', radius: 1.5, tier: 'common', price: 20, icon: 'item_cobweb', color: '#e8e8e8', desc: '在目标处结出 5 格蜘蛛网，持续整场：非节肢生物经过时大幅减速。' }),
  I({ id: 'lava_bucket', name: '岩浆桶', kind: 'tool', target: 'area', radius: 1.6, tier: 'uncommon', price: 36, icon: 'item_lava_bucket', color: '#ff7a1a', desc: '倒出一摊岩浆，持续 8 秒：踏入的敌人持续燃烧（免疫燃烧的除外）。' }),
  I({ id: 'tnt', name: 'TNT', kind: 'tool', target: 'area', radius: 3, tier: 'rare', price: 45, icon: 'tnt', color: '#ff5533', desc: '点燃后 2 秒爆炸：对范围内所有单位（包括友军！）造成 160 点伤害（随幕数提升）并炸毁地形。' }),
  I({ id: 'mace', name: '重锤', kind: 'tool', target: 'area', radius: 1.5, tier: 'rare', price: 55, icon: 'item_mace', color: '#9aa4b0', desc: '从高空砸下：对落点最近的敌人造成 220 点真实伤害（随幕数提升），周围敌人被挑飞 1 秒。' }),
  I({ id: 'goat_horn', name: '山羊角', kind: 'tool', target: 'none', radius: 0, tier: 'uncommon', price: 32, icon: 'item_goat_horn', color: '#d8cfb4', desc: '吹响冲锋号：友军 8 秒内攻速 +30%、移速 +30%。' }),
  I({ id: 'ice_ball', name: '冰球', kind: 'tool', target: 'area', radius: 1.4, tier: 'common', price: 22, icon: 'item_ice_ball', color: '#bfe8ff', desc: '冬季更新的新投掷物：砸中的敌人受到伤害并被击退，冰冻 3 秒（持续伤害并减速；对烈焰人、岩浆怪伤害 ×3）。' }),
  I({ id: 'splash_freezing', name: '喷溅型冰冻药水', kind: 'splash', target: 'area', radius: 2.6, tier: 'uncommon', price: 30, potion: true, icon: 'item_splash_freezing', color: '#8fd3ff', desc: '范围内敌人冰冻 5 秒：每秒损失 2% 最大生命并减速 30%（火焰生物 ×3）。' }),
  I({ id: 'firework', name: '烟花火箭', kind: 'tool', target: 'area', radius: 2, tier: 'uncommon', price: 32, icon: 'item_firework', color: '#ff6ad5', desc: '在目标处炸开一团烟花：对范围内敌人造成 60 点伤害（随幕数提升）并击退。' }),
  I({ id: 'trident', name: '引雷三叉戟', kind: 'tool', target: 'area', radius: 1.3, tier: 'uncommon', price: 36, icon: 'item_trident', color: '#5fd6e8', desc: '掷出带引雷的三叉戟：在落点召唤闪电，造成 80 点魔法伤害（随幕数提升）。闪电会让附近的苦力怕充能！' }),
  I({ id: 'spear', name: '长矛', kind: 'tool', target: 'area', radius: 0.8, tier: 'rare', price: 50, icon: 'item_spear', color: '#c0c6cc', desc: '1.21.11 的新武器：一记冲锋突刺，贯穿从我方到落点的一条直线，每个敌人受到 110 点伤害（随幕数提升）并被撞开。' }),
  I({ id: 'honey', name: '蜂蜜块', kind: 'tool', target: 'area', radius: 1.6, tier: 'common', price: 20, icon: 'item_honey', color: '#f2a41e', desc: '摊开一片黏糊糊的蜂蜜，持续 10 秒：踩进去的地面敌人移速 -60%、攻速 -20%。' }),
  I({ id: 'pearl', name: '末影珍珠', kind: 'tool', target: 'area', radius: 1.6, tier: 'uncommon', price: 28, icon: 'ender_pearl', color: '#2f9a8a', desc: '紧急撤离：落点附近的友军全部传送回我方后排，并回复 15% 最大生命。' }),
  I({ id: 'golden_apple', name: '金苹果', kind: 'drink', target: 'none', radius: 0, tier: 'rare', price: 46, icon: 'golden_apple', color: '#ffcc33', desc: '全体友军获得 20% 最大生命的伤害吸收护盾，并在 10 秒内每秒回复 1.5% 生命。' }),
  // ── 刷怪蛋：在我方半场召唤，仅限本场 ──
  I({ id: 'egg_zombie', name: '僵尸刷怪蛋', kind: 'egg', target: 'own', radius: 1.2, tier: 'common', price: 30, spawn: ['zombie', 4], icon: 'item_egg_zombie', color: '#2aa3a3', desc: '在我方半场召唤 4 只僵尸，持续到本场战斗结束。' }),
  I({ id: 'egg_wolf', name: '狼刷怪蛋', kind: 'egg', target: 'own', radius: 1.2, tier: 'uncommon', price: 36, spawn: ['wolf', 3], icon: 'item_egg_wolf', color: '#d9d5cc', desc: '在我方半场召唤 3 只狼，持续到本场战斗结束。' }),
  I({ id: 'egg_skeleton', name: '骷髅刷怪蛋', kind: 'egg', target: 'own', radius: 1.2, tier: 'uncommon', price: 36, spawn: ['skeleton', 3], icon: 'item_egg_skeleton', color: '#c9c9c4', desc: '在我方半场召唤 3 只骷髅，持续到本场战斗结束。' }),
  I({ id: 'egg_creeper', name: '苦力怕刷怪蛋', kind: 'egg', target: 'own', radius: 1.2, tier: 'uncommon', price: 40, spawn: ['creeper', 2], icon: 'item_egg_creeper', color: '#4fae35', desc: '在我方半场召唤 2 只苦力怕：它们会冲向敌人最密集处自爆。' }),
  I({ id: 'egg_copper_golem', name: '铜傀儡刷怪蛋', kind: 'egg', target: 'own', radius: 1.2, tier: 'rare', price: 50, spawn: ['copper_golem', 2], icon: 'item_egg_copper_golem', color: '#c7703e', desc: '召唤 2 只铜傀儡（1.21.9 新生物）：头顶避雷针，每 5 秒引一道闪电劈向附近敌人。' }),
  I({ id: 'egg_iron_golem', name: '铁傀儡刷怪蛋', kind: 'egg', target: 'own', radius: 1.2, tier: 'rare', price: 80, spawn: ['iron_golem', 1], icon: 'item_egg_iron_golem', color: '#d9d5cd', desc: '召唤 1 只铁傀儡，持续到本场战斗结束。' }),
];
export const ITEM_MAP: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const ITEM_TIER_INFO: Record<ItemTier, { name: string; color: string; weight: number }> = {
  common: { name: '普通', color: '#e8e8e8', weight: 60 },
  uncommon: { name: '稀有', color: '#55c1ff', weight: 32 },
  rare: { name: '珍贵', color: '#ffb300', weight: 8 },
};

export const ITEM_KIND_NAME: Record<ItemKind, string> = {
  drink: '饮用药水 · 立即对全体友军生效',
  splash: '喷溅药水 · 扔向目标处',
  lingering: '滞留药水 · 扔向目标处',
  tool: '道具',
  egg: '刷怪蛋 · 在我方半场召唤',
};

/**
 * Random item. `boost` shifts weight toward better tiers (elites/bosses/treasure);
 * `potionOnly` keeps it to brewed potions (witch huts, brewing events).
 */
export function rollItem(r: { next(): number }, opts: { boost?: number; potionOnly?: boolean } = {}): string {
  const pool = ITEMS.filter((i) => !opts.potionOnly || i.potion);
  const b = opts.boost ?? 0;
  const w = pool.map((i) => (i.tier === 'common' ? 60 - b * 30 : i.tier === 'uncommon' ? 32 + b * 15 : 8 + b * 15));
  let x = r.next() * w.reduce((a, c) => a + c, 0);
  for (let k = 0; k < pool.length; k++) {
    x -= w[k];
    if (x < 0) return pool[k].id;
  }
  return pool[pool.length - 1].id;
}

// Older code and saves still call these "potions".
export type PotionDef = ItemDef;
export const POTIONS = ITEMS;
export const POTION_MAP = ITEM_MAP;

export type RelicTier = 'common' | 'rare' | 'legendary' | 'boss';

export interface RelicDef {
  id: string;
  name: string;
  tier: RelicTier;
  desc: string;
  /** Short flavor line. */
  flavor?: string;
  /** Exclusive to one commander (only offered in that commander's runs). */
  commander?: string;
  /** Build archetype it feeds, shown in tooltips so players can plan around it. */
  tag?: string;
}

export const RELICS: RelicDef[] = [
  // 普通
  { id: 'iron_sword', name: '铁剑', tier: 'common', desc: '近战单位攻击力 +12%。' },
  { id: 'bow', name: '弓', tier: 'common', desc: '远程单位攻击力 +12%。' },
  { id: 'iron_chestplate', name: '铁胸甲', tier: 'common', desc: '前排卡牌生命 +18%。' },
  { id: 'shield', name: '盾牌', tier: 'common', desc: '友军受到的投射物伤害 -20%。' },
  { id: 'spider_eye', name: '蜘蛛眼', tier: 'common', desc: '友方造成的中毒伤害 +60%。' },
  { id: 'blaze_rod', name: '烈焰棒', tier: 'common', desc: '友方造成的燃烧伤害 +60%，持续时间 +1 秒。' },
  { id: 'bone', name: '骨头', tier: 'common', desc: '亡灵卡牌出战数量 +1（仅限数量 ≥2 的卡牌）。' },
  { id: 'saddle', name: '鞍', tier: 'common', desc: '野兽单位移速 +25%，首次攻击伤害翻倍。' },
  { id: 'emerald_block', name: '绿宝石块', tier: 'common', desc: '每场战斗胜利额外获得 8 绿宝石。' },
  { id: 'rabbit_foot', name: '兔子脚', tier: 'common', desc: '开箱时品质升档几率 +6%。' },
  { id: 'golden_apple', name: '金苹果', tier: 'common', desc: '获得时：生命上限 +1 并回复 1 颗心。' },
  { id: 'honey_bottle', name: '蜂蜜瓶', tier: 'common', desc: '友军免疫中毒与饥饿。' },
  { id: 'clock', name: '时钟', tier: 'common', desc: '开战 20 秒后，友军攻速 +25%。' },
  { id: 'lead', name: '拴绳', tier: 'common', desc: '召唤物、分裂体与感染单位属性 +35%。' },
  // 稀有
  { id: 'diamond_sword', name: '钻石剑', tier: 'rare', desc: '所有友军 +12% 暴击率（暴击造成 175% 伤害）。' },
  { id: 'spyglass', name: '望远镜', tier: 'rare', desc: '远程单位射程 +20%，对 250 距离外目标伤害 +15%。' },
  { id: 'bell', name: '钟', tier: 'rare', desc: '开战时敲响：所有敌人发光 6 秒，期间受到伤害 +20%。' },
  { id: 'tnt', name: 'TNT', tier: 'rare', desc: '开战 2 秒后在敌方最密集处引爆，造成 100 点伤害（随幕数提升）。' },
  { id: 'gunpowder', name: '火药', tier: 'rare', desc: '友军阵亡时 30% 几率爆炸，对周围敌人造成其最大生命 25% 的伤害。' },
  { id: 'ender_pearl', name: '末影珍珠', tier: 'rare', desc: '后排单位首次被近战攻击时，传送回己方后方。' },
  { id: 'compass', name: '指南针', tier: 'rare', desc: '战斗胜利后的开箱奖励额外多 1 个选项。' },
  { id: 'heart_of_the_sea', name: '海洋之心', tier: 'rare', desc: '水生羁绊计数 +1；水生单位生命 +20%。' },
  { id: 'turtle_helmet', name: '海龟壳', tier: 'rare', desc: '每场战斗中，首个阵亡的友方单位以 50% 生命复活。' },
  { id: 'trial_key', name: '试炼钥匙', tier: 'rare', desc: '精英战斗胜利额外获得 1 次开箱。' },
  { id: 'music_disc', name: '唱片「Pigstep」', tier: 'rare', desc: '下界单位攻速 +20%；下界羁绊计数 +1。' },
  { id: 'crafting_table', name: '工作台', tier: 'rare', desc: '营火处可以执行两个行动。' },
  { id: 'lapis', name: '青金石', tier: 'rare', desc: '附魔效果 +50%。' },
  { id: 'gold_ingot', name: '金锭', tier: 'rare', desc: '商店价格 -15%，商店多上架 1 件商品。' },
  // 传说
  { id: 'totem', name: '不死图腾', tier: 'legendary', desc: '生命归零时，以 2 颗心复活一次（随后碎裂）。' },
  { id: 'enchanted_apple', name: '附魔金苹果', tier: 'legendary', desc: '开战时友军获得 30% 最大生命的伤害吸收护盾。' },
  { id: 'beacon', name: '信标', tier: 'legendary', desc: '所有友军生命、攻击力、攻速 +10%。' },
  { id: 'elytra', name: '鞘翅', tier: 'legendary', desc: '每幕一次：在地图上飞往下一层的任意节点。' },
  { id: 'dragon_egg', name: '龙蛋', tier: 'legendary', desc: '开出金色品质的几率 ×2，红色品质 ×1.5。' },
  // 流派宝物：让某种打法越滚越强（需要相应的生物或物品来启动）
  { id: 'magma_cream', name: '岩浆膏', tier: 'rare', tag: '燃烧流', desc: '燃烧中的敌人死亡时爆炸：对周围敌人造成其最大生命 20% 的伤害并点燃。' },
  { id: 'pufferfish', name: '河豚', tier: 'rare', tag: '剧毒流', desc: '中毒的敌人死亡时，身上的毒扩散给周围 2 名敌人。' },
  { id: 'spawner', name: '刷怪笼', tier: 'rare', tag: '数量流', desc: '每 10 秒，你出战数量最多的卡牌额外生成 1 只单位（每场最多 4 只）。' },
  { id: 'dripstone', name: '滴水石锥', tier: 'common', tag: '击退流', desc: '敌人的摔落伤害 ×3；被击退撞上障碍物（树、墙、柱子）的敌人受到 6% 最大生命伤害并眩晕 0.5 秒。' },
  { id: 'fire_charge', name: '火焰弹', tier: 'rare', tag: '爆破流', desc: '友方造成的爆炸（苦力怕、恶魂、凋灵、TNT、火药……）范围 +30%、伤害 +25%。' },
  { id: 'lookout', name: '瞭望塔', tier: 'common', tag: '高地流', desc: '站在高处（高度 ≥1）的友方远程单位攻速 +20%。' },
  { id: 'blue_ice', name: '蓝冰', tier: 'rare', tag: '冰冻流', desc: '冰冻中的敌人受到的伤害 +25%；友方造成的冰冻多持续 1 秒。' },
  { id: 'ender_eye', name: '末影之眼', tier: 'rare', tag: '末影流', desc: '友军每次瞬移（末影人传送、闪避闪烁、潜影贝跳跃、末影珍珠……）后的下一次攻击必定暴击，并且伤害翻倍。' },
  { id: 'soul_lantern', name: '灵魂灯笼', tier: 'rare', tag: '复生流', desc: '复活的友军（亡灵复生、海龟壳、重生锚）以 70% 生命归来，并获得 +30% 攻击力。' },
  { id: 'ominous_banner', name: '不祥旗帜', tier: 'rare', tag: '灾厄流', desc: '每有一名其他灾厄村民友军存活，灾厄村民攻击力 +4%（最多 +32%）。' },
  { id: 'netherite_plate', name: '下界合金胸甲', tier: 'legendary', tag: '坦克流', desc: '坦克卡牌生命 +20%；生命高于一半的友军受到伤害 -15%。' },
  { id: 'lightning_rod', name: '避雷针', tier: 'rare', tag: '雷电流', desc: '友方召唤的闪电（引雷、三叉戟、铜傀儡、水生雷暴、潮涌核心）伤害 +40%，并会再劈向附近一名敌人。' },
  { id: 'echo_shard', name: '回响碎片', tier: 'legendary', tag: '献祭流', desc: '每有一名友方单位阵亡，所有友军攻击力 +3%（本场叠加，最多 +30%）。' },
  // 统领专属宝物
  { id: 'scaffolding', name: '脚手架', tier: 'common', commander: 'steve', tag: '建造', desc: '「建造」次数 +2。' },
  { id: 'obsidian', name: '黑曜石', tier: 'rare', commander: 'steve', tag: '建造', desc: '你建造的墙改用黑曜石：无法被炸毁；土台改为 3 格高。' },
  { id: 'cactus', name: '仙人掌', tier: 'rare', commander: 'steve', tag: '建造', desc: '你建造的墙长满尖刺：每秒对贴着墙的敌人造成伤害（随幕数提升）。' },
  { id: 'dispenser', name: '发射器', tier: 'rare', commander: 'steve', tag: '建造', desc: '你建造的每段墙顶上装一台发射器：每 2.5 秒向射程内的敌人射箭（只有远程能打掉它）。' },
  { id: 'name_tag', name: '命名牌', tier: 'common', commander: 'alex', tag: '驯服', desc: '「驯服」次数 +1。' },
  { id: 'wheat', name: '小麦', tier: 'common', commander: 'alex', tag: '驯服', desc: '被驯服的生物立刻回满生命，攻击力 +30%。' },
  { id: 'hay_bale', name: '干草捆', tier: 'rare', commander: 'alex', tag: '野兽', desc: '野兽卡牌出战数量 +1。' },
  { id: 'fishing_rod', name: '钓竿', tier: 'rare', commander: 'alex', tag: '驯服', desc: '「驯服」的生命门槛 +20%：更容易驯服强大的敌人。' },
  { id: 'trading_post', name: '交易站', tier: 'common', commander: 'villager', tag: '订购', desc: '「订购」价格 -30%，每家商店可以订购 2 次。' },
  { id: 'bell_tower', name: '钟楼', tier: 'rare', commander: 'villager', tag: '铁傀儡', desc: '「雇佣铁傀儡」不再花费绿宝石，召唤的铁傀儡属性 +30%。' },
  { id: 'emerald_ore', name: '绿宝石矿石', tier: 'rare', commander: 'villager', tag: '利息', desc: '利息提高到 15%，上限提高到 30。' },
  { id: 'brewing_stand', name: '酿造台', tier: 'common', commander: 'witch', tag: '药剂', desc: '「坩埚」每场多熬 1 瓶限定药水。' },
  { id: 'blaze_powder', name: '烈焰粉', tier: 'rare', commander: 'witch', tag: '药剂', desc: '你的药水效果再 +30%（可与龙息叠加）。' },
  { id: 'fermented_eye', name: '发酵蛛眼', tier: 'rare', commander: 'witch', tag: '剧毒流', desc: '中毒或虚弱的敌人受到的所有伤害 +20%。' },
  // 首领
  { id: 'nether_star', name: '下界之星', tier: 'boss', desc: '友军攻击力与生命 +25%；但每场战斗开始时，生命最高的友方卡牌受到凋零 5 秒。' },
  { id: 'respawn_anchor', name: '重生锚', tier: 'boss', desc: '每场战斗中首张全灭的友方卡牌以 50% 生命全员复活；生命上限 -1。' },
  { id: 'ominous_bottle', name: '不祥之瓶', tier: 'boss', desc: '敌人属性 +12%；但开箱品质升档几率 +15%，战斗绿宝石 +30%。' },
  { id: 'sculk_catalyst', name: '幽匿催发体', tier: 'boss', desc: '任意敌人死亡时，所有友军回复 2% 最大生命；但无法在营火休息。' },
  { id: 'conduit', name: '潮涌核心', tier: 'boss', desc: '每 3 秒对一名随机敌人造成 45 点雷击伤害（随幕数提升）；商店价格 +20%。' },
  { id: 'dragon_breath', name: '龙息', tier: 'boss', desc: '药水类物品效果翻倍，物品栏 +1；但战斗不再掉落物品。' },
];
export const RELIC_MAP = Object.fromEntries(RELICS.map((r) => [r.id, r]));

export const RELIC_TIER_INFO: Record<RelicTier, { name: string; color: string; price: number }> = {
  common: { name: '普通', color: '#e8e8e8', price: 90 },
  rare: { name: '稀有', color: '#55c1ff', price: 140 },
  legendary: { name: '传说', color: '#ffb300', price: 220 },
  boss: { name: '首领', color: '#ff4d6d', price: 260 },
};

export { COMMANDERS, COMMANDER_MAP, SKILL_INFO, type CommanderDef, type SkillId } from './commanders.ts';

export interface OmenDef {
  level: number;
  name: string;
  /** Short theme of the level. */
  title: string;
  /** What this level adds (every level keeps all the rules below it). */
  rules: string[];
  /** One-line summary (older UI, run history). */
  desc: string;
}

/**
 * Like Slay the Spire's Ascension: each level keeps every rule below it and adds new ones,
 * alternating between tougher enemies and a leaner run, so the climb changes how a run plays
 * rather than only inflating numbers. Tuned with the bot to lose a similar share of clears per
 * level (see README).
 */
export const OMEN_SCALING = '难度越高，敌人会稳步强化；每级仍提供开箱幸运 +2%，得分 +20%。';

/** Explicit cumulative multipliers keep high difficulty readable and prevent hidden double scaling. */
export const OMEN_ENEMY_MULS = [
  { hp: 1, atk: 1 },
  { hp: 1.05, atk: 1.03 },
  { hp: 1.1, atk: 1.06 },
  { hp: 1.16, atk: 1.1 },
  { hp: 1.23, atk: 1.14 },
  { hp: 1.31, atk: 1.19 },
] as const;

const O = (level: number, name: string, title: string, rules: string[]): OmenDef => ({ level, name, title, rules, desc: rules.join(' ') });

export const OMENS: OmenDef[] = [
  O(1, '不祥之兆 I', '精英出没', ['地图上的精英战更多，第 3 层起就会出现。']),
  O(2, '不祥之兆 II', '精英词缀', ['精英战的敌人带一个随机词缀：再生、荆棘、迅捷、坚韧或嗜血。']),
  O(3, '不祥之兆 III', '物资紧缺', ['开局少 1 颗心，物品栏 -1，商店价格 +15%。', '普通战斗中有一张敌方卡牌带随机附魔（II 级）。']),
  O(4, '不祥之兆 IV', '精锐护卫', ['休息只回复 1 颗心。', '精英战和首领战中也有一张敌方卡牌带随机附魔（II 级）。']),
  O(5, '不祥之兆 V', '末日', ['首领生命低于一半时狂暴：攻速 +30%、受到伤害 -15%，并召唤一队护卫。']),
];

/** Elite affixes (不祥之兆 II+): one per elite fight, on every enemy card. */
export interface AffixDef {
  id: string;
  name: string;
  desc: string;
  color: string;
}
export const AFFIXES: AffixDef[] = [
  { id: 'regen', name: '再生', desc: '敌人每秒回复 1.2% 最大生命。', color: '#ff7eb6' },
  { id: 'thorns', name: '荆棘', desc: '敌人反弹 15% 受到的近战伤害。', color: '#55efc4' },
  { id: 'swift', name: '迅捷', desc: '敌人移速 +20%，攻速 +8%。', color: '#7fd8ff' },
  { id: 'sturdy', name: '坚韧', desc: '敌人受到的伤害 -10%，且不会被击退。', color: '#c8c8c8' },
  { id: 'bloodlust', name: '嗜血', desc: '敌人攻击力 +6%，并获得 10% 吸血。', color: '#ff5a5a' },
];
export const AFFIX_MAP: Record<string, AffixDef> = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

/** Enchantments enemies may carry on 不祥之兆 III+ (none that only pay out emeralds or need a matchup). */
export const ENEMY_ENCHANTS = ENCHANTS.map((e) => e.id).filter((id) => !['looting', 'smite', 'bane'].includes(id));
