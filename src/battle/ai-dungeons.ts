import type { Battle } from './sim.ts';
import { ARENA_D, ARENA_W, type Unit } from './unit.ts';
import { chargeMove, cool, dist, foesOf, resetCd, startCharge, type Behavior } from './ai.ts';

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

function setCardCd(u: Unit, key: string, cd: number, b: Battle) {
  const cRef = getCardRef(u, b);
  if (cRef) cRef[key] = cd;
  u.ab[key] = cd;
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
  let finalCd = cd;
  const cRef = getCardRef(u, b);
  if (cRef) {
    if (b.has(u.team, 'temporal_sand') && !cRef[key + '_sand_used']) {
      cRef[key + '_sand_used'] = 1;
      finalCd = cd * 0.85;
      b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '沙漏 -15%CD', color: '#f1c40f' });
    }
    cRef[key] = finalCd;
  } else {
    if (b.has(u.team, 'temporal_sand') && !u.ab[key + '_sand_used']) {
      u.ab[key + '_sand_used'] = 1;
      finalCd = cd * 0.85;
      b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '沙漏 -15%CD', color: '#f1c40f' });
    }
  }
  u.ab[key] = finalCd;
  return finalCd;
}

function vineBurrowToFoe(u: Unit, b: Battle) {
  const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
  if (foes.length === 0) return;
  const e = foes.reduce((best, f) => (dist(u, f) < dist(u, best) ? f : best), foes[0]);
  const homeX = u.team === 0 ? -1 : 1;
  const angle = (b.rng.range(-1, 1) * Math.PI) / 3;
  const d = b.rng.range(70, 100);
  const nx = clampX(u, e.x + homeX * Math.cos(angle) * d);
  const ny = clampY(e.y + Math.sin(angle) * d);

  b.emit({ k: 'boom', x: u.x, y: u.y, r: 25, color: '#2ed573', big: false });
  b.emit({ k: 'tele', x: u.x, y: u.y, x2: nx, y2: ny, z: u.gz });
  b.emit({ k: 'sfx', id: 'teleport' });

  u.x = u.px = nx;
  u.y = u.py = ny;
  b.teleported(u);
  u.target = e;
  u.facing = e.x > u.x ? 1 : -1;
  u.retarget = 1.0;

  b.emit({ k: 'text', x: nx, y: ny, z: u.gz + u.z + u.size, s: '藤蔓破土!', color: '#2ed573' });
  b.emit({ k: 'boom', x: nx, y: ny, r: 35, color: '#2ed573', big: false });

  if (u.star >= 3) {
    b.aoe(nx, ny, 80, u.team, (foe) => {
      b.slow(foe, 0.25, 0.15, 2.0);
    });
  }
}

export const DUNGEONS_BEHAVIORS: Record<string, Behavior> = {
  // 1. 骷髅先锋 (skeleton_vanguard)
  skeleton_vanguard: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'thrust', dt, 3, b)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 60) {
          resetCardCd(u, 'thrust', 6, b);
          const atk = b.atkOf(u);
          b.emit({ k: 'boom', x: t.x, y: t.y, r: 35, color: '#dcdde1', big: false });
          b.damage(u, t, atk * 0.8, 'phys', { melee: true });
          const hasMeleeAlly = alliesOf(u, b).some((a) => a !== u && a.alive && !a.isRanged && dist(a, t) <= 40);
          if (!hasMeleeAlly || t.channeling) {
            b.knock(t, u.x, u.y, 25);
          }
          if (u.star >= 3) {
            u.addSynergyShield('vanguard_shield', u.maxHp * 0.08, 3.0);
          }
        }
      }
    },
  },

  // 2. 红石守卫 (redstone_golem)
  redstone_golem: {
    tick(u, b, dt) {
      if (u.ref.charging) {
        u.ref.chargeT = (u.ref.chargeT ?? 0) - dt;
        if (u.ref.chargeT <= 0) {
          u.ref.charging = false;
          const r = 65;
          const maxTargets = u.star >= 3 ? 5 : 4;
          const armorSub = u.star >= 3 ? 0.08 : 0.05;
          const atk = b.atkOf(u);
          b.emit({ k: 'boom', x: u.x, y: u.y, r, color: '#ff3838', big: true });
          b.emit({ k: 'shake', a: 8 });
          b.emit({ k: 'sfx', id: 'explode', v: 0.7 });
          let count = 0;
          b.aoe(u.x, u.y, r, u.team, (e) => {
            if (count >= maxTargets) return;
            count++;
            b.damage(u, e, atk * 1.4, 'phys', { melee: true });
            const sub = Math.min(e.armor, armorSub);
            e.armor -= sub;
            b.addTimedAction(4.0, () => {
              if (e.alive) e.armor += sub;
            });
          });
        }
        return;
      }
      if (cool(u, 'slam', dt, 7)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure && dist(u, f) <= 80);
        if (foes.length > 0) {
          u.ab.slam = 7;
          u.ref.charging = true;
          u.ref.chargeT = 1.0;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '蓄力砸地!', color: '#ff3838' });
        }
      }
    },
    move(u) {
      return !!u.ref.charging;
    },
  },

  // 3. 灵魂侍从 (soul_wisp)
  soul_wisp: {
    attack(u, t, b) {
      const atk = b.atkOf(u);
      const bonus = (u.star >= 3 && t.shield > 0) ? 1.1 : 1.0;
      b.shoot(u, t, 'chin_spike', atk * bonus, { special: 'magic' });
    },
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cd = u.star >= 3 ? 3 : 4;
      const cdKey = `soul_wisp_cd_c${u.card}`;
      const last = b.sides[u.team].timers[cdKey] ?? -999;
      if (b.t - last >= cd) {
        b.sides[u.team].timers[cdKey] = b.t;
        b.addSouls(u.team, 1);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '+1 灵魂', color: '#00d2d3' });
      }
    },
  },

  // 4. 附魔师 (enchanter)
  enchanter: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      const cd = u.star >= 3 ? 7 : 8;
      if (coolCard(u, 'enchant', dt, 2.0, b)) {
        const candidates = alliesOf(u, b).filter(
          (a) => a.alive && !a.structure && !a.isSummon && a.card !== u.card && a.mob.id !== 'enchanter'
        );
        if (candidates.length === 0) {
          setCardCd(u, 'enchant', 1.0, b);
          return;
        }
        resetCardCd(u, 'enchant', cd, b);
        // 绑定核心原生输出卡：按整卡DPS选核心
        const cardDpsMap = new Map<number, { dps: number; card: number; units: Unit[] }>();
        for (const a of candidates) {
          const entry = cardDpsMap.get(a.card) ?? { dps: 0, card: a.card, units: [] };
          entry.units.push(a);
          entry.dps += (b.atkOf(a) * a.atkSpd) / Math.max(0.2, a.cd);
          cardDpsMap.set(a.card, entry);
        }
        const cardEntries = Array.from(cardDpsMap.values()).sort((a1, a2) => a2.dps - a1.dps);
        const targets = cardEntries[0].units;
        const atkMul = u.star === 3 ? 0.40 : (u.star === 2 ? 0.35 : 0.25);
        const spdMul = u.star === 3 ? 0.25 : (u.star === 2 ? 0.20 : 0.15);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '附魔律令!', color: '#9b59b6' });
        for (const t of targets) {
          // 同类律令取强，不重复叠加
          if (t.ref.enchantTier && t.ref.enchantTier >= atkMul) continue;
          t.ref.enchantTier = atkMul;
          b.emit({ k: 'beam', a: u, b: t, color: '#9b59b6', t: 0.5 });
          const bonusAtk = t.atk * atkMul;
          t.atk += bonusAtk;
          t.atkSpd *= (1 + spdMul);
          b.addTimedAction(6.0, () => {
            if (t.alive) {
              t.atk = Math.max(0, t.atk - bonusAtk);
              t.atkSpd /= (1 + spdMul);
              t.ref.enchantTier = 0;
            }
          });
          if (u.star >= 3) {
            t.addSynergyShield('enchanter_shield', t.maxHp * 0.08, 4.0);
          }
        }
      }
    },
  },

  // 5. 地卜师 (geomancer)
  geomancer: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'pillar', dt, 3.0, b)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          setCardCd(u, 'pillar', 1.0, b);
          return;
        }
        resetCardCd(u, 'pillar', 8, b);
        // 优先切分接近己方后排的地面威胁，其次是蓄势/读条者
        const backlineAllies = alliesOf(u, b).filter((a) => a.alive && a.row === 'back');
        foes.sort((f1, f2) => {
          if (f1.channeling !== f2.channeling) return f1.channeling ? -1 : 1;
          if (backlineAllies.length > 0) {
            const minD1 = Math.min(...backlineAllies.map((a) => dist(f1, a)));
            const minD2 = Math.min(...backlineAllies.map((a) => dist(f2, a)));
            return minD1 - minD2;
          }
          return dist(u, f1) - dist(u, f2);
        });
        const target = foes[0];
        const px = clampX(target, target.x);
        const py = clampY(target.y);
        b.emit({ k: 'text', x: px, y: py, z: 20, s: '岩柱预警!', color: '#e67e22' });
        b.addDelayed({
          t: 1.0,
          x: px,
          y: py,
          r: 45,
          dmg: b.atkOf(u) * 0.9,
          team: u.team,
          src: u,
          kind: 'pillar',
        });
        b.addTimedAction(1.0, () => {
          b.summon(u, 'geomancer_pillar', px, py, 1, { lifespan: 4, fx: 'summon' });
        });
      }
    },
  },

  // 6. 皇家卫兵 (royal_guard)
  royal_guard: {
    afterDamaged(u, _src, _d, b) {
      if (u.hp / u.maxHp <= 0.5 && !u.ref.enraged) {
        u.ref.enraged = true;
        u.atkSpd *= 1.25;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '弃盾狂怒!', color: '#e74c3c' });
        if (u.star >= 3) {
          u.shield = Math.min(u.maxHp * 0.3, u.shield + u.maxHp * 0.08);
        }
      }
    },
  },

  // 7. 幽魂 (wraith)
  wraith: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (cool(u, 'soul_fire', dt, 7)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          u.ab.soul_fire = 1.0;
          return;
        }
        u.ab.soul_fire = 7;
        const t = foes[0];
        const dur = u.star >= 3 ? 4 : 3;
        b.emit({ k: 'boom', x: t.x, y: t.y, r: 50, color: '#00d2d3', big: false });
        b.addZone({
          x: t.x,
          y: t.y,
          r: 50,
          dur,
          dps: b.atkOf(u) * 0.25,
          kind: 'fire',
          team: u.team,
          src: u,
        });
      }
    },
  },

  // 8. 亡灵巫师 (necromancer)
  necromancer: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      u.ref.summonCount = u.ref.summonCount ?? 0;
      if (u.ref.summonCount >= 6) return;
      const initialWait = u.star >= 3 ? 2.0 : 3.0;
      if (cool(u, 'necro_sum', dt, u.ref.summonCount === 0 ? initialWait : 8)) {
        const aliveSkels = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'skeleton' && a.card === u.card);
        if (aliveSkels.length < 2) {
          u.ref.summonCount++;
          resetCd(u, 'necro_sum', 8, b);
          const skel = b.summon(u, 'skeleton', u.x + (u.team === 0 ? 30 : -30), u.y, 1.0, { lifespan: 12, fx: 'summon' });
          if (skel) {
            skel.maxHp = skel.hp = Math.max(10, Math.round(u.maxHp * 0.22));
            skel.atk = Math.max(2, Math.round((u.atk * u.atkSpd * 0.35) / Math.max(0.1, skel.atkSpd)));
          }
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '亡骸复苏!', color: '#2ed573' });
        } else {
          u.ab.necro_sum = 1.0;
        }
      }
    },
  },

  // 9. 冰术师 (iceologer)
  iceologer: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'ice_drop', dt, 3.0, b)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          setCardCd(u, 'ice_drop', 1.0, b);
          return;
        }
        resetCardCd(u, 'ice_drop', 7, b);
        // 优先当前蓄势/读条目标，其次最前排
        foes.sort((f1, f2) => {
          if (f1.channeling !== f2.channeling) return f1.channeling ? -1 : 1;
          return dist(u, f1) - dist(u, f2);
        });
        const target = foes[0];
        const tx = target.x;
        const ty = target.y;
        b.emit({ k: 'text', x: tx, y: ty, z: 30, s: '冰霜落点!', color: '#70a1ff' });
        b.addDelayed({
          t: 1.0,
          x: tx,
          y: ty,
          r: 50,
          dmg: b.atkOf(u) * 0.9,
          team: u.team,
          src: u,
          kind: 'ice_drop',
        });
      }
    },
  },

  // 10. 丛林低语者 (whisperer)
  whisperer: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'beast_shield', dt, 2.0, b)) {
        const candidates = alliesOf(u, b).filter(
          (a) => a.alive && !a.structure && !a.isSummon && a.card !== u.card
        );
        if (candidates.length === 0) {
          setCardCd(u, 'beast_shield', 1.0, b);
          return;
        }
        const cycle = u.star >= 3 ? 6 : 7;
        resetCardCd(u, 'beast_shield', cycle, b);
        // 按卡分组，选出 2 张原生卡（优先近战或受击者）
        const cardsMap = new Map<number, Unit[]>();
        for (const a of candidates) {
          const list = cardsMap.get(a.card) ?? [];
          list.push(a);
          cardsMap.set(a.card, list);
        }
        const cardList = Array.from(cardsMap.entries());
        cardList.sort(([, u1], [, u2]) => {
          const m1 = u1.some((u) => u.row === 'front') ? 0 : 1;
          const m2 = u2.some((u) => u.row === 'front') ? 0 : 1;
          if (m1 !== m2) return m1 - m2;
          const minHp1 = Math.min(...u1.map((u) => u.hp / u.maxHp));
          const minHp2 = Math.min(...u2.map((u) => u.hp / u.maxHp));
          return minHp1 - minHp2;
        });
        const chosenCards = cardList.slice(0, 2);
        const shieldPct = u.star >= 3 ? 0.18 : (u.star >= 2 ? 0.16 : 0.12);
        const sourceH = cardAllies(u, b).reduce((sum, a) => sum + a.maxHp, 0) || u.maxHp;
        const shieldCap = sourceH * 0.30;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '藤木护佑!', color: '#2ed573' });
        for (const [, units] of chosenCards) {
          const targetCardH = units.reduce((sum, a) => sum + a.maxHp, 0);
          const totalShieldForCard = Math.min(shieldCap, targetCardH * shieldPct);
          const perUnit = totalShieldForCard / units.length;
          for (const a of units) {
            a.addSynergyShield('whisperer_shield', perUnit, 5.0);
            b.emit({ k: 'heal', x: a.x, y: a.y, z: a.gz + a.z + a.size });
            if (a.mob.families.includes('beast')) {
              a.moveSpd *= 1.15;
              b.addTimedAction(5.0, () => {
                if (a.alive) a.moveSpd /= 1.15;
              });
            }
          }
        }
      }
    },
  },

  // 11. 唤风者 (windcaller)
  windcaller: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'wind_wave', dt, 3.0, b)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          setCardCd(u, 'wind_wave', 1.0, b);
          return;
        }
        resetCardCd(u, 'wind_wave', 8, b);
        // 优先蓄势/读条目标，其次密集前排
        foes.sort((f1, f2) => {
          if (f1.channeling !== f2.channeling) return f1.channeling ? -1 : 1;
          return dist(u, f1) - dist(u, f2);
        });
        const target = foes[0];
        b.emit({ k: 'text', x: target.x, y: target.y, z: u.gz + u.z + u.size, s: '狂风激流预警!', color: '#70a1ff' });
        const maxHits = u.star >= 3 ? 5 : 4;
        const atk = b.atkOf(u);
        const ux = u.x;
        const uy = u.y;
        const tx = target.x;
        const ty = target.y;
        b.addTimedAction(1.0, () => {
          if (!u.alive) return;
          b.emit({ k: 'boom', x: tx, y: ty, r: 65, color: '#70a1ff', big: false });
          b.emit({ k: 'sfx', id: 'wind', v: 0.8 });
          let hits = 0;
          b.aoe(tx, ty, 65, u.team, (e) => {
            if (hits >= maxHits) return;
            hits++;
            b.damage(u, e, atk * 1.2, 'magic', {});
            b.knock(e, ux, uy, 40);
            if (e.channeling) {
              if (e.boss) {
                b.addPosture(e, 30);
              } else {
                e.channeling = false;
                e.channelT = 0;
                b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.size, s: '技能打断!', color: '#ff4757' });
              }
            }
          });
        });
      }
    },
  },

  // 12. 钥匙傀儡 (key_golem)
  key_golem: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'key_shield', dt, 1.5, b)) {
        const cycle = u.star >= 3 ? 6 : 7;
        resetCardCd(u, 'key_shield', cycle, b);
        u.ref.stepped_in = false;
        const allies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && a.card !== u.card);
        let cardUnits: Unit[] = [];
        if (allies.length > 0) {
          // 绑定一张后排/慢卡
          const cardMap = new Map<number, Unit[]>();
          for (const a of allies) {
            const list = cardMap.get(a.card) ?? [];
            list.push(a);
            cardMap.set(a.card, list);
          }
          const cardList = Array.from(cardMap.entries());
          cardList.sort(([, u1], [, u2]) => {
            const r1 = u1.some((a) => a.row === 'back' || a.speed < 40) ? 0 : 1;
            const r2 = u2.some((a) => a.row === 'back' || a.speed < 40) ? 0 : 1;
            if (r1 !== r2) return r1 - r2;
            return (u1.reduce((s, a) => s + a.hpFrac, 0) / u1.length) - (u2.reduce((s, a) => s + a.hpFrac, 0) / u2.length);
          });
          cardUnits = cardList[0][1];
        } else {
          cardUnits = cardAllies(u, b).filter((a) => a.alive);
        }
        if (cardUnits.length > 0) {
          u.ref.protectedUnits = cardUnits;
          const shieldPct = u.star >= 3 ? 0.16 : (u.star >= 2 ? 0.13 : 0.10);
          const sourceH = cardAllies(u, b).reduce((s, a) => s + a.maxHp, 0) || u.maxHp;
          const shieldCap = sourceH * 0.30;
          const targetCardH = cardUnits.reduce((s, a) => s + a.maxHp, 0);
          const totalShield = Math.min(shieldCap, targetCardH * shieldPct);
          const perUnit = totalShield / cardUnits.length;
          for (const target of cardUnits) {
            target.addSynergyShield('key_golem_shield', perUnit, 4.0);
            if (target.slowT > 0 || target.slowMove > 0 || target.slowAtk > 0) {
              target.slowT = 0;
              target.slowMove = 0;
              target.slowAtk = 0;
              b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '净化减速!', color: '#eccc68' });
            }
            b.emit({ k: 'heal', x: target.x, y: target.y, z: target.gz + target.z + target.size });
          }
        }
      }
      // 受益卡被敌人接近 <= 60 时，傀儡沿路径补位并获得 2 秒 25% 减伤
      const prots = u.ref.protectedUnits as Unit[] | undefined;
      if (prots && prots.some((p) => p.alive) && !u.ref.stepped_in) {
        const prot = prots.find((p) => p.alive);
        if (prot) {
          const nearThreat = foesOf(u, b).some((f) => f.alive && !f.structure && dist(f, prot) <= 60);
          if (nearThreat) {
            u.ref.stepped_in = true;
            u.x = clampX(u, prot.x + (u.team === 0 ? 25 : -25));
            u.y = clampY(prot.y);
            u.takenMul *= 0.75;
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '机巧补位!', color: '#eccc68' });
            b.addTimedAction(2.0, () => {
              if (u.alive) u.takenMul /= 0.75;
            });
          }
        }
      }
    },
  },

  // 13. 登山斧兵 (mountaineer)
  mountaineer: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'chop', dt, 3.0, b)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 45) {
          resetCardCd(u, 'chop', 7, b);
          const atk = b.atkOf(u);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '蓄力劈砍!', color: '#ff4757' });
          if (u.star >= 3) {
            u.addSynergyShield('mountaineer_shield', u.maxHp * 0.08, 2.0);
          }
          b.addTimedAction(0.8, () => {
            if (!u.alive || !t.alive) return;
            if (dist(u, t) > 65) return;
            if (t.shield > 0) {
              t.shield = Math.max(0, t.shield - atk * 0.8);
            }
            if (t.boss && t.channeling) {
              b.addPosture(t, 20);
            }
            b.damage(u, t, atk * 1.3, 'phys', { melee: true });
            b.emit({ k: 'hit', x: t.x, y: t.y, z: t.gz + t.z + t.size * 0.5, big: true, color: '#ff4757' });
          });
        }
      }
    },
  },

  // 14. 丛林跃袭者 (leaper)
  leaper: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'leap', dt, 3.0, b)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          setCardCd(u, 'leap', 1.0, b);
          return;
        }
        resetCardCd(u, 'leap', 8, b);
        // 优先未受保护的远程后排
        const rangedFoes = foes.filter((f) => f.isRanged || f.row === 'back');
        const t = rangedFoes.length > 0 ? rangedFoes[rangedFoes.length - 1] : foes[foes.length - 1];
        const tx = clampX(u, t.x + (u.team === 0 ? -25 : 25));
        const ty = clampY(t.y);
        b.emit({ k: 'text', x: tx, y: ty, z: 20, s: '奇袭落点!', color: '#ffa502' });
        b.addTimedAction(0.9, () => {
          if (!u.alive || !t.alive) return;
          u.x = tx;
          u.y = ty;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '跃入奇袭!', color: '#ffa502' });
          b.emit({ k: 'boom', x: u.x, y: u.y, r: 40, color: '#ffa502', big: false });
          b.damage(u, t, b.atkOf(u) * 1.2, 'phys', { melee: true });
          if (u.star >= 3) {
            u.takenMul *= 0.80;
            b.addTimedAction(2.0, () => {
              if (u.alive) u.takenMul /= 0.80;
            });
          }
        });
      }
    },
  },

  // 15. 毒刺藤 (poison_quill_vine)
  poison_quill_vine: {
    init(u, b) {
      u.ab.burrowT = 0.3 + b.rng.range(0, 0.25);
    },
    tick(u, b, dt) {
      if (u.ab.burrowT !== undefined && u.ab.burrowT > 0) {
        u.ab.burrowT -= dt;
        if (u.ab.burrowT <= 0) {
          u.ab.burrowT = 0;
          vineBurrowToFoe(u, b);
        }
      }

      const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
      if (foes.length > 0) {
        const inReach = foes.some((f) => dist(u, f) <= b.rangeOf(u));
        if (!inReach && cool(u, 'vine_reburrow', dt, 3)) {
          vineBurrowToFoe(u, b);
        }
      }

      const t = u.target && u.target.alive ? u.target : foes[0];
      if (t && Math.abs(t.x - u.x) > 2) {
        u.facing = t.x > u.x ? 1 : -1;
      }
    },
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const dur = u.star >= 3 ? 4.5 : 3;
      b.poison(t, b.atkOf(u) * 0.35, dur, 1, u);
      if (cool(u, 'vine_poison_text', 0.1, 2)) {
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '剧毒喷吐!', color: '#2ed573' });
      }
    },
  },

  // 16. 疾风傀儡 (squall_golem)
  squall_golem: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (coolCard(u, 'squall_charge', dt, 3.0, b)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 160) {
          resetCardCd(u, 'squall_charge', 8, b);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '风暴开路!', color: '#70a1ff' });
          const atk = b.atkOf(u);
          b.addTimedAction(0.6, () => {
            if (!u.alive || u.stunT > 0 || !t.alive) return;
            u.x = clampX(u, t.x + (u.team === 0 ? -30 : 30));
            u.y = clampY(t.y);
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '风暴冲撞!', color: '#70a1ff' });
            b.damage(u, t, atk * 1.2, 'phys', { melee: true });
            b.knock(t, u.x, u.y, 35);
            if (u.star >= 3) {
              u.addSynergyShield('squall_shield', u.maxHp * 0.08, 3.0);
            }
          });
        }
      }
    },
  },

  // 17. 溺水巫师 (drowned_necromancer)
  drowned_necromancer: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      u.ref.drownedCount = u.ref.drownedCount ?? 0;
      if (u.ref.drownedCount >= 4) return;
      const initialWait = u.star >= 3 ? 2.0 : 3.0;
      if (cool(u, 'drowned_sum', dt, u.ref.drownedCount === 0 ? initialWait : 10)) {
        const aliveDrowned = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'drowned' && a.card === u.card);
        if (aliveDrowned.length < 1) {
          u.ref.drownedCount++;
          resetCd(u, 'drowned_sum', 10, b);
          const fx = u.team === 0 ? Math.min(ARENA_W - 60, u.x + 100) : Math.max(60, u.x - 100);
          const fy = clampY(u.y > ARENA_D / 2 ? u.y - 35 : u.y + 35);
          const d = b.summon(u, 'drowned', fx, fy, 1.0, { lifespan: 12, fx: 'summon' });
          if (d) {
            d.maxHp = d.hp = Math.max(15, Math.round(u.maxHp * 0.45));
            d.atk = Math.max(2, Math.round((u.atk * u.atkSpd * 0.40) / Math.max(0.1, d.atkSpd)));
          }
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '前哨溺尸!', color: '#1e90ff' });
        } else {
          u.ab.drowned_sum = 1.0;
        }
      }
    },
  },

  // 18. 红石方块 (redstone_cube)
  redstone_cube: {
    tick(u, b, dt) {
      const cdKey = `cube_roll_c${u.card}`;
      const last = b.sides[u.team].timers[cdKey] ?? -999;
      if (b.t - last >= 6 && !u.ref.charge) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t) {
          const d = dist(u, t);
          if (d >= 20 && d <= 180) {
            b.sides[u.team].timers[cdKey] = b.t;
            startCharge(u, t, 30);
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '滚石撞击!', color: '#ff4757' });
            b.emit({ k: 'sfx', id: 'ram' });
            if (u.star >= 3) {
              u.mass *= 1.43;
              b.addTimedAction(2.0, () => {
                if (u.alive) u.mass /= 1.43;
              });
            }
          }
        }
      }
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        return chargeMove(u, b, dt, { mul: 0.8, knock: 25, stun: 0.2, all: false, speed: 220 });
      }
      return false;
    },
  },

  // ───────────────────────── 首领与专属敌人 ─────────────────────────

  // 19. 无名者 (nameless_one)
  nameless_one: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      u.ref.skelWaves = u.ref.skelWaves ?? 0;
      if (u.ref.skelWaves < 3 && cool(u, 'boss_sum_skel', dt, 9)) {
        const skels = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'skeleton');
        if (skels.length < 4) {
          u.ref.skelWaves++;
          resetCd(u, 'boss_sum_skel', 9, b);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '骷髅大军!', color: '#2ed573' });
          b.summon(u, 'skeleton', u.x + (u.team === 0 ? 35 : -35), u.y - 25, 0.6, { lifespan: 10, fx: 'summon' });
          b.summon(u, 'skeleton', u.x + (u.team === 0 ? 35 : -35), u.y + 25, 0.6, { lifespan: 10, fx: 'summon' });
        }
      }
      if (u.channeling) return;
      if (u.hp / u.maxHp < 0.5 && cool(u, 'boss_soul_barrage', dt, u.ref.soul_barrage_init ? 10 : 0)) {
        u.ref.soul_barrage_init = true;
        resetCd(u, 'boss_soul_barrage', 10, b);
        u.channeling = true;
        u.channelT = 2.4;
        u.posture = 0;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '死者魂弹蓄势中...', color: '#00d2d3' });
        b.addTimedAction(2.4, () => {
          if (!u.alive || u.stunT > 0 || !u.channeling) return;
          u.channeling = false;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '死者魂弹爆发!', color: '#00d2d3' });
          const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
          for (let i = 0; i < Math.min(3, foes.length); i++) {
            const f = foes[i];
            b.addDelayed({
              t: 0.5,
              x: f.x,
              y: f.y,
              r: 45,
              dmg: b.atkOf(u) * 0.75,
              team: u.team,
              src: u,
              kind: 'slash',
            });
          }
        });
      }
    },
  },

  // 20. 红石巨兽 (redstone_monstrosity)
  redstone_monstrosity: {
    tick(u, b, dt) {
      if (u.channeling) return;
      if (cool(u, 'boss_ground_slam', dt, 8)) {
        resetCd(u, 'boss_ground_slam', 8, b);
        u.channeling = true;
        u.channelT = 2.4;
        u.posture = 0;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔炉重震蓄势中...', color: '#ff3838' });
        b.addTimedAction(2.4, () => {
          if (!u.alive || u.stunT > 0 || !u.channeling) return;
          u.channeling = false;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔炉重震爆发!', color: '#ff3838' });
          b.emit({ k: 'boom', x: u.x, y: u.y, r: 90, color: '#ff3838', big: true });
          b.emit({ k: 'shake', a: 8 });
          b.aoe(u.x, u.y, 90, u.team, (e) => {
            b.damage(u, e, b.atkOf(u) * 1.5, 'phys', { melee: true });
            b.knock(e, u.x, u.y, 40);
          });
        });
      }
      const hpFrac = u.hp / u.maxHp;
      if (hpFrac <= 0.6 && !u.ref.vent60 && (!u.ref.lastVentT || b.t - u.ref.lastVentT >= 2.0)) {
        u.ref.vent60 = true;
        u.ref.lastVentT = b.t;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔岩喷口预警!', color: '#e67e22' });
        b.addTimedAction(1.0, () => {
          if (!u.alive) return;
          b.addZone({ x: u.x - 40, y: u.y - 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
          b.addZone({ x: u.x + 40, y: u.y + 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
        });
      }
      if (hpFrac <= 0.3 && !u.ref.vent30 && (!u.ref.lastVentT || b.t - u.ref.lastVentT >= 2.0)) {
        u.ref.vent30 = true;
        u.ref.lastVentT = b.t;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔岩喷发预警!', color: '#e67e22' });
        b.addTimedAction(1.0, () => {
          if (!u.alive) return;
          b.addZone({ x: u.x - 40, y: u.y + 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
          b.addZone({ x: u.x + 40, y: u.y - 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
        });
      }
    },
  },

  // 21. 腐化坩埚 (corrupted_cauldron)
  corrupted_cauldron: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (cool(u, 'acid_spit', dt, 7)) {
        resetCd(u, 'acid_spit', 7, b);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '酸蚀预警!', color: '#2ed573' });
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        const targets = foes.slice(0, 3);
        b.addTimedAction(1.0, () => {
          if (!u.alive) return;
          for (const f of targets) {
            b.addZone({ x: f.x, y: f.y, r: 35, dur: 3, dps: b.atkOf(u) * 0.15, kind: 'goo', team: u.team, src: u });
          }
        });
      }
      u.ref.slimeWaves = u.ref.slimeWaves ?? 0;
      if (u.ref.slimeWaves < 3 && cool(u, 'slime_spawn', dt, 10)) {
        const count = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'slime').length;
        if (count < 4) {
          u.ref.slimeWaves++;
          resetCd(u, 'slime_spawn', 10, b);
          b.summon(u, 'slime', u.x + (u.team === 0 ? 30 : -30), u.y - 20, 0.4, { lifespan: 12, fx: 'summon' });
          b.summon(u, 'slime', u.x + (u.team === 0 ? 30 : -30), u.y + 20, 0.4, { lifespan: 12, fx: 'summon' });
        } else {
          u.ab.slime_spawn = 3.0;
        }
      }
    },
  },

  // 22. 风暴傀儡 (tempest_golem)
  tempest_golem: {
    init(u, b) {
      b.summon(u, 'tempest_pillar', u.x, u.y - 60, 1, { fx: 'summon' });
      b.summon(u, 'tempest_pillar', u.x, u.y + 60, 1, { fx: 'summon' });
    },
    tick(u, b, dt) {
      const pillars = alliesOf(u, b).filter((a) => a.alive && a.mob.id === 'tempest_pillar');
      u.takenMul = Math.max(0.7, 1 - pillars.length * 0.1);
      if (u.channeling) return;
      if (cool(u, 'tempest_lightning', dt, 8)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length > 0) {
          u.ab.tempest_lightning = 8;
          u.channeling = true;
          u.channelT = 2.4;
          u.posture = 0;
          const t = foes[0];
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '风暴天雷蓄势中...', color: '#70a1ff' });
          b.addTimedAction(2.4, () => {
            if (!u.alive || u.stunT > 0 || !u.channeling || !t.alive) return;
            b.emit({ k: 'text', x: t.x, y: t.y, z: 30, s: '风暴神雷爆发!', color: '#70a1ff' });
            b.lightning(u, t.x, t.y, b.atkOf(u) * 1.6, 50);
          });
        } else {
          u.ab.tempest_lightning = 1.0;
        }
      }
    },
  },

  // 23. 复仇之心 (vengeful_heart)
  vengeful_heart: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (u.channeling) return;
      const cd = u.hp / u.maxHp < 0.5 ? 7 : 9;
      if (cool(u, 'void_strike', dt, cd) && !u.ref.charge) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length > 0) {
          u.ab.void_strike = cd;
          u.channeling = true;
          u.channelT = 2.4;
          u.posture = 0;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '虚空泯灭蓄势中...', color: '#9b59b6' });
          b.addTimedAction(2.4, () => {
            if (!u.alive || u.stunT > 0 || !u.channeling) return;
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '虚空泯灭爆发!', color: '#9b59b6' });
            for (let i = 0; i < Math.min(2, foes.length); i++) {
              const f = foes[i];
              if (f.alive) {
                b.addZone({ x: f.x, y: f.y, r: 45, dur: 4, dps: b.atkOf(u) * 0.3, kind: 'goo', team: u.team, src: u });
              }
            }
          });
        } else {
          u.ab.void_strike = 1.0;
        }
      }
      // 阶段转换与冲撞：生命低于 65% 或 30% 时各冲撞突进一次
      const hpFrac = u.hp / u.maxHp;
      if (hpFrac <= 0.65 && !u.ref.charge65) {
        u.ref.charge65 = true;
        const target = foesOf(u, b).find((f) => f.alive && !f.structure);
        if (target) {
          startCharge(u, target, 40);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '虚空冲撞!', color: '#9b59b6' });
          b.emit({ k: 'sfx', id: 'ram' });
        }
      }
      if (hpFrac <= 0.30 && !u.ref.charge30) {
        u.ref.charge30 = true;
        const target = foesOf(u, b).find((f) => f.alive && !f.structure);
        if (target) {
          startCharge(u, target, 40);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '终焉冲撞!', color: '#ff4757' });
          b.emit({ k: 'sfx', id: 'ram' });
        }
      }
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        return chargeMove(u, b, dt, { mul: 1.5, knock: 45, stun: 0.3, all: true, speed: 220 });
      }
      return false;
    },
  },

  // 24. 远古石卫 (ancient_warden)
  ancient_warden: {
    tick(u, b, dt) {
      if (cool(u, 'warden_shield', dt, 9)) {
        resetCd(u, 'warden_shield', 9, b);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '远古坚甲!', color: '#95a5a6' });
        u.addSynergyShield('warden_shield', u.maxHp * 0.12, 4.0);
        b.slow(u, 0.2, 0, 4);
      }
      if (u.channeling) return;
      if (cool(u, 'warden_strike', dt, 6)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 45) {
          resetCd(u, 'warden_strike', 6, b);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '重斧蓄势!', color: '#e74c3c' });
          b.addTimedAction(0.8, () => {
            if (!u.alive || u.stunT > 0 || !t.alive) return;
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '远古重击!', color: '#e74c3c' });
            b.damage(u, t, b.atkOf(u) * 1.3, 'phys', { melee: true });
          });
        }
      }
    },
  },

  // ───────────────────────── 结构与召唤物 ─────────────────────────

  // 治疗图腾 (healing_totem_unit)
  healing_totem_unit: {
    move() {
      return true;
    },
    tick(u, b, dt) {
      if (cool(u, 'heal_tick', dt, 1)) {
        u.ab.heal_tick = 1;
        const r = u.ref.totemR ?? 100;
        const allies = alliesOf(u, b).filter(
          (a) => a.alive && !a.structure && dist(u, a) <= r
        );
        if (allies.length === 0) return;
        allies.sort((a1, a2) => a1.hp / a1.maxHp - a2.hp / a2.maxHp);
        for (let i = 0; i < Math.min(3, allies.length); i++) {
          const a = allies[i];
          b.heal(a, a.maxHp * 0.04, u);
          b.emit({ k: 'heal', x: a.x, y: a.y, z: a.gz + a.z + a.size });
        }
      }
    },
  },

  // 便携蜂巢 (buzzy_nest_unit)
  buzzy_nest_unit: {
    move() {
      return true;
    },
    tick(u, b, dt) {
      u.ref.beeCount = u.ref.beeCount ?? 0;
      if (cool(u, 'bee_spawn', dt, 3)) {
        u.ab.bee_spawn = 3;
        const bees = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'bee');
        if (bees.length < 2) {
          u.ref.beeCount++;
          b.summon(u, 'bee', u.x, u.y, 0.5, { lifespan: 6, fx: 'summon' });
        }
      }
    },
  },

  // 岩柱与风柱 (geomancer_pillar)
  geomancer_pillar: {
    move() {
      return true;
    },
  },
};
