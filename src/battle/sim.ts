// Deterministic fixed-step battle simulation. Pure logic, no DOM: the renderer reads state and
// consumes `events`; the balance scripts run it headless.
import { Rng } from '../core/rng.ts';
import type { DmgKind, Family, MobDef, ProjectileKind, Row } from '../core/types.ts';
import { mobDef, starStatMul } from '../data/mobs.ts';
import { BEHAVIORS, type Behavior } from './ai.ts';
import { applyItem } from './items.ts';
import { FORT_TAKEN, build, canTame, hireGolem, placeDispenser, tame, tickWalls, type SkillKind, type Wall } from './skills.ts';
import type { SkillId } from '../data/commanders.ts';
import { ITEM_MAP } from '../data/items.ts';
import { counterMul } from '../data/combos.ts';
import { P as TP, TAC, type Danger, dodgeStep, goalStep, kiteStep, pickTarget, planRanged, refreshTactics, retreatStep, startKite } from './tactics.ts';
import {
  BLOCK, FlowField, GW as TGW, S as TS, atkMul as terrainAtkMul, atkSpeedMul as terrainAtkSpd, autoAnchors, blastTerrain, cellX, cellY,
  cloneTerrain, generateTerrain, hatesOuch, hatesWater, idx as tidx, isAquatic, isBlocked, isClimber, isFireproof, losClear, moveClass,
  moveMul, needsPath, solidTopAt, spawnSpots, type BuildOrder, type Terrain,
} from './terrain.ts';
import {
  ARENA_D, ARENA_W, IMM_BURN, IMM_HUNGER, IMM_KB, IMM_POISON, IMM_SLOW, IMM_STUN, IMM_WITHER, MELEE_REACH_Z,
  NUM_CRIT, NUM_DODGE, NUM_DOT, NUM_HEAL, NUM_LIFESTEAL, NUM_MAGIC, NUM_PHYS, NUM_TRUE, Unit, baseFx, resetIds,
  type BEvent, type CastCancelReason, type CastState, type Delayed, type Proj, type UnitFx, type Zone,
} from './unit.ts';

export const DT = 1 / 30;
/** Creatures made of fire: freezing hurts them three times as much. */
const FIRE_BODY = new Set(['blaze', 'magma_cube', 'sulfur_cube']);
/** Cold creatures (冰原猎手 combo; immune to freezing). */
const COLD_MOBS = new Set(['frostbite', 'stray', 'polar_bear', 'snow_golem']);
/** Projectiles that count as explosions (for 火焰弹). */
const EXPLOSIVE = new Set<ProjectileKind>(['big_fireball', 'wither_skull', 'blue_skull']);

export interface CardPlan {
  mob: string;
  star: number;
  row: Row;
  count: number;
  hpMul: number;
  atkMul: number;
  atkSpd: number;
  moveSpd: number;
  rangeMul: number;
  armorAdd: number;
  fx: UnitFx;
  immune: number;
  enchant?: string;
  uid?: string;
  /** Starting HP fraction for non-summoned units (wounded bosses). */
  startHp?: number;
  /** Deployment anchor (world coords); auto-placed when absent. */
  anchor?: [number, number];
}

export interface SidePlan {
  cards: CardPlan[];
  /** Relic / potion / misc flags (value = magnitude, usually 1). */
  flags: Record<string, number>;
  /** Active synergy tier index per family (0-based), absent = inactive. */
  syn: Partial<Record<Family, number>>;
  summonMul: number;
  /** Scales flat-damage relics (TNT, conduit). */
  act: number;
  /** Commander battle skill and its charges. */
  skill?: { id: SkillId; charges: number };
  /** Walls / platforms placed during deployment (Steve). */
  builds?: BuildOrder[];
}

export interface BattleConfig {
  seed: number;
  sides: [SidePlan, SidePlan];
  boss?: boolean;
  headless?: boolean;
  terrain?: Terrain;
  /** Per side AI level: 0 = classic nearest-enemy, 1 = tactical (default). */
  ai?: [number, number];
}

export interface CardStat {
  team: 0 | 1;
  mob: string;
  star: number;
  enchant?: string;
  uid?: string;
  spawned: number;
  alive: number;
  dmg: number;
  taken: number;
  heal: number;
  kills: number;
  emeralds: number;
  anchorUsed: boolean;
  ref?: Record<string, any>;
}

export interface BattleResult {
  winner: 0 | 1;
  time: number;
  cards: CardStat[];
  emeralds: number;
  /** Remaining HP fraction of the enemy boss unit, if any. */
  bossHp?: number;
  /** Both sides wiped on the same tick / exactly equal HP (counted as a loss for blue). */
  draw?: boolean;
  /** Items the player used (consumed from the inventory afterwards). */
  itemsUsed: string[];
  /** Commander skills the player used. */
  skillsUsed: string[];
  /** Playable mobs the player tamed that are still alive at the end (Alex can keep one). */
  tamed: string[];
  /** Units that fell per side, and units still standing at the end (summons and structures not counted). */
  lost?: [number, number];
  left?: [number, number];
}

export type BuffKind = 'atk' | 'atkSpd' | 'move' | 'taken' | 'fire';

export interface SideState {
  plan: SidePlan;
  fatigue: number;
  darkness: number;
  turtleUsed: boolean;
  timers: Record<string, number>;
  /** Side-wide multipliers from items (strength, goat horn...), each until a battle time. */
  buffs: { k: BuffKind; v: number; until: number }[];
  fireImmune: boolean;
  /** 回响碎片 stacks (allies lost this battle). */
  echo: number;
  beastKillStacks: number;
  aquaticAvgAtk: number;
}

const GC = 40;
const GW = Math.ceil(ARENA_W / GC) + 2;
const GH = Math.ceil(ARENA_D / GC) + 2;

export class Battle {
  rng: Rng;
  t = 0;
  units: Unit[] = [];
  live: [Unit[], Unit[]] = [[], []];
  projs: Proj[] = [];
  zones: Zone[] = [];
  delayed: Delayed[] = [];
  events: BEvent[] = [];
  cards: CardStat[] = [];
  plans: CardPlan[] = [];
  sides: [SideState, SideState];
  over = false;
  winner: 0 | 1 = 1;
  draw = false;
  itemsUsed: [string[], string[]] = [[], []];
  /** Thrown items still in the air. */
  pendingItems: { t: number; team: 0 | 1; id: string; x: number; y: number }[] = [];
  /** Timed callbacks tied to battle time (this.t) */
  timedActions: { at: number; fn: () => void }[] = [];
  /** Commander skill charges left and skills used, per side. */
  skillLeft: [number, number] = [0, 0];
  skillsUsed: [string[], string[]] = [[], []];
  /** Walls built this battle, and units tamed by either side. */
  walls: Wall[] = [];
  /** Platform cells built by each side (team per cell, -1 none), and fortified cells. */
  platTeam: Int8Array | null = null;
  fortTeam: Int8Array | null = null;
  tamed: Unit[] = [];
  /** Non-summon units that died, per side (achievements). */
  lost: [number, number] = [0, 0];
  headless: boolean;
  boss: boolean;
  suddenAt: number;
  suddenAnnounced = false;
  terrain!: Terrain;
  /** Tactical AI per side, plus the shared blackboard it reads. */
  smart: [boolean, boolean];
  front: [number, number] = [NaN, NaN];
  dangers: [Danger[], Danger[]] = [[], []];
  sayT: [number, number] = [0, 0];
  private nid = 1;
  private flows = new Map<number, { f: FlowField; t: number }>();
  /** Seconds each brittle-ice cell has been stood on (ice caves). */
  private crack: Float32Array | null = null;
  /** 灵魂潮汐 is washing over the field (Sift biomes). */
  tideOn = false;
  private gridHead = new Int32Array(GW * GH);
  private gridNext = new Int32Array(512);

  // V3.3 Soul Resource
  souls: [number, number] = [0, 0];
  maxSouls: [number, number] = [30, 30];
  soulLock: [number, number] = [0, 0];
  soulEnemyKills: [number, number] = [0, 0];
  soulGained: [number, number] = [0, 0];
  hasSoulMechanic: [boolean, boolean] = [false, false];

  constructor(cfg: BattleConfig) {
    resetIds();
    this.rng = new Rng(cfg.seed);
    this.headless = !!cfg.headless;
    this.boss = !!cfg.boss;
    this.suddenAt = this.boss ? 80 : 60;
    this.smart = cfg.ai ? [cfg.ai[0] > 0, cfg.ai[1] > 0] : [true, true];
    this.sides = [0, 1].map((i) => ({
      plan: cfg.sides[i],
      fatigue: 0,
      darkness: 0,
      turtleUsed: false,
      timers: {},
      buffs: [] as SideState['buffs'],
      fireImmune: false,
      echo: 0,
      beastKillStacks: 0,
      aquaticAvgAtk: 0,
    })) as unknown as [SideState, SideState];

    for (const team of [0, 1] as const) {
      if (this.has(team, 'soul_vessel')) {
        this.maxSouls[team] = 36;
        this.souls[team] = Math.min(6, this.souls[team] + 4);
      }
      if (this.has(team, 'corrupted_beacon_core') || this.has(team, 'soul_vessel')) {
        this.hasSoulMechanic[team] = true;
      }
      for (const cp of cfg.sides[team].cards) {
        if (cp.mob === 'soul_wisp') this.hasSoulMechanic[team] = true;
      }
    }
    // Each battle gets its own copy: explosions reshape it, and retries must start pristine.
    this.terrain = cloneTerrain(cfg.terrain ?? generateTerrain('plains', cfg.seed));
    // Commander skills; deployment builds go up before anyone spawns and use up charges.
    for (const team of [0, 1] as const) {
      const sk = cfg.sides[team].skill;
      this.skillLeft[team] = sk?.charges ?? 0;
      if (sk?.id !== 'build') continue;
      for (const o of cfg.sides[team].builds ?? []) {
        if (this.skillLeft[team] <= 0) break;
        if (build(this, team, o.kind, o.x, o.y, true)) {
          this.skillLeft[team]--;
          this.skillsUsed[team].push(o.kind);
        }
      }
    }
    for (const team of [0, 1] as const) {
      const side = cfg.sides[team];
      const first = this.plans.length;
      side.cards.forEach((c) => {
        this.plans.push(c);
        this.cards.push({
          team, mob: c.mob, star: c.star, enchant: c.enchant, uid: c.uid, spawned: 0, alive: 0, dmg: 0, taken: 0, heal: 0,
          kills: 0, emeralds: 0, anchorUsed: false, ref: {},
        });
      });
      const auto = autoAnchors(this.terrain, team, side.cards.map((c) => ({ mob: mobDef(c.mob), row: c.row })));
      const taken = new Set<number>();
      // Bigger squads first so they get the cells closest to their anchor.
      const order = side.cards.map((_, k) => k).sort((a, b) => mobDef(side.cards[b].mob).radius - mobDef(side.cards[a].mob).radius);
      for (const k of order) {
        const c = side.cards[k];
        const m = mobDef(c.mob);
        const [ax, ay] = c.anchor ?? auto[k];
        // Some units have fixed homes on the map (end crystals on their pedestals).
        const fixed = this.terrain.spots?.[m.id];
        const spots = fixed
          ? fixed.slice(0, c.count).map(([cx, cy]): [number, number] => [((team === 0 ? cx : TGW - 1 - cx) + 0.5) * BLOCK, (cy + 0.5) * BLOCK])
          : spawnSpots(this.terrain, team, ax, ay, m, c.count, taken);
        for (const [x, y] of spots) this.createUnit(first + k, m, x + this.rng.range(-2, 2), y + this.rng.range(-2, 2));
      }
    }
    for (const w of this.walls) if (this.has(w.team, 'dispenser')) placeDispenser(this, w, true);
    // Settle overlapping squads (the deployment preview never steps, so do it up front).
    for (let k = 0; k < 6; k++) {
      this.separate();
      for (const u of this.units) this.fixTerrain(u);
    }
    for (const u of this.units) {
      u.px = u.x;
      u.py = u.y;
    }
    for (const u of this.units) this.initUnit(u);
    this.rebuildLive();
    this.applyBattleStart();
    if (this.terrain.s.includes(TS.BRITTLE_ICE)) this.crack = new Float32Array(this.terrain.s.length);
  }

  // ───────────────────────── Setup ─────────────────────────

  rowX(team: 0 | 1, row: Row): number {
    const base = (row === 'front' ? 12.5 : row === 'mid' ? 9 : 5) * BLOCK;
    return team === 0 ? base : ARENA_W - base;
  }

  /** Builds a unit for a card using that card's plan multipliers. */
  createUnit(ci: number, m: MobDef, x: number, y: number, mul = 1, summon = false): Unit {
    const plan = this.plans[ci];
    const card = this.cards[ci];
    const u = new Unit(m, card.team, ci, plan.star, plan.row, plan.fx);
    const sm = m.id === plan.mob ? starMulOf(m, plan.star) : 1;
    u.maxHp = u.hp = Math.max(1, m.hp * plan.hpMul * sm * mul);
    u.atk = m.atk * plan.atkMul * sm * mul;
    u.range = m.range * (m.range >= 60 ? plan.rangeMul : 1);
    u.speed = m.speed * plan.moveSpd;
    u.atkSpd = plan.atkSpd;
    u.armor = Math.min(0.75, m.armor + plan.armorAdd);
    u.immune |= plan.immune;
    u.x = u.px = clampX(x, u.radius);
    u.y = u.py = clampY(y);
    u.isSummon = summon;
    u.cls = moveClass(m);
    this.updateGround(u);
    if (!summon && plan.startHp !== undefined) u.hp = u.maxHp * plan.startHp;
    u.atkTimer = this.rng.range(0.1, 0.5) * u.cd;
    this.units.push(u);
    card.spawned++;
    card.alive++;
    if (this.units.length > this.gridNext.length) this.gridNext = new Int32Array(this.gridNext.length * 2);
    return u;
  }

  private initUnit(u: Unit) {
    this.beh(u).init?.(u, this);
  }

  /** Spawns a summoned unit mid-battle (vexes, splits, infections...). */
  summon(owner: Unit, mobId: string, x: number, y: number, mul: number, opts: { lifespan?: number; fx?: string; gen?: number; alpha?: number } = {}): Unit | null {
    if (this.live[owner.team].length > 140) return null;
    const m = mobDef(mobId);
    const sideMul = this.sides[owner.team].plan.summonMul;
    const u = this.createUnit(owner.card, m, x, y, mul * sideMul, true);
    // Summons of a different mob don't inherit the card's star multiplier but do keep side mods.
    if (mobId !== this.plans[owner.card].mob) {
      const scale = starMulOf(mobDef(this.plans[owner.card].mob), owner.star);
      u.maxHp = u.hp = u.maxHp * Math.sqrt(scale);
      u.atk *= Math.sqrt(scale);
    }
    u.lifespan = opts.lifespan ?? 0;
    u.gen = opts.gen ?? 0;
    u.alpha = opts.alpha ?? 1;
    u.facing = owner.team === 0 ? 1 : -1;
    this.initUnit(u);
    if (owner.mob.id === 'nester' && this.has(owner.team, 'combo_glowing_nest')) {
      const hasBlub = this.live[owner.team].some((a) => a.alive && !a.isSummon && a.mob.id === 'blub');
      if (hasBlub && (opts.gen ?? 0) === 0 && opts.fx !== 'ghost') {
        u.addSynergyShield('glowing_nest', u.maxHp * 0.15, 4.0);
        u.fx = { ...u.fx, firstHitMul: Math.max(u.fx.firstHitMul, 1.20) };
        this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '微光护巢!', color: '#ff8fb1' });
      }
    }
    if ((opts.gen ?? 0) > 0 && this.has(owner.team, 'combo_sunken_escort') && (owner.mob.id === 'tropical_slime' || owner.mob.families.includes('aquatic'))) {
      const tm = this.sides[owner.team].timers;
      if (!tm.sunken_escort_cd || this.t >= tm.sunken_escort_cd) {
        tm.sunken_escort_cd = this.t + 8.0;
        for (const a of this.live[owner.team]) {
          if (a.alive && !a.structure && (a.mob.id === 'sunken_skeleton' || a.mob.id === 'drowned' || a.mob.id === 'bogged')) {
            a.takenMul *= 0.85;
            this.addTimedAction(6.0, () => { if (a.alive) a.takenMul /= 0.85; });
          }
        }
        this.emit({ k: 'text', x: owner.x, y: owner.y, z: owner.gz + owner.z + owner.size, s: '沉海护送!', color: '#3fc6d6' });
      }
    }
    if (this.has(owner.team, 'combo_construct_sentries') && owner.mob.families.includes('construct')) {
      const tm = this.sides[owner.team].timers;
      if (!tm.construct_sentries_cd || this.t >= tm.construct_sentries_cd) {
        tm.construct_sentries_cd = this.t + 8.0;
        for (const a of this.live[owner.team]) {
          if (a.alive && !a.isSummon && a.mob.id === 'pumpkin_turret') {
            a.atkSpd *= 1.25;
            this.addTimedAction(4.0, () => { if (a.alive) a.atkSpd /= 1.25; });
          }
        }
        this.emit({ k: 'text', x: owner.x, y: owner.y, z: owner.gz + owner.z + owner.size, s: '构装哨阵!', color: '#e67e22' });
      }
    }
    this.live[u.team].push(u);
    this.emit({ k: 'spawn', u, fx: opts.fx ?? 'poof' });
    return u;
  }

  /** A boss below half health speeds up, shrugs off some damage and calls two guards. */
  private enrage(u: Unit) {
    u.ab.enraged = 1;
    u.hasteMul = Math.max(u.hasteT > 0 ? u.hasteMul : 1, 1.3);
    u.hasteT = 1e9;
    u.fx = { ...u.fx, dmgTaken: u.fx.dmgTaken * 0.85 };
    const guardMob = u.mob.id === 'elder_guardian_boss' ? 'drowned' : this.plans.find((p, i) => this.cards[i].team === u.team && !mobDef(p.mob).boss && !mobDef(p.mob).structure)?.mob;
    if (guardMob) for (const dy of [-34, 34]) this.summon(u, guardMob, u.x + (u.team === 0 ? 30 : -30), u.y + dy, 0.75, { fx: 'summon' });
    this.emit({ k: 'roar', x: u.x, y: u.y, r: 160, color: '#ff4a4a' });
    this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size + 10, s: '狂暴！', color: '#ff5a5a' });
    this.emit({ k: 'sfx', id: 'roar' });
  }

  beh(u: Unit): Behavior {
    return BEHAVIORS[u.mob.ai] ?? BEHAVIORS.default;
  }

  emit(e: BEvent) {
    if (!this.headless) this.events.push(e);
  }

  has(team: 0 | 1, flag: string): number {
    return this.sides[team].plan.flags[flag] ?? 0;
  }

  syn(team: 0 | 1, f: Family): number {
    const v = this.sides[team].plan.syn[f];
    return v === undefined ? -1 : v;
  }

  private applyBattleStart() {
    for (const team of [0, 1] as const) {
      const foe = (1 - team) as 0 | 1;
      const has = (f: string) => this.has(team, f);

      const aquaticUnits = this.live[team].filter((u) => u.mob.families.includes('aquatic') && !u.structure && !u.boss && !u.isSummon);
      this.sides[team].aquaticAvgAtk = aquaticUnits.length ? aquaticUnits.reduce((sum, u) => sum + u.atk, 0) / aquaticUnits.length : 20;

      if (this.syn(team, 'beast') >= 2) {
        this.sides[team].beastKillStacks = 3;
      }

      if (this.syn(team, 'construct') >= 0) {
        for (const u of this.live[team]) {
          if (u.mob.families.includes('construct') && !u.structure && !u.boss && !u.isSummon) {
            u.addSynergyShield('construct_start', u.maxHp * 0.10, 8);
            this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '构装护盾', color: '#c9c9c9' });
          }
        }
      }

      if (this.syn(team, 'aquatic') >= 0) {
        for (const u of this.live[team]) {
          if (u.mob.families.includes('aquatic') && !u.structure && !u.boss && !u.isSummon) {
            u.addSynergyShield('aquatic_start', u.maxHp * 0.10, 8);
            this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '潮汐护盾', color: '#3fc6d6' });
          }
        }
      }

      if (this.syn(team, 'ender') >= 1) {
        for (const u of this.live[team]) {
          if (u.mob.families.includes('ender')) u.critNext = true;
        }
      }

      if (has('combo_wolf_armor')) {
        for (const u of this.live[team]) {
          if (u.mob.id === 'wolf' && !u.isSummon) {
            u.addSynergyShield('wolf_armor', u.maxHp * 0.20, 8);
            this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '狼铠!', color: '#e0b25b' });
          }
        }
      }

      if (has('combo_desert_riders')) {
        for (const u of this.live[team]) {
          if (u.mob.id === 'husk' || u.mob.id === 'parched' || u.mob.id === 'camel_husk') {
            u.desertEmpowerMul = 1.5;
            u.desertEmpowerT = 6.0;
          }
        }
      }

      for (const u of this.live[team]) if (has('enchanted_apple')) u.shield = u.maxHp * 0.3;
      if (has('bell')) for (const e of this.live[foe]) e.glowT = 10;
      if (has('nether_star')) {
        let best = -1;
        let bestHp = -1;
        this.cards.forEach((c, i) => {
          if (c.team !== team) return;
          const hp = this.live[team].filter((u) => u.card === i).reduce((s, u) => s + u.maxHp, 0);
          if (hp > bestHp) {
            bestHp = hp;
            best = i;
          }
        });
        for (const u of this.live[team])
          if (u.card === best && !(u.immune & IMM_WITHER)) {
            u.witherT = 5;
            u.witherDps = u.maxHp * 0.025;
          }
      }
    }
  }

  // ───────────────────────── Items ─────────────────────────

  /**
   * Uses a battle item at (x, y). Drinks and horns act at once; everything else is thrown and
   * lands 0.45 s later. Spawn eggs only work on the user's own half. Returns false if refused.
   */
  useItem(team: 0 | 1, id: string, x = 0, y = 0, temp = false): boolean {
    const def = ITEM_MAP[id];
    if (!def || this.over) return false;
    x = clampX(x, 8);
    y = clampY(y);
    if (def.target === 'own' && (team === 0 ? x >= ARENA_W / 2 : x < ARENA_W / 2)) return false;
    // Temporary items (the Witch's brew) don't come out of the inventory.
    if (!temp) this.itemsUsed[team].push(id);
    this.emit({ k: 'item', id, team, x, y, t: def.target === 'none' ? 0 : 0.45 });
    if (def.target === 'none') {
      this.emit({ k: 'sfx', id: def.kind === 'drink' ? 'potion_drink' : 'horn' });
      applyItem(this, team, id, x, y);
    } else {
      this.emit({ k: 'sfx', id: 'potion_throw' });
      this.pendingItems.push({ t: 0.45, team, id, x, y });
    }
    return true;
  }

  /**
   * Uses the side's commander skill: build a wall/platform at (x, y), tame `target`, or hire a
   * golem at (x, y). Returns false (and keeps the charge) if it could not be done.
   */
  useSkill(team: 0 | 1, kind: SkillKind, x = 0, y = 0, target: Unit | null = null): boolean {
    const sk = this.sides[team].plan.skill;
    if (!sk || this.over || this.skillLeft[team] <= 0) return false;
    const id = kind === 'wall' || kind === 'platform' ? 'build' : kind;
    if (sk.id !== id) return false;
    let ok = false;
    if (kind === 'wall' || kind === 'platform') ok = build(this, team, kind, clampX(x, 8), clampY(y));
    else if (kind === 'tame') ok = canTame(this, team, target) && tame(this, team, target);
    else ok = hireGolem(this, team, clampX(x, 20), clampY(y));
    if (!ok) return false;
    this.skillLeft[team]--;
    this.skillsUsed[team].push(kind);
    return true;
  }

  addSouls(team: 0 | 1, amount: number) {
    if (amount <= 0) return;
    this.souls[team] = Math.min(this.maxSouls[team], this.souls[team] + amount);
    this.soulGained[team] = (this.soulGained[team] ?? 0) + amount;
    if (this.has(team, 'soul_vessel') && !this.sides[team].timers['soul_vessel_proc'] && this.soulGained[team] >= 12) {
      this.sides[team].timers['soul_vessel_proc'] = 1;
      this.souls[team] = Math.min(this.maxSouls[team], this.souls[team] + 4);
      this.emit({ k: 'text', x: team === 0 ? 50 : ARENA_W - 50, y: ARENA_D / 2, z: 30, s: '灵魂容器 +4!', color: '#00d2d3' });
    }
  }

  triggerCorruptedBeacon(team: 0 | 1) {
    const rearX = team === 0 ? 40 : ARENA_W - 40;
    const rearY = ARENA_D / 2;
    const foes = this.live[(1 - team) as 0 | 1].filter((f) => f.alive && !f.structure);
    if (foes.length === 0) return;
    foes.sort((a, b) => Math.hypot(a.x - rearX, a.y - rearY) - Math.hypot(b.x - rearX, b.y - rearY));
    const target = foes[0];
    const allies = this.live[team].filter((a) => a.alive && !a.structure && !a.isSummon);
    if (allies.length === 0) return;

    // 两张最高基础攻击预算的原生输出卡合计（四跳分摊总计 160%）
    const cardAtkMap = new Map<number, number>();
    for (const a of allies) {
      cardAtkMap.set(a.card, (cardAtkMap.get(a.card) ?? 0) + a.atk);
    }
    const sortedAtks = Array.from(cardAtkMap.values()).sort((a, b) => b - a);
    const top2A = (sortedAtks[0] ?? 20) + (sortedAtks[1] ?? 0);
    const tickDmg = top2A * 0.40;

    this.emit({ k: 'beam', a: { x: rearX, y: rearY, gz: 0, z: 20 } as any, b: target, color: '#bd00ff', t: 2.0 });
    this.emit({ k: 'sfx', id: 'laser' });
    for (let step = 0; step < 4; step++) {
      this.addTimedAction(step * 0.5, () => {
        if (!this.over && target.alive) {
          let count = 0;
          this.aoe(target.x, target.y, 75, team, (e) => {
            if (count >= 4) return;
            count++;
            this.damage(null, e, tickDmg, 'magic', { noCrit: true });
          });
        }
      });
    }
  }

  addBuff(team: 0 | 1, k: BuffKind, v: number, until: number) {
    this.sides[team].buffs.push({ k, v, until });
  }

  /** Product of a side's active item buffs of one kind. */
  buff(team: 0 | 1, k: BuffKind): number {
    const bs = this.sides[team].buffs;
    if (!bs.length) return 1;
    let m = 1;
    for (const b of bs) if (b.k === k && this.t < b.until) m *= b.v;
    return m;
  }

  /** Registers an extra card mid-battle (spawn eggs) and returns its index. */
  addCard(team: 0 | 1, plan: CardPlan): number {
    this.plans.push(plan);
    this.cards.push({
      team, mob: plan.mob, star: plan.star, spawned: 0, alive: 0, dmg: 0, taken: 0, heal: 0, kills: 0, emeralds: 0, anchorUsed: false, ref: {},
    });
    return this.plans.length - 1;
  }

  /** Brings a freshly created mid-battle unit to life. */
  enlist(u: Unit, fx: string) {
    this.initUnit(u);
    this.live[u.team].push(u);
    this.emit({ k: 'spawn', u, fx });
  }

  // ───────────────────────── Main loop ─────────────────────────

  step() {
    if (this.over) return;
    const dt = DT;
    this.t += dt;
    for (const u of this.units) {
      u.px = u.x;
      u.py = u.y;
      u.pz = u.z;
    }
    for (const p of this.projs) {
      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;
    }
    if (Math.round(this.t * 30) % 4 === 0) refreshTactics(this);
    if (this.pendingItems.length) {
      for (const it of this.pendingItems) {
        it.t -= dt;
        if (it.t <= 0) applyItem(this, it.team, it.id, it.x, it.y);
      }
      this.pendingItems = this.pendingItems.filter((it) => it.t > 0);
    }
    if (this.timedActions.length > 0) {
      const ready: (() => void)[] = [];
      const keep: { at: number; fn: () => void }[] = [];
      for (const a of this.timedActions) {
        if (this.t >= a.at) ready.push(a.fn);
        else keep.push(a);
      }
      this.timedActions = keep;
      for (const fn of ready) fn();
    }
    this.sideTick(0, dt);
    this.sideTick(1, dt);

    // Randomise the update direction every tick so neither side systematically acts first.
    const n = this.units.length;
    const rev = this.rng.next() < 0.5;
    for (let k = 0; k < n; k++) {
      const u = this.units[rev ? n - 1 - k : k];
      if (!u.alive) {
        u.deadT += dt;
        continue;
      }
      this.updateUnit(u, dt);
    }
    this.updateProjectiles(dt);
    this.updateZones(dt);
    if (this.crack) this.crackIce(dt);
    if (this.terrain.tide) this.tide();
    this.separate();
    for (const u of this.units) if (u.alive) this.fixTerrain(u);
    if (Math.floor(this.t * 30) % 90 === 0) this.compact();
    this.rebuildLive();
    this.suddenDeath(dt);
    this.checkEnd();
  }

  /** Brittle ice gives way after about three seconds under someone's feet. */
  private crackIce(dt: number) {
    const t = this.terrain;
    const crack = this.crack!;
    for (const u of this.units) {
      if (!u.alive || u.flying || u.ghost || u.z > 4) continue;
      const i = tidx(cellX(u.x), cellY(u.y));
      if (t.s[i] !== TS.BRITTLE_ICE) continue;
      crack[i] += dt;
      if (crack[i] < 3) continue;
      t.s[i] = TS.WATER;
      t.h[i] = 0;
      t.dirty.push(i);
      t.ver++;
      const x = ((i % TGW) + 0.5) * BLOCK;
      const y = (Math.floor(i / TGW) + 0.5) * BLOCK;
      this.emit({ k: 'debris', x, y, z: 0, s: TS.ICE, f: 0, block: true });
      this.emit({ k: 'sfx', id: 'potion_break', v: 0.5 });
      this.emit({ k: 'text', x, y, z: 30, s: '冰裂了!', color: '#bfe8ff', tac: true });
    }
  }

  /** 灵魂潮汐: every 15 s (from 8 s in) the souls wash over the field for 4 s. */
  private tide() {
    const ph = this.t - 8;
    const on = ph >= 0 && ph % 15 < 4;
    if (on && !this.tideOn) {
      this.emit({ k: 'text', x: ARENA_W / 2, y: ARENA_D / 2, z: 140, s: '灵魂潮汐!', color: '#7ff5de' });
      this.emit({ k: 'roar', x: ARENA_W / 2, y: ARENA_D / 2, r: 640, color: '#7ff5de' });
      this.emit({ k: 'sfx', id: 'song', v: 0.4 });
    }
    this.tideOn = on;
  }

  /** Sift mobs, and anyone fielded with two or more of them, ride the tide out. */
  tideImmune(u: Unit) {
    return u.mob.families.includes('sift') || this.syn(u.team, 'sift') >= 0;
  }

  runToEnd(maxT = 150): BattleResult {
    while (!this.over && this.t < maxT) this.step();
    if (!this.over) this.finishByHp();
    return this.result();
  }

  result(): BattleResult {
    const boss = this.units.find((u) => u.team === 1 && u.boss && !u.isSummon);
    return {
      winner: this.winner,
      time: this.t,
      cards: this.cards,
      emeralds: this.cards.filter((c) => c.team === 0).reduce((s, c) => s + c.emeralds, 0),
      bossHp: boss ? (boss.alive ? boss.hp / boss.maxHp : 0) : undefined,
      draw: this.draw,
      itemsUsed: this.itemsUsed[0].slice(),
      skillsUsed: this.skillsUsed[0].slice(),
      tamed: this.tamed.filter((u) => u.alive && u.team === 0 && !u.mob.hidden && !u.isSummon).map((u) => u.mob.id),
      lost: [this.lost[0], this.lost[1]],
      left: [0, 1].map((k) => this.units.filter((u) => u.alive && u.team === k && !u.isSummon && !u.structure).length) as [number, number],
    };
  }

  private rebuildLive() {
    this.live[0].length = 0;
    this.live[1].length = 0;
    for (const u of this.units) if (u.alive) this.live[u.team].push(u);
  }

  private compact() {
    // Drop long-dead corpses so loops stay short in long battles.
    this.units = this.units.filter((u) => u.alive || u.deadT < 2 || u.ref.anchor);
  }

  private checkEnd() {
    const a = this.live[0].some((u) => !u.structure);
    const b = this.live[1].some((u) => !u.structure);
    if (a && b) return;
    this.over = true;
    this.winner = a && !b ? 0 : 1;
    this.draw = !a && !b;
  }

  private finishByHp() {
    const frac = (team: 0 | 1) => {
      let hp = 0;
      let max = 0;
      for (const u of this.units) {
        if (u.team !== team || u.isSummon) continue;
        max += u.maxHp;
        if (u.alive) hp += u.hp;
      }
      return max ? hp / max : 0;
    };
    this.over = true;
    this.winner = frac(0) > frac(1) ? 0 : 1;
    this.draw = frac(0) === frac(1);
  }

  private suddenDeath(dt: number) {
    if (this.t < this.suddenAt) return;
    if (!this.suddenAnnounced) {
      this.suddenAnnounced = true;
      this.emit({ k: 'phase', s: 'sudden' });
    }
    const pct = 0.02 + 0.012 * Math.floor((this.t - this.suddenAt) / 5);
    for (const team of [0, 1] as const)
      for (const u of this.live[team]) {
        if (u.structure) continue;
        const d = u.maxHp * pct * dt * (u.boss ? 0.3 : 1);
        this.dot(u, d, null);
      }
  }

  // ───────────────────────── Units ─────────────────────────

  private updateUnit(u: Unit, dt: number) {
    u.age += dt;
    u.animAtk = Math.max(0, u.animAtk - dt);
    u.animHit = Math.max(-1, u.animHit - dt);
    this.tickStatus(u, dt);
    if (!u.alive) return;
    if (u.cast) {
      this.updateCast(u, dt);
      if (!u.alive) return;
    }
    if (u.lifespan > 0 && u.age > u.lifespan) {
      u.hp = 0;
      this.kill(u, null, true);
      return;
    }
    // Afterimages just stand there; their strike is a delayed hit scheduled by whoever left them.
    if (u.ghost) {
      u.moving = false;
      if (!u.ab.swung && u.age >= u.lifespan - 0.35) {
        u.ab.swung = 1;
        u.animAtk = 0.22;
      }
      return;
    }
    // Knockback velocity
    if (u.vx !== 0 || u.vy !== 0) {
      // 滴水石锥: slamming into a wall, tree or pillar hurts.
      if (!u.flying && u.vx * u.vx + u.vy * u.vy > 110 * 110 && this.has((1 - u.team) as 0 | 1, 'dripstone')) {
        const nx = u.x + u.vx * dt * 3;
        const ny = u.y + u.vy * dt * 3;
        if (isBlocked(this.terrain, cellX(nx), cellY(ny)) && !u.boss && !u.structure) {
          u.vx = u.vy = 0;
          this.damage((u.ref.lastHitBy as Unit | undefined) ?? null, u, u.maxHp * 0.06, 'true', { noCrit: true, noDodge: true });
          this.stun(u, 0.5);
          this.emit({ k: 'land', x: u.x, y: u.y, z: u.gz, big: true });
          this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size + 6, s: '撞墙!', color: '#d8c8a8', tac: true });
        }
      }
      u.x = clampX(u.x + u.vx * dt, u.radius);
      u.y = clampY(u.y + u.vy * dt);
      const f = Math.exp(-7 * dt);
      u.vx *= f;
      u.vy *= f;
      if (Math.abs(u.vx) < 2) u.vx = 0;
      if (Math.abs(u.vy) < 2) u.vy = 0;
    }
    // Vertical motion
    if (u.levT > 0) {
      u.z = Math.min(u.alt + 70, u.z + 50 * dt);
      u.vz = 0;
    } else if (u.z > u.alt + 0.5 || u.vz > 0) {
      u.vz -= 900 * dt;
      u.z += u.vz * dt;
      if (u.z <= u.alt) {
        u.z = u.alt;
        u.vz = 0;
        if (u.levDmg > 0) {
          const d = u.levDmg;
          u.levDmg = 0;
          this.damage(null, u, d, 'true', { noCrit: true, noDodge: true });
          this.emit({ k: 'hit', x: u.x, y: u.y, z: u.gz, big: true, color: '#ddd' });
        }
        if (u.fallDmg > 0) {
          const d = u.fallDmg;
          u.fallDmg = 0;
          this.dot(u, d, (u.ref.lastHitBy as Unit | undefined) ?? null);
          this.emit({ k: 'num', x: u.x, y: u.y, z: u.gz + u.size, v: Math.round(d), c: NUM_TRUE });
          this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size + 6, s: '摔落!', color: '#e8e8e8', tac: true });
          this.emit({ k: 'land', x: u.x, y: u.y, z: u.gz, big: true });
          this.stun(u, 0.3);
        }
      }
    } else if (u.flying && Math.abs(u.z - u.alt) > 0.5) {
      u.z += (u.alt - u.z) * Math.min(1, dt * 4);
    }

    // 不祥之兆 V: bosses enrage once at half health.
    if (u.boss && !u.ab.enraged && u.hp < u.maxHp * 0.5 && this.has(u.team, 'omen_enrage')) this.enrage(u);
    const b = this.beh(u);
    if (u.stunned) {
      u.moving = false;
      return;
    }
    b.tick?.(u, this, dt);
    if (!u.alive) return;
    if (u.cast && (u.cast.phase === 'windup' || u.cast.phase === 'recovery')) {
      u.moving = false;
      return;
    }
    if (b.move?.(u, this, dt)) return;
    this.defaultAct(u, dt, b);
  }

  private updateCast(u: Unit, dt: number) {
    const c = u.cast;
    if (!c) return;
    if (c.phase === 'windup') {
      u.channeling = true;
      u.channelT = Math.max(0, c.endTime - this.t);
      u.moving = false;
      if (this.t >= c.endTime) {
        c.settled = true;
        c.phase = 'release';
        u.channeling = false;
        u.channelT = 0;
        u.posture = 0;
        try {
          c.onRelease?.(c);
        } catch (e) {
          console.error('Error in cast onRelease:', e);
        }
        if (u.cast === c) {
          c.phase = 'recovery';
          c.endTime = this.t + c.recoveryDuration;
        }
      }
    } else if (c.phase === 'recovery') {
      u.channeling = false;
      u.channelT = 0;
      u.moving = false;
      if (this.t >= c.endTime) {
        c.phase = 'idle';
        try {
          c.onFinish?.(c);
        } catch (e) {
          console.error('Error in cast onFinish:', e);
        }
        if (u.cast === c) {
          u.cast = null;
        }
        u.atkTimer = Math.max(u.atkTimer, 0.4);
      }
    }
  }

  /** Effective attack-speed multiplier including statuses and side effects. */
  atkSpeedOf(u: Unit): number {
    let s = u.atkSpd;
    if (u.hungerT > 0) s *= 0.7;
    if (u.slowT > 0) s *= 1 - u.slowAtk;
    if (u.chill > 0) s *= 1 - 0.12 * u.chill;
    const fat = this.sides[(1 - u.team) as 0 | 1].fatigue;
    if (fat > 0) s *= 1 - fat;
    if (this.has(u.team, 'clock') && this.t > 20) s *= 1.25;
    if (u.hasteT > 0) s *= u.hasteMul;
    if (u.freezeT > 0) s *= 0.85;
    if (this.tideOn && !this.tideImmune(u)) s *= 0.75;
    if (u.gh >= 1 && u.isRanged && !u.flying && this.has(u.team, 'lookout')) s *= 1.2;
    if (!u.flying) s *= terrainAtkSpd(u.mob, this.surf(u));
    return s * this.buff(u.team, 'atkSpd');
  }

  surf(u: Unit) {
    return this.terrain.s[tidx(cellX(u.x), cellY(u.y))];
  }

  /** Terrain speed factor for moving in direction (mx,my): surface, cobwebs and climbing. */
  terrainSpeed(u: Unit, mx: number, my: number): number {
    if (u.flying) return 1;
    const t = this.terrain;
    const i = tidx(cellX(u.x), cellY(u.y));
    let k = moveMul(u.mob, t.s[i], t.f[i]);
    const ahead = t.h[tidx(cellX(u.x + mx * BLOCK * 0.6), cellY(u.y + my * BLOCK * 0.6))];
    const dh = ahead - u.gh;
    if (dh > 0 && !isClimber(u.mob)) k *= dh >= 2 ? 0.4 : 0.55;
    else if (dh < 0) k *= 1.05;
    if (u.ref.terrainSlowResist && this.t < u.ref.terrainSlowResist && k < 1) {
      k = 1 - (1 - k) * 0.5;
    }
    return k;
  }

  updateGround(u: Unit) {
    const gh = this.terrain.h[tidx(cellX(u.x), cellY(u.y))];
    if (gh < u.gh && !u.flying && u.age > 0) {
      // Stepping off a ledge: keep the absolute height and let gravity take over. Being knocked
      // off 2+ blocks hurts on landing (5% max HP per block beyond the first, at most 15%).
      const drop = u.gh - gh;
      u.z += drop * BLOCK;
      if (drop >= 2 && (u.vx !== 0 || u.vy !== 0) && !u.boss && !u.structure) {
        // 滴水石锥: enemies of its owner fall three times as hard.
        const k = this.has((1 - u.team) as 0 | 1, 'dripstone') ? 3 : 1;
        u.fallDmg = Math.max(u.fallDmg, u.maxHp * Math.min(0.15 * k, 0.05 * (drop - 1) * k));
      }
    }
    u.gh = gh;
    u.gz = gh * BLOCK;
  }

  /** Arc used by this unit's attack for line of sight, or -1 if terrain can't block it. */
  losArc(u: Unit): number {
    if (u.boss) return -1;
    if (u.mob.ai === 'guardian' || u.mob.ai === 'elder_guardian') return 0;
    if (!u.proj) return -1;
    const spec = PROJ_SPEC[u.proj];
    return spec.mode === 2 ? -1 : spec.mode === 0 ? spec.arc : 0;
  }

  /** Whether u's attack on t (optionally from another spot) clears the terrain in between. */
  canSee(u: Unit, t: Unit, x = u.x, y = u.y): boolean {
    const arc = this.losArc(u);
    if (arc < 0) return true;
    const gz = x === u.x && y === u.y ? u.gz : this.terrain.h[tidx(cellX(x), cellY(y))] * BLOCK;
    return losClear(this.terrain, x, y, gz + u.z + u.size * 0.55, t.x, t.y, t.gz + t.z + t.size * 0.45, arc, u.team);
  }

  /** Explosion that can reshape the battlefield (see blastTerrain for the limits). */
  blast(x: number, y: number, r: number) {
    let scorched = 0;
    for (const c of blastTerrain(this.terrain, x, y, r)) {
      // Scorch marks only kick up a little dust from a few of their cells.
      if (c.kind === 'scorch' && ++scorched > 3) continue;
      const cx = c.i % TGW;
      const cy = Math.floor(c.i / TGW);
      this.emit({ k: 'debris', x: (cx + 0.5) * BLOCK, y: (cy + 0.5) * BLOCK, z: c.h * BLOCK, s: c.s, f: c.f, block: c.kind === 'block' });
    }
  }

  /** Keeps ground units out of blocking features (trees, pillars...). */
  fixTerrain(u: Unit) {
    if (u.flying) {
      this.updateGround(u);
      return;
    }
    const t = this.terrain;
    let cx = cellX(u.x);
    let cy = cellY(u.y);
    if (isBlocked(t, cx, cy)) {
      if (!isBlocked(t, cellX(u.px), cellY(u.py))) {
        u.x = u.px;
        u.y = u.py;
      } else {
        let best = Infinity;
        let bx = u.x;
        let by = u.y;
        for (let r = 1; r < 6 && best === Infinity; r++)
          for (let dy = -r; dy <= r; dy++)
            for (let dx = -r; dx <= r; dx++) {
              if (isBlocked(t, cx + dx, cy + dy)) continue;
              const x = (cx + dx + 0.5) * BLOCK;
              const y = (cy + dy + 0.5) * BLOCK;
              const d = (x - u.x) ** 2 + (y - u.y) ** 2;
              if (d < best) {
                best = d;
                bx = x;
                by = y;
              }
            }
        u.x = bx;
        u.y = by;
      }
      cx = cellX(u.x);
      cy = cellY(u.y);
    }
    // Slide along obstacle edges.
    const rr = Math.min(u.radius, BLOCK * 0.45) * 0.7;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dy) || !isBlocked(t, cx + dx, cy + dy)) continue;
        if (cx + dx < 0 || cy + dy < 0 || cx + dx >= 40 || cy + dy >= 18) continue;
        const x0 = (cx + dx) * BLOCK;
        const y0 = (cy + dy) * BLOCK;
        const qx = Math.max(x0, Math.min(x0 + BLOCK, u.x));
        const qy = Math.max(y0, Math.min(y0 + BLOCK, u.y));
        const ex = u.x - qx;
        const ey = u.y - qy;
        const d = Math.hypot(ex, ey);
        if (d < rr && d > 0.001) {
          u.x += (ex / d) * (rr - d);
          u.y += (ey / d) * (rr - d);
        }
      }
    this.updateGround(u);
  }

  private flowDir(u: Unit): [number, number] | null {
    const key = u.team * 8 + u.cls;
    let e = this.flows.get(key);
    if (!e || this.t - e.t > 0.5) {
      if (!e) {
        e = { f: new FlowField(), t: this.t };
        this.flows.set(key, e);
      }
      e.t = this.t;
      const src: number[] = [];
      for (const f of this.live[(1 - u.team) as 0 | 1]) if (f.alive) src.push(tidx(cellX(f.x), cellY(f.y)));
      e.f.compute(this.terrain, u.cls, src);
    }
    return e.f.dir(this.terrain, u.x, u.y);
  }

  moveSpeedOf(u: Unit): number {
    let s = u.speed * u.moveSpd * this.buff(u.team, 'move');
    if (u.speedT > 0) s *= u.speedMul;
    if (u.mob.families.includes('beast') && this.syn(u.team, 'beast') >= 2 && (this.sides[u.team].beastKillStacks || 0) >= 6) {
      s *= 1.15;
    }
    if (!(u.immune & IMM_SLOW)) {
      if (u.slowT > 0) s *= 1 - u.slowMove;
      if (u.chill > 0) s *= 1 - 0.12 * u.chill;
      if (u.freezeT > 0) s *= 0.7;
    }
    return s;
  }

  rangeOf(u: Unit): number {
    let r = u.range;
    if (u.blindT > 0) r *= 0.6;
    if (u.isRanged) {
      const dark = this.sides[(1 - u.team) as 0 | 1].darkness;
      if (dark > 0) r *= 1 - dark;
      // High ground sees farther.
      if (!u.flying && u.gh > 0) r *= 1 + 0.08 * Math.min(3, u.gh);
    }
    return r;
  }

  atkOf(u: Unit): number {
    let a = u.atk;
    if (u.weakT > 0) a *= 1 - u.weakMul;
    if (u.blindT > 0) a *= 0.8;
    if (u.killStacks > 0) a *= 1 + u.fx.killAtk * u.killStacks;
    if (u.mob.families.includes('beast') && this.syn(u.team, 'beast') >= 1) {
      const beastPct = this.syn(u.team, 'beast') >= 2 ? 0.10 : 0.08;
      const stacks = this.sides[u.team].beastKillStacks || 0;
      if (stacks > 0) a *= 1 + beastPct * stacks;
    }
    if (!u.flying) a *= terrainAtkMul(u.mob, this.surf(u));
    const echo = this.sides[u.team].echo;
    if (echo > 0) a *= 1 + 0.03 * echo;
    if (this.has(u.team, 'ominous_banner') && u.mob.families.includes('illager')) {
      let n = -1;
      for (const o of this.live[u.team]) if (o.mob.families.includes('illager') && !o.isSummon) n++;
      if (n > 0) a *= 1 + 0.04 * Math.min(8, n);
    }
    return a * this.buff(u.team, 'atk');
  }

  canReach(u: Unit, t: Unit) {
    // Dispensers sit on top of walls: walking units can't climb up to them.
    if (t.mob.ai === 'dispenser') return u.isRanged || u.flying;
    return u.isRanged || t.z <= MELEE_REACH_Z;
  }

  reach(u: Unit, t: Unit) {
    return u.radius + t.radius + this.rangeOf(u);
  }

  private defaultAct(u: Unit, dt: number, b: Behavior) {
    if (u.channeling || (u.cast && (u.cast.phase === 'windup' || u.cast.phase === 'recovery'))) {
      u.moving = false;
      return;
    }
    u.atkTimer -= dt * this.atkSpeedOf(u);
    if (u.atkTimer < 0) u.atkTimer = 0;
    const smart = this.smart[u.team];
    if (smart && TAC.dodge && (dodgeStep(this, u, dt) || retreatStep(this, u, dt) || kiteStep(this, u, dt))) return;
    u.retarget -= dt;
    if (!u.target || !u.target.alive || u.retarget <= 0 || u.target.invisT > 0 || !this.canReach(u, u.target)) {
      const specialized = b.target ? b.target(u, this) : null;
      u.target = (u.speed <= 0 ? specialized : (specialized ?? this.findTarget(u)));
      u.retarget = 0.35 + this.rng.next() * 0.2;
    }
    // Ranged units on their side's built platform hold it: they shoot whatever is in range
    // instead of walking off to chase a far target.
    // They wait for the enemy to come, but give up after 5 s with nothing to shoot.
    let garrison = u.isRanged && !u.flying && this.platTeam !== null && this.platTeam[tidx(cellX(u.x), cellY(u.y))] === u.team && (u.ab.idleHold ?? 0) < 5;
    if (garrison && u.target && Math.hypot(u.target.x - u.x, u.target.y - u.y) > this.reach(u, u.target)) {
      let best: Unit | null = null;
      let bd = Infinity;
      for (const e of this.live[(1 - u.team) as 0 | 1]) {
        if (!e.alive || e.invisT > 0 || !this.canReach(u, e)) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d <= this.reach(u, e) && d < bd && this.canSee(u, e)) {
          bd = d;
          best = e;
        }
      }
      if (best) {
        u.target = best;
        u.ab.idleHold = 0;
      } else {
        u.ab.idleHold = (u.ab.idleHold ?? 0) + dt;
        u.moving = false;
        if (u.ab.idleHold < 5) return;
        garrison = false;
      }
    }
    const t = u.target;
    if (!t) {
      // Nothing reachable: drift toward the enemy side.
      u.moving = false;
      return;
    }
    const dx = t.x - u.x;
    const dy = t.y - u.y;
    const d = Math.hypot(dx, dy) || 0.001;
    if (Math.abs(dx) > 2) u.facing = dx > 0 ? 1 : -1;
    const reach = this.reach(u, t);
    let pushIn = false;
    if (smart && TAC.ranged && u.isRanged && u.speed > 0 && !u.boss) {
      // Shoot whenever the line is clear, otherwise drift toward a better firing spot.
      if (d <= reach && u.atkTimer <= 0) {
        if (this.canSee(u, t)) {
          u.noLosT = 0;
          this.attackNow(u, t, b);
          startKite(this, u);
          return;
        }
        // Blocked by terrain: look for another spot or target soon.
        u.noLosT += dt;
        if (u.tacT > 0.15) u.tacT = 0.15;
        if (u.retarget > 0.3) u.retarget = 0.3;
      }
      // Still blocked after a while: close in until the line clears, so cover never makes
      // anyone untouchable.
      pushIn = u.noLosT > 1.5;
      if (!pushIn && garrison && d <= reach) {
        u.moving = false;
        return;
      }
      if (!pushIn) {
        u.tacT -= dt;
        if (u.tacT <= 0) {
          u.tacT = TP.replan + this.rng.next() * 0.25;
          if (d <= reach + BLOCK * TP.trigger) planRanged(this, u, t);
          else u.goalT = 0;
        }
        if (goalStep(this, u, t, dt)) return;
      } else u.goalT = 0;
    }
    if (d > reach || pushIn) {
      if (u.speed <= 0) {
        // Stationary units retarget to anything in range.
        u.moving = false;
        u.retarget = 0;
        return;
      }
      let mx = dx / d;
      let my = dy / d;
      // Closing in on a shooter: weave from side to side instead of walking into the arrows.
      if (smart && TAC.dodge && t.isRanged && !u.isRanged && !u.flying && d > 90 && t.target === u) {
        const a = Math.sin(u.age * 3.2 + u.id) * 0.5;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        [mx, my] = [mx * c - my * sn, mx * sn + my * c];
      }
      if (!u.flying) {
        u.pathT -= dt;
        if (u.pathT <= 0) {
          u.pathT = 0.4 + this.rng.next() * 0.1;
          u.usePath = d > BLOCK * 1.2 && needsPath(this.terrain, u.mob, u.x, u.y, t.x, t.y);
        }
        if (u.usePath) {
          const fd = this.flowDir(u);
          if (fd) {
            mx = fd[0];
            my = fd[1];
          }
        }
      }
      const sp = this.moveSpeedOf(u) * this.terrainSpeed(u, mx, my) * dt;
      const step = Math.max(0, Math.min(sp, d - (pushIn ? u.radius + t.radius + 6 : reach) + 1));
      u.x = clampX(u.x + mx * step, u.radius);
      u.y = clampY(u.y + my * step);
      u.moving = true;
      u.walk += step;
    } else {
      u.moving = false;
      if (u.atkTimer <= 0) this.attackNow(u, t, b);
    }
  }

  private attackNow(u: Unit, t: Unit, b: Behavior) {
    u.moving = false;
    u.atkTimer = u.cd;
    u.animAtk = 0.22;
    if (t && Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1;
    if (b.attack) b.attack(u, t, this);
    else this.basicAttack(u, t);
  }

  findTarget(u: Unit, filter?: (e: Unit) => boolean): Unit | null {
    if (this.smart[u.team] && TAC.target) return pickTarget(this, u, filter);
    if (u.tauntT > 0 && u.taunter && u.taunter.alive && this.canReach(u, u.taunter)) return u.taunter;
    const foes = this.live[(1 - u.team) as 0 | 1];
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const e of foes) {
      if (!e.alive || e.invisT > 0) continue;
      if (!this.canReach(u, e)) continue;
      if (filter && !filter(e)) continue;
      let d = (e.x - u.x) * (e.x - u.x) + (e.y - u.y) * (e.y - u.y) * 1.3;
      if (e === u.target) d *= 0.75;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Default melee hit or projectile shot. */
  basicAttack(u: Unit, t: Unit, mul = 1) {
    if (u.proj) {
      this.shoot(u, t, u.proj, this.atkOf(u) * mul);
      if (u.fx.multishot > 0) {
        for (const s of [-1, 1]) this.shoot(u, t, u.proj, this.atkOf(u) * mul * u.fx.multishot, { spread: s * 0.16 });
      }
    } else {
      this.meleeHit(u, t, this.atkOf(u) * mul);
    }
  }

  meleeHit(u: Unit, t: Unit, amount: number, opts: { noSweep?: boolean } = {}) {
    let amt = amount;
    if (u.firstHit) {
      u.firstHit = false;
      amt *= u.fx.firstHitMul;
      if (u.ref.invisBonus) amt *= 1.5;
    }
    if (u.ref.forestWatchBonus) {
      amt += u.atk * u.ref.forestWatchBonus;
      delete u.ref.forestWatchBonus;
    }
    const dealt = this.damage(u, t, amt, u.dk, { melee: true });
    this.emit({ k: 'hit', x: t.x, y: t.y, z: t.gz + t.z + t.size * 0.5, big: amt > 60, color: '#fff' });
    this.onAttackHit(u, t, dealt, false);
    if (u.fx.sweep > 0 && !opts.noSweep) {
      this.aoe(t.x, t.y, 45, u.team, (e) => {
        if (e !== t) this.damage(u, e, amt * u.fx.sweep, u.dk, { melee: true, noCrit: true });
      });
    }
    // Ender pearl: back-row units escape their first melee attacker.
    if (t.alive && t.fx.pearl && !t.pearlUsed && t.row === 'back') {
      t.pearlUsed = true;
      const nx = t.team === 0 ? 120 + this.rng.range(0, 60) : ARENA_W - 120 - this.rng.range(0, 60);
      const ny = clampY(t.y + this.rng.range(-60, 60));
      this.emit({ k: 'tele', x: t.x, y: t.y, x2: nx, y2: ny, z: t.gz + t.z });
      t.x = t.px = nx;
      t.y = t.py = ny;
    }
  }

  /** Shared on-hit procs for basic attacks (enchants, synergies). */
  onAttackHit(u: Unit, t: Unit, dealt: number, ranged: boolean) {
    const fx = u.fx;
    if (dealt < 0) return;
    if (fx.burnHit > 0) this.burn(t, fx.burnHit, fx.burnDur, u);
    if (fx.poisonHit > 0) this.poison(t, fx.poisonHit, fx.poisonDur, fx.poisonStacks, u);
    if (fx.knock > 0) this.knock(t, u.x, u.y, fx.knock * (ranged ? 0.6 : 1));
    if (fx.stunChance > 0 && this.rng.chance(fx.stunChance)) this.stun(t, 0.4);
    if (fx.freezeHit > 0) this.freeze(t, fx.freezeHit, 2, u);
    if (fx.baneSlow > 0 && t.mob.families.includes('arthropod')) this.slow(t, 0.4, 0.2, fx.baneSlow);
    if (fx.windBurst > 0 && !ranged) {
      u.ab.wind = (u.ab.wind ?? 0) + 1;
      if (u.ab.wind >= fx.windBurst) {
        u.ab.wind = 0;
        this.emit({ k: 'boom', x: t.x, y: t.y, r: 60, color: '#e6f6ff', big: false });
        this.emit({ k: 'sfx', id: 'wind', v: 0.5 });
        this.aoe(t.x, t.y, 60, u.team, (e) => {
          this.knock(e, u.x, u.y, 160);
          this.knockup(e, 0.5);
        });
      }
    }
    if (fx.channel > 0) {
      u.ab.chan = (u.ab.chan ?? 0) + 1;
      if (u.ab.chan >= fx.channel) {
        u.ab.chan = 0;
        this.lightning(u, t.x, t.y, this.atkOf(u) * 1.5, 40);
      }
    }
    // 筛界: Sift attacks leave an echo that makes the next hit on the target land harder.
    if (u.mob.families.includes('sift') && this.syn(u.team, 'sift') >= 0) t.echoMul = Math.max(t.echoMul, this.syn(u.team, 'sift') >= 2 ? 0.32 : 0.20);
    // 亡灵凋零
    if (u.mob.families.includes('undead') && this.syn(u.team, 'undead') >= 2) {
      this.wither(t, this.atkOf(u) * 0.10, 3, u);
    }
    // 野兽满层撕裂
    if (u.mob.families.includes('beast') && this.syn(u.team, 'beast') >= 2 && (this.sides[u.team].beastKillStacks || 0) >= 6) {
      this.dot(t, this.atkOf(u) * 0.15, u);
    }
    // 联动: 林梢追猎 (combo_canopy_hunt)
    if (u.mob.id === 'ocelot' && this.has(u.team, 'combo_canopy_hunt') && t.poisonT > 0) {
      const tm = this.sides[u.team].timers;
      if (!tm.canopy_hunt_cd || this.t >= tm.canopy_hunt_cd) {
        tm.canopy_hunt_cd = this.t + 6.0;
        this.slow(t, 0.25, 0, 2.0);
        if (t.boss && t.channeling) this.addPosture(t, 15);
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '林梢追猎!', color: '#2ed573' });
      }
    }
    // 联动: 菌火协射 (combo_fungus_legion)
    if (!ranged && u.mob.families.includes('nether') && !u.isSummon && this.has(u.team, 'combo_fungus_legion') && (t.ref.inSporeCloud || this.zones.some((z) => z.kind === 'goo' && Math.hypot(z.x - t.x, z.y - t.y) <= z.r))) {
      const tm = this.sides[u.team].timers;
      if (!tm.fungus_legion_cd || this.t >= tm.fungus_legion_cd) {
        tm.fungus_legion_cd = this.t + 7.0;
        u.atkTimer = Math.max(0, u.atkTimer - u.cd * 0.35);
        this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '菌火协射!', color: '#e74c3c' });
      }
    }

    // firework_mechanism: 远程卡每第 6 次射击，首个命中目标周围产生范围爆炸 0.35A 魔伤
    if (this.has(u.team, 'firework_mechanism') && ranged && !u.structure && !u.isSummon) {
      u.ab.fireworkShots = (u.ab.fireworkShots ?? 0) + 1;
      const cdKey = `fw_mech_c${u.card}`;
      const cd = this.sides[u.team].timers[cdKey] ?? 0;
      if (u.ab.fireworkShots >= 6 && this.t >= cd) {
        u.ab.fireworkShots = 0;
        this.sides[u.team].timers[cdKey] = this.t + 4;
        const allies = this.live[u.team].filter((a) => !a.structure && !a.isSummon);
        const avgAtk = allies.length > 0 ? allies.reduce((s, a) => s + this.atkOf(a), 0) / allies.length : 20;
        this.emit({ k: 'boom', x: t.x, y: t.y, r: 45, color: '#ff6ad5', big: false });
        this.emit({ k: 'sfx', id: 'firework' });
        let hit = 0;
        this.aoe(t.x, t.y, 45, u.team, (e) => {
          if (hit >= 3) return;
          hit++;
          this.damage(u, e, avgAtk * 0.35, 'magic', { noCrit: true });
        });
      }
    }

    // firework_quiver item active
    const fwQuiverExpiry = this.sides[u.team].timers['firework_quiver'] ?? 0;
    if (ranged && this.t < fwQuiverExpiry && !u.ref.quiverHit) {
      u.ref.quiverHit = true;
      const dmg = this.sides[u.team].timers['firework_dmg'] ?? 50;
      this.emit({ k: 'boom', x: t.x, y: t.y, r: 45, color: '#e67e22', big: false });
      let count = 0;
      this.aoe(t.x, t.y, 45, u.team, (e) => {
        if (count >= 4) return;
        count++;
        this.damage(u, e, dmg, 'magic', { noCrit: true });
      });
    }

    // Soul generation on hit for soul cards
    if (dealt > 0 && !u.structure && !u.isSummon && u.mob.id === 'soul_wisp') {
      const lastHitKey = `soul_hit_c${u.card}`;
      const lastHit = this.sides[u.team].timers[lastHitKey] ?? 0;
      if (this.t - lastHit >= 2.0) {
        this.sides[u.team].timers[lastHitKey] = this.t;
        this.addSouls(u.team, 1);
      }
    }

    this.beh(u).onHit?.(u, t, dealt, this);
  }

  shoot(
    u: Unit,
    t: Unit,
    kind: ProjectileKind,
    dmg: number,
    o: { spread?: number; special?: string; aoe?: number; pierce?: number; mode?: 0 | 1 | 2; speed?: number; tx?: number; ty?: number; dk?: DmgKind } = {},
  ): Proj {
    const spec = PROJ_SPEC[kind];
    const sz = u.gz + u.z + u.size * 0.55;
    const mode = o.mode ?? spec.mode;
    let tx = o.tx ?? t.x;
    let ty = o.ty ?? t.y;
    const speed = o.speed ?? spec.speed;
    if (o.tx === undefined && mode !== 2 && spec.lead) {
      // Lead the target a little based on its last-frame motion.
      const flight = Math.hypot(t.x - u.x, t.y - u.y) / speed;
      tx += (t.x - t.px) * 30 * flight * 0.6;
      ty += (t.y - t.py) * 30 * flight * 0.6;
    }
    let ang = Math.atan2(ty - u.y, tx - u.x);
    if (o.spread) ang += o.spread;
    const dist = Math.hypot(tx - u.x, ty - u.y);
    if (o.spread) {
      tx = u.x + Math.cos(ang) * dist;
      ty = u.y + Math.sin(ang) * dist;
    }
    const p: Proj = {
      id: this.nid++, kind, team: u.team, src: u, mode,
      x: u.x + Math.cos(ang) * u.radius, y: u.y + Math.sin(ang) * u.radius * 0.6, z: sz, px: u.x, py: u.y, pz: sz,
      sx: u.x, sy: u.y, sz,
      tx, ty, tz: t.gz + t.z + t.size * 0.45,
      t: 0, dur: Math.max(0.15, dist / speed), arc: spec.arc,
      vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, speed, dist: 0, maxDist: Math.max(dist + 90, this.rangeOf(u) + 120),
      target: t, dmg, dk: o.dk ?? (spec.magic ? 'magic' : u.dk), aoe: o.aoe ?? spec.aoe, pierce: (o.pierce ?? 0) + u.fx.pierce,
      hits: [], fire: !!spec.fire, burn: 0, burnDur: 0, poison: 0, poisonDur: 0, wither: 0, witherDur: 0, slowDur: 0, stun: 0, knock: 0,
      lev: 0, chill: false, splash: 0, special: o.special ?? '', alive: true, age: 0, reflected: false,
    };
    if (u.fx.pierce > 0) p.dmg *= 1.1;
    this.projs.push(p);
    this.emit({ k: 'shoot', kind, x: u.x, y: u.y });
    return p;
  }

  // ───────────────────────── Projectiles ─────────────────────────

  private updateProjectiles(dt: number) {
    const ps = this.projs;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.mode === 0) {
        p.t += dt;
        const f = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * f;
        p.y = p.sy + (p.ty - p.sy) * f;
        p.z = p.sz + (p.tz - p.sz) * f + p.arc * 4 * f * (1 - f);
        if (f >= 1) this.landProjectile(p);
        else if (p.z < solidTopAt(this.terrain, p.x, p.y, p.team) - 2) this.projTerrain(p);
      } else if (p.mode === 1) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.dist += p.speed * dt;
        const f = Math.min(1, p.dist / Math.max(1, Math.hypot(p.tx - p.sx, p.ty - p.sy)));
        p.z = p.sz + (p.tz - p.sz) * f;
        if (p.z < solidTopAt(this.terrain, p.x, p.y, p.team) - 2) {
          this.projTerrain(p);
          continue;
        }
        const foes = this.live[(1 - p.team) as 0 | 1];
        for (const e of foes) {
          if (!e.alive || p.hits.includes(e.id)) continue;
          const rr = e.radius + 6;
          const dx = e.x - p.x;
          if (dx > rr || dx < -rr) continue;
          const dy = e.y - p.y;
          if (dx * dx + dy * dy > rr * rr) continue;
          if (e.flying && e.z > MELEE_REACH_Z + 30 && p.target !== e) continue;
          p.hits.push(e.id);
          if (p.aoe > 0) {
            this.explodeProjectile(p, p.x, p.y);
            break;
          }
          this.projHit(p, e);
          if (p.pierce-- <= 0) {
            p.alive = false;
            break;
          }
          p.dmg *= 0.85;
        }
        if (p.alive && (p.dist > p.maxDist || p.x < -40 || p.x > ARENA_W + 40)) {
          if (p.aoe > 0 && p.special !== 'nofuse') this.explodeProjectile(p, p.x, p.y);
          p.alive = false;
        }
      } else {
        // 须弹: tracks for half a second, then locks its heading and speeds off in a line.
        if (p.special === 'lock' && p.age > 0.5) {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          p.mode = 1;
          p.speed *= 1.8;
          p.vx = (p.vx / sp) * p.speed;
          p.vy = (p.vy / sp) * p.speed;
          p.sx = p.x;
          p.sy = p.y;
          p.sz = p.z;
          p.tx = p.x + (p.vx / p.speed) * 400;
          p.ty = p.y + (p.vy / p.speed) * 400;
          p.tz = p.z;
          p.dist = 0;
          p.maxDist = 420;
          continue;
        }
        const t = p.target;
        if (t && t.alive) {
          const dx = t.x - p.x;
          const dy = t.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const want = Math.atan2(dy, dx);
          const cur = Math.atan2(p.vy, p.vx);
          let da = want - cur;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          const turn = Math.max(-4 * dt, Math.min(4 * dt, da));
          const na = cur + turn;
          p.vx = Math.cos(na) * p.speed;
          p.vy = Math.sin(na) * p.speed;
          p.z += (t.z + t.size * 0.5 - p.z) * Math.min(1, dt * 3);
          if (d < t.radius + 8) {
            this.projHit(p, t);
            p.alive = false;
          }
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.age > 5) p.alive = false;
      }
    }
    if (ps.length > 64 || Math.floor(this.t * 30) % 30 === 0) this.projs = ps.filter((p) => p.alive);
  }

  /** A projectile flew into a hill, tree or rock: splash there, or stick in it. */
  private projTerrain(p: Proj) {
    p.alive = false;
    if (this.beh(p.src).onProjLand?.(p.src, p, p.x, p.y, this)) return;
    if (p.special === 'heal' || p.aoe > 0) {
      p.tx = p.x;
      p.ty = p.y;
      if (p.special === 'heal') this.landProjectile(p);
      else this.explodeProjectile(p, p.x, p.y);
      return;
    }
    const sp = Math.hypot(p.vx, p.vy) || 1;
    this.emit({ k: 'stuck', x: p.x - (p.vx / sp) * 6, y: p.y - (p.vy / sp) * 6, z: p.z, kind: p.kind, dx: p.vx / sp, dy: p.vy / sp });
  }

  private landProjectile(p: Proj) {
    p.alive = false;
    if (this.beh(p.src).onProjLand?.(p.src, p, p.tx, p.ty, this)) return;
    if (p.special === 'heal') {
      this.aoeAllies(p.tx, p.ty, 60, p.team, (a) => {
        const hpBefore = a.hp;
        this.heal(a, p.dmg, p.src);
        const healed = a.hp - hpBefore;
        const overheal = p.dmg - healed;
        if (overheal > 0 && this.has(p.team, 'combo_undead_brew') && a.mob.families.includes('undead')) {
          const shAmt = Math.min(a.maxHp * 0.10, overheal * 0.50);
          a.addSynergyShield('undead_brew', shAmt, 4.0);
          this.emit({ k: 'text', x: a.x, y: a.y, z: a.gz + a.z + a.size, s: '药水护盾', color: '#8fbf6a' });
        }
      });
      this.emit({ k: 'boom', x: p.tx, y: p.ty, r: 60, color: '#ff6fa8', big: false });
      return;
    }
    if (p.aoe > 0) {
      this.explodeProjectile(p, p.tx, p.ty);
      return;
    }
    const t = p.target;
    if (t && t.alive && Math.hypot(t.x - p.tx, t.y - p.ty) <= t.radius + 16) {
      this.projHit(p, t);
      return;
    }
    let best: Unit | null = null;
    let bd = Infinity;
    for (const e of this.live[(1 - p.team) as 0 | 1]) {
      const d = Math.hypot(e.x - p.tx, e.y - p.ty);
      if (d < e.radius + 12 && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) this.projHit(p, best);
    else this.emit({ k: 'hit', x: p.tx, y: p.ty, z: 0, big: false, color: '#9a8466' });
  }

  explodeProjectile(p: Proj, x: number, y: number) {
    p.alive = false;
    const src = p.src;
    const bm = EXPLOSIVE.has(p.kind) ? this.boomMul(p.team) : { r: 1, d: 1 };
    const r = p.aoe * bm.r;
    if (bm.d !== 1) p.dmg *= bm.d;
    const color = PROJ_SPEC[p.kind].color;
    this.emit({ k: 'boom', x, y, r, color, big: r >= 60 });
    if (r >= 60) this.emit({ k: 'shake', a: r >= 90 ? 7 : 4 });
    if (p.special === 'harm') {
      this.aoe(x, y, r, p.team, (e) => {
        this.damage(src, e, p.dmg, 'magic', { proj: true });
      });
      return;
    }
    this.aoe(x, y, r, p.team, (e, f) => {
      const dmg = p.dmg * (1 - 0.4 * f);
      this.damage(src, e, dmg, p.dk, { proj: true, fire: p.fire });
      this.projStatus(p, e);
      if (p.knock > 0) this.knock(e, x, y, p.knock * (1 - 0.5 * f));
      if (src && this.has(src.team, 'combo_dark_wings') && (p.dk === 'magic' || PROJ_SPEC[p.kind].magic) && (e.glowT > 0 || (e.ref.batMarked && this.t < e.ref.batMarked))) {
        const tm = this.sides[src.team].timers;
        if (!tm.dark_wings_cd || this.t >= tm.dark_wings_cd) {
          tm.dark_wings_cd = this.t + 6.0;
          for (const a of this.live[src.team]) {
            if (a.alive && a.mob.id === 'bat') {
              this.heal(a, a.maxHp * 0.08, null);
            }
          }
          this.emit({ k: 'text', x: src.x, y: src.y, z: src.gz + src.z + src.size, s: '暗翼余烬!', color: '#747d8c' });
        }
      }
    });
    this.beh(src).onProjExplode?.(src, p, x, y, this);
    if (EXPLOSIVE.has(p.kind)) this.blast(x, y, r);
  }

  private projHit(p: Proj, t: Unit) {
    const src = p.src;
    // Projectile dodges / reflections happen in damage() via onDamaged, signalled by `proj`.
    const dealt = this.damage(src, t, p.dmg, p.dk, { proj: true, fire: p.fire, projRef: p });
    if (dealt < 0) return; // dodged or reflected
    if (p.kind === 'shulker_bullet' && this.has(p.team, 'combo_end_patrol')) {
      t.huntMarkT = 3.0;
      this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '巡猎标记!', color: '#c06bff' });
    }
    this.emit({ k: 'hit', x: t.x, y: t.y, z: t.gz + t.z + t.size * 0.5, big: false, color: PROJ_SPEC[p.kind].color });
    this.projStatus(p, t);
    if (p.knock > 0) this.knock(t, p.x - p.vx * 0.05, p.y - p.vy * 0.05, p.knock);
    if (p.splash > 0) {
      this.aoe(t.x, t.y, p.splash, p.team, (e) => {
        if (e !== t) {
          this.damage(src, e, p.dmg * 0.5, p.dk, { proj: true, noCrit: true, fire: p.fire });
          this.projStatus(p, e);
        }
      });
    }
    if (!p.reflected) this.onAttackHit(src, t, dealt, true);
    this.beh(src).onProjHit?.(src, p, t, this);
  }

  private projStatus(p: Proj, t: Unit) {
    if (p.burn > 0) this.burn(t, p.burn, p.burnDur, p.src);
    if (p.poison > 0) this.poison(t, p.poison, p.poisonDur, 3, p.src);
    if (p.wither > 0) this.wither(t, p.wither, p.witherDur, p.src);
    if (p.slowDur > 0) this.slow(t, 0.35, 0.2, p.slowDur);
    if (p.chill) this.chillHit(t);
    if (p.stun > 0) this.stun(t, p.stun);
    if (p.lev > 0) this.levitate(t, p.lev, p.dmg * 0.6 + t.maxHp * 0.05);
  }

  // ───────────────────────── Zones & delayed hits ─────────────────────────

  addZone(z: Omit<Zone, 't' | 'tick' | 'id'>): Zone {
    const zone: Zone = { ...z, t: 0, tick: 0, id: this.nid++ };
    this.zones.push(zone);
    return zone;
  }

  addDelayed(d: Delayed) {
    d.id = this.nid++;
    this.delayed.push(d);
  }

  addTimedAction(delaySeconds: number, fn: () => void) {
    this.timedActions.push({ at: this.t + Math.max(0, delaySeconds), fn });
  }

  private updateZones(dt: number) {
    for (const z of this.zones) {
      z.t += dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.5;
        if (z.kind === 'regen') this.aoeAllies(z.x, z.y, z.r, z.team, (a) => this.heal(a, a.maxHp * z.dps * 0.5, null, true));
        else if (z.kind === 'bloom')
          this.aoeAllies(z.x, z.y, z.r, z.team, (a) => {
            if (a.structure) return;
            this.heal(a, a.maxHp * z.dps * 0.5, z.src, true);
            const m = z.haste ?? 1.2;
            a.hasteMul = a.hasteT > 0 ? Math.max(a.hasteMul, m) : m;
            a.hasteT = Math.max(a.hasteT, 0.7);
          });
        else
          this.aoe(z.x, z.y, z.r, z.team, (e) => {
            if (z.kind === 'fire') {
              if (!(e.immune & IMM_BURN)) this.burn(e, z.dps * 0.5, 2, z.src);
            } else if (z.kind === 'lava') {
              if (!e.flying) this.burn(e, e.maxHp * z.dps, 1.5, null);
            } else if (z.kind === 'honey') {
              if (!e.flying) this.slow(e, 0.6, 0.2, 0.7);
            } else if (z.kind === 'goo') {
              if (e.flying) return;
              const d = this.damage(z.src, e, z.dps * 0.5, 'magic', { noCrit: true, noDodge: true });
              if (d > 0) this.feedSift(z.team, e, d * 0.5);
            } else this.damage(z.src, e, z.dps * 0.5, 'magic', { noCrit: true, noDodge: true });
          });
      }
    }
    if (this.zones.length) this.zones = this.zones.filter((z) => z.t < z.dur);
    if (this.delayed.length) {
      for (const d of this.delayed) {
        d.t -= dt;
        if (d.t <= 0) {
          if (d.kind === 'fang') {
            this.emit({ k: 'fang', x: d.x, y: d.y });
            this.aoe(d.x, d.y, d.r, d.team, (e) => this.damage(d.src, e, d.dmg, 'magic', {}));
          } else if (d.kind === 'goo') {
            this.emit({ k: 'boom', x: d.x, y: d.y, r: d.r, color: '#e8d84a', big: false });
            this.emit({ k: 'sfx', id: 'goo', v: 0.6 });
            this.aoe(d.x, d.y, d.r, d.team, (e) => this.damage(d.src, e, d.dmg, 'magic', { noCrit: true }));
          } else if (d.kind === 'slash') {
            this.emit({ k: 'boom', x: d.x, y: d.y, r: d.r, color: '#2ee6f0', big: false });
            this.emit({ k: 'sfx', id: 'slash', v: 0.6 });
            this.aoe(d.x, d.y, d.r, d.team, (e) => {
              this.damage(d.src, e, d.dmg, 'phys', { melee: true, noCrit: true });
              this.emit({ k: 'hit', x: e.x, y: e.y, z: e.gz + e.z + e.size * 0.5, big: true, color: '#7ff5de' });
            });
          } else if (d.kind === 'pillar') {
            this.emit({ k: 'boom', x: d.x, y: d.y, r: d.r, color: '#e67e22', big: false });
            this.emit({ k: 'sfx', id: 'slash', v: 0.6 });
            this.aoe(d.x, d.y, d.r, d.team, (e) => {
              this.damage(d.src, e, d.dmg, 'magic', { noCrit: true });
              this.knock(e, d.x, d.y, 25);
              if (e.boss && e.channeling) {
                this.addPosture(e, 20);
              }
              if (d.src && d.src.star >= 3) {
                this.slow(e, 0.2, 0, 2);
              }
            });
          } else if (d.kind === 'ice_drop') {
            this.emit({ k: 'boom', x: d.x, y: d.y, r: d.r, color: '#70a1ff', big: false });
            this.emit({ k: 'sfx', id: 'potion_break', v: 0.6 });
            this.aoe(d.x, d.y, d.r, d.team, (e) => {
              this.damage(d.src, e, d.dmg, 'magic', { noCrit: true });
              if (e.boss && e.channeling) {
                this.addPosture(e, 25);
              }
              this.slow(e, 0.20, (d.src && d.src.star >= 3) ? 0.10 : 0, 2);
            });
          } else if (d.kind === 'tnt') {
            // TNT doesn't care whose side you are on.
            this.emit({ k: 'boom', x: d.x, y: d.y, r: d.r, color: '#ff5533', big: true });
            this.emit({ k: 'shake', a: 10 });
            this.emit({ k: 'sfx', id: 'explode' });
            for (const team of [0, 1] as const)
              this.aoe(d.x, d.y, d.r, (1 - team) as 0 | 1, (e, f) => {
                this.damage(null, e, d.dmg * (1 - 0.5 * f), 'phys', { noCrit: true, noDodge: true });
                this.knock(e, d.x, d.y, 160);
              });
            this.blast(d.x, d.y, 95);
          } else {
            this.emit({ k: 'bolt', x: d.x, y: d.y });
            this.aoe(d.x, d.y, d.r, d.team, (e) => this.damage(d.src, e, d.dmg, 'magic', { noCrit: true }));
          }
        }
      }
      this.delayed = this.delayed.filter((d) => d.t > 0);
    }
  }

  /** Health drained from `from` flows to the nearest hurt Sift unit of `team`. */
  feedSift(team: 0 | 1, from: Unit, amount: number) {
    let best: Unit | null = null;
    let bd = Infinity;
    for (const a of this.live[team]) {
      if (!a.mob.families.includes('sift') || a.ghost || a.hpFrac >= 1) continue;
      const d = Math.hypot(a.x - from.x, a.y - from.y);
      if (d < bd) (bd = d), (best = a);
    }
    if (best) this.heal(best, amount, null, true);
  }

  lightning(src: Unit | null, x: number, y: number, dmg: number, r: number, team: 0 | 1 = src ? src.team : 0, chained = false) {
    this.emit({ k: 'bolt', x, y });
    this.emit({ k: 'shake', a: 3 });
    const rod = this.has(team, 'lightning_rod');
    if (rod) dmg *= chained ? 1 : 1.4;
    this.aoe(x, y, r, team, (e) => this.damage(src, e, dmg, 'magic', { noCrit: true }));
    // 避雷针: the bolt jumps once to the nearest enemy outside the blast.
    if (rod && !chained) {
      let next: Unit | null = null;
      let nd = 170;
      for (const e of this.live[(1 - team) as 0 | 1]) {
        const d = Math.hypot(e.x - x, e.y - y);
        if (d > r + e.radius && d < nd) (nd = d), (next = e);
      }
      if (next) this.lightning(src, next.x, next.y, dmg * 0.6, r * 0.8, team, true);
    }
    // Lightning charges any creeper it lands near — yours or the enemy's.
    for (const u of this.units) {
      if (!u.alive || u.mob.id !== 'creeper' || u.ref.charged || u.star >= 3) continue;
      if (Math.hypot(u.x - x, u.y - y) > r + 40) continue;
      u.ref.charged = 1;
      this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size + 8, s: '充能!', color: '#7fd8ff' });
    }
  }

  // ───────────────────────── Side-level effects ─────────────────────────

  private sideTick(team: 0 | 1, dt: number) {
    const s = this.sides[team];
    const foe = (1 - team) as 0 | 1;
    const tm = s.timers;
    const live = this.live[team];
    // Auras recomputed from living sources.
    let fatigue = 0;
    let dark = 0;
    for (const u of live) {
      if (u.mob.ai === 'elder_guardian') fatigue = Math.max(fatigue, u.star >= 3 ? 0.3 : 0.2);
      if (u.mob.ai === 'elder_guardian_boss') fatigue = Math.max(fatigue, 0.2);
      if (u.mob.ai === 'warden') dark = 0.25;
    }
    s.fatigue = fatigue;
    s.darkness = dark;

    const once = (key: string, at: number, fn: () => void) => {
      if (!tm[key] && this.t >= at) {
        tm[key] = 1;
        fn();
      }
    };
    const every = (key: string, period: number, first: number, fn: () => void) => {
      if (tm[key] === undefined) tm[key] = first;
      tm[key] -= dt;
      if (tm[key] <= 0) {
        tm[key] += period;
        fn();
      }
    };

    if (this.walls.length) tickWalls(this, team, dt);
    // 刷怪笼: the biggest squad keeps getting reinforcements.
    if (this.has(team, 'spawner') && (tm.spawned ?? 0) < 4)
      every('spawner', 10, 8, () => {
        let best = -1;
        let n = 0;
        this.cards.forEach((c, i) => {
          const plan = this.plans[i];
          if (c.team !== team || c.alive <= 0 || mobDef(c.mob).structure || mobDef(c.mob).boss || !plan.uid) return;
          if (plan.count > n) {
            n = plan.count;
            best = i;
          }
        });
        const owner = live.find((u) => u.card === best && !u.isSummon) ?? live.find((u) => u.card === best);
        if (!owner) return;
        const u = this.summon(owner, this.plans[best].mob, owner.x - (team === 0 ? 30 : -30), owner.y + this.rng.range(-25, 25), 1, { fx: 'summon' });
        if (u) tm.spawned = (tm.spawned ?? 0) + 1;
      });
    const hasAliveFamily = (f: Family) => live.some((u) => u.alive && !u.isSummon && !u.structure && !u.boss && u.mob.families.includes(f));
    const ill = this.syn(team, 'illager');
    if (ill >= 1 && hasAliveFamily('illager')) {
      const hornPeriod = ill >= 2 ? 6.0 : 7.0;
      const blowHorn = () => {
        const illagers = live.filter((u) => u.alive && !u.structure && !u.isSummon && u.mob.families.includes('illager'));
        if (!illagers.length) return;
        this.sides[team].timers['illager_horn_active'] = this.t + 5.0;
        delete this.sides[team].timers['illager_horn_extended'];
        this.emit({ k: 'sfx', id: 'horn' });
        this.emit({ k: 'text', x: this.rowX(team, 'mid'), y: ARENA_D / 2, z: 90, s: '灾厄号角！', color: '#ff4757' });
        for (const u of illagers) {
          u.hasteT = Math.max(u.hasteT, 5.0);
          u.hasteMul = Math.max(u.hasteMul, 1.20);
          u.atk *= 1.22;
          this.addTimedAction(5.0, () => {
            if (u.alive) u.atk /= 1.22;
          });
        }
        // 召唤自适应灵质恼鬼：存活原生灾厄总H的6%，4档12%面板DPS/2只，6档10%/3只，存活6秒，旧一轮被替换
        const totalH = illagers.reduce((sum, u) => sum + u.maxHp, 0);
        const vexHp = Math.max(20, totalH * 0.06);
        const totalDps = illagers.reduce((sum, u) => sum + (u.atk * u.atkSpd) / Math.max(0.2, u.cd), 0);
        const vexCount = ill >= 2 ? 3 : 2;
        const vexDpsMul = ill >= 2 ? 0.10 : 0.12;
        const targetDps = totalDps * vexDpsMul;
        const owner = illagers[0];
        const sideObj = this.sides[team] as any;
        if (sideObj.hornVexes) {
          for (const oldVex of sideObj.hornVexes) {
            if (oldVex.alive) {
              oldVex.hp = 0;
              this.kill(oldVex, null, true);
            }
          }
        }
        const newVexes: Unit[] = [];
        for (let i = 0; i < vexCount; i++) {
          const vex = this.summon(owner, 'vex', this.rowX(team, 'mid') + this.rng.range(-20, 20), 40 + (i * (ARENA_D - 80)) / vexCount, 1, { lifespan: 6, fx: 'summon' });
          if (vex) {
            vex.maxHp = vex.hp = vexHp;
            vex.atk = Math.max(4, targetDps * (vex.cd / Math.max(0.1, vex.atkSpd)));
            vex.fx = { ...vex.fx, dodge: 0.40 };
            newVexes.push(vex);
          }
        }
        sideObj.hornVexes = newVexes;
      };
      const engaged = tm.illager_horn_engaged || live.some((u) => u.alive && u.target && Math.hypot(u.x - u.target.x, u.y - u.target.y) <= Math.max(160, this.rangeOf(u) + 30));
      if (!tm.illager_horn_start && (engaged || this.t >= 4.0)) {
        tm.illager_horn_start = 1;
        tm.illager_horn_engaged = 1;
        blowHorn();
      }
      if (tm.illager_horn_start) {
        every('illager_horn_cycle', hornPeriod, hornPeriod, blowHorn);
      }
    }
    if (this.syn(team, 'nether') >= 2 && hasAliveFamily('nether')) {
      every('nether_pillar', 7.0, 4.0, () => {
        const c = this.densest(foe, 70);
        if (!c) return;
        const netherAllies = live.filter((u) => u.alive && !u.isSummon && u.mob.families.includes('nether'));
        const avgAtk = netherAllies.length ? netherAllies.reduce((sum, u) => sum + u.atk, 0) / netherAllies.length : 30;
        this.emit({ k: 'boom', x: c.x, y: c.y, r: 50, color: '#ff471a', big: false });
        this.emit({ k: 'sfx', id: 'fireball', v: 0.5 });
        this.aoe(c.x, c.y, 50, team, (e) => {
          this.damage(netherAllies[0] ?? null, e, avgAtk * 1.2, 'magic', { noCrit: true, fire: true });
          this.burn(e, Math.max(4, avgAtk * 0.25), 2.5, netherAllies[0] ?? null);
        });
      });
    }
    if (this.syn(team, 'ender') >= 1)
      once('flank', 3.5, () => {
        for (const u of live) {
          if (!u.mob.families.includes('ender') || u.speed <= 0 || u.structure) continue;
          const nx = team === 0 ? ARENA_W - 330 + this.rng.range(-40, 40) : 330 + this.rng.range(-40, 40);
          const ny = this.rng.chance(0.5) ? this.rng.range(20, 70) : this.rng.range(ARENA_D - 70, ARENA_D - 20);
          this.emit({ k: 'tele', x: u.x, y: u.y, x2: nx, y2: ny, z: u.gz + u.z });
          u.x = u.px = nx;
          u.y = u.py = ny;
          this.teleported(u);
        }
      });

    // ── 敌军战术 (Enemy Tactics) ──
    if (this.has(team, 'tactic_hunt_backline')) {
      once('tactic_hunt', 4, () => {
        const owner = live[0];
        if (!owner) return;
        const flankX = team === 0 ? ARENA_W - 120 : 120;
        const flankY1 = ARENA_D * 0.35 + this.rng.range(-20, 20);
        const flankY2 = ARENA_D * 0.65 + this.rng.range(-20, 20);
        const mob = s.plan.act === 1 ? 'cave_spider' : s.plan.act === 2 ? 'wither_skeleton' : s.plan.act === 3 ? 'endermite' : 'sculk_slasher';
        this.emit({ k: 'text', x: flankX, y: ARENA_D / 2, z: 90, s: '敌军猎杀后排！', color: '#ff6b6b' });
        this.emit({ k: 'sfx', id: 'roar', v: 0.5 });
        this.summon(owner, mob, flankX, flankY1, 0.7, { fx: 'summon' });
        this.summon(owner, mob, flankX, flankY2, 0.7, { fx: 'summon' });
      });
    }

    if (this.has(team, 'tactic_salvo')) {
      every('tactic_salvo', 8, 8, () => {
        const rangedShooters = live.filter((u) => u.isRanged && !u.structure);
        if (!rangedShooters.length) return;
        const cx = rangedShooters.reduce((acc, u) => acc + u.x, 0) / rangedShooters.length;
        this.emit({ k: 'text', x: cx, y: ARENA_D / 2, z: 110, s: '火力齐射！', color: '#ffaa44' });
        this.emit({ k: 'sfx', id: 'bow', v: 0.8 });
        for (const u of rangedShooters) {
          u.ref.salvoShot = 1;
          u.atkTimer = 0;
        }
      });
    }

    if (this.has(team, 'tactic_reinforcements')) {
      once('tactic_reinf_warn', 6, () => {
        this.emit({ k: 'text', x: this.rowX(team, 'back'), y: ARENA_D / 2, z: 100, s: '增援波次接近中（3s）！', color: '#c06bff' });
      });
      once('tactic_reinf_spawn', 9, () => {
        const owner = live[0];
        if (!owner) return;
        const reinfX = this.rowX(team, 'back');
        const reinfMob = s.plan.act === 1 ? 'zombie' : s.plan.act === 2 ? 'magma_cube' : s.plan.act === 3 ? 'enderman' : 'baby_sifter';
        this.emit({ k: 'text', x: reinfX, y: ARENA_D / 2, z: 100, s: '敌军增援到达！', color: '#c06bff' });
        this.emit({ k: 'sfx', id: 'horn' });
        this.summon(owner, reinfMob, reinfX, ARENA_D * 0.35, 0.65, { fx: 'summon' });
        this.summon(owner, reinfMob, reinfX, ARENA_D * 0.65, 0.65, { fx: 'summon' });
      });
    }
    if (this.has(team, 'tnt'))
      once('tnt', 4, () => {
        const c = this.densest(foe, 90);
        if (!c) return;
        const bm = this.boomMul(team);
        const dmg = 100 * (1 + 0.6 * (s.plan.act - 1)) * bm.d;
        const r = 95 * bm.r;
        this.emit({ k: 'boom', x: c.x, y: c.y, r, color: '#ff5533', big: true });
        this.emit({ k: 'shake', a: 9 });
        this.emit({ k: 'sfx', id: 'explode' });
        this.aoe(c.x, c.y, r, team, (e) => {
          this.damage(null, e, dmg, 'phys', { noCrit: true });
          this.knock(e, c.x, c.y, 140);
        });
        this.blast(c.x, c.y, r);
      });
    if (this.has(team, 'conduit'))
      every('conduit', 3, 3, () => {
        const foes = this.live[foe].filter((e) => !e.structure);
        if (!foes.length) return;
        const e = this.rng.pick(foes);
        this.lightning(null, e.x, e.y, 45 * (1 + 0.6 * (s.plan.act - 1)), 30);
      });
    if (this.syn(team, 'aquatic') >= 1 && hasAliveFamily('aquatic')) {
      const period = this.syn(team, 'aquatic') >= 2 ? 2.5 : 3.5;
      every('storm', period, 4.0, () => {
        const foes = this.live[foe].filter((e) => !e.structure);
        if (!foes.length) return;
        const e = this.rng.pick(foes);
        const src = live.find((u) => u.mob.families.includes('aquatic')) ?? null;
        const avgAtk = this.sides[team].aquaticAvgAtk || 20;
        const dmg = 45 + Math.min(e.maxHp * 0.06, 3 * avgAtk);
        this.lightning(src, e.x, e.y, dmg, 34);
        const healCount = this.syn(team, 'aquatic') >= 2 ? 2 : 1;
        const aquaticAllies = live.filter((u) => u.alive && !u.structure && !u.boss && !u.isSummon && u.mob.families.includes('aquatic'));
        aquaticAllies.sort((a, b) => a.hpFrac - b.hpFrac || a.id - b.id);
        for (const a of aquaticAllies.slice(0, healCount)) {
          this.heal(a, a.maxHp * 0.08, null);
        }
        if (this.syn(team, 'aquatic') >= 2) {
          this.aoe(e.x, e.y, 35, team, (sub) => {
            if (sub !== e) this.damage(src, sub, dmg * 0.5, 'magic', { noCrit: true });
          });
        }
      });
    }

    if (this.syn(team, 'aquatic') >= 2 && hasAliveFamily('aquatic')) {
      every('aquatic_wave', 8.0, 5.0, () => {
        const foes = this.live[foe].filter((e) => !e.structure && !e.boss && e.row === 'front');
        if (!foes.length) return;
        this.emit({ k: 'text', x: ARENA_W / 2, y: ARENA_D / 2, z: 90, s: '海啸退敌！', color: '#3fc6d6' });
        this.emit({ k: 'sfx', id: 'splash' });
        for (const e of foes) {
          const pushDist = (foe === 0 ? -1 : 1) * BLOCK;
          e.x = clampX(e.x + pushDist, e.radius);
          this.slow(e, 0.25, 0.15, 2.5);
        }
      });
    }

    if (this.syn(team, 'construct') >= 1 && hasAliveFamily('construct')) {
      every('cshield', 5, 4.0, () => {
        const allies = live.filter((u) => u.alive && !u.structure && !u.boss && !u.isSummon);
        allies.sort((a, b) => a.hpFrac - b.hpFrac || a.hp - b.hp || a.id - b.id);
        const count = this.syn(team, 'construct') >= 2 ? 3 : 2;
        const pct = this.syn(team, 'construct') >= 2 ? 0.22 : 0.18;
        for (const target of allies.slice(0, count)) {
          target.addSynergyShield('construct_periodic', target.maxHp * pct, 5);
          this.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.z + target.size, s: '构装护盾', color: '#cfe8ff' });
        }
      });
    }

    if (this.syn(team, 'sift') >= 1 && hasAliveFamily('sift')) {
      every('sift_heal', 6, 4.0, () => {
        const siftAllies = live.filter((u) => u.alive && !u.structure && !u.boss && !u.isSummon && u.mob.families.includes('sift'));
        if (!siftAllies.length) return;
        const cardMap = new Map<number, Unit[]>();
        for (const u of siftAllies) {
          const list = cardMap.get(u.card) ?? [];
          list.push(u);
          cardMap.set(u.card, list);
        }
        const totalSiftH = live.filter((u) => !u.structure && !u.isSummon && u.mob.families.includes('sift')).reduce((s, u) => s + u.maxHp, 0);
        const maxCycleHeal = totalSiftH * 0.10;
        let totalHealed = 0;
        const sortedCards = Array.from(cardMap.entries()).sort((a, b) => {
          const avgA = a[1].reduce((s, u) => s + u.hpFrac, 0) / a[1].length;
          const avgB = b[1].reduce((s, u) => s + u.hpFrac, 0) / b[1].length;
          return avgA - avgB;
        });
        for (const [, units] of sortedCards.slice(0, 2)) {
          const cardH = units.reduce((s, u) => s + u.maxHp, 0);
          const healBudget = Math.min(cardH * 0.04, Math.max(0, maxCycleHeal - totalHealed));
          if (healBudget <= 0) break;
          const perUnit = healBudget / units.length;
          for (const u of units) {
            this.heal(u, perUnit, null);
          }
          totalHealed += healBudget;
        }
      });
    }

    if (this.syn(team, 'sift') >= 2 && hasAliveFamily('sift')) {
      every('sift_rift', 9.0, 5.0, () => {
        const c = this.densest(foe, 75);
        if (!c) return;
        this.emit({ k: 'roar', x: c.x, y: c.y, r: 60, color: '#ff8fb1' });
        this.emit({ k: 'text', x: c.x, y: c.y, z: 80, s: '虚空引力！', color: '#ff8fb1' });
        this.aoe(c.x, c.y, 75, team, (e) => {
          if (!e.structure && !e.boss) {
            e.x = clampX(e.x + (c.x - e.x) * 0.35, e.radius);
            e.y = clampY(e.y + (c.y - e.y) * 0.35);
            this.slow(e, 0.25, 0.15, 3.0);
          }
        });
      });
    }

    if (this.syn(team, 'beast') >= 1 && hasAliveFamily('beast')) {
      const beastEngaged = tm.beast_first_engaged || live.some((u) => u.alive && u.target && Math.hypot(u.x - u.target.x, u.y - u.target.y) <= Math.max(160, this.rangeOf(u) + 30));
      if (!tm.beast_first_engaged && (beastEngaged || this.t >= 2.0)) {
        tm.beast_first_engaged = 1;
        const cur = this.sides[team].beastKillStacks || 0;
        const maxSt = this.syn(team, 'beast') >= 2 ? 6 : 5;
        if (cur < maxSt) {
          this.sides[team].beastKillStacks = cur + 1;
          this.emit({ k: 'text', x: this.rowX(team, 'mid'), y: ARENA_D / 2, z: 80, s: `野性接敌 +${this.sides[team].beastKillStacks}`, color: '#e0b25b' });
        }
      }
      every('beast_time', 6, 4.0, () => {
        const maxSt = this.syn(team, 'beast') >= 2 ? 6 : 5;
        const cur = this.sides[team].beastKillStacks || 0;
        if (cur < maxSt) {
          this.sides[team].beastKillStacks = cur + 1;
          this.emit({ k: 'text', x: this.rowX(team, 'mid'), y: ARENA_D / 2, z: 80, s: `野性觉醒 +${this.sides[team].beastKillStacks}`, color: '#e0b25b' });
        }
      });
    }

    if (this.has(team, 'combo_raid')) {
      once('raid_start', 4.0, () => {
        for (const u of live) {
          if (['pillager', 'vindicator', 'evoker', 'illusioner', 'witch'].includes(u.mob.id)) {
            u.hasteT = Math.max(u.hasteT, 4);
            u.hasteMul = Math.max(u.hasteMul, 1.15);
          }
        }
      });
    }

    if (this.has(team, 'combo_storm_fuse')) {
      const chargeOne = () => {
        const hasParticipant = live.some((u) => u.alive && (u.mob.id === 'drowned' || u.mob.id === 'copper_golem' || u.mob.id === 'creeper'));
        if (!hasParticipant) return;
        const creepers = live
          .filter((u) => u.alive && !u.isSummon && u.mob.id === 'creeper' && !u.ref.charged && u.star < 3)
          .sort((a, b) => a.id - b.id);
        if (creepers.length > 0) {
          creepers[0].ref.charged = 1;
          this.emit({ k: 'text', x: creepers[0].x, y: creepers[0].y, z: creepers[0].gz + creepers[0].size + 8, s: '引雷充能!', color: '#7fd8ff' });
        }
      };
      once('storm_fuse_start', 1.0, chargeOne);
      every('storm_fuse_every', 6.0, 7.0, chargeOne);
    }

    if (this.has(team, 'combo_rampart_banner')) {
      const hasCaptain = live.some((u) => u.alive && u.mob.id === 'rampart_captain');
      const hasPartner = live.some((u) => u.alive && (u.mob.id === 'mountaineer' || u.mob.id === 'windcaller' || u.mob.id === 'armored_mountaineer'));
      const bannerEngaged = tm.rampart_banner_engaged || live.some((u) => u.alive && u.target);
      if (hasCaptain && hasPartner && bannerEngaged) {
        tm.rampart_banner_engaged = 1;
        every('rampart_banner', 8.0, 0.5, () => {
          const capAlive = live.some((u) => u.alive && u.mob.id === 'rampart_captain');
          const partAlive = live.some((u) => u.alive && (u.mob.id === 'mountaineer' || u.mob.id === 'windcaller' || u.mob.id === 'armored_mountaineer'));
          if (!capAlive || !partAlive) return;
          const conditionIds = new Set(['rampart_captain', 'mountaineer', 'windcaller', 'armored_mountaineer']);
          for (const u of live) {
            if (u.alive && !u.structure && conditionIds.has(u.mob.id)) {
              u.moveSpd *= 1.20;
              u.atkSpd *= 1.10;
              this.addTimedAction(5.0, () => {
                if (u.alive) {
                  u.moveSpd /= 1.20;
                  u.atkSpd /= 1.10;
                }
              });
            }
          }
          this.emit({ k: 'text', x: this.rowX(team, 'front'), y: ARENA_D / 2, z: 90, s: '城垛战旗!', color: '#e67e22' });
        });
      }
    }

    if (this.has(team, 'combo_snow_guides')) {
      const hasSnowFox = live.some((u) => u.alive && u.mob.id === 'snow_fox');
      if (hasSnowFox) {
        every('snow_guides', 8.0, 0.5, () => {
          let count = 0;
          for (const u of live) {
            if (u.alive && !u.structure && !u.isSummon && (u.mob.role === 'melee' || u.mob.role === 'tank') && count < 2) {
              count++;
              u.addSynergyShield('snow_guides', u.maxHp * 0.10, 4.0);
              u.ref.terrainSlowResist = this.t + 4.0;
            }
          }
          this.emit({ k: 'text', x: this.rowX(team, 'front'), y: ARENA_D / 2, z: 90, s: '雪原引路!', color: '#70a1ff' });
        });
      }
    }

    if (this.has(team, 'combo_bone_cavalry')) {
      const hasCavalry = live.some((u) => u.alive && (u.mob.id === 'skeleton_horseman' || u.mob.id === 'chicken_jockey'));
      if (hasCavalry) {
        every('bone_cavalry', 7.0, 3.0, () => {
          for (const a of live) {
            if (a.alive && !a.structure && a.row === 'front' && a.mob.families.includes('undead')) {
              a.slowT = 0;
              a.chill = 0;
              a.addSynergyShield('bone_cavalry', a.maxHp * 0.12, 4.0);
            }
          }
          this.emit({ k: 'text', x: this.rowX(team, 'front'), y: ARENA_D / 2, z: 90, s: '亡骑践阵!', color: '#dfe4ea' });
        });
      }
    }

    // ── V3.3 遗迹远征宝物效果 ──
    if (this.has(team, 'mycelium_spores')) {
      for (const at of [4, 14, 24]) {
        once(`mycelium_${at}`, at, () => {
          this.emit({ k: 'text', x: this.rowX(team, 'front'), y: ARENA_D / 2, z: 90, s: '迅捷菌丝!', color: '#2ed573' });
          for (const u of live) {
            if (!u.structure && !u.isSummon && !u.isRanged) {
              u.atkSpd *= 1.25;
              this.addTimedAction(7, () => { if (u.alive) u.atkSpd /= 1.25; });
            }
          }
        });
      }
    }

    if (this.has(team, 'totem_grove')) {
      every('totem_grove', 8, 4, () => {
        const cardDeficitMap = new Map<number, { units: Unit[]; deficit: number }>();
        for (const u of live) {
          if (!u.structure && !u.isSummon) {
            const entry = cardDeficitMap.get(u.card) ?? { units: [], deficit: 0 };
            entry.units.push(u);
            entry.deficit += Math.max(0, u.maxHp - u.hp);
            cardDeficitMap.set(u.card, entry);
          }
        }
        const hurtCards = Array.from(cardDeficitMap.values()).filter((e) => e.deficit > 1);
        if (!hurtCards.length) return;
        hurtCards.sort((a, b) => b.deficit - a.deficit);
        for (const cardEntry of hurtCards.slice(0, 2)) {
          for (const a of cardEntry.units) {
            if (a.alive) {
              this.heal(a, a.maxHp * 0.08, null);
              this.emit({ k: 'heal', x: a.x, y: a.y, z: a.gz + a.z + a.size });
            }
          }
        }
      });
    }

    if (this.has(team, 'hive_heart')) {
      for (const [at, count] of [[4, 2], [12, 1], [20, 1]] as const) {
        once(`hive_heart_${at}`, at, () => {
          const bees = live.filter((u) => u.alive && u.isSummon && u.mob.id === 'bee');
          const owner = live[0];
          if (!owner) return;
          for (let i = 0; i < count && bees.length + i < 2; i++) {
            this.summon(owner, 'bee', owner.x, owner.y + (i ? 20 : -20), 0.5, { lifespan: 10, fx: 'summon' });
          }
        });
      }
    }

    if (this.has(team, 'gong_fragment')) {
      once('gong_fragment', 4, () => {
        const foes = this.live[foe].filter((e) => !e.structure && !e.isSummon);
        if (!foes.length) return;
        foes.sort((a, b) => b.atk - a.atk);
        this.emit({ k: 'sfx', id: 'bell' });
        for (let i = 0; i < Math.min(2, foes.length); i++) {
          const e = foes[i];
          e.atk *= 0.75;
          this.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.z + e.size, s: '铜锣虚弱!', color: '#eccc68' });
          this.addTimedAction(8, () => { if (e.alive) e.atk /= 0.75; });
        }
      });
    }

    if (this.has(team, 'corrupted_beacon_core') && this.souls[team] >= 8 && this.t >= this.soulLock[team]) {
      const used = s.timers['beacon_core_count'] ?? 0;
      const cd = s.timers['beacon_core_cd'] ?? 0;
      if (used < 3 && this.t >= cd) {
        this.souls[team] -= 8;
        this.soulLock[team] = this.t + 1.0;
        s.timers['beacon_core_count'] = used + 1;
        s.timers['beacon_core_cd'] = this.t + 12.0;
        this.triggerCorruptedBeacon(team);
      }
    }
  }

  /** 火焰弹: a side's explosions are bigger and hit harder. */
  boomMul(team: 0 | 1): { r: number; d: number } {
    return this.has(team, 'fire_charge') ? { r: 1.3, d: 1.25 } : { r: 1, d: 1 };
  }

  densest(team: 0 | 1, r: number): Unit | null {
    let best: Unit | null = null;
    let bestN = -1;
    const arr = this.live[team];
    for (const a of arr) {
      if (a.structure) continue;
      let n = 0;
      for (const b of arr) if (Math.abs(a.x - b.x) < r && Math.abs(a.y - b.y) < r) n++;
      if (n > bestN) {
        bestN = n;
        best = a;
      }
    }
    return best;
  }

  // ───────────────────────── Damage & statuses ─────────────────────────

  /**
   * Applies damage. Returns damage dealt, or -1 if the hit was avoided entirely.
   */
  damage(
    src: Unit | null,
    t: Unit,
    amount: number,
    kind: DmgKind,
    o: { proj?: boolean; melee?: boolean; fire?: boolean; noCrit?: boolean; noDodge?: boolean; noThorns?: boolean; projRef?: Proj; aoe?: boolean; isPandaIntercept?: boolean } = {},
  ): number {
    if (!t.alive || amount <= 0 || t.ghost) return 0;
    if (!o.noDodge && kind !== 'dot') {
      if (t.fx.dodge > 0 && this.rng.chance(t.fx.dodge)) {
        this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: 0, c: NUM_DODGE });
        return -1;
      }
      const tb = this.beh(t);
      if (tb.onDamaged && tb.onDamaged(t, src, o, this)) return -1;
      if (o.proj && t.fx.projDodge > 0 && this.rng.chance(t.fx.projDodge)) {
        this.blink(t, 70);
        if (this.syn(t.team, 'ender') >= 1) t.critNext = true;
        return -1;
      }
      if (o.proj && t.ref.ghostCloak && this.t < t.ref.ghostCloak && this.rng.chance(0.25)) {
        this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: 0, c: NUM_DODGE });
        return -1;
      }
    }
    let d = amount;
    let crit = false;
    if (src) {
      if (src.fx.vsHighHp > 0 && t.hpFrac > 0.5) d *= 1 + src.fx.vsHighHp;
      if (src.fx.executeLowHp > 0) {
        if (t.hpFrac <= 0.25) d *= 1 + (src.fx.executeLowHpTier2 || src.fx.executeLowHp * 1.75);
        else if (t.hpFrac <= 0.50) d *= 1 + src.fx.executeLowHp;
      }
      if (src.mob.families.includes('illager') && this.syn(src.team, 'illager') >= 0 && !src.ref.illagerRushed && kind !== 'dot') {
        src.ref.illagerRushed = true;
        src.hasteT = Math.max(src.hasteT, 5.0);
        src.hasteMul = Math.max(src.hasteMul, 1.20);
        this.emit({ k: 'text', x: src.x, y: src.y, z: src.gz + src.z + src.size, s: '战意!', color: '#ff6b6b' });
      }
      if (this.syn(src.team, 'illager') >= 2) {
        d *= 1.12;
        const killStacks = this.sides[src.team].timers['illager_kill_stacks'] ?? 0;
        if (killStacks > 0) d *= 1 + killStacks * 0.02;
      }
      if (this.syn(src.team, 'arthropod') >= 1 && t.poisonStacks >= 5 && kind !== 'dot') {
        d += amount * 0.15;
      }
      if (src.fx.vsBurning > 0 && t.burnT > 0) d *= 1 + src.fx.vsBurning;
      if (src.fx.enderNonDot > 0 && kind !== 'dot') d *= 1 + src.fx.enderNonDot;
      if (!o.noCrit && kind !== 'dot') {
        const chance = src.fx.crit + (src.critNext ? 1 : 0);
        if (chance > 0 && this.rng.next() < chance) {
          d *= src.fx.critMul;
          crit = true;
          src.critNext = false;
        }
      }
      if (o.proj && src.fx.farBonus > 0 && Math.abs(src.x - t.x) > 250) d *= 1 + src.fx.farBonus;
    }
    if (src) {
      // Natural enemies (wolves vs skeletons, cold vs fire...).
      d *= counterMul(src.mob.id, t.mob.id);
      if (src.team !== t.team) {
        if (src.mob.families.includes('ender') && t.huntMarkT > 0 && this.has(src.team, 'combo_end_patrol') && kind !== 'dot') d *= 1.25;
        if ((t.chill > 0 || t.slowT > 0 || t.freezeT > 0) && COLD_MOBS.has(src.mob.id) && this.has(src.team, 'combo_frost')) d *= 1.2;
      }
      if (src.fx.vsUndead > 0 && t.mob.families.includes('undead')) d *= 1 + src.fx.vsUndead;
      if (src.fx.vsArthropod > 0 && t.mob.families.includes('arthropod')) d *= 1 + src.fx.vsArthropod;
      if (src.fx.density > 0 && (t.stunned || t.z > t.alt + 8)) d *= 1 + src.fx.density;
      if (src.empower && kind !== 'dot') {
        src.empower = false;
        src.desertEmpowerMul = 0;
        d *= 2;
      } else if (src.desertEmpowerT > 0 && src.desertEmpowerMul > 0 && kind !== 'dot') {
        d *= src.desertEmpowerMul;
        src.desertEmpowerMul = 0;
      }
      if (src.ref.salvoShot && kind !== 'dot') {
        src.ref.salvoShot = 0;
        d *= 1.4;
      }
      if (src.ref.ghostFlameBonus && kind !== 'dot') {
        d *= src.ref.ghostFlameBonus;
        delete src.ref.ghostFlameBonus;
      }
      if (src.ref.voidHuntBonus && kind !== 'dot') {
        d *= src.ref.voidHuntBonus;
        delete src.ref.voidHuntBonus;
      }
      if (src.ref.ignoreArmor35) {
        src.ref.activeIgnoreArmor35 = true;
        delete src.ref.ignoreArmor35;
      }
      if (this.has(src.team, 'combo_nether_crossfire') && !t.structure && kind !== 'dot') {
        const tm = this.sides[src.team].timers;
        if (!tm.nether_crossfire_cd || this.t >= tm.nether_crossfire_cd) {
          t.ref.netherCrossHits = t.ref.netherCrossHits || {};
          t.ref.netherCrossHits[src.card] = this.t;
          const hitCards = Object.entries(t.ref.netherCrossHits).filter(([_, hitT]) => this.t - (hitT as number) <= 5.0);
          if (hitCards.length >= 2) {
            tm.nether_crossfire_cd = this.t + 5.0;
            t.ref.netherCrossHits = {};
            d += src.atk * 0.40;
            this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '交叉火力!', color: '#ff4757' });
          }
        }
      }
      if (t.poisonT > 0 && this.has(src.team, 'combo_jungle_venom') && kind !== 'dot' && (src.mob.id === 'ocelot' || src.mob.families.includes('arthropod'))) {
        d *= 1.15;
      }
      if (this.has(src.team, 'combo_young_raid') && t.row === 'back' && (src.mob.id === 'baby_zombie' || src.mob.id === 'chicken_jockey')) {
        const tm = this.sides[src.team].timers;
        if (!tm.young_raid_cd || this.t >= tm.young_raid_cd) {
          tm.young_raid_cd = this.t + 6.0;
          for (const a of this.live[src.team]) {
            if (a.alive && !a.structure && (a.mob.id === 'baby_zombie' || a.mob.id === 'chicken_jockey') && a.card !== src.card) {
              a.atkSpd *= 1.15;
              this.addTimedAction(4.0, () => { if (a.alive) a.atkSpd /= 1.15; });
            }
          }
          this.emit({ k: 'text', x: src.x, y: src.y, z: src.gz + src.z + src.size, s: '幼尸奇袭!', color: '#2ed573' });
        }
      }
      const isLlama = src.mob.id === 'llama';
      const isCaravanPartner = src.mob.id === 'rampart_captain' || src.mob.id === 'armored_mountaineer';
      if (this.has(src.team, 'combo_caravan') && t.boss && t.channeling && (isLlama || isCaravanPartner)) {
        const tm = this.sides[src.team].timers;
        if (!tm.caravan_cd || this.t >= tm.caravan_cd) {
          t.ref.caravanHits = t.ref.caravanHits || {};
          if (isLlama) t.ref.caravanHits.llama = this.t;
          if (isCaravanPartner) t.ref.caravanHits.partner = this.t;
          if (t.ref.caravanHits.llama !== undefined && t.ref.caravanHits.partner !== undefined && Math.abs(t.ref.caravanHits.llama - t.ref.caravanHits.partner) <= 3.0) {
            tm.caravan_cd = this.t + 7.0;
            t.ref.caravanHits = {};
            this.addPosture(t, 30);
            this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size + 10, s: '驮队护航 +30破势!', color: '#f39c12' });
          }
        }
      }
      if (this.has(src.team, 'combo_bastion_lines') && src.mob.id === 'piglin_hunter') {
        const tm = this.sides[src.team].timers;
        if (!tm.bastion_lines_cd || this.t >= tm.bastion_lines_cd) {
          const meleeNeeds = new Set(['piglin_swordsman', 'armored_piglin']);
          let primed = false;
          for (const a of this.live[src.team]) {
            if (a.alive && !a.structure && meleeNeeds.has(a.mob.id) && (!a.target || a.target === t)) {
              a.ref.ignoreArmor35 = true;
              primed = true;
            }
          }
          if (primed) {
            tm.bastion_lines_cd = this.t + 6.0;
            this.emit({ k: 'text', x: src.x, y: src.y, z: src.gz + src.z + src.size, s: '堡垒破甲!', color: '#e67e22' });
          }
        }
      }
      if (this.has(src.team, 'combo_bird_scouts') && src.isRanged && t.boss && t.channeling && (t.glowT > 0 || t.ab.focused > 0 || (t.ref.scouted && this.t < t.ref.scouted))) {
        const tm = this.sides[src.team].timers;
        if (!tm.bird_scouts_cd || this.t >= tm.bird_scouts_cd) {
          tm.bird_scouts_cd = this.t + 8.0;
          this.addPosture(t, 30);
          this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size + 10, s: '双翼侦察 +30破势!', color: '#fffa65' });
        }
      }
    }
    if (src && kind !== 'dot' && !src.flying) {
      const dh = src.gh - t.gh;
      if (dh > 0) d *= 1 + Math.min(2, dh) * (src.isRanged ? 0.12 : 0.08);
    }
    if (t.glowT > 0) d *= 1.2;
    // 集火/协同标记 (parrot): 绑定队友受到直伤提升 +25/30/35%
    if (t.ref.parrotMarked && t.ref.parrotMarked.timer > 0 && kind !== 'dot') {
      if (src && t.ref.parrotMarked.boundCards && t.ref.parrotMarked.boundCards.includes(src.card)) {
        d *= (1 + t.ref.parrotMarked.factor);
      }
    } else if (t.ab.focused > 0 && kind !== 'dot') {
      d *= 1.18;
    }
    // 渡鸦侦察 (raven): 侦察双卡受到直伤 +10/12/15%
    if (t.ref.ravenMarked && t.ref.ravenMarked.timer > 0 && kind !== 'dot') {
      if (src && t.ref.ravenMarked.boundCards && t.ref.ravenMarked.boundCards.includes(src.card)) {
        d *= (1 + t.ref.ravenMarked.factor);
      }
    }
    // 熊猫拦截 (panda): 拦下一段直伤（拦截额≤来源H的30%，减伤40/45/55%），随后12%H盾
    if (kind !== 'dot' && !o.isPandaIntercept && !t.structure && t.ref.pandaGuardian) {
      const panda = t.ref.pandaGuardian;
      if (panda && panda.alive && (!panda.ab.rollCd || panda.ab.rollCd <= 0) && (panda.ab.rollCount ?? 0) < 2) {
        panda.ab.rollCount = (panda.ab.rollCount ?? 0) + 1;
        panda.ab.rollCd = panda.star >= 3 ? 7 : 8;
        panda.x = Math.max(panda.radius, Math.min(ARENA_W - panda.radius, t.x + (panda.team === 0 ? 15 : -15)));
        panda.y = Math.max(10, Math.min(ARENA_D - 10, t.y));
        this.emit({ k: 'tele', x: panda.x, y: panda.y, x2: panda.x, y2: panda.y, z: panda.gz });
        const maxIntercept = panda.maxHp * 0.30;
        const interceptDmg = Math.min(d, maxIntercept);
        const dmgReduction = panda.star >= 3 ? 0.55 : (panda.star === 2 ? 0.45 : 0.40);
        const actualIntercept = interceptDmg * (1 - dmgReduction);
        d -= interceptDmg;
        this.damage(src, panda, actualIntercept, kind, { ...o, isPandaIntercept: true });
        const shieldAmt = Math.min(panda.maxHp * 0.30, t.maxHp * 0.12);
        t.addSynergyShield('panda_shield', shieldAmt, 3.0);
        this.emit({ k: 'text', x: panda.x, y: panda.y, z: panda.gz + panda.size + 10, s: '舍身拦截!', color: '#eccc68' });
      }
    }
    // 城垛队长 (rampart_captain): 投射物减伤 35%
    if (o.proj && t.mob.id === 'rampart_captain') d *= t.star >= 3 ? 0.50 : 0.65;
    // 悬浮烈焰 (wildfire): 存活盾提供每面 6% 普通投射物减伤，最多 24%
    if (o.proj && !o.fire && t.mob.id === 'wildfire' && t.ref.wildfireShields) {
      const liveShields = (t.ref.wildfireShields as Unit[]).filter((s) => s.alive).length;
      const reduction = Math.min(0.24, liveShields * 0.06);
      if (reduction > 0) d *= (1 - reduction);
    }
    // 披甲猪灵 (armored_piglin): 普通攻防减伤 10%
    if (t.mob.id === 'armored_piglin' && (o.melee || o.proj)) d *= 0.90;
    // 哞菇 (mooshroom): 蓄力期间减伤 20%
    if (t.ab.charging > 0) d *= t.star >= 3 ? 0.65 : 0.80;
    // 海龟 (turtle): 绑定两卡、2格；其他直伤-12%；8秒开壳4秒，范围直伤减伤35/40/45%；单体投射物不冒充范围；替换额外小盾，不与多龟叠加。
    if (kind !== 'dot' && !t.structure) {
      const turtle = this.live[t.team].find((a) => a.alive && !a.structure && a.mob.id === 'turtle' && Math.hypot(a.x - t.x, a.y - t.y) <= 64);
      if (turtle) {
        if (turtle.ab.shellOpenT && (turtle.ab.shellOpenT as number) > 0) {
          if (o.aoe) {
            const aoeRed = turtle.star >= 3 ? 0.45 : (turtle.star === 2 ? 0.40 : 0.35);
            d *= (1 - aoeRed);
          } else {
            d *= 0.88;
          }
        } else {
          d *= 0.88;
        }
      }
    }
    // 小恶魂 (baby_ghast): 为非召唤非建筑队友分担 20% 直伤（★3 为 28%）
    if (kind !== 'dot' && !t.structure && !t.isSummon && t.mob.id !== 'baby_ghast') {
      const ghasts = this.live[t.team].filter((a) => a.alive && a.mob.id === 'baby_ghast' && a.hp > 1);
      if (ghasts.length > 0) {
        // 选择当前生命值最高的小恶魂共同分担压力
        const ghast = ghasts.reduce((best, cur) => (cur.hp > best.hp ? cur : best));
        const shareFrac = ghast.star >= 3 ? 0.28 : 0.20;
        const shared = Math.min(ghast.hp - 1, d * shareFrac);
        if (shared > 0) {
          d -= shared;
          ghast.hp -= shared;
          // 视觉与战斗飘字反馈：让分担效果清晰可见
          if (shared >= 8 || !ghast.ab.lastShareText || this.t - (ghast.ab.lastShareText as number) >= 0.5) {
            ghast.ab.lastShareText = this.t;
            this.emit({ k: 'text', x: ghast.x, y: ghast.y, z: ghast.gz + ghast.size + 10, s: `-${Math.round(shared)}分担`, color: '#ff6b81' });
          }
          // 联动: 幽火引航 (combo_ghost_flame)
          if (this.has(t.team, 'combo_ghost_flame')) {
            const sideTimers = this.sides[t.team].timers;
            sideTimers.ghostFlameDmg = (sideTimers.ghostFlameDmg || 0) + shared;
            const ghastTotalH = this.live[t.team].filter(a => a.mob.id === 'baby_ghast' && !a.isSummon).reduce((sum, u) => sum + u.maxHp, 0) || ghast.maxHp;
            if (sideTimers.ghostFlameDmg >= ghastTotalH * 0.20 && (!sideTimers.ghostFlameCd || this.t >= sideTimers.ghostFlameCd)) {
              sideTimers.ghostFlameDmg = 0;
              sideTimers.ghostFlameCd = this.t + 8.0;
              for (const a of this.live[t.team]) {
                if (a.alive && !a.structure && (a.mob.families.includes('nether') || a.mob.id === 'blaze' || a.mob.id === 'magma_cube')) {
                  a.ref.ghostFlameBonus = 1.30;
                }
              }
              this.emit({ k: 'text', x: ghast.x, y: ghast.y, z: ghast.gz + ghast.size + 15, s: '幽火引航 +30%火伤!', color: '#ff6b81' });
            }
          }
        }
      }
    }
    if ((t.poisonT > 0 || t.weakT > 0) && this.has((1 - t.team) as 0 | 1, 'fermented_eye')) d *= 1.2;
    if (t.freezeT > 0 && this.has((1 - t.team) as 0 | 1, 'blue_ice')) d *= 1.25;
    if (t.hpFrac > 0.5 && this.has(t.team, 'netherite_plate')) d *= 0.85;
    d *= t.fx.dmgTaken * this.buff(t.team, 'taken');
    if (o.fire) d *= this.buff(t.team, 'fire');
    if (o.proj) d *= t.fx.projTaken;
    if (o.fire) d *= t.fx.fireTaken;
    if (t.auraT > 0) d *= 0.85;
    if (this.has(t.team, 'tactic_shield_wall') && (t.row === 'back' || t.isRanged)) {
      const hasFront = this.live[t.team].some((u) => u.alive && !u.structure && (u.row === 'front' || u.mob.role === 'tank' || u.mob.role === 'melee'));
      if (hasFront) d *= 0.65;
    }
    if (this.fortTeam !== null && !t.flying && this.fortTeam[tidx(cellX(t.x), cellY(t.y))] === t.team) d *= FORT_TAKEN;
    const erodedArmor = Math.max(0, t.armor - t.erosionStacks * 0.04);
    const armor = Math.min(0.75, src && src.fx.breach > 0 ? erodedArmor * (1 - src.fx.breach) : (src && src.ref.activeIgnoreArmor35 ? erodedArmor * 0.65 : erodedArmor));
    if (src) delete src.ref.activeIgnoreArmor35;
    if (kind === 'phys') d *= 1 - armor;
    else if (kind === 'magic') d *= 1 - armor * 0.5;
    if (t.ref.closed) d *= 0.6;
    if (t.ref.undeadReviveDmgResist && this.t < t.ref.undeadReviveDmgResist) {
      d *= 0.80;
    }
    if (t.mob.families.includes('illager') && this.syn(t.team, 'illager') >= 0 && !t.ref.illagerRushed && kind !== 'dot') {
      t.ref.illagerRushed = true;
      t.hasteT = Math.max(t.hasteT, 5.0);
      t.hasteMul = Math.max(t.hasteMul, 1.20);
      this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '战意!', color: '#ff6b6b' });
    }
    if (this.t < (this.sides[t.team].timers['illager_horn_active'] ?? 0) && t.mob.families.includes('illager')) {
      d *= 0.85;
    }
    if (this.has(t.team, 'combo_armored_caravan') && !t.structure && !t.isSummon && (t.mob.id === 'armored_piglin' || t.mob.id === 'royal_guard') && (t.hp - d) / t.maxHp < 0.50) {
      const tm = this.sides[t.team].timers;
      if (!tm.armored_caravan_cd || this.t >= tm.armored_caravan_cd) {
        tm.armored_caravan_cd = this.t + 10.0;
        for (const a of this.live[t.team]) {
          if (a.alive && !a.structure && a.isRanged) {
            a.addSynergyShield('armored_caravan', a.maxHp * 0.12, 4.0);
            a.atkSpd *= 1.20;
            this.addTimedAction(4.0, () => { if (a.alive) a.atkSpd /= 1.20; });
          }
        }
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '重装护航!', color: '#e67e22' });
      }
    }
    d *= t.takenMul;
    if (t.echoMul > 0 && kind !== 'dot') {
      const echoBonus = d * t.echoMul;
      d *= 1 + t.echoMul;
      t.echoMul = 0;
      if (src && this.syn(src.team, 'sift') >= 2) {
        this.aoe(t.x, t.y, 45, src.team, (sub) => {
          if (sub !== t) this.damage(src, sub, echoBonus * 0.35, 'magic', { noCrit: true });
        });
      }
    }
    if (o.proj && t.ref.witherArmor) d *= 0.5;
    if (o.proj && src) {
      const dx = src.x - t.x;
      const dy = src.y - t.y;
      const hyp = Math.hypot(dx, dy);
      if (hyp > 0.1 && (dx * t.facing) / hyp >= 0.64) {
        if (t.mob.id === 'skeleton_vanguard') {
          d *= t.star >= 3 ? 0.70 : 0.75;
        } else if (t.mob.id === 'royal_guard' && !t.ref.enraged) {
          d *= 0.80;
        }
      }
    }
    if (this.has(t.team, 'iron_hide_amulet') && !t.structure && !t.isSummon && t.row === 'front') {
      const cardKey = `iron_hide_c${t.card}`;
      const lastProc = this.sides[t.team].timers[cardKey] ?? 0;
      const count = this.sides[t.team].timers[cardKey + '_count'] ?? 0;
      if (count < 2 && (lastProc === 0 || this.t - lastProc >= 10) && (t.hp - d) / t.maxHp < 0.50) {
        this.sides[t.team].timers[cardKey] = this.t;
        this.sides[t.team].timers[cardKey + '_count'] = count + 1;
        d *= 0.80;
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '铁皮护符!', color: '#95a5a6' });
        for (const a of this.live[t.team]) {
          if (a.card === t.card && a.alive && !a.structure) {
            a.takenMul *= 0.80;
            this.addTimedAction(4, () => { if (a.alive) a.takenMul /= 0.80; });
          }
        }
      }
    }
    if (this.has(t.team, 'feather_knot') && !t.structure && !t.isSummon && (t.row === 'back' || t.isRanged) && o.melee) {
      const cardKey = `feather_knot_c${t.card}`;
      if (!this.sides[t.team].timers[cardKey]) {
        this.sides[t.team].timers[cardKey] = 1;
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '轻羽结!', color: '#f1c40f' });
        for (const a of this.live[t.team]) {
          if (a.card === t.card && a.alive && !a.structure) {
            a.moveSpd *= 1.25;
            a.addSynergyShield('feather_knot', a.maxHp * 0.12, 3.0);
            this.addTimedAction(3, () => { if (a.alive) a.moveSpd /= 1.25; });
          }
        }
      }
    }
    const hadShield = t.shield > 0;
    if (t.shield > 0) {
      const { absorbed } = t.consumeShield(d);
      d -= absorbed;
      if (absorbed > 0) {
        if (this.has(t.team, 'combo_forest_watch') && (t.row === 'front' || t.mob.role === 'tank' || t.mob.role === 'melee')) {
          const tm = this.sides[t.team].timers;
          if (!tm.forest_watch_cd || this.t >= tm.forest_watch_cd) {
            tm.forest_watch_cd = this.t + 6.0;
            for (const a of this.live[t.team]) {
              if (a.alive && !a.structure && !a.isSummon && (a.mob.role === 'melee' || a.mob.role === 'tank')) {
                a.ref.forestWatchBonus = 0.60;
              }
            }
            this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '林地守望!', color: '#2ed573' });
          }
        }
        if (this.has(t.team, 'combo_construct_sentries') && t.mob.families.includes('construct')) {
          const tm = this.sides[t.team].timers;
          if (!tm.construct_sentries_cd || this.t >= tm.construct_sentries_cd) {
            tm.construct_sentries_cd = this.t + 8.0;
            for (const a of this.live[t.team]) {
              if (a.alive && !a.isSummon && a.mob.id === 'pumpkin_turret') {
                a.atkSpd *= 1.25;
                this.addTimedAction(4.0, () => { if (a.alive) a.atkSpd /= 1.25; });
              }
            }
            this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '构装哨阵!', color: '#e67e22' });
          }
        }
        if (this.has(t.team, 'combo_soul_lanterns')) {
          const tm = this.sides[t.team].timers;
          const count = tm.soul_lanterns_count || 0;
          if (count < 8 && (!tm.soul_lanterns_cd || this.t >= tm.soul_lanterns_cd)) {
            tm.soul_lanterns_cd = this.t + 6.0;
            tm.soul_lanterns_count = count + 1;
            this.addSouls(t.team, 2);
            this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '魂灯守望 +2魂!', color: '#00d2d3' });
          }
        }
        if (this.has(t.team, 'combo_deep_glimmer') && (t.mob.id === 'turtle' || t.mob.id === 'glow_squid')) {
          const tm = this.sides[t.team].timers;
          if (!tm.deep_glimmer_cd || this.t >= tm.deep_glimmer_cd) {
            tm.deep_glimmer_cd = this.t + 8.0;
            for (const a of this.live[t.team]) {
              if (a.alive && !a.structure && a.mob.id === 'pufferfish') {
                this.heal(a, a.maxHp * 0.10, null);
              }
            }
            this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '暗潮映光!', color: '#00cec9' });
          }
        }
        if (this.has(t.team, 'combo_thorn_wall') && t.mob.id === 'quick_vine') {
          const tm = this.sides[t.team].timers;
          if (!tm.thorn_wall_cd || this.t >= tm.thorn_wall_cd) {
            tm.thorn_wall_cd = this.t + 8.0;
            for (const a of this.live[t.team]) {
              if (a.alive && !a.structure && a.isRanged) {
                a.atkSpd *= 1.20;
                this.addTimedAction(4.0, () => { if (a.alive) a.atkSpd /= 1.20; });
              }
            }
            this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '藤墙毒刺!', color: '#26de81' });
          }
        }
      }
      if (hadShield && t.shield <= 0 && this.syn(t.team, 'construct') >= 2 && t.mob.families.includes('construct')) {
        this.emit({ k: 'boom', x: t.x, y: t.y, r: 50, color: '#c9c9c9', big: false });
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '脉冲!', color: '#cfe8ff' });
        this.aoe(t.x, t.y, 50, t.team, (e) => {
          this.damage(t, e, t.atk * 0.8, 'phys', { noCrit: true });
          e.erosionStacks = Math.min(6, (e.erosionStacks ?? 0) + 1);
          e.erosionTimer = 4.0;
        });
      }
      if (d <= 0) {
        this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: Math.round(absorbed), c: NUM_DOT });
        return 0;
      }
    }
    const hpDamage = Math.max(0, Math.min(t.hp, d));
    t.hp -= d;
    if (src) t.ref.lastHitBy = src;
    if (t.boss && t.channeling && kind !== 'dot' && hpDamage > 0 && t.maxHp > 0) {
      this.addPosture(t, (hpDamage / t.maxHp) * 1000);
    }
    // Hurt flash with a short cooldown so constantly-hit units don't stay tinted.
    if (t.animHit <= -0.3) t.animHit = 0.12;
    const card = this.cards[t.card];
    card.taken += d;
    if (src) this.cards[src.card].dmg += d;
    if (kind !== 'dot')
      this.emit({
        k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size,
        v: Math.round(d), c: crit ? NUM_CRIT : kind === 'true' ? NUM_TRUE : kind === 'magic' ? NUM_MAGIC : NUM_PHYS,
      });
    if (src && src.alive && kind !== 'dot' && src.fx.lifesteal > 0) this.heal(src, d * src.fx.lifesteal, null, 'lifesteal');
    // 亡灵伤害转恢复池：实际生命伤害的 20% (4档及以上 25%) 为同族最缺血原生单位恢复
    if (hpDamage > 0 && src && src.alive && kind !== 'dot' && !src.isSummon && src.mob.families.includes('undead') && this.syn(src.team, 'undead') >= 0) {
      const poolPct = this.syn(src.team, 'undead') >= 1 ? 0.25 : 0.20;
      const poolHeal = hpDamage * poolPct;
      let lowest: Unit | null = null;
      let lowestFrac = 1;
      for (const a of this.live[src.team]) {
        if (a.alive && !a.isSummon && !a.structure && a.mob.families.includes('undead') && a.hpFrac < lowestFrac) {
          lowestFrac = a.hpFrac;
          lowest = a;
        }
      }
      if (lowest && poolHeal > 0) {
        this.heal(lowest, poolHeal, src, 'lifesteal');
      }
    }
    if (src && src.alive && kind !== 'dot' && this.syn(src.team, 'nether') >= 1 && src.mob.families.includes('nether') && t.burnT > 0) {
      this.heal(src, d * 0.20, null, 'lifesteal');
    }
    if (d > 0 && src && src.mob.families.includes('arthropod') && this.syn(src.team, 'arthropod') >= 1 && kind !== 'dot') {
      const sc = this.cards[src.card];
      sc.ref = sc.ref ?? {};
      if ((sc.ref.erosionCd ?? 0) <= this.t) {
        sc.ref.erosionCd = this.t + 1.0;
        t.erosionStacks = Math.min(6, t.erosionStacks + 1);
        t.erosionTimer = 4.0;
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: `蚀甲 ${t.erosionStacks}`, color: '#b0794c' });
      }
      if (kind !== 'true' && !src.ref.inArthropodProc) {
        src.ref.inArthropodProc = true;
        this.damage(src, t, d * 0.15, 'true', { noCrit: true, noDodge: true });
        delete src.ref.inArthropodProc;
      }
    }
    if (o.melee && src && src.alive && t.fx.thorns > 0 && !o.noThorns)
      this.damage(t, src, d * t.fx.thorns, 'true', { noThorns: true, noCrit: true, noDodge: true });
    if (t.hp <= 0) this.kill(t, src);
    else {
      if (t.mob.id === 'wolf' && !t.isSummon && !t.wolfHasteUsed && t.hpFrac < 0.5 && this.has(t.team, 'combo_wolf_armor')) {
        t.wolfHasteUsed = true;
        t.hasteT = Math.max(t.hasteT, 4.0);
        t.hasteMul = Math.max(t.hasteMul, 1.20);
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '狼铠狂怒!', color: '#e0b25b' });
      }
      this.beh(t).afterDamaged?.(t, src, d, this);
    }
    return d;
  }

  /** Damage-over-time application (no armor, no dodge). */
  dot(t: Unit, d: number, src: Unit | null, cannotKill = false) {
    if (!t.alive || t.ghost) return;
    if (cannotKill) d = Math.min(d, Math.max(0, t.hp - 1));
    if (d <= 0) return;
    if (t.shield > 0) {
      const { absorbed } = t.consumeShield(d);
      d -= absorbed;
    }
    t.hp -= d;
    t.dotAcc += d;
    this.cards[t.card].taken += d;
    if (src) this.cards[src.card].dmg += d;
    if (t.hp <= 0) this.kill(t, src);
  }

  heal(t: Unit, amount: number, src: Unit | null, silent: boolean | 'lifesteal' = false) {
    if (!t.alive || amount <= 0 || (t.ref.healBlockT && t.ref.healBlockT > 0)) return;
    let actualAmt = amount;
    if (t.witherT > 0) actualAmt *= 0.5;
    const h = Math.min(actualAmt, t.maxHp - t.hp);
    if (h <= 0) return;
    t.hp += h;
    if (src) this.cards[src.card].heal += h;
    else this.cards[t.card].heal += h;
    if (silent === 'lifesteal') {
      if (h >= 2) {
        this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: Math.round(h), c: NUM_LIFESTEAL });
      }
    } else if (!silent && h >= 4) {
      this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: Math.round(h), c: NUM_HEAL });
      this.emit({ k: 'heal', x: t.x, y: t.y, z: t.gz + t.z });
    }
    // 联动: 金鳃伴游 (combo_axolotl_escort)
    if (src && src.mob.id === 'gold_axolotl' && this.has(src.team, 'combo_axolotl_escort')) {
      const tm = this.sides[src.team].timers;
      if (!tm.axolotl_escort_cd || this.t >= tm.axolotl_escort_cd) {
        tm.axolotl_escort_cd = this.t + 6.0;
        for (const a of this.live[src.team]) {
          if (a.alive && !a.structure && a.row === 'front' && a.mob.families.includes('aquatic')) {
            a.atkSpd *= 1.15;
            this.addTimedAction(4.0, () => { if (a.alive) a.atkSpd /= 1.15; });
          }
        }
        this.emit({ k: 'text', x: src.x, y: src.y, z: src.gz + src.z + src.size, s: '金鳃伴游!', color: '#f1c40f' });
      }
    }
  }

  triggerUndeadWill(team: 0 | 1) {
    const s = this.sides[team];
    const tm = s.timers;
    if (tm.undead_will_cd && this.t < tm.undead_will_cd) return;
    const curStacks = tm.undead_will_stacks || 0;
    if (curStacks >= 4) return;
    tm.undead_will_stacks = curStacks + 1;
    tm.undead_death_stacks = tm.undead_will_stacks;
    tm.undead_will_cd = this.t + 2.0;
    for (const u of this.live[team]) {
      if (u.alive && !u.isSummon && !u.structure && u.mob.families.includes('undead')) {
        u.atk *= 1.06;
        u.addSynergyShield('undead_will', u.maxHp * 0.05, 10.0);
      }
    }
    this.emit({ k: 'text', x: this.rowX(team, 'mid'), y: ARENA_D / 2, z: 80, s: `死志 +${tm.undead_will_stacks}`, color: '#a29bfe' });
  }

  kill(t: Unit, killer: Unit | null, silent = false) {
    if (!t.alive) return;
    // Undead synergy revive.
    if (!silent && !t.isSummon && !t.undeadRevived && this.syn(t.team, 'undead') >= 1 && t.mob.families.includes('undead')) {
      t.undeadRevived = true;
      t.revived = true;
      const tier = this.syn(t.team, 'undead');
      const pct = this.has(t.team, 'soul_lantern') ? 0.70 : (tier >= 2 ? 0.55 : 0.45);
      t.hp = t.maxHp * pct;
      if (this.has(t.team, 'soul_lantern')) t.atk *= 1.3;
      t.witherT = 0;
      t.burnT = 0;
      t.poisonT = 0;
      t.hasteT = Math.max(t.hasteT, 5.0);
      t.hasteMul = Math.max(t.hasteMul, 1.20);
      t.ref.undeadReviveDmgResist = this.t + 3.0;
      this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '复生!', color: '#9be36b' });
      this.emit({ k: 'spawn', u: t, fx: 'revive' });
      if (tier >= 2) {
        this.triggerUndeadWill(t.team);
      }
      return;
    }
    const side = this.sides[t.team];
    if (!silent && !t.isSummon && this.has(t.team, 'turtle_helmet') && !side.turtleUsed) {
      side.turtleUsed = true;
      t.hp = t.maxHp * (this.has(t.team, 'soul_lantern') ? 0.7 : 0.5);
      if (this.has(t.team, 'soul_lantern')) t.atk *= 1.3;
      this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '海龟壳!', color: '#7bed9f' });
      this.emit({ k: 'spawn', u: t, fx: 'revive' });
      return;
    }
    t.alive = false;
    t.hp = 0;
    t.deadT = 0;
    t.target = null;
    if (t.cast) {
      this.cancelCast(t, 'death');
    }
    if (t.boss && t.ref.bossNodes) {
      const nodes = t.ref.bossNodes as Unit[];
      for (const n of nodes) {
        if (n.alive) this.kill(n, killer, true);
      }
      t.ref.bossNodes = [];
    }
    if (t.ref.nodeOwner) {
      const owner = t.ref.nodeOwner as Unit;
      if (owner && owner.alive && owner.boss && owner.channeling && owner.cast && (!t.ref.castId || owner.cast.id === t.ref.castId)) {
        this.addPosture(owner, 50);
      }
    }
    if (!t.isSummon && !t.structure) this.lost[t.team]++;
    const card = this.cards[t.card];
    card.alive--;
    this.emit({ k: 'death', u: t });
    if (!silent && !t.isSummon && t.mob.families.includes('undead') && this.syn(t.team, 'undead') >= 2) {
      this.triggerUndeadWill(t.team);
    }
    if (killer && killer.team !== t.team) {
      const kc = this.cards[killer.card];
      kc.kills++;
      if (killer.fx.loot > 0 && kc.emeralds < 20) kc.emeralds = Math.min(20, kc.emeralds + killer.fx.loot);
      if (killer.fx.killAtk > 0 && killer.killStacks < 5) killer.killStacks++;
      if (this.syn(killer.team, 'beast') >= 1 && killer.mob.families.includes('beast') && !t.isSummon && !t.structure) {
        const cd = this.sides[killer.team].timers.beast_kill_cd ?? 0;
        if (this.t >= cd) {
          this.sides[killer.team].timers.beast_kill_cd = this.t + 2.0;
          const cur = this.sides[killer.team].beastKillStacks || 0;
          const maxKill = this.syn(killer.team, 'beast') >= 2 ? 6 : 5;
          if (cur < maxKill) {
            this.sides[killer.team].beastKillStacks = cur + 1;
            this.emit({ k: 'text', x: killer.x, y: killer.y, z: killer.gz + killer.z + killer.size, s: `野性猎杀 +${this.sides[killer.team].beastKillStacks}`, color: '#e0b25b' });
          }
        }
      }
      if (this.syn(killer.team, 'illager') >= 1 && !t.isSummon && !t.structure) {
        const hornActive = this.sides[killer.team].timers['illager_horn_active'] ?? 0;
        if (this.t < hornActive && !this.sides[killer.team].timers['illager_horn_extended']) {
          this.sides[killer.team].timers['illager_horn_extended'] = 1;
          this.sides[killer.team].timers['illager_horn_active'] += 2.0;
          killer.addSynergyShield('illager_kill', killer.maxHp * 0.12, 5.0);
          this.emit({ k: 'text', x: killer.x, y: killer.y, z: killer.gz + killer.z + killer.size, s: '号角延续!', color: '#ff4757' });
        }
      }
      if (this.syn(killer.team, 'illager') >= 2 && !t.isSummon && !t.structure) {
        const cur = this.sides[killer.team].timers['illager_kill_stacks'] ?? 0;
        if (cur < 8) this.sides[killer.team].timers['illager_kill_stacks'] = cur + 1;
      }
      if (killer.alive) this.beh(killer).onKill?.(killer, t, this);
    }
    if (t.ref.parrotMarked && t.ref.parrotMarked.timer > 0 && !t.ref.parrotMarked.transferred) {
      const nextFoe = this.live[(1 - t.team) as 0 | 1].find((f) => f.alive && !f.structure && f.id !== t.id);
      if (nextFoe) {
        nextFoe.ref.parrotMarked = { ...t.ref.parrotMarked, transferred: true };
        this.emit({ k: 'text', x: nextFoe.x, y: nextFoe.y, z: nextFoe.gz + nextFoe.size, s: '标记转移!', color: '#ff4757' });
      }
    }
    if (!silent) this.beh(t).onDeath?.(t, this, killer);
    const foe = (1 - t.team) as 0 | 1;
    if (!silent && !t.isSummon && !t.structure && this.hasSoulMechanic[foe] && this.soulEnemyKills[foe] < 12) {
      this.soulEnemyKills[foe]++;
      this.addSouls(foe, 1);
    }
    if (!silent && this.has(t.team, 'gunpowder') && !t.structure && this.rng.chance(0.3)) {
      const bm = this.boomMul(t.team);
      const dmg = t.maxHp * 0.25 * bm.d;
      this.emit({ k: 'boom', x: t.x, y: t.y, r: 60 * bm.r, color: '#ff8844', big: false });
      this.emit({ k: 'sfx', id: 'explode', v: 0.5 });
      this.aoe(t.x, t.y, 60 * bm.r, t.team, (e) => this.damage(t, e, dmg, 'phys', { noCrit: true }));
    }
    // Archetype triggers of the side that got the kill.
    if (!silent && !t.structure) {
      if (t.burnT > 0 && this.syn(foe, 'nether') >= 2 && !this.has(foe, 'magma_cream')) {
        const netherAllies = this.live[foe].filter((u) => u.alive && !u.isSummon && u.mob.families.includes('nether'));
        const avgAtk = netherAllies.length ? netherAllies.reduce((sum, u) => sum + u.atk, 0) / netherAllies.length : 30;
        const maxDmg = t.boss ? avgAtk * 3 : t.maxHp * 0.06;
        const dmg = Math.min(t.maxHp * 0.06, maxDmg);
        this.emit({ k: 'boom', x: t.x, y: t.y, r: 60, color: '#ff7a1a', big: false });
        this.emit({ k: 'sfx', id: 'fireball', v: 0.5 });
        this.aoe(t.x, t.y, 60, foe, (e) => {
          this.damage(netherAllies[0] ?? null, e, dmg, 'magic', { noCrit: true, fire: true });
        });
      }
      // 岩浆膏: burning enemies go off.
      if (t.burnT > 0 && this.has(foe, 'magma_cream')) {
        const bm = this.boomMul(foe);
        const r = 70 * bm.r;
        const dmg = t.maxHp * 0.2 * bm.d;
        const src = (t.ref.burnSrc as Unit | null) ?? null;
        this.emit({ k: 'boom', x: t.x, y: t.y, r, color: '#ff7a1a', big: false });
        this.emit({ k: 'sfx', id: 'fireball', v: 0.5 });
        this.aoe(t.x, t.y, r, foe, (e) => {
          this.damage(src, e, dmg, 'magic', { noCrit: true, fire: true });
          this.burn(e, Math.max(4, dmg * 0.1), 3, src);
        });
      }
      // 河豚: poison jumps to the two nearest neighbours.
      if (t.poisonT > 0 && t.poisonStacks > 0 && this.has(foe, 'pufferfish')) {
        const near = this.live[t.team]
          .filter((e) => e !== t && e.alive && !e.structure && Math.hypot(e.x - t.x, e.y - t.y) < 90)
          .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))
          .slice(0, 2);
        for (const e of near) {
          for (let k = 0; k < t.poisonStacks; k++) this.poison(e, t.poisonDps, Math.max(3, t.poisonT), Math.max(t.poisonStacks, 3), (t.ref.poisonSrc as Unit | null) ?? null);
          this.emit({ k: 'hit', x: e.x, y: e.y, z: e.gz + e.z + e.size * 0.5, big: false, color: '#6dd14a' });
        }
      }
      // 回响碎片: every fallen ally sharpens the rest.
      if (this.has(t.team, 'echo_shard') && side.echo < 10) side.echo++;
    }
    if (this.has(foe, 'sculk_catalyst') && !t.isSummon) for (const a of this.live[foe]) this.heal(a, a.maxHp * 0.02, null, true);
    // 筛界 ③: the fallen enemy's soul drifts to the nearest Sift mob of the other side.
    if (!t.structure && !t.isSummon && !t.ghost && this.syn(foe, 'sift') >= 1) {
      const cd = this.sides[foe].timers.sift_kill_cd ?? 0;
      if (this.t >= cd) {
        this.sides[foe].timers.sift_kill_cd = this.t + 1.0;
        let best: Unit | null = null;
        let bd = Infinity;
        for (const a of this.live[foe]) {
          if (!a.alive || !a.mob.families.includes('sift') || a.hpFrac >= 1) continue;
          const d = Math.hypot(a.x - t.x, a.y - t.y);
          if (d < bd) (bd = d), (best = a);
        }
        if (best) {
          this.emit({ k: 'beam', a: t, b: best, color: '#7ff5de', t: 0.4 });
          this.heal(best, best.maxHp * 0.12, null);
        }
      }
    }
    // Respawn anchor: first fully wiped card revives once.
    if (!silent && card.alive <= 0 && this.has(t.team, 'respawn_anchor') && !side.timers.anchor && !t.isSummon) {
      side.timers.anchor = 1;
      card.anchorUsed = true;
      for (const u of this.units) {
        if (u.card !== t.card || u.alive || u.isSummon) continue;
        u.alive = true;
        u.hp = u.maxHp * (this.has(u.team, 'soul_lantern') ? 0.7 : 0.5);
        if (this.has(u.team, 'soul_lantern')) u.atk *= 1.3;
        u.deadT = 0;
        u.burnT = u.poisonT = u.witherT = 0;
        u.ref.anchor = 1;
        card.alive++;
        this.live[u.team].push(u);
        this.emit({ k: 'spawn', u, fx: 'revive' });
      }
      this.emit({ k: 'text', x: t.x, y: t.y, z: 80, s: '重生锚!', color: '#c56cf0' });
    }
  }

  private tickStatus(u: Unit, dt: number) {
    if (u.channeling) {
      if (!u.cast) {
        u.channelT -= dt;
        if (u.channelT <= 0) {
          u.channeling = false;
        }
      }
    }
    if (u.ab.focused > 0) u.ab.focused = Math.max(0, u.ab.focused - dt);
    if (u.ref.parrotMarked && u.ref.parrotMarked.timer > 0) {
      u.ref.parrotMarked.timer -= dt;
      if (u.ref.parrotMarked.timer <= 0) delete u.ref.parrotMarked;
    }
    if (u.ref.ravenMarked && u.ref.ravenMarked.timer > 0) {
      u.ref.ravenMarked.timer -= dt;
      if (u.ref.ravenMarked.timer <= 0) delete u.ref.ravenMarked;
    }
    if (u.stunT > 0) u.stunT -= dt;
    if (u.levT > 0) u.levT -= dt;
    if (u.slowT > 0) u.slowT -= dt;
    if (u.chillT > 0) {
      u.chillT -= dt;
      if (u.chillT <= 0) u.chill = 0;
    }
    if (u.hungerT > 0) u.hungerT -= dt;
    if (u.freezeT > 0) {
      u.freezeT -= dt;
      this.dot(u, u.freezeDps * dt, u.ref.freezeSrc ?? null);
    }
    if (u.weakT > 0) u.weakT -= dt;
    if (u.glowT > 0) u.glowT -= dt;
    if (u.blindT > 0) u.blindT -= dt;
    if (u.invisT > 0) {
      u.invisT -= dt;
      u.ref.invisBonus = 1;
    }
    if (u.tauntT > 0) u.tauntT -= dt;
    if (u.hasteT > 0) u.hasteT -= dt;
    if (u.speedT > 0) u.speedT -= dt;
    if (u.auraT > 0) u.auraT -= dt;
    u.tickShields(dt);
    if (u.huntMarkT > 0) u.huntMarkT -= dt;
    if (u.desertEmpowerT > 0) {
      u.desertEmpowerT -= dt;
      if (u.desertEmpowerT <= 0) u.desertEmpowerMul = 0;
    }
    if (u.erosionTimer > 0) {
      u.erosionTimer -= dt;
      if (u.erosionTimer <= 0) u.erosionStacks = 0;
    }
    if (u.burnT > 0) {
      u.burnT -= dt;
      if (u.immune & IMM_BURN) u.burnT = 0;
      else this.dot(u, u.burnDps * dt, u.ref.burnSrc ?? null);
    }
    if (u.poisonT > 0) {
      u.poisonT -= dt;
      if (u.poisonT <= 0) u.poisonStacks = 0;
      this.dot(u, u.poisonDps * u.poisonStacks * dt, u.ref.poisonSrc ?? null, true);
    }
    if (u.witherT > 0) {
      u.witherT -= dt;
      this.dot(u, u.witherDps * dt, u.ref.witherSrc ?? null);
    }
    if (!u.alive) return;
    if (!u.flying && u.z < 4) {
      const surf = this.terrain.s[tidx(cellX(u.x), cellY(u.y))];
      if (surf === TS.LAVA && !isFireproof(u.mob) && !(u.immune & IMM_BURN)) this.burn(u, u.maxHp * 0.04, 1.5, null);
      else if (surf === TS.WATER) {
        if (hatesWater(u.mob)) this.dot(u, u.maxHp * 0.03 * dt, null);
        else if (isAquatic(u.mob)) this.heal(u, u.maxHp * 0.01 * dt, null, true);
      } else if (surf === TS.OUCH && !u.structure) {
        if (hatesOuch(u.mob)) this.dot(u, u.maxHp * (u.boss ? 0.01 : 0.04) * dt, null);
        else this.heal(u, u.maxHp * 0.02 * dt, null, true);
      }
    }
    if (this.tideOn && !u.structure && !u.ghost && !this.tideImmune(u)) this.dot(u, u.maxHp * (u.boss ? 0.006 : 0.02) * dt, null);
    if (u.regenT > 0) {
      u.regenT -= dt;
      this.heal(u, u.maxHp * u.regenRate * dt, null, true);
    }
    if (u.fx.regen > 0) this.heal(u, u.maxHp * u.fx.regen * dt, null, true);
    u.dotTick -= dt;
    if (u.dotTick <= 0) {
      u.dotTick = 0.5;
      if (u.dotAcc >= 1) {
        this.emit({ k: 'num', x: u.x, y: u.y, z: u.gz + u.z + u.size, v: Math.round(u.dotAcc), c: NUM_DOT });
        u.dotAcc = 0;
      }
    }
  }

  burn(t: Unit, dps: number, dur: number, src: Unit | null) {
    if (t.immune & IMM_BURN || !t.alive || this.sides[t.team].fireImmune) return;
    if (src) {
      dps *= src.fx.burnMul;
      dur += src.fx.burnMul > 1.5 ? 1 : 0;
      if (this.syn(src.team, 'nether') >= 2) dps *= 2;
    }
    t.burnDps = Math.max(t.burnT > 0 ? t.burnDps : 0, dps);
    t.burnT = Math.max(t.burnT, dur);
    t.ref.burnSrc = src;
  }

  poison(t: Unit, dps: number, dur: number, maxStacks: number, src: Unit | null) {
    if (t.immune & IMM_POISON || !t.alive) return;
    if (src) dps *= src.fx.poisonMul;
    t.poisonDps = Math.max(t.poisonT > 0 ? t.poisonDps : 0, dps);
    t.poisonStacks = Math.min(Math.max(maxStacks, 1), t.poisonStacks + 1);
    t.poisonT = Math.max(t.poisonT, dur);
    t.ref.poisonSrc = src;
  }

  wither(t: Unit, dps: number, dur: number, src: Unit | null) {
    if (t.immune & IMM_WITHER || !t.alive) return;
    t.witherDps = Math.max(t.witherT > 0 ? t.witherDps : 0, dps);
    t.witherT = Math.max(t.witherT, dur);
    t.ref.witherSrc = src;
  }

  /**
   * Freezing: damage over time plus a 30% slow. Cold creatures shrug it off; fire creatures
   * (blazes, magma cubes...) take three times the damage.
   */
  freeze(t: Unit, dps: number, dur: number, src: Unit | null) {
    if (!t.alive || COLD_MOBS.has(t.mob.id) || t.boss && t.mob.id === 'wither_boss') return;
    if (FIRE_BODY.has(t.mob.id)) dps *= 3;
    if (src && this.has(src.team, 'combo_frost')) dur *= 1.5;
    if (src && this.has(src.team, 'blue_ice')) dur += 1;
    t.freezeDps = Math.max(t.freezeT > 0 ? t.freezeDps : 0, dps);
    t.freezeT = Math.max(t.freezeT, dur);
    t.ref.freezeSrc = src;
    if (t.burnT > 0) t.burnT = Math.max(0, t.burnT - dur);
  }

  slow(t: Unit, move: number, atk: number, dur: number, srcTeam?: 0 | 1) {
    if (t.immune & IMM_SLOW) return;
    t.slowMove = Math.max(t.slowT > 0 ? t.slowMove : 0, move);
    t.slowAtk = Math.max(t.slowT > 0 ? t.slowAtk : 0, atk);
    t.slowT = Math.max(t.slowT, dur);
    const team = srcTeam ?? ((1 - t.team) as 0 | 1);
    if (this.has(team, 'combo_frost_patrol')) {
      const tm = this.sides[team].timers;
      if (!tm.frost_patrol_cd || this.t >= tm.frost_patrol_cd) {
        tm.frost_patrol_cd = this.t + 8.0;
        const conditionCards = new Set(['snow_fox', 'polar_bear', 'stray']);
        for (const a of this.live[team]) {
          if (a.alive && !a.structure && !a.isSummon && conditionCards.has(a.mob.id)) {
            a.addSynergyShield('frost_patrol', a.maxHp * 0.12, 5.0);
          }
        }
        this.emit({ k: 'text', x: this.rowX(team, 'mid'), y: ARENA_D / 2, z: 90, s: '寒冬巡卫!', color: '#70a1ff' });
      }
    }
  }

  chillHit(t: Unit, srcTeam?: 0 | 1) {
    if (t.immune & IMM_SLOW) return;
    t.chill = Math.min(3, t.chill + 1);
    t.chillT = 2;
    const team = srcTeam ?? ((1 - t.team) as 0 | 1);
    if (this.has(team, 'combo_frost_patrol')) {
      const tm = this.sides[team].timers;
      if (!tm.frost_patrol_cd || this.t >= tm.frost_patrol_cd) {
        tm.frost_patrol_cd = this.t + 8.0;
        const conditionCards = new Set(['snow_fox', 'polar_bear', 'stray']);
        for (const a of this.live[team]) {
          if (a.alive && !a.structure && !a.isSummon && conditionCards.has(a.mob.id)) {
            a.addSynergyShield('frost_patrol', a.maxHp * 0.12, 5.0);
          }
        }
        this.emit({ k: 'text', x: this.rowX(team, 'mid'), y: ARENA_D / 2, z: 90, s: '寒冬巡卫!', color: '#70a1ff' });
      }
    }
  }

  hunger(t: Unit, dur: number) {
    if (t.immune & IMM_HUNGER) return;
    t.hungerT = Math.max(t.hungerT, dur);
  }

  private checkRavenInterrupt(t: Unit) {
    if (t.ref.ravenMarked && t.ref.ravenMarked.timer >= 2.0 && !t.ref.ravenMarked.triggered) {
      t.ref.ravenMarked.triggered = true;
      const ravenSrc = t.ref.ravenMarked.src;
      if (ravenSrc && ravenSrc.alive) {
        ravenSrc.ab.markCd = Math.max(0, ravenSrc.ab.markCd - 2.0);
        for (const a of this.live[ravenSrc.team]) {
          if (a.alive && !a.structure) {
            a.hasteT = Math.max(a.hasteT, 3.0);
            a.hasteMul = Math.max(a.hasteMul, 1.15);
          }
        }
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size + 15, s: '破绽打断!', color: '#ff4757' });
      }
    }
  }

  stun(t: Unit, dur: number) {
    this.checkRavenInterrupt(t);
    if (t.immune & IMM_STUN || t.boss) {
      if (t.boss) t.stunT = Math.max(t.stunT, dur * 0.2);
      return;
    }
    t.stunT = Math.max(t.stunT, dur);
  }

  startCast(
    u: Unit,
    name: string,
    windupDuration: number,
    recoveryDuration: number,
    opts: {
      target?: Unit | null;
      targetPos?: { x: number; y: number };
      onRelease?: (cast: CastState) => void;
      onFinish?: (cast: CastState) => void;
      onCancel?: (reason: CastCancelReason) => void;
      data?: Record<string, any>;
    } = {}
  ): CastState | null {
    if (!u.alive || u.stunT > 0 || u.channeling || u.cast) return null;
    const castId = u.castSeq++;
    const cast: CastState = {
      id: castId,
      name,
      phase: 'windup',
      startTime: this.t,
      windupDuration,
      endTime: this.t + windupDuration,
      recoveryDuration,
      posture: 0,
      target: opts.target,
      targetPos: opts.targetPos,
      settled: false,
      onRelease: opts.onRelease,
      onFinish: opts.onFinish,
      onCancel: opts.onCancel,
      data: opts.data,
    };
    u.cast = cast;
    u.channeling = true;
    u.channelT = windupDuration;
    u.posture = 0;
    u.moving = false;
    return cast;
  }

  extendCast(u: Unit, dur: number) {
    if (!u.cast || u.cast.phase !== 'windup') {
      if (u.channeling) u.channelT += dur;
      return;
    }
    u.cast.endTime += dur;
    u.channelT = Math.max(0, u.cast.endTime - this.t);
  }

  cancelCast(u: Unit, reason: CastCancelReason = 'target_lost') {
    if (!u.cast) {
      u.channeling = false;
      u.channelT = 0;
      u.posture = 0;
      return;
    }
    const c = u.cast;
    u.cast = null;
    u.channeling = false;
    u.channelT = 0;
    u.posture = 0;
    c.phase = 'idle';
    c.cancelReason = reason;
    try {
      c.onCancel?.(reason);
    } catch (e) {
      console.error('Error in onCancel', e);
    }
  }

  breakPosture(t: Unit) {
    if (!t.boss) return;
    t.posture = 0;
    t.channeling = false;
    t.channelT = 0;
    const stunDur = t.cast ? 1.5 : 2.5;
    t.stunT = Math.max(t.stunT, stunDur);
    if (t.cast) {
      const c = t.cast;
      t.cast = null;
      c.phase = 'break';
      c.cancelReason = 'break';
      c.settled = true;
      try {
        c.onCancel?.('break');
      } catch (e) {
        console.error('Error onCancel cast', e);
      }
    }
    this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size + 10, s: '破势达成！', color: '#ffc93c' });
    this.emit({ k: 'sfx', id: 'anvil_land' });
  }

  addPosture(t: Unit, amt: number) {
    if (!t.boss || !t.channeling || (t.cast && t.cast.phase !== 'windup')) return;
    this.checkRavenInterrupt(t);
    t.posture = Math.min(100, t.posture + amt);
    if (t.cast) t.cast.posture = t.posture;
    if (t.posture >= 100) {
      this.breakPosture(t);
    }
  }

  knockup(t: Unit, dur: number) {
    if (t.immune & IMM_STUN || t.boss) return;
    t.stunT = Math.max(t.stunT, dur);
    if (!t.flying && !(t.immune & IMM_KB)) t.vz = 260 + dur * 80;
  }

  levitate(t: Unit, dur: number, fallDmg: number) {
    if (t.immune & IMM_STUN || t.boss || t.structure) return;
    t.levT = Math.max(t.levT, dur);
    t.levDmg = Math.max(t.levDmg, fallDmg);
  }

  knock(t: Unit, fx: number, fy: number, power: number) {
    if (t.immune & IMM_KB || t.structure || !t.alive) return;
    let dx = t.x - fx;
    let dy = t.y - fy;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) {
      dx = t.team === 0 ? -1 : 1;
      dy = 0;
    } else {
      dx /= d;
      dy /= d;
    }
    let p = power / t.mass;
    if (t.ref.dolphinEscort && this.t < t.ref.dolphinEscort.expireAt) {
      p *= 0.5;
      if (!t.ref.dolphinEscort.roundUsed) {
        t.ref.dolphinEscort.roundUsed = true;
        t.atkTimer = Math.max(0, t.atkTimer - t.cd * t.ref.dolphinEscort.advanceRatio);
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '破浪反击!', color: '#70a1ff' });
      }
    }
    t.vx += dx * p * 3;
    t.vy += dy * p * 1.6;
    if (!t.flying && p > 70 && t.z <= 1) t.vz = Math.max(t.vz, 120);
    // 联动: 潮路护航 (combo_sea_routes)
    if (this.has(t.team, 'combo_sea_routes') && (t.ref.seaEscort || t.ref.turtleShell)) {
      const tm = this.sides[t.team].timers;
      if (!tm.sea_routes_cd || this.t >= tm.sea_routes_cd) {
        tm.sea_routes_cd = this.t + 8.0;
        t.atkTimer = Math.max(0, t.atkTimer - t.cd * 0.50);
        this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '潮路护航!', color: '#2ed573' });
      }
    }
  }

  /** Called whenever a unit teleports (末影之眼 primes its next hit). */
  teleported(u: Unit) {
    if (this.has(u.team, 'ender_eye')) {
      u.critNext = true;
      u.empower = true;
    }
    // 联动: 虚空接力 (combo_void_relay)
    if (this.has(u.team, 'combo_void_relay')) {
      const tm = this.sides[u.team].timers;
      if (!tm.void_relay_cd || this.t >= tm.void_relay_cd) {
        tm.void_relay_cd = this.t + 8.0;
        for (const a of this.live[u.team]) {
          if (a.alive && !a.structure && (a.mob.id === 'sprout' || a.mob.id === 'snareling' || a.mob.id === 'iceologer')) {
            a.ref.voidRelayBonus = 20;
          }
        }
        this.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '虚空接力!', color: '#a55eea' });
      }
    }
  }

  blink(t: Unit, dist: number) {
    const a = this.rng.range(0, Math.PI * 2);
    const nx = clampX(t.x + Math.cos(a) * dist, t.radius);
    const ny = clampY(t.y + Math.sin(a) * dist * 0.7);
    this.emit({ k: 'tele', x: t.x, y: t.y, x2: nx, y2: ny, z: t.gz + t.z });
    this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: 0, c: NUM_DODGE });
    t.x = t.px = nx;
    t.y = t.py = ny;
    this.teleported(t);
  }

  /** Iterate enemies of `team` within r of (x,y); f = normalized distance 0..1. */
  aoe(x: number, y: number, r: number, team: 0 | 1, fn: (e: Unit, f: number) => void) {
    const foes = this.live[(1 - team) as 0 | 1];
    for (let i = 0; i < foes.length; i++) {
      const e = foes[i];
      if (!e.alive) continue;
      const rr = r + e.radius;
      const dx = e.x - x;
      if (dx > rr || dx < -rr) continue;
      const dy = (e.y - y) * 1.15;
      const d2 = dx * dx + dy * dy;
      if (d2 > rr * rr) continue;
      fn(e, Math.sqrt(d2) / rr);
    }
  }

  aoeAllies(x: number, y: number, r: number, team: 0 | 1, fn: (a: Unit) => void) {
    for (const a of this.live[team]) {
      if (!a.alive) continue;
      const rr = r + a.radius;
      if ((a.x - x) ** 2 + (a.y - y) ** 2 <= rr * rr) fn(a);
    }
  }

  // ───────────────────────── Collision ─────────────────────────

  private separate() {
    const head = this.gridHead;
    head.fill(-1);
    const next = this.gridNext;
    const us = this.units;
    for (let i = 0; i < us.length; i++) {
      const u = us[i];
      if (!u.alive) continue;
      const cx = Math.max(0, Math.min(GW - 1, Math.floor(u.x / GC) + 1));
      const cy = Math.max(0, Math.min(GH - 1, Math.floor(u.y / GC) + 1));
      const c = cy * GW + cx;
      next[i] = head[c];
      head[c] = i;
    }
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive || a.ghost) continue;
      const cx = Math.max(0, Math.min(GW - 1, Math.floor(a.x / GC) + 1));
      const cy = Math.max(0, Math.min(GH - 1, Math.floor(a.y / GC) + 1));
      for (let oy = -1; oy <= 1; oy++) {
        const yy = cy + oy;
        if (yy < 0 || yy >= GH) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = cx + ox;
          if (xx < 0 || xx >= GW) continue;
          for (let j = head[yy * GW + xx]; j !== -1; j = next[j]) {
            if (j <= i) continue;
            const b = us[j];
            if (a.flying !== b.flying || b.ghost) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const min = (a.radius + b.radius) * 0.95;
            const d2 = dx * dx + dy * dy;
            if (d2 >= min * min) continue;
            const d = Math.sqrt(d2) || 0.01;
            const push = (min - d) * 0.5;
            const nx = d > 0.01 ? dx / d : 1;
            const ny = d > 0.01 ? dy / d : 0;
            const ma = a.speed <= 0 || a.structure ? 1e6 : a.mass;
            const mb = b.speed <= 0 || b.structure ? 1e6 : b.mass;
            const wa = mb / (ma + mb);
            const wb = ma / (ma + mb);
            a.x = clampX(a.x - nx * push * wa * 2, a.radius);
            a.y = clampY(a.y - ny * push * wa * 2);
            b.x = clampX(b.x + nx * push * wb * 2, b.radius);
            b.y = clampY(b.y + ny * push * wb * 2);
          }
        }
      }
    }
  }
}

export function clampX(x: number, r: number) {
  return Math.max(r, Math.min(ARENA_W - r, x));
}
export function clampY(y: number) {
  return Math.max(10, Math.min(ARENA_D - 10, y));
}

function starMulOf(m: MobDef, star: number) {
  return starStatMul(m, star);
}

export const PROJ_SPEC: Record<ProjectileKind, { mode: 0 | 1 | 2; speed: number; arc: number; aoe: number; lead: boolean; color: string; fire?: boolean; magic?: boolean }> = {
  arrow: { mode: 1, speed: 620, arc: 0, aoe: 0, lead: true, color: '#e8dcc0' },
  bolt: { mode: 1, speed: 760, arc: 0, aoe: 0, lead: true, color: '#d6d6d6' },
  snowball: { mode: 0, speed: 420, arc: 26, aoe: 0, lead: true, color: '#ffffff' },
  potion: { mode: 0, speed: 330, arc: 70, aoe: 50, lead: true, color: '#c050ff', magic: true },
  fireball: { mode: 1, speed: 400, arc: 0, aoe: 0, lead: true, color: '#ffa31a', fire: true },
  big_fireball: { mode: 0, speed: 230, arc: 10, aoe: 70, lead: false, color: '#ff7a1a', fire: true },
  trident: { mode: 1, speed: 640, arc: 0, aoe: 0, lead: true, color: '#7fd8e8' },
  shulker_bullet: { mode: 2, speed: 200, arc: 0, aoe: 0, lead: false, color: '#f5f0c8' },
  wither_skull: { mode: 1, speed: 430, arc: 0, aoe: 40, lead: true, color: '#3a3a3a' },
  blue_skull: { mode: 1, speed: 250, arc: 0, aoe: 70, lead: true, color: '#5ab0ff' },
  wind_charge: { mode: 1, speed: 420, arc: 0, aoe: 60, lead: true, color: '#bfe6ff' },
  dragon_fireball: { mode: 0, speed: 300, arc: 30, aoe: 70, lead: false, color: '#d36bff', magic: true },
  ice_ball: { mode: 0, speed: 380, arc: 24, aoe: 0, lead: true, color: '#cfeeff' },
  chin_spike: { mode: 2, speed: 300, arc: 0, aoe: 0, lead: false, color: '#ffcf6a' },
  quill: { mode: 2, speed: 320, arc: 0, aoe: 0, lead: false, color: '#27ae60' },
  goo: { mode: 0, speed: 260, arc: 60, aoe: 0, lead: false, color: '#e8d84a' },
};

export type { Unit };
export { baseFx };
