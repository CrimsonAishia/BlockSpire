import assert from 'node:assert/strict';
import { flatBattle } from './ai-scenarios.ts';
import { DT } from '../src/battle/sim.ts';
import { canStand, planPath, travelCost } from '../src/battle/navigation.ts';
import { groundRisk, terrainFactor, waterBenefit } from '../src/battle/terrain_policy.ts';
import { decideSafety, inspectSafety } from '../src/battle/evasion.ts';
import { refreshTactics } from '../src/battle/tactics.ts';
import { dangerDistance, expectedDamage } from '../src/battle/threats.ts';
import { steerTo } from '../src/battle/steering.ts';
import { IMM_BURN, IMM_SLOW } from '../src/battle/unit.ts';
import { F, S, idx } from '../src/battle/terrain.ts';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log('PASS ' + name); }
function scene(mob = 'zombie') {
  const b = flatBattle([mob], ['zombie']), u = b.live[0][0], t = b.live[1][0];
  u.x = u.px = 600; u.y = u.py = 304;
  t.x = t.px = 638; t.y = t.py = 304; t.speed = 0;
  for (const a of b.units) { a.hp = a.maxHp = 1000; a.atk = 0; }
  u.target = t;
  return { b, u, t };
}
function advance(b: ReturnType<typeof flatBattle>, seconds: number) { for (let n = 0; n < Math.round(seconds / DT) && !b.over; n++) b.step(); }

test('melee escapes lava even with an enemy already in attack range', () => {
  const { b, u } = scene();
  b.terrain.s[idx(18, 9)] = S.LAVA;
  advance(b, 3);
  assert.equal(groundRisk(b, u), 0, JSON.stringify({ x: u.x, y: u.y, safety: inspectSafety(u) }));
  assert.ok(u.hp > 900, String(u.hp));
});

test('effective burn immunity and team fire immunity control lava access', () => {
  const { b, u } = scene(); b.terrain.s[idx(18, 9)] = S.LAVA;
  assert.equal(canStand(b, u, u.x, u.y), false);
  u.immune |= IMM_BURN;
  assert.equal(canStand(b, u, u.x, u.y), true);
  assert.equal(decideSafety(b, u).action, 'hold');
  u.immune &= ~IMM_BURN; b.sides[0].fireImmune = true;
  assert.equal(canStand(b, u, u.x, u.y), true);
  b.sides[0].fireImmune = false;
  assert.equal(decideSafety(b, u).action, 'escape');
});

test('endermen treat water as dangerous while aquatic units benefit from it', () => {
  const { b, u } = scene('enderman'); b.terrain.s[idx(18, 9)] = S.WATER;
  assert.equal(canStand(b, u, u.x, u.y), false);
  assert.equal(decideSafety(b, u).action, 'escape');
  const aquatic = scene('guardian'); aquatic.b.terrain.s[idx(18, 9)] = S.WATER; aquatic.u.hp = 400;
  assert.equal(canStand(aquatic.b, aquatic.u, aquatic.u.x, aquatic.u.y), true);
  assert.equal(terrainFactor(aquatic.b, aquatic.u, aquatic.u.x, aquatic.u.y), 1.25);
  assert.ok(waterBenefit(aquatic.b, aquatic.u, aquatic.u.x, aquatic.u.y) > 0);
});

test('a dry detour is chosen when crossing water takes longer', () => {
  const { b, u } = scene(); u.x = 400;
  for (let x = 15; x <= 19; x++) b.terrain.s[idx(x, 9)] = S.WATER;
  const goal = { x: 720, y: 304 }, directSeconds = travelCost(b, u, u, goal) / b.moveSpeedOf(u);
  const plan = planPath(b, u, goal, true);
  assert.equal(plan.status, 'ready');
  assert.ok(plan.seconds! < directSeconds, JSON.stringify({ plan, directSeconds }));
  assert.ok(plan.path!.some(p => p.y !== 304));
});

test('unreachable enemies across lava are replaced with reachable enemies', () => {
  const b = flatBattle(['zombie'], ['zombie', 'zombie']), u = b.live[0][0], [blocked, reachable] = b.live[1];
  u.x = u.px = 400; u.y = u.py = 304;
  blocked.x = 560; blocked.y = 304; reachable.x = 100; reachable.y = 304;
  for (const a of b.live[1]) { a.speed = 0; a.atk = 0; }
  for (let y = 0; y < 18; y++) b.terrain.s[idx(15, y)] = S.LAVA;
  advance(b, 5);
  assert.equal(u.target, reachable);
  assert.ok(u.x < 380, String(u.x));
});

test('exhausted search budgets are pending rather than proof of no route', () => {
  const b = flatBattle(Array(7).fill('zombie'), ['zombie']);
  for (let y = 0; y < 18; y++) b.terrain.f[idx(19, y)] = F.WALL;
  const statuses = b.live[0].map((u, i) => { u.x = 400; u.y = 100 + i * 40; return planPath(b, u, { x: 720, y: u.y }).status; });
  assert.deepEqual(statuses, ['unreachable', 'unreachable', 'unreachable', 'unreachable', 'unreachable', 'unreachable', 'pending']);
  b.t += DT;
  assert.equal(planPath(b, b.live[0][6], { x: 720, y: b.live[0][6].y }).status, 'unreachable');
});

test('low-health shooters escape a lethal telegraph and actually avoid its hit', () => {
  const { b, u, t } = scene('skeleton'); t.x = 900; u.hp = 100;
  b.addDelayed({ t: 2, x: u.x, y: u.y, r: 35, dmg: 200, team: 1, src: t, kind: 'bolt' });
  refreshTactics(b);
  assert.equal(decideSafety(b, u).action, 'dodge');
  advance(b, 2.2);
  assert.ok(u.alive && u.hp === 100, JSON.stringify({ hp: u.hp, x: u.x, y: u.y, safety: inspectSafety(u) }));
});

test('a shielded tank holds through small damage without consuming shields during planning', () => {
  const { b, u, t } = scene('slime'); u.shield = 500; u.atk = 20;
  b.addDelayed({ t: 2, x: u.x, y: u.y, r: 35, dmg: 30, team: 1, src: t, kind: 'bolt' });
  refreshTactics(b);
  const before = b.rng.s;
  assert.equal(decideSafety(b, u).action, 'hold');
  assert.equal(u.shield, 500); assert.equal(b.rng.s, before);
});

test('expired shields do not justify holding through a lethal future hit', () => {
  const { b, u, t } = scene('skeleton'); t.x = 900; u.hp = 100;
  u.addSynergyShield('short', 500, 0.4);
  b.addDelayed({ t: 2, x: u.x, y: u.y, r: 35, dmg: 200, team: 1, src: t, kind: 'bolt' });
  refreshTactics(b);
  assert.equal(decideSafety(b, u).action, 'dodge');
});

test('a blast that cannot be outrun does not cause pointless movement', () => {
  const { b, u, t } = scene('skeleton'); t.x = 900; u.hp = 100;
  b.addDelayed({ t: 0.03, x: u.x, y: u.y, r: 120, dmg: 200, team: 1, src: t, kind: 'bolt' });
  refreshTactics(b);
  const decision = decideSafety(b, u);
  assert.equal(decision.action, 'hold'); assert.equal(decision.reason, 'no-safe-route');
});

test('overlapping blasts are assessed together and escape paths avoid the second blast', () => {
  const { b, u, t } = scene('skeleton'); t.x = 950; u.hp = 100;
  b.addDelayed({ t: 2, x: u.x, y: u.y, r: 35, dmg: 200, team: 1, src: t, kind: 'bolt' });
  b.addDelayed({ t: 1.8, x: u.x - 64, y: u.y, r: 60, dmg: 500, team: 1, src: t, kind: 'bolt' });
  refreshTactics(b);
  const decision = decideSafety(b, u);
  assert.equal(decision.action, 'dodge');
  assert.ok(decision.goal && b.dangers[0].every(d => dangerDistance(d, decision.goal!.x, decision.goal!.y) > d.r + u.radius));
  advance(b, 2.2);
  assert.ok(u.alive && u.hp === 100, JSON.stringify({ hp: u.hp, x: u.x, y: u.y }));
});

test('evasion does not escape a blast by entering lava', () => {
  const { b, u, t } = scene('skeleton'); t.x = 950; u.hp = 100;
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) b.terrain.s[idx(x, y)] = S.LAVA;
  b.addDelayed({ t: 2, x: u.x, y: u.y, r: 35, dmg: 200, team: 1, src: t, kind: 'bolt' });
  refreshTactics(b);
  const decision = decideSafety(b, u);
  assert.equal(decision.action, 'dodge');
  assert.ok(decision.goal && canStand(b, u, decision.goal.x, decision.goal.y));
  advance(b, 2.2); assert.equal(groundRisk(b, u), 0);
});

test('burning zones respect immunity and airborne ground-only effects do no damage', () => {
  const { b, u, t } = scene('skeleton');
  b.addZone({ x: u.x, y: u.y, r: 50, team: 1, kind: 'lava', dps: 0.5, dur: 4, src: t });
  refreshTactics(b);
  assert.ok(expectedDamage(b, u, b.dangers[0][0]) > 0);
  u.immune |= IMM_BURN;
  assert.equal(expectedDamage(b, u, b.dangers[0][0]), 0);
  assert.equal(decideSafety(b, u).action, 'hold');
  u.immune &= ~IMM_BURN; u.flying = true;
  assert.equal(expectedDamage(b, u, b.dangers[0][0]), 0);
});

test('straight splash projectiles are registered without inventing instant telegraphs', () => {
  const { b, u, t } = scene(); t.x = 900;
  const projectile = b.shoot(t, u, 'fireball', 200, { aoe: 60 });
  refreshTactics(b);
  assert.ok(b.dangers[0].some(d => d.id === projectile.id && d.damage === 200 && d.proj));
});

test('arrive preserves deceleration instead of normalizing back to full speed', () => {
  const { b, u, t } = scene(); t.x = 1000;
  const start = u.x; steerTo(b, u, { x: start + 2, y: u.y }, DT);
  assert.ok(u.x > start && u.x - start < b.moveSpeedOf(u) * DT * 0.8);
});

test('continuous damage areas are escaped while harmless slow immunity permits holding', () => {
  const { b, u, t } = scene('skeleton'); t.x = 950; u.hp = 400;
  b.addZone({ x: u.x, y: u.y, r: 35, team: 1, kind: 'breath', dps: 100, dur: 4, src: t });
  refreshTactics(b);
  assert.equal(decideSafety(b, u).action, 'dodge');
  advance(b, 2);
  assert.ok(u.hp >= 250, String(u.hp));
  assert.ok(dangerDistance(b.dangers[0][0], u.x, u.y) > 35 + u.radius);
  const honey = scene('skeleton'); honey.u.immune |= IMM_SLOW;
  honey.b.addZone({ x: honey.u.x, y: honey.u.y, r: 35, team: 1, kind: 'honey', dps: 0, dur: 4, src: honey.t });
  refreshTactics(honey.b);
  assert.equal(decideSafety(honey.b, honey.u).action, 'hold');
});

test('short phase immunity does not hide a later lethal explosion', () => {
  const { b, u, t } = scene('skeleton'); t.x = 950; u.hp = 100; u.phaseImmunityTimer = 0.2;
  b.addDelayed({ t: 2, x: u.x, y: u.y, r: 35, dmg: 200, team: 1, src: t, kind: 'bolt' });
  refreshTactics(b);
  assert.equal(decideSafety(b, u).action, 'dodge');
});

console.log('AI safety regression: ' + passed + ' groups passed.');
