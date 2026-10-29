// Yuka supplies desired velocity; the battle remains the only position integrator.
import { ArriveBehavior, SeparationBehavior, Vector3, Vehicle } from 'yuka';
import type { Battle } from './sim.ts';
import type { Unit } from './unit.ts';
import { clearWalk, planPath, type PathStatus, type Point } from './navigation.ts';

interface Driver { vehicle: Vehicle; arrive: ArriveBehavior; force: Vector3; separate: Vector3; last: number }
const drivers = new WeakMap<Unit, Driver>();
const separation = new SeparationBehavior();
const spaces = new WeakMap<Battle, { tick: number; cells: Map<number, Unit[]> }>();
const CELL = 80;

function driver(u: Unit): Driver {
  let d = drivers.get(u);
  if (!d) {
    d = { vehicle: new Vehicle(), arrive: new ArriveBehavior(new Vector3(), 0.08, 1), force: new Vector3(), separate: new Vector3(), last: -1 };
    drivers.set(u, d);
  }
  d.vehicle.position.set(u.x, 0, u.y);
  d.vehicle.boundingRadius = u.radius;
  return d;
}

export function neighbors(b: Battle, u: Unit, radius = 100): Unit[] {
  const tick = Math.round(b.t * 30);
  let space = spaces.get(b);
  if (!space || space.tick !== tick) {
    space = { tick, cells: new Map() };
    for (const a of b.units) {
      if (!a.alive || a.ghost) continue;
      const key = Math.floor(a.y / CELL) * 32 + Math.floor(a.x / CELL);
      const cell = space.cells.get(key);
      if (cell) cell.push(a); else space.cells.set(key, [a]);
    }
    spaces.set(b, space);
  }
  const out: Unit[] = [], n = Math.ceil(radius / CELL), cx = Math.floor(u.x / CELL), cy = Math.floor(u.y / CELL);
  for (let y = cy - n; y <= cy + n; y++) for (let x = cx - n; x <= cx + n; x++) {
    for (const a of space.cells.get(y * 32 + x) ?? []) {
      if (a !== u && a.alive && !a.ghost && Math.hypot(a.x - u.x, a.y - u.y) < radius + a.radius) out.push(a);
    }
  }
  return out;
}

export function moveToward(b: Battle, u: Unit, goal: Point, dt: number, mul = 1): boolean {
  return movePlanned(b, u, goal, dt, mul).moved;
}

export function movePlanned(b: Battle, u: Unit, goal: Point, dt: number, mul = 1): { moved: boolean; status: PathStatus } {
  const path = planPath(b, u, goal), next = path.point;
  if (!next) { u.moving = false; return { moved: false, status: path.status }; }
  return { moved: steerTo(b, u, next, dt, mul), status: path.status };
}

export function steerTo(b: Battle, u: Unit, goal: Point, dt: number, mul = 1): boolean {
  if (u.stunned || u.speed <= 0 || dt <= 0) { u.moving = false; return false; }
  const distance = Math.hypot(goal.x - u.x, goal.y - u.y);
  if (distance < 1) { u.moving = false; return false; }
  const d = driver(u), v = d.vehicle, speed = b.moveSpeedOf(u) * mul;
  v.maxSpeed = Math.max(0.01, speed);
  if (b.t - d.last > 0.05) v.velocity.set(0, 0, 0);
  d.last = b.t;
  d.arrive.target.set(goal.x, 0, goal.y);
  d.arrive.calculate(v, d.force);
  d.force.add(v.velocity);
  const arriveSpeed = Math.min(speed, d.force.length());
  const nearby = neighbors(b, u, Math.max(80, u.radius * 3));
  v.neighbors.length = 0;
  for (const a of nearby) if (a.flying === u.flying && Math.hypot(a.x - u.x, a.y - u.y) < u.radius + a.radius + 14) v.neighbors.push(driver(a).vehicle);
  separation.calculate(v, d.separate.set(0, 0, 0));
  d.force.add(d.separate.multiplyScalar(speed * u.radius * 0.45));
  const len = Math.hypot(d.force.x, d.force.z) || 1;
  const nx = d.force.x / len, ny = d.force.z / len;
  const gx = (goal.x - u.x) / distance, gy = (goal.y - u.y) / distance;
  const side = u.id % 2 ? 1 : -1;
  let best = -Infinity, bx = 0, by = 0;
  for (const angle of [0, 0.45 * side, -0.45 * side, 0.9 * side, -0.9 * side, 1.35 * side, -1.35 * side, 1.8 * side, -1.8 * side]) {
    const c = Math.cos(angle), s = Math.sin(angle), dx = nx * c - ny * s, dy = nx * s + ny * c;
    const step = Math.min(distance, arriveSpeed * b.terrainSpeed(u, dx, dy) * dt);
    const x = u.x + dx * step, y = u.y + dy * step;
    if (!clearWalk(b, u, u, { x, y })) continue;
    let score = (dx * gx + dy * gy) * 3 - Math.abs(angle) * 0.08;
    const probe = Math.min(distance, Math.max(step, u.radius + speed * 0.25));
    for (const a of nearby) {
      if (a.flying !== u.flying) continue;
      const min = (u.radius + a.radius) * 0.96;
      const before = Math.hypot(a.x - u.x, a.y - u.y);
      const after = Math.hypot(a.x - x, a.y - y);
      if (after < min && after < before - 0.01) score -= 30 + (min - after) * 2;
      const predicted = Math.hypot(a.x - u.x - dx * probe, a.y - u.y - dy * probe);
      score -= Math.max(0, min + 3 - predicted) * 0.25;
    }
    if (score > best) { best = score; bx = x; by = y; }
  }
  if (best === -Infinity || best < -10) { v.velocity.set(0, 0, 0); u.moving = false; return false; }
  v.velocity.set((bx - u.x) / dt, 0, (by - u.y) / dt);
  const moved = Math.hypot(bx - u.x, by - u.y);
  u.x = bx; u.y = by; u.walk += moved; u.moving = moved > 0.01;
  return u.moving;
}
