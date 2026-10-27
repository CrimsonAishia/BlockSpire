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

  // ───── V3.3 遗迹远征遭遇模板 ─────
  E('a1_forest_scout', '林桥斥候', 1, 'battle', 0, [['skeleton', 1, 'back'], ['spider', 1, 'front']]),
  E('a1_forest_blast', '深林跃袭', 1, 'battle', 2, [['leaper', 1, 'mid'], ['poison_quill_vine', 1, 'back'], ['wolf', 1, 'front']]),
  E('a1e_forest_royal', '藤蔓卫队', 1, 'elite', undefined, [['skeleton_vanguard', 1, 'front'], ['whisperer', 1, 'mid'], ['poison_quill_vine', 1, 'back']]),
  E('a1_tomb_patrol', '王墓巡逻', 1, 'battle', 0, [['husk', 1, 'front'], ['skeleton', 1, 'back']]),
  E('a1_tomb_ritual', '魂火祭仪', 1, 'battle', 2, [['skeleton_vanguard', 1, 'front'], ['soul_wisp', 1, 'back'], ['zombie', 1, 'mid']]),
  E('a1e_tomb_priest', '墓穴祭司', 1, 'elite', undefined, [['necromancer', 1, 'back'], ['skeleton_vanguard', 1, 'front']]),
  E('a2_forge_workers', '熔炉工役', 2, 'battle', 0, [['blaze', 1, 'back'], ['wither_skeleton', 1, 'front']]),
  E('a2_forge_guard', '熔炉守卫', 2, 'battle', 2, [['redstone_golem', 1, 'front'], ['blaze', 1, 'back'], ['redstone_cube', 1, 'mid']]),
  E('a2e_forge_overload', '过载锻炉', 2, 'elite', undefined, [['redstone_golem', 1, 'front'], ['blaze', 2, 'back'], ['piglin_brute', 1, 'mid']]),
  E('a2_canyon_scout', '峡谷先遣', 2, 'battle', 0, [['pillager', 2, 'back'], ['mountaineer', 1, 'front']]),
  E('a2_canyon_ice', '冰霜裂谷', 2, 'battle', 2, [['iceologer', 1, 'back'], ['stray', 2, 'back'], ['royal_guard', 1, 'front']]),
  E('a2e_canyon_storm', '风暴隘口', 2, 'elite', undefined, [['windcaller', 1, 'back'], ['squall_golem', 1, 'front'], ['pillager', 2, 'back']]),
  E('a3_halls_gate', '高厅门禁', 3, 'battle', 0, [['royal_guard', 1, 'front'], ['pillager', 2, 'back'], ['vindicator', 2, 'mid']]),
  E('a3_halls_circle', '法阵枢纽', 3, 'battle', 2, [['enchanter', 1, 'back'], ['geomancer', 1, 'back'], ['royal_guard', 2, 'front']]),
  E('a3e_halls_court', '灾厄禁卫', 3, 'elite', undefined, [['enchanter', 2, 'back'], ['windcaller', 1, 'mid'], ['royal_guard', 2, 'front']]),
  E('a3_void_bridge', '虚空残桥', 3, 'battle', 0, [['endermite', 2, 'front'], ['enderman', 1, 'mid'], ['soul_wisp', 1, 'back']]),
  E('a3_void_flame', '虚空冷火', 3, 'battle', 2, [['wraith', 2, 'mid'], ['shulker', 1, 'back'], ['enderman', 2, 'front']]),
  E('a3e_void_watch', '回响凝视', 3, 'elite', undefined, [['drowned_necromancer', 2, 'back'], ['wraith', 1, 'mid'], ['shulker', 2, 'back']]),
  E('a1b_nameless', '首领 · 无名者', 1, 'boss', undefined, [['nameless_one', 1, 'back'], ['skeleton_vanguard', 1, 'front']]),
  E('a2b_redstone_monstrosity', '首领 · 红石巨兽', 2, 'boss', undefined, [['redstone_monstrosity', 1, 'front'], ['blaze', 1, 'back']]),
  E('a2e_cauldron_trial', '腐化药剂试炼', 2, 'elite', undefined, [['corrupted_cauldron', 1, 'back'], ['slime', 2, 'front']], '坩埚翻滚着腐化药剂，泥泞酸蚀不断蔓延。'),
  E('a3e_ancient_warden', '远古契约守卫', 3, 'elite', undefined, [['ancient_warden', 1, 'front'], ['royal_guard', 2, 'front'], ['geomancer', 1, 'back']], '远古契约沉睡的重装石卫，挥舞巨斧守护遗迹。'),

  // ───── 第五幕 · 遗迹远征 (孤独堡垒 / 蔓生神殿 / 深渊纪念碑) ─────
  E('a5_frost_zombies', '霜封走卒', 5, 'battle', 0, [['baby_zombie', 2, 'front'], ['stray', 2, 'back'], ['skeleton', 2, 'back']]),
  E('a5_ice_beasts', '极地兽群', 5, 'battle', 1, [['snow_fox', 2, 'mid'], ['polar_bear', 2, 'front'], ['bat', 2, 'front']]),
  E('a5_pumpkin_fort', '南瓜要塞', 5, 'battle', 2, [['pumpkin_turret', 2, 'back'], ['frostbite', 2, 'mid'], ['stray', 2, 'back']]),
  E('a5e_iceologer', '霜冻主教', 5, 'elite', undefined, [['iceologer', 2, 'back'], ['polar_bear', 2, 'front'], ['baby_zombie', 2, 'mid']]),

  E('a5_jungle_horde', '蔓生群落', 5, 'battle', 0, [['jungle_zombie', 2, 'front'], ['chicken_jockey', 2, 'front'], ['spider', 2, 'mid']]),
  E('a5_beast_pack', '密林兽径', 5, 'battle', 1, [['mooshroom', 2, 'front'], ['ocelot', 2, 'mid'], ['parrot', 2, 'back']]),
  E('a5_creeper_nest', '毒刺藤谷', 5, 'battle', 2, [['panda', 2, 'front'], ['quick_vine', 2, 'mid'], ['poison_quill_vine', 2, 'back']]),
  E('a5e_abomination_vines', '巨兽盘踞', 5, 'elite', undefined, [['abomination_vine', 2, 'front'], ['whisperer', 2, 'mid'], ['leaper', 2, 'mid']]),

  E('a5_abyssal_tide', '深渊涌浪', 5, 'battle', 0, [['tropical_slime', 2, 'front'], ['sunken_skeleton', 2, 'back'], ['drowned', 2, 'front']]),
  E('a5_coral_patrol', '珊瑚暗哨', 5, 'battle', 1, [['pufferfish', 2, 'front'], ['dolphin', 2, 'front'], ['glow_squid', 2, 'back']]),
  E('a5_guardian_shrine', '守卫祭坛', 5, 'battle', 2, [['guardian', 2, 'back'], ['gold_axolotl', 2, 'mid'], ['turtle', 2, 'front']]),
  E('a5e_elder_depth', '海晶深潜卫', 5, 'elite', undefined, [['elder_guardian', 1, 'back'], ['drowned_necromancer', 2, 'back'], ['turtle', 2, 'front']]),

  E('a5b_wraith', '首领 · 卑劣幽魂', 5, 'boss', undefined, [['wretched_wraith', 1, 'back'], ['polar_bear', 1, 'front'], ['iceologer', 1, 'back'], ['icy_creeper', 1, 'mid']], '霜冻峡湾深处的远古亡魂，极地近卫与严冬法阵层层护驾。'),
  E('a5b_abomination', '首领 · 丛林巨兽', 5, 'boss', undefined, [['jungle_abomination', 1, 'front'], ['panda', 1, 'front'], ['whisperer', 1, 'mid'], ['quick_vine', 1, 'mid']], '蔓生神殿由腐木与藤蔓纠缠而成的庞然巨物，密林兽群拱卫身旁。'),
  E('a5b_guardian', '首领 · 远古守护者', 5, 'boss', undefined, [['ancient_guardian', 1, 'mid'], ['turtle', 1, 'front'], ['guardian', 1, 'back'], ['wave_whisperer', 1, 'mid']], '沉睡于深渊核心的远古海灵，深海卫队严密死守。'),

  // ───── 第六幕 · 遗迹远征 (下界堡垒 / 疾风圣殿) ─────
  E('a6_nether_patrol', '熔炉战队', 6, 'battle', 0, [['piglin_swordsman', 2, 'front'], ['piglin_hunter', 2, 'back'], ['magma_cube', 2, 'mid']]),
  E('a6_fungus_blast', '真菌火线', 6, 'battle', 1, [['fungus_thrower', 2, 'back'], ['armored_piglin', 2, 'front'], ['blaze', 2, 'back']]),
  E('a6_ghast_fleet', '恶魂浮空阵', 6, 'battle', 2, [['baby_ghast', 2, 'back'], ['ghast', 2, 'back'], ['wither_skeleton', 2, 'front']]),
  E('a6e_piglin_stronghold', '堡垒督军', 6, 'elite', undefined, [['piglin_brute', 2, 'front'], ['armored_piglin', 2, 'front'], ['fungus_thrower', 2, 'back']]),

  E('a6_gale_vanguard', '疾风重骑', 6, 'battle', 0, [['rampart_captain', 2, 'front'], ['skeleton_horseman', 2, 'back'], ['llama', 2, 'mid']]),
  E('a6_storm_peak', '绝壁斧兵', 6, 'battle', 1, [['armored_mountaineer', 2, 'front'], ['mountaineer', 2, 'front'], ['goat', 2, 'mid']]),
  E('a6_wind_barrage', '狂岚祭司', 6, 'battle', 2, [['squall_golem', 2, 'front'], ['windcaller', 2, 'back'], ['breeze', 1, 'mid']]),
  E('a6e_storm_sanctum', '圣殿战团', 6, 'elite', undefined, [['squall_golem', 2, 'front'], ['rampart_captain', 2, 'front'], ['windcaller', 2, 'back']]),

  E('a6b_wildfire', '首领 · 悬浮烈焰', 6, 'boss', undefined, [['wildfire', 1, 'mid'], ['piglin_brute', 1, 'front'], ['armored_piglin', 1, 'front'], ['blaze', 1, 'back']], '四面烈焰护盾旋转的烈焰领主，重装堡垒战阵结界。'),
  E('a6b_tempest', '首领 · 风暴傀儡', 6, 'boss', undefined, [['tempest_golem', 1, 'mid'], ['squall_golem', 1, 'front'], ['armored_mountaineer', 1, 'front'], ['windcaller', 1, 'back'], ['llama', 1, 'mid']], '耸立在疾风峡谷之巅的风暴守卫，圣殿近卫军列阵护阵。'),

  // ───── 第七幕 · 破碎堡垒 ─────
  E('a7_void_scouts', '虚空游骑', 7, 'battle', 0, [['blastling', 2, 'back'], ['snareling', 2, 'mid'], ['enderman', 2, 'front']]),
  E('a7_shadow_circle', '暗影集会', 7, 'battle', 1, [['enderling', 2, 'mid'], ['soul_wizard', 2, 'back'], ['shulker', 2, 'back']]),
  E('a7_spawner_horde', '黑石囚牢', 7, 'battle', 2, [['mob_spawner', 2, 'back'], ['tower_wraith', 2, 'back'], ['endersent', 2, 'front']]),
  E('a7e_endersent_gate', '紫晶哨卫长', 7, 'elite', undefined, [['endersent', 2, 'front'], ['tower_wraith', 2, 'back'], ['shulker', 2, 'back']]),
  E('a7b_heart', '首领 · 复仇之心', 7, 'boss', undefined, [['vengeful_heart', 1, 'back'], ['endersent', 1, 'front'], ['shulker', 1, 'back'], ['tower_wraith', 1, 'back'], ['enderling', 1, 'mid']], '支配虚空废墟的终焉意志，虚空近卫全员护主。'),
];

export const ENC_MAP: Record<string, EncounterDef> = Object.fromEntries(ENCOUNTERS.map((e) => [e.id, e]));

/** Enemy stat multipliers by act and floor (0-based row). */
export function enemyScales(act: number, row: number, kind: EncounterDef['kind']): { hp: number; atk: number } {
  const baseTable = [1, 0.82, 1.32, 1.9, 3.2, 3.8, 4.4, 5.0];
  const base = baseTable[Math.min(baseTable.length - 1, act)] ?? 3.2;
  if (kind === 'boss') {
    const bossTable = [1, 0.75, 0.88, 0.74, 1.3, 1.45, 1.6, 1.8];
    const boss = bossTable[Math.min(bossTable.length - 1, act)] ?? 1.3;
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
