// Prediction worker: plays a classic match many times headless on the given battlefield and
// reports how often each side wins. A newer request (or a bare cancel) stops the one in progress.
import { runOdds, type OddsJob } from './oddsCore.ts';

let current = 0;

self.onmessage = (e: MessageEvent<Partial<OddsJob> & { id: number }>) => {
  const { id, teams, field, total } = e.data;
  current = id;
  if (!teams || !field || !total) return;
  runOdds({ teams, field, total }, (p) => {
    if (current !== id) return false;
    self.postMessage({ id, ...p });
    return true;
  });
};
