import type { Battle } from './sim.ts';
import { ARENA_D, ARENA_W, type Unit } from './unit.ts';
import { cool, dist, foesOf, resetCd, startCharge, type Behavior } from './ai.ts';
import { S, cellX, cellY, idx } from './terrain.ts';

const clampX = (u: Unit, x: number) => Math.max(u.radius, Math.min(ARENA_W - u.radius, x));
const clampY = (y: number) => Math.max(10, Math.min(ARENA_D - 10, y));

function alliesOf(u: Unit, b: Battle) {
  return b.live[u.team].length > 0 ? b.live[u.team] : b.units.filter((a) => a.team === u.team && a.alive);
}

function cardAllies(u: Unit, b: Battle) {
  return alliesOf(u, b).filter((a) => a.card === u.card && a.alive && !a.structure && !a.isSummon);
}

function isCardLead(u: Unit, b: Battle) {
  const c = cardAllies(u, b);
  return c.length > 0 && c[0].id === u.id;
}

function getCardRef(u: Unit, b: Battle): Record<string, any> | undefined {
  if (u.card < 0 || u.card >= b.cards.length) return undefined;
  const c = b.cards[u.card];
  if (!c) return undefined;
  if (!c.ref) c.ref = {};
  return c.ref;
}

function coolCard(u: Unit, key: string, dt: number, init: number, b: Battle) {
  const cRef = getCardRef(u, b);
  if (!cRef) {
    if (u.ab[key] === undefined) u.ab[key] = init;
    u.ab[key] -= dt;
    return u.ab[key] <= 0;
  }
  if (cRef[key] === undefined) cRef[key] = init;
  cRef[key] -= dt;
  u.ab[key] = cRef[key];
  return cRef[key] <= 0;
}

function resetCardCd(u: Unit, key: string, cd: number, b: Battle): number {
  const cRef = getCardRef(u, b);
  if (cRef) cRef[key] = cd;
  u.ab[key] = cd;
  return cd;
}

export const EXPANSION_BEHAVIORS: Record<string, Behavior> = {
  // ──────────────────────── 8 张高稀有度卡 ────────────────────────

  // 1. 卑劣幽魂 · 霜契 (frostbound_wraith)
  frostbound_wraith: {
    attack(u, t, b) {
      b.shoot(u, t, 'ice_ball', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (cool(u, 'frost_array', dt, 3)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) return;
        resetCd(u, 'frost_array', 8, b);
        foes.sort((f1, f2) => dist(u, f1) - dist(u, f2));
        const target = foes[0];
        const atk = b.atkOf(u);
        const pierce = u.star >= 3 ? 1 : 0;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '寒冰列阵!', color: '#89dcff' });
        for (let i = 0; i < 3; i++) {
          b.addTimedAction(i * 0.18, () => {
            if (!u.alive || !target.alive) return;
            b.shoot(u, target, 'ice_ball', atk * 0.55, {
              special: 'magic',
              pierce,
              tx: target.x + (i - 1) * 8,
              ty: target.y + (i - 1) * 8,
            });
            b.slow(target, 0.20, 0, 2.0);
          });
        }
      }
    },
  },

  // 2. 悬浮烈焰 · 余烬 (wildfire_sentinel)
  wildfire_sentinel: {
    init(u) {
      u.ref.shields = u.star >= 3 ? 5 : 4;
    },
    onDamaged(u, _src, o, b) {
      if (o.proj && (u.ref.shields ?? 0) > 0) {
        const lastT = u.ref.lastShieldUse ?? -999;
        if (b.t - lastT >= 0.4) {
          u.ref.shields--;
          u.ref.lastShieldUse = b.t;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: `余烬护盾 [${u.ref.shields}]`, color: '#ffbe64' });
          u.shield = Math.max(u.shield, 10);
        }
      }
      return false;
    },
    attack(u, t, b) {
      b.shoot(u, t, 'fireball', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (cool(u, 'shield_debris', dt, 4)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) return;
        resetCd(u, 'shield_debris', 8, b);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '燃烧盾屑!', color: '#ff973d' });
        const atk = b.atkOf(u);
        const bonusDmg = u.star >= 3 ? atk * 0.15 : 0;
        const t1 = foes[0];
        const t2 = foes.length > 1 ? foes[1] : foes[0];
        b.shoot(u, t1, 'fireball', atk * 0.65 + (t1 !== t2 ? bonusDmg : 0), { special: 'magic' });
        b.burn(t1, atk * 0.08, 2.0, u);
        b.addTimedAction(0.2, () => {
          if (!u.alive || !t2.alive) return;
          b.shoot(u, t2, 'fireball', atk * 0.65 + (t1 !== t2 ? bonusDmg : 0), { special: 'magic' });
          b.burn(t2, atk * 0.08, 2.0, u);
        });
      }
    },
  },

  // 3. 远古守护者 · 潮誓 (abyssal_guardian)
  abyssal_guardian: {
    attack(u, t, b) {
      const atk = b.atkOf(u);
      b.emit({ k: 'beam', a: u, b: t, color: '#eac34f', t: 0.5 });
      b.damage(u, t, atk, 'magic');
      if (u.ref.pierceLaser) {
        delete u.ref.pierceLaser;
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure && f !== t);
        if (foes.length > 0) {
          foes.sort((f1, f2) => dist(t, f1) - dist(t, f2));
          const sec = foes[0];
          b.emit({ k: 'beam', a: t, b: sec, color: '#f0d674', t: 0.4 });
          b.damage(u, sec, atk * 0.40, 'magic');
        }
      }
    },
    tick(u, b, dt) {
      if (cool(u, 'spike_armor', dt, 4)) {
        resetCd(u, 'spike_armor', 9, b);
        u.ref.spikesActive = b.t + 3.0;
        u.ref.spikeReflects = 0;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '海晶棘甲!', color: '#cf8ddc' });
        if (u.star >= 3) {
          b.addTimedAction(3.0, () => {
            if (u.alive) u.ref.pierceLaser = true;
          });
        }
      }
    },
    onDamaged(u, src, o, b) {
      if (o.melee && u.ref.spikesActive && b.t <= u.ref.spikesActive) {
        if ((u.ref.spikeReflects ?? 0) < 4 && src && src.alive) {
          const lastR = u.ref.lastSpikeT ?? -999;
          if (b.t - lastR >= 0.5) {
            u.ref.lastSpikeT = b.t;
            u.ref.spikeReflects = (u.ref.spikeReflects ?? 0) + 1;
            b.damage(u, src, b.atkOf(u) * 0.18, 'magic', { noCrit: true });
            b.emit({ k: 'hit', x: src.x, y: src.y, z: src.gz + src.z + src.size * 0.5, big: false, color: '#cf8ddc' });
          }
        }
      }
      return false;
    },
  },

  // 4. 无名者 · 王印 (nameless_sovereign)
  nameless_sovereign: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      const firstCd = u.star >= 3 ? 2 : 3;
      if (cool(u, 'summon_minion', dt, firstCd)) {
        resetCd(u, 'summon_minion', 9, b);
        u.ref.totalSummons = (u.ref.totalSummons ?? 0);
        if (u.ref.totalSummons >= 4) return;
        const currentMinions = alliesOf(u, b).filter(
          (a) => a.alive && a.isSummon && a.mob.id === 'nameless_minion' && a.ref.ownerId === u.id
        );
        if (currentMinions.length >= 2) return;
        u.ref.totalSummons++;
        const hpRatio = u.star >= 3 ? 0.30 : 0.24;
        const px = clampX(u, u.x + (u.team === 0 ? 30 : -30));
        const py = clampY(u.y + b.rng.range(-20, 20));
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '残王仪仗!', color: '#99db68' });
        b.summon(u, 'nameless_minion', px, py, hpRatio, { lifespan: 8, fx: 'summon' });
      }
    },
  },

  // 5. 红石巨兽 · 熔心 (redstone_colossus)
  redstone_colossus: {
    tick(u, b, dt) {
      if (u.ref.charging) {
        u.ref.chargeT = (u.ref.chargeT ?? 0) - dt;
        if (u.ref.chargeT <= 0) {
          u.ref.charging = false;
          const r = u.star >= 3 ? 85 : 75;
          const maxTargets = u.star >= 3 ? 5 : 4;
          const atk = b.atkOf(u);
          b.emit({ k: 'boom', x: u.x, y: u.y, r, color: '#ed9a53', big: true });
          b.emit({ k: 'shake', a: 9 });
          b.emit({ k: 'sfx', id: 'explode', v: 0.8 });
          let count = 0;
          b.aoe(u.x, u.y, r, u.team, (e) => {
            if (count >= maxTargets) return;
            count++;
            b.damage(u, e, atk * 1.30, 'phys', { melee: true });
            b.knock(e, u.x, u.y, 45);
          });
          // 留下 2.5 秒熔地
          b.addZone({
            x: u.x,
            y: u.y,
            r,
            dur: 2.5,
            team: u.team,
            dps: atk * 0.12,
            kind: 'fire',
            src: u,
          });
        }
        return;
      }
      if (cool(u, 'colossus_slam', dt, 4)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure && dist(u, f) <= 90);
        if (foes.length > 0) {
          resetCd(u, 'colossus_slam', 8, b);
          u.ref.charging = true;
          u.ref.chargeT = 1.0;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔心重震!', color: '#ff9c47' });
        }
      }
    },
    move(u) {
      return !!u.ref.charging;
    },
  },

  // 6. 丛林巨兽 · 共生 (verdant_abomination)
  verdant_abomination: {
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      u.ref.hitCount = (u.ref.hitCount ?? 0) + 1;
      if (u.ref.hitCount % 3 === 0) {
        b.poison(t, b.atkOf(u) * 0.08, 3.0, 1, u);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '毒刺附痕', color: '#9ac366' });
      }
    },
    tick(u, b, dt) {
      if (cool(u, 'spawn_vines', dt, 4)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) return;
        resetCd(u, 'spawn_vines', 10, b);
        u.ref.totalVines = (u.ref.totalVines ?? 0);
        if (u.ref.totalVines >= 6) return;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '根脉共生!', color: '#a5c968' });
        const target = foes[0];
        const hpRatio = u.star >= 3 ? 0.10 : 0.08;
        for (let i = 0; i < 2; i++) {
          if (u.ref.totalVines >= 6) break;
          u.ref.totalVines++;
          const angle = (i * Math.PI) + (b.rng.next() - 0.5);
          const vx = clampX(target, target.x + Math.cos(angle) * 35);
          const vy = clampY(target.y + Math.sin(angle) * 35);
          b.summon(u, 'verdant_vine', vx, vy, hpRatio, { lifespan: 4, fx: 'summon' });
        }
      }
    },
  },

  // 7. 风暴傀儡 · 风核 (tempest_warden)
  tempest_warden: {
    move() {
      return true; // 原地固定部署
    },
    tick(u, b, dt) {
      // 濒死护盾
      if (u.hp / u.maxHp <= 0.4 && !u.ref.shieldUsed) {
        u.ref.shieldUsed = true;
        const ratio = u.star >= 3 ? 0.14 : 0.10;
        u.addSynergyShield('tempest_shield', u.maxHp * ratio, 3.0);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '风核庇护!', color: '#d1b660' });
      }
      // 落雷技能
      if (cool(u, 'tempest_strike', dt, 2)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure && dist(u, f) <= 300);
        if (foes.length === 0) return;
        resetCd(u, 'tempest_strike', 6.5, b);
        foes.sort((f1, f2) => b.atkOf(f2) - b.atkOf(f1));
        const target = foes[0];
        const tx = target.x;
        const ty = target.y;
        const r = u.star >= 3 ? 65 : 55;
        const atk = b.atkOf(u);
        b.emit({ k: 'text', x: tx, y: ty, z: 20, s: '神雷预警!', color: '#8dd9e8' });
        b.addDelayed({
          t: 0.9,
          x: tx,
          y: ty,
          r,
          dmg: atk * 1.50,
          team: u.team,
          src: u,
          kind: 'bolt',
        });
        b.addTimedAction(0.9, () => {
          b.aoe(tx, ty, r, u.team, (e) => {
            b.slow(e, 0.25, 0, 1.5);
          });
        });
      }
    },
  },

  // 8. 复仇之心 · 虚空契 (void_sovereign)
  void_sovereign: {
    tick(u, b, dt) {
      if (cool(u, 'void_phase', dt, 4)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) return;
        resetCd(u, 'void_phase', 8, b);
        u.ref.phase = (u.ref.phase ?? 0) + 1;
        foes.sort((f1, f2) => dist(u, f1) - dist(u, f2));
        const target = foes[0];
        const atk = b.atkOf(u);
        if (u.ref.phase % 2 === 1) {
          // 冲撞
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '虚空冲撞!', color: '#bd8de9' });
          startCharge(u, target, 240);
          b.addTimedAction(0.8, () => {
            if (!u.alive) return;
            b.aoe(u.x, u.y, 50, u.team, (e) => {
              b.damage(u, e, atk * 1.40, 'magic');
              b.knock(e, u.x, u.y, 40);
              if (u.star >= 3 && !e.ref.voidMark) {
                e.ref.voidMark = b.t + 3.0;
                b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.size, s: '虚空标记', color: '#bc8ddd' });
              }
            });
          });
        } else {
          // 激光
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '虚空激光!', color: '#bc80dd' });
          b.addTimedAction(0.9, () => {
            if (!u.alive || !target.alive) return;
            b.emit({ k: 'beam', a: u, b: target, color: '#bc80dd', t: 0.6 });
            b.damage(u, target, atk * 1.30, 'magic');
            if (u.star >= 3 && !target.ref.voidMark) {
              target.ref.voidMark = b.t + 3.0;
              b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '虚空标记', color: '#bc8ddd' });
            }
          });
        }
      }
    },
    onHit(u, t, dealt, b) {
      if (dealt > 0 && t.ref.voidMark && b.t <= t.ref.voidMark) {
        delete t.ref.voidMark;
        b.damage(u, t, b.atkOf(u) * 0.12, 'magic', { noCrit: true });
        b.emit({ k: 'hit', x: t.x, y: t.y, z: t.gz + t.size * 0.5, big: true, color: '#f2dcff' });
      }
    },
  },

  // ──────────────────────── 24 张群落与异种新卡 ────────────────────────

  // 9. 幼年溺尸 (baby_drowned)
  baby_drowned: {
    move(u, b, dt) {
      const cx = cellX(u.x);
      const cy = cellY(u.y);
      const s = b.terrain.s[idx(cx, cy)];
      if (s === S.WATER) {
        u.speedMul = 1.18;
      }
      return false;
    },
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cRef = getCardRef(u, b);
      if (cRef && !cRef.slowProc) {
        cRef.slowProc = true;
        const dur = u.star >= 3 ? 2.0 : 1.5;
        b.slow(t, 0.15, 0, dur);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '浅滩减速!', color: '#7cc7c3' });
      }
    },
  },

  // 10. 侦路兔 (rabbit_scout)
  rabbit_scout: {
    attack() {}, // 不攻击
    init(u, b) {
      if (!isCardLead(u, b)) return;
      const allies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isRanged && a.speed > 0);
      if (allies.length === 0) return;
      allies.sort((a1, a2) => a1.speed - a2.speed);
      const target = allies[0];
      const dur = u.star >= 3 ? 4.0 : 3.0;
      target.speedMul = Math.max(target.speedMul, 1.12);
      target.speedT = Math.max(target.speedT, dur);
      target.ref.scoutReduceSlow = true;
      b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '探路机动 +12%', color: '#c0d7a4' });
    },
  },

  // 11. 长毛牛 (woolly_cow)
  woolly_cow: {
    attack() {}, // 不攻击
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'woolly_shield', dt, 2.0, b)) {
        resetCardCd(u, 'woolly_shield', 10.0, b);
        const allies = alliesOf(u, b).filter((a) => a.alive && !a.structure && a.row === 'front');
        if (allies.length === 0) return;
        allies.sort((a1, a2) => (a1.hp / a1.maxHp) - (a2.hp / a2.maxHp));
        const target = allies[0];
        const ratio = u.star >= 3 ? 0.08 : 0.06;
        const shAmt = target.maxHp * ratio;
        target.addSynergyShield('woolly_shield', shAmt, 4.0);
        b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '厚绒护盾', color: '#dfe6e9' });
      }
    },
  },

  // 12. 幼年海龟 (baby_turtle)
  baby_turtle: {
    attack() {}, // 不攻击
    tick(u, b) {
      if (!isCardLead(u, b)) return;
      const cRef = getCardRef(u, b);
      if (cRef && cRef.turtleShieldUsed) return;
      const thresh = u.star >= 3 ? 0.45 : 0.40;
      const allies = alliesOf(u, b).filter((a) => a.alive && !a.structure && (a.hp / a.maxHp) <= thresh);
      if (allies.length > 0) {
        if (cRef) cRef.turtleShieldUsed = true;
        const target = allies[0];
        const ratio = u.star >= 3 ? 0.10 : 0.08;
        target.addSynergyShield('turtle_shell', target.maxHp * ratio, 3.0);
        b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '初生护壳!', color: '#2ecc71' });
      }
    },
  },

  // 13. 苔藓骷髅 (mossy_skeleton)
  mossy_skeleton: {
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cRef = getCardRef(u, b);
      if (!cRef) return;
      cRef.hits = (cRef.hits ?? 0) + 1;
      const req = u.star >= 3 ? 3 : 4;
      if (cRef.hits % req === 0) {
        b.poison(t, b.atkOf(u) * 0.30, 3.0, 1, u);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '苔毒箭!', color: '#27ae60' });
      }
    },
  },


  // 16. 蓝色附魔绵羊 (enchanted_blue_sheep)
  enchanted_blue_sheep: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'blue_sheep_speed', dt, 2.0, b)) {
        resetCardCd(u, 'blue_sheep_speed', 9.0, b);
        const allies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isRanged && a.speed > 0);
        if (allies.length === 0) return;
        allies.sort((a1, a2) => a1.speed - a2.speed);
        const target = allies[0];
        const dur = u.star >= 3 ? 4.0 : 3.0;
        target.speedMul = Math.max(target.speedMul, 1.18);
        target.speedT = Math.max(target.speedT, dur);
        b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '蓝绒疾步 +18%', color: '#3498db' });
      }
    },
  },

  // 17. 红色附魔绵羊 (enchanted_red_sheep)
  enchanted_red_sheep: {
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cRef = getCardRef(u, b);
      if (!cRef) return;
      cRef.hits = (cRef.hits ?? 0) + 1;
      const req = u.star >= 3 ? 3 : 4;
      if (cRef.hits % req === 0) {
        b.burn(t, b.atkOf(u) * 0.30, 2.0, u);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '赤绒余火!', color: '#e74c3c' });
      }
    },
  },

  // 18. 绿色附魔绵羊 (enchanted_green_sheep)
  enchanted_green_sheep: {
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cRef = getCardRef(u, b);
      if (!cRef) return;
      cRef.hits = (cRef.hits ?? 0) + 1;
      if (cRef.hits % 3 === 0) {
        const dpsRatio = u.star >= 3 ? 0.28 : 0.22;
        b.poison(t, b.atkOf(u) * dpsRatio, 3.0, 1, u);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '青绒蚀痕!', color: '#2ecc71' });
        if (!cRef.weakenProc) {
          cRef.weakenProc = true;
          t.atk = Math.max(1, t.atk * 0.92);
          b.addTimedAction(2.0, () => {
            if (t.alive) t.atk /= 0.92;
          });
        }
      }
    },
  },

  // 19. 恼鬼突袭队 (vex_raider)
  vex_raider: {
    tick(u, b) {
      if (u.ref.raided) return;
      const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
      if (foes.length === 0) return;
      const closest = foes.reduce((best, f) => (dist(u, f) < dist(u, best) ? f : best), foes[0]);
      if (dist(u, closest) <= 120) {
        u.ref.raided = true;
        // 优先锁定无掩护后排
        const backFoes = foes.filter((f) => f.row === 'back');
        const target = backFoes.length > 0 ? backFoes[0] : closest;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '灵翼突袭!', color: '#74b9ff' });
        startCharge(u, target, 260);
        b.addTimedAction(0.4, () => {
          if (!u.alive || !target.alive) return;
          const mul = u.star >= 3 ? 1.70 : 1.40;
          b.damage(u, target, b.atkOf(u) * mul, 'phys', { melee: true });
        });
      }
    },
  },

  // 20. 僵尸化猪灵 (zombified_piglin)
  zombified_piglin: {
    afterDamaged(u, src, _d, b) {
      if (src && !u.ref.revengeReady) {
        u.ref.revengeReady = true;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '亡金怒火!', color: '#f39c12' });
      }
    },
    onHit(u, t, dealt, b) {
      if (dealt > 0 && u.ref.revengeReady) {
        delete u.ref.revengeReady;
        const mul = u.star >= 3 ? 0.45 : 0.30;
        b.damage(u, t, b.atkOf(u) * mul, 'phys', { melee: true, noCrit: true });
        b.emit({ k: 'hit', x: t.x, y: t.y, z: t.gz + t.size * 0.5, big: true, color: '#f1c40f' });
      }
    },
  },

  // 21. 僵尸化猪灵弩手 (zombified_hunter)
  zombified_hunter: {
    attack(u, t, b) {
      const cRef = getCardRef(u, b);
      if (cRef) cRef.shots = (cRef.shots ?? 0) + 1;
      const pierceNext = cRef && cRef.shots % 3 === 0;
      const pierce = pierceNext ? 1 : 0;
      b.shoot(u, t, 'bolt', b.atkOf(u), { pierce });
      if (pierceNext) {
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '腐金贯矢!', color: '#f39c12' });
      }
    },
  },

  // 22. 凋灵骷髅弓手 (wither_archer)
  wither_archer: {
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cRef = getCardRef(u, b);
      if (!cRef) return;
      cRef.hits = (cRef.hits ?? 0) + 1;
      if (cRef.hits % 3 === 0) {
        const dur = u.star >= 3 ? 4.0 : 3.0;
        b.wither(t, b.atkOf(u) * 0.25, dur, u);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '枯骨凋零!', color: '#576574' });
      }
    },
  },

  // 23. 逐浪低语者 (wave_whisperer)
  wave_whisperer: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'wave_root', dt, 3.0, b)) {
        resetCardCd(u, 'wave_root', 9.0, b);
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) return;
        foes.sort((f1, f2) => dist(u, f1) - dist(u, f2));
        const target = foes[0];
        b.emit({ k: 'text', x: target.x, y: target.y, z: 20, s: '海草束根预警!', color: '#1abc9c' });
        b.addTimedAction(0.7, () => {
          if (!target.alive) return;
          if (target.boss) {
            b.slow(target, 0.20, 0, 1.5);
          } else {
            const rootDur = u.star >= 3 ? 1.0 : 0.8;
            b.slow(target, 0.95, 0, rootDur); // 极大幅度减速近似定身
            b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '束根定身!', color: '#16a085' });
          }
        });
      }
    },
  },

  // 24. 重甲掠夺者 (armored_pillager)
  armored_pillager: {
    tick(u, b, dt) {
      if (u.moving) {
        u.ref.stillTime = 0;
      } else {
        u.ref.stillTime = (u.ref.stillTime ?? 0) + dt;
        if (u.ref.stillTime >= 2.0 && !u.ref.aimed) {
          u.ref.aimed = true;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '重弩定射瞄准!', color: '#a4b0be' });
        }
      }
    },
    attack(u, t, b) {
      const atk = b.atkOf(u);
      let mul = 1.0;
      if (u.ref.aimed) {
        delete u.ref.aimed;
        u.ref.stillTime = 0;
        mul += (u.star >= 3 ? 0.35 : 0.25);
      }
      b.shoot(u, t, 'bolt', atk * mul);
    },
  },

  // 25. 重甲卫道士 (armored_vindicator)
  armored_vindicator: {
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cRef = getCardRef(u, b);
      if (!cRef) return;
      cRef.hits = (cRef.hits ?? 0) + 1;
      if (cRef.hits % 4 === 0) {
        const ratio = u.star >= 3 ? 0.75 : 0.50;
        const shieldBreaker = b.atkOf(u) * ratio;
        if (t.shield > 0) {
          t.shield = Math.max(0, t.shield - shieldBreaker);
          b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '沉斧破盾!', color: '#e74c3c' });
        }
      }
    },
  },

  // 26. 重甲溺尸 (armored_drowned)
  armored_drowned: {
    onDamaged(u, _src, o, b) {
      if (o.proj) {
        const cx = cellX(u.x);
        const cy = cellY(u.y);
        if (b.terrain.s[idx(cx, cy)] === S.WATER) {
          u.shield = Math.max(u.shield, 5);
        }
      }
      return false;
    },
    afterDamaged(u, _src, _d, b) {
      if (u.hp / u.maxHp <= 0.5 && !u.ref.shieldUsed) {
        u.ref.shieldUsed = true;
        const ratio = u.star >= 3 ? 0.12 : 0.08;
        u.addSynergyShield('drowned_shield', u.maxHp * ratio, 3.0);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '沉甲挡潮!', color: '#00cec9' });
      }
    },
  },

  // 27. 冰霜苦力怕 (icy_creeper)
  icy_creeper: {
    tick(u, b, dt) {
      if (u.ref.exploding) {
        u.ref.igniteT = (u.ref.igniteT ?? 1.2) - dt;
        if (u.ref.igniteT <= 0) {
          u.ref.exploding = false;
          const r = u.star >= 3 ? 85 : 75;
          const atk = b.atkOf(u);
          b.emit({ k: 'boom', x: u.x, y: u.y, r, color: '#74b9ff', big: true });
          b.emit({ k: 'sfx', id: 'explode', v: 0.8 });
          let hit = 0;
          b.aoe(u.x, u.y, r, u.team, (e) => {
            if (hit >= 4) return;
            hit++;
            b.damage(u, e, atk, 'magic', { noCrit: true });
            b.slow(e, 0.25, 0, 2.0);
          });
          u.hp = 0;
          u.alive = false;
          b.emit({ k: 'death', u });
        }
        return;
      }
      const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
      if (foes.length === 0) return;
      const closest = foes.reduce((best, f) => (dist(u, f) < dist(u, best) ? f : best), foes[0]);
      if (dist(u, closest) <= 35) {
        u.ref.exploding = true;
        u.ref.igniteT = 1.2;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '霜爆引燃!', color: '#74b9ff' });
      }
    },
    move(u) {
      return !!u.ref.exploding;
    },
  },

  // 28. 高塔卫兵 (tower_guard)
  tower_guard: {
    onDamaged(u, src, o) {
      if (o.proj && src) {
        // 判断是否正面 (x方向一致)
        const isFront = (u.facing > 0 && src.x > u.x) || (u.facing < 0 && src.x < u.x);
        if (isFront) {
          u.shield = Math.max(u.shield, 10);
        }
      }
      return false;
    },
    tick(u, b, dt) {
      if (cool(u, 'tower_thrust', dt, 4)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure && dist(u, f) <= 110);
        if (foes.length === 0) return;
        resetCd(u, 'tower_thrust', 8, b);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '长矛突刺蓄能!', color: '#dfe4ea' });
        b.addTimedAction(0.8, () => {
          if (!u.alive) return;
          const mul = u.star >= 3 ? 1.40 : 1.20;
          let hit = 0;
          b.aoe(u.x + u.facing * 50, u.y, 40, u.team, (e) => {
            if (hit >= 2) return;
            hit++;
            b.damage(u, e, b.atkOf(u) * mul, 'phys', { melee: true });
            if (!e.boss) b.knock(e, u.x, u.y, 30);
          });
        });
      }
    },
  },

  // 29. 灾厄之王 (arch_illager)
  arch_illager: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b) {
      u.ref.summonTimes = u.ref.summonTimes ?? [4, 14, 24];
      if (u.ref.summonTimes.length > 0 && b.t >= u.ref.summonTimes[0]) {
        u.ref.summonTimes.shift();
        const currentHelpers = alliesOf(u, b).filter(
          (a) => a.alive && a.isSummon && a.mob.id === 'arch_reinforcement' && a.ref.ownerId === u.id
        );
        if (currentHelpers.length < 2) {
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '王令援军!', color: '#ff4757' });
          const px = clampX(u, u.x + (u.team === 0 ? 30 : -30));
          const py = clampY(u.y + b.rng.range(-15, 15));
          b.summon(u, 'arch_reinforcement', px, py, 0.22, { lifespan: 8, fx: 'summon' });
        }
      }
    },
  },

  // 30. 高塔毒幽魂 (poison_tower_wraith)
  poison_tower_wraith: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (cool(u, 'poison_circle', dt, 3)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) return;
        resetCd(u, 'poison_circle', 8, b);
        foes.sort((f1, f2) => dist(u, f1) - dist(u, f2));
        const target = foes[0];
        const tx = target.x;
        const ty = target.y;
        const r = u.star >= 3 ? 65 : 55;
        b.emit({ k: 'text', x: tx, y: ty, z: 20, s: '毒雾预警!', color: '#2ed573' });
        b.addTimedAction(0.9, () => {
          b.addZone({
            x: tx,
            y: ty,
            r,
            dur: 3.0,
            team: u.team,
            dps: b.atkOf(u) * 0.50,
            kind: 'fire', // 持续魔伤
            src: u,
          });
        });
      }
    },
  },

  // 31. 哞菇巨兽 (mooshroom_monstrosity)
  mooshroom_monstrosity: {
    tick(u, b, dt) {
      if (u.ref.charging) {
        u.ref.chargeT = (u.ref.chargeT ?? 0) - dt;
        if (u.ref.chargeT <= 0) {
          u.ref.charging = false;
          const maxTargets = u.star >= 3 ? 4 : 3;
          const atk = b.atkOf(u);
          b.emit({ k: 'boom', x: u.x + u.facing * 40, y: u.y, r: 70, color: '#ff6b81', big: true });
          b.emit({ k: 'shake', a: 8 });
          let count = 0;
          b.aoe(u.x + u.facing * 40, u.y, 70, u.team, (e) => {
            if (count >= maxTargets) return;
            count++;
            b.damage(u, e, atk * 1.50, 'phys', { melee: true });
            if (count === 1 && !e.ref.sporeMark) {
              e.ref.sporeMark = b.t + 3.0;
              b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.size, s: '附着孢子', color: '#ff6b81' });
            }
          });
          // 施放后 2 秒自身承受直接伤害 +12%
          u.takenMul *= 1.12;
          b.addTimedAction(2.0, () => {
            if (u.alive) u.takenMul /= 1.12;
          });
        }
        return;
      }
      if (cool(u, 'shroom_slam', dt, 4)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure && dist(u, f) <= 80);
        if (foes.length > 0) {
          resetCd(u, 'shroom_slam', 8, b);
          u.ref.charging = true;
          u.ref.chargeT = 1.0;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '菌冠重拳蓄力!', color: '#ff4757' });
        }
      }
    },
    move(u) {
      return !!u.ref.charging;
    },
    onHit(u, t, dealt, b) {
      if (dealt > 0 && t.ref.sporeMark && b.t <= t.ref.sporeMark) {
        delete t.ref.sporeMark;
        b.damage(u, t, b.atkOf(u) * 0.25, 'magic', { noCrit: true });
        b.emit({ k: 'boom', x: t.x, y: t.y, r: 35, color: '#ff6b81', big: false });
      }
    },
  },

  // 32. 末影之心 (heart_of_ender)
  heart_of_ender: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (cool(u, 'ender_barrage', dt, 4)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) return;
        resetCd(u, 'ender_barrage', 8, b);
        u.ref.cycle = (u.ref.cycle ?? 0) + 1;
        const atk = b.atkOf(u);
        if (u.ref.cycle % 2 === 1) {
          // 迫击弹
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '虚空迫击!', color: '#a55eea' });
          const t1 = foes[0];
          const t2 = foes.length > 1 ? foes[1] : foes[0];
          const targets = t1 === t2 ? [t1] : [t1, t2];
          for (const tgt of targets) {
            const tx = tgt.x;
            const ty = tgt.y;
            b.emit({ k: 'text', x: tx, y: ty, z: 20, s: '迫击落点', color: '#8854d0' });
            b.addDelayed({
              t: 1.0,
              x: tx,
              y: ty,
              r: 45,
              dmg: atk,
              team: u.team,
              src: u,
              kind: 'bolt',
            });
            if (u.star >= 3) {
              b.addTimedAction(1.0, () => {
                b.aoe(tx, ty, 45, u.team, (e) => b.slow(e, 0.15, 0, 2.0));
              });
            }
          }
        } else {
          // 直线激光
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '毁灭激光!', color: '#8854d0' });
          const target = foes[0];
          b.addTimedAction(0.8, () => {
            if (!u.alive || !target.alive) return;
            b.emit({ k: 'beam', a: u, b: target, color: '#8854d0', t: 0.7 });
            b.damage(u, target, atk * 1.50, 'magic');
            if (u.star >= 3) {
              b.slow(target, 0.15, 0, 2.0);
            }
          });
        }
      }
    },
  },

  // ──────────────────────── 辅助召唤实体 ────────────────────────

  // 无名者骨盾侍从 (nameless_minion)
  nameless_minion: {
    onDamaged(u, src, o) {
      if (o.proj && src) {
        const isFront = (u.facing > 0 && src.x > u.x) || (u.facing < 0 && src.x < u.x);
        if (isFront) {
          u.shield = Math.max(u.shield, 6);
        }
      }
      return false;
    },
  },

  // 丛林共生藤蔓 (verdant_vine)
  verdant_vine: {
    move() {
      return true;
    },
    tick(u, b, dt) {
      if (cool(u, 'vine_slap', dt, 1.0)) {
        resetCd(u, 'vine_slap', 2.0, b);
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure && dist(u, f) <= 90);
        if (foes.length === 0) return;
        const target = foes[0];
        b.emit({ k: 'hit', x: target.x, y: target.y, z: target.gz + target.size * 0.5, big: false, color: '#a5c968' });
        b.damage(u, target, b.atkOf(u), 'phys', { melee: true });
        if (u.star >= 3 && !target.ref.vineSlowed) {
          target.ref.vineSlowed = true;
          b.slow(target, 0.15, 0, 1.0);
        }
      }
    },
  },

  // 灾厄精锐卫从 (arch_reinforcement)
  arch_reinforcement: {},

};
