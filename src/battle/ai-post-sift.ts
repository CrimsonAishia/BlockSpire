import type { Battle } from './sim.ts';
import { ARENA_D, ARENA_W, type Unit } from './unit.ts';
import { chargeMove, cool, dist, foesOf, fire, resetCd, startCharge, type Behavior } from './ai.ts';
import { mobDef, starPower } from '../data/mobs.ts';

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

export const POST_SIFT_BEHAVIORS: Record<string, Behavior> = {
  // 1. 幼年僵尸 (baby_zombie)
  baby_zombie: {
    target(u, b) {
      const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
      const backliners = foes.filter((f) => f.mob.defaultRow === 'back');
      if (backliners.length > 0) {
        return backliners.reduce((best, f) => (dist(u, f) < dist(u, best) ? f : best), backliners[0]);
      }
      return b.findTarget(u);
    },
    tick(u, b, dt) {
      if (u.ab.killRefund) u.ab.killRefund = Math.max(0, u.ab.killRefund - dt);
      // 首次接敌短冲刺
      if (!u.ab.firstEngage && !u.ref.charge) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t) {
          const d = dist(u, t);
          if (d >= 20 && d <= 100) {
            u.ab.firstEngage = 1;
            startCharge(u, t, 15);
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '幼尸突刺!', color: '#2ed573' });
            b.emit({ k: 'sfx', id: 'ram' });
          }
        }
      }
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        return chargeMove(u, b, dt, { mul: u.star >= 3 ? 1.5 : 1.0, knock: 20, stun: 0.1, all: false, speed: 260 });
      }
      return false;
    },
    onKill(u, _v, b) {
      if (cool(u, 'killRefund', 0, 0)) {
        u.atkTimer = Math.max(0, u.atkTimer - u.cd * (u.star >= 3 ? 0.6 : 0.4));
        u.ab.killRefund = 3;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '连杀加速!', color: '#2ed573' });
      }
    },
  },

  // 2. 洞穴蝙蝠 (bat)
  bat: {
    target(u, b) {
      const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
      const casters = foes.filter((f) => f.mob.role === 'caster' || f.channeling || f.animAtk > 0);
      if (casters.length > 0) {
        return casters.reduce((best, f) => (dist(u, f) < dist(u, best) ? f : best), casters[0]);
      }
      return b.findTarget(u);
    },
    onHit(u, t, _d, b) {
      t.ref.batMarked = b.t + 5.0;
      u.ab.bites = (u.ab.bites ?? 0) + 1;
      if (u.ab.bites >= 2 && cool(u, 'interruptCd', 0, 0)) {
        u.ab.bites = 0;
        u.ab.interruptCd = u.star >= 3 ? 3.5 : 5;
        if (t.boss) {
          b.addPosture(t, u.star >= 3 ? 35 : 25);
          b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: `破势 +${u.star >= 3 ? 35 : 25}!`, color: '#ff4757' });
        } else {
          t.stunT = Math.max(t.stunT, 0.35);
          b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '打断!', color: '#70a1ff' });
        }
      }
    },
    tick(u, _b, dt) {
      if (u.ab.interruptCd) u.ab.interruptCd = Math.max(0, u.ab.interruptCd - dt);
    },
  },

  // 3. 雪狐 (snow_fox)
  snow_fox: {
    init(u, b) {
      if (!isCardLead(u, b)) return;
      const targets = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && (a.mob.role === 'melee' || a.mob.role === 'tank') && a.card !== u.card);
      const seenCards = new Set<number>();
      const cardTargets: Unit[] = [];
      for (const t of targets) {
        if (!seenCards.has(t.card) && seenCards.size < 2) {
          seenCards.add(t.card);
          cardTargets.push(t);
        }
      }
      for (const t of cardTargets) {
        t.ref.terrainSlowResist = 0.5;
        const spdBonus = 0.35;
        t.moveSpd += spdBonus;
        b.addTimedAction(6.0, () => {
          t.moveSpd -= spdBonus;
          delete t.ref.terrainSlowResist;
        });
      }
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      const cd = u.star >= 3 ? 6 : (u.star === 2 ? 7 : 8);
      if (cool(u, 'cleanseCd', dt, 2)) {
        const targets = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && (a.mob.role === 'melee' || a.mob.role === 'tank') && a.card !== u.card);
        const seenCards = new Set<number>();
        const cardTargets: Unit[] = [];
        for (const t of targets) {
          if (!seenCards.has(t.card) && seenCards.size < 2) {
            seenCards.add(t.card);
            cardTargets.push(t);
          }
        }
        if (cardTargets.length > 0) {
          u.ab.cleanseCd = cd;
          const hasteBonus = u.star >= 3 ? 1.35 : (u.star === 2 ? 1.30 : 1.25);
          for (const t of cardTargets) {
            for (const member of alliesOf(u, b).filter((a) => a.alive && a.card === t.card)) {
              if (member.slowT > 0) {
                if (u.star >= 3) member.slowT = 0;
                else member.slowT *= 0.5;
              }
              if (!member.ref.foxEngaged) {
                member.ref.foxEngaged = true;
                member.atkTimer = Math.max(0, member.atkTimer - member.cd * 0.40);
              }
              member.speedT = Math.max(member.speedT, 4.0);
              member.speedMul = Math.max(member.speedMul, hasteBonus);
              member.ref.terrainSlowResist = 0.5;
              b.addTimedAction(4.0, () => {
                delete member.ref.terrainSlowResist;
              });
              if (u.star >= 3) {
                const shieldAmt = Math.min(u.maxHp * 0.30, member.maxHp * 0.10);
                member.addSynergyShield('snow_fox_shield', shieldAmt, 4.0);
              }
            }
            b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '踏雪引路!', color: '#70a1ff' });
          }
        } else {
          u.ab.cleanseCd = 0;
        }
      }
    },
  },

  // 4. 杰克南瓜灯 (pumpkin_turret)
  pumpkin_turret: {
    attack(u, t, b) {
      const shots = u.star >= 3 ? 4 : 3;
      for (let i = 0; i < shots; i++) {
        fire(u, t, b, 'fireball', u.atk * 0.45, (p) => {
          p.burn = u.atk * (u.star >= 3 ? 0.4 : 0.2);
          p.burnDur = u.star >= 3 ? 4 : 2;
        }, { spread: (i - (shots - 1) / 2) * 0.08 });
      }
    },
  },

  // 5. 乌鸦 (raven)
  raven: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      const cd = u.star >= 3 ? 6 : (u.star === 2 ? 7 : 8);
      if (cool(u, 'markCd', dt, 2)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length > 0) {
          foes.sort((a, c) => {
            const scoreC = (c.boss ? 20 : 0) + (c.channeling ? 15 : 0) + (c.mob.role === 'caster' ? 10 : 0) + (c.animAtk > 0 ? 5 : 0);
            const scoreA = (a.boss ? 20 : 0) + (a.channeling ? 15 : 0) + (a.mob.role === 'caster' ? 10 : 0) + (a.animAtk > 0 ? 5 : 0);
            return scoreC - scoreA;
          });
          const targets = foes.slice(0, 2);
          u.ab.markCd = cd;
          const factor = u.star >= 3 ? 0.15 : (u.star === 2 ? 0.12 : 0.10);
          const otherCards = new Map<number, number>();
          for (const a of alliesOf(u, b)) {
            if (a.alive && !a.structure && !a.isSummon && a.card !== u.card) {
              const dps = a.dps || (a.atk / Math.max(0.2, a.cd));
              otherCards.set(a.card, (otherCards.get(a.card) ?? 0) + dps);
            }
          }
          const allyCards = Array.from(otherCards.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([c]) => c);
          for (const target of targets) {
            if (target.channeling && target.channelT > 0) {
              if (target.cast) b.extendCast(target, 0.4);
              else target.channelT += 0.4;
            }
            target.atkTimer += 0.4;
            target.ref.scouted = b.t + 5.0;
            target.ref.ravenMarked = {
              factor,
              timer: 5.0,
              src: u,
              boundCards: allyCards.length > 0 ? allyCards : [u.card],
              triggered: false,
            };
            if (target.boss) {
              b.addPosture(target, u.star >= 3 ? 30 : (u.star === 2 ? 25 : 20));
              b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: `破势 +${u.star >= 3 ? 30 : (u.star === 2 ? 25 : 20)}!`, color: '#ff4757' });
            } else {
              target.stunT = Math.max(target.stunT, 0.4);
              b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '侦察打断!', color: '#ff4757' });
            }
          }
        } else {
          u.ab.markCd = 0;
        }
      }
    },
  },

  // 6. 丛林僵尸 (jungle_zombie)
  jungle_zombie: {
    onHit(u, t, _d, b) {
      u.ab.poisonHits = (u.ab.poisonHits ?? 0) + 1;
      const need = u.star >= 3 ? 2 : 3;
      if (u.ab.poisonHits >= need) {
        u.ab.poisonHits = 0;
        b.poison(t, u.atk * 0.15, 4, 1, u);
        if (u.star >= 3) b.slow(t, 0.15, 0.15, 3.0);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '丛林剧毒!', color: '#2ed573' });
      }
    },
  },

  // 7. 鸡骑士 (chicken_jockey)
  chicken_jockey: {
    tick(u, b, dt) {
      if (cool(u, 'kickCd', dt, 2)) {
        const target = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && dist(u, f) < 40);
        if (target) {
          u.ab.kickCd = u.star >= 3 ? 6 : 7;
          if (target.boss) {
            b.addPosture(target, 25);
            b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '破势 +25!', color: '#ff4757' });
          } else {
            b.knock(target, u.x, u.y, 40);
            if (u.star >= 3) target.stunT = Math.max(target.stunT, 0.5);
            b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '飞羽旋踢!', color: '#ffa502' });
          }
        } else {
          u.ab.kickCd = 0;
        }
      }
    },
  },

  // 8. 哞菇 (mooshroom)
  mooshroom: {
    tick(u, b, dt) {
      if (cool(u, 'hornCd', dt, 2) && !u.ref.charge) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 80) {
          u.ab.hornCd = 8;
          u.ab.charging = 0.6;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '重角蓄势!', color: '#ff6348' });
        } else {
          u.ab.hornCd = 0;
        }
      }
      if (u.ab.charging > 0) {
        u.ab.charging -= dt;
        if (u.ab.charging <= 0) {
          const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
          if (t) {
            startCharge(u, t, 25);
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '重角冲撞!', color: '#ff4757' });
            b.emit({ k: 'sfx', id: 'ram' });
          }
        }
      }
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        return chargeMove(u, b, dt, { mul: 1.6, knock: 35, stun: 0.15, all: true, speed: 210 });
      }
      return false;
    },
  },

  // 9. 速生藤蔓 (quick_vine)
  quick_vine: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      const cd = u.star >= 3 ? 6 : (u.star === 2 ? 7 : 8);
      if (cool(u, 'wallCd', dt, 2)) {
        const backAllies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && a.mob.defaultRow === 'back');
        const threatened = backAllies.find((a) => foesOf(u, b).some((f) => f.alive && !f.isRanged && dist(a, f) <= 80));
        if (threatened) {
          u.ab.wallCd = cd;
          const shieldPct = u.star >= 3 ? 0.50 : (u.star === 2 ? 0.45 : 0.40);
          const dur = u.star >= 3 ? 4.0 : (u.star === 2 ? 3.5 : 3.0);
          const targetCards = new Set<number>([threatened.card]);
          for (const a of backAllies) {
            if (targetCards.size < 2) targetCards.add(a.card);
          }
          const wholeCardHp = u.mob.hp * starPower(u.mob, u.star);
          const shieldPerCard = (wholeCardHp * shieldPct) / targetCards.size;
          for (const cardId of targetCards) {
            const members = backAllies.filter((a) => a.card === cardId);
            for (const m of members) {
              m.addSynergyShield('vine_wall', shieldPerCard / members.length, dur);
            }
          }
          b.aoe(threatened.x, threatened.y, 50, u.team, (f) => {
            if (!f.boss) {
              b.knock(f, threatened.x, threatened.y, 35);
              if (u.star >= 3) f.stunT = Math.max(f.stunT, 0.5);
            }
          });
          b.emit({ k: 'boom', x: threatened.x, y: threatened.y, r: 40, color: '#2ed573', big: false });
          b.emit({ k: 'text', x: threatened.x, y: threatened.y, z: threatened.gz + 40, s: '根墙生起!', color: '#2ed573' });
        } else {
          u.ab.wallCd = 0;
        }
      }
    },
  },

  // 10. 红蓝鹦鹉 (parrot)
  parrot: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (cool(u, 'signalCd', dt, 2)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length > 0) {
          u.ab.signalCd = 6;
          foes.sort((a, c) => {
            const scoreC = (c.boss ? 30 : 0) + (c.channeling ? 25 : 0) + (c.threat || (c.atk / Math.max(0.2, c.cd)));
            const scoreA = (a.boss ? 30 : 0) + (a.channeling ? 25 : 0) + (a.threat || (a.atk / Math.max(0.2, a.cd)));
            return scoreC - scoreA;
          });
          const target = foes[0];
          const factor = u.star >= 3 ? 0.35 : (u.star === 2 ? 0.30 : 0.25);
          const otherCards = new Map<number, number>();
          for (const a of alliesOf(u, b)) {
            if (a.alive && !a.structure && !a.isSummon && a.card !== u.card) {
              const dps = a.dps || (a.atk / Math.max(0.2, a.cd));
              otherCards.set(a.card, (otherCards.get(a.card) ?? 0) + dps);
            }
          }
          const boundCards = Array.from(otherCards.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([c]) => c);
          target.ab.focused = 5;
          target.ref.parrotMarked = {
            factor,
            timer: 5.0,
            src: u,
            boundCards,
            transferred: false,
          };
          for (const cardId of boundCards) {
            for (const a of alliesOf(u, b).filter((m) => m.alive && m.card === cardId)) {
              a.atkTimer = Math.max(0, a.atkTimer - a.cd * 0.25);
            }
          }
          b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '协同标记!', color: '#ff4757' });
        } else {
          u.ab.signalCd = 0;
        }
      }
    },
  },

  // 11. 豹猫 (ocelot)
  ocelot: {
    target(u, b) {
      const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
      const creepers = foes.filter((f) => f.mob.id === 'creeper');
      if (creepers.length > 0) {
        return creepers.reduce((best, f) => (dist(u, f) < dist(u, best) ? f : best), creepers[0]);
      }
      return b.findTarget(u);
    },
    tick(u, b, dt) {
      if (cool(u, 'pounceCd', dt, 2) && !u.ref.charge) {
        const backAllies = alliesOf(u, b).filter((a) => a.alive && a.mob.defaultRow === 'back');
        const threat = foesOf(u, b).find((f) => f.alive && !f.boss && !f.structure && backAllies.some((a) => dist(a, f) <= 70));
        if (threat && dist(u, threat) <= 120) {
          u.ab.pounceCd = 7;
          startCharge(u, threat, 10);
          threat.atkTimer = Math.max(threat.atkTimer, 0.5);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '迅伏飞扑!', color: '#ffa502' });
          b.emit({ k: 'sfx', id: 'ram' });
        } else {
          u.ab.pounceCd = 0;
        }
      }
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        return chargeMove(u, b, dt, { mul: 1.3, knock: 15, stun: 0.2, all: false, speed: 280 });
      }
      return false;
    },
    onHit(u, t, _d, b) {
      if (t.mob.id === 'creeper') {
        t.atkTimer = Math.max(t.atkTimer, u.star >= 3 ? 1.8 : 1.0);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '威慑自爆!', color: '#ffa502' });
      }
    },
  },

  // 12. 熊猫 (panda)
  panda: {
    tick(u, b, dt) {
      if (u.ab.rollCd) u.ab.rollCd = Math.max(0, u.ab.rollCd - dt);
      if (!u.ref.pandaBoundAlly || !u.ref.pandaBoundAlly.alive) {
        const backAllies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && a.card !== u.card && a.mob.defaultRow === 'back');
        if (backAllies.length > 0) {
          u.ref.pandaBoundAlly = backAllies[0];
          backAllies[0].ref.pandaGuardian = u;
        }
      }
      if (u.ref.pandaBoundAlly && u.ref.pandaBoundAlly.alive && u.ref.pandaBoundAlly.hp < u.ref.pandaBoundAlly.maxHp * 0.5) {
        if ((!u.ab.rollCd || u.ab.rollCd <= 0) && (u.ab.rollCount ?? 0) < 2) {
          u.ab.rollCount = (u.ab.rollCount ?? 0) + 1;
          u.ab.rollCd = u.star >= 3 ? 7 : 8;
          u.x = Math.max(u.radius, Math.min(ARENA_W - u.radius, u.ref.pandaBoundAlly.x + (u.team === 0 ? 15 : -15)));
          u.y = Math.max(10, Math.min(ARENA_D - 10, u.ref.pandaBoundAlly.y));
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: u.x, y2: u.y, z: u.gz });
          const shieldAmt = Math.min(u.maxHp * 0.30, u.ref.pandaBoundAlly.maxHp * 0.12);
          u.ref.pandaBoundAlly.addSynergyShield('panda_shield', shieldAmt, 3.0);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size + 10, s: '翻滚救援!', color: '#eccc68' });
        }
      }
    },
  },

  // 13. 巨兽藤蔓 (abomination_vine)
  abomination_vine: {
    tick(u, b, dt) {
      if (cool(u, 'burrowCd', dt, 2)) {
        const foes = foesOf(u, b).filter((f) => f.alive && dist(u, f) <= 80).slice(0, 2);
        if (foes.length > 0) {
          u.ab.burrowCd = 6;
          for (const f of foes) {
            let mul = 1.8;
            if (b.has(u.team, 'combo_vine_colony') && (f.stunT > 0 || f.slowT > 0 || f.ref.charge || f.animAtk > 0)) {
              const tm = b.sides[u.team].timers;
              if (!tm.vine_colony_cd || b.t >= tm.vine_colony_cd) {
                tm.vine_colony_cd = b.t + 7.0;
                mul = 2.25;
                b.emit({ k: 'text', x: f.x, y: f.y, z: f.gz + 40, s: '藤巢重击 225%!', color: '#2ed573' });
              }
            }
            b.damage(u, f, u.atk * mul, 'phys');
            b.emit({ k: 'boom', x: f.x, y: f.y, r: 25, color: '#2ed573', big: false });
          }
        } else {
          u.ab.burrowCd = 0;
        }
      }
    },
  },

  // 14. 沉没骷髅 (sunken_skeleton)
  sunken_skeleton: {
    attack(u, t, b) {
      u.ab.shots = (u.ab.shots ?? 0) + 1;
      const isSlowShot = u.ab.shots % (u.star >= 3 ? 2 : 3) === 0;
      fire(u, t, b, 'bolt', u.atk, (p) => {
        if (isSlowShot) {
          p.slowDur = 3.0;
        }
      });
      if (isSlowShot && t.boss) {
        b.addPosture(t, u.star >= 3 ? 30 : 20);
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: `破势 +${u.star >= 3 ? 30 : 20}!`, color: '#ff4757' });
      }
    },
  },

  // 15. 热带史莱姆 (tropical_slime)
  tropical_slime: {
    tick(u, b, dt) {
      if (!u.ab.isChild && cool(u, 'jumpCharge', dt, 2) && !u.ref.charge) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 90 && dist(u, t) >= 20) {
          u.ab.jumpCharge = 6;
          startCharge(u, t, 15);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '弹跳冲撞!', color: '#2ed573' });
          b.emit({ k: 'sfx', id: 'ram' });
        } else {
          u.ab.jumpCharge = 0;
        }
      }
    },
    move(u, b, dt) {
      if (u.ref.charge) {
        return chargeMove(u, b, dt, { mul: 1.2, knock: 25, stun: 0.1, all: false, speed: 180 });
      }
      return false;
    },
    onDeath(u, b) {
      if (u.ab.isChild) return;
      for (const offset of [-15, 15]) {
        const child = b.summon(u, 'tropical_slime', u.x, u.y + offset, u.star >= 3 ? 0.35 : 0.25, { lifespan: 8, fx: 'summon' });
        if (child) {
          child.ab.isChild = 1;
          child.atk = Math.round(u.atk * 0.5);
        }
      }
      b.emit({ k: 'boom', x: u.x, y: u.y, r: 30, color: '#2ed573', big: false });
    },
  },

  // 16. 河豚 (pufferfish)
  pufferfish: {
    tick(u, b, dt) {
      if (cool(u, 'pufferPoisonCd', dt, 1.0)) {
        u.ab.pufferPoisonCd = 1.0;
        const nearFoes = foesOf(u, b).filter((f) => f.alive && dist(u, f) <= (u.star >= 3 ? 55 : 45));
        if (nearFoes.length > 0) {
          for (const f of nearFoes) {
            b.poison(f, u.atk * 0.18, 2, 1, u);
            if (u.star >= 3) b.slow(f, 0.2, 0.1, 1.5);
          }
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '接触刺毒!', color: '#2ed573' });
        }
      }
    },
    onDeath(u, b) {
      b.aoe(u.x, u.y, 60, u.team, (foe) => {
        b.poison(foe, u.atk * 0.25, 2, 1, u);
      });
      b.emit({ k: 'boom', x: u.x, y: u.y, r: 40, color: '#2ed573', big: false });
    },
  },

  // 17. 发光鱿鱼 (glow_squid)
  glow_squid: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      const cd = u.star >= 3 ? 6 : (u.star === 2 ? 7 : 8);
      if (cool(u, 'inkCd', dt, 2)) {
        const allies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon);
        const threatUnit = [u, ...allies].find((a) =>
          foesOf(u, b).some((f) => f.alive && (dist(a, f) <= 60 || (f.boss && f.channeling && dist(a, f) <= 120)))
        );
        if (threatUnit) {
          u.ab.inkCd = cd;
          const dur = u.star >= 3 ? 4.0 : (u.star === 2 ? 3.5 : 3.0);
          b.emit({ k: 'boom', x: threatUnit.x, y: threatUnit.y, r: 50, color: '#1e90ff', big: false });
          b.emit({ k: 'text', x: threatUnit.x, y: threatUnit.y, z: threatUnit.gz + 30, s: '荧光盲墨!', color: '#1e90ff' });
          b.aoe(threatUnit.x, threatUnit.y, 60, u.team, (f) => {
            if (f.boss && f.channeling && !f.ref.squidPoised) {
              f.ref.squidPoised = true;
              b.addPosture(f, 25);
              b.emit({ k: 'text', x: f.x, y: f.y, z: f.gz + f.size, s: '破势 +25!', color: '#ff4757' });
            } else {
              f.weakT = Math.max(f.weakT, dur);
              f.weakMul = Math.max(f.weakMul, 0.25);
            }
          });
        } else {
          u.ab.inkCd = 0;
        }
      }
    },
    onDamaged(u, _src, _o, b) {
      const lead = cardAllies(u, b)[0] || u;
      if (cool(lead, 'inkCd', 0, 0)) {
        const cd = u.star >= 3 ? 6 : (u.star === 2 ? 7 : 8);
        const dur = u.star >= 3 ? 4.0 : (u.star === 2 ? 3.5 : 3.0);
        lead.ab.inkCd = cd;
        b.emit({ k: 'boom', x: u.x, y: u.y, r: 50, color: '#1e90ff', big: false });
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + 30, s: '荧光盲墨!', color: '#1e90ff' });
        b.aoe(u.x, u.y, 60, u.team, (f) => {
          if (f.boss && f.channeling && !f.ref.squidPoised) {
            f.ref.squidPoised = true;
            b.addPosture(f, 25);
            b.emit({ k: 'text', x: f.x, y: f.y, z: f.gz + f.size, s: '破势 +25!', color: '#ff4757' });
          } else {
            f.weakT = Math.max(f.weakT, dur);
            f.weakMul = Math.max(f.weakMul, 0.25);
          }
        });
      }
      return false;
    },
  },

  // 18. 金色美西螈 (gold_axolotl)
  gold_axolotl: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      const cd = u.star >= 3 ? 5 : 6;
      if (cool(u, 'healCd', dt, 2)) {
        const hurtAllies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && a.hp < a.maxHp);
        if (hurtAllies.length > 0) {
          const seenCards = new Set<number>();
          const cardLeads: Unit[] = [];
          hurtAllies.sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp);
          for (const a of hurtAllies) {
            if (!seenCards.has(a.card) && seenCards.size < 2) {
              seenCards.add(a.card);
              cardLeads.push(a);
            }
          }
          u.ab.healCd = cd;
          const pct = u.star >= 3 ? 0.16 : (u.star === 2 ? 0.12 : 0.10);
          const wholeCardHp = u.mob.hp * starPower(u.mob, u.star);
          const maxSourceHeal = wholeCardHp * 0.35;
          let firstCard = true;
          for (const lead of cardLeads) {
            const members = alliesOf(u, b).filter((a) => a.alive && a.card === lead.card);
            const totalTargetH = members.reduce((sum, m) => sum + m.maxHp, 0);
            const cardHealBudget = Math.min(maxSourceHeal, totalTargetH * pct);
            const totalMissing = members.reduce((sum, m) => sum + Math.max(0, m.maxHp - m.hp), 0);
            for (const m of members) {
              const share = totalMissing > 0 ? Math.max(0, m.maxHp - m.hp) / totalMissing : 1 / members.length;
              b.heal(m, cardHealBudget * share, u);
              if (firstCard) {
                if (m.poisonT > 0) m.poisonT = 0;
                else if (m.burnT > 0) m.burnT = 0;
              }
              if (u.star >= 3) {
                m.addSynergyShield('axolotl_shield', m.maxHp * 0.10, 3.0);
              }
            }
            firstCard = false;
            b.emit({ k: 'text', x: lead.x, y: lead.y, z: lead.gz + lead.size, s: '灵鳃治愈!', color: '#eccc68' });
          }
        } else {
          u.ab.healCd = 0;
        }
      }
    },
  },

  // 19. 海龟 (turtle)
  turtle: {
    tick(u, b, dt) {
      if (cool(u, 'shellCd', dt, 2)) {
        u.ab.shellCd = 8;
        u.ab.shellOpenT = 4.0;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '坚壳展开!', color: '#2ed573' });
      }
      if (u.ab.shellOpenT) u.ab.shellOpenT = Math.max(0, u.ab.shellOpenT - dt);
    },
  },

  // 20. 海豚 (dolphin)
  dolphin: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      const cd = u.star >= 3 ? 6 : (u.star === 2 ? 7 : 8);
      if (cool(u, 'escortCd', dt, 2)) {
        const meleeAllies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && (a.mob.role === 'melee' || a.mob.role === 'tank') && a.card !== u.card);
        const seenCards = new Set<number>();
        const cardTargets: Unit[] = [];
        for (const a of meleeAllies) {
          if (!seenCards.has(a.card) && seenCards.size < 2) {
            seenCards.add(a.card);
            cardTargets.push(a);
          }
        }
        if (cardTargets.length > 0) {
          u.ab.escortCd = cd;
          const hasteBonus = u.star >= 3 ? 1.35 : (u.star === 2 ? 1.30 : 1.25);
          const advanceRatio = u.star >= 3 ? 0.50 : (u.star === 2 ? 0.40 : 0.30);
          for (const target of cardTargets) {
            for (const member of alliesOf(u, b).filter((a) => a.alive && a.card === target.card)) {
              member.speedT = Math.max(member.speedT, 4.0);
              member.speedMul = Math.max(member.speedMul, hasteBonus);
              member.ref.dolphinEscort = { advanceRatio, roundUsed: false, expireAt: b.t + 4.0 };
            }
            b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '破浪护送!', color: '#70a1ff' });
          }
        } else {
          u.ab.escortCd = 0;
        }
      }
    },
  },

  // 21. 猪灵弩手 (piglin_hunter)
  piglin_hunter: {
    attack(u, t, b) {
      fire(u, t, b, 'arrow', u.atk, undefined, { pierce: u.star >= 3 ? 2 : 1 });
    },
  },

  // 22. 猪灵剑士 (piglin_swordsman)
  piglin_swordsman: {
    onHit(u, _t, _d, _b) {
      u.ab.hits = (u.ab.hits ?? 0) + 1;
      if (u.ab.hits >= (u.star >= 3 ? 2 : 3)) {
        u.ab.hits = 0;
        u.atkTimer = Math.max(0, u.atkTimer - u.cd * 0.25);
      }
    },
  },

  // 23. 真菌投掷手 (fungus_thrower)
  fungus_thrower: {
    attack(u, t, b) {
      fire(u, t, b, 'goo', u.atk * 0.7);
      b.emit({ k: 'boom', x: t.x, y: t.y, r: 35, color: '#a55eea', big: false });
      b.addZone({
        x: t.x,
        y: t.y,
        r: 40,
        dur: u.star >= 3 ? 4.5 : 3.0,
        dps: u.atk * 0.2,
        kind: 'goo',
        team: u.team,
        src: u,
      });
    },
    tick(u, b, dt) {
      if (cool(u, 'retreatCd', dt, 2)) {
        const closeFoe = foesOf(u, b).find((f) => f.alive && dist(u, f) < 40);
        if (closeFoe) {
          u.ab.retreatCd = 8;
          u.x = clampX(u, u.x + (u.team === 0 ? -32 : 32));
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: u.x, y2: u.y, z: u.gz });
        } else {
          u.ab.retreatCd = 0;
        }
      }
    },
  },

  // 24. 小恶魂 (baby_ghast)
  baby_ghast: {
    tick(u, b, dt) {
      if (cool(u, 'shieldCd', dt, 2)) {
        const lowAllies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon && a.card !== u.card && a.hpFrac < 0.5);
        if (lowAllies.length > 0) {
          // 优先未带护盾的残血目标，再按血量比例升序排序
          lowAllies.sort((a, c) => {
            const aHas = a.timedShields.some((s) => s.id === 'baby_ghast_shield' && s.amount > 0 && s.timer > 0.5) ? 1 : 0;
            const cHas = c.timedShields.some((s) => s.id === 'baby_ghast_shield' && s.amount > 0 && s.timer > 0.5) ? 1 : 0;
            if (aHas !== cHas) return aHas - cHas;
            return a.hpFrac - c.hpFrac;
          });
          const target = lowAllies[0];
          resetCd(u, 'shieldCd', u.star >= 3 ? 7.5 : 9.0, b);
          const shieldAmount = target.maxHp * (u.star >= 3 ? 0.3 : 0.2);
          target.addSynergyShield('baby_ghast_shield', shieldAmount, 4.0);
          b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + 40, s: '幽魂护盾!', color: '#ff6b81' });
          if (u.star >= 3) {
            target.moveSpd *= 1.25;
            b.addTimedAction(2.0, () => {
              if (target.alive) target.moveSpd /= 1.25;
            });
            b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + 55, s: '幽魂疾速 +25%!', color: '#ff7979' });
          }
        } else {
          u.ab.shieldCd = 0;
        }
      }
    },
  },

  // 25. 披甲猪灵 (armored_piglin)
  armored_piglin: {
    onDamaged(_u, _src, _o, _b) {
      return false;
    },
  },

  // 26. 城垛队长 (rampart_captain)
  rampart_captain: {
    tick(u, b, dt) {
      if (cool(u, 'axeCd', dt, 2)) {
        const target = (u.target && u.target.alive && dist(u, u.target) <= 50) ? u.target : foesOf(u, b).find((f) => f.alive && dist(u, f) <= 50);
        if (target) {
          u.ab.axeCd = 7;
          b.damage(u, target, u.atk * (u.star >= 3 ? 2.1 : 1.6), 'phys');
          b.knock(target, u.x, u.y, 40);
          b.emit({ k: 'boom', x: target.x, y: target.y, r: 35, color: '#ffa502', big: false });
          if (target.boss) {
            b.addPosture(target, u.star >= 3 ? 40 : 30);
            b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: `破势 +${u.star >= 3 ? 40 : 30}!`, color: '#ff4757' });
          }
        } else {
          u.ab.axeCd = 0;
        }
      }
    },
  },

  // 27. 骷髅骑兵 (skeleton_horseman)
  skeleton_horseman: {
    tick(u, b, dt) {
      if (cool(u, 'shiftCd', dt, 2)) {
        u.ab.shiftCd = 6;
        const shiftY = clampY(u.y + (b.rng.chance(0.5) ? 40 : -40));
        b.emit({ k: 'tele', x: u.x, y: u.y, x2: u.x, y2: shiftY, z: u.gz });
        u.y = shiftY;
      }
    },
  },

  // 28. 羊驼 (llama)
  llama: {
    attack(u, t, b) {
      u.ab.spits = (u.ab.spits ?? 0) + 1;
      fire(u, t, b, 'snowball', u.atk * 0.6);
      if (u.ab.spits % 3 === 0) {
        b.slow(t, 0.25, 0.15, 2.0);
        t.atkTimer += u.star >= 3 ? 0.5 : 0.35;
        if (t.boss && cool(u, 'llamaPostureCd', 0, 0)) {
          u.ab.llamaPostureCd = 6;
          b.addPosture(t, u.star >= 3 ? 30 : 20);
          b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: `破势 +${u.star >= 3 ? 30 : 20}!`, color: '#ff4757' });
        }
      }
    },
    tick(u, _b, dt) {
      if (u.ab.llamaPostureCd) u.ab.llamaPostureCd = Math.max(0, u.ab.llamaPostureCd - dt);
    },
  },

  // 29. 登山重装卫 (armored_mountaineer)
  armored_mountaineer: {
    attack(u, t, b) {
      b.damage(u, t, u.atk, 'phys');
      if (!t.boss) {
        t.atkTimer += u.star >= 3 ? 0.7 : 0.4;
        b.emit({ k: 'text', x: t.x, y: t.y, z: t.gz + t.size, s: '重劈顿挫!', color: '#ffa502' });
      }
    },
  },

  // 30. 爆鸣者 (blastling)
  blastling: {
    attack(u, t, b) {
      const shots = u.star >= 3 ? 3 : 2;
      for (let i = 0; i < shots; i++) {
        fire(u, t, b, 'goo', u.atk * 0.5, undefined, { spread: (i - (shots - 1) / 2) * 0.08 });
      }
      b.emit({ k: 'boom', x: t.x, y: t.y, r: 25, color: '#a55eea', big: false });
    },
    tick(u, b, dt) {
      if (cool(u, 'teleCd', dt, 2)) {
        const closeFoe = foesOf(u, b).find((f) => f.alive && dist(u, f) < 40);
        if (closeFoe) {
          u.ab.teleCd = 8;
          const nx = clampX(u, u.x + (u.team === 0 ? -40 : 40));
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: nx, y2: u.y, z: u.gz });
          u.x = nx;
          if (u.star >= 3) {
            u.hasteT = Math.max(u.hasteT, 2.0);
            u.hasteMul = Math.max(u.hasteMul, 1.3);
          }
        } else {
          u.ab.teleCd = 0;
        }
      }
    },
  },

  // 31. 缠缚者 (snareling)
  snareling: {
    tick(u, b, dt) {
      const cd = u.star >= 3 ? 6.0 : (u.star === 2 ? 6.5 : 7.0);
      if (cool(u, 'snareCd', dt, 2)) {
        const target = foesOf(u, b).find((f) => f.alive && !f.structure);
        if (target) {
          u.ab.snareCd = cd;
          const stunDur = u.star >= 3 ? 1.5 : (u.star === 2 ? 1.25 : 1.0);
          if (target.boss && target.channeling) {
            if (!target.ref.snarelingPoiseCard || target.ref.snarelingPoiseCard !== u.card) {
              target.ref.snarelingPoiseCard = u.card;
              b.addPosture(target, 30);
              b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '破势 +30!', color: '#ff4757' });
            }
          } else {
            target.stunT = Math.max(target.stunT, stunDur);
            b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size, s: '黏液束缚!', color: '#a55eea' });
          }
          if (b.has(u.team, 'combo_void_hunt')) {
            const tm = b.sides[u.team].timers;
            if (!tm.void_hunt_cd || b.t >= tm.void_hunt_cd) {
              tm.void_hunt_cd = b.t + 6.0;
              for (const a of alliesOf(u, b)) {
                if (a.alive && !a.structure && a.card !== u.card) {
                  a.ref.voidHuntBonus = 1.20;
                }
              }
              if (target.boss && target.channeling) {
                b.addPosture(target, 20);
              }
              b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + 40, s: '虚空围猎!', color: '#9b59b6' });
            }
          }
          const sideY = clampY(target.y + (b.rng.chance(0.5) ? 20 : -20));
          u.x = clampX(u, target.x + (u.team === 0 ? -20 : 20));
          u.y = sideY;
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: u.x, y2: u.y, z: u.gz });
          b.damage(u, target, u.atk * 0.7, 'phys');
          b.damage(u, target, u.atk * 0.7, 'phys');
          if (u.star >= 3) {
            target.weakT = Math.max(target.weakT, 3.0);
            target.weakMul = Math.max(target.weakMul, 0.15);
          }
        } else {
          u.ab.snareCd = 0;
        }
      }
    },
  },

  // 32. 末影哨卫 (endersent)
  endersent: {
    tick(u, b, dt) {
      if (cool(u, 'slamCd', dt, 2)) {
        const target = foesOf(u, b).find((f) => f.alive && !f.structure);
        if (target) {
          u.ab.slamCd = 9;
          u.x = clampX(u, target.x + (u.team === 0 ? -25 : 25));
          u.y = clampY(target.y);
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: u.x, y2: u.y, z: u.gz });
          b.aoe(u.x, u.y, u.star >= 3 ? 78 : 60, u.team, (f) => {
            b.damage(u, f, u.atk * 1.8, 'phys');
          });
          b.emit({ k: 'boom', x: u.x, y: u.y, r: 50, color: '#a55eea', big: false });
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + 50, s: '虚空砸地!', color: '#a55eea' });
        } else {
          u.ab.slamCd = 0;
        }
      }
      if (u.hp / u.maxHp <= 0.35 && !u.ab.retreated) {
        u.ab.retreated = 1;
        const homeX = u.team === 0 ? 60 : ARENA_W - 60;
        b.emit({ k: 'tele', x: u.x, y: u.y, x2: homeX, y2: u.y, z: u.gz });
        u.x = homeX;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + 50, s: '窥视者掩护!', color: '#a55eea' });
        b.summon(u, 'enderling', u.x, u.y - 20, u.star >= 3 ? 0.6 : 0.45, { lifespan: 8, fx: 'summon' });
        b.summon(u, 'enderling', u.x, u.y + 20, u.star >= 3 ? 0.6 : 0.45, { lifespan: 8, fx: 'summon' });
      }
    },
  },

  // 33. 灵魂巫师 (soul_wizard)
  soul_wizard: {
    attack(u, t, b) {
      u.ab.hits = (u.ab.hits ?? 0) + 1;
      fire(u, t, b, 'blue_skull', u.atk, undefined, { special: 'magic' });
      if (u.ab.hits % 4 === 0 && cool(u, 'harvestCd', 0, 0)) {
        u.ab.harvestCd = u.star >= 3 ? 3 : 4;
        b.addSouls(u.team, 1);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '灵魂收割!', color: '#70a1ff' });
      }
    },
    tick(u, _b, dt) {
      if (u.ab.harvestCd) u.ab.harvestCd = Math.max(0, u.ab.harvestCd - dt);
    },
  },

  // 34. 高塔幽魂 (tower_wraith)
  tower_wraith: {
    tick(u, b, dt) {
      if (cool(u, 'fireCd', dt, 2)) {
        const target = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive);
        if (target) {
          u.ab.fireCd = 7;
          b.emit({ k: 'boom', x: target.x, y: target.y, r: 45, color: '#2ed573', big: false });
          b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + 40, s: '黑袍魂火!', color: '#2ed573' });
          b.addZone({
            x: target.x,
            y: target.y,
            r: 50,
            dur: u.star >= 3 ? 5.0 : 4.0,
            dps: u.atk * 0.45,
            kind: 'fire',
            team: u.team,
            src: u,
          });
        } else {
          u.ab.fireCd = 0;
        }
      }
      if (cool(u, 'teleCd', dt, 2)) {
        const closeFoe = foesOf(u, b).find((f) => f.alive && dist(u, f) < 45);
        if (closeFoe) {
          u.ab.teleCd = 9;
          const nx = clampX(u, u.x + (u.team === 0 ? -40 : 40));
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: nx, y2: u.y, z: u.gz });
          u.x = nx;
        } else {
          u.ab.teleCd = 0;
        }
      }
    },
  },

  // 35. 刷怪笼 (mob_spawner)
  mob_spawner: {
    tick(u, b, dt) {
      const activeZombies = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.card === u.card && a.mob.id === 'zombie').length;
      const maxActive = u.star >= 3 ? 3 : 2;
      const maxTotal = 6;
      if ((u.ab.spawnCount ?? 0) >= maxTotal) return;
      if (cool(u, 'spawnCd', dt, u.ab.spawnCount === undefined ? 2 : 7)) {
        if (activeZombies < maxActive) {
          u.ab.spawnCd = 7;
          u.ab.spawnCount = (u.ab.spawnCount ?? 0) + 1;
          const spawned = b.summon(u, 'zombie', u.x + (u.team === 0 ? 25 : -25), u.y, u.star >= 3 ? 0.25 : 0.18, { lifespan: 10, fx: 'summon' });
          if (spawned) {
            spawned.atk = Math.round(mobDef('zombie').atk * starPower(u.mob, u.star) * 0.8);
            b.emit({ k: 'boom', x: spawned.x, y: spawned.y, r: 25, color: '#70a1ff', big: false });
          }
        } else {
          u.ab.spawnCd = 0;
        }
      }
    },
  },

  // 36. 窥视者 (enderling)
  enderling: {
    tick(u, b, dt) {
      if (cool(u, 'ambushCd', dt, 2)) {
        const target = foesOf(u, b).find((f) => f.alive && !f.structure);
        if (target) {
          u.ab.ambushCd = 8;
          u.x = clampX(u, target.x + (u.team === 0 ? -25 : 25));
          u.y = clampY(target.y);
          b.emit({ k: 'tele', x: u.x, y: u.y, x2: u.x, y2: u.y, z: u.gz });
          b.damage(u, target, u.atk * 1.3, 'phys');
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + 40, s: '侧翼突刺!', color: '#a55eea' });
        } else {
          u.ab.ambushCd = 0;
        }
      }
    },
  },

  // Boss 1: 卑劣幽魂 (wretched_wraith)
  wretched_wraith: {
    init(u, b) {
      u.ab.iceBarrageCd = 4;
      u.ref.wraithAnchors = [];
      u.ref.reinforcementsDone = false;
    },
    attack(u, t, b) {
      fire(u, t, b, 'ice_ball', b.atkOf(u));
      b.slow(t, 0.3, 0.2, 2.0);
    },
    tick(u, b, dt) {
      if (cool(u, 'iceBarrageCd', dt, 4)) {
        const cd = u.hp / u.maxHp <= 0.5 ? 8 : 9;
        const round = (u.ab.barrageRound ?? 0) + 1;
        u.ab.barrageRound = round;
        const currentCast = b.startCast(u, '寒冰列阵', 2.4, 1.0, {
          onRelease: (cast) => {
            b.emit({ k: 'shake', a: 6 });
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '寒冰列阵释放!', color: '#70a1ff' });
            if (u.ref.wraithAnchors) {
              for (const anc of u.ref.wraithAnchors) {
                if (anc.alive && anc.ref.castId === cast.id) {
                  b.emit({ k: 'debris', x: anc.x, y: anc.y, z: 0, s: 0, f: 0, block: false });
                  b.kill(anc, null, true);
                }
              }
            }
            const angles = [-0.22, 0, 0.22];
            const baseAngle = u.facing === 1 ? 0 : Math.PI;
            for (let wave = 0; wave < 3; wave++) {
              b.addTimedAction(wave * 0.6, () => {
                if (!u.alive) return;
                b.emit({ k: 'sfx', id: 'shoot' });
                const waveHit = new Set<number>();
                for (const offset of angles) {
                  const ang = baseAngle + offset;
                  const cosA = Math.cos(ang);
                  const sinA = Math.sin(ang);
                  b.emit({ k: 'beam', a: { x: u.x, y: u.y }, b: { x: u.x + cosA * 450, y: u.y + sinA * 450 }, color: '#70a1ff', t: 0.3 });
                  for (const f of foesOf(u, b)) {
                    if (!f.alive || waveHit.has(f.id)) continue;
                    const rx = f.x - u.x;
                    const ry = f.y - u.y;
                    const along = rx * cosA + ry * sinA;
                    if (along < 0 || along > 480) continue;
                    const perp = Math.abs(rx * sinA - ry * cosA);
                    if (perp <= 24 + f.radius) {
                      waveHit.add(f.id);
                      b.damage(u, f, b.atkOf(u) * 0.55, 'magic');
                      b.slow(f, 0.3, 0.2, 2.0);
                    }
                  }
                }
              });
            }
          },
          onFinish: () => {
            u.ab.iceBarrageCd = cd;
            if (u.hp / u.maxHp <= 0.5 && (!u.ab.teleCd || u.ab.teleCd <= 0)) {
              u.ab.teleCd = 12;
              const backX = u.team === 0 ? ARENA_W * 0.2 : ARENA_W * 0.8;
              const newY = Math.max(80, Math.min(ARENA_D - 80, u.y + (b.rng.next() > 0.5 ? 90 : -90)));
              b.emit({ k: 'tele', x: u.x, y: u.y, x2: backX, y2: newY, z: u.gz });
              u.x = backX;
              u.y = newY;
            }
          },
          onCancel: (reason) => {
            u.ab.iceBarrageCd = cd;
            if (u.ref.wraithAnchors) {
              for (const anc of u.ref.wraithAnchors) {
                if (anc.alive && anc.ref.castId === currentCast?.id) {
                  b.kill(anc, null, true);
                }
              }
            }
          },
        });
        if (currentCast) {
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '寒冰列阵蓄势中...', color: '#70a1ff' });
          if (round <= 2) {
            u.ref.wraithAnchors = u.ref.wraithAnchors || [];
            for (const dy of [-55, 55]) {
              const ax = clampX(u, u.x + (u.team === 0 ? -30 : 30));
              const ay = clampY(u.y + dy);
              const anchor = b.summon(u, 'ice_anchor', ax, ay, 1, { fx: 'summon' });
              if (anchor) {
                anchor.ref.nodeOwner = u;
                anchor.ref.castId = currentCast.id;
                u.ref.wraithAnchors.push(anchor);
              }
            }
          }
          b.addTimedAction(1.2, () => {
            if (u.alive && u.cast?.id === currentCast.id) {
              const baseAngle = u.facing === 1 ? 0 : Math.PI;
              for (const offset of [-0.22, 0, 0.22]) {
                const ang = baseAngle + offset;
                b.emit({ k: 'beam', a: { x: u.x, y: u.y }, b: { x: u.x + Math.cos(ang) * 450, y: u.y + Math.sin(ang) * 450 }, color: '#a0e7e5', t: 1.2 });
              }
            }
          });
        }
      }
      if (u.ab.teleCd) u.ab.teleCd = Math.max(0, u.ab.teleCd - dt);
      if (!u.ref.reinforcementsDone && u.hp / u.maxHp <= 0.5) {
        u.ref.reinforcementsDone = true;
        b.summon(u, 'iceologer', u.x, clampY(u.y - 45), 1, { fx: 'summon' });
        b.summon(u, 'iceologer', u.x, clampY(u.y + 45), 1, { fx: 'summon' });
      }
    },
  },

  // Boss 2: 丛林巨兽 (jungle_abomination)
  jungle_abomination: {
    init(u, b) {
      u.ab.abomSlamCd = 4;
      u.ref.abomPuddles = [];
      u.ref.abomNests = [];
    },
    tick(u, b, dt) {
      if (cool(u, 'abomSlamCd', dt, 4)) {
        const round = (u.ab.slamRound ?? 0) + 1;
        u.ab.slamRound = round;
        const currentCast = b.startCast(u, '剧毒重砸', 2.4, 1.0, {
          onRelease: (cast) => {
            b.emit({ k: 'shake', a: 8 });
            b.emit({ k: 'boom', x: u.x, y: u.y, r: 100, color: '#2ed573', big: true });
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '剧毒重砸释放!', color: '#2ed573' });
            if (u.ref.abomNests) {
              for (const n of u.ref.abomNests) {
                if (n.alive && n.ref.castId === cast.id) b.kill(n, null, true);
              }
            }
            b.aoe(u.x, u.y, 100, u.team, (f) => {
              b.damage(u, f, b.atkOf(u) * 1.4, 'phys');
            });
            u.ref.abomPuddles = (u.ref.abomPuddles || []).filter((zid: number) => b.zones.some((z) => z.id === zid));
            if (u.ref.abomPuddles.length >= 2) {
              const oldestId = u.ref.abomPuddles.shift();
              b.zones = b.zones.filter((z) => z.id !== oldestId);
            }
            const zone = b.addZone({
              x: u.x,
              y: u.y,
              r: 65,
              dur: 4,
              team: u.team,
              dps: b.atkOf(u) * 0.12,
              kind: 'goo',
              src: u,
            });
            u.ref.abomPuddles.push(zone.id);

            if (u.hp / u.maxHp <= 0.5) {
              for (const dy of [-40, 40]) {
                const lineY = clampY(u.y + dy);
                b.emit({ k: 'beam', a: { x: u.x, y: lineY }, b: { x: u.x + (u.facing === 1 ? 300 : -300), y: lineY }, color: '#2ed573', t: 0.4 });
                for (const f of foesOf(u, b)) {
                  if (f.alive && Math.abs(f.y - lineY) <= 25 && Math.abs(f.x - u.x) <= 320) {
                    b.damage(u, f, b.atkOf(u) * 0.4, 'phys');
                  }
                }
              }
            }
          },
          onFinish: () => {
            u.ab.abomSlamCd = 10;
          },
          onCancel: (reason) => {
            u.ab.abomSlamCd = 10;
            if (u.ref.abomNests) {
              for (const n of u.ref.abomNests) {
                if (n.alive && n.ref.castId === currentCast?.id) b.kill(n, null, true);
              }
            }
          },
        });
        if (currentCast) {
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '剧毒重砸蓄势中...', color: '#2ed573' });
          b.emit({ k: 'zone', x: u.x, y: u.y, r: 100, color: '#2ed573', t: 2.4 });
          if (round <= 3) {
            u.ref.abomNests = u.ref.abomNests || [];
            const offsets = [[110, -55], [110, 55]];
            for (const [dx, dy] of offsets) {
              const nx = clampX(u, u.x + (u.facing === 1 ? dx : -dx));
              const ny = clampY(u.y + dy);
              const nest = b.summon(u, 'root_nest', nx, ny, 1, { fx: 'summon' });
              if (nest) {
                nest.ref.nodeOwner = u;
                nest.ref.castId = currentCast.id;
                u.ref.abomNests.push(nest);
              }
            }
          }
          if (u.hp / u.maxHp <= 0.5) {
            b.addTimedAction(1.2, () => {
              if (u.alive && u.cast?.id === currentCast.id) {
                for (const dy of [-40, 40]) {
                  const lineY = clampY(u.y + dy);
                  b.emit({ k: 'beam', a: { x: u.x, y: lineY }, b: { x: u.x + (u.facing === 1 ? 300 : -300), y: lineY }, color: '#26de81', t: 1.2 });
                }
              }
            });
          }
        }
      }
    },
  },

  // Boss 3: 远古守护者 (ancient_guardian)
  ancient_guardian: {
    init(u, b) {
      u.ab.laserCd = 4;
      u.ref.mines = [];
      u.ref.spikesOpen = false;
      u.ref.spikeTimer = 0;
    },
    tick(u, b, dt) {
      if (u.ref.spikeTimer > 0) {
        u.ref.spikeTimer -= dt;
        if (u.ref.spikeTimer <= 0) u.ref.spikesOpen = false;
      }
      if (cool(u, 'laserCd', dt, 4)) {
        const round = (u.ab.laserRound ?? 0) + 1;
        u.ab.laserRound = round;
        const target = foesOf(u, b).find((f) => f.alive && !f.structure);
        let lockedX = target ? target.x : u.x + (u.facing === 1 ? 400 : -400);
        let lockedY = target ? target.y : u.y;
        const currentCast = b.startCast(u, '深渊激光', 2.4, 1.0, {
          target,
          onRelease: (cast) => {
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '深渊激光爆发!', color: '#ffa502' });
            b.emit({ k: 'sfx', id: 'laser' });
            const dx = lockedX - u.x;
            const dy = lockedY - u.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = dx / len;
            const ny = dy / len;
            b.emit({ k: 'beam', a: { x: u.x, y: u.y }, b: { x: u.x + nx * 800, y: u.y + ny * 800 }, color: '#ffa502', t: 0.6 });
            const hit = new Set<number>();
            for (const f of foesOf(u, b)) {
              if (!f.alive || hit.has(f.id)) continue;
              const rx = f.x - u.x;
              const ry = f.y - u.y;
              const along = rx * nx + ry * ny;
              if (along < 0 || along > 850) continue;
              const perp = Math.abs(rx * ny - ry * nx);
              if (perp <= 26 + f.radius) {
                hit.add(f.id);
                b.damage(u, f, b.atkOf(u) * 1.8, 'magic');
              }
            }
            if (u.ref.mines) {
              for (const m of u.ref.mines) {
                if (m.alive && m.ref.castId === cast.id) {
                  b.emit({ k: 'boom', x: m.x, y: m.y, r: 40, color: '#1e90ff', big: true });
                  b.aoe(m.x, m.y, 40, u.team, (f) => {
                    b.damage(u, f, b.atkOf(u) * 0.45, 'magic');
                  });
                  b.addZone({ x: m.x, y: m.y, r: 40, dur: 3, dps: b.atkOf(u) * 0.1, kind: 'goo', team: u.team, src: u });
                  b.kill(m, null, true);
                }
              }
            }
            u.ref.spikesOpen = true;
            u.ref.spikeTimer = 3.0;
          },
          onFinish: () => {
            u.ab.laserCd = 10;
          },
          onCancel: (reason) => {
            u.ab.laserCd = 10;
            u.ref.spikesOpen = false;
            u.ref.spikeTimer = 0;
            if (u.ref.mines) {
              for (const m of u.ref.mines) {
                if (m.alive && m.ref.castId === currentCast?.id) {
                  b.kill(m, null, true);
                }
              }
            }
          },
        });
        if (currentCast) {
          u.ref.spikesOpen = false;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '深渊激光锁定中...', color: '#ffa502' });
          if (round <= 3) {
            u.ref.mines = u.ref.mines || [];
            for (const dy of [-60, 60]) {
              const mx = clampX(u, u.x + (u.team === 0 ? 80 : -80));
              const my = clampY(u.y + dy);
              const mine = b.summon(u, 'sea_mine', mx, my, 1, { fx: 'summon' });
              if (mine) {
                mine.ref.nodeOwner = u;
                mine.ref.castId = currentCast.id;
                u.ref.mines.push(mine);
              }
            }
          }
          b.addTimedAction(1.2, () => {
            if (u.alive && u.cast?.id === currentCast.id) {
              const frontFoe = foesOf(u, b).find((f) => f.alive && !f.structure);
              if (frontFoe) {
                lockedX = frontFoe.x;
                lockedY = frontFoe.y;
              }
              b.emit({ k: 'beam', a: { x: u.x, y: u.y }, b: { x: lockedX, y: lockedY }, color: '#ffa502', t: 1.2 });
            }
          });
        }
      }
    },
    afterDamaged(u, src, d, b) {
      if (u.ref.spikesOpen && !u.channeling && u.stunT <= 0 && src && src.alive && !src.structure) {
        const now = b.t;
        const lastReflect = (u.ref.reflectMap = u.ref.reflectMap || new Map<number, number>());
        const lastTime = lastReflect.get(src.card) ?? -999;
        if (now - lastTime >= 1.0) {
          lastReflect.set(src.card, now);
          b.damage(u, src, b.atkOf(u) * 0.15, 'phys', { noThorns: true });
          b.emit({ k: 'hit', x: src.x, y: src.y, z: src.gz, big: false, color: '#ffa502' });
        }
      }
    },
  },

  // Boss 4: 悬浮烈焰 (wildfire)
  wildfire: {
    init(u, b) {
      u.ab.fireWallCd = 4;
      u.ab.ringCd = 2;
      u.ref.wildfireShields = [];
      u.ref.shieldResupplied = false;
      for (let i = 0; i < 4; i++) {
        const ang = (i * Math.PI) / 2;
        const sx = clampX(u, u.x + Math.cos(ang) * 45);
        const sy = clampY(u.y + Math.sin(ang) * 45);
        const shield = b.summon(u, 'wildfire_shield', sx, sy, 1, { fx: 'summon' });
        if (shield) {
          shield.ref.nodeOwner = u;
          u.ref.wildfireShields.push(shield);
        }
      }
    },
    tick(u, b, dt) {
      if (!u.ref.shieldResupplied && u.hp / u.maxHp <= 0.5) {
        u.ref.shieldResupplied = true;
        u.ref.wildfireShields = (u.ref.wildfireShields || []).filter((s: Unit) => s.alive);
        const needed = Math.max(0, 4 - u.ref.wildfireShields.length);
        for (let i = 0; i < needed; i++) {
          const ang = (i * Math.PI) / 2;
          const sx = clampX(u, u.x + Math.cos(ang) * 45);
          const sy = clampY(u.y + Math.sin(ang) * 45);
          const shield = b.summon(u, 'wildfire_shield', sx, sy, 1, { fx: 'summon' });
          if (shield) {
            shield.ref.nodeOwner = u;
            u.ref.wildfireShields.push(shield);
          }
        }
      }
      if (!u.channeling && cool(u, 'ringCd', dt, 7)) {
        const nearFoe = foesOf(u, b).find((f) => f.alive && !f.structure && dist(u, f) <= 90);
        if (nearFoe) {
          u.ab.ringCd = 7;
          b.emit({ k: 'zone', x: u.x, y: u.y, r: 90, color: '#ff4757', t: 1.0 });
          b.addTimedAction(1.0, () => {
            if (u.alive && !u.channeling) {
              b.emit({ k: 'boom', x: u.x, y: u.y, r: 90, color: '#ff4757', big: true });
              b.aoe(u.x, u.y, 90, u.team, (f) => {
                b.damage(u, f, b.atkOf(u) * 0.6, 'magic');
              });
            }
          });
        }
      }
      if (cool(u, 'fireWallCd', dt, 4)) {
        const currentCast = b.startCast(u, '熔炉火壁', 2.4, 1.0, {
          onRelease: (cast) => {
            b.emit({ k: 'shake', a: 6 });
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '熔炉火壁释放!', color: '#ff4757' });
            const hit = new Set<number>();
            const baseAngle = u.facing === 1 ? 0 : Math.PI;
            for (const offset of [-0.25, 0, 0.25]) {
              const ang = baseAngle + offset;
              const cosA = Math.cos(ang);
              const sinA = Math.sin(ang);
              b.emit({ k: 'beam', a: { x: u.x, y: u.y }, b: { x: u.x + cosA * 500, y: u.y + sinA * 500 }, color: '#ff4757', t: 0.5 });
              for (const f of foesOf(u, b)) {
                if (!f.alive || hit.has(f.id)) continue;
                const rx = f.x - u.x;
                const ry = f.y - u.y;
                const along = rx * cosA + ry * sinA;
                if (along < 0 || along > 520) continue;
                const perp = Math.abs(rx * sinA - ry * cosA);
                if (perp <= 30 + f.radius) {
                  hit.add(f.id);
                  b.damage(u, f, b.atkOf(u) * 0.9, 'magic');
                  b.burn(f, b.atkOf(u) * 0.1, 3, u);
                }
              }
            }
          },
          onFinish: () => {
            u.ab.fireWallCd = 9;
          },
          onCancel: (reason) => {
            u.ab.fireWallCd = 9;
          },
        });
        if (currentCast) {
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size, s: '熔炉火壁蓄势中...', color: '#ff4757' });
          if (u.ref.wildfireShields) {
            for (const s of u.ref.wildfireShields) {
              if (s.alive) s.ref.castId = currentCast.id;
            }
          }
          b.addTimedAction(1.2, () => {
            if (u.alive && u.cast?.id === currentCast.id) {
              const baseAngle = u.facing === 1 ? 0 : Math.PI;
              for (const offset of [-0.25, 0, 0.25]) {
                const ang = baseAngle + offset;
                b.emit({ k: 'beam', a: { x: u.x, y: u.y }, b: { x: u.x + Math.cos(ang) * 500, y: u.y + Math.sin(ang) * 500 }, color: '#ff6b81', t: 1.2 });
              }
            }
          });
        }
      }
    },
  },
};
