// Builds the static 3D world (terrain, decorations, outer landscape, sky, lights) from a Terrain.
import * as THREE from 'three';
import { F, GD, GW, S, type Terrain, type Sky, SURFACE_INFO, featureHeight } from '../battle/terrain.ts';
import { getAtlas, liquidTexture, tileUV } from './textures.ts';

/** Margin of decorative landscape around the arena (cells). */
const M = 12;
const WW = GW + M * 2;
const WD = GD + M * 2;

const TOP: Record<number, [string, string, string]> = {
  [S.GRASS]: ['grass_top', 'grass_side', 'dirt'],
  [S.DIRT]: ['dirt', 'dirt', 'dirt'],
  [S.PATH]: ['path_top', 'dirt', 'dirt'],
  [S.SAND]: ['sand', 'sand', 'sand'],
  [S.SNOW]: ['snow', 'snow_side', 'dirt'],
  [S.ICE]: ['ice', 'ice', 'ice'],
  [S.STONE]: ['stone', 'stone', 'stone'],
  [S.GRAVEL]: ['gravel', 'gravel', 'stone'],
  [S.COBBLE]: ['cobble', 'cobble', 'cobble'],
  [S.DEEPSLATE]: ['deepslate', 'deepslate', 'deepslate'],
  [S.MOSS]: ['moss', 'dirt', 'dirt'],
  [S.MUD]: ['mud', 'mud', 'dirt_dark'],
  [S.WATER]: ['sand', 'sand', 'sand'],
  [S.LAVA]: ['netherrack', 'netherrack', 'netherrack'],
  [S.SOUL_SAND]: ['soul_sand', 'soul_sand', 'soul_sand'],
  [S.NETHERRACK]: ['netherrack', 'netherrack', 'netherrack'],
  [S.NYLIUM]: ['nylium_top', 'nylium_side', 'netherrack'],
  [S.BASALT]: ['basalt_top', 'basalt_side', 'basalt_side'],
  [S.BLACKSTONE]: ['blackstone', 'blackstone', 'blackstone'],
  [S.NETHER_BRICK]: ['nether_brick', 'nether_brick', 'nether_brick'],
  [S.END_STONE]: ['end_stone', 'end_stone', 'end_stone'],
  [S.OBSIDIAN]: ['obsidian', 'obsidian', 'obsidian'],
  [S.PURPUR]: ['purpur', 'purpur', 'purpur'],
  [S.PRISMARINE]: ['prismarine', 'prismarine', 'prismarine'],
  [S.SANDSTONE]: ['sandstone', 'sandstone', 'sandstone'],
  [S.PACKED_ICE]: ['packed_ice', 'packed_ice', 'packed_ice'],
  [S.CALCITE]: ['calcite', 'calcite', 'calcite'],
  [S.BRITTLE_ICE]: ['brittle_ice', 'packed_ice', 'packed_ice'],
  [S.SIFT_GRASS]: ['sift_grass_top', 'sift_grass_side', 'sift_stone'],
  [S.SIFT_STONE]: ['sift_stone', 'sift_stone', 'sift_stone'],
  [S.CHITIN]: ['chitin', 'chitin', 'sift_stone'],
  [S.OUCH]: ['sift_stone', 'sift_stone', 'sift_stone'],
};

export interface SkyStyle {
  top: number;
  horizon: number;
  bottom: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemi: [number, number, number];
  sun: number;
  sunI: number;
  unitLight: [number, number, number];
  stars: boolean;
  clouds: boolean;
  orb?: 'sun' | 'moon' | 'dusk';
  particles?: 'ash' | 'bubbles' | 'end' | 'souls' | 'snow';
}

export const SKY: Record<Sky, SkyStyle> = {
  day: { top: 0x5a8ef0, horizon: 0xbcd6ff, bottom: 0x9cb8e0, fog: 0xb3cdf5, fogNear: 45, fogFar: 150, hemi: [0xdfefff, 0x6b8a4a, 1.6], sun: 0xfff4dc, sunI: 2.4, unitLight: [1, 1, 1], stars: false, clouds: true, orb: 'sun' },
  dusk: { top: 0x2f2d6b, horizon: 0xff9a62, bottom: 0x6a4060, fog: 0xc98a78, fogNear: 40, fogFar: 140, hemi: [0xffc8a0, 0x4a3a52, 1.4], sun: 0xffb070, sunI: 2.2, unitLight: [1, 0.9, 0.82], stars: false, clouds: true, orb: 'dusk' },
  night: { top: 0x03060f, horizon: 0x18213d, bottom: 0x0a0f1e, fog: 0x101830, fogNear: 30, fogFar: 110, hemi: [0x8aa0d8, 0x1a1f2e, 1.0], sun: 0xb8c8ff, sunI: 0.9, unitLight: [0.72, 0.78, 0.95], stars: true, clouds: false, orb: 'moon' },
  nether: { top: 0x1a0504, horizon: 0x4a1208, bottom: 0x2a0806, fog: 0x3f0e08, fogNear: 22, fogFar: 85, hemi: [0xffa070, 0x401010, 1.5], sun: 0xff8a50, sunI: 1.4, unitLight: [1, 0.86, 0.76], stars: false, clouds: false, particles: 'ash' },
  end: { top: 0x05020c, horizon: 0x1a0d2e, bottom: 0x05020a, fog: 0x140a22, fogNear: 45, fogFar: 160, hemi: [0xd0b8ff, 0x2a1a3a, 1.2], sun: 0xe8dcff, sunI: 1.4, unitLight: [0.9, 0.85, 1], stars: true, clouds: false, particles: 'end' },
  water: { top: 0x062a3a, horizon: 0x0e4a5e, bottom: 0x03141c, fog: 0x0d3a4c, fogNear: 14, fogFar: 62, hemi: [0x9ff0ff, 0x0a2a30, 1.3], sun: 0xc8fff8, sunI: 1.3, unitLight: [0.82, 0.95, 1], stars: false, clouds: false, particles: 'bubbles' },
  // The Sift: pale cyan sky over pink ground, souls drifting through the air.
  sift: { top: 0x7fdfee, horizon: 0xf2d8e8, bottom: 0xd8a8c0, fog: 0xf0cfe0, fogNear: 45, fogFar: 150, hemi: [0xe8fff8, 0xc87a9a, 1.6], sun: 0xfff0f8, sunI: 2.2, unitLight: [1, 0.95, 1], stars: false, clouds: true, orb: 'sun', particles: 'souls' },
  cave: { top: 0x0a1428, horizon: 0x1a3050, bottom: 0x081020, fog: 0x14243c, fogNear: 26, fogFar: 95, hemi: [0xbfe0ff, 0x1a2a40, 1.25], sun: 0xd8ecff, sunI: 1.1, unitLight: [0.85, 0.92, 1], stars: false, clouds: false, particles: 'snow' },
};

// ───────────────────────── geometry builder ─────────────────────────

class Geo {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  quad(p: number[][], n: number[], tile: string, shade: number[], uvScale: [number, number] = [1, 1]) {
    const base = this.pos.length / 3;
    const [u0, v0, u1, v1] = tileUV(tile);
    const us = u0 + (u1 - u0) * uvScale[0];
    const vs = v1 - (v1 - v0) * uvScale[1];
    const uvs = [
      [u0, vs],
      [us, vs],
      [us, v1],
      [u0, v1],
    ];
    for (let k = 0; k < 4; k++) {
      this.pos.push(p[k][0], p[k][1], p[k][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[k][0], uvs[k][1]);
      this.col.push(shade[k], shade[k], shade[k]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  /** Axis-aligned box with per-face tiles. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tiles: { top: string; side: string; bottom?: string }, shade = 1) {
    const s = shade;
    this.quad([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], tiles.top, [s, s, s, s]);
    if (tiles.bottom) this.quad([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], tiles.bottom, [s * 0.5, s * 0.5, s * 0.5, s * 0.5]);
    const hs = Math.max(0.2, y1 - y0);
    const ws = Math.max(0.2, x1 - x0);
    const ds = Math.max(0.2, z1 - z0);
    this.quad([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], tiles.side, Array(4).fill(s * 0.82), [Math.min(1, ws), Math.min(1, hs)]);
    this.quad([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], tiles.side, Array(4).fill(s * 0.82), [Math.min(1, ws), Math.min(1, hs)]);
    this.quad([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], tiles.side, Array(4).fill(s * 0.66), [Math.min(1, ds), Math.min(1, hs)]);
    this.quad([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], tiles.side, Array(4).fill(s * 0.66), [Math.min(1, ds), Math.min(1, hs)]);
  }
  cross(cx: number, y: number, cz: number, size: number, tile: string, shade = 1) {
    const h = size;
    const r = size / 2;
    for (const [dx, dz] of [
      [1, 1],
      [1, -1],
    ]) {
      const p = [
        [cx - r * dx, y, cz - r * dz],
        [cx + r * dx, y, cz + r * dz],
        [cx + r * dx, y + h, cz + r * dz],
        [cx - r * dx, y + h, cz - r * dz],
      ];
      // Both windings with up-facing normals: a double-sided material would flip the normal on
      // the back face and light half the plants from below (they turned black at low angles).
      this.quad(p, [0, 1, 0], tile, [shade, shade, shade, shade]);
      const base = this.pos.length / 3 - 4;
      this.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    // Empty chunk layers (e.g. no canopy) would otherwise get a NaN bounding sphere.
    if (this.pos.length) g.computeBoundingSphere();
    else g.boundingSphere = new THREE.Sphere();
    return g;
  }
}

function hash(x: number, y: number, s: number) {
  let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ───────────────────────── world grid ─────────────────────────

interface WorldGrid {
  h: Int16Array;
  s: Uint8Array;
  f: Uint8Array;
  /** Feature heights: the arena's come from the Terrain so sight lines match what you see. */
  fh: Uint8Array;
  liquid: Uint8Array;
  outer: Uint8Array;
}

/** Arena columns per rebuildable chunk (craters only rebuild the chunks they touch). */
const CHUNK = 8;

function primarySurface(t: Terrain): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < t.s.length; i++) {
    const s = t.s[i];
    if (SURFACE_INFO[s]?.liquid) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: number = S.GRASS;
  let n = -1;
  for (const [s, c] of counts)
    if (c > n) {
      n = c;
      best = s;
    }
  return best;
}

function buildGrid(t: Terrain): WorldGrid {
  const g: WorldGrid = {
    h: new Int16Array(WW * WD), s: new Uint8Array(WW * WD), f: new Uint8Array(WW * WD), fh: new Uint8Array(WW * WD),
    liquid: new Uint8Array(WW * WD), outer: new Uint8Array(WW * WD),
  };
  const prim = primarySurface(t);
  const isEnd = t.sky === 'end';
  const isNether = t.sky === 'nether';
  const isWater = t.sky === 'water';
  const isCave = t.sky === 'cave';
  const isSift = t.sky === 'sift';
  const steep = isNether || isWater || isCave;
  const treeKind = prim === S.SNOW ? F.SPRUCE : prim === S.SAND ? F.CACTUS : prim === S.NYLIUM ? F.FUNGUS : isSift ? F.WHITE_TREE : isCave ? F.ICICLE : F.OAK;
  for (let z = 0; z < WD; z++)
    for (let x = 0; x < WW; x++) {
      const i = z * WW + x;
      const ax = x - M;
      const az = z - M;
      if (ax >= 0 && az >= 0 && ax < GW && az < GD) {
        syncCell(g, t, ax, az);
        continue;
      }
      g.outer[i] = 1;
      const dx = ax < 0 ? -ax : ax >= GW ? ax - GW + 1 : 0;
      const dz = az < 0 ? -az : az >= GD ? az - GD + 1 : 0;
      const d = Math.max(dx, dz);
      const n = hash(Math.floor(x / 3), Math.floor(z / 3), t.seed) * 0.6 + hash(x, z, t.seed + 1) * 0.4;
      if (isEnd) {
        // Floating island: ragged edge, then void.
        const edge = 2 + Math.floor(n * 4);
        if (d > edge) {
          g.h[i] = -99;
          continue;
        }
        g.h[i] = 0;
        g.s[i] = S.END_STONE;
        if (d > 1 && hash(x, z, 7) < 0.04) g.f[i] = F.CHORUS;
        continue;
      }
      // The near (camera) side stays low and open so it never hides the battle.
      const near = az >= GD;
      const side = !near && az >= 0;
      let rise = steep ? d * 0.9 + n * 3 : d * 0.38 + n * 2.2 - 0.6;
      if (near) rise = Math.min(0.9, rise * 0.15);
      else if (side) rise = Math.min(rise, Math.max(0, d - 2) * 0.5);
      g.h[i] = Math.max(0, Math.min(steep ? 14 : 9, Math.floor(rise)));
      g.s[i] = isNether
        ? n > 0.6 ? S.BLACKSTONE : S.NETHERRACK
        : isWater ? S.PRISMARINE
        : isCave ? (n > 0.55 ? S.CALCITE : S.PACKED_ICE)
        : isSift ? (n > 0.62 ? S.SIFT_STONE : n < 0.2 ? S.CHITIN : S.SIFT_GRASS)
        : prim;
      const treeOk = !near && d > 3;
      if (!isNether && !isWater && treeOk && hash(x, z, 3) < (treeKind === F.CACTUS ? 0.03 : treeKind === F.ICICLE ? 0.05 : 0.11)) g.f[i] = treeKind;
      else if (!isNether && !isWater && g.s[i] === S.GRASS && hash(x, z, 5) < 0.12) g.f[i] = F.TALLGRASS;
      else if (isSift && g.s[i] === S.SIFT_GRASS && hash(x, z, 5) < 0.1) g.f[i] = F.GLOWBULB;
      if (isNether && d > 3 && !near && hash(x, z, 9) < 0.02) g.liquid[i] = 2;
      g.fh[i] = featureHeight(g.f[i], hash(x, z, 31));
    }
  return g;
}

/** Copies one arena cell from the Terrain into the world grid. */
function syncCell(g: WorldGrid, t: Terrain, ax: number, az: number) {
  const i = (az + M) * WW + ax + M;
  const ti = az * GW + ax;
  g.s[i] = t.s[ti];
  g.f[i] = t.f[ti];
  g.fh[i] = t.fh[ti];
  const liq = SURFACE_INFO[t.s[ti]]?.liquid;
  g.liquid[i] = liq === 'water' ? 1 : liq === 'lava' ? 2 : liq === 'ouch' ? 3 : 0;
  g.h[i] = liq ? -1 : t.h[ti];
}

// ───────────────────────── public build ─────────────────────────

export interface World {
  group: THREE.Group;
  terrainMeshes: THREE.Mesh[];
  water: THREE.Texture;
  lava: THREE.Texture;
  sky: SkyStyle;
  clouds?: THREE.Group;
  update(dt: number): void;
  /** Arena canopy layers by column range, each with its own material so it can fade separately. */
  canopies: { mat: THREE.MeshLambertMaterial; x0: number; x1: number }[];
  /** Re-syncs changed arena cells from the Terrain and rebuilds only the chunks they touch. */
  rebuild(t: Terrain, cells: Iterable<number>): void;
  dispose(): void;
}

/** Three-space position of a cell's top-surface center. */
export function cellTop(t: Terrain, cx: number, cy: number) {
  return new THREE.Vector3(cx - GW / 2 + 0.5, t.h[cy * GW + cx], cy - GD / 2 + 0.5);
}

export function buildWorld(t: Terrain): World {
  const grid = buildGrid(t);
  const sky = SKY[t.sky];
  const waterGeo = new Geo();
  const lavaGeo = new Geo();
  const ouchGeo = new Geo();
  const gh = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= WW || z >= WD) return t.sky === 'end' ? -99 : -2;
    return grid.h[z * WW + x];
  };
  const X = (x: number) => x - M - GW / 2;
  const Z = (z: number) => z - M - GD / 2;
  const floor = t.sky === 'end' ? -7 : -3;

  /** Emits one grid cell's ground column and feature. Arena canopies go to the see-through layer. */
  const emitCell = (x: number, z: number, solid: Geo, cut: Geo, canopy: Geo) => {
    const i = z * WW + x;
    const h = grid.h[i];
    if (h <= -99) return;
    const tiles = TOP[grid.s[i]] ?? TOP[S.GRASS];
    const x0 = X(x);
    const z0 = Z(z);
    // Top face with simple ambient occlusion.
    const occ = (sx: number, sz: number) => {
      const a = gh(x + sx, z) > h ? 1 : 0;
      const b = gh(x, z + sz) > h ? 1 : 0;
      const c = gh(x + sx, z + sz) > h ? 1 : 0;
      const o = a && b ? 3 : a + b + c;
      return [1, 0.8, 0.66, 0.55][o];
    };
    solid.quad(
      [[x0, h, z0 + 1], [x0 + 1, h, z0 + 1], [x0 + 1, h, z0], [x0, h, z0]],
      [0, 1, 0],
      tiles[0],
      [occ(-1, 1), occ(1, 1), occ(1, -1), occ(-1, -1)],
    );
    // Side faces down to the neighbour (one quad per block level so textures repeat).
    const sides: [number, number, number[], number][] = [
      [0, 1, [0, 0, 1], 0.82],
      [0, -1, [0, 0, -1], 0.78],
      [1, 0, [1, 0, 0], 0.64],
      [-1, 0, [-1, 0, 0], 0.7],
    ];
    for (const [dx, dz, n, sh] of sides) {
      let nh = gh(x + dx, z + dz);
      if (nh <= -99) nh = floor;
      if (nh >= h) continue;
      for (let y = h; y > Math.max(nh, floor); y--) {
        const tile = y === h ? tiles[1] : tiles[2];
        const k = sh * (y === h ? 1 : 0.92) * (y < 0 ? 0.85 : 1);
        let p: number[][];
        if (dz === 1) p = [[x0, y - 1, z0 + 1], [x0 + 1, y - 1, z0 + 1], [x0 + 1, y, z0 + 1], [x0, y, z0 + 1]];
        else if (dz === -1) p = [[x0 + 1, y - 1, z0], [x0, y - 1, z0], [x0, y, z0], [x0 + 1, y, z0]];
        else if (dx === 1) p = [[x0 + 1, y - 1, z0 + 1], [x0 + 1, y - 1, z0], [x0 + 1, y, z0], [x0 + 1, y, z0 + 1]];
        else p = [[x0, y - 1, z0], [x0, y - 1, z0 + 1], [x0, y, z0 + 1], [x0, y, z0]];
        solid.quad(p, n, tile, [k, k, k, k]);
      }
    }
    // Features
    const f = grid.f[i];
    if (!f) return;
    const cx = x0 + 0.5;
    const cz = z0 + 0.5;
    const r = hash(x, z, 31);
    const th = grid.fh[i] || featureHeight(f, r);
    switch (f) {
      case F.OAK: {
        const inArena = !grid.outer[i];
        const cr = inArena ? 1 : 2;
        const lg = inArena ? canopy : cut;
        solid.box(x0, h, z0, x0 + 1, h + th, z0 + 1, { top: 'oak_log_top', side: 'oak_log' });
        for (let ly = 0; ly < 2; ly++)
          for (let lz = -cr; lz <= cr; lz++)
            for (let lx = -cr; lx <= cr; lx++) {
              if (cr === 2 && Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
              if (lx === 0 && lz === 0) continue;
              lg.box(x0 + lx, h + th - 1 + ly, z0 + lz, x0 + lx + 1, h + th + ly, z0 + lz + 1, { top: 'oak_leaves', side: 'oak_leaves', bottom: 'oak_leaves' }, 0.95);
            }
        for (let lz = -1; lz <= 1; lz++)
          for (let lx = -1; lx <= 1; lx++)
            if (!(Math.abs(lx) === 1 && Math.abs(lz) === 1 && (r > 0.5 || inArena)))
              lg.box(x0 + lx, h + th + 1, z0 + lz, x0 + lx + 1, h + th + 2, z0 + lz + 1, { top: 'oak_leaves', side: 'oak_leaves', bottom: 'oak_leaves' });
        break;
      }
      case F.SPRUCE: {
        const lg = grid.outer[i] ? cut : canopy;
        solid.box(x0 + 0.1, h, z0 + 0.1, x0 + 0.9, h + th, z0 + 0.9, { top: 'oak_log_top', side: 'spruce_log' });
        const layers = [2, 1, 2, 1, 1, 0];
        layers.forEach((rad, k) => {
          const y = h + 1.5 + k;
          for (let lz = -rad; lz <= rad; lz++)
            for (let lx = -rad; lx <= rad; lx++) {
              if (rad === 2 && Math.abs(lx) === 2 && Math.abs(lz) === 2) continue;
              if (lx === 0 && lz === 0 && k < 5) continue;
              lg.box(x0 + lx, y, z0 + lz, x0 + lx + 1, y + 1, z0 + lz + 1, { top: 'spruce_leaves', side: 'spruce_leaves', bottom: 'spruce_leaves' });
            }
        });
        break;
      }
      case F.CACTUS:
        solid.box(x0 + 0.07, h, z0 + 0.07, x0 + 0.93, h + th, z0 + 0.93, { top: 'cactus_top', side: 'cactus_side' });
        break;
      case F.BOULDER:
        solid.box(x0, h, z0, x0 + 1, h + th, z0 + 1, { top: grid.s[i] === S.END_STONE ? 'obsidian' : 'cobble', side: grid.s[i] === S.END_STONE ? 'obsidian' : 'cobble' });
        break;
      case F.PILLAR:
        solid.box(x0, h, z0, x0 + 1, h + th, z0 + 1, { top: 'obsidian', side: 'obsidian' });
        break;
      case F.WALL:
        solid.box(x0, h, z0, x0 + 1, h + th, z0 + 1, { top: 'cobble', side: 'cobble' });
        break;
      case F.OWALL:
        solid.box(x0, h, z0, x0 + 1, h + th, z0 + 1, { top: 'obsidian', side: 'obsidian' });
        break;
      case F.CWALL:
        solid.box(x0 + 0.04, h, z0 + 0.04, x0 + 0.96, h + th, z0 + 0.96, { top: 'cactus_top', side: 'cactus_side' });
        break;
      case F.FUNGUS: {
        solid.box(x0 + 0.15, h, z0 + 0.15, x0 + 0.85, h + th, z0 + 0.85, { top: 'fungus_stem', side: 'fungus_stem' });
        for (let lz = -1; lz <= 1; lz++)
          for (let lx = -1; lx <= 1; lx++) solid.box(x0 + lx, h + th, z0 + lz, x0 + lx + 1, h + th + 1, z0 + lz + 1, { top: 'wart', side: 'wart', bottom: 'wart' });
        solid.box(x0, h + th + 1, z0, x0 + 1, h + th + 2, z0 + 1, { top: 'wart', side: 'wart' });
        if (r > 0.4) solid.box(x0 - 1, h + th - 1, z0, x0, h + th, z0 + 1, { top: 'wart', side: 'wart', bottom: 'wart' });
        break;
      }
      case F.BASALT_COL:
        solid.box(x0, h, z0, x0 + 1, h + th, z0 + 1, { top: 'basalt_top', side: 'basalt_side' });
        break;
      case F.CHORUS:
        solid.box(x0 + 0.25, h, z0 + 0.25, x0 + 0.75, h + th, z0 + 0.75, { top: 'chorus', side: 'chorus' });
        solid.box(x0 + 0.75, h + th - 2, z0 + 0.25, x0 + 1.15, h + th - 1.5, z0 + 0.75, { top: 'chorus', side: 'chorus' });
        solid.box(x0 - 0.15, h + th - 1, z0 + 0.25, x0 + 0.25, h + th - 0.5, z0 + 0.75, { top: 'chorus', side: 'chorus' });
        break;
      case F.HAY:
        solid.box(x0 + 0.05, h, z0 + 0.05, x0 + 0.95, h + 1, z0 + 0.95, { top: 'hay_top', side: 'hay_side' });
        break;
      case F.WELL:
        solid.box(x0, h, z0, x0 + 1, h + 1, z0 + 1, { top: 'cobble', side: 'cobble' });
        solid.box(x0 + 0.1, h + 2.4, z0 + 0.1, x0 + 0.9, h + 2.6, z0 + 0.9, { top: 'oak_log', side: 'oak_log' });
        solid.box(x0 + 0.05, h + 1, z0 + 0.05, x0 + 0.2, h + 2.4, z0 + 0.2, { top: 'oak_log', side: 'oak_log' });
        solid.box(x0 + 0.8, h + 1, z0 + 0.8, x0 + 0.95, h + 2.4, z0 + 0.95, { top: 'oak_log', side: 'oak_log' });
        break;
      case F.COBWEB:
        cut.cross(cx, h, cz, 1, 'cobweb');
        break;
      case F.FLOWER:
        cut.cross(cx + (r - 0.5) * 0.4, h, cz + (hash(x, z, 4) - 0.5) * 0.4, 0.6, r > 0.5 ? 'flower_red' : 'flower_yellow');
        break;
      case F.TALLGRASS:
        cut.cross(cx + (r - 0.5) * 0.4, h, cz, 0.75, 'tallgrass', grid.s[i] === S.NYLIUM ? 0.7 : 1);
        break;
      case F.LILY: {
        const y = h + 0.9;
        cut.quad([[x0 + 0.1, y, z0 + 0.9], [x0 + 0.9, y, z0 + 0.9], [x0 + 0.9, y, z0 + 0.1], [x0 + 0.1, y, z0 + 0.1]], [0, 1, 0], 'lily', [1, 1, 1, 1]);
        break;
      }
      case F.RAIL:
        cut.quad([[x0, h + 0.02, z0 + 1], [x0 + 1, h + 0.02, z0 + 1], [x0 + 1, h + 0.02, z0], [x0, h + 0.02, z0]], [0, 1, 0], 'rail', [1, 1, 1, 1]);
        break;
      case F.TORCH:
      case F.LANTERN:
        cut.box(cx - 0.18, h, cz - 0.18, cx + 0.18, h + 0.45, cz + 0.18, { top: 'lantern', side: 'lantern' }, 1.4);
        break;
      case F.BONES:
        solid.box(cx - 0.4, h, cz - 0.08, cx + 0.4, h + 0.16, cz + 0.08, { top: 'bone', side: 'bone' });
        solid.box(cx - 0.08, h, cz - 0.3, cx + 0.08, h + 0.16, cz + 0.3, { top: 'bone', side: 'bone' });
        break;
      case F.ICICLE:
      case F.SPIRE: {
        // Tapering spike: ice in the caves, chitin plates in the Sift.
        const tile = f === F.ICICLE ? 'icicle' : 'chitin';
        const top = f === F.ICICLE ? 'packed_ice' : 'chitin';
        for (let k = 0; k < th; k++) {
          const w = 0.42 - (k / th) * 0.3;
          solid.box(cx - w, h + k, cz - w, cx + w, h + k + 1, cz + w, { top, side: tile });
        }
        break;
      }
      case F.WHITE_TREE: {
        const lg = grid.outer[i] ? cut : canopy;
        solid.box(x0 + 0.2, h, z0 + 0.2, x0 + 0.8, h + th, z0 + 0.8, { top: 'white_wood_top', side: 'white_wood' });
        // A branch and a flat pink canopy.
        solid.box(x0 + 0.8, h + th - 1.2, z0 + 0.35, x0 + 1.4, h + th - 0.9, z0 + 0.65, { top: 'white_wood', side: 'white_wood' });
        for (let lz = -1; lz <= 1; lz++)
          for (let lx = -1; lx <= 1; lx++)
            if (!(Math.abs(lx) === 1 && Math.abs(lz) === 1 && r > 0.5))
              lg.box(x0 + lx, h + th, z0 + lz, x0 + lx + 1, h + th + 1, z0 + lz + 1, { top: 'sift_leaves', side: 'sift_leaves', bottom: 'sift_leaves' });
        lg.box(x0, h + th + 1, z0, x0 + 1, h + th + 2, z0 + 1, { top: 'sift_leaves', side: 'sift_leaves', bottom: 'sift_leaves' });
        break;
      }
      case F.GLOWBULB:
        cut.cross(cx + (r - 0.5) * 0.4, h, cz + (hash(x, z, 4) - 0.5) * 0.4, 0.7, 'glowbulb', 1.35);
        break;
    }
  };

  // Liquids never change, so they are built once for the whole grid.
  for (let z = 0; z < WD; z++)
    for (let x = 0; x < WW; x++) {
      const i = z * WW + x;
      // Brittle ice gets its water now, hidden under the ice until the ice breaks.
      const brittle = grid.s[i] === S.BRITTLE_ICE;
      if (!grid.liquid[i] && !brittle) continue;
      const g = brittle || grid.liquid[i] === 1 ? waterGeo : grid.liquid[i] === 3 ? ouchGeo : lavaGeo;
      const x0 = X(x);
      const z0 = Z(z);
      const y = (brittle ? -1 : grid.h[i]) + 0.88;
      const p = [[x0, y, z0 + 1], [x0 + 1, y, z0 + 1], [x0 + 1, y, z0], [x0, y, z0]];
      const base = g.pos.length / 3;
      for (let k = 0; k < 4; k++) {
        g.pos.push(p[k][0], p[k][1], p[k][2]);
        g.nor.push(0, 1, 0);
        g.uv.push(k === 0 || k === 3 ? 0 : 1, k < 2 ? 0 : 0.25);
        g.col.push(1, 1, 1);
      }
      g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

  const atlas = getAtlas();
  const group = new THREE.Group();
  const solidMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true });
  const cutMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5 });
  const canopyMat = new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.4, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });
  interface Layer {
    solid: THREE.Mesh;
    cut: THREE.Mesh;
    canopy: THREE.Mesh;
  }
  const geos = () => ({ solid: new Geo(), cut: new Geo(), canopy: new Geo() });
  const makeLayer = (g: ReturnType<typeof geos>, cmat = canopyMat): Layer => {
    const solid = new THREE.Mesh(g.solid.build(), solidMat);
    solid.receiveShadow = solid.castShadow = true;
    const cut = new THREE.Mesh(g.cut.build(), cutMat);
    cut.receiveShadow = cut.castShadow = true;
    const canopy = new THREE.Mesh(g.canopy.build(), cmat);
    canopy.renderOrder = 6;
    canopy.castShadow = true;
    group.add(solid, cut, canopy);
    return { solid, cut, canopy };
  };
  // Static outer landscape.
  const outer = geos();
  for (let z = 0; z < WD; z++) for (let x = 0; x < WW; x++) if (grid.outer[z * WW + x]) emitCell(x, z, outer.solid, outer.cut, outer.canopy);
  makeLayer(outer);
  // Arena in column chunks that can be rebuilt when explosions reshape the ground.
  const buildChunk = (k: number) => {
    const g = geos();
    for (let az = 0; az < GD; az++)
      for (let ax = k * CHUNK; ax < Math.min(GW, (k + 1) * CHUNK); ax++) emitCell(ax + M, az + M, g.solid, g.cut, g.canopy);
    return g;
  };
  const chunks: Layer[] = [];
  const canopies: World['canopies'] = [];
  for (let k = 0; k * CHUNK < GW; k++) {
    const mat = canopyMat.clone();
    canopies.push({ mat, x0: k * CHUNK - 1, x1: Math.min(GW, (k + 1) * CHUNK) + 1 });
    chunks.push(makeLayer(buildChunk(k), mat));
  }

  const water = liquidTexture('water');
  const lava = liquidTexture('lava');
  if (waterGeo.pos.length) {
    const wm = new THREE.Mesh(waterGeo.build(), new THREE.MeshLambertMaterial({ map: water, transparent: true, opacity: 0.78, depthWrite: false }));
    wm.renderOrder = 2;
    group.add(wm);
  }
  if (lavaGeo.pos.length) group.add(new THREE.Mesh(lavaGeo.build(), new THREE.MeshBasicMaterial({ map: lava })));
  const ouch = liquidTexture('ouch');
  if (ouchGeo.pos.length) {
    const om = new THREE.Mesh(ouchGeo.build(), new THREE.MeshBasicMaterial({ map: ouch, transparent: true, opacity: 0.86, depthWrite: false }));
    om.renderOrder = 2;
    group.add(om);
  }

  // ── Sky dome ──
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(sky.top) }, horizon: { value: new THREE.Color(sky.horizon) }, bottom: { value: new THREE.Color(sky.bottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(horizon, top, pow(min(1.0, h * 1.6), 0.7)) : mix(horizon, bottom, min(1.0, -h * 3.0)); gl_FragColor = vec4(c, 1.0);\n#include <colorspace_fragment>\n}',
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(380, 24, 16), skyMat);
  dome.renderOrder = -10;
  group.add(dome);
  if (sky.stars) {
    const n = 1400;
    const p = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const u = hash(k, 1, 9) * 2 - 1;
      const a = hash(k, 2, 9) * Math.PI * 2;
      const y = Math.abs(u) * 0.95 + 0.05;
      const rr = Math.sqrt(1 - y * y);
      p[k * 3] = Math.cos(a) * rr * 360;
      p[k * 3 + 1] = y * 360;
      p[k * 3 + 2] = Math.sin(a) * rr * 360;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: t.sky === 'end' ? 0xd8c8ff : 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
    group.add(stars);
  }
  if (sky.orb) {
    const orb = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.MeshBasicMaterial({ color: sky.orb === 'moon' ? 0xe8ecff : sky.orb === 'dusk' ? 0xffb070 : 0xfff6c8, fog: false, depthWrite: false }),
    );
    const pos = sky.orb === 'dusk' ? new THREE.Vector3(-260, 40, -220) : sky.orb === 'moon' ? new THREE.Vector3(120, 230, -240) : new THREE.Vector3(-140, 260, -200);
    orb.position.copy(pos);
    orb.lookAt(0, 0, 0);
    orb.renderOrder = -9;
    group.add(orb);
  }
  let clouds: THREE.Group | undefined;
  if (sky.clouds) {
    clouds = new THREE.Group();
    const cg = new THREE.BoxGeometry(1, 1, 1);
    const cm = new THREE.MeshBasicMaterial({ color: t.sky === 'dusk' ? 0xffd2c0 : 0xffffff, transparent: true, opacity: 0.82, fog: false, depthWrite: false });
    const inst = new THREE.InstancedMesh(cg, cm, 60);
    const mtx = new THREE.Matrix4();
    for (let k = 0; k < 60; k++) {
      const w = 6 + hash(k, 3, 2) * 14;
      const d = 4 + hash(k, 4, 2) * 10;
      mtx.compose(
        new THREE.Vector3((hash(k, 5, 2) - 0.5) * 300, 46 + hash(k, 6, 2) * 6, (hash(k, 7, 2) - 0.5) * 300),
        new THREE.Quaternion(),
        new THREE.Vector3(w, 1.2, d),
      );
      inst.setMatrixAt(k, mtx);
    }
    clouds.add(inst);
    group.add(clouds);
  }

  return {
    group,
    terrainMeshes: chunks.map((c) => c.solid),
    canopies,
    water,
    lava,
    sky,
    clouds,
    update(dt: number) {
      water.offset.y = (water.offset.y + dt * 0.12) % 1;
      lava.offset.y = (lava.offset.y + dt * 0.05) % 1;
      ouch.offset.y = (ouch.offset.y + dt * 0.08) % 1;
      if (clouds) clouds.position.x = ((clouds.position.x + dt * 0.6 + 150) % 300) - 150;
    },
    rebuild(nt: Terrain, cells: Iterable<number>) {
      const dirty = new Set<number>();
      for (const ti of cells) {
        const ax = ti % GW;
        const az = Math.floor(ti / GW);
        syncCell(grid, nt, ax, az);
        // Side faces and ambient occlusion also depend on the neighbouring columns.
        for (let dx = -1; dx <= 1; dx++) if (ax + dx >= 0 && ax + dx < GW) dirty.add(Math.floor((ax + dx) / CHUNK));
      }
      for (const k of dirty) {
        const g = buildChunk(k);
        const c = chunks[k];
        for (const [mesh, geo] of [[c.solid, g.solid], [c.cut, g.cut], [c.canopy, g.canopy]] as const) {
          mesh.geometry.dispose();
          mesh.geometry = geo.build();
        }
      }
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose?.();
      });
      water.dispose();
      lava.dispose();
      ouch.dispose();
    },
  };
}
