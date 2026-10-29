// Publicly telegraphed effects only: this does not predict unannounced instant attacks.
import type { Battle } from './sim.ts';
import type { Danger } from './tactics.ts';
import { IMM_KB, IMM_SLOW, IMM_STUN, type Unit } from './unit.ts';
import { fireSafe } from './terrain_policy.ts';

export function collectDangers(b: Battle) {
  for (const u of b.units) {
    if (!u.alive || u.mob.ai !== 'creeper' || !(u.ab.fuse > 0)) continue;
    const charged = u.star >= 3 || !!u.ref.charged, boom = b.boomMul(u.team);
    b.dangers[1 - u.team].push({ id: 1e6 + u.id, x: u.x, y: u.y, r: 85 * (charged ? 1.4 : 1) * boom.r,
      at: b.t + u.ab.fuse, zone: false, src: u, damage: b.atkOf(u) * (charged ? 1.8 : 1) * boom.d, dk: 'phys', control: 0.3, controlKind: 'knockback', falloff: 0.5 });
  }
  for (const d of b.delayed) {
    const dg: Danger = { id: d.id ?? 0, x: d.x, y: d.y, r: d.r, at: b.t + d.t, zone: false,
      src: d.kind === 'tnt' ? null : d.src, damage: d.dmg, dk: d.kind === 'tnt' || d.kind === 'slash' ? 'phys' : 'magic',
      control: d.kind === 'tnt' ? 0.3 : d.kind === 'ice_drop' ? 0.4 : d.kind === 'pillar' ? 0.2 : 0, falloff: d.kind === 'tnt' ? 0.5 : 0 };
    dg.controlKind = d.kind === 'ice_drop' ? 'slow' : 'knockback';
    if (d.kind === 'tnt') b.dangers[0].push(dg), b.dangers[1].push(dg);
    else b.dangers[1 - d.team].push(dg);
  }
  for (const z of b.zones) {
    if (z.kind === 'regen' || z.kind === 'bloom' || z.t >= z.dur) continue;
    b.dangers[1 - z.team].push({ id: z.id, x: z.x, y: z.y, r: z.r, at: b.t, zone: true, until: b.t + z.dur - z.t,
      src: z.src, damage: z.kind === 'honey' ? 0 : z.kind === 'fire' ? z.dps * 0.5 : z.dps,
      dk: z.kind === 'lava' || z.kind === 'fire' ? 'dot' : 'magic', burn: z.kind === 'fire' || z.kind === 'lava',
      percent: z.kind === 'lava', groundOnly: z.kind === 'lava' || z.kind === 'goo' || z.kind === 'honey', control: z.kind === 'honey' ? 0.4 : 0, controlKind: 'slow' });
  }
  for (const p of b.projs) {
    const radius = Math.max(p.aoe, p.splash);
    if (!p.alive || radius <= 0 || p.special === 'heal') continue;
    if (p.mode !== 0 && !b.coordinated[1 - p.team]) continue;
    const boom = ['big_fireball', 'wither_skull', 'blue_skull'].includes(p.kind) ? b.boomMul(p.team) : { r: 1, d: 1 };
    const eta = p.mode === 0 ? p.dur - p.t : Math.max(0, ((p.tx - p.x) * p.vx + (p.ty - p.y) * p.vy) / Math.max(1, p.speed ** 2));
    if (eta < -0.01 || eta > 4) continue;
    b.dangers[1 - p.team].push({ id: p.id, x: p.tx, y: p.ty, r: radius * boom.r, at: b.t + Math.max(0, eta), zone: false,
      src: p.src, damage: p.dmg * boom.d, dk: p.dk, proj: true, fire: p.fire,
      control: p.stun + p.slowDur * 0.2 + p.lev * 0.2, controlKind: p.stun > 0 ? 'stun' : p.slowDur > 0 ? 'slow' : undefined, falloff: p.aoe > 0 ? 0.4 : 0 });
  }
}

export const dangerDistance = (d: Danger, x: number, y: number) => Math.hypot(x - d.x, (y - d.y) * 1.15);

/** Non-mutating estimate: no crit/dodge rolls, shield consumption or onDamaged callbacks. */
export function expectedDamage(b: Battle, u: Unit, d: Danger, seconds = 1, x = u.x, y = u.y, offset = 0): number {
  if (u.ghost || (!d.zone && u.phaseImmunityTimer > Math.max(0, d.at - b.t)) || (u.flying && d.groundOnly) || (d.burn && fireSafe(b, u))) return 0;
  let amount = Math.max(0, d.damage ?? 0) * (d.percent ? u.maxHp : 1);
  if (d.zone) amount *= Math.max(0, Math.min(seconds, Math.max(0, (d.until ?? b.t + seconds) - b.t - offset)) - (d.dk === 'dot' ? 0 : Math.max(0, u.phaseImmunityTimer - offset)));
  else amount *= 1 - (d.falloff ?? 0) * Math.min(1, dangerDistance(d, x, y) / (d.r + u.radius));
  if (d.dk === 'dot') return amount;
  const src = d.src;
  if (src && src.hpFrac > 0 && u.hpFrac > 0.5) amount *= 1 + src.fx.vsHighHp;
  const armor = Math.min(0.75, Math.max(0, u.armor - u.erosionStacks * 0.04) * (1 - (src?.fx.breach ?? 0)));
  if (d.dk === 'phys') amount *= 1 - armor;
  if (d.dk === 'magic') amount *= 1 - armor * 0.5;
  amount *= u.fx.dmgTaken * u.takenMul * b.buff(u.team, 'taken');
  if (d.fire) amount *= u.fx.fireTaken * b.buff(u.team, 'fire');
  if (d.proj) amount *= u.fx.projTaken;
  if ((d.proj || src?.isRanged) && u.ref.smokeT > 0) amount *= u.ref.smokeTaken ?? 0.7;
  if (u.auraT > 0) amount *= 0.85;
  if (u.ref.closed) amount *= 0.6;
  if (d.proj && u.ref.witherArmor) amount *= 0.5;
  if (u.boss) amount = Math.min(amount, u.maxHp * 0.12);
  return amount;
}

export function expectedControl(b: Battle, u: Unit, d: Danger, offset = 0): number {
  if (u.ghost || u.phaseImmunityTimer > (d.zone ? offset : Math.max(0, d.at - b.t)) || (u.flying && d.groundOnly)) return 0;
  const immunity = d.controlKind === 'stun' ? IMM_STUN : d.controlKind === 'slow' ? IMM_SLOW : d.controlKind === 'knockback' ? IMM_KB : 0;
  return u.immune & immunity ? 0 : d.control ?? 0;
}
