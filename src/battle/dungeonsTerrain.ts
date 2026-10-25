import { DUNGEONS_MAP_BY_ID } from '../data/dungeonsMaps.ts';
import { F, S, GW, GD, idx, generateTerrain, cellRand, featureHeight } from './terrain.ts';
import type { Terrain } from './terrain.ts';

/** An engine-compatible, opt-in map. Preview and battle consume these same cells. */
export function createDungeonsTerrain(mapId: string, seed: number): Terrain {
  const def = DUNGEONS_MAP_BY_ID[mapId];
  if (!def) throw new Error('Unknown Dungeons battle map: ' + mapId);
  const t = generateTerrain('plains', seed);
  t.biome = def.id;
  t.name = def.name;
  t.sky = def.sky;
  t.effects = [...def.effects];
  t.h.fill(def.height);
  t.s.fill(S[def.base]);
  t.f.fill(F.NONE);
  t.fh.fill(0);
  for (const region of def.regions) {
    const [x0, y0, x1, y1] = region.rect;
    if (x0 < 0 || x1 >= GW / 2 || y0 < 0 || y1 >= GD || x0 > x1 || y0 > y1) throw new Error('Invalid region in ' + mapId);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const cx of [x, GW - 1 - x]) {
      const i = idx(cx, y);
      if (region.surface !== undefined) t.s[i] = S[region.surface];
      if (region.height !== undefined) t.h[i] = region.height;
      if (region.feature !== undefined) {
        t.f[i] = F[region.feature];
        t.fh[i] = region.featureHeight ?? featureHeight(t.f[i], cellRand(seed, cx, y, 31));
      }
    }
  }
  return t;
}

export function serializeDungeonsTerrain(t: Terrain) {
  return { biome: t.biome, name: t.name, seed: t.seed, sky: t.sky, effects: [...t.effects],
    h: Array.from(t.h), s: Array.from(t.s), f: Array.from(t.f), fh: Array.from(t.fh) };
}
