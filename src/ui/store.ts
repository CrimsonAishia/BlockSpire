// Global UI state built on Preact signals. The run state object is mutated in place by run
// actions; `commit()` bumps a version signal so subscribed components re-render, persists the
// run, and drains run toasts.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import type { RunState } from '../run/run.ts';
import {
  type Profile, type Settings, ACHIEVEMENT_MAP, checkProgress, grant, loadProfile, loadSettings, loadRun,
  saveProfile as storeProfile, saveRun as storeRun, saveSettings as storeSettings,
} from '../meta/profile.ts';
import { setVolumes, sfx } from '../audio/audio.ts';
import { syncGameProgressToHost, selfProfile, fetchSelfProfileFromHost } from '../net/bakaboxBridge.ts';

export type Screen = 'boot' | 'title' | 'newrun' | 'run' | 'codex' | 'classic' | 'records' | 'leaderboard' | 'friends';

export const screen = signal<Screen>('boot');
export const runVersion = signal(0);
let runRef: RunState | null = null;

export const profile = signal<Profile>(loadProfile());
export const settings = signal<Settings>(loadSettings());

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'bad' | 'neutral' | 'gold';
}
export const toasts = signal<Toast[]>([]);
let toastId = 1;

export type Overlay = null | 'team' | 'settings' | 'abandon' | 'help';
export const overlay = signal<Overlay>(null);
export const friendsDrawerOpen = signal(false);
export function toggleFriendsDrawer(open?: boolean) {
  friendsDrawerOpen.value = open ?? !friendsDrawerOpen.value;
}

export const tooltip = signal<{ x: number; y: number; content: ComponentChildren } | null>(null);
/** Hovered tooltips, innermost last (a keyword tip inside a card tip, ...). */
export const tipStack: { id: number; content: () => ComponentChildren }[] = [];
export function hideTips() {
  tipStack.length = 0;
  tooltip.value = null;
}
export const stageScale = signal(1);
/**
 * Design resolution of the stage: 1600×900, smaller on phones and tablets so everything renders larger
 * (see App). `compact` is set on those screens: bigger small text, touch-friendly sizes.
 */
export const stageSize = signal({ w: 1600, h: 900 });
export const compact = signal(false);

/** Set while a backup import replaces the stored data: nothing may write over it before the reload. */
let frozen = false;
const saveRun = (r: RunState | null) => !frozen && storeRun(r);
const saveProfile = (p: Profile) => !frozen && storeProfile(p);
const saveSettings = (s: Settings) => !frozen && storeSettings(s);

/** Writes the run in progress now and stops all further saves (an import or undo follows, then a reload). */
export function freezeStorage() {
  clearTimeout(saveTimer);
  saveRun(runRef);
  frozen = true;
}

export function getRun(): RunState | null {
  return runRef;
}

export interface MyProgressInfo {
  status: 'online' | 'in_run' | 'classic' | 'offline';
  statusLabel: string;
  act?: number;
  floor?: number;
  totalFloor?: number;
  floorNote?: string;
  omen?: number;
  commander?: string;
  avatar?: string;
  username?: string;
  name?: string;
  hearts?: number;
  maxHearts?: number;
  emeralds?: number;
  won?: boolean;
  over?: boolean;
  detailText?: string;
  updatedAt?: number;
  time?: number;
}

export const myCurrentProgress = signal<MyProgressInfo>({
  status: 'online',
  statusLabel: '在线',
  detailText: '主界面 · 准备就绪',
  updatedAt: Date.now(),
  time: Date.now(),
});

const ACT_TITLES: Record<number, string> = {
  1: '第一幕',
  2: '第二幕',
  3: '第三幕',
  4: '筛界',
  5: '遗迹远征',
  6: '圣殿远征',
  7: '破碎堡垒',
};

export function syncProgress(r: RunState | null) {
  const me = selfProfile.value;
  const username = me?.username || profile.value.nickname || '史蒂夫';
  const avatar = me?.avatar || r?.commander || 'steve';
  const now = Date.now();

  if (!r) {
    const payload: MyProgressInfo = {
      status: 'online',
      statusLabel: '在线',
      detailText: '主界面 · 准备就绪',
      avatar,
      username,
      name: username,
      commander: 'steve',
      updatedAt: now,
      time: now,
    };
    myCurrentProgress.value = payload;
    void syncGameProgressToHost(payload);
    return;
  }
  const act = r.act;
  let floor = 1;
  let floorNote = '';

  if (r.nodeId && r.map?.nodes?.[r.nodeId]) {
    const node = r.map.nodes[r.nodeId];
    floor = node.row + 1;
    switch (node.type) {
      case 'battle': floorNote = '普通战斗'; break;
      case 'elite': floorNote = '精英战'; break;
      case 'shop': floorNote = '商店营地'; break;
      case 'rest': floorNote = '营火休息'; break;
      case 'treasure': floorNote = '宝箱遗迹'; break;
      case 'event': floorNote = '未知事件'; break;
      case 'boss': {
        const bossNotes: Record<number, string> = {
          1: '首领战',
          2: '决战凋灵',
          3: '决战末影龙',
          4: '幽匿巨像',
          5: '遗迹首领战',
          6: '圣殿首领战',
          7: '决战复仇之心',
        };
        floorNote = bossNotes[act] || '首领战';
        break;
      }
    }
  } else {
    const visitedCount = r.visited?.length ?? 0;
    floor = Math.max(1, Math.min(14, visitedCount + 1));
    const firstQueue = r.queue?.[0];
    if (firstQueue?.type === 'battle') {
      const bossNotes: Record<number, string> = {
        1: '首领战',
        2: '决战凋灵',
        3: '决战末影龙',
        4: '幽匿巨像',
        5: '遗迹首领战',
        6: '圣殿首领战',
        7: '决战复仇之心',
      };
      floorNote =
        firstQueue.kind === 'boss'
          ? (bossNotes[act] || '首领战')
          : firstQueue.kind === 'elite'
          ? '精英战'
          : '普通战斗';
    } else if (firstQueue?.type === 'shop') {
      floorNote = '商店营地';
    } else if (firstQueue?.type === 'rest') {
      floorNote = '营火休息';
    }
  }

  const actName = ACT_TITLES[act] || `第${act}幕`;
  const status = r.over ? 'online' : 'in_run';
  const statusLabel = r.over ? (r.won ? '已通关' : '已阵亡') : (act === 4 ? '筛界中' : act >= 5 ? '远征中' : '爬塔中');

  const payload: MyProgressInfo = {
    status,
    statusLabel,
    act,
    floor,
    totalFloor: (act - 1) * 14 + floor,
    floorNote,
    omen: r.omen,
    commander: r.commander,
    avatar,
    username,
    name: username,
    hearts: r.hearts,
    maxHearts: r.maxHearts,
    emeralds: r.emeralds,
    won: r.won,
    over: r.over,
    detailText: `${actName} · 第 ${floor} 层${floorNote ? ` (${floorNote})` : ''}${r.omen ? ` 不祥 ${r.omen}` : ''}`,
    updatedAt: now,
    time: now,
  };

  myCurrentProgress.value = payload;
  void syncGameProgressToHost(payload);
}

if (typeof window !== 'undefined') {
  setTimeout(() => syncProgress(loadRun()), 600);
  void fetchSelfProfileFromHost().then(() => syncProgress(loadRun()));
}

export function setRun(r: RunState | null) {
  runRef = r;
  runVersion.value++;
  saveRun(r);
  syncProgress(r);
}

let saveTimer = 0;
export function commit() {
  const r = runRef;
  if (!r) return;
  runVersion.value++;
  if (r.toasts.length) {
    for (const t of r.toasts) pushToast(t.text, t.tone);
    r.toasts = [];
  }
  // Discover mobs owned by the player.
  const p = profile.value;
  let changed = false;
  for (const c of [...r.team, ...r.bench])
    if (!p.discovered.includes(c.mob)) {
      p.discovered.push(c.mob);
      changed = true;
    }
  for (const rel of r.relics)
    if (!p.relicsSeen.includes(rel)) {
      p.relicsSeen.push(rel);
      changed = true;
    }
  if (r.tacticsState?.tactics) {
    p.tacticsSeen = p.tacticsSeen ?? [];
    for (const t of r.tacticsState.tactics) {
      if (!p.tacticsSeen.includes(t)) {
        p.tacticsSeen.push(t);
        changed = true;
      }
    }
  }
  if (r.tacticsState?.variants) {
    p.variantsSeen = p.variantsSeen ?? [];
    for (const v of Object.values(r.tacticsState.variants)) {
      if (v && !p.variantsSeen.includes(v)) {
        p.variantsSeen.push(v);
        changed = true;
      }
    }
  }
  if (changed) updateProfile(() => {});
  const earned = r.earned ?? [];
  r.earned = [];
  progress(r, earned);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveRun(runRef);
    syncProgress(runRef);
  }, 120);
}

export function pushToast(text: string, tone: Toast['tone'] = 'neutral') {
  const t = { id: toastId++, text, tone };
  toasts.value = [...toasts.value.slice(-4), t];
  if (tone === 'gold') sfx('relic', { vol: 0.5 });
  setTimeout(() => {
    toasts.value = toasts.value.filter((x) => x.id !== t.id);
  }, 3300);
}

/** Grants achievements (and checks unlocks) outside of run actions: classic mode, battlefield easter eggs... */
export function earnAchievement(...ids: string[]) {
  progress(null, ids);
}

/** Applies earned achievements and the run/profile checks, with a toast for everything new. */
export function progress(r: RunState | null, ids: string[] = []) {
  const before = profile.value;
  const p = { ...before };
  const got = ids.filter((id) => grant(p, id));
  const res = checkProgress(p, r);
  got.push(...res.achievements);
  const unlocks = res.unlocks;
  if (p.achievements === before.achievements && p.flags === before.flags) return;
  profile.value = p;
  saveProfile(p);
  for (const u of unlocks) pushToast(u, 'gold');
  if (r) r.unlocked = [...(r.unlocked ?? []), ...unlocks];
  for (const id of got) {
    const def = ACHIEVEMENT_MAP[id];
    pushToast(`${def.cat === 'secret' ? '隐藏成就' : '成就达成'}：${def.name}`, 'gold');
  }
}

export function updateProfile(fn: (p: Profile) => void) {
  const p = { ...profile.value };
  fn(p);
  profile.value = p;
  saveProfile(p);
}

export function discover(mob: string) {
  if (profile.value.discovered.includes(mob)) return;
  updateProfile((p) => {
    p.discovered = [...p.discovered, mob];
  });
}

export function updateSettings(patch: Partial<Settings>) {
  const s = { ...settings.value, ...patch };
  settings.value = s;
  saveSettings(s);
  setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
}

export function go(s: Screen) {
  hideTips();
  overlay.value = null;
  friendsDrawerOpen.value = false;
  screen.value = s;
}
