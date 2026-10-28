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
      blue: ['zombie', 'skeleton', 'spider', 'slime', 'wolf', 'snow_golem'],
      purple: ['creeper', 'witch', 'pillager', 'husk', 'polar_bear', 'cave_spider'],
      pink: ['enderman', 'guardian', 'panda', 'turtle'],
      red: ['iron_golem', 'ravager'],
      gold: ['warden', 'giant'],
    },
  },
  {
    id: 'undead', name: '「亡灵之夜」补给箱', desc: '月亮升起时，它们从地下爬出。偏向亡灵。', theme: ['undead'], act: 1, color: '#8fbf6a',
    pool: {
      blue: ['zombie', 'skeleton', 'silverfish', 'bogged', 'baby_zombie', 'jungle_zombie'],
      purple: ['husk', 'stray', 'drowned', 'phantom', 'frostbite', 'parched', 'sunken_skeleton', 'zombified_piglin'],
      pink: ['wither_skeleton', 'ghast', 'enderman', 'camel_husk'],
      red: ['illusioner', 'elder_guardian', 'nameless_sovereign'],
      gold: ['wither', 'giant'],
    },
  },
  {
    id: 'illager', name: '「灾厄巡逻」补给箱', desc: '插着不祥旗帜的箱子。偏向灾厄村民。', theme: ['illager'], act: 1, color: '#9aa3a8',
    pool: {
      blue: ['wolf', 'goat', 'skeleton', 'snow_golem'],
      purple: ['witch', 'pillager', 'vindicator', 'creeper', 'armored_mountaineer', 'vex_raider'],
      pink: ['evoker', 'guardian', 'piglin_brute', 'rampart_captain', 'armored_pillager'],
      red: ['ravager', 'illusioner', 'iron_golem'],
      gold: ['warden', 'giant'],
    },
  },
  {
    id: 'wild', name: '「野性呼唤」补给箱', desc: '缠满藤蔓的木箱。偏向野兽与节肢。', theme: ['beast', 'arthropod'], act: 1, color: '#e0b25b',
    pool: {
      blue: ['wolf', 'goat', 'bee', 'spider', 'slime', 'armadillo', 'bat', 'rabbit_scout', 'woolly_cow'],
      purple: ['polar_bear', 'cave_spider', 'creeper', 'frostbite', 'sniffer', 'snow_fox', 'raven', 'ocelot', 'enchanted_blue_sheep', 'enchanted_red_sheep', 'enchanted_green_sheep'],
      pink: ['hoglin', 'magma_cube', 'enderman', 'sulfur_cube', 'parrot', 'panda'],
      red: ['iron_golem', 'ravager', 'creaking'],
      gold: ['giant', 'verdant_abomination', 'mooshroom_monstrosity'],
    },
  },
  {
    id: 'ocean', name: '「深海遗迹」补给箱', desc: '海晶石打造的宝箱。偏向水生与构造体。', theme: ['aquatic', 'construct'], act: 1, color: '#3fc6d6',
    pool: {
      blue: ['zombie', 'slime', 'snow_golem', 'bogged', 'tropical_slime', 'pufferfish', 'baby_drowned', 'baby_turtle'],
      purple: ['drowned', 'witch', 'stray', 'sunken_skeleton', 'glow_squid', 'dolphin'],
      pink: ['guardian', 'shulker', 'blaze', 'gold_axolotl', 'turtle', 'wave_whisperer', 'armored_drowned'],
      red: ['elder_guardian', 'iron_golem', 'abyssal_guardian'],
      gold: ['warden'],
    },
  },
  {
    id: 'nether', name: '「炽焰下界」补给箱', desc: '黑石与黄金铸成。保密级生物格外丰富。', theme: ['nether'], act: 2, color: '#ff7a3d',
    pool: {
      blue: ['skeleton', 'slime', 'bogged', 'piglin_swordsman'],
      purple: ['husk', 'creeper', 'stray', 'parched', 'piglin_hunter', 'fungus_thrower', 'armored_piglin', 'zombified_piglin'],
      pink: ['blaze', 'ghast', 'wither_skeleton', 'magma_cube', 'piglin_brute', 'hoglin', 'sulfur_cube', 'camel_husk', 'baby_ghast', 'zombified_hunter', 'wither_archer'],
      red: ['breeze', 'ravager', 'wildfire_sentinel'],
      gold: ['wither'],
    },
  },
  {
    id: 'ender', name: '「末影回响」补给箱', desc: '紫珀块缝隙里透出幽光。偏向末影。', theme: ['ender'], act: 3, color: '#c06bff',
    pool: {
      blue: ['endermite', 'silverfish', 'spider'],
      purple: ['phantom', 'creeper', 'cave_spider', 'blastling', 'snareling', 'enderling'],
      pink: ['enderman', 'shulker', 'evoker', 'soul_wizard', 'tower_wraith'],
      red: ['illusioner', 'breeze', 'endersent'],
      gold: ['warden', 'void_sovereign', 'heart_of_ender'],
    },
  },
  {
    id: 'ominous', name: '「不祥宝库」', desc: '试炼密室最深处的宝库。没有军规级。', theme: [], act: 1, color: '#ffc93c',
    pool: {
      blue: [],
      purple: ['witch', 'vindicator', 'pillager', 'polar_bear', 'phantom', 'drowned', 'frostbite', 'parched', 'snow_fox', 'pumpkin_turret', 'chicken_jockey', 'ocelot', 'sunken_skeleton', 'dolphin', 'piglin_hunter', 'fungus_thrower', 'armored_piglin', 'armored_mountaineer', 'blastling', 'snareling', 'enderling', 'vex_raider', 'zombified_piglin'],
      pink: ['enderman', 'blaze', 'evoker', 'piglin_brute', 'shulker', 'wither_skeleton', 'guardian', 'camel_husk', 'sulfur_cube', 'parrot', 'panda', 'gold_axolotl', 'turtle', 'baby_ghast', 'rampart_captain', 'soul_wizard', 'tower_wraith', 'icy_creeper'],
      red: ['iron_golem', 'ravager', 'elder_guardian', 'breeze', 'illusioner', 'creaking', 'endersent', 'frostbound_wraith', 'tower_guard'],
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
      red: ['necromancer', 'illusioner', 'nameless_sovereign'],
      gold: ['giant', 'wither'],
    },
  },
  {
    id: 'highblock', name: '「高厅军械」补给箱', desc: '灾厄高厅的华丽军械箱。偏向灾厄与战术配合。', theme: ['illager'], act: 1, color: '#a3907c', expedition: true,
    pool: {
      blue: ['wolf', 'snow_golem', 'key_golem'],
      purple: ['geomancer', 'mountaineer', 'pillager', 'vindicator', 'vex_raider'],
      pink: ['enchanter', 'royal_guard', 'iceologer', 'evoker', 'armored_pillager', 'armored_vindicator'],
      red: ['windcaller', 'ravager', 'tower_guard', 'arch_illager'],
      gold: ['warden'],
    },
  },
  {
    id: 'verdant', name: '「藤蔓秘藏」补给箱', desc: '缠绕着巨型藤蔓的深林宝箱。偏向野兽与节肢。', theme: ['beast', 'arthropod'], act: 1, color: '#4fa85b', expedition: true,
    pool: {
      blue: ['wolf', 'bee', 'spider'],
      purple: ['whisperer', 'cave_spider', 'mossy_skeleton', 'enchanted_green_sheep'],
      pink: ['leaper', 'hoglin'],
      red: ['creaking', 'iron_golem'],
      gold: ['giant'],
    },
  },
  {
    id: 'gale', name: '「风暴远征」补给箱', desc: '来自嚎风山巅的试炼宝箱。偏向击退与突进。', theme: ['illager', 'construct'], act: 2, color: '#6aa5d8', expedition: true,
    pool: {
      blue: ['goat', 'snow_golem', 'redstone_cube'],
      purple: ['mountaineer', 'geomancer', 'stray', 'enchanted_blue_sheep'],
      pink: ['iceologer', 'squall_golem', 'royal_guard'],
      red: ['windcaller', 'breeze'],
      gold: ['warden', 'tempest_warden'],
    },
  },
  {
    id: 'gilded_forge', name: '「镀金熔铸」补给箱', desc: '余烬锻造厂出炉的重型装甲箱。偏向构造体与重装前排。', theme: ['construct', 'nether'], act: 2, color: '#d4883b', expedition: true,
    pool: {
      blue: ['redstone_cube', 'skeleton', 'slime'],
      purple: ['geomancer', 'pillager', 'creeper'],
      pink: ['squall_golem', 'blaze', 'piglin_brute', 'wither_archer', 'armored_vindicator'],
      red: ['redstone_golem', 'iron_golem'],
      gold: ['wither', 'redstone_colossus'],
    },
  },
  {
    id: 'obsidian_archive', name: '「黑曜秘库」补给箱', desc: '刻有虚空符文的坚硬黑曜石秘库。偏向末影、深海与灵魂召唤。', theme: ['ender', 'undead', 'aquatic'], act: 3, color: '#6c4bb8', expedition: true,
    pool: {
      blue: ['key_golem', 'endermite', 'silverfish'],
      purple: ['soul_wisp', 'drowned', 'phantom'],
      pink: ['wraith', 'shulker', 'guardian'],
      red: ['drowned_necromancer', 'necromancer', 'elder_guardian', 'arch_illager', 'poison_tower_wraith'],
      gold: ['warden', 'heart_of_ender'],
    },
  },
  // ───────────── V3.4 地下城远征 · 主题补给箱 ─────────────
  {
    id: 'lonely_fortress', name: '「霜封补给」补给箱', desc: '孤独堡垒的冰霜宝箱。偏向冰雪与反制读条。', theme: ['undead', 'beast'], act: 1, color: '#9acfe8', expedition: true,
    pool: {
      blue: ['baby_zombie', 'bat', 'zombie', 'skeleton', 'woolly_cow'],
      purple: ['snow_fox', 'pumpkin_turret', 'raven', 'stray', 'frostbite', 'polar_bear'],
      pink: ['iceologer', 'wraith', 'wither_skeleton', 'icy_creeper'],
      red: ['iron_golem', 'illusioner', 'breeze', 'frostbound_wraith'],
      gold: ['giant', 'warden'],
    },
  },
  {
    id: 'overgrown_temple', name: '「藤木秘藏」补给箱', desc: '蔓生神殿的密林宝箱。偏向持续剧毒与近战接力。', theme: ['undead', 'beast'], act: 1, color: '#7cb67d', expedition: true,
    pool: {
      blue: ['jungle_zombie', 'spider', 'slime', 'wolf'],
      purple: ['chicken_jockey', 'mooshroom', 'whisperer', 'ocelot', 'mossy_skeleton', 'enchanted_red_sheep'],
      pink: ['parrot', 'panda', 'leaper', 'hoglin'],
      red: ['ravager', 'creaking', 'iron_golem'],
      gold: ['giant', 'warden', 'verdant_abomination', 'mooshroom_monstrosity'],
    },
  },
  {
    id: 'abyssal_monument', name: '「海晶军需」补给箱', desc: '深渊纪念碑的水底军需箱。偏向抗压续航与减速控制。', theme: ['aquatic', 'beast'], act: 1, color: '#65bfbb', expedition: true,
    pool: {
      blue: ['tropical_slime', 'pufferfish', 'zombie', 'snow_golem', 'baby_drowned', 'baby_turtle'],
      purple: ['sunken_skeleton', 'glow_squid', 'dolphin', 'drowned'],
      pink: ['gold_axolotl', 'turtle', 'guardian', 'wave_whisperer', 'armored_drowned'],
      red: ['elder_guardian', 'drowned_necromancer', 'abyssal_guardian'],
      gold: ['giant', 'warden'],
    },
  },
  {
    id: 'nether_fortress', name: '「堡垒熔铸」补给箱', desc: '下界堡垒的重铸宝箱。偏向贯穿射击与单核护航。', theme: ['nether'], act: 2, color: '#db8c63', expedition: true,
    pool: {
      blue: ['piglin_swordsman', 'skeleton', 'slime', 'bogged'],
      purple: ['piglin_hunter', 'fungus_thrower', 'armored_piglin', 'husk', 'parched'],
      pink: ['baby_ghast', 'blaze', 'ghast', 'wither_skeleton', 'magma_cube', 'piglin_brute', 'zombified_hunter'],
      red: ['breeze', 'ravager', 'wildfire_sentinel'],
      gold: ['wither', 'giant'],
    },
  },
  {
    id: 'gale_sanctum', name: '「风印圣殿」补给箱', desc: '疾风圣殿的试炼宝箱。偏向重斧破势与位移牵制。', theme: ['illager', 'construct'], act: 2, color: '#c1b487', expedition: true,
    pool: {
      blue: ['goat', 'snow_golem', 'redstone_cube'],
      purple: ['llama', 'skeleton_horseman', 'armored_mountaineer', 'mountaineer', 'geomancer'],
      pink: ['rampart_captain', 'squall_golem', 'iceologer', 'royal_guard'],
      red: ['windcaller', 'ravager', 'breeze'],
      gold: ['giant', 'warden', 'tempest_warden'],
    },
  },
  {
    id: 'broken_citadel', name: '「紫晶堡垒」补给箱', desc: '破碎堡垒的虚空秘藏。偏向传送突击与灵魂续航。', theme: ['ender', 'undead'], act: 3, color: '#c89cdb', expedition: true,
    pool: {
      blue: ['endermite', 'silverfish', 'spider', 'skeleton'],
      purple: ['blastling', 'snareling', 'enderling', 'phantom', 'cave_spider'],
      pink: ['soul_wizard', 'tower_wraith', 'shulker', 'enderman'],
      red: ['endersent', 'illusioner', 'breeze', 'poison_tower_wraith'],
      gold: ['giant', 'warden', 'wither', 'void_sovereign'],
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
