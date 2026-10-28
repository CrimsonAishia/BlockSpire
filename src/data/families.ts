import type { Family } from '../core/types.ts';

export interface FamilyDef {
  id: Family;
  name: string;
  color: string;
  glyph: string;
  tiers: { n: number; desc: string }[];
}

export const FAMILIES: Record<Family, FamilyDef> = {
  undead: {
    id: 'undead', name: '亡灵', color: '#8fbf6a', glyph: '☠',
    tiers: [
      { n: 2, desc: '亡灵单位最大生命 +12%；实际伤害的 15% 转化为同族伤员恢复池。' },
      { n: 3, desc: '恢复池提升至 25%；亡灵首次致死以 45% 最大生命复生一次，复生释放白骨冲击击退周围敌军并使目标攻速 -25%（3 秒）。' },
      { n: 5, desc: '复生提升至 55% 最大生命且减伤 30%（3 秒）；攻击附加 12% 凋零（3 秒，受疗 -50%）；亡灵阵亡或首次复生时，其他亡灵获得 8% 攻击力与 6% 护盾（最多 4 层）。' },
    ],
  },
  arthropod: {
    id: 'arthropod', name: '节肢', color: '#b0794c', glyph: '✱',
    tiers: [
      { n: 2, desc: '节肢单位攻速 +20%，普攻附加剧毒（max(3, 攻击力×25%)/秒，3 秒，最多 3 层）。' },
      { n: 3, desc: '普攻具备穿透效果（穿透 2 名敌军）；中毒上限提升至 5 层；每层毒使目标护甲 -5% 且减速 4%。' },
      { n: 4, desc: '致命毒爆：攻击 5 层中毒目标额外造成相当于目标已损失生命 15% 的真实伤害（单次上限 250% 自身攻击），并向周围溅射剧毒。' },
    ],
  },
  illager: {
    id: 'illager', name: '灾厄', color: '#9aa3a8', glyph: '⚑',
    tiers: [
      { n: 2, desc: '战意：原生灾厄攻击 +10%、生命 +10%；对生命不高于 40% 的敌人伤害 +20%（斩杀）。' },
      { n: 3, desc: '袭击号角：原生灾厄首次接敌时（最迟开战 4 秒），此后每 7.5 秒发动号角：攻击 +18%、攻速 +18%、移速 +15%、减伤 12%，持续 4 秒；在当前交战目标身旁召唤 1 只灵质恼鬼（持续 5 秒）。号角期首次击杀非召唤敌人续时 1.5 秒。' },
      { n: 5, desc: '全面袭击：号角周期缩至 6.5 秒，每轮恼鬼增至 2 只；每次号角为全体原生灾厄提供 15% 最大生命护盾（5 秒）；原生灾厄近战获得 12% 吸血；非 DOT 伤害 +12%。' },
    ],
  },
  nether: {
    id: 'nether', name: '下界', color: '#ff7a3d', glyph: '♨',
    tiers: [
      { n: 2, desc: '下界单位免疫燃烧，攻击点燃敌人（max(4, 攻击力×25%)/秒，2.5 秒）；暴击率 +15%。' },
      { n: 3, desc: '下界单位对燃烧敌人伤害 +25%；友方燃烧伤害提升 50%；下界单位对燃烧目标获得 15% 吸血。' },
      { n: 5, desc: '对燃烧敌人伤害提升至 +45%；燃烧敌人死亡触发范围火伤殉爆；开战 4 秒及此后每 6 秒降下一道熔岩地火柱。' },
    ],
  },
  ender: {
    id: 'ender', name: '末影', color: '#c06bff', glyph: '◈',
    tiers: [
      { n: 2, desc: '末影单位获得 35% 远程投射闪避，15% 攻击闪避；非 DOT 伤害 +12%。' },
      { n: 3, desc: '虚空相位：闪避或背刺时伤害提升 30%；击杀敌人后立即瞬移至敌方后排虚弱目标身侧。' },
      { n: 4, desc: '刺客突袭：开战 3 秒全体末影瞬移至敌方侧后翼后排；从后方发动的首次攻击必造成 200% 暴击并使目标沉默 2 秒。' },
    ],
  },
  construct: {
    id: 'construct', name: '构造体', color: '#c9c9c9', glyph: '▣',
    tiers: [
      { n: 2, desc: '构造体单位护甲 +20%，开战获得自身最大生命 15% 护盾（8 秒）。' },
      { n: 3, desc: '护盾提升至 30%；持有护盾期间反弹 25% 承受伤害；开战 4 秒及每 5 秒为生命比例最低的 2 名友军施加 20% 护盾（5 秒）。' },
      { n: 5, desc: '开战护盾提升至 50%，护盾反弹提升至 35%；周期护盾保护 3 名友军；护盾耗尽时释放电磁震荡，造成 100% 攻击力范围伤害并眩晕周围敌人 1 秒。' },
    ],
  },
  beast: {
    id: 'beast', name: '野兽', color: '#e0b25b', glyph: '❦',
    tiers: [
      { n: 2, desc: '野兽单位移速 +25%，攻速 +20%。' },
      { n: 3, desc: '猎手印记：野兽每次攻击为目标施加 1 层印记（最多 5 层）；野兽攻击印记目标每层增伤 4% 且自身吸血 3%；满层引爆造成 15% 撕裂真实伤害。' },
      { n: 5, desc: '印记上限提升至 6 层，每层增伤 6%；击杀敌人全队野兽回复 12% 最大生命并获得 12% 攻击力（持续 6 秒，可叠 3 层）。' },
    ],
  },
  aquatic: {
    id: 'aquatic', name: '水生', color: '#3fc6d6', glyph: '≋',
    tiers: [
      { n: 2, desc: '潮汐恩赐：水生单位每秒回复 2.5% 最大生命，开战获得自身最大生命 12% 护盾（8 秒）。' },
      { n: 3, desc: '天雷惩击：开战 3.5 秒及此后每 3 秒召唤天雷轰击随机敌军，造成 60 + 目标当前生命 8% 的雷电伤害，并使目标触电感电（受雷伤与法伤 +20%）。' },
      { n: 4, desc: '全场风暴：落雷周期缩短至 2 秒且附带 1 秒瘫痪；每 7 秒掀起狂涛，将敌方前排击退 2 格并使其受水生伤害 +30%（4 秒）。' },
    ],
  },
  slime: {
    id: 'slime', name: '史莱姆', color: '#7ed957', glyph: '◼',
    tiers: [
      { n: 2, desc: '分裂体数量 +1（基础子体继承约 47% 生命与 72% 攻击）。' },
      { n: 3, desc: '原始史莱姆最大生命 +25%；第一代分裂生成的子体获得自身最大生命 20% 护盾（4 秒），分裂着地时将周围近战弹开 1.5 格。' },
    ],
  },
  sift: {
    id: 'sift', name: '筛界', color: '#ff8fb1', glyph: '❀',
    tiers: [
      { n: 2, desc: '虚空屏障：筛界单位全伤害抗性 +15%；普攻削弱目标 20% 魔法抗性与护甲（持续 4 秒）。' },
      { n: 3, desc: '时空坍缩：每 6 秒在敌方最密集处开启持续 3.5 秒的时空坍缩点，牵引周围敌军并造成每秒 8% 最大生命的真实伤害；敌人阵亡被最近筛界吸收回复 15% 生命并获得 10% 攻击力。' },
    ],
  },
};

export const FAMILY_LIST = Object.values(FAMILIES);

/** Returns active tier index (0-based) per family for a list of distinct fielded mob families. */
export function computeSynergies(familyLists: Family[][], bonus: Partial<Record<Family, number>> = {}) {
  const counts = {} as Record<Family, number>;
  for (const fams of familyLists) for (const f of fams) counts[f] = (counts[f] || 0) + 1;
  for (const [f, b] of Object.entries(bonus)) {
    const fam = f as Family;
    // 至少有 1 种真实出战成员才能启动对应羁绊
    if ((counts[fam] || 0) > 0) counts[fam] = (counts[fam] || 0) + (b || 0);
  }
  const active = {} as Record<Family, number>;
  for (const f of Object.keys(counts) as Family[]) {
    const def = FAMILIES[f];
    let tier = -1;
    if (def) {
      def.tiers.forEach((t, i) => {
        if (counts[f] >= t.n) tier = i;
      });
    }
    active[f] = tier;
  }
  return { counts, active };
}
