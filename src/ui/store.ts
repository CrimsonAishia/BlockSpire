// Global UI state built on Preact signals. The run state object is mutated in place by run
// actions; `commit()` bumps a version signal so subscribed components re-render, persists the
// run, and drains run toasts.
import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import type { RunState } from '../run/run.ts';
import {
  type Profile, type Settings, ACHIEVEMENT_MAP, checkProgress, grant, loadProfile, loadSettings, saveProfile, saveRun, saveSettings,
} from '../meta/profile.ts';
import { setVolumes, sfx } from '../audio/audio.ts';

export type Screen = 'boot' | 'title' | 'newrun' | 'run' | 'codex' | 'classic' | 'records' | 'leaderboard';

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

export const tooltip = signal<{ x: number; y: number; content: ComponentChildren } | null>(null);
/** Hovered tooltips, innermost last (a keyword tip inside a card tip, ...). */
export const tipStack: { id: number; content: () => ComponentChildren }[] = [];
export function hideTips() {
  tipStack.length = 0;
  tooltip.value = null;
}
export const stageScale = signal(1);

export function getRun(): RunState | null {
  return runRef;
}

export function setRun(r: RunState | null) {
  runRef = r;
  runVersion.value++;
  saveRun(r);
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
  if (changed) updateProfile(() => {});
  const earned = r.earned ?? [];
  r.earned = [];
  progress(r, earned);
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => saveRun(runRef), 120);
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
  screen.value = s;
}
