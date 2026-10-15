// Save backups: everything the game keeps in localStorage (profile, settings, the run in
// progress) as a readable JSON file, or as a compact "save code" to paste between devices.
//   file: { game: 'block-spire', format: 1, exportedAt, data: { profile, settings, run } }
//   code: BSPIRE1:<base64url(deflate-raw(file JSON))>:<fnv-1a checksum>   (BSPIRE0 = uncompressed)
// Importing replaces the current data; the data it replaces is kept so it can be undone.

const KEYS = { profile: 'mca.profile.v1', settings: 'mca.settings.v1', run: 'mca.run.v3' } as const;
/** The data replaced by the last import or reset (undo). */
const UNDO_KEY = 'mca.backup.prev';
const MAX_TEXT = 4_000_000;

export interface Backup {
  game: 'block-spire';
  format: 1;
  exportedAt: number;
  data: { profile: Record<string, unknown>; settings?: Record<string, unknown> | null; run?: Record<string, unknown> | null };
}

function read(k: string): unknown {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function makeBackup(): Backup {
  return {
    game: 'block-spire',
    format: 1,
    exportedAt: Date.now(),
    data: {
      profile: (read(KEYS.profile) as Record<string, unknown>) ?? {},
      settings: read(KEYS.settings) as Record<string, unknown> | null,
      run: read(KEYS.run) as Record<string, unknown> | null,
    },
  };
}

export function backupFileName(b: Backup) {
  const d = new Date(b.exportedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `方块尖塔存档-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

export function downloadBackup(b: Backup) {
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = backupFileName(b);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ───────────────────────── save code ─────────────────────────

function fnv(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, '0');
}

function toB64url(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const res = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

export async function backupCode(b: Backup): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(b));
  const zip = typeof CompressionStream === 'function';
  const payload = toB64url(zip ? await pipe(raw, new CompressionStream('deflate-raw')) : raw);
  const head = zip ? 'BSPIRE1' : 'BSPIRE0';
  return `${head}:${payload}:${fnv(payload)}`;
}

// ───────────────────────── import ─────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Reads a backup file's text or a save code; throws an Error with a message for the player. */
export async function parseBackup(text: string): Promise<Backup> {
  // Chat apps may wrap a long save code: whitespace inside a code is dropped.
  const raw = text.trim();
  const t = raw.startsWith('{') ? raw : raw.replace(/\s+/g, '');
  if (!t) throw new Error('没有内容：请粘贴存档码，或者选择存档文件。');
  if (t.length > MAX_TEXT) throw new Error('内容太大了，这不像是方块尖塔的存档。');
  let json: string;
  if (t.startsWith('{')) json = t;
  else {
    const m = /^BSPIRE([01]):([A-Za-z0-9_-]+):([0-9a-f]{8})$/.exec(t);
    if (!m) throw new Error('无法识别：存档码应该以 BSPIRE 开头，请确认复制完整。');
    if (fnv(m[2]) !== m[3]) throw new Error('存档码不完整或被改动过：请重新复制一遍完整的存档码。');
    try {
      const bytes = fromB64url(m[2]);
      json = new TextDecoder().decode(m[1] === '1' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes);
    } catch {
      throw new Error('存档码解压失败：可能复制不完整，或者浏览器版本太旧。');
    }
  }
  let b: unknown;
  try {
    b = JSON.parse(json);
  } catch {
    throw new Error('存档文件已损坏，无法读取。');
  }
  if (!isObj(b) || b.game !== 'block-spire' || !isObj(b.data)) throw new Error('这不是方块尖塔的存档。');
  if (typeof b.format !== 'number' || b.format > 1) throw new Error('这个存档来自更新版本的游戏，请先刷新页面更新游戏后再导入。');
  const d = b.data;
  const p = d.profile;
  if (!isObj(p) || !Array.isArray(p.discovered) || !isObj(p.achievements)) throw new Error('存档里的玩家数据不完整。');
  const run = isObj(d.run) && Array.isArray(d.run.queue) && Array.isArray(d.run.team) && isObj(d.run.map) ? d.run : null;
  return { game: 'block-spire', format: 1, exportedAt: Number(b.exportedAt) || 0, data: { profile: p, settings: isObj(d.settings) ? d.settings : null, run } };
}

export interface BackupSummary {
  exportedAt: number;
  runs: number;
  wins: number;
  achievements: number;
  discovered: number;
  nickname?: string;
  run?: { commander: string; act: number; hearts: number; daily: boolean };
}

export function summarize(b: Backup): BackupSummary {
  const p = b.data.profile;
  const r = b.data.run;
  return {
    exportedAt: b.exportedAt,
    runs: Number(p.runs) || 0,
    wins: Number(p.wins) || 0,
    achievements: Object.keys(p.achievements as object).length,
    discovered: (p.discovered as unknown[]).length,
    nickname: typeof p.nickname === 'string' ? p.nickname : undefined,
    run: r && !r.over ? { commander: String(r.commander), act: Number(r.act) || 1, hearts: Number(r.hearts) || 0, daily: !!r.daily } : undefined,
  };
}

function write(b: Backup) {
  const set = (k: string, v: unknown) => (v ? localStorage.setItem(k, JSON.stringify(v)) : localStorage.removeItem(k));
  set(KEYS.profile, b.data.profile);
  set(KEYS.settings, b.data.settings);
  set(KEYS.run, b.data.run);
}

/** Keeps the current data so the next replacement can be undone. */
export function keepUndo() {
  try {
    localStorage.setItem(UNDO_KEY, JSON.stringify(makeBackup()));
  } catch {
    /* storage full or unavailable: nothing to undo then */
  }
}

/** Replaces this device's data with the backup and reloads the game. */
export function applyBackup(b: Backup) {
  keepUndo();
  write(b);
  location.reload();
}

export function undoBackup(): Backup | null {
  try {
    const raw = localStorage.getItem(UNDO_KEY);
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

/** Swaps the current data with the one kept before the last import or reset. */
export function restoreUndo() {
  const prev = undoBackup();
  if (!prev) return;
  keepUndo();
  write(prev);
  location.reload();
}
