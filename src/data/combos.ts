// Mob interactions. Two kinds:
// - Combos (联动): fielding the right mobs together switches on an extra effect for that side.
// - Counters (克制): rules between enemies taken from how these mobs treat each other in the
//   original game (wolves hunt skeletons, cold hurts fire creatures...). Always on.

export interface ComboDef {
  id: string;
  name: string;
  /** Every group needs at least one of its mobs fielded (distinct mobs per group). */
  needs: string[][];
  desc: string;
  color: string;
}

const SKELETONS = ['skeleton', 'stray', 'bogged', 'parched'];
const ILLAGERS = ['pillager', 'vindicator', 'evoker', 'illusioner', 'witch'];
const UNDEAD = ['zombie', 'husk', 'drowned', 'skeleton', 'stray', 'wither_skeleton', 'phantom', 'giant', 'wither', 'frostbite', 'bogged', 'parched', 'camel_husk'];
const COLD = ['frostbite', 'stray', 'polar_bear', 'snow_golem'];

export const COMBOS: ComboDef[] = [
  {
    id: 'raid', name: '袭击队伍', color: '#c9c9c9',
    needs: [['ravager'], ILLAGERS],
    desc: '劫掠兽每次咆哮，周围的友方灾厄村民攻速 +30%，持续 4 秒。',
  },
  {
    id: 'village_guard', name: '村庄卫队', color: '#e8e4dc',
    needs: [['iron_golem'], ['snow_golem', 'copper_golem']],
    desc: '铁傀儡的守护光环范围翻倍；雪傀儡与铜傀儡生命 +25%。',
  },
  {
    id: 'undead_brew', name: '亡者的药剂', color: '#8fbf6a',
    needs: [['witch'], UNDEAD],
    desc: '友方女巫会朝受伤的亡灵队友扔伤害药水——亡灵被它治疗，回复量 +50%。',
  },
  {
    id: 'monument', name: '神殿守卫', color: '#5ee6d6',
    needs: [['guardian', 'elder_guardian'], ['drowned']],
    desc: '守卫者的激光蓄力快 30%；溺尸的三叉戟冷却 -30%。',
  },
  {
    id: 'arrow_rain', name: '箭雨', color: '#d6d6c8',
    needs: [SKELETONS, SKELETONS],
    desc: '两种以上的骷髅同时出战：所有骷髅类每第 4 次射击变成 3 支箭的齐射。',
  },
  {
    id: 'frost', name: '冰原猎手', color: '#9fd8ff',
    needs: [COLD, COLD],
    desc: '两种以上的寒地生物同时出战：友方造成的冰冻多持续 50%；处于冰冻、寒意或迟缓中的敌人受到寒地生物的伤害 +20%。',
  },
  {
    id: 'desert_riders', name: '沙漠游骑', color: '#d8c38a',
    needs: [['camel_husk'], ['husk', 'parched']],
    desc: '骆驼尸壳冲刺后，周围友方尸壳和焦骸的下一次攻击伤害翻倍。',
  },
  {
    id: 'end_patrol', name: '末地巡逻', color: '#c06bff',
    needs: [['shulker'], ['enderman', 'endermite']],
    desc: '被潜影弹浮空的敌人，受到友方末影生物的伤害 +40%。',
  },
  {
    id: 'sculk_song', name: '幽匿歌谣', color: '#2ee6f0',
    needs: [['singer'], ['warden', 'sculk_slasher', 'echo_golem']],
    desc: '歌者的歌声让友方监守者与幽匿生物攻速 +20%，监守者的怒气叠加翻倍。',
  },
  {
    id: 'slime_party', name: '弹跳派对', color: '#7ed957',
    needs: [['slime', 'magma_cube', 'sulfur_cube'], ['slime', 'magma_cube', 'sulfur_cube']],
    desc: '两种以上的史莱姆类同时出战：分裂出来的小史莱姆继承 100% 属性。',
  },
];
export const COMBO_MAP: Record<string, ComboDef> = Object.fromEntries(COMBOS.map((c) => [c.id, c]));

/** Combos switched on by a set of fielded mobs (each group satisfied by a different mob). */
export function activeCombos(mobs: string[]): string[] {
  const set = [...new Set(mobs)];
  const out: string[] = [];
  for (const c of COMBOS) {
    const used = new Set<string>();
    const ok = c.needs.every((g) => {
      const m = set.find((x) => g.includes(x) && !used.has(x));
      if (!m) return false;
      used.add(m);
      return true;
    });
    if (ok) out.push(c.id);
  }
  return out;
}

/** Combos a mob takes part in (for tooltips and the team panel's "missing" hints). */
export function combosOf(mob: string): ComboDef[] {
  return COMBOS.filter((c) => c.needs.some((g) => g.includes(mob)));
}

export interface CounterDef {
  /** Attackers (mob ids) and the victims they get a bonus against. */
  from: string[];
  to: string[];
  mul: number;
  desc: string;
}

/** Natural enemies: damage multipliers between specific mobs, whichever side they are on. */
export const COUNTERS: CounterDef[] = [
  { from: ['wolf'], to: [...SKELETONS, 'wither_skeleton'], mul: 1.5, desc: '狼天生猎杀骷髅：对骷髅类伤害 +50%' },
  { from: ['piglin_brute'], to: ['hoglin'], mul: 1.5, desc: '猪灵蛮兵擅长猎杀疣猪兽：伤害 +50%' },
  { from: ['enderman'], to: ['endermite'], mul: 1.5, desc: '末影人憎恨末影螨：伤害 +50%' },
  { from: ['iron_golem', 'copper_golem'], to: ILLAGERS.concat(['ravager', 'vex']), mul: 1.25, desc: '傀儡守护村庄：对灾厄势力伤害 +25%' },
  { from: ['snow_golem', 'frostbite'], to: ['blaze', 'magma_cube', 'sulfur_cube'], mul: 3, desc: '寒冷克制火焰：雪球和冰冻对烈焰人、岩浆怪伤害 ×3' },
  { from: ['bee'], to: ['spider', 'cave_spider'], mul: 1.3, desc: '蜜蜂护巢：对蜘蛛伤害 +30%' },
];

export function counterMul(from: string, to: string): number {
  let m = 1;
  for (const c of COUNTERS) if (c.from.includes(from) && c.to.includes(to)) m *= c.mul;
  return m;
}

export function countersOf(mob: string): CounterDef[] {
  return COUNTERS.filter((c) => c.from.includes(mob) || c.to.includes(mob));
}

/** Lightning (channeling, tridents, copper golems, storms, conduits) charges friendly creepers. */
export const CHARGE_RULE = '雷击：任何闪电劈中友方苦力怕附近时，它会被「充能」，爆炸范围 +40%、伤害 ×1.8（和 ★3 一样）。';
