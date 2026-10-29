// Contact slots are geometric reservations, not a fixed attacker count per mob.
import type { Battle } from './sim.ts';
import type { Unit } from './unit.ts';
import { canStand, clearWalk, type Point } from './navigation.ts';
import { neighbors } from './steering.ts';

interface Claim { unit: Unit; target: Unit; angle: number; radius: number; until: number }
const boards = new WeakMap<Battle, Map<Unit, Claim>>();

function board(b: Battle) {
  let claims = boards.get(b);
  if (!claims) { claims = new Map(); boards.set(b, claims); }
  for (const [u, c] of claims) if (!u.alive || !c.target.alive || u.team === c.target.team || u.target !== c.target || c.until < b.t) claims.delete(u);
  return claims;
}

const location = (c: Claim): Point => ({ x: c.target.x + Math.cos(c.angle) * c.radius, y: c.target.y + Math.sin(c.angle) * c.radius });
export function releaseContact(b: Battle, u: Unit) { boards.get(b)?.delete(u); }

function contactRadius(b: Battle, u: Unit, t: Unit): number {
  const margin = Math.max(4, Math.min(12, b.moveSpeedOf(t) * 0.2));
  return Math.max((u.radius + t.radius) * 0.96, b.reach(u, t) - margin);
}

/** Follow a reserved angle every step; only choosing a new angle is rate limited. */
export function followContact(b: Battle, u: Unit, t: Unit): Point | null {
  const c = boards.get(b)?.get(u);
  if (!c || c.target !== t || c.until < b.t) return null;
  c.radius = contactRadius(b, u, t);
  const p = location(c);
  return canStand(b, u, p.x, p.y) ? p : null;
}

/** Unreserved recovery approach. Physical steering still prevents pushing through bodies. */
export function contactApproach(b: Battle, u: Unit, t: Unit): Point | null {
  const angle = Math.atan2(u.y - t.y, u.x - t.x), radius = contactRadius(b, u, t);
  const p = { x: t.x + Math.cos(angle) * radius, y: t.y + Math.sin(angle) * radius };
  return canStand(b, u, p.x, p.y) ? p : null;
}

export function contactGoal(b: Battle, u: Unit, t: Unit, renew = false, accept: (p: Point) => boolean = () => true): Point | null {
  const claims = board(b), old = claims.get(u);
  const nearby = neighbors(b, t, Math.max(110, b.reach(u, t) + u.radius * 2));
  const free = (p: Point) => {
    if (!accept(p) || !canStand(b, u, p.x, p.y)) return false;
    for (const [a, c] of claims) {
      if (a === u || a.team !== u.team || a.flying !== u.flying) continue;
      const q = location(c);
      if (Math.hypot(q.x - p.x, q.y - p.y) < (u.radius + a.radius) * 0.98 + 2) return false;
    }
    for (const a of nearby) {
      if (a === u || a === t || a.flying !== u.flying || a.ghost) continue;
      // Waiting allies must not mutually block every reservation before combat starts.
      const fighting = a.target?.alive && Math.hypot(a.x - a.target.x, a.y - a.target.y) <= b.reach(a, a.target);
      if ((a.team !== u.team || a.speed <= 0 || (!a.moving && fighting)) && Math.hypot(a.x - p.x, a.y - p.y) < (u.radius + a.radius) * 0.94) return false;
    }
    return true;
  };
  if (!renew && old?.target === t) {
    old.radius = contactRadius(b, u, t);
    const p = location(old);
    if (free(p) && old.radius <= b.reach(u, t)) { old.until = b.t + 0.75; return p; }
  }
  claims.delete(u);
  const radius = contactRadius(b, u, t);
  const count = Math.max(6, Math.min(24, Math.floor(2 * Math.PI * radius / (u.radius * 2 + 4))));
  let best = Infinity, chosen: Claim | null = null;
  for (let k = -1; k < count; k++) {
    const angle = k < 0 ? Math.atan2(u.y - t.y, u.x - t.x) : (u.team === 0 ? Math.PI : 0) + k * 2 * Math.PI / count;
    const c: Claim = { unit: u, target: t, angle, radius, until: b.t + 0.75 };
    const p = location(c);
    if (!free(p)) continue;
    let cost = Math.hypot(p.x - u.x, p.y - u.y);
    if (!clearWalk(b, u, u, p)) cost += 110;
    // Penalise approaches through an occupied body, favouring exposed flanks.
    const dx = p.x - u.x, dy = p.y - u.y, length2 = dx * dx + dy * dy || 1;
    for (const a of nearby) {
      if (a === u || a === t || a.flying !== u.flying) continue;
      const f = Math.max(0, Math.min(1, ((a.x - u.x) * dx + (a.y - u.y) * dy) / length2));
      if (Math.hypot(u.x + dx * f - a.x, u.y + dy * f - a.y) < u.radius + a.radius) cost += 45;
    }
    if (cost < best) { best = cost; chosen = c; }
  }
  if (!chosen) return null;
  claims.set(u, chosen);
  return location(chosen);
}

export function contactPressure(b: Battle, u: Unit, t: Unit): number {
  const capacity = Math.max(2, Math.floor(2 * Math.PI * b.reach(u, t) / (u.radius * 2 + 4)));
  let count = 0;
  for (const c of board(b).values()) if (c.unit !== u && c.target === t && c.unit.team === u.team) count++;
  return Math.max(0, count - capacity + 1) * 65;
}
