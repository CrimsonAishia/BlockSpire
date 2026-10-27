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
      { n: 2, desc: '亡灵单位造成实际伤害的 20% 转化为同族伤员恢复池，最大生命 +15%。' },
      { n: 4, desc: '恢复池提升至 25%；亡灵首次致死以 45% 最大生命复生一次，复生后 3 秒减伤 20%，并在 5 秒内攻速 +20%。' },
      { n: 6, desc: '复生提升至 55% 最大生命；攻击附加 10% 凋零（3秒，目标受疗 -50%）；亡灵阵亡或首次复生时，其他亡灵获得 6% 攻击力与 5% 护盾（最多4层，全队2秒CD）。' },
    ],
  },
  arthropod: {
    id: 'arthropod', name: '节肢', color: '#b0794c', glyph: '✱',
    tiers: [
      { n: 2, desc: '节肢单位攻速 +25%，普攻附加剧毒（max(3, 攻击力×25%)/秒，3 秒，最多 3 层）。' },
      { n: 4, desc: '中毒上限提升至 5 层；攻击使目标护甲 -4%（4 秒，最多 6 层，1 秒冷却）；攻击 5 层中毒目标额外造成 15% 基础伤害的真实伤害。' },
    ],
  },
  illager: {
    id: 'illager', name: '灾厄', color: '#9aa3a8', glyph: '⚑',
    tiers: [
      { n: 2, desc: '常驻攻击 +12%、生命 +10%；首次造成或受到伤害获得 20% 攻速（5 秒）；对生命低于 50% 敌人伤害 +20%（低于 25% 提升至 +35%）。' },
      { n: 4, desc: '首次有效接敌及此后每 7 秒吹响战阵号角（攻击+22%、受击-15%、移速+20%，持续 5 秒）并唤出 2 只灵质恼鬼（持续 6 秒）；号角期击杀延长时间并获护盾。' },
      { n: 6, desc: '号角周期缩至 6 秒；每次唤出 3 只灵质恼鬼（持续 6 秒）；敌方常驻易伤 +12% 且每死一敌灾厄永久 +2% 攻击；施法者急速 +20%，近战获 15% 吸血。' },
    ],
  },
  nether: {
    id: 'nether', name: '下界', color: '#ff7a3d', glyph: '♨',
    tiers: [
      { n: 2, desc: '下界单位免疫燃烧，攻击点燃敌人（max(4, 攻击力×25%)/秒，2 秒）。' },
      { n: 4, desc: '下界单位对燃烧敌人伤害 +30%；友方燃烧伤害提升 50%；下界单位对燃烧目标获得 20% 吸血。' },
      { n: 6, desc: '燃烧敌人死亡触发范围火伤殉爆；开战 4 秒及此后每 7 秒，向敌方密集区域降下一根熔岩地火柱。' },
    ],
  },
  ender: {
    id: 'ender', name: '末影', color: '#c06bff', glyph: '◈',
    tiers: [
      { n: 2, desc: '末影单位有 30% 几率闪避投射物，非 DOT 伤害 +12%。' },
      { n: 4, desc: '开战 3.5 秒向敌方侧后翼突袭；闪避或瞬移后下一次攻击必暴击且伤害提升 35%；击杀后立即瞬移至敌方后排身侧。' },
    ],
  },
  construct: {
    id: 'construct', name: '构造体', color: '#c9c9c9', glyph: '▣',
    tiers: [
      { n: 2, desc: '构造体单位护甲 +20%，开战获得自身最大生命 10% 护盾（8 秒）。' },
      { n: 4, desc: '开战 4 秒及此后每 5 秒，为生命比例最低的 2 名不同友军施加 18% 目标最大生命护盾（5 秒）。' },
      { n: 6, desc: '周期护盾每轮保护 3 名不同友军且额度提升至 22%；构造体护盾耗尽时释放脉冲，造成 80% 攻击力伤害并削减周围敌人 6% 护甲。' },
    ],
  },
  beast: {
    id: 'beast', name: '野兽', color: '#e0b25b', glyph: '❦',
    tiers: [
      { n: 2, desc: '野兽单位移速 +25%，攻速 +20%。' },
      { n: 4, desc: '首次接敌自带 1 层觉醒；任一野兽击杀非召唤敌人，全队野兽攻击 +8%（最多 5 层，全队 2 秒冷却）；开战 4 秒后每 6 秒保底增加 1 层；暴击率 +12%。' },
      { n: 6, desc: '开战自带 3 层觉醒（上限提升至 6 层）；满层时移速额外提升 15%，攻击附带 15% 撕裂流血（3 秒）。' },
    ],
  },
  aquatic: {
    id: 'aquatic', name: '水生', color: '#3fc6d6', glyph: '≋',
    tiers: [
      { n: 2, desc: '水生单位每秒回复 2% 最大生命，开战获得自身最大生命 10% 护盾（8 秒）。' },
      { n: 4, desc: '开战 4 秒及此后每 3.5 秒落雷打击随机敌人（45 + min(目标最大生命×6%, 3×水生平均攻击)），并治疗最低生命水生单位 8% 最大生命。' },
      { n: 6, desc: '落雷周期缩短至 2.5 秒并产生范围溅射；开战 5 秒后每 8 秒掀起一道潮水，将敌方前排推开 1 格并施加 25% 减速。' },
    ],
  },
  slime: {
    id: 'slime', name: '史莱姆', color: '#7ed957', glyph: '◼',
    tiers: [
      { n: 2, desc: '分裂体数量 +1（基础子体继承约 47% 生命与 72% 攻击）。' },
      { n: 3, desc: '原始史莱姆最大生命 +20%；第一代分裂生成的子体获得自身最大生命 15% 护盾（4 秒），分裂着地时将周围近战弹开。' },
    ],
  },
  sift: {
    id: 'sift', name: '筛界', color: '#ff8fb1', glyph: '❀',
    tiers: [
      { n: 2, desc: '筛界单位免疫「灵魂潮汐」；普攻附加回响：目标受到的下一次非 DOT 伤害 +20%。' },
      { n: 4, desc: '敌人阵亡被最近筛界吸收回复 12% 生命并提升 2% 攻击（最多 5 层）；开战 4 秒及每 6 秒治疗 2 名筛界成员各 4% 生命。' },
      { n: 6, desc: '回响增伤提升至 +32% 且产生共振范围波；每 9 秒在敌方最密集处开启一道持续 3 秒的微型聚怪虚空引力点。' },
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
