import type { Battle } from './sim.ts';
import type { Unit } from './unit.ts';
import { clearWalk } from './navigation.ts';
import { expectedDamage } from './threats.ts';

interface Hit { damage: number; control: number; at: number; directAt: number }
interface Memory { hits: Map<Unit, Hit>; next: number; target: Unit | null; until: number; finishUntil: number }
const memories = new WeakMap<Unit, Memory>();
function memory(u: Unit): Memory {
  let m = memories.get(u);
  if (!m) { m = { hits: new Map(), next: 0, target: null, until: 0, finishUntil: 0 }; memories.set(u, m); }
  return m;
}
const decay = (at: number, now: number) => Math.exp(-Math.max(0, now - at) / 0.8);

/** Actual damage after mitigation, including shields. Passive retaliation never provokes a chase. */
export function recordThreat(b: Battle, u: Unit, src: Unit | null, damage: number, control = 0, dot = false, reactive = false) {
  if (!b.coordinated[u.team] || !u.alive || !src?.alive || src.team === u.team || reactive || (damage <= 0 && control <= 0)) return;
  const m = memory(u), old = m.hits.get(src), factor = old ? decay(old.at, b.t) : 0;
  for (const [e, h] of m.hits) if (!e.alive || e.team === u.team || b.t - h.at > 2.5) m.hits.delete(e);
  m.hits.set(src, { damage: (old?.damage ?? 0) * factor + damage * (dot ? 0.2 : 1),
    control: (old?.control ?? 0) * factor + control, at: b.t, directAt: dot ? old?.directAt ?? -Infinity : b.t });
  if (m.hits.size > 8) {
    let weakest: Unit | null = null, value = Infinity;
    for (const [e, h] of m.hits) {
      const score = (h.damage + h.control * 10) * decay(h.at, b.t);
      if (score < value) { value = score; weakest = e; }
    }
    if (weakest) m.hits.delete(weakest);
  }
}

function eligible(b: Battle, u: Unit, e: Unit, m: Memory): boolean {
  if (!e.alive || e.team === u.team || e.invisT > 0 || e.ghost || !b.canReach(u, e) || !b.canReach(e, u)) return false;
  if (e.target !== u && b.t - (m.hits.get(e)?.directAt ?? -Infinity) > 0.9) return false;
  const distance = Math.hypot(e.x - u.x, e.y - u.y);
  // Self-defence is local: it must not drag a unit after a retreating or distant shooter.
  if (distance > b.reach(u, e) + b.moveSpeedOf(u) * 0.7) return false;
  if (e.isRanged) return b.canSee(e, u);
  return distance <= b.reach(e, u) + b.moveSpeedOf(e) * 0.7;
}

function attackEstimate(b: Battle, src: Unit, target: Unit): number {
  return expectedDamage(b, target, { id: 0, x: target.x, y: target.y, r: 0, at: b.t + 0.2,
    zone: false, src, damage: b.atkOf(src), dk: src.dk, proj: src.isRanged });
}

function pressure(b: Battle, u: Unit, e: Unit, m: Memory): { score: number; incoming: number } {
  const distance = Math.hypot(e.x - u.x, e.y - u.y);
  if (!b.canSee(u, e)) return { score: 0, incoming: 0 };
  // A melee attacker across a wall or hazardous strip is not an immediate contact.
  if (!e.isRanged && !clearWalk(b, e, e, u)) return { score: 0, incoming: 0 };
  if (!u.isRanged) {
    const walk = Math.max(0, distance - b.reach(u, e) * 0.85) / Math.max(1, distance);
    if (!clearWalk(b, u, u, { x: u.x + (e.x - u.x) * walk, y: u.y + (e.y - u.y) * walk })) return { score: 0, incoming: 0 };
  }
  const eta = Math.max(0, distance - b.reach(e, u)) / Math.max(1, b.moveSpeedOf(e));
  const dps = attackEstimate(b, e, u) * b.atkSpeedOf(e) / Math.max(0.2, e.cd);
  const incoming = e.stunned ? 0 : dps * Math.max(0, 1 - eta);
  const h = m.hits.get(e), recent = h ? decay(h.at, b.t) : 0;
  const ownDps = b.atkOf(u) * b.atkSpeedOf(u) / Math.max(0.2, u.cd);
  const harm = incoming + recent * ((h?.damage ?? 0) * 0.7 + (h?.control ?? 0) * ownDps * 0.5);
  // Avoid abandoning useful output for a target that currently takes almost no damage.
  const effectiveness = Math.min(1, attackEstimate(b, u, e) / Math.max(1, b.atkOf(u)));
  return { score: harm * (0.35 + effectiveness * 0.65), incoming };
}

/** A short-lived defensive preference, layered over ordinary tactical target selection. */
export function selfDefenseTarget(b: Battle, u: Unit, accept: (e: Unit) => boolean): Unit | null {
  if (u.boss || u.structure || u.ghost || u.mob.role === 'bomber') return null;
  const m = memory(u), current = u.target;
  if (b.t < m.next) return m.target === current && current && current.alive && current.team !== u.team && current.invisT <= 0
    && accept(current) && (b.t < m.finishUntil || eligible(b, u, current, m)) ? current : null;
  m.next = b.t + 0.16 + (u.id % 3) / 60;
  for (const [e, h] of m.hits) if (!e.alive || e.team === u.team || b.t - h.at > 2.5) m.hits.delete(e);
  let best: Unit | null = null, bestScore = 0, currentScore = 0, totalIncoming = 0;
  for (const e of b.live[(1 - u.team) as 0 | 1]) {
    if (!accept(e) || !eligible(b, u, e, m)) continue;
    const p = pressure(b, u, e, m);
    totalIncoming += p.incoming;
    if (e === current) currentScore = p.score;
    if (p.score > bestScore) { best = e; bestScore = p.score; }
  }
  const health = Math.max(1, u.hp + u.shield);
  const urgent = totalIncoming > health * 0.55;
  if (current?.alive && Math.hypot(current.x - u.x, current.y - u.y) <= b.reach(u, current) && b.canSee(u, current)) {
    const ready = Math.max(0, u.atkTimer) / Math.max(0.1, b.atkSpeedOf(u));
    if (ready <= 0.25 && current.hp + current.shield <= attackEstimate(b, u, current)
      && totalIncoming * (ready + 0.2) < health - u.maxHp * 0.1) {
      m.target = current; m.finishUntil = b.t + ready + 0.2;
      return current;
    }
  }
  const holding = m.target === current && currentScore > 0;
  const margin = Math.max(2, u.maxHp * (u.mob.role === 'assassin' && !urgent ? 0.07 : 0.025));
  const threshold = currentScore * (holding && b.t < m.until ? (urgent ? 1.8 : Infinity) : 1.2) + margin;
  if (best && best !== current && bestScore > threshold) {
    m.target = best; m.until = b.t + 0.75; m.finishUntil = 0;
    return best;
  }
  if (holding) return current;
  m.target = null;
  return null;
}

export function isDefending(u: Unit, now: number): boolean {
  const m = memories.get(u);
  return !!(m && m.target && m.target === u.target && now < m.until);
}

