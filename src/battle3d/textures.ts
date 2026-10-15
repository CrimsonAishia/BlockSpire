// Procedural 16×16 Minecraft-style block textures packed into one atlas (nearest filtering).
import * as THREE from 'three';

export const TILE = 16;
const COLS = 16;
const ROWS = 8;

type Px = (x: number, y: number, c: string | null) => void;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (r: () => number, pal: string[]) => pal[Math.floor(r() * pal.length)];

function noiseFill(px: Px, r: () => number, pal: string[]) {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, pick(r, pal));
}

const DIRT = ['#7a573d', '#8b6446', '#6d4c35', '#966d4c', '#80593f'];
const NETHERRACK = ['#6e2a2a', '#7d3232', '#5f2222', '#8a3a38', '#702c2c'];

/** Tile painters; order defines atlas index. */
const PAINTERS: Record<string, (px: Px, r: () => number) => void> = {
  grass_top: (px, r) => noiseFill(px, r, ['#4f8a2f', '#5b9a37', '#67a840', '#4a7f2b', '#73b348', '#5f9f3a']),
  grass_side: (px, r) => {
    noiseFill(px, r, DIRT);
    for (let x = 0; x < 16; x++) {
      const d = 3 + (r() < 0.5 ? 1 : 0) + (r() < 0.2 ? 1 : 0);
      for (let y = 0; y < d; y++) px(x, y, pick(r, ['#4f8a2f', '#5b9a37', '#67a840', '#4a7f2b']));
    }
  },
  dirt: (px, r) => noiseFill(px, r, DIRT),
  path_top: (px, r) => noiseFill(px, r, ['#9a8655', '#8d7a4b', '#a8935f', '#93804f']),
  sand: (px, r) => noiseFill(px, r, ['#dbcf98', '#d2c58b', '#e3d7a3', '#cbbd82', '#d8cb93']),
  sandstone: (px, r) => {
    noiseFill(px, r, ['#d8cb92', '#e0d39c', '#cfc287']);
    for (let x = 0; x < 16; x++) {
      px(x, 3, '#bcae74');
      px(x, 12, '#bcae74');
    }
  },
  snow: (px, r) => noiseFill(px, r, ['#f2f7fa', '#e6eef3', '#ffffff', '#dde8ee', '#eef4f8']),
  snow_side: (px, r) => {
    noiseFill(px, r, DIRT);
    for (let x = 0; x < 16; x++) {
      const d = 3 + (r() < 0.5 ? 1 : 0);
      for (let y = 0; y < d; y++) px(x, y, pick(r, ['#f2f7fa', '#e6eef3', '#ffffff']));
    }
  },
  ice: (px, r) => {
    noiseFill(px, r, ['#9cc4f5', '#8db8ef', '#a8cdf8', '#93bdf2']);
    for (let k = 0; k < 3; k++) {
      const y = Math.floor(r() * 16);
      for (let x = Math.floor(r() * 8); x < 16 && r() > 0.1; x++) px(x, y, '#d6e9ff');
    }
  },
  stone: (px, r) => noiseFill(px, r, ['#7d7d7d', '#8a8a8a', '#727272', '#959595', '#808080', '#7a7a7a']),
  gravel: (px, r) => {
    noiseFill(px, r, ['#857f7c', '#7a7471']);
    for (let k = 0; k < 22; k++) {
      const x = Math.floor(r() * 15);
      const y = Math.floor(r() * 15);
      const c = pick(r, ['#5e5856', '#9a9390', '#6f6966', '#a8a19d']);
      px(x, y, c);
      px(x + 1, y, c);
      px(x, y + 1, c);
    }
  },
  cobble: (px, r) => {
    noiseFill(px, r, ['#7a7a7a', '#878787', '#6c6c6c', '#949494']);
    for (let k = 0; k < 26; k++) px(Math.floor(r() * 16), Math.floor(r() * 16), '#4e4e4e');
    for (let y = 0; y < 16; y += 5) for (let x = 0; x < 16; x++) if (r() < 0.6) px(x, (y + Math.floor(x / 4)) % 16, '#555555');
  },
  deepslate: (px, r) => {
    noiseFill(px, r, ['#4a4a50', '#55555c', '#3f3f45', '#505057']);
    for (let y = 2; y < 16; y += 4) for (let x = 0; x < 16; x++) if (r() < 0.5) px(x, y, '#38383d');
  },
  moss: (px, r) => noiseFill(px, r, ['#5a7d2c', '#4d6e24', '#66903a', '#557829']),
  mud: (px, r) => noiseFill(px, r, ['#3c3436', '#463d3f', '#332c2e', '#4d4446']),
  soul_sand: (px, r) => {
    noiseFill(px, r, ['#51402f', '#5e4a37', '#46372a', '#574533']);
    for (let k = 0; k < 4; k++) {
      const x = Math.floor(r() * 12) + 1;
      const y = Math.floor(r() * 12) + 1;
      px(x, y, '#2e231a');
      px(x + 2, y, '#2e231a');
      px(x + 1, y + 2, '#2e231a');
    }
  },
  netherrack: (px, r) => noiseFill(px, r, NETHERRACK),
  nylium_top: (px, r) => noiseFill(px, r, ['#962121', '#a52a2a', '#801b1b', '#b33333', '#8f1f1f']),
  nylium_side: (px, r) => {
    noiseFill(px, r, NETHERRACK);
    for (let x = 0; x < 16; x++) {
      const d = 3 + (r() < 0.5 ? 1 : 0);
      for (let y = 0; y < d; y++) px(x, y, pick(r, ['#962121', '#a52a2a', '#801b1b']));
    }
  },
  basalt_top: (px, r) => {
    noiseFill(px, r, ['#4b4b52', '#56565e', '#404047']);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      px(Math.round(7.5 + Math.cos(a) * 5), Math.round(7.5 + Math.sin(a) * 5), '#36363c');
    }
  },
  basalt_side: (px, r) => {
    for (let x = 0; x < 16; x++) {
      const c = pick(r, ['#4b4b52', '#56565e', '#404047', '#5d5d66']);
      for (let y = 0; y < 16; y++) px(x, y, r() < 0.85 ? c : '#38383e');
    }
  },
  blackstone: (px, r) => noiseFill(px, r, ['#2e2a30', '#38333a', '#262228', '#332e35']),
  nether_brick: (px, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const mortar = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 4) % 8 === 7;
        px(x, y, mortar ? '#1d0c0e' : pick(r, ['#3a1b1f', '#2d1417', '#43201f']));
      }
  },
  end_stone: (px, r) => noiseFill(px, r, ['#dfe0a6', '#e8e9b4', '#d3d498', '#cfd08f', '#e2e3ab']),
  obsidian: (px, r) => {
    noiseFill(px, r, ['#140f22', '#1d1530', '#0f0b19', '#191326']);
    for (let k = 0; k < 10; k++) px(Math.floor(r() * 16), Math.floor(r() * 16), '#3d2c66');
  },
  purpur: (px, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = x % 8 === 0 || y % 8 === 0;
        px(x, y, edge ? '#8a5f8a' : pick(r, ['#a77aa7', '#b58bb5', '#9b6e9b']));
      }
  },
  prismarine: (px, r) => noiseFill(px, r, ['#5fa79a', '#6bb3a5', '#4f8f84', '#7cc2b2', '#63ab9e']),
  oak_log: (px, r) => {
    for (let x = 0; x < 16; x++) {
      const c = pick(r, ['#6b5132', '#5a432a', '#7a5d3a']);
      for (let y = 0; y < 16; y++) px(x, y, r() < 0.8 ? c : '#4d3922');
    }
  },
  oak_log_top: (px) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        px(x, y, d > 6.5 ? '#6b5132' : Math.floor(d) % 2 ? '#a07e4f' : '#8d6c41');
      }
  },
  oak_leaves: (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, r() < 0.18 ? null : pick(r, ['#3f7a1f', '#4c8c27', '#356a19', '#5a9a30']));
  },
  spruce_log: (px, r) => {
    for (let x = 0; x < 16; x++) {
      const c = pick(r, ['#3d2a17', '#4a331d', '#33230f']);
      for (let y = 0; y < 16; y++) px(x, y, c);
    }
  },
  spruce_leaves: (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, r() < 0.15 ? null : pick(r, ['#2f4f2f', '#385c38', '#284428', '#3e663e']));
  },
  cactus_side: (px, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const stripe = x % 4 === 1;
        px(x, y, stripe ? '#3f6b1f' : pick(r, ['#5c8f2e', '#649a33', '#557f2a']));
      }
    for (let k = 0; k < 8; k++) px(Math.floor(r() * 16), Math.floor(r() * 16), '#e8e8c8');
  },
  cactus_top: (px, r) => noiseFill(px, r, ['#6aa438', '#5c8f2e', '#76b043']),
  hay_side: (px, r) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) px(x, y, y === 4 || y === 11 ? '#7a4a1e' : pick(r, ['#c9a53a', '#b8952f', '#d4b048']));
  },
  hay_top: (px, r) => noiseFill(px, r, ['#c9a53a', '#b8952f', '#a8862a']),
  fungus_stem: (px, r) => {
    for (let x = 0; x < 16; x++) {
      const c = pick(r, ['#7a2f4a', '#8c3a57', '#5f2238']);
      for (let y = 0; y < 16; y++) px(x, y, c);
    }
  },
  wart: (px, r) => noiseFill(px, r, ['#7a0b0b', '#8f1414', '#690909', '#a01c1c']),
  chorus: (px, r) => noiseFill(px, r, ['#8a6a8f', '#a07fa5', '#6f5374', '#94749a']),
  bedrock: (px, r) => noiseFill(px, r, ['#3a3a3a', '#555555', '#222222', '#484848']),
  cobweb: (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, null);
    for (let k = 0; k < 16; k++) {
      px(k, k, '#e8e8e8');
      px(15 - k, k, '#e8e8e8');
      px(7, k, r() < 0.8 ? '#dcdcdc' : null);
      px(k, 7, r() < 0.8 ? '#dcdcdc' : null);
    }
    for (let k = 0; k < 20; k++) {
      const a = (k / 20) * Math.PI * 2;
      px(Math.round(7.5 + Math.cos(a) * 5), Math.round(7.5 + Math.sin(a) * 5), '#cfcfcf');
    }
  },
  tallgrass: (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, null);
    for (let k = 0; k < 7; k++) {
      const x = 1 + Math.floor(r() * 14);
      const h = 6 + Math.floor(r() * 9);
      for (let y = 15; y > 15 - h; y--) px(x + (y < 8 && r() < 0.3 ? 1 : 0), y, pick(r, ['#5b9a37', '#4a7f2b', '#67a840']));
    }
  },
  flower_red: (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, null);
    for (let y = 8; y < 16; y++) px(7, y, '#3f7a1f');
    for (const [x, y] of [[6, 5], [8, 5], [7, 4], [7, 6], [6, 6], [8, 6], [7, 5]]) px(x, y, r() < 0.2 ? '#ffd23f' : '#d92b2b');
    px(6, 11, '#4c8c27');
    px(8, 10, '#4c8c27');
  },
  flower_yellow: (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, null);
    for (let y = 8; y < 16; y++) px(8, y, '#3f7a1f');
    for (const [x, y] of [[7, 6], [9, 6], [8, 5], [8, 7], [8, 6]]) px(x, y, '#f5d32a');
  },
  lily: (px) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        const notch = x > 7 && Math.abs(y - 7.5) < 1.5;
        px(x, y, d < 7 && !notch ? (d > 5.5 ? '#2f6b1f' : '#3f8a27') : null);
      }
  },
  bone: (px, r) => noiseFill(px, r, ['#e8e4d4', '#d8d3c0', '#f0ece0']),
  rail: (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, null);
    for (let y = 1; y < 16; y += 4) for (let x = 1; x < 15; x++) px(x, y, '#6b5132');
    for (let y = 0; y < 16; y++) {
      px(3, y, '#9a9a9a');
      px(12, y, '#9a9a9a');
    }
  },
  lantern: (px) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, x > 3 && x < 12 && y > 2 && y < 14 ? (x > 5 && x < 10 && y > 5 && y < 12 ? '#ffd27a' : '#3a3a42') : null);
  },
  well: (px, r) => noiseFill(px, r, ['#7a7a7a', '#878787', '#6c6c6c']),
  dirt_dark: (px, r) => noiseFill(px, r, ['#4d3826', '#5a422d', '#43301f']),
  // Ice caves
  packed_ice: (px, r) => {
    noiseFill(px, r, ['#8fb4e8', '#9cc0f0', '#86aae0', '#a6c8f4']);
    for (let k = 0; k < 4; k++) {
      const y = Math.floor(r() * 16);
      for (let x = Math.floor(r() * 6); x < 16 && r() > 0.12; x++) px(x, y, '#c4dcfb');
    }
  },
  calcite: (px, r) => {
    noiseFill(px, r, ['#e6e4de', '#dcdad3', '#efede8', '#d2cfc8']);
    for (let k = 0; k < 10; k++) px(Math.floor(r() * 16), Math.floor(r() * 16), '#b8b4ac');
  },
  brittle_ice: (px, r) => {
    noiseFill(px, r, ['#b8daf8', '#c4e2fb', '#acd0f4']);
    // Cracks spidering out from a point.
    for (let k = 0; k < 5; k++) {
      let x = 7 + Math.floor(r() * 3);
      let y = 7 + Math.floor(r() * 3);
      const dx = r() < 0.5 ? -1 : 1;
      const dy = r() < 0.5 ? -1 : 1;
      for (let n = 0; n < 9; n++) {
        px(x, y, '#6f9bd0');
        if (r() < 0.6) x += dx;
        else y += dy;
      }
    }
  },
  icicle: (px, r) => {
    for (let x = 0; x < 16; x++) {
      const c = pick(r, ['#a8cdf8', '#bcdcfb', '#93bdf2', '#d6e9ff']);
      for (let y = 0; y < 16; y++) px(x, y, r() < 0.88 ? c : '#e8f4ff');
    }
  },
  // The Sift
  sift_grass_top: (px, r) => {
    noiseFill(px, r, ['#f08aa0', '#e87b93', '#f59bb0', '#dc6f88', '#f4a6b8']);
    for (let k = 0; k < 5; k++) px(Math.floor(r() * 16), Math.floor(r() * 16), '#7ff5de');
  },
  sift_grass_side: (px, r) => {
    noiseFill(px, r, ['#ece4ef', '#e2d8e6', '#f4eef6', '#d8cddd']);
    for (let x = 0; x < 16; x++) {
      const d = 3 + (r() < 0.5 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
      for (let y = 0; y < d; y++) px(x, y, pick(r, ['#f08aa0', '#e87b93', '#dc6f88']));
    }
  },
  sift_stone: (px, r) => {
    noiseFill(px, r, ['#ece4ef', '#e2d8e6', '#f4eef6', '#d8cddd']);
    for (let k = 0; k < 8; k++) px(Math.floor(r() * 16), Math.floor(r() * 16), '#c4b6cc');
  },
  chitin: (px, r) => {
    noiseFill(px, r, ['#d4704f', '#c9643f', '#df7f5c', '#cf6a48']);
    // Overlapping plates: dark seams, a light edge just under each.
    for (let y = 0; y < 16; y += 5)
      for (let x = 0; x < 16; x++) {
        const yy = (y + (Math.floor(x / 8) % 2) * 2) % 16;
        px(x, yy, '#8a3a24');
        px(x, (yy + 1) % 16, '#ef9c7c');
      }
  },
  white_wood: (px, r) => {
    for (let x = 0; x < 16; x++) {
      const c = pick(r, ['#efeadf', '#e4ddd0', '#f6f2ea', '#ddd5c6']);
      for (let y = 0; y < 16; y++) px(x, y, r() < 0.9 ? c : '#cfc6b6');
    }
  },
  white_wood_top: (px) => {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
        px(x, y, Math.floor(d) % 3 === 0 ? '#d6ccbb' : '#f2ede3');
      }
  },
  sift_leaves: (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, r() < 0.18 ? null : pick(r, ['#ff9cc0', '#f58ab2', '#ffb0cc', '#ec7aa6']));
  },
  glowbulb: (px, r) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(x, y, null);
    for (let k = 0; k < 3; k++) {
      const x = 3 + k * 5 + Math.floor(r() * 2);
      const h = 5 + Math.floor(r() * 5);
      for (let y = 15; y > 15 - h; y--) px(x, y, '#5a8a6a');
      const top = 15 - h;
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [0, -2]]) px(x + dx, top + dy, dy === -2 || dx === 0 ? '#b8fff2' : '#5ff4fa');
    }
  },
};

export const TILE_NAMES = Object.keys(PAINTERS);
const INDEX: Record<string, number> = Object.fromEntries(TILE_NAMES.map((n, i) => [n, i]));

export function tileUV(name: string): [number, number, number, number] {
  const i = INDEX[name] ?? 0;
  const c = i % COLS;
  const r = Math.floor(i / COLS);
  const e = 0.02 / (COLS * TILE);
  const u0 = c / COLS + e;
  const u1 = (c + 1) / COLS - e;
  const v1 = 1 - r / ROWS - e;
  const v0 = 1 - (r + 1) / ROWS + e;
  return [u0, v0, u1, v1];
}

function paintTile(ctx: CanvasRenderingContext2D, ox: number, oy: number, name: string) {
  const r = rng(INDEX[name] * 7919 + 17);
  const img = ctx.createImageData(TILE, TILE);
  const px: Px = (x, y, c) => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    if (!c) {
      img.data[i + 3] = 0;
      return;
    }
    const n = parseInt(c.slice(1), 16);
    img.data[i] = (n >> 16) & 255;
    img.data[i + 1] = (n >> 8) & 255;
    img.data[i + 2] = n & 255;
    img.data[i + 3] = 255;
  };
  PAINTERS[name](px, r);
  ctx.putImageData(img, ox, oy);
}

let atlas: THREE.CanvasTexture | null = null;
export function getAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = COLS * TILE;
  c.height = ROWS * TILE;
  const ctx = c.getContext('2d')!;
  TILE_NAMES.forEach((n, i) => paintTile(ctx, (i % COLS) * TILE, Math.floor(i / COLS) * TILE, n));
  atlas = new THREE.CanvasTexture(c);
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestFilter;
  atlas.generateMipmaps = false;
  atlas.colorSpace = THREE.SRGBColorSpace;
  return atlas;
}

/** Standalone tiling texture for animated liquids. */
export function liquidTexture(kind: 'water' | 'lava' | 'ouch'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const r = rng(kind === 'water' ? 11 : kind === 'ouch' ? 37 : 23);
  const img = ctx.createImageData(16, 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 16; x++) {
      const i = (y * 16 + x) * 4;
      const wave = Math.sin((x + y * 0.5) * 0.8) + Math.sin(y * 0.4 - x * 0.3);
      let col: number[];
      if (kind === 'water') {
        const base = wave > 1.2 ? [80, 130, 245] : wave > 0.2 ? [52, 98, 222] : [42, 84, 196];
        col = base.map((v) => v + (r() - 0.5) * 14);
      } else if (kind === 'ouch') {
        // Ouch Water: glowing teal with pale soul streaks.
        const base = wave > 1.2 ? [150, 255, 232] : wave > 0.2 ? [60, 222, 196] : [36, 178, 168];
        col = base.map((v) => v + (r() - 0.5) * 16);
      } else {
        const base = wave > 1.1 ? [255, 190, 60] : wave > 0 ? [240, 120, 20] : [200, 70, 10];
        col = base.map((v) => v + (r() - 0.5) * 20);
      }
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
