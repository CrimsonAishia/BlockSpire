// Battle items: what each consumable does when it lands. Called by Battle.useItem (instant
// items) or when a thrown item arrives. Deterministic: no randomness beyond the battle RNG.
import { ITEM_MAP } from '../data/items.ts';
import { mobDef } from '../data/mobs.ts';
import type { Battle } from './sim.ts';
import { BLOCK, F, GD, GW, S, SURFACE_INFO, cellX, cellY, hatesWater, idx, isBlocked } from './terrain.ts';
import { ARENA_D, ARENA_W, baseFx, type Unit } from './unit.ts';

/** Flat item damage grows with the act like the enemies do. */
const ACT_K = [1, 1, 1.6, 2.4, 3];

const undead = (u: Unit) => u.mob.families.includes('undead');

/** Free cells around a point on our half for spawn eggs, nearest first. */
function eggSpots(b: Battle, team: 0 | 1, x: number, y: number, n: number, mob: string): [number, number][] {
  const m = mobDef(mob);
  const t = b.terrain;
  const cx0 = cellX(x);
  const cy0 = cellY(y);
  const out: [number, number][] = [];
  for (let r = 0; r < 6 && out.length < n; r++)
    for (let dy = -r; dy <= r && out.length < n; dy++)
      for (let dx = -r; dx <= r && out.length < n; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const cx = cx0 + dx;
        const cy = cy0 + dy;
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GD) continue;
        if ((team === 0 ? cx >= GW / 2 : cx < GW / 2) || isBlocked(t, cx, cy)) continue;
        const s = t.s[idx(cx, cy)];
        if (s === S.LAVA || (s === S.WATER && hatesWater(m))) continue;
        out.push([(cx + 0.5) * BLOCK, (cy + 0.5) * BLOCK]);
      }
  while (out.length < n) out.push([x, y]);
  return out;
}

/** Potion strength: 龙息 doubles it, the Witch brews them 20% stronger, 烈焰粉 adds 30%. */
export function potionPower(b: Battle, team: 0 | 1) {
  return (b.has(team, 'dragon_breath') ? 2 : 1) * (b.has(team, 'cmd_witch') ? 1.2 : 1) * (b.has(team, 'blaze_powder') ? 1.3 : 1);
}

/** Effect radius in blocks (the Witch throws splash and lingering potions 20% wider). */
export function itemRadius(b: Battle, team: 0 | 1, id: string) {
  const def = ITEM_MAP[id];
  if (!def) return 0;
  const witch = def.potion && def.target === 'area' && b.has(team, 'cmd_witch');
  return def.radius * (witch ? 1.2 : 1) * (id === 'tnt' ? b.boomMul(team).r : 1);
}

/** Applies an item's effect at (x, y). */
export function applyItem(b: Battle, team: 0 | 1, id: string, x: number, y: number) {
  const def = ITEM_MAP[id];
  if (!def) return;
  const side = b.sides[team];
  const P = def.potion ? potionPower(b, team) : 1;
  const K = ACT_K[side.plan.act] ?? 1;
  const allies = b.live[team];
  const r = itemRadius(b, team, id) * BLOCK;
  const boom = (color: string, big = false) => b.emit({ k: 'boom', x, y, r, color, big });
  switch (id) {
    // ── drinks ──
    case 'strength':
      b.addBuff(team, 'atk', 1 + 0.25 * P, Infinity);
      break;
    case 'swiftness':
      b.addBuff(team, 'move', 1 + 0.25 * P, Infinity);
      b.addBuff(team, 'atkSpd', 1 + 0.15 * P, Infinity);
      break;
    case 'regeneration':
      for (const u of allies) {
        u.regenT = Math.max(u.regenT, 20);
        u.regenRate = Math.max(u.regenRate, 0.02 * P);
      }
      break;
    case 'turtle':
      b.addBuff(team, 'taken', Math.max(0.4, 1 - 0.25 * P), Infinity);
      b.addBuff(team, 'move', 0.85, Infinity);
      break;
    case 'fire_resistance':
      side.fireImmune = true;
      b.addBuff(team, 'fire', 0.6, Infinity);
      for (const u of allies) u.burnT = 0;
      break;
    case 'invisibility':
      for (const u of allies) if (!u.structure) u.invisT = Math.max(u.invisT, 5);
      break;
    // ── splash / lingering ──
    case 'splash_healing':
      boom('#ff6f9a');
      b.aoeAllies(x, y, r, team, (a) => {
        if (!undead(a)) b.heal(a, a.maxHp * 0.3 * P, null);
      });
      b.aoe(x, y, r, team, (e) => {
        if (undead(e)) b.damage(null, e, 80 * K * P, 'magic', { noCrit: true, noDodge: true });
      });
      break;
    case 'splash_harming':
      boom('#9b3a7a');
      b.aoe(x, y, r, team, (e) => {
        if (undead(e)) b.heal(e, 70 * K * P, null);
        else b.damage(null, e, 70 * K * P, 'magic', { noCrit: true, noDodge: true });
      });
      break;
    case 'poison':
      boom('#4caf50');
      b.aoe(x, y, r, team, (e) => b.poison(e, e.maxHp * 0.03 * P, 8, 1, null));
      break;
    case 'weakness':
      boom('#57606f');
      b.aoe(x, y, r, team, (e) => {
        e.weakT = Math.max(e.weakT, 12);
        e.weakMul = Math.max(e.weakMul, Math.min(0.6, 0.3 * P));
      });
      break;
    case 'splash_slowness':
      boom('#6d7f9e');
      b.aoe(x, y, r, team, (e) => b.slow(e, Math.min(0.75, 0.5 * P), 0.2 * P, 8));
      break;
    case 'lingering_regen':
      b.emit({ k: 'boom', x, y, r, color: '#ff9cc8', big: false });
      b.addZone({ x, y, r, dur: 8, team, dps: 0.02 * P, kind: 'regen', src: null });
      break;
    // ── tools ──
    case 'wind_charge':
      boom('#e6f6ff', true);
      b.emit({ k: 'sfx', id: 'wind' });
      b.aoe(x, y, r, team, (e) => {
        b.damage(null, e, 25 * K, 'phys', { noCrit: true });
        b.knock(e, x, y, 220);
      });
      break;
    case 'cobweb': {
      const t = b.terrain;
      const cx = cellX(x);
      const cy = cellY(y);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ax = cx + dx;
        const ay = cy + dy;
        if (ax < 0 || ay < 0 || ax >= GW || ay >= GD) continue;
        const i = idx(ax, ay);
        if (t.f[i] && t.f[i] !== F.FLOWER && t.f[i] !== F.TALLGRASS) continue;
        if (SURFACE_INFO[t.s[i]]?.liquid) continue;
        t.f[i] = F.COBWEB;
        t.fh[i] = 0;
        t.dirty.push(i);
        t.ver++;
      }
      b.emit({ k: 'sfx', id: 'toss' });
      break;
    }
    case 'lava_bucket':
      b.emit({ k: 'sfx', id: 'fireball' });
      b.addZone({ x, y, r, dur: 8, team, dps: 0.05, kind: 'lava', src: null });
      break;
    case 'tnt':
      b.emit({ k: 'tnt', x, y, t: 2 });
      b.emit({ k: 'sfx', id: 'fuse' });
      b.addDelayed({ t: 2, x, y, r, dmg: 160 * K * b.boomMul(team).d, team, src: null, kind: 'tnt' });
      break;
    case 'mace': {
      let best: Unit | null = null;
      let bd = Infinity;
      for (const e of b.live[(1 - team) as 0 | 1]) {
        if (!e.alive || e.structure) continue;
        const d = Math.hypot(e.x - x, e.y - y) - e.radius;
        if (d < bd && d <= r) {
          bd = d;
          best = e;
        }
      }
      b.emit({ k: 'boom', x, y, r: r * 1.6, color: '#c8c8c8', big: true });
      b.emit({ k: 'shake', a: 9 });
      b.emit({ k: 'sfx', id: 'stomp' });
      if (best) {
        b.damage(null, best, 220 * K, 'true', { noDodge: true });
        b.emit({ k: 'text', x: best.x, y: best.y, z: best.gz + best.z + best.size, s: '重锤!', color: '#e8e8e8' });
      }
      b.aoe(x, y, r * 1.6, team, (e) => {
        if (e !== best) b.knockup(e, 1);
      });
      break;
    }
    case 'goat_horn': {
      b.addBuff(team, 'atkSpd', 1.3, b.t + 8);
      b.addBuff(team, 'move', 1.3, b.t + 8);
      let sx = 0;
      let sy = 0;
      for (const u of allies) {
        sx += u.x;
        sy += u.y;
      }
      const n = Math.max(1, allies.length);
      b.emit({ k: 'roar', x: sx / n, y: sy / n, r: 220, color: '#fff0b0' });
      b.emit({ k: 'sfx', id: 'horn' });
      break;
    }
    case 'ice_ball':
      boom('#cfeeff');
      b.emit({ k: 'sfx', id: 'snowball' });
      b.aoe(x, y, r, team, (e) => {
        b.damage(null, e, 30 * K, 'phys', { noCrit: true });
        b.knock(e, x, y, 90);
        b.freeze(e, 8 * K, 3, null);
      });
      break;
    case 'splash_freezing':
      boom('#8fd3ff');
      b.aoe(x, y, r, team, (e) => b.freeze(e, e.maxHp * 0.02 * P, 5, null));
      break;
    case 'firework':
      b.emit({ k: 'boom', x, y, r, color: '#ff6ad5', big: true });
      b.emit({ k: 'boom', x: x + 14, y: y - 10, r: r * 0.7, color: '#6ad5ff', big: false });
      b.emit({ k: 'boom', x: x - 12, y: y + 12, r: r * 0.6, color: '#ffe36a', big: false });
      b.emit({ k: 'sfx', id: 'explode', v: 0.6 });
      b.aoe(x, y, r, team, (e, f) => {
        b.damage(null, e, 60 * K * (1 - 0.4 * f), 'phys', { noCrit: true });
        b.knock(e, x, y, 120);
      });
      break;
    case 'trident':
      b.emit({ k: 'sfx', id: 'trident' });
      b.lightning(null, x, y, 80 * K, r, team);
      break;
    case 'spear': {
      // A charge along the field toward the target point.
      const dir = team === 0 ? 1 : -1;
      const len = BLOCK * 6;
      const sx = x - dir * len;
      b.emit({ k: 'tele', x: sx, y, x2: x, y2: y, z: 0 });
      b.emit({ k: 'sfx', id: 'ram' });
      const hit = new Set<number>();
      for (let k = 0; k <= 12; k++) {
        const px = sx + ((x - sx) * k) / 12;
        b.aoe(px, y, 26, team, (e) => {
          if (hit.has(e.id)) return;
          hit.add(e.id);
          b.damage(null, e, 110 * K, 'phys', { noCrit: true });
          b.knock(e, px - dir * 10, y, 150);
        });
      }
      b.emit({ k: 'boom', x, y, r: 40, color: '#e8e8e8', big: false });
      break;
    }
    case 'honey':
      b.emit({ k: 'sfx', id: 'toss' });
      b.addZone({ x, y, r, dur: 10, team, dps: 0, kind: 'honey', src: null });
      break;
    case 'pearl': {
      b.emit({ k: 'sfx', id: 'teleport' });
      const backX = team === 0 ? BLOCK * 3 : ARENA_W - BLOCK * 3;
      b.aoeAllies(x, y, r, team, (a) => {
        if (a.structure || a.boss || a.speed <= 0) return;
        const nx = backX + b.rng.range(-20, 20);
        const ny = Math.max(20, Math.min(ARENA_D - 20, a.y + b.rng.range(-30, 30)));
        b.emit({ k: 'tele', x: a.x, y: a.y, x2: nx, y2: ny, z: a.gz + a.z });
        a.x = a.px = nx;
        a.y = a.py = ny;
        b.teleported(a);
        a.target = null;
        a.retarget = 0;
        b.heal(a, a.maxHp * 0.15, null);
      });
      break;
    }
    case 'golden_apple':
      for (const u of allies) {
        if (u.structure) continue;
        u.shield = Math.max(u.shield, u.maxHp * 0.2);
        u.regenT = Math.max(u.regenT, 10);
        u.regenRate = Math.max(u.regenRate, 0.015);
      }
      b.emit({ k: 'sfx', id: 'heal' });
      break;
    default:
      if (def.spawn) spawnEgg(b, team, def.spawn[0], def.spawn[1], x, y);
  }
}

/** A spawn egg: a temporary squad of the mob on our half, scaled to the act. */
function spawnEgg(b: Battle, team: 0 | 1, mob: string, n: number, x: number, y: number) {
  const side = b.sides[team];
  const mul = ([1, 1, 1.5, 2.1][side.plan.act] ?? 1) * side.plan.summonMul;
  const ci = b.addCard(team, {
    mob, star: 1, row: 'mid', count: n, hpMul: mul, atkMul: mul, atkSpd: 1, moveSpd: 1, rangeMul: 1, armorAdd: 0, fx: baseFx(), immune: 0,
  });
  const m = mobDef(mob);
  for (const [sx, sy] of eggSpots(b, team, x, y, n, mob)) {
    const u = b.createUnit(ci, m, sx, sy, 1, true);
    u.facing = team === 0 ? 1 : -1;
    b.enlist(u, 'summon');
  }
}
