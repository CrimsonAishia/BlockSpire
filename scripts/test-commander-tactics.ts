import assert from 'node:assert/strict';
import { Battle, DT, type BattleConfig } from '../src/battle/sim.ts';
import { buildSide } from '../src/battle/setup.ts';
import { F, S, BLOCK, GW, GD, idx, generateTerrain } from '../src/battle/terrain.ts';
import { tacticTargets, retreatPath, previewRetreat } from '../src/battle/tactic_targets.ts';
import { TACTIC_POOL, TACTIC_VARIANTS, tacticConfig, cannonCost, type TacticId } from '../src/data/tactics.ts';
import { createRun, makeBattle, battleConfig, chooseBrew, signWager, cancelWager, markBattleStarted, equipTactic, rerollShop, buyItem, resolveBattle, type Pending } from '../src/run/run.ts';

let passed = 0;
function test(name: string, fn: () => void) { fn(); passed++; console.log('PASS ' + name); }
function config(id: TacticId = 'horn', variant?: string): BattleConfig {
  const terrain = generateTerrain('plains', 517);
  terrain.h.fill(0); terrain.f.fill(F.NONE); terrain.s.fill(S.GRASS);
  const card = { mob: 'wolf', star: 1, row: 'front' as const, count: 1, anchor: [304, 272] as [number, number] };
  const player = buildSide([card], { relics: [], potions: [], act: 1, commander: 'villager', emeralds: 100, tactic: { id, variant } });
  const enemy = buildSide([{ ...card, anchor: [976, 272] }], { relics: [], potions: [], act: 1 });
  return { seed: 517, terrain, sides: [player, enemy], headless: true, ai: [0, 0] };
}
function battle(id: TacticId = 'horn', variant?: string) {
  const b = new Battle(config(id, variant));
  for (const u of b.units) { u.hp = u.maxHp = 10000; u.atk = 0; u.range = 0; u.atkTimer = 1000; }
  return b;
}
function advance(b: Battle, seconds: number) { for (let n = 0; n < Math.ceil(seconds / DT); n++) b.step(); }
function run(commander = 'villager') {
  const s = createRun(commander, 0, 429);
  s.team = [{ uid: 'test-wolf', mob: 'wolf', star: 1, shards: 0, row: 'front' }];
  s.emeralds = 100;
  s.tacticsState = { tactics: ['horn', 'cannon'], equipped: 'horn', variants: { villager: 'venture' } };
  s.queue = [makeBattle(s, { type: 'battle', row: 0 })];
  return s;
}

test('all six tactics and twelve variants validate, wind up, and consume exactly one order', () => {
  for (const id of TACTIC_POOL) for (const variant of [undefined, ...TACTIC_VARIANTS[id].map(v => v.id)]) {
    const b = battle(id, variant), ally = b.live[0][0], enemy = b.live[1][0];
    const def = tacticConfig(id, variant), target = def.targetType.startsWith('ally') ? ally : enemy;
    const before = b.battleEmeralds[0];
    const rally = id === 'horn' ? { x: ally.x - 40, y: ally.y } : null;
    assert.equal(b.useTactic(0, target.x, target.y, def.targetType === 'enemy_single' ? target : null, rally).ok, true, id + ':' + variant);
    assert.equal(b.orders[0], 0);
    assert.equal(b.orderCooldown[0], 0);
    assert.equal(b.useTactic(0, target.x, target.y, target, rally).ok, false);
    assert.equal(b.cannonSpent[0], 0);
    advance(b, def.windup + DT);
    assert.equal(b.pendingTactics[0], null);
    assert.equal(b.orders[0], 0);
    assert.ok(b.orderCooldown[0] > 7.8);
    assert.equal(b.battleEmeralds[0], before - (id === 'cannon' ? cannonCost(1, variant) : 0));
  }
});

test('orders replenish once at 12 seconds; no third use', () => {
  const b = battle('ward'), u = b.live[0][0];
  assert.equal(b.orders[0], 1);
  assert.ok(b.useTactic(0, u.x, u.y).ok);
  advance(b, 11.9);
  assert.equal(b.orders[0], 0);
  advance(b, 0.2);
  assert.equal(b.orders[0], 1);
  assert.ok(b.useTactic(0, u.x, u.y).ok);
  advance(b, 20);
  assert.equal(b.orders[0], 0);
  assert.equal(b.useTactic(0, u.x, u.y).ok, false);
});

test('cancellation, target death, and battle end refund reserved resources without cooldown', () => {
  for (const mode of ['cancel', 'death', 'end']) {
    const b = battle('cannon'), u = b.live[1][0];
    assert.ok(b.useTactic(0, u.x, u.y, u).ok);
    assert.equal(b.battleEmeralds[0], 92);
    if (mode === 'cancel') assert.ok(b.cancelTactic(0));
    if (mode === 'death') { b.damage(null, u, u.hp * 10, 'true', { noCrit: true, noDodge: true }); advance(b, 0.7); }
    if (mode === 'end') { b.over = true; b.result(); }
    assert.equal(b.orders[0], 1);
    assert.equal(b.battleEmeralds[0], 100);
    assert.equal(b.cannonSpent[0], 0);
    assert.equal(b.orderCooldown[0], 0);
  }
});

test('invalid targets never spend an order; scatter is an area skill', () => {
  const b = battle('cannon'), a = b.live[0][0], e = b.live[1][0];
  for (const [x,y,u] of [[NaN, 50, e], [50, Infinity, e], [50,50,a], [50,50,null]] as const) assert.equal(b.useTactic(0,x,y,u).ok,false);
  e.structure = true;
  assert.equal(b.useTactic(0,e.x,e.y,e).ok,false);
  assert.equal(b.orders[0],1);
  const s = battle('cannon','scatter');
  assert.equal(tacticConfig('cannon','scatter').targetType,'enemy_area');
  assert.ok(s.useTactic(0,s.live[1][0].x,s.live[1][0].y).ok);
  assert.equal(tacticTargets(b,0,a).ok,false);
});

test('retreat requires a separate safe own-half destination and follows a wall detour', () => {
  const b = battle(), u = b.live[0][0], p = { x: u.x - BLOCK * 2, y: u.y };
  assert.equal(b.useTactic(0,u.x,u.y).ok,false);
  assert.equal(b.useTactic(0,u.x,u.y,null,{x:900,y:272}).ok,false);
  b.terrain.f[idx(8,8)] = F.WALL;
  const path = retreatPath(b,u,p,140);
  assert.ok(path && path.length > 2);
  assert.equal(path.some(q => b.terrain.f[idx(Math.floor(q.x/BLOCK),Math.floor(q.y/BLOCK))] === F.WALL),false);
  b.terrain.s[idx(7,8)] = S.LAVA;
  assert.equal(b.useTactic(0,u.x,u.y,null,p).ok,false);
  b.terrain.s[idx(7,8)] = S.GRASS;
  b.stun(u,0.6);
  assert.ok(b.useTactic(0,u.x,u.y,null,p,[u.id]).ok);
  advance(b,0.65);
  const start = u.x;
  advance(b,1.5);
  assert.ok(u.x < start, JSON.stringify({start,x:u.x,march:!!u.ref.hornMarch,orders:b.orders[0]}));
  assert.equal(u.animAtk,0);
});

test('retreat rejects forward movement but allows back and sideways for both teams and all horn variants', () => {
  for (const team of [0, 1] as const) for (const variant of [undefined, 'cover', 'pack']) for (const flying of [false, true]) {
    const cfg = config('horn', variant);
    cfg.sides[team].tactic = { id: 'horn', variant };
    const b = new Battle(cfg), u = b.live[team][0], direction = team === 0 ? 1 : -1;
    u.x = team === 0 ? 336 : 944;
    u.y = 272;
    u.facing = team === 0 ? -1 : 1;
    u.flying = flying;
    const back = { x: u.x - direction * 32, y: u.y };
    const sideways = { x: u.x, y: u.y + 32 };
    const forward = { x: u.x + direction * 16, y: u.y };
    assert.ok(previewRetreat(b, [u], back).ok);
    assert.ok(previewRetreat(b, [u], sideways).ok);
    assert.equal(previewRetreat(b, [u], forward).ok, false);
    const rejected = b.useTactic(team, u.x, u.y, null, forward, [u.id]);
    assert.equal(rejected.ok, false);
    assert.match(rejected.reason!, /后方或侧方/);
    assert.equal(b.orders[team], 1);
    assert.equal(b.orderCooldown[team], 0);
    assert.equal(b.pendingTactics[team], null);
    b.stun(u, 1);
    assert.ok(b.useTactic(team, u.x, u.y, null, sideways, [u.id]).ok);
    advance(b, 0.65);
    assert.equal(b.orders[team], 0);
    assert.equal(u.ref.hornMarch?.tx, sideways.x);
    assert.equal(u.ref.hornMarch?.ty, sideways.y);
  }
});

test('retreat destination must be behind or beside every selected unit, not just the group center', () => {
  for (const team of [0, 1] as const) {
    const cfg = config();
    cfg.sides[team].tactic = { id: 'horn' };
    cfg.sides[team].cards[0].count = 2;
    const b = new Battle(cfg), selected = b.live[team], direction = team === 0 ? 1 : -1;
    const start = team === 0 ? 336 : 944;
    selected.forEach((u, i) => { u.x = start + direction * i * 32; u.y = 256 + i * 32; });
    const middle = { x: start + direction * 16, y: 272 };
    assert.equal(selected.length, 2);
    assert.ok(previewRetreat(b, [selected[1]], middle).ok);
    assert.equal(previewRetreat(b, selected, middle).ok, false);
    assert.equal(b.useTactic(team, start, 272, null, middle, selected.map(u => u.id)).ok, false);
    assert.equal(b.orders[team], 1);
    assert.equal(b.pendingTactics[team], null);
    assert.ok(previewRetreat(b, selected, { x: start - direction * 16, y: 272 }).ok);
  }
});

test('retreat rechecks direction after windup and refunds if the destination has become forward', () => {
  for (const team of [0, 1] as const) for (const variant of [undefined, 'cover', 'pack']) {
    const cfg = config('horn', variant);
    cfg.sides[team].tactic = { id: 'horn', variant };
    const b = new Battle(cfg), u = b.live[team][0], direction = team === 0 ? 1 : -1;
    u.x = team === 0 ? 336 : 944;
    u.y = 272;
    const rally = { x: u.x - direction * 16, y: u.y };
    b.stun(u, 1);
    assert.ok(b.useTactic(team, u.x, u.y, null, rally, [u.id]).ok);
    assert.equal(b.orders[team], 0);
    u.x -= direction * 32;
    advance(b, 0.65);
    assert.equal(b.pendingTactics[team], null);
    assert.equal(b.orders[team], 1);
    assert.equal(b.orderCooldown[team], 0);
    assert.equal(u.ref.hornMarch, undefined);
  }
});

test('stun prevents retreat movement and timeout does not grant pack attack speed', () => {
  const b = battle('horn','pack'), u = b.live[0][0];
  assert.ok(b.useTactic(0,u.x,u.y,null,{x:u.x-50,y:u.y}).ok);
  advance(b,0.61);
  b.stun(u,4);
  const x = u.x, y = u.y;
  advance(b,2.1);
  assert.equal(u.x,x); assert.equal(u.y,y);
  assert.equal(u.ref.hornMarch,undefined);
  assert.equal(u.hasteT,0);
});

test('acid preserves timed shield accounting and never makes armor negative', () => {
  const b = battle('acid'), u = b.live[1][0];
  u.armor = 0.05;
  u.addSynergyShield('test',100,4);
  assert.ok(b.useTactic(0,u.x,u.y).ok);
  advance(b,0.65);
  assert.equal(u.shield,65); assert.equal(u.timedShields[0].amount,65); assert.equal(u.armor,0);
  u.addSynergyShield('other',10,1);
  assert.equal(u.shield,75);
  advance(b,4.2);
  assert.equal(u.shield,0); assert.equal(u.armor,0.05);
});

test('cannon and golem share one wallet, including pending reservations', () => {
  const b = battle('cannon'), e = b.live[1][0];
  b.battleEmeralds[0] = 25;
  assert.ok(b.useTactic(0,e.x,e.y,e).ok);
  assert.equal(b.useSkill(0,'golem',200,200),false);
  b.cancelTactic(0);
  assert.ok(b.useSkill(0,'golem',200,200));
  assert.equal(b.battleEmeralds[0],0);
  assert.equal(b.golemSpent[0],25);
  assert.equal(b.useTactic(0,e.x,e.y,e).ok,false);
});

test('golem cannot spawn in a completely blocked search area or consume its charge', () => {
  const b = battle();
  b.terrain.f.fill(F.WALL);
  const cards = b.cards.length, charges = b.skillLeft[0];
  assert.equal(b.useSkill(0,'golem',200,200),false);
  assert.equal(b.cards.length,cards); assert.equal(b.skillLeft[0],charges);
  assert.equal(b.battleEmeralds[0],100);
});

test('continuous phases preserve resource grants, cooldown, elapsed time, and main charges', () => {
  const cfg = config('ward');
  cfg.sides[0].tacticCarry = { orders:0,granted:false,cooldown:5,elapsed:11.5,skillLeft:0 };
  const b = new Battle(cfg);
  assert.equal(b.orders[0],0); assert.equal(b.skillLeft[0],0);
  advance(b,0.6);
  assert.equal(b.orders[0],1); assert.ok(b.orderCooldown[0] < 5);
  advance(b,15);
  assert.equal(b.orders[0],1);
  b.winner=0;
  assert.equal(b.result().wonWithin18s,false);
});

test('wagers cannot be signed on retries or cancelled after start; refunds are not earnings', () => {
  const s = run(), p = s.queue[0] as Extract<Pending,{type:'battle'}>;
  const earned = s.stats.emeraldsEarned;
  signWager(s); assert.equal(s.emeralds,80);
  cancelWager(s); assert.equal(s.emeralds,100); assert.equal(s.stats.emeraldsEarned,earned);
  p.attempt=2; signWager(s); assert.equal(s.emeralds,100);
  p.attempt=1; signWager(s); markBattleStarted(s); cancelWager(s); equipTactic(s,'cannon');
  assert.equal(s.emeralds,80); assert.equal(s.tacticsState!.equipped,'horn');
});

test('shop rerolls preserve fixed scroll stock and cannot sell the same scroll twice', () => {
  const s = run(); s.act=2;
  const scroll = {id:'scroll',kind:'tactic_scroll' as const,ref:'tactic_scroll',price:48,sold:false,tacticChoices:['acid','ward','smoke']};
  s.queue=[{type:'shop',stock:[scroll],reroll:15}];
  rerollShop(s);
  const shop = s.queue[0] as Extract<Pending,{type:'shop'}>;
  assert.equal(shop.stock.find(i=>i.id==='scroll'),scroll);
  assert.ok(buyItem(s,'scroll')); assert.ok(scroll.sold);
  assert.deepEqual((s.queue[0] as Extract<Pending,{type:'tactics_draft'}>).choices,scroll.tacticChoices);
  s.queue.shift(); assert.equal(buyItem(s,'scroll'),false);
});

test('targeted brew offers persistent choices and honors the player selection', () => {
  const s = run('witch'); s.tacticsState!.variants.witch='targeted';
  const p = s.queue[0] as Extract<Pending,{type:'battle'}>; p.brew=['splash_healing'];
  battleConfig(s,p);
  assert.equal(p.brewChoices?.[0].length,2);
  const choices = p.brewChoices!;
  chooseBrew(s,0,choices[0][1]); assert.equal(p.brew![0],choices[0][1]);
  battleConfig(s,p); assert.equal(p.brewChoices,choices);
  markBattleStarted(s); chooseBrew(s,0,choices[0][0]); assert.equal(p.brew![0],choices[0][1]);
});

test('two-phase boss settles wager only on final win and does not regenerate brew', () => {
  const s = run(); s.act=3; s.omen=5;
  const p = makeBattle(s,{type:'boss',row:14}); p.brew=['splash_healing','poison']; s.queue=[p];
  signWager(s);
  const b = new Battle(battleConfig(s,p,true)); b.winner=0; b.t=10;
  b.tempItemsUsed[0]=['poison']; b.orders[0]=0; b.orderGranted12s[0]=false;
  resolveBattle(s,b.result());
  assert.ok(s.tacticsState!.wagers!.active);
  const phase = s.queue.find(q=>q.type==='battle');
  assert.ok(phase && phase.type==='battle' && phase.endgamePhase2);
  assert.deepEqual(phase.brew,['splash_healing']);
  assert.equal(phase.tacticCarry?.orders,0);
});

// Guard fixtures against accidental changes in arena dimensions.
assert.equal(GW*GD,720);
console.log(`Commander regression: ${passed} groups passed.`);
