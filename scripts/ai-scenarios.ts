import { Battle, DT } from '../src/battle/sim.ts';
import { buildSide, type PlanCardInput } from '../src/battle/setup.ts';
import { F, S, generateTerrain } from '../src/battle/terrain.ts';

export function flatBattle(left: string[], right: string[], ai: [number, number] = [2, 2], seed = 517): Battle {
  const terrain = generateTerrain('plains', seed);
  terrain.h.fill(0); terrain.f.fill(F.NONE); terrain.s.fill(S.GRASS); terrain.fh.fill(0);
  const side = (mobs: string[]) => buildSide(mobs.map((mob, i): PlanCardInput => ({
    mob, star: 1, row: 'front', count: 1, uid: mob + i,
  })), { relics: [], potions: [], act: 1 });
  return new Battle({ seed, terrain, sides: [side(left), side(right)], headless: true, ai });
}

export function contactScenario(level: number, seed = 517): Battle {
  const b = flatBattle(Array(6).fill('wolf'), ['zombie'], [level, 0], seed);
  for (const [i, u] of b.live[0].entries()) { u.x = 600 - i * 31; u.y = 288; u.px = u.x; u.py = u.y; }
  const t = b.live[1][0]; t.x = t.px = 660; t.y = t.py = 288; t.radius = 28; t.speed = 0; t.atk = 0;
  for (const u of b.units) { u.hp = u.maxHp = 100000; u.atk = 0; }
  return b;
}

export interface AIMetrics {
  attacks: number;
  participants: number;
  readyIdleSeconds: number;
}

export function measure(b: Battle, seconds: number): AIMetrics {
  const attackers = new Set<number>();
  let attacks = 0, idle = 0;
  for (let step = 0; step < Math.round(seconds / DT) && !b.over; step++) {
    const timers = b.live[0].map(u => [u, u.atkTimer] as const);
    b.step();
    for (const [u, timer] of timers) {
      if (u.atkTimer > timer + 0.001) { attacks++; attackers.add(u.id); }
      if (u.alive && !u.stunned && !u.cast && u.atkTimer <= 0 && u.target && Math.hypot(u.target.x - u.x, u.target.y - u.y) < b.reach(u, u.target) + 160) idle += DT;
    }
  }
  return { attacks, participants: attackers.size, readyIdleSeconds: +idle.toFixed(2) };
}
