import type { Battle } from './sim.ts';
import type { Unit } from './unit.ts';
import type { Danger } from './tactics.ts';
import { canStand, clearWalk, planPath, travelCost, type Point } from './navigation.ts';
import { groundRisk } from './terrain_policy.ts';
import { dangerDistance, expectedControl, expectedDamage } from './threats.ts';
import { steerTo } from './steering.ts';

export interface SafetyDecision {
  action: 'hold' | 'dodge' | 'escape';
  reason: 'low-risk' | 'safer-route' | 'no-safe-route' | 'dangerous-ground';
  goal: Point | null;
  hpLoss: number;
  seconds: number;
  path?: readonly Point[];
}
interface Memory { decision: SafetyDecision; until: number; start: number; ground: boolean; at: number }
const memories = new WeakMap<Unit, Memory>();
export function inspectSafety(u: Unit): SafetyDecision | undefined { return memories.get(u)?.decision; }

function positionAt(b: Battle, u: Unit, path: readonly Point[], time: number, reaction: number): Point {
  let from: Point = u, left = Math.max(0, time - reaction);
  for (const to of path) {
    const seconds = travelCost(b, u, from, to) / Math.max(1, b.moveSpeedOf(u));
    if (left < seconds) {
      const f = left / Math.max(0.001, seconds);
      return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f };
    }
    left -= seconds; from = to;
  }
  return from;
}

function exposure(b: Battle, u: Unit, dangers: Danger[], path: readonly Point[], reaction: number): { cost: number; hp: number; control: number } {
  let raw = 0, control = 0, latest = 0;
  for (const d of dangers) {
    if (d.zone) {
      const horizon = Math.min(2, Math.max(0, (d.until ?? b.t + 2) - b.t));
      for (let t = 0; t < horizon; t += 0.2) {
        const p = positionAt(b, u, path, t, reaction), duration = Math.min(0.2, horizon - t);
        if (dangerDistance(d, p.x, p.y) > d.r + u.radius) continue;
        raw += expectedDamage(b, u, d, duration, p.x, p.y, t);
        control += expectedControl(b, u, d, t) * duration;
      }
      latest = Math.max(latest, horizon);
    } else {
      const when = d.at - b.t;
      if (when < -0.05 || when > 3) continue;
      const p = positionAt(b, u, path, Math.max(0, when), reaction);
      if (dangerDistance(d, p.x, p.y) > d.r + u.radius) continue;
      raw += expectedDamage(b, u, d, 1, p.x, p.y); control += expectedControl(b, u, d);
      latest = Math.max(latest, when);
    }
  }
  const expired = u.timedShields.reduce((sum, shield) => sum + (shield.timer <= latest ? shield.amount : 0), 0);
  const shield = Math.max(0, u.shield - expired), hp = Math.max(0, raw - shield);
  const dps = b.atkOf(u) * b.atkSpeedOf(u) / Math.max(0.2, u.cd);
  return { cost: hp + Math.min(shield, raw) * 0.12 + control * Math.max(u.maxHp * 0.06, dps * 0.6), hp, control };
}

export function decideSafety(b: Battle, u: Unit, allowArea = true, alreadyReacting = false): SafetyDecision {
  const ground = !u.flying && u.z < 4 && groundRisk(b, u) > 0;
  const dangers = allowArea ? b.dangers[u.team].filter(d => (d.zone ? (d.until ?? Infinity) > b.t : d.at >= b.t - 0.05 && d.at < b.t + 3)) : [];
  const incoming = dangers.some(d => dangerDistance(d, u.x, u.y) <= d.r + u.radius + 6);
  const stay = exposure(b, u, dangers, [], 0);
  const hold: SafetyDecision = { action: 'hold', reason: 'low-risk', goal: null, hpLoss: stay.hp, seconds: 0 };
  if (u.speed <= 0 || u.stunned || u.structure || u.ghost || (!ground && (!incoming || u.boss))) return hold;
  const dps = b.atkOf(u) * b.atkSpeedOf(u) / Math.max(0.2, u.cd);
  const tolerance = u.mob.role === 'tank' ? 0.14 : u.isRanged ? 0.045 : 0.075;
  if (!ground && stay.cost < u.maxHp * tolerance && stay.hp < u.hp * 0.45 && stay.control < 0.8) return hold;
  const reaction = ground || alreadyReacting ? 0 : 0.08 + (u.id % 3) / 30;
  const candidates: Point[] = [];
  for (const r of (ground ? [20, 40, 72, 112, 176] : [32, 64, 104, 160])) for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6, p = { x: u.x + Math.cos(a) * r, y: u.y + Math.sin(a) * r };
    if (canStand(b, u, p.x, p.y)) candidates.push(p);
  }
  candidates.sort((a, c) => {
    const value = (p: Point) => Math.hypot(p.x - u.x, p.y - u.y) + dangers.reduce((n, d) => n + (dangerDistance(d, p.x, p.y) < d.r + u.radius + 6 ? 200 : 0), 0);
    return value(a) - value(c);
  });
  let bestCost = ground ? Infinity : stay.cost, choice: SafetyDecision | null = null;
  let blockedSearches = 0;
  for (const goal of candidates.slice(0, 20)) {
    if (!clearWalk(b, u, u, goal) && blockedSearches++ >= 3) continue;
    const plan = planPath(b, u, goal, true);
    if (plan.status !== 'ready' || !plan.path) continue;
    const eta = plan.seconds ?? Infinity;
    const risk = exposure(b, u, dangers, plan.path, reaction);
    let cost = risk.cost + eta * (u.target ? dps * 0.45 : 1);
    if (ground) cost += u.maxHp * groundRisk(b, u) * eta;
    if (cost >= bestCost || (!ground && stay.cost - cost < Math.max(2, u.maxHp * 0.015))) continue;
    bestCost = cost;
    choice = { action: ground ? 'escape' : 'dodge', reason: ground ? 'dangerous-ground' : 'safer-route', goal, hpLoss: risk.hp, seconds: eta + reaction, path: plan.path };
  }
  return choice ?? { ...hold, reason: 'no-safe-route' };
}

/** Every tick can execute a move, but candidate/path evaluation is rate limited. */
export function safetyStep(b: Battle, u: Unit, dt: number, allowArea = true): 'escape' | 'dodge' | null {
  const ground = !u.flying && u.z < 4 && groundRisk(b, u) > 0;
  const incoming = allowArea && b.dangers[u.team].some(d => (d.zone || d.at >= b.t - 0.05) && dangerDistance(d, u.x, u.y) < d.r + u.radius + 6);
  if (!ground && !incoming) { memories.delete(u); return null; }
  let memory = memories.get(u);
  if (!memory || memory.until <= b.t || memory.ground !== ground || (memory.decision.goal && !canStand(b, u, memory.decision.goal.x, memory.decision.goal.y))) {
    const decision = decideSafety(b, u, allowArea, !!memory && memory.decision.action !== 'hold' && memory.start <= b.t);
    memory = { decision, ground, at: 0, until: b.t + 0.2, start: memory?.decision.action === decision.action ? memory.start : b.t + (ground ? 0 : 0.08 + (u.id % 3) / 30) };
    memories.set(u, memory);
  }
  const { decision } = memory;
  if (!decision.goal || decision.action === 'hold' || b.t < memory.start) return null;
  // Keep the selected route: evaluating later candidates must not evict its path cache.
  const path = decision.path ?? [decision.goal];
  while (memory.at + 1 < path.length && Math.hypot(path[memory.at].x - u.x, path[memory.at].y - u.y) < 4) memory.at++;
  const next = path[memory.at];
  if (!next || !clearWalk(b, u, u, next)) { memory.until = 0; return null; }
  return steerTo(b, u, next, dt) ? decision.action : null;
}
