// Bounded, cached grid paths for a particular firing/contact position.
import type { Battle } from './sim.ts';
import type { Unit } from './unit.ts';
import { ARENA_D, ARENA_W } from './unit.ts';
import { BLOCK, F, GD, GW, cellX, cellY, idx, isBlocked, isClimber } from './terrain.ts';
import { fireSafe, groundRisk, surfaceRisk, terrainFactor } from './terrain_policy.ts';

export interface Point { x: number; y: number }
interface Route { goal: Point; start: Point; points: Point[]; remaining: number[]; at: number; until: number; version: number; immunity: number }
export type PathStatus = 'ready' | 'arrived' | 'pending' | 'unreachable';
export interface PathResult { status: PathStatus; point?: Point; seconds?: number; path?: readonly Point[] }
const routes = new WeakMap<Unit, Route>();
const budgets = new WeakMap<Battle, { tick: number; left: number }>();
const uniformGround = new WeakMap<Battle, { version: number; uniform: boolean }>();

export function canStand(b: Battle, u: Unit, x: number, y: number, allowHazards = false): boolean {
  if (!Number.isFinite(x + y) || x < u.radius || x > ARENA_W - u.radius || y < 10 || y > ARENA_D - 10) return false;
  if (u.flying) return true;
  const r = Math.min(u.radius, BLOCK * 0.45) * 0.7;
  for (const [dx, dy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
    const cx = cellX(x + dx), cy = cellY(y + dy);
    if (isBlocked(b.terrain, cx, cy)) return false;
    const s = b.terrain.s[idx(cx, cy)];
    if (!allowHazards && surfaceRisk(b, u, s) > 0) return false;
  }
  return true;
}

export function clearWalk(b: Battle, u: Unit, from: Point, to: Point): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / 8));
  let safe = canStand(b, u, from.x, from.y);
  for (let k = 1; k <= n; k++) {
    const x = from.x + (to.x - from.x) * k / n, y = from.y + (to.y - from.y) * k / n;
    if (canStand(b, u, x, y)) safe = true;
    else if (safe || !canStand(b, u, x, y, true)) return false;
  }
  return true;
}

export function forgetRoute(u: Unit) { routes.delete(u); }

/** Weighted walking distance; unlike geometric distance this includes water and climbing. */
export function travelCost(b: Battle, u: Unit, from: Point, to: Point): number {
  const distance = Math.hypot(to.x - from.x, to.y - from.y), n = Math.max(1, Math.ceil(distance / 8));
  let uniform = uniformGround.get(b);
  if (!uniform || uniform.version !== b.terrain.ver) {
    const t = b.terrain;
    uniform = { version: t.ver, uniform: t.h.every(h => h === t.h[0]) && t.s.every(s => s === t.s[0]) && !t.f.includes(F.COBWEB) };
    uniformGround.set(b, uniform);
  }
  if (u.flying || uniform.uniform) return distance / terrainFactor(b, u, from.x, from.y);
  let cost = 0, previousHeight = b.terrain.h[idx(cellX(from.x), cellY(from.y))];
  for (let k = 1; k <= n; k++) {
    const x = from.x + (to.x - from.x) * k / n, y = from.y + (to.y - from.y) * k / n;
    const height = b.terrain.h[idx(cellX(x), cellY(y))];
    cost += distance / n / terrainFactor(b, u, x, y);
    if (!u.flying && !isClimber(u.mob)) cost += Math.max(0, height - previousHeight) * BLOCK * 1.4;
    previousHeight = height;
  }
  return cost;
}

export function planPath(b: Battle, u: Unit, goal: Point, detail = false): PathResult {
  if (!canStand(b, u, goal.x, goal.y)) return { status: 'unreachable' };
  const distance = Math.hypot(goal.x - u.x, goal.y - u.y);
  if (distance < 1) return { status: 'arrived', seconds: 0 };
  const direct = clearWalk(b, u, u, goal) ? travelCost(b, u, u, goal) : Infinity;
  if (direct <= distance * 1.04) { routes.delete(u); return { status: 'ready', point: goal, seconds: direct / Math.max(1, b.moveSpeedOf(u)), path: detail ? [goal] : undefined }; }
  let route = routes.get(u);
  const immunity = u.immune + (fireSafe(b, u) ? 256 : 0);
  if (!route || route.immunity !== immunity || route.version !== b.terrain.ver || route.until < b.t || Math.hypot(route.goal.x - goal.x, route.goal.y - goal.y) > 20 || (!route.points.length && Math.hypot(u.x - route.start.x, u.y - route.start.y) > BLOCK)) {
    const tick = Math.round(b.t * 30);
    let budget = budgets.get(b);
    if (!budget || budget.tick !== tick) { budget = { tick, left: 6 }; budgets.set(b, budget); }
    if (budget.left-- <= 0) return Number.isFinite(direct) ? { status: 'ready', point: goal, seconds: direct / Math.max(1, b.moveSpeedOf(u)), path: detail ? [goal] : undefined } : { status: 'pending' };
    let points = findPath(b, u, goal);
    let cost = 0, prev: Point = u;
    for (const p of points) { cost += travelCost(b, u, prev, p); prev = p; }
    if (Number.isFinite(direct) && (!points.length || direct <= cost * 1.02)) points = [goal];
    const remaining = points.map(() => 0);
    for (let i = points.length - 2; i >= 0; i--) remaining[i] = remaining[i + 1] + travelCost(b, u, points[i], points[i + 1]);
    route = { goal: { ...goal }, start: { x: u.x, y: u.y }, points, remaining, at: 0, until: b.t + 0.9, version: b.terrain.ver, immunity };
    routes.set(u, route);
  }
  const end = route.points.length - 1;
  if (end >= 0 && Math.hypot(route.goal.x - goal.x, route.goal.y - goal.y) > 0.01) {
    const from = end > 0 ? route.points[end - 1] : u;
    if (!clearWalk(b, u, from, goal)) { routes.delete(u); return { status: 'pending' }; }
    route.goal = { ...goal }; route.points[end] = { ...goal };
    route.at = Math.min(route.at, end);
    for (let i = end - 1; i >= 0; i--) route.remaining[i] = route.remaining[i + 1] + travelCost(b, u, route.points[i], route.points[i + 1]);
  }
  while (route.at < route.points.length && Math.hypot(route.points[route.at].x - u.x, route.points[route.at].y - u.y) < (route.at === route.points.length - 1 ? 1 : 7)) route.at++;
  if (route.at >= route.points.length) return { status: route.points.length ? 'arrived' : 'unreachable' };
  // Skip redundant corners only when the whole segment is safe.
  while (route.at + 1 < route.points.length) {
    const p = route.points[route.at], q = route.points[route.at + 1];
    if (!clearWalk(b, u, u, q) || travelCost(b, u, u, q) > (travelCost(b, u, u, p) + travelCost(b, u, p, q)) * 1.02) break;
    route.at++;
  }
  const next = route.points[route.at];
  if (!clearWalk(b, u, u, next)) { routes.delete(u); return { status: 'pending' }; }
  return { status: 'ready', point: next, seconds: (travelCost(b, u, u, next) + route.remaining[route.at]) / Math.max(1, b.moveSpeedOf(u)), path: detail ? route.points.slice(route.at) : undefined };
}

export function waypoint(b: Battle, u: Unit, goal: Point): Point | null {
  return planPath(b, u, goal).point ?? null;
}

function findPath(b: Battle, u: Unit, goal: Point): Point[] {
  const start = idx(cellX(u.x), cellY(u.y)), end = idx(cellX(goal.x), cellY(goal.y));
  const size = GW * GD, costs = new Float64Array(size).fill(Infinity), parents = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size), open = [start];
  const point = (i: number): Point => i === start ? { x: u.x, y: u.y } : i === end ? goal : { x: (i % GW + 0.5) * BLOCK, y: (Math.floor(i / GW) + 0.5) * BLOCK };
  const heuristic = (i: number) => Math.hypot(i % GW - end % GW, Math.floor(i / GW) - Math.floor(end / GW)) * BLOCK / 1.25;
  costs[start] = 0;
  for (let visits = 0; open.length && visits < size; visits++) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (costs[open[k]] + heuristic(open[k]) < costs[open[best]] + heuristic(open[best])) best = k;
    const c = open.splice(best, 1)[0];
    if (closed[c]) continue;
    if (c === end) {
      const out: Point[] = [];
      for (let at = end; at !== start; at = parents[at]) out.push(point(at));
      out.reverse();
      return out;
    }
    closed[c] = 1;
    const cx = c % GW, cy = Math.floor(c / GW), from = point(c);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if ((!dx && !dy) || cx + dx < 0 || cx + dx >= GW || cy + dy < 0 || cy + dy >= GD) continue;
      const j = idx(cx + dx, cy + dy), to = point(j);
      if (closed[j] || !clearWalk(b, u, from, to)) continue;
      if (dx && dy && (!canStand(b, u, to.x, from.y) || !canStand(b, u, from.x, to.y))) continue;
      const cost = costs[c] + travelCost(b, u, from, to) + groundRisk(b, u, to.x, to.y) * Math.hypot(to.x - from.x, to.y - from.y) * 80;
      if (cost >= costs[j]) continue;
      if (costs[j] === Infinity) open.push(j);
      costs[j] = cost;
      parents[j] = c;
    }
  }
  return [];
}
