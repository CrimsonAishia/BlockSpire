// Client for the leaderboard API (api/leaderboard.ts). Everything fails soft: when the API is
// missing (static hosting, offline, no storage configured) the game just hides the boards.
import type { RunSummary } from '../run/run.ts';
import { profile, updateProfile } from '../ui/store.ts';

export type BoardId = 'daily' | 'week' | 'all';

export interface BoardEntry {
  rank: number;
  name: string;
  score: number;
  commander: string;
  omen: number;
  won: boolean;
  act: number;
  floor: number;
  team: [string, number][];
  at: number;
  me?: boolean;
}

export interface BoardData {
  board: BoardId;
  date: string;
  week: string;
  entries: BoardEntry[];
  total: number;
  me: { rank: number; score: number } | null;
}

export interface SubmitResult {
  score: number;
  name: string;
  ranks: Partial<Record<BoardId, { rank: number; total: number; best: number; updated: boolean }>>;
}

const API = '/api/leaderboard';

export class LeaderboardError extends Error {
  /** The service is not there at all (as opposed to a rejected request). */
  offline: boolean;
  constructor(msg: string, offline: boolean) {
    super(msg);
    this.offline = offline;
  }
}

/** Random private id that ties a player's submissions together. */
export function playerId(): string {
  let id = profile.value.playerId;
  if (!id) {
    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    id = btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
    const fresh = id;
    updateProfile((p) => {
      p.playerId = fresh;
    });
  }
  return id;
}

async function call<T>(init: RequestInit & { query?: string }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${init.query ?? ''}`, { ...init, headers: { 'Content-Type': 'application/json', 'X-Player': playerId(), ...init.headers }, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new LeaderboardError('连接不上排行榜服务，请检查网络后重试', true);
  }
  const type = res.headers.get('content-type') ?? '';
  // Static hosting without the API answers with the game's index page (or a 404).
  if (!type.includes('application/json')) throw new LeaderboardError('排行榜服务暂未开放', true);
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new LeaderboardError(body.error ?? `排行榜服务出错（${res.status}）`, res.status === 503);
  return body;
}

export function fetchBoard(board: BoardId, date?: string) {
  return call<BoardData>({ method: 'GET', query: `?board=${board}${date ? `&date=${date}` : ''}` });
}

export function submitRun(run: RunSummary, name: string) {
  return call<SubmitResult>({ method: 'POST', body: JSON.stringify({ op: 'submit', pid: playerId(), name, run }) });
}

export function renameMe(name: string) {
  return call<{ name: string }>({ method: 'POST', body: JSON.stringify({ op: 'rename', pid: playerId(), name }) });
}

/** Same rule as the API: 1–12 visible characters, no links. */
export function nameError(name: string): string | null {
  const n = name.trim();
  const len = Array.from(n).length;
  if (!len) return '先起个昵称吧';
  if (len > 12) return '昵称最多 12 个字';
  if (/https?:|www\.|\.(com|net|cn|org|io|xyz|top)\b/i.test(n)) return '昵称不能包含链接';
  return null;
}
