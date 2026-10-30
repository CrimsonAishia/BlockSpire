import { BehaviourTree, State } from 'mistreevous';
import type { Battle } from './sim.ts';
import type { Behavior } from './ai.ts';
import type { Unit } from './unit.ts';
import { TAC, retreatStep } from './tactics.ts';
import { contactApproach, contactGoal, followContact, releaseContact } from './engagement.ts';
import { canStand, forgetRoute, planPath, type Point } from './navigation.ts';
import { movePlanned } from './steering.ts';
import { safetyStep } from './evasion.ts';
import { firingGoal, releaseFiringSpot, visibleTarget } from './ranged_ai.ts';
import { selfDefenseTarget, isDefending } from './self_defense.ts';

export type AIAction = 'idle' | 'escape' | 'dodge' | 'retreat' | 'attack' | 'approach' | 'flank' | 'reposition' | 'wait';
interface Brain {
  tree: BehaviourTree;
  action: AIAction;
  goal: Point | null;
  nextPlan: number;
  checked: number;
  x: number;
  y: number;
  stalled: number;
  dt: number;
  attack: () => void;
  behavior: Behavior;
  blocked: Map<Unit, { until: number; x: number; y: number; version: number }>;
  rejected: { point: Point; until: number; version: number }[];
}
const brains = new WeakMap<Unit, Brain>();
export function inspectAI(u: Unit): { action: AIAction; goal: Point | null } {
  const brain = brains.get(u);
  return { action: brain?.action ?? 'idle', goal: brain?.goal ? { ...brain.goal } : null };
}

function makeBrain(b: Battle, u: Unit): Brain {
  const brain: Brain = {
    tree: null as unknown as BehaviourTree, action: 'idle', goal: null, nextPlan: 0,
    checked: b.t, x: u.x, y: u.y, stalled: 0, dt: 0, attack: () => {}, behavior: {}, blocked: new Map(), rejected: [],
  };
  const done = (action: AIAction, ok: boolean) => {
    if (ok) brain.action = action;
    return ok ? State.SUCCEEDED : State.FAILED;
  };
  brain.tree = new BehaviourTree({
    type: 'root', child: { type: 'selector', children: ['Dodge', 'Retreat', 'Attack', 'Move', 'Wait'].map(call => ({ type: 'action', call })) },
  }, {
    Dodge: () => {
      const action = safetyStep(b, u, brain.dt, TAC.dodge);
      return action ? done(action, true) : State.FAILED;
    },
    Retreat: () => done('retreat', TAC.dodge && retreatStep(b, u, brain.dt)),
    Attack: () => {
      let t = u.target;
      if (t && !u.isRanged && !brain.behavior.target && u.tauntT <= 0 && !isDefending(u, b.t) && Math.hypot(t.x - u.x, t.y - u.y) > b.reach(u, t)) {
        const inContact = b.findTarget(u, e => Math.hypot(e.x - u.x, e.y - u.y) <= b.reach(u, e));
        if (inContact) {
          u.target = t = inContact; releaseContact(b, u); forgetRoute(u);
          brain.goal = null; brain.nextPlan = 0;
        }
      }
      if (!t || Math.hypot(t.x - u.x, t.y - u.y) > b.reach(u, t) || !b.canSee(u, t)) return State.FAILED;
      // Hold a useful contact instead of continuously orbiting between swings.
      if (!u.isRanged) {
        u.moving = false;
        if (u.atkTimer <= 0) brain.attack();
        return done('attack', true);
      }
      if (u.atkTimer <= 0) { brain.attack(); return done('attack', true); }
      return State.FAILED;
    },
    Move: () => {
      const moved = move(b, u, brain), t = u.target;
      if (t && t.alive && Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1;
      // Resolve contact before the target gets its next movement step.
      if (!u.isRanged && u.atkTimer <= 0 && t?.alive && t.team !== u.team && b.canReach(u, t)
        && Math.hypot(t.x - u.x, t.y - u.y) <= b.reach(u, t) && b.canSee(u, t)) {
        brain.attack(); return done('attack', true);
      }
      return moved ? State.SUCCEEDED : State.FAILED;
    },
    Wait: () => { u.moving = false; return done('wait', true); },
  }, { getDeltaTime: () => brain.dt, random: () => b.rng.next() });
  brains.set(u, brain);
  return brain;
}

function threatened(b: Battle, u: Unit): boolean {
  for (const e of b.live[(1 - u.team) as 0 | 1]) {
    if (e.isRanged || e.structure || e.stunned || !b.canReach(e, u)) continue;
    if (Math.hypot(e.x - u.x, e.y - u.y) < b.reach(e, u) + b.moveSpeedOf(e) * 1.1) return true;
  }
  return false;
}

function move(b: Battle, u: Unit, brain: Brain): boolean {
  let t = u.target;
  if (!t || u.speed <= 0) return false;
  if (t.alive && Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1;
  const distance = Math.hypot(t.x - u.x, t.y - u.y);
  const due = b.t >= brain.nextPlan;
  if (b.t - brain.checked >= 0.6) {
    const gap = brain.goal ? Math.hypot(brain.goal.x - u.x, brain.goal.y - u.y) : distance;
    const progress = Math.hypot(u.x - brain.x, u.y - brain.y);
    const needsContact = distance > b.reach(u, t) || !b.canSee(u, t);
    brain.stalled = progress < 3 && (gap > 1 || needsContact) ? brain.stalled + b.t - brain.checked : 0;
    brain.x = u.x; brain.y = u.y; brain.checked = b.t;
  }
  const stuck = brain.stalled >= 0.6;
  if (stuck) {
    if (brain.goal && Math.hypot(brain.goal.x - u.x, brain.goal.y - u.y) < 8) {
      brain.rejected.push({ point: { ...brain.goal }, until: b.t + 1.5, version: b.terrain.ver });
    }
    forgetRoute(u); releaseContact(b, u); releaseFiringSpot(b, u); brain.goal = null; brain.stalled = 0;
  }
  if (u.isRanged) {
    if (!TAC.ranged) { brain.action = 'approach'; return distance > b.reach(u, t) && moveTo(b, u, t, brain); }
    const visible = b.canSee(u, t);
    u.noLosT = visible ? 0 : u.noLosT + brain.dt;
    if (!visible && due && !brain.behavior.target && u.tauntT <= 0) {
      const other = visibleTarget(b, u);
      if (other) { u.target = t = other; brain.goal = null; }
    }
    if (due || stuck) {
      brain.goal = firingGoal(b, u, t, true, p => accepted(b, brain, p));
      brain.nextPlan = b.t + 0.4 + (u.id % 4) / 30;
    }
    brain.action = 'reposition';
    if (brain.goal) {
      return moveTo(b, u, brain.goal, brain, threatened(b, u) ? 0.8 : 1);
    }
    // Out of range: approach safely; occluded in-range targets require a firing spot.
    if (distance <= b.reach(u, t)) { u.moving = false; return false; }
    if (threatened(b, u)) return false;
  } else if (distance < b.reach(u, t) + 90) {
    if (due || stuck) brain.goal = contactGoal(b, u, t, stuck, p => accepted(b, brain, p));
    else brain.goal = followContact(b, u, t);
    if (!brain.goal && !brain.behavior.target && u.tauntT <= 0 && (due || stuck)) {
      const candidates = [...b.live[(1 - u.team) as 0 | 1]].filter(e => e !== t && e.invisT <= 0 && b.canReach(u, e))
        .sort((a, c) => Math.hypot(a.x - u.x, a.y - u.y) - Math.hypot(c.x - u.x, c.y - u.y)).slice(0, 4);
      for (const other of candidates) {
        if (Math.hypot(other.x - u.x, other.y - u.y) > distance + 160) continue;
        if (!available(b, brain, other)) continue;
        const goal = contactGoal(b, u, other, true, p => accepted(b, brain, p));
        if (goal) {
          u.target = t = other;
          brain.goal = goal;
          u.retarget = 0.8;
          if (Math.abs(t.x - u.x) > 2) u.facing = t.x > u.x ? 1 : -1;
          break;
        }
      }
    }
    brain.action = 'flank';
    if (due || stuck) brain.nextPlan = b.t + 0.3 + (u.id % 4) / 30;
    const goal = brain.goal ?? contactApproach(b, u, t);
    return goal ? moveTo(b, u, goal, brain, 1, true) : false;
  }
  brain.action = 'approach';
  if (due) brain.nextPlan = b.t + 0.3 + (u.id % 4) / 30;
  return moveTo(b, u, t, brain, 1, !u.isRanged);
}

function available(b: Battle, brain: Brain, target: Unit): boolean {
  const blocked = brain.blocked.get(target);
  if (!blocked) return true;
  if (!target.alive || blocked.until <= b.t || blocked.version !== b.terrain.ver || Math.hypot(target.x - blocked.x, target.y - blocked.y) > 32) { brain.blocked.delete(target); return true; }
  return false;
}

function accepted(b: Battle, brain: Brain, point: Point): boolean {
  brain.rejected = brain.rejected.filter(p => p.until > b.t && p.version === b.terrain.ver);
  return !brain.rejected.some(p => Math.hypot(p.point.x - point.x, p.point.y - point.y) < 18);
}

function moveTo(b: Battle, u: Unit, goal: Point, brain: Brain, mul = 1, pursue = false): boolean {
  const result = movePlanned(b, u, goal, brain.dt, mul, pursue);
  if (result.status !== 'unreachable' || !u.target) return result.moved;
  // A bad firing/contact spot does not establish that the whole enemy is unreachable.
  if (goal !== u.target && Math.hypot(u.target.x - goal.x, u.target.y - goal.y) > 1) {
    brain.rejected.push({ point: { ...goal }, until: b.t + 1.5, version: b.terrain.ver });
    releaseContact(b, u); releaseFiringSpot(b, u); brain.goal = null; brain.nextPlan = 0;
    if (brain.behavior.target || u.tauntT > 0) return false;
    const center = planPath(b, u, u.target);
    if (center.status === 'pending' || center.status === 'ready' || center.status === 'arrived' || !canStand(b, u, u.target.x, u.target.y)) return false;
  }
  if (brain.behavior.target || u.tauntT > 0) return false;
  brain.blocked.set(u.target, { until: b.t + 1.5, x: u.target.x, y: u.target.y, version: b.terrain.ver });
  const other = b.findTarget(u, e => available(b, brain, e));
  if (!other) return false;
  const goalFor = u.isRanged ? firingGoal(b, u, other, true) : contactGoal(b, u, other, true);
  const candidate = goalFor ?? other, route = planPath(b, u, candidate);
  if (route.status === 'unreachable') {
    brain.blocked.set(other, { until: b.t + 1.5, x: other.x, y: other.y, version: b.terrain.ver });
    return false;
  }
  releaseContact(b, u); releaseFiringSpot(b, u); forgetRoute(u);
  u.target = other; u.retarget = 0.8; brain.goal = null; brain.nextPlan = 0; brain.stalled = 0;
  return route.status === 'ready' && movePlanned(b, u, candidate, brain.dt, mul).moved;
}

export function coordinatedAct(b: Battle, u: Unit, dt: number, behavior: Behavior, attack: () => void) {
  const brain = brains.get(u) ?? makeBrain(b, u);
  brain.dt = dt; brain.attack = attack; brain.behavior = behavior;
  const old = u.target;
  const valid = old && old.alive && old.team !== u.team && old.invisT <= 0 && b.canReach(u, old)
    && (u.speed > 0 || Math.hypot(old.x - u.x, old.y - u.y) <= b.reach(u, old));
  const defense = valid && TAC.target && !behavior.target && u.tauntT <= 0
    ? selfDefenseTarget(b, u, e => available(b, brain, e)) : null;
  if (defense) {
    u.target = defense;
    if (defense !== old) u.retarget = 0.75;
  } else if (!valid || u.retarget <= 0 || (u.tauntT > 0 && u.taunter?.alive && b.canReach(u, u.taunter) && old !== u.taunter)) {
    const specialized = behavior.target?.(u, b);
    u.target = specialized !== undefined ? specialized : b.findTarget(u, e => available(b, brain, e) && (u.speed > 0 || Math.hypot(e.x - u.x, e.y - u.y) <= b.reach(u, e)));
    u.retarget = 0.55 + (u.id % 4) / 30;
  }
  if (u.target !== old) {
    releaseContact(b, u); releaseFiringSpot(b, u); forgetRoute(u);
    brain.goal = null; brain.nextPlan = 0; brain.stalled = 0;
  }
  if (u.target && u.target.alive && Math.abs(u.target.x - u.x) > 2) {
    u.facing = u.target.x > u.x ? 1 : -1;
  }
  brain.tree.step();
  if ((brain.action === 'retreat' || brain.action === 'dodge' || brain.action === 'escape') && brain.goal) {
    releaseContact(b, u); releaseFiringSpot(b, u); brain.goal = null; brain.nextPlan = 0;
  }
}
