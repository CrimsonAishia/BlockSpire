// Telemetry API (Vercel Serverless Function): collects player battle data for balance modeling
import type { Redis } from './leaderboard.ts';
import { upstash } from './leaderboard.ts';

const TELEMETRY_KEY = 'bs:telemetry:runs';
const MAX_SAVED_RUNS = 2000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Player',
    },
  });
}

export async function handleTelemetry(req: Request, redis: Redis | null): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Player',
      },
    });
  }

  const url = new URL(req.url);

  // 1. GET: 拉取已上报的遥测数据列表
  if (req.method === 'GET') {
    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? '100')));
    if (!redis) {
      return json({ ok: true, count: 0, runs: [], note: 'Redis storage not configured' });
    }
    try {
      const [rawList] = await redis([['LRANGE', TELEMETRY_KEY, '0', String(limit - 1)]]);
      const runs = Array.isArray(rawList)
        ? rawList.map((item) => {
            try {
              return JSON.parse(String(item));
            } catch {
              return null;
            }
          }).filter(Boolean)
        : [];
      return json({ ok: true, count: runs.length, runs });
    } catch (e) {
      return json({ error: (e as Error).message }, 500);
    }
  }

  // 2. POST: 自动接收玩家客户端上报的数据
  if (req.method === 'POST') {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.score !== 'number' || typeof body.commander !== 'string') {
      return json({ error: '无效的战报数据结构' }, 400);
    }

    if (!redis) {
      // 在无持久化存储的环境下仍返回成功，确保客户端无感知正常进行
      return json({ ok: true, received: true, stored: false });
    }

    try {
      const runJson = JSON.stringify(body);
      const cmds: (string | number)[][] = [
        ['LPUSH', TELEMETRY_KEY, runJson],
        ['LTRIM', TELEMETRY_KEY, '0', String(MAX_SAVED_RUNS - 1)],
      ];

      // 聚合计数，便于极速拉取宏观平衡指标
      const omen = body.omen ?? 0;
      cmds.push(['HINCRBY', 'bs:stats:omen', `${omen}:runs`, '1']);
      if (body.won) {
        cmds.push(['HINCRBY', 'bs:stats:omen', `${omen}:wins`, '1']);
      }
      const killedBy = body.killedBy as { encId?: string } | undefined;
      if (killedBy?.encId) {
        cmds.push(['HINCRBY', 'bs:stats:killers', killedBy.encId, '1']);
      }

      await redis(cmds);
      return json({ ok: true, received: true, stored: true });
    } catch (e) {
      console.error('[Telemetry API Error]', e);
      return json({ error: '遥测存储失败' }, 500);
    }
  }

  return json({ error: 'Method not allowed' }, 405);
}

function redisFromEnv(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstash(url, token) : null;
}

export function GET(req: Request) {
  return handleTelemetry(req, redisFromEnv());
}

export function POST(req: Request) {
  return handleTelemetry(req, redisFromEnv());
}

export function OPTIONS(req: Request) {
  return handleTelemetry(req, null);
}
