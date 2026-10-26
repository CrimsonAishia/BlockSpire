import type { DmgKind, MobDef, ProjectileKind, Row } from '../core/types.ts';

export const ARENA_W = 1280;
export const ARENA_D = 576;
/** Flyers above this altitude cannot be reached by melee attacks. */
export const MELEE_REACH_Z = 95;

export const IMM_BURN = 1;
export const IMM_POISON = 2;
export const IMM_WITHER = 4;
export const IMM_KB = 8;
export const IMM_SLOW = 16;
export const IMM_STUN = 32;
export const IMM_HUNGER = 64;

/** Per-unit static effect bundle computed by setup from enchants/relics/synergies. */
export interface UnitFx {
  lifesteal: number;
  thorns: number;
  dodge: number;
  projDodge: number;
  burnHit: number;
  burnDur: number;
  poisonHit: number;
  poisonDur: number;
  poisonStacks: number;
  knock: number;
  stunChance: number;
  sweep: number;
  pierce: number;
  multishot: number;
  channel: number;
  loot: number;
  crit: number;
  critMul: number;
  firstHitMul: number;
  killAtk: number;
  vsHighHp: number;
  executeLowHp: number;
  executeLowHpTier2: number;
  vsBurning: number;
  revive: number;
  regen: number;
  dmgTaken: number;
  projTaken: number;
  fireTaken: number;
  farBonus: number;
  pearl: boolean;
  burnMul: number;
  poisonMul: number;
  /** Enchantments: bonus vs undead / arthropods (+ slow seconds), armour ignored, bonus vs airborne/stunned, wind burst every Nth hit, freezing on hit. */
  vsUndead: number;
  vsArthropod: number;
  baneSlow: number;
  breach: number;
  density: number;
  windBurst: number;
  freezeHit: number;
  enderNonDot: number;
}

export function baseFx(): UnitFx {
  return {
    lifesteal: 0, thorns: 0, dodge: 0, projDodge: 0, burnHit: 0, burnDur: 0, poisonHit: 0, poisonDur: 0, poisonStacks: 1,
    knock: 0, stunChance: 0, sweep: 0, pierce: 0, multishot: 0, channel: 0, loot: 0, crit: 0, critMul: 1.75,
    firstHitMul: 1, killAtk: 0, vsHighHp: 0, executeLowHp: 0, executeLowHpTier2: 0, vsBurning: 0, revive: 0, regen: 0, dmgTaken: 1, projTaken: 1, fireTaken: 1,
    farBonus: 0, pearl: false, burnMul: 1, poisonMul: 1,
    vsUndead: 0, vsArthropod: 0, baneSlow: 0, breach: 0, density: 0, windBurst: 0, freezeHit: 0,
    enderNonDot: 0,
  };
}

let NEXT_ID = 1;
export function resetIds() {
  NEXT_ID = 1;
}

export class Unit {
  id = NEXT_ID++;
  team: 0 | 1;
  card: number;
  mob: MobDef;
  star: number;
  row: Row;
  x = 0;
  y = 0;
  z = 0;
  px = 0;
  py = 0;
  pz = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  alt = 0;
  /** Ground elevation in blocks (cell based) and in world units. */
  gh = 0;
  gz = 0;
  /** Movement class for flow fields, and cached pathing decision. */
  cls = 0;
  pathT = 0;
  usePath = false;
  /** Tactical layer (refreshed ~8×/s): own damage estimate and threat, enemy melee attackers
   *  on this unit and the summed damage per second of everyone targeting it. */
  dps = 0;
  threat = 0;
  tgtMelee = 0;
  tgtRanged = 0;
  inDps = 0;
  /** Projectile damage currently flying at this unit. */
  pend = 0;
  /** Ranged repositioning goal and replanning timer. */
  goalX = 0;
  goalY = 0;
  goalT = 0;
  tacT = 0;
  /** Active dodge (direction, time left), the danger last reacted to, and when to react. */
  dodgeX = 0;
  dodgeY = 0;
  dodgeT = 0;
  dgId = 0;
  dodgeAt = -1;
  /** Earliest time this unit may show another tactical callout. */
  sayT = 0;
  /** Short attack-speed boost from allies (袭击号角, 幽匿歌谣...): seconds left and multiplier. */
  hasteT = 0;
  hasteMul = 1;
  /** Next attack deals double damage (沙漠游骑). */
  empower = false;
  /** Damage-taken multiplier set by the unit's own behaviour (armadillo rolled up, creaking heart). */
  takenMul = 1;
  /** 回响 (Sift): the next hit on this unit deals this much more. */
  echoMul = 0;
  /** Afterimages: visible but can't be targeted, hurt or bumped into. */
  ghost = false;
  /** Kiting: running from a melee chaser between shots (direction, time left). */
  kiteX = 0;
  kiteY = 0;
  kiteT = 0;
  /** Falling back to a healer / regen cloud when badly hurt (goal, time left). */
  retreatX = 0;
  retreatY = 0;
  retreatT = 0;
  hp: number;
  maxHp: number;
  atk: number;
  cd: number;
  range: number;
  speed: number;
  armor: number;
  radius: number;
  size: number;
  mass: number;
  flying: boolean;
  atkSpd = 1;
  moveSpd = 1;
  atkTimer = 0;
  target: Unit | null = null;
  retarget = 0;
  alive = true;
  deadT = 0;
  age = 0;
  facing: 1 | -1;
  animAtk = 0;
  animHit = -1;
  moving = false;
  walk = 0;
  // Status effects
  burnT = 0;
  burnDps = 0;
  poisonT = 0;
  poisonDps = 0;
  poisonStacks = 0;
  witherT = 0;
  witherDps = 0;
  slowT = 0;
  slowMove = 0;
  slowAtk = 0;
  chill = 0;
  chillT = 0;
  stunT = 0;
  airT = 0;
  levT = 0;
  levDmg = 0;
  /** Damage to take on landing after being knocked off a ledge. */
  fallDmg = 0;
  /** Seconds spent ready to shoot without line of sight (tactical AI). */
  noLosT = 0;
  hungerT = 0;
  /** Freezing (冰冻, 2026 winter drop): damage over time and slower movement/attacks. */
  freezeT = 0;
  freezeDps = 0;
  weakT = 0;
  weakMul = 0;
  glowT = 0;
  blindT = 0;
  invisT = 0;
  tauntT = 0;
  taunter: Unit | null = null;
  regenT = 0;
  regenRate = 0;
  shield = 0;
  timedShields: { id: string; amount: number; timer: number }[] = [];
  lastSynShield = 0;
  erosionStacks = 0;
  erosionTimer = 0;
  huntMarkT = 0;
  desertEmpowerMul = 0;
  desertEmpowerT = 0;
  wolfHasteUsed = false;
  undeadRevived = false;
  auraT = 0;
  dotAcc = 0;
  dotTick = 0;
  // Misc
  isSummon = false;
  lifespan = 0;
  structure = false;
  boss = false;
  posture = 0;
  postureMax = 100;
  channeling = false;
  channelT = 0;
  gen = 0;
  alpha = 1;
  fx: UnitFx;
  immune = 0;
  ab: Record<string, number> = {};
  ref: Record<string, any> = {};
  revived = false;
  killStacks = 0;
  firstHit = true;
  pearlUsed = false;
  critNext = false;
  dk: DmgKind;
  proj?: ProjectileKind;

  constructor(mob: MobDef, team: 0 | 1, card: number, star: number, row: Row, fx: UnitFx) {
    this.mob = mob;
    this.team = team;
    this.card = card;
    this.star = star;
    this.row = row;
    this.hp = this.maxHp = mob.hp;
    this.atk = mob.atk;
    this.cd = mob.cd;
    this.range = mob.range;
    this.speed = mob.speed;
    this.armor = mob.armor;
    this.radius = mob.radius;
    this.size = mob.size;
    this.mass = mob.mass ?? 1;
    this.flying = !!mob.flying;
    this.alt = mob.alt ?? 0;
    this.z = this.alt;
    this.facing = team === 0 ? 1 : -1;
    this.fx = fx;
    this.dk = mob.dmgKind ?? 'phys';
    this.proj = mob.projectile;
    this.structure = !!mob.structure;
    this.boss = !!mob.boss;
    for (const im of mob.immune ?? []) {
      this.immune |=
        im === 'burn' ? IMM_BURN : im === 'poison' ? IMM_POISON : im === 'wither' ? IMM_WITHER : im === 'knockback' ? IMM_KB : im === 'slow' ? IMM_SLOW : IMM_STUN;
    }
  }

  get isRanged() {
    return this.mob.range >= 60;
  }
  get stunned() {
    return this.stunT > 0 || this.airT > 0 || this.levT > 0;
  }
  get hpFrac() {
    return this.hp / this.maxHp;
  }

  addSynergyShield(id: string, amount: number, dur: number): number {
    const cap = this.maxHp * 0.4;
    let s = this.timedShields.find((x) => x.id === id);
    if (s) {
      s.amount = Math.max(s.amount, amount);
      s.timer = Math.max(s.timer, dur);
    } else {
      s = { id, amount, timer: dur };
      this.timedShields.push(s);
    }
    const sum = this.timedShields.reduce((a, b) => a + b.amount, 0);
    if (sum > cap && sum > 0) {
      const mul = cap / sum;
      for (const item of this.timedShields) item.amount *= mul;
    }
    this.syncShield();
    return s.amount;
  }

  syncShield() {
    const synTotal = this.timedShields.reduce((a, b) => a + b.amount, 0);
    const base = Math.max(0, this.shield - (this.lastSynShield || 0));
    this.lastSynShield = synTotal;
    this.shield = base + synTotal;
  }

  consumeShield(d: number): { absorbed: number; synAbsorbed: number } {
    if (this.shield <= 0 || d <= 0) return { absorbed: 0, synAbsorbed: 0 };
    const totalAbsorbed = Math.min(this.shield, d);
    let rem = totalAbsorbed;
    let synAbsorbed = 0;
    for (let i = 0; i < this.timedShields.length && rem > 0; i++) {
      const s = this.timedShields[i];
      const take = Math.min(s.amount, rem);
      s.amount -= take;
      rem -= take;
      synAbsorbed += take;
    }
    this.timedShields = this.timedShields.filter((s) => s.amount > 0.001);
    this.lastSynShield = this.timedShields.reduce((a, b) => a + b.amount, 0);
    this.shield -= totalAbsorbed;
    return { absorbed: totalAbsorbed, synAbsorbed };
  }

  tickShields(dt: number) {
    if (!this.timedShields.length) return;
    let changed = false;
    for (const s of this.timedShields) {
      s.timer -= dt;
      if (s.timer <= 0) changed = true;
    }
    if (changed) {
      const expiredAmt = this.timedShields.filter((s) => s.timer <= 0).reduce((a, b) => a + b.amount, 0);
      this.timedShields = this.timedShields.filter((s) => s.timer > 0);
      this.lastSynShield = this.timedShields.reduce((a, b) => a + b.amount, 0);
      this.shield = Math.max(0, this.shield - expiredAmt);
    }
  }
}

export interface Proj {
  id: number;
  kind: ProjectileKind;
  team: 0 | 1;
  src: Unit;
  /** 0 = aimed lob to a point, 1 = straight line, 2 = homing. */
  mode: 0 | 1 | 2;
  x: number;
  y: number;
  z: number;
  px: number;
  py: number;
  pz: number;
  sx: number;
  sy: number;
  sz: number;
  tx: number;
  ty: number;
  tz: number;
  t: number;
  dur: number;
  arc: number;
  vx: number;
  vy: number;
  speed: number;
  dist: number;
  maxDist: number;
  target: Unit | null;
  dmg: number;
  dk: DmgKind;
  aoe: number;
  pierce: number;
  hits: number[];
  fire: boolean;
  burn: number;
  burnDur: number;
  poison: number;
  poisonDur: number;
  wither: number;
  witherDur: number;
  slowDur: number;
  stun: number;
  knock: number;
  lev: number;
  chill: boolean;
  splash: number;
  special: string;
  alive: boolean;
  age: number;
  reflected: boolean;
}

export interface Zone {
  id: number;
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  team: 0 | 1;
  dps: number;
  /** fire/breath hurt enemies; lava burns them (dps = max-HP fraction); regen heals allies. */
  /** goo drains enemies and feeds the nearest Sift ally; ouch is Sift water (hurts all but Sift mobs). */
  /** bloom (the sniffer's torchflower) heals allies like regen and hastes them by `haste`. */
  kind: 'fire' | 'breath' | 'lava' | 'regen' | 'honey' | 'ouch' | 'goo' | 'bloom';
  haste?: number;
  src: Unit | null;
  tick: number;
}

export interface Delayed {
  id?: number;
  t: number;
  x: number;
  y: number;
  r: number;
  dmg: number;
  team: 0 | 1;
  src: Unit | null;
  /** tnt hits every unit in range, both teams; goo bursts (tall sifter), slash (afterimage strikes), and pillar (geomancer) hit enemies. */
  kind: 'fang' | 'bolt' | 'tnt' | 'goo' | 'slash' | 'pillar' | 'ice_drop';
}

export type BEvent =
  | { k: 'num'; x: number; y: number; z: number; v: number; c: number }
  | { k: 'hit'; x: number; y: number; z: number; big: boolean; color: string }
  | { k: 'death'; u: Unit }
  | { k: 'boom'; x: number; y: number; r: number; color: string; big: boolean }
  | { k: 'shoot'; kind: string; x: number; y: number }
  | { k: 'spawn'; u: Unit; fx: string }
  | { k: 'tele'; x: number; y: number; x2: number; y2: number; z: number }
  | { k: 'heal'; x: number; y: number; z: number }
  | { k: 'roar'; x: number; y: number; r: number; color: string }
  | { k: 'bolt'; x: number; y: number }
  | { k: 'sonic'; x: number; y: number; x2: number; y2: number }
  | { k: 'fang'; x: number; y: number }
  | { k: 'text'; x: number; y: number; z: number; s: string; color: string; tac?: boolean }
  | { k: 'shake'; a: number }
  | { k: 'sfx'; id: string; v?: number }
  | { k: 'beam'; a: Unit; b: Unit; color: string; t: number }
  | { k: 'phase'; s: string }
  | { k: 'debris'; x: number; y: number; z: number; s: number; f: number; block: boolean }
  | { k: 'stuck'; x: number; y: number; z: number; kind: string; dx: number; dy: number }
  | { k: 'land'; x: number; y: number; z: number; big: boolean }
  | { k: 'item'; id: string; team: 0 | 1; x: number; y: number; t: number }
  | { k: 'tnt'; x: number; y: number; t: number };

/** Number colors for damage popups. */
export const NUM_PHYS = 0;
export const NUM_CRIT = 1;
export const NUM_MAGIC = 2;
export const NUM_HEAL = 3;
export const NUM_DOT = 4;
export const NUM_TRUE = 5;
export const NUM_DODGE = 6;
