import type { DungeonsMapDef, DungeonsRegion } from './dungeonsMaps.ts';
const r = (rect: DungeonsRegion['rect'], surface?: DungeonsRegion['surface'], height?: number, feature?: DungeonsRegion['feature'], featureHeight?: number): DungeonsRegion => ({ rect, surface, height, feature, featureHeight });
const point = (x: number, y: number, feature: DungeonsRegion['feature'], height = 2) => r([x, y, x, y], undefined, undefined, feature, height);
const obstacles = (positions: [number, number][], feature: DungeonsRegion['feature'], height = 2) => positions.map(([x, y]) => point(x, y, feature, height));
type Theme = Pick<DungeonsMapDef, 'act' | 'sky' | 'reference' | 'base'>;
const winter: Theme = { act: 5, sky: 'night', reference: 'howling_peaks', base: 'SNOW' };
const jungle: Theme = { act: 5, sky: 'day', reference: 'creeper_woods', base: 'MOSS' };
const ocean: Theme = { act: 5, sky: 'water', reference: 'desert_temple', base: 'PRISMARINE' };
const nether: Theme = { act: 6, sky: 'nether', reference: 'fiery_forge', base: 'NETHER_BRICK' };
const gale: Theme = { act: 6, sky: 'day', reference: 'howling_peaks', base: 'CALCITE' };
const end: Theme = { act: 7, sky: 'end', reference: 'echoing_void', base: 'END_STONE' };
const map = (theme: Theme, id: string, name: string, layout: string, event: string, regions: DungeonsRegion[]): DungeonsMapDef => ({
 ...theme, id, name, height: 1, regions,
 effects: [layout, '特色事件：' + event + '（设计与标注预演，尚未接入 Battle）', '部署区保持干燥；地形、阻挡和高差按实际 Terrain 规则；冰面仍沿现有加速规则'],
});
/** Eighteen independently authored, source-themed arenas. Mirroring preserves battle
 * fairness; each layout has distinct paths, elevation and cover. Event state machines
 * are design/preview data in assets-src/post-sift-v3.4/map-events.mjs, not live rules.
 */
export const POST_SIFT_MAPS: DungeonsMapDef[] = [
 map(winter, 'lonely_fortress_approach', '霜冻峡湾 · 折线冰河', '弯折干路、中央冰河与分散冰堆', '冰河改道', [
  r([15, 0, 19, 17], 'PACKED_ICE', 1), r([0, 3, 11, 5], 'CALCITE', 1), r([10, 3, 14, 9], 'CALCITE', 1), r([14, 7, 19, 9], 'CALCITE', 1),
  r([0, 12, 13, 14], 'COBBLE', 1), r([12, 10, 15, 14], 'COBBLE', 1), r([15, 11, 19, 13], 'COBBLE', 1),
  ...obstacles([[8, 1], [13, 16], [17, 4], [17, 15]], 'ICICLE'),
 ]),
 map(winter, 'lonely_fortress_interior', '失落聚落 · 冰仓双庭', '双层冰仓庭院、宽侧廊与短中央冰路', '冻封补给', [
  r([10, 2, 16, 5], 'CALCITE', 2), r([9, 2, 9, 5], 'STONE', 1), r([10, 12, 16, 15], 'CALCITE', 2),
  r([9, 12, 9, 15], 'STONE', 1), r([17, 1, 19, 16], 'ICE', 1), r([16, 7, 19, 10], 'COBBLE', 1),
  ...obstacles([[12, 3], [12, 14], [17, 6], [17, 11]], 'ICICLE'),
 ]),
 map(winter, 'lonely_fortress_boss', '孤独堡垒 · 环形冰庭', '抬高中央冰庭与可绕行的双侧环廊', '冰庭解冻窗', [
  r([0, 5, 19, 12], 'CALCITE', 1), r([15, 5, 19, 12], 'CALCITE', 2), r([16, 7, 19, 10], 'PACKED_ICE', 2),
  r([0, 1, 19, 3], 'COBBLE', 1), r([0, 14, 19, 16], 'COBBLE', 1),
  ...obstacles([[11, 4], [11, 13], [17, 1], [17, 16]], 'ICICLE', 3),
 ]),
 map(jungle, 'overgrown_temple_approach', '昏暗丛林 · 曲径林隙', '错落树丛、曲径与可穿行泥沼支路', '藤门捷径', [
  r([12, 6, 19, 11], 'MUD', 1), r([0, 7, 9, 9], 'PATH', 1), r([8, 4, 12, 9], 'PATH', 1), r([12, 4, 19, 6], 'PATH', 1),
  r([8, 12, 19, 14], 'COBBLE', 1), ...obstacles([[5, 2], [9, 11], [12, 2], [16, 15], [18, 8]], 'OAK'),
 ]),
 map(jungle, 'overgrown_temple_interior', '丛林营地 · 四院交汇', '四座小庭院与十字交汇，中央池塘可绕行', '丛林营救', [
  r([15, 6, 19, 11], 'WATER', 0), r([0, 3, 19, 5], 'COBBLE', 1), r([0, 12, 19, 14], 'COBBLE', 1),
  r([11, 2, 14, 15], 'PATH', 1), r([14, 8, 19, 9], 'COBBLE', 1),
  r([8, 1, 11, 2], 'MOSS', 2), r([8, 15, 11, 16], 'MOSS', 2), ...obstacles([[9, 6], [9, 11], [17, 2], [17, 15]], 'OAK'),
 ]),
 map(jungle, 'overgrown_temple_boss', '蔓生神殿 · 根巢回廊', '宽前庭、抬高祭台与左右根巢侧廊', '根巢清理', [
  r([0, 6, 19, 11], 'COBBLE', 1), r([16, 5, 19, 12], 'MOSS', 2), r([15, 5, 15, 12], 'STONE', 1),
  r([11, 2, 19, 4], 'PATH', 1), r([11, 13, 19, 15], 'PATH', 1),
  ...obstacles([[12, 5], [12, 12], [17, 1], [17, 16]], 'OAK', 3),
 ]),
 map(ocean, 'abyssal_monument_approach', '珊瑚高地 · 礁环陆桥', '浅水中央与三处不等宽陆桥、珊瑚掩体', '珊瑚闸流', [
  r([15, 0, 19, 17], 'WATER', 0), r([10, 2, 19, 4], 'CALCITE', 1), r([13, 7, 19, 10], 'PRISMARINE', 1),
  r([9, 13, 19, 15], 'CALCITE', 1), r([10, 5, 12, 12], 'COBBLE', 1),
  ...obstacles([[9, 1], [12, 16], [17, 5], [17, 12]], 'PILLAR', 2),
 ]),
 map(ocean, 'abyssal_monument_interior', '辉光峡谷 · 阶梯沉船', '阶梯石台接入错位水上栈道，保留干路', '沉船军需', [
  r([15, 0, 19, 17], 'WATER', 0), r([10, 2, 14, 5], 'CALCITE', 2), r([9, 2, 9, 5], 'CALCITE', 1),
  r([14, 4, 17, 6], 'PRISMARINE', 1), r([16, 6, 19, 8], 'PRISMARINE', 1),
  r([12, 11, 17, 13], 'COBBLE', 1), r([16, 10, 19, 12], 'COBBLE', 1), r([14, 14, 19, 15], 'CALCITE', 1),
  ...obstacles([[10, 7], [10, 10], [13, 3], [17, 14]], 'PILLAR'),
 ]),
 map(ocean, 'abyssal_monument_boss', '深渊纪念碑 · 三阶祭场', '中央大祭台、两翼低桥及独立水雷航道', '水雷航道', [
  r([15, 0, 19, 17], 'WATER', 0), r([13, 5, 19, 12], 'PRISMARINE', 1), r([18, 7, 19, 10], 'CALCITE', 2),
  r([11, 1, 19, 3], 'CALCITE', 1), r([11, 14, 19, 16], 'CALCITE', 1),
  ...obstacles([[12, 4], [12, 13], [16, 1], [16, 16]], 'PILLAR', 3),
 ]),
 map(nether, 'nether_fortress_approach', '玄武岩三角洲 · 分流喷口', '断续熔岩槽与高低错落的玄武岩遮挡', '玄武岩喷口', [
  r([15, 0, 19, 3], 'LAVA', 0), r([16, 6, 19, 8], 'LAVA', 0), r([15, 11, 19, 14], 'LAVA', 0),
  r([0, 4, 19, 5], 'BLACKSTONE', 1), r([10, 9, 19, 10], 'BASALT', 1), r([12, 15, 19, 16], 'BLACKSTONE', 1),
  ...obstacles([[8, 1], [12, 7], [12, 13], [17, 16]], 'BASALT_COL'),
 ]),
 map(nether, 'nether_fortress_interior', '猪灵前哨 · 熔沟内院', '熔沟围绕的内院与两条宽侧翼，不强迫走火池', '猪灵军需交易', [
  r([17, 7, 19, 10], 'LAVA', 0), r([11, 4, 19, 6], 'BLACKSTONE', 1), r([11, 11, 19, 13], 'BLACKSTONE', 1),
  r([15, 4, 16, 13], 'BASALT', 1), r([10, 1, 14, 3], 'BLACKSTONE', 2), r([10, 14, 14, 16], 'BLACKSTONE', 2),
  ...obstacles([[12, 5], [12, 12], [17, 2], [17, 15]], 'BASALT_COL'),
 ]),
 map(nether, 'nether_fortress_boss', '下界堡垒 · 四炉平台', '宽中央接敌区、四组侧炉与双翼护卫位', '护盾熔炉', [
  r([15, 1, 19, 3], 'LAVA', 0), r([15, 14, 19, 16], 'LAVA', 0), r([0, 5, 19, 12], 'BLACKSTONE', 1),
  r([16, 6, 19, 11], 'BASALT', 2), r([15, 6, 15, 11], 'BLACKSTONE', 1),
  ...obstacles([[10, 2], [13, 4], [10, 15], [13, 13]], 'BASALT_COL', 3),
 ]),
 map(gale, 'gale_sanctum_approach', '风袭山峰 · 双脊缓坡', '低谷主路与两条高脊缓坡，风道不等于悬崖', '风车顺逆风', [
  r([0, 6, 19, 11], 'GRAVEL', 0), r([12, 1, 19, 4], 'SANDSTONE', 2), r([11, 1, 11, 4], 'STONE', 1),
  r([12, 13, 19, 16], 'SANDSTONE', 2), r([11, 13, 11, 16], 'STONE', 1), r([16, 7, 19, 10], 'CALCITE', 1),
  ...obstacles([[8, 2], [8, 15], [15, 5], [15, 12]], 'PILLAR'),
 ]),
 map(gale, 'gale_sanctum_interior', '巨垣城墙 · 堡垒阶庭', '上下城垛、低庭和错列掩体，远近程各有接敌路', '城垛烽旗', [
  r([9, 1, 19, 5], 'SANDSTONE', 2), r([9, 12, 19, 16], 'SANDSTONE', 2),
  r([8, 1, 8, 5], 'STONE', 1), r([8, 12, 8, 16], 'STONE', 1), r([0, 8, 19, 9], 'GRAVEL', 0),
  r([14, 6, 19, 11], 'CALCITE', 1), ...obstacles([[11, 3], [11, 14], [16, 6], [16, 11]], 'PILLAR', 2),
 ]),
 map(gale, 'gale_sanctum_boss', '疾风圣殿 · 风印高台', '开阔高台由整面缓坡接入，柱体分隔两翼', '圣殿风印', [
  r([15, 4, 19, 13], 'SANDSTONE', 2), r([14, 4, 14, 13], 'CALCITE', 1),
  r([0, 2, 19, 3], 'STONE', 1), r([0, 14, 19, 15], 'STONE', 1),
  ...obstacles([[12, 1], [17, 1], [12, 16], [17, 16]], 'PILLAR', 3),
 ]),
 map(end, 'broken_citadel_approach', '末影荒野 · 汇流长桥', '两条斜向实心长桥汇入中央紫珀台，不绘制假洞', '末影门岔路', [
  r([12, 1, 15, 6], 'OBSIDIAN', 1), r([15, 4, 19, 6], 'PURPUR', 2), r([14, 4, 14, 6], 'END_STONE', 1),
  r([12, 11, 15, 16], 'OBSIDIAN', 1), r([15, 11, 19, 13], 'PURPUR', 2), r([14, 11, 14, 13], 'END_STONE', 1),
  r([16, 7, 19, 10], 'OBSIDIAN', 1), ...obstacles([[9, 3], [9, 14], [17, 1], [17, 16]], 'CHORUS'),
 ]),
 map(end, 'broken_citadel_interior', '虚空档案 · 扇形回廊', '高台扇形交汇与低处档案侧廊，所有地面实心', '虚空档案', [
  r([11, 3, 19, 6], 'PURPUR', 2), r([11, 11, 19, 14], 'PURPUR', 2), r([10, 3, 10, 14], 'END_STONE', 1),
  r([15, 7, 19, 10], 'OBSIDIAN', 1), r([0, 8, 14, 9], 'COBBLE', 1),
  ...obstacles([[12, 4], [12, 13], [17, 2], [17, 15], [18, 8]], 'CHORUS'),
 ]),
 map(end, 'broken_citadel_boss', '破碎堡垒 · 导管王座', '多层中央终战台、两翼导管位与宽撤退环廊', '堡垒虚空导管', [
  r([12, 5, 19, 12], 'PURPUR', 1), r([16, 6, 19, 11], 'OBSIDIAN', 2),
  r([10, 1, 19, 3], 'END_STONE', 1), r([10, 14, 19, 16], 'END_STONE', 1),
  ...obstacles([[12, 4], [12, 13], [17, 1], [17, 16]], 'CHORUS', 3),
 ]),
];
