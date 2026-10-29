import type { Battle } from './sim.ts';
import { IMM_BURN, type Unit } from './unit.ts';
import { S, cellX, cellY, hatesOuch, hatesWater, idx, isAquatic, isFireproof, moveMul } from './terrain.ts';

export function fireSafe(b: Battle, u: Unit): boolean {
  return isFireproof(u.mob) || !!(u.immune & IMM_BURN) || b.sides[u.team].fireImmune;
}

/** Damage per second as a fraction of maximum HP, before existing burn tails. */
export function surfaceRisk(b: Battle, u: Unit, surface: number): number {
  if (u.flying) return 0;
  if (surface === S.LAVA) return fireSafe(b, u) ? 0 : 0.04;
  if (surface === S.WATER) return hatesWater(u.mob) ? 0.03 : 0;
  if (surface === S.OUCH && !u.structure) return hatesOuch(u.mob) ? (u.boss ? 0.01 : 0.04) : 0;
  return 0;
}

export function groundRisk(b: Battle, u: Unit, x = u.x, y = u.y): number {
  return surfaceRisk(b, u, b.terrain.s[idx(cellX(x), cellY(y))]);
}

export function terrainFactor(b: Battle, u: Unit, x: number, y: number): number {
  if (u.flying) return 1;
  const i = idx(cellX(x), cellY(y));
  let factor = moveMul(u.mob, b.terrain.s[i], b.terrain.f[i]);
  if (u.ref.terrainSlowResist && b.t < u.ref.terrainSlowResist && factor < 1) factor = 1 - (1 - factor) * 0.5;
  return Math.max(0.1, factor);
}

export function waterBenefit(b: Battle, u: Unit, x: number, y: number): number {
  if (u.flying || !isAquatic(u.mob) || b.terrain.s[idx(cellX(x), cellY(y))] !== S.WATER) return 0;
  return Math.min(1, (1 - u.hpFrac) * 2) * 20;
}
