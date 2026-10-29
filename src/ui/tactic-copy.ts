import { ACT_K } from '../battle/skills.ts';
import { incomeScale } from '../data/tactics.ts';

/** Resolve design multipliers into the current act's player-facing values. */
export function formatTacticCopy(text: string, act: number): string {
  const damageScale = ACT_K[act] ?? ACT_K[ACT_K.length - 1];
  return text
    .replace(/(\d+(?:\.\d+)?)K\b/g, (_, value: string) => String(Number((Number(value) * damageScale).toFixed(2))))
    .replace(/(\d+(?:\.\d+)?)G\b/g, (_, value: string) => String(Math.round(Number(value) * incomeScale(act))));
}
