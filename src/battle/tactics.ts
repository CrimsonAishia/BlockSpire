// Tactical layer shared by every mob: utility-based target scoring, ranged positioning
// (high ground, spacing from melee, staying behind the frontline) and dodging telegraphed
// area attacks. `Battle.smart[team]` switches a side back to the classic "nearest enemy"
// behaviour for comparison with the tactical layer.
import type { Battle } from './sim.ts';
import type { DmgKind } from '../core/types.ts';
import { collectDangers } from './threats.ts';
import { contactPressure } from './engagement.ts';
import { steerTo } from './steering.ts';
import { ARENA_D, ARENA_W, MELEE_REACH_Z, type Unit } from './unit.ts';
import { BLOCK, S, cellX, cellY, hatesOuch, hatesWater, idx, isBlocked, isClimber, isFireproof, moveMul, needsPath } from './terrain.ts';

interface RoleWeights {
  /** Ranged: cost per px of walking needed to get the target in range. */
  walk: number;
  /** Melee: cost per block of climbing, and for targets standing in my hazards. */
  climb: number;
  hazard: number;
  /** Bonuses (px of distance) for missing HP and for targets that die within a few hits. */
  low: number;
  finish: number;
  /** Bonus for enemy backliners, for enemies hitting our backliners (peel), for whoever hits me. */
  back: number;
  peel: number;
  selfDef: number;
  /** Ranged: bonus per ally shooter already on the target (focus fire, max 3). */
  focus: number;
  /** Melee: penalty per attacker beyond what physically fits around the target. */
  crowd: number;
  /** Splash attackers: bonus per extra enemy inside the splash. */
  splash: number;
  /** Penalty for targets already doomed by damage in flight (overkill). */
  overkill: number;
  /** Bonus for the current target (more once in contact). */
  stick: number;
  contact: number;
  /** Chance to react to a telegraphed area attack. */
  dodge: number;
}

// Plain "nearest enemy" is a strong baseline here (straight
// projectiles hit whoever is in the way, walking costs time), so only terms that measurably
// win stay on: splash aiming, peeling for tanks/supports and avoiding targets in hazards.
// Focus fire, spreading fire, "finish low HP" and target stickiness all lost games.
const MELEE: RoleWeights = {
  walk: 0, climb: 0, hazard: 120, low: 0, finish: 0, back: 0, peel: 0, selfDef: 0, focus: 0, crowd: 0, splash: 0, overkill: 0, stick: 0, contact: 0, dodge: 0.55,
};
const RANGED: RoleWeights = { ...MELEE, splash: 45, dodge: 0.7 };
export const W: Record<string, RoleWeights> = {
  melee: MELEE,
  tank: { ...MELEE, peel: 100, dodge: 0.3 },
  assassin: { ...MELEE, dodge: 0.85 },
  ranged: RANGED,
  support: { ...RANGED, peel: 100 },
  summoner: { ...RANGED },
  caster: { ...RANGED },
  bomber: { ...MELEE, dodge: 0 },
  boss: { ...MELEE, dodge: 0 },
};

/** Extra threat for roles whose damage comes from abilities rather than basic attacks. */
const THREAT_MUL: Record<string, number> = { summoner: 1.5, caster: 1.3, bomber: 2.5, support: 1.2, tank: 0.85 };

/** Feature switches for benchmarking individual parts of the tactical layer. */
export const TAC = { target: true, dodge: true, ranged: true, abil: true };

export function roleW(u: Unit): RoleWeights {
  return W[u.mob.role] ?? MELEE;
}

const BACK_ROLES = new Set(['ranged', 'support', 'summoner', 'caster']);
export const isBackliner = (u: Unit) => u.isRanged || BACK_ROLES.has(u.mob.role);

/** Splash radius of a unit's normal attack (used to aim at clusters). */
function splashOf(u: Unit): number {
  switch (u.mob.ai) {
    case 'witch':
      return 50;
    case 'ghast':
      return 70;
    case 'wither':
    case 'wither_boss':
      return 40;
    case 'breeze':
      return 60;
    case 'blaze':
    case 'snow_golem':
      return u.star >= 3 ? 32 : 0;
    default:
      return 0;
  }
}

// ───────────────────────── team blackboard ─────────────────────────

export interface Danger {
  id: number;
  x: number;
  y: number;
  r: number;
  /** Absolute battle time the area goes off (zones: already active). */
  at: number;
  zone: boolean;
  damage?: number;
  dk?: DmgKind;
  src?: Unit | null;
  proj?: boolean;
  fire?: boolean;
  burn?: boolean;
  groundOnly?: boolean;
  percent?: boolean;
  control?: number;
  controlKind?: 'stun' | 'slow' | 'knockback';
  falloff?: number;
  until?: number;
}

/** Recomputes damage estimates, who-targets-whom, frontlines and the danger lists. */
export function refreshTactics(b: Battle) {
  for (const u of b.units) {
    u.tgtMelee = 0;
    u.tgtRanged = 0;
    u.inDps = 0;
    u.pend = 0;
    if (!u.alive) continue;
    u.dps = (b.atkOf(u) / Math.max(0.2, u.cd)) * b.atkSpeedOf(u);
    u.threat = u.structure ? (u.mob.id === 'end_crystal' ? 25 : 1) : u.dps * (THREAT_MUL[u.mob.role] ?? 1) * (splashOf(u) > 0 ? 1.3 : 1);
  }
  for (const team of [0, 1] as const) {
    let sx = 0;
    let n = 0;
    for (const u of b.live[team]) {
      const t = u.target;
      if (t && t.alive) {
        if (u.isRanged) t.tgtRanged++;
        else t.tgtMelee++;
        t.inDps += u.dps;
      }
      if (!u.isRanged && !u.flying && !u.structure && u.speed > 0 && u.mob.role !== 'assassin' && u.mob.role !== 'bomber') {
        sx += u.x;
        n++;
      }
    }
    b.front[team] = n ? sx / n : NaN;
    b.dangers[team].length = 0;
  }
  for (const p of b.projs) if (p.alive && p.target && p.target.alive && p.special !== 'heal') p.target.pend += p.dmg;
  collectDangers(b);
}

// ───────────────────────── callouts ─────────────────────────

/** Short floating text explaining a tactical decision, heavily rate-limited. */
export function callout(b: Battle, u: Unit, s: string, color: string) {
  if (b.headless || u.isSummon) return;
  if (b.t < u.sayT || b.t < b.sayT[u.team]) return;
  u.sayT = b.t + 10;
  b.sayT[u.team] = b.t + 1.4;
  b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size + 6, s, color, tac: true });
}

// ───────────────────────── target scoring ─────────────────────────

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function hazardAt(b: Battle, u: Unit, x: number, y: number) {
  const s = b.terrain.s[idx(cellX(x), cellY(y))];
  return (s === S.LAVA && !isFireproof(u.mob)) || (s === S.WATER && hatesWater(u.mob)) || (s === S.OUCH && hatesOuch(u.mob));
}

/**
 * Picks a target by distance, adjusted by what matters tactically: finishing weak enemies,
 * protecting our backline, focus fire, splash clusters and terrain between us.
 */
export function pickTarget(b: Battle, u: Unit, filter?: (e: Unit) => boolean): Unit | null {
  if (u.tauntT > 0 && u.taunter && u.taunter.alive && b.canReach(u, u.taunter)) return u.taunter;
  const w = roleW(u);
  const foes = b.live[(1 - u.team) as 0 | 1];
  const ranged = u.isRanged;
  const hit = Math.max(1, b.atkOf(u));
  const reach0 = u.radius + b.rangeOf(u);
  const splash = ranged && w.splash ? splashOf(u) : 0;
  const los = ranged && b.losArc(u) >= 0;
  const climber = isClimber(u.mob);
  const cur = u.target && u.target.alive ? u.target : null;
  let best: Unit | null = null;
  let bestC = Infinity;
  let bestPeel = false;
  for (const e of foes) {
    if (!e.alive || e.invisT > 0 || !b.canReach(u, e)) continue;
    if (filter && !filter(e)) continue;
    const dx = e.x - u.x;
    const dy = e.y - u.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const gap = d - reach0 - e.radius;
    let c = d;
    if (b.coordinated[u.team]) {
      if (!ranged) c += contactPressure(b, u, e);
      if (e === cur && gap <= 4) c -= 12;
    }
    if (ranged) {
      if (gap > 0) c += gap * w.walk;
      // Prefer targets that aren't hiding behind trees, rocks or hill sides.
      if (los && !b.canSee(u, e)) c += 220;
    } else if (!u.flying && !e.flying) {
      if (!climber && e.gh > u.gh) c += (e.gh - u.gh) * w.climb;
      if (w.hazard && hazardAt(b, u, e.x, e.y)) c += w.hazard;
      if (w.crowd) {
        const n = e.tgtMelee - (cur === e ? 1 : 0);
        const cap = Math.max(2, Math.min(6, Math.round((e.radius + 12) / 7)));
        if (n >= cap) c += (n - cap + 1) * w.crowd;
      }
    }
    if (e.structure) c += e.mob.id === 'end_crystal' && ranged ? -60 : e.mob.id === 'creaking_heart' ? (ranged ? -200 : -90) : 150;
    // Don't waste swings on someone who barely takes damage right now (creaking with its heart, a rolled-up armadillo).
    if (e.takenMul < 1) c += (1 - e.takenMul) * 260;
    if (w.low || w.finish) {
      let eff = u.dk === 'phys' ? 1 - e.armor : u.dk === 'magic' ? 1 - e.armor * 0.5 : 1;
      if (e.ref.closed) eff *= 0.6;
      if (ranged && e.ref.witherArmor) eff *= 0.5;
      const ehp = (e.hp + e.shield) / Math.max(0.1, eff * e.fx.dmgTaken);
      c -= (1 - e.hpFrac) * w.low + w.finish * clamp01(1.2 - ehp / (hit * 4));
    }
    if (w.overkill && e.pend > 0) {
      let eff = u.dk === 'phys' ? 1 - e.armor : 1 - e.armor * 0.5;
      if (e.ref.witherArmor) eff *= 0.5;
      if (e.pend * eff >= e.hp + e.shield) c += w.overkill;
    }
    if (w.back && isBackliner(e)) c -= w.back;
    const et = e.target;
    let peel = false;
    if (w.peel && et && et.alive && et.team === u.team && et !== u && !e.isRanged && isBackliner(et)) {
      const pdx = e.x - et.x;
      const pdy = e.y - et.y;
      if (pdx * pdx + pdy * pdy < 160 * 160) {
        c -= w.peel;
        peel = true;
      }
    }
    if (w.selfDef && et === u) c -= w.selfDef;
    if (w.focus) c -= Math.min(3, e.tgtRanged - (cur === e && ranged ? 1 : 0)) * w.focus;
    if (splash > 0) {
      let n = 0;
      for (const o of foes) {
        if (o === e || !o.alive) continue;
        const ox = o.x - e.x;
        const oy = o.y - e.y;
        if (ox * ox + oy * oy < (splash + o.radius) * (splash + o.radius)) n++;
      }
      c -= Math.min(4, n) * w.splash;
    }
    // Commitment: switching targets costs time, especially once in contact.
    if (e === cur) c -= w.stick + (gap <= 4 ? w.contact : 0);
    if (c < bestC) {
      bestC = c;
      best = e;
      bestPeel = peel;
    }
  }
  if (best && bestPeel && best !== cur && u.mob.role !== 'assassin') callout(b, u, '掩护!', '#9fd0ff');
  return best;
}

// ───────────────────────── movement helpers ─────────────────────────

const cx_ = (x: number, r: number) => Math.max(r, Math.min(ARENA_W - r, x));
const cy_ = (y: number) => Math.max(10, Math.min(ARENA_D - 10, y));

/** Rotates a direction away from walls, blockers and hazards one block ahead. */
export function safeDir(b: Battle, u: Unit, nx: number, ny: number): [number, number] {
  if (u.flying) return [nx, ny];
  const t = b.terrain;
  const ok = (dx: number, dy: number) => {
    const x = u.x + dx * BLOCK * 0.9;
    const y = u.y + dy * BLOCK * 0.9;
    if (x < u.radius || x > ARENA_W - u.radius || y < 10 || y > ARENA_D - 10) return false;
    const c = cellX(x);
    const r = cellY(y);
    if (isBlocked(t, c, r)) return false;
    return !hazardAt(b, u, x, y) || hazardAt(b, u, u.x, u.y);
  };
  if (ok(nx, ny)) return [nx, ny];
  for (const a of [0.7, -0.7, 1.4, -1.4, 2.1, -2.1]) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const rx = nx * c - ny * s;
    const ry = nx * s + ny * c;
    if (ok(rx, ry)) return [rx, ry];
  }
  return [nx, ny];
}

function stepDir(b: Battle, u: Unit, nx: number, ny: number, dt: number, mul = 1) {
  if (b.coordinated[u.team]) {
    steerTo(b, u, { x: u.x + nx * BLOCK * 2, y: u.y + ny * BLOCK * 2 }, dt, mul);
    return;
  }
  const sp = b.moveSpeedOf(u) * b.terrainSpeed(u, nx, ny) * dt * mul;
  u.x = cx_(u.x + nx * sp, u.radius);
  u.y = cy_(u.y + ny * sp);
  u.moving = true;
  u.walk += sp;
  if (u.target && u.target.alive && Math.abs(u.target.x - u.x) > 2) {
    u.facing = u.target.x > u.x ? 1 : -1;
  } else if (Math.abs(nx) > 0.1) {
    u.facing = nx > 0 ? 1 : -1;
  }
}

// ───────────────────────── dodging ─────────────────────────

/** Steps out of telegraphed area attacks. Returns true while the unit is busy dodging. */
export function dodgeStep(b: Battle, u: Unit, dt: number): boolean {
  if (u.dodgeT > 0) {
    u.dodgeT -= dt;
    stepDir(b, u, u.dodgeX, u.dodgeY, dt);
    return true;
  }
  const list = b.dangers[u.team];
  if (!list.length || u.speed <= 0 || u.boss || u.structure) return false;
  const w = roleW(u);
  if (w.dodge <= 0) return false;
  for (const d of list) {
    const dx = u.x - d.x;
    const dy = (u.y - d.y) * 1.15;
    const rr = d.r + u.radius + 6;
    const d2 = dx * dx + dy * dy;
    if (d2 > rr * rr) continue;
    if (!d.zone && d.at < b.t + 0.12) continue;
    if (u.dgId !== d.id) {
      // React (or not) once per danger, after a short human-like delay.
      u.dgId = d.id;
      u.dodgeAt = b.rng.chance(w.dodge) ? b.t + b.rng.range(0.15, 0.35) : -1;
    }
    if (u.dodgeAt < 0 || b.t < u.dodgeAt) continue;
    u.dodgeAt = -1;
    const len = Math.sqrt(d2);
    let nx: number;
    let ny: number;
    if (len < 2) {
      nx = u.team === 0 ? -1 : 1;
      ny = 0;
    } else {
      nx = dx / len;
      ny = dy / 1.15 / len;
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
    }
    [nx, ny] = safeDir(b, u, nx, ny);
    u.dodgeX = nx;
    u.dodgeY = ny;
    u.dodgeT = Math.min(1, (rr - len + 10) / Math.max(25, b.moveSpeedOf(u)) + 0.05);
    callout(b, u, '闪避!', '#e8f4ff');
    stepDir(b, u, nx, ny, dt);
    return true;
  }
  return false;
}

// ───────────────────────── kiting & falling back ─────────────────────────

/**
 * Hit-and-run: right after a shot, a ranged unit whose melee chaser is about to reach it turns
 * and runs for part of its reload, then turns back to shoot. Only worth it when it is not much
 * slower than the chaser (wolves and spiders still catch archers).
 */
export function startKite(b: Battle, u: Unit) {
  if (u.speed <= 0 || u.flying || u.boss || u.structure) return;
  let threat: Unit | null = null;
  let td = Infinity;
  for (const e of b.live[(1 - u.team) as 0 | 1]) {
    if (e.isRanged || e.structure || e.speed <= 0 || !e.alive || e.stunned) continue;
    if (e.target !== u) continue;
    const d = Math.hypot(e.x - u.x, e.y - u.y) - e.radius - u.radius;
    if (d < 70 && d < td) {
      td = d;
      threat = e;
    }
  }
  if (!threat || b.moveSpeedOf(u) < b.moveSpeedOf(threat) * 0.75) return;
  let nx = u.x - threat.x;
  let ny = u.y - threat.y;
  const l = Math.hypot(nx, ny) || 1;
  // Away from the chaser, drifting back toward our own lines.
  nx = nx / l + (u.team === 0 ? -0.35 : 0.35);
  ny = ny / l;
  const l2 = Math.hypot(nx, ny) || 1;
  [nx, ny] = safeDir(b, u, nx / l2, ny / l2);
  u.kiteX = nx;
  u.kiteY = ny;
  u.kiteT = Math.min(0.6, (u.cd / Math.max(0.3, b.atkSpeedOf(u))) * 0.5);
  callout(b, u, '拉扯', '#ffe08a');
}

export function kiteStep(b: Battle, u: Unit, dt: number): boolean {
  if (u.kiteT <= 0) return false;
  u.kiteT -= dt;
  if (u.stunned) return false;
  stepDir(b, u, u.kiteX, u.kiteY, dt);
  return true;
}

const HEALERS = new Set(['witch', 'blub', 'singer']);

/**
 * Badly hurt units with somewhere to heal (a friendly healer or regen cloud) fall back to it
 * once per battle, dragging their chaser into our backline, then rejoin.
 */
export function retreatStep(b: Battle, u: Unit, dt: number): boolean {
  if (u.retreatT > 0) {
    u.retreatT -= dt;
    if (u.hpFrac > 0.55 || u.stunned) {
      u.retreatT = 0;
      return false;
    }
    const dx = u.retreatX - u.x;
    const dy = u.retreatY - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 12) {
      u.moving = false;
      return u.isRanged ? false : true;
    }
    stepDir(b, u, dx / d, dy / d, dt);
    return true;
  }
  if (u.hpFrac > 0.3 || u.ab.fellBack || u.speed <= 0 || u.boss || u.structure || u.isSummon || u.mob.role === 'bomber' || u.mob.role === 'tank') return false;
  if (u.tgtMelee + u.tgtRanged === 0) return false;
  let hx = NaN;
  let hy = NaN;
  let hd = BLOCK * 9;
  for (const z of b.zones)
    if ((z.kind === 'regen' || z.kind === 'bloom') && z.team === u.team) {
      const d = Math.hypot(z.x - u.x, z.y - u.y);
      if (d < hd) (hd = d), (hx = z.x), (hy = z.y);
    }
  for (const a of b.live[u.team])
    if (a !== u && HEALERS.has(a.mob.ai)) {
      const d = Math.hypot(a.x - u.x, a.y - u.y);
      if (d < hd) (hd = d), (hx = a.x + (u.team === 0 ? 20 : -20)), (hy = a.y);
    }
  if (hx !== hx || hd < 30) return false;
  u.ab.fellBack = 1;
  u.retreatX = hx;
  u.retreatY = hy;
  u.retreatT = 3;
  callout(b, u, '残血后撤', '#ffb3b3');
  return true;
}

// ───────────────────────── ranged positioning ─────────────────────────

/** Ranged positioning tunables (scores are in "px of distance"). */
export const P = {
  height: 26, threatR: 120, chase: 1.6, near: 0.7, front: 0.4, frontGap: 20, wall: 35, stack: 12,
  travel: 0.2, gain: 8, replan: 0.7, backpedal: 0.8, trigger: 1.5, close: 0.55,
};

function spotScore(b: Battle, u: Unit, t: Unit, x: number, y: number): number {
  const tr = b.terrain;
  const ground = !u.flying;
  const i = idx(cellX(x), cellY(y));
  const h = ground ? tr.h[i] : 0;
  // Range at that spot (high ground reaches farther).
  const hf = (gh: number) => (ground && gh > 0 ? 1 + 0.08 * Math.min(3, gh) : 1);
  const range = (b.rangeOf(u) / hf(u.gh)) * hf(h);
  const reach = u.radius + t.radius + range;
  const dT = Math.hypot(x - t.x, y - t.y);
  let s = 0;
  if (dT > reach - 6) s -= 40 + (dT - reach + 6) * 1.5;
  else if (b.losArc(u) >= 0 && !b.canSee(u, t, x, y)) s -= 140;
  else if (dT < reach * P.close) s -= (reach * P.close - dT) * 0.35;
  if (ground) {
    s += P.height * Math.min(3, h);
    const mm = moveMul(u.mob, tr.s[i], tr.f[i]);
    s -= (1 - Math.min(1, mm)) * 50;
    if (hazardAt(b, u, x, y)) s -= 500;
    if (h > u.gh && !isClimber(u.mob)) s -= (h - u.gh) * 10;
  }
  // Keep away from melee that can reach me, especially the ones chasing me.
  const high = u.flying && u.alt > MELEE_REACH_Z;
  if (!high)
    for (const e of b.live[(1 - u.team) as 0 | 1]) {
      if (e.isRanged || e.structure || e.speed <= 0) continue;
      const lim = P.threatR + e.radius;
      const ex = x - e.x;
      const ey = y - e.y;
      if (ex > lim || ex < -lim || ey > lim || ey < -lim) continue;
      const dd = Math.sqrt(ex * ex + ey * ey);
      if (dd < lim) s -= (lim - dd) * (e.target === u ? P.chase : P.near);
    }
  // Stay behind our own frontline while it stands.
  const fx = b.front[u.team];
  if (fx === fx) {
    const ahead = u.team === 0 ? x - fx : fx - x;
    if (ahead > -P.frontGap) s -= (ahead + P.frontGap) * P.front;
  }
  // Don't get pinned against the back wall, and don't stack with other shooters.
  if ((u.team === 0 ? x : ARENA_W - x) < BLOCK * 1.5) s -= P.wall;
  for (const a of b.live[u.team]) if (a !== u && a.isRanged && Math.abs(a.x - x) < 28 && Math.abs(a.y - y) < 28) s -= P.stack;
  s -= Math.hypot(x - u.x, y - u.y) * P.travel;
  return s;
}

const DIRS = Array.from({ length: 8 }, (_, k) => [Math.cos((k * Math.PI) / 4), Math.sin((k * Math.PI) / 4)]);

/** Periodically looks for a better firing spot around a ranged unit. */
export function planRanged(b: Battle, u: Unit, t: Unit) {
  const cur = spotScore(b, u, t, u.x, u.y);
  let best = cur + P.gain;
  let bx = NaN;
  let by = NaN;
  const tr = b.terrain;
  for (const r of [BLOCK * 1.1, BLOCK * 2.2, BLOCK * 3.3]) {
    for (const [dx, dy] of DIRS) {
      const x = cx_(u.x + dx * r, u.radius);
      const y = cy_(u.y + dy * r);
      if (!u.flying && (isBlocked(tr, cellX(x), cellY(y)) || needsPath(tr, u.mob, u.x, u.y, x, y))) continue;
      const s = spotScore(b, u, t, x, y);
      if (s > best) {
        best = s;
        bx = x;
        by = y;
      }
    }
  }
  if (bx !== bx) {
    u.goalT = 0;
    return;
  }
  u.goalX = bx;
  u.goalY = by;
  u.goalT = 1.6;
  if (!u.flying && tr.h[idx(cellX(bx), cellY(by))] > u.gh) callout(b, u, '抢占高地', '#b8f08a');
  else {
    let chased = false;
    for (const e of b.live[(1 - u.team) as 0 | 1]) if (e.target === u && !e.isRanged && Math.hypot(e.x - u.x, e.y - u.y) < 150) chased = true;
    if (chased) callout(b, u, '后撤', '#ffe08a');
  }
}

/** Moves toward the planned spot. Returns true while still travelling. */
export function goalStep(b: Battle, u: Unit, t: Unit, dt: number): boolean {
  if (u.goalT <= 0) return false;
  u.goalT -= dt;
  const dx = u.goalX - u.x;
  const dy = u.goalY - u.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) {
    u.goalT = 0;
    return false;
  }
  const nx = dx / d;
  const ny = dy / d;
  // Backpedalling while facing the enemy is slower.
  const away = nx * (t.x - u.x) + ny * (t.y - u.y) < 0;
  if (t && t.alive && Math.abs(t.x - u.x) > 2) {
    u.facing = t.x > u.x ? 1 : -1;
  }
  stepDir(b, u, nx, ny, Math.min(dt, d / Math.max(1, b.moveSpeedOf(u))), away ? P.backpedal : 1);
  return true;
}

// ───────────────────────── ability aiming ─────────────────────────

/** Direction of a line attack (length × half-width) that hits the most enemies. */
export function bestLine(b: Battle, u: Unit, len: number, width: number, fallback: Unit): [number, number] {
  const foes = b.live[(1 - u.team) as 0 | 1];
  let bx = fallback.x - u.x;
  let by = fallback.y - u.y;
  let bl = Math.hypot(bx, by) || 1;
  bx /= bl;
  by /= bl;
  let bestN = -1;
  for (const e of foes) {
    if (!e.alive || e.structure) continue;
    let nx = e.x - u.x;
    let ny = e.y - u.y;
    const l = Math.hypot(nx, ny);
    if (l > len || l < 1) continue;
    nx /= l;
    ny /= l;
    let n = 0;
    for (const o of foes) {
      if (!o.alive) continue;
      const rx = o.x - u.x;
      const ry = o.y - u.y;
      const along = rx * nx + ry * ny;
      if (along < 0 || along > len) continue;
      if (Math.abs(rx * ny - ry * nx) <= width + o.radius) n++;
    }
    if (e === fallback) n += 0.5;
    if (n > bestN) {
      bestN = n;
      bx = nx;
      by = ny;
    }
  }
  bl = Math.hypot(bx, by) || 1;
  return [bx / bl, by / bl];
}

/** Enemies (non-boss) within r of a point. */
export function countFoes(b: Battle, team: 0 | 1, x: number, y: number, r: number) {
  let n = 0;
  for (const e of b.live[(1 - team) as 0 | 1]) {
    if (!e.alive || e.structure || e.boss) continue;
    if ((e.x - x) ** 2 + (e.y - y) ** 2 <= (r + e.radius) ** 2) n++;
  }
  return n;
}

/**
 * How attractive it is to knock `e` away from `u`: lava/water/ledges behind the target.
 * Returns [score, label] where label names the hazard for a callout.
 */
export function pushValue(b: Battle, u: Unit, e: Unit): [number, string] {
  const dx = e.x - u.x;
  const dy = e.y - u.y;
  const d = Math.hypot(dx, dy) || 1;
  const tr = b.terrain;
  let best = 0;
  let label = '';
  for (const k of [1, 2, 3]) {
    const x = e.x + (dx / d) * BLOCK * k;
    const y = e.y + (dy / d) * BLOCK * k;
    if (x < 0 || x > ARENA_W || y < 0 || y > ARENA_D) break;
    const i = idx(cellX(x), cellY(y));
    if (isBlocked(tr, cellX(x), cellY(y))) break;
    const s = tr.s[i];
    if (s === S.LAVA && !isFireproof(e.mob) && !e.flying) {
      if (best < 3) {
        best = 3;
        label = '撞进岩浆!';
      }
    } else if (s === S.WATER && hatesWater(e.mob)) {
      if (best < 2) {
        best = 2;
        label = '撞进水里!';
      }
    } else if (s === S.OUCH && hatesOuch(e.mob) && !e.flying) {
      if (best < 2) {
        best = 2;
        label = '撞进 Ouch 水!';
      }
    } else if (e.gh - tr.h[i] >= 2 && best < 1) {
      best = 1;
      label = '撞下高台!';
    }
  }
  return [best, label];
}
