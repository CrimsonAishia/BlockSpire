// Battlefield terrain: a symmetric voxel grid with surfaces, elevation and obstacles.
// Pure data + queries (no rendering) so the headless sim, the bot and the 3D view share it.
import { Rng } from '../core/rng.ts';
import type { MobDef } from '../core/types.ts';

export const BLOCK = 32;
export const GW = 40;
export const GD = 18;
/** Columns [0, DEPLOY_COLS) belong to team 0, the mirrored ones to team 1. */
export const DEPLOY_COLS = 15;

// Surfaces
export const S = {
  GRASS: 0, DIRT: 1, PATH: 2, SAND: 3, SNOW: 4, ICE: 5, STONE: 6, GRAVEL: 7, COBBLE: 8, DEEPSLATE: 9, MOSS: 10, MUD: 11,
  WATER: 12, LAVA: 13, SOUL_SAND: 14, NETHERRACK: 15, NYLIUM: 16, BASALT: 17, BLACKSTONE: 18, NETHER_BRICK: 19,
  END_STONE: 20, OBSIDIAN: 21, PURPUR: 22, PRISMARINE: 23, SANDSTONE: 24,
  // Ice caves: brittle ice cracks under feet and drops you into the water below.
  PACKED_ICE: 25, CALCITE: 26, BRITTLE_ICE: 27,
  // The Sift: pink sculk-like turf, pale stone, chitin plates and Ouch Water.
  SIFT_GRASS: 28, SIFT_STONE: 29, CHITIN: 30, OUCH: 31,
} as const;

// Features (things standing on a cell)
export const F = {
  NONE: 0, OAK: 1, SPRUCE: 2, CACTUS: 3, BOULDER: 4, PILLAR: 5, FUNGUS: 6, BASALT_COL: 7, COBWEB: 8, CHORUS: 9,
  FLOWER: 10, TALLGRASS: 11, LILY: 12, HAY: 13, WELL: 14, TORCH: 15, BONES: 16, RAIL: 17, LANTERN: 18,
  // Built in battle by Steve: cobblestone, obsidian (indestructible) and cactus walls.
  WALL: 19, OWALL: 20, CWALL: 21,
  ICICLE: 22, WHITE_TREE: 23, SPIRE: 24, GLOWBULB: 25,
} as const;

const BLOCKING = new Set<number>([
  F.OAK, F.SPRUCE, F.CACTUS, F.BOULDER, F.PILLAR, F.FUNGUS, F.BASALT_COL, F.CHORUS, F.HAY, F.WELL, F.WALL, F.OWALL, F.CWALL, F.ICICLE, F.WHITE_TREE, F.SPIRE,
]);
/** Small decorations that a built platform simply covers. */
const DECOR = new Set<number>([F.FLOWER, F.TALLGRASS, F.TORCH, F.LANTERN, F.BONES, F.RAIL, F.LILY, F.GLOWBULB]);

export const SURFACE_INFO: Record<number, { name: string; move: number; liquid?: 'water' | 'lava' | 'ouch' }> = {
  [S.GRASS]: { name: '草地', move: 1 },
  [S.DIRT]: { name: '泥土', move: 1 },
  [S.PATH]: { name: '土径', move: 1.05 },
  [S.SAND]: { name: '沙地', move: 0.9 },
  [S.SNOW]: { name: '积雪', move: 0.82 },
  [S.ICE]: { name: '冰面', move: 1.15 },
  [S.STONE]: { name: '石头', move: 1 },
  [S.GRAVEL]: { name: '沙砾', move: 0.95 },
  [S.COBBLE]: { name: '圆石', move: 1 },
  [S.DEEPSLATE]: { name: '深板岩', move: 1 },
  [S.MOSS]: { name: '苔藓', move: 1 },
  [S.MUD]: { name: '泥沼', move: 0.75 },
  [S.WATER]: { name: '水', move: 0.6, liquid: 'water' },
  [S.LAVA]: { name: '岩浆', move: 0.5, liquid: 'lava' },
  [S.SOUL_SAND]: { name: '灵魂沙', move: 0.55 },
  [S.NETHERRACK]: { name: '下界岩', move: 1 },
  [S.NYLIUM]: { name: '绯红菌岩', move: 1 },
  [S.BASALT]: { name: '玄武岩', move: 1 },
  [S.BLACKSTONE]: { name: '黑石', move: 1 },
  [S.NETHER_BRICK]: { name: '下界砖', move: 1 },
  [S.END_STONE]: { name: '末地石', move: 1 },
  [S.OBSIDIAN]: { name: '黑曜石', move: 1 },
  [S.PURPUR]: { name: '紫珀块', move: 1 },
  [S.PRISMARINE]: { name: '海晶石', move: 1 },
  [S.SANDSTONE]: { name: '砂岩', move: 1 },
  [S.PACKED_ICE]: { name: '浮冰', move: 1.1 },
  [S.CALCITE]: { name: '方解石', move: 1 },
  [S.BRITTLE_ICE]: { name: '脆冰', move: 1.1 },
  [S.SIFT_GRASS]: { name: '筛界草甸', move: 1 },
  [S.SIFT_STONE]: { name: '筛界白石', move: 1 },
  [S.CHITIN]: { name: '甲壳', move: 1 },
  [S.OUCH]: { name: 'Ouch 水', move: 0.6, liquid: 'ouch' },
};

export const FEATURE_NAME: Record<number, string> = {
  [F.OAK]: '橡树', [F.SPRUCE]: '云杉', [F.CACTUS]: '仙人掌', [F.BOULDER]: '岩石', [F.PILLAR]: '黑曜石柱', [F.FUNGUS]: '绯红巨菌',
  [F.BASALT_COL]: '玄武岩柱', [F.COBWEB]: '蜘蛛网', [F.CHORUS]: '紫颂植物', [F.HAY]: '干草块', [F.WELL]: '水井',
  [F.WALL]: '圆石墙', [F.OWALL]: '黑曜石墙', [F.CWALL]: '仙人掌墙',
  [F.ICICLE]: '冰刺', [F.WHITE_TREE]: '白骨树', [F.SPIRE]: '甲壳尖塔',
};

export type Sky = 'day' | 'dusk' | 'night' | 'nether' | 'end' | 'water' | 'sift' | 'cave';

export interface Terrain {
  biome: string;
  name: string;
  effects: string[];
  sky: Sky;
  seed: number;
  h: Uint8Array;
  s: Uint8Array;
  f: Uint8Array;
  /** Height (blocks) of each cell's feature, shared by line of sight and rendering. */
  fh: Uint8Array;
  /** Bumped on every in-battle change; `dirty` lists changed cells, `broken` counts craters. */
  ver: number;
  dirty: number[];
  broken: number;
  /** Fixed spawn cells for special units (e.g. end crystals on their pedestals), left-half coords. */
  spots?: Record<string, [number, number][]>;
  /** Built walls: which team owns each cell (-1 none). The owner's projectiles fly over them. */
  wallTeam?: Int8Array;
  /** The Sift's 灵魂潮汐 dimension rule is in force. */
  tide?: boolean;
}

export const idx = (cx: number, cy: number) => cy * GW + cx;

/** Deterministic per-cell random in [0,1), mirror-symmetric across the arena's centre line. */
export function cellRand(seed: number, cx: number, cy: number, salt: number) {
  const x = Math.min(cx, GW - 1 - cx);
  let h = (x * 374761393 + cy * 668265263 + (seed + salt) * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** How tall a feature stands (blocks); r is the cell's random. Leaves/caps above don't count. */
export function featureHeight(f: number, r: number): number {
  switch (f) {
    case F.OAK:
      return 3 + Math.floor(r * 2);
    case F.SPRUCE:
      return 5 + Math.floor(r * 2);
    case F.CACTUS:
      return 2 + Math.floor(r * 2);
    case F.BOULDER:
      return 1 + (r > 0.6 ? 1 : 0);
    case F.PILLAR:
      return 7 + Math.floor(r * 3);
    case F.FUNGUS:
      return 4 + Math.floor(r * 2);
    case F.BASALT_COL:
      return 2 + Math.floor(r * 3);
    case F.CHORUS:
      return 3 + Math.floor(r * 3);
    case F.HAY:
    case F.WELL:
      return 1;
    case F.WALL:
    case F.OWALL:
    case F.CWALL:
      return 2;
    case F.ICICLE:
      return 2 + Math.floor(r * 2);
    case F.WHITE_TREE:
      return 3 + Math.floor(r * 2);
    case F.SPIRE:
      return 2 + Math.floor(r * 2);
    default:
      return 0;
  }
}

export function cloneTerrain(t: Terrain): Terrain {
  return { ...t, h: t.h.slice(), s: t.s.slice(), f: t.f.slice(), fh: t.fh.slice(), wallTeam: t.wallTeam?.slice(), ver: 0, dirty: [], broken: 0 };
}
export const cellX = (x: number) => Math.max(0, Math.min(GW - 1, Math.floor(x / BLOCK)));
export const cellY = (y: number) => Math.max(0, Math.min(GD - 1, Math.floor(y / BLOCK)));

export function isBlocked(t: Terrain, cx: number, cy: number) {
  if (cx < 0 || cy < 0 || cx >= GW || cy >= GD) return true;
  return BLOCKING.has(t.f[idx(cx, cy)]);
}
export const blockingFeature = (f: number) => BLOCKING.has(f);
export function heightAt(t: Terrain, x: number, y: number) {
  return t.h[idx(cellX(x), cellY(y))];
}
export function surfaceAt(t: Terrain, x: number, y: number) {
  return t.s[idx(cellX(x), cellY(y))];
}
export function featureAt(t: Terrain, x: number, y: number) {
  return t.f[idx(cellX(x), cellY(y))];
}

/** Top of the solid column at a cell in world units: ground plus any feature that blocks. */
/** Top of whatever stands on a cell (world units). `team` sees through its own built walls. */
export function solidTopAt(t: Terrain, x: number, y: number, team = -1) {
  const i = idx(cellX(x), cellY(y));
  const own = team >= 0 && t.wallTeam !== undefined && t.wallTeam[i] === team;
  return (t.h[i] + (BLOCKING.has(t.f[i]) && !own ? t.fh[i] : 0)) * BLOCK;
}

/**
 * Line of sight for a projectile from (x0,y0,z0) to (x1,y1,z1) (world units, z = height).
 * `arc` adds a lob's parabolic peak (same curve the simulation flies). Ground bumps lower than
 * the flight path don't block; trees, rocks, pillars and hill sides do.
 */
export function losClear(t: Terrain, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, arc = 0, team = -1) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / (BLOCK * 0.25));
  for (let k = 1; k < steps; k++) {
    const f = k / steps;
    const x = x0 + (x1 - x0) * f;
    const y = y0 + (y1 - y0) * f;
    const z = z0 + (z1 - z0) * f + arc * 4 * f * (1 - f);
    if (z < solidTopAt(t, x, y, team) - 2) return false;
  }
  return true;
}

// ───────────────────────── Mob terrain affinities ─────────────────────────

const SNOW_MOBS = new Set(['snow_golem', 'stray', 'polar_bear', 'goat']);
const SAND_MOBS = new Set(['husk']);
const SOUL_MOBS = new Set(['wither_skeleton', 'wither', 'wither_boss', 'skeleton']);

export function isAquatic(m: MobDef) {
  return m.families.includes('aquatic');
}
export function isClimber(m: MobDef) {
  return m.id === 'spider' || m.id === 'cave_spider';
}
export function isFireproof(m: MobDef) {
  return !!m.immune?.includes('burn');
}
export function hatesWater(m: MobDef) {
  return m.id === 'enderman';
}
/** Ouch Water burns everything that isn't from the Sift. */
export function hatesOuch(m: MobDef) {
  return !m.families.includes('sift');
}

/** Movement multiplier for a mob standing on a surface/feature. */
export function moveMul(m: MobDef, surf: number, feat: number): number {
  let mul = SURFACE_INFO[surf]?.move ?? 1;
  if (surf === S.WATER && isAquatic(m)) mul = 1.25;
  if ((surf === S.SNOW || surf === S.ICE) && SNOW_MOBS.has(m.id)) mul = Math.max(mul, 1.05);
  if (surf === S.SAND && SAND_MOBS.has(m.id)) mul = 1;
  if (surf === S.LAVA && isFireproof(m)) mul = 0.9;
  if (surf === S.SOUL_SAND && SOUL_MOBS.has(m.id)) mul = 1;
  if (feat === F.COBWEB && !m.families.includes('arthropod')) mul *= 0.3;
  if (surf === S.OUCH && !hatesOuch(m)) mul = 1.1;
  if ((surf === S.PACKED_ICE || surf === S.BRITTLE_ICE) && SNOW_MOBS.has(m.id)) mul = Math.max(mul, 1.15);
  return mul;
}

/** Attack-speed multiplier from home terrain. */
export function atkSpeedMul(m: MobDef, surf: number) {
  if ((surf === S.SNOW || surf === S.ICE || surf === S.PACKED_ICE) && SNOW_MOBS.has(m.id)) return 1.15;
  return 1;
}
export function atkMul(m: MobDef, surf: number) {
  if ((surf === S.SAND || surf === S.SANDSTONE) && SAND_MOBS.has(m.id)) return 1.15;
  return 1;
}

// ───────────────────────── Biomes ─────────────────────────

interface Builder {
  t: Terrain;
  r: Rng;
  /** Set a cell on the left half; the mirrored right-half cell is set too. */
  set(cx: number, cy: number, v: { h?: number; s?: number; f?: number }): void;
  get(cx: number, cy: number): { h: number; s: number; f: number };
  noise(x: number, y: number, scale: number): number;
}

export interface BiomeDef {
  id: string;
  name: string;
  act: number;
  /** Minimum map row (floor) at which this biome appears in normal fights. */
  minRow: number;
  skies: Sky[];
  effects: string[];
  boss?: boolean;
  /** 灵魂潮汐 (Sift biomes). */
  tide?: boolean;
  gen(b: Builder): void;
}

const HALF = GW / 2;

function fillBase(b: Builder, s: number, h = 0) {
  for (let cy = 0; cy < GD; cy++) for (let cx = 0; cx < HALF; cx++) b.set(cx, cy, { h, s, f: F.NONE });
}

function hills(b: Builder, amp: number, scale: number, bias = 0) {
  for (let cy = 0; cy < GD; cy++)
    for (let cx = 0; cx < HALF; cx++) {
      const n = b.noise(cx, cy, scale);
      b.set(cx, cy, { h: Math.max(0, Math.min(4, Math.floor(n * (amp + 1) + bias))) });
    }
}

/**
 * Rolling ground: noise quantised into `levels` terraces on top of `base`, so the field has
 * real relief (0–4) instead of a single bump. `ox` offsets the noise for a different shape.
 */
function rolling(b: Builder, o: { levels: number; scale: number; base?: number; bias?: number; ox?: number; s?: (h: number) => number | undefined }) {
  for (let cy = 0; cy < GD; cy++)
    for (let cx = 0; cx < HALF; cx++) {
      // Value noise bunches up around 0.5: stretch it so every terrace level actually shows up.
      const n = Math.max(0, Math.min(0.999, (b.noise(cx + (o.ox ?? 0), cy, o.scale) - 0.5) * 1.7 + 0.5));
      const h = Math.max(0, Math.min(4, (o.base ?? 0) + Math.floor(n * (o.levels + 1) + (o.bias ?? 0))));
      const surf = o.s?.(h);
      b.set(cx, cy, surf === undefined ? { h } : { h, s: surf });
    }
}

/** Raises a w×d block to height h (never lowers), with a one-step lip around it. */
function plateau(b: Builder, x0: number, y0: number, w: number, d: number, h: number, s?: number) {
  for (let cy = y0 - 1; cy <= y0 + d; cy++)
    for (let cx = x0 - 1; cx <= x0 + w; cx++) {
      if (cx < 0 || cy < 0 || cx >= HALF || cy >= GD) continue;
      const inside = cx >= x0 && cx < x0 + w && cy >= y0 && cy < y0 + d;
      const cur = b.get(cx, cy).h;
      const want = inside ? h : h - 2;
      if (want > cur) b.set(cx, cy, s !== undefined && inside ? { h: want, s } : { h: want });
    }
}

/** Lowers a rough disc to `h` (basins, lakes, craters). */
function basin(b: Builder, x: number, y: number, r: number, h: number, s?: number) {
  for (let cy = 0; cy < GD; cy++)
    for (let cx = 0; cx < HALF; cx++) {
      const d = Math.hypot(cx - x, (cy - y) * 1.2);
      if (d > r + b.noise(cx + 70, cy + 70, 0.5) * 1.2) continue;
      if (b.get(cx, cy).h > h || s !== undefined) b.set(cx, cy, s !== undefined ? { h: Math.min(b.get(cx, cy).h, h), s } : { h });
    }
}

function scatter(b: Builder, f: number, density: number, opts: { minX?: number; maxX?: number; on?: number[]; avoidHeightEdge?: boolean } = {}) {
  const minX = opts.minX ?? 0;
  const maxX = opts.maxX ?? HALF - 1;
  for (let cy = 0; cy < GD; cy++)
    for (let cx = minX; cx <= maxX; cx++) {
      const c = b.get(cx, cy);
      if (c.f !== F.NONE) continue;
      if (opts.on && !opts.on.includes(c.s)) continue;
      if (b.r.chance(density)) b.set(cx, cy, { f });
    }
}

function decor(b: Builder, f: number, density: number, on: number[]) {
  for (let cy = 0; cy < GD; cy++)
    for (let cx = 0; cx < HALF; cx++) {
      const c = b.get(cx, cy);
      if (c.f === F.NONE && on.includes(c.s) && b.r.chance(density)) b.set(cx, cy, { f });
    }
}

export const BIOMES: BiomeDef[] = [
  // ───── Act 1 ─────
  {
    id: 'plains', name: '草原竞技场', act: 1, minRow: 0, skies: ['day', 'day', 'dusk'],
    effects: ['起伏的草地，中央有一座小土丘：先占住它的远程居高临下。'],
    gen(b) {
      // Gentle rolling meadow with a low mound in the middle of the field.
      rolling(b, { levels: 2, scale: 0.11, bias: -0.2, s: () => S.GRASS });
      plateau(b, 16, b.r.int(6, 9), 4, 3, 2);
      scatter(b, F.OAK, 0.02, { minX: 15 });
      decor(b, F.FLOWER, 0.06, [S.GRASS]);
      decor(b, F.TALLGRASS, 0.12, [S.GRASS]);
    },
  },
  {
    id: 'forest', name: '橡木森林', act: 1, minRow: 1, skies: ['day', 'dusk'],
    effects: ['树木阻挡移动，也是掩体：能挡住箭矢和火球。', '爆炸会把树木连根炸飞。'],
    gen(b) {
      rolling(b, { levels: 2, scale: 0.15, ox: 11, s: () => S.GRASS });
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) if (b.noise(cx + 40, cy, 0.25) > 0.62) b.set(cx, cy, { s: S.DIRT });
      // A wooded hill on each side of the middle.
      plateau(b, b.r.int(9, 13), b.r.int(2, 5), 4, 4, 3);
      scatter(b, F.OAK, 0.09, { minX: 4 });
      decor(b, F.TALLGRASS, 0.15, [S.GRASS]);
      decor(b, F.FLOWER, 0.03, [S.GRASS]);
    },
  },
  {
    id: 'river', name: '河畔浅滩', act: 1, minRow: 2, skies: ['day', 'dusk', 'night'],
    effects: ['河谷：两岸是高地，中间的河水减速非水生生物；水生生物在水中加速并回血。', '末影人会尽量避开水。'],
    gen(b) {
      // A river valley: grassy banks step down to a channel in the middle with two sandy fords.
      rolling(b, { levels: 1, scale: 0.12, base: 1, bias: 0.1, s: () => S.GRASS });
      const fords = [b.r.int(2, 6), b.r.int(11, 15)];
      for (let cy = 0; cy < GD; cy++) {
        const w = 2 + (b.noise(0, cy, 0.3) > 0.5 ? 1 : 0);
        for (let cx = HALF - w; cx < HALF; cx++) {
          const ford = fords.some((f) => Math.abs(f - cy) <= 1);
          b.set(cx, cy, { h: 0, s: ford ? S.SAND : S.WATER, f: !ford && b.r.chance(0.15) ? F.LILY : F.NONE });
        }
        b.set(HALF - w - 1, cy, { h: 0, s: S.SAND });
        b.set(HALF - w - 2, cy, { h: 1, s: S.SAND });
      }
      decor(b, F.TALLGRASS, 0.14, [S.GRASS]);
      scatter(b, F.OAK, 0.03, { maxX: 13 });
    },
  },
  {
    id: 'hills', name: '风袭丘陵', act: 1, minRow: 3, skies: ['day', 'dusk'],
    effects: ['层层台地，最高四格：远程站上去射程与伤害提升（居高临下）。', '中间有一条山口；攀爬缓慢（蜘蛛除外），被撞下高台会摔伤。'],
    gen(b) {
      // Wind-swept terraces up to four blocks high, cut by a pass through the middle.
      rolling(b, { levels: 4, scale: 0.15, bias: -0.3, s: (h) => (h >= 3 ? S.STONE : h === 2 ? S.GRAVEL : S.GRASS) });
      const pass = b.r.int(6, 11);
      for (let cy = pass; cy < pass + 3; cy++) for (let cx = 10; cx < HALF; cx++) b.set(cx, cy, { h: 1, s: S.GRASS });
      plateau(b, b.r.int(2, 6), b.r.int(1, 4), 3, 3, 4, S.STONE);
      scatter(b, F.BOULDER, 0.025, { minX: 6 });
      decor(b, F.TALLGRASS, 0.1, [S.GRASS]);
    },
  },
  {
    id: 'desert', name: '沙漠遗迹', act: 1, minRow: 2, skies: ['day', 'dusk'],
    effects: ['沙丘起伏，砂岩神殿高三格；沙地略微减速，尸壳在沙地攻击 +15%。', '仙人掌阻挡移动。'],
    gen(b) {
      // Rolling dunes and two ruined sandstone temples with stairs.
      rolling(b, { levels: 2, scale: 0.09, ox: 23, s: () => S.SAND });
      for (let k = 0; k < 2; k++) plateau(b, b.r.int(3, 14), b.r.int(1, GD - 6), 3, 3, 3, S.SANDSTONE);
      scatter(b, F.CACTUS, 0.035, { minX: 5, on: [S.SAND] });
      decor(b, F.BONES, 0.01, [S.SAND]);
    },
  },
  {
    id: 'snowy', name: '冰雪平原', act: 1, minRow: 3, skies: ['day', 'night'],
    effects: ['雪丘环绕一片结冰的湖：冰面让移动加快，积雪减速。', '雪傀儡、流浪者、北极熊、山羊不受积雪影响，且攻速 +15%。'],
    gen(b) {
      // Snowy hills around a frozen lake in a hollow.
      rolling(b, { levels: 2, scale: 0.13, base: 1, ox: 5, s: () => S.SNOW });
      basin(b, b.r.int(12, 16), b.r.int(5, 12), 3.2, 0, S.ICE);
      scatter(b, F.SPRUCE, 0.05, { minX: 3, on: [S.SNOW] });
    },
  },
  {
    id: 'swamp', name: '迷雾沼泽', act: 1, minRow: 4, skies: ['dusk', 'night'],
    effects: ['低洼的沼泽：泥沼与水洼减速，高出一截的小岛长着树。', '水生生物在水里如鱼得水。'],
    gen(b) {
      // Low marsh: water and mud in the hollows, little raised islands with trees.
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) {
          const n = b.noise(cx, cy, 0.2);
          if (n > 0.62 && cx > 5) b.set(cx, cy, { h: 0, s: S.WATER, f: b.r.chance(0.25) ? F.LILY : F.NONE });
          else if (n > 0.48) b.set(cx, cy, { h: 0, s: S.MUD });
          else b.set(cx, cy, { h: n < 0.3 ? 2 : 1, s: S.GRASS });
        }
      scatter(b, F.OAK, 0.05, { minX: 4, on: [S.GRASS] });
      decor(b, F.TALLGRASS, 0.1, [S.GRASS]);
    },
  },
  {
    id: 'mineshaft', name: '废弃矿井', act: 1, minRow: 5, skies: ['night'],
    effects: ['矿道分好几层，最高三格：蜘蛛网大幅减速（节肢生物免疫）。'],
    gen(b) {
      // Mine levels: stepped ledges up to three blocks with a rail track on the middle level.
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) {
          const n = b.noise(cx, cy, 0.16);
          const h = n > 0.68 ? 3 : n > 0.55 ? 2 : n > 0.4 ? 1 : 0;
          b.set(cx, cy, { h, s: h === 0 ? (b.r.chance(0.3) ? S.GRAVEL : S.STONE) : S.DEEPSLATE });
        }
      for (let cx = 0; cx < HALF; cx++) b.set(cx, 9, { h: 1, s: S.GRAVEL, f: F.RAIL });
      scatter(b, F.COBWEB, 0.08, { minX: 9 });
      scatter(b, F.LANTERN, 0.015, { minX: 4 });
    },
  },
  {
    id: 'ice_caves', name: '冰洞', act: 1, minRow: 5, skies: ['cave'],
    effects: ['冰洞：浮冰地面让移动加快，方解石台阶最高三格；冰刺阻挡移动。', '脆冰：有单位站上去约 3 秒就会碎裂，变成冰冷的水洼（减速）。'],
    gen(b) {
      // Packed-ice floor under calcite ledges, icicles, and patches of brittle ice over water.
      rolling(b, { levels: 2, scale: 0.13, ox: 41, s: (h) => (h >= 2 ? S.CALCITE : S.PACKED_ICE) });
      plateau(b, b.r.int(2, 6), b.r.int(1, 5), 3, 3, 3, S.CALCITE);
      for (let k = 0; k < 3; k++) basin(b, b.r.int(9, 18), b.r.int(2, GD - 4), 1.8 + b.r.next(), 0, S.BRITTLE_ICE);
      scatter(b, F.ICICLE, 0.035, { minX: 5, on: [S.PACKED_ICE, S.CALCITE] });
      decor(b, F.LANTERN, 0.01, [S.CALCITE]);
    },
  },
  {
    id: 'village', name: '村庄广场', act: 1, minRow: 99, skies: ['dusk'], boss: true,
    effects: ['村庄袭击的战场：干草堆与水井阻挡移动。'],
    gen(b) {
      // Village square: a gentle rise at the back, raised farm plots and a sunken path.
      rolling(b, { levels: 1, scale: 0.1, bias: -0.3, ox: 3, s: () => S.GRASS });
      for (let cy = 0; cy < GD; cy++) for (let cx = 0; cx < 6; cx++) b.set(cx, cy, { h: Math.max(b.get(cx, cy).h, 1) });
      for (let cx = 0; cx < HALF; cx++) b.set(cx, 8, { s: S.PATH, h: 0 }), b.set(cx, 9, { s: S.PATH, h: 0 });
      for (let cy = 0; cy < GD; cy++) b.set(HALF - 1, cy, { s: S.PATH, h: 0 });
      plateau(b, 8, 2, 4, 3, 1, S.DIRT);
      plateau(b, 8, 13, 4, 3, 1, S.DIRT);
      b.set(HALF - 1, 8, { f: F.WELL });
      b.set(HALF - 1, 9, { f: F.WELL });
      for (const [x, y] of [[12, 3], [12, 14], [16, 5], [16, 12]]) b.set(x, y, { f: F.HAY });
      decor(b, F.FLOWER, 0.07, [S.GRASS]);
      decor(b, F.TORCH, 0.02, [S.PATH]);
    },
  },
  {
    id: 'monument', name: '海底神殿', act: 1, minRow: 99, skies: ['water'], boss: true,
    effects: ['神殿积水：水道减速非水生生物；水生生物加速并回血。'],
    gen(b) {
      // Temple floor with raised prismarine walkways between flooded channels.
      fillBase(b, S.PRISMARINE, 1);
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) {
          const channel = (cy % 6 === 2 && cx >= 11) || (cx >= 17 && cx <= 18 && cy % 5 !== 0);
          if (channel) b.set(cx, cy, { s: S.WATER, h: 0 });
        }
      for (const [x, y] of [[9, 0], [9, 16], [14, 6], [14, 11]]) plateau(b, x, y, 2, 2, 2);
      decor(b, F.LANTERN, 0.02, [S.PRISMARINE]);
    },
  },

  // ───── Act 2 ─────
  {
    id: 'wastes', name: '下界荒地', act: 2, minRow: 0, skies: ['nether'],
    effects: ['下界岩丘陵，低洼处积着岩浆：灼烧非免疫生物，被击退进去会持续燃烧。'],
    gen(b) {
      // Netherrack hills with lava pooled in the hollows.
      rolling(b, { levels: 3, scale: 0.14, bias: -0.2, s: () => S.NETHERRACK });
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 6; cx < HALF; cx++) if (b.get(cx, cy).h <= 1 && b.noise(cx + 20, cy, 0.22) > 0.64) b.set(cx, cy, { h: 0, s: S.LAVA });
      scatter(b, F.BOULDER, 0.02, { minX: 8 });
    },
  },
  {
    id: 'soul_valley', name: '灵魂沙峡谷', act: 2, minRow: 2, skies: ['nether'],
    effects: ['灵魂沙谷底夹在玄武岩崖壁之间：灵魂沙大幅减速（凋灵骷髅与骷髅不受影响）。', '崖顶是远程的好位置；玄武岩柱阻挡移动。'],
    gen(b) {
      // A valley floor of soul sand between high basalt cliffs at the back.
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) {
          const n = b.noise(cx, cy + 30, 0.2);
          const cliff = cy <= 3 ? 4 - cy + (n > 0.5 ? 0 : -1) : cy >= GD - 4 ? 1 : 0;
          const h = Math.max(0, cliff + (n > 0.62 ? 1 : 0));
          b.set(cx, cy, { h, s: h >= 2 || n > 0.55 ? S.BASALT : S.SOUL_SAND });
        }
      scatter(b, F.BASALT_COL, 0.035, { minX: 6 });
      decor(b, F.BONES, 0.03, [S.SOUL_SAND]);
    },
  },
  {
    id: 'crimson', name: '绯红森林', act: 2, minRow: 1, skies: ['nether'],
    effects: ['巨型绯红菌阻挡移动，也是挡住投射物的天然掩体。'],
    gen(b) {
      rolling(b, { levels: 3, scale: 0.15, bias: -0.3, ox: 17, s: () => S.NYLIUM });
      scatter(b, F.FUNGUS, 0.07, { minX: 4 });
      decor(b, F.TALLGRASS, 0.08, [S.NYLIUM]);
    },
  },
  {
    id: 'basalt', name: '玄武岩三角洲', act: 2, minRow: 4, skies: ['nether'],
    effects: ['崎岖的玄武岩台地，高低差极大：小心被击退摔落。', '高台让远程单位居高临下，山坡也会挡住射击。'],
    gen(b) {
      fillBase(b, S.BLACKSTONE);
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) {
          const n = b.noise(cx, cy, 0.22);
          const h = n > 0.74 ? 4 : n > 0.62 ? 3 : n > 0.5 ? 2 : n > 0.38 ? 1 : 0;
          b.set(cx, cy, { h, s: h >= 2 ? S.BASALT : S.BLACKSTONE });
        }
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 8; cx < HALF; cx++) if (b.get(cx, cy).h === 0 && b.noise(cx + 7, cy + 7, 0.3) > 0.72) b.set(cx, cy, { s: S.LAVA });
      scatter(b, F.BASALT_COL, 0.02, { minX: 6 });
    },
  },
  {
    id: 'fortress', name: '要塞桥廊', act: 2, minRow: 3, skies: ['nether'],
    effects: ['桥廊两侧是岩浆：被击退落入岩浆会持续燃烧！'],
    gen(b) {
      fillBase(b, S.NETHER_BRICK, 1);
      for (let cx = 0; cx < HALF; cx++)
        for (const cy of [0, 1, GD - 2, GD - 1]) b.set(cx, cy, { h: 0, s: S.LAVA });
      for (let cx = 9; cx < HALF; cx++) for (const cy of [2, GD - 3]) if (b.r.chance(0.5)) b.set(cx, cy, { h: 0, s: S.LAVA });
      decor(b, F.LANTERN, 0.02, [S.NETHER_BRICK]);
    },
  },
  {
    id: 'wither_altar', name: '灵魂祭坛', act: 2, minRow: 99, skies: ['nether'], boss: true,
    effects: ['灵魂沙环绕祭坛：大幅减速（凋灵骷髅不受影响）。'],
    gen(b) {
      // A raised altar of soul sand in a basalt bowl: the rim is high ground.
      fillBase(b, S.SOUL_SAND);
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) {
          const dx = cx - (HALF - 0.5);
          const dy = cy - (GD / 2 - 0.5);
          const r = Math.hypot(dx * 0.6, dy);
          if (r > 6 || cx < 10) b.set(cx, cy, { s: S.BASALT, h: r > 7.5 ? 2 : 1 });
          else if (r < 2.5) b.set(cx, cy, { h: 1 });
        }
      scatter(b, F.BONES, 0.03, {});
      for (const [x, y] of [[13, 2], [13, 15]]) b.set(x, y, { f: F.BASALT_COL });
    },
  },

  // ───── Act 3 ─────
  {
    id: 'end_island', name: '末地岛屿', act: 3, minRow: 0, skies: ['end'],
    effects: ['起伏的虚空之岛与几块高台；紫颂植物阻挡移动。'],
    gen(b) {
      // Undulating end stone with a few raised outcrops.
      rolling(b, { levels: 2, scale: 0.12, bias: -0.1, ox: 31, s: () => S.END_STONE });
      plateau(b, b.r.int(6, 12), b.r.int(2, 12), 3, 3, 3);
      scatter(b, F.CHORUS, 0.035, { minX: 6 });
      scatter(b, F.BOULDER, 0.01, { minX: 8 });
    },
  },
  {
    id: 'end_city', name: '末地城', act: 3, minRow: 2, skies: ['end'],
    effects: ['紫珀塔楼层层叠叠，最高四格：远程居高临下，近战得绕着台阶爬上去。'],
    gen(b) {
      rolling(b, { levels: 1, scale: 0.12, s: () => S.END_STONE });
      // Purpur towers in tiers: a tall one with a mid step in front of it.
      for (let k = 0; k < 3; k++) {
        const x0 = b.r.int(2, 14);
        const y0 = b.r.int(0, GD - 6);
        const hh = b.r.int(2, 4);
        plateau(b, x0, y0, 3, 4, hh, S.PURPUR);
      }
      scatter(b, F.CHORUS, 0.02, { minX: 6, on: [S.END_STONE] });
    },
  },
  {
    id: 'dragon_nest', name: '黑曜石之巅', act: 3, minRow: 99, skies: ['end'], boss: true,
    effects: ['四座黑曜石台上的末地水晶持续治疗末影龙——分头摧毁它们！'],
    gen(b) {
      fillBase(b, S.END_STONE);
      hills(b, 1, 0.1, -0.5);
      // The dragon's nest at the back, crystals spread over four pedestals around it, each with
      // an obsidian pillar behind (from the attacker's side) so it never blocks the approach.
      for (let cy = 6; cy < 12; cy++) for (let cx = 4; cx < 8; cx++) b.set(cx, cy, { h: 1, s: S.OBSIDIAN });
      const crystals: [number, number][] = [[3, 2], [10, 4], [10, 13], [3, 14]];
      for (const [x, y] of crystals) {
        b.set(x, y, { h: 1, s: S.OBSIDIAN, f: F.NONE });
        b.set(x - 1, y, { f: F.PILLAR });
      }
      b.t.spots = { end_crystal: crystals };
    },
  },

  // ───── Act 4 · the Sift ─────
  {
    id: 'sift_meadow', name: '粉色草甸', act: 4, minRow: 0, skies: ['sift'], tide: true,
    effects: ['灵魂潮汐：每 15 秒涨潮 4 秒，非筛界生物攻速 -25%、每秒损失 2% 生命（筛界羁绊②可免疫）。', 'Ouch 水：灼伤非筛界生物（每秒 4% 生命），却会治疗筛界生物。'],
    gen(b) {
      // Rolling pink turf, glowing bulbs, a few bone-white trees and Ouch Water in the hollows.
      rolling(b, { levels: 2, scale: 0.12, ox: 53, s: () => S.SIFT_GRASS });
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 7; cx < HALF; cx++) if (b.get(cx, cy).h === 0 && b.noise(cx + 33, cy, 0.24) > 0.66) b.set(cx, cy, { h: 0, s: S.OUCH });
      plateau(b, b.r.int(8, 14), b.r.int(3, 11), 3, 3, 2, S.SIFT_STONE);
      scatter(b, F.WHITE_TREE, 0.025, { minX: 5, on: [S.SIFT_GRASS] });
      decor(b, F.GLOWBULB, 0.08, [S.SIFT_GRASS]);
    },
  },
  {
    id: 'carapace', name: '甲壳荒原', act: 4, minRow: 2, skies: ['sift'], tide: true,
    effects: ['灵魂潮汐：每 15 秒涨潮 4 秒，非筛界生物攻速 -25%、每秒损失 2% 生命（筛界羁绊②可免疫）。', '甲壳台地层层叠叠，最高四格；甲壳尖塔是挡箭的掩体。'],
    gen(b) {
      // Terraces of chitin plates and pale stone ridges with spires sticking out.
      rolling(b, { levels: 3, scale: 0.15, bias: -0.2, ox: 61, s: (h) => (h >= 3 ? S.SIFT_STONE : S.CHITIN) });
      plateau(b, b.r.int(3, 8), b.r.int(1, 5), 3, 4, 4, S.SIFT_STONE);
      scatter(b, F.SPIRE, 0.04, { minX: 5 });
      decor(b, F.GLOWBULB, 0.03, [S.CHITIN]);
    },
  },
  {
    id: 'white_forest', name: '白骨森林', act: 4, minRow: 4, skies: ['sift'], tide: true,
    effects: ['灵魂潮汐：每 15 秒涨潮 4 秒，非筛界生物攻速 -25%、每秒损失 2% 生命（筛界羁绊②可免疫）。', '白骨树林阻挡移动和投射物。', 'Ouch 水溪横穿战场，只有两处浅滩能安全通过。'],
    gen(b) {
      // A bone-white forest split by a stream of Ouch Water with two fords.
      rolling(b, { levels: 2, scale: 0.14, base: 1, ox: 71, s: () => S.SIFT_GRASS });
      const fords = [b.r.int(2, 6), b.r.int(11, 15)];
      for (let cy = 0; cy < GD; cy++) {
        const ford = fords.some((f) => Math.abs(f - cy) <= 1);
        for (let cx = HALF - 2; cx < HALF; cx++) b.set(cx, cy, { h: 0, s: ford ? S.SIFT_STONE : S.OUCH, f: F.NONE });
        b.set(HALF - 3, cy, { h: 0, s: S.SIFT_STONE });
      }
      scatter(b, F.WHITE_TREE, 0.08, { minX: 4, maxX: HALF - 4, on: [S.SIFT_GRASS] });
      decor(b, F.GLOWBULB, 0.06, [S.SIFT_GRASS]);
    },
  },
  {
    id: 'sift_heart', name: '筛界之心', act: 4, minRow: 99, skies: ['sift'], boss: true, tide: true,
    effects: ['灵魂潮汐：每 15 秒涨潮 4 秒，非筛界生物攻速 -25%、每秒损失 2% 生命（筛界羁绊②可免疫）。', 'Ouch 水：灼伤非筛界生物（每秒 4% 生命），却会治疗筛界生物。', '巨像的巢穴：一圈 Ouch 水环绕着中央的白石台地。'],
    gen(b) {
      // A pale stone bowl: a ring of Ouch Water around a raised centre, chitin rim at the back.
      fillBase(b, S.SIFT_GRASS);
      for (let cy = 0; cy < GD; cy++)
        for (let cx = 0; cx < HALF; cx++) {
          const dx = cx - (HALF - 0.5);
          const dy = cy - (GD / 2 - 0.5);
          const r = Math.hypot(dx * 0.7, dy);
          if (r < 3) b.set(cx, cy, { h: 1, s: S.SIFT_STONE });
          else if (r < 4.2 && Math.abs(dy) > 1.5) b.set(cx, cy, { h: 0, s: S.OUCH });
          else if (cx < 7) b.set(cx, cy, { h: cx < 3 ? 2 : 1, s: S.CHITIN });
        }
      for (const [x, y] of [[11, 2], [11, 15]]) b.set(x, y, { f: F.SPIRE });
      decor(b, F.GLOWBULB, 0.05, [S.SIFT_GRASS]);
    },
  },
];
/** Where rift fights take place. */
export const SIFT_BIOMES = ['sift_meadow', 'carapace', 'white_forest'];
export const BIOME_MAP: Record<string, BiomeDef> = Object.fromEntries(BIOMES.map((b) => [b.id, b]));

export const BOSS_BIOME: Record<string, string> = {
  a1b_raid: 'village',
  a1b_monument: 'monument',
  a2b_wither: 'wither_altar',
  a3b_dragon: 'dragon_nest',
  a4b_monstrosity: 'sift_heart',
  a1b_nameless: 'desert_tomb',
  a2b_redstone_monstrosity: 'ember_forge',
  a5b_wraith: 'ice_river',
  a5b_abomination: 'jungle',
  a5b_guardian: 'monument',
  a6b_wildfire: 'fortress',
  a6b_tempest: 'wind_canyon',
  a7b_heart: 'void_ruins',
};

/** Picks a biome for a normal/elite fight: early floors favour simple terrain. */
export function pickBiome(r: Rng, act: number, row: number): string {
  const pool = BIOMES.filter((b) => b.act === act && !b.boss && b.minRow <= row);
  return pool.length ? r.pick(pool).id : r.pick(BIOMES.filter((b) => !b.boss)).id;
}

// ───────────────────────── Generation ─────────────────────────

function valueNoise(seed: number) {
  const hash = (x: number, y: number) => {
    let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = smooth(x - x0);
    const fy = smooth(y - y0);
    const a = hash(x0, y0) + (hash(x0 + 1, y0) - hash(x0, y0)) * fx;
    const b = hash(x0, y0 + 1) + (hash(x0 + 1, y0 + 1) - hash(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}

export function generateTerrain(biomeId: string, seed: number): Terrain {
  const def = BIOME_MAP[biomeId] ?? BIOME_MAP.plains;
  const r = new Rng(seed ^ 0x51ed270b);
  const t: Terrain = {
    biome: def.id, name: def.name, effects: def.effects, sky: r.pick(def.skies), seed, tide: def.tide,
    h: new Uint8Array(GW * GD), s: new Uint8Array(GW * GD), f: new Uint8Array(GW * GD), fh: new Uint8Array(GW * GD),
    ver: 0, dirty: [], broken: 0,
  };
  const n1 = valueNoise(seed);
  const n2 = valueNoise(seed + 77);
  const b: Builder = {
    t, r,
    set(cx, cy, v) {
      if (cx < 0 || cy < 0 || cx >= HALF || cy >= GD) return;
      for (const x of [cx, GW - 1 - cx]) {
        const i = idx(x, cy);
        if (v.h !== undefined) t.h[i] = v.h;
        if (v.s !== undefined) t.s[i] = v.s;
        if (v.f !== undefined) t.f[i] = v.f;
      }
    },
    get(cx, cy) {
      const i = idx(cx, cy);
      return { h: t.h[i], s: t.s[i], f: t.f[i] };
    },
    noise(x, y, scale) {
      return n1(x * scale, y * scale) * 0.7 + n2(x * scale * 2.1, y * scale * 2.1) * 0.3;
    },
  };
  def.gen(b);
  // Liquids sit at ground level and never hold blocking features.
  for (let i = 0; i < GW * GD; i++) {
    if (SURFACE_INFO[t.s[i]]?.liquid) {
      t.h[i] = 0;
      if (blockingFeature(t.f[i])) t.f[i] = F.NONE;
    }
  }
  // The camera looks in from the front edge: keep that strip low so it never hides the fight.
  for (let cy = GD - 2; cy < GD; cy++)
    for (let cx = 0; cx < GW; cx++) {
      const i = idx(cx, cy);
      t.h[i] = Math.min(t.h[i], cy === GD - 1 ? 1 : 2);
    }
  if (!def.boss) ensureRamps(t);
  // Keep the camera-side edge free of tall obstacles so they never hide the battle.
  for (let cy = GD - 3; cy < GD; cy++)
    for (let cx = 0; cx < GW; cx++) {
      const i = idx(cx, cy);
      if (blockingFeature(t.f[i]) && t.f[i] !== F.HAY && t.f[i] !== F.BOULDER && t.f[i] !== F.CACTUS) t.f[i] = F.NONE;
    }
  ensurePlayable(t);
  for (let cy = 0; cy < GD; cy++) for (let cx = 0; cx < GW; cx++) t.fh[idx(cx, cy)] = featureHeight(t.f[idx(cx, cy)], cellRand(seed, cx, cy, 31));
  return t;
}

// ───────────────────────── Destruction ─────────────────────────

/** Craters (lowered cells) allowed per battle; features can always be blown away. */
export const MAX_CRATERS = 36;
/** Surfaces left behind when the top block is blown off. */
const EXPOSED: Record<number, number> = { [S.GRASS]: S.DIRT, [S.PATH]: S.DIRT, [S.MOSS]: S.DIRT, [S.SNOW]: S.DIRT, [S.NYLIUM]: S.NETHERRACK, [S.SIFT_GRASS]: S.SIFT_STONE };

/** What any explosion leaves on the ground around it (scorch marks; looks only, same footing). */
const SCORCHED: Record<number, number> = {
  [S.GRASS]: S.DIRT, [S.PATH]: S.DIRT, [S.MOSS]: S.DIRT, [S.SNOW]: S.DIRT, [S.NYLIUM]: S.NETHERRACK, [S.SIFT_GRASS]: S.SIFT_STONE,
  [S.STONE]: S.GRAVEL, [S.COBBLE]: S.GRAVEL,
};

/** Obsidian (the dragon's platform, pillars and the End's obsidian rocks) never breaks. */
export function isIndestructible(t: Terrain, i: number) {
  return t.s[i] === S.OBSIDIAN || t.f[i] === F.PILLAR || t.f[i] === F.OWALL || (t.f[i] === F.BOULDER && t.s[i] === S.END_STONE);
}

/** Whether ground units can still walk from the left edge to the right edge. */
export function connected(t: Terrain): boolean {
  const seen = new Uint8Array(GW * GD);
  const q: number[] = [];
  for (let cy = 0; cy < GD; cy++) {
    const i = idx(0, cy);
    if (!blockingFeature(t.f[i])) (seen[i] = 1), q.push(i);
  }
  while (q.length) {
    const i = q.pop()!;
    const cx = i % GW;
    const cy = (i / GW) | 0;
    if (cx === GW - 1) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GD) continue;
      const j = idx(nx, ny);
      if (seen[j] || blockingFeature(t.f[j])) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  return false;
}

export type BuildKind = 'wall' | 'platform';
export interface BuildOrder {
  kind: BuildKind;
  /** World coords of the clicked point. */
  x: number;
  y: number;
}

/**
 * Cells a build would change: a wall is a 3-cell line across the field (along the depth),
 * a platform a 3×3 square around the clicked cell. Only the builder's half; liquids and solid obstacles are skipped.
 */
export function buildCells(t: Terrain, team: 0 | 1, kind: BuildKind, x: number, y: number): number[] {
  const cx = cellX(x);
  const cy = cellY(y);
  const mine = (c: number) => (team === 0 ? c < GW / 2 : c >= GW / 2);
  const cand: [number, number][] = [];
  if (kind === 'wall') cand.push([cx, cy - 1], [cx, cy], [cx, cy + 1]);
  // A platform is 3×3 so a whole ranged squad can spread out on it.
  else for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cand.push([cx + dx, cy + dy]);
  const out: number[] = [];
  for (const [ax, ay] of cand) {
    if (ax < 1 || ay < 0 || ax >= GW - 1 || ay >= GD || !mine(ax)) continue;
    const i = idx(ax, ay);
    if (SURFACE_INFO[t.s[i]]?.liquid || blockingFeature(t.f[i])) continue;
    if (kind === 'platform' && t.h[i] >= 4) continue;
    out.push(i);
  }
  return out;
}

/**
 * Applies a build. Walls never seal the field: a wall that would cut the two sides apart is
 * refused (returns null). Returns the changed cells.
 */
export function applyBuild(t: Terrain, team: 0 | 1, kind: BuildKind, x: number, y: number, o: { obsidian?: boolean; cactus?: boolean } = {}): number[] | null {
  const cells = buildCells(t, team, kind, x, y);
  if (!cells.length) return null;
  if (kind === 'wall') {
    const f = o.obsidian ? F.OWALL : o.cactus ? F.CWALL : F.WALL;
    const old = cells.map((i) => [t.f[i], t.fh[i]]);
    t.wallTeam ??= new Int8Array(GW * GD).fill(-1);
    for (const i of cells) {
      t.f[i] = f;
      t.fh[i] = 2;
      t.wallTeam[i] = team;
    }
    if (!connected(t)) {
      cells.forEach((i, k) => {
        t.f[i] = old[k][0];
        t.fh[i] = old[k][1];
        t.wallTeam![i] = -1;
      });
      return null;
    }
  } else {
    const up = o.obsidian ? 3 : 2;
    for (const i of cells) {
      t.h[i] = Math.min(4, t.h[i] + up);
      t.s[i] = o.obsidian ? S.OBSIDIAN : S.COBBLE;
      if (DECOR.has(t.f[i]) || t.f[i] === F.COBWEB) {
        t.f[i] = F.NONE;
        t.fh[i] = 0;
      }
    }
  }
  t.ver++;
  for (const i of cells) t.dirty.push(i);
  return cells;
}

export interface BlastChange {
  i: number;
  /** A feature blown away, a block blown off the top, or a scorched surface. */
  kind: 'feature' | 'block' | 'scorch';
  s: number;
  f: number;
  /** Height of the removed thing's top (blocks), for debris. */
  h: number;
}

/**
 * Explosion damage to the battlefield, by size:
 * - every blast (r ≥ 30) scorches the ground around it and blows away small decorations;
 * - small ones (wither skulls) sometimes knock 1 block off the centre while few craters exist;
 * - medium ones (r ≥ 55: fireballs, blue skulls, end crystals) also destroy trees and rocks and
 *   lower up to 2 blocks; big ones (r ≥ 80: creepers, TNT) up to 3.
 * Deliberately limited: lowering radius at most 2 blocks, MAX_CRATERS lowered blocks per battle,
 * ground never below level 0, the outer ring, liquids and obsidian untouched. Lowering ground
 * and removing obstacles can only make the field more open, never disconnect it.
 */
export function blastTerrain(t: Terrain, x: number, y: number, r: number): BlastChange[] {
  if (r < 30) return [];
  const big = r >= 55;
  const rb = big ? Math.min(2, (r / BLOCK) * 0.55) : 0;
  const rs = Math.min(2.4, (r / BLOCK) * 0.7);
  const fx = x / BLOCK;
  const fy = y / BLOCK;
  const out: BlastChange[] = [];
  const lower: [number, number][] = [];
  const scorch: number[] = [];
  for (let cy = Math.floor(fy - rs); cy <= Math.floor(fy + rs); cy++)
    for (let cx = Math.floor(fx - rs); cx <= Math.floor(fx + rs); cx++) {
      if (cx <= 0 || cy <= 0 || cx >= GW - 1 || cy >= GD - 1) continue;
      const d = Math.hypot(cx + 0.5 - fx, cy + 0.5 - fy);
      if (d > rs) continue;
      const i = idx(cx, cy);
      if (isIndestructible(t, i)) continue;
      if (t.f[i] && (DECOR.has(t.f[i]) || d <= rb)) {
        out.push({ i, kind: 'feature', s: t.s[i], f: t.f[i], h: t.h[i] + Math.max(1, t.fh[i]) });
        t.f[i] = F.NONE;
        t.fh[i] = 0;
      }
      if (SURFACE_INFO[t.s[i]]?.liquid) continue;
      if (t.h[i] >= 1 && d <= rb * 0.75) lower.push([i, d]);
      else if (SCORCHED[t.s[i]] !== undefined) scorch.push(i);
    }
  // Small blasts: now and then the block right under the impact goes too (hash, not the battle RNG).
  if (!big && t.broken < MAX_CRATERS / 2) {
    const i = idx(Math.floor(fx), Math.floor(fy));
    const roll = (Math.imul(i * 2654435761 + t.ver * 40503 + t.broken, 0x01000193) >>> 0) / 4294967296;
    if (roll < 0.35 && t.h[i] >= 1 && !isIndestructible(t, i) && !SURFACE_INFO[t.s[i]]?.liquid && !isBorder(i)) lower.push([i, 0]);
  }
  lower.sort((a, b) => a[1] - b[1]);
  for (const [i] of lower.slice(0, r >= 80 ? 3 : big ? 2 : 1)) {
    if (t.broken >= MAX_CRATERS) {
      if (SCORCHED[t.s[i]] !== undefined) scorch.push(i);
      continue;
    }
    out.push({ i, kind: 'block', s: t.s[i], f: 0, h: t.h[i] });
    t.h[i]--;
    t.s[i] = EXPOSED[t.s[i]] ?? t.s[i];
    t.broken++;
  }
  for (const i of scorch) {
    const to = SCORCHED[t.s[i]];
    if (to === undefined) continue;
    out.push({ i, kind: 'scorch', s: t.s[i], f: 0, h: t.h[i] });
    t.s[i] = to;
  }
  if (out.length) {
    t.ver++;
    for (const c of out) t.dirty.push(c.i);
  }
  return out;
}

const isBorder = (i: number) => {
  const cx = i % GW;
  const cy = Math.floor(i / GW);
  return cx <= 0 || cy <= 0 || cx >= GW - 1 || cy >= GD - 1;
};

/**
 * Every bit of high ground gets a walkable approach: cells reachable from the lowest ground
 * with steps of at most one block are flooded; while some area is cut off by a cliff, the
 * gentlest cliff edge between the two is cut down into a step (mirrored on both halves).
 */
function ensureRamps(t: Terrain) {
  const HALFW = GW / 2;
  const set = (cx: number, cy: number, h: number) => {
    t.h[idx(cx, cy)] = h;
    t.h[idx(GW - 1 - cx, cy)] = h;
  };
  for (let iter = 0; iter < 60; iter++) {
    let lo = 99;
    for (let cy = 0; cy < GD; cy++) for (let cx = 0; cx < HALFW; cx++) lo = Math.min(lo, t.h[idx(cx, cy)]);
    const seen = new Uint8Array(GW * GD);
    const q: number[] = [];
    for (let cy = 0; cy < GD; cy++)
      for (let cx = 0; cx < HALFW; cx++)
        if (t.h[idx(cx, cy)] === lo) {
          seen[idx(cx, cy)] = 1;
          q.push(idx(cx, cy));
        }
    while (q.length) {
      const i = q.pop()!;
      const cx = i % GW;
      const cy = (i / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= HALFW || ny >= GD) continue;
        const j = idx(nx, ny);
        if (seen[j] || Math.abs(t.h[j] - t.h[i]) > 1) continue;
        seen[j] = 1;
        q.push(j);
      }
    }
    let best = 99;
    let bi = -1;
    let bh = 0;
    for (let cy = 0; cy < GD; cy++)
      for (let cx = 0; cx < HALFW; cx++) {
        const i = idx(cx, cy);
        if (seen[i]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= HALFW || ny >= GD) continue;
          const j = idx(nx, ny);
          if (!seen[j]) continue;
          const dh = Math.abs(t.h[i] - t.h[j]);
          if (dh < best) {
            best = dh;
            bi = i;
            bh = t.h[j] + Math.sign(t.h[i] - t.h[j]);
          }
        }
      }
    if (bi < 0) return;
    set(bi % GW, (bi / GW) | 0, bh);
  }
}

/** Keeps deploy zones roomy and guarantees the two sides are connected. */
function ensurePlayable(t: Terrain) {
  // Deploy zones: at most ~12% blocked, no lava.
  for (const side of [0, 1]) {
    let blocked = 0;
    const cells: number[] = [];
    for (let cy = 0; cy < GD; cy++)
      for (let k = 0; k < DEPLOY_COLS; k++) {
        const cx = side === 0 ? k : GW - 1 - k;
        const i = idx(cx, cy);
        if (t.s[i] === S.LAVA) t.s[i] = S.BLACKSTONE;
        if (blockingFeature(t.f[i])) {
          blocked++;
          cells.push(i);
        }
      }
    const maxBlocked = Math.floor(GD * DEPLOY_COLS * 0.12);
    for (let k = 0; blocked > maxBlocked && k < cells.length; k += 2) {
      t.f[cells[k]] = F.NONE;
      blocked--;
    }
  }
  // Connectivity: flood fill from the left edge.
  const seen = new Uint8Array(GW * GD);
  const q: number[] = [];
  for (let cy = 0; cy < GD; cy++) if (!blockingFeature(t.f[idx(0, cy)])) (seen[idx(0, cy)] = 1), q.push(idx(0, cy));
  while (q.length) {
    const i = q.pop()!;
    const cx = i % GW;
    const cy = (i / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GD) continue;
      const j = idx(nx, ny);
      if (seen[j] || blockingFeature(t.f[j])) continue;
      seen[j] = 1;
      q.push(j);
    }
  }
  let reach = 0;
  for (let cy = 0; cy < GD; cy++) if (seen[idx(GW - 1, cy)]) reach++;
  if (reach < GD / 2) {
    // Carve two corridors.
    for (const cy of [Math.floor(GD / 3), Math.floor((GD * 2) / 3)]) for (let cx = 0; cx < GW; cx++) if (blockingFeature(t.f[idx(cx, cy)])) t.f[idx(cx, cy)] = F.NONE;
  }
}

// ───────────────────────── Flow fields ─────────────────────────

/** Movement classes share a flow field. */
export function moveClass(m: MobDef): number {
  if (isClimber(m)) return 1;
  if (isAquatic(m)) return 2;
  if (hatesWater(m)) return 3;
  if (isFireproof(m)) return 4;
  return 0;
}

const CLASS_REP: MobDef[] = [];
function repFor(cls: number): MobDef {
  if (CLASS_REP[cls]) return CLASS_REP[cls];
  const base = { id: 'x', families: [] as string[], immune: [] as string[] } as unknown as MobDef;
  const reps: MobDef[] = [
    base,
    { ...base, id: 'spider', families: ['arthropod'] } as MobDef,
    { ...base, families: ['aquatic'] } as MobDef,
    { ...base, id: 'enderman' } as MobDef,
    { ...base, immune: ['burn'] } as MobDef,
  ];
  CLASS_REP[cls] = reps[cls];
  return reps[cls];
}

/** Cost of standing in a cell for a movement class (Infinity = impassable). */
function cellCost(t: Terrain, i: number, cls: number): number {
  if (blockingFeature(t.f[i])) return Infinity;
  const m = repFor(cls);
  let c = 1 / Math.max(0.2, moveMul(m, t.s[i], t.f[i]));
  if (t.s[i] === S.LAVA && cls !== 4) c += 8;
  if (t.s[i] === S.WATER && cls === 3) c += 10;
  if (t.s[i] === S.OUCH) c += 6;
  return c;
}

export class FlowField {
  dist = new Float32Array(GW * GD);
  private heap = new Int32Array(GW * GD * 8);
  private hk = new Float32Array(GW * GD * 8);

  compute(t: Terrain, cls: number, sources: number[]) {
    const dist = this.dist;
    dist.fill(Infinity);
    let n = 0;
    const heap = this.heap;
    const hk = this.hk;
    const push = (i: number, k: number) => {
      let p = n++;
      while (p > 0) {
        const parent = (p - 1) >> 1;
        if (hk[parent] <= k) break;
        heap[p] = heap[parent];
        hk[p] = hk[parent];
        p = parent;
      }
      heap[p] = i;
      hk[p] = k;
    };
    const pop = () => {
      const top = heap[0];
      const last = heap[--n];
      const lk = hk[n];
      let p = 0;
      for (;;) {
        let c = p * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && hk[c + 1] < hk[c]) c++;
        if (hk[c] >= lk) break;
        heap[p] = heap[c];
        hk[p] = hk[c];
        p = c;
      }
      heap[p] = last;
      hk[p] = lk;
      return top;
    };
    for (const i of sources) {
      if (dist[i] === 0) continue;
      dist[i] = 0;
      push(i, 0);
    }
    const climber = cls === 1;
    while (n > 0) {
      const k = hk[0];
      const i = pop();
      if (k > dist[i]) continue;
      const cx = i % GW;
      const cy = (i / GW) | 0;
      const ci = cellCost(t, i, cls);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GD) continue;
          const j = idx(nx, ny);
          const cj = cellCost(t, j, cls);
          if (cj === Infinity) continue;
          if (dx && dy && (blockingFeature(t.f[idx(cx + dx, cy)]) || blockingFeature(t.f[idx(cx, cy + dy)]))) continue;
          // Moving from j toward i (field descends toward sources): climbing up from j to i costs more.
          const climb = climber ? 0 : Math.max(0, t.h[i] - t.h[j]) * 1.4;
          const nd = k + ((ci === Infinity ? cj : (ci + cj) / 2) + climb) * (dx && dy ? 1.414 : 1);
          if (nd < dist[j]) {
            dist[j] = nd;
            push(j, nd);
          }
        }
    }
  }

  /** Direction (unit vector) to step from world position toward lower distance. */
  dir(t: Terrain, x: number, y: number): [number, number] | null {
    const cx = cellX(x);
    const cy = cellY(y);
    const here = this.dist[idx(cx, cy)];
    let best = here;
    let bx = -1;
    let by = -1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GD) continue;
        if (dx && dy && (isBlocked(t, cx + dx, cy) || isBlocked(t, cx, cy + dy))) continue;
        const d = this.dist[idx(nx, ny)];
        if (d < best) {
          best = d;
          bx = nx;
          by = ny;
        }
      }
    if (bx < 0) return null;
    const tx = (bx + 0.5) * BLOCK - x;
    const ty = (by + 0.5) * BLOCK - y;
    const l = Math.hypot(tx, ty) || 1;
    return [tx / l, ty / l];
  }
}

/** True if the straight segment crosses blocking or (for this mob) costly cells. */
export function needsPath(t: Terrain, m: MobDef, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / (BLOCK * 0.5));
  for (let k = 1; k < steps; k++) {
    const x = x0 + ((x1 - x0) * k) / steps;
    const y = y0 + ((y1 - y0) * k) / steps;
    const i = idx(cellX(x), cellY(y));
    if (blockingFeature(t.f[i])) return true;
    const s = t.s[i];
    if (s === S.LAVA && !isFireproof(m)) return true;
    if (s === S.WATER && hatesWater(m)) return true;
    if (s === S.OUCH && hatesOuch(m)) return true;
  }
  return false;
}

// ───────────────────────── Deployment ─────────────────────────

export function inDeployZone(team: 0 | 1, x: number) {
  const cx = cellX(x);
  return team === 0 ? cx < DEPLOY_COLS : cx >= GW - DEPLOY_COLS;
}

export function clampToDeploy(team: 0 | 1, x: number, y: number): [number, number] {
  const minX = team === 0 ? BLOCK * 0.6 : (GW - DEPLOY_COLS) * BLOCK + BLOCK * 0.4;
  const maxX = team === 0 ? DEPLOY_COLS * BLOCK - BLOCK * 0.4 : GW * BLOCK - BLOCK * 0.6;
  return [Math.max(minX, Math.min(maxX, x)), Math.max(BLOCK * 0.5, Math.min(GD * BLOCK - BLOCK * 0.5, y))];
}

/** Free spots (cell centers) usable for spawning around an anchor, nearest first. */
export function spawnSpots(t: Terrain, team: 0 | 1, ax: number, ay: number, m: MobDef, n: number, taken: Set<number>): [number, number][] {
  const out: [number, number][] = [];
  const acx = cellX(ax);
  const acy = cellY(ay);
  const perCell = m.radius <= 12 ? 4 : m.radius <= 20 ? 2 : 1;
  const big = m.radius >= 26;
  for (let ring = 0; ring < 14 && out.length < n; ring++) {
    const cand: number[] = [];
    for (let dy = -ring; dy <= ring; dy++)
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const cx = acx + dx;
        const cy = acy + dy;
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GD) continue;
        const inZone = team === 0 ? cx < DEPLOY_COLS : cx >= GW - DEPLOY_COLS;
        if (!inZone) continue;
        const i = idx(cx, cy);
        if (blockingFeature(t.f[i]) || t.s[i] === S.LAVA) continue;
        if (!m.flying && ((t.s[i] === S.WATER && hatesWater(m)) || (t.s[i] === S.OUCH && hatesOuch(m)))) continue;
        cand.push(i);
      }
    // Nearest first; ties prefer the cell further back so both sides spawn as mirror images.
    const back = (i: number) => (team === 0 ? i % GW : GW - 1 - (i % GW));
    cand.sort((a, b) => Math.hypot((a % GW) - acx, ((a / GW) | 0) - acy) - Math.hypot((b % GW) - acx, ((b / GW) | 0) - acy) || back(a) - back(b));
    for (const i of cand) {
      const used = [...taken].filter((k) => k >> 3 === i).length;
      if (used >= perCell) continue;
      const cx = i % GW;
      const cy = (i / GW) | 0;
      const slot = used;
      taken.add((i << 3) | slot);
      const off = perCell === 4 ? [[-0.25, -0.25], [0.25, 0.25], [0.25, -0.25], [-0.25, 0.25]][slot] : perCell === 2 ? [[-0.2, -0.2], [0.2, 0.2]][slot] : [0, 0];
      out.push([(cx + 0.5 + (team === 0 ? off[0] : -off[0])) * BLOCK, (cy + 0.5 + off[1]) * BLOCK]);
      if (big) {
        // Large mobs also reserve neighbouring cells.
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) taken.add((idx(Math.min(GW - 1, Math.max(0, cx + dx)), Math.min(GD - 1, Math.max(0, cy + dy))) << 3) | 0);
      }
      if (out.length >= n) break;
    }
  }
  while (out.length < n) out.push([ax, ay]);
  return out;
}

/** Default placement: tanks forward, ranged back on high ground, spread across depth. */
export function autoAnchors(t: Terrain, team: 0 | 1, cards: { mob: MobDef; row: 'front' | 'mid' | 'back' }[]): [number, number][] {
  const colFor = (row: string) => (row === 'front' ? 12.5 : row === 'mid' ? 9 : 5);
  const byRow: Record<string, number[]> = { front: [], mid: [], back: [] };
  cards.forEach((c, i) => byRow[c.row].push(i));
  const out: [number, number][] = new Array(cards.length);
  for (const row of ['front', 'mid', 'back']) {
    const ids = byRow[row];
    ids.forEach((ci, k) => {
      const m = cards[ci].mob;
      let cx = colFor(row);
      const cy = ((k + 0.5) / ids.length) * GD;
      // Ranged units look for nearby high ground.
      let best = -Infinity;
      let bx = cx;
      let by = cy;
      for (let dy = -3; dy <= 3; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = Math.floor(cx + dx);
          const y = Math.floor(cy + dy);
          if (x < 0 || y < 0 || x >= DEPLOY_COLS || y >= GD) continue;
          const i = idx(team === 0 ? x : GW - 1 - x, y);
          if (blockingFeature(t.f[i]) || t.s[i] === S.LAVA) continue;
          if ((t.s[i] === S.WATER && !isAquatic(m)) || t.s[i] === S.OUCH) continue;
          const sc = (m.range >= 60 ? t.h[i] * 1.5 : 0) - Math.hypot(dx, dy) * 0.4;
          if (sc > best) {
            best = sc;
            bx = x + 0.5;
            by = y + 0.5;
          }
        }
      cx = bx;
      const wx = (team === 0 ? cx : GW - cx) * BLOCK;
      out[ci] = [wx, by * BLOCK];
    });
  }
  return out;
}
