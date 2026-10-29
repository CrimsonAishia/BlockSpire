// Execution of commander sub-tactics in battle simulation.
// Implements targets, budgets, variants, orders, cooldowns and effects from commander-rebalance-proposal.md.
import type { Battle } from './sim.ts';
import { Unit, ARENA_W } from './unit.ts';
import { ACT_K } from './skills.ts';
import { cannonCost, ORDER_COOLDOWN, tacticConfig, tacticProfile } from '../data/tactics.ts';
import { previewRetreat, retreatPath, tacticTargets, type Point } from './tactic_targets.ts';

export interface TacticResult {
  ok: boolean;
  reason?: string;
}

/** Stable target sort: distance ascending, then unit id ascending */
function sortTargets(targets: Unit[], cx: number, cy: number): Unit[] {
  return targets.sort((a, b) => {
    const da = (a.x - cx) ** 2 + ((a.y - cy) * 1.15) ** 2;
    const db = (b.x - cx) ** 2 + ((b.y - cy) * 1.15) ** 2;
    if (Math.abs(da - db) > 0.1) return da - db;
    return a.id - b.id;
  });
}

/** Check whether a tactic can be used (for UI enabling and validation) */
export function canUseTactic(b: Battle, team: 0 | 1): TacticResult {
  const plan = b.sides[team].plan;
  const tac = plan.tactic;
  if (!tac) return { ok: false, reason: '未装备副战术' };
  if (b.over) return { ok: false, reason: '战斗已结束' };
  if (b.pendingTactics[team]) return { ok: false, reason: '副战术正在施放，可取消后重新瞄准' };
  if ((b.orders?.[team] ?? 0) <= 0) return { ok: false, reason: '军令不足（本场最多 2 点）' };
  if ((b.orderCooldown?.[team] ?? 0) > 0) {
    const cd = Math.ceil(b.orderCooldown[team]);
    return { ok: false, reason: `冷却中（还需 ${cd} 秒）` };
  }
  if (tac.id === 'cannon') {
    const act = plan.act ?? 1;
    const cost = cannonCost(act, tac.variant);
    const emeralds = b.battleEmeralds?.[team] ?? 0;
    if (emeralds < cost) {
      return { ok: false, reason: `绿宝石不足（需要 ${cost} 绿宝石）` };
    }
  }
  return { ok: true };
}

/** Executes the equipped tactic for team at (x, y) or on target */
export function executeTactic(
  b: Battle,
  team: 0 | 1,
  x: number,
  y: number,
  targetUnit: Unit | null = null,
  rallyPoint: Point | null = null,
  selectedIds?: number[],
  castId?: number,
): TacticResult {
  const check = canUseTactic(b, team);
  if (!check.ok) return check;

  const plan = b.sides[team].plan;
  const tac = plan.tactic!;
  const act = plan.act ?? 1;
  const K = ACT_K[act] ?? ACT_K[ACT_K.length - 1];
  const foeTeam = (1 - team) as 0 | 1;
  const variant = tac.variant;
  const preview = tacticTargets(b, team, { x, y }, targetUnit, selectedIds);
  if (!preview.ok) return preview;
  if (tac.id === 'horn') {
    if (!rallyPoint) return { ok: false, reason: '请先选择友军，再选择集合点' };
    const route = previewRetreat(b, preview.units, rallyPoint);
    if (!route.ok) return route;
  }

  switch (tac.id) {
    case 'tnt': {
      const radius = 90;
      const isDirectional = variant === 'directional';
      const isConcussion = variant === 'concussion';

      const maxTargets = isDirectional ? 2 : 5;
      const perTargetDmg = (isDirectional ? 65 : isConcussion ? 20 : 40) * K;
      const budget = (isDirectional ? 130 : isConcussion ? 60 : 120) * K;
      const knockDist = isDirectional ? 30 : 60;
      const baseStun = isDirectional ? 0 : isConcussion ? 0.9 : 0.5;

      const candidates: Unit[] = [];
      b.aoe(x, y, radius, team, (e) => {
        if (e.alive && !e.structure) candidates.push(e);
      });
      if (candidates.length === 0) return { ok: false, reason: '范围内没有合法的敌人' };

      const chosen = sortTargets(candidates, x, y).slice(0, maxTargets);
      const totalDemand = chosen.length * perTargetDmg;
      const actualDmg = totalDemand > budget ? perTargetDmg * (budget / totalDemand) : perTargetDmg;

      // Deduct order and set 8s cooldown
      b.orders[team]--;
      b.orderCooldown[team] = ORDER_COOLDOWN;
      b.emit({ k: 'boom', x, y, r: radius, color: '#e74c3c', big: true });
      b.emit({ k: 'sfx', id: 'explode', v: 0.8 });

      const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
      const sy = 160;
      const prof = isDirectional ? 'tnt__directional' : isConcussion ? 'tnt__concussive' : 'tnt';
      b.emit({
        k: 'tactic_vfx', phase: 'impact', castId,
        profile: prof,
        sx, sy, tx: x, ty: y,
        units: chosen.map((u) => ({ id: u.id, x: u.x, y: u.y })),
        context: { controlApplied: !isDirectional },
      });

      for (const e of chosen) {
        if (!e.alive) continue;
        b.damage(null, e, actualDmg, 'phys', { noCrit: true });
        if (!e.boss) {
          b.knock(e, x, y, knockDist);
          if (baseStun > 0) {
            let stunDuration = baseStun;
            if (b.t - (e.ref.lastTacticStunTime ?? -999) < 8) {
              stunDuration *= 0.5;
            }
            e.ref.lastTacticStunTime = b.t;
            b.stun(e, stunDuration);
          }
        } else if (baseStun > 0) {
          // Boss: no knockback, stun cap 0.15s (0 if immune)
          b.stun(e, Math.min(0.15, baseStun));
        }
      }
      b.emit({ k: 'text', x, y, z: 60, s: isDirectional ? '定向爆破!' : isConcussion ? '震荡爆破!' : '遥控爆破!', color: '#e74c3c' });
      return { ok: true };
    }

    case 'horn': {
      const radius = 120;
      const isCover = variant === 'cover';
      const isPack = variant === 'pack';

      const maxTargets = isPack ? 3 : 4;
      const speedBonus = isCover ? 0.2 : 0.4;
      const duration = isPack ? 2 : 3;
      const maxDistance = isCover ? 110 : 140;
      const rx = rallyPoint!.x;
      const ry = rallyPoint!.y;

      const chosen = preview.units.slice(0, maxTargets);
      b.orders[team]--;
      b.orderCooldown[team] = ORDER_COOLDOWN;
      b.emit({ k: 'sfx', id: 'horn', v: 0.8 });
      b.emit({ k: 'zone', x, y, r: radius, color: '#f39c12', t: 1.5 });

      const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
      const sy = 160;
      const prof = isCover ? 'horn__cover' : isPack ? 'horn__pack' : 'horn';
      b.emit({
        k: 'tactic_vfx', phase: 'impact', castId,
        profile: prof,
        sx, sy, tx: rx, ty: ry,
        units: chosen.map((u) => ({ id: u.id, x: u.x, y: u.y })),
      });

      const group = { units: chosen, arrived: new Set<number>(), failed: false, pack: isPack };
      for (const a of chosen) {
        b.cancelCast(a, 'break');
        a.target = null;
        a.ref.hornMarch = {
          path: retreatPath(b, a, { x: rx, y: ry }, maxDistance)!,
          group,
          terrainVer: b.terrain.ver,
          tx: rx,
          ty: ry,
          leftDist: maxDistance,
          dur: duration,
          speedMul: 1 + speedBonus,
          coverDmgMul: isCover ? 0.85 : 1,
          packBonus: isPack,
        };
      }
      b.emit({ k: 'text', x: rx, y: ry, z: 50, s: isCover ? '掩护撤退!' : isPack ? '猎群回旋!' : '战术撤退!', color: '#f39c12' });
      return { ok: true };
    }

    case 'acid': {
      const radius = 70;
      const isDearmor = variant === 'dearmor';
      const isCorrode = variant === 'corrode';

      const maxTargets = 3;
      const normalFraction = isCorrode ? 0.5 : 0.35;
      const bossFraction = isCorrode ? 0.2 : 0.15;
      const perTargetCap = 120 * K;
      const totalCap = 180 * K;
      const armorRed = isDearmor ? 0.18 : isCorrode ? 0 : 0.1;
      const dur = isDearmor ? 3 : 4;

      const candidates: Unit[] = [];
      b.aoe(x, y, radius, team, (e) => {
        if (e.alive && !e.structure) candidates.push(e);
      });
      if (candidates.length === 0) return { ok: false, reason: '范围内没有合法的敌人' };

      const chosen = sortTargets(candidates, x, y).slice(0, maxTargets);
      b.orders[team]--;
      b.orderCooldown[team] = 8;
      b.emit({ k: 'boom', x, y, r: radius, color: '#27ae60', big: false });
      b.emit({ k: 'sfx', id: 'potion_throw', v: 0.7 });

      const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
      const sy = 160;
      const prof = isDearmor ? 'acid__strip_armor' : isCorrode ? 'acid__dissolve_shield' : 'acid';
      b.emit({
        k: 'tactic_vfx', phase: 'impact', castId,
        profile: prof,
        sx, sy, tx: x, ty: y,
        units: chosen.map((u) => ({ id: u.id, x: u.x, y: u.y, shieldRemoved: !isDearmor && u.shield > 0, armorReduced: armorRed > 0 && u.armor > 0 })),
        context: { shieldRemoved: !isDearmor && chosen.some(u => u.shield > 0), armorReduced: armorRed > 0 && chosen.some(u => u.armor > 0) },
      });

      if (!isDearmor) {
        const demands = chosen.map((e) => {
          if (e.shield <= 0) return 0;
          const frac = e.boss ? bossFraction : normalFraction;
          return Math.min(e.shield * frac, perTargetCap);
        });
        const sumDemand = demands.reduce((acc, v) => acc + v, 0);
        const scale = sumDemand > totalCap && sumDemand > 0 ? totalCap / sumDemand : 1;

        chosen.forEach((e, i) => {
          const shred = demands[i] * scale;
          if (shred > 0) {
            e.consumeShield(shred);
            b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.size + 15, s: `-${Math.round(shred)} 盾!`, color: '#2ecc71' });
          }
        });
      }

      if (armorRed > 0) {
        for (const e of chosen) {
          const removed = Math.min(Math.max(0, e.armor), armorRed);
          e.armor -= removed;
          b.addTimedAction(dur, () => { e.armor += removed; });
          b.emit({ k: 'text', x: e.x, y: e.y, z: e.gz + e.size + 8, s: `破甲 -${Math.round(removed * 100)}%!`, color: '#1abc9c' });
        }
      }
      return { ok: true };
    }

    case 'cannon': {
      const isScatter = variant === 'scatter';
      const isHeavy = variant === 'heavy';
      const cost = cannonCost(act, variant);

      if ((b.battleEmeralds?.[team] ?? 0) < cost) {
        return { ok: false, reason: `绿宝石不足（需要 ${cost} 绿宝石）` };
      }

      if (isScatter) {
        const radius = 70;
        const candidates: Unit[] = [];
        b.aoe(x, y, radius, team, (e) => {
          if (e.alive && !e.structure) candidates.push(e);
        });
        if (candidates.length === 0) return { ok: false, reason: '范围内没有合法的敌人' };

        const chosen = sortTargets(candidates, x, y).slice(0, 3);
        b.orders[team]--;
        b.orderCooldown[team] = 8;
        b.battleEmeralds[team] -= cost;
        b.cannonSpent[team] = (b.cannonSpent[team] ?? 0) + cost;

        b.emit({ k: 'boom', x, y, r: radius, color: '#2ecc71', big: false });
        b.emit({ k: 'sfx', id: 'stomp', v: 0.9 });

        const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
        const sy = 160;
        b.emit({
          k: 'tactic_vfx', phase: 'impact', castId,
          profile: 'cannon__buckshot',
          sx, sy, tx: x, ty: y,
          units: chosen.map((u) => ({ id: u.id, x: u.x, y: u.y })),
        });

        const dmgEach = 30 * K;
        for (const e of chosen) {
          b.damage(null, e, dmgEach, 'phys', { noCrit: true });
        }
        b.emit({ k: 'text', x, y, z: 60, s: `散钞弹! -${cost}💎`, color: '#2ecc71' });
        return { ok: true };
      }

      // Single target cannon (base or heavy)
      const target = targetUnit && targetUnit.alive && !targetUnit.structure && targetUnit.team === foeTeam ? targetUnit : null;
      if (!target) return { ok: false, reason: '请选择一个敌方目标' };

      b.orders[team]--;
      b.orderCooldown[team] = 8;
      b.battleEmeralds[team] -= cost;
      b.cannonSpent[team] = (b.cannonSpent[team] ?? 0) + cost;

      const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
      const sy = 160;
      b.emit({
        k: 'tactic_vfx', phase: 'impact', castId,
        profile: isHeavy ? 'cannon__recast' : 'cannon',
        sx, sy, tx: target.x, ty: target.y,
        units: [{ id: target.id, x: target.x, y: target.y }],
      });

      const dmg = (isHeavy ? 90 : 60) * K;
      b.emit({ k: 'hit', x: target.x, y: target.y, z: target.gz + target.size, big: true, color: '#2ecc71' });
      b.emit({ k: 'sfx', id: 'stomp', v: 1.0 });
      b.damage(null, target, dmg, 'phys', { noCrit: true });
      b.emit({ k: 'text', x: target.x, y: target.y, z: target.gz + target.size + 15, s: `${isHeavy ? '重铸弹' : '钱炮'}! -${cost}💎`, color: '#2ecc71' });
      return { ok: true };
    }

    case 'smoke': {
      const radius = 100;
      const isWide = variant === 'wide';
      const isCleanse = variant === 'cleanse';

      const maxTargets = isWide ? 6 : 4;
      const dmgMul = isWide || isCleanse ? 0.85 : 0.7;

      const candidates: Unit[] = [];
      b.aoeAllies(x, y, radius, team, (a) => {
        if (a.alive && !a.structure) candidates.push(a);
      });
      if (candidates.length === 0) return { ok: false, reason: '范围内没有友军' };

      const chosen = sortTargets(candidates, x, y).slice(0, maxTargets);
      b.orders[team]--;
      b.orderCooldown[team] = 8;

      b.emit({ k: 'zone', x, y, r: radius, color: '#7f8c8d', t: 3 });
      b.emit({ k: 'sfx', id: 'poof', v: 0.7 });

      const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
      const sy = 160;
      const prof = isCleanse ? 'smoke__cleanse' : isWide ? 'smoke__broad' : 'smoke';
      b.emit({
        k: 'tactic_vfx', phase: 'impact', castId,
        profile: prof,
        sx, sy, tx: x, ty: y,
        units: chosen.map((u) => ({ id: u.id, x: u.x, y: u.y, dispelled: isCleanse && (u.burnT > 0 || u.poisonT > 0) })),
        context: { dispelled: isCleanse && chosen.some(u => u.burnT > 0 || u.poisonT > 0) },
      });

      for (const a of chosen) {
        a.ref.smokeT = 3;
        a.ref.smokeTaken = dmgMul;
        if (isCleanse) {
          if (a.burnT > 0) a.burnT = 0;
          else if (a.poisonT > 0) {
            a.poisonT = 0;
            a.poisonStacks = 0;
          }
        }
      }
      b.emit({ k: 'text', x, y, z: 50, s: isCleanse ? '净化烟幕!' : isWide ? '宽幅烟幕!' : '烟幕掩护!', color: '#bdc3c7' });
      return { ok: true };
    }

    case 'ward': {
      const radius = 90;
      const isLone = variant === 'lone';
      const isRelay = variant === 'relay';

      const maxTargets = isLone ? 1 : isRelay ? 5 : 3;
      const perTargetShield = (isLone ? 65 : isRelay ? 18 : 30) * K;
      const totalBudget = (isLone ? 65 : 75) * K;

      const candidates: Unit[] = [];
      b.aoeAllies(x, y, radius, team, (a) => {
        if (a.alive && !a.structure) candidates.push(a);
      });
      if (candidates.length === 0) return { ok: false, reason: '范围内没有友军' };

      const chosen = sortTargets(candidates, x, y).slice(0, maxTargets);
      const totalDemand = chosen.length * perTargetShield;
      const actualShield = totalDemand > totalBudget ? perTargetShield * (totalBudget / totalDemand) : perTargetShield;

      b.orders[team]--;
      b.orderCooldown[team] = 8;
      b.emit({ k: 'sfx', id: 'levelup', v: 0.7 });
      b.emit({ k: 'zone', x, y, r: radius, color: '#3498db', t: 1.5 });

      const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
      const sy = 160;
      const prof = isLone ? 'ward__lone' : isRelay ? 'ward__relay' : 'ward';
      b.emit({
        k: 'tactic_vfx', phase: 'impact', castId,
        profile: prof,
        sx, sy, tx: x, ty: y,
        units: chosen.map((u) => ({ id: u.id, x: u.x, y: u.y })),
        context: { shieldPresent: true },
      });

      for (const a of chosen) {
        const before = a.shield;
        a.addSynergyShield('ward', actualShield, 4);
        const added = a.shield - before;
        if (added > 0) b.emit({ k: 'text', x: a.x, y: a.y, z: a.gz + a.size + 15, s: `+${Math.round(added)} 护盾!`, color: '#3498db' });
      }
      b.emit({ k: 'text', x, y, z: 60, s: isLone ? '孤军护符!' : isRelay ? '接力护符!' : '应急护符!', color: '#3498db' });
      return { ok: true };
    }
  }

  return { ok: false, reason: '未知副战术' };
}

export interface PendingTactic {
  id: number;
  x: number;
  y: number;
  target: Unit | null;
  rally: Point | null;
  ids?: number[];
  readyAt: number;
  cost: number;
}

export function requestTactic(b: Battle, team: 0 | 1, x: number, y: number, target: Unit | null, rally: Point | null, ids?: number[]): TacticResult {
  const ready = canUseTactic(b, team);
  if (!ready.ok) return ready;
  const tac = b.sides[team].plan.tactic!;
  const preview = tacticTargets(b, team, { x, y }, target, ids);
  if (!preview.ok) return preview;
  if (tac.id === 'horn') {
    if (!rally) return { ok: false, reason: '请先选择友军，再选择集合点' };
    const route = previewRetreat(b, preview.units, rally);
    if (!route.ok) return route;
  }
  const cost = tac.id === 'cannon' ? cannonCost(b.sides[team].plan.act, tac.variant) : 0;
  b.orders[team]--;
  b.battleEmeralds[team] -= cost;
  const id = ++b.tacticSequence;
  const windup = tacticConfig(tac.id, tac.variant).windup;
  b.emit({ k: 'tactic_vfx', profile: tacticProfile(tac.id, tac.variant), phase: 'windup', castId: id, windup,
    sx: team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85, sy: 160, tx: rally?.x ?? x, ty: rally?.y ?? y,
    units: preview.units.map(u => ({ id: u.id, x: u.x, y: u.y })) });
  b.pendingTactics[team] = { id, x, y, target, rally, ids: tac.id === 'horn' ? preview.units.map(u => u.id) : undefined,
    readyAt: b.t + tacticConfig(tac.id, tac.variant).windup, cost };
  return { ok: true };
}

export function cancelTactic(b: Battle, team: 0 | 1): boolean {
  const cast = b.pendingTactics[team];
  if (!cast) return false;
  const tac = b.sides[team].plan.tactic!;
  b.emit({ k: 'tactic_vfx', profile: tacticProfile(tac.id, tac.variant), phase: 'cancel', castId: cast.id,
    sx: 0, sy: 0, tx: cast.x, ty: cast.y });
  b.pendingTactics[team] = null;
  b.orders[team]++;
  b.battleEmeralds[team] += cast.cost;
  return true;
}

/** Only simulation time advances casts and status durations. */
export function tickTacticUnits(b: Battle, dt: number) {
  for (const team of [0, 1] as const) {
    const cast = b.pendingTactics[team];
    if (cast && b.t + 1e-8 >= cast.readyAt) {
      cancelTactic(b, team);
      const result = executeTactic(b, team, cast.target?.x ?? cast.x, cast.target?.y ?? cast.y, cast.target, cast.rally, cast.ids, cast.id);
      if (!result.ok) b.emit({ k: 'text', x: cast.x, y: cast.y, z: 60, s: result.reason ?? '施放取消，资源已返还', color: '#ffeaa7' });
    }
    for (const u of b.live[team]) {
      if (!u.alive) continue;
      if (u.ref.smokeT > 0) {
        u.ref.smokeT = Math.max(0, u.ref.smokeT - dt);
        if (!u.ref.smokeT) delete u.ref.smokeTaken;
      }
      const march = u.ref.hornMarch;
      if (march) {
        march.dur -= dt;
        if (march.dur <= 0) { march.group.failed = true; delete u.ref.hornMarch; }
      }
    }
  }
}

/** Called instead of normal unit AI, after crowd control has been checked. */
export function tickHornMarch(b: Battle, u: Unit, dt: number): boolean {
  const march = u.ref.hornMarch;
  if (!march) return false;
  const group = march.group as { units: Unit[]; arrived: Set<number>; failed: boolean; pack: boolean };
  if (march.dur <= 0 || march.leftDist <= 0) {
    group.failed = true;
    delete u.ref.hornMarch;
    u.moving = false;
    return true;
  }
  const waypoint = march.path[0] as Point | undefined;
  if (!waypoint) {
    group.arrived.add(u.id);
    delete u.ref.hornMarch;
    u.moving = false;
    if (group.pack && !group.failed && group.units.every(a => a.alive && group.arrived.has(a.id))) {
      for (const a of group.units) {
        a.ref.hornPackUntil = b.t + 3;
        a.hasteT = Math.max(a.hasteT, 3);
        a.hasteMul = Math.max(a.hasteMul, 1.15);
        b.emit({ k: 'text', x: a.x, y: a.y, z: a.gz + a.size + 10, s: '猎群攻速 +15%!', color: '#f39c12' });
      }
    }
    return true;
  }
  const dx = waypoint.x - u.x, dy = waypoint.y - u.y, dist = Math.hypot(dx, dy);
  if (dist <= 3) { march.path.shift(); return true; }
  const distance = Math.min(dist, march.leftDist, b.moveSpeedOf(u) * march.speedMul * b.terrainSpeed(u, dx / dist, dy / dist) * dt);
  const nx = u.x + dx / dist * distance, ny = u.y + dy / dist * distance;
  // Terrain can change after the order was issued.
  if (march.terrainVer !== b.terrain.ver) {
    const route = retreatPath(b, u, { x: march.tx, y: march.ty }, march.leftDist + 3);
    if (route) { march.path = route; march.terrainVer = b.terrain.ver; return true; }
    march.group.failed = true;
    delete u.ref.hornMarch;
    return true;
  }
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
    group.failed = true;
    delete u.ref.hornMarch;
    return true;
  }
  u.x = nx;
  u.y = ny;
  march.leftDist -= distance;
  u.moving = true;
  u.facing = dx < 0 ? -1 : 1;
  return true;
}

