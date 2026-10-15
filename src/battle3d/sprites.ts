// Card-art sprites for the battlefield: every mob type is one instanced, finely subdivided quad
// that the vertex shader bends, squashes and stretches, and a sprite sheet of poses (idle, two walking
// steps, attack, flinch, rear view; scripts/process-frames.mjs) the arena flips through, so the picture walks, lunges,
// recoils and falls over like a paper puppet. They stand upright facing the camera (a
// cylindrical billboard leaning back a little), turn around by folding through zero width, are
// lit by the biome (sky / ground tint, a rim of sunlight on the sun-facing edge, darker feet),
// and cast a silhouette shadow away from the sun. Alpha-tested with depth writes, so trees,
// hills and other units occlude them correctly without transparency sorting.
import * as THREE from 'three';

/** Per-unit pose the arena fills in each frame (all lengths in world units). */
export interface SpritePose {
  /** Feet position (bottom of the picture's content). */
  x: number;
  y: number;
  z: number;
  /** Ground height under the unit (for the shadow) and how high above it the unit floats. */
  ground: number;
  /** Full quad size, padding included. */
  w: number;
  h: number;
  /** Where the feet are on the quad (0…1 from its left / bottom edge): the anchor for moving,
   *  squashing and mirroring. */
  ax: number;
  ay: number;
  /** Sprite-sheet frame (cells row by row). */
  frame: number;
  /** -1…1: mirror (the art faces right); values near 0 are mid-turn. */
  flip: number;
  /** Top of the picture shifted toward the art's front (+) or back (−), as a fraction of h. */
  bend: number;
  /** Rotation around the feet (radians, + leans the art's front down). */
  rot: number;
  sx: number;
  sy: number;
  /** Vertical offset (hops, hover). */
  lift: number;
  /** Fast jiggle amplitude (fraction of h). */
  wobble: number;
  flash: number;
  tint: THREE.Color;
  tintAmt: number;
  alpha: number;
  outline: THREE.Color;
  /** Outline width in pixels (0 = none). */
  outlineOn: number;
  /** Shadow opacity (0 = none). */
  shadow: number;
}

export interface SpriteLook {
  /** Multiplies the art (biome unit light). */
  light: [number, number, number];
  /** Subtle top / bottom tint from the sky and the ground (≈1). */
  sky: [number, number, number];
  ground: [number, number, number];
  /** Sun colour for the rim light, and the direction toward the sun. */
  sun: [number, number, number];
  sunDir: [number, number, number];
}

const VERT = `
attribute vec4 iA; // feet xyz, flip
attribute vec4 iB; // w, h, bend, rot
attribute vec4 iC; // sx, sy, lift, wobble
attribute vec4 iD; // flash, tintAmt, alpha, outlineOn
attribute vec3 iTint;
attribute vec3 iOutline;
attribute vec3 iAnchor; // feet uv x, feet uv y (within a cell), frame
uniform vec2 grid; // sheet columns, rows
uniform float lean;
uniform float time;
uniform vec3 sunDir;
varying vec2 vUv;
varying vec4 vD;
varying vec3 vTint;
varying vec3 vOutline;
varying float vRim;
varying float vH;
varying vec4 vCell;
#include <fog_pars_vertex>
void main() {
  // Frames fill the sheet row by row from the top.
  float col = mod(iAnchor.z, grid.x);
  float row = grid.y - 1.0 - floor(iAnchor.z / grid.x);
  vUv = vec2((uv.x + col) / grid.x, (uv.y + row) / grid.y);
  vCell = vec4(col / grid.x, (col + 1.0) / grid.x, row / grid.y, (row + 1.0) / grid.y);
  vD = iD;
  vTint = iTint;
  vOutline = iOutline;
  float w = iB.x;
  float h = iB.y;
  // Height within the picture (0 at the feet), for bending and shading.
  float t = clamp((position.y - iAnchor.y) / max(0.01, 1.0 - iAnchor.y), 0.0, 1.0);
  vH = t;
  float x = (position.x + 0.5 - iAnchor.x) * w * iC.x;
  float y = (position.y - iAnchor.y) * h * iC.y;
  // Bend from the feet: the top moves most, like a stem.
  x += iB.z * h * pow(t, 1.5);
  x += iC.w * h * sin(time * 38.0 + t * 7.0) * t;
  float c = cos(iB.w);
  float s = sin(iB.w);
  vec2 q = vec2(c * x + s * y, -s * x + c * y);
  q.x *= iA.w;
  q.y += iC.z;
  vec3 feet = iA.xyz;
  vec3 toCam = cameraPosition - feet;
  toCam.y = 0.0;
  toCam = normalize(toCam);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  vec3 up = normalize(vec3(0.0, cos(lean), 0.0) - toCam * sin(lean));
  vec3 wp = feet + right * q.x + up * q.y;
  // Which side of the picture faces the sun (mirrored sprites swap sides).
  vec3 sd = normalize(vec3(sunDir.x, 0.0, sunDir.z));
  vRim = dot(sd, right) * sign(iA.w + 1e-4);
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
uniform sampler2D map;
uniform float outlinePx;
uniform vec3 light;
uniform vec3 skyTint;
uniform vec3 groundTint;
uniform vec3 sunColor;
varying vec2 vUv;
varying vec4 vD;
varying vec3 vTint;
varying vec3 vOutline;
varying float vRim;
varying float vH;
varying vec4 vCell;
#include <fog_pars_fragment>
/** Samples inside this frame's cell only, so outlines never pick up a neighbouring frame. */
vec4 cell(vec2 p) {
  return texture2D(map, vec2(clamp(p.x, vCell.x, vCell.y), clamp(p.y, vCell.z, vCell.w)));
}
float dither() {
  return fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  // Fades (dying, invisible, afterimages) use a screen door so sprites stay in the opaque pass.
  if (vD.z < 0.999 && dither() > vD.z) discard;
  vec4 c = cell(vUv);
  vec2 texel = fwidth(vUv);
  if (c.a < 0.5) {
    if (vD.w < 0.5) discard;
    // Team outline of constant screen width.
    vec2 o2 = texel * vD.w * outlinePx;
    float o = cell(vUv + vec2(o2.x, 0.0)).a;
    o = max(o, cell(vUv - vec2(o2.x, 0.0)).a);
    o = max(o, cell(vUv + vec2(0.0, o2.y)).a);
    o = max(o, cell(vUv - vec2(0.0, o2.y)).a);
    o = max(o, cell(vUv + o2 * 0.7).a);
    o = max(o, cell(vUv - o2 * 0.7).a);
    o = max(o, cell(vUv + vec2(o2.x, -o2.y) * 0.7).a);
    o = max(o, cell(vUv + vec2(-o2.x, o2.y) * 0.7).a);
    if (o < 0.5) discard;
    gl_FragColor = vec4(vOutline, 1.0);
  } else {
    vec3 col = c.rgb * light;
    // Sky light from above, bounce light from the ground below, darker where the feet touch it.
    col *= mix(groundTint, skyTint, smoothstep(0.0, 1.0, vH));
    col *= mix(0.62, 1.0, smoothstep(0.0, 0.16, vH));
    // Roundness: a rim of sunlight along the edge facing the sun, a soft shade along the far edge.
    float side = sign(vRim);
    float facing = smoothstep(0.1, 0.6, abs(vRim));
    float sunEdge = 1.0 - cell(vUv + vec2(side * texel.x * 4.0, texel.y * 1.2)).a;
    float farEdge = 1.0 - cell(vUv - vec2(side * texel.x * 7.0, 0.0)).a;
    col *= 1.0 - farEdge * facing * 0.22;
    col += sunColor * sunEdge * facing * smoothstep(0.1, 0.45, vH) * 0.75;
    col = mix(col, vTint, vD.y);
    col = mix(col, vec3(1.0), vD.x);
    gl_FragColor = vec4(col, 1.0);
  }
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SHADOW_VERT = `
attribute vec4 sA; // ground xyz, flip
attribute vec4 sB; // w, h, opacity, frame
attribute vec2 sC; // feet uv x, feet uv y
uniform vec2 shadowDir;
uniform float shadowLen;
uniform vec2 grid;
varying vec2 vUv;
varying float vOp;
void main() {
  float col = mod(sB.w, grid.x);
  float row = grid.y - 1.0 - floor(sB.w / grid.x);
  vUv = vec2((uv.x + col) / grid.x, (uv.y + row) / grid.y);
  vOp = sB.z;
  vec3 g = sA.xyz;
  vec3 toCam = cameraPosition - g;
  toCam.y = 0.0;
  toCam = normalize(toCam);
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  float x = (position.x + 0.5 - sC.x) * sB.x * sA.w;
  float along = (position.y - sC.y) * sB.y * shadowLen;
  vec3 wp = g + right * x + vec3(shadowDir.x, 0.0, shadowDir.y) * along + vec3(0.0, 0.035, 0.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const SHADOW_FRAG = `
uniform sampler2D map;
varying vec2 vUv;
varying float vOp;
void main() {
  if (texture2D(map, vUv).a < 0.5) discard;
  gl_FragColor = vec4(0.0, 0.0, 0.0, vOp);
}`;

class Batch {
  mesh: THREE.InstancedMesh;
  shadow: THREE.InstancedMesh;
  count = 0;
  cap = 0;
  private attrs: Record<string, THREE.InstancedBufferAttribute> = {};
  private sAttrs: Record<string, THREE.InstancedBufferAttribute> = {};
  private geo: THREE.BufferGeometry;
  private sGeo: THREE.BufferGeometry;
  private group: THREE.Group;
  private mat: THREE.ShaderMaterial;
  private sMat: THREE.ShaderMaterial;

  constructor(group: THREE.Group, base: THREE.BufferGeometry, sBase: THREE.BufferGeometry, mat: THREE.ShaderMaterial, sMat: THREE.ShaderMaterial) {
    this.group = group;
    this.mat = mat;
    this.sMat = sMat;
    this.geo = base.clone();
    this.sGeo = sBase.clone();
    this.mesh = new THREE.InstancedMesh(this.geo, mat, 1);
    this.shadow = new THREE.InstancedMesh(this.sGeo, sMat, 1);
    this.ensure(8);
  }

  ensure(n: number) {
    if (n <= this.cap) return;
    let cap = Math.max(8, this.cap);
    while (cap < n) cap *= 2;
    this.cap = cap;
    const mk = (size: number) => new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size).setUsage(THREE.DynamicDrawUsage);
    this.attrs = { iA: mk(4), iB: mk(4), iC: mk(4), iD: mk(4), iTint: mk(3), iOutline: mk(3), iAnchor: mk(3) };
    this.sAttrs = { sA: mk(4), sB: mk(4), sC: mk(2) };
    for (const [k, a] of Object.entries(this.attrs)) this.geo.setAttribute(k, a);
    for (const [k, a] of Object.entries(this.sAttrs)) this.sGeo.setAttribute(k, a);
    this.group.remove(this.mesh, this.shadow);
    this.mesh.dispose();
    this.shadow.dispose();
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.shadow = new THREE.InstancedMesh(this.sGeo, this.sMat, cap);
    for (const m of [this.mesh, this.shadow]) {
      // Positions come from the instance attributes, not instance matrices.
      for (let i = 0; i < cap; i++) m.setMatrixAt(i, new THREE.Matrix4());
      m.frustumCulled = false;
      m.count = 0;
    }
    this.mesh.renderOrder = 3;
    this.shadow.renderOrder = 2;
    this.group.add(this.mesh, this.shadow);
  }

  add(p: SpritePose) {
    const i = this.count++;
    this.ensure(this.count);
    const a = this.attrs;
    a.iA.setXYZW(i, p.x, p.y, p.z, p.flip);
    a.iB.setXYZW(i, p.w, p.h, p.bend, p.rot);
    a.iC.setXYZW(i, p.sx, p.sy, p.lift, p.wobble);
    a.iD.setXYZW(i, p.flash, p.tintAmt, p.alpha, p.outlineOn);
    a.iTint.setXYZ(i, p.tint.r, p.tint.g, p.tint.b);
    a.iOutline.setXYZ(i, p.outline.r, p.outline.g, p.outline.b);
    a.iAnchor.setXYZ(i, p.ax, p.ay, p.frame);
    this.sAttrs.sA.setXYZW(i, p.x, p.ground, p.z, p.flip);
    this.sAttrs.sB.setXYZW(i, p.w * p.sx, p.h * Math.abs(p.sy), p.shadow, p.frame);
    this.sAttrs.sC.setXY(i, p.ax, p.ay);
  }

  flush() {
    this.mesh.count = this.count;
    this.shadow.count = this.count;
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
    for (const a of Object.values(this.sAttrs)) a.needsUpdate = true;
  }

  dispose() {
    this.group.remove(this.mesh, this.shadow);
    this.mesh.dispose();
    this.shadow.dispose();
    this.geo.dispose();
    this.sGeo.dispose();
    this.mat.dispose();
    this.sMat.dispose();
  }
}

export class SpriteRenderer {
  group = new THREE.Group();
  private batches = new Map<string, Batch>();
  /** Quad from x −0.5…0.5, y 0…1, subdivided so bends stay smooth. */
  private base = new THREE.PlaneGeometry(1, 1, 4, 12).translate(0, 0.5, 0);
  private sBase = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  private uniforms = {
    lean: { value: 0.35 },
    time: { value: 0 },
    outlinePx: { value: 1 },
    light: { value: new THREE.Vector3(1, 1, 1) },
    skyTint: { value: new THREE.Color(1, 1, 1) },
    groundTint: { value: new THREE.Color(1, 1, 1) },
    sunColor: { value: new THREE.Color(1, 1, 1) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    shadowDir: { value: new THREE.Vector2(1, 0) },
    shadowLen: { value: 0.55 },
  };

  setLook(l: SpriteLook) {
    const U = this.uniforms;
    U.light.value.set(...l.light);
    U.skyTint.value.setRGB(...l.sky);
    U.groundTint.value.setRGB(...l.ground);
    U.sunColor.value.setRGB(...l.sun);
    U.sunDir.value.set(...l.sunDir).normalize();
    // Shadows fall away from the sun, longer the lower it stands.
    const d = U.sunDir.value;
    const flat = Math.hypot(d.x, d.z) || 1;
    U.shadowDir.value.set(-d.x / flat, -d.z / flat);
    U.shadowLen.value = Math.min(0.8, Math.max(0.3, (flat / Math.max(0.2, d.y)) * 0.8));
  }

  /** Per frame: camera lean (radians), time, outline width multiplier (per-unit widths are in pixels). */
  frame(lean: number, time: number, outlinePx: number) {
    this.uniforms.lean.value = lean;
    this.uniforms.time.value = time;
    this.uniforms.outlinePx.value = outlinePx;
  }

  begin() {
    for (const b of this.batches.values()) b.count = 0;
  }

  /** `cols` × `rows`: the frame grid of the texture (1 × 1 for a single picture). */
  add(key: string, tex: THREE.Texture, cols: number, rows: number, p: SpritePose) {
    let b = this.batches.get(key);
    if (!b) {
      const U = this.uniforms;
      // Double-sided: mirroring the quad flips its winding.
      const mat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        fog: true,
        // The look and time uniforms are the same objects in every batch.
        uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...U, map: { value: tex }, grid: { value: new THREE.Vector2(cols, rows) } },
        vertexShader: VERT,
        fragmentShader: FRAG,
      });
      const sMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        uniforms: { map: { value: tex }, grid: { value: new THREE.Vector2(cols, rows) }, shadowDir: U.shadowDir, shadowLen: U.shadowLen },
        vertexShader: SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
      });
      b = new Batch(this.group, this.base, this.sBase, mat, sMat);
      this.batches.set(key, b);
    }
    b.add(p);
  }

  end() {
    for (const b of this.batches.values()) b.flush();
  }

  dispose() {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.base.dispose();
    this.sBase.dispose();
  }
}
