// Behaviours for the mobs from the 1.21+ drops (bogged, armadillo, creaking, camel husk,
// sulfur cube, frostbite...) and from the Sift, the dimension announced at Minecraft Live 2026.
// Merged into BEHAVIORS by ai.ts; shares its helpers.
import type { Battle } from './sim.ts';
import { ARENA_D, ARENA_W, IMM_BURN, IMM_KB, NUM_DODGE, type Unit } from './unit.ts';
import { S } from './terrain.ts';
import { isBackliner } from './tactics.ts';
import { arrowRain, chargeMove, cool, dist, fire, foesOf, smart, splitSlime, startCharge, type Behavior } from './ai.ts';

// ───────────────────────── helpers ─────────────────────────

const clampX = (u: Unit, x: number) => Math.max(u.radius, Math.min(ARENA_W - u.radius, x));
const clampY = (y: number) => Math.max(10, Math.min(ARENA_D - 10, y));

/** Walks u along (dx, dy) at its normal speed (times `mul`), stopping on arrival. */
function walk(u: Unit, b: Battle, dt: number, dx: number, dy: number, mul = 1) {
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return;
  const mx = dx / d;
  const my = dy / d;
  const step = Math.min(d, b.moveSpeedOf(u) * b.terrainSpeed(u, mx, my) * dt * mul);
  u.x = clampX(u, u.x + mx * step);
  u.y = clampY(u.y + my * step);
  u.moving = true;
  u.walk += step;
  if (Math.abs(dx) > 2) u.facing = dx > 0 ? 1 : -1;
}

/** Instant magic hit drawn as a beam (tentacles, songs). */
function zap(u: Unit, t: Unit, b: Battle, color: string, mul = 1) {
  b.emit({ k: 'beam', a: u, b: t, color, t: 0.22 });
  const dealt = b.damage(u, t, b.atkOf(u) * mul, u.dk, {});
  if (dealt >= 0) b.emit({ k: 'hit', x: t.x, y: t.y, z: t.gz + t.z + t.size * 0.5, big: false, color });
  b.onAttackHit(u, t, dealt, true);
}

function say(b: Battle, u: Unit, s: string, color: string) {
  b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size + 8, s, color });
}

interface Leap {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  h: number;
  tgt: Unit;
}

function startLeap(u: Unit, t: Unit, dur: number, h: number) {
  const d = dist(u, t) || 1;
  const k = (u.radius + t.radius) / d;
  u.ref.leap = { sx: u.x, sy: u.y, tx: t.x - (t.x - u.x) * k, ty: t.y - (t.y - u.y) * k, t: 0, dur, h, tgt: t } satisfies Leap;
  u.facing = t.x > u.x ? 1 : -1;
}

/** Moves u along its leap; `land` runs on touchdown. Returns true while airborne. */
function leapMove(u: Unit, dt: number, land: (t: Unit) => void): boolean {
  const L = u.ref.leap as Leap | null;
  if (!L) return false;
  L.t += dt;
  const f = Math.min(1, L.t / L.dur);
  u.x = L.sx + (L.tx - L.sx) * f;
  u.y = L.sy + (L.ty - L.sy) * f;
  u.z = Math.sin(Math.PI * f) * L.h;
  u.vz = 0;
  u.moving = true;
  if (f >= 1) {
    u.z = 0;
    u.ref.leap = null;
    land(L.tgt);
  }
  return true;
}

/** Best enemy to jump at between `min` and `max` away (smart sides prefer backliners and the wounded). */
function leapTarget(u: Unit, b: Battle, min: number, max: number): Unit | null {
  let best: Unit | null = null;
  let bs = -Infinity;
  const clever = smart(u, b);
  for (const e of foesOf(u, b)) {
    if (!e.alive || e.structure || e.invisT > 0 || !b.canReach(u, e)) continue;
    const d = dist(u, e);
    if (d <= min || d >= max) continue;
    const sc = clever ? (isBackliner(e) ? 2 : 0) + (1 - e.hpFrac) + (e === u.target ? 0.5 : 0) - d / max : e === u.target ? 1 : -d;
    if (sc > bs) {
      bs = sc;
      best = e;
    }
  }
  return best;
}

/**
 * Leaves a see-through copy of u where it stands. It can't be targeted, hurt or bumped into
 * and fades after `life` seconds; whatever it does is scheduled by the caller as delayed hits.
 */
function afterimage(u: Unit, b: Battle, life: number): Unit | null {
  const g = b.summon(u, u.mob.id, u.x, u.y, 1, { lifespan: life, fx: 'ghost' });
  if (!g) return null;
  g.ghost = true;
  g.structure = true;
  // Not a real unit: keep it out of the card's spawn count in the battle summary.
  b.cards[g.card].spawned--;
  g.invisT = life + 1;
  g.speed = 0;
  g.facing = u.facing;
  g.target = u.target;
  return g;
}

/** Sift mobs plus the warden: the singer's song speaks to all of them. */
const SCULK = new Set(['warden', 'sculk_slasher', 'echo_golem', 'sculk_dancer', 'sculk_cube']);

// Sulfur cube forms, picked from the block it swallows at the start of the fight.
type Form = 'heavy' | 'bouncy' | 'slide' | 'hot' | 'void';
const FORM_NAME: Record<Form, string> = { heavy: '沉重', bouncy: '弹跳', slide: '滑行', hot: '灼热', void: '虚空' };
const FORM_COLOR: Record<Form, string> = { heavy: '#b8b8b8', bouncy: '#8fd16a', slide: '#bfe8ff', hot: '#ff8a3d', void: '#d6a6ff' };

function sulfurForm(surf: number): Form {
  switch (surf) {
    case S.SAND:
    case S.SNOW:
    case S.ICE:
    case S.SOUL_SAND:
      return 'slide';
    case S.NETHERRACK:
    case S.NYLIUM:
    case S.NETHER_BRICK:
    case S.LAVA:
      return 'hot';
    case S.END_STONE:
    case S.PURPUR:
      return 'void';
    case S.GRASS:
    case S.DIRT:
    case S.PATH:
    case S.MOSS:
    case S.MUD:
    case S.WATER:
      return 'bouncy';
    default:
      return 'heavy';
  }
}

function applyForm(u: Unit, form: Form) {
  u.ref.form = form;
  if (form === 'heavy') {
    u.armor = Math.min(0.75, u.armor + 0.3);
    u.immune |= IMM_KB;
  } else if (form === 'slide') u.moveSpd *= 1.6;
  else if (form === 'hot') {
    u.immune |= IMM_BURN;
    u.fx = { ...u.fx, burnHit: Math.max(u.fx.burnHit, u.atk * 0.25), burnDur: Math.max(u.fx.burnDur, 2) };
  }
}

// Camel husk riders.
function mount(r: Unit, c: Unit) {
  r.ref.mount = c;
  r.ref.spd = r.speed;
  r.speed = 0;
  r.flying = true;
  r.alt = r.z = c.size * 0.55;
  pin(r, c);
}

function pin(r: Unit, c: Unit) {
  r.x = c.x - c.facing * 3;
  r.y = c.y;
  if (!r.target) r.facing = c.facing;
}

function dismount(r: Unit, b: Battle) {
  r.ref.mount = null;
  r.speed = r.ref.spd ?? r.mob.speed;
  r.flying = false;
  r.alt = 0;
  say(b, r, '跳下!', '#d8c38a');
}

/** 冰封僵尸's ice ball: knocks back and freezes (see onProjHit). */
function iceBall(u: Unit, t: Unit, b: Battle) {
  b.emit({ k: 'sfx', id: 'snowball' });
  fire(u, t, b, 'ice_ball', b.atkOf(u) * 1.2, (p) => {
    p.knock = 70;
    if (u.star >= 3) p.splash = 35;
  });
}

// ───────────────────────── behaviours ─────────────────────────

export const MODERN: Record<string, Behavior> = {
  // 沼骸: poison arrows; ★3 every third shot is a volley.
  bogged: {
    attack(u, t, b) {
      const rain = arrowRain(u, b);
      u.ab.n = (u.ab.n ?? 0) + 1;
      const innate = u.star >= 3 && u.ab.n % 3 === 0;
      const baseAtk = b.atkOf(u);
      const atk = innate && rain ? baseAtk * 1.15 : baseAtk;
      if (rain || innate) for (const s of [-0.2, 0, 0.2]) fire(u, t, b, 'arrow', atk, undefined, { spread: s });
      else fire(u, t, b, 'arrow', atk);
    },
    onProjHit(u, p, t, b) {
      b.poison(t, p.dmg * 0.36, 4, 2, u);
    },
  },

  // 犰狳: curls into a ball when hurt badly or swarmed.
  armadillo: {
    tick(u, b, dt) {
      u.ab.rcd = (u.ab.rcd ?? 0) - dt;
      if (u.ab.rollT > 0) {
        u.ab.rollT -= dt;
        if (u.ab.rollT <= 0) {
          u.takenMul = 1;
          u.ref.rolled = 0;
          u.atkTimer = 0.3;
        }
        return;
      }
      if (u.ab.rcd > 0) return;
      const half = !u.ab.halfUsed && u.hpFrac < 0.5;
      let n = 0;
      for (const e of foesOf(u, b)) if (e.target === u && dist(e, u) < b.reach(e, u) + 12) n++;
      if (!half && n < 3) return;
      if (half) u.ab.halfUsed = 1;
      u.ab.rollT = 3;
      u.ab.rcd = 8;
      u.takenMul = 0.3;
      u.ref.rolled = 1;
      say(b, u, '缩成球!', '#d9a07a');
    },
    move(u) {
      if (!(u.ab.rollT > 0)) return false;
      u.moving = false;
      return true;
    },
    afterDamaged(u, src, d, b) {
      if (u.star < 3 || !(u.ab.rollT > 0) || !src || !src.alive || src.isRanged) return;
      // Spiky scutes: 30% of the blow (before the 70% the ball soaked up) bounces back.
      b.damage(u, src, d, 'true', { noThorns: true, noCrit: true, noDodge: true });
    },
  },

  // 小筛者: they bite harder together.
  baby_sifter: {
    attack(u, t, b) {
      let n = 0;
      for (const a of b.live[u.team]) if (a !== u && a.mob.id === 'baby_sifter' && a.target === t) n++;
      b.meleeHit(u, t, b.atkOf(u) * (1 + Math.min(0.6, 0.12 * n)));
    },
    onHit(u, t) {
      if (u.star >= 3) t.echoMul = Math.max(t.echoMul, 0.2);
    },
  },

  // 嗅探兽: every few seconds it stops to sniff, then digs up an ancient seed where its friends
  // are bunched up; the torchflower heals and hastes everyone around it.
  sniffer: {
    init(u) {
      u.ab.sniff = u.star >= 3 ? 2 : 3;
    },
    tick(u, _b, dt) {
      if (u.ab.dig > 0 || !cool(u, 'sniff', dt, u.star >= 3 ? 6 : 8)) return;
      u.ab.sniff = u.star >= 3 ? 6 : 8;
      u.ab.dig = 1.2;
    },
    move(u, b, dt) {
      if (!(u.ab.dig > 0)) return false;
      u.moving = false;
      u.ab.dig -= dt;
      if (u.ab.dig > 0) return true;
      const r = u.star >= 3 ? 80 : 64;
      let bx = u.x;
      let by = u.y;
      let best = -1;
      for (const a of b.live[u.team]) {
        if (a.structure || a.ghost || a.flying || Math.hypot(a.x - u.x, a.y - u.y) > 120) continue;
        let sc = 0;
        for (const o of b.live[u.team]) if (!o.structure && Math.hypot(o.x - a.x, o.y - a.y) < r) sc += 1.5 - o.hpFrac;
        if (sc > best) (best = sc), (bx = a.x), (by = a.y);
      }
      b.addZone({ x: bx, y: by, r, dur: (u.star >= 3 ? 9 : 6) + (b.has(u.team, 'combo_pollination') ? 2 : 0), team: u.team, dps: 0.02, kind: 'bloom', src: u, haste: u.star >= 3 ? 1.3 : 1.2 });
      u.animAtk = 0.22;
      say(b, u, '古种发芽', '#ffc070');
      b.emit({ k: 'sfx', id: 'sniff' });
      return true;
    },
  },

  // 噗噗: hangs back with the most hurt friends and soothes them; squeaks off when hit.
  blub: {
    tick(u, b, dt) {
      if (!cool(u, 'glow', dt, 0.5)) return;
      u.ab.glow = 0.5;
      const r = u.star === 3 ? 96 : u.star === 2 ? 80 : 64;
      const rate = u.star === 3 ? 0.030 : u.star === 2 ? 0.026 : 0.022;
      b.aoeAllies(u.x, u.y, r, u.team, (a) => {
        if (a.ghost || a.structure) return;
        if ((a.ab.blubAt ?? -1) > b.t - 0.45 && (a.ab.blubRate ?? 0) >= rate) return;
        a.ab.blubAt = b.t;
        a.ab.blubRate = rate;
        b.heal(a, a.maxHp * rate * 0.5, u, true);
      });
    },
    afterDamaged(u, src, _d, b) {
      if (!src || (u.ab.flee ?? 0) > 0) return;
      u.ab.flee = 0.6;
      u.ref.fleeFrom = src;
      b.emit({ k: 'sfx', id: 'squeak', v: 0.5 });
    },
    move(u, b, dt) {
      if (u.ab.flee > 0) {
        u.ab.flee -= dt;
        const f = u.ref.fleeFrom as Unit | null;
        if (f && f.alive) {
          walk(u, b, dt, u.x - f.x, u.y - f.y, 1.3);
          return true;
        }
      }
      u.ab.anc = (u.ab.anc ?? 0) - dt;
      if (u.ab.anc <= 0) {
        u.ab.anc = 0.6;
        let best: Unit | null = null;
        let bs = 0;
        const r = u.star === 3 ? 96 : u.star === 2 ? 80 : 64;
        for (const a of b.live[u.team]) {
          if (a.mob.id === 'blub' || a.structure || a.ghost || a.flying) continue;
          let sc = 0;
          for (const o of b.live[u.team]) if (!o.structure && Math.hypot(o.x - a.x, o.y - a.y) < r) sc += 1.2 - o.hpFrac;
          if (sc > bs) {
            bs = sc;
            best = a;
          }
        }
        u.ref.follow = best;
      }
      const a = u.ref.follow as Unit | null;
      if (!a || !a.alive) return false;
      const gx = a.x + (u.team === 0 ? -26 : 26);
      const gy = a.y + (u.id % 2 ? 14 : -14);
      if (Math.hypot(gx - u.x, gy - u.y) > 12) {
        walk(u, b, dt, gx - u.x, gy - u.y);
        return true;
      }
      // In place: nibble whatever comes close, but never chase.
      u.moving = false;
      u.atkTimer = Math.max(0, u.atkTimer - dt * b.atkSpeedOf(u));
      if (u.atkTimer > 0) return true;
      for (const e of foesOf(u, b)) {
        if (e.ghost || e.invisT > 0 || !b.canReach(u, e) || dist(u, e) > b.reach(u, e)) continue;
        u.target = e;
        u.atkTimer = u.cd;
        u.animAtk = 0.22;
        b.meleeHit(u, e, b.atkOf(u));
        break;
      }
      return true;
    },
  },

  // 冰封僵尸: freezing claws; every fourth attack is an ice ball, thrown from range when it can.
  frostbite: {
    init(u) {
      if (u.ab.n === undefined) u.ab.n = 3;
    },
    move(u, b) {
      const t = u.target;
      if ((u.ab.n + 1) % 4 !== 0 || !t || !t.alive || u.atkTimer > 0 || t.structure) return false;
      const d = dist(u, t);
      if (d > 230 || d < u.radius + t.radius + 30) return false;
      u.ab.n++;
      u.atkTimer = u.cd;
      u.animAtk = 0.22;
      u.moving = false;
      u.facing = t.x > u.x ? 1 : -1;
      iceBall(u, t, b);
      return true;
    },
    attack(u, t, b) {
      u.ab.n++;
      if (u.ab.n % 4 === 0) {
        iceBall(u, t, b);
        return;
      }
      b.meleeHit(u, t, b.atkOf(u));
      b.freeze(t, b.atkOf(u) * 0.2, 2, u);
    },
    onProjHit(u, p, t, b) {
      if (p.kind !== 'ice_ball') return;
      b.freeze(t, p.dmg * 0.2, 3, u);
      if (u.star >= 3) b.stun(t, 0.6);
    },
  },

  // 焦骸: weakening arrows; rides camel husks.
  parched: {
    attack(u, t, b) {
      const atk = b.atkOf(u) * (u.star >= 3 && t.weakT > 0 ? 1.25 : 1);
      if (arrowRain(u, b)) for (const s of [-0.2, 0, 0.2]) fire(u, t, b, 'arrow', atk, undefined, { spread: s });
      else fire(u, t, b, 'arrow', atk);
    },
    tick(u, b) {
      const c = u.ref.mount as Unit | null;
      if (!c) return;
      if (c.alive) pin(u, c);
      else dismount(u, b);
    },
    onProjHit(_u, _p, t) {
      t.weakT = Math.max(t.weakT, 4);
      t.weakMul = Math.max(t.weakT > 0 ? t.weakMul : 0, 0.3);
    },
  },

  // 须筛者: chin spikes home in briefly, then lock on and fly straight (dodgeable).
  bearded_sifter: {
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.emit({ k: 'sfx', id: 'shulker', v: 0.5 });
      if (u.star >= 3) for (const s of [-0.3, 0.3]) fire(u, t, b, 'chin_spike', atk, undefined, { spread: s, special: 'lock' });
      else fire(u, t, b, 'chin_spike', atk, undefined, { special: 'lock' });
    },
  },

  // 筑巢者: winds up, pounces (backliners first), then catches its breath.
  nester: {
    tick(u, b, dt) {
      u.ab.pcd = (u.ab.pcd ?? 1.5) - dt;
      if (cool(u, 'nest', dt, u.star >= 3 ? 6 : 8)) {
        u.ab.nest = u.star >= 3 ? 6 : 8;
        const baby = b.summon(u, 'baby_sifter', u.x + (u.team === 0 ? -20 : 20), u.y + b.rng.range(-15, 15), 0.7, { fx: 'summon', lifespan: 12 });
        if (baby) {
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '筑巢!', color: '#ff8fb1' });
        }
      }
    },
    move(u, b, dt) {
      if (u.ab.pause > 0) {
        u.ab.pause -= dt;
        u.moving = false;
        return true;
      }
      if (
        leapMove(u, dt, (t) => {
          if (t.alive && dist(u, t) <= b.reach(u, t) + 24) b.meleeHit(u, t, b.atkOf(u) * 2);
          b.emit({ k: 'land', x: u.x, y: u.y, z: u.gz, big: false });
          u.atkTimer = u.cd * 0.5;
          if (u.star < 3) u.ab.pause = 1;
        })
      )
        return true;
      const W = u.ref.wind as { t: number; tgt: Unit } | null;
      if (W) {
        W.t -= dt;
        u.moving = false;
        if (!W.tgt.alive) u.ref.wind = null;
        else if (W.t <= 0) {
          u.ref.wind = null;
          startLeap(u, W.tgt, 0.45, 56);
          b.emit({ k: 'sfx', id: 'leap' });
        }
        return true;
      }
      if (u.ab.pcd > 0) return false;
      const t = leapTarget(u, b, 80, 220);
      if (!t) return false;
      u.ab.pcd = 5;
      u.target = t;
      u.facing = t.x > u.x ? 1 : -1;
      u.ref.wind = { t: 0.35, tgt: t };
      return true;
    },
  },

  // 骆驼尸壳: carries a parched archer, dashes every 6 s; the rider hops off when it falls.
  camel_husk: {
    init(u, b) {
      if (u.ref.rider !== undefined || u.ghost) return;
      u.ref.rider = null;
      const r = b.summon(u, 'parched', u.x, u.y, 1, { fx: 'none' });
      if (!r) return;
      u.ref.rider = r;
      mount(r, u);
    },
    tick(u, _b, dt) {
      u.ab.dcd = (u.ab.dcd ?? 3) - dt;
      const r = u.ref.rider as Unit | null;
      if (r && r.alive && r.ref.mount === u) pin(r, u);
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        chargeMove(u, b, dt, { mul: 1.2, knock: 130, stun: u.star >= 3 ? 0.8 : 0, all: true, speed: 260 });
        // 沙漠游骑: the dash fires up the desert undead around it.
        if (!u.ref.charge && b.has(u.team, 'combo_desert_riders')) {
          let n = 0;
          b.aoeAllies(u.x, u.y, 160, u.team, (a) => {
            if (a.mob.id !== 'husk' && a.mob.id !== 'parched') return;
            a.empower = true;
            n++;
          });
          if (n) say(b, u, '游骑冲锋!', '#d8c38a');
        }
        return true;
      }
      const t = u.target;
      if (u.ab.dcd > 0 || !t || !t.alive || !b.canReach(u, t)) return false;
      const d = dist(u, t);
      if (d < 70 || d > 300) return false;
      u.ab.dcd = 6;
      startCharge(u, t, 60);
      b.emit({ k: 'sfx', id: 'ram', v: 0.7 });
      return true;
    },
    onDeath(u, b) {
      const r = u.ref.rider as Unit | null;
      if (r && r.alive && r.ref.mount === u) dismount(r, b);
    },
  },

  // 硫磺立方: becomes what it swallows; splits like a slime.
  sulfur_cube: {
    init(u, b) {
      if (u.gen > 0 || u.ref.form || u.ghost) return;
      applyForm(u, sulfurForm(b.surf(u)));
    },
    tick(u, b, dt) {
      const form = u.ref.form as Form | undefined;
      if (!form) return;
      if (!u.ab.shown && u.age > 0.4) {
        u.ab.shown = 1;
        if (u.gen === 0) say(b, u, FORM_NAME[form], FORM_COLOR[form]);
      }
      if (form === 'bouncy') u.ab.hcd = (u.ab.hcd ?? 1.5) - dt;
      if (u.ab.vcd > 0) u.ab.vcd -= dt;
    },
    move(u, b, dt) {
      if (u.ref.form !== 'bouncy') return false;
      if (
        leapMove(u, dt, () => {
          const atk = b.atkOf(u);
          b.emit({ k: 'land', x: u.x, y: u.y, z: u.gz, big: true });
          b.aoe(u.x, u.y, 55, u.team, (e) => {
            b.damage(u, e, atk * 1.4, 'phys', { melee: true });
            b.knock(e, u.x, u.y, 80);
          });
          u.atkTimer = u.cd * 0.5;
        })
      )
        return true;
      if (u.ab.hcd > 0) return false;
      const t = leapTarget(u, b, 90, 240);
      if (!t) return false;
      u.ab.hcd = 4;
      u.target = t;
      startLeap(u, t, 0.55, 70);
      b.emit({ k: 'sfx', id: 'leap' });
      return true;
    },
    onDamaged(u, _src, _o, b) {
      if (u.ref.form !== 'void' || u.ab.vcd > 0 || !b.rng.chance(0.25)) return false;
      u.ab.vcd = 1.5;
      b.blink(u, 70);
      return true;
    },
    onDeath(u, b) {
      const kids = splitSlime(u, b);
      const form = u.ref.form as Form | undefined;
      if (u.star >= 3 && form) for (const k of kids) applyForm(k, form);
    },
  },

  // 高筛者: lobs goo that bursts a second later and leaves a draining puddle.
  tall_sifter: {
    attack(u, t, b) {
      b.shoot(u, t, 'goo', b.atkOf(u), { special: 'goo' });
      b.emit({ k: 'sfx', id: 'goo', v: 0.4 });
    },
    onProjLand(u, p, x, y, b) {
      if (p.special !== 'goo') return false;
      const r = u.star >= 3 ? 70 : 50;
      b.addZone({ x, y, r, dur: 4, team: u.team, dps: p.dmg * 0.35, kind: 'goo', src: u });
      b.addDelayed({ t: 1, x, y, r, dmg: p.dmg, team: u.team, src: u, kind: 'goo' });
      b.emit({ k: 'sfx', id: 'goo', v: 0.5 });
      return true;
    },
  },

  // 萌芽: roots the farthest enemy it can reach and drags it in.
  sprout: {
    tick(u, b, dt) {
      if (!cool(u, 'root', dt, 2.5)) return;
      u.ab.root = 6;
      const list = foesOf(u, b)
        .filter((e) => e.alive && !e.structure && e.invisT <= 0 && dist(u, e) <= 260)
        .sort((p, q) => dist(u, q) - dist(u, p))
        .slice(0, u.star >= 3 ? 2 : 1);
      if (!list.length) {
        u.ab.root = 0.5;
        return;
      }
      u.animAtk = 0.4;
      for (const e of list) {
        b.emit({ k: 'beam', a: u, b: e, color: '#9be36b', t: 0.8 });
        if (e.boss) {
          const cardKey = `sprout_boss_posture_${u.card}`;
          const cd = b.sides[u.team].timers[cardKey] ?? 0;
          if (b.t >= cd) {
            b.sides[u.team].timers[cardKey] = b.t + 6.0;
            const postureAmt = [20, 25, 30][Math.max(0, Math.min(2, u.star - 1))];
            b.addPosture(e, postureAmt);
            b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.size + 10, s: `破势 +${postureAmt}`, color: '#9be36b' });
          }
        } else {
          b.stun(e, 2);
          // Pull from the far side so the shove points at the sprout.
          b.knock(e, e.x * 2 - u.x, e.y * 2 - u.y, 150);
          b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.z + e.size + 6, s: '缠绕!', color: '#9be36b', tac: true });
        }
      }
    },
    attack(u, t, b) {
      zap(u, t, b, '#9be36b');
    },
  },

  // 嘎枝: nearly unkillable while its heart beats at the back; crumbles when the heart breaks.
  creaking: {
    init(u, b) {
      if (u.ref.heart !== undefined || u.ghost) return;
      u.ref.heart = null;
      const x = b.rowX(u.team, 'back') + (u.team === 0 ? -24 : 24);
      const h = b.summon(u, 'creaking_heart', x, u.y, u.star >= 3 ? 1.5 : 1, { fx: 'summon' });
      if (!h) return;
      u.ref.heart = h;
      h.ref.owner = u;
    },
    tick(u, b, dt) {
      const h = u.ref.heart as Unit | null;
      if (!h) return;
      if (!h.alive) {
        u.takenMul = 1;
        say(b, u, '崩塌!', '#ff9a3c');
        b.emit({ k: 'sfx', id: 'creak' });
        b.kill(u, (h.ref.lastHitBy as Unit | undefined) ?? null);
        return;
      }
      u.takenMul = 0.1;
      if (cool(u, 'link', dt, 0.3)) {
        u.ab.link = 1.5;
        b.emit({ k: 'beam', a: h, b: u, color: '#ff9a3c', t: 0.5 });
      }
      if (u.star >= 3 && cool(u, 'regrow', dt, 6)) {
        u.ab.regrow = 6;
        b.heal(u, u.maxHp * 0.08, u);
      }
      // Being stared at slows it down.
      let n = 0;
      for (const e of foesOf(u, b)) if (e.target === u) n++;
      if (n >= 2) b.slow(u, 0.55, 0, 0.25);
    },
    attack(u, t, b) {
      b.meleeHit(u, t, b.atkOf(u));
      b.emit({ k: 'sfx', id: 'creak', v: 0.5 });
    },
  },

  creaking_heart: {
    move(u, b) {
      u.moving = false;
      const o = u.ref.owner as Unit | undefined;
      if (o && !o.alive) b.kill(u, null, true);
      return true;
    },
  },

  // 幽匿斩击者: every fourth hit it springs back and leaves an afterimage that swings again.
  sculk_slasher: {
    tick(u, _b, dt) {
      if (u.ab.gT > 0) u.ab.gT -= dt;
    },
    attack(u, t, b) {
      b.meleeHit(u, t, b.atkOf(u));
      u.ab.n = (u.ab.n ?? 0) + 1;
      if (u.ab.n % 4 !== 0) return;
      const d = dist(u, t) || 1;
      const nx = (t.x - u.x) / d;
      const ny = (t.y - u.y) / d;
      const g = afterimage(u, b, 2.3);
      if (g) {
        g.target = t;
        b.addDelayed({ t: 2, x: u.x + nx * 28, y: u.y + ny * 28, r: 46, dmg: b.atkOf(u), team: u.team, src: u, kind: 'slash' });
      }
      u.vx -= nx * 600;
      u.vy -= ny * 600;
      u.ab.gT = 2;
      b.emit({ k: 'sfx', id: 'slash' });
    },
    onDamaged(u, _src, _o, b) {
      if (u.star < 3 || !(u.ab.gT > 0) || !b.rng.chance(0.3)) return false;
      b.emit({ k: 'num', x: u.x, y: u.y, z: u.gz + u.z + u.size, v: 0, c: NUM_DODGE });
      return true;
    },
  },

  // 歌者: sings every 10 s: echo golems, faster friends, calmer enemy wardens.
  singer: {
    tick(u, b, dt) {
      if (!cool(u, 'song', dt, 4)) return;
      u.ab.song = 10;
      u.animAtk = 0.6;
      b.emit({ k: 'roar', x: u.x, y: u.y, r: 220, color: '#7ff5de' });
      say(b, u, '♪ 共鸣之歌', '#7ff5de');
      b.emit({ k: 'sfx', id: 'song' });
      const combo = b.has(u.team, 'combo_sculk_song');
      b.aoeAllies(u.x, u.y, 220, u.team, (a) => {
        if (a.ghost || a.structure) return;
        const m = combo && SCULK.has(a.mob.id) ? 1.4 : 1.2;
        a.hasteMul = a.hasteT > 0 ? Math.max(a.hasteMul, m) : m;
        a.hasteT = Math.max(a.hasteT, 5);
      });
      let mine = 0;
      for (const a of b.live[u.team]) if (a.mob.id === 'echo_golem' && a.ref.owner === u) mine++;
      const n = Math.min(u.star >= 3 ? 2 : 1, 4 - mine);
      const fx = u.team === 0 ? 50 : -50;
      for (let i = 0; i < n; i++) {
        const g = b.summon(u, 'echo_golem', u.x + fx, u.y + (n > 1 ? (i ? 36 : -36) : 0), 1, { lifespan: 20, fx: 'summon' });
        if (g) g.ref.owner = u;
      }
      for (const e of foesOf(u, b))
        if (e.mob.id === 'warden' && dist(u, e) < 320) {
          b.stun(e, 3);
          b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.z + e.size + 8, s: '被安抚', color: '#7ff5de', tac: true });
        }
    },
    attack(u, t, b) {
      zap(u, t, b, '#7ff5de');
    },
  },

  // 幽匿舞者: spins through the crowd, and its afterimage spins again three seconds later.
  sculk_dancer: {
    tick(u, b, dt) {
      const SP = u.ref.spin as { t: number; tick: number } | null;
      if (SP) {
        SP.t += dt;
        SP.tick -= dt;
        if (SP.tick <= 0) {
          SP.tick = 0.25;
          const atk = b.atkOf(u);
          b.aoe(u.x, u.y, 90, u.team, (e) => {
            b.damage(u, e, atk * 0.45, 'phys', { melee: true, noCrit: true });
          });
        }
        if (SP.t >= 2) u.ref.spin = null;
        return;
      }
      if (!cool(u, 'sp', dt, 3)) return;
      let near = 0;
      for (const e of foesOf(u, b)) if (!e.structure && dist(u, e) < 110) near++;
      if (!near) {
        u.ab.sp = 0.3;
        return;
      }
      u.ab.sp = u.star >= 3 ? 4 : 6;
      u.ref.spin = { t: 0, tick: 0 };
      b.emit({ k: 'roar', x: u.x, y: u.y, r: 90, color: '#2ee6f0' });
      b.emit({ k: 'sfx', id: 'wind' });
      say(b, u, '回旋之舞!', '#2ee6f0');
      const g = afterimage(u, b, 5.1);
      if (g) {
        g.ref.spinFrom = 3;
        const atk = b.atkOf(u);
        for (let k = 0; k < 4; k++) b.addDelayed({ t: 3 + k * 0.5, x: u.x, y: u.y, r: 90, dmg: atk * 0.9, team: u.team, src: u, kind: 'slash' });
      }
    },
    move(u, b, dt) {
      if (!u.ref.spin) return false;
      const t = u.target;
      if (t && t.alive) walk(u, b, dt, t.x - u.x, t.y - u.y, 0.5);
      u.moving = true;
      return true;
    },
  },

  // 幽匿巨像 (Sift boss): shoulder charges, soul bursts, rolling sculk cubes; enrages at half.
  sculk_monstrosity: {
    tick(u, b, dt) {
      const rage = !!u.ab.rage;
      if (!rage && u.hpFrac < 0.5) {
        u.ab.rage = 1;
        u.atkSpd *= 1.25;
        u.moveSpd *= 1.3;
        say(b, u, '狂怒!', '#ff5d5d');
        b.emit({ k: 'phase', s: 'enrage' });
      }
      if (cool(u, 'burst', dt, 5)) {
        u.ab.burst = rage ? 6 : 9;
        const r = rage ? 200 : 150;
        u.animAtk = 0.5;
        b.emit({ k: 'roar', x: u.x, y: u.y, r, color: '#2ee6f0' });
        b.emit({ k: 'shake', a: 6 });
        b.emit({ k: 'sfx', id: 'sonic', v: 0.6 });
        const atk = b.atkOf(u);
        b.aoe(u.x, u.y, r, u.team, (e) => {
          b.damage(u, e, atk * 0.9, 'magic', { noCrit: true });
          b.knock(e, u.x, u.y, 140);
        });
      }
      if (cool(u, 'cube', dt, 7)) {
        u.ab.cube = 12;
        let alive = 0;
        for (const a of b.live[u.team]) if (a.mob.id === 'sculk_cube') alive++;
        const n = Math.min(rage ? 3 : 2, 5 - alive);
        for (let i = 0; i < n; i++)
          b.summon(u, 'sculk_cube', u.x + (u.team === 0 ? 40 : -40), u.y + (i - (n - 1) / 2) * 50, 1, { lifespan: 18, fx: 'summon' });
        if (n > 0) say(b, u, '幽匿方块!', '#2ee6f0');
      }
      u.ab.ccd = (u.ab.ccd ?? 3) - dt;
    },
    move(u, b, dt) {
      if (u.ref.charge) return chargeMove(u, b, dt, { mul: 1.6, knock: 200, stun: 0.6, all: true, speed: 320 });
      const t = u.target;
      if (u.ab.ccd > 0 || !t || !t.alive) return false;
      const d = dist(u, t);
      if (d < 90 || d > 360) return false;
      u.ab.ccd = u.ab.rage ? 4.5 : 7;
      startCharge(u, t, 80);
      b.emit({ k: 'sfx', id: 'roar', v: 0.6 });
      say(b, u, '肩撞!', '#2ee6f0');
      return true;
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.meleeHit(u, t, atk);
      b.aoe(t.x, t.y, 60, u.team, (e) => {
        if (e !== t) b.damage(u, e, atk * 0.5, 'phys', { melee: true, noCrit: true });
      });
      b.emit({ k: 'shake', a: 3 });
    },
  },

  // 幽匿方块: rolls straight at its target.
  sculk_cube: {
    move(u, b, dt) {
      if (u.ref.charge) return chargeMove(u, b, dt, { mul: 1.3, knock: 120, stun: 0, all: true, speed: 230 });
      u.ab.rcd = (u.ab.rcd ?? 0.3) - dt;
      const t = u.target;
      if (u.ab.rcd > 0 || !t || !t.alive || !b.canReach(u, t)) return false;
      const d = dist(u, t);
      if (d < 50 || d > 320) return false;
      u.ab.rcd = 3;
      startCharge(u, t, 40);
      return true;
    },
  },
};
