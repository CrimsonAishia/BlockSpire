import type { S, F, Sky } from '../battle/terrain.ts';

export interface DungeonsRegion {
  /** Inclusive left-half cell rectangle; mirrored onto the enemy half. */
  rect: [number, number, number, number];
  surface?: keyof typeof S;
  height?: number;
  feature?: keyof typeof F;
  featureHeight?: number;
}
export interface DungeonsMapDef {
  id: string;
  name: string;
  act: number;
  sky: Sky;
  reference: string;
  base: keyof typeof S;
  height: number;
  effects: string[];
  regions: DungeonsRegion[];
}
const r = (rect: DungeonsRegion['rect'], surface?: keyof typeof S, height?: number, feature?: keyof typeof F, featureHeight?: number): DungeonsRegion =>
  ({ rect, surface, height, feature, featureHeight });
const point = (x: number, y: number, feature: keyof typeof F, featureHeight: number) => r([x, y, x, y], undefined, undefined, feature, featureHeight);

/** Authored battle layouts, derived from the official reference's terrain motifs. */
export const DUNGEONS_MAPS: DungeonsMapDef[] = [
  {
    id: 'creeper_crossing', name: '苦力怕林桥', act: 1, sky: 'night', reference: 'creeper_woods', base: 'GRASS', height: 1,
    effects: ['中央水沟与三条安全桥路', '水面减速；树干遮挡射线', '部署区保持干燥，前沿无高树'],
    regions: [
      r([15, 0, 19, 17], 'WATER', 0), r([0, 7, 19, 9], 'PATH', 1), r([15, 2, 19, 3], 'COBBLE', 1), r([15, 14, 19, 15], 'COBBLE', 1),
      ...[[3, 1], [7, 1], [11, 1], [5, 5], [11, 5], [4, 12], [10, 12]].map(([x, y]) => point(x, y, 'OAK', 3)),
      point(13, 6, 'BOULDER', 1), point(13, 11, 'BOULDER', 1),
    ],
  },
  {
    id: 'desert_tomb', name: '无名王墓', act: 1, sky: 'dusk', reference: 'desert_temple', base: 'SAND', height: 1,
    effects: ['砂岩中庭与双侧通路', '沙地移速 ×0.9，沙漠生物依既有规则适配', '抬高的砂岩柱遮挡低弹道'],
    regions: [
      r([0, 7, 19, 10], 'SANDSTONE', 1), r([12, 4, 19, 13], 'SANDSTONE', 1),
      ...[[16, 3], [18, 3], [16, 14], [18, 14]].map(([x, y]) => r([x, y, x, y], 'SANDSTONE', 1, 'PILLAR', 3)),
      point(12, 2, 'TORCH', 0), point(17, 2, 'TORCH', 0), point(12, 13, 'TORCH', 0),
    ],
  },
  {
    id: 'ember_forge', name: '余烬锻造厂', act: 2, sky: 'nether', reference: 'fiery_forge', base: 'NETHER_BRICK', height: 1,
    effects: ['熔岩仅在中央争夺区，两侧部署区无岩浆', '普通地面单位在岩浆上移速 ×0.5，持续刷新 4% 最大生命/秒燃烧', '中央桥及上下两条通道均可安全通行'],
    regions: [
      r([15, 0, 19, 17], 'LAVA', 0), r([0, 7, 19, 10], 'BLACKSTONE', 1),
      r([15, 2, 19, 3], 'BLACKSTONE', 1), r([15, 14, 19, 15], 'BLACKSTONE', 1),
      ...[[7, 1], [12, 1], [7, 12], [12, 12]].map(([x, y]) => point(x, y, 'BASALT_COL', 3)),
      ...[[2, 5], [6, 5], [10, 5]].map(([x, y]) => point(x, y, 'RAIL', 0)),
      point(14, 6, 'TORCH', 0), point(14, 11, 'TORCH', 0),
    ],
  },
  {
    id: 'wind_canyon', name: '回风峡谷', act: 2, sky: 'day', reference: 'howling_peaks', base: 'CALCITE', height: 1,
    effects: ['两层高台由一格高差的坡道接入', '低处砾石移速 ×0.95', '风带与坠崖伤害尚未实现，不绘制成现成机关或致死悬崖'],
    regions: [
      r([0, 6, 19, 11], 'GRAVEL', 0), r([10, 2, 19, 4], 'SANDSTONE', 2), r([9, 1, 19, 1], 'STONE', 1), r([9, 5, 19, 5], 'STONE', 1),
      r([10, 13, 19, 14], 'SANDSTONE', 2), r([9, 12, 19, 12], 'STONE', 1), r([9, 15, 19, 15], 'STONE', 1), r([15, 7, 19, 10], 'PRISMARINE', 1),
      point(3, 1, 'SPRUCE', 3), point(7, 1, 'SPRUCE', 3), point(4, 13, 'BOULDER', 1),
    ],
  },
  {
    id: 'high_halls', name: '灾厄高厅', act: 3, sky: 'dusk', reference: 'fortress_assault', base: 'COBBLE', height: 1,
    effects: ['中厅与双侧长廊', '高台和柱体遮挡低弹道，侧廊保持连通', '火把仅照明，不产生燃烧伤害'],
    regions: [
      r([0, 7, 19, 10], 'STONE', 1), r([14, 4, 19, 13], 'STONE', 1),
      ...[[16, 4], [18, 4], [16, 13], [18, 13]].map(([x, y]) => r([x, y, x, y], 'COBBLE', 1, 'PILLAR', 3)),
      ...[[4, 2], [9, 2], [14, 2], [4, 12], [9, 12]].map(([x, y]) => point(x, y, 'LANTERN', 0)),
    ],
  },
  {
    id: 'void_ruins', name: '回响虚境', act: 3, sky: 'end', reference: 'echoing_void', base: 'END_STONE', height: 1,
    effects: ['紫珀台地、黑曜石通路与紫颂障碍', '三条实心桥路由一格坡道连接', '没有画出不可碰撞的假空洞，不新增即死或全场持续伤害'],
    regions: [
      r([14, 0, 19, 17], 'OBSIDIAN', 0), r([12, 6, 19, 11], 'PURPUR', 2),
      r([11, 5, 19, 5], 'PURPUR', 1), r([11, 12, 19, 12], 'PURPUR', 1),
      r([14, 2, 19, 3], 'END_STONE', 1), r([14, 14, 19, 15], 'END_STONE', 1),
      point(7, 2, 'CHORUS', 3), point(12, 2, 'BOULDER', 2), point(8, 13, 'CHORUS', 2),
    ],
  },
];
export const DUNGEONS_MAP_BY_ID = Object.fromEntries(DUNGEONS_MAPS.map(map => [map.id, map])) as Record<string, DungeonsMapDef>;
