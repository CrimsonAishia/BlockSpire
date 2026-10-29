import type { Battle } from './sim.ts';
import type { Unit } from './unit.ts';
import { ARENA_W, ARENA_D } from './unit.ts';
import { BLOCK, GW, GD, cellX, cellY, idx, isBlocked, SURFACE_INFO } from './terrain.ts';
import { tacticConfig } from '../data/tactics.ts';

export interface Point { x: number; y: number }
export interface TacticPreview { ok: boolean; reason?: string; units: Unit[] }

export function validPoint(p: Point): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x < ARENA_W && p.y >= 0 && p.y < ARENA_D;
}

export function tacticTargets(b: Battle, team: 0 | 1, p: Point, target: Unit | null = null, ids?: number[]): TacticPreview {
  const tac = b.sides[team].plan.tactic;
  if (!tac || !validPoint(p)) return { ok: false, reason: '请选择战场内的目标', units: [] };
  const def = tacticConfig(tac.id, tac.variant);
  const ally = def.targetType === 'ally_area' || def.targetType === 'ally_move';
  let units: Unit[] = [];
  if (def.targetType === 'enemy_single') {
    if (target && target.alive && !target.structure && target.team !== team && b.units.includes(target)) units = [target];
  } else if (ids && tac.id === 'horn') {
    units = b.live[team].filter(u => ids.includes(u.id) && u.alive && !u.structure && u.speed > 0);
  } else {
    const add = (u: Unit) => { if (u.alive && !u.structure && (tac.id !== 'horn' || u.speed > 0)) units.push(u); };
    if (ally) b.aoeAllies(p.x, p.y, def.radius ?? 0, team, add);
    else b.aoe(p.x, p.y, def.radius ?? 0, team, add);
    units.sort((a, c) => {
      const d = (a.x - p.x) ** 2 + ((a.y - p.y) * 1.15) ** 2 - (c.x - p.x) ** 2 - ((c.y - p.y) * 1.15) ** 2;
      return Math.abs(d) > 0.1 ? d : a.id - c.id;
    });
  }
  units = units.slice(0, def.maxTargets ?? 1);
  return { ok: units.length > 0, reason: units.length ? undefined : ally ? '范围内没有可用的友军' : '请选择合法的敌方目标', units };
}

/** Safe route only; previewRetreat validates command direction before reserving and committing a cast. */
export function retreatPath(b: Battle, u: Unit, p: Point, maxDistance: number): Point[] | null {
  if (!validPoint(p) || (u.team === 0 ? p.x >= ARENA_W / 2 : p.x < ARENA_W / 2)) return null;
  const t = b.terrain;
  const gx = cellX(p.x), gy = cellY(p.y), goal = idx(gx, gy);
  const safe = (x: number, y: number) => x >= 0 && x < GW && y >= 0 && y < GD &&
    !isBlocked(t, x, y) && !SURFACE_INFO[t.s[idx(x, y)]]?.liquid;
  if (!safe(gx, gy)) return null;
  if (u.flying) return Math.hypot(p.x - u.x, p.y - u.y) <= maxDistance ? [p] : null;
  const start = idx(cellX(u.x), cellY(u.y));
  const parent = new Int32Array(GW * GD).fill(-1);
  const queue = [start];
  parent[start] = start;
  for (let at = 0; at < queue.length && parent[goal] < 0; at++) {
    const c = queue[at], cx = c % GW, cy = Math.floor(c / GW);
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (!safe(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (parent[ni] >= 0 || Math.abs(t.h[ni] - t.h[c]) > 1) continue;
      parent[ni] = c;
      queue.push(ni);
    }
  }
  if (parent[goal] < 0) return null;
  const route: Point[] = [];
  for (let c = goal; c !== start; c = parent[c]) route.push({ x: (c % GW + 0.5) * BLOCK, y: (Math.floor(c / GW) + 0.5) * BLOCK });
  route.reverse();
  if (route.length) route[route.length - 1] = p;
  else route.push(p);
  let distance = 0, prev: Point = u;
  for (const next of route) { distance += Math.hypot(next.x - prev.x, next.y - prev.y); prev = next; }
  return distance <= maxDistance + 0.01 ? route : null;
}

export function previewRetreat(b: Battle, units: Unit[], p: Point): TacticPreview {
  // Forward is fixed by team, never by the unit's current facing. Check every selected unit.
  if (units.some(u => (p.x - u.x) * (u.team === 0 ? 1 : -1) > 1e-6)) {
    return { ok: false, reason: '集合点必须在所有选中友军的后方或侧方，不能向前进攻', units };
  }
  const range = b.sides[units[0]?.team ?? 0].plan.tactic?.variant === 'cover' ? 110 : 140;
  const ok = units.length > 0 && units.every(u => u.alive && retreatPath(b, u, p, range));
  return { ok, reason: ok ? undefined : '集合点须在我方安全地面，且所有选中友军都能在撤退距离内到达', units };
}
