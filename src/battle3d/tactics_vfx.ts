import * as THREE from 'three';
import { BLOCK, GD, GW } from '../battle/terrain.ts';
import type { BEvent, Unit } from '../battle/unit.ts';

/** Texture Atlas constants for 1088x1088 sheets */
const ATLAS = { n: 16, cw: 256, ch: 256, g: 8, cols: 4, width: 1088, height: 1088 };

export interface CueDef {
  effect: string;
  start: number;
  end: number;
  anchor: 'source' | 'sourceGround' | 'ground' | 'units' | 'travel' | 'beam';
  size: number;
  stage?: string;
  loop?: boolean;
  fadeTail?: number;
  condition?: string;
  grounded?: boolean;
  arc?: number;
  rotate?: boolean;
  offset?: number;
}

export interface ProfileDef {
  id: string;
  label: string;
  family: string;
  releaseAt: number;
  impactAt: number;
  duration: number;
  cues: CueDef[];
  statusEnd?: number;
}

const cue = (effect: string, start: number, end: number, anchor: CueDef['anchor'], size = 128, extra: Partial<CueDef> = {}): CueDef => ({
  effect: 'tactic_' + effect, start, end, anchor, size, ...extra,
});
const cast = (color: string, end: number) => cue('cast_' + color, 0, end, 'source', 95, { stage: 'windup' });
const mark = (support: boolean, end: number, size: number) => cue(support ? 'mark_support' : 'mark_danger', 0, end, 'ground', size, { stage: 'warning', loop: true, fadeTail: 0.1 });
const hold = (effect: string, start: number, end: number, size: number, extra: Partial<CueDef> = {}) => cue(effect, start, end, 'units', size, { stage: 'sustain', loop: true, fadeTail: 0.18, ...extra });

const BASE_PROFILES: ProfileDef[] = [
  {
    id: 'tnt', label: '遥控爆破', family: 'tnt', releaseAt: 0.6, impactAt: 0.6, duration: 1.35,
    cues: [
      cast('red', 0.6), mark(false, 0.6, 220), cue('demolition_charge', 0, 0.6, 'ground', 150, { stage: 'windup' }),
      cue('demolition_blast', 0.6, 1.22, 'ground', 255, { stage: 'impact' }),
      hold('concussion', 0.6, 1.1, 70, { condition: 'controlApplied' }),
    ],
  },
  {
    id: 'horn', label: '战术撤退', family: 'horn', releaseAt: 0.6, impactAt: 0.6, duration: 3.85,
    cues: [
      cast('teal', 0.6), mark(true, 0.6, 240), cue('command_wave', 0.6, 1.2, 'source', 150, { stage: 'release' }),
      cue('rally_banner', 0.6, 3.6, 'ground', 165, { stage: 'sustain', loop: true, fadeTail: 0.18 }),
      hold('retreat_trail', 0.6, 3.6, 90, { grounded: true }),
    ],
  },
  {
    id: 'acid', label: '强酸喷溅', family: 'acid', releaseAt: 0.6, impactAt: 0.84, duration: 5.04,
    cues: [
      cast('lime', 0.6), mark(false, 0.84, 190), cue('acid_flask', 0.6, 0.84, 'travel', 72, { stage: 'travel', arc: 65 }),
      cue('acid_splash', 0.84, 1.4, 'ground', 210, { stage: 'impact' }),
      cue('shield_shatter', 0.84, 1.36, 'units', 100, { stage: 'impact', condition: 'shieldRemoved' }),
      hold('corrosion', 0.84, 4.84, 76, { condition: 'armorReduced' }),
    ],
  },
  {
    id: 'cannon', label: '应急钱炮', family: 'cannon', releaseAt: 0.6, impactAt: 0.8, duration: 1.4,
    cues: [
      cast('gold', 0.6), cue('cannon_muzzle', 0.6, 0.9, 'source', 130, { stage: 'release' }),
      cue('emerald_shot', 0.6, 0.8, 'travel', 70, { stage: 'travel', rotate: true }),
      cue('coin_impact', 0.8, 1.35, 'units', 130, { stage: 'impact' }),
    ],
  },
  {
    id: 'smoke', label: '烟幕掩护', family: 'smoke', releaseAt: 0.4, impactAt: 0.58, duration: 3.82,
    cues: [
      cast('violet', 0.4), mark(true, 0.58, 220), cue('smoke_pot', 0.4, 0.58, 'travel', 65, { stage: 'travel', arc: 48 }),
      cue('smoke_cloud', 0.58, 1.3, 'ground', 245, { stage: 'impact' }),
      hold('smoke_guard', 0.58, 3.58, 65),
    ],
  },
  {
    id: 'ward', label: '应急护符', family: 'ward', releaseAt: 0.4, impactAt: 0.4, duration: 4.62, statusEnd: 4.4,
    cues: [
      cast('aqua', 0.4), mark(true, 0.4, 210), cue('ward_weave', 0.4, 0.85, 'units', 120, { stage: 'impact' }),
      hold('ward_hold', 0.4, 4.4, 105, { condition: 'shieldPresent' }),
      cue('ward_shatter', 4.4, 4.62, 'units', 105, { stage: 'expire' }),
    ],
  },
];

function cloneProfile(baseId: string, id: string, label: string, mutate: (p: ProfileDef) => void): ProfileDef {
  const base = BASE_PROFILES.find((p) => p.id === baseId)!;
  const copy: ProfileDef = {
    ...base,
    id,
    label,
    cues: base.cues.map((c) => ({ ...c })),
  };
  mutate(copy);
  return copy;
}

const VARIANT_PROFILES: ProfileDef[] = [
  cloneProfile('tnt', 'tnt__directional', '定向装药', (p) => {
    p.cues = p.cues.filter((c) => c.effect !== 'tactic_concussion');
    const blast = p.cues.find((c) => c.effect === 'tactic_demolition_blast');
    if (blast) blast.size = 180;
  }),
  cloneProfile('tnt', 'tnt__concussive', '震荡装药', (p) => {
    p.duration = 1.65;
    const blast = p.cues.find((c) => c.effect === 'tactic_demolition_blast');
    if (blast) blast.size = 220;
    const stun = p.cues.find((c) => c.effect === 'tactic_concussion');
    if (stun) stun.end = 1.5;
  }),
  cloneProfile('horn', 'horn__cover', '掩护撤退', (p) => {
    p.cues.push(hold('cast_aqua', 0.6, 3.6, 90));
  }),
  cloneProfile('horn', 'horn__pack', '猎群回旋', (p) => {
    p.duration = 5.85;
    p.cues.filter((c) => c.stage === 'sustain').forEach((c) => (c.end = 2.6));
    p.cues.push(hold('cast_teal', 2.6, 5.6, 78, { stage: 'arrival-buff' }));
  }),
  cloneProfile('acid', 'acid__strip_armor', '去甲试剂', (p) => {
    p.duration = 4.04;
    p.cues = p.cues.filter((c) => c.effect !== 'tactic_shield_shatter');
    const corr = p.cues.find((c) => c.effect === 'tactic_corrosion');
    if (corr) corr.end = 3.84;
  }),
  cloneProfile('acid', 'acid__dissolve_shield', '腐盾试剂', (p) => {
    p.duration = 1.65;
    p.cues = p.cues.filter((c) => c.effect !== 'tactic_corrosion');
    const shatt = p.cues.find((c) => c.effect === 'tactic_shield_shatter');
    if (shatt) shatt.size = 130;
  }),
  cloneProfile('cannon', 'cannon__buckshot', '散钞弹', (p) => {
    p.cues = p.cues.filter((c) => c.effect !== 'tactic_emerald_shot');
    p.cues.push(
      ...[-24, 0, 24].map((offset) => cue('emerald_shot', 0.6, 0.8, 'travel', 50, { stage: 'travel', rotate: true, offset })),
    );
    const imp = p.cues.find((c) => c.effect === 'tactic_coin_impact');
    if (imp) imp.size = 90;
  }),
  cloneProfile('cannon', 'cannon__recast', '重铸弹', (p) => {
    p.releaseAt = 1;
    p.impactAt = 1.2;
    p.duration = 1.85;
    p.cues.forEach((c) => {
      if (c.stage === 'windup') c.end = 1;
      else {
        c.start += 0.4;
        c.end += 0.4;
        c.size *= 1.15;
      }
    });
  }),
  cloneProfile('smoke', 'smoke__broad', '宽幅烟幕', (p) => {
    const cloud = p.cues.find((c) => c.effect === 'tactic_smoke_cloud');
    if (cloud) cloud.size = 295;
    const markCue = p.cues.find((c) => c.effect === 'tactic_mark_support');
    if (markCue) markCue.size = 290;
  }),
  cloneProfile('smoke', 'smoke__cleanse', '净化烟幕', (p) => {
    p.cues.push(cue('cleanse_spark', 0.58, 1.12, 'units', 95, { stage: 'impact', condition: 'dispelled' }));
  }),
  cloneProfile('ward', 'ward__lone', '孤军护符', (p) => {
    p.cues.filter((c) => c.anchor === 'units').forEach((c) => (c.size *= 1.25));
  }),
  cloneProfile('ward', 'ward__relay', '接力护符', (p) => {
    p.cues.filter((c) => c.anchor === 'units').forEach((c) => (c.size *= 0.82));
  }),
];

const PRIMARY_PROFILES: ProfileDef[] = [
  {
    id: 'steve_build', label: '史蒂夫 · 建造', family: 'steve', releaseAt: 0.25, impactAt: 0.25, duration: 1.6,
    cues: [
      cue('build_dust', 0, 0.8, 'ground', 220, { stage: 'release' }),
      cue('fort_outline', 0.25, 1.6, 'ground', 230, { stage: 'sustain', loop: true, fadeTail: 0.15 }),
    ],
  },
  {
    id: 'steve_build__bulwark', label: '史蒂夫 · 坚垒工程', family: 'steve', releaseAt: 0.25, impactAt: 0.25, duration: 1.6,
    cues: [
      cue('build_dust', 0, 0.8, 'ground', 220, { stage: 'release' }),
      cue('fort_outline', 0.25, 1.6, 'ground', 255, { stage: 'sustain', loop: true, fadeTail: 0.15 }),
    ],
  },
  {
    id: 'steve_build__fire_support', label: '史蒂夫 · 火力工事', family: 'steve', releaseAt: 0.25, impactAt: 0.25, duration: 1.6,
    cues: [
      cue('build_dust', 0, 0.8, 'ground', 220, { stage: 'release' }),
      cue('fort_outline', 0.25, 1.6, 'ground', 230, { stage: 'sustain', loop: true, fadeTail: 0.15 }),
      cue('cast_gold', 0.25, 1.55, 'ground', 150, { stage: 'sustain' }),
    ],
  },
  {
    id: 'alex_tame', label: '亚历克斯 · 驯服', family: 'alex', releaseAt: 0.2, impactAt: 0.6, duration: 1.7,
    cues: [
      cast('teal', 0.4), cue('tame_link', 0.2, 0.6, 'beam', 32, { stage: 'travel' }),
      hold('tame_seal', 0.6, 1.5, 100),
    ],
  },
  {
    id: 'alex_tame__soothing', label: '亚历克斯 · 安抚契约', family: 'alex', releaseAt: 0.2, impactAt: 0.6, duration: 1.7,
    cues: [
      cast('teal', 0.4), cue('tame_link', 0.2, 0.6, 'beam', 32, { stage: 'travel' }),
      hold('tame_seal', 0.6, 1.5, 115),
    ],
  },
  {
    id: 'alex_tame__mercenary', label: '亚历克斯 · 短期借兵', family: 'alex', releaseAt: 0.2, impactAt: 0.6, duration: 1.7,
    cues: [
      cast('teal', 0.4), cue('tame_link', 0.2, 0.6, 'beam', 32, { stage: 'travel' }),
      hold('tame_seal', 0.6, 1.5, 100),
      hold('cast_gold', 0.6, 1.5, 75),
    ],
  },
  {
    id: 'villager_hire', label: '村民 · 雇佣铁傀儡', family: 'villager', releaseAt: 0.3, impactAt: 0.3, duration: 1.7,
    cues: [
      cast('gold', 0.3), cue('hire_arrival', 0.3, 1.5, 'ground', 245, { stage: 'release' }),
    ],
  },
  {
    id: 'villager_hire__light_hire', label: '村民 · 轻装雇佣', family: 'villager', releaseAt: 0.3, impactAt: 0.3, duration: 1.7,
    cues: [
      cast('gold', 0.3), cue('hire_arrival', 0.3, 1.5, 'ground', 200, { stage: 'release' }),
    ],
  },
  {
    id: 'witch_brew', label: '女巫 · 坩埚', family: 'witch', releaseAt: 0.2, impactAt: 0.2, duration: 1.8,
    cues: [
      cue('brew_swirl', 0, 1.4, 'sourceGround', 190, { stage: 'release' }),
      cue('acid_flask', 0.8, 1.6, 'source', 65, { stage: 'ready' }),
    ],
  },
  {
    id: 'witch_brew__targeted', label: '女巫 · 定向配方', family: 'witch', releaseAt: 0.2, impactAt: 0.2, duration: 1.8,
    cues: [
      cue('brew_swirl', 0, 1.4, 'sourceGround', 190, { stage: 'release' }),
      cue('acid_flask', 0.8, 1.6, 'source', 65, { stage: 'ready' }),
      cue('cast_lime', 0.8, 1.6, 'source', 105, { stage: 'ready' }),
    ],
  },
  {
    id: 'witch_brew__twin', label: '女巫 · 应急双酿', family: 'witch', releaseAt: 0.2, impactAt: 0.2, duration: 1.8,
    cues: [
      cue('brew_swirl', 0, 1.4, 'sourceGround', 190, { stage: 'release' }),
      cue('acid_flask', 0.8, 1.6, 'source', 60, { stage: 'ready', offset: -26 }),
      cue('acid_flask', 0.8, 1.6, 'source', 60, { stage: 'ready', offset: 26 }),
    ],
  },
];

export const ALL_PROFILES = new Map<string, ProfileDef>(
  [...BASE_PROFILES, ...VARIANT_PROFILES, ...PRIMARY_PROFILES].map((p) => [p.id, p]),
);

interface ActiveCueMesh {
  mesh: THREE.Mesh;
  geo: THREE.PlaneGeometry;
  mat: THREE.MeshBasicMaterial;
  cue: CueDef;
}

interface ActiveVFX {
  id: number;
  profile: ProfileDef;
  startT: number;
  castId?: number;
  windup?: number;
  unitRefs: NonNullable<Extract<BEvent, { k: 'tactic_vfx' }>['units']>;
  points: {
    source: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    units: { x: number; y: number; z: number }[];
  };
  context: Record<string, boolean | undefined>;
  activeMeshes: Map<string, ActiveCueMesh>;
}

export class TacticsVfxManager {
  private scene: THREE.Scene;
  private textures = new Map<string, THREE.Texture>();
  private activeVFX: ActiveVFX[] = [];
  private nextId = 1;
  private sampleGroundY: (x: number, y: number) => number;

  private resolveUnit: (id: number) => Unit | undefined;

  constructor(scene: THREE.Scene, sampleGroundY: (x: number, y: number) => number, resolveUnit: (id: number) => Unit | undefined = () => undefined) {
    this.resolveUnit = resolveUnit;
    this.scene = scene;
    this.sampleGroundY = sampleGroundY;
  }

  private getTexture(effectId: string): THREE.Texture {
    let tex = this.textures.get(effectId);
    if (!tex) {
      const loader = new THREE.TextureLoader();
      tex = loader.load(`${import.meta.env.BASE_URL}assets/effects/${effectId}.webp`);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.set(effectId, tex);
    }
    return tex;
  }

  spawn(ev: Extract<BEvent, { k: 'tactic_vfx' }>, currentBattleTime: number) {
    const prof = ALL_PROFILES.get(ev.profile) ?? ALL_PROFILES.get(ev.profile.split('__')[0]);
    if (!prof) return;
    const existing = ev.castId === undefined ? undefined : this.activeVFX.find(fx => fx.castId === ev.castId);
    if (ev.phase === 'cancel') { if (existing) { existing.startT = -999; existing.windup = undefined; } return; }

    const to3D = (x: number, y: number, gz?: number) => {
      const wx = x / BLOCK - GW / 2;
      const wz = y / BLOCK - GD / 2;
      const wy = (gz ?? this.sampleGroundY(x, y)) / BLOCK;
      return { x: wx, y: wy, z: wz };
    };

    const inst: ActiveVFX = {
      id: this.nextId++,
      profile: prof,
      startT: currentBattleTime - (ev.phase === 'impact' ? prof.impactAt : 0),
      castId: ev.castId,
      windup: ev.phase === 'windup' ? ev.windup : undefined,
      unitRefs: ev.units ?? [],
      points: {
        source: to3D(ev.sx, ev.sy),
        target: to3D(ev.tx, ev.ty),
        units: (ev.units ?? []).map((u) => to3D(u.x, u.y)),
      },
      context: (ev.context ?? {}) as Record<string, boolean | undefined>,
      activeMeshes: new Map(),
    };
    if (existing) {
      existing.startT = inst.startT;
      existing.windup = inst.windup;
      existing.points = inst.points;
      existing.unitRefs = inst.unitRefs;
      existing.context = inst.context;
    } else this.activeVFX.push(inst);
  }

  update(currentBattleTime: number, camera: THREE.Camera) {
    for (let i = this.activeVFX.length - 1; i >= 0; i--) {
      const fx = this.activeVFX[i];
      const elapsed = fx.windup ? Math.min(fx.profile.impactAt - 0.0001, (currentBattleTime - fx.startT) / fx.windup * fx.profile.impactAt) : currentBattleTime - fx.startT;
      fx.points.units = fx.unitRefs.map(ref => {
        const u = ref.id === undefined ? undefined : this.resolveUnit(ref.id);
        const p = u ?? ref;
        return { x: p.x / BLOCK - GW / 2, y: (u?.gz ?? this.sampleGroundY(p.x, p.y)) / BLOCK, z: p.y / BLOCK - GD / 2 };
      });

      if (elapsed < 0 || elapsed >= fx.profile.duration) {
        // Dispose meshes and remove
        for (const m of fx.activeMeshes.values()) {
          this.scene.remove(m.mesh);
          m.geo.dispose();
          m.mat.dispose();
        }
        fx.activeMeshes.clear();
        this.activeVFX.splice(i, 1);
        continue;
      }

      // Sample cues
      const liveCues = fx.profile.cues.flatMap((c, cueIdx) => {
        if (elapsed < c.start || elapsed >= c.end || c.end <= c.start) return [];
        if (c.condition && fx.context[c.condition] === false) return [];
        const dur = c.end - c.start;
        const progress = (elapsed - c.start) / dur;
        const phase = c.loop ? ((elapsed - c.start) % 0.8) / 0.8 : progress;
        const tail = c.fadeTail ? Math.min(1, (c.end - elapsed) / c.fadeTail) : 1;
        const frame = Math.max(0, Math.min(15, Math.floor(phase * 16)));
        const indices = c.anchor === 'units' && fx.unitRefs.length ? fx.unitRefs.map((_, i) => i) : [-1];
        return indices.flatMap(unitIndex => {
          const ref = fx.unitRefs[unitIndex];
          const u = ref?.id === undefined ? undefined : this.resolveUnit(ref.id);
          if (c.condition === 'shieldRemoved' && ref?.shieldRemoved === false) return [];
          if (c.condition === 'armorReduced' && ref?.armorReduced === false) return [];
          if (c.condition === 'dispelled' && ref?.dispelled === false) return [];
          if (ref?.id !== undefined && (!u || !u.alive)) return [];
          if (c.condition === 'shieldPresent' && u && !u.timedShields.some(s => s.id === 'ward' && s.amount > 0)) return [];
          if (c.stage === 'sustain' && fx.profile.family === 'smoke' && u && !(u.ref.smokeT > 0)) return [];
          if (c.stage === 'sustain' && fx.profile.family === 'horn' && u && !u.ref.hornMarch) return [];
          if (c.stage === 'arrival-buff' && u && !(u.ref.hornPackUntil > currentBattleTime)) return [];
          if (c.condition === 'controlApplied' && u && !u.stunned) return [];
          return [{ c, cueKey: `${fx.id}_${cueIdx}_${unitIndex}`, progress, opacity: Math.max(0, tail), frame, unitIndex }];
        });
      });

      const currentKeys = new Set(liveCues.map((l) => l.cueKey));

      // Remove inactive cue meshes
      for (const [key, meshInfo] of fx.activeMeshes.entries()) {
        if (!currentKeys.has(key)) {
          this.scene.remove(meshInfo.mesh);
          meshInfo.geo.dispose();
          meshInfo.mat.dispose();
          fx.activeMeshes.delete(key);
        }
      }

      // Update or create active cue meshes
      for (const item of liveCues) {
        let entry = fx.activeMeshes.get(item.cueKey);
        if (!entry) {
          const tex = this.getTexture(item.c.effect);
          const geo = new THREE.PlaneGeometry(1, 1);
          const mat = new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          this.scene.add(mesh);
          entry = { mesh, geo, mat, cue: item.c };
          fx.activeMeshes.set(item.cueKey, entry);
        }

        // Update UV coordinates based on frame (256x256 within 1088x1088, stride 272, gutter 8)
        const col = item.frame % ATLAS.cols;
        const row = Math.floor(item.frame / ATLAS.cols);
        const u0 = (col * 272 + 8) / ATLAS.width;
        const u1 = (col * 272 + 264) / ATLAS.width;
        const v0 = 1 - (row * 272 + 264) / ATLAS.height;
        const v1 = 1 - (row * 272 + 8) / ATLAS.height;

        const uvs = new Float32Array([
          u0, v1, // Top-left
          u1, v1, // Top-right
          u0, v0, // Bottom-left
          u1, v0, // Bottom-right
        ]);
        entry.geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
        entry.mat.opacity = item.opacity;

        // Scale to 3D world (1 block = 32 pixels, cue.size is in pixels)
        const scale3D = (item.c.size / BLOCK) * 0.9;
        entry.mesh.scale.set(scale3D, scale3D, 1);

        // Positioning
        const { anchor } = item.c;
        const point = item.unitIndex >= 0 ? fx.points.units[item.unitIndex] : anchor === 'sourceGround' ? fx.points.source : fx.points.target;
        if (anchor === 'ground' || anchor === 'sourceGround' || item.c.grounded) {
          // Horizontal on ground
          entry.mesh.rotation.x = -Math.PI / 2;
          entry.mesh.rotation.y = 0;
          entry.mesh.rotation.z = 0;
          entry.mesh.position.set(point.x, point.y + 0.06, point.z);
        } else if (anchor === 'source') {
          entry.mesh.quaternion.copy(camera.quaternion);
          entry.mesh.position.set(fx.points.source.x, fx.points.source.y + 0.8, fx.points.source.z);
        } else if (anchor === 'travel') {
          // Travel from source to target with arc
          const px = fx.points.source.x + (fx.points.target.x - fx.points.source.x) * item.progress;
          const pz = fx.points.source.z + (fx.points.target.z - fx.points.source.z) * item.progress;
          const arcHeight = ((item.c.arc ?? 40) / BLOCK) * Math.sin(Math.PI * item.progress);
          const py = fx.points.source.y + (fx.points.target.y - fx.points.source.y) * item.progress + arcHeight;
          entry.mesh.quaternion.copy(camera.quaternion);
          entry.mesh.position.set(px, py + 0.5, pz);
        } else if (anchor === 'units') {
          // Centered over target units or primary target
          const pt = point;
          entry.mesh.quaternion.copy(camera.quaternion);
          entry.mesh.position.set(pt.x, pt.y + 0.9, pt.z);
        } else {
          entry.mesh.quaternion.copy(camera.quaternion);
          entry.mesh.position.set(fx.points.target.x, fx.points.target.y + 0.6, fx.points.target.z);
        }
      }
    }
  }

  clear() {
    for (const fx of this.activeVFX) {
      for (const m of fx.activeMeshes.values()) {
        this.scene.remove(m.mesh);
        m.geo.dispose();
        m.mat.dispose();
      }
      fx.activeMeshes.clear();
    }
    this.activeVFX = [];
  }

  dispose() {
    this.clear();
    for (const tex of this.textures.values()) {
      tex.dispose();
    }
    this.textures.clear();
  }
}
