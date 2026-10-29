// Commander skills used from the hotbar: Steve's building, Alex's taming and the Villager's
// hired iron golem (the Witch's brew is a free item, see BattleStage). Deterministic like the
// rest of the sim; the UI and the bot call Battle.useSkill.
import { mobDef } from '../data/mobs.ts';
import type { Battle } from './sim.ts';
import { BLOCK, F, GD, GW, SURFACE_INFO, applyBuild, cellX, cellY, idx, isBlocked, type BuildKind } from './terrain.ts';
import { ARENA_W, baseFx, type Unit } from './unit.ts';

export type SkillKind = BuildKind | 'tame' | 'golem';

/** Flat effects grow with the act like enemy stats do. */
export const ACT_K = [1, 1, 1.6, 2.4, 3, 3.6, 4.2, 4.8];
const SUMMON_K = [1, 1, 1.5, 2.1, 2.6, 3.2, 3.8, 4.4];

/** A built wall segment (for cactus spikes, dispensers and noticing when it gets blown up). */
export interface Wall {
  team: 0 | 1;
  cells: number[];
  x: number;
  y: number;
  dispenser: Unit | null;
  /** Every block of it has been blown away. */
  gone?: boolean;
}

/** 掩体: friendly units on their own platform or right next to their own wall take less damage. */
export const FORT_TAKEN = 0.8;

/** Recomputes which cells count as fortified for each side (platforms + cells around walls). */
export function refreshFort(b: Battle) {
  const f = (b.fortTeam ??= new Int8Array(GW * GD));
  f.fill(-1);
  if (b.platTeam) for (let i = 0; i < f.length; i++) if (b.platTeam[i] >= 0) f[i] = b.platTeam[i];
  for (const w of b.walls) {
    if (w.gone) continue;
    for (const i of w.cells) {
      const cx = i % GW;
      const cy = Math.floor(i / GW);
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x >= 0 && y >= 0 && x < GW && y < GD) f[idx(x, y)] = w.team;
        }
    }
  }
}

/** Highest HP fraction at which a unit can be tamed (rarity-based, beasts and the rod help). */
export function tameLimit(b: Battle, team: 0 | 1, u: Unit): number {
  const tier = { blue: 0.6, purple: 0.6, pink: 0.45, red: 0.3, gold: 0.3 }[u.mob.rarity] ?? 0.45;
  let lim = tier;
  if (u.mob.families.includes('beast')) lim += 0.2;
  if (b.has(team, 'fishing_rod')) lim += 0.2;
  if (b.sides[team].plan.mainVariant === 'soothing') lim += 0.1;
  return Math.min(0.95, lim);
}

export function canTame(b: Battle, team: 0 | 1, u: Unit | null): u is Unit {
  return !!u && u.alive && u.team !== team && !u.boss && !u.structure && u.hpFrac <= tameLimit(b, team, u);
}

/**
 * Builds a wall or platform at (x, y) on the team's half. Returns false if nothing could be
 * built. Before the battle (deployment builds) it stays quiet and leaves dispensers for later.
 */
export function build(b: Battle, team: 0 | 1, kind: BuildKind, x: number, y: number, preBattle = false): boolean {
  const cells = applyBuild(b.terrain, team, kind, x, y, { obsidian: !!b.has(team, 'obsidian'), cactus: !!b.has(team, 'cactus') });
  if (!cells) return false;
  if (!preBattle) {
    b.emit({ k: 'sfx', id: 'stomp', v: 0.5 });
    for (const i of cells) {
      const cx = i % GW;
      const cy = Math.floor(i / GW);
      b.emit({ k: 'debris', x: (cx + 0.5) * BLOCK, y: (cy + 0.5) * BLOCK, z: b.terrain.h[i] * BLOCK, s: b.terrain.s[i], f: b.terrain.f[i], block: true });
    }
    const mv = b.sides[team].plan.mainVariant;
    const prof = mv === 'bulwark' ? 'steve_build__bulwark' : mv === 'fire_support' ? 'steve_build__fire_support' : 'steve_build';
    b.emit({ k: 'tactic_vfx', profile: prof, sx: x, sy: y, tx: x, ty: y });
  }
  if (kind === 'platform') {
    b.platTeam ??= new Int8Array(GW * GD).fill(-1);
    for (const i of cells) b.platTeam[i] = team;
  }
  if (kind === 'wall') {
    const mid = cells[Math.floor(cells.length / 2)];
    const w: Wall = { team, cells, x: ((mid % GW) + 0.5) * BLOCK, y: (Math.floor(mid / GW) + 0.5) * BLOCK, dispenser: null };
    b.walls.push(w);
    if (!preBattle && b.has(team, 'dispenser')) placeDispenser(b, w, false);
  }
  refreshFort(b);
  // Units standing where a wall went up get nudged out next tick (fixTerrain).
  return true;
}

/** A dispenser on top of a wall: a small turret only ranged attackers can reach. */
export function placeDispenser(b: Battle, w: Wall, preBattle: boolean) {
  const side = b.sides[w.team];
  const k = ACT_K[side.plan.act] ?? ACT_K[ACT_K.length - 1];
  const ci = b.addCard(w.team, {
    mob: 'dispenser', star: 1, row: 'back', count: 1, hpMul: k, atkMul: k, atkSpd: 1, moveSpd: 1, rangeMul: 1, armorAdd: 0, fx: baseFx(), immune: 0,
  });
  const u = b.createUnit(ci, mobDef('dispenser'), w.x, w.y, 1, true);
  u.facing = w.team === 0 ? 1 : -1;
  w.dispenser = u;
  if (!preBattle) b.enlist(u, 'poof');
}

/** Keeps walls in sync with the terrain: blown-up walls drop their dispenser, cactus walls prick. */
export function tickWalls(b: Battle, team: 0 | 1, dt: number) {
  const t = b.terrain;
  const cactus = b.has(team, 'cactus');
  const tm = b.sides[team].timers;
  tm.cactus = (tm.cactus ?? 1) - dt;
  const prick = cactus && tm.cactus <= 0;
  if (prick) tm.cactus += 1;
  const dmg = 12 * (ACT_K[b.sides[team].plan.act] ?? ACT_K[ACT_K.length - 1]);
  for (const w of b.walls) {
    if (w.team !== team) continue;
    const standing = w.cells.filter((i) => t.f[i] === F.WALL || t.f[i] === F.OWALL || t.f[i] === F.CWALL);
    if (w.dispenser?.alive && !standing.includes(w.cells[Math.floor(w.cells.length / 2)])) b.kill(w.dispenser, null);
    if (!standing.length && !w.gone) {
      w.gone = true;
      refreshFort(b);
    }
    if (!prick || !standing.length) continue;
    b.aoe(w.x, w.y, BLOCK * 2.2, team, (e) => {
      if (e.flying || e.structure) return;
      // Touching one of the wall's cells (cell box grown by the unit's radius).
      const near = standing.some((i) => {
        const x0 = (i % GW) * BLOCK;
        const y0 = Math.floor(i / GW) * BLOCK;
        const qx = Math.max(x0, Math.min(x0 + BLOCK, e.x));
        const qy = Math.max(y0, Math.min(y0 + BLOCK, e.y));
        return Math.hypot(e.x - qx, e.y - qy) < e.radius + 6;
      });
      if (!near) return;
      b.damage(null, e, dmg, 'true', { noCrit: true, noDodge: true });
      b.knock(e, w.x, w.y, 40);
    });
  }
}

/** Turns an enemy unit to our side for the rest of the battle. */
export function tame(b: Battle, team: 0 | 1, u: Unit): boolean {
  if (!canTame(b, team, u)) return false;
  const old = b.cards[u.card];
  const plan = b.plans[u.card];
  const ci = b.addCard(team, { ...plan, uid: undefined, anchor: undefined, startHp: undefined, count: 1 });
  old.alive--;
  b.cards[ci].spawned++;
  b.cards[ci].alive++;
  const foe = b.live[u.team];
  const at = foe.indexOf(u);
  if (at >= 0) foe.splice(at, 1);
  u.team = team;
  u.card = ci;
  u.facing = team === 0 ? 1 : -1;
  u.target = null;
  u.retarget = 0;
  u.taunter = null;
  u.tauntT = 0;
  u.ref.beam = null;
  u.ref.charge = null;
  u.ref.tamed = 1;
  for (const p of b.projs) {
    if (p.src === u) p.team = team;
    if (p.target === u && p.team === team) p.alive = false;
  }
  for (const ally of b.live[team]) {
    if (ally.target === u) {
      ally.target = null;
      ally.retarget = 0;
    }
  }
  const mv = b.sides[team].plan.mainVariant;
  if (mv === 'soothing') {
    if (b.has(team, 'wheat')) {
      const missing = u.maxHp - u.hp;
      u.hp = Math.min(u.maxHp, u.hp + missing * 0.7);
      u.atk *= 1.3;
    }
  } else if (b.has(team, 'wheat')) {
    u.hp = u.maxHp;
    u.atk *= 1.3;
  } else u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.3);
  if (mv === 'mercenary') {
    u.atk *= 1.2;
    u.ref.mercenary = 1;
  }
  u.burnT = u.poisonT = u.witherT = u.freezeT = u.slowT = 0;
  u.stunT = u.airT = u.levT = 0;
  b.live[team].push(u);
  b.tamed.push(u);
  b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.z + u.size + 8, s: '驯服!', color: '#ff9a4d' });
  b.emit({ k: 'heal', x: u.x, y: u.y, z: u.gz + u.z });
  b.emit({ k: 'spawn', u, fx: 'revive' });
  b.emit({ k: 'sfx', id: 'levelup', v: 0.6 });

  const prof = mv === 'soothing' ? 'alex_tame__soothing' : mv === 'mercenary' ? 'alex_tame__mercenary' : 'alex_tame';
  const sx = team === 0 ? ARENA_W * 0.15 : ARENA_W * 0.85;
  b.emit({ k: 'tactic_vfx', profile: prof, sx, sy: 160, tx: u.x, ty: u.y, units: [{ x: u.x, y: u.y }] });
  return true;
}

/** The Villager's hired iron golem, on our half. */
export function hireGolem(b: Battle, team: 0 | 1, x: number, y: number): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y) || (team === 0 ? x >= ARENA_W / 2 : x < ARENA_W / 2)) return false;
  const side = b.sides[team];
  const isLight = side.plan.mainVariant === 'light_hire';
  // A village golem is weaker than a 隐秘 card (it costs no slot); the bell tower toughens it.
  const mul = (SUMMON_K[side.plan.act] ?? 1) * 0.5 * (b.has(team, 'bell_tower') ? 1.3 : 1) * (isLight ? 0.85 : 1);
  const t = b.terrain;
  let px = x;
  let py = y;
  // Nearest open cell around the click.
  let found = false;
  for (let r = 0; r < 4; r++) {
    for (let dy = -r; dy <= r && !found; dy++)
      for (let dx = -r; dx <= r && !found; dx++) {
        const cx = cellX(x) + dx;
        const cy = cellY(y) + dy;
        if (cx < 0 || cy < 0 || cx >= GW || cy >= GD) continue;
        if ((team === 0 ? cx >= GW / 2 : cx < GW / 2) || isBlocked(t, cx, cy) || SURFACE_INFO[t.s[idx(cx, cy)]]?.liquid) continue;
        px = (cx + 0.5) * BLOCK;
        py = (cy + 0.5) * BLOCK;
        found = true;
      }
    if (found) break;
  }
  if (!found) return false;
  const ci = b.addCard(team, {
    mob: 'iron_golem', star: 1, row: 'front', count: 1, hpMul: mul, atkMul: mul, atkSpd: 1, moveSpd: 1, rangeMul: 1, armorAdd: 0, fx: baseFx(), immune: 0,
  });
  const u = b.createUnit(ci, mobDef('iron_golem'), px, py, 1, true);
  u.facing = team === 0 ? 1 : -1;
  b.enlist(u, 'summon');
  b.emit({ k: 'text', x: u.x, y: u.y, z: u.gz + u.size + 10, s: '铁傀儡来了!', color: '#e8e4dc' });

  const prof = isLight ? 'villager_hire__light_hire' : 'villager_hire';
  b.emit({ k: 'tactic_vfx', profile: prof, sx: x, sy: y, tx: px, ty: py });
  b.emit({ k: 'sfx', id: 'golem' });
  return true;
}
