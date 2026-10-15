// Run state machine. Pure and serializable: UI calls these actions and renders `queue[0]`.
import { Rng, randomSeed } from '../core/rng.ts';
import type { ActMap, Card, MapNode, Rarity, Row } from '../core/types.ts';
import { RARITIES } from '../core/types.ts';
import { CRATE_MAP, cratesForAct, rollCrate, type CrateGrade, type OpenContext, type OpenResult } from '../data/crates.ts';
import { ENC_MAP, ENCOUNTERS, enemyScale, riftEncounters, tierForRow, type EncCard, type EncounterDef } from '../data/encounters.ts';
import { AFFIXES, COMMANDER_MAP, ENCHANTS, ENCHANT_MAP, ENEMY_ENCHANTS, ITEMS, enchantName, ITEM_MAP, POTION_MAP, RELICS, RELIC_MAP, RELIC_TIER_INFO, rollItem, type ItemTier, type RelicTier } from '../data/items.ts';
import { MOB_MAP, RARITY_INFO, mobDef } from '../data/mobs.ts';
import { buildSide } from '../battle/setup.ts';
import type { BattleConfig, BattleResult } from '../battle/sim.ts';
import { EVENTS, EVENT_MAP } from './events.ts';
import { generateMap } from './map.ts';
import { BOSS_BIOME, SIFT_BIOMES, generateTerrain, pickBiome, type BuildOrder, type Terrain } from '../battle/terrain.ts';

export const RUN_VERSION = 3;

export interface CrateOffer {
  crate: string;
  grade: CrateGrade;
}

export interface ShopItem {
  id: string;
  kind: 'crate' | 'potion' | 'relic' | 'enchant' | 'heal' | 'upgrade';
  ref: string;
  /** Enchanted book level. */
  level?: number;
  grade?: CrateGrade;
  price: number;
  sold: boolean;
}

export interface BattleSummary {
  win: boolean;
  time: number;
  cards: { mob: string; star: number; team: 0 | 1; dmg: number; kills: number; heal: number; taken: number; alive: number; spawned: number }[];
}

export type Pending =
  | { type: 'starter'; idx: number; crates: { crate: string; label: string; pool: string[] }[] }
  | {
      type: 'battle';
      kind: 'battle' | 'elite' | 'boss' | 'event';
      enc: string;
      name: string;
      desc?: string;
      cards: EncCard[];
      hpMul: number;
      atkMul: number;
      seed: number;
      attempt: number;
      /** Extra rewards for event battles. */
      onWin?: string;
      /** Wounded boss: starting HP fraction on retries. */
      bossHp?: number;
      /** Battlefield biome and terrain seed. */
      biome: string;
      tseed: number;
      /** Player squad placements by card uid (world coords). */
      deploy?: Record<string, [number, number]>;
      /** Walls / platforms Steve built during deployment. */
      build?: BuildOrder[];
      /** The Witch's free potions for this fight. */
      brew?: string[];
      /** Elite affix on every enemy card (不祥之兆 II+, data/items.ts AFFIXES). */
      affix?: string;
    }
  | {
      type: 'result';
      win: boolean;
      kind: 'battle' | 'elite' | 'boss' | 'event';
      emeralds: number;
      heartsLost: number;
      potion?: string;
      /** Dropped item that did not fit (the player may swap it in). */
      missed?: string;
      /** Alex: tamed mobs that survived and can be kept as a card (one of them). */
      capture?: string[];
      /** Villager: emeralds paid for the hired golem. */
      golemCost?: number;
      summary: BattleSummary;
      totem?: boolean;
    }
  | {
      type: 'crates';
      title: string;
      offers: CrateOffer[];
      skip: number;
      /** Results already rolled for an offer (backing out and re-choosing it gives the same mob). */
      rolled?: Record<number, OpenResult>;
    }
  | {
      type: 'open';
      seq: number;
      crate: string;
      grade: CrateGrade;
      result: OpenResult;
      title?: string;
      applied?: GainOutcome;
      /** The crate choice this came from, so the player can go back before opening. */
      from?: { offers: CrateOffer[]; title: string; skip: number; idx: number; rolled: Record<number, OpenResult> };
    }
  | { type: 'card_decide'; mob: string; star: 1; dust: number }
  | { type: 'relic_choice'; title: string; choices: string[]; skippable: boolean }
  | { type: 'shop'; stock: ShopItem[]; reroll: number; /** Villager orders left in this shop. */ orders?: number }
  | { type: 'event'; id: string; result?: string; resultTone?: 'good' | 'bad' | 'neutral'; data: Record<string, number> }
  | { type: 'rest'; actions: number; done: string[] }
  | { type: 'pick_card'; purpose: 'enchant' | 'upgrade' | 'bonus' | 'sacrifice' | 'trade'; title: string; enchant?: string; data?: Record<string, number | string> }
  | { type: 'enchant_choice'; title: string; books: string[]; cost: number; /** Book levels (default I). */ levels?: number[] }
  | { type: 'boss_reward'; relics: string[]; slotGained: boolean; healed: number }
  | { type: 'act_intro'; act: number }
  | { type: 'victory' }
  | { type: 'defeat' }
  | { type: 'message'; title: string; text: string; tone: 'good' | 'bad' | 'neutral' };

export interface RunStats {
  battlesWon: number;
  battlesLost: number;
  elitesWon: number;
  bossesWon: number;
  crates: number;
  pulls: Record<Rarity, number>;
  emeraldsEarned: number;
  damage: number;
  nodes: number;
  starUps: number;
  mvp: Record<string, number>;
  startTime: number;
}

export interface RunState {
  v: number;
  seed: number;
  rng: number;
  commander: string;
  omen: number;
  act: number;
  map: ActMap;
  nodeId: string | null;
  visited: string[];
  /** Nodes whose completion hooks already ran. */
  done: string[];
  hearts: number;
  maxHearts: number;
  emeralds: number;
  team: Card[];
  bench: Card[];
  slots: number;
  benchSize: number;
  relics: string[];
  /** Battle items (the field keeps its old name for saves). */
  potions: string[];
  potionSlots: number;
  pity: number;
  elytraAct: number;
  queue: Pending[];
  stats: RunStats;
  bosses: string[];
  usedEnc: string[];
  uidSeq: number;
  /** Potions armed for the next battle. */
  armed: string[];
  over: boolean;
  won: boolean;
  /** Event chains: stage per chain id (negative = the "bad" branch). */
  chains?: Record<string, number>;
  /** A battle a chain has set up for a later floor (replaces a normal fight). */
  ambush?: { enc: string; onWin: string; act: number; minRow: number; name: string; desc: string };
  /** Notifications for the UI (toasts), drained by the UI. */
  toasts: { text: string; tone: 'good' | 'bad' | 'neutral' | 'gold' }[];
}

// ───────────────────────── helpers ─────────────────────────

export function rngOf(s: RunState) {
  const r = new Rng(s.rng);
  return {
    r,
    save() {
      s.rng = r.s;
    },
  };
}

/** Runs fn with the run RNG and persists its state afterwards. */
export function withRng<T>(s: RunState, fn: (r: Rng) => T): T {
  const r = new Rng(s.rng);
  const out = fn(r);
  s.rng = r.s;
  return out;
}

export function toast(s: RunState, text: string, tone: 'good' | 'bad' | 'neutral' | 'gold' = 'neutral') {
  s.toasts.push({ text, tone });
}

export function hasRelic(s: RunState, id: string) {
  return s.relics.includes(id);
}

export function allCards(s: RunState) {
  return [...s.team, ...s.bench];
}

export function findCard(s: RunState, uid: string): Card | undefined {
  return allCards(s).find((c) => c.uid === uid);
}

export function shardsNeeded(star: number) {
  return star === 1 ? 1 : 2;
}

export function dustValue(mob: string, star: number) {
  return RARITY_INFO[mobDef(mob).rarity].dust * (star === 1 ? 1 : star === 2 ? 2.5 : 5);
}

export function priceMul(s: RunState) {
  let m = 1;
  if (s.commander === 'villager') m *= 0.8;
  if (hasRelic(s, 'gold_ingot')) m *= 0.85;
  if (s.omen >= 3) m *= 1.15;
  if (hasRelic(s, 'conduit')) m *= 1.2;
  return m;
}

export function openContext(s: RunState): OpenContext {
  let luck = 0;
  if (s.commander === 'alex') luck += 0.1;
  if (hasRelic(s, 'rabbit_foot')) luck += 0.06;
  if (hasRelic(s, 'ominous_bottle')) luck += 0.15;
  // Ominous loot: every omen level makes the crates a little luckier.
  luck += 0.02 * s.omen;
  return {
    act: s.act,
    luck,
    goldMul: hasRelic(s, 'dragon_egg') ? 2 : 1,
    redMul: hasRelic(s, 'dragon_egg') ? 1.5 : 1,
    pity: s.pity,
  };
}

function newCard(s: RunState, mob: string, star: 1 | 2 | 3 = 1): Card {
  return { uid: `c${s.uidSeq++}`, mob, star, shards: 0, row: mobDef(mob).defaultRow };
}

// ───────────────────────── creation ─────────────────────────

export function createRun(commander: string, omen: number, seed = randomSeed()): RunState {
  const cmd = COMMANDER_MAP[commander];
  const rng = new Rng(seed);
  const bossPool = ['a1b_raid', 'a1b_monument'];
  const bosses = [rng.pick(bossPool), 'a2b_wither', 'a3b_dragon'];
  const hearts = cmd.hearts - (omen >= 3 ? 1 : 0);
  const s: RunState = {
    v: RUN_VERSION,
    seed,
    rng: rng.s,
    commander,
    omen,
    act: 1,
    map: generateMap(rng.fork(1), 1, bosses[0], omen),
    nodeId: null,
    visited: [],
    done: [],
    hearts,
    maxHearts: hearts,
    emeralds: cmd.emeralds,
    team: [],
    bench: [],
    slots: 3,
    benchSize: 4,
    relics: [],
    potions: [],
    potionSlots: (commander === 'witch' ? 5 : 4) - (omen >= 3 ? 1 : 0),
    pity: 0,
    elytraAct: 0,
    queue: [],
    stats: {
      battlesWon: 0, battlesLost: 0, elitesWon: 0, bossesWon: 0, crates: 0,
      pulls: { blue: 0, purple: 0, pink: 0, red: 0, gold: 0 },
      emeraldsEarned: 0, damage: 0, nodes: 0, starUps: 0, mvp: {}, startTime: Date.now(),
    },
    bosses,
    usedEnc: [],
    uidSeq: 1,
    armed: [],
    over: false,
    won: false,
    toasts: [],
  };
  if (commander === 'witch') withRng(s, (r) => s.potions.push(rollItem(r, { potionOnly: true }), rollItem(r, { potionOnly: true })));
  s.queue.push({ type: 'starter', idx: 0, crates: STARTERS[commander] ?? STARTERS.steve });
  return s;
}

const FRONT = ['zombie', 'spider', 'slime', 'wolf', 'goat', 'husk', 'polar_bear', 'vindicator', 'armadillo', 'frostbite'];
const RANDOM = ['zombie', 'skeleton', 'spider', 'slime', 'wolf', 'snow_golem', 'silverfish', 'goat', 'creeper', 'witch', 'pillager', 'husk', 'cave_spider', 'drowned', 'polar_bear', 'vindicator', 'bogged', 'armadillo', 'frostbite', 'parched'];

/**
 * Each commander opens with crates that suit how they play: Steve's ranged squads want his
 * platforms, Alex starts with beasts, the Villager with village guards and illagers (raid
 * combos), the Witch with poisoners and undead (her potions heal them).
 */
export const STARTERS: Record<string, { crate: string; label: string; pool: string[] }[]> = {
  steve: [
    { crate: 'origin', label: '前排补给', pool: FRONT },
    { crate: 'origin', label: '远程补给', pool: ['skeleton', 'snow_golem', 'pillager', 'stray', 'witch', 'bogged', 'parched'] },
    { crate: 'origin', label: '远程补给', pool: ['skeleton', 'snow_golem', 'pillager', 'stray', 'witch', 'bogged', 'parched'] },
  ],
  alex: [
    { crate: 'wild', label: '野兽补给', pool: ['wolf', 'goat', 'polar_bear', 'armadillo', 'sniffer'] },
    { crate: 'wild', label: '节肢补给', pool: ['spider', 'cave_spider', 'bee', 'silverfish', 'endermite'] },
    { crate: 'origin', label: '随机补给', pool: RANDOM },
  ],
  villager: [
    { crate: 'illager', label: '村庄卫队', pool: ['snow_golem', 'wolf', 'goat', 'polar_bear'] },
    { crate: 'illager', label: '灾厄补给', pool: ['pillager', 'vindicator', 'witch', 'creeper'] },
    { crate: 'origin', label: '随机补给', pool: RANDOM },
  ],
  witch: [
    { crate: 'undead', label: '亡灵补给', pool: ['zombie', 'skeleton', 'husk', 'drowned', 'stray', 'frostbite'] },
    { crate: 'wild', label: '毒虫补给', pool: ['cave_spider', 'bee', 'spider', 'slime', 'bogged'] },
    { crate: 'origin', label: '随机补给', pool: RANDOM },
  ],
};

/** Rolls the next starter crate. Starter pools only contain blue/purple and never repeat a mob. */
export function rollStarter(s: RunState): Pending {
  const p = s.queue[0];
  if (p.type !== 'starter') throw new Error('not starter');
  const def = p.crates[p.idx];
  const owned = allCards(s).map((c) => c.mob);
  const options = def.pool.filter((m) => MOB_MAP[m] && !owned.includes(m));
  const result = withRng(s, (r) => {
    const purple = r.chance(0.3);
    const want: Rarity = purple ? 'purple' : 'blue';
    let cand = options.filter((m) => MOB_MAP[m].rarity === want);
    if (!cand.length) cand = options;
    const mob = r.pick(cand);
    return { mob, rarity: MOB_MAP[mob].rarity, lucky: false };
  });
  return { type: 'open', seq: s.uidSeq++, crate: def.crate, grade: 'starter', result, title: def.label };
}

export function finishStarterOpen(s: RunState) {
  const p = s.queue[0];
  if (p.type !== 'starter') return;
  p.idx++;
  if (p.idx >= p.crates.length) {
    s.queue.shift();
    s.queue.unshift({ type: 'act_intro', act: 1 });
  }
}

// ───────────────────────── map ─────────────────────────

export function availableNodes(s: RunState): MapNode[] {
  const nodes = s.map.nodes;
  if (!s.nodeId) return Object.values(nodes).filter((n) => n.row === 0);
  const cur = nodes[s.nodeId];
  if (cur.type === 'boss') return [];
  const normal = cur.next.map((id) => nodes[id]);
  if (hasRelic(s, 'elytra') && s.elytraAct !== s.act && cur.row + 1 < s.map.rows) {
    return Object.values(nodes).filter((n) => n.row === cur.row + 1);
  }
  return normal;
}

export function enterNode(s: RunState, id: string) {
  const node = s.map.nodes[id];
  const avail = availableNodes(s);
  if (!avail.find((n) => n.id === id)) throw new Error('node not available');
  if (s.nodeId && !s.map.nodes[s.nodeId].next.includes(id)) s.elytraAct = s.act;
  s.nodeId = id;
  s.visited.push(id);
  s.stats.nodes++;
  switch (node.type) {
    case 'battle':
    case 'elite':
    case 'boss':
      s.queue.push(makeBattle(s, node));
      break;
    case 'rift':
      s.queue.push(makeRiftBattle(s));
      break;
    case 'shop':
      s.queue.push({ type: 'shop', stock: genShop(s), reroll: 15, orders: s.commander === 'villager' ? (hasRelic(s, 'trading_post') ? 2 : 1) : undefined });
      break;
    case 'rest':
      s.queue.push({ type: 'rest', actions: hasRelic(s, 'crafting_table') ? 2 : 1, done: [] });
      break;
    case 'treasure':
      enterTreasure(s);
      break;
    case 'event':
      enterEvent(s);
      break;
  }
}

function pickEncounter(s: RunState, kind: 'battle' | 'elite', row: number): EncounterDef {
  return withRng(s, (r) => {
    let pool = ENCOUNTERS.filter((e) => e.act === s.act && e.kind === kind);
    if (kind === 'battle') {
      const tier = tierForRow(row);
      pool = pool.filter((e) => e.tier === tier);
    }
    const fresh = pool.filter((e) => !s.usedEnc.includes(e.id));
    const pick = r.pick(fresh.length ? fresh : pool);
    s.usedEnc.push(pick.id);
    return pick;
  });
}

/** Per omen level, on top of each level's rules (see OMEN_SCALING). */
const OMEN_HP = 0.03;
const OMEN_ATK = 0.02;

export function enemyMuls(s: RunState, kind: 'battle' | 'elite' | 'boss' | 'event', row: number) {
  const sc = enemyScale(s.act, row, kind);
  // Each omen level's own rules change how the run plays; on top, enemies get a little tougher.
  let hp = sc * (1 + OMEN_HP * s.omen);
  let atk = sc * (1 + OMEN_ATK * s.omen);
  if (hasRelic(s, 'ominous_bottle')) {
    hp *= 1.12;
    atk *= 1.12;
  }
  return { hp, atk };
}

function makeBattle(s: RunState, node: MapNode): Pending {
  const kind = node.type as 'battle' | 'elite' | 'boss';
  // A chain-made ambush takes the place of the next ordinary fight.
  const am = s.ambush;
  if (kind === 'battle' && am && am.act === s.act && node.row >= am.minRow) {
    s.ambush = undefined;
    const p = makeEventBattle(s, am.enc, am.onWin);
    if (p.type === 'battle') {
      p.name = am.name;
      p.desc = am.desc;
    }
    return p;
  }
  const enc = kind === 'boss' ? ENC_MAP[s.bosses[s.act - 1]] : pickEncounter(s, kind, node.row);
  const cards = enc.cards.map((c) => c.slice() as EncCard);
  // 不祥之兆 II: elites get an affix. III: one enchanted card in normal fights. IV: also in elite and boss fights.
  const affix = kind === 'elite' && s.omen >= 2 ? withRng(s, (r) => r.pick(AFFIXES).id) : undefined;
  if (kind === 'battle' && s.omen >= 3) enchantEnemies(s, cards, 1, 2);
  else if ((kind === 'elite' || kind === 'boss') && s.omen >= 4) enchantEnemies(s, cards, 1, 2);
  const m = enemyMuls(s, kind, node.row);
  const biome = kind === 'boss' ? BOSS_BIOME[enc.id] ?? 'plains' : withRng(s, (r) => pickBiome(r, s.act, node.row));
  return {
    type: 'battle', kind, enc: enc.id, name: enc.name, desc: enc.desc, cards, hpMul: m.hp, atkMul: m.atk, affix,
    seed: withRng(s, (r) => r.int(1, 2 ** 31)), attempt: 1, biome, tseed: withRng(s, (r) => r.int(1, 2 ** 31)), brew: brewFor(s),
  };
}

/** Gives n random enemy cards (never the boss or a structure) a fitting enchantment. */
function enchantEnemies(s: RunState, cards: EncCard[], n: number, lv: number) {
  withRng(s, (r) => {
    const idx = r.shuffle(cards.map((_, i) => i).filter((i) => !mobDef(cards[i][0]).boss && !mobDef(cards[i][0]).structure && !cards[i][4]));
    for (const i of idx.slice(0, n)) {
      const mob = cards[i][0];
      const c = cards[i];
      cards[i] = [mob, c[1], c[2], c[3], r.pick(ENEMY_ENCHANTS.filter((e) => enchantFits(mob, e))), lv];
    }
  });
}

/** The Witch's cauldron: free potions for one fight (more with the brewing stand). */
function brewFor(s: RunState): string[] | undefined {
  if (s.commander !== 'witch') return undefined;
  const n = 1 + (hasRelic(s, 'brewing_stand') ? 1 : 0);
  return withRng(s, (r) => Array.from({ length: n }, () => rollItem(r, { potionOnly: true })));
}

export function makeEventBattle(s: RunState, encId: string, onWin: string, biome?: string): Pending {
  const enc = ENC_MAP[encId];
  const row = s.nodeId ? s.map.nodes[s.nodeId].row : 0;
  const m = enemyMuls(s, 'event', row);
  // Sift creatures fight on Sift ground, wherever the rift opened.
  const sift = !biome && enc.cards.some(([id]) => mobDef(id).families.includes('sift'));
  return {
    type: 'battle', kind: 'event', enc: enc.id, name: enc.name, cards: enc.cards.slice(), hpMul: m.hp, atkMul: m.atk,
    seed: withRng(s, (r) => r.int(1, 2 ** 31)), attempt: 1, onWin,
    biome: biome ?? withRng(s, (r) => (sift ? r.pick(SIFT_BIOMES) : pickBiome(r, s.act, row))), tseed: withRng(s, (r) => r.int(1, 2 ** 31)), brew: brewFor(s),
  };
}

/** A rift node: a Sift fight scaled to the current act. */
function makeRiftBattle(s: RunState): Pending {
  const enc = withRng(s, (r) => r.pick(riftEncounters(s.act)));
  const p = makeEventBattle(s, enc.id, 'rift_node');
  if (p.type === 'battle') p.desc = '裂隙另一侧的筛界生物察觉到了你。胜利后可以开启一个「裂隙」补给箱。';
  return p;
}

/** Turns down the rift after the dragon: the run ends in victory. */
export function declineRift(s: RunState) {
  if (s.queue[0]?.type === 'act_intro') s.queue[0] = { type: 'victory' };
}

// ───────────────────────── battles ─────────────────────────

const terrainCache = new Map<string, Terrain>();
export function battleTerrain(p: Extract<Pending, { type: 'battle' }>): Terrain {
  const key = `${p.biome ?? 'plains'}:${p.tseed ?? p.seed}`;
  let t = terrainCache.get(key);
  if (!t) {
    t = generateTerrain(p.biome ?? 'plains', p.tseed ?? p.seed);
    if (terrainCache.size > 8) terrainCache.clear();
    terrainCache.set(key, t);
  }
  return t;
}

export function battleConfig(s: RunState, p: Extract<Pending, { type: 'battle' }>, headless = false): BattleConfig {
  const player = buildSide(
    s.team.map((c) => ({ mob: c.mob, star: c.star, row: c.row, enchant: c.enchant, enchantLv: c.enchantLv, bonus: c.bonus, uid: c.uid, anchor: p.deploy?.[c.uid] })),
    { relics: s.relics, potions: [], commander: s.commander, act: s.act, builds: p.build },
  );
  const enemy = buildSide(
    p.cards.map(([mob, star, row, count, enchant, enchantLv]) => ({ mob, star, row: row ?? mobDef(mob).defaultRow, count, enchant, enchantLv })),
    { relics: [], potions: [], act: s.act, hpMul: p.hpMul, atkMul: p.atkMul, affix: p.affix, flags: p.kind === 'boss' && s.omen >= 5 ? ['omen_enrage'] : undefined },
  );
  if (p.bossHp !== undefined) for (const c of enemy.cards) if (mobDef(c.mob).boss) c.startHp = p.bossHp;
  return { seed: p.seed, sides: [player, enemy], boss: p.kind === 'boss', headless, terrain: battleTerrain(p) };
}

export function setDeploy(s: RunState, uid: string, pos: [number, number] | null) {
  const p = s.queue[0];
  if (p?.type !== 'battle') return;
  p.deploy = { ...(p.deploy ?? {}) };
  if (pos) p.deploy[uid] = pos;
  else delete p.deploy[uid];
}

/** Steve's deployment builds (replaced as a whole list). */
export function setBuilds(s: RunState, builds: BuildOrder[]) {
  const p = s.queue[0];
  if (p?.type === 'battle') p.build = builds.slice();
}

/** Emeralds the Villager pays to hire a golem in this act (0 with the bell tower). */
export function golemCost(s: RunState) {
  return hasRelic(s, 'bell_tower') ? 0 : 25 + 15 * (s.act - 1);
}

export function toggleArmed(s: RunState, potion: string) {
  if (s.armed.includes(potion)) s.armed = s.armed.filter((x) => x !== potion);
  else if (s.potions.includes(potion)) s.armed.push(potion);
}

function battleEmeralds(s: RunState, kind: string, row: number, r: Rng) {
  const am = [1, 1, 1.3, 1.6, 1.9][s.act] ?? 1.9;
  let e = 0;
  if (kind === 'battle' || kind === 'event') e = (12 + row * 0.6 + r.int(0, 5)) * am;
  else if (kind === 'elite') e = (28 + r.int(0, 10)) * am;
  else e = 70 * am;
  if (s.commander === 'steve') e += 4;
  if (s.chains?.banner === 1) e *= 1.25;
  if (hasRelic(s, 'emerald_block')) e += 8;
  if (hasRelic(s, 'ominous_bottle')) e *= 1.3;
  return Math.round(e);
}

export function gainEmeralds(s: RunState, n: number) {
  s.emeralds += n;
  if (n > 0) s.stats.emeraldsEarned += n;
}

export function resolveBattle(s: RunState, res: BattleResult) {
  const p = s.queue[0];
  if (p.type !== 'battle') throw new Error('no battle');
  const win = res.winner === 0;
  // Items used during the fight are gone, win or lose.
  for (const a of res.itemsUsed ?? []) {
    const i = s.potions.indexOf(a);
    if (i >= 0) s.potions.splice(i, 1);
  }
  // The hired golem is paid for afterwards (the button needs the money up front).
  const golems = (res.skillsUsed ?? []).filter((k) => k === 'golem').length;
  const golemPaid = Math.min(s.emeralds, golems * golemCost(s));
  s.emeralds -= golemPaid;
  s.armed = [];
  const summary: BattleSummary = {
    win,
    time: res.time,
    cards: res.cards.map((c) => ({ mob: c.mob, star: c.star, team: c.team, dmg: c.dmg, kills: c.kills, heal: c.heal, taken: c.taken, alive: c.alive, spawned: c.spawned })),
  };
  for (const c of res.cards)
    if (c.team === 0) {
      s.stats.damage += c.dmg;
      s.stats.mvp[c.mob] = (s.stats.mvp[c.mob] ?? 0) + c.dmg;
    }
  const row = s.nodeId ? s.map.nodes[s.nodeId].row : 0;
  s.queue.shift();
  const follow: Pending[] = [];
  if (win) {
    s.stats.battlesWon++;
    const em = withRng(s, (r) => battleEmeralds(s, p.kind, row, r)) + res.emeralds;
    gainEmeralds(s, em);
    let potion: string | undefined;
    let missed: string | undefined;
    const dropChance = p.kind === 'elite' ? 0.75 : p.kind === 'boss' ? 1 : 0.35;
    const boost = p.kind === 'boss' ? 1 : p.kind === 'elite' ? 0.6 : 0;
    if (!hasRelic(s, 'dragon_breath'))
      withRng(s, (r) => {
        if (r.chance(dropChance)) {
          const it = rollItem(r, { boost });
          if (s.potions.length < s.potionSlots) {
            potion = it;
            s.potions.push(it);
          } else missed = it;
        }
      });
    const capture = s.commander === 'alex' && res.tamed?.length ? [...new Set(res.tamed)] : undefined;
    follow.push({ type: 'result', win, kind: p.kind, emeralds: em, heartsLost: 0, potion, missed, capture, golemCost: golemPaid || undefined, summary });
    const nOffers = 3 + (hasRelic(s, 'compass') ? 1 : 0);
    if (p.kind === 'battle') follow.push({ type: 'crates', title: '战利品：选择一个补给箱', offers: crateOffers(s, nOffers, 'normal'), skip: 10 });
    else if (p.kind === 'elite') {
      s.stats.elitesWon++;
      follow.push({ type: 'crates', title: '精英战利品：选择一个精良补给箱', offers: crateOffers(s, nOffers, 'elite'), skip: 15 });
      if (hasRelic(s, 'trial_key')) follow.push({ type: 'crates', title: '试炼钥匙：额外开箱', offers: crateOffers(s, 2, 'elite'), skip: 15 });
      follow.push({ type: 'relic_choice', title: '选择一件宝物', choices: relicChoices(s, 3, ['common', 'rare', 'legendary']), skippable: true });
    } else if (p.kind === 'boss') {
      s.stats.bossesWon++;
      follow.push({ type: 'crates', title: '首领战利品：传奇补给箱', offers: crateOffers(s, nOffers, 'boss'), skip: 20 });
      const slotGained = s.act < 3;
      if (slotGained) s.slots = Math.min(5, s.slots + 1);
      const healed = Math.min(2, s.maxHearts - s.hearts);
      s.hearts += healed;
      follow.push({ type: 'boss_reward', relics: relicChoices(s, 3, ['boss']), slotGained, healed });
      // After the dragon the rift to the Sift opens: an optional fourth act.
      if (s.act < 4) follow.push({ type: 'act_intro', act: s.act + 1 });
      else follow.push({ type: 'victory' });
    } else if (p.kind === 'event' && p.onWin) {
      follow.push(...eventWinRewards(s, p.onWin));
    }
  } else {
    s.stats.battlesLost++;
    const lost = p.kind === 'battle' || p.kind === 'event' ? 1 : 2;
    s.hearts -= lost;
    const em = 6;
    gainEmeralds(s, em);
    let totem = false;
    if (s.hearts <= 0 && hasRelic(s, 'totem')) {
      s.relics = s.relics.filter((r) => r !== 'totem');
      s.hearts = 2;
      totem = true;
    }
    follow.push({ type: 'result', win, kind: p.kind, emeralds: em, heartsLost: lost, summary, totem, golemCost: golemPaid || undefined });
    // Falling in the Sift still ends the run as the dragon slayer.
    if (s.hearts <= 0) follow.push({ type: s.act >= 4 ? 'victory' : 'defeat' });
    else if (p.kind === 'boss') {
      const start = p.bossHp ?? 1;
      const end = res.bossHp ?? start;
      const bossHp = Math.max(0.35, start - 0.5 * Math.max(0, start - end));
      follow.push({ ...p, seed: withRng(s, (r) => r.int(1, 2 ** 31)), attempt: p.attempt + 1, bossHp });
    }
  }
  s.queue.unshift(...follow);
}

export function crateOffers(s: RunState, n: number, grade: CrateGrade): CrateOffer[] {
  return withRng(s, (r) => {
    const avail = r.shuffle(cratesForAct(s.act).slice());
    const fams = new Set(s.team.flatMap((c) => mobDef(c.mob).families));
    const out: CrateOffer[] = [];
    const themed = avail.find((c) => c.theme.some((t) => fams.has(t)));
    if (themed) out.push({ crate: themed.id, grade });
    for (const c of avail) {
      if (out.length >= n) break;
      if (!out.find((o) => o.crate === c.id)) out.push({ crate: c.id, grade });
    }
    if (grade === 'boss' || (grade === 'elite' && r.chance(0.15))) out[out.length - 1] = { crate: 'ominous', grade };
    return r.shuffle(out);
  });
}

/** Commander-exclusive relics only show up in that commander's runs. */
export function relicFor(s: RunState, id: string) {
  const c = RELIC_MAP[id]?.commander;
  return !c || c === s.commander;
}

export function relicChoices(s: RunState, n: number, tiers: RelicTier[]): string[] {
  return withRng(s, (r) => {
    const out: string[] = [];
    for (let i = 0; i < n * 4 && out.length < n; i++) {
      let tier: RelicTier;
      if (tiers.length === 1) tier = tiers[0];
      else tier = r.weighted(tiers, tiers.map((t) => (t === 'common' ? 52 : t === 'rare' ? 38 : 10)));
      const pool = RELICS.filter((x) => x.tier === tier && !s.relics.includes(x.id) && !out.includes(x.id) && relicFor(s, x.id));
      if (pool.length) out.push(r.pick(pool).id);
    }
    return out;
  });
}

// ───────────────────────── crates & cards ─────────────────────────

export function chooseCrate(s: RunState, idx: number) {
  const p = s.queue[0];
  if (p.type !== 'crates') return;
  const offer = p.offers[idx];
  const rolled = { ...(p.rolled ?? {}) };
  s.queue.shift();
  const open = openCrate(s, offer.crate, offer.grade, undefined, rolled[idx]);
  if (open.type === 'open') {
    rolled[idx] = open.result;
    open.from = { offers: p.offers, title: p.title, skip: p.skip, idx, rolled };
  }
  s.queue.unshift(open);
}

/** Back from an unopened crate to the crate choice. */
export function backToCrates(s: RunState) {
  const p = s.queue[0];
  if (p.type !== 'open' || !p.from || p.applied) return;
  s.queue.shift();
  s.queue.unshift({ type: 'crates', title: p.from.title, offers: p.from.offers, skip: p.from.skip, rolled: p.from.rolled });
}

export function skipCrates(s: RunState) {
  const p = s.queue[0];
  if (p.type !== 'crates') return;
  gainEmeralds(s, p.skip);
  s.queue.shift();
}

export function openCrate(s: RunState, crate: string, grade: CrateGrade, title?: string, preset?: OpenResult): Pending {
  const result = preset ?? withRng(s, (r) => rollCrate(r, CRATE_MAP[crate], grade, openContext(s)));
  return { type: 'open', seq: s.uidSeq++, crate, grade, result, title };
}

export type GainOutcome =
  | { kind: 'merge'; card: Card; starUp: boolean }
  | { kind: 'dust'; emeralds: number }
  | { kind: 'team' | 'bench'; card: Card }
  | { kind: 'decide' };

/** Applies an opened mob to the collection, merging duplicates into stars. */
export function gainCard(s: RunState, mob: string, fromCrate = true): GainOutcome {
  const rarity = mobDef(mob).rarity;
  if (fromCrate) {
    s.stats.crates++;
    s.stats.pulls[rarity]++;
    if (rarity === 'red' || rarity === 'gold') s.pity = 0;
    else s.pity++;
  }
  const existing = allCards(s).find((c) => c.mob === mob);
  if (existing) {
    if (existing.star >= 3) {
      const em = Math.round(dustValue(mob, 3) * 0.5);
      gainEmeralds(s, em);
      return { kind: 'dust', emeralds: em };
    }
    existing.shards++;
    let starUp = false;
    if (existing.shards >= shardsNeeded(existing.star)) {
      existing.star = (existing.star + 1) as 2 | 3;
      existing.shards = 0;
      starUp = true;
      s.stats.starUps++;
    }
    return { kind: 'merge', card: existing, starUp };
  }
  if (s.team.length < s.slots) {
    const c = newCard(s, mob);
    s.team.push(c);
    return { kind: 'team', card: c };
  }
  if (s.bench.length < s.benchSize) {
    const c = newCard(s, mob);
    s.bench.push(c);
    return { kind: 'bench', card: c };
  }
  return { kind: 'decide' };
}

/** Applies the opened mob (idempotent): called by the UI at the reveal moment. */
export function applyOpen(s: RunState): GainOutcome {
  const p = s.queue[0];
  if (p.type !== 'open') throw new Error('no open');
  if (!p.applied) p.applied = gainCard(s, p.result.mob);
  return p.applied;
}

/** Leaves the reveal screen and queues any follow-up decision. */
export function finishOpen(s: RunState) {
  const p = s.queue[0];
  if (p.type !== 'open') return;
  const out = applyOpen(s);
  s.queue.shift();
  if (out.kind === 'decide') s.queue.unshift({ type: 'card_decide', mob: p.result.mob, star: 1, dust: dustValue(p.result.mob, 1) });
  if (s.queue[0]?.type === 'starter') finishStarterOpen(s);
}

export function resolveOpen(s: RunState): GainOutcome {
  const out = applyOpen(s);
  finishOpen(s);
  return out;
}

/** Card decision when both team and bench are full: replace `uid` (it gets decomposed) or decompose the new card. */
export function decideCard(s: RunState, replaceUid: string | null) {
  const p = s.queue[0];
  if (p.type !== 'card_decide') return;
  s.queue.shift();
  if (!replaceUid) {
    gainEmeralds(s, p.dust);
    toast(s, `分解 ${mobDef(p.mob).name}，获得 ${p.dust} 绿宝石`, 'neutral');
    return;
  }
  const old = findCard(s, replaceUid)!;
  gainEmeralds(s, dustValue(old.mob, old.star));
  const card = newCard(s, p.mob);
  const ti = s.team.findIndex((c) => c.uid === replaceUid);
  if (ti >= 0) {
    card.row = old.row;
    s.team[ti] = card;
  } else {
    const bi = s.bench.findIndex((c) => c.uid === replaceUid);
    s.bench[bi] = card;
  }
  toast(s, `分解 ${mobDef(old.mob).name}，获得 ${Math.round(dustValue(old.mob, old.star))} 绿宝石`, 'neutral');
}

export function decompose(s: RunState, uid: string) {
  const c = findCard(s, uid);
  if (!c) return;
  if (s.team.length <= 1 && s.team.includes(c)) return;
  gainEmeralds(s, Math.round(dustValue(c.mob, c.star)));
  s.team = s.team.filter((x) => x.uid !== uid);
  s.bench = s.bench.filter((x) => x.uid !== uid);
}

export function moveCard(s: RunState, uid: string, to: 'team' | 'bench', swapWith?: string) {
  const inTeam = s.team.find((c) => c.uid === uid);
  const inBench = s.bench.find((c) => c.uid === uid);
  if (swapWith) {
    const a = s.team.findIndex((c) => c.uid === (inTeam ? uid : swapWith));
    const b = s.bench.findIndex((c) => c.uid === (inTeam ? swapWith : uid));
    if (a < 0 || b < 0) return;
    const tc = s.team[a];
    const bc = s.bench[b];
    bc.row = tc.row;
    s.team[a] = bc;
    s.bench[b] = tc;
    return;
  }
  if (to === 'bench' && inTeam && s.bench.length < s.benchSize && s.team.length > 1) {
    s.team = s.team.filter((c) => c !== inTeam);
    s.bench.push(inTeam);
  } else if (to === 'team' && inBench && s.team.length < s.slots) {
    s.bench = s.bench.filter((c) => c !== inBench);
    s.team.push(inBench);
  }
}

export function setRow(s: RunState, uid: string, row: Row) {
  const c = findCard(s, uid);
  if (c) c.row = row;
}

/** Smithing raises any card to ★2; ★3 needs duplicates for 隐秘级 and 罕见特殊. */
export function canSmith(c: Card) {
  if (c.star >= 3) return false;
  return c.star < 2 || RARITIES.indexOf(mobDef(c.mob).rarity) < 3;
}

export function upgradeCard(s: RunState, uid: string) {
  const c = findCard(s, uid);
  if (!c || c.star >= 3) return false;
  c.star = (c.star + 1) as 2 | 3;
  c.shards = 0;
  s.stats.starUps++;
  return true;
}

/**
 * Puts an enchantment on a card: the same one again merges into a higher level (max III),
 * a different one replaces it. Returns true when it merged.
 */
export function applyEnchant(c: Card, enchant: string, lv: number): boolean {
  if (c.enchant === enchant) {
    c.enchantLv = Math.min(3, (c.enchantLv ?? 2) + lv);
    return true;
  }
  c.enchant = enchant;
  c.enchantLv = Math.max(1, Math.min(3, lv));
  return false;
}

/** Level of a book found in this act: mostly I, more often II later on. */
export function bookLevel(s: RunState, r: Rng): number {
  const p2 = [0, 0.1, 0.3, 0.5, 0.6][s.act] ?? 0.5;
  return r.chance(p2) ? 2 : 1;
}

export function enchantCard(s: RunState, uid: string, enchant: string) {
  const c = findCard(s, uid);
  if (c) c.enchant = enchant;
}

export function enchantFits(mob: string, enchant: string) {
  const e = ENCHANT_MAP[enchant];
  if (!e?.only) return true;
  const ranged = mobDef(mob).range >= 60;
  if (e.id === 'multishot' && !mobDef(mob).projectile) return false;
  return e.only === 'ranged' ? ranged : !ranged;
}

// ───────────────────────── relics ─────────────────────────

export function gainRelic(s: RunState, id: string) {
  if (s.relics.includes(id)) return;
  s.relics.push(id);
  if (id === 'golden_apple') {
    s.maxHearts++;
    s.hearts = Math.min(s.maxHearts, s.hearts + 1);
  }
  if (id === 'respawn_anchor') {
    s.maxHearts = Math.max(1, s.maxHearts - 1);
    s.hearts = Math.min(s.hearts, s.maxHearts);
  }
  if (id === 'dragon_breath') s.potionSlots++;
  toast(s, `获得宝物「${RELIC_MAP[id].name}」`, 'gold');
}

export function chooseRelic(s: RunState, id: string | null) {
  const p = s.queue[0];
  if (p.type !== 'relic_choice' && p.type !== 'boss_reward') return;
  s.queue.shift();
  if (id) gainRelic(s, id);
}

// ───────────────────────── shop ─────────────────────────

function genShop(s: RunState): ShopItem[] {
  const pm = priceMul(s);
  const price = (n: number) => Math.round(n * pm);
  return withRng(s, (r) => {
    const items: ShopItem[] = [];
    const crates = r.shuffle(cratesForAct(s.act).slice());
    items.push({ id: 'c1', kind: 'crate', ref: crates[0].id, grade: 'normal', price: price(48), sold: false });
    items.push({ id: 'c2', kind: 'crate', ref: crates[1].id, grade: 'normal', price: price(48), sold: false });
    items.push({ id: 'c3', kind: 'crate', ref: crates[2]?.id ?? crates[0].id, grade: 'premium', price: price(115), sold: false });
    // Battle items: one of each tier (rare 50% of the time), so the shelf always has something affordable.
    const tiers: ItemTier[] = ['common', 'common', 'uncommon', r.chance(0.5) ? 'rare' : 'uncommon'];
    const picked: string[] = [];
    tiers.forEach((t, i) => {
      const pool = ITEMS.filter((x) => x.tier === t && !picked.includes(x.id));
      if (!pool.length) return;
      const it = r.pick(pool);
      picked.push(it.id);
      items.push({ id: `p${i}`, kind: 'potion', ref: it.id, price: price(it.price), sold: false });
    });
    const books = r.shuffle(ENCHANTS.slice()).slice(0, 2);
    books.forEach((b, i) => {
      const level = bookLevel(s, r);
      items.push({ id: `e${i}`, kind: 'enchant', ref: b.id, level, price: price(level >= 2 ? 85 : 50), sold: false });
    });
    const nRelic = 2 + (hasRelic(s, 'gold_ingot') ? 1 : 0);
    const taken: string[] = [];
    for (let i = 0; i < nRelic; i++) {
      const tier = r.weighted<RelicTier>(['common', 'rare', 'legendary'], [55, 35, 10]);
      const pool = RELICS.filter((x) => x.tier === tier && !s.relics.includes(x.id) && !taken.includes(x.id) && relicFor(s, x.id));
      if (!pool.length) continue;
      const rel = r.pick(pool);
      taken.push(rel.id);
      items.push({ id: `r${i}`, kind: 'relic', ref: rel.id, price: price(RELIC_TIER_INFO[tier].price), sold: false });
    }
    items.push({ id: 'heal', kind: 'heal', ref: 'golden_carrot', price: price(50), sold: false });
    items.push({ id: 'up', kind: 'upgrade', ref: 'smithing', price: price(130), sold: false });
    return items;
  });
}

export function buyItem(s: RunState, itemId: string): boolean {
  const p = s.queue[0];
  if (p.type !== 'shop') return false;
  const it = p.stock.find((x) => x.id === itemId);
  if (!it || it.sold || s.emeralds < it.price) return false;
  switch (it.kind) {
    case 'crate':
      s.queue.unshift(openCrate(s, it.ref, it.grade!, '商店补给箱'));
      break;
    case 'potion':
      if (s.potions.length >= s.potionSlots) return false;
      s.potions.push(it.ref);
      break;
    case 'relic':
      gainRelic(s, it.ref);
      break;
    case 'enchant':
      s.queue.unshift({ type: 'pick_card', purpose: 'enchant', title: `选择要附魔「${enchantName(it.ref, it.level ?? 1)}」的卡牌`, enchant: it.ref, data: { price: it.price, lv: it.level ?? 1 } });
      break;
    case 'heal':
      if (s.hearts >= s.maxHearts) return false;
      s.hearts++;
      break;
    case 'upgrade':
      if (!allCards(s).some((c) => c.star === 1)) return false;
      s.queue.unshift({ type: 'pick_card', purpose: 'upgrade', title: '选择要锻造升星的 ★1 卡牌', data: { price: it.price, maxStar: 1 } });
      break;
  }
  s.emeralds -= it.price;
  it.sold = true;
  return true;
}

export function rerollShop(s: RunState) {
  const p = s.queue[0];
  if (p.type !== 'shop' || s.emeralds < p.reroll) return;
  s.emeralds -= p.reroll;
  p.reroll += 10;
  const keepServices = p.stock.filter((x) => x.kind === 'heal' || x.kind === 'upgrade');
  p.stock = [...genShop(s).filter((x) => x.kind !== 'heal' && x.kind !== 'upgrade'), ...keepServices];
}

/** Half the shop price back for an inventory item (shops only). */
export function sellValue(id: string) {
  return Math.max(5, Math.round((ITEM_MAP[id]?.price ?? 20) * 0.5));
}

export function sellItem(s: RunState, idx: number) {
  const p = s.queue[0];
  if (p?.type !== 'shop' || idx < 0 || idx >= s.potions.length) return;
  const [id] = s.potions.splice(idx, 1);
  gainEmeralds(s, sellValue(id));
}

export function discardItem(s: RunState, idx: number) {
  if (idx >= 0 && idx < s.potions.length) s.potions.splice(idx, 1);
}

/** Alex keeps one tamed mob as a ★1 card (duplicates merge into stars as usual). */
export function captureTamed(s: RunState, mob: string): GainOutcome | null {
  const p = s.queue[0];
  if (p?.type !== 'result' || !p.capture?.includes(mob)) return null;
  p.capture = undefined;
  const out = gainCard(s, mob, false);
  if (out.kind === 'decide') s.queue.splice(1, 0, { type: 'card_decide', mob, star: 1, dust: dustValue(mob, 1) });
  else toast(s, `${mobDef(mob).name} 被收服了！`, 'gold');
  return out;
}

/** Mobs the Villager can order this act: everything in this act's crates up to 保密级. */
export function orderPool(s: RunState): string[] {
  const set = new Set<string>();
  for (const c of cratesForAct(s.act)) for (const r of ['blue', 'purple', 'pink'] as Rarity[]) for (const m of c.pool[r]) set.add(m);
  return [...set].sort((a, b) => RARITIES.indexOf(mobDef(a).rarity) - RARITIES.indexOf(mobDef(b).rarity));
}

export function orderPrice(s: RunState, mob: string) {
  const base = { blue: 50, purple: 85, pink: 150, red: 999, gold: 999 }[mobDef(mob).rarity];
  return Math.round(base * priceMul(s) * (hasRelic(s, 'trading_post') ? 0.7 : 1));
}

/** Villager: buys a specific mob; it arrives through the usual reveal (and merges if owned). */
export function orderMob(s: RunState, mob: string) {
  const p = s.queue[0];
  if (p?.type !== 'shop' || s.commander !== 'villager' || (p.orders ?? 0) <= 0) return false;
  if (!orderPool(s).includes(mob)) return false;
  const price = orderPrice(s, mob);
  if (s.emeralds < price) return false;
  s.emeralds -= price;
  p.orders = (p.orders ?? 0) - 1;
  s.queue.unshift({ type: 'open', seq: s.uidSeq++, crate: 'origin', grade: 'normal', result: { mob, rarity: mobDef(mob).rarity, lucky: false }, title: '订购送达' });
  return true;
}

/** Result screen: throw away an inventory item to take the drop that did not fit. */
export function swapLoot(s: RunState, idx: number) {
  const p = s.queue[0];
  if (p?.type !== 'result' || !p.missed || idx < 0 || idx >= s.potions.length) return;
  s.potions[idx] = p.missed;
  p.potion = p.missed;
  p.missed = undefined;
}

export function leaveNode(s: RunState) {
  s.queue.shift();
}

// ───────────────────────── pick card / enchant choice ─────────────────────────

export function pickCard(s: RunState, uid: string | null) {
  const p = s.queue[0];
  if (p.type !== 'pick_card') return;
  s.queue.shift();
  if (!uid) {
    // Cancelled: refund shop purchases.
    if (p.data?.price) {
      s.emeralds += Number(p.data.price);
      const shop = s.queue.find((q) => q.type === 'shop');
      if (shop && shop.type === 'shop') {
        const it = shop.stock.find((x) => x.sold && x.price === Number(p.data!.price) && (x.kind === p.purpose || (x.kind === 'enchant' && x.ref === p.enchant)));
        if (it) it.sold = false;
      }
    }
    return;
  }
  const c = findCard(s, uid)!;
  switch (p.purpose) {
    case 'enchant': {
      const lv = Number(p.data?.lv ?? 1);
      const merged = applyEnchant(c, p.enchant!, lv);
      toast(s, `${mobDef(c.mob).name} ${merged ? '附魔升级为' : '获得附魔'}「${enchantName(c.enchant!, c.enchantLv)}」`, 'good');
      break;
    }
    case 'upgrade':
      if (!canSmith(c)) return;
      upgradeCard(s, uid);
      toast(s, `${mobDef(c.mob).name} 升至 ★${c.star}`, 'gold');
      break;
    case 'bonus':
      c.bonus = (c.bonus ?? 0) + Number(p.data?.amount ?? 0.15);
      toast(s, `${mobDef(c.mob).name} 属性永久 +${Math.round(Number(p.data?.amount ?? 0.15) * 100)}%`, 'good');
      if (p.enchant) applyEnchant(c, p.enchant, Number(p.data?.lv ?? 1));
      break;
    case 'sacrifice': {
      // Anvil: sacrifice this card, then pick a target to upgrade.
      s.team = s.team.filter((x) => x.uid !== uid);
      s.bench = s.bench.filter((x) => x.uid !== uid);
      s.queue.unshift({ type: 'pick_card', purpose: 'upgrade', title: '选择要升星的卡牌' });
      break;
    }
    case 'trade': {
      const tier = RARITIES.indexOf(mobDef(c.mob).rarity);
      s.team = s.team.filter((x) => x.uid !== uid);
      s.bench = s.bench.filter((x) => x.uid !== uid);
      const grade: CrateGrade = tier === 0 ? 'elite' : 'boss';
      s.queue.unshift(openCrate(s, 'ominous', grade, '流浪商人的交易'));
      break;
    }
  }
}

export function chooseBook(s: RunState, enchant: string | null) {
  const p = s.queue[0];
  if (p.type !== 'enchant_choice') return;
  const lv = enchant ? (p.levels?.[p.books.indexOf(enchant)] ?? 1) : 1;
  s.queue.shift();
  if (!enchant) {
    if (p.cost) gainEmeralds(s, p.cost);
    return;
  }
  s.queue.unshift({ type: 'pick_card', purpose: 'enchant', title: `选择要附魔「${enchantName(enchant, lv)}」的卡牌`, enchant, data: { lv } });
}

export function randomBooks(s: RunState, n: number) {
  return withRng(s, (r) => r.shuffle(ENCHANTS.map((e) => e.id)).slice(0, n));
}

// ───────────────────────── rest ─────────────────────────

export function restHeal(s: RunState) {
  return s.omen >= 4 ? 1 : 2;
}

export function restAction(s: RunState, action: 'rest' | 'smith' | 'enchant') {
  const p = s.queue[0];
  if (p.type !== 'rest' || p.actions <= 0 || p.done.includes(action)) return;
  if (action === 'rest') {
    if (hasRelic(s, 'sculk_catalyst')) return;
    s.hearts = Math.min(s.maxHearts, s.hearts + restHeal(s));
  }
  p.actions--;
  p.done.push(action);
  if (action === 'smith') s.queue.unshift({ type: 'pick_card', purpose: 'upgrade', title: '锻造台：选择要升星的卡牌' });
  if (action === 'enchant') {
    const books = randomBooks(s, 3);
    s.queue.unshift({ type: 'enchant_choice', title: '附魔台：选择一本附魔书', books, cost: 0, levels: withRng(s, (r) => books.map(() => bookLevel(s, r))) });
  }
}

// ───────────────────────── treasure ─────────────────────────

function enterTreasure(s: RunState) {
  const em = withRng(s, (r) => r.int(22, 40));
  gainEmeralds(s, em);
  toast(s, `宝箱里有 ${em} 绿宝石`, 'good');
  s.queue.push({ type: 'crates', title: '宝箱：选择一个高级补给箱', offers: crateOffers(s, 2, 'premium'), skip: 15 });
  if (withRng(s, (r) => r.chance(0.3))) s.queue.push({ type: 'relic_choice', title: '宝箱底部还有……', choices: relicChoices(s, 2, ['common', 'rare']), skippable: true });
}

// ───────────────────────── events ─────────────────────────

function enterEvent(s: RunState) {
  const id = withRng(s, (r) => {
    const ok = (e: (typeof EVENTS)[number]) => e.acts.includes(s.act) && (!e.when || e.when(s));
    const pool = EVENTS.filter((e) => ok(e) && !s.usedEnc.includes(`ev:${e.id}`));
    // A chain waiting for its next chapter always comes first.
    const due = pool.filter((e) => e.priority);
    const pick = due.length ? r.pick(due) : r.pick(pool.length ? pool : EVENTS.filter(ok));
    s.usedEnc.push(`ev:${pick.id}`);
    return pick.id;
  });
  s.queue.push({ type: 'event', id, data: {} });
}

export function eventChoose(s: RunState, idx: number) {
  const p = s.queue[0];
  if (p.type !== 'event' || p.result) return;
  const ev = EVENT_MAP[p.id];
  const ch = ev.choices(s, p.data)[idx];
  if (!ch || ch.disabled) return;
  const out = withRng(s, (r) => ch.run(s, r, p.data));
  if (out.repeat) return;
  p.result = out.text;
  p.resultTone = out.tone ?? 'neutral';
  if (out.then?.length) s.queue.splice(1, 0, ...out.then);
}

export function eventWinRewards(s: RunState, key: string): Pending[] {
  const ev = EVENTS.find((e) => e.winRewards?.[key]);
  return ev ? withRng(s, (r) => ev.winRewards![key](s, r)) : [];
}

// ───────────────────────── act flow ─────────────────────────

export function startAct(s: RunState, act: number) {
  const p = s.queue[0];
  if (p?.type === 'act_intro') s.queue.shift();
  if (act === s.act && s.nodeId === null && Object.keys(s.map.nodes).length) return;
  s.act = act;
  if (!s.bosses[act - 1]) s.bosses[act - 1] = 'a4b_monstrosity';
  // 歌者 showed the way: an extra relic on arrival in the Sift.
  if (act === 4 && s.chains?.song === 3) {
    s.chains.song = 4;
    s.queue.push({ type: 'relic_choice', title: '歌者的指引', choices: relicChoices(s, 3, ['rare', 'legendary']), skippable: false });
  }
  // Chains don't follow you into the next dimension: a pending ambush is lost, the banner fades.
  if (s.ambush && s.ambush.act !== act) s.ambush = undefined;
  if (s.chains?.banner === 1) s.chains.banner = 3;
  s.map = withRng(s, (r) => generateMap(r.fork(act * 7919), act, s.bosses[act - 1], s.omen));
  s.nodeId = null;
  s.visited = [];
  s.done = [];
  s.usedEnc = s.usedEnc.filter((x) => x.startsWith('ev:'));
}

/** Runs node-completion hooks once when the queue drains after a node. */
export function settle(s: RunState) {
  if (s.queue.length || !s.nodeId || s.done.includes(s.nodeId)) return;
  s.done.push(s.nodeId);
  onNodeComplete(s);
}

/** Called when the queue empties after finishing a node. */
export function onNodeComplete(s: RunState) {
  if (s.commander === 'villager') {
    const ore = hasRelic(s, 'emerald_ore');
    const interest = Math.min(ore ? 30 : 15, Math.floor(s.emeralds * (ore ? 0.15 : 0.1)));
    if (interest > 0) {
      gainEmeralds(s, interest);
      toast(s, `利息 +${interest} 绿宝石`, 'good');
    }
  }
}

export function finishRun(s: RunState, won: boolean) {
  s.over = true;
  s.won = won;
}

export function runScore(s: RunState) {
  const st = s.stats;
  const actProgress = (s.act - 1) * 14 + (s.nodeId ? s.map.nodes[s.nodeId].row + 1 : 0);
  return Math.round(
    (actProgress * 10 + st.elitesWon * 30 + st.bossesWon * 120 + st.pulls.gold * 60 + st.pulls.red * 20 + (s.won ? 500 : 0)) * (1 + 0.2 * s.omen),
  );
}

export function potionDef(id: string) {
  return POTION_MAP[id];
}

export function itemDef(id: string) {
  return ITEM_MAP[id];
}
