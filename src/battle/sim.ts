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
  NUM_CRIT, NUM_DODGE, NUM_DOT, NUM_HEAL, NUM_MAGIC, NUM_PHYS, NUM_TRUE, Unit, baseFx, resetIds,
  type BEvent, type Delayed, type Proj, type UnitFx, type Zone,
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
    })) as unknown as [SideState, SideState];
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
          kills: 0, emeralds: 0, anchorUsed: false,
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
    const guard = this.plans.find((p, i) => this.cards[i].team === u.team && !mobDef(p.mob).boss && !mobDef(p.mob).structure);
    if (guard) for (const dy of [-34, 34]) this.summon(u, guard.mob, u.x + (u.team === 0 ? 30 : -30), u.y + dy, 0.8, { fx: 'summon' });
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
      for (const u of this.live[team]) if (has('enchanted_apple')) u.shield = u.maxHp * 0.3;
      if (has('bell')) for (const e of this.live[foe]) e.glowT = 6;
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
      team, mob: plan.mob, star: plan.star, spawned: 0, alive: 0, dmg: 0, taken: 0, heal: 0, kills: 0, emeralds: 0, anchorUsed: false,
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
    if (b.move?.(u, this, dt)) return;
    this.defaultAct(u, dt, b);
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
    for (const c of blastTerrain(this.terrain, x, y, r)) {
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
    u.atkTimer -= dt * this.atkSpeedOf(u);
    if (u.atkTimer < 0) u.atkTimer = 0;
    const smart = this.smart[u.team];
    if (smart && TAC.dodge && (dodgeStep(this, u, dt) || retreatStep(this, u, dt) || kiteStep(this, u, dt))) return;
    u.retarget -= dt;
    if (!u.target || !u.target.alive || u.retarget <= 0 || u.target.invisT > 0 || !this.canReach(u, u.target)) {
      u.target = b.target ? b.target(u, this) : this.findTarget(u);
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
    if (u.mob.families.includes('sift') && this.syn(u.team, 'sift') >= 0) t.echoMul = Math.max(t.echoMul, 0.15);
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
        if (!a.mob.families.includes('undead')) this.heal(a, p.dmg, p.src);
        else this.damage(p.src, a, p.dmg * 0.5, 'magic', { noCrit: true });
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
        if (e.mob.families.includes('undead')) this.heal(e, p.dmg * 0.6, null);
        else this.damage(src, e, p.dmg, 'magic', { proj: true });
      });
      return;
    }
    this.aoe(x, y, r, p.team, (e, f) => {
      const dmg = p.dmg * (1 - 0.4 * f);
      this.damage(src, e, dmg, p.dk, { proj: true, fire: p.fire });
      this.projStatus(p, e);
      if (p.knock > 0) this.knock(e, x, y, p.knock * (1 - 0.5 * f));
    });
    this.beh(src).onProjExplode?.(src, p, x, y, this);
    if (p.kind === 'big_fireball' || p.kind === 'blue_skull') this.blast(x, y, r);
  }

  private projHit(p: Proj, t: Unit) {
    const src = p.src;
    // Projectile dodges / reflections happen in damage() via onDamaged, signalled by `proj`.
    const dealt = this.damage(src, t, p.dmg, p.dk, { proj: true, fire: p.fire, projRef: p });
    if (dealt < 0) return; // dodged or reflected
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

  addZone(z: Omit<Zone, 't' | 'tick' | 'id'>) {
    this.zones.push({ ...z, t: 0, tick: 0, id: this.nid++ });
  }

  addDelayed(d: Delayed) {
    d.id = this.nid++;
    this.delayed.push(d);
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
    const ill = this.syn(team, 'illager');
    if (ill >= 1)
      once('vex', 0.6, () => {
        const owner = live.find((u) => u.mob.families.includes('illager')) ?? live[0];
        if (!owner) return;
        const n = ill >= 2 ? 6 : 3;
        for (let i = 0; i < n; i++)
          this.summon(owner, 'vex', this.rowX(team, 'mid') + this.rng.range(-30, 30), 40 + (i * (ARENA_D - 80)) / n, 1, { lifespan: 25, fx: 'summon' });
      });
    if (this.syn(team, 'ender') >= 1)
      once('flank', 0.7, () => {
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
    if (this.has(team, 'tnt'))
      once('tnt', 2, () => {
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
    if (this.syn(team, 'aquatic') >= 1)
      every('storm', 4, 2.5, () => {
        const foes = this.live[foe].filter((e) => !e.structure);
        if (!foes.length) return;
        const e = this.rng.pick(foes);
        const src = live.find((u) => u.mob.families.includes('aquatic')) ?? null;
        this.lightning(src, e.x, e.y, 40 + e.maxHp * 0.06, 34);
      });
    if (this.syn(team, 'construct') >= 1)
      every('cshield', 6, 3, () => {
        let low: Unit | null = null;
        for (const u of live) if (!u.structure && (!low || u.hpFrac < low.hpFrac)) low = u;
        if (low) {
          low.shield += low.maxHp * 0.2;
          this.emit({ k: 'text', x: low.x, y: low.y, z: low.gz + low.z + low.size, s: '护盾', color: '#cfe8ff' });
        }
      });
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
    o: { proj?: boolean; melee?: boolean; fire?: boolean; noCrit?: boolean; noDodge?: boolean; noThorns?: boolean; projRef?: Proj } = {},
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
    }
    let d = amount;
    let crit = false;
    if (src) {
      if (src.fx.vsHighHp > 0 && t.hpFrac > 0.6) d *= 1 + src.fx.vsHighHp;
      if (src.fx.vsBurning > 0 && t.burnT > 0) d *= 1 + src.fx.vsBurning;
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
        if (t.levT > 0 && src.mob.families.includes('ender') && this.has(src.team, 'combo_end_patrol')) d *= 1.4;
        if ((t.chill > 0 || t.slowT > 0 || t.freezeT > 0) && COLD_MOBS.has(src.mob.id) && this.has(src.team, 'combo_frost')) d *= 1.2;
      }
      if (src.fx.vsUndead > 0 && t.mob.families.includes('undead')) d *= 1 + src.fx.vsUndead;
      if (src.fx.vsArthropod > 0 && t.mob.families.includes('arthropod')) d *= 1 + src.fx.vsArthropod;
      if (src.fx.density > 0 && (t.stunned || t.z > t.alt + 8)) d *= 1 + src.fx.density;
      if (src.empower && kind !== 'dot') {
        src.empower = false;
        d *= 2;
      }
    }
    if (src && kind !== 'dot' && !src.flying) {
      const dh = src.gh - t.gh;
      if (dh > 0) d *= 1 + Math.min(2, dh) * (src.isRanged ? 0.12 : 0.08);
    }
    if (t.glowT > 0) d *= 1.2;
    if ((t.poisonT > 0 || t.weakT > 0) && this.has((1 - t.team) as 0 | 1, 'fermented_eye')) d *= 1.2;
    if (t.freezeT > 0 && this.has((1 - t.team) as 0 | 1, 'blue_ice')) d *= 1.25;
    if (t.hpFrac > 0.5 && this.has(t.team, 'netherite_plate')) d *= 0.85;
    d *= t.fx.dmgTaken * this.buff(t.team, 'taken');
    if (o.fire) d *= this.buff(t.team, 'fire');
    if (o.proj) d *= t.fx.projTaken;
    if (o.fire) d *= t.fx.fireTaken;
    if (t.auraT > 0) d *= 0.85;
    if (this.fortTeam !== null && !t.flying && this.fortTeam[tidx(cellX(t.x), cellY(t.y))] === t.team) d *= FORT_TAKEN;
    const armor = src && src.fx.breach > 0 ? t.armor * (1 - src.fx.breach) : t.armor;
    if (kind === 'phys') d *= 1 - armor;
    else if (kind === 'magic') d *= 1 - armor * 0.5;
    if (t.ref.closed) d *= 0.6;
    d *= t.takenMul;
    if (t.echoMul > 0 && kind !== 'dot') {
      d *= 1 + t.echoMul;
      t.echoMul = 0;
    }
    if (o.proj && t.ref.witherArmor) d *= 0.5;
    if (t.shield > 0) {
      const a = Math.min(t.shield, d);
      t.shield -= a;
      d -= a;
      if (d <= 0) {
        this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: Math.round(a), c: NUM_DOT });
        return 0;
      }
    }
    t.hp -= d;
    if (src) t.ref.lastHitBy = src;
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
    if (src && src.alive && kind !== 'dot' && src.fx.lifesteal > 0) this.heal(src, d * src.fx.lifesteal, null, true);
    if (o.melee && src && src.alive && t.fx.thorns > 0 && !o.noThorns)
      this.damage(t, src, d * t.fx.thorns, 'true', { noThorns: true, noCrit: true, noDodge: true });
    if (t.hp <= 0) this.kill(t, src);
    else this.beh(t).afterDamaged?.(t, src, d, this);
    return d;
  }

  /** Damage-over-time application (no armor, no dodge). */
  dot(t: Unit, d: number, src: Unit | null, cannotKill = false) {
    if (!t.alive || t.ghost) return;
    if (cannotKill) d = Math.min(d, Math.max(0, t.hp - 1));
    if (d <= 0) return;
    if (t.shield > 0) {
      const a = Math.min(t.shield, d);
      t.shield -= a;
      d -= a;
    }
    t.hp -= d;
    t.dotAcc += d;
    this.cards[t.card].taken += d;
    if (src) this.cards[src.card].dmg += d;
    if (t.hp <= 0) this.kill(t, src);
  }

  heal(t: Unit, amount: number, src: Unit | null, silent = false) {
    if (!t.alive || t.witherT > 0 || amount <= 0) return;
    const h = Math.min(amount, t.maxHp - t.hp);
    if (h <= 0) return;
    t.hp += h;
    if (src) this.cards[src.card].heal += h;
    else this.cards[t.card].heal += h;
    if (!silent && h >= 4) {
      this.emit({ k: 'num', x: t.x, y: t.y, z: t.gz + t.z + t.size, v: Math.round(h), c: NUM_HEAL });
      this.emit({ k: 'heal', x: t.x, y: t.y, z: t.gz + t.z });
    }
  }

  kill(t: Unit, killer: Unit | null, silent = false) {
    if (!t.alive) return;
    // Undead synergy revive.
    if (!silent && t.fx.revive > 0 && !t.revived && !t.isSummon && this.rng.chance(t.fx.revive)) {
      t.revived = true;
      t.hp = t.maxHp * (this.has(t.team, 'soul_lantern') ? 0.7 : 0.4);
      if (this.has(t.team, 'soul_lantern')) t.atk *= 1.3;
      t.witherT = 0;
      t.burnT = 0;
      t.poisonT = 0;
      this.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '复生!', color: '#9be36b' });
      this.emit({ k: 'spawn', u: t, fx: 'revive' });
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
    if (!t.isSummon && !t.structure) this.lost[t.team]++;
    const card = this.cards[t.card];
    card.alive--;
    this.emit({ k: 'death', u: t });
    if (killer && killer.team !== t.team) {
      const kc = this.cards[killer.card];
      kc.kills++;
      if (killer.fx.loot > 0 && kc.emeralds < 20) kc.emeralds = Math.min(20, kc.emeralds + killer.fx.loot);
      if (killer.fx.killAtk > 0 && killer.killStacks < 5) killer.killStacks++;
      if (killer.alive) this.beh(killer).onKill?.(killer, t, this);
    }
    if (!silent) this.beh(t).onDeath?.(t, this, killer);
    const foe = (1 - t.team) as 0 | 1;
    if (!silent && this.has(t.team, 'gunpowder') && !t.structure && this.rng.chance(0.3)) {
      const bm = this.boomMul(t.team);
      const dmg = t.maxHp * 0.25 * bm.d;
      this.emit({ k: 'boom', x: t.x, y: t.y, r: 60 * bm.r, color: '#ff8844', big: false });
      this.emit({ k: 'sfx', id: 'explode', v: 0.5 });
      this.aoe(t.x, t.y, 60 * bm.r, t.team, (e) => this.damage(t, e, dmg, 'phys', { noCrit: true }));
    }
    // Archetype relics of the side that got the kill.
    if (!silent && !t.structure) {
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
    if (!t.structure && !t.ghost && this.syn(foe, 'sift') >= 1) {
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
    if (u.auraT > 0) u.auraT -= dt;
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

  slow(t: Unit, move: number, atk: number, dur: number) {
    if (t.immune & IMM_SLOW) return;
    t.slowMove = Math.max(t.slowT > 0 ? t.slowMove : 0, move);
    t.slowAtk = Math.max(t.slowT > 0 ? t.slowAtk : 0, atk);
    t.slowT = Math.max(t.slowT, dur);
  }

  chillHit(t: Unit) {
    if (t.immune & IMM_SLOW) return;
    t.chill = Math.min(3, t.chill + 1);
    t.chillT = 2;
  }

  hunger(t: Unit, dur: number) {
    if (t.immune & IMM_HUNGER) return;
    t.hungerT = Math.max(t.hungerT, dur);
  }

  stun(t: Unit, dur: number) {
    if (t.immune & IMM_STUN || t.boss) {
      if (t.boss) t.stunT = Math.max(t.stunT, dur * 0.2);
      return;
    }
    t.stunT = Math.max(t.stunT, dur);
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
    const p = power / t.mass;
    t.vx += dx * p * 3;
    t.vy += dy * p * 1.6;
    if (!t.flying && p > 70 && t.z <= 1) t.vz = Math.max(t.vz, 120);
  }

  /** Called whenever a unit teleports (末影之眼 primes its next hit). */
  teleported(u: Unit) {
    if (!this.has(u.team, 'ender_eye')) return;
    u.critNext = true;
    u.empower = true;
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
  goo: { mode: 0, speed: 260, arc: 60, aoe: 0, lead: false, color: '#e8d84a' },
};

export type { Unit };
export { baseFx };
