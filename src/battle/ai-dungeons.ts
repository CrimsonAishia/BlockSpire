import type { Battle } from './sim.ts';
import { ARENA_D, ARENA_W, type Unit } from './unit.ts';
import { cool, dist, foesOf, type Behavior } from './ai.ts';

const clampX = (u: Unit, x: number) => Math.max(u.radius, Math.min(ARENA_W - u.radius, x));
const clampY = (y: number) => Math.max(10, Math.min(ARENA_D - 10, y));

function alliesOf(u: Unit, b: Battle) {
  return b.live[u.team];
}

function cardAllies(u: Unit, b: Battle) {
  return b.live[u.team].filter((a) => a.card === u.card && a.alive && !a.structure && !a.isSummon);
}

function isCardLead(u: Unit, b: Battle) {
  const c = cardAllies(u, b);
  return c.length > 0 && c[0].id === u.id;
}

export const DUNGEONS_BEHAVIORS: Record<string, Behavior> = {
  // 1. 骷髅先锋 (skeleton_vanguard)
  skeleton_vanguard: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (cool(u, 'thrust', dt, 6)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 60) {
          u.ab.thrust = 6;
          const atk = b.atkOf(u);
          b.emit({ k: 'boom', x: t.x, y: t.y, r: 35, color: '#dcdde1', big: false });
          b.damage(u, t, atk * 0.8, 'phys', { melee: true });
          b.knock(t, u.x, u.y, 25);
          if (u.star >= 3) {
            u.shield = Math.min(u.maxHp * 0.3, u.shield + u.maxHp * 0.08);
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
      if (cool(u, 'enchant', dt, 7)) {
        const candidates = alliesOf(u, b).filter(
          (a) => a.alive && !a.structure && !a.isSummon && a.card !== u.card && a.mob.id !== 'enchanter'
        );
        if (candidates.length === 0) {
          u.ab.enchant = 1.0;
          return;
        }
        u.ab.enchant = 7;
        // 优先近战且生命比例最低
        candidates.sort((c1, c2) => {
          const m1 = c1.row === 'front' ? 0 : 1;
          const m2 = c2.row === 'front' ? 0 : 1;
          if (m1 !== m2) return m1 - m2;
          return c1.hp / c1.maxHp - c2.hp / c2.maxHp;
        });
        const bestCard = candidates[0].card;
        const targets = alliesOf(u, b).filter((a) => a.card === bestCard && a.alive && !a.isSummon);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '附魔律令!', color: '#9b59b6' });
        for (const t of targets) {
          b.emit({ k: 'beam', a: u, b: t, color: '#9b59b6', t: 0.5 });
          const bonus = t.atk * 0.15;
          t.atk += bonus;
          b.addTimedAction(4.0, () => {
            if (t.alive) t.atk = Math.max(0, t.atk - bonus);
          });
          if (u.star >= 3) {
            t.shield = Math.min(t.maxHp * 0.3, t.shield + t.maxHp * 0.06);
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
      if (cool(u, 'pillar', dt, 8)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          u.ab.pillar = 1.0;
          return;
        }
        u.ab.pillar = 8;
        const target = b.rng.pick(foes);
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
        b.summon(u, 'geomancer_pillar', px, py, 1, { lifespan: 4, fx: 'summon' });
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
      if (u.ref.summonCount >= 3) return;
      const initialWait = u.star >= 3 ? 4 : 8;
      if (cool(u, 'necro_sum', dt, u.ref.summonCount === 0 ? initialWait : 8)) {
        const aliveSkels = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'skeleton' && a.card === u.card);
        if (aliveSkels.length < 2) {
          u.ab.necro_sum = 8;
          u.ref.summonCount++;
          b.summon(u, 'skeleton', u.x + (u.team === 0 ? 30 : -30), u.y, 0.5, { lifespan: 10, fx: 'summon' });
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
      if (cool(u, 'ice_drop', dt, 7)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          u.ab.ice_drop = 1.0;
          return;
        }
        u.ab.ice_drop = 7;
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
      if (cool(u, 'beast_shield', dt, 8)) {
        const beasts = alliesOf(u, b).filter(
          (a) => a.alive && !a.structure && !a.isSummon && a.mob.families.includes('beast')
        );
        if (beasts.length === 0) {
          u.ab.beast_shield = 1.0;
          return;
        }
        u.ab.beast_shield = 8;
        beasts.sort((b1, b2) => b1.hp / b1.maxHp - b2.hp / b2.maxHp);
        const maxShieldTargets = u.star >= 3 ? 3 : 2;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '藤木护佑!', color: '#2ed573' });
        for (let i = 0; i < Math.min(maxShieldTargets, beasts.length); i++) {
          const a = beasts[i];
          const sh = a.maxHp * 0.08;
          a.shield = Math.min(a.maxHp * 0.3, a.shield + sh);
          b.emit({ k: 'heal', x: a.x, y: a.y, z: a.gz + a.z + a.size });
          b.addTimedAction(4.0, () => {
            if (a.alive && a.shield > 0) a.shield = Math.max(0, a.shield - sh);
          });
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
      if (cool(u, 'wind_wave', dt, 8)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          u.ab.wind_wave = 1.0;
          return;
        }
        u.ab.wind_wave = 8;
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
          });
        });
      }
    },
  },

  // 12. 钥匙傀儡 (key_golem)
  key_golem: {
    afterDamaged(u, _src, _d, b) {
      const cardKey = `key_golem_boost_c${u.card}`;
      if (!b.sides[u.team].timers[cardKey]) {
        b.sides[u.team].timers[cardKey] = 1;
        const allies = cardAllies(u, b);
        for (const a of allies) {
          a.moveSpd *= 1.25;
        }
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '全速奔行!', color: '#eccc68' });
        b.addTimedAction(4.0, () => {
          for (const a of cardAllies(u, b)) {
            a.moveSpd /= 1.25;
          }
        });
      }
    },
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (cool(u, 'shield_lowest', dt, 8)) {
        const allies = alliesOf(u, b).filter((a) => a.alive && !a.structure && !a.isSummon);
        if (allies.length === 0) {
          u.ab.shield_lowest = 1.0;
          return;
        }
        u.ab.shield_lowest = 8;
        allies.sort((a1, a2) => a1.hp / a1.maxHp - a2.hp / a2.maxHp);
        const t = allies[0];
        const shieldFrac = u.star >= 3 ? 0.09 : 0.06;
        const sh = t.maxHp * shieldFrac;
        t.shield = Math.min(t.maxHp * 0.3, t.shield + sh);
        b.emit({ k: 'heal', x: t.x, y: t.y, z: t.gz + t.z + t.size });
        b.addTimedAction(3.0, () => {
          if (t.alive && t.shield > 0) t.shield = Math.max(0, t.shield - sh);
        });
      }
    },
  },

  // 13. 登山斧兵 (mountaineer)
  mountaineer: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (cool(u, 'chop', dt, 7)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 45) {
          u.ab.chop = 7;
          const atk = b.atkOf(u);
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '蓄力劈砍!', color: '#ff4757' });
          if (u.star >= 3) {
            const sh = u.maxHp * 0.08;
            u.shield = Math.min(u.maxHp * 0.3, u.shield + sh);
            b.addTimedAction(2.0, () => {
              if (u.alive && u.shield > 0) u.shield = Math.max(0, u.shield - sh);
            });
          }
          b.addTimedAction(0.8, () => {
            if (!u.alive || !t.alive) return;
            if (dist(u, t) > 65) return;
            if (t.shield > 0) {
              t.shield = Math.max(0, t.shield - atk * 0.3);
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
      if (cool(u, 'leap', dt, 8)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          u.ab.leap = 1.0;
          return;
        }
        u.ab.leap = 8;
        const validFoes = foes.filter((f) => dist(u, f) >= 80 && dist(u, f) <= 220);
        const t = validFoes.length > 0 ? validFoes[validFoes.length - 1] : foes[foes.length - 1];
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '奇袭飞跃!', color: '#ffa502' });
        u.x = clampX(u, t.x);
        u.y = clampY(t.y);
        b.emit({ k: 'boom', x: u.x, y: u.y, r: 40, color: '#ffa502', big: false });
        b.damage(u, t, b.atkOf(u) * 1.2, 'phys', { melee: true });
        if (u.star >= 3) {
          u.moveSpd *= 1.15;
          b.addTimedAction(2.0, () => {
            if (u.alive) u.moveSpd /= 1.15;
          });
        }
      }
    },
  },

  // 15. 毒刺藤 (poison_quill_vine)
  poison_quill_vine: {
    onHit(u, t, dealt, b) {
      if (dealt <= 0) return;
      const cdKey = `vine_poison_cd_c${u.card}`;
      const last = b.sides[u.team].timers[cdKey] ?? -999;
      if (b.t - last >= 5) {
        b.sides[u.team].timers[cdKey] = b.t;
        const dur = u.star >= 3 ? 4 : 3;
        b.poison(t, b.atkOf(u) * 0.12, dur, 1, u);
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '剧毒喷吐!', color: '#2ed573' });
      }
    },
  },

  // 16. 疾风傀儡 (squall_golem)
  squall_golem: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (cool(u, 'squall_charge', dt, 8)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 80) {
          u.ab.squall_charge = 8;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '风暴蓄能!', color: '#70a1ff' });
          const atk = b.atkOf(u);
          b.addTimedAction(1.0, () => {
            if (!u.alive || !t.alive) return;
            b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '风暴冲撞!', color: '#70a1ff' });
            b.damage(u, t, atk * 1.2, 'phys', { melee: true });
            b.knock(t, u.x, u.y, 25);
            if (u.star >= 3) {
              const sh = u.maxHp * 0.08;
              u.shield = Math.min(u.maxHp * 0.3, u.shield + sh);
              b.addTimedAction(3.0, () => {
                if (u.alive && u.shield > 0) u.shield = Math.max(0, u.shield - sh);
              });
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
      if (u.ref.drownedCount >= 2) return;
      const initialWait = u.star >= 3 ? 5 : 9;
      if (cool(u, 'drowned_sum', dt, u.ref.drownedCount === 0 ? initialWait : 9)) {
        const aliveDrowned = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'drowned' && a.card === u.card);
        if (aliveDrowned.length < 1) {
          u.ab.drowned_sum = 9;
          u.ref.drownedCount++;
          b.summon(u, 'drowned', u.x + (u.team === 0 ? 30 : -30), u.y, 0.45, { lifespan: 9, fx: 'summon' });
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '深渊沉溺!', color: '#1e90ff' });
        } else {
          u.ab.drowned_sum = 1.0;
        }
      }
    },
  },

  // 18. 红石方块 (redstone_cube)
  redstone_cube: {
    tick(u, b, dt) {
      if (!isCardLead(u, b)) return;
      if (cool(u, 'cube_roll', dt, 6)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 60) {
          u.ab.cube_roll = 6;
          b.emit({ k: 'boom', x: t.x, y: t.y, r: 30, color: '#ff4757', big: false });
          b.damage(u, t, b.atkOf(u) * 0.8, 'phys', { melee: true });
          b.knock(t, u.x, u.y, 15);
          if (u.star >= 3) {
            u.mass *= 1.43;
            b.addTimedAction(2.0, () => {
              if (u.alive) u.mass /= 1.43;
            });
          }
        }
      }
    },
  },

  // ───────────────────────── 首领与专属敌人 ─────────────────────────

  // 19. 无名者 (nameless_one)
  nameless_one: {
    attack(u, t, b) {
      b.shoot(u, t, 'chin_spike', b.atkOf(u), { special: 'magic' });
    },
    tick(u, b, dt) {
      if (cool(u, 'boss_sum_skel', dt, 9)) {
        u.ab.boss_sum_skel = 9;
        const skels = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'skeleton');
        if (skels.length <= 2) {
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '骷髅大军!', color: '#2ed573' });
          b.summon(u, 'skeleton', u.x + (u.team === 0 ? 35 : -35), u.y - 25, 0.6, { lifespan: 10, fx: 'summon' });
          b.summon(u, 'skeleton', u.x + (u.team === 0 ? 35 : -35), u.y + 25, 0.6, { lifespan: 10, fx: 'summon' });
        }
      }
      if (u.hp / u.maxHp < 0.5 && cool(u, 'boss_soul_barrage', dt, 10)) {
        u.ab.boss_soul_barrage = 10;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '死者魂弹!', color: '#00d2d3' });
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        for (let i = 0; i < Math.min(3, foes.length); i++) {
          const f = foes[i];
          b.addDelayed({
            t: 1.2,
            x: f.x,
            y: f.y,
            r: 45,
            dmg: b.atkOf(u) * 0.7,
            team: u.team,
            src: u,
            kind: 'slash',
          });
        }
      }
    },
  },

  // 20. 红石巨兽 (redstone_monstrosity)
  redstone_monstrosity: {
    tick(u, b, dt) {
      if (cool(u, 'boss_ground_slam', dt, 8)) {
        u.ab.boss_ground_slam = 8;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔炉重震!', color: '#ff3838' });
        b.addDelayed({
          t: 1.5,
          x: u.x,
          y: u.y,
          r: 90,
          dmg: b.atkOf(u) * 1.5,
          team: u.team,
          src: u,
          kind: 'slash',
        });
      }
      const hpFrac = u.hp / u.maxHp;
      if (hpFrac <= 0.6 && !u.ref.vent60) {
        u.ref.vent60 = true;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔岩喷口!', color: '#e67e22' });
        b.addZone({ x: u.x - 40, y: u.y - 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
        b.addZone({ x: u.x + 40, y: u.y + 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
      }
      if (hpFrac <= 0.3 && !u.ref.vent30) {
        u.ref.vent30 = true;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '熔岩喷发!', color: '#e67e22' });
        b.addZone({ x: u.x - 40, y: u.y + 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
        b.addZone({ x: u.x + 40, y: u.y - 30, r: 40, dur: 6, dps: b.atkOf(u) * 0.18, kind: 'lava', team: u.team, src: u });
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
        u.ab.acid_spit = 7;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '泥泞酸蚀!', color: '#2ed573' });
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        for (let i = 0; i < Math.min(3, foes.length); i++) {
          const f = foes[i];
          b.addZone({ x: f.x, y: f.y, r: 35, dur: 3, dps: b.atkOf(u) * 0.15, kind: 'goo', team: u.team, src: u });
        }
      }
      if (cool(u, 'slime_spawn', dt, 10)) {
        const count = alliesOf(u, b).filter((a) => a.alive && a.isSummon && a.mob.id === 'slime').length;
        if (count < 6) {
          u.ab.slime_spawn = 10;
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
      if (cool(u, 'tempest_lightning', dt, 7)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length > 0) {
          u.ab.tempest_lightning = 7;
          const t = foes[0];
          b.emit({ k: 'text', x: t.x, y: t.y, z: 30, s: '风暴神雷!', color: '#70a1ff' });
          b.addDelayed({
            t: 1.2,
            x: t.x,
            y: t.y,
            r: 50,
            dmg: b.atkOf(u) * 1.2,
            team: u.team,
            src: u,
            kind: 'bolt',
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
      const cd = u.hp / u.maxHp < 0.5 ? 7 : 8;
      if (cool(u, 'void_strike', dt, cd)) {
        const foes = foesOf(u, b).filter((f) => f.alive && !f.structure);
        if (foes.length === 0) {
          u.ab.void_strike = 1.0;
          return;
        }
        u.ab.void_strike = cd;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '虚空泯灭!', color: '#9b59b6' });
        for (let i = 0; i < Math.min(2, foes.length); i++) {
          const f = foes[i];
          b.addDelayed({
            t: 1.5,
            x: f.x,
            y: f.y,
            r: 45,
            dmg: b.atkOf(u) * 1.0,
            team: u.team,
            src: u,
            kind: 'bolt',
          });
        }
      }
    },
  },

  // 24. 远古石卫 (ancient_warden)
  ancient_warden: {
    tick(u, b, dt) {
      if (cool(u, 'warden_shield', dt, 9)) {
        u.ab.warden_shield = 9;
        b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '远古坚甲!', color: '#95a5a6' });
        u.shield = Math.min(u.maxHp * 0.3, u.shield + u.maxHp * 0.12);
        b.slow(u, 0.2, 0, 4);
      }
      if (cool(u, 'warden_strike', dt, 6)) {
        const t = u.target && u.target.alive ? u.target : foesOf(u, b).find((f) => f.alive && !f.structure);
        if (t && dist(u, t) <= 40) {
          u.ab.warden_strike = 6;
          b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size, s: '远古重击!', color: '#e74c3c' });
          b.damage(u, t, b.atkOf(u) * 1.3, 'phys', { melee: true });
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
