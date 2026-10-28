// 生物印记与融合系统 (Unit Essence & Sigil Fusion)
// 允许献祭副卡，将其独特技能印记赋予主力卡牌，打造深度定制化单位。
// 印记按副卡星级分为 I阶(★1基础)、II阶(★2进阶)、III阶(★3极阶质变)。

export interface SigilDef {
  id: string;
  mob: string;
  name: string;
  desc: string;
  tierDesc: Record<number, string>;
  family?: string;
}

export const SIGILS: SigilDef[] = [
  {
    id: 'creeper',
    mob: 'creeper',
    name: '苦力怕之印 · 绝命自爆',
    desc: '阵亡时原地引发剧烈爆炸，造成大范围真实伤害并击退。',
    tierDesc: {
      1: '阵亡时原地引发自爆，对周围 50 范围内敌人造成相当于其最大生命 35% 的真实伤害并击退。',
      2: '阵亡时原地引发剧烈爆炸，造成 55% 真实伤害与击退，并附加 2 秒 50% 减速。',
      3: '阵亡时原地引发毁天灭地自爆，造成 85% 巨额真实伤害，附加 2.0 秒大范围眩晕！',
    },
  },
  {
    id: 'snow_golem',
    mob: 'snow_golem',
    name: '雪傀儡之印 · 极地冰弹',
    desc: '普攻附加极地霜冻，降低移动速度与攻击速度。',
    tierDesc: {
      1: '普攻附加 15 点极地寒霜，降低目标移动速度与攻击速度 20%，持续 2.5 秒。',
      2: '普攻附加 28 点极地寒霜，冻结时间提升 50%，减速效果提升至 35%。',
      3: '普攻附加 45 点极寒，每连续命中同一目标 3 次彻底冰封目标 1.5 秒！',
    },
  },
  {
    id: 'cave_spider',
    mob: 'cave_spider',
    name: '洞穴蜘蛛之印 · 剧毒附魔',
    desc: '普攻附加侵蚀剧毒。',
    tierDesc: {
      1: '普攻附加侵蚀剧毒（每秒造成 12 点伤害，持续 3 秒，最多 3 层）。',
      2: '剧毒每秒造成 22 点伤害，持续 4 秒，最多 5 层。',
      3: '剧毒每秒造成 35 点伤害并削减目标 30% 护甲，叠满引发毒蚀爆发！',
    },
  },
  {
    id: 'iron_golem',
    mob: 'iron_golem',
    name: '铁傀儡之印 · 泰坦荆棘',
    desc: '自身护甲提升，受到近战攻击时反弹伤害。',
    tierDesc: {
      1: '自身护甲提升 +10%，受到近战普攻时反弹 20% 伤害。',
      2: '自身护甲提升 +18%，受到近战普攻反弹 35% 伤害，免疫轻度击退。',
      3: '护甲提升 +28%，反伤 50%，完全霸体免疫击退，濒死获得 25% 护盾！',
    },
  },
  {
    id: 'enderman',
    mob: 'enderman',
    name: '末影人之印 · 虚空闪避',
    desc: '提供高额闪避与投射物回避。',
    tierDesc: {
      1: '闪避率 +12%，投射物闪避率 +30%。',
      2: '闪避率 +20%，投射物闪避率 +50%，闪避后下次普攻必定暴击。',
      3: '闪避率 +28%，投射物闪避率 +70%，闪避后相位瞬移并反击一道虚空风刃！',
    },
  },
  {
    id: 'blaze',
    mob: 'blaze',
    name: '烈焰人之印 · 灼热烈焰',
    desc: '普攻附加燃烧，对燃烧目标大幅增伤。',
    tierDesc: {
      1: '普攻附加持续燃烧，对处于燃烧的目标造成伤害提升 20%。',
      2: '普攻附加 35% 攻击燃烧，对燃烧目标增伤 35%，普攻引燃周围敌人。',
      3: '普攻附加 50% 燃烧，对燃烧目标增伤 50%，击杀燃烧单位引发连环大殉爆！',
    },
  },
  {
    id: 'shulker',
    mob: 'shulker',
    name: '潜影贝之印 · 坚守悬浮',
    desc: '大幅降低受到伤害，并可使敌军漂浮滞空。',
    tierDesc: {
      1: '受到伤害降低 10%；每 10 秒使当前攻击目标漂浮滞空 1.5 秒。',
      2: '受到伤害降低 16%；每 8 秒使攻击目标漂浮滞空 2.0 秒。',
      3: '受到伤害降低 24%；每 6 秒使周围最近敌人强制漂浮滞空 2.5 秒并破除护盾！',
    },
  },
  {
    id: 'witch',
    mob: 'witch',
    name: '女巫之印 · 炼金滋养',
    desc: '攻击附带生命偷取，提供异常状态免疫。',
    tierDesc: {
      1: '造成伤害的 12% 转化为生命吸取，且免疫剧毒状态。',
      2: '造成伤害的 20% 转化为吸取，免疫剧毒与迟缓状态。',
      3: '造成伤害的 30% 转化为吸取，全免负面状态，溢出治疗转化为坚固护盾！',
    },
  },
  {
    id: 'wolf',
    mob: 'wolf',
    name: '野狼之印 · 嗜血狂猎',
    desc: '提升攻击与移动速度，斩杀低生命目标。',
    tierDesc: {
      1: '攻击速度 +15%，移动速度 +12%；面对生命低于 30% 的目标伤害提升 25%。',
      2: '攻击速度 +25%，移动速度 +20%；面对生命低于 40% 的目标伤害提升 40%。',
      3: '攻击速度 +35%，移动速度 +25%；面对生命低于 50% 的目标伤害提升 60% 并刷新狂暴！',
    },
  },
  {
    id: 'vindicator',
    mob: 'vindicator',
    name: '卫道士之印 · 破阵死斗',
    desc: '高额提升暴击率与暴击伤害。',
    tierDesc: {
      1: '暴击率 +15%，暴击伤害提升至 190%。',
      2: '暴击率 +25%，暴击伤害提升至 220%，暴击时击退目标。',
      3: '暴击率 +35%，暴击伤害提升至 260%，暴击时忽略目标 50% 护甲！',
    },
  },
  {
    id: 'phantom',
    mob: 'phantom',
    name: '幻翼之印 · 幽影穿透',
    desc: '攻击穿透多名目标并撕裂护甲。',
    tierDesc: {
      1: '投射物/刺击穿透 +1 个目标，忽略目标 20% 基础护甲。',
      2: '投射物/刺击穿透 +2 个目标，忽略目标 35% 基础护甲。',
      3: '投射物穿透所有直线路径敌人，忽略 50% 护甲并附加破甲重创！',
    },
  },
  {
    id: 'drowned',
    mob: 'drowned',
    name: '溺尸之印 · 潮汐涌浪',
    desc: '提供强大的被动生命恢复。',
    tierDesc: {
      1: '每秒持续恢复 2.0% 最大生命值。',
      2: '每秒持续恢复 3.5% 最大生命值，并为临近队友提供 1.5% 潮汐光环回血。',
      3: '每秒持续恢复 5.0% 最大生命值，生命高于 50% 时额外获得 15% 减伤！',
    },
  },
  {
    id: 'piglin_brute',
    mob: 'piglin_brute',
    name: '堡垒蛮兵之印 · 狂暴重斧',
    desc: '大幅提升攻击力，克制护盾与结构体。',
    tierDesc: {
      1: '攻击力 +12%，对护盾与结构体伤害提升 60%。',
      2: '攻击力 +20%，对护盾与结构体伤害提升 100%。',
      3: '攻击力 +30%，无视目标 30% 护甲，对护盾结构体造成 2.5 倍毁灭打击！',
    },
  },
  {
    id: 'skeleton_vanguard',
    mob: 'skeleton_vanguard',
    name: '骷髅先锋之印 · 皇家御盾',
    desc: '正面高额免受投射物伤害，入场提供坚固骨盾。',
    tierDesc: {
      1: '正面受到投射物伤害降低 30%，开局获得自身生命 12% 的骨盾。',
      2: '正面受到投射物伤害降低 50%，开局获得自身生命 22% 的骨盾。',
      3: '正面受到投射物伤害降低 70%，开局获得 35% 骨盾，骨盾破碎时向周围反弹骨刺！',
    },
  },
  {
    id: 'redstone_golem',
    mob: 'redstone_golem',
    name: '红石守卫之印 · 地脉过载',
    desc: '近战攻击附带大范围顺劈溅射伤害。',
    tierDesc: {
      1: '近战攻击附带 25% 范围顺劈溅射伤害。',
      2: '近战攻击附带 40% 范围顺劈溅射伤害，击退范围扩大。',
      3: '近战攻击附带 60% 顺劈震波，每 4 次普攻引发一次地脉充能重砸！',
    },
  },
];

export const SIGIL_MAP: Record<string, SigilDef> = Object.fromEntries(
  SIGILS.map((s) => [s.id, s])
);

/** Checks whether a mob can yield a sigil for fusion. */
export function sigilOfMob(mob: string): SigilDef | undefined {
  return SIGIL_MAP[mob];
}

export function sigilTierName(star: number = 1): string {
  return star >= 3 ? '极阶 · 质变' : star === 2 ? '进阶' : '基础';
}

export function sigilRoman(star: number = 1): string {
  return star >= 3 ? 'III' : star === 2 ? 'II' : 'I';
}

export function sigilDesc(mob: string, star: number = 1): string {
  const s = sigilOfMob(mob);
  if (!s) return '';
  return s.tierDesc?.[star] ?? s.desc;
}
