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
      { n: 2, desc: '亡灵单位获得 12% 吸血。' },
      { n: 3, desc: '亡灵单位首次阵亡时有 35% 几率以 40% 生命复活。' },
      { n: 4, desc: '吸血提升至 20%，复活几率提升至 60%。' },
    ],
  },
  arthropod: {
    id: 'arthropod', name: '节肢', color: '#b0794c', glyph: '✱',
    tiers: [
      { n: 2, desc: '节肢单位攻速 +20%。' },
      { n: 3, desc: '节肢单位攻击附加中毒（3/秒，3 秒，可叠加 2 层）。' },
    ],
  },
  illager: {
    id: 'illager', name: '灾厄', color: '#9aa3a8', glyph: '⚑',
    tiers: [
      { n: 2, desc: '灾厄单位对生命高于 60% 的敌人伤害 +25%。' },
      { n: 3, desc: '开战时召唤 3 只恼鬼助战。' },
      { n: 4, desc: '开战召唤 6 只恼鬼，灾厄单位伤害加成提升至 +35%。' },
    ],
  },
  nether: {
    id: 'nether', name: '下界', color: '#ff7a3d', glyph: '♨',
    tiers: [
      { n: 2, desc: '下界单位免疫燃烧，攻击点燃敌人（4/秒，2 秒）。' },
      { n: 3, desc: '下界单位对燃烧中的敌人伤害 +25%。' },
      { n: 4, desc: '所有友方燃烧伤害翻倍。' },
    ],
  },
  ender: {
    id: 'ender', name: '末影', color: '#c06bff', glyph: '◈',
    tiers: [
      { n: 2, desc: '末影单位有 30% 几率瞬移闪避投射物。' },
      { n: 3, desc: '闪避后的下一次攻击必定暴击；开战时末影单位闪现到敌方侧翼。' },
    ],
  },
  construct: {
    id: 'construct', name: '构造体', color: '#c9c9c9', glyph: '▣',
    tiers: [
      { n: 2, desc: '构造体单位护甲 +15%。' },
      { n: 3, desc: '每 6 秒为生命最低的友军施加 20% 最大生命的护盾。' },
    ],
  },
  beast: {
    id: 'beast', name: '野兽', color: '#e0b25b', glyph: '❦',
    tiers: [
      { n: 2, desc: '野兽单位移速与攻速 +15%。' },
      { n: 3, desc: '野兽单位每次击杀攻击 +12%（本场叠加，最多 5 层）。' },
    ],
  },
  aquatic: {
    id: 'aquatic', name: '水生', color: '#3fc6d6', glyph: '≋',
    tiers: [
      { n: 2, desc: '水生单位每秒回复 1.5% 最大生命。' },
      { n: 3, desc: '召唤雷暴：每 4 秒落雷打击随机敌人。' },
    ],
  },
  slime: {
    id: 'slime', name: '史莱姆', color: '#7ed957', glyph: '◼',
    tiers: [{ n: 2, desc: '分裂体数量 +1，属性 +30%。' }],
  },
  sift: {
    id: 'sift', name: '筛界', color: '#ff8fb1', glyph: '❀',
    tiers: [
      { n: 2, desc: '筛界单位免疫「灵魂潮汐」；攻击附加回响：目标受到的下一次伤害 +15%。' },
      { n: 3, desc: '敌人阵亡时留下一缕灵魂，被最近的筛界友军吸收，回复其 12% 生命。' },
    ],
  },
};

export const FAMILY_LIST = Object.values(FAMILIES);

/** Returns active tier index (0-based) per family for a list of distinct fielded mob families. */
export function computeSynergies(familyLists: Family[][], bonus: Partial<Record<Family, number>> = {}) {
  const counts = {} as Record<Family, number>;
  for (const fams of familyLists) for (const f of fams) counts[f] = (counts[f] || 0) + 1;
  for (const [f, b] of Object.entries(bonus)) counts[f as Family] = (counts[f as Family] || 0) + (b || 0);
  const active = {} as Record<Family, number>;
  for (const f of Object.keys(counts) as Family[]) {
    const def = FAMILIES[f];
    let tier = -1;
    def.tiers.forEach((t, i) => {
      if (counts[f] >= t.n) tier = i;
    });
    active[f] = tier;
  }
  return { counts, active };
}
