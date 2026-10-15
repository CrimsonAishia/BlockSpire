// The prediction itself: the same squads on the same battlefield, many different battle seeds.
import { Battle } from '../battle/sim.ts';
import { generateTerrain } from '../battle/terrain.ts';
import { classicSide, type Field, type Teams } from './match.ts';

export interface OddsJob {
  teams: Teams;
  field: Field;
  total: number;
}

export interface OddsProgress {
  done: number;
  total: number;
  /** Wins per side (draws count for neither). */
  wins: [number, number];
}

/** Runs the job in small slices; `report` returns false to stop. */
export function runOdds(job: OddsJob, report: (p: OddsProgress) => boolean, slice = 6) {
  const terrain = generateTerrain(job.field.biome, job.field.seed);
  const sides = [classicSide(job.teams[0], 0), classicSide(job.teams[1], 1)] as const;
  const wins: [number, number] = [0, 0];
  let done = 0;
  const step = () => {
    const end = Math.min(job.total, done + slice);
    for (; done < end; done++) {
      const seed = (Math.imul(done + 1, 0x9e3779b1) ^ job.field.seed) >>> 0 || 1;
      const r = new Battle({ seed, sides: [sides[0], sides[1]], terrain, headless: true }).runToEnd();
      if (!r.draw) wins[r.winner]++;
    }
    if (!report({ done, total: job.total, wins: [wins[0], wins[1]] })) return;
    if (done < job.total) setTimeout(step, 0);
  };
  step();
}
