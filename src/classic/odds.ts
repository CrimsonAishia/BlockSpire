// Client side of the prediction: a hook that asks the worker (or, if workers fail, the main
// thread in small slices) for the odds of the current matchup. Finished results are cached.
import { useEffect, useState } from 'preact/hooks';
import type { Field, Teams } from './match.ts';
import { runOdds, type OddsJob, type OddsProgress } from './oddsCore.ts';

export interface Odds extends OddsProgress {
  key: string;
}

/** Games simulated per prediction (about ±3% at 240). */
export const ODDS_RUNS = 240;

interface Request {
  job: OddsJob;
  report: (p: OddsProgress) => void;
}

/** undefined = not created yet, null = unavailable (fall back to the main thread). */
let worker: Worker | null | undefined;
let nextId = 1;
const requests = new Map<number, Request>();
const cache = new Map<string, Odds>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL('./odds.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<OddsProgress & { id: number }>) => requests.get(e.data.id)?.report(e.data);
    // An older deploy's worker file may be gone: finish (and keep working) on the main thread.
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      for (const [id, r] of requests) mainThread(id, r);
    };
  } catch {
    worker = null;
  }
  return worker;
}

function mainThread(id: number, r: Request) {
  runOdds(
    r.job,
    (p) => {
      if (requests.get(id) !== r) return false;
      r.report(p);
      return true;
    },
    2,
  );
}

/** Simulated odds for the matchup; null while disabled. */
export function useOdds(teams: Teams, field: Field, enabled: boolean, total = ODDS_RUNS): Odds | null {
  const key = enabled && teams[0].length && teams[1].length ? JSON.stringify([teams, field, total]) : '';
  const [odds, setOdds] = useState<Odds | null>(() => cache.get(key) ?? null);
  useEffect(() => {
    if (!key) return;
    const hit = cache.get(key);
    if (hit) return setOdds(hit);
    const id = nextId++;
    setOdds({ key, done: 0, total, wins: [0, 0] });
    const r: Request = {
      job: { teams, field, total },
      report: (p) => {
        const o = { key, done: p.done, total: p.total, wins: p.wins };
        if (p.done >= p.total) {
          cache.set(key, o);
          requests.delete(id);
        }
        setOdds(o);
      },
    };
    requests.set(id, r);
    const w = getWorker();
    if (w) w.postMessage({ id, ...r.job });
    else mainThread(id, r);
    return () => {
      if (!requests.delete(id)) return;
      // Unfinished: stop the worker too.
      if (worker) worker.postMessage({ id: 0 });
    };
  }, [key]);
  return odds && odds.key === key ? odds : null;
}

/** Blue's win chance so far (null until enough games were played to say anything). */
export function blueChance(o: Odds | null, min = 40): number | null {
  if (!o) return null;
  const n = o.wins[0] + o.wins[1];
  return o.done >= min && n > 0 ? o.wins[0] / n : null;
}
