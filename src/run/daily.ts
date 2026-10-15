// Daily challenge: on a given day (Beijing time) everyone climbs the same seed with the same
// commander and omen level. The leaderboard API (api/leaderboard.ts) checks submissions against
// the same rotation, so keep the two in sync.

const DAY = 86_400_000;
const TZ = 8 * 3_600_000;
const ROTATION = ['steve', 'alex', 'villager', 'witch'];
/** A challenge, not a warm-up: around 不祥之兆 III, one level either side. */
const OMENS = [3, 2, 4, 3];
/** Attempts per day; the best one counts. */
export const DAILY_TRIES = 3;

export interface DailyConfig {
  date: string;
  seed: number;
  commander: string;
  omen: number;
}

/** Today's date (YYYY-MM-DD) in Beijing time. */
export function dailyDate(now = Date.now()): string {
  return new Date(now + TZ).toISOString().slice(0, 10);
}

/** Every commander in turn; the omen level changes every four days (III, II, IV, III...). */
export function dailyConfig(date: string): DailyConfig {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
  let h = 0x811c9dc5;
  for (const ch of `blockspire-daily-${date}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  return { date, seed: (h >>> 1) || 1, commander: ROTATION[day % 4], omen: OMENS[Math.floor(day / 4) % 4] };
}

/** Milliseconds until the next daily challenge. */
export function msToNextDaily(now = Date.now()): number {
  return DAY - ((now + TZ) % DAY);
}
