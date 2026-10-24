import type { Row } from '../core/types.ts';

/** [mob, star, row?, count override?, enchant?, enchant level?] */
export type EncCard = [string, number, Row?, number?, string?, number?];

export interface EncounterDef {
  id: string;
  name: string;
  act: number;
  kind: 'battle' | 'elite' | 'boss' | 'event';
  tier?: 0 | 1 | 2;
  cards: EncCard[];
  desc?: string;
}

const E = (id: string, name: string, act: number, kind: EncounterDef['kind'], tier: 0 | 1 | 2 | undefined, cards: EncCard[], desc?: string): EncounterDef => ({
  id, name, act, kind, tier, cards, desc,
});

export const ENCOUNTERS: EncounterDef[] = [
  // ───── 第一幕 · 主世界 ─────
  E('a1_zombies', '僵尸小队', 1, 'battle', 0, [['zombie', 1], ['skeleton', 1]]),
  E('a1_spiders', '蜘蛛巢穴', 1, 'battle', 0, [['spider', 1], ['silverfish', 1]]),
  E('a1_slimes', '史莱姆沼泽', 1, 'battle', 0, [['slime', 1], ['zombie', 1]]),
  E('a1_wolves', '山地狼群', 1, 'battle', 0, [['wolf', 1], ['goat', 1]]),
  E('a1_snow', '雪原游荡者', 1, 'battle', 0, [['snow_golem', 1], ['zombie', 1]]),
  E('a1_bees', '蜂巢之怒', 1, 'battle', 0, [['bee', 1], ['spider', 1]]),
  E('a1_scouts', '林地斥候', 1, 'battle', 0, [['skeleton', 1], ['wolf', 1], ['bee', 1]]),
  E('a1_night', '夜幕降临', 1, 'battle', 1, [['zombie', 1], ['skeleton', 1], ['creeper', 1]]),
  E('a1_swamp', '沼泽女巫', 1, 'battle', 1, [['witch', 1], ['slime', 1], ['zombie', 1]]),
  E('a1_outpost', '劫掠前哨', 1, 'battle', 1, [['pillager', 1], ['vindicator', 1], ['wolf', 1]]),
  E('a1_drowned', '溺尸之潮', 1, 'battle', 1, [['drowned', 1], ['zombie', 1], ['skeleton', 1]]),
  E('a1_mine', '废弃矿井', 1, 'battle', 1, [['cave_spider', 1], ['spider', 1], ['silverfish', 1]]),
  E('a1_desert', '沙漠神殿', 1, 'battle', 1, [['husk', 1], ['skeleton', 1], ['creeper', 1]]),
  E('a1_ice', '冰原', 1, 'battle', 1, [['stray', 1], ['snow_golem', 1], ['polar_bear', 1]]),
  E('a1_ravine', '峡谷猎手', 1, 'battle', 1, [['vindicator', 1], ['wolf', 1]]),
  E('a1_cave', '洞穴伏兵', 1, 'battle', 1, [['cave_spider', 1], ['silverfish', 1]]),
  E('a1_river', '河谷巡游', 1, 'battle', 1, [['drowned', 1], ['slime', 1], ['bee', 1]]),
  E('a1_thicket', '荆棘兽径', 1, 'battle', 1, [['bogged', 1], ['spider', 1]]),
  E('a1_covens', '林地秘会', 1, 'battle', 1, [['evoker', 1], ['witch', 1], ['creeper', 1]]),
  E('a1_patrol', '灾厄巡逻队', 1, 'battle', 2, [['vindicator', 1], ['pillager', 1], ['witch', 1]]),
  E('a1_phantoms', '幻翼之夜', 1, 'battle', 2, [['phantom', 1], ['skeleton', 2], ['zombie', 1]]),
  E('a1_polar', '极地猎场', 1, 'battle', 2, [['polar_bear', 1], ['stray', 1], ['goat', 2]]),
  E('a1_ambush', '苦力怕伏击', 1, 'battle', 2, [['creeper', 1], ['spider', 2], ['skeleton', 1]]),
  E('a1_horde', '亡灵大军', 1, 'battle', 2, [['zombie', 2], ['husk', 2], ['skeleton', 2]]),
  E('a1_jockeys', '蜘蛛骑手', 1, 'battle', 2, [['spider', 2], ['skeleton', 2], ['cave_spider', 1]]),
  E('a1_deep_ambush', '深林伏击', 1, 'battle', 2, [['enderman', 1], ['skeleton', 2], ['cave_spider', 2]]),
  E('a1_bogged', '沼泽陷阱', 1, 'battle', 0, [['bogged', 1], ['slime', 1]]),
  E('a1_armadillo', '热带草原', 1, 'battle', 0, [['armadillo', 1], ['wolf', 1]]),
  E('a1_sniffer', '古种花园', 1, 'battle', 1, [['sniffer', 1], ['goat', 2], ['bee', 2]]),
  E('a1_frost', '冰封之地', 1, 'battle', 1, [['frostbite', 1], ['stray', 1], ['snow_golem', 1]]),
  E('a1_trial', '试炼密室', 1, 'battle', 2, [['bogged', 2], ['husk', 1], ['cave_spider', 1]]),
  E('a1e_evoker', '唤魔者的密会', 1, 'elite', undefined, [['evoker', 1], ['vindicator', 1], ['pillager', 1]], '林地府邸的主人带着他的卫兵。'),
  E('a1e_golem', '暴走的铁傀儡', 1, 'elite', undefined, [['iron_golem', 1], ['snow_golem', 2]], '村庄的守护者把你当成了入侵者。'),
  E('a1e_coven', '女巫集会', 1, 'elite', undefined, [['witch', 2], ['zombie', 2], ['cave_spider', 1]], '她们的药水让不死者越战越勇。'),
  E('a1e_ender', '末影人游荡', 1, 'elite', undefined, [['enderman', 1], ['skeleton', 2], ['creeper', 1]], '有人盯着它的眼睛看了。'),
  E('a1e_pale', '苍白之园', 1, 'elite', undefined, [['creaking', 1], ['zombie', 2], ['bogged', 1]], '你不看它的时候，它就靠近了。先找到它的心脏。'),
  E('a1b_raid', '灾厄袭击', 1, 'boss', undefined, [['ravager_boss', 1, 'front'], ['vindicator', 1, 'front'], ['pillager', 1, 'back']], '号角响起，袭击开始了。'),
  E('a1b_monument', '海底神殿', 1, 'boss', undefined, [['elder_guardian_boss', 1, 'back'], ['guardian', 1, 'back'], ['drowned', 1, 'front']], '神殿之主的诅咒笼罩着一切。'),

  // ───── 第二幕 · 下界 ─────
  E('a2_lava', '岩浆湖畔', 2, 'battle', 0, [['magma_cube', 1], ['skeleton', 2], ['zombie', 1]]),
  E('a2_fortress', '要塞巡逻', 2, 'battle', 0, [['wither_skeleton', 1], ['blaze', 1], ['skeleton', 1]]),
  E('a2_crimson', '绯红森林', 2, 'battle', 0, [['hoglin', 1], ['husk', 1], ['skeleton', 1]]),
  E('a2_valley', '灵魂沙峡谷', 2, 'battle', 0, [['skeleton', 2], ['ghast', 1], ['zombie', 2]]),
  E('a2_soulfire', '灵魂火猎场', 2, 'battle', 0, [['hoglin', 2], ['blaze', 1], ['skeleton', 1]]),
  E('a2_spawner', '烈焰人刷怪笼', 2, 'battle', 1, [['blaze', 2], ['wither_skeleton', 1], ['magma_cube', 1]]),
  E('a2_hoglins', '疣猪兽群', 2, 'battle', 1, [['hoglin', 2], ['magma_cube', 1], ['skeleton', 2]]),
  E('a2_warband', '堡垒战团', 2, 'battle', 1, [['piglin_brute', 2], ['magma_cube', 1], ['skeleton', 2]]),
  E('a2_bastion', '堡垒守卫', 2, 'battle', 1, [['piglin_brute', 1], ['hoglin', 1], ['skeleton', 2]]),
  E('a2_ghasts', '恶魂之海', 2, 'battle', 1, [['ghast', 1], ['magma_cube', 1], ['blaze', 1]]),
  E('a2_wither', '凋零玫瑰', 2, 'battle', 1, [['wither_skeleton', 2], ['husk', 2], ['blaze', 1]]),
  E('a2_expedition', '下界远征', 2, 'battle', 2, [['blaze', 2], ['piglin_brute', 2], ['ghast', 1]]),
  E('a2_beasts', '熔岩巨兽', 2, 'battle', 2, [['magma_cube', 2], ['hoglin', 2], ['wither_skeleton', 1]]),
  E('a2_depths', '要塞深处', 2, 'battle', 2, [['wither_skeleton', 2], ['blaze', 2], ['evoker', 1]]),
  E('a2_inferno', '炼狱围猎', 2, 'battle', 2, [['piglin_brute', 2], ['magma_cube', 2], ['ghast', 1]]),
  E('a2_sulfur', '硫磺洞穴', 2, 'battle', 1, [['sulfur_cube', 2], ['magma_cube', 1], ['blaze', 1]]),
  E('a2_riders', '沙漠游骑', 2, 'battle', 1, [['camel_husk', 1], ['parched', 2], ['husk', 1]]),
  E('a2e_brutes', '堡垒蛮兵', 2, 'elite', undefined, [['piglin_brute', 2], ['hoglin', 2], ['blaze', 2]], '蛮兵不吃金子那一套。'),
  E('a2e_ghasts', '恶魂舰队', 2, 'elite', undefined, [['ghast', 2], ['blaze', 2], ['magma_cube', 2]], '天空中满是哭泣的火球。'),
  E('a2e_breeze', '旋风试炼', 2, 'elite', undefined, [['breeze', 1], ['wither_skeleton', 2], ['pillager', 2]], '你的箭会被原样奉还。'),
  E('a2b_wither', '凋灵', 2, 'boss', undefined, [['wither_boss', 1, 'back'], ['wither_skeleton', 1, 'front'], ['blaze', 1, 'back']], '灵魂沙上的骷髅头亮了起来。'),

  // ───── 第三幕 · 末地 ─────
  E('a3_endermen', '末影人群', 3, 'battle', 0, [['enderman', 2], ['endermite', 2], ['phantom', 1]]),
  E('a3_shulkers', '潜影贝塔楼', 3, 'battle', 0, [['shulker', 2], ['phantom', 2], ['endermite', 2]]),
  E('a3_void', '虚空游荡', 3, 'battle', 0, [['enderman', 2], ['shulker', 1], ['creeper', 2]]),
  E('a3_scouts', '末地斥候', 3, 'battle', 0, [['shulker', 2], ['enderman', 2]]),
  E('a3_watch', '虚空哨戒', 3, 'battle', 0, [['shulker', 2], ['enderman', 2], ['phantom', 1]]),
  E('a3_city', '末地城', 3, 'battle', 1, [['shulker', 2], ['enderman', 2], ['phantom', 2], ['endermite', 2]]),
  E('a3_invasion', '末影侵袭', 3, 'battle', 1, [['enderman', 2], ['endermite', 3], ['creeper', 2], ['blaze', 2]]),
  E('a3_army', '远征军', 3, 'battle', 1, [['iron_golem', 1], ['evoker', 2], ['pillager', 2], ['vindicator', 2]]),
  E('a3_breach', '裂隙突袭', 3, 'battle', 1, [['enderman', 2], ['endermite', 2], ['blaze', 1], ['creeper', 2]]),
  E('a3_echo', '虚空回声', 3, 'battle', 1, [['shulker', 2], ['endermite', 2], ['frostbite', 2], ['phantom', 2]]),
  E('a3_crossing', '末影渡口', 3, 'battle', 1, [['enderman', 2], ['endermite', 2], ['phantom', 1]]),
  E('a3_gate', '潜影关隘', 3, 'battle', 1, [['shulker', 2], ['endermite', 2], ['blaze', 1], ['creeper', 2]]),
  E('a3_drifters', '虚空漂流者', 3, 'battle', 1, [['enderman', 2], ['shulker', 2], ['ghast', 1]]),
  E('a3_vanguard', '末地先锋', 3, 'battle', 1, [['ravager', 1], ['evoker', 2], ['enderman', 2], ['pillager', 1]]),
  E('a3_fleet', '末地舰队', 3, 'battle', 2, [['shulker', 2], ['enderman', 2], ['blaze', 2], ['phantom', 3]]),
  E('a3_ruins', '远古遗迹', 3, 'battle', 2, [['elder_guardian', 2], ['guardian', 2], ['drowned', 3], ['witch', 2]]),
  E('a3_illagers', '灾厄大军', 3, 'battle', 2, [['ravager', 2], ['illusioner', 1], ['vindicator', 2], ['witch', 2]]),
  E('a3_pale', '苍白之园', 3, 'battle', 2, [['creaking', 1], ['enderman', 2], ['phantom', 2], ['frostbite', 3]]),
  E('a3_siege', '末地围城', 3, 'battle', 2, [['ravager', 2], ['shulker', 3], ['phantom', 2]]),
  E('a3e_warden', '监守者苏醒', 3, 'elite', undefined, [['warden', 1], ['endermite', 3], ['skeleton', 3]], '你发出的声音太大了。'),
  E('a3e_city', '末地城守卫', 3, 'elite', undefined, [['shulker', 3], ['enderman', 2], ['phantom', 2], ['blaze', 2]], '每一层塔楼都布满了潜影贝。'),
  E('a3e_illusion', '幻术师的迷宫', 3, 'elite', undefined, [['illusioner', 2], ['evoker', 2], ['vindicator', 2], ['ravager', 1]], '哪一个才是真的？'),
  E('a3b_dragon', '末影龙', 3, 'boss', undefined, [['ender_dragon_boss', 1, 'back'], ['end_crystal', 1, 'back', 4], ['enderman', 2, 'mid']], '去吧，屠龙者。'),
  E('a3b_dragon_echo', '末影龙 · 终末余响', 3, 'boss', undefined, [['ender_dragon_boss', 1, 'back'], ['shulker', 2, 'back'], ['enderman', 2, 'front']], '虚空深处传来的终末余响。'),

  // ───── 第四幕 · 筛界（打败末影龙后可选）─────
  E('a4_sifters', '小筛者窝', 4, 'battle', 0, [['baby_sifter', 2], ['blub', 1], ['bearded_sifter', 1]]),
  E('a4_meadow', '粉色草原', 4, 'battle', 0, [['baby_sifter', 1], ['nester', 1], ['sprout', 1]]),
  E('a4_carapace', '甲壳荒原', 4, 'battle', 0, [['bearded_sifter', 2], ['baby_sifter', 1], ['tall_sifter', 1]]),
  E('a4_garden', '孢子花园', 4, 'battle', 0, [['nester', 2], ['sprout', 2], ['bearded_sifter', 2]]),
  E('a4_brood', '幼体巢穴', 4, 'battle', 0, [['nester', 3], ['baby_sifter', 1]]),
  E('a4_shallows', '浅层筛群', 4, 'battle', 0, [['bearded_sifter', 3], ['baby_sifter', 1]]),
  E('a4_roamers', '高脚漫游者', 4, 'battle', 0, [['tall_sifter', 1], ['baby_sifter', 1], ['blub', 1]]),
  E('a4_stalkers', '甲壳追猎者', 4, 'battle', 0, [['tall_sifter', 1], ['bearded_sifter', 2], ['baby_sifter', 1]]),
  E('a4_nest', '筑巢者猎场', 4, 'battle', 1, [['nester', 2], ['baby_sifter', 2], ['sprout', 2], ['bearded_sifter', 2]]),
  E('a4_spitters', '黏液沼地', 4, 'battle', 1, [['tall_sifter', 2], ['bearded_sifter', 1], ['baby_sifter', 2]]),
  E('a4_echo', '回响', 4, 'battle', 1, [['sculk_slasher', 1], ['baby_sifter', 2], ['blub', 2], ['singer', 1]]),
  E('a4_choir', '歌者合唱', 4, 'battle', 1, [['singer', 1], ['tall_sifter', 1], ['nester', 1], ['baby_sifter', 1]]),
  E('a4_hunters', '筛界猎手', 4, 'battle', 1, [['tall_sifter', 2], ['sculk_slasher', 1], ['sprout', 1]]),
  E('a4_migration', '迁徙筛群', 4, 'battle', 1, [['sculk_slasher', 1], ['nester', 2], ['baby_sifter', 2], ['sprout', 1]]),
  E('a4_slashers', '斩击者', 4, 'battle', 2, [['sculk_slasher', 3], ['nester', 3], ['sprout', 2]]),
  E('a4_wardens', '苏醒的监守者', 4, 'battle', 2, [['warden', 1], ['sculk_slasher', 1], ['singer', 1]]),
  E('a4_swarm', '筛界之潮', 4, 'battle', 2, [['baby_sifter', 3], ['tall_sifter', 2], ['bearded_sifter', 2], ['sprout', 1]]),
  E('a4_vanguard', '深暗先锋', 4, 'battle', 2, [['warden', 1], ['sculk_slasher', 2], ['singer', 1], ['blub', 1]]),
  E('a4_siege', '筛界围猎', 4, 'battle', 2, [['warden', 1], ['tall_sifter', 2], ['blub', 1]]),
  E('a4e_dancer', '幽匿舞者', 4, 'elite', undefined, [['sculk_dancer', 1], ['baby_sifter', 2], ['tall_sifter', 1]], '它的每一个旋转都会留下一个影子。'),
  E('a4e_choir', '回响合唱团', 4, 'elite', undefined, [['singer', 2], ['sculk_slasher', 1], ['tall_sifter', 2]], '歌声越响，回响傀儡越多。'),
  E('a4e_hunt', '筛界猎群', 4, 'elite', undefined, [['sculk_slasher', 2], ['nester', 3], ['sprout', 3]], '它们专挑落单的后排下手。'),
  E('a4b_monstrosity', '幽匿巨像', 4, 'boss', undefined, [['sculk_monstrosity', 1, 'front'], ['tall_sifter', 1, 'back'], ['sprout', 1, 'mid']], '筛子里漏下来的一切，最后都落到了它的手里。'),

  // ───── 事件战斗 ─────
  E('ev_mineshaft', '矿井深处', 1, 'event', undefined, [['cave_spider', 1], ['spider', 2], ['silverfish', 1]]),
  E('ev_fortress', '要塞宝箱守卫', 2, 'event', undefined, [['blaze', 2], ['wither_skeleton', 1], ['skeleton', 2]]),
  E('ev_bastion', '金块守卫', 2, 'event', undefined, [['piglin_brute', 2], ['hoglin', 1]]),
  E('ev_endship', '末地船', 3, 'event', undefined, [['shulker', 2], ['enderman', 2], ['phantom', 2]]),
  E('ev_warden', '被惊醒的监守者', 3, 'event', undefined, [['warden', 2], ['skeleton', 2]]),
  E('ev_shipwreck', '沉船守卫', 1, 'event', undefined, [['drowned', 2], ['zombie', 1]]),
  // Event chains (see run/events.ts).
  E('ev_trader_pillagers', '夺回羊驼', 1, 'event', undefined, [['pillager', 1], ['vindicator', 1]]),
  E('ev_trader_revenge', '商人的护卫', 2, 'event', undefined, [['iron_golem', 1], ['vindicator', 1], ['pillager', 1]]),
  E('ev_raid_ambush', '灾厄袭击！', 1, 'event', undefined, [['ravager', 1], ['pillager', 1], ['vindicator', 1], ['witch', 1]]),
  E('ev_enderman', '被激怒的末影人', 1, 'event', undefined, [['enderman', 1], ['endermite', 1]]),
  E('ev_rift_sift', '裂隙彼端', 2, 'event', undefined, [['baby_sifter', 1], ['bearded_sifter', 1], ['nester', 1]]),
  E('ev_sift_guard', '祭坛守卫', 4, 'event', undefined, [['echo_golem', 1, 'front', 3], ['sculk_slasher', 1], ['tall_sifter', 1]]),
];

export const ENC_MAP: Record<string, EncounterDef> = Object.fromEntries(ENCOUNTERS.map((e) => [e.id, e]));

/** Enemy stat multipliers by act and floor (0-based row). */
export function enemyScales(act: number, row: number, kind: EncounterDef['kind']): { hp: number; atk: number } {
  const base = [1, 0.82, 1.32, 1.9, 3.2][act];
  if (kind === 'boss') {
    const boss = [1, 0.75, 0.88, 0.74, 1.3][act];
    return { hp: boss, atk: boss };
  }
  // Four floors form a readable chapter: steady growth, then a visible step when the encounter tier changes.
  const tier = tierForRow(row);
  const hp = base * (1 + 0.03 * row + 0.02 * tier) * (kind === 'elite' ? 1.12 : 1);
  const atk = base * (1 + 0.02 * row + 0.01 * tier) * (kind === 'elite' ? 1.08 : 1);
  return { hp, atk };
}

/** Backward-compatible single multiplier for callers that only need an approximate threat value. */
export function enemyScale(act: number, row: number, kind: EncounterDef['kind']): number {
  const { hp, atk } = enemyScales(act, row, kind);
  return Math.sqrt(hp * atk);
}

/** Rift battles (acts 2–3): a Sift encounter of the tier that suits the act. */
export function riftEncounters(act: number): EncounterDef[] {
  const tier = act >= 3 ? 1 : 0;
  return ENCOUNTERS.filter((e) => e.act === 4 && e.kind === 'battle' && e.tier === tier);
}

export function tierForRow(row: number): 0 | 1 | 2 {
  return row < 4 ? 0 : row < 9 ? 1 : 2;
}
