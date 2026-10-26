// Per-mob behaviours. Each hook is optional; anything not overridden falls back to the
// default "walk to nearest reachable enemy and hit/shoot it" logic in sim.ts.
import type { ProjectileKind } from '../core/types.ts';
import type { Battle } from './sim.ts';
import { ARENA_D, ARENA_W, IMM_POISON, type Proj, type Unit } from './unit.ts';
import { S, cellX, cellY, hatesWater, idx, isBlocked } from './terrain.ts';
import { TAC, bestLine, callout, countFoes, isBackliner, pushValue, safeDir } from './tactics.ts';
import { MODERN } from './ai-modern.ts';
import { DUNGEONS_BEHAVIORS } from './ai-dungeons.ts';
import { POST_SIFT_BEHAVIORS } from './ai-post-sift.ts';

export interface DamageOpts {
  proj?: boolean;
  melee?: boolean;
  fire?: boolean;
  aoe?: boolean;
  projRef?: Proj;
}

export interface Behavior {
  init?(u: Unit, b: Battle): void;
  tick?(u: Unit, b: Battle, dt: number): void;
  /** Return true to take full control of movement/attacking this tick. */
  move?(u: Unit, b: Battle, dt: number): boolean;
  target?(u: Unit, b: Battle): Unit | null;
  attack?(u: Unit, t: Unit, b: Battle): void;
  onHit?(u: Unit, t: Unit, dealt: number, b: Battle): void;
  onProjHit?(u: Unit, p: Proj, t: Unit, b: Battle): void;
  onProjExplode?(u: Unit, p: Proj, x: number, y: number, b: Battle): void;
  /** A lobbed projectile came down at (x, y) (or hit terrain on the way). Return true if handled. */
  onProjLand?(u: Unit, p: Proj, x: number, y: number, b: Battle): boolean;
  /** Return true to negate an incoming hit entirely. */
  onDamaged?(u: Unit, src: Unit | null, o: DamageOpts, b: Battle): boolean;
  afterDamaged?(u: Unit, src: Unit | null, d: number, b: Battle): void;
  onKill?(u: Unit, victim: Unit, b: Battle): void;
  onDeath?(u: Unit, b: Battle, killer: Unit | null): void;
}

// ───────────────────────── helpers ─────────────────────────

export function fire(u: Unit, t: Unit, b: Battle, kind: ProjectileKind, dmg: number, mod?: (p: Proj) => void, o: { spread?: number; pierce?: number; special?: string } = {}) {
  const p = b.shoot(u, t, kind, dmg, o);
  mod?.(p);
  if (u.fx.multishot > 0) {
    for (const s of [-0.16, 0.16]) {
      const q = b.shoot(u, t, kind, dmg * u.fx.multishot, { ...o, spread: (o.spread ?? 0) + s });
      mod?.(q);
    }
  }
  return p;
}

export const dist = (a: Unit, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Shulker teleport: lands about `frac` × range from the nearest enemy on our side of it, on
 * dry, open ground, preferring high spots and keeping clear of enemy melee.
 */
function shulkerHop(u: Unit, b: Battle, foes: Unit[], frac: number) {
  let e = foes[0];
  for (const f of foes) if (dist(u, f) < dist(u, e)) e = f;
  const r = b.rangeOf(u);
  const home = u.team === 0 ? -1 : 1;
  const t = b.terrain;
  let best = -Infinity;
  let bx = u.x;
  let by = u.y;
  for (let k = -4; k <= 4; k++) {
    const a = (k / 4) * 1.05;
    for (const d of [frac * 0.85, frac, frac * 1.12]) {
      const x = e.x + Math.cos(a) * home * r * d;
      const y = e.y + Math.sin(a) * r * d;
      if (x < 30 || x > ARENA_W - 30 || y < 20 || y > ARENA_D - 20) continue;
      const cx = cellX(x);
      const cy = cellY(y);
      const s = t.s[idx(cx, cy)];
      if (isBlocked(t, cx, cy) || s === S.LAVA || s === S.WATER) continue;
      let sc = t.h[idx(cx, cy)] * 18 - Math.abs(a) * 25 - Math.abs(d - frac) * 60;
      for (const f of foes) {
        const fd = Math.hypot(f.x - x, f.y - y);
        if (!f.isRanged && fd < 130) sc -= (130 - fd) * 1.5;
      }
      if (sc > best) {
        best = sc;
        bx = x;
        by = y;
      }
    }
  }
  if (best === -Infinity || Math.hypot(bx - u.x, by - u.y) < 40) return;
  u.ab.tpcd = 6;
  u.ab.idle = 0;
  b.emit({ k: 'tele', x: u.x, y: u.y, x2: bx, y2: by, z: u.gz });
  b.emit({ k: 'sfx', id: 'teleport', v: 0.5 });
  callout(b, u, '传送', '#e7d7ff');
  u.x = u.px = bx;
  u.y = u.py = by;
  b.teleported(u);
  u.ref.closed = 1;
  u.retarget = 0;
}

/** Whether this unit's side uses the tactical layer for ability decisions. */
export const smart = (u: Unit, b: Battle) => b.smart[u.team] && TAC.abil;

export const foesOf = (u: Unit, b: Battle) => b.live[(1 - u.team) as 0 | 1];

export function cool(u: Unit, key: string, dt: number, init: number) {
  if (u.ab[key] === undefined) u.ab[key] = init;
  u.ab[key] -= dt;
  return u.ab[key] <= 0;
}

export function resetCd(u: Unit, key: string, cd: number, b?: Battle): number {
  let finalCd = cd;
  if (b && b.has(u.team, 'temporal_sand') && !u.ab[key + '_sand_used']) {
    u.ab[key + '_sand_used'] = 1;
    finalCd = cd * 0.85;
    b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '沙漏 -15%CD', color: '#f1c40f' });
  }
  u.ab[key] = finalCd;
  return finalCd;
}

/** "Backness": how deep an enemy sits on its own side. */
export function backness(e: Unit) {
  return e.team === 0 ? ARENA_W - e.x : e.x;
}

function taunt(u: Unit, b: Battle, r: number, dur: number) {
  b.emit({ k: 'roar', x: u.x, y: u.y, r, color: '#ffd28a' });
  b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '嘲讽!', color: '#ffd28a' });
  b.aoe(u.x, u.y, r, u.team, (e) => {
    if (e.boss) return;
    e.tauntT = dur;
    e.taunter = u;
    e.target = u;
  });
}

function infect(u: Unit, v: Unit, b: Battle, chance: number, mul: number) {
  if (v.boss || v.structure || v.mob.id === 'vex' || v.mob.id === 'end_crystal') return;
  const key = `inf${u.card}`;
  const tm = b.sides[u.team].timers;
  if ((tm[key] ?? 0) >= 8) return;
  if (!b.rng.chance(chance)) return;
  tm[key] = (tm[key] ?? 0) + 1;
  const z = b.summon(u, 'zombie', v.x, v.y, mul, { fx: 'infect' });
  if (z) b.emit({ k: 'text', x: v.x, y: v.y, z: v.gz + 60, s: '感染!', color: '#7bd36b' });
}

/** 袭击队伍: the ravager's roar hurries the illagers around it. */
function raidHorn(u: Unit, b: Battle) {
  b.aoeAllies(u.x, u.y, 220, u.team, (a) => {
    if (!a.mob.families.includes('illager') || a === u) return;
    a.hasteT = 4;
    a.hasteMul = 1.3;
  });
  b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size + 12, s: '袭击号角!', color: '#ffb347', tac: true });
}

/** 箭雨: with two kinds of skeleton fielded, every 3rd shot of any of them is a volley. */
export function arrowRain(u: Unit, b: Battle) {
  if (!b.has(u.team, 'combo_arrow_rain')) return false;
  u.ab.rain = (u.ab.rain ?? 0) + 1;
  return u.ab.rain % 3 === 0;
}

export function splitSlime(u: Unit, b: Battle): Unit[] {
  const out: Unit[] = [];
  if (u.gen >= 2) return out;
  const syn = b.syn(u.team, 'slime') >= 0;
  let n = u.star >= 3 ? 3 : 2;
  if (syn) n += 1;
  const mul = (syn ? 1.3 : 1) * b.sides[u.team].plan.summonMul * (b.has(u.team, 'combo_slime_party') ? 1 / 0.36 : 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + b.rng.range(0, 1);
    const c = b.summon(u, u.mob.id, u.x + Math.cos(a) * u.radius, u.y + Math.sin(a) * u.radius * 0.7, 1, { gen: u.gen + 1, fx: 'split' });
    if (!c) break;
    c.maxHp = c.hp = Math.min(u.maxHp, u.maxHp * 0.36 * mul);
    c.atk = Math.min(u.atk, u.atk * 0.55 * mul);
    c.radius = Math.max(8, u.radius * 0.66);
    c.size = u.size * 0.64;
    c.speed = u.speed * 1.15;
    c.armor = u.armor;
    c.vx = Math.cos(a) * 60;
    c.vy = Math.sin(a) * 40;
    if (b.syn(u.team, 'slime') >= 1 && c.gen === 1) {
      c.addSynergyShield('slime_split', c.maxHp * 0.15, 4.0);
    }
    out.push(c);
  }
  return out;
}

function beamMove(u: Unit, b: Battle, dt: number, chains: number) {
  const B = u.ref.beam as { t: Unit; time: number; dur: number } | null;
  if (!B) return false;
  u.moving = false;
  if (!B.t.alive || dist(u, B.t) > b.reach(u, B.t) + 70 || (smart(u, b) && !b.canSee(u, B.t))) {
    u.ref.beam = null;
    u.atkTimer = u.cd * 0.35;
    return true;
  }
  if (Math.abs(B.t.x - u.x) > 2) u.facing = B.t.x > u.x ? 1 : -1;
  B.time += dt;
  if (B.time >= B.dur) {
    u.ref.beam = null;
    const dealt = b.damage(u, B.t, b.atkOf(u), 'magic', { noDodge: true });
    b.emit({ k: 'hit', x: B.t.x, y: B.t.y, z: B.t.z + B.t.size * 0.5, big: true, color: '#ffe066' });
    b.emit({ k: 'sfx', id: 'laser' });
    b.onAttackHit(u, B.t, dealt, true);
    let from = B.t;
    let mul = 0.7;
    const hit = new Set([B.t.id]);
    for (let c = 0; c < chains; c++) {
      let next: Unit | null = null;
      let nd = 160;
      for (const e of b.live[(1 - u.team) as 0 | 1]) {
        if (hit.has(e.id) || !e.alive) continue;
        const d = dist(e, from);
        if (d < nd) {
          nd = d;
          next = e;
        }
      }
      if (!next) break;
      hit.add(next.id);
      b.emit({ k: 'beam', a: from, b: next, color: '#ffe066', t: 0.25 });
      b.damage(u, next, b.atkOf(u) * mul, 'magic', { noDodge: true });
      from = next;
      mul *= 0.75;
    }
  }
  return true;
}

function startBeam(u: Unit, t: Unit, dur: number) {
  u.ref.beam = { t, time: 0, dur };
}

export function chargeMove(u: Unit, b: Battle, dt: number, o: { mul: number; knock: number; stun: number; all: boolean; speed: number }) {
  const C = u.ref.charge as { dx: number; dy: number; dist: number; max: number; hit: number[]; tgt: Unit } | null;
  if (!C) return false;
  const step = o.speed * dt;
  u.x = Math.max(u.radius, Math.min(ARENA_W - u.radius, u.x + C.dx * step));
  u.y = Math.max(10, Math.min(ARENA_D - 10, u.y + C.dy * step));
  u.moving = true;
  u.walk += step * 1.5;
  C.dist += step;
  let end = C.dist >= C.max;
  b.aoe(u.x, u.y, u.radius + 6, u.team, (e) => {
    if (end || C.hit.includes(e.id)) return;
    if (!o.all && e !== C.tgt) return;
    C.hit.push(e.id);
    b.damage(u, e, b.atkOf(u) * o.mul, 'phys', { melee: true });
    b.knock(e, u.x - C.dx * 20, u.y - C.dy * 20, o.knock);
    if (o.stun > 0) b.stun(e, o.stun);
    b.emit({ k: 'hit', x: e.x, y: e.y, z: e.gz + e.z + e.size * 0.5, big: true, color: '#fff' });
    b.emit({ k: 'sfx', id: 'ram' });
    if (!o.all) end = true;
  });
  if (end) {
    u.ref.charge = null;
    u.atkTimer = Math.max(u.atkTimer, 0.4);
  }
  return true;
}

export function startCharge(u: Unit, t: Unit, extra: number) {
  const d = dist(u, t) || 1;
  u.ref.charge = { dx: (t.x - u.x) / d, dy: (t.y - u.y) / d, dist: 0, max: d + extra, hit: [], tgt: t };
  u.facing = t.x > u.x ? 1 : -1;
}

function sonic(u: Unit, t: Unit, b: Battle, len: number, width: number, dmg: number) {
  let nx: number;
  let ny: number;
  if (smart(u, b)) [nx, ny] = bestLine(b, u, len, width, t);
  else {
    const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
    nx = (t.x - u.x) / d;
    ny = (t.y - u.y) / d;
  }
  b.emit({ k: 'sonic', x: u.x, y: u.y, x2: u.x + nx * len, y2: u.y + ny * len });
  b.emit({ k: 'shake', a: 6 });
  b.emit({ k: 'sfx', id: 'sonic' });
  for (const e of b.live[(1 - u.team) as 0 | 1]) {
    const rx = e.x - u.x;
    const ry = e.y - u.y;
    const along = rx * nx + ry * ny;
    if (along < 0 || along > len) continue;
    const perp = Math.abs(rx * ny - ry * nx);
    if (perp > width + e.radius) continue;
    b.damage(u, e, dmg, 'true', { noDodge: true });
    b.knock(e, u.x, u.y, 60);
  }
}

// ───────────────────────── behaviours ─────────────────────────

export const BEHAVIORS: Record<string, Behavior> = {
  ...MODERN,
  ...DUNGEONS_BEHAVIORS,
  ...POST_SIFT_BEHAVIORS,
  default: {},
  vex: {},

  zombie: {
    onKill(u, v, b) {
      infect(u, v, b, u.star >= 3 ? 0.4 : 0.22, u.star >= 3 ? 1 : 0.6);
    },
  },

  skeleton: {
    attack(u, t, b) {
      u.ab.n = (u.ab.n ?? 0) + 1;
      const every = u.star >= 3 ? 3 : 4;
      const innate = u.ab.n % every === 0;
      const rain = arrowRain(u, b);
      const pierce = u.star >= 3 ? 1 : 0;
      const baseAtk = b.atkOf(u);
      const atk = innate && rain ? baseAtk * 1.15 : baseAtk;
      if (innate || rain) for (const s of [-0.2, 0, 0.2]) fire(u, t, b, 'arrow', atk, undefined, { spread: s, pierce });
      else fire(u, t, b, 'arrow', atk, undefined, { pierce });
    },
  },

  spider: {
    tick(u, _b, dt) {
      u.ab.pcd = (u.ab.pcd ?? 1.2) - dt;
    },
    onHit(u, t, _d, b) {
      if (b.has(u.team, 'combo_venom_web') && t.poisonT > 0) {
        const card = b.cards[u.card];
        card.ref = card.ref ?? {};
        if ((card.ref.webSlowCd ?? 0) <= b.t) {
          card.ref.webSlowCd = b.t + 2.0;
          b.slow(t, 0.20, 0, 2.0);
          b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '蛛网缠绕!', color: '#b0794c' });
        }
      }
    },
    move(u, b, dt) {
      const L = u.ref.leap as { sx: number; sy: number; tx: number; ty: number; t: number; dur: number; tgt: Unit } | null;
      if (L) {
        L.t += dt;
        const f = Math.min(1, L.t / L.dur);
        u.x = L.sx + (L.tx - L.sx) * f;
        u.y = L.sy + (L.ty - L.sy) * f;
        u.z = Math.sin(Math.PI * f) * 48;
        u.vz = 0;
        u.moving = true;
        if (f >= 1) {
          u.z = 0;
          u.ref.leap = null;
          const t = L.tgt;
          if (t.alive && dist(u, t) <= b.reach(u, t) + 24) {
            b.meleeHit(u, t, b.atkOf(u) * 2);
            if (u.star >= 3) b.stun(t, 0.7);
          }
          u.atkTimer = u.cd * 0.6;
        }
        return true;
      }
      let t = u.target;
      if (u.ab.pcd <= 0 && smart(u, b)) {
        // Pounce over the frontline onto a backliner or a wounded enemy when one is in reach.
        let bs = -Infinity;
        for (const e of foesOf(u, b)) {
          if (!e.alive || e.structure || e.invisT > 0 || !b.canReach(u, e)) continue;
          const d = dist(u, e);
          if (d <= 60 || d >= 200) continue;
          const sc = (isBackliner(e) ? 2 : 0) + (1 - e.hpFrac) + (e === u.target ? 0.5 : 0) - d / 200;
          if (sc > bs) {
            bs = sc;
            t = e;
          }
        }
      }
      if (t && t.alive && u.ab.pcd <= 0 && b.canReach(u, t)) {
        const d = dist(u, t);
        if (d > 60 && d < 200) {
          u.target = t;
          u.ab.pcd = 5;
          const k = (u.radius + t.radius) / d;
          u.ref.leap = { sx: u.x, sy: u.y, tx: t.x - (t.x - u.x) * k, ty: t.y - (t.y - u.y) * k, t: 0, dur: 0.42, tgt: t };
          u.facing = t.x > u.x ? 1 : -1;
          b.emit({ k: 'sfx', id: 'leap' });
          return true;
        }
      }
      return false;
    },
  },

  silverfish: {
    afterDamaged(u, _s, _d, b) {
      if (u.ab.called || u.hpFrac >= 0.5) return;
      u.ab.called = 1;
      if (u.isSummon && u.star < 3) return;
      const key = `sf${u.card}`;
      const tm = b.sides[u.team].timers;
      if ((tm[key] ?? 0) >= 12) return;
      if (b.rng.chance(u.star >= 3 ? 0.45 : 0.25)) {
        tm[key] = (tm[key] ?? 0) + 1;
        const s = b.summon(u, 'silverfish', u.x + b.rng.range(-20, 20), u.y + b.rng.range(-20, 20), 1, { fx: 'pop' });
        if (s && u.star < 3) s.ab.called = 1;
      }
    },
  },

  slime: {
    onDeath(u, b) {
      splitSlime(u, b);
    },
  },

  magma_cube: {
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.emit({ k: 'boom', x: t.x, y: t.y, r: 40 + u.radius * 0.5, color: '#ff7a1a', big: false });
      let main = 0;
      b.aoe(t.x, t.y, 40 + u.radius * 0.5, u.team, (e) => {
        const d = b.damage(u, e, e === t ? atk : atk * 0.6, 'phys', { melee: true });
        if (e === t) main = d;
        b.burn(e, atk * 0.2, 2, u);
      });
      b.onAttackHit(u, t, main, false);
    },
    onDeath(u, b) {
      splitSlime(u, b);
    },
  },

  snow_golem: {
    attack(u, t, b) {
      fire(u, t, b, 'snowball', b.atkOf(u), (p) => {
        p.chill = true;
        p.knock = 22;
        if (u.star >= 3) p.splash = 35;
      });
    },
  },

  wolf: {
    init(u) {
      if (u.star >= 3) u.fx = { ...u.fx, lifesteal: u.fx.lifesteal + 0.15 };
    },
    attack(u, t, b) {
      let n = 0;
      for (const a of b.live[u.team]) if (a !== u && a.mob.id === 'wolf') n++;
      const per = u.star >= 3 ? 0.12 : 0.08;
      const mul = 1 + Math.min(u.star >= 3 ? 0.6 : 0.4, per * n);
      b.meleeHit(u, t, b.atkOf(u) * mul);
    },
  },

  bee: {
    tick(u, b, dt) {
      if (u.star >= 3 && u.ab.stung) {
        u.ab.regrow -= dt;
        if (u.ab.regrow <= 0) u.ab.stung = 0;
      } else if (u.ab.stung && b.has(u.team, 'combo_pollination') && !u.isSummon) {
        const hasSniffer = b.live[u.team].some((a) => a.alive && !a.isSummon && a.mob.id === 'sniffer');
        if (hasSniffer) {
          u.ab.regrow = (u.ab.regrow ?? 10) - dt;
          if (u.ab.regrow <= 0) {
            u.ab.stung = 0;
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '毒刺再生!', color: '#ffec3d' });
          }
        }
      }
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      if (!u.ab.stung) {
        u.ab.stung = 1;
        u.ab.regrow = u.star >= 3 ? 8 : 10;
        b.meleeHit(u, t, atk * 3);
        b.poison(t, atk * 0.6, 5, 3, u);
        b.emit({ k: 'sfx', id: 'sting' });
      } else b.meleeHit(u, t, atk * 0.5);
    },
  },

  goat: {
    tick(u, _b, dt) {
      u.ab.rcd = (u.ab.rcd ?? 1.5) - dt;
    },
    move(u, b, dt) {
      if (u.ref.charge) return chargeMove(u, b, dt, { mul: 2.5, knock: 140, stun: 0.5, all: u.star >= 3, speed: 260 });
      let t = u.target;
      let label = '';
      if (u.ab.rcd <= 0 && smart(u, b)) {
        // Ram whoever ends up in lava, water or off a ledge; otherwise prefer backliners.
        let bs = -Infinity;
        for (const e of foesOf(u, b)) {
          if (!e.alive || e.structure || e.invisT > 0 || !b.canReach(u, e)) continue;
          const d = dist(u, e);
          if (d <= 80 || d >= 260) continue;
          const [pv, lab] = pushValue(b, u, e);
          const sc = pv * 2 + (isBackliner(e) ? 1.5 : 0) + (e === u.target ? 0.5 : 0) - d / 260;
          if (sc > bs) {
            bs = sc;
            t = e;
            label = lab;
          }
        }
      }
      if (t && t.alive && u.ab.rcd <= 0 && b.canReach(u, t)) {
        const d = dist(u, t);
        if (d > 80 && d < 260) {
          u.ab.rcd = 6;
          u.target = t;
          startCharge(u, t, 30);
          b.emit({ k: 'sfx', id: 'goat' });
          if (label) callout(b, u, label, '#ffb070');
          return true;
        }
      }
      return false;
    },
  },

  endermite: {
    onDamaged(u, _src, _o, b) {
      if (!b.rng.chance(u.star >= 3 ? 0.4 : 0.25)) return false;
      if (u.star >= 3) {
        const foes = b.live[(1 - u.team) as 0 | 1].filter((e) => !e.structure);
        if (foes.length) {
          const e = foes.reduce((a, c) => (backness(c) > backness(a) ? c : a));
          const nx = e.x + (u.team === 0 ? 30 : -30);
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: nx, y2: e.y, z: u.gz });
          u.x = u.px = Math.max(10, Math.min(ARENA_W - 10, nx));
          u.y = u.py = e.y;
          u.target = e;
          return true;
        }
      }
      b.blink(u, 60);
      return true;
    },
  },

  creeper: {
    target(u, b) {
      let best: Unit | null = null;
      let bestS = -Infinity;
      const foes = b.live[(1 - u.team) as 0 | 1];
      for (const e of foes) {
        if (!b.canReach(u, e) || e.invisT > 0) continue;
        let n = 0;
        for (const o of foes) if (Math.abs(o.x - e.x) < 80 && Math.abs(o.y - e.y) < 80) n++;
        const s = n * 120 - dist(u, e) - (e.structure ? 400 : 0);
        if (s > bestS) {
          bestS = s;
          best = e;
        }
      }
      return best;
    },
    attack(u) {
      if (!u.ab.fuse) {
        u.ab.fuse = 1.0;
        u.ab.fuseMax = 1.0;
      }
    },
    move(u, b, dt) {
      if (!u.ab.fuse) return false;
      u.moving = false;
      u.ab.fuse -= dt;
      if (u.ab.fuse <= 0) {
        const charged = u.star >= 3 || !!u.ref.charged;
        const bm = b.boomMul(u.team);
        const r = 85 * (charged ? 1.4 : 1) * bm.r;
        const dmg = b.atkOf(u) * (charged ? 1.8 : 1) * bm.d;
        b.emit({ k: 'boom', x: u.x, y: u.y, r, color: charged ? '#7fd8ff' : '#ffffff', big: true });
        b.emit({ k: 'shake', a: charged ? 10 : 7 });
        b.emit({ k: 'sfx', id: 'explode' });
        if (charged) b.emit({ k: 'bolt', x: u.x, y: u.y });
        b.aoe(u.x, u.y, r, u.team, (e, f) => {
          b.damage(u, e, dmg * (1 - 0.5 * f), 'phys', { noCrit: false });
          b.knock(e, u.x, u.y, 130);
        });
        b.blast(u.x, u.y, r);
        u.ref.exploded = 1;
        b.kill(u, null, true);
      }
      return true;
    },
  },

  witch: {
    target(u, b) {
      return b.findTarget(u, (e) => !e.mob.families.includes('undead')) ?? b.findTarget(u);
    },
    attack(u, t, b) {
      u.ab.n = (u.ab.n ?? 0) + 1;
      const atk = b.atkOf(u);
      if (u.ab.n % 3 === 0) {
        let ally: Unit | null = null;
        let as = -Infinity;
        const sm = smart(u, b);
        const brew = b.has(u.team, 'combo_undead_brew');
        for (const a of b.live[u.team]) {
          if ((!brew && a.mob.families.includes('undead')) || a.hpFrac >= 0.7 || a.structure) continue;
          if (dist(u, a) > 260) continue;
          // Withered allies can't be healed; allies under fire need it most.
          if (sm && a.witherT > 0.5) continue;
          const sc = 1 - a.hpFrac + (sm ? Math.min(0.3, (a.inDps / a.maxHp) * 4) : 0);
          if (sc > as) {
            as = sc;
            ally = a;
          }
        }
        if (ally) {
          // 亡者的药剂: undead allies get a harming potion, which heals them even more.
          const undead = ally.mob.families.includes('undead');
          b.shoot(u, ally, 'potion', atk * 1.8 * (undead ? 1.5 : 1), { special: 'heal', aoe: 0, tx: ally.x, ty: ally.y });
          return;
        }
      }
      fire(u, t, b, 'potion', atk, undefined, { special: 'harm' });
      if (u.star >= 3) {
        const others = b.live[(1 - u.team) as 0 | 1].filter((e) => e !== t && dist(u, e) < b.rangeOf(u) + 40);
        const t2 = others.length ? b.rng.pick(others) : t;
        b.shoot(u, t2, 'potion', atk, { special: 'harm', spread: 0.05 });
      }
    },
    afterDamaged(u, _s, _d, b) {
      if (!u.ab.drank && u.hpFrac < 0.4) {
        u.ab.drank = 1;
        b.heal(u, u.maxHp * 0.4, u);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '咕嘟!', color: '#ff7eb6' });
      }
    },
  },

  pillager: {
    attack(u, t, b) {
      const spreads = u.star >= 3 ? [-0.12, 0, 0.12] : [0];
      for (const s of spreads) fire(u, t, b, 'bolt', b.atkOf(u), undefined, { spread: s, pierce: 2 });
    },
  },

  vindicator: {
    tick(u, b) {
      if (!u.ab.rage && u.hpFrac < 0.5) {
        u.ab.rage = 1;
        u.atkSpd *= 1.4;
        u.moveSpd *= 1.2;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '狂暴!', color: '#ff5d5d' });
      }
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.meleeHit(u, t, atk);
      if (u.star >= 3)
        b.aoe(t.x, t.y, 50, u.team, (e) => {
          if (e !== t) b.damage(u, e, atk * 0.5, 'phys', { melee: true, noCrit: true });
        });
    },
  },

  husk: {
    init(u) {
      if (u.star >= 3) {
        u.immune |= IMM_POISON;
        u.fx = { ...u.fx, lifesteal: u.fx.lifesteal + 0.15 };
      }
    },
    onHit(_u, t, _d, b) {
      b.hunger(t, 3);
    },
  },

  stray: {
    attack(u, t, b) {
      const volley = arrowRain(u, b);
      for (const s of volley ? [-0.2, 0, 0.2] : [0])
        fire(u, t, b, 'arrow', b.atkOf(u), (p) => {
          p.slowDur = 2.5 * (b.has(u.team, 'combo_frost') ? 1.5 : 1);
          if (u.star >= 3) p.stun = 0.35;
        }, { spread: s });
    },
  },

  drowned: {
    tick(u, _b, dt) {
      u.ab.tcd = (u.ab.tcd ?? 0.8) - dt;
    },
    move(u, b) {
      const t = u.target;
      if (t && t.alive && u.ab.tcd <= 0 && (!smart(u, b) || b.canSee(u, t))) {
        const d = dist(u, t);
        if (d > 80 && d < 260) {
          u.ab.tcd = b.has(u.team, 'combo_monument') ? 2.8 : 4;
          u.animAtk = 0.3;
          u.facing = t.x > u.x ? 1 : -1;
          fire(u, t, b, 'trident', b.atkOf(u) * 2.2, (p) => {
            if (u.star >= 3) p.special = 'bolt';
          });
        }
      }
      return false;
    },
    onProjHit(u, p, t, b) {
      if (p.special === 'bolt') b.lightning(u, t.x, t.y, b.atkOf(u), 40);
    },
  },

  cave_spider: {
    onHit(u, t, _d, b) {
      b.poison(t, b.atkOf(u) * 0.5, 4, u.star >= 3 ? 5 : 3, u);
      if (b.has(u.team, 'combo_venom_web') && t.poisonT > 0) {
        const card = b.cards[u.card];
        card.ref = card.ref ?? {};
        if ((card.ref.webSlowCd ?? 0) <= b.t) {
          card.ref.webSlowCd = b.t + 2.0;
          b.slow(t, 0.20, 0, 2.0);
          b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size, s: '蛛网缠绕!', color: '#b0794c' });
        }
      }
    },
  },

  polar_bear: {
    tick(u, b, dt) {
      if (u.star >= 3 && cool(u, 'tc', dt, 3)) {
        if (smart(u, b) && countFoes(b, u.team, u.x, u.y, 120) < 2) u.ab.tc = 0.4;
        else {
          u.ab.tc = 8;
          taunt(u, b, 120, 2);
        }
      }
    },
    attack(u, t, b) {
      u.ab.n = (u.ab.n ?? 0) + 1;
      if (u.ab.n % 3 === 0) {
        b.meleeHit(u, t, b.atkOf(u) * 2);
        b.stun(t, 0.4);
        b.emit({ k: 'shake', a: 2 });
      } else b.meleeHit(u, t, b.atkOf(u));
    },
  },

  phantom: {
    init(u) {
      u.ab.state = 0;
      u.ab.st = 0.8;
      u.alt = 100;
      u.z = 100;
    },
    target(u, b) {
      let best: Unit | null = null;
      let bs = -Infinity;
      for (const e of b.live[(1 - u.team) as 0 | 1]) {
        if (e.invisT > 0) continue;
        const s = backness(e) + (e.isRanged ? 160 : 0) - (e.structure ? 300 : 0);
        if (s > bs) {
          bs = s;
          best = e;
        }
      }
      return best;
    },
    move(u, b, dt) {
      u.atkTimer = Math.max(0, u.atkTimer - dt * b.atkSpeedOf(u));
      let t = u.target;
      if (!t || !t.alive || t.invisT > 0) t = u.target = BEHAVIORS.phantom.target!(u, b);
      if (!t) return true;
      const sp = b.moveSpeedOf(u);
      const goto = (x: number, y: number, s: number) => {
        const dx = x - u.x;
        const dy = y - u.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) return d;
        const st = Math.min(d, s * dt);
        u.x += (dx / d) * st;
        u.y += (dy / d) * st;
        if (Math.abs(dx) > 2) u.facing = dx > 0 ? 1 : -1;
        return d;
      };
      u.moving = true;
      if (u.ab.state === 0) {
        u.alt = 100;
        const ox = t.x + (u.team === 0 ? -140 : 140);
        goto(ox, t.y + Math.sin(u.age * 2 + u.id) * 50, sp * 0.8);
        u.ab.st -= dt;
        if (u.ab.st <= 0 && u.atkTimer <= 0) u.ab.state = 1;
      } else if (u.ab.state === 1) {
        u.alt = 16;
        const d = goto(t.x, t.y, sp * 1.7);
        if (d <= u.radius + t.radius + 12 && u.z < 50) {
          const m = u.star >= 3 ? 1.5 : 1;
          b.meleeHit(u, t, b.atkOf(u) * m);
          if (u.star >= 3) b.wither(t, b.atkOf(u) * 0.2, 3, u);
          u.atkTimer = u.cd;
          u.animAtk = 0.25;
          u.ab.state = 2;
          u.ab.st = 0.7;
          b.emit({ k: 'sfx', id: 'swoop' });
        }
      } else {
        u.alt = 110;
        goto(u.x + (u.team === 0 ? -1 : 1) * 100, u.y + (u.y < ARENA_D / 2 ? 60 : -60), sp);
        u.ab.st -= dt;
        if (u.ab.st <= 0) {
          u.ab.state = 0;
          u.ab.st = 1.0;
        }
      }
      return true;
    },
  },

  blaze: {
    tick(u, b, dt) {
      if (u.ab.volley > 0) {
        u.ab.vt -= dt;
        if (u.ab.vt <= 0) {
          u.ab.vt = 0.18;
          u.ab.volley--;
          const t = (u.ref.vt as Unit | undefined)?.alive ? (u.ref.vt as Unit) : u.target;
          if (t && t.alive) {
            const atk = b.atkOf(u);
            fire(u, t, b, 'fireball', atk, (p) => {
              p.burn = atk * 0.3;
              p.burnDur = 3;
              if (u.star >= 3) p.splash = 30;
            });
          }
        }
      }
    },
    attack(u, t) {
      u.ab.volley = u.star >= 3 ? 4 : 3;
      u.ab.vt = 0;
      u.ref.vt = t;
    },
  },

  enderman: {
    init(u, b) {
      u.ab.tp = 0.8 + b.rng.range(0, 0.4);
    },
    tick(u, b, dt) {
      u.ab.dcd = Math.max(0, (u.ab.dcd ?? 0) - dt);
      if (u.ab.tp > 0) {
        u.ab.tp -= dt;
        if (u.ab.tp <= 0) {
          u.ab.tp = -1;
          let foes = b.live[(1 - u.team) as 0 | 1].filter((e) => !e.structure && e.invisT <= 0);
          // Never blink next to water.
          if (smart(u, b) && hatesWater(u.mob)) {
            const dry = foes.filter((e) => b.terrain.s[idx(cellX(e.x), cellY(e.y))] !== S.WATER);
            if (dry.length) foes = dry;
          }
          if (!foes.length) return;
          const e = foes.reduce((a, c) => (backness(c) + (c.isRanged ? 200 : 0) > backness(a) + (a.isRanged ? 200 : 0) ? c : a));
          const nx = Math.max(20, Math.min(ARENA_W - 20, e.x + (u.team === 0 ? 34 : -34)));
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: nx, y2: e.y, z: u.gz });
          b.emit({ k: 'sfx', id: 'teleport' });
          u.x = u.px = nx;
          u.y = u.py = e.y;
          b.teleported(u);
          u.target = e;
          u.retarget = 1.5;
          if (u.star >= 3) u.ab.amb = 1;
        }
      }
    },
    attack(u, t, b) {
      let m = 1;
      if (u.ab.amb) {
        u.ab.amb = 0;
        m = 2;
        b.stun(t, 1);
      }
      b.meleeHit(u, t, b.atkOf(u) * m);
    },
    onDamaged(u, _src, o, b) {
      if (o.proj && (u.ab.dcd ?? 0) <= 0) {
        u.ab.dcd = 1;
        b.blink(u, 80);
        b.emit({ k: 'sfx', id: 'teleport', v: 0.4 });
        return true;
      }
      return false;
    },
  },

  evoker: {
    tick(u, b, dt) {
      if (cool(u, 'sc', dt, 1.5)) {
        u.ab.sc = 9;
        let alive = 0;
        for (const a of b.live[u.team]) if (a.ref.owner === u) alive++;
        const n = Math.min(u.star >= 3 ? 4 : 3, 6 - alive);
        for (let i = 0; i < n; i++) {
          const v = b.summon(u, 'vex', u.x + b.rng.range(-30, 30), u.y + b.rng.range(-40, 40), 1, { lifespan: 25, fx: 'summon' });
          if (v) v.ref.owner = u;
        }
        if (n > 0) {
          u.animAtk = 0.5;
          b.emit({ k: 'sfx', id: 'summon' });
        }
      }
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.emit({ k: 'sfx', id: 'fangs' });
      let near = false;
      if (u.star >= 3) for (const e of b.live[(1 - u.team) as 0 | 1]) if (dist(u, e) < 90) near = true;
      if (near) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          b.addDelayed({ t: 0.25, x: u.x + Math.cos(a) * 55, y: u.y + Math.sin(a) * 40, r: 24, dmg: atk, team: u.team, src: u, kind: 'fang' });
        }
        return;
      }
      let nx = t.x - u.x;
      let ny = t.y - u.y;
      const d = Math.hypot(nx, ny) || 1;
      nx /= d;
      ny /= d;
      // Lay the fang line through as many enemies as possible.
      if (smart(u, b)) [nx, ny] = bestLine(b, u, 270, 22, t);
      for (let i = 0; i < 7; i++) {
        const s = 28 + i * 34;
        const fx = u.x + nx * s;
        const fy = u.y + ny * s;
        // Fangs erupt from the ground: trees, rocks and walls stop the line.
        if (isBlocked(b.terrain, cellX(fx), cellY(fy))) break;
        b.addDelayed({ t: 0.12 + i * 0.06, x: fx, y: fy, r: 22, dmg: atk, team: u.team, src: u, kind: 'fang' });
      }
    },
  },

  piglin_brute: {
    attack(u, t, b) {
      b.meleeHit(u, t, b.atkOf(u) * (t.hpFrac < 0.4 ? 1.5 : 1));
    },
    onKill(u, _v, b) {
      if (u.star >= 3) b.heal(u, u.maxHp * 0.2, u);
    },
  },

  hoglin: {
    attack(u, t, b) {
      u.ab.n = (u.ab.n ?? 0) + 1;
      const atk = b.atkOf(u);
      if (u.ab.n % 3 === 0) {
        if (u.star >= 3) {
          b.aoe(t.x, t.y, 55, u.team, (e) => {
            b.damage(u, e, atk * 1.3, 'phys', { melee: true });
            b.knockup(e, 0.9);
          });
          b.emit({ k: 'boom', x: t.x, y: t.y, r: 55, color: '#c98a5a', big: false });
        } else {
          b.meleeHit(u, t, atk * 1.3);
          b.knockup(t, 0.9);
        }
        b.emit({ k: 'sfx', id: 'toss' });
      } else b.meleeHit(u, t, atk);
    },
  },

  shulker: {
    init(u) {
      u.ref.closed = 1;
      u.ab.open = 0;
      u.ab.tpcd = 1.5;
      u.ab.idle = 0;
      u.ab.chk = 0;
    },
    tick(u, b, dt) {
      if (u.ab.open > 0) {
        u.ab.open -= dt;
        if (u.ab.open <= 0) u.ref.closed = 1;
      }
      u.ab.tpcd -= dt;
      u.ab.chk -= dt;
      if (u.ab.chk > 0) return;
      u.ab.chk = 0.5;
      const foes = b.live[(1 - u.team) as 0 | 1].filter((e) => !e.structure && e.invisT <= 0);
      if (!foes.length) return;
      // Hurt: hop back out of reach once (vanilla shulkers teleport away when hit).
      if (!u.ab.tp && u.hpFrac < 0.5) {
        u.ab.tp = 1;
        shulkerHop(u, b, foes, 0.95);
        return;
      }
      // Nothing in reach (it cannot walk): teleport toward the fight instead of idling.
      const r = b.rangeOf(u);
      const inRange = foes.some((e) => dist(u, e) <= r + e.radius);
      u.ab.idle = inRange ? 0 : u.ab.idle + 0.5;
      if (u.ab.idle >= 1 && u.ab.tpcd <= 0) shulkerHop(u, b, foes, 0.7);
    },
    attack(u, t, b) {
      u.ref.closed = 0;
      u.ab.open = 0.9;
      const atk = b.atkOf(u);
      const targets = [t];
      if (u.star >= 3) {
        const others = b.live[(1 - u.team) as 0 | 1].filter((e) => e !== t && !e.structure);
        targets.push(others.length ? b.rng.pick(others) : t);
      }
      const levitateChance = [0.2, 0.3, 0.4][Math.max(0, Math.min(2, u.star - 1))];
      const levitates = b.rng.chance(levitateChance);
      for (const tt of targets)
        fire(u, tt, b, 'shulker_bullet', atk, (p) => {
          if (levitates) p.lev = 1.5;
        });
      b.emit({ k: 'sfx', id: 'shulker' });
    },
  },

  ghast: {
    attack(u, t, b) {
      const atk = b.atkOf(u);
      fire(u, t, b, 'big_fireball', atk, (p) => {
        p.burn = atk * 0.08;
        p.burnDur = 3;
      });
      b.emit({ k: 'sfx', id: 'ghast' });
    },
    onProjExplode(u, p, x, y, b) {
      if (u.star >= 3 && p.kind === 'big_fireball') b.addZone({ x, y, r: 60, dur: 3, team: u.team, dps: b.atkOf(u) * 0.15, kind: 'fire', src: u });
    },
  },

  wither_skeleton: {
    onHit(u, t, _d, b) {
      const atk = b.atkOf(u);
      b.wither(t, atk * 0.23 * (u.star >= 3 ? 2 : 1), u.star >= 3 ? 6 : 4, u);
    },
  },

  guardian: {
    init(u) {
      u.fx = { ...u.fx, thorns: u.fx.thorns + 0.2 };
    },
    attack(u, t, b) {
      startBeam(u, t, b.has(u.team, 'combo_monument') ? 1.1 : 1.6);
      b.emit({ k: 'sfx', id: 'charge' });
    },
    move(u, b, dt) {
      return beamMove(u, b, dt, u.star >= 3 ? 1 : 0);
    },
  },

  elder_guardian: {
    init(u) {
      u.fx = { ...u.fx, thorns: u.fx.thorns + 0.25 };
    },
    attack(u, t, b) {
      startBeam(u, t, b.has(u.team, 'combo_monument') ? 1.25 : 1.8);
      b.emit({ k: 'sfx', id: 'charge' });
    },
    move(u, b, dt) {
      return beamMove(u, b, dt, u.star >= 3 ? 1 : 0);
    },
  },

  iron_golem: {
    tick(u, b, dt) {
      if (cool(u, 'ac', dt, 0)) {
        u.ab.ac = 0.2;
        b.aoeAllies(u.x, u.y, b.has(u.team, 'combo_village_guard') ? 260 : 130, u.team, (a) => {
          if (a !== u) a.auraT = 0.3;
        });
      }
      if (u.star >= 3 && cool(u, 'tc', dt, 2)) {
        if (smart(u, b) && countFoes(b, u.team, u.x, u.y, 140) < 2) u.ab.tc = 0.4;
        else {
          u.ab.tc = 8;
          taunt(u, b, 140, 2.5);
        }
      }
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.meleeHit(u, t, atk);
      b.knockup(t, 1.0);
      if (u.star >= 3)
        b.aoe(t.x, t.y, 50, u.team, (e) => {
          if (e === t) return;
          b.damage(u, e, atk * 0.5, 'phys', { melee: true, noCrit: true });
          b.knockup(e, 1.0);
        });
      b.emit({ k: 'sfx', id: 'golem' });
    },
  },

  ravager: {
    tick(u, b, dt) {
      if (cool(u, 'roar', dt, 3)) {
        // Hold the roar until it can catch several enemies (or nothing better comes).
        const n = smart(u, b) ? countFoes(b, u.team, u.x, u.y, 150) : 2;
        if (n === 0 || (n < 2 && (u.ab.rw ?? 0) < 2.5)) {
          u.ab.rw = (u.ab.rw ?? 0) + (n ? 0.3 : 0);
          u.ab.roar = 0.3;
          return;
        }
        u.ab.rw = 0;
        u.ab.roar = u.star >= 3 ? 5 : 8;
        const atk = b.atkOf(u);
        if (b.has(u.team, 'combo_raid')) raidHorn(u, b);
        b.emit({ k: 'roar', x: u.x, y: u.y, r: 150, color: '#ffe0a0' });
        b.emit({ k: 'shake', a: 5 });
        b.emit({ k: 'sfx', id: 'roar' });
        u.animAtk = 0.5;
        b.aoe(u.x, u.y, 150, u.team, (e) => {
          b.damage(u, e, atk * 0.6, 'phys', { noCrit: true });
          b.knock(e, u.x, u.y, 150);
          b.stun(e, 1);
        });
      }
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.meleeHit(u, t, atk);
      b.aoe(t.x, t.y, 40, u.team, (e) => {
        if (e !== t) b.damage(u, e, atk * 0.5, 'phys', { melee: true, noCrit: true });
      });
    },
  },

  breeze: {
    tick(u, _b, dt) {
      u.ab.hop = (u.ab.hop ?? 0) - dt;
    },
    move(u, b) {
      if (u.ab.hop > 0) return false;
      let near: Unit | null = null;
      let nd = 110;
      for (const e of b.live[(1 - u.team) as 0 | 1]) {
        if (e.isRanged || e.structure) continue;
        const d = dist(u, e);
        if (d < nd) {
          nd = d;
          near = e;
        }
      }
      if (near) {
        u.ab.hop = 1.8;
        const dx = u.x - near.x;
        const dy = u.y - near.y;
        const d = Math.hypot(dx, dy) || 1;
        let hx = (dx / d) * 260 + (u.team === 0 ? -120 : 120);
        let hy = (dy / d) * 160;
        if (smart(u, b)) {
          // Don't hop into a wall or a corner.
          const l = Math.hypot(hx, hy) || 1;
          const [sx, sy] = safeDir(b, { ...u, flying: false } as Unit, hx / l, hy / l);
          hx = sx * l;
          hy = sy * l;
        }
        u.vx += hx;
        u.vy += hy;
        u.z += 6;
        u.vz = 220;
        b.emit({ k: 'sfx', id: 'wind', v: 0.4 });
      }
      return false;
    },
    attack(u, t, b) {
      fire(u, t, b, 'wind_charge', b.atkOf(u), (p) => {
        p.knock = 160;
      });
    },
    onProjHit(u, p, t, b) {
      if (p.kind === 'wind_charge' && b.has(u.team, 'combo_fanned_flame') && t.burnT > 0) {
        const cd = b.sides[u.team].timers.fanned_flame_cd ?? 0;
        if (b.t >= cd) {
          b.sides[u.team].timers.fanned_flame_cd = b.t + 2.0;
          const foes = b.live[(1 - u.team) as 0 | 1].filter((e) => e !== t && e.alive && !e.structure && e.burnT <= 0 && Math.hypot(e.x - t.x, e.y - t.y) <= 90);
          foes.sort((a, b2) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b2.x - t.x, b2.y - t.y));
          const spreadTargets = foes.slice(0, 2);
          const spreadDps = t.burnDps * 0.5;
          for (const st of spreadTargets) {
            b.burn(st, spreadDps, 2, u);
            b.emit({ k: 'hit', x: st.x, y: st.y, z: st.gz + st.z + st.size * 0.5, big: false, color: '#ff7a3d' });
          }
          if (spreadTargets.length > 0) {
            b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.z + t.size + 8, s: '风助烈焰!', color: '#ff7a3d' });
          }
        }
      }
    },
    onProjExplode(u, p, x, y, b) {
      if (u.star >= 3 && p.kind === 'wind_charge') {
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI * 2;
          const px = x + Math.cos(a) * 50;
          const py = y + Math.sin(a) * 36;
          b.emit({ k: 'boom', x: px, y: py, r: 35, color: '#bfe6ff', big: false });
          b.aoe(px, py, 35, u.team, (e) => {
            b.damage(u, e, p.dmg * 0.4, 'phys', { proj: true, noCrit: true });
            b.knock(e, px, py, 80);
          });
        }
      }
    },
    onDamaged(u, src, o, b) {
      const p = o.projRef;
      if (!o.proj || !p || p.reflected || !src || !src.alive) return false;
      // Deflection has a short cooldown so ranged teams are never fully shut out.
      if (b.t - (u.ab.deflectT ?? -9) < 0.7) return false;
      if (!b.rng.chance(u.star >= 3 ? 0.65 : 0.45)) return false;
      u.ab.deflectT = b.t;
      const q = b.shoot(u, src, p.kind, p.dmg, { special: p.special });
      q.reflected = true;
      q.burn = p.burn;
      q.burnDur = p.burnDur;
      q.wither = p.wither;
      q.witherDur = p.witherDur;
      b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '反弹!', color: '#bfe6ff' });
      return true;
    },
  },

  illusioner: {
    tick(u, b, dt) {
      if (u.isSummon) return;
      if (cool(u, 'ic', dt, 0.5)) {
        u.ab.ic = 12;
        const n = u.star >= 3 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const c = b.summon(u, 'illusioner', u.x + b.rng.range(-50, 50), u.y + b.rng.range(-70, 70), 1, { lifespan: 10, alpha: 0.55, fx: 'illusion' });
          if (!c) break;
          c.maxHp = c.hp = u.maxHp * 0.15;
          c.atk = u.atk * 0.4;
        }
        b.emit({ k: 'sfx', id: 'illusion' });
      }
      if (cool(u, 'bc', dt, 3)) {
        u.ab.bc = 10;
        const foeCards = [...new Set(b.live[(1 - u.team) as 0 | 1].filter((e) => !e.structure).map((e) => e.card))];
        b.rng.shuffle(foeCards);
        for (const ci of foeCards.slice(0, u.star >= 3 ? 2 : 1)) {
          let shown = false;
          for (const e of b.live[(1 - u.team) as 0 | 1])
            if (e.card === ci) {
              e.blindT = 4;
              if (!shown) {
                shown = true;
                b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.z + e.size, s: '失明!', color: '#8e9eff' });
              }
            }
        }
      }
    },
  },

  warden: {
    tick(u, b, dt) {
      u.ab.anger = Math.floor((1 - u.hpFrac) * 10);
      if (cool(u, 'sb', dt, 4) && u.target && u.target.alive) {
        u.ab.sb = u.star >= 3 ? 4.5 : 6;
        u.animAtk = 0.6;
        sonic(u, u.target, b, 320, 22, b.atkOf(u));
      } else if (u.ab.sb <= 0) u.ab.sb = 0.3;
    },
    attack(u, t, b) {
      // 幽匿歌谣: the singer's song makes the anger count twice.
      const anger = (u.ab.anger ?? 0) * (b.has(u.team, 'combo_sculk_song') ? 2 : 1);
      b.meleeHit(u, t, b.atkOf(u) * (1 + 0.06 * anger));
      b.emit({ k: 'shake', a: 2 });
    },
  },

  wither: {
    init(u) {
      if (u.star >= 3) u.ab.boom = 1;
    },
    tick(u, b, dt) {
      if (u.ab.boom > 0) {
        u.ab.boom -= dt;
        if (u.ab.boom <= 0) {
          u.ab.boom = -1;
          b.emit({ k: 'boom', x: u.x, y: u.y, r: 260, color: '#9fd4ff', big: true });
          b.emit({ k: 'shake', a: 12 });
          b.emit({ k: 'sfx', id: 'wither_spawn' });
          for (const e of b.live[(1 - u.team) as 0 | 1]) b.damage(u, e, b.atkOf(u) * 3, 'magic', { noCrit: true });
          b.blast(u.x, u.y, 260);
        }
      }
    },
    attack(u, t, b) {
      u.ab.n = (u.ab.n ?? 0) + 1;
      const atk = b.atkOf(u);
      const foes = b.live[(1 - u.team) as 0 | 1].filter((e) => dist(u, e) < b.rangeOf(u) + 60);
      const tt = u.ab.n % 3 === 0 || !foes.length ? t : b.rng.pick(foes);
      if (u.ab.n % 4 === 0)
        fire(u, tt, b, 'blue_skull', atk * 2, (p) => {
          p.wither = atk * 0.12;
          p.witherDur = 3;
        });
      else
        fire(u, tt, b, 'wither_skull', atk, (p) => {
          p.wither = atk * 0.1;
          p.witherDur = 3;
        });
    },
    afterDamaged(u) {
      if (u.hpFrac < 0.5) u.ref.witherArmor = 1;
    },
  },

  giant: {
    attack(u, t, b) {
      const r = 75 * (u.star >= 3 ? 1.3 : 1);
      const atk = b.atkOf(u);
      const cx = u.x + u.facing * u.radius * 0.8;
      const cy = u.y;
      b.emit({ k: 'boom', x: cx, y: cy, r, color: '#a07850', big: true });
      b.emit({ k: 'shake', a: 5 });
      b.emit({ k: 'sfx', id: 'stomp' });
      let main = 0;
      b.aoe(cx, cy, r, u.team, (e) => {
        const d = b.damage(u, e, atk, 'phys', { melee: true });
        if (e === t) main = d;
        b.knock(e, cx, cy, 90);
      });
      if (dist(u, t) > r + t.radius) main = b.damage(u, t, atk, 'phys', { melee: true });
      b.onAttackHit(u, t, main, false);
    },
    onKill(u, v, b) {
      infect(u, v, b, 0.4, u.star >= 3 ? 1 : 0.6);
    },
  },

  copper_golem: {
    tick(u, b, dt) {
      // Lightning rod: calls a bolt onto the nearest enemy every few seconds.
      if (!cool(u, 'rod', dt, 2)) return;
      u.ab.rod = 5;
      let best: Unit | null = null;
      let bd = 260;
      for (const e of foesOf(u, b)) {
        if (!e.alive || e.structure) continue;
        const d = dist(u, e);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      if (!best) {
        u.ab.rod = 0.5;
        return;
      }
      u.animAtk = 0.4;
      b.lightning(u, best.x, best.y, b.atkOf(u) * 4, 40);
    },
  },

  dispenser: {
    target(u, b) {
      let best: Unit | null = null;
      let bd = Infinity;
      const r = b.rangeOf(u);
      for (const e of b.live[(1 - u.team) as 0 | 1]) {
        if (!e.alive || e.structure || e.invisT > 0) continue;
        const d = dist(u, e) - e.radius;
        if (d < bd && d <= r) {
          bd = d;
          best = e;
        }
      }
      return best;
    },
  },

  end_crystal: {
    move(u, b) {
      u.moving = false;
      let dragon: Unit | null = null;
      for (const a of b.live[u.team]) if (a.mob.id === 'ender_dragon_boss') dragon = a;
      u.ref.beamTo = dragon;
      if (dragon) b.heal(dragon, dragon.maxHp * 0.005 * (1 / 30), null, true);
      return true;
    },
    onDeath(u, b) {
      b.emit({ k: 'boom', x: u.x, y: u.y, r: 70, color: '#ff9cf0', big: true });
      b.emit({ k: 'shake', a: 6 });
      b.emit({ k: 'sfx', id: 'explode' });
      b.aoe(u.x, u.y, 70, u.team, (e) => b.damage(null, e, 40, 'phys', { noCrit: true }));
      b.blast(u.x, u.y, 70);
    },
  },

  // ───────────────────────── Bosses ─────────────────────────

  ravager_boss: {
    tick(u, b, dt) {
      const atk = b.atkOf(u);
      if (cool(u, 'roar', dt, 5)) {
        u.ab.roar = 8;
        u.animAtk = 0.5;
        b.emit({ k: 'roar', x: u.x, y: u.y, r: 160, color: '#ffe0a0' });
        b.emit({ k: 'shake', a: 7 });
        b.emit({ k: 'sfx', id: 'roar' });
        b.aoe(u.x, u.y, 160, u.team, (e) => {
          b.damage(u, e, atk * 0.5, 'phys', { noCrit: true });
          b.knock(e, u.x, u.y, 150);
          b.stun(e, 0.8);
        });
      }
      if (cool(u, 'horn', dt, 8)) {
        u.ab.horn = 16;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size + 10, s: '袭击号角!', color: '#ffb347' });
        b.emit({ k: 'sfx', id: 'horn' });
        const bx = b.rowX(u.team, 'back');
        for (const [m, dy] of [['pillager', -90], ['pillager', 90]] as const)
          b.summon(u, m, bx, ARENA_D / 2 + dy + b.rng.range(-20, 20), 0.6, { fx: 'summon' });
      }
      if (!u.ab.rage && u.hpFrac < 0.4) {
        u.ab.rage = 1;
        u.atkSpd *= 1.3;
        u.moveSpd *= 1.4;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '狂暴!', color: '#ff5d5d' });
        b.emit({ k: 'phase', s: 'enrage' });
      }
      if (u.ab.rage) u.ab.ccd = (u.ab.ccd ?? 2) - dt;
    },
    move(u, b, dt) {
      if (u.ref.charge) return chargeMove(u, b, dt, { mul: 1.5, knock: 180, stun: 0.6, all: true, speed: 300 });
      if (u.ab.rage && u.ab.ccd <= 0 && u.target && u.target.alive) {
        const d = dist(u, u.target);
        if (d > 70 && d < 320) {
          u.ab.ccd = 5;
          startCharge(u, u.target, 80);
          b.emit({ k: 'sfx', id: 'roar', v: 0.6 });
          return true;
        }
      }
      return false;
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.meleeHit(u, t, atk);
      b.aoe(t.x, t.y, 55, u.team, (e) => {
        if (e !== t) b.damage(u, e, atk * 0.5, 'phys', { melee: true, noCrit: true });
      });
    },
  },

  elder_guardian_boss: {
    init(u) {
      u.fx = { ...u.fx, thorns: u.fx.thorns + 0.25 };
    },
    tick(u, b, dt) {
      if (cool(u, 'sum', dt, 9)) {
        u.ab.sum = 18;
        let alive = 0;
        for (const a of b.live[u.team]) if (a.mob.id === 'guardian' && a.isSummon) alive++;
        for (let i = 0; i < Math.min(1, 2 - alive); i++)
          b.summon(u, 'guardian', u.x + b.rng.range(-70, 20), u.y + (i ? 70 : -70), 0.8, { fx: 'summon' });
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '守卫集结!', color: '#5ee6d6' });
      }
      if (!u.ab.p2 && u.hpFrac < 0.5 && b.has(u.team, 'omen_enrage')) {
        u.ab.p2 = 1;
        b.emit({ k: 'phase', s: 'guardian2' });
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size + 10, s: '深海护盾与溺尸护卫！', color: '#5ee6d6' });
        b.emit({ k: 'roar', x: u.x, y: u.y, r: 300, color: '#5ee6d6' });
        u.shield += u.maxHp * 0.15;
        b.summon(u, 'drowned', u.x + (u.team === 0 ? 30 : -30), ARENA_D / 2, 0.7, { fx: 'summon' });
      }
    },
    attack(u, t, b) {
      startBeam(u, t, 1.5);
      b.emit({ k: 'sfx', id: 'charge' });
    },
    move(u, b, dt) {
      return beamMove(u, b, dt, 1);
    },
  },

  wither_boss: {
    init(u) {
      u.ab.boom = 1.2;
    },
    tick(u, b, dt) {
      if (u.ab.boom > 0) {
        u.ab.boom -= dt;
        if (u.ab.boom <= 0) {
          u.ab.boom = -1;
          b.emit({ k: 'boom', x: u.x, y: u.y, r: 300, color: '#9fd4ff', big: true });
          b.emit({ k: 'shake', a: 14 });
          b.emit({ k: 'sfx', id: 'wither_spawn' });
          for (const e of b.live[(1 - u.team) as 0 | 1]) b.damage(u, e, b.atkOf(u) * 0.9, 'magic', { noCrit: true });
          b.blast(u.x, u.y, 300);
        }
      }
      if (!u.ab.p2 && u.hpFrac < 0.5) {
        u.ab.p2 = 1;
        u.ref.witherArmor = 1;
        u.atkSpd *= 1.25;
        b.emit({ k: 'phase', s: 'wither2' });
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '凋灵护甲!', color: '#9fd4ff' });
        for (let i = 0; i < 3; i++) b.summon(u, 'wither_skeleton', u.x - u.facing * 40, ARENA_D / 2 + (i - 1) * 100, 0.7, { fx: 'summon' });
        u.ab.dash = 2;
      }
      if (u.ab.p2) u.ab.dash -= dt;
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        u.alt = 22;
        const r = chargeMove(u, b, dt, { mul: 1.5, knock: 200, stun: 0.5, all: true, speed: 340 });
        if (!u.ref.charge) u.alt = 70;
        return r;
      }
      if (u.ab.p2 && u.ab.dash <= 0) {
        const c = b.densest((1 - u.team) as 0 | 1, 90);
        if (c) {
          u.ab.dash = 8;
          startCharge(u, c, 160);
          b.emit({ k: 'sfx', id: 'wither_spawn', v: 0.5 });
          return true;
        }
      }
      return false;
    },
    attack(u, t, b) {
      u.ab.n = (u.ab.n ?? 0) + 1;
      const atk = b.atkOf(u);
      const foes = b.live[(1 - u.team) as 0 | 1].filter((e) => dist(u, e) < b.rangeOf(u) + 80 && !e.structure);
      const tt = u.ab.n % 3 === 1 || !foes.length ? t : b.rng.pick(foes);
      if (u.ab.n % 4 === 0)
        fire(u, tt, b, 'blue_skull', atk * 2, (p) => {
          p.wither = atk * 0.15;
          p.witherDur = 3;
        });
      else
        fire(u, tt, b, 'wither_skull', atk, (p) => {
          p.wither = atk * 0.12;
          p.witherDur = 3;
        });
    },
  },

  ender_dragon_boss: {
    init(u) {
      u.ab.state = 0;
      u.ab.st = 6;
      u.ab.cycle = 0;
      u.alt = 110;
      u.z = 110;
    },
    move(u, b, dt) {
      if (!u.ab.p2 && u.hpFrac < 0.5 && b.has(u.team, 'omen_enrage')) {
        u.ab.p2 = 1;
        b.emit({ k: 'phase', s: 'dragon2' });
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + 40, s: '终末之怒！', color: '#d36bff' });
        b.emit({ k: 'roar', x: u.x, y: u.y, r: 400, color: '#d36bff' });
        u.atkSpd *= 1.25;
        for (let i = 0; i < 2; i++) {
          b.summon(u, 'enderman', u.x + b.rng.range(-40, 40), ARENA_D / 2 + (i ? 80 : -80), 0.75, { fx: 'summon' });
        }
      }
      u.atkTimer = Math.max(0, u.atkTimer - dt * b.atkSpeedOf(u));
      const foe = (1 - u.team) as 0 | 1;
      const foes = b.live[foe].filter((e) => !e.structure);
      const atk = b.atkOf(u);
      const goto = (x: number, y: number, s: number) => {
        const dx = x - u.x;
        const dy = y - u.y;
        const d = Math.hypot(dx, dy);
        if (d < 2) return d;
        const st = Math.min(d, s * dt);
        u.x += (dx / d) * st;
        u.y += (dy / d) * st;
        if (Math.abs(dx) > 3) u.facing = dx > 0 ? 1 : -1;
        return d;
      };
      u.moving = true;
      const homeX = u.team === 1 ? ARENA_W * 0.72 : ARENA_W * 0.28;
      if (u.ab.state === 0) {
        // Hover & bombard
        u.alt = 110;
        goto(homeX + Math.sin(u.age * 0.7) * 160, ARENA_D / 2 + Math.cos(u.age * 0.9) * 120, b.moveSpeedOf(u));
        if (u.atkTimer <= 0 && foes.length) {
          u.atkTimer = u.cd;
          u.animAtk = 0.4;
          const t = b.rng.pick(foes);
          u.facing = t.x > u.x ? 1 : -1;
          b.shoot(u, t, 'dragon_fireball', atk * 0.8, {});
          b.emit({ k: 'sfx', id: 'dragon_shoot' });
        }
        u.ab.st -= dt;
        if (u.ab.st <= 0) {
          u.ab.cycle++;
          if (u.ab.cycle % 2 === 1) {
            const c = b.densest(foe, 90);
            if (c) {
              u.ab.state = 1;
              startCharge(u, c, 220);
              b.emit({ k: 'sfx', id: 'dragon_roar' });
              b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + 40, s: '俯冲!', color: '#d36bff' });
            } else u.ab.st = 3;
          } else {
            u.ab.state = 2;
            u.ab.st = 6;
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + 40, s: '栖息', color: '#d36bff' });
          }
        }
      } else if (u.ab.state === 1) {
        u.alt = 24;
        chargeMove(u, b, dt, { mul: 1.3, knock: 220, stun: 0.4, all: true, speed: 360 });
        if (!u.ref.charge) {
          u.ab.state = 0;
          u.ab.st = 7;
        }
      } else {
        // Perch on the fountain and breathe.
        u.alt = 0;
        const px = u.team === 1 ? ARENA_W * 0.66 : ARENA_W * 0.34;
        const d = goto(px, ARENA_D / 2, b.moveSpeedOf(u) * 1.2);
        if (d < 4) {
          u.moving = false;
          u.facing = u.team === 1 ? -1 : 1;
          if (cool(u, 'br', dt, 0.6)) {
            u.ab.br = 1;
            u.animAtk = 0.5;
            const bx = u.x + u.facing * 150;
            b.emit({ k: 'boom', x: bx, y: u.y, r: 120, color: '#c56cf0', big: false });
            b.emit({ k: 'sfx', id: 'breath', v: 0.6 });
            b.aoe(bx, u.y, 120, u.team, (e) => b.damage(u, e, atk * 0.45, 'magic', { noCrit: true }));
          }
        }
        u.ab.st -= dt;
        if (u.ab.st <= 0) {
          u.ab.state = 0;
          u.ab.st = 7;
        }
      }
      return true;
    },
    onProjExplode(u, p, x, y, b) {
      if (p.kind === 'dragon_fireball') b.addZone({ x, y, r: 70, dur: 4, team: u.team, dps: b.atkOf(u) * 0.3, kind: 'breath', src: u });
    },
  },
};
