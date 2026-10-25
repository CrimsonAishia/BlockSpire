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
      { n: 2, desc: '亡灵单位获得 16% 吸血，最大生命 +10%。' },
      { n: 3, desc: '亡灵单位首次致死时必定以 35% 最大生命复生一次，并在 5 秒内攻速 +15%。' },
      { n: 4, desc: '吸血提升至 22%，复生生命提升至 50%。' },
    ],
  },
  arthropod: {
    id: 'arthropod', name: '节肢', color: '#b0794c', glyph: '✱',
    tiers: [
      { n: 2, desc: '节肢单位攻速 +25%。' },
      { n: 3, desc: '节肢单位普攻附加中毒（max(3, 攻击力×25%)/秒，3 秒，最多 3 层）。' },
      { n: 4, desc: '获得「虫群蚀甲」：节肢卡每秒至多使目标护甲 -6%，持续 4 秒，最多 3 层。' },
    ],
  },
  illager: {
    id: 'illager', name: '灾厄', color: '#9aa3a8', glyph: '⚑',
    tiers: [
      { n: 2, desc: '灾厄单位对生命高于 50% 的敌人伤害 +30%。' },
      { n: 3, desc: '开战召唤 3 只恼鬼助战，灾厄单位攻击力 +10%。' },
      { n: 4, desc: '开战召唤 6 只恼鬼，高血量增伤提升至 +35%，灾厄单位额外攻速 +15%。' },
    ],
  },
  nether: {
    id: 'nether', name: '下界', color: '#ff7a3d', glyph: '♨',
    tiers: [
      { n: 2, desc: '下界单位免疫燃烧，攻击点燃敌人（max(4, 攻击力×25%)/秒，2 秒）。' },
      { n: 3, desc: '下界单位对燃烧中的敌人伤害 +30%。' },
      { n: 4, desc: '所有友方燃烧伤害翻倍；下界单位对燃烧目标获得 10% 吸血。' },
    ],
  },
  ender: {
    id: 'ender', name: '末影', color: '#c06bff', glyph: '◈',
    tiers: [
      { n: 2, desc: '末影单位有 30% 几率闪避投射物，非 DOT 伤害 +10%。' },
      { n: 3, desc: '末影单位开场首次有效攻击必暴击；闪避后下一次攻击必暴击；开战侧翼闪现。' },
    ],
  },
  construct: {
    id: 'construct', name: '构造体', color: '#c9c9c9', glyph: '▣',
    tiers: [
      { n: 2, desc: '构造体单位护甲 +20%，开战获得自身最大生命 8% 护盾（6 秒）。' },
      { n: 3, desc: '首次 1 秒及此后每 5 秒，为生命比例最低的友军施加 20% 目标最大生命护盾（5 秒）。' },
      { n: 4, desc: '周期护盾每轮保护 2 名不同友军，单人额度提升至 25% 最大生命。' },
    ],
  },
  beast: {
    id: 'beast', name: '野兽', color: '#e0b25b', glyph: '❦',
    tiers: [
      { n: 2, desc: '野兽单位移速 +15%，攻速 +20%。' },
      { n: 3, desc: '任一野兽击杀非召唤敌人，全体野兽攻击 +8%（最多 5 层，全队 2 秒冷却）；每 10 秒保底补 1 层（最多 3 层）。' },
      { n: 4, desc: '每层攻击提升至 +10%，开战自带 2 层（上限仍为 5 层）。' },
    ],
  },
  aquatic: {
    id: 'aquatic', name: '水生', color: '#3fc6d6', glyph: '≋',
    tiers: [
      { n: 2, desc: '水生单位每秒回复 2% 最大生命，开战获得自身最大生命 10% 护盾（6 秒）。' },
      { n: 3, desc: '召唤雷暴：首次 2.5 秒及此后每 4 秒落雷打击随机敌人（40 + min(目标最大生命×6%, 3×水生平均攻击)）。' },
      { n: 4, desc: '落雷周期缩短至 3 秒；每次雷击后治疗生命比例最低的两名水生单位各 8% 最大生命。' },
    ],
  },
  slime: {
    id: 'slime', name: '史莱姆', color: '#7ed957', glyph: '◼',
    tiers: [
      { n: 2, desc: '分裂体数量 +1，属性系数 ×1.3。' },
      { n: 3, desc: '首次分裂生成的第一代子体获得自身最大生命 15% 护盾（4 秒）。' },
    ],
  },
  sift: {
    id: 'sift', name: '筛界', color: '#ff8fb1', glyph: '❀',
    tiers: [
      { n: 2, desc: '筛界单位免疫「灵魂潮汐」；普攻附加回响：目标受到的下一次非 DOT 伤害 +20%。' },
      { n: 3, desc: '敌人阵亡被最近筛界吸收回复 12% 生命；首次 3 秒及每 6 秒治疗最低生命筛界成员 8% 最大生命。' },
      { n: 4, desc: '回响增伤提升至 +30%；周期治疗改为 2 名不同成员各回复 12% 最大生命。' },
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
