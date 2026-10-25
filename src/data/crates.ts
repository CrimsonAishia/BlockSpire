import type { Family, Rarity } from '../core/types.ts';
import { RARITIES } from '../core/types.ts';
import type { Rng } from '../core/rng.ts';

export interface CrateDef {
  id: string;
  name: string;
  desc: string;
  theme: Family[];
  /** Earliest act it can drop in. */
  act: number;
  pool: Record<Rarity, string[]>;
  color: string;
  expedition?: boolean;
}

export const CRATES: CrateDef[] = [
  {
    id: 'origin', name: '「起源」补给箱', desc: '主世界最常见的补给，什么都有一点。', theme: [], act: 1, color: '#7fbf4d',
    pool: {
      blue: ['zombie', 'skeleton', 'spider', 'slime', 'wolf', 'snow_golem', 'armadillo'],
      purple: ['creeper', 'witch', 'pillager', 'husk', 'polar_bear', 'cave_spider', 'frostbite', 'sniffer'],
      pink: ['enderman', 'blaze', 'hoglin', 'guardian', 'shulker', 'sulfur_cube'],
      red: ['iron_golem', 'ravager', 'breeze', 'creaking'],
      gold: ['warden', 'giant'],
    },
  },
  {
    id: 'undead', name: '「亡灵之夜」补给箱', desc: '月亮升起时，它们从地下爬出。偏向亡灵。', theme: ['undead'], act: 1, color: '#8fbf6a',
    pool: {
      blue: ['zombie', 'skeleton', 'silverfish', 'bogged'],
      purple: ['husk', 'stray', 'drowned', 'phantom', 'frostbite', 'parched'],
      pink: ['wither_skeleton', 'ghast', 'enderman', 'camel_husk'],
      red: ['illusioner', 'elder_guardian'],
      gold: ['wither', 'giant'],
    },
  },
  {
    id: 'illager', name: '「灾厄巡逻」补给箱', desc: '插着不祥旗帜的箱子。偏向灾厄村民。', theme: ['illager'], act: 1, color: '#9aa3a8',
    pool: {
      blue: ['wolf', 'goat', 'skeleton', 'snow_golem'],
      purple: ['witch', 'pillager', 'vindicator', 'creeper'],
      pink: ['evoker', 'guardian', 'piglin_brute'],
      red: ['ravager', 'illusioner', 'iron_golem'],
      gold: ['warden', 'giant'],
    },
  },
  {
    id: 'wild', name: '「野性呼唤」补给箱', desc: '缠满藤蔓的木箱。偏向野兽与节肢。', theme: ['beast', 'arthropod'], act: 1, color: '#e0b25b',
    pool: {
      blue: ['wolf', 'goat', 'bee', 'spider', 'slime', 'armadillo'],
      purple: ['polar_bear', 'cave_spider', 'creeper', 'frostbite', 'sniffer'],
      pink: ['hoglin', 'magma_cube', 'enderman', 'sulfur_cube'],
      red: ['iron_golem', 'ravager', 'creaking'],
      gold: ['giant'],
    },
  },
  {
    id: 'ocean', name: '「深海遗迹」补给箱', desc: '海晶石打造的宝箱。偏向水生与构造体。', theme: ['aquatic', 'construct'], act: 1, color: '#3fc6d6',
    pool: {
      blue: ['zombie', 'slime', 'snow_golem', 'bogged'],
      purple: ['drowned', 'witch', 'stray'],
      pink: ['guardian', 'shulker', 'blaze'],
      red: ['elder_guardian', 'iron_golem'],
      gold: ['warden'],
    },
  },
  {
    id: 'nether', name: '「炽焰下界」补给箱', desc: '黑石与黄金铸成。保密级生物格外丰富。', theme: ['nether'], act: 2, color: '#ff7a3d',
    pool: {
      blue: ['skeleton', 'slime', 'bogged'],
      purple: ['husk', 'creeper', 'stray', 'parched'],
      pink: ['blaze', 'ghast', 'wither_skeleton', 'magma_cube', 'piglin_brute', 'hoglin', 'sulfur_cube', 'camel_husk'],
      red: ['breeze', 'ravager'],
      gold: ['wither'],
    },
  },
  {
    id: 'ender', name: '「末影回响」补给箱', desc: '紫珀块缝隙里透出幽光。偏向末影。', theme: ['ender'], act: 3, color: '#c06bff',
    pool: {
      blue: ['endermite', 'silverfish', 'spider'],
      purple: ['phantom', 'creeper', 'cave_spider'],
      pink: ['enderman', 'shulker', 'evoker'],
      red: ['illusioner', 'breeze'],
      gold: ['warden'],
    },
  },
  {
    id: 'ominous', name: '「不祥宝库」', desc: '试炼密室最深处的宝库。没有军规级。', theme: [], act: 1, color: '#ffc93c',
    pool: {
      blue: [],
      purple: ['witch', 'vindicator', 'pillager', 'polar_bear', 'phantom', 'drowned', 'frostbite', 'parched'],
      pink: ['enderman', 'blaze', 'evoker', 'piglin_brute', 'shulker', 'wither_skeleton', 'guardian', 'camel_husk', 'sulfur_cube'],
      red: ['iron_golem', 'ravager', 'elder_guardian', 'breeze', 'illusioner', 'creaking'],
      gold: ['warden', 'wither', 'giant'],
    },
  },
  {
    id: 'sift', name: '「裂隙」补给箱', desc: '从筛界的裂隙里掉出来的箱子，摸起来像甲壳。只有筛界生物。', theme: ['sift'], act: 4, color: '#ff8fb1',
    pool: {
      blue: ['baby_sifter', 'blub'],
      purple: ['bearded_sifter', 'nester'],
      pink: ['tall_sifter', 'sprout'],
      red: ['sculk_slasher', 'singer'],
      gold: ['sculk_dancer', 'warden'],
    },
  },
  // ───────────── V3.3 遗迹远征 · 6 种新宝箱 ─────────────
  {
    id: 'royal_tomb', name: '「王墓仪仗」补给箱', desc: '掩埋在流沙地下的古代墓室。偏向亡灵与盾阵。', theme: ['undead'], act: 1, color: '#bfa760', expedition: true,
    pool: {
      blue: ['skeleton', 'zombie', 'key_golem'],
      purple: ['skeleton_vanguard', 'soul_wisp', 'husk'],
      pink: ['wraith', 'wither_skeleton'],
      red: ['necromancer', 'illusioner'],
      gold: ['giant', 'wither'],
    },
  },
  {
    id: 'highblock', name: '「高厅军械」补给箱', desc: '灾厄高厅的华丽军械箱。偏向灾厄与战术配合。', theme: ['illager'], act: 1, color: '#a3907c', expedition: true,
    pool: {
      blue: ['wolf', 'snow_golem', 'key_golem'],
      purple: ['geomancer', 'mountaineer', 'pillager', 'vindicator'],
      pink: ['enchanter', 'royal_guard', 'iceologer', 'evoker'],
      red: ['windcaller', 'ravager'],
      gold: ['warden'],
    },
  },
  {
    id: 'verdant', name: '「藤蔓秘藏」补给箱', desc: '缠绕着巨型藤蔓的深林宝箱。偏向野兽与节肢。', theme: ['beast', 'arthropod'], act: 1, color: '#4fa85b', expedition: true,
    pool: {
      blue: ['wolf', 'bee', 'spider'],
      purple: ['whisperer', 'poison_quill_vine', 'cave_spider'],
      pink: ['leaper', 'hoglin'],
      red: ['creaking', 'iron_golem'],
      gold: ['giant'],
    },
  },
  {
    id: 'gale', name: '「风暴远征」补给箱', desc: '来自嚎风山巅的试炼宝箱。偏向击退与突进。', theme: ['illager', 'construct'], act: 2, color: '#6aa5d8', expedition: true,
    pool: {
      blue: ['goat', 'snow_golem', 'redstone_cube'],
      purple: ['mountaineer', 'geomancer', 'stray'],
      pink: ['iceologer', 'squall_golem', 'royal_guard'],
      red: ['windcaller', 'breeze'],
      gold: ['warden'],
    },
  },
  {
    id: 'gilded_forge', name: '「镀金熔铸」补给箱', desc: '余烬锻造厂出炉的重型装甲箱。偏向构造体与重装前排。', theme: ['construct', 'nether'], act: 2, color: '#d4883b', expedition: true,
    pool: {
      blue: ['redstone_cube', 'skeleton', 'slime'],
      purple: ['geomancer', 'pillager', 'creeper'],
      pink: ['squall_golem', 'blaze', 'piglin_brute'],
      red: ['redstone_golem', 'iron_golem'],
      gold: ['wither'],
    },
  },
  {
    id: 'obsidian_archive', name: '「黑曜秘库」补给箱', desc: '刻有虚空符文的坚硬黑曜石秘库。偏向末影、深海与灵魂召唤。', theme: ['ender', 'undead', 'aquatic'], act: 3, color: '#6c4bb8', expedition: true,
    pool: {
      blue: ['key_golem', 'endermite', 'silverfish'],
      purple: ['soul_wisp', 'drowned', 'phantom'],
      pink: ['wraith', 'shulker', 'guardian'],
      red: ['drowned_necromancer', 'necromancer', 'elder_guardian'],
      gold: ['warden'],
    },
  },
];
export const CRATE_MAP: Record<string, CrateDef> = Object.fromEntries(CRATES.map((c) => [c.id, c]));

export type CrateGrade = 'normal' | 'elite' | 'boss' | 'starter' | 'premium';

export const GRADE_INFO: Record<CrateGrade, { name: string; color: string }> = {
  normal: { name: '普通', color: '#b9c1c9' },
  elite: { name: '精良', color: '#c06bff' },
  boss: { name: '传奇', color: '#ffc93c' },
  starter: { name: '新手', color: '#7fbf4d' },
  premium: { name: '高级', color: '#55c1ff' },
};

/** Base rarity weights [blue, purple, pink, red, gold] in %. */
export function gradeOdds(grade: CrateGrade, act: number): number[] {
  const a = Math.max(1, Math.min(3, act));
  switch (grade) {
    case 'starter':
      return [72, 28, 0, 0, 0];
    case 'normal':
      return [
        [62, 26, 9, 2.4, 0.6],
        [44, 33, 16, 5.5, 1.5],
        [28, 36, 24, 9.5, 2.5],
      ][a - 1];
    case 'premium':
      return [
        [30, 42, 20, 6.5, 1.5],
        [18, 40, 28, 11, 3],
        [8, 36, 36, 15, 5],
      ][a - 1];
    case 'elite':
      return [
        [0, 55, 32, 10, 3],
        [0, 42, 38, 15, 5],
        [0, 30, 42, 21, 7],
      ][a - 1];
    case 'boss':
      return [0, 0, 60, 30, 10];
  }
}

export interface OpenContext {
  act: number;
  /** Chance to bump the rolled rarity up one tier. */
  luck: number;
  goldMul: number;
  redMul: number;
  /** Opens since last red-or-better result. */
  pity: number;
}

/** Final per-rarity probabilities after modifiers and pool availability (sums to 1). */
export function effectiveOdds(crate: CrateDef, grade: CrateGrade, ctx: OpenContext): number[] {
  const w = gradeOdds(grade, ctx.act).slice();
  w[3] *= ctx.redMul;
  w[4] *= ctx.goldMul;
  // Pity: after 8 dry opens, red/gold weights grow quickly.
  if (ctx.pity > 8) {
    const boost = 1 + (ctx.pity - 8) * 0.25;
    w[3] *= boost;
    w[4] *= boost;
  }
  RARITIES.forEach((r, i) => {
    if (crate.pool[r].length === 0) w[i] = 0;
  });
  // Apply luck as an expected upward shift for display purposes.
  const out = w.slice();
  if (ctx.luck > 0) {
    for (let i = 0; i < 4; i++) {
      let j = i + 1;
      while (j < 5 && crate.pool[RARITIES[j]].length === 0) j++;
      if (j < 5) {
        const moved = w[i] * ctx.luck;
        out[i] -= moved;
        out[j] += moved;
      }
    }
  }
  const total = out.reduce((s, x) => s + x, 0);
  return out.map((x) => x / total);
}

export interface OpenResult {
  mob: string;
  rarity: Rarity;
  lucky: boolean;
}

export function rollCrate(rng: Rng, crate: CrateDef, grade: CrateGrade, ctx: OpenContext, exclude: string[] = []): OpenResult {
  const w = gradeOdds(grade, ctx.act).slice();
  w[3] *= ctx.redMul;
  w[4] *= ctx.goldMul;
  if (ctx.pity > 8) {
    const boost = 1 + (ctx.pity - 8) * 0.25;
    w[3] *= boost;
    w[4] *= boost;
  }
  RARITIES.forEach((r, i) => {
    if (crate.pool[r].filter((m) => !exclude.includes(m)).length === 0) w[i] = 0;
  });
  let idx = RARITIES.indexOf(rng.weighted(RARITIES, w));
  let lucky = false;
  if (ctx.luck > 0 && idx < 4 && rng.chance(ctx.luck)) {
    let j = idx + 1;
    while (j < 5 && crate.pool[RARITIES[j]].filter((m) => !exclude.includes(m)).length === 0) j++;
    if (j < 5) {
      idx = j;
      lucky = true;
    }
  }
  const rarity = RARITIES[idx];
  const options = crate.pool[rarity].filter((m) => !exclude.includes(m));
  return { mob: rng.pick(options), rarity, lucky };
}

export function cratesForAct(act: number): CrateDef[] {
  return CRATES.filter((c) => c.id !== 'ominous' && c.act <= act);
}

export function baseCratesForAct(act: number): CrateDef[] {
  return CRATES.filter((c) => c.id !== 'ominous' && !c.expedition && c.act <= act);
}

export function expeditionCratesForAct(act: number): CrateDef[] {
  return CRATES.filter((c) => Boolean(c.expedition) && c.act <= act);
}
