// Asset URL helpers and preloading.
import spriteMeta from '../generated/sprites.json';
import sheetMeta from '../generated/sheets.json';
import { MOB_MAP, spriteOf } from '../data/mobs.ts';
import { RELIC_MAP, POTION_MAP } from '../data/items.ts';

const BASE = import.meta.env.BASE_URL;
const META = spriteMeta as Record<string, { w: number; h: number; ar: number }>;

/**
 * Battlefield sprite sheets (scripts/process-frames.mjs): `n` frames in a `cols` × `rows` grid of
 * `cw`×`ch` cells with a `g` px gutter, the idle frame's feet (fx from the left, fy from the
 * bottom, 0…1) and its height share `bh` of the cell. The full sheet (idle, walk, attack, hurt,
 * walk2, back, back_walk) says whether its flinch and rear view are real frames.
 */
export interface SheetMeta {
  /** Content hash, appended to the URL so the file can be cached for good. */
  v: string;
  n: number;
  cols: number;
  rows: number;
  cw: number;
  ch: number;
  g: number;
  fx: number;
  fy: number;
  bh: number;
  hurt?: boolean;
  back?: boolean;
}
export const SHEETS = sheetMeta as Record<string, { full?: SheetMeta; lite: SheetMeta }>;

/** Animation frame setting: all seven frames, the three basic ones, or the card art alone. */
export type FrameTier = 'high' | 'medium' | 'low';

/** The sheet a mob uses at a frame setting (falls back to the lite sheet), or null for the card art. */
export function sheetFor(id: string, tier: FrameTier): { url: string; meta: SheetMeta } | null {
  const key = MOB_MAP[id] ? spriteOf(MOB_MAP[id]) : id;
  const s = SHEETS[key];
  if (!s || tier === 'low') return null;
  if (tier === 'high' && s.full) return { url: `${BASE}assets/sprites/${key}.webp?v=${s.full.v}`, meta: s.full };
  return { url: `${BASE}assets/sprites/${key}_lite.webp?v=${s.lite.v}`, meta: s.lite };
}

export const url = {
  mob: (id: string) => `${BASE}assets/mobs/${MOB_MAP[id] ? spriteOf(MOB_MAP[id]) : id}.webp`,
  icon: (id: string) => `${BASE}assets/icons/${RELIC_MAP[id]?.icon ?? POTION_MAP[id]?.icon ?? id}.webp`,
  relic: (id: string) => `${BASE}assets/icons/${RELIC_MAP[id]?.icon ?? id}.webp`,
  crate: (id: string) => `${BASE}assets/crates/${id}.webp`,
  cmd: (id: string) => `${BASE}assets/commanders/${id}.webp`,
  bg: (id: string) => `${BASE}assets/bg/${id}.jpg`,
  event: (id: string) => `${BASE}assets/events/${id.endsWith('.webp') ? id : id === 'bg_tactics' ? `${id}.webp` : `${id}.jpg`}`,
  arena: (id: string) => `${BASE}assets/arena/${id}.jpg`,
  tex: (id: string) => `${BASE}assets/tex/${id}.png`,
};

export function spriteAspect(mobId: string): number {
  const m = MOB_MAP[mobId];
  const key = `mobs/${m ? spriteOf(m) : mobId}`;
  return META[key]?.ar ?? 1;
}

const cache = new Map<string, HTMLImageElement>();

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = cache.get(src);
  if (hit && hit.complete && hit.naturalWidth) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const img = hit ?? new Image();
    if (!hit) {
      img.decoding = 'async';
      img.src = src;
      cache.set(src, img);
    }
    const done = () => resolve(img);
    if (img.complete && img.naturalWidth) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    }
  });
}

export function getImage(src: string): HTMLImageElement | undefined {
  const img = cache.get(src);
  return img && img.complete && img.naturalWidth ? img : undefined;
}

export async function preload(srcs: string[], onProgress?: (f: number) => void) {
  let done = 0;
  await Promise.all(
    srcs.map((s) =>
      loadImage(s).then(() => {
        done++;
        onProgress?.(done / srcs.length);
      }),
    ),
  );
}
