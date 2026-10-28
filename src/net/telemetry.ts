// Automatic client-side telemetry reporting service
import type { HistoryEntry } from '../meta/profile.ts';
import { playerId } from './leaderboard.ts';

const QUEUE_KEY = 'mca.telemetry.queue.v1';
const API_URL = '/api/telemetry';

function getQueue(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setQueue(q: HistoryEntry[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-30)));
  } catch {
    /* storage unavailable */
  }
}

/**
 * 自动向服务器推送本局对战数据 (遥测分析专用)
 * 特性：
 * 1. 零人工干预：在每局结算时自动后台静默推送
 * 2. 弱网容错：断网或接口异常时自动存入本地离线重试队列
 * 3. 页面退出保全：使用 fetch keepalive 确保切换页面不中断上报
 */
export async function reportRunTelemetry(run: HistoryEntry): Promise<boolean> {
  const payload = {
    ...run,
    playerId: playerId(),
    clientTime: Date.now(),
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Player': playerId(),
      },
      body: JSON.stringify(payload),
      keepalive: true,
      signal: AbortSignal.timeout(6000),
    });

    if (res.ok) {
      // 成功上报后顺便尝试冲洗历史遗留队列
      void flushPendingTelemetry();
      return true;
    }
  } catch {
    // 静默降级存入离线重试队列
  }

  // 网络不可用或服务暂未开放时，进入待重试队列
  const q = getQueue();
  if (!q.some((item) => item.date === run.date)) {
    q.push(run);
    setQueue(q);
  }
  return false;
}

/**
 * 冲洗离线补发队列（在游戏进入主界面或网络恢复时自动调用）
 */
export async function flushPendingTelemetry(): Promise<void> {
  const q = getQueue();
  if (q.length === 0) return;

  const remaining: HistoryEntry[] = [];
  for (const item of q) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Player': playerId(),
        },
        body: JSON.stringify({ ...item, playerId: playerId() }),
        keepalive: true,
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  setQueue(remaining);
}

/**
 * 从服务器拉取近期聚合对战数据（用于分析脚本或管理面板）
 */
export async function fetchRemoteTelemetry(limit = 200): Promise<HistoryEntry[]> {
  const res = await fetch(`${API_URL}?limit=${limit}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { ok: boolean; runs?: HistoryEntry[] };
  return data.runs ?? [];
}
