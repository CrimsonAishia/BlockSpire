import type { Battle } from './sim.ts';
import type { Unit } from './unit.ts';
import { ARENA_D, ARENA_W } from './unit.ts';
import { BLOCK, cellX, cellY, idx } from './terrain.ts';
import { canStand, clearWalk, type Point } from './navigation.ts';
import { neighbors } from './steering.ts';
import { waterBenefit } from './terrain_policy.ts';

interface FiringSpot { unit: Unit; target: Unit; point: Point; until: number }
const spots = new WeakMap<Battle, Map<Unit, FiringSpot>>();
function board(b: Battle) {
  let m = spots.get(b);
  if (!m) { m = new Map(); spots.set(b, m); }
  for (const [u, spot] of m) if (!u.alive || !spot.target.alive || u.team === spot.target.team || spot.until < b.t) m.delete(u);
  return m;
}

export function releaseFiringSpot(b: Battle, u: Unit) { spots.get(b)?.delete(u); }

function score(b: Battle, u: Unit, t: Unit, p: Point, claims: Map<Unit, FiringSpot>, nearby: Unit[]): number {
  if (!canStand(b, u, p.x, p.y)) return -Infinity;
  const ground = b.terrain.h[idx(cellX(p.x), cellY(p.y))];
  const heightMul = (h: number) => u.flying ? 1 : 1 + 0.08 * Math.min(3, h);
  const reach = u.radius + t.radius + b.rangeOf(u) * heightMul(ground) / heightMul(u.gh);
  const distance = Math.hypot(t.x - p.x, t.y - p.y), travel = Math.hypot(p.x - u.x, p.y - u.y);
  let value = -travel * 0.32;
  value += waterBenefit(b, u, p.x, p.y);
  if (distance > reach - 8) value -= 180 + (distance - reach + 8) * 2;
  if (!b.canSee(u, t, p.x, p.y)) value -= 240;
  if (distance < reach * 0.55) value -= (reach * 0.55 - distance) * 0.65;
  if (!clearWalk(b, u, u, p)) value -= 40;
  if (!u.flying) value += Math.min(3, ground) * 12;
  let localFront = u.team === 0 ? -Infinity : Infinity;
  for (const a of nearby) {
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (a.team !== u.team) {
      if (a.isRanged || a.structure || !b.canReach(a, u)) continue;
      const contact = Math.max(0, d - b.reach(a, u));
      const eta = contact / Math.max(1, b.moveSpeedOf(a));
      if (eta < 2.5) value -= (2.5 - eta) * (a.target === u ? 90 : 55);
    } else {
      if (d < a.radius + u.radius + 8) value -= 70;
      if (!a.isRanged && !a.structure && !a.flying && a.mob.role !== 'assassin' && Math.abs(a.y - p.y) < 100) {
        localFront = u.team === 0 ? Math.max(localFront, a.x) : Math.min(localFront, a.x);
      }
    }
  }
  if (Number.isFinite(localFront)) value -= Math.max(0, (p.x - localFront) * (u.team === 0 ? 1 : -1) + 16) * 0.8;
  for (const [a, spot] of claims) {
    if (a === u || a.team !== u.team || a.flying !== u.flying) continue;
    if (Math.hypot(spot.point.x - p.x, spot.point.y - p.y) < u.radius + a.radius + 10) value -= 100;
  }
  for (const danger of b.dangers[u.team]) {
    if ((danger.zone || danger.at >= b.t) && Math.hypot(danger.x - p.x, danger.y - p.y) < danger.r + u.radius) value -= 350;
  }
  // Keep lateral exits near arena borders rather than retreating into a corner.
  value -= Math.max(0, 45 - p.y) + Math.max(0, p.y - ARENA_D + 45);
  value -= Math.max(0, 45 - (u.team === 0 ? p.x : ARENA_W - p.x)) * 1.5;
  return value;
}

export function firingGoal(b: Battle, u: Unit, t: Unit, renew = false, accept: (p: Point) => boolean = () => true): Point | null {
  const claims = board(b), old = claims.get(u);
  if (!renew && old?.target === t && old.until > b.t && canStand(b, u, old.point.x, old.point.y)) return old.point;
  claims.delete(u);
  const nearby = neighbors(b, u, 300);
  const current = score(b, u, t, u, claims, nearby);
  let best = current + 10, point: Point | null = null;
  const consider = (x: number, y: number) => {
    const p = { x, y }, value = score(b, u, t, p, claims, nearby);
    if (accept(p) && value > best) { best = value; point = p; }
  };
  for (const radius of [BLOCK * 1.2, BLOCK * 2.5, BLOCK * 4]) for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    consider(u.x + Math.cos(a) * radius, u.y + Math.sin(a) * radius);
  }
  // Persistent occlusion also samples the firing ring, allowing a path around cover.
  if (!b.canSee(u, t) || u.noLosT > 0.4) {
    const r = (u.radius + t.radius + b.rangeOf(u)) * 0.82;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8;
      consider(t.x + Math.cos(a) * r, t.y + Math.sin(a) * r);
    }
  }
  if (point) claims.set(u, { unit: u, target: t, point, until: b.t + 0.65 });
  return point;
}

/** Available output now beats repeatedly walking toward an occluded target. */
export function visibleTarget(b: Battle, u: Unit): Unit | null {
  return b.findTarget(u, e => Math.hypot(e.x - u.x, e.y - u.y) <= b.reach(u, e) && b.canSee(u, e));
}
