// =============================================================================
//  Procedural audio for 方块斗兽场 — every SFX and all music are synthesized live
//  with the Web Audio API (no audio files).
//
//  Graph:
//    sfx voices ──(pan)──► sfxBus ─────────────┐
//    music voices ──► theme fade ──► musicBus ──┼─► master ─► compressor ─► out
//    wet sends ──► sfxVerb / theme send ──► musicVerb ─► convolver ─► verbOut ─┘
//
//  Public API: unlockAudio, setVolumes, sfx, playMusic, tickPitch.
//  Everything is a silent no-op until unlockAudio() runs (call it from a user
//  gesture). playMusic() before unlock just remembers the theme for later.
// =============================================================================

export type MusicTheme = 'menu' | 'map1' | 'map2' | 'map3' | 'battle' | 'boss' | 'shop' | 'victory' | 'none';
export interface SfxOpts { vol?: number; pitch?: number; pan?: number }

type NoiseKind = 'white' | 'pink' | 'brown';
type Pt = readonly [number, number];
/** A fixed value, or [time offset (s), value] breakpoints joined by exponential ramps. */
type Curve = number | readonly Pt[];

interface Engine {
  c: AudioContext;
  master: GainNode;
  musicBus: GainNode;
  sfxBus: GainNode;
  musicVerb: GainNode;
  sfxVerb: GainNode;
  noise: Record<NoiseKind, AudioBuffer>;
}

const MAX_SFX_VOICES = 24;
const MAX_MUSIC_VOICES = 32;
const FADE = 1.5; // music crossfade (s)
const SILENT = 1e-4; // exponential ramps can't reach 0
const SFX_TRIM = 1;
const MUSIC_TRIM = 2; // music instruments are designed soft; lift the bus to sit under sfx
const NOISE_RMS = 0.35; // all noise buffers normalized to the same power

let eng: Engine | null = null;
const vols = { master: 0.8, music: 0.5, sfx: 0.8 };

// ---------------------------------------------------------------- utilities --

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);
const fin = (x: number | undefined, def: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : def);
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
function pick<T>(a: readonly T[]): T {
  return a[(Math.random() * a.length) | 0];
}
const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Attack (linear) / hold / exponential-decay envelope on a gain param. */
function env(p: AudioParam, t: number, peak: number, a: number, h: number, d: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + a);
  if (h > 0) p.setValueAtTime(peak, t + a + h);
  p.exponentialRampToValueAtTime(SILENT, t + a + h + d);
}

/** Apply a Curve (scaled by k) to a param starting at time t. */
function setCurve(p: AudioParam, t: number, c: Curve, k: number): void {
  if (typeof c === 'number') {
    p.setValueAtTime(c * k, t);
    return;
  }
  p.setValueAtTime(c[0][1] * k, t + c[0][0]);
  for (let i = 1; i < c.length; i++) p.exponentialRampToValueAtTime(Math.max(SILENT, c[i][1] * k), t + c[i][0]);
}

/** Shorthand f → f2 glide over `dur` seconds. */
function glide(f: Curve, f2: number | undefined, dur: number): Curve {
  return f2 === undefined || typeof f !== 'number' ? f : [[0, f], [dur, f2]];
}

function fadeParam(p: AudioParam, to: number, now: number, dur: number): void {
  p.cancelScheduledValues(now);
  p.setValueAtTime(p.value, now);
  p.linearRampToValueAtTime(to, now + dur);
}

// ------------------------------------------------------- buffers & engine --

function makeNoise(c: AudioContext, kind: NoiseKind): AudioBuffer {
  const len = Math.floor(c.sampleRate * 1.5);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0, sq = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    let x: number;
    if (kind === 'white') x = w;
    else if (kind === 'pink') {
      // Paul Kellet's refined pink filter
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      x = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      x = last;
    }
    d[i] = x;
    sq += x * x;
  }
  const k = NOISE_RMS / Math.sqrt(sq / len || 1);
  for (let i = 0; i < len; i++) d[i] *= k;
  return buf;
}

/** Procedural room: stereo decaying noise that darkens over ~2.5 s, with a short predelay. */
function makeImpulse(c: AudioContext, secs: number): AudioBuffer {
  const rate = c.sampleRate, len = Math.floor(rate * secs), pre = Math.floor(rate * 0.012);
  const buf = c.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.62 - 0.45 * x); // one-pole LP, closing over time
      const fadeIn = Math.min(1, (i - pre) / (rate * 0.01));
      d[i] = lp * Math.pow(1 - x, 2.4) * fadeIn;
    }
  }
  return buf;
}

function createEngine(): Engine | null {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const AC = w.AudioContext ?? w.webkitAudioContext;
  if (!AC) return null;
  let c: AudioContext;
  try {
    c = new AC({ latencyHint: 'interactive' });
  } catch {
    try {
      c = new AC();
    } catch {
      return null;
    }
  }
  // Gentle bus limiter: mostly transparent, catches explosion pile-ups.
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.knee.value = 8;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  comp.connect(c.destination);

  const master = c.createGain();
  master.connect(comp);
  const musicBus = c.createGain();
  musicBus.connect(master);
  const sfxBus = c.createGain();
  sfxBus.connect(master);

  const verb = c.createConvolver();
  verb.buffer = makeImpulse(c, 2.5);
  const verbOut = c.createGain();
  verbOut.gain.value = 0.8;
  verb.connect(verbOut).connect(master);
  const musicVerb = c.createGain();
  musicVerb.connect(verb);
  const sfxVerb = c.createGain();
  sfxVerb.connect(verb);

  return {
    c, master, musicBus, sfxBus, musicVerb, sfxVerb,
    noise: { white: makeNoise(c, 'white'), pink: makeNoise(c, 'pink'), brown: makeNoise(c, 'brown') },
  };
}

function applyVolumes(immediate: boolean): void {
  if (!eng) return;
  const now = eng.c.currentTime;
  const set = (p: AudioParam, x: number): void => {
    if (immediate) p.value = x;
    else {
      p.cancelScheduledValues(now);
      p.setTargetAtTime(x, now, 0.03);
    }
  };
  // squared = perceptual slider feel
  const mu = vols.music * vols.music * MUSIC_TRIM;
  const sf = vols.sfx * vols.sfx * SFX_TRIM;
  set(eng.master.gain, vols.master * vols.master);
  set(eng.musicBus.gain, mu);
  set(eng.musicVerb.gain, mu);
  set(eng.sfxBus.gain, sf);
  set(eng.sfxVerb.gain, sf);
}

// ------------------------------------------------------------------- voice --

interface FilterOpts {
  type: BiquadFilterType;
  f: Curve;
  f2?: number;
  q?: number;
  lfo?: readonly [number, number]; // rate Hz, depth Hz
}
interface EnvOpts {
  t?: number; // start offset within the voice (s)
  a?: number; // attack
  h?: number; // hold
  d: number; // exponential decay
  vol: number; // peak gain
  to?: AudioNode; // destination (default: voice output)
}
interface ToneOpts extends EnvOpts {
  type?: OscillatorType;
  f: Curve;
  f2?: number;
  g?: number; // glide time for f → f2 (default: whole note)
  det?: number; // detune, cents
  vib?: readonly [number, number]; // vibrato rate Hz, depth Hz
  filter?: FilterOpts;
}
interface NoiseOpts extends EnvOpts {
  kind?: NoiseKind;
  rate?: number;
  filter?: FilterOpts;
}
interface FmOpts extends EnvOpts {
  f: Curve;
  f2?: number;
  ratio: number; // modulator / carrier
  index: number; // peak modulation depth, in multiples of the carrier freq
  idxD?: number; // decay of the modulation index (bell brightness)
}

/**
 * One sound event: a bundle of sources feeding a shared output gain. The voice
 * disconnects all of its nodes once every source has ended.
 */
class Voice {
  readonly e: Engine;
  readonly c: AudioContext;
  readonly out: GainNode;
  readonly t: number; // start time
  readonly p: number; // pitch multiplier
  onDone: (() => void) | null = null;
  private readonly wetBus: AudioNode | null;
  private readonly nodes: AudioNode[] = [];
  private readonly srcs: AudioScheduledSourceNode[] = [];
  private live = 0;
  private finished = false;
  private disposed = false;
  private readonly ended = (): void => {
    if (--this.live <= 0) this.dispose();
  };

  constructor(e: Engine, dest: AudioNode, wetBus: AudioNode | null, t: number, p: number, vol: number, pan = 0) {
    this.e = e;
    this.c = e.c;
    this.t = t;
    this.p = p;
    this.wetBus = wetBus;
    this.out = e.c.createGain();
    this.out.gain.value = vol;
    if (pan !== 0 && typeof e.c.createStereoPanner === 'function') {
      const sp = e.c.createStereoPanner();
      sp.pan.value = clamp(pan, -1, 1);
      this.out.connect(sp).connect(dest);
      this.nodes.push(sp);
    } else this.out.connect(dest);
  }

  private track(s: AudioScheduledSourceNode, stop: number): void {
    this.live++;
    this.srcs.push(s);
    s.onended = this.ended;
    s.stop(stop);
  }

  /** Call after building: frees the voice immediately if nothing was scheduled. */
  seal(): void {
    if (this.live === 0) this.dispose();
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.onDone?.();
  }

  private dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.srcs) s.disconnect();
    for (const n of this.nodes) n.disconnect();
    this.out.disconnect();
    this.finish();
  }

  /** Quick fade + stop (voice stealing, music teardown). */
  kill(fade = 0.03): void {
    if (this.disposed) return;
    const now = this.c.currentTime, g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + fade);
    for (const s of this.srcs) {
      try {
        s.stop(now + fade + 0.01);
      } catch {
        /* already stopped */
      }
    }
    this.finish();
  }

  /** Send the whole voice to the reverb. */
  wet(amount: number): this {
    if (this.wetBus && amount > 0) {
      if (amount === 1) this.out.connect(this.wetBus);
      else {
        const g = this.c.createGain();
        g.gain.value = amount;
        this.out.connect(g).connect(this.wetBus);
        this.nodes.push(g);
      }
    }
    return this;
  }

  private filter(o: FilterOpts, t: number, end: number): BiquadFilterNode {
    const f = this.c.createBiquadFilter();
    f.type = o.type;
    setCurve(f.frequency, t, glide(o.f, o.f2, end - t), this.p);
    if (o.q !== undefined) f.Q.value = o.q;
    if (o.lfo) this.lfo(f.frequency, o.lfo[0], o.lfo[1] * this.p, t, end);
    this.nodes.push(f);
    return f;
  }

  /** Shared filter for several tones (chords); pass the result as `to`. */
  sub(o: FilterOpts, t: number, dur: number): AudioNode {
    const st = this.t + t;
    const f = this.filter(o, st, st + dur);
    f.connect(this.out);
    return f;
  }

  private lfo(param: AudioParam, rate: number, depth: number, t: number, end: number): void {
    const o = this.c.createOscillator(), g = this.c.createGain();
    o.frequency.value = rate;
    g.gain.value = depth;
    o.connect(g).connect(param);
    this.nodes.push(g);
    o.start(t);
    this.track(o, end);
  }

  private route(src: AudioNode, o: EnvOpts & { filter?: FilterOpts }, t: number, a: number, h: number, end: number): void {
    const g = this.c.createGain();
    env(g.gain, t, o.vol, a, h, o.d);
    if (o.filter) src.connect(this.filter(o.filter, t, end)).connect(g);
    else src.connect(g);
    g.connect(o.to ?? this.out);
    this.nodes.push(g);
  }

  /** Oscillator tone with envelope, optional glide / vibrato / filter. */
  osc(o: ToneOpts): void {
    const t = this.t + (o.t ?? 0), a = o.a ?? 0.003, h = Math.max(0, o.h ?? 0), end = t + a + h + o.d;
    const s = this.c.createOscillator();
    if (o.type) s.type = o.type;
    setCurve(s.frequency, t, glide(o.f, o.f2, o.g ?? end - t), this.p);
    if (o.det) s.detune.value = o.det;
    if (o.vib) this.lfo(s.frequency, o.vib[0], o.vib[1] * this.p, t, end);
    this.route(s, o, t, a, h, end);
    s.start(t);
    this.track(s, end + 0.02);
  }

  /** Burst of (usually filtered) noise from a shared precomputed buffer. */
  noise(o: NoiseOpts): void {
    const t = this.t + (o.t ?? 0), a = o.a ?? 0.002, h = Math.max(0, o.h ?? 0), end = t + a + h + o.d;
    const buf = this.e.noise[o.kind ?? 'white'];
    const s = this.c.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = (o.rate ?? 1) * this.p;
    this.route(s, o, t, a, h, end);
    s.start(t, Math.random() * buf.duration * 0.9);
    this.track(s, end + 0.02);
  }

  /** Two-operator FM (bells, gongs, metallic shimmer). */
  fm(o: FmOpts): void {
    const t = this.t + (o.t ?? 0), a = o.a ?? 0.002, h = Math.max(0, o.h ?? 0), end = t + a + h + o.d;
    const car = this.c.createOscillator(), mod = this.c.createOscillator(), mg = this.c.createGain();
    const curve = glide(o.f, o.f2, end - t);
    setCurve(car.frequency, t, curve, this.p);
    setCurve(mod.frequency, t, curve, this.p * o.ratio);
    const f0 = (typeof o.f === 'number' ? o.f : o.f[0][1]) * this.p;
    env(mg.gain, t, o.index * f0, 0.002, 0, o.idxD ?? o.d);
    mod.connect(mg).connect(car.frequency);
    this.nodes.push(mg);
    this.route(car, o, t, a, h, end);
    car.start(t);
    mod.start(t);
    this.track(car, end + 0.02);
    this.track(mod, end + 0.02);
  }
}

// ------------------------------------------------------------ sfx helpers --

/** Glassy tone: triangle body + a quick sine octave. */
function chime(v: Voice, m: number, t: number, d: number, vol: number): void {
  const f = mtof(m);
  v.osc({ type: 'triangle', f, t, d, vol });
  v.osc({ f: f * 2, t, d: d * 0.4, vol: vol * 0.35 });
}

function bell(v: Voice, m: number, t: number, d: number, vol: number, ratio = 3.5): void {
  v.fm({ f: mtof(m), ratio, index: 2, t, d, idxD: d * 0.35, vol });
}

/** Rising filtered-noise swell that leads into a reveal hit. */
function riser(v: Voice, dur: number, vol: number): void {
  v.noise({ a: dur, d: 0.05, vol, filter: { type: 'bandpass', f: [[0, 300], [dur, 4500]], q: 2 } });
  v.osc({ type: 'triangle', f: [[0, 220], [dur, 880]], a: dur, d: 0.05, vol: vol * 0.08 });
}

function sparkles(v: Voice, n: number, t: number, step: number, pool: readonly number[], vol: number): void {
  for (let i = 0; i < n; i++)
    v.osc({ type: 'triangle', f: mtof(pick(pool)), t: t + i * step + rand(0, step * 0.5), d: rand(0.15, 0.3), vol });
}

function shimmer(v: Voice, t: number, a: number, d: number, vol: number): void {
  v.noise({ t, a, d, vol, filter: { type: 'highpass', f: 7000 } });
}

// ------------------------------------------------------------- sfx bank --
// Each recipe builds onto a fresh Voice. Frequencies are scaled by the voice
// pitch automatically. Noise layers through narrow filters lose a lot of power,
// which is why their `vol` values are higher than the tonal layers.

const SFX: Record<string, (v: Voice) => void> = {
  // ---------------------------------------------------------------- combat
  goo(v) {
    // wet squelch: low bubbly sine wobble + muffled splat
    v.osc({ f: 210, f2: 90, d: 0.22, vol: 0.32, vib: [26, 40] });
    v.noise({ kind: 'pink', a: 0.01, d: 0.2, vol: 0.8, filter: { type: 'lowpass', f: 900, f2: 250, q: 3 } });
  },
  slash(v) {
    // ghostly claw swipe: fast airy sweep with a cold ring
    v.noise({ a: 0.02, d: 0.16, vol: 1.1, filter: { type: 'bandpass', f: [[0, 900], [0.08, 4200], [0.18, 1600]], q: 2.5 } });
    v.osc({ type: 'triangle', f: 1480, f2: 990, t: 0.03, d: 0.3, vol: 0.06, vib: [8, 30] });
    v.wet(0.35);
  },
  song(v) {
    // singer: a short rising phrase on a breathy pad (Lydian, slightly detuned)
    [67, 71, 73, 74, 79].forEach((m, i) => {
      v.osc({ type: 'triangle', f: mtof(m), t: i * 0.11, a: 0.04, d: 0.5, vol: 0.09, vib: [5, 4] });
      v.osc({ f: mtof(m + 12), det: 8, t: i * 0.11 + 0.02, a: 0.06, d: 0.4, vol: 0.03 });
    });
    shimmer(v, 0.2, 0.3, 0.5, 0.04);
    v.wet(0.6);
  },
  sniff(v) {
    // sniffer: two snorts, a muffled dig and a small sprouting chime
    [0, 0.14].forEach((t) => v.noise({ kind: 'pink', t, a: 0.01, d: 0.08, vol: 0.3, filter: { type: 'bandpass', f: 1300, q: 2 } }));
    v.osc({ f: 110, f2: 60, t: 0.32, d: 0.12, vol: 0.35 });
    v.noise({ kind: 'brown', t: 0.32, a: 0.005, d: 0.16, vol: 0.4, filter: { type: 'lowpass', f: 600 } });
    [76, 81].forEach((m, i) => v.osc({ type: 'triangle', f: mtof(m), t: 0.52 + i * 0.08, a: 0.01, d: 0.3, vol: 0.06 }));
  },
  squeak(v) {
    v.osc({ type: 'triangle', f: 1600, f2: 2400, a: 0.005, d: 0.07, vol: 0.12 });
    v.osc({ type: 'triangle', f: 2100, f2: 1500, t: 0.07, a: 0.005, d: 0.06, vol: 0.09 });
  },
  creak(v) {
    // creaking: slow rubbed-wood groan
    v.osc({ type: 'sawtooth', f: [[0, 120], [0.2, 150], [0.45, 105]], a: 0.04, h: 0.2, d: 0.2, vol: 0.2, vib: [32, 18], filter: { type: 'bandpass', f: 700, q: 5 } });
    v.noise({ kind: 'brown', a: 0.03, h: 0.2, d: 0.2, vol: 0.4, filter: { type: 'bandpass', f: 400, q: 3, lfo: [30, 150] } });
  },
  hit(v) {
    v.osc({ f: 170, f2: 55, d: 0.13, vol: 0.55 });
    v.noise({ kind: 'pink', d: 0.07, vol: 0.35, filter: { type: 'lowpass', f: 1400, f2: 300 } });
  },
  hit_big(v) {
    v.osc({ f: 130, f2: 38, d: 0.28, vol: 0.65 });
    v.osc({ type: 'square', f: 95, f2: 45, d: 0.14, vol: 0.12, filter: { type: 'lowpass', f: 500 } });
    v.noise({ kind: 'pink', d: 0.18, vol: 0.5, filter: { type: 'lowpass', f: 2200, f2: 200 } });
  },
  crit(v) {
    v.noise({ d: 0.045, vol: 0.6, filter: { type: 'highpass', f: 2500 } });
    v.osc({ f: 240, f2: 70, d: 0.09, vol: 0.5 });
    [96, 100, 103, 108].forEach((m, i) => v.osc({ type: 'triangle', f: mtof(m), t: 0.02 + i * 0.028, d: 0.16, vol: 0.08 }));
    v.wet(0.25);
  },
  death(v) {
    // low "oof" grunt, then the white puff of smoke
    v.osc({
      type: 'sawtooth', f: [[0, 190], [0.06, 210], [0.22, 110]], a: 0.01, h: 0.05, d: 0.17, vol: 0.3,
      filter: { type: 'lowpass', f: 650, q: 6 },
    });
    v.noise({ kind: 'pink', t: 0.09, a: 0.02, d: 0.38, vol: 0.9, filter: { type: 'bandpass', f: 1300, f2: 350, q: 0.9 } });
  },
  arrow(v) {
    v.osc({ type: 'sawtooth', f: 330, f2: 260, d: 0.16, vol: 0.25, filter: { type: 'lowpass', f: 2600, f2: 350, q: 4 } });
    v.noise({ a: 0.01, d: 0.12, vol: 0.9, filter: { type: 'bandpass', f: 3000, f2: 900, q: 1.5 } });
  },
  bolt(v) {
    v.noise({ d: 0.025, vol: 0.35, filter: { type: 'highpass', f: 2200 } });
    v.osc({ type: 'triangle', f: 230, f2: 85, d: 0.1, vol: 0.45 });
    v.osc({ type: 'square', f: 150, f2: 120, d: 0.11, vol: 0.08, filter: { type: 'lowpass', f: 1000 } });
  },
  fireball(v) {
    v.noise({ kind: 'pink', a: 0.05, d: 0.45, vol: 1.0, filter: { type: 'bandpass', f: [[0, 350], [0.12, 2200], [0.5, 500]], q: 1.2 } });
    v.noise({ kind: 'brown', a: 0.02, d: 0.4, vol: 0.35, filter: { type: 'lowpass', f: 400 } });
    v.osc({ f: 95, f2: 55, d: 0.3, vol: 0.18 });
  },
  snowball(v) {
    v.osc({ f: 620, f2: 280, d: 0.06, vol: 0.28 });
    v.noise({ d: 0.04, vol: 0.12, filter: { type: 'highpass', f: 1800 } });
  },
  potion_throw(v) {
    v.noise({ a: 0.04, d: 0.16, vol: 1.0, filter: { type: 'bandpass', f: 1200, f2: 3200, q: 1.4 } });
    v.osc({ type: 'triangle', f: 700, f2: 1150, a: 0.03, d: 0.12, vol: 0.1 });
  },
  potion_break(v) {
    v.osc({ f: 210, f2: 90, d: 0.07, vol: 0.22 });
    v.noise({ d: 0.22, vol: 0.28, filter: { type: 'highpass', f: 3200 } });
    v.noise({ kind: 'pink', t: 0.03, a: 0.01, d: 0.22, vol: 0.4, filter: { type: 'bandpass', f: 900, q: 1 } });
    for (let i = 0; i < 5; i++) v.osc({ type: 'triangle', f: rand(2600, 5600), t: rand(0, 0.12), d: rand(0.07, 0.2), vol: 0.05 });
  },
  trident(v) {
    v.noise({ a: 0.02, d: 0.22, vol: 1.1, filter: { type: 'bandpass', f: 700, f2: 3200, q: 2 } });
    for (const [r, vol, d] of [[1, 0.1, 0.4], [2.71, 0.075, 0.3], [5.2, 0.045, 0.22]] as const) v.osc({ f: 820 * r, t: 0.05, d, vol });
    v.wet(0.2);
  },
  lightning(v) {
    v.noise({ d: 0.12, vol: 0.55, filter: { type: 'highpass', f: 900 } });
    v.noise({ t: 0.05, d: 0.08, vol: 0.4, filter: { type: 'highpass', f: 1500 } });
    v.noise({ t: 0.11, d: 0.1, vol: 0.3, filter: { type: 'highpass', f: 700 } });
    v.noise({ kind: 'brown', t: 0.04, a: 0.05, h: 0.2, d: 1.7, vol: 0.6, filter: { type: 'lowpass', f: 500, f2: 70 } });
    v.osc({ f: 55, f2: 28, t: 0.03, d: 1.1, vol: 0.3 });
    v.wet(0.3);
  },
  explode(v) {
    v.noise({ d: 0.9, vol: 1.0, filter: { type: 'lowpass', f: 4500, f2: 140, q: 0.7 } });
    v.noise({ kind: 'brown', a: 0.01, h: 0.08, d: 1.3, vol: 0.55, filter: { type: 'lowpass', f: 700, f2: 60 } });
    v.osc({ f: 115, f2: 34, d: 0.55, vol: 0.6 });
    v.wet(0.2);
  },
  heal(v) {
    [72, 76, 79, 84].forEach((m, i) => v.osc({ type: 'triangle', f: mtof(m), t: i * 0.06, a: 0.01, d: 0.5, vol: 0.1 }));
    shimmer(v, 0.05, 0.15, 0.3, 0.05);
    v.wet(0.4);
  },
  leap(v) {
    v.osc({ type: 'triangle', f: 180, f2: 620, g: 0.14, d: 0.18, vol: 0.2 });
    v.noise({ a: 0.03, d: 0.14, vol: 0.4, filter: { type: 'bandpass', f: 500, f2: 1600, q: 1.5 } });
  },
  sting(v) {
    v.osc({ type: 'sawtooth', f: 240, f2: 300, h: 0.04, d: 0.1, vol: 0.14, vib: [40, 25], filter: { type: 'lowpass', f: 1600 } });
    v.noise({ t: 0.08, d: 0.03, vol: 0.45, filter: { type: 'highpass', f: 4000 } });
    v.osc({ type: 'square', f: 1500, f2: 900, t: 0.08, d: 0.06, vol: 0.1 });
  },
  goat(v) {
    // "meh-eh-eh": buzzy saw with a fast warble through two vowel formants
    const f: Curve = [[0, 360], [0.08, 430], [0.42, 320]];
    v.osc({ type: 'sawtooth', f, a: 0.03, h: 0.18, d: 0.21, vol: 0.45, vib: [17, 28], filter: { type: 'bandpass', f: 950, q: 2.5 } });
    v.osc({ type: 'sawtooth', f, a: 0.03, h: 0.18, d: 0.21, vol: 0.28, vib: [17, 28], filter: { type: 'bandpass', f: 2300, q: 4 } });
  },
  fuse(v) {
    // creeper hiss, ~1 s
    v.noise({ a: 0.06, h: 0.75, d: 0.25, vol: 0.18, filter: { type: 'highpass', f: 3500, f2: 5000 } });
    v.noise({ a: 0.06, h: 0.75, d: 0.25, vol: 0.35, filter: { type: 'bandpass', f: 6500, q: 1.5, lfo: [11, 1200] } });
  },
  swoop(v) {
    v.noise({ kind: 'pink', a: 0.18, d: 0.4, vol: 1.2, filter: { type: 'bandpass', f: [[0, 300], [0.22, 2200], [0.6, 500]], q: 2 } });
    v.osc({
      type: 'sawtooth', f: [[0, 900], [0.2, 1300], [0.55, 520]], a: 0.12, d: 0.4, vol: 0.12,
      filter: { type: 'bandpass', f: 1400, q: 3 },
    });
  },
  teleport(v) {
    // enderman "vwoop": a wobbling downward saw against an upward sine, through a sweeping band
    v.osc({
      type: 'sawtooth', f: 1200, f2: 160, a: 0.01, d: 0.45, vol: 0.25, vib: [24, 80],
      filter: { type: 'bandpass', f: 1800, f2: 450, q: 2 },
    });
    v.osc({ f: 500, f2: 1900, a: 0.02, d: 0.32, vol: 0.06 });
    v.noise({ kind: 'pink', a: 0.01, d: 0.45, vol: 1.2, filter: { type: 'bandpass', f: 3500, f2: 400, q: 4 } });
    v.wet(0.3);
  },
  summon(v) {
    for (const r of [1, 1.414, 2.02])
      v.osc({ type: 'triangle', f: 160 * r, f2: 480 * r, a: 0.35, h: 0.35, d: 0.6, vol: 0.08, vib: [6, 6 * r] });
    v.noise({ kind: 'pink', a: 0.5, h: 0.2, d: 0.6, vol: 0.5, filter: { type: 'bandpass', f: 400, f2: 2400, q: 3 } });
    v.wet(0.45);
  },
  fangs(v) {
    for (const t of [0, 0.07]) {
      v.noise({ t, d: 0.045, vol: 1.8, filter: { type: 'bandpass', f: 1700, q: 1.8 } });
      v.osc({ type: 'square', f: 240, f2: 80, t, d: 0.06, vol: 0.16, filter: { type: 'lowpass', f: 1200 } });
    }
  },
  toss(v) {
    v.noise({ a: 0.03, d: 0.13, vol: 1.2, filter: { type: 'bandpass', f: 800, f2: 2000, q: 1.2 } });
    v.osc({ f: 300, f2: 520, d: 0.08, vol: 0.09 });
  },
  shulker(v) {
    v.osc({ type: 'square', f: 320, f2: 170, d: 0.1, vol: 0.17, filter: { type: 'lowpass', f: 1200 } });
    v.noise({ d: 0.06, vol: 0.55, filter: { type: 'bandpass', f: 1800, q: 2 } });
    v.osc({ f: 900, f2: 1300, t: 0.06, a: 0.04, h: 0.1, d: 0.2, vol: 0.1, vib: [14, 40] });
    v.wet(0.2);
  },
  ghast(v) {
    v.osc({
      type: 'sawtooth', f: [[0, 620], [0.15, 880], [0.75, 470]], a: 0.08, h: 0.3, d: 0.45, vol: 0.42, vib: [7, 22],
      filter: { type: 'bandpass', f: 1300, q: 3 },
    });
    v.osc({ type: 'triangle', f: [[0, 930], [0.15, 1320], [0.75, 700]], a: 0.1, h: 0.25, d: 0.45, vol: 0.09, vib: [6, 30] });
    v.noise({ kind: 'pink', a: 0.1, h: 0.2, d: 0.4, vol: 0.35, filter: { type: 'bandpass', f: 2200, q: 2 } });
    v.wet(0.45);
  },
  laser(v) {
    v.osc({ type: 'square', f: 1900, f2: 180, d: 0.22, vol: 0.14 });
    v.osc({ type: 'sawtooth', f: 3800, f2: 400, d: 0.18, vol: 0.07, filter: { type: 'lowpass', f: 5000 } });
  },
  charge(v) {
    // rising hum, ~1.5 s
    v.osc({ type: 'sawtooth', f: 75, f2: 300, a: 0.3, h: 0.9, d: 0.3, vol: 0.14, filter: { type: 'lowpass', f: 250, f2: 2200, q: 3 } });
    v.osc({ f: 150, f2: 600, a: 0.3, h: 0.9, d: 0.3, vol: 0.07, vib: [9, 8] });
  },
  golem(v) {
    v.osc({ f: 130, f2: 60, d: 0.16, vol: 0.45 });
    v.noise({ d: 0.03, vol: 0.25, filter: { type: 'highpass', f: 2000 } });
    // inharmonic bar partials = metallic clang
    for (const [r, vol, d] of [[1, 0.12, 0.7], [2.76, 0.08, 0.45], [5.4, 0.05, 0.3], [8.93, 0.03, 0.18]] as const)
      v.osc({ f: 190 * r, d, vol });
    v.wet(0.2);
  },
  roar(v) {
    const f: Curve = [[0, 85], [0.15, 105], [0.95, 68]];
    v.osc({ type: 'sawtooth', f, a: 0.1, h: 0.4, d: 0.5, vol: 0.25, vib: [28, 12], filter: { type: 'lowpass', f: 700, q: 4 } });
    v.osc({ type: 'sawtooth', f, det: 25, a: 0.1, h: 0.4, d: 0.5, vol: 0.18, filter: { type: 'lowpass', f: 500 } });
    v.noise({ kind: 'brown', a: 0.1, h: 0.4, d: 0.5, vol: 0.3, filter: { type: 'lowpass', f: 900, lfo: [22, 400] } });
    v.wet(0.15);
  },
  wind(v) {
    v.noise({ kind: 'pink', a: 0.2, h: 0.1, d: 0.5, vol: 1.2, filter: { type: 'bandpass', f: [[0, 350], [0.3, 1300], [0.8, 450]], q: 1.4 } });
    v.osc({ f: 780, f2: 1050, a: 0.2, h: 0.1, d: 0.4, vol: 0.025 });
  },
  illusion(v) {
    const wt = [0, 2, 4, 6, 8, 10];
    for (let i = 0; i < 7; i++) v.osc({ type: 'triangle', f: mtof(84 + pick(wt) + (i % 2) * 12), t: i * 0.045, d: 0.3, vol: 0.09 });
    shimmer(v, 0, 0.15, 0.35, 0.09);
    v.wet(0.5);
  },
  sonic(v) {
    // warden sonic boom: sub drop + resonant low saw + ringing blast
    v.osc({ f: 75, f2: 28, d: 1.2, vol: 0.6 });
    v.osc({ type: 'sawtooth', f: 150, f2: 55, d: 0.8, vol: 0.22, filter: { type: 'lowpass', f: 600, f2: 120, q: 10 } });
    v.osc({ type: 'triangle', f: 330, f2: 110, d: 0.7, vol: 0.12 });
    v.noise({ kind: 'pink', a: 0.004, d: 0.6, vol: 1.5, filter: { type: 'bandpass', f: 700, f2: 140, q: 4 } });
    v.wet(0.4);
  },
  wither_spawn(v) {
    v.noise({ d: 1.5, vol: 1.0, filter: { type: 'lowpass', f: 5000, f2: 110 } });
    v.noise({ kind: 'brown', a: 0.01, h: 0.2, d: 2.0, vol: 0.55, filter: { type: 'lowpass', f: 600, f2: 50 } });
    v.osc({ f: 95, f2: 26, d: 1.3, vol: 0.55 });
    const howl: Curve = [[0, 260], [0.35, 520], [1.6, 240]];
    v.osc({ type: 'sawtooth', f: howl, t: 0.15, a: 0.3, h: 0.6, d: 1.0, vol: 0.3, vib: [6, 14], filter: { type: 'bandpass', f: 1000, q: 2 } });
    v.osc({
      type: 'sawtooth', f: howl, det: 300, t: 0.18, a: 0.3, h: 0.6, d: 1.0, vol: 0.2, vib: [5, 12],
      filter: { type: 'bandpass', f: 1400, q: 2 },
    });
    v.wet(0.45);
  },
  stomp(v) {
    v.osc({ f: 95, f2: 38, d: 0.28, vol: 0.6 });
    v.noise({ kind: 'brown', d: 0.22, vol: 0.4, filter: { type: 'lowpass', f: 450 } });
    v.noise({ d: 0.05, vol: 0.1, filter: { type: 'highpass', f: 1500 } });
  },
  horn(v) {
    // raid horn: long low brassy swell that sags at the end
    const f: Pt[] = [[0, 104], [0.3, 110], [1.4, 110], [1.9, 98]];
    const f5 = f.map(([t, x]): Pt => [t, x * 1.5]);
    const brass = v.sub({ type: 'lowpass', f: [[0, 250], [0.4, 1300], [1.3, 850], [1.9, 380]], q: 3 }, 0, 1.9);
    v.osc({ type: 'sawtooth', f, a: 0.3, h: 1.0, d: 0.6, vol: 0.2, vib: [4.5, 1.2], to: brass });
    v.osc({ type: 'sawtooth', f, det: 9, a: 0.3, h: 1.0, d: 0.6, vol: 0.16, to: brass });
    v.osc({ type: 'sawtooth', f: f5, a: 0.35, h: 0.9, d: 0.6, vol: 0.08, to: brass });
    v.wet(0.5);
  },
  dragon_shoot(v) {
    v.noise({ kind: 'pink', a: 0.02, d: 0.42, vol: 1.0, filter: { type: 'bandpass', f: 500, f2: 1900, q: 2 } });
    v.osc({ type: 'sawtooth', f: 230, f2: 105, d: 0.32, vol: 0.12, filter: { type: 'lowpass', f: 900 } });
    v.fm({ f: 1250, f2: 380, ratio: 1.5, index: 1.5, d: 0.35, vol: 0.05 });
    v.wet(0.25);
  },
  dragon_roar(v) {
    v.osc({
      type: 'sawtooth', f: [[0, 70], [0.25, 115], [1.3, 58]], a: 0.15, h: 0.6, d: 0.8, vol: 0.26, vib: [24, 18],
      filter: { type: 'lowpass', f: 950, q: 5 },
    });
    v.osc({ type: 'sawtooth', f: [[0, 105], [0.25, 172], [1.3, 87]], a: 0.15, h: 0.6, d: 0.8, vol: 0.13, filter: { type: 'lowpass', f: 1200 } });
    v.noise({ kind: 'pink', a: 0.15, h: 0.6, d: 0.8, vol: 0.7, filter: { type: 'bandpass', f: 700, q: 1, lfo: [18, 250] } });
    v.osc({
      type: 'sawtooth', f: [[0, 600], [0.3, 950], [1.2, 480]], a: 0.2, h: 0.4, d: 0.7, vol: 0.12, vib: [8, 20],
      filter: { type: 'bandpass', f: 1600, q: 3 },
    });
    v.wet(0.4);
  },
  breath(v) {
    v.noise({ kind: 'pink', a: 0.12, h: 0.5, d: 0.5, vol: 0.8, filter: { type: 'bandpass', f: 1500, q: 0.8, lfo: [3, 700] } });
    v.noise({ kind: 'brown', a: 0.12, h: 0.5, d: 0.5, vol: 0.2, filter: { type: 'lowpass', f: 600 } });
    v.osc({ f: 520, a: 0.2, h: 0.4, d: 0.5, vol: 0.03, vib: [5, 20] });
    v.wet(0.3);
  },
  ram(v) {
    v.noise({ kind: 'pink', a: 0.07, d: 0.06, vol: 0.5, filter: { type: 'bandpass', f: 500, f2: 1500, q: 1.5 } });
    v.osc({ f: 150, f2: 48, t: 0.1, d: 0.22, vol: 0.6 });
    v.noise({ kind: 'pink', t: 0.1, d: 0.12, vol: 0.35, filter: { type: 'lowpass', f: 1300 } });
    v.osc({ type: 'triangle', f: 320, f2: 150, t: 0.1, d: 0.08, vol: 0.2 });
  },

  // -------------------------------------------------------------------- UI
  click(v) {
    v.osc({ type: 'triangle', f: 1500, f2: 950, d: 0.035, vol: 0.2 });
    v.noise({ d: 0.012, vol: 0.12, filter: { type: 'highpass', f: 3000 } });
  },
  hover(v) {
    v.osc({ f: 2400, d: 0.022, vol: 0.04 });
  },
  tick(v) {
    // must stay cheap: one oscillator
    v.osc({ type: 'triangle', f: 1750, f2: 1300, d: 0.03, vol: 0.13 });
  },
  reveal_blue(v) {
    chime(v, 72, 0, 0.35, 0.12);
    chime(v, 79, 0.09, 0.5, 0.12);
    v.wet(0.2);
  },
  reveal_purple(v) {
    [72, 76, 79].forEach((m, i) => chime(v, m, i * 0.075, 0.55, 0.14));
    shimmer(v, 0.15, 0.1, 0.35, 0.05);
    v.wet(0.3);
  },
  reveal_pink(v) {
    v.osc({ type: 'triangle', f: mtof(48), a: 0.02, h: 0.2, d: 0.7, vol: 0.12 });
    [72, 76, 79, 84].forEach((m, i) => chime(v, m, i * 0.06, 0.65, 0.12));
    sparkles(v, 5, 0.26, 0.05, [88, 91, 96, 100], 0.045);
    shimmer(v, 0.2, 0.15, 0.45, 0.06);
    v.wet(0.35);
  },
  reveal_red(v) {
    riser(v, 0.28, 0.6);
    const t = 0.28;
    v.osc({ f: 95, f2: 40, t, d: 0.45, vol: 0.35 }); // impact
    v.noise({ kind: 'pink', t, d: 0.35, vol: 0.35, filter: { type: 'lowpass', f: 3500, f2: 300 } });
    const stab = v.sub({ type: 'lowpass', f: [[0, 4000], [0.9, 700]], q: 2 }, t, 1);
    for (const m of [60, 64, 67, 72, 74]) v.osc({ type: 'sawtooth', f: mtof(m), t, a: 0.005, h: 0.1, d: 0.8, vol: 0.05, to: stab });
    [79, 84, 88, 91].forEach((m, i) => chime(v, m, t + 0.06 + i * 0.055, 0.5, 0.07));
    shimmer(v, t, 0.1, 0.6, 0.07);
    v.wet(0.4);
  },
  reveal_gold(v) {
    // riser → brass pickup (G C E) → big C-major brass chord + sub boom + bell + sparkle cascade
    riser(v, 0.4, 0.9);
    const brass = v.sub({ type: 'lowpass', f: [[0, 700], [0.3, 4500], [1.2, 1800], [1.9, 900]], q: 2 }, 0.4, 2);
    [67, 72, 76].forEach((m, i) => v.osc({ type: 'sawtooth', f: mtof(m), t: 0.4 + i * 0.09, a: 0.01, h: 0.05, d: 0.12, vol: 0.11, to: brass }));
    const t = 0.67;
    v.osc({ f: 100, f2: 38, t, d: 0.6, vol: 0.6 });
    v.noise({ kind: 'pink', t, d: 0.5, vol: 0.6, filter: { type: 'lowpass', f: 5000, f2: 400 } });
    for (const m of [55, 60, 64, 67, 72]) {
      v.osc({ type: 'sawtooth', f: mtof(m), det: -6, t, a: 0.02, h: 0.7, d: 0.9, vol: 0.06, vib: [5, mtof(m) * 0.006], to: brass });
      v.osc({ type: 'sawtooth', f: mtof(m), det: 6, t, a: 0.02, h: 0.7, d: 0.9, vol: 0.05, to: brass });
    }
    bell(v, 84, t, 1.6, 0.12);
    sparkles(v, 12, t + 0.05, 0.07, [84, 86, 88, 91, 93, 96, 98, 100], 0.045);
    shimmer(v, t, 0.3, 1.2, 0.08);
    v.wet(0.45);
  },
  coin(v) {
    // emerald / XP-orb "ding" (keeps random pitch like MC)
    chime(v, 83, 0, 0.08, 0.1);
    chime(v, 88, 0.06, 0.35, 0.12);
  },
  star_up(v) {
    [72, 76, 79, 84, 88].forEach((m, i) => chime(v, m, i * 0.055, i === 4 ? 0.7 : 0.25, 0.14));
    shimmer(v, 0.22, 0.08, 0.4, 0.05);
    v.wet(0.3);
  },
  victory(v) {
    const lead = v.sub({ type: 'lowpass', f: 2800 }, 0, 1.8);
    for (const [m, t, h] of [[72, 0, 0.08], [76, 0.12, 0.08], [79, 0.24, 0.08], [84, 0.36, 0.8]] as const) {
      v.osc({ type: 'square', f: mtof(m), t, a: 0.005, h, d: 0.25, vol: 0.06, to: lead, vib: h > 0.5 ? [5.5, 4] : undefined });
      v.osc({ type: 'triangle', f: mtof(m - 24), t, a: 0.005, h, d: 0.2, vol: 0.12 });
    }
    for (const m of [64, 67, 72]) v.osc({ type: 'triangle', f: mtof(m), t: 0.36, a: 0.01, h: 0.6, d: 0.6, vol: 0.07 });
    bell(v, 96, 0.36, 1.0, 0.04);
    v.wet(0.3);
  },
  defeat(v) {
    // sad trombone: G F# F E(held, wobbling)
    const tb = v.sub({ type: 'lowpass', f: 1100, q: 2 }, 0, 2.2);
    for (const [m, t, h] of [[55, 0, 0.22], [54, 0.32, 0.22], [53, 0.64, 0.22], [52, 0.96, 0.7]] as const)
      v.osc({ type: 'sawtooth', f: mtof(m), t, a: 0.03, h, d: 0.25, vol: 0.1, to: tb, vib: h > 0.5 ? [5, 3] : undefined });
    v.osc({ type: 'triangle', f: mtof(40), t: 0.96, a: 0.05, h: 0.6, d: 0.5, vol: 0.12 });
  },
  heart_lose(v) {
    v.osc({ f: 160, f2: 55, d: 0.18, vol: 0.4 });
    v.osc({ type: 'square', f: 460, f2: 210, d: 0.32, vol: 0.06, filter: { type: 'lowpass', f: 1600 } });
    v.osc({ type: 'square', f: 345, f2: 158, t: 0.12, d: 0.35, vol: 0.05, filter: { type: 'lowpass', f: 1400 } });
  },
  potion_drink(v) {
    for (let i = 0; i < 3; i++) {
      const t = i * 0.17;
      v.osc({ f: 180 + i * 15, f2: 420, g: 0.05, t, d: 0.07, vol: 0.28 }); // bubble
      v.noise({ kind: 'brown', t, d: 0.08, vol: 0.12, filter: { type: 'lowpass', f: 600 } });
    }
  },
  enchant(v) {
    const scale = [0, 2, 4, 7, 9];
    for (let i = 0; i < 9; i++) {
      const m = 81 + pick(scale) + (Math.random() < 0.5 ? 12 : 0);
      v.osc({ type: i % 2 ? 'sine' : 'triangle', f: mtof(m), t: i * 0.07 + rand(0, 0.03), a: 0.01, d: 0.3, vol: 0.07 });
    }
    v.osc({ type: 'triangle', f: mtof(69), a: 0.2, h: 0.3, d: 0.5, vol: 0.055, vib: [5, 3] });
    v.osc({ type: 'triangle', f: mtof(76), det: 6, a: 0.2, h: 0.3, d: 0.5, vol: 0.05, vib: [6, 4] });
    v.wet(0.5);
  },
  buy(v) {
    // "ka-ching"
    v.osc({ type: 'square', f: 220, f2: 140, d: 0.04, vol: 0.08, filter: { type: 'lowpass', f: 1500 } });
    v.noise({ t: 0.05, d: 0.06, vol: 0.1, filter: { type: 'highpass', f: 5000 } });
    chime(v, 91, 0.05, 0.4, 0.09);
    chime(v, 96, 0.05, 0.45, 0.07);
  },
  error(v) {
    const lp = v.sub({ type: 'lowpass', f: 900 }, 0, 0.3);
    v.osc({ type: 'square', f: 110, h: 0.16, d: 0.06, vol: 0.09, to: lp });
    v.osc({ type: 'square', f: 117, h: 0.16, d: 0.06, vol: 0.09, to: lp });
  },
  page(v) {
    v.noise({ kind: 'pink', a: 0.03, d: 0.12, vol: 0.6, filter: { type: 'bandpass', f: 2800, f2: 1500, q: 0.7 } });
    v.noise({ t: 0.07, a: 0.01, d: 0.07, vol: 0.08, filter: { type: 'highpass', f: 4500 } });
  },
  countdown(v) {
    v.osc({ type: 'square', f: 880, h: 0.07, d: 0.08, vol: 0.07, filter: { type: 'lowpass', f: 3000 } });
  },
  fight(v) {
    v.osc({ type: 'square', f: 1760, h: 0.14, d: 0.15, vol: 0.06, filter: { type: 'lowpass', f: 4000 } });
    v.fm({ f: 147, ratio: 1.41, index: 3, d: 1.6, idxD: 0.5, vol: 0.18 }); // gong
    v.noise({ d: 0.4, vol: 0.15, filter: { type: 'bandpass', f: 3000, q: 0.8 } });
    v.wet(0.35);
  },
  door(v) {
    v.osc({
      type: 'sawtooth', f: [[0, 150], [0.15, 190], [0.25, 160]], a: 0.03, h: 0.12, d: 0.1, vol: 0.2, vib: [30, 10],
      filter: { type: 'bandpass', f: 700, q: 5 },
    }); // creak
    v.osc({ type: 'triangle', f: 190, f2: 110, t: 0.24, d: 0.07, vol: 0.35 }); // clunk
    v.noise({ kind: 'pink', t: 0.24, d: 0.06, vol: 0.6, filter: { type: 'bandpass', f: 900, q: 2 } });
  },
  levelup(v) {
    v.osc({ f: mtof(48), a: 0.01, d: 1.0, vol: 0.12 });
    [79, 84, 88].forEach((m, i) => bell(v, m, i * 0.1, 1.1, 0.08));
    for (const m of [64, 67, 72]) v.osc({ type: 'triangle', f: mtof(m), t: 0.2, a: 0.08, h: 0.3, d: 0.8, vol: 0.05 });
    shimmer(v, 0.1, 0.2, 0.6, 0.05);
    v.wet(0.35);
  },
  relic(v) {
    [72, 76, 79, 83, 86].forEach((m, i) => v.osc({ f: mtof(m), t: i * 0.035, a: 0.01, d: 1.1, vol: 0.06 })); // Cmaj9 strum
    sparkles(v, 6, 0.1, 0.06, [91, 95, 98, 100, 103], 0.035);
    shimmer(v, 0, 0.2, 0.5, 0.04);
    v.wet(0.5);
  },
  card_flip(v) {
    v.noise({ d: 0.05, vol: 0.7, filter: { type: 'bandpass', f: 3200, f2: 1500, q: 1 } });
    v.osc({ type: 'triangle', f: 650, d: 0.02, vol: 0.08 });
  },
};

// Per-id limits: min gap between plays (ms), max simultaneous, n = no pitch
// jitter (musical), p = priority (may steal a voice when the pool is full).
interface Meta { gap: number; max: number; nj: boolean; pri: boolean }
const M = (gap: number, max: number, flags = ''): Meta => ({ gap, max, nj: flags.includes('n'), pri: flags.includes('p') });
const DEFAULT_META = M(35, 4);
const META: Record<string, Meta | undefined> = {
  hit: M(30, 5), arrow: M(30, 5), hit_big: M(50, 3), crit: M(45, 3), death: M(60, 3), bolt: M(35, 4),
  fireball: M(60, 3), snowball: M(35, 4), potion_throw: M(50, 3), potion_break: M(60, 3), trident: M(60, 3),
  lightning: M(150, 2), explode: M(90, 3), heal: M(80, 3), leap: M(50, 3), sting: M(40, 4), goat: M(200, 2),
  fuse: M(250, 2), swoop: M(150, 2), teleport: M(80, 3), summon: M(250, 2), fangs: M(60, 3), toss: M(40, 4),
  shulker: M(80, 3), ghast: M(300, 2), laser: M(60, 3), charge: M(400, 2), golem: M(80, 3), roar: M(350, 2),
  wind: M(120, 2), illusion: M(200, 2), sonic: M(250, 2), wither_spawn: M(1200, 1, 'p'), stomp: M(70, 3),
  goo: M(90, 3), slash: M(80, 3), song: M(1200, 1, 'p'), squeak: M(150, 2), sniff: M(300, 2), creak: M(400, 2),
  horn: M(1500, 1, 'p'), dragon_shoot: M(100, 2), dragon_roar: M(800, 1, 'p'), breath: M(250, 2), ram: M(80, 3),
  click: M(30, 3, 'p'), hover: M(40, 2), tick: M(15, 3, 'n'),
  reveal_blue: M(100, 2, 'np'), reveal_purple: M(100, 2, 'np'), reveal_pink: M(100, 2, 'np'),
  reveal_red: M(100, 2, 'np'), reveal_gold: M(100, 2, 'np'),
  coin: M(40, 4, 'p'), star_up: M(80, 2, 'np'), victory: M(500, 1, 'np'), defeat: M(500, 1, 'np'),
  heart_lose: M(100, 2, 'p'), potion_drink: M(300, 1), enchant: M(150, 2, 'np'), buy: M(60, 2, 'p'),
  error: M(80, 2, 'p'), page: M(60, 2), countdown: M(150, 2, 'np'), fight: M(300, 1, 'np'), door: M(150, 2),
  levelup: M(200, 1, 'np'), relic: M(120, 2, 'np'), card_flip: M(30, 4, 'p'),
};

const sfxVoices = new Set<Voice>(); // insertion order = age (oldest first)
const lastPlay = new Map<string, number>();
const alive = new Map<string, number>();

// ------------------------------------------------------------------ music --

interface Player {
  readonly gain: GainNode; // dry, crossfaded
  readonly send: GainNode; // reverb send, crossfaded
  readonly dur: number; // seconds per step
  readonly run: (pl: Player, t: number, i: number) => void;
  readonly voices: Set<Voice>;
  next: number;
  step: number;
  timer: number;
}
interface ThemeDef {
  bpm: number;
  spb: number; // steps per beat
  wet: number; // reverb send level
  run: (pl: Player, t: number, i: number) => void;
}
interface Chord { b: number; v: readonly number[] } // bass note + voicing (midi)

let musicLive = 0;

/** Allocate a music voice; non-essential notes are skipped when the pool is busy. */
function mv(pl: Player, t: number, essential = false): Voice | null {
  if (!eng || (!essential && musicLive >= MAX_MUSIC_VOICES)) return null;
  const v = new Voice(eng, pl.gain, pl.send, t, 1, 1);
  musicLive++;
  pl.voices.add(v);
  v.onDone = () => {
    musicLive--;
    pl.voices.delete(v);
  };
  return v;
}

// ---- instruments (all quiet by design; the music bus is trimmed up) ----

/** Soft felt piano: detuned triangle+sine body and a short octave "hammer" partial. */
function piano(pl: Player, t: number, m: number, vel: number): void {
  const v = mv(pl, t);
  if (!v) return;
  const f = mtof(m), d = clamp(4.2 - (m - 48) * 0.06, 1.2, 4.2);
  v.osc({ type: 'triangle', f, det: -4, a: 0.005, d, vol: vel * 0.55 });
  v.osc({ f, det: 4, a: 0.004, d: d * 0.8, vol: vel * 0.45 });
  v.osc({ f: f * 2, a: 0.002, d: 0.3, vol: vel * 0.15 });
  v.wet(1).seal();
}

function marimba(pl: Player, t: number, m: number, vel: number): void {
  const v = mv(pl, t);
  if (!v) return;
  const f = mtof(m);
  v.osc({ f, a: 0.002, d: 0.45, vol: vel });
  v.osc({ f: f * 4, a: 0.001, d: 0.06, vol: vel * 0.25 });
  v.wet(1).seal();
}

function pluck(pl: Player, t: number, m: number, vol: number, d: number): void {
  const v = mv(pl, t);
  if (!v) return;
  const f = mtof(m);
  v.osc({ type: 'triangle', f, d, vol });
  v.osc({ type: 'square', f, a: 0.002, d: d * 0.3, vol: vol * 0.2, filter: { type: 'lowpass', f: f * 4 } });
  v.wet(1).seal();
}

function pad(
  pl: Player, t: number, ms: readonly number[], dur: number, vol: number, type: OscillatorType, cut: number,
  a = Math.min(1.5, dur * 0.4), rel = 2.5,
): void {
  const v = mv(pl, t, true);
  if (!v) return;
  const h = Math.max(0, dur - a);
  const lp = v.sub({ type: 'lowpass', f: cut, q: 0 }, 0, a + h + rel);
  for (const m of ms) {
    const f = mtof(m);
    v.osc({ type, f, det: -7, a, h, d: rel, vol, to: lp });
    v.osc({ type, f, det: 7, a, h, d: rel, vol, to: lp });
  }
  v.wet(1).seal();
}

function mBell(pl: Player, t: number, m: number, vol: number, d: number, ratio = 3.5): void {
  const v = mv(pl, t);
  if (!v) return;
  v.fm({ f: mtof(m), ratio, index: 1.8, d, idxD: d * 0.3, vol });
  v.wet(1).seal();
}

function bass(pl: Player, t: number, m: number, vol: number, d: number, cut: number): void {
  const v = mv(pl, t, true);
  if (!v) return;
  const f = mtof(m);
  v.osc({ type: 'sawtooth', f, a: 0.004, h: d * 0.3, d, vol, filter: { type: 'lowpass', f: [[0, cut], [d, cut * 0.3]], q: 5 } });
  v.osc({ f, a: 0.004, h: d * 0.3, d, vol: vol * 0.7 });
  v.seal();
}

function kick(pl: Player, t: number, vol: number): void {
  const v = mv(pl, t, true);
  if (!v) return;
  v.osc({ f: [[0, 150], [0.07, 48]], a: 0.002, d: 0.3, vol });
  v.noise({ d: 0.012, vol: vol * 0.2, filter: { type: 'highpass', f: 2500 } });
  v.seal();
}

function snare(pl: Player, t: number, vol: number): void {
  const v = mv(pl, t, true);
  if (!v) return;
  v.noise({ d: 0.16, vol: vol * 2.2, filter: { type: 'bandpass', f: 2000, q: 0.7 } });
  v.osc({ type: 'triangle', f: [[0, 230], [0.05, 160]], d: 0.08, vol: vol * 0.6 });
  v.wet(0.6).seal();
}

function hat(pl: Player, t: number, vol: number, open = false): void {
  const v = mv(pl, t);
  if (!v) return;
  v.noise({ d: open ? 0.22 : 0.035, vol, filter: { type: 'highpass', f: 7500 } });
  v.seal();
}

function crash(pl: Player, t: number, vol: number): void {
  const v = mv(pl, t);
  if (!v) return;
  v.noise({ d: 1.6, vol, filter: { type: 'highpass', f: 4000 } });
  v.wet(1).seal();
}

function shaker(pl: Player, t: number, vol: number): void {
  const v = mv(pl, t);
  if (!v) return;
  v.noise({ a: 0.01, d: 0.04, vol, filter: { type: 'highpass', f: 5500 } });
  v.seal();
}

function lead(pl: Player, t: number, m: number, vol: number, dur: number): void {
  const v = mv(pl, t);
  if (!v) return;
  const f = mtof(m);
  const lp = v.sub({ type: 'lowpass', f: [[0, 1200], [0.06, 3200], [dur + 0.2, 1500]], q: 3 }, 0, dur + 0.25);
  v.osc({ type: 'square', f, a: 0.01, h: dur, d: 0.18, vol, vib: [5.5, f * 0.012], to: lp });
  v.osc({ type: 'sawtooth', f, det: 9, a: 0.01, h: dur, d: 0.18, vol: vol * 0.6, to: lp });
  v.wet(1).seal();
}

/** Nether drone: two saws (root+fifth) through a slowly breathing resonant lowpass, plus sine weight. */
function drone(pl: Player, t: number, m: number, dur: number, vol: number): void {
  const v = mv(pl, t, true);
  if (!v) return;
  const a = 3, h = Math.max(0, dur - a);
  const lp = v.sub({ type: 'lowpass', f: 240, q: 8, lfo: [0.12, 100] }, 0, a + h + 3);
  v.osc({ type: 'sawtooth', f: mtof(m), det: -6, a, h, d: 3, vol, to: lp });
  v.osc({ type: 'sawtooth', f: mtof(m + 7), det: 6, a, h, d: 3, vol: vol * 0.6, to: lp });
  v.osc({ f: mtof(m + 12), a, h, d: 3, vol: vol * 1.2 });
  v.wet(1).seal();
}

/** The End's airy wind: a slow pink-noise swell with a drifting band. */
function air(pl: Player, t: number, dur: number, vol: number): void {
  const v = mv(pl, t);
  if (!v) return;
  v.noise({
    kind: 'pink', a: dur * 0.45, h: dur * 0.1, d: dur * 0.45, vol,
    filter: { type: 'bandpass', f: [[0, 500], [dur * 0.5, 2400], [dur, 800]], q: 1.5 },
  });
  v.wet(1).seal();
}

// ---- generative ambient engine (menu / overworld / nether / end / shop) ----

interface AmbientCfg {
  bpm: number;
  wet: number;
  chords: readonly Chord[];
  bpc: number; // bars per chord
  mel: readonly number[]; // melody pitch classes
  lo: number; // melody range (midi)
  hi: number;
  density: number; // melody note chance per 8th
  vel: number; // melody velocity
  inst?: 'piano' | 'marimba';
  pad?: { vol: number; type: OscillatorType; cut: number };
  bass?: number; // low chord-root note velocity
  arp?: number; // chance of a broken chord on a chord change
  rest?: number; // chance an 8-bar phrase is near-silent
  bell?: { p: number; vol: number; d: number; ratio: number; ms?: readonly number[]; oct?: number };
  drone?: { m: number; vol: number };
  air?: number;
  walkBass?: number; // shop: root/fifth bounce on beats 1 & 3
  comp?: number; // shop: offbeat chord stabs
  shaker?: number;
}

/**
 * 8 eighth-note steps per bar, 8-bar phrases: bars 0-1 state a random-walk
 * motif, bars 2-3 repeat it with mutations, bars 4-6 wander, bar 7 cadences on
 * a chord tone. Some phrases rest almost entirely (C418-style space).
 */
function ambient(cfg: AmbientCfg): ThemeDef {
  const pool: number[] = [];
  for (let m = cfg.lo; m <= cfg.hi; m++) if (cfg.mel.includes(m % 12)) pool.push(m);
  let idx = pool.length >> 1;
  let motif: (number | null)[] = [];
  let quiet = false;
  const walk = (): number => {
    idx += Math.random() < 0.12 ? pick([-4, -3, 3, 4]) : pick([-2, -1, -1, 1, 1, 2]);
    if (idx < 0) idx = -idx;
    if (idx > pool.length - 1) idx = 2 * (pool.length - 1) - idx;
    idx = clamp(idx, 0, pool.length - 1);
    return pool[idx];
  };
  const play = (pl: Player, t: number, m: number, vel: number): void => {
    if (cfg.inst === 'marimba') marimba(pl, t, m, vel);
    else piano(pl, t, m, vel);
  };
  return {
    bpm: cfg.bpm,
    spb: 2,
    wet: cfg.wet,
    run(pl, t, i) {
      const s = i % 8, bar = Math.floor(i / 8), pb = bar % 8, dt = pl.dur, barDur = dt * 8;
      const ch = cfg.chords[Math.floor(bar / cfg.bpc) % cfg.chords.length];
      const hum = (): number => t + Math.random() * 0.015;

      if (i % 64 === 0) {
        motif = [];
        for (let k = 0; k < 16; k++) motif.push(Math.random() < cfg.density * (k % 2 ? 0.6 : 1.4) ? walk() : null);
        quiet = i > 0 && Math.random() < (cfg.rest ?? 0.2);
      }
      // harmony on chord changes
      if (s === 0 && bar % cfg.bpc === 0) {
        if (cfg.pad) pad(pl, t, ch.v, cfg.bpc * barDur + 0.4, cfg.pad.vol, cfg.pad.type, cfg.pad.cut);
        if (cfg.bass && Math.random() < 0.85) play(pl, hum(), ch.b, cfg.bass);
        if (!quiet && Math.random() < (cfg.arp ?? 0.25)) ch.v.forEach((m, k) => play(pl, t + (k + 1) * dt * 0.5, m + 12, cfg.vel * 0.55));
        const b = cfg.bell;
        if (b && Math.random() < b.p) mBell(pl, t + dt * 4, b.ms ? pick(b.ms) : ch.v[ch.v.length - 1] + (b.oct ?? 24), b.vol, b.d, b.ratio);
      }
      if (cfg.drone && s === 0 && bar % 4 === 0) drone(pl, t, cfg.drone.m, barDur * 4 + 1.5, cfg.drone.vol);
      if (cfg.air && s === 0 && bar % 4 === 2 && Math.random() < 0.6) air(pl, t, barDur * 3, cfg.air);
      if (cfg.walkBass && s % 4 === 0) play(pl, t, ch.b + (s === 4 ? 7 : 0), cfg.walkBass);
      if (cfg.comp && s % 4 === 2) for (const m of ch.v) play(pl, hum(), m, cfg.comp);
      if (cfg.shaker) shaker(pl, t, s % 2 ? cfg.shaker : cfg.shaker * 0.5);

      // melody
      let note: number | null = null;
      if (pb < 4) {
        note = motif[(pb % 2) * 8 + s] ?? null;
        if (note !== null && pb >= 2 && Math.random() < 0.3) note = walk();
      } else if (pb < 7) {
        if (Math.random() < cfg.density * (s % 2 ? 0.6 : 1.3) * (pb === 6 ? 0.5 : 1)) note = walk();
      } else if (s === 0 && Math.random() < 0.7) {
        note = ch.v[ch.v.length - 1] + 12;
      }
      if (note !== null && quiet && Math.random() < 0.7) note = null;
      if (note !== null) {
        const vel = cfg.vel * (s === 0 ? 1 : s % 2 ? 0.7 : 0.85) * rand(0.75, 1);
        play(pl, hum(), note, vel);
        const k = pool.indexOf(note);
        if (k >= 2 && Math.random() < 0.15) play(pl, hum(), pool[k - 2], vel * 0.7); // occasional dyad
      }
    },
  };
}

// ---- driving themes ----

function battleTheme(): ThemeDef {
  const prog: readonly Chord[] = [
    { b: 45, v: [57, 60, 64] }, // Am
    { b: 41, v: [57, 60, 65] }, // F
    { b: 43, v: [55, 59, 62] }, // G
    { b: 40, v: [56, 59, 64] }, // E (harmonic-minor V)
  ];
  let arpUp = true;
  return {
    bpm: 120,
    spb: 4,
    wet: 0.2,
    run(pl, t, i) {
      const s = i % 16, bar = Math.floor(i / 16), ph = bar % 8, c = prog[bar % 4], dt = pl.dur;
      if (s === 0 && ph === 0) {
        crash(pl, t, 0.05);
        arpUp = Math.random() < 0.5;
      }
      if (s === 0 || s === 8 || (s === 10 && bar % 2 === 1) || (s === 7 && ph === 3)) kick(pl, t, 0.45);
      if (s === 4 || s === 12) snare(pl, t, 0.2);
      else if (ph === 7 && s >= 13) snare(pl, t, 0.07 + (s - 13) * 0.04); // fill
      if (s % 2 === 0) hat(pl, t, s % 4 === 2 ? 0.12 : 0.07, s === 14 && Math.random() < 0.3);
      // galloping bass ostinato: 8th + two 16ths
      if (s % 4 !== 1) bass(pl, t, c.b + (s === 6 || s === 14 ? 12 : 0), s % 4 === 0 ? 0.17 : 0.12, s % 4 === 0 ? 0.16 : 0.09, 900);
      if (s === 0) pad(pl, t, c.v, 16 * dt, 0.011, 'sawtooth', 1000, 0.08, 0.6);
      // arpeggio lifts the second half of each 8-bar phrase
      if (ph >= 4 && s % 2 === 0) {
        const tones = [c.v[0] + 12, c.v[1] + 12, c.v[2] + 12, c.v[0] + 24];
        const k = (s / 2) % 4;
        pluck(pl, t, tones[arpUp ? k : 3 - k], 0.05, 0.18);
      }
    },
  };
}

function bossTheme(): ThemeDef {
  const roots = [38, 39, 38, 36]; // D Eb D C — phrygian menace
  // 2-bar lead motif: 16th-step → [midi, length in steps]
  const motif = new Map<number, readonly [number, number]>([
    [0, [74, 3]], [3, [72, 3]], [6, [70, 2]], [8, [69, 4]], [12, [70, 2]], [14, [69, 2]],
    [16, [74, 3]], [19, [75, 3]], [22, [74, 2]], [24, [72, 4]], [28, [69, 4]],
  ]);
  return {
    bpm: 140,
    spb: 4,
    wet: 0.18,
    run(pl, t, i) {
      const s = i % 16, bar = Math.floor(i / 16), ph = bar % 8, r = roots[bar % 4], dt = pl.dur;
      if (s === 0 && ph % 4 === 0) crash(pl, t, 0.07);
      if (s % 4 === 0 || (s === 14 && bar % 2 === 1)) kick(pl, t, 0.5);
      if (s === 4 || s === 12) snare(pl, t, 0.24);
      else if (ph === 7 && s >= 8 && s % 2 === 0) snare(pl, t, 0.08 + (s - 8) * 0.025);
      hat(pl, t, s % 2 ? 0.06 : 0.11);
      bass(pl, t, r + (s % 8 === 6 ? 12 : 0), s % 4 === 0 ? 0.17 : 0.11, 0.08, 1200); // relentless 16ths
      if (s === 0) pad(pl, t, [r + 12, r + 19, r + 24], 16 * dt, 0.012, 'sawtooth', 800, 0.05, 0.5);
      if (ph >= 2) {
        const n = motif.get((bar % 2) * 16 + s);
        if (n) lead(pl, t, n[0] + (ph >= 6 ? 12 : 0), ph >= 6 ? 0.04 : 0.05, n[1] * dt);
      }
    },
  };
}

function victoryTheme(): ThemeDef {
  const prog: readonly Chord[] = [
    { b: 36, v: [60, 64, 67] }, { b: 45, v: [60, 64, 69] }, { b: 41, v: [60, 65, 69] }, { b: 43, v: [59, 62, 67] },
  ];
  const arp = [0, 1, 2, 3, 2, 1, 2, 1];
  return {
    bpm: 104,
    spb: 2,
    wet: 0.4,
    run(pl, t, i) {
      const s = i % 8, bar = Math.floor(i / 8), c = prog[bar % 4], dt = pl.dur;
      const tones = [c.v[0] + 12, c.v[1] + 12, c.v[2] + 12, c.v[0] + 24];
      pluck(pl, t, tones[arp[s]], s === 0 ? 0.08 : 0.055, 0.45);
      if (s === 0) {
        pad(pl, t, c.v, 8 * dt, 0.012, 'sawtooth', 1800, 0.2, 1.2);
        bass(pl, t, c.b, 0.13, 0.5, 600);
        if (bar % 2 === 0) mBell(pl, t, tones[3] + 12, 0.03, 2.5);
      }
      if (s === 4) bass(pl, t, c.b + 7, 0.1, 0.35, 600);
      if (s % 2 === 1) hat(pl, t, 0.04);
    },
  };
}

const THEMES: Record<Exclude<MusicTheme, 'none'>, () => ThemeDef> = {
  menu: () =>
    ambient({
      bpm: 66, wet: 0.55, bpc: 2,
      chords: [
        { b: 36, v: [55, 59, 64, 67] }, // Cmaj7
        { b: 40, v: [55, 59, 62, 67] }, // Em7
        { b: 41, v: [57, 60, 64, 69] }, // Fmaj7
        { b: 43, v: [55, 59, 62, 64] }, // G6
      ],
      mel: [0, 2, 4, 7, 9], lo: 67, hi: 86,
      density: 0.26, vel: 0.24, bass: 0.2, arp: 0.3,
      pad: { vol: 0.014, type: 'triangle', cut: 1400 },
      bell: { p: 0.12, vol: 0.025, d: 3, ratio: 3.5 },
    }),
  map1: () =>
    ambient({
      bpm: 72, wet: 0.5, bpc: 2,
      chords: [
        { b: 43, v: [54, 57, 59, 62] }, // Gmaj9
        { b: 40, v: [55, 59, 62, 66] }, // Em9
        { b: 36, v: [55, 59, 64, 66] }, // Cmaj7#11 (lydian colour)
        { b: 38, v: [54, 57, 59, 64] }, // D6/9
      ],
      mel: [7, 9, 11, 2, 4], lo: 67, hi: 88,
      density: 0.24, vel: 0.24, bass: 0.2, arp: 0.25,
      pad: { vol: 0.014, type: 'triangle', cut: 1100 },
      bell: { p: 0.1, vol: 0.02, d: 3, ratio: 3.5 },
    }),
  map2: () =>
    ambient({
      bpm: 56, wet: 0.6, bpc: 2,
      chords: [
        { b: 40, v: [52, 55, 59] }, // Em
        { b: 41, v: [53, 57, 60] }, // F (phrygian bII)
        { b: 40, v: [52, 55, 60] }, // C/E
        { b: 38, v: [50, 53, 57] }, // Dm
      ],
      mel: [4, 5, 7, 11, 0], lo: 52, hi: 72,
      density: 0.13, vel: 0.22, bass: 0.22, arp: 0.15, rest: 0.25,
      pad: { vol: 0.013, type: 'sawtooth', cut: 500 },
      bell: { p: 0.4, vol: 0.06, d: 5, ratio: 1.41, ms: [40, 47, 52] }, // deep gong-ish bell
      drone: { m: 28, vol: 0.045 },
    }),
  map3: () =>
    ambient({
      bpm: 54, wet: 0.75, bpc: 2,
      chords: [
        { b: 38, v: [57, 62, 64, 69] }, // Dsus2
        { b: 36, v: [56, 60, 64, 66] }, // C aug(#11) — whole-tone
        { b: 38, v: [55, 60, 62, 67] }, // Dsus4
        { b: 34, v: [58, 62, 66, 70] }, // Bb aug
      ],
      mel: [0, 2, 4, 6, 8, 10], lo: 74, hi: 93,
      density: 0.14, vel: 0.2, bass: 0.18, arp: 0.2, rest: 0.2,
      pad: { vol: 0.014, type: 'triangle', cut: 2200 },
      bell: { p: 0.5, vol: 0.03, d: 4, ratio: 3.5, oct: 24 },
      air: 0.25,
    }),
  shop: () =>
    ambient({
      bpm: 100, wet: 0.25, bpc: 1,
      chords: [
        { b: 48, v: [60, 64, 67] }, { b: 45, v: [60, 64, 69] }, { b: 41, v: [60, 65, 69] }, { b: 43, v: [59, 62, 67] },
      ],
      mel: [0, 2, 4, 7, 9], lo: 72, hi: 88,
      density: 0.42, vel: 0.26, inst: 'marimba', arp: 0.1, rest: 0.1,
      walkBass: 0.28, comp: 0.08, shaker: 0.07,
    }),
  battle: battleTheme,
  boss: bossTheme,
  victory: victoryTheme,
};

let want: MusicTheme = 'none';
let cur: Player | null = null;

/** Lookahead scheduler: a 100 ms timer schedules steps ~0.3 s ahead on the audio clock. */
function startPlayer(e: Engine, theme: Exclude<MusicTheme, 'none'>): Player {
  const def = THEMES[theme]();
  const c = e.c, now = c.currentTime;
  const gain = c.createGain(), send = c.createGain();
  gain.gain.value = 0;
  send.gain.value = 0;
  gain.connect(e.musicBus);
  send.connect(e.musicVerb);
  fadeParam(gain.gain, 1, now, FADE);
  fadeParam(send.gain, def.wet, now, FADE);
  const pl: Player = { gain, send, dur: 60 / def.bpm / def.spb, run: def.run, voices: new Set(), next: now + 0.1, step: 0, timer: 0 };
  const pump = (): void => {
    const t = c.currentTime;
    // hidden tabs throttle timers to ~1 Hz: look further ahead so music doesn't gap
    const ahead = typeof document !== 'undefined' && document.hidden ? 1.5 : 0.3;
    if (pl.next < t) pl.next = t + 0.05; // fell behind: skip rather than burst
    const mute = vols.music <= 0 || vols.master <= 0;
    while (pl.next < t + ahead) {
      if (!mute) pl.run(pl, pl.next, pl.step);
      pl.next += pl.dur;
      pl.step++;
    }
  };
  pl.timer = window.setInterval(pump, 100);
  pump();
  return pl;
}

function stopPlayer(pl: Player): void {
  const now = pl.gain.context.currentTime;
  fadeParam(pl.gain.gain, 0, now, FADE);
  fadeParam(pl.send.gain, 0, now, FADE);
  window.setTimeout(() => {
    window.clearInterval(pl.timer);
    for (const v of [...pl.voices]) v.kill(0.02);
    window.setTimeout(() => {
      pl.gain.disconnect();
      pl.send.disconnect();
    }, 200);
  }, FADE * 1000 + 60);
}

function switchMusic(): void {
  if (!eng) return;
  if (cur) {
    stopPlayer(cur);
    cur = null;
  }
  const theme = want;
  if (theme !== 'none') cur = startPlayer(eng, theme);
}

// ------------------------------------------------------------- public API --

/** Create/resume the AudioContext. Call from a user gesture (safe to call on every one). */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  if (!eng) {
    eng = createEngine();
    if (!eng) return;
    applyVolumes(true);
    // iOS: playing a 1-sample silent buffer inside the gesture fully unlocks output
    const c = eng.c, b = c.createBufferSource();
    b.buffer = c.createBuffer(1, 1, c.sampleRate);
    b.connect(c.destination);
    b.onended = () => b.disconnect();
    b.start();
  }
  if (eng.c.state !== 'running') eng.c.resume().catch(() => {});
  if (want !== 'none' && !cur) switchMusic();
}

/** Volumes 0..1 (squared internally for a perceptual slider curve). */
export function setVolumes(v: { master: number; music: number; sfx: number }): void {
  vols.master = clamp(fin(v.master, vols.master), 0, 1);
  vols.music = clamp(fin(v.music, vols.music), 0, 1);
  vols.sfx = clamp(fin(v.sfx, vols.sfx), 0, 1);
  applyVolumes(false);
}

/** Play a sound effect by id. Unknown ids, rate-limited repeats and calls before unlock are ignored. */
export function sfx(id: string, opts?: SfxOpts): void {
  const e = eng;
  if (!e || e.c.state !== 'running' || vols.sfx <= 0 || vols.master <= 0) return;
  if (!Object.hasOwn(SFX, id)) return;
  const meta = META[id] ?? DEFAULT_META;
  const vol = clamp(fin(opts?.vol, 1), 0, 2);
  if (vol <= 0) return;
  const now = e.c.currentTime;
  const last = lastPlay.get(id);
  if (last !== undefined && now - last < meta.gap / 1000) return;
  const n = alive.get(id) ?? 0;
  if (n >= meta.max) return;
  if (sfxVoices.size >= MAX_SFX_VOICES) {
    if (!meta.pri) return;
    sfxVoices.values().next().value?.kill(); // steal the oldest
  }
  lastPlay.set(id, now);
  const p = clamp(fin(opts?.pitch, meta.nj ? 1 : 1 + (Math.random() * 2 - 1) * 0.06), 0.25, 4);
  const v = new Voice(e, e.sfxBus, e.sfxVerb, now, p, vol, fin(opts?.pan, 0));
  sfxVoices.add(v);
  alive.set(id, n + 1);
  v.onDone = () => {
    sfxVoices.delete(v);
    alive.set(id, Math.max(0, (alive.get(id) ?? 1) - 1));
  };
  SFX[id](v);
  v.seal();
}

/** Crossfade (~1.5 s) to a music theme; 'none' fades out. Same theme = no-op. */
export function playMusic(theme: MusicTheme): void {
  const t: MusicTheme = Object.hasOwn(THEMES, theme) ? theme : 'none';
  if (t === want) return;
  want = t;
  switchMusic();
}

/** Crate-strip tick for item index i: a ratchet-like, slightly varying pitch. */
export function tickPitch(i: number): void {
  sfx('tick', { pitch: 1 + 0.06 * Math.sin(fin(i, 0) * 2.399) });
}
