// Leaderboard API (Vercel Function): daily challenge, weekly and all-time boards.
//
// Storage is Redis through Upstash's REST API — add "Upstash for Redis" to the Vercel project
// (Storage / Marketplace) and it sets KV_REST_API_URL + KV_REST_API_TOKEN. Without them the API
// answers 503 and the game hides the leaderboard. `npm run dev` serves this same handler with an
// in-memory store (server/devApi.ts).
//
// The game runs in the browser, so a score can't be proven here; submissions are checked for
// plausibility (the score is recomputed from the run summary, every field is range-checked) and
// rate-limited per IP. Keep scoreOf / the daily rotation in sync with src/run/run.ts and
// src/run/daily.ts.

/** Runs a pipeline of Redis commands and returns their results in order. */
export type Redis = (cmds: (string | number)[][]) => Promise<unknown[]>;

export function upstash(url: string, token: string): Redis {
  return async (cmds) => {
    const res = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds),
    });
    if (!res.ok) throw new Error(`redis http ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    return out.map((o) => {
      if (o.error) throw new Error(o.error);
      return o.result;
    });
  };
}

const COMMANDERS = ['steve', 'alex', 'villager', 'witch'];
const DAY = 86_400_000;
const TZ = 8 * 3_600_000;
const NAMES = 'bs:names';
const LIMIT = 50;
/** Daily challenge attempts per player and day (the best one counts). */
const DAILY_TRIES = 3;

export const dateOf = (t: number) => new Date(t + TZ).toISOString().slice(0, 10);

/** ISO week of a Beijing-time date, e.g. 2026-W42. */
export function weekOf(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  // The Thursday of this week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

function dailyRule(date: string) {
  const day = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY);
  return { commander: COMMANDERS[day % 4], omen: [3, 2, 4, 3][Math.floor(day / 4) % 4] };
}

export interface RunSummary {
  commander: string;
  omen: number;
  won: boolean;
  act: number;
  /** Floors climbed over all acts (14 per act). */
  floor: number;
  elites: number;
  bosses: number;
  gold: number;
  red: number;
  crates: number;
  team: [string, number][];
  mins?: number;
  /** Daily challenge date when the run was the daily. */
  daily?: string;
}

export function scoreOf(r: Pick<RunSummary, 'floor' | 'elites' | 'bosses' | 'gold' | 'red' | 'won' | 'omen'>) {
  return Math.round((r.floor * 10 + r.elites * 30 + r.bosses * 120 + r.gold * 60 + r.red * 20 + (r.won ? 500 : 0)) * (1 + 0.2 * r.omen));
}

const int = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

function checkRun(v: unknown): RunSummary | string {
  if (!v || typeof v !== 'object') return '缺少对局数据';
  const r = v as Record<string, unknown>;
  if (typeof r.commander !== 'string' || !COMMANDERS.includes(r.commander)) return '统领无效';
  if (!int(r.omen, 0, 5) || !int(r.act, 1, 4) || typeof r.won !== 'boolean') return '对局数据无效';
  const act = r.act as number;
  if (!int(r.floor, (act - 1) * 14, act * 14)) return '层数无效';
  if (!int(r.bosses, act - 1, act) || (r.won && (r.bosses as number) < 3)) return '首领数无效';
  if (!int(r.elites, 0, 8 * act) || !int(r.crates, 0, 60 * act)) return '对局数据无效';
  if (!int(r.gold, 0, 30) || !int(r.red, 0, 60) || (r.gold as number) + (r.red as number) > (r.crates as number)) return '开箱数据无效';
  if (!Array.isArray(r.team) || r.team.length > 5) return '阵容无效';
  for (const c of r.team) if (!Array.isArray(c) || typeof c[0] !== 'string' || !/^[a-z_]{2,32}$/.test(c[0]) || !int(c[1], 1, 3)) return '阵容无效';
  if (r.mins !== undefined && !int(r.mins, 0, 1_000_000)) return '用时无效';
  if (r.daily !== undefined && (typeof r.daily !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.daily))) return '日期无效';
  return {
    commander: r.commander, omen: r.omen as number, won: r.won, act, floor: r.floor as number, elites: r.elites as number, bosses: r.bosses as number,
    gold: r.gold as number, red: r.red as number, crates: r.crates as number, team: (r.team as [string, number][]).map(([m, s]) => [m, s]),
    mins: r.mins as number | undefined, daily: r.daily as string | undefined,
  };
}

/** Public nickname: 1–12 visible characters, no links. */
export function cleanName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const n = v
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = Array.from(n);
  if (!chars.length || chars.length > 12) return null;
  if (/https?:|www\.|\.(com|net|cn|org|io|xyz|top)\b/i.test(n)) return null;
  return n;
}

const validPid = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);

type Board = 'daily' | 'week' | 'all';

function boardKey(board: Board, date: string) {
  if (board === 'all') return 'bs:lb:all';
  if (board === 'week') return `bs:lb:w:${weekOf(date)}`;
  return `bs:lb:d:${date}`;
}
const TTL: Record<Board, number> = { daily: 45 * 86400, week: 120 * 86400, all: 0 };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export interface BoardEntry {
  rank: number;
  name: string;
  avatar?: string;
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

async function readBoard(redis: Redis, board: Board, date: string, pid: string | null) {
  const key = boardKey(board, date);
  const [top, total, myRank, myScore] = await redis([
    ['ZREVRANGE', key, 0, LIMIT - 1, 'WITHSCORES'],
    ['ZCARD', key],
    ['ZREVRANK', key, pid ?? '-'],
    ['ZSCORE', key, pid ?? '-'],
  ]);
  const flat = (top as string[]) ?? [];
  const ids: string[] = [];
  for (let i = 0; i < flat.length; i += 2) ids.push(flat[i]);
  let entries: BoardEntry[] = [];
  if (ids.length) {
    const [details, names] = (await redis([
      ['HMGET', `bs:e:${key}`, ...ids],
      ['HMGET', NAMES, ...ids],
    ])) as [(string | null)[], (string | null)[]];
    entries = ids.map((id, i) => {
      const d = details[i] ? (JSON.parse(details[i]!) as Omit<BoardEntry, 'rank' | 'name'>) : null;
      return {
        rank: i + 1, name: names[i] ?? '无名统领', avatar: d?.avatar || '', score: Number(flat[i * 2 + 1]),
        commander: d?.commander ?? 'steve', omen: d?.omen ?? 0, won: d?.won ?? false, act: d?.act ?? 1, floor: d?.floor ?? 0, team: d?.team ?? [], at: d?.at ?? 0,
        ...(id === pid ? { me: true } : {}),
      };
    });
  }
  const me = pid && typeof myRank === 'number' ? { rank: myRank + 1, score: Number(myScore) } : null;
  return { board, key: key.replace(/^bs:lb:/, ''), date, week: weekOf(date), entries, total: Number(total) || 0, me };
}

async function submit(redis: Redis, body: Record<string, unknown>, ip: string, now: number) {
  if (body.isLoggedIn === false) return json({ error: '未登录用户无法上传成绩至排行榜' }, 403);
  if (!validPid(body.pid)) return json({ error: '玩家标识无效' }, 400);
  const name = cleanName(body.name);
  if (!name) return json({ error: '昵称需要 1–12 个字，且不能包含链接' }, 400);
  const run = checkRun(body.run);
  if (typeof run === 'string') return json({ error: run }, 400);
  const pid = body.pid;
  const rl = `bs:rl:${ip}:${Math.floor(now / 3_600_000)}`;
  const [count] = await redis([['INCR', rl], ['EXPIRE', rl, 3700]]);
  if (Number(count) > 40) return json({ error: '提交太频繁了，请稍后再试' }, 429);

  const today = dateOf(now);
  const boards: Board[] = ['week', 'all'];
  if (run.daily) {
    if (run.daily !== today && run.daily !== dateOf(now - DAY)) return json({ error: '这一天的每日挑战已经结束' }, 400);
    const rule = dailyRule(run.daily);
    if (rule.commander !== run.commander || rule.omen !== run.omen) return json({ error: '与当天的每日挑战规则不符' }, 400);
    const tries = `bs:dt:${run.daily}`;
    const [n] = await redis([['HINCRBY', tries, pid, 1], ['EXPIRE', tries, 3 * 86400]]);
    if (Number(n) > DAILY_TRIES) return json({ error: `今天的 ${DAILY_TRIES} 次挑战机会已经用完` }, 400);
    boards.unshift('daily');
  }
  const score = scoreOf(run);
  const keys = boards.map((b) => boardKey(b, b === 'daily' ? run.daily! : today));
  // Every board keeps each player's best run.
  const added = await redis([
    ...keys.map((k) => ['ZADD', k, 'GT', 'CH', score, pid]),
    ['HSET', NAMES, pid, name],
  ]);
  const rawAvatar = typeof body.avatar === 'string' ? body.avatar.slice(0, 500) : '';
  const entry = JSON.stringify({ commander: run.commander, avatar: rawAvatar, omen: run.omen, won: run.won, act: run.act, floor: run.floor, team: run.team.slice(0, 5), at: now });
  const cmds: (string | number)[][] = [];
  keys.forEach((k, i) => {
    if (Number(added[i]) > 0) cmds.push(['HSET', `bs:e:${k}`, pid, entry]);
    if (TTL[boards[i]]) cmds.push(['EXPIRE', k, TTL[boards[i]]], ['EXPIRE', `bs:e:${k}`, TTL[boards[i]]]);
  });
  const reads = keys.flatMap((k) => [['ZREVRANK', k, pid], ['ZCARD', k], ['ZSCORE', k, pid]]);
  const out = await redis([...cmds, ...reads]);
  const res = out.slice(cmds.length);
  const ranks: Record<string, { rank: number; total: number; best: number; updated: boolean }> = {};
  boards.forEach((b, i) => {
    ranks[b] = { rank: Number(res[i * 3]) + 1, total: Number(res[i * 3 + 1]), best: Number(res[i * 3 + 2]), updated: Number(added[i]) > 0 };
  });
  return json({ ok: true, score, name, ranks });
}

export async function handleLeaderboard(req: Request, redis: Redis | null, now = Date.now()): Promise<Response> {
  if (!redis) return json({ error: '排行榜暂未开放' }, 503);
  const url = new URL(req.url);
  try {
    if (req.method === 'GET') {
      const board = (url.searchParams.get('board') ?? 'week') as Board;
      if (!['daily', 'week', 'all'].includes(board)) return json({ error: '未知的榜单' }, 400);
      const date = url.searchParams.get('date') ?? dateOf(now);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: '日期无效' }, 400);
      const pid = req.headers.get('x-player');
      return json(await readBoard(redis, board, date, validPid(pid) ? pid : null));
    }
    if (req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return json({ error: '请求无效' }, 400);
      const ip = (req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'local').split(',')[0].trim();
      if (body.op === 'rename') {
        if (!validPid(body.pid)) return json({ error: '玩家标识无效' }, 400);
        const name = cleanName(body.name);
        if (!name) return json({ error: '昵称需要 1–12 个字，且不能包含链接' }, 400);
        const [known] = await redis([['HEXISTS', NAMES, body.pid]]);
        if (Number(known)) await redis([['HSET', NAMES, body.pid, name]]);
        return json({ ok: true, name });
      }
      return await submit(redis, body, ip, now);
    }
    return json({ error: 'method not allowed' }, 405);
  } catch (e) {
    console.error('leaderboard', e);
    return json({ error: '排行榜服务出错了，请稍后再试' }, 500);
  }
}

function redisFromEnv(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstash(url, token) : null;
}

export function GET(req: Request) {
  return handleLeaderboard(req, redisFromEnv());
}

export function POST(req: Request) {
  return handleLeaderboard(req, redisFromEnv());
}
