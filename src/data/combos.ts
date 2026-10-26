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
    desc: '开战 4 秒灾厄村民攻速 +15%（持续 4 秒）；劫掠兽每次咆哮，周围友方灾厄村民攻速 +30%（持续 4 秒）。',
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
  // ───────────── V3.4 地下城远征 · 26 组卡牌联动 ─────────────
  {
    id: 'frost_patrol', name: '寒冬巡卫', color: '#9fd8ff',
    needs: [['frostbite', 'iceologer'], ['stray', 'snow_golem', 'skeleton']],
    desc: '队伍首次施加寒意后，两张条件卡各获得 4 秒 4% 护盾（每场一次）。',
  },
  {
    id: 'jungle_venom', name: '丛林毒阵', color: '#2ed573',
    needs: [['jungle_zombie'], ['whisperer', 'poison_quill_vine', 'cave_spider', 'spider']],
    desc: '丛林僵尸与毒性伙伴攻击中毒敌人时，直接伤害 +10%。',
  },
  {
    id: 'sunken_escort', name: '沉海护送', color: '#3fc6d6',
    needs: [['tropical_slime'], ['sunken_skeleton', 'drowned']],
    desc: '热带史莱姆首次分裂后，沉没骷髅的原生单位获得 5 秒 10% 减伤（每场一次）。',
  },
  {
    id: 'nether_crossfire', name: '下界交叉火力', color: '#ff7a3d',
    needs: [['piglin_hunter'], ['blaze', 'ghast']],
    desc: '猪灵弩手与火焰伙伴交替命中同一目标后，追加 50% 额外直接伤害（全队 5 秒冷却）。',
  },
  {
    id: 'rampart_banner', name: '城垛战旗', color: '#c1b487',
    needs: [['rampart_captain'], ['mountaineer', 'windcaller', 'armored_mountaineer']],
    desc: '队长与近战伙伴同时存活时，开场前 5 秒近战原生单位移速 +20%。',
  },
  {
    id: 'void_hunt', name: '虚空围猎', color: '#c06bff',
    needs: [['snareling'], ['blastling', 'endersent', 'enderman']],
    desc: '缠缚者控制命中后，爆鸣者或末影哨卫下一次直接命中伤害 +15% 并附 15 破势（6 秒冷却）。',
  },
  {
    id: 'snow_guides', name: '雪原引路', color: '#70a1ff',
    needs: [['snow_fox'], ['frostbite', 'polar_bear']],
    desc: '雪狐存活时，开场前 6 秒为最慢的两张近战原生卡大幅缓解地形减速。',
  },
  {
    id: 'young_raid', name: '幼尸奇袭', color: '#ffa502',
    needs: [['baby_zombie'], ['chicken_jockey', 'skeleton_horseman']],
    desc: '幼尸或骑乘卡首次命中敌方后排时，另一条件卡获得 3 秒 10% 攻速。',
  },
  {
    id: 'dark_wings', name: '暗翼余烬', color: '#6c5ce7',
    needs: [['bat'], ['tower_wraith', 'blaze']],
    desc: '蝙蝠首次咬中的目标被范围法术命中后，为蝙蝠回复 4% 生命（每场最多三次）。',
  },
  {
    id: 'forest_watch', name: '林地守望', color: '#4fa85b',
    needs: [['mooshroom', 'jungle_zombie'], ['quick_vine', 'panda']],
    desc: '保护技能成功吸收敌方伤害后，厚实近战下一次普攻附带 60% 额外伤害（6 秒冷却）。',
  },
  {
    id: 'canopy_hunt', name: '林梢追猎', color: '#10ac84',
    needs: [['ocelot'], ['jungle_zombie', 'poison_quill_vine']],
    desc: '豹猫命中中毒目标后使其减速 25% 2 秒（首领转为 15 破势，6 秒冷却）。',
  },
  {
    id: 'thorn_wall', name: '藤墙毒刺', color: '#2ed573',
    needs: [['quick_vine'], ['sunken_skeleton', 'piglin_hunter', 'skeleton']],
    desc: '有敌人因根墙阻挡改道时，射手伙伴获得 20% 攻速 4 秒（8 秒冷却）。',
  },
  {
    id: 'caravan', name: '驮队护航', color: '#eccc68',
    needs: [['llama'], ['rampart_captain', 'armored_mountaineer']],
    desc: '羊驼与重斧伙伴在 3 秒内先后命中蓄势目标时，合加 25 破势（7 秒冷却）。',
  },
  {
    id: 'deep_glimmer', name: '暗潮映光', color: '#1e90ff',
    needs: [['pufferfish'], ['glow_squid', 'turtle']],
    desc: '墨云或护壳成功降低伤害后，河豚毒区延长 1 秒并回复 8% 生命（8 秒冷却）。',
  },
  {
    id: 'bastion_lines', name: '堡垒双线', color: '#db8c63',
    needs: [['piglin_swordsman', 'armored_piglin'], ['piglin_hunter']],
    desc: '近战锁定的目标被贯穿弩矢命中后，近战下一次普攻忽略 35% 护甲（6 秒冷却）。',
  },
  {
    id: 'ghost_flame', name: '幽火引航', color: '#ff6b81',
    needs: [['baby_ghast'], ['blaze']],
    desc: '小恶魂分担伤害累计达到 8% 后，火焰卡下一次攻击伤害 +30%（8 秒冷却）。',
  },
  {
    id: 'void_relay', name: '虚空接力', color: '#9b59b6',
    needs: [['enderling', 'endersent'], ['snareling', 'shulker']],
    desc: '传送卡成功接敌后，控制卡下一次控制额外 +20 破势（8 秒冷却）。',
  },
  {
    id: 'bone_cavalry', name: '亡骑践阵', color: '#dcdde1',
    needs: [['skeleton_horseman'], ['zombie', 'skeleton_vanguard', 'jungle_zombie']],
    desc: '骑射换位后，前排亡灵净化一次减速并获得 10% 护盾（7 秒冷却）。',
  },
  {
    id: 'construct_sentries', name: '构装哨阵', color: '#e67e22',
    needs: [['pumpkin_turret'], ['mob_spawner', 'iron_golem', 'snow_golem']],
    desc: '召唤卡成功召唤时，南瓜炮台获得攻速 +25% 4 秒（8 秒冷却）。',
  },
  {
    id: 'vine_colony', name: '藤巢接力', color: '#2ed573',
    needs: [['abomination_vine'], ['quick_vine', 'jungle_zombie']],
    desc: '伏击藤蔓命中被阻截的敌人时，伤害预算提升至 80%（7 秒冷却）。',
  },
  {
    id: 'fungus_legion', name: '菌火协射', color: '#a55eea',
    needs: [['fungus_thrower'], ['piglin_swordsman', 'piglin_hunter', 'armored_piglin']],
    desc: '下界近战命中孢子区内的敌人时，普攻等待推进 35%（7 秒冷却）。',
  },
  {
    id: 'armored_caravan', name: '重装护航', color: '#747d8c',
    needs: [['armored_piglin', 'armored_mountaineer'], ['piglin_hunter', 'skeleton_horseman']],
    desc: '重装伙伴首次降至半血后，后排射手获得 15% 护盾与 20% 攻速 4 秒。',
  },
  {
    id: 'sea_routes', name: '潮路护航', color: '#48dbfb',
    needs: [['turtle', 'dolphin'], ['drowned', 'sunken_skeleton']],
    desc: '护送或护壳生效期间近战被击退后，推进普攻等待 50%（8 秒冷却）。',
  },
  {
    id: 'bird_scouts', name: '双翼侦察', color: '#ff4757',
    needs: [['parrot', 'raven'], ['skeleton', 'piglin_hunter', 'sunken_skeleton']],
    desc: '侦察与集火指向同敌时，输出卡首次普通命中合加 30 破势（8 秒冷却）。',
  },
  {
    id: 'soul_lanterns', name: '魂灯守望', color: '#54a0ff',
    needs: [['soul_wizard'], ['baby_ghast', 'panda']],
    desc: '保护技能成功吸收伤害后收割 2 灵魂（每 6 秒一次，上限 8 灵魂）。',
  },
  {
    id: 'axolotl_escort', name: '金鳃伴游', color: '#feca57',
    needs: [['gold_axolotl'], ['tropical_slime', 'drowned', 'turtle']],
    desc: '有效治疗后水生前排获得 15% 攻速 4 秒（6 秒冷却）。',
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
