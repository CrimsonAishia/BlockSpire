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
    desc: '开战 0.5 秒灾厄村民攻速 +15%（持续 4 秒）；劫掠兽每次咆哮，周围友方灾厄村民攻速 +30%（持续 4 秒）。',
  },
  {
    id: 'village_guard', name: '村庄卫队', color: '#e8e4dc',
    needs: [['iron_golem'], ['snow_golem', 'copper_golem']],
    desc: '铁傀儡的守护光环范围翻倍；雪傀儡与铜傀儡生命 +25%。',
  },
  {
    id: 'undead_brew', name: '亡者的药剂', color: '#8fbf6a',
    needs: [['witch'], UNDEAD],
    desc: '友方女巫朝受伤亡灵扔治疗药水（回复量 +50%）；药水溢出治疗的 50% 转为护盾（上限 10% 最大生命，持续 4 秒）。',
  },
  {
    id: 'monument', name: '神殿守卫', color: '#5ee6d6',
    needs: [['guardian', 'elder_guardian'], ['drowned']],
    desc: '守卫者的激光蓄力快 30%；溺尸的三叉戟冷却 -30%，受到的投射物伤害 -15%。',
  },
  {
    id: 'arrow_rain', name: '箭雨', color: '#d6d6c8',
    needs: [SKELETONS, SKELETONS],
    desc: '两种以上的骷髅类同时出战：所有骷髅类每第 3 次射击变为齐射；若与自带连射同动作触发则伤害 +15%。',
  },
  {
    id: 'frost', name: '冰原猎手', color: '#9fd8ff',
    needs: [COLD, COLD],
    desc: '两种以上的寒地生物同时出战：友方造成的冰冻多持续 50%；处于冰冻、寒意或迟缓中的敌人受到寒地生物的伤害 +20%。',
  },
  {
    id: 'desert_riders', name: '沙漠游骑', color: '#d8c38a',
    needs: [['camel_husk'], ['husk', 'parched']],
    desc: '开战赋予尸壳与焦骸首击伤害 +50%（持续 6 秒）；骆驼尸壳冲刺后，周围尸壳与焦骸的下一次攻击伤害翻倍（取较高者不叠加）。',
  },
  {
    id: 'end_patrol', name: '末地巡逻', color: '#c06bff',
    needs: [['shulker'], ['enderman', 'endermite']],
    desc: '潜影弹命中使目标附加「巡猎标记」3 秒；友方末影生物对标记目标非 DOT 伤害 +25%。',
  },
  {
    id: 'sculk_song', name: '幽匿歌谣', color: '#2ee6f0',
    needs: [['singer'], ['warden', 'sculk_slasher', 'echo_golem']],
    desc: '歌者的歌声使友方监守者与幽匿生物攻速加成提升至 +40%（基础 +20%），监守者的怒气叠加翻倍。',
  },
  {
    id: 'slime_party', name: '弹跳派对', color: '#7ed957',
    needs: [['slime', 'magma_cube', 'sulfur_cube'], ['slime', 'magma_cube', 'sulfur_cube']],
    desc: '两种以上的史莱姆类同时出战：分裂出的子体继承 100% 生命与攻击（最多分裂两代）。',
  },
  {
    id: 'wolf_armor', name: '狼铠同盟', color: '#e0b25b',
    needs: [['wolf'], ['armadillo']],
    desc: '开场所有原始狼获得自身最大生命 20% 护盾（持续 8 秒）；每只狼首次生命低于 50% 时，攻速 +20%（持续 4 秒，每场一次）。',
  },
  {
    id: 'pollination', name: '蜂花共生', color: '#ffec3d',
    needs: [['bee'], ['sniffer']],
    desc: '原始蜜蜂消耗毒刺后，若原始嗅探兽存活则 10 秒后再生毒刺；嗅探兽的火把花持续时间 +2 秒。',
  },
  {
    id: 'venom_web', name: '毒网围猎', color: '#b0794c',
    needs: [['spider', 'cave_spider'], ['bogged']],
    desc: '蜘蛛、洞穴蜘蛛与沼骸施加的中毒伤害 +20%；蜘蛛有效普攻命中中毒敌人使其移速 -20%（持续 2 秒，每张蜘蛛卡 2 秒冷却）。',
  },
  {
    id: 'storm_fuse', name: '引雷爆破', color: '#7fd8ff',
    needs: [['creeper'], ['drowned', 'copper_golem']],
    desc: '开场 1 秒为一只未充能的原始苦力怕充能；此后每 6 秒若引雷成员存活再充能一只。',
  },
  {
    id: 'fanned_flame', name: '风助烈焰', color: '#ff7a3d',
    needs: [['breeze'], ['blaze', 'ghast']],
    desc: '旋风人的风弹命中燃烧目标后，将其燃烧传播给 90 范围内至多两名敌人（50% DOT，持续 2 秒，全队 2 秒冷却）。',
  },
  {
    id: 'glowing_nest', name: '微光护巢', color: '#ff8fb1',
    needs: [['blub'], ['nester']],
    desc: '噗噗存活时，筑巢者召唤物出生获得自身最大生命 15% 护盾（持续 4 秒），且首次普攻伤害 +20%。',
  },
];
export const COMBO_MAP: Record<string, ComboDef> = Object.fromEntries(COMBOS.map((c) => [c.id, c]));

function matchNeeds(needs: string[][], available: string[], groupIdx = 0, used = new Set<string>()): boolean {
  if (groupIdx >= needs.length) return true;
  const group = needs[groupIdx];
  for (const m of available) {
    if (group.includes(m) && !used.has(m)) {
      used.add(m);
      if (matchNeeds(needs, available, groupIdx + 1, used)) return true;
      used.delete(m);
    }
  }
  return false;
}

/** Combos switched on by a set of fielded mobs (each group satisfied by a different mob). */
export function activeCombos(mobs: string[]): string[] {
  const set = [...new Set(mobs)];
  const out: string[] = [];
  for (const c of COMBOS) {
    if (matchNeeds(c.needs, set)) out.push(c.id);
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
