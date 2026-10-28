// `npm run dev`: serves the Vercel functions in api/ from the Vite dev server, with an in-memory
// Redis stand-in (scores are lost when the server restarts).
import type { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { handleLeaderboard, type Redis } from '../api/leaderboard.ts';
import { handleTelemetry } from '../api/telemetry.ts';

/** The handful of Redis commands the leaderboard uses. */
export function memoryRedis(): Redis {
  const zsets = new Map<string, Map<string, number>>();
  const hashes = new Map<string, Map<string, string>>();
  const lists = new Map<string, string[]>();
  const counters = new Map<string, number>();
  const zset = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!;
  const hash = (k: string) => hashes.get(k) ?? hashes.set(k, new Map()).get(k)!;
  const list = (k: string) => lists.get(k) ?? lists.set(k, []).get(k)!;
  const sorted = (k: string) => [...zset(k)].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1));
  const run = (c: (string | number)[]): unknown => {
    const [op, key, ...a] = c.map(String);
    switch (op.toUpperCase()) {
      case 'INCR': {
        const v = (counters.get(key) ?? 0) + 1;
        counters.set(key, v);
        return v;
      }
      case 'EXPIRE':
        return 1;
      case 'ZADD': {
        const flags = new Set<string>();
        while (['NX', 'XX', 'GT', 'LT', 'CH'].includes(a[0]?.toUpperCase())) flags.add(a.shift()!.toUpperCase());
        const z = zset(key);
        let changed = 0;
        for (let i = 0; i < a.length; i += 2) {
          const score = Number(a[i]);
          const m = a[i + 1];
          const old = z.get(m);
          if (old !== undefined && (flags.has('NX') || (flags.has('GT') && score <= old) || (flags.has('LT') && score >= old))) continue;
          if (old === undefined || old !== score) changed++;
          z.set(m, score);
        }
        return changed;
      }
      case 'ZREVRANGE': {
        const list = sorted(key).slice(Number(a[0]), Number(a[1]) + 1);
        return a[2]?.toUpperCase() === 'WITHSCORES' ? list.flatMap(([m, s]) => [m, String(s)]) : list.map(([m]) => m);
      }
      case 'ZREVRANK': {
        const i = sorted(key).findIndex(([m]) => m === a[0]);
        return i < 0 ? null : i;
      }
      case 'ZCARD':
        return zset(key).size;
      case 'ZSCORE': {
        const v = zset(key).get(a[0]);
        return v === undefined ? null : String(v);
      }
      case 'HSET': {
        const h = hash(key);
        let n = 0;
        for (let i = 0; i < a.length; i += 2) {
          if (!h.has(a[i])) n++;
          h.set(a[i], a[i + 1]);
        }
        return n;
      }
      case 'HMGET':
        return a.map((f) => hash(key).get(f) ?? null);
      case 'HINCRBY': {
        const h = hash(key);
        const v = Number(h.get(a[0]) ?? 0) + Number(a[1]);
        h.set(a[0], String(v));
        return v;
      }
      case 'HEXISTS':
        return hash(key).has(a[0]) ? 1 : 0;
      case 'LPUSH': {
        const l = list(key);
        l.unshift(...a);
        return l.length;
      }
      case 'LTRIM': {
        const start = Number(a[0]);
        const stop = Number(a[1]);
        const l = list(key);
        const sliced = l.slice(start, stop < 0 ? undefined : stop + 1);
        lists.set(key, sliced);
        return 'OK';
      }
      case 'LRANGE': {
        const start = Number(a[0]);
        const stop = Number(a[1]);
        const l = list(key);
        return l.slice(start, stop < 0 ? undefined : stop + 1);
      }
      default:
        throw new Error(`memoryRedis: ${op} not supported`);
    }
  };
  return async (cmds) => cmds.map(run);
}

export function devApi(): Plugin {
  const redis = memoryRedis();
  return {
    name: 'block-spire-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/leaderboard', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const request = new Request(`http://localhost${req.originalUrl ?? req.url}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const out = await handleLeaderboard(request, process.env.LEADERBOARD_OFF ? null : redis);
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await out.text());
      });

      server.middlewares.use('/api/telemetry', async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
        const request = new Request(`http://localhost${req.originalUrl ?? req.url}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });

        // 本地持久化至 runs-telemetry.json
        if (req.method === 'POST') {
          try {
            const rawBody = Buffer.concat(chunks).toString('utf-8');
            const data = JSON.parse(rawBody);
            const teleFile = path.resolve(process.cwd(), 'runs-telemetry.json');
            let currentList: any[] = [];
            if (fs.existsSync(teleFile)) {
              try {
                currentList = JSON.parse(fs.readFileSync(teleFile, 'utf-8'));
              } catch {}
            }
            if (!Array.isArray(currentList)) currentList = [];
            const seen = new Set<number>();
            currentList = [data, ...currentList]
              .filter((item) => {
                if (!item.date || seen.has(item.date)) return false;
                seen.add(item.date);
                return true;
              })
              .slice(0, 1000);
            fs.writeFileSync(teleFile, JSON.stringify(currentList, null, 2), 'utf-8');
            console.log(`[DevApi] 自动接收并持久化新对局遥测数据！当前已累计: ${currentList.length} 局`);
          } catch (err) {
            console.error('[DevApi] 持久化遥测数据失败:', err);
          }
        }

        const out = await handleTelemetry(request, redis);
        res.statusCode = out.status;
        out.headers.forEach((v, k) => res.setHeader(k, v));
        res.end(await out.text());
      });
    },
  };
}
