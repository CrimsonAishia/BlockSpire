// Three.js battle arena: renders a Battle on a voxel Terrain. Mobs are card-art sprites that
// move like paper puppets and take the scene's light (sprites.ts), with a team-coloured outline;
// HP bars, damage numbers, callouts and name tags are drawn on a 2D overlay canvas.
import * as THREE from 'three';
import type { Battle } from '../battle/sim.ts';
import type { Proj, Unit } from '../battle/unit.ts';
import { NUM_CRIT, NUM_DODGE, NUM_DOT, NUM_HEAL, NUM_LIFESTEAL, NUM_MAGIC, NUM_TRUE } from '../battle/unit.ts';
import { BLOCK, DEPLOY_COLS, F, GD, GW, S, type Terrain } from '../battle/terrain.ts';
import { MOB_MAP, spriteOf } from '../data/mobs.ts';
import { SpriteRenderer, type SpritePose } from './sprites.ts';
import type { MobDef } from '../core/types.ts';
import { getImage, sheetFor, url, type FrameTier } from '../ui/assets.ts';
import { sfx } from '../audio/audio.ts';
import { buildWorld, type World } from './world.ts';
import { ITEM_MAP } from '../data/items.ts';

export interface ArenaOpts {
  shake: boolean;
  numbers: boolean;
  particles: 'high' | 'medium' | 'low';
  /** Animation frames per mob: all seven, the basic three, or the card art alone (default high). */
  frames?: FrameTier;
  /** A name-tag easter egg showed up on the field (secret achievements). */
  onEgg?: (id: 'dinnerbone' | 'jeb' | 'johnny') => void;
}

const SPRITE_SCALE = 1.3;
const UI_FONT = "'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif";
const TEAM_COLOR = [new THREE.Color(0x3d8bff), new THREE.Color(0xff3b3b)];
const SHIELD_COLOR = new THREE.Color(0xffd84a);

/** Debris colours for blown-up blocks (by surface) and features. */
const SURF_DEBRIS: Record<number, [string, string]> = {
  [S.GRASS]: ['#7a573d', '#5b9a37'], [S.DIRT]: ['#7a573d', '#8b6446'], [S.PATH]: ['#9a8655', '#7a573d'], [S.SAND]: ['#dbcf98', '#cbbd82'],
  [S.SNOW]: ['#f2f7fa', '#7a573d'], [S.ICE]: ['#9cc4f5', '#cfe4ff'], [S.STONE]: ['#8a8a8a', '#6e6e6e'], [S.GRAVEL]: ['#857f7a', '#6a6460'],
  [S.COBBLE]: ['#7a7a7a', '#5e5e5e'], [S.DEEPSLATE]: ['#4a4a50', '#36363c'], [S.MOSS]: ['#5a7a2a', '#7a573d'], [S.MUD]: ['#4a3a30', '#3a2c24'],
  [S.SOUL_SAND]: ['#5a4636', '#46362a'], [S.NETHERRACK]: ['#7d3232', '#5f2222'], [S.NYLIUM]: ['#a02a2a', '#7d3232'], [S.BASALT]: ['#555560', '#3e3e46'],
  [S.BLACKSTONE]: ['#2e2a30', '#3e3a40'], [S.NETHER_BRICK]: ['#3a1a1e', '#55262a'], [S.END_STONE]: ['#e0dca0', '#cfca8a'], [S.PURPUR]: ['#a87aa8', '#8e5e8e'],
  [S.PRISMARINE]: ['#5aa89a', '#3e8a7e'], [S.SANDSTONE]: ['#d8cb92', '#bcae74'],
  [S.PACKED_ICE]: ['#8fb4e8', '#c4dcfb'], [S.CALCITE]: ['#e6e4de', '#b8b4ac'], [S.BRITTLE_ICE]: ['#b8daf8', '#6f9bd0'],
  [S.SIFT_GRASS]: ['#f08aa0', '#ece4ef'], [S.SIFT_STONE]: ['#ece4ef', '#c4b6cc'], [S.CHITIN]: ['#d4704f', '#8a3a24'],
};
const FEAT_DEBRIS: Record<number, [string, string]> = {
  [F.OAK]: ['#6b4f2e', '#4e8a2e'], [F.SPRUCE]: ['#4a3420', '#2f5a34'], [F.CACTUS]: ['#3f8a2a', '#2f6a20'], [F.BOULDER]: ['#7a7a7a', '#5e5e5e'],
  [F.FUNGUS]: ['#b8302a', '#7a3a5a'], [F.BASALT_COL]: ['#555560', '#3e3e46'], [F.CHORUS]: ['#8a5aa0', '#c8a8d8'], [F.HAY]: ['#d6b24a', '#b8902e'],
  [F.WELL]: ['#7a7a7a', '#6b4f2e'], [F.COBWEB]: ['#e8e8e8', '#cfcfcf'], [F.WALL]: ['#7a7a7a', '#5e5e5e'], [F.OWALL]: ['#1a1024', '#2c1e3a'], [F.CWALL]: ['#3f8a2a', '#2f6a20'], [F.FLOWER]: ['#e04040', '#f0d040'], [F.TALLGRASS]: ['#5b9a37', '#4a7f2b'],
  [F.BONES]: ['#e8e2cc', '#cfc8b0'], [F.LANTERN]: ['#ffd27a', '#4a4a4a'], [F.TORCH]: ['#ffd27a', '#6b4f2e'],
  [F.ICICLE]: ['#bcdcfb', '#93bdf2'], [F.WHITE_TREE]: ['#efeadf', '#ff9cc0'], [F.SPIRE]: ['#d4704f', '#8a3a24'], [F.GLOWBULB]: ['#5ff4fa', '#5a8a6a'],
};

// ───────────────────────── helpers ─────────────────────────

/** Sim world → three.js coordinates (1 unit = 1 block). */
const tx = (x: number) => x / BLOCK - GW / 2;
const tz = (y: number) => y / BLOCK - GD / 2;
const ty = (z: number) => z / BLOCK;

function radialTexture(inner: string, outer: string) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface SpriteTex {
  tex: THREE.Texture;
  /** Frames in a cols × rows grid (1 = the card art alone; 3 = idle, walk, attack; 7 = full set). */
  n: number;
  cols: number;
  rows: number;
  /** Whether the full set's flinch and rear-view frames are real. */
  hurt: boolean;
  back: boolean;
  /** Aspect of one cell's content (w/h) and the gutter as a fraction of the cell's width/height. */
  ar: number;
  padX: number;
  padY: number;
  /** Feet of the idle frame within the content (from the left / bottom, 0…1), and its height share. */
  fx: number;
  fy: number;
  bh: number;
}

interface UnitView {
  u: Unit;
  /** Current mirror (−1…1, folds through 0 when turning), smoothed walk amount, last footstep,
   *  how long the attack / flinch frames stay up, and whether it shows its back (walking away). */
  flipCur?: number;
  atkT?: number;
  hurtT?: number;
  back?: boolean;
  walkAmt: number;
  step?: number;
  gy: number;
  poofed: boolean;
  /** Feet position and visual height (blocks), refreshed every frame. */
  pos: THREE.Vector3;
  h: number;
  /** Easter eggs: upside down (Dinnerbone), rainbow (jeb_), and an optional name tag. */
  tag?: string;
  flip: boolean;
  rainbow: boolean;
  beam?: THREE.Mesh;
  /** Displayed HP fraction trailing the real one (the white "damage chip" on the bar). */
  hpShow: number;
  hpHold: number;
}

function hash2(a: number, b: number) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const BEASTS = new Set(['wolf', 'goat', 'polar_bear', 'hoglin']);
const CHARGED = new THREE.Color(0x7fe8ff);
const ZONE_COLOR = { fire: 0xff6a1a, breath: 0xb44dff, lava: 0xff4a10, regen: 0xff7eb6, honey: 0xf2a41e, ouch: 0x3fe0c0, goo: 0xe8d84a, bloom: 0xff9a3c };
const ZONE_PART = { fire: '#ff8a2a', breath: '#c56cf0', lava: '#ffb02e', regen: '#ffb3d6', honey: '#ffd36a', ouch: '#7ff5de', goo: '#f5e86a', bloom: '#ffc070' };

// ───────────────────────── particles ─────────────────────────

/** Particle shapes, Minecraft style: 0 square, 1 damage heart, 2 crit star, 3 XP orb. */
export const SH_SQUARE = 0;
export const SH_HEART = 1;
export const SH_STAR = 2;
export const SH_ORB = 3;

let shapeAtlas: THREE.CanvasTexture | null = null;
function particleShapes() {
  if (shapeAtlas) return shapeAtlas;
  const art = [
    ['########', '########', '########', '########', '########', '########', '########', '########'],
    ['.##..##.', '#oo##oo#', '#oooooo#', '#oooooo#', '.#oooo#.', '..#oo#..', '...##...', '........'],
    ['...#....', '...#....', '..###...', '#######.', '..###...', '..#.#...', '.#...#..', '........'],
    ['..####..', '.#oooo#.', '#oo##oo#', '#o####o#', '#o####o#', '#oo##oo#', '.#oooo#.', '..####..'],
  ];
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 8;
  const g = c.getContext('2d')!;
  art.forEach((rows, k) =>
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch === '.') return;
        // '#' marks the darker rim, 'o' the brighter body (the shader tells them apart by value).
        g.fillStyle = ch === '#' ? '#ffffff' : '#c8c8c8';
        g.fillRect(k * 8 + x, y, 1, 1);
      }),
    ),
  );
  shapeAtlas = new THREE.CanvasTexture(c);
  shapeAtlas.magFilter = shapeAtlas.minFilter = THREE.NearestFilter;
  shapeAtlas.generateMipmaps = false;
  return shapeAtlas;
}

class Particles {
  cap: number;
  n = 0;
  pos: Float32Array;
  col: Float32Array;
  size: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  max: Float32Array;
  grav: Float32Array;
  drag: Float32Array;
  shape: Float32Array;
  geo: THREE.BufferGeometry;
  points: THREE.Points;
  alphaAttr: Float32Array;

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.alphaAttr = new Float32Array(cap);
    this.shape = new Float32Array(cap);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaAttr, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('shape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { scale: { value: 400 }, shapes: { value: particleShapes() } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; attribute float shape; varying vec3 vC; varying float vA; varying float vS; uniform float scale;
        void main(){ vC = color; vA = alpha; vS = shape; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / max(0.5, -mv.z) * (shape > 0.5 ? 1.6 : 1.0); gl_Position = projectionMatrix * mv; }`,
      // Preprocessor directives must sit on their own line.
      fragmentShader: `uniform sampler2D shapes; varying vec3 vC; varying float vA; varying float vS;
void main(){
  if (vA <= 0.0) discard;
  vec4 t = texture2D(shapes, vec2((gl_PointCoord.x + floor(vS + 0.5)) / 4.0, 1.0 - gl_PointCoord.y));
  if (t.a < 0.5) discard;
  gl_FragColor = vec4(vC * (vS > 0.5 ? (t.r < 0.9 ? 1.35 : 0.75) : 1.0), vA);
#include <colorspace_fragment>
}`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  add(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.Color, grav = 0, drag = 0, shape = 0) {
    let i = this.n;
    if (i >= this.cap) i = (Math.random() * this.cap) | 0;
    else this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
    this.life[i] = life;
    this.max[i] = life;
    this.size[i] = size;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.shape[i] = shape;
  }

  update(dt: number) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        for (let k = 0; k < 3; k++) {
          this.pos[i * 3 + k] = this.pos[l * 3 + k];
          this.vel[i * 3 + k] = this.vel[l * 3 + k];
          this.col[i * 3 + k] = this.col[l * 3 + k];
        }
        this.life[i] = this.life[l];
        this.max[i] = this.max[l];
        this.size[i] = this.size[l];
        this.grav[i] = this.grav[l];
        this.drag[i] = this.drag[l];
        this.shape[i] = this.shape[l];
        continue;
      }
      const d = this.drag[i];
      if (d > 0) {
        const f = Math.max(0, 1 - d * dt);
        this.vel[i * 3] *= f;
        this.vel[i * 3 + 1] *= f;
        this.vel[i * 3 + 2] *= f;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const a = this.life[i] / this.max[i];
      this.alphaAttr[i] = a < 0.35 ? a / 0.35 : 1;
      i++;
    }
    for (let k = this.n; k < Math.min(this.cap, this.n + 64); k++) this.alphaAttr[k] = 0;
    this.geo.setDrawRange(0, this.n);
    for (const a of ['position', 'color', 'size', 'alpha', 'shape']) (this.geo.getAttribute(a) as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ───────────────────────── effects ─────────────────────────

interface Fx {
  kind: 'ring' | 'bolt' | 'sonic' | 'fang' | 'beam' | 'text' | 'flashSprite' | 'throw' | 'tnt';
  t: number;
  dur: number;
  objs: THREE.Object3D[];
  data?: Record<string, unknown>;
}

interface Num {
  x: number;
  y: number;
  z: number;
  rise: number;
  life: number;
  max: number;
  text: string;
  color: string;
  size: number;
  kind?: number;
}

// ───────────────────────── Arena ─────────────────────────

export class Arena3D {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  overlay: HTMLCanvasElement;
  octx: CanvasRenderingContext2D;
  world: World;
  terrain: Terrain;
  b: Battle;
  opts: ArenaOpts;
  views = new Map<number, UnitView>();
  sprites = new Map<string, SpriteTex>();
  /** Card-art sprites for mobs drawn without a block model (sprites.ts). */
  spriteR = new SpriteRenderer();
  private spritePose: SpritePose = {
    x: 0, y: 0, z: 0, ground: 0, w: 1, h: 1, ax: 0.5, ay: 0, frame: 0, flip: 1, bend: 0, rot: 0, sx: 1, sy: 1, lift: 0, wobble: 0,
    flash: 0, tint: new THREE.Color(), tintAmt: 0, alpha: 1, outline: new THREE.Color(), outlineOn: 1, shadow: 0,
  };
  shadowGeo: THREE.CircleGeometry;
  shadowMat: THREE.MeshBasicMaterial;
  /** All blob shadows in one instanced draw. */
  shadows: THREE.InstancedMesh;
  glowTex: THREE.Texture;
  partN: Particles;
  partA: Particles;
  projPools = new Map<string, THREE.Object3D[]>();
  fx: Fx[] = [];
  zoneViews = new Map<object, THREE.Mesh>();
  nums: Num[] = [];
  texts: { x: number; y: number; z: number; s: string; color: string; t: number; tac?: boolean }[] = [];
  time = 0;
  shake = 0;
  flash = 0;
  flashColor = '#fff';
  sfxEnabled = true;
  statusTick = 0;
  width = 1600;
  height = 900;
  dpr = 1;
  // Camera state. It follows the fight (or the deploying side) until the player pans it: then `free`
  // holds the focus at fx/fz and the distance at fdist until resetView().
  cam = {
    yaw: 0, pitch: 0.66, dist: 31, x: 0, y: 0, z: 1, zoom: 1, userYaw: 0, userPitch: 0.66, mode: 'battle' as 'battle' | 'deploy', side: 0 as 0 | 1,
    free: false, fx: 0, fz: 0, fdist: 31, zs: 1, ease: 0,
  };
  /** Held keyboard pan direction (-1..1 each): x to the right, y forward, as seen from the camera. */
  keyPan = { x: 0, y: 0 };
  deployGroup = new THREE.Group();
  hoverBox: THREE.LineSegments;
  private tmpV = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private colorCache = new Map<string, THREE.Color>();
  private emptyBeams: THREE.Mesh[] = [];
  private keepers = new THREE.Group();
  private keeperFrames = 0;
  /** Terrain changes already rebuilt, and every cell this arena has reshaped (to restore on retries). */
  private terrVer = 0;
  private terrSeen = 0;
  private terrRebuildT = 0;
  private reshaped = new Set<number>();
  private tmpColor = new THREE.Color();
  /** Hit-stop: a few frames of slow motion on heavy hits and big kills (real-time timers). */
  private stopT = 0;
  private stopCd = 0;
  private lastReal = performance.now();
  private tmpM = new THREE.Matrix4();
  private outColor = new THREE.Color();
  /** Arrows and tridents left sticking out of trees and hills. */
  private stuck: { o: THREE.Object3D; t: number }[] = [];

  constructor(container: HTMLElement, terrain: Terrain, battle: Battle, opts: ArenaOpts) {
    this.terrain = terrain;
    this.b = battle;
    this.opts = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'arena-gl';
    container.appendChild(this.renderer.domElement);
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'arena-overlay';
    container.appendChild(this.overlay);
    this.octx = this.overlay.getContext('2d')!;
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.3, 900);

    this.world = buildWorld(terrain);
    this.scene.add(this.world.group);
    const sky = this.world.sky;
    this.scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    this.scene.background = new THREE.Color(sky.fog);
    const hemi = new THREE.HemisphereLight(sky.hemi[0], sky.hemi[1], sky.hemi[2]);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(sky.sun, sky.sunI);
    sun.position.set(-18, 34, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 26;
    sc.bottom = -26;
    sc.near = 1;
    sc.far = 90;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, sun.target);

    this.shadowGeo = new THREE.CircleGeometry(0.5, 20);
    this.shadowGeo.rotateX(-Math.PI / 2);
    const st = radialTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)');
    this.shadowMat = new THREE.MeshBasicMaterial({ map: st, transparent: true, depthWrite: false, fog: false });
    this.shadows = new THREE.InstancedMesh(this.shadowGeo, this.shadowMat, 320);
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = 1;
    this.shadows.count = 0;
    this.scene.add(this.shadows);
    this.glowTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    const cap = opts.particles === 'high' ? 3000 : opts.particles === 'medium' ? 1500 : 600;
    this.partN = new Particles(cap, false);
    this.partA = new Particles(Math.floor(cap * 0.7), true);
    this.scene.add(this.partN.points, this.partA.points, this.deployGroup, this.spriteR.group);
    // Sprites take the biome's light: a little sky colour on top, ground bounce below, sun rims.
    const skyC = new THREE.Color(sky.hemi[0]);
    const groundC = new THREE.Color(sky.hemi[1]);
    const sunC = new THREE.Color(sky.sun);
    const white = new THREE.Color(1, 1, 1);
    const tintOf = (c: THREE.Color, k: number, mul: number) => white.clone().lerp(c, k).multiplyScalar(mul).toArray() as [number, number, number];
    this.spriteR.setLook({
      light: sky.unitLight,
      sky: tintOf(skyC, 0.12, 1.04),
      ground: tintOf(groundC, 0.3, 0.9),
      sun: sunC.toArray().map((v) => v * Math.min(1, sky.sunI / 2.2)) as [number, number, number],
      sunDir: [sun.position.x, sun.position.y, sun.position.z],
    });

    const hb = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
    this.hoverBox = new THREE.LineSegments(hb, new THREE.LineBasicMaterial({ color: 0x7dff9f, transparent: true, opacity: 0.9, depthTest: false }));
    this.hoverBox.visible = false;
    this.hoverBox.renderOrder = 20;
    this.scene.add(this.hoverBox);
    this.syncUnits(0);
    this.warmup();
  }

  // ───────────────────────── setup ─────────────────────────

  setBattle(b: Battle) {
    // A new battle starts on pristine terrain: undo any craters the previous one left.
    if (this.reshaped.size) {
      this.world.rebuild(b.terrain, this.reshaped);
      this.reshaped.clear();
      this.renderer.shadowMap.needsUpdate = true;
    }
    // Changes made before the battle started (Steve's deployment builds) are drawn right away.
    if (b.terrain.dirty.length) {
      for (const c of b.terrain.dirty) this.reshaped.add(c);
      this.world.rebuild(b.terrain, b.terrain.dirty);
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.terrVer = b.terrain.ver;
    this.terrSeen = b.terrain.dirty.length;
    for (const s of this.stuck) this.drop(s.o);
    this.stuck = [];
    this.views.clear();
    for (const z of this.zoneViews.values()) this.scene.remove(z);
    this.zoneViews.clear();
    this.b = b;
    this.nums = [];
    this.texts = [];
    this.syncUnits(0);
  }

  resize(cssW: number, cssH: number, stageScale: number) {
    this.width = cssW;
    this.height = cssH;
    this.dpr = Math.min(2, (window.devicePixelRatio || 1) * stageScale);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(cssW, cssH, false);
    this.renderer.domElement.style.width = `${cssW}px`;
    this.renderer.domElement.style.height = `${cssH}px`;
    this.overlay.width = Math.round(cssW * this.dpr);
    this.overlay.height = Math.round(cssH * this.dpr);
    this.overlay.style.width = `${cssW}px`;
    this.overlay.style.height = `${cssH}px`;
    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();
    (this.partN.points.material as THREE.ShaderMaterial).uniforms.scale.value = (cssH * this.dpr) / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    (this.partA.points.material as THREE.ShaderMaterial).uniforms.scale.value = (cssH * this.dpr) / 2 / Math.tan((this.camera.fov * Math.PI) / 360);
    this.renderer.shadowMap.needsUpdate = true;
  }

  private sprite(m: MobDef): SpriteTex | null {
    const key = spriteOf(m);
    const hit = this.sprites.get(key);
    if (hit) return hit;
    // A sheet of poses when the mob has one (at the chosen frame setting), otherwise its card art.
    const sh = sheetFor(m.id, this.opts.frames ?? 'high');
    const sheet = sh ? getImage(sh.url) : undefined;
    if (sheet && sh) {
      const sm = sh.meta;
      const tex = new THREE.Texture(sheet);
      tex.needsUpdate = true;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const cellW = sm.cw + sm.g * 2;
      const cellH = sm.ch + sm.g * 2;
      const st: SpriteTex = {
        tex, n: sm.n, cols: sm.cols, rows: sm.rows, hurt: !!sm.hurt, back: !!sm.back,
        ar: sm.cw / sm.ch, padX: sm.g / cellW, padY: sm.g / cellH, fx: sm.fx, fy: sm.fy, bh: sm.bh,
      };
      this.sprites.set(key, st);
      return st;
    }
    const img = getImage(url.mob(m.id));
    if (!img) return null;
    const pad = 10;
    const scale = Math.min(1, 256 / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const c = document.createElement('canvas');
    c.width = w + pad * 2;
    c.height = h + pad * 2;
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, pad, pad, w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const st: SpriteTex = { tex, n: 1, cols: 1, rows: 1, hurt: false, back: false, ar: w / h, padX: pad / c.width, padY: pad / c.height, fx: 0.5, fy: 0, bh: 1 };
    this.sprites.set(key, st);
    return st;
  }

  /**
   * Keeps one instance of every transient material alive, rendered (hidden under the ground)
   * during the first frames so their programs compile up front. three.js frees a program when
   * its last material is disposed, so without these each explosion, lightning bolt or
   * deploy-preview rebuild recompiled shaders mid-battle (60–260 ms hitches).
   * (`renderer.compile()` can't be used: it produces different program keys than real frames.)
   */
  private warmup() {
    const g = this.keepers;
    const geo = new THREE.PlaneGeometry(0.01, 0.01);
    const add = (m: THREE.Material) => g.add(new THREE.Mesh(geo, m));
    const fx = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    add(new THREE.MeshBasicMaterial({ ...fx, side: THREE.DoubleSide }));
    add(new THREE.MeshBasicMaterial({ ...fx, fog: false }));
    add(new THREE.MeshBasicMaterial(fx));
    add(new THREE.MeshBasicMaterial({}));
    add(new THREE.MeshLambertMaterial({}));
    g.add(new THREE.Sprite(new THREE.SpriteMaterial({ ...fx, map: this.glowTex })));
    g.position.set(0, -6, 0);
    g.traverse((o) => (o.frustumCulled = false));
    this.scene.add(g);
  }

  /** Smoothed 0…1 walk amount from how fast the unit moved (eases in and out of the walk). */
  private walkAmount(v: UnitView, dt: number) {
    const u = v.u;
    const moved = Math.hypot(u.x - u.px, u.y - u.py) / BLOCK;
    const bps = dt > 0 ? moved / (1 / 30) : 0;
    const want = u.alive && u.moving ? Math.min(1, bps / 2.2) : 0;
    v.walkAmt += (want - v.walkAmt) * (1 - Math.pow(0.6, dt * 20));
    return v.walkAmt;
  }

  private makeView(u: Unit): UnitView | null {
    if (!this.sprite(u.mob)) return null;
    const v: UnitView = {
      u, gy: ty(u.gz), poofed: false, pos: new THREE.Vector3(tx(u.x), ty(u.gz), tz(u.y)),
      h: (u.size * SPRITE_SCALE) / BLOCK, walkAmt: 0, flip: false, rainbow: false, hpShow: u.hp / u.maxHp, hpHold: 0,
    };
    this.rollVariants(v);
    this.views.set(u.id, v);
    return v;
  }

  /**
   * Cosmetic easter eggs (never affect the battle): Dinnerbone/Grumm name tags flip a mob upside
   * down, jeb_ makes beasts cycle through the rainbow, and some vindicators are called Johnny.
   */
  private rollVariants(v: UnitView) {
    const u = v.u;
    const r = (salt: number) => hash2(u.id * 7919 + salt, this.b.terrain.seed);
    const id = u.mob.id;
    if (u.boss || u.structure || (u.isSummon && r(1) > 0.5)) return;
    if (r(2) < 1 / 160) {
      v.flip = true;
      v.tag = r(3) < 0.5 ? 'Dinnerbone' : 'Grumm';
    } else if (BEASTS.has(id) && r(4) < 1 / 90) {
      v.rainbow = true;
      v.tag = 'jeb_';
    } else if (id === 'vindicator' && r(5) < 1 / 10) v.tag = 'Johnny';
    if (v.tag) this.opts.onEgg?.(v.tag === 'jeb_' ? 'jeb' : v.tag === 'Johnny' ? 'johnny' : 'dinnerbone');
  }

  private syncUnits(_dt: number) {
    const seen = new Set<number>();
    for (const u of this.b.units) {
      seen.add(u.id);
      if (!this.views.has(u.id)) this.makeView(u);
    }
    for (const id of this.views.keys()) if (!seen.has(id)) this.views.delete(id);
  }

  color(c: string) {
    let k = this.colorCache.get(c);
    if (!k) {
      k = new THREE.Color(c);
      this.colorCache.set(c, k);
    }
    return k;
  }

  // ───────────────────────── events ─────────────────────────

  consumeEvents() {
    const ev = this.b.events;
    if (!ev.length) return;
    const pm = this.opts.particles === 'high' ? 1 : this.opts.particles === 'medium' ? 0.6 : 0.3;
    const n = (k: number) => Math.max(1, Math.round(k * pm));
    const P = this.partN;
    const A = this.partA;
    const pan = (x: number) => (x / (GW * BLOCK)) * 2 - 1;
    for (const e of ev) {
      switch (e.k) {
        case 'num': {
          if (e.v > 0 && e.c !== NUM_HEAL && e.c !== NUM_LIFESTEAL && e.c !== NUM_DODGE && e.c !== NUM_DOT) {
            // Vanilla-style dark damage hearts, more for bigger hits.
            const hx = tx(e.x);
            const hy = ty(e.z) - 0.2;
            const hz = tz(e.y);
            const dark = this.color('#5e0b0b');
            for (let i = 0; i < Math.min(4, 1 + Math.floor(e.v / 35)); i++)
              P.add(hx + (Math.random() - 0.5) * 0.4, hy, hz + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 1.6, 1.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.6, 0.7, 0.12, dark, 5, 1.5, SH_HEART);
            if (e.c === NUM_CRIT) {
              const c1 = this.color('#fff6b0');
              const c2 = this.color('#ffffff');
              for (let i = 0; i < n(10); i++) {
                const a = Math.random() * Math.PI * 2;
                A.add(hx, hy + 0.3, hz, Math.cos(a) * 3.5, 1 + Math.random() * 3, Math.sin(a) * 3.5, 0.45, 0.13, i % 2 ? c1 : c2, 4, 3, SH_STAR);
              }
              if (e.v >= 50) this.hitStop(0.06);
            }
          }
          if (e.c === NUM_LIFESTEAL && e.v > 0) {
            // Lifesteal feedback: small crimson hearts gently floating from the healed unit
            const hx = tx(e.x);
            const hy = ty(e.z) + 0.2;
            const hz = tz(e.y);
            const red = this.color('#ff4d6d');
            for (let i = 0; i < n(3); i++) {
              P.add(hx + (Math.random() - 0.5) * 0.3, hy, hz + (Math.random() - 0.5) * 0.3,
                (Math.random() - 0.5) * 0.8, 1.3 + Math.random() * 0.9, (Math.random() - 0.5) * 0.8,
                0.65, 0.11, red, 4, 1.2, SH_HEART);
            }
          }
          if (!this.opts.numbers) break;
          if (e.c !== NUM_DODGE && e.v <= 0) break;
          if (this.nums.length > 100) this.nums.shift();
          const map: Record<number, [string, number]> = {
            0: ['#ffffff', 20], [NUM_CRIT]: ['#ffd23f', 28], [NUM_MAGIC]: ['#e29bff', 20], [NUM_HEAL]: ['#7bff8f', 19],
            [NUM_LIFESTEAL]: ['#ff7e7e', 18], [NUM_DOT]: ['#ffb066', 17], [NUM_TRUE]: ['#8ff6ff', 22], [NUM_DODGE]: ['#d0d0d0', 18],
          };
          const [color, size] = map[e.c] ?? map[0];
          const text = e.c === NUM_DODGE ? '闪避' : e.c === NUM_HEAL ? `+${e.v}` : e.c === NUM_LIFESTEAL ? `+${e.v} ❤` : e.c === NUM_CRIT ? `⚔ ${e.v}!` : `${e.v}`;
          this.nums.push({
            x: tx(e.x) + (Math.random() - 0.5) * 0.5,
            y: ty(e.z) + 0.2,
            z: tz(e.y),
            rise: 0,
            life: e.c === NUM_LIFESTEAL ? 0.8 : 0.95,
            max: e.c === NUM_LIFESTEAL ? 0.8 : 0.95,
            text,
            color,
            size,
            kind: e.c,
          });
          break;
        }
        case 'hit': {
          const c = this.color(e.color);
          const x = tx(e.x);
          const y = ty(e.z);
          const z = tz(e.y);
          for (let i = 0; i < n(e.big ? 9 : 5); i++)
            P.add(x, y, z, (Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4, 0.3 + Math.random() * 0.25, e.big ? 0.14 : 0.1, c, 9, 2);
          if (e.big) {
            this.hitStop(0.06);
            if (this.opts.shake) this.shake = Math.max(this.shake, 2.5);
          }
          if (this.sfxEnabled) sfx(e.big ? 'hit_big' : 'hit', { vol: 0.35, pan: pan(e.x) });
          break;
        }
        case 'death': {
          // Afterimages simply fade out.
          if (e.u.ghost) {
            const c = this.color('#7ff5de');
            for (let i = 0; i < n(10); i++) A.add(tx(e.u.x) + (Math.random() - 0.5), ty(e.u.gz) + Math.random() * 2, tz(e.u.y) + (Math.random() - 0.5), 0, 1, 0, 0.6, 0.12, c, -1, 0);
            break;
          }
          if (this.sfxEnabled) sfx('death', { vol: 0.35, pan: pan(e.u.x) });
          // Experience orbs pop out, like vanilla.
          const u = e.u;
          const orbs = u.isSummon ? 1 : Math.min(6, 2 + Math.floor(u.maxHp / 250));
          const g1 = this.color('#c8ff3a');
          const g2 = this.color('#f2ff8a');
          for (let i = 0; i < n(orbs); i++) {
            const a = Math.random() * Math.PI * 2;
            P.add(tx(u.x), ty(u.gz + u.z) + 0.6, tz(u.y), Math.cos(a) * 1.8, 3 + Math.random() * 2, Math.sin(a) * 1.8, 1.1 + Math.random() * 0.4, 0.1, i % 2 ? g1 : g2, 9, 0.8, SH_ORB);
          }
          if (!u.isSummon && (u.maxHp >= 300 || u.boss)) this.hitStop(u.boss ? 0.25 : 0.08);
          break;
        }
        case 'zone': {
          const x = tx(e.x);
          const z = tz(e.y);
          const y = this.groundY(e.x, e.y) + 0.1;
          const r = e.r / BLOCK;
          this.ring(x, y, z, r, e.color, e.t);
          break;
        }
        case 'boom': {
          const x = tx(e.x);
          const z = tz(e.y);
          const y = this.groundY(e.x, e.y) + 0.1;
          const r = e.r / BLOCK;
          this.ring(x, y, z, r, e.color, 0.45);
          const c = this.color(e.color);
          const grey = this.color('#5a5a5a');
          const white = this.color('#ffffff');
          for (let i = 0; i < n(e.big ? 40 : 16); i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = (0.4 + Math.random()) * r * 3.2;
            P.add(x, y + 0.3, z, Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp, 0.45 + Math.random() * 0.5, 0.18 + Math.random() * 0.2, i % 3 === 0 ? white : i % 3 === 1 ? c : grey, 6, 2.5);
          }
          for (let i = 0; i < n(e.big ? 12 : 5); i++)
            P.add(x + (Math.random() - 0.5) * r, y + 0.5, z + (Math.random() - 0.5) * r, 0, 1 + Math.random(), 0, 0.9 + Math.random() * 0.6, 0.35 + Math.random() * 0.25, this.color('#3d3d3d'), -0.5, 1);
          for (let i = 0; i < n(e.big ? 14 : 5); i++) A.add(x, y + 0.4, z, (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6, 0.35, 0.22, c, 4, 3);
          if (e.big) {
            // Minecraft-style blast: a cloud of big pale puffs filling the radius around a hot core,
            // so the explosion reads at a distance (small debris alone vanished in wide shots).
            const k = Math.min(1.4, Math.max(0.7, r / 2.6));
            // Tinted towards the blast colour: white smoke for creepers, dust for a giant's stomp...
            const puffs = ['#ffffff', '#ececec', '#d2d2d2', '#b4b4b4'].map((g) => this.color(g).clone().lerp(c, 0.3));
            for (let i = 0; i < n(24); i++) {
              const a = Math.random() * Math.PI * 2;
              const d = Math.sqrt(Math.random()) * r * 0.75;
              P.add(x + Math.cos(a) * d, y + 0.3 + Math.random() * r * 0.55, z + Math.sin(a) * d, Math.cos(a) * 1.2, 0.6 + Math.random(), Math.sin(a) * 1.2, 0.55 + Math.random() * 0.45, (0.55 + Math.random() * 0.55) * k, puffs[i % 4], -0.8, 3);
            }
            const hot = this.color('#fff3c4');
            for (let i = 0; i < n(7); i++) A.add(x + (Math.random() - 0.5) * r * 0.6, y + 0.4 + Math.random() * r * 0.4, z + (Math.random() - 0.5) * r * 0.6, 0, 0.5, 0, 0.12 + Math.random() * 0.1, (1.1 + Math.random() * 0.7) * k, i % 2 ? hot : c, 0, 0);
            this.flash = Math.max(this.flash, 0.16);
            this.flashColor = e.color;
            if (this.sfxEnabled) sfx('explode', { vol: 0.6, pan: pan(e.x) });
          }
          break;
        }
        case 'shoot': {
          if (!this.sfxEnabled) break;
          const id =
            e.kind === 'arrow' || e.kind === 'chin_spike' ? 'arrow' : e.kind === 'bolt' ? 'bolt' : e.kind === 'snowball' || e.kind === 'ice_ball' ? 'snowball' : e.kind === 'goo' ? 'goo' : e.kind === 'potion' ? 'potion_throw'
            : e.kind === 'trident' ? 'trident' : e.kind === 'wind_charge' ? 'wind' : e.kind === 'shulker_bullet' ? 'shulker' : 'fireball';
          sfx(id, { vol: 0.25, pan: pan(e.x) });
          break;
        }
        case 'spawn': {
          const u = e.u;
          if (e.fx === 'none') break;
          const col = this.color(e.fx === 'ghost' ? '#7ff5de' : e.fx === 'summon' ? '#b9a6ff' : e.fx === 'infect' ? '#7bd36b' : e.fx === 'revive' ? '#ffe680' : e.fx === 'illusion' ? '#8e9eff' : '#e8e8e8');
          const x = tx(u.x);
          const y = ty(u.gz + u.z) + 0.6;
          const z = tz(u.y);
          for (let i = 0; i < n(12); i++) {
            const a = Math.random() * Math.PI * 2;
            (e.fx === 'summon' || e.fx === 'revive' ? A : P).add(x, y, z, Math.cos(a) * 2, Math.random() * 2, Math.sin(a) * 2, 0.6, 0.14, col, -1, 2);
          }
          if (this.sfxEnabled && e.fx === 'revive') sfx('heal', { vol: 0.5 });
          break;
        }
        case 'tele': {
          const c1 = this.color('#c56cf0');
          const c2 = this.color('#7a2fb5');
          for (const [xx, yy] of [[e.x, e.y], [e.x2, e.y2]]) {
            const x = tx(xx);
            const z = tz(yy);
            const y = this.groundY(xx, yy);
            for (let i = 0; i < n(16); i++) A.add(x + (Math.random() - 0.5) * 0.8, y + Math.random() * 2.2, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.7 + Math.random() * 0.4, 0.1, i % 2 ? c1 : c2, 0, 0);
          }
          break;
        }
        case 'heal': {
          const c = this.color('#ff7eb6');
          for (let i = 0; i < n(5); i++) A.add(tx(e.x) + (Math.random() - 0.5) * 0.6, ty(e.z) + 0.8 + Math.random(), tz(e.y), 0, 1.4, 0, 0.7, 0.13, c, 0, 0);
          break;
        }
        case 'roar': {
          const y = this.groundY(e.x, e.y) + 0.1;
          this.ring(tx(e.x), y, tz(e.y), e.r / BLOCK, e.color, 0.6);
          const c = this.color('#b49a7a');
          for (let i = 0; i < n(22); i++) {
            const a = Math.random() * Math.PI * 2;
            P.add(tx(e.x), y + 0.2, tz(e.y), Math.cos(a) * 8, 0.6, Math.sin(a) * 8, 0.5, 0.2, c, 0, 4);
          }
          break;
        }
        case 'bolt':
          this.lightning(tx(e.x), this.groundY(e.x, e.y), tz(e.y));
          if (this.sfxEnabled) sfx('lightning', { vol: 0.45 });
          break;
        case 'sonic':
          this.sonic(e.x, e.y, e.x2, e.y2);
          break;
        case 'fang':
          this.fang(tx(e.x), this.groundY(e.x, e.y), tz(e.y));
          break;
        case 'text':
          this.texts.push({ x: tx(e.x), y: ty(e.z) + 0.6, z: tz(e.y), s: e.s, color: e.color, t: 0, tac: !!e.tac });
          break;
        case 'shake':
          if (this.opts.shake) this.shake = Math.max(this.shake, e.a);
          break;
        case 'sfx':
          if (this.sfxEnabled) sfx(e.id, { vol: e.v ?? 0.6 });
          break;
        case 'beam':
          this.chainBeam(e.a, e.b, e.color, e.t);
          break;
        case 'debris': {
          const [c1, c2] = (e.f ? FEAT_DEBRIS[e.f] : SURF_DEBRIS[e.s]) ?? ['#8a8a8a', '#6e6e6e'];
          const a = this.color(c1);
          const b2 = this.color(c2);
          const x = tx(e.x);
          const z = tz(e.y);
          const y = ty(e.z);
          for (let i = 0; i < n(e.block ? 14 : 9); i++)
            P.add(x + (Math.random() - 0.5) * 0.8, y - Math.random() * (e.block ? 0.8 : 0.4), z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 7, 3 + Math.random() * 5, (Math.random() - 0.5) * 7, 0.7 + Math.random() * 0.6, 0.16 + Math.random() * 0.16, i % 2 ? a : b2, 14, 0.6);
          break;
        }
        case 'stuck':
          this.stick(e.kind, tx(e.x), ty(e.z), tz(e.y), e.dx, e.dy);
          break;
        case 'item': {
          const def = ITEM_MAP[e.id];
          const col = this.color(def?.color ?? '#ffffff');
          if (e.t > 0) this.throwItem(e.id, e.team, e.x, e.y, e.t);
          else
            // Drinks: a potion swirl rises off every ally.
            for (const u of this.b.live[e.team]) {
              const v = this.views.get(u.id);
              if (!v) continue;
              for (let i = 0; i < n(5); i++)
                A.add(v.pos.x + (Math.random() - 0.5) * 0.6, v.pos.y + Math.random() * v.h, v.pos.z + (Math.random() - 0.5) * 0.6, 0, 1.2 + Math.random(), 0, 0.8, 0.12, col, -0.5, 0, SH_STAR);
            }
          break;
        }
        case 'tnt':
          this.tntBlock(tx(e.x), this.groundY(e.x, e.y), tz(e.y), e.t);
          break;
        case 'land': {
          const c = this.color('#b8a78a');
          const y = ty(e.z) + 0.05;
          for (let i = 0; i < n(10); i++) {
            const a = Math.random() * Math.PI * 2;
            P.add(tx(e.x), y, tz(e.y), Math.cos(a) * 2.2, 0.5 + Math.random(), Math.sin(a) * 2.2, 0.45, 0.14, c, 2, 4);
          }
          if (this.sfxEnabled) sfx('hit_big', { vol: 0.3, pan: pan(e.x) });
          break;
        }
      }
    }
    ev.length = 0;
  }

  groundY(x: number, y: number) {
    const cx = Math.max(0, Math.min(GW - 1, Math.floor(x / BLOCK)));
    const cy = Math.max(0, Math.min(GD - 1, Math.floor(y / BLOCK)));
    return this.b.terrain.h[cy * GW + cx];
  }

  /** Tree tops over any part of the field with units under them fade almost clear (also while deploying). */
  private fadeCanopies(dt: number) {
    for (const c of this.world.canopies) {
      let busy = false;
      for (const u of this.b.units) {
        if (!u.alive) continue;
        const cx = u.x / BLOCK;
        if (cx >= c.x0 && cx < c.x1) {
          busy = true;
          break;
        }
      }
      const want = busy ? 0.12 : 0.4;
      c.mat.opacity += (want - c.mat.opacity) * Math.min(1, dt * 4);
    }
  }

  /** Rebuilds terrain chunks the battle has blown up (throttled; skips catch up at once). */
  private syncTerrain(dt: number) {
    const T = this.b.terrain;
    this.terrRebuildT -= dt;
    if (T.ver === this.terrVer || this.terrRebuildT > 0) return;
    const cells = T.dirty.slice(this.terrSeen);
    this.terrSeen = T.dirty.length;
    this.terrVer = T.ver;
    this.terrRebuildT = 0.12;
    for (const c of cells) this.reshaped.add(c);
    this.world.rebuild(T, cells);
    this.renderer.shadowMap.needsUpdate = true;
  }

  // ───────────────────────── effect builders ─────────────────────────

  private ring(x: number, y: number, z: number, r: number, color: string, dur: number) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: this.color(color), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    m.position.set(x, y + 0.05, z);
    m.scale.setScalar(0.1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: this.color(color), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.position.set(x, y + 0.6, z);
    glow.scale.setScalar(r * 2.4);
    this.scene.add(m, glow);
    this.fx.push({ kind: 'ring', t: 0, dur, objs: [m, glow], data: { r } });
  }

  private lightning(x: number, y: number, z: number) {
    const pts: THREE.Vector3[] = [];
    let cx = x;
    let cz = z;
    for (let k = 0; k <= 9; k++) {
      pts.push(new THREE.Vector3(cx, y + 26 - k * 2.9, cz));
      cx += (Math.random() - 0.5) * 1.6;
      cz += (Math.random() - 0.5) * 1.6;
    }
    pts[pts.length - 1].set(x, y, z);
    const objs: THREE.Object3D[] = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0xe8f6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const len = a.distanceTo(b);
      const seg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, len), mat);
      seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.lookAt(b);
      objs.push(seg);
    }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xbfe8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    glow.position.set(x, y + 0.5, z);
    glow.scale.setScalar(5);
    objs.push(glow);
    this.scene.add(...objs);
    this.fx.push({ kind: 'bolt', t: 0, dur: 0.28, objs });
    this.flash = Math.max(this.flash, 0.22);
    this.flashColor = '#cfefff';
    const c = this.color('#bfe8ff');
    for (let i = 0; i < 12; i++) this.partA.add(x, y + 0.2, z, (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6, 0.4, 0.12, c, 12, 1);
  }

  private sonic(x1: number, y1: number, x2: number, y2: number) {
    const a = new THREE.Vector3(tx(x1), this.groundY(x1, y1) + 1.4, tz(y1));
    const b = new THREE.Vector3(tx(x2), this.groundY(x2, y2) + 1.4, tz(y2));
    const objs: THREE.Object3D[] = [];
    for (let k = 1; k <= 8; k++) {
      const m = new THREE.Mesh(
        new THREE.TorusGeometry(0.5 + k * 0.08, 0.06, 6, 24),
        new THREE.MeshBasicMaterial({ color: k % 2 ? 0x2fd6d0 : 0xa8fff8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.position.copy(a).lerp(b, k / 8);
      m.lookAt(b);
      m.visible = false;
      m.userData.k = k;
      objs.push(m);
    }
    this.scene.add(...objs);
    this.fx.push({ kind: 'sonic', t: 0, dur: 0.6, objs });
  }

  private fang(x: number, y: number, z: number) {
    const mat = new THREE.MeshLambertMaterial({ color: 0xe9e6d6 });
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), mat);
      t.position.set((k - 1) * 0.22, 0.3, (k % 2) * 0.15 - 0.07);
      g.add(t);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.4), new THREE.MeshLambertMaterial({ color: 0x5a5a5a }));
    g.add(base);
    g.position.set(x, y - 0.6, z);
    this.scene.add(g);
    this.fx.push({ kind: 'fang', t: 0, dur: 0.5, objs: [g], data: { y } });
  }

  private beamMesh(color: number): THREE.Mesh {
    const m =
      this.emptyBeams.pop() ??
      new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    (m.material as THREE.MeshBasicMaterial).color.setHex(color);
    m.visible = true;
    if (!m.parent) this.scene.add(m);
    return m;
  }

  private placeBeam(m: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, w: number) {
    const len = a.distanceTo(b);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.lookAt(b);
    m.scale.set(w, w, len);
  }

  private chainBeam(a: Unit | { x: number; y: number; z?: number; gz?: number }, b: Unit | { x: number; y: number; z?: number; gz?: number }, color: string, t: number) {
    const m = this.beamMesh(this.color(color).getHex());
    this.fx.push({ kind: 'beam', t: 0, dur: t, objs: [m], data: { a, b } });
  }

  private unitPos(u: Unit | { x: number; y: number; z?: number; gz?: number }, alpha: number, out: THREE.Vector3, h = 0.5) {
    if (!('id' in u)) {
      out.set(tx(u.x), ty((u.gz ?? 0) + (u.z ?? 20)), tz(u.y));
      return out;
    }
    const v = this.views.get(u.id);
    const x = u.px + (u.x - u.px) * alpha;
    const y = u.py + (u.y - u.py) * alpha;
    const z = u.pz + (u.z - u.pz) * alpha;
    const gy = v ? v.gy : ty(u.gz);
    out.set(tx(x), gy + ty(z) + (v ? v.h : (u.size * SPRITE_SCALE) / BLOCK) * h, tz(y));
    return out;
  }

  // ───────────────────────── frame ─────────────────────────

  hitStop(d: number) {
    if (this.stopCd > 0) return;
    this.stopT = Math.max(this.stopT, d);
    this.stopCd = 0.4;
  }

  /** Multiplier for simulation and animation speed (drops briefly during hit-stop). */
  timeScale() {
    return this.stopT > 0 ? 0.15 : 1;
  }

  frame(alpha: number, dt: number) {
    const now = performance.now();
    const real = Math.min(0.1, (now - this.lastReal) / 1000);
    this.lastReal = now;
    this.stopT -= real;
    this.stopCd -= real;
    this.time += dt;
    this.syncUnits(dt);
    this.syncTerrain(dt);
    this.world.update(dt);
    this.fadeCanopies(dt);
    // Real time: the camera keeps moving while paused and isn't sped up by the battle speed.
    this.updateCamera(real, alpha);
    this.updateUnits(alpha, dt);
    this.updateProjectiles(alpha);
    this.updateZones();
    this.emitStatus(dt);
    this.emitAmbient(dt);
    this.updateFx(dt, alpha);
    this.partN.update(dt);
    this.partA.update(dt);
    this.renderer.render(this.scene, this.camera);
    if (this.keepers.visible && ++this.keeperFrames >= 2) this.keepers.visible = false;
    this.drawOverlay(dt, alpha);
  }

  private updateCamera(dt: number, alpha: number) {
    const c = this.cam;
    if (this.keyPan.x || this.keyPan.y) {
      const v = c.dist * c.zs * 0.55 * dt;
      this.move(this.keyPan.x * v, this.keyPan.y * v);
    }
    let tx0 = 0;
    let tz0 = 0;
    let ty0 = 0.5;
    let dist = 31;
    if (c.free) {
      tx0 = c.fx;
      tz0 = c.fz;
      ty0 = this.groundAt(c.fx, c.fz) + 0.6;
      dist = c.fdist;
    } else if (c.mode === 'deploy') {
      tx0 = c.side === 0 ? -8.5 : 8.5;
      tz0 = 0.8;
      ty0 = 0.5;
      dist = 22;
    } else {
      let minX = 1e9;
      let maxX = -1e9;
      let minZ = 1e9;
      let maxZ = -1e9;
      let n = 0;
      let gy = 0;
      for (const u of this.b.units) {
        if (!u.alive || u.structure) continue;
        const p = this.unitPos(u, alpha, this.tmpV, 0);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
        gy += p.y;
        n++;
      }
      if (n) {
        tx0 = (minX + maxX) / 2;
        tz0 = (minZ + maxZ) / 2;
        ty0 = gy / n + 0.6;
        const span = Math.max((maxX - minX) * 0.72, (maxZ - minZ) * 1.25);
        dist = Math.max(11, Math.min(31, span + 7));
      }
    }
    // A panned camera tracks the player's hand closely; following eases in (faster right after a reset).
    c.ease = Math.max(0, c.ease - dt);
    const rate = c.free ? 14 : c.mode === 'deploy' || c.ease > 0 ? 4 : 1.4;
    const f = Math.min(1, dt * rate);
    c.x += (tx0 - c.x) * f;
    c.z += (tz0 - c.z) * f;
    c.y += (ty0 - c.y) * Math.min(1, dt * (c.free ? 5 : rate));
    c.dist += (dist - c.dist) * f;
    c.zs += (c.zoom - c.zs) * Math.min(1, dt * 10);
    c.yaw += (c.userYaw - c.yaw) * Math.min(1, dt * 8);
    c.pitch += (c.userPitch - c.pitch) * Math.min(1, dt * 8);
    let sx = 0;
    let sy = 0;
    if (this.shake > 0.2) {
      sx = (Math.random() - 0.5) * this.shake * 0.04;
      sy = (Math.random() - 0.5) * this.shake * 0.04;
      this.shake *= Math.exp(-dt * 10);
    } else this.shake = 0;
    const cp = Math.cos(c.pitch);
    const d = c.dist * c.zs;
    this.camera.position.set(c.x + Math.sin(c.yaw) * cp * d + sx, c.y + Math.sin(c.pitch) * d + sy, c.z + Math.cos(c.yaw) * cp * d);
    this.camera.lookAt(c.x + sx, c.y + sy, c.z);
  }

  /** Ground height (blocks) under a world point. */
  private groundAt(x: number, z: number) {
    const cx = Math.max(0, Math.min(GW - 1, Math.floor(x + GW / 2)));
    const cy = Math.max(0, Math.min(GD - 1, Math.floor(z + GD / 2)));
    return this.b.terrain.h[cy * GW + cx];
  }

  private defaultPitch() {
    return this.cam.mode === 'deploy' ? 0.92 : 0.62;
  }

  setMode(mode: 'battle' | 'deploy') {
    this.cam.mode = mode;
    this.deployGroup.visible = mode === 'deploy';
    this.hoverBox.visible = false;
    this.resetView();
  }

  orbit(dx: number, dy: number) {
    const c = this.cam;
    c.userYaw = Math.max(-1.2, Math.min(1.2, c.userYaw - dx * 0.006));
    c.userPitch = Math.max(0.28, Math.min(1.35, c.userPitch + dy * 0.005));
  }

  /** Drags the ground under the pointer by a screen delta (stage px), leaving follow mode. */
  pan(dx: number, dy: number) {
    const c = this.cam;
    const perPx = (2 * c.dist * c.zs * Math.tan((this.camera.fov * Math.PI) / 360)) / this.height;
    this.move(-dx * perPx, (dy * perPx) / Math.max(0.45, Math.sin(c.pitch)));
  }

  /** Moves the camera focus along the ground (blocks): right and forward as seen from the camera. */
  move(right: number, fwd: number) {
    const c = this.cam;
    if (!c.free) {
      c.free = true;
      c.fx = c.x;
      c.fz = c.z;
      c.fdist = c.dist;
    }
    c.fx = Math.max(-GW / 2 - 2, Math.min(GW / 2 + 2, c.fx + Math.cos(c.yaw) * right - Math.sin(c.yaw) * fwd));
    c.fz = Math.max(-GD / 2 - 2, Math.min(GD / 2 + 2, c.fz - Math.sin(c.yaw) * right - Math.cos(c.yaw) * fwd));
  }

  zoomBy(k: number) {
    this.cam.zoom = Math.max(0.45, Math.min(1.5, this.cam.zoom * k));
  }

  /** Back to the default angle, zoom and following the fight. */
  resetView() {
    const c = this.cam;
    if (c.free) c.ease = 0.8;
    c.free = false;
    c.userYaw = 0;
    c.userPitch = this.defaultPitch();
    c.zoom = 1;
  }

  /** Whether the player has moved the camera away from the default view. */
  viewChanged() {
    const c = this.cam;
    return c.free || Math.abs(c.zoom - 1) > 0.02 || Math.abs(c.userYaw) > 0.03 || Math.abs(c.userPitch - this.defaultPitch()) > 0.03;
  }

  private updateUnits(alpha: number, dt: number) {
    const camPos = this.camera.position;
    this.spriteR.begin();
    this.spriteR.frame(this.cam.pitch * 0.55, this.time, 1);
    let ns = 0;
    const sm = this.tmpM;
    for (const v of this.views.values()) {
      const u = v.u;
      const deadFade = u.alive ? 1 : u.ghost ? 0 : Math.max(0, 1 - Math.max(0, u.deadT - 0.45) / 0.45);
      if (!u.alive && (deadFade <= 0 || u.ref.exploded)) continue;
      const x = tx(u.px + (u.x - u.px) * alpha);
      const z = tz(u.py + (u.y - u.py) * alpha);
      const alt = ty(u.pz + (u.z - u.pz) * alpha);
      const gTarget = ty(u.gz);
      v.gy += (gTarget - v.gy) * Math.min(1, dt * 10);
      const id = u.mob.id;
      let sqx = 1;
      let sqy = 1;
      // Summons pop in. (Not the starting squads: during deployment nobody has aged yet.)
      if (u.isSummon && u.age < 0.25) {
        const t = u.age / 0.25;
        const k = 0.3 + 0.7 * t + Math.sin(t * Math.PI) * 0.25;
        sqx *= k;
        sqy *= k;
      }
      let fuse = 0;
      if (u.alive && u.ab.fuse > 0) {
        const t = 1 - u.ab.fuse / (u.ab.fuseMax || 1);
        fuse = 1 + t * 0.28 + Math.sin(this.time * 30) * 0.03;
      }
      // Status tint, hurt flash, fades and the outline colour (shared by both render paths).
      const tc = this.tmpColor;
      let tint = 0;
      let flash = 0;
      if (!u.alive) {
        tc.setRGB(1, 0.12, 0.12);
        tint = 0.55;
      } else if (u.animHit > 0) {
        // A white pop on impact, then the vanilla red hurt tint.
        tc.setRGB(1, 0.1, 0.1);
        tint = (u.animHit / 0.12) * (u.boss ? 0.35 : 0.6);
        if (u.animHit > 0.075) flash = u.boss ? 0.25 : 0.5;
      } else if (u.witherT > 0) {
        tc.setRGB(0.08, 0.06, 0.1);
        tint = 0.45;
      } else if (u.poisonT > 0) {
        tc.setRGB(0.35, 1, 0.35);
        tint = 0.22;
      } else if (u.chill > 0 || u.slowT > 0 || u.freezeT > 0) {
        tc.setRGB(0.55, 0.85, 1);
        tint = 0.28;
      } else if (u.glowT > 0) {
        tc.setRGB(1, 0.97, 0.75);
        tint = 0.22 + Math.sin(this.time * 6) * 0.08;
      } else if (v.rainbow) {
        tc.setHSL((this.time * 0.35 + u.id * 0.13) % 1, 0.85, 0.55);
        tint = 0.5;
      } else if (u.ref.witherArmor) {
        // The wither's half-health armour: a cold blue shimmer.
        tc.setRGB(0.55, 0.75, 1);
        tint = 0.3 + Math.sin(this.time * 5) * 0.08;
      }
      // Afterimages glow soul-cyan.
      if (u.ghost) {
        tc.setRGB(0.3, 0.95, 1);
        tint = 0.65;
      }
      if (fuse && Math.sin(this.time * 24) > 0) flash = 0.6;
      const alphaV = u.alpha * (u.invisT > 0 ? 0.4 : 1) * deadFade;
      const oc = this.outColor.copy(u.shield > 1 ? SHIELD_COLOR : TEAM_COLOR[u.team]);
      // ★3 creepers are charged: the outline crackles cyan.
      if (id === 'creeper' && (u.star >= 3 || u.ref.charged)) oc.lerp(CHARGED, 0.5 + Math.sin(this.time * 9 + u.id) * 0.5);
      // Structures go without an outline, except wall dispensers (so they read as a team's turret).
      const outlineOn = u.alive && (!u.structure || id === 'dispenser') ? 1 : 0;
      let y = v.gy + alt;
      v.pos.set(x, y, z);
      {
        // ── card-art sprite (sprites.ts): a paper puppet that hops, leans, lunges and folds ──
        const sp = this.sprite(u.mob);
        if (!sp) continue;
        const walkAmt = this.walkAmount(v, dt);
        const h = ((u.size * SPRITE_SCALE) / BLOCK) * (u.boss ? 1.05 : 1);
        v.h = h;
        // Mirror toward the facing direction as seen from the camera; turning folds through 0.
        const yawC = Math.atan2(camPos.x - x, camPos.z - z);
        const baseFacing = u.mob.id === 'poison_quill_vine' ? -1 : 1;
        const want = u.facing * baseFacing * Math.cos(yawC) >= 0 ? 1 : -1;
        if (v.flipCur === undefined) v.flipCur = want;
        v.flipCur += Math.sign(want - v.flipCur) * Math.min(Math.abs(want - v.flipCur), dt * 13);
        // Spinning attacks (幽匿舞者 and the afterimage it leaves behind) twirl the picture.
        if (u.alive && (u.ref.spin || (u.ghost && u.ref.spinFrom !== undefined && u.age >= u.ref.spinFrom))) v.flipCur = Math.cos(this.time * 16 + u.id);
        let bend = 0;
        let rot = 0;
        let lift = 0;
        let wob = 0;
        let sx = sqx;
        let sy = sqy;
        const slime = id === 'slime' || id === 'magma_cube' || id === 'sulfur_cube';
        // Mobs with a sheet of poses flip through its frames (idle 0, walk 1, attack 2, flinch 3,
        // second step 4, rear view 5, rear step 6); the deformations below only add weight.
        const posed = sp.n >= 3;
        const full = sp.n >= 7;
        if (u.animAtk > 0.15) v.atkT = 0.3;
        v.atkT = Math.max(0, (v.atkT ?? 0) - dt);
        if (u.animHit > 0.1 && !u.boss) v.hurtT = 0.22;
        v.hurtT = Math.max(0, (v.hurtT ?? 0) - dt);
        // Walking away from the camera shows the rear view (with some hysteresis against flicker).
        if (full && sp.back && u.alive && !u.flying) {
          const mx = u.x - u.px;
          const mz = u.y - u.py;
          const ml = Math.hypot(mx, mz);
          const awx = x - camPos.x;
          const awz = z - camPos.z;
          const away = ml > 0.05 ? (mx * awx + mz * awz) / (ml * (Math.hypot(awx, awz) || 1)) : 0;
          if (walkAmt > 0.3 && away > 0.55) v.back = true;
          else if (walkAmt < 0.15 || away < 0.2) v.back = false;
        } else v.back = false;
        const hop = slime && u.moving ? Math.abs(Math.sin(u.walk * 0.06 + u.id)) : 0;
        let frame = 0;
        if (!u.alive && full && sp.hurt) frame = 3;
        if (u.alive) {
          const ph = u.walk * 0.11 + u.id;
          const s = Math.sin(ph);
          if (posed) {
            const attacking = v.atkT > 0;
            const flinch = full && sp.hurt && v.hurtT > 0;
            if (id === 'creeper' && fuse) frame = 2;
            else if (id === 'armadillo' && u.ref.rolled) frame = 2;
            else if (id === 'shulker') frame = u.ref.closed ? 1 : attacking ? 2 : flinch ? 3 : 0;
            else if (attacking) frame = 2;
            else if (flinch) frame = 3;
            else if (slime) frame = u.moving ? (hop > 0.55 ? 2 : hop < 0.25 ? 1 : 0) : v.back ? 5 : 0;
            else if (u.flying) {
              // Wings flap and tentacles sway all the time, faster on the move.
              const fl = Math.floor(this.time * (2.6 + walkAmt * 2) + u.id * 0.37);
              frame = full ? [1, 0, 4, 0][fl % 4] : fl % 2;
            } else if (walkAmt > 0.3) {
              // Walking: a stride frame on each footfall (alternating legs), idle as the legs pass.
              const footfall = Math.abs(s) < 0.55;
              const second = full && Math.floor(ph / Math.PI) % 2 === 1;
              frame = v.back ? (footfall ? 6 : 5) : footfall ? (second ? 4 : 1) : 0;
            } else if (v.back) frame = 5;
          }
          if (u.flying) {
            // Hover: bob, bank and lean into the flight.
            lift += Math.sin(this.time * 3 + u.id) * 0.12;
            rot += Math.sin(this.time * 1.7 + u.id) * 0.05;
            bend += 0.05 * walkAmt + Math.sin(this.time * 2.3 + u.id) * 0.02;
          } else if (slime) {
            if (u.moving) {
              lift += hop * 0.45;
              sy *= 0.82 + hop * 0.26;
              sx *= 1.14 - hop * 0.2;
            } else {
              const b = Math.sin(this.time * 2.6 + u.id);
              sy *= 1 + b * 0.035;
              sx *= 1 - b * 0.025;
            }
          } else {
            // Walking: a little hop per step that squashes on landing, leaning into the stride.
            const land = Math.pow(1 - Math.abs(s), 4);
            lift += Math.abs(s) * 0.07 * h * walkAmt;
            sy *= 1 - land * 0.07 * walkAmt;
            sx *= 1 + land * 0.05 * walkAmt;
            bend += 0.09 * walkAmt;
            rot += s * (posed ? 0.03 : 0.06) * walkAmt;
            // Standing: breathing and a slow sway (not for blocks and turrets).
            if (!u.structure) {
              sy *= 1 + Math.sin(this.time * 2.2 + u.id) * 0.018 * (1 - walkAmt);
              bend += Math.sin(this.time * 1.3 + u.id * 1.7) * 0.02 * (1 - walkAmt);
            }
            // A puff of dust on each footfall.
            const step = Math.floor(ph / Math.PI);
            if (v.step !== undefined && step !== v.step && walkAmt > 0.45 && this.opts.particles !== 'low') {
              const c = this.color('#b8ae98');
              const a = Math.random() * Math.PI * 2;
              this.partN.add(x + Math.cos(a) * 0.12, y + 0.04, z + Math.sin(a) * 0.12, Math.cos(a) * 0.5, 0.3, Math.sin(a) * 0.5, 0.3, 0.05 + Math.random() * 0.03, c, -0.3, 3);
            }
            v.step = step;
          }
          if (u.animAtk > 0) {
            const t = Math.min(1, 1 - u.animAtk / 0.22);
            const k = Math.sin(t * Math.PI);
            if (u.isRanged) {
              // Shooting kicks the picture back.
              bend -= 0.12 * k;
              sx *= 1 - 0.04 * k;
            } else {
              // A melee strike lunges forward and stretches.
              bend += (posed ? 0.12 : 0.26) * k;
              sx *= 1 + 0.08 * k;
              sy *= 1 - 0.04 * k;
              lift += 0.04 * h * k;
            }
          }
          if (u.animHit > 0 && !u.boss) {
            const k = u.animHit / 0.12;
            bend -= 0.14 * k;
            wob = 0.025 * k;
            sx *= 1 + 0.07 * k;
            sy *= 1 - 0.07 * k;
          }
          if (fuse) {
            sx *= fuse;
            sy *= fuse;
          }
          if (u.ref.closed && id === 'shulker' && !posed) sy *= 0.9;
          // Rolled-up armadillos curl into a ball.
          if (u.ref.rolled && id === 'armadillo' && !posed) {
            sy *= 0.62;
            sx *= 1.12;
          }
          if (u.levT > 0) rot += Math.sin(this.time * 6) * 0.15;
          if (u.alive && u.ref.charge && id === 'redstone_cube') {
            rot -= (u.facing || 1) * this.time * 22;
            lift += 0.12 * h;
          }
        } else {
          // Topples backwards and flattens while it fades.
          const t = Math.min(1, u.deadT / 0.35);
          rot = -t * t * 1.35;
          sy *= 1 - 0.25 * t;
        }
        // Mid-turn the picture hops a little as it folds over.
        lift += (1 - Math.abs(v.flipCur)) * 0.06 * h;
        // Dinnerbone / Grumm: upside down.
        if (v.flip) {
          lift += h * sy;
          sy = -sy;
        }
        const P = this.spritePose;
        P.x = x;
        P.y = y;
        P.z = z;
        P.ground = v.gy;
        // The idle frame keeps the card-art height; the cell around it may be taller (raised arms).
        const hc = h / sp.bh;
        P.w = (hc * sp.ar) / (1 - sp.padX * 2);
        P.h = hc / (1 - sp.padY * 2);
        P.ax = sp.padX + sp.fx * (1 - sp.padX * 2);
        P.ay = sp.padY + sp.fy * (1 - sp.padY * 2);
        P.frame = frame;
        P.flip = v.flipCur;
        P.bend = bend;
        P.rot = rot;
        P.sx = sx;
        P.sy = sy;
        P.lift = lift;
        P.wobble = wob;
        P.flash = flash;
        P.tint.copy(tc);
        P.tintAmt = tint;
        P.alpha = alphaV;
        P.outline.copy(oc);
        P.outlineOn = outlineOn ? (u.boss ? 2.6 : 1.8) : 0;
        P.shadow = 0.3 * deadFade * Math.max(0, 1 - alt / 4);
        this.spriteR.add(spriteOf(u.mob), sp.tex, sp.cols, sp.rows, P);
      }
      // Death poof
      if (!u.alive && u.deadT > 0.45 && !v.poofed) {
        v.poofed = true;
        const c1 = this.color('#f2f2f2');
        const c2 = this.color('#bdbdbd');
        const cnt = this.opts.particles === 'low' ? 5 : 12;
        const rr = Math.max(0.3, u.radius / BLOCK);
        for (let i = 0; i < cnt; i++) {
          const a = Math.random() * Math.PI * 2;
          this.partN.add(x + Math.cos(a) * rr, y + v.h * 0.3, z + Math.sin(a) * 0.3, Math.cos(a) * 1.2, 0.8 + Math.random(), Math.sin(a) * 1.2, 0.6 + Math.random() * 0.3, 0.2 + Math.random() * 0.15, i % 2 ? c1 : c2, -0.6, 2);
        }
      }
      // Blob shadow on the ground
      if (deadFade > 0.3 && ns < this.shadows.instanceMatrix.count) {
        const sh = Math.max(0.35, 1 - alt / 6);
        const sr = Math.max(0.55, (u.radius / BLOCK) * 2.4) * sh * 0.75;
        sm.makeScale(sr, 1, sr * 0.8).setPosition(x, v.gy + 0.03, z);
        this.shadows.setMatrixAt(ns++, sm);
      }
    }
    this.shadows.count = ns;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.spriteR.end();
  }

  private projMesh(kind: string, special: string): THREE.Object3D {
    const key = kind + (kind === 'potion' ? special : '');
    let pool = this.projPools.get(key);
    if (!pool) {
      pool = [];
      this.projPools.set(key, pool);
    }
    for (const o of pool) if (!o.visible) return (o.visible = true), o;
    const g = this.buildProj(kind, special);
    this.scene.add(g);
    pool.push(g);
    return g;
  }

  private buildProj(kind: string, special: string): THREE.Group {
    const g = new THREE.Group();
    const box = (w: number, h: number, d: number, color: number, emissive = false) => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color }),
      );
      g.add(m);
      return m;
    };
    const glow = (color: number, s: number) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.scale.setScalar(s);
      g.add(sp);
    };
    switch (kind) {
      case 'arrow':
        box(0.05, 0.05, 0.6, 0x6b4a2a);
        box(0.09, 0.09, 0.1, 0xd8d8d8).position.z = 0.32;
        box(0.12, 0.02, 0.12, 0xf0f0f0).position.z = -0.26;
        break;
      case 'bolt':
        box(0.07, 0.07, 0.42, 0x8a8a8a);
        box(0.1, 0.1, 0.08, 0xcfcfcf).position.z = 0.22;
        break;
      case 'trident':
        box(0.06, 0.06, 1.0, 0x3f9fb0);
        for (const dx of [-0.1, 0, 0.1]) box(0.04, 0.04, 0.22, 0xa6f0ff).position.set(dx, 0, 0.55);
        break;
      case 'snowball':
        box(0.18, 0.18, 0.18, 0xffffff, true);
        break;
      case 'ice_ball':
        box(0.28, 0.28, 0.28, 0xcfeeff, true);
        box(0.16, 0.16, 0.34, 0xa6dcff, true);
        glow(0x9fdcff, 0.9);
        break;
      case 'chin_spike':
        box(0.06, 0.06, 0.55, 0x8a2f2a);
        box(0.1, 0.1, 0.12, 0xffcf6a, true).position.z = 0.3;
        break;
      case 'goo':
        box(0.3, 0.26, 0.3, 0xe8d84a, true);
        glow(0xd8c83a, 0.8);
        break;
      case 'potion':
        box(0.22, 0.26, 0.22, special === 'heal' ? 0xff5fa2 : 0x7a3dff, true);
        box(0.08, 0.1, 0.08, 0xd9e6f5).position.y = 0.18;
        break;
      case 'shulker_bullet':
        box(0.18, 0.18, 0.18, 0xfffbe0, true);
        glow(0xfff4b0, 0.9);
        break;
      case 'wither_skull':
        box(0.32, 0.32, 0.32, 0x1d1a22, true);
        glow(0x553366, 0.7);
        break;
      case 'blue_skull':
        box(0.4, 0.4, 0.4, 0x79c2ff, true);
        glow(0x5ab0ff, 1.4);
        break;
      case 'wind_charge':
        box(0.22, 0.22, 0.22, 0xf4fbff, true);
        glow(0xcbe9ff, 1.2);
        break;
      case 'big_fireball':
        box(0.5, 0.5, 0.5, 0xffd27a, true);
        glow(0xff7a1a, 2.6);
        break;
      case 'dragon_fireball':
        box(0.45, 0.45, 0.45, 0xf2c4ff, true);
        glow(0xd36bff, 2.4);
        break;
      default:
        box(0.24, 0.24, 0.24, 0xffe7a0, true);
        glow(0xff9a2e, 1.3);
    }
    return g;
  }

  /** A thrown item arcs in from our side of the field and lands on the target. */
  private throwItem(id: string, team: 0 | 1, x: number, y: number, t: number) {
    const def = ITEM_MAP[id];
    const g = new THREE.Group();
    const color = this.color(def?.color ?? '#ffffff');
    const box = (w: number, h: number, d: number, c: THREE.Color | number, yy = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: c }));
      m.position.y = yy;
      g.add(m);
    };
    if (id === 'tnt') {
      box(0.6, 0.6, 0.6, 0xd83a2a);
      box(0.62, 0.18, 0.62, 0xf2efe6);
    } else if (id === 'mace') {
      box(0.5, 0.5, 0.5, 0x6e7680, 0.4);
      box(0.12, 0.7, 0.12, 0xc9a24a);
    } else if (def?.kind === 'egg') box(0.32, 0.42, 0.32, color);
    else if (def?.potion) {
      box(0.32, 0.34, 0.32, color);
      box(0.12, 0.14, 0.12, 0xd9e6f5, 0.22);
    } else box(0.34, 0.34, 0.34, color);
    const to = new THREE.Vector3(tx(x), this.groundY(x, y) + 0.3, tz(y));
    // Thrown from behind our lines, high up (the mace falls straight down from the sky).
    const from = id === 'mace' ? to.clone().add(new THREE.Vector3(0, 14, 0)) : to.clone().add(new THREE.Vector3(team === 0 ? -9 : 9, 7, 3));
    g.position.copy(from);
    this.scene.add(g);
    this.fx.push({ kind: 'throw', t: 0, dur: t, objs: [g], data: { from, to, spin: id !== 'mace' } });
  }

  /** A lit TNT block that flashes white until it goes off. */
  private tntBlock(x: number, y: number, z: number, t: number) {
    const g = new THREE.Group();
    const mk = (h: number, c: number, yy: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.98, h, 0.98), new THREE.MeshLambertMaterial({ color: c }));
      m.position.y = yy;
      g.add(m);
      return m;
    };
    mk(0.98, 0xd83a2a, 0.49);
    mk(0.3, 0xf2efe6, 0.49);
    g.position.set(x, y, z);
    this.scene.add(g);
    this.fx.push({ kind: 'tnt', t: 0, dur: t, objs: [g], data: { y } });
  }

  /** Removes an object and frees its GPU resources. */
  private drop(o: THREE.Object3D) {
    this.scene.remove(o);
    o.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose?.();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }

  /** Leaves an arrow / bolt / trident stuck in terrain for a few seconds; others just puff. */
  private stick(kind: string, x: number, y: number, z: number, dx: number, dy: number) {
    if (kind === 'arrow' || kind === 'bolt' || kind === 'trident') {
      const o = this.buildProj(kind, '');
      o.position.set(x + dx * 0.15, y, z + dy * 0.15);
      o.lookAt(x + dx, y - 0.25, z + dy);
      this.scene.add(o);
      this.stuck.push({ o, t: 4 });
      if (this.stuck.length > 30) this.drop(this.stuck.shift()!.o);
      return;
    }
    const c = this.color(kind === 'snowball' ? '#ffffff' : '#ffb02e');
    for (let i = 0; i < 6; i++) this.partN.add(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, 0.35, 0.1, c, 8, 2);
  }

  private updateProjectiles(alpha: number) {
    for (const pool of this.projPools.values()) for (const o of pool) o.visible = false;
    const tmp = new THREE.Vector3();
    for (const p of this.b.projs) {
      if (!p.alive) continue;
      const o = this.projMesh(p.kind, p.special);
      const x = tx(p.px + (p.x - p.px) * alpha);
      const y = ty(p.pz + (p.z - p.pz) * alpha);
      const z = tz(p.py + (p.y - p.py) * alpha);
      o.position.set(x, y, z);
      tmp.set(tx(p.x), ty(p.z), tz(p.y));
      if (tmp.distanceToSquared(o.position) > 1e-6) o.lookAt(tmp);
      else o.lookAt(x + (p.vx || 1), y, z + p.vy);
      this.trail(p, x, y, z);
    }
  }

  private trail(p: Proj, x: number, y: number, z: number) {
    if (Math.random() > 0.6) return;
    const A = this.partA;
    const P = this.partN;
    switch (p.kind) {
      case 'fireball':
      case 'big_fireball':
        A.add(x, y, z, (Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6, 0.35, p.kind === 'big_fireball' ? 0.3 : 0.16, this.color(Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f'), -1, 1);
        break;
      case 'wither_skull':
        P.add(x, y, z, 0, 0.4, 0, 0.45, 0.16, this.color('#2a2430'), -0.5, 1);
        break;
      case 'blue_skull':
        A.add(x, y, z, 0, 0.3, 0, 0.45, 0.2, this.color('#7cc8ff'), -0.5, 1);
        break;
      case 'shulker_bullet':
        A.add(x, y, z, 0, 0, 0, 0.4, 0.1, this.color('#fff7c8'), 0, 0);
        break;
      case 'dragon_fireball':
        A.add(x, y, z, (Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6, 0.5, 0.26, this.color('#c56cf0'), 0, 1);
        break;
      case 'wind_charge':
        A.add(x, y, z, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1, (Math.random() - 0.5) * 1, 0.3, 0.1, this.color('#e6f6ff'), 0, 0);
        break;
      case 'ice_ball':
        A.add(x, y, z, (Math.random() - 0.5) * 0.4, -0.2, (Math.random() - 0.5) * 0.4, 0.4, 0.08, this.color('#dff6ff'), 2, 0);
        break;
      case 'goo':
        P.add(x, y, z, 0, -0.5, 0, 0.5, 0.1, this.color('#e8d84a'), 6, 0);
        break;
      case 'chin_spike':
        if (p.mode === 1) A.add(x, y, z, 0, 0, 0, 0.25, 0.08, this.color('#ffcf6a'), 0, 0);
        break;
    }
  }

  private updateZones() {
    const live = new Set<object>();
    for (const zn of this.b.zones) {
      live.add(zn);
      let m = this.zoneViews.get(zn);
      if (!m) {
        m = new THREE.Mesh(
          new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2),
          zn.kind === 'lava'
            ? new THREE.MeshBasicMaterial({ map: this.world.lava, transparent: true, opacity: 0.95, depthWrite: false })
            : new THREE.MeshBasicMaterial({ color: ZONE_COLOR[zn.kind], transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        m.position.set(tx(zn.x), this.groundY(zn.x, zn.y) + 0.06, tz(zn.y));
        m.scale.setScalar(zn.r / BLOCK);
        this.scene.add(m);
        this.zoneViews.set(zn, m);
      }
      (m.material as THREE.MeshBasicMaterial).opacity = Math.min(1, (zn.dur - zn.t) / 0.5) * (zn.kind === 'lava' ? 0.95 : 0.35 + Math.sin(this.time * 6) * 0.08);
      if (Math.random() < 0.4) {
        const r = (zn.r / BLOCK) * Math.sqrt(Math.random());
        const a = Math.random() * Math.PI * 2;
        this.partA.add(m.position.x + Math.cos(a) * r, m.position.y + 0.1, m.position.z + Math.sin(a) * r, 0, 1.2, 0, 0.5, 0.18, this.color(ZONE_PART[zn.kind]), -1, 0);
      }
    }
    for (const [k, m] of this.zoneViews)
      if (!live.has(k)) {
        this.scene.remove(m);
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
        this.zoneViews.delete(k);
      }
  }

  private statusAcc = 0;
  private emitStatus(dt: number) {
    this.statusAcc -= dt;
    if (this.statusAcc > 0) return;
    this.statusAcc = this.opts.particles === 'low' ? 0.2 : 0.09;
    const P = this.partN;
    const A = this.partA;
    for (const u of this.b.units) {
      if (!u.alive) continue;
      const v = this.views.get(u.id);
      if (!v) continue;
      const x = v.pos.x;
      const z = v.pos.z;
      const y = v.gy + ty(u.z);
      const h = v.h;
      const r = u.radius / BLOCK;
      const rx = () => x + (Math.random() - 0.5) * r * 1.6;
      const rz = () => z + (Math.random() - 0.5) * r * 1.2;
      if (u.burnT > 0) A.add(rx(), y + Math.random() * h * 0.8, rz(), 0, 1.6, 0, 0.45, 0.14, this.color(Math.random() < 0.5 ? '#ffb02e' : '#ff5a1f'), -1, 0);
      if (u.poisonT > 0) P.add(rx(), y + Math.random() * h * 0.8, rz(), 0, 1, 0, 0.6, 0.1, this.color('#58d34e'), 0, 0);
      if (u.witherT > 0) P.add(rx(), y + Math.random() * h * 0.8, rz(), 0, 0.8, 0, 0.7, 0.14, this.color('#1b1620'), 0, 0);
      if (u.chill > 0 || u.slowT > 0) A.add(rx(), y + Math.random() * h, rz(), 0, -0.6, 0, 0.6, 0.07, this.color('#d8f3ff'), 0, 0);
      if (u.levT > 0) A.add(rx(), y, rz(), 0, 1, 0, 0.5, 0.08, this.color('#ffffff'), 0, 0);
      if (u.stunT > 0 && !u.boss) {
        const a = this.time * 6;
        A.add(x + Math.cos(a) * 0.4, y + h + 0.2, z + Math.sin(a) * 0.4, 0, 0, 0, 0.15, 0.12, this.color('#ffe14a'), 0, 0);
      }
      if (id(u) === 'blaze' || id(u) === 'magma_cube') if (Math.random() < 0.35) A.add(rx(), y + Math.random() * h, rz(), 0, 1.2, 0, 0.5, 0.12, this.color('#ff9a2e'), -1, 0);
      if (id(u) === 'end_crystal' && Math.random() < 0.5) A.add(rx(), y + h * 0.6, rz(), (Math.random() - 0.5), 1, (Math.random() - 0.5), 0.6, 0.1, this.color('#ff9cf0'), 0, 0);
      if (u.ab.fuse > 0 && Math.random() < 0.6) P.add(x, y + h, z, (Math.random() - 0.5) * 1.2, 1.8, (Math.random() - 0.5) * 1.2, 0.4, 0.08, this.color('#cfcfcf'), 0, 0);
      if (id(u) === 'creeper' && u.star >= 3 && Math.random() < 0.4) A.add(rx(), y + Math.random() * h, rz(), 0, 0, 0, 0.2, 0.1, this.color('#7fd8ff'), 0, 0);
      if (u.shield > 1 && Math.random() < 0.3) A.add(rx(), y + Math.random() * h, rz(), 0, 0.5, 0, 0.4, 0.08, this.color('#ffe680'), 0, 0);
    }
  }

  private ambAcc = 0;
  private emitAmbient(dt: number) {
    const kind = this.world.sky.particles;
    if (!kind) return;
    this.ambAcc -= dt;
    if (this.ambAcc > 0) return;
    this.ambAcc = 0.05;
    const x = (Math.random() - 0.5) * GW * 1.2;
    const z = (Math.random() - 0.5) * GD * 1.4;
    if (kind === 'ash') this.partN.add(x, 10 + Math.random() * 6, z, 0.3, -0.6, 0, 9, 0.07, this.color(Math.random() < 0.7 ? '#5a4a48' : '#ff6a3a'), 0, 0);
    else if (kind === 'bubbles') this.partA.add(x, 0, z, 0, 0.9, 0, 6, 0.08, this.color('#a8f0ff'), -0.05, 0);
    else if (kind === 'snow') this.partN.add(x, 9 + Math.random() * 4, z, 0.1, -0.7, 0, 9, 0.06, this.color('#eaf4ff'), 0, 0);
    else if (kind === 'souls') {
      // Souls drift up from the ground; the soul tide sends a flood of them across the field.
      const n = this.b.tideOn ? 4 : 1;
      for (let k = 0; k < n; k++) {
        const sx = this.b.tideOn ? (Math.random() - 0.5) * GW * 1.2 : x;
        const sz = this.b.tideOn ? (Math.random() - 0.5) * GD * 1.4 : z;
        this.partA.add(sx, Math.random() * 3, sz, this.b.tideOn ? 1.6 : 0.1, 0.5, 0, 4, 0.08, this.color(Math.random() < 0.6 ? '#c8fff4' : '#7ff5de'), -0.05, 0);
      }
    } else this.partA.add(x, Math.random() * 6, z, 0, 0.2, 0, 3, 0.06, this.color('#c9a6ff'), 0, 0);
  }

  private updateFx(dt: number, alpha: number) {
    const keep: Fx[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (const f of this.fx) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      if (f.t >= f.dur) {
        for (const o of f.objs) {
          if (f.kind === 'beam') {
            o.visible = false;
            this.emptyBeams.push(o as THREE.Mesh);
            continue;
          }
          this.scene.remove(o);
          o.traverse((x) => {
            const m = x as THREE.Mesh;
            m.geometry?.dispose?.();
            (m.material as THREE.Material | undefined)?.dispose?.();
          });
        }
        continue;
      }
      keep.push(f);
      switch (f.kind) {
        case 'ring': {
          const r = f.data!.r as number;
          const [m, glow] = f.objs as [THREE.Mesh, THREE.Sprite];
          m.scale.setScalar(Math.max(0.1, r * (0.3 + 0.7 * k)));
          (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
          glow.material.opacity = Math.max(0, 1 - k * 3);
          break;
        }
        case 'bolt':
          for (const o of f.objs) {
            const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial;
            m.opacity = 1 - k;
          }
          break;
        case 'sonic':
          for (const o of f.objs) {
            const kk = o.userData.k as number;
            o.visible = k * 2.2 > kk / 8;
            ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
          }
          break;
        case 'throw': {
          const d = f.data as { from: THREE.Vector3; to: THREE.Vector3; spin: boolean };
          const o = f.objs[0];
          o.position.lerpVectors(d.from, d.to, k);
          if (d.spin) {
            o.position.y += Math.sin(k * Math.PI) * 3;
            o.rotation.x += dt * 9;
            o.rotation.z += dt * 6;
          }
          break;
        }
        case 'tnt': {
          // Flashes faster as the fuse runs out, and swells just before it blows.
          const o = f.objs[0];
          const on = Math.sin(f.t * (6 + k * 26)) > 0;
          o.traverse((x) => {
            const m = (x as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined;
            if (m) m.emissive?.setScalar(on ? 0.75 : 0);
          });
          o.scale.setScalar(1 + Math.max(0, k - 0.8) * 0.6);
          break;
        }
        case 'fang': {
          const g = f.objs[0];
          const rise = Math.sin(Math.min(1, k * 2) * Math.PI);
          g.position.y = (f.data!.y as number) - 0.6 + rise * 0.75;
          break;
        }
        case 'beam': {
          const u1 = f.data!.a as Unit;
          const u2 = f.data!.b as Unit;
          this.unitPos(u1, alpha, a);
          this.unitPos(u2, alpha, b);
          const m = f.objs[0] as THREE.Mesh;
          this.placeBeam(m, a, b, 0.12);
          (m.material as THREE.MeshBasicMaterial).opacity = 1 - k;
          break;
        }
      }
    }
    this.fx = keep;
    if (this.stuck.length) {
      for (const s of this.stuck) s.t -= dt;
      while (this.stuck.length && this.stuck[0].t <= 0) this.drop(this.stuck.shift()!.o);
    }
    // Continuous beams: guardian lasers and end crystal heals.
    for (const v of this.views.values()) {
      const u = v.u;
      const B = u.alive ? (u.ref.beam as { t: Unit; time: number; dur: number } | null) : null;
      let m = v.beam;
      const to = u.alive && u.mob.id === 'end_crystal' ? (u.ref.beamTo as Unit | null) : null;
      if ((B && B.t.alive) || (to && to.alive)) {
        if (!m) {
          m = this.beamMesh(0xffffff);
          v.beam = m;
        }
        m.visible = true;
        this.unitPos(u, alpha, a, u.mob.id === 'end_crystal' ? 0.6 : 0.55);
        this.unitPos(B ? B.t : to!, alpha, b, 0.5);
        const mat = m.material as THREE.MeshBasicMaterial;
        if (B) {
          const f = B.time / B.dur;
          mat.color.setRGB(0.48 + 0.52 * f, 0.24 + 0.64 * f, 1 - 0.6 * f);
          mat.opacity = 0.55 + f * 0.45;
          this.placeBeam(m, a, b, 0.05 + f * 0.1 + Math.sin(this.time * 40) * 0.01);
        } else {
          mat.color.setHex(0xffd6fb);
          mat.opacity = 0.5 + Math.sin(this.time * 10 + u.id) * 0.15;
          this.placeBeam(m, a, b, 0.07);
        }
      } else if (m) {
        m.visible = false;
        this.emptyBeams.push(m);
        v.beam = undefined;
      }
    }
  }

  // ───────────────────────── overlay (HP bars, numbers, text) ─────────────────────────

  project(x: number, y: number, z: number): [number, number, boolean] {
    this.tmpV.set(x, y, z).project(this.camera);
    return [((this.tmpV.x + 1) / 2) * this.width, ((1 - this.tmpV.y) / 2) * this.height, this.tmpV.z < 1];
  }

  private drawOverlay(dt: number, alpha: number) {
    const ctx = this.octx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // HP bars: shown once damaged, with a trailing "damage chip" so every hit visibly bites.
    for (const v of this.views.values()) {
      const u = v.u;
      const frac = Math.max(0, u.hp / u.maxHp);
      if (frac < v.hpShow) {
        if (v.hpHold <= 0 && u.animHit > 0) v.hpHold = 0.28;
        v.hpHold -= dt;
        if (v.hpHold <= 0) v.hpShow = Math.max(frac, v.hpShow - dt * 0.9);
      } else v.hpShow = frac;
      if (!u.alive || u.boss || this.cam.mode === 'deploy') continue;
      if (frac >= 0.995 && v.hpShow >= 0.995 && u.shield < 1) continue;
      const [sx, sy, ok] = this.project(v.pos.x, v.pos.y + v.h + 0.3, v.pos.z);
      if (!ok) continue;
      const w = Math.max(28, Math.min(76, (u.radius / BLOCK) * 66));
      const x0 = Math.round(sx - w / 2);
      const y0 = Math.round(sy);
      const hit = u.animHit > 0;
      ctx.fillStyle = hit ? '#ffffff' : '#000000';
      ctx.fillRect(x0 - 1, y0 - 1, w + 2, 7);
      ctx.fillStyle = '#2a0f0f';
      ctx.fillRect(x0, y0, w, 5);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(x0, y0, w * v.hpShow, 5);
      ctx.fillStyle = u.team === 0 ? (frac > 0.3 ? '#4fdc62' : '#c8e04a') : frac > 0.3 ? '#ff4d4d' : '#ff8a3a';
      ctx.fillRect(x0, y0, w * frac, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x0, y0, w * frac, 1);
      if (u.shield >= 1) {
        ctx.fillStyle = '#ffe680';
        ctx.fillRect(x0, y0 - 3, w * Math.min(1, u.shield / u.maxHp), 2);
      }
    }
    // Taming: an orange heart over every enemy that can be tamed right now.
    if (this.tameMark) {
      ctx.textAlign = 'center';
      ctx.font = `700 18px ${UI_FONT}`;
      const pulse = 0.75 + Math.sin(this.time * 6) * 0.25;
      for (const v of this.views.values()) {
        if (!v.u.alive || !this.tameMark(v.u)) continue;
        const [sx, sy, ok] = this.project(v.pos.x, v.pos.y + v.h + 0.95, v.pos.z);
        if (!ok) continue;
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#000';
        ctx.fillText('❤', sx + 1, sy + 1);
        ctx.fillStyle = '#ff9a3d';
        ctx.fillText('❤', sx, sy);
        ctx.globalAlpha = 1;
      }
    }
    // Name tags (easter eggs), Minecraft style.
    ctx.textAlign = 'center';
    ctx.font = `600 14px ${UI_FONT}`;
    for (const v of this.views.values()) {
      if (!v.tag || !v.u.alive) continue;
      const [sx, sy, ok] = this.project(v.pos.x, v.pos.y + (v.flip ? v.h + 0.2 : v.h) + 0.75, v.pos.z);
      if (!ok) continue;
      const w = ctx.measureText(v.tag).width + 10;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.fillRect(sx - w / 2, sy - 15, w, 19);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(v.tag, sx, sy);
    }
    // Damage numbers
    ctx.lineJoin = 'round';
    const keep: Num[] = [];
    let lastSize = 0;
    for (const n of this.nums) {
      n.life -= dt;
      if (n.life <= 0) continue;
      keep.push(n);
      n.rise += dt * 1.6 * (n.life / n.max);
      const [sx, sy, ok] = this.project(n.x, n.y + n.rise, n.z);
      if (!ok) continue;
      const k = n.life / n.max;
      const pop = n.kind === NUM_CRIT ? (k > 0.85 ? 1 + (k - 0.85) * 1.8 : 1) : (k > 0.85 ? 1 + (k - 0.85) * 2.5 : 1);
      const size = Math.round(n.size * pop);
      if (size !== lastSize) {
        ctx.font = `${size}px Pixel, ${UI_FONT}`;
        lastSize = size;
      }
      ctx.globalAlpha = k < 0.3 ? k / 0.3 : 1;
      if (n.kind === NUM_CRIT) {
        ctx.lineWidth = 6;
        ctx.strokeStyle = '#5a1200';
        ctx.strokeText(n.text, sx, sy);
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#000000';
        ctx.strokeText(n.text, sx, sy);
      } else {
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#000';
        ctx.strokeText(n.text, sx, sy);
      }
      ctx.fillStyle = n.color;
      ctx.fillText(n.text, sx, sy);
    }
    this.nums = keep;
    // Ability callouts (big pixel text) and tactical callouts (small, quieter sans text)
    const tk: typeof this.texts = [];
    for (const t of this.texts) {
      t.t += dt;
      const life = t.tac ? 1 : 1.2;
      if (t.t > life) continue;
      tk.push(t);
      const [sx, sy, ok] = this.project(t.x, t.y + t.t * (t.tac ? 0.5 : 0.8), t.z);
      if (!ok) continue;
      ctx.font = t.tac ? `600 15px ${UI_FONT}` : '22px Pixel, sans-serif';
      ctx.globalAlpha = (t.t > life - 0.35 ? (life - t.t) / 0.35 : 1) * (t.tac ? 0.9 : 1);
      ctx.lineWidth = t.tac ? 4 : 5;
      ctx.strokeStyle = '#000';
      ctx.strokeText(t.s, sx, sy);
      ctx.fillStyle = t.color;
      ctx.fillText(t.s, sx, sy);
    }
    this.texts = tk;
    ctx.globalAlpha = 1;
    if (this.flash > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.45, this.flash);
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      this.flash *= Math.exp(-dt * 9);
    }
    void alpha;
  }

  // ───────────────────────── deployment helpers ─────────────────────────

  /** Frames the side that is deploying (two players take turns) and brightens its zone. */
  setDeploySide(side: 0 | 1) {
    if (this.cam.side === side) return;
    this.cam.side = side;
    this.resetView();
    this.showDeployZones();
  }

  /** Shows the deploy zones as tinted cell overlays; the deploying side's is the brighter one. */
  showDeployZones() {
    this.deployGroup.clear();
    const terrain = this.b.terrain;
    const mk = (color: number, x0: number, x1: number, op: number) => {
      const g = new THREE.BufferGeometry();
      const pos: number[] = [];
      for (let cy = 0; cy < GD; cy++)
        for (let cx = x0; cx < x1; cx++) {
          const h = terrain.h[cy * GW + cx] + 0.04 + (terrain.s[cy * GW + cx] === 12 || terrain.s[cy * GW + cx] === 13 ? -0.1 : 0);
          const X = cx - GW / 2;
          const Z = cy - GD / 2;
          pos.push(X, h, Z + 1, X + 1, h, Z + 1, X + 1, h, Z, X, h, Z + 1, X + 1, h, Z, X, h, Z);
        }
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, fog: false }));
      m.renderOrder = 2;
      this.deployGroup.add(m);
    };
    const side = this.cam.side;
    mk(0x3d8bff, 0, DEPLOY_COLS, side === 0 ? 0.16 : 0.06);
    mk(0xff3b3b, GW - DEPLOY_COLS, GW, side === 1 ? 0.18 : 0.12);
  }

  /**
   * Terrain cell under a screen point (stage CSS px), or null. By default the ray goes through trees,
   * fungi, pillars and other features to the ground behind them (what you aim at); `solid` stops at them.
   */
  pickCell(px: number, py: number, solid = false): { cx: number; cy: number; x: number; y: number } | null {
    const ndc = new THREE.Vector2((px / this.width) * 2 - 1, -(py / this.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    // Past the arena's far edge there is no ground behind: fall back to the feature in the way.
    const ground = solid ? null : this.groundHit(this.raycaster.ray);
    if (ground) return ground;
    const hit = this.raycaster.intersectObjects(this.world.terrainMeshes, false)[0];
    if (!hit) return null;
    const p = hit.point.clone().addScaledVector(hit.face?.normal ?? new THREE.Vector3(0, 1, 0), -0.01);
    const cx = Math.floor(p.x + GW / 2);
    const cy = Math.floor(p.z + GD / 2);
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GD) return null;
    return { cx, cy, x: (p.x + GW / 2) * BLOCK, y: (p.z + GD / 2) * BLOCK };
  }

  /** First arena cell whose ground column a ray meets, walking the grid cell by cell (features ignored). */
  private groundHit(ray: THREE.Ray): { cx: number; cy: number; x: number; y: number } | null {
    const h = this.b.terrain.h;
    const o = ray.origin;
    const d = ray.direction;
    // Where the ray is over the arena rectangle.
    let t = 0;
    let tEnd = Infinity;
    for (const [oc, dc, half] of [[o.x, d.x, GW / 2], [o.z, d.z, GD / 2]]) {
      if (Math.abs(dc) < 1e-9) {
        if (Math.abs(oc) > half) return null;
        continue;
      }
      const a = (-half - oc) / dc;
      const b = (half - oc) / dc;
      t = Math.max(t, Math.min(a, b));
      tEnd = Math.min(tEnd, Math.max(a, b));
    }
    if (t > tEnd) return null;
    const at = (tt: number, cx: number, cy: number) => {
      // Keep the point inside the cell (a side hit lies on its border).
      const x = Math.min(cx + 0.999, Math.max(cx + 0.001, o.x + d.x * tt + GW / 2));
      const y = Math.min(cy + 0.999, Math.max(cy + 0.001, o.z + d.z * tt + GD / 2));
      return { cx, cy, x: x * BLOCK, y: y * BLOCK };
    };
    const enter = t + 1e-6;
    let cx = Math.max(0, Math.min(GW - 1, Math.floor(o.x + d.x * enter + GW / 2)));
    let cy = Math.max(0, Math.min(GD - 1, Math.floor(o.z + d.z * enter + GD / 2)));
    const stepX = Math.sign(d.x);
    const stepZ = Math.sign(d.z);
    const dtX = Math.abs(1 / d.x);
    const dtZ = Math.abs(1 / d.z);
    let nextX = d.x > 0 ? (cx + 1 - GW / 2 - o.x) / d.x : d.x < 0 ? (cx - GW / 2 - o.x) / d.x : Infinity;
    let nextZ = d.z > 0 ? (cy + 1 - GD / 2 - o.z) / d.z : d.z < 0 ? (cy - GD / 2 - o.z) / d.z : Infinity;
    for (let n = 0; n < GW + GD + 2; n++) {
      const top = h[cy * GW + cx];
      // Entering the column below its top is a side hit; leaving it below the top crossed the top face.
      if (o.y + d.y * t <= top) return at(t, cx, cy);
      const out = Math.min(nextX, nextZ, tEnd);
      if (o.y + d.y * out <= top) return at((top - o.y) / d.y, cx, cy);
      if (out >= tEnd) return null;
      if (nextX < nextZ) {
        cx += stepX;
        t = nextX;
        nextX += dtX;
      } else {
        cy += stepZ;
        t = nextZ;
        nextZ += dtZ;
      }
      if (cx < 0 || cy < 0 || cx >= GW || cy >= GD) return null;
    }
    return null;
  }

  /** Nearest living unit of a team to a screen point within a radius. */
  pickUnit(px: number, py: number, team: 0 | 1, maxDist = 46): Unit | null {
    let best: Unit | null = null;
    let bd = maxDist;
    for (const v of this.views.values()) {
      const u = v.u;
      if (!u.alive || u.team !== team) continue;
      const [sx, sy] = this.project(v.pos.x, v.pos.y + v.h * 0.5, v.pos.z);
      const d = Math.hypot(sx - px, sy - py);
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
    return best;
  }

  private aimRing: THREE.Group | null = null;

  /** Item targeting preview: a ring of the item's radius on the ground (red when not allowed). */
  setAim(p: { x: number; y: number } | null, radiusBlocks = 1, ok = true, color = '#7dff9f') {
    if (!p) {
      if (this.aimRing) this.aimRing.visible = false;
      return;
    }
    if (!this.aimRing) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.95, depthTest: false }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.18, depthTest: false }));
      ring.renderOrder = disc.renderOrder = 21;
      g.add(disc, ring);
      this.scene.add(g);
      this.aimRing = g;
    }
    const g = this.aimRing;
    g.visible = true;
    g.position.set(tx(p.x), this.groundY(p.x, p.y) + 0.08, tz(p.y));
    g.scale.setScalar(Math.max(0.5, radiusBlocks));
    const c = this.color(ok ? color : '#ff4a4a');
    for (const m of g.children) ((m as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(c);
  }

  /** Enemies to mark as tameable while Alex is aiming (null = off). */
  tameMark: ((u: Unit) => boolean) | null = null;

  private cellsMesh: THREE.Mesh | null = null;

  /** Build preview: tints the cells a wall / platform would take (red when refused). */
  setCells(cells: number[] | null, ok = true, raise = 0) {
    if (this.cellsMesh) {
      this.scene.remove(this.cellsMesh);
      this.cellsMesh.geometry.dispose();
      (this.cellsMesh.material as THREE.Material).dispose();
      this.cellsMesh = null;
    }
    if (!cells?.length) return;
    const t = this.b.terrain;
    const pos: number[] = [];
    for (const i of cells) {
      const cx = i % GW;
      const cy = Math.floor(i / GW);
      const X = cx - GW / 2;
      const Z = cy - GD / 2;
      const h0 = t.h[i] + 0.05;
      const h1 = t.h[i] + raise + 0.05;
      // Top face plus four sides, so walls / platforms read as a ghost block.
      pos.push(X, h1, Z + 1, X + 1, h1, Z + 1, X + 1, h1, Z, X, h1, Z + 1, X + 1, h1, Z, X, h1, Z);
      if (raise > 0)
        for (const [ax, az, bx, bz] of [[X, Z + 1, X + 1, Z + 1], [X + 1, Z, X, Z], [X + 1, Z + 1, X + 1, Z], [X, Z, X, Z + 1]])
          pos.push(ax, h0, az, bx, h0, bz, bx, h1, bz, ax, h0, az, bx, h1, bz, ax, h1, az);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: ok ? 0x7dff9f : 0xff5a5a, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.renderOrder = 4;
    this.cellsMesh = m;
    this.scene.add(m);
  }

  setHover(cell: { cx: number; cy: number } | null, ok = true) {
    if (!cell) {
      this.hoverBox.visible = false;
      return;
    }
    this.hoverBox.visible = true;
    const h = this.b.terrain.h[cell.cy * GW + cell.cx];
    this.hoverBox.position.set(cell.cx - GW / 2 + 0.5, h - 0.48, cell.cy - GD / 2 + 0.5);
    (this.hoverBox.material as THREE.LineBasicMaterial).color.setHex(ok ? 0x7dff9f : 0xff5a5a);
  }

  /** Screen position above a unit (for DOM labels). */
  unitScreen(u: Unit): [number, number] {
    const v = this.views.get(u.id);
    if (v) return this.project(v.pos.x, v.pos.y + v.h + 0.4, v.pos.z) as unknown as [number, number];
    return this.project(tx(u.x), ty(u.gz + u.z) + (u.size * SPRITE_SCALE) / BLOCK + 0.4, tz(u.y)) as unknown as [number, number];
  }

  dispose() {
    this.world.dispose();
    for (const s of this.sprites.values()) s.tex.dispose();
    this.spriteR.dispose();
    this.keepers.traverse((o) => ((o as THREE.Mesh).material as THREE.Material | undefined)?.dispose?.());
    this.renderer.dispose();
    // Release the GL context now instead of waiting for GC (browsers cap live contexts).
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.overlay.remove();
  }
}

function id(u: Unit) {
  return u.mob.id;
}

export { MOB_MAP };
