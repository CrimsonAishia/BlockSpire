import assert from 'node:assert/strict';
import { DT } from '../src/battle/sim.ts';
import { inspectAI } from '../src/battle/coordinated_ai.ts';
import { contactGoal } from '../src/battle/engagement.ts';
import { canStand, clearWalk, waypoint } from '../src/battle/navigation.ts';
import { moveToward } from '../src/battle/steering.ts';
import { BLOCK, F, S, cellX, cellY, idx, isBlocked } from '../src/battle/terrain.ts';
import { contactScenario, flatBattle, measure } from './ai-scenarios.ts';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log('PASS ' + name); }
function advance(b: ReturnType<typeof flatBattle>, seconds: number) { for (let n = 0; n < Math.round(seconds / DT); n++) b.step(); }

test('AI levels keep classic and legacy modes available', () => {
  const b = flatBattle(['wolf'], ['wolf'], [1, 2]);
  assert.deepEqual(b.smart, [true, true]);
  assert.deepEqual(b.coordinated, [false, true]);
});

test('queued melee units reach different attack positions instead of pushing one lane', () => {
  const legacy = measure(contactScenario(1), 12);
  const modern = measure(contactScenario(2), 12);
  assert.ok(modern.participants >= 5, JSON.stringify(modern));
  assert.ok(modern.participants > legacy.participants, JSON.stringify({ legacy, modern }));
  assert.ok(modern.readyIdleSeconds < legacy.readyIdleSeconds, JSON.stringify({ legacy, modern }));
});

test('reservations account for unit radii and release a dead target', () => {
  const b = contactScenario(2), t = b.live[1][0];
  const goals = b.live[0].slice(0, 4).map(u => { u.target = t; return contactGoal(b, u, t); });
  assert.ok(goals.every(Boolean));
  for (let i = 0; i < goals.length; i++) for (let j = i + 1; j < goals.length; j++) {
    assert.ok(Math.hypot(goals[i]!.x - goals[j]!.x, goals[i]!.y - goals[j]!.y) > 28);
  }
  t.alive = false;
  advance(b, 0.2);
  assert.equal(b.live[0].some(u => u.target?.alive === false), false);
});

test('a wall detour reaches a particular destination without entering blockers', () => {
  const b = flatBattle(['zombie'], ['zombie']), u = b.live[0][0];
  u.x = u.px = 560; u.y = u.py = 288;
  for (let y = 5; y <= 11; y++) b.terrain.f[idx(19, y)] = F.WALL;
  const goal = { x: 688, y: 288 };
  assert.equal(clearWalk(b, u, u, goal), false);
  assert.ok(waypoint(b, u, goal));
  for (let n = 0; n < 420; n++) {
    b.t += DT; moveToward(b, u, goal, DT);
    assert.equal(isBlocked(b.terrain, cellX(u.x), cellY(u.y)), false);
  }
  assert.ok(Math.hypot(u.x - goal.x, u.y - goal.y) < 8, JSON.stringify({ x: u.x, y: u.y }));
});

test('a sealed corridor does not produce a path through walls or lava', () => {
  const b = flatBattle(['zombie'], ['zombie']), u = b.live[0][0];
  u.x = 560; u.y = 288;
  for (let y = 0; y < 18; y++) b.terrain.f[idx(19, y)] = F.WALL;
  assert.equal(waypoint(b, u, { x: 688, y: 288 }), null);
  b.terrain.s[idx(17, 9)] = S.LAVA;
  assert.equal(canStand(b, u, 560, 304), false);
});

test('shooters fire at visible targets instead of charging an occluded target', () => {
  const b = flatBattle(['skeleton'], ['zombie', 'zombie']), u = b.live[0][0];
  u.x = u.px = 500; u.y = u.py = 288;
  const [hidden, visible] = b.live[1];
  hidden.x = 640; hidden.y = 288; visible.x = 640; visible.y = 430;
  for (const a of b.units) { a.hp = a.maxHp = 100000; a.atk = 0; }
  hidden.speed = visible.speed = 0;
  b.terrain.f[idx(18, 9)] = F.WALL;
  b.terrain.fh[idx(18, 9)] = 3;
  u.target = hidden; u.retarget = 10;
  assert.equal(b.canSee(u, hidden), false);
  assert.equal(b.canSee(u, visible), true);
  advance(b, 2);
  assert.equal(u.target, visible);
  assert.ok(b.projs.length > 0 || u.atkTimer > 0);
  assert.ok(u.x < 570, String(u.x));
});

test('a shooter with only an occluded enemy finds a firing angle around cover', () => {
  const b = flatBattle(['skeleton'], ['zombie']), u = b.live[0][0], t = b.live[1][0];
  u.x = u.px = 500; u.y = u.py = 288; t.x = 680; t.y = 288; t.speed = 0;
  for (const a of b.units) { a.hp = a.maxHp = 100000; a.atk = 0; }
  for (let y = 7; y <= 10; y++) { b.terrain.f[idx(18, y)] = F.WALL; b.terrain.fh[idx(18, y)] = 3; }
  const metrics = measure(b, 12);
  assert.ok(metrics.attacks > 0, JSON.stringify({ metrics, x: u.x, y: u.y, ai: inspectAI(u) }));
  assert.ok(u.x < t.x - 60, String(u.x));
});

test('ranged units use cooldowns to escape melee while continuing to shoot', () => {
  const b = flatBattle(['skeleton'], ['zombie']), u = b.live[0][0], t = b.live[1][0];
  u.x = u.px = 600; u.y = u.py = 288; t.x = 655; t.y = 288;
  for (const a of b.units) { a.hp = a.maxHp = 100000; a.atk = 0; }
  const metrics = measure(b, 8);
  assert.ok(u.x < 570 || Math.abs(u.y - 288) > 50, JSON.stringify({ x: u.x, y: u.y }));
  assert.ok(metrics.attacks >= 3, JSON.stringify(metrics));
});

test('stun and commander retreat retain control over the coordinated brain', () => {
  const b = flatBattle(['wolf'], ['zombie']), u = b.live[0][0];
  u.x = u.px = 400; u.y = u.py = 288; b.live[1][0].x = 900;
  b.stun(u, 1); advance(b, 0.5);
  assert.equal(u.x, 400); assert.equal(u.y, 288);
  u.stunT = 0;
  b.sides[0].plan.tactic = { id: 'horn' }; b.orders[0] = 1;
  assert.ok(b.useTactic(0, u.x, u.y, null, { x: u.x - BLOCK * 2, y: u.y }).ok);
  advance(b, 2);
  assert.ok(u.x < 380, String(u.x));
});

test('same seed and configuration reproduce the same simulation state', () => {
  const snapshot = () => {
    const b = contactScenario(2, 933); advance(b, 6);
    return { rng: b.rng.s, units: b.units.map(u => [u.id, u.x, u.y, u.hp, u.atkTimer, u.target?.id, inspectAI(u)]) };
  };
  assert.deepEqual(snapshot(), snapshot());
});

test('cached paths revalidate when an obstacle appears or is destroyed', () => {
  const b = flatBattle(['zombie'], ['zombie']), u = b.live[0][0];
  u.x = 560; u.y = 288;
  const goal = { x: 688, y: 288 };
  assert.deepEqual(waypoint(b, u, goal), goal);
  for (let y = 0; y < 18; y++) b.terrain.f[idx(19, y)] = F.WALL;
  b.terrain.ver++;
  assert.equal(waypoint(b, u, goal), null);
  b.terrain.f[idx(19, 9)] = F.NONE; b.terrain.ver++;
  assert.ok(waypoint(b, u, { x: 688, y: 304 }));
});

test('coordinated movement does not replace the knockback velocity', () => {
  const b = flatBattle(['zombie'], ['zombie']), u = b.live[0][0];
  u.x = 400; u.y = 288; u.vx = -37; u.vy = 9;
  moveToward(b, u, { x: 470, y: 288 }, DT);
  assert.equal(u.vx, -37); assert.equal(u.vy, 9);
});

test('a unit already in dangerous terrain can leave it without re-entering it', () => {
  const b = flatBattle(['zombie'], ['zombie']), u = b.live[0][0];
  u.x = 560; u.y = 304;
  b.terrain.s[idx(17, 9)] = S.LAVA;
  for (let n = 0; n < 120; n++) { b.t += DT; moveToward(b, u, { x: 640, y: 304 }, DT); }
  assert.ok(u.x > 600, String(u.x));
  assert.equal(clearWalk(b, u, u, { x: 560, y: 304 }), false);
});

test('mixed sizes and special mob hooks remain finite and outside obstacles', () => {
  const b = flatBattle(['spider', 'slime', 'witch', 'skeleton'], ['spider', 'slime', 'witch', 'skeleton']);
  for (const team of [0, 1] as const) for (const [i, u] of b.live[team].entries()) {
    u.x = u.px = team === 0 ? 520 : 760; u.y = u.py = 170 + i * 65;
  }
  for (let n = 0; n < 300 && !b.over; n++) {
    b.step();
    for (const u of b.units) {
      assert.ok(Number.isFinite(u.x + u.y + u.hp), u.mob.id);
      if (u.alive && !u.flying) assert.equal(isBlocked(b.terrain, cellX(u.x), cellY(u.y)), false, u.mob.id);
    }
  }
});

console.log('Battle AI regression: ' + passed + ' groups passed.');
