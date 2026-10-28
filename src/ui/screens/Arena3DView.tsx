import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { effect } from '@preact/signals';
import { Battle, DT, type BattleConfig, type BattleResult } from '../../battle/sim.ts';
import type { Arena3D } from '../../battle3d/arena3d.ts';
import { BLOCK, DEPLOY_COLS, FEATURE_NAME, GW, SURFACE_INFO, applyBuild, buildCells, clampToDeploy, cloneTerrain, isBlocked, isIndestructible, type BuildOrder, type Terrain } from '../../battle/terrain.ts';
import { ARENA_W } from '../../battle/unit.ts';
import { canTame, type SkillKind } from '../../battle/skills.ts';
import { itemRadius } from '../../battle/items.ts';
import { ITEM_MAP } from '../../data/items.ts';
import { SKILL_INFO, type SkillId } from '../../data/commanders.ts';
import { Emerald, PotionTipContent, Stars, Tip, itemIcon } from '../components/common.tsx';
import { mobDef } from '../../data/mobs.ts';
import { preload, sheetFor, url } from '../assets.ts';
import { earnAchievement, settings, stageScale, stageSize, updateSettings } from '../store.ts';
import { reloadForUpdate } from '../update.ts';
import { playMusic, sfx } from '../../audio/audio.ts';

interface Props {
  terrain: Terrain;
  config: BattleConfig;
  /** Changes whenever the battle setup (deployment, team...) changes. */
  configKey: string;
  phase: 'deploy' | 'fight';
  title: string;
  subtitle?: string;
  boss?: boolean;
  leftLabel?: string;
  rightLabel?: string;
  /** Neutral end banner per winning side (spectating), instead of victory / defeat. */
  endText?: [string, string];
  /** Which side's squads can be dragged while deploying (two players take turns). */
  deploySide?: 0 | 1;
  onDeployMove?: (uid: string, pos: [number, number]) => void;
  onFinish: (r: BattleResult) => void;
  /** Battle items available on the hotbar (player side). */
  items?: string[];
  /** Free items for this fight only (the Witch's brew); not taken from the inventory. */
  temp?: string[];
  /** Villager: emeralds per hired golem, and whether the player can afford it. */
  golemCost?: number;
  canPay?: boolean;
  /** Steve: deployment builds and how to change them. */
  builds?: BuildOrder[];
  onBuild?: (builds: BuildOrder[]) => void;
  extraOverlay?: ComponentChildren;
  children?: ComponentChildren;
}

/** A column inside a side's deployment zone. */
const inZone = (side: 0 | 1, cx: number) => (side === 0 ? cx < DEPLOY_COLS : cx >= GW - DEPLOY_COLS);

/** What a click on the battlefield will do. */
type Aim = { k: 'item'; i: number } | { k: 'skill'; s: SkillKind } | null;
/** Where an aimed item or skill would land: a battlefield point, or the enemy to tame. */
type AimTarget = { x: number; y: number; unit?: NonNullable<ReturnType<Arena3D['pickUnit']>> };

/** Keyboard camera pan: [right, forward] as seen from the camera. */
const PAN_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
};

/** Hotbar entries for a commander skill. */
const SKILL_SLOTS: Record<SkillId, SkillKind[]> = { build: ['wall', 'platform'], tame: ['tame'], golem: ['golem'], brew: [] };
const SKILL_KEYS = ['Q', 'E'];

interface HudCard {
  mob: string;
  team: 0 | 1;
  alive: number;
  spawned: number;
  dmg: number;
  star: number;
}

interface Hud {
  t: number;
  hp: [number, number];
  max: [number, number];
  cards: HudCard[];
  boss?: { name: string; hp: number; max: number; shield: boolean };
  sudden: boolean;
  skillLeft: number;
}

function snapshot(b: Battle, max: [number, number]): Hud {
  const hp: [number, number] = [0, 0];
  for (const u of b.units) if (u.alive && !u.structure) hp[u.team] += u.hp;
  const boss = b.units.find((u) => u.boss && !u.isSummon);
  return {
    t: b.t,
    hp,
    max,
    cards: b.cards.map((c) => ({ mob: c.mob, team: c.team, alive: c.alive, spawned: c.spawned, dmg: c.dmg, star: c.star })),
    boss: boss ? { name: boss.mob.name, hp: boss.alive ? boss.hp : 0, max: boss.maxHp, shield: !!boss.ref.witherArmor } : undefined,
    sudden: b.t >= b.suddenAt,
    skillLeft: b.skillLeft[0],
  };
}

function maxHp(b: Battle): [number, number] {
  const m: [number, number] = [0, 0];
  for (const u of b.units) if (!u.structure) m[u.team] += u.maxHp;
  return m;
}

export function Arena3DView({
  terrain, config, configKey, phase, title, subtitle, boss, leftLabel = '我方', rightLabel = '敌方', endText, deploySide = 0, onDeployMove, onFinish, items = [], temp = [],
  golemCost = 0, canPay = true, builds = [], onBuild, extraOverlay, children,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [stage, setStage] = useState<'intro' | 'fight' | 'end'>('intro');
  const [count, setCount] = useState(3);
  const [winner, setWinner] = useState<0 | 1 | null>(null);
  const [draw, setDraw] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Hotbar: which slots are spent (inventory then temp items) and what is being aimed. */
  const [used, setUsed] = useState<boolean[]>([]);
  const [aim, setAim] = useState<Aim>(null);
  const [note, setNote] = useState<string | null>(null);
  /** Touch controls (hints and two-tap aiming); follows the last pointer used on the battlefield. */
  const [touchUI, setTouchUI] = useState(() => !!window.matchMedia?.('(pointer: coarse)').matches);
  /** Touch aiming: a first tap placed the preview ring and waits for a confirming tap. */
  const [pending, setPending] = useState(false);
  const [camMoved, setCamMoved] = useState(false);
  const slots = [...items, ...temp];
  const skill = config.sides[0].skill;
  const skillKinds = skill ? SKILL_SLOTS[skill.id] : [];
  const speed = settings.value.speed;
  const R = useRef({
    arena: null as Arena3D | null,
    battle: null as Battle | null,
    phase,
    paused: false,
    speed,
    skip: false,
    fightStarted: false,
    finished: false,
    max: [1, 1] as [number, number],
    drag: null as null | { uid: string; card: number; pos: [number, number] | null },
    /** The pressed pointer: where it was last (stage px) and where it went down (client px). */
    pointer: null as null | { id: number; x: number; y: number; sx: number; sy: number; moved: boolean; button: number },
    /** Fingers on the battlefield, and the two-finger gesture (spread and midpoint, stage px). */
    touches: new Map<number, { x: number; y: number }>(),
    pinch: null as null | { d: number; x: number; y: number; sx: number; sy: number; panning: boolean },
    pending: null as AimTarget | null,
    keys: new Set<string>(),
    camMoved: false,
    lastPreview: 0,
    configKey,
    aim: null as Aim,
    canUse: false,
    side: deploySide,
  });
  R.current.side = deploySide;
  R.current.paused = paused;
  R.current.speed = speed;
  R.current.phase = phase;
  R.current.aim = aim;
  R.current.canUse = phase === 'fight' && stage === 'fight' && !R.current.finished;

  /** Charges left: live in battle, otherwise what deployment builds left over. */
  const skillLeft = !skill ? 0 : phase === 'fight' ? (hud?.skillLeft ?? skill.charges) : Math.max(0, skill.charges - builds.length);
  /** Skills work in the fight; Steve can also build while deploying. */
  const skillReady = (k: SkillKind) =>
    !!skill && skillLeft > 0 && (k === 'golem' ? canPay : true) && (R.current.canUse || (phase === 'deploy' && (k === 'wall' || k === 'platform') && !!onBuild));

  const clearAim = () => {
    setAim(null);
    R.current.pending = null;
    setPending(false);
    const a = R.current.arena;
    if (!a) return;
    a.setAim(null);
    a.setCells(null);
    a.tameMark = null;
  };

  const flash = (t: string) => {
    setNote(t);
    sfx('error', { vol: 0.5 });
    window.setTimeout(() => setNote((n) => (n === t ? null : n)), 1800);
  };

  /** Uses hotbar slot i at a battlefield point (or at once for instant items). */
  const useSlot = (i: number, x = 0, y = 0) => {
    const c = R.current;
    const id = slots[i];
    if (!c.canUse || used[i] || !id || !c.battle) return false;
    if (!c.battle.useItem(0, id, x, y, i >= items.length)) {
      flash(ITEM_MAP[id]?.target === 'own' ? '只能放在我方半场' : '这里用不了');
      return false;
    }
    setUsed((u) => {
      const n = u.slice();
      n[i] = true;
      return n;
    });
    clearAim();
    return true;
  };

  const pickSlot = (i: number) => {
    const def = ITEM_MAP[slots[i]];
    if (!def || used[i] || !R.current.canUse) return;
    sfx('click');
    if (def.target === 'none') useSlot(i);
    else if (aim?.k === 'item' && aim.i === i) clearAim();
    else {
      clearAim();
      setAim({ k: 'item', i });
    }
  };

  const pickSkill = (k: SkillKind) => {
    if (!skillReady(k)) return;
    sfx('click');
    if (aim?.k === 'skill' && aim.s === k) return clearAim();
    clearAim();
    setAim({ k: 'skill', s: k });
    const c = R.current;
    if (k === 'tame' && c.arena) c.arena.tameMark = (u) => u.team === 1 && !!c.battle && canTame(c.battle, 0, u);
  };

  /** Building: in deployment it becomes part of the plan, in battle it happens at once. */
  const doBuild = (kind: 'wall' | 'platform', x: number, y: number) => {
    const c = R.current;
    if (!c.battle) return;
    if (c.phase === 'deploy') {
      const probe = cloneTerrain(c.battle.terrain);
      if (!applyBuild(probe, 0, kind, x, y)) return flash(kind === 'wall' ? '这里砌不了墙（不能把路完全堵死）' : '这里垫不了土台');
      sfx('stomp', { vol: 0.5 });
      c.configKey = '';
      onBuild?.([...builds, { kind, x, y }]);
      if (skillLeft <= 1) clearAim();
      return;
    }
    if (!c.battle.useSkill(0, kind, x, y)) return flash(kind === 'wall' ? '这里砌不了墙（不能把路完全堵死）' : '这里垫不了土台');
    if (c.battle.skillLeft[0] <= 0) clearAim();
  };

  // Number keys pick item slots, Q/E the commander skill; Esc cancels aiming.
  // WASD / arrows pan the camera, Space puts it back to following the fight.
  useEffect(() => {
    const c = R.current;
    const syncPan = () => {
      let x = 0;
      let y = 0;
      for (const k of c.keys) {
        x += PAN_KEYS[k][0];
        y += PAN_KEYS[k][1];
      }
      if (c.arena) c.arena.keyPan = { x: Math.sign(x), y: Math.sign(y) };
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return clearAim();
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (PAN_KEYS[e.code]) {
        e.preventDefault();
        c.keys.add(e.code);
        return syncPan();
      }
      if (e.code === 'Space') {
        // Also keeps Space from pressing a focused button.
        e.preventDefault();
        return c.arena?.resetView();
      }
      const up = e.key.toUpperCase();
      const si = SKILL_KEYS.indexOf(up);
      if (si >= 0 && skillKinds[si]) return pickSkill(skillKinds[si]);
      const k = Number(e.key);
      if (k >= 1 && k <= slots.length) pickSlot(k - 1);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (c.keys.delete(e.code)) syncPan();
    };
    const onBlur = () => {
      c.keys.clear();
      syncPan();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  });

  // Stage-space pointer coordinates.
  const local = (e: PointerEvent | WheelEvent | MouseEvent) => {
    const el = hostRef.current!;
    const r = el.getBoundingClientRect();
    const s = stageScale.value;
    return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
  };

  // ── create arena ──
  useEffect(() => {
    let disposed = false;
    let raf = 0;
    playMusic(boss ? 'boss' : 'battle');
    const battle = new Battle(config);
    R.current.battle = battle;
    R.current.max = maxHp(battle);
    const mobs = [...new Set(battle.units.map((u) => u.mob.id)), 'vex', 'zombie', 'silverfish', 'guardian', 'pillager', 'wither_skeleton', 'illusioner', 'slime', 'magma_cube'];
    const tier = settings.value.frames ?? 'high';
    const pics = mobs.flatMap((m) => [url.mob(m), sheetFor(m, tier)?.url ?? '']).filter(Boolean);
    Promise.all([import('../../battle3d/arena3d.ts'), preload(pics)]).then(([mod]) => {
      if (disposed) return;
      const s = settings.value;
      const arena = new mod.Arena3D(hostRef.current!, terrain, battle, {
        shake: s.shake, numbers: s.numbers, particles: s.particles, frames: tier,
        // Deferred: the egg can roll while the arena is still being built inside this effect.
        onEgg: (id) => setTimeout(() => earnAchievement(id), 600),
      });
      R.current.arena = arena;
      arena.resize(stageSize.value.w, stageSize.value.h, stageScale.value);
      arena.setMode(phase === 'deploy' ? 'deploy' : 'battle');
      arena.setDeploySide(R.current.side);
      if (phase === 'deploy') arena.showDeployZones();
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__arena = { arena, R: R.current };
      setReady(true);
      setHud(snapshot(battle, R.current.max));
      let last = performance.now();
      let acc = 0;
      let hudT = 0;
      let endT = 0;
      let fpsT = 0;
      let frames = 0;
      const loop = (now: number) => {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        const c = R.current;
        const b = c.battle!;
        if (c.fightStarted && !c.finished) {
          if (c.skip && !b.over) {
            b.headless = true;
            b.runToEnd();
            b.headless = false;
            b.events.length = 0;
          }
          if (!c.paused && !b.over) {
            // Hit-stop slows the simulation for a few frames on heavy hits.
            acc += dt * c.speed * arena.timeScale();
            let steps = 0;
            while (acc >= DT && steps < 16) {
              b.step();
              acc -= DT;
              steps++;
            }
            if (steps >= 16) acc = 0;
            arena.sfxEnabled = c.speed <= 2;
            arena.consumeEvents();
          }
          hudT -= dt;
          if (hudT <= 0) {
            hudT = 0.1;
            setHud(snapshot(b, c.max));
          }
          if (b.over && endT === 0) {
            endT = 0.0001;
            setStage('end');
            setWinner(b.winner);
            setDraw(b.draw);
            setHud(snapshot(b, c.max));
            sfx(b.winner === 0 || endText ? 'victory' : 'defeat', { vol: 0.7 });
          }
          if (endT > 0) {
            endT += dt;
            if (endT > 1.9 && !c.finished) {
              c.finished = true;
              onFinish(b.result());
            }
          }
        }
        arena.frame(c.fightStarted && !c.paused ? Math.min(1, acc / DT) : 1, c.fightStarted ? (c.paused ? 0 : dt * Math.min(c.speed, 2) * arena.timeScale()) : dt);
        const moved = arena.viewChanged();
        if (moved !== c.camMoved) {
          c.camMoved = moved;
          setCamMoved(moved);
        }
        frames++;
        fpsT += dt;
        if (fpsT >= 0.5) {
          const el = document.getElementById('fps');
          if (el) el.textContent = `${Math.round(frames / fpsT)} FPS · ${b.units.filter((u) => u.alive).length} 单位 · ${b.projs.length} 投射物`;
          frames = 0;
          fpsT = 0;
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }).catch((e) => {
      // The battle module of an older deploy is gone: load the new build (the run is saved).
      console.error(e);
      if (!reloadForUpdate()) flash('战场加载失败，请刷新页面');
    });
    // Follows window resizes (and the compact stage's size changing with them).
    const unsub = effect(() => {
      const { w, h } = stageSize.value;
      const sc = stageScale.value;
      R.current.arena?.resize(w, h, sc);
    });
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsub();
      R.current.arena?.dispose();
      R.current.arena = null;
    };
  }, []);

  // ── two players take turns deploying: frame the side whose turn it is ──
  useEffect(() => {
    R.current.arena?.setDeploySide(deploySide);
  }, [deploySide]);

  // ── rebuild preview battle when the deployment changes ──
  useEffect(() => {
    const c = R.current;
    if (c.configKey === configKey || c.fightStarted) return;
    c.configKey = configKey;
    const b = new Battle(config);
    c.battle = b;
    c.max = maxHp(b);
    c.arena?.setBattle(b);
    if (phase === 'deploy') c.arena?.showDeployZones();
    setHud(snapshot(b, c.max));
  }, [configKey]);

  // ── phase change: start the fight ──
  useEffect(() => {
    const c = R.current;
    if (phase !== 'fight' || c.fightStarted || !ready) return;
    // Rebuild from the final config so the fight starts fresh and deterministic.
    const b = new Battle(config);
    c.battle = b;
    c.max = maxHp(b);
    c.arena?.setBattle(b);
    c.arena?.setMode('battle');
    clearAim();
    setHover(null);
    setStage('intro');
    const timers: number[] = [];
    const cd = (n: number, at: number) =>
      timers.push(
        window.setTimeout(() => {
          setCount(n);
          sfx(n > 0 ? 'countdown' : 'fight', { vol: 0.6 });
          if (n === 0) {
            c.fightStarted = true;
            setStage('fight');
          }
        }, at),
      );
    cd(3, 400);
    cd(2, 950);
    cd(1, 1500);
    cd(0, 2050);
    return () => timers.forEach(clearTimeout);
  }, [phase, ready]);

  // ── aiming ──
  /** What the current aim would hit under a stage point. */
  const aimAt = (p: { x: number; y: number }): AimTarget | null => {
    const c = R.current;
    const a = c.arena;
    if (!a || c.aim === null) return null;
    if (c.aim.k === 'skill' && c.aim.s === 'tame') {
      const u = a.pickUnit(p.x, p.y, 1, 60);
      return u ? { x: u.x, y: u.y, unit: u } : null;
    }
    const cell = a.pickCell(p.x, p.y);
    return cell ? { x: cell.x, y: cell.y } : null;
  };

  /** Preview ring (or wall cells) for a target; null hides it. */
  const showAim = (t: AimTarget | null) => {
    const c = R.current;
    const a = c.arena;
    const A = c.aim;
    if (!a || A === null || !c.battle) return;
    if (A.k === 'item') {
      const id = slots[A.i];
      const def = ITEM_MAP[id];
      if (!t || !def) a.setAim(null);
      else a.setAim(t, itemRadius(c.battle, 0, id), def.target !== 'own' || t.x < ARENA_W / 2, def.color);
    } else if (A.s === 'wall' || A.s === 'platform') {
      if (!t) a.setCells(null);
      else {
        const cells = buildCells(c.battle.terrain, 0, A.s, t.x, t.y);
        let ok = cells.length > 0;
        if (ok && A.s === 'wall') ok = !!applyBuild(cloneTerrain(c.battle.terrain), 0, 'wall', t.x, t.y);
        a.setCells(cells.length ? cells : null, ok, A.s === 'wall' ? 2 : c.battle.has(0, 'obsidian') ? 2 : 1);
      }
    } else if (A.s === 'golem') {
      if (!t) a.setAim(null);
      else a.setAim(t, 1.2, t.x < ARENA_W / 2, '#e8e4dc');
    } else if (A.s === 'tame') {
      const u = t?.unit;
      if (!u) a.setAim(null);
      else a.setAim(u, Math.max(0.8, (u.radius / BLOCK) * 1.6), canTame(c.battle, 0, u), '#ff9a3d');
    }
  };

  /** Uses the aimed item or skill on a target. */
  const fireAim = (t: AimTarget | null) => {
    const c = R.current;
    const A = c.aim;
    if (A === null || !c.battle) return;
    if (A.k === 'skill' && A.s === 'tame') {
      const u = t?.unit;
      if (!u || !u.alive || !canTame(c.battle, 0, u)) return flash(u ? `${u.mob.name} 的生命还太高（门槛见按钮说明）` : '点一个敌人');
      c.battle.useSkill(0, 'tame', 0, 0, u);
      clearAim();
      return;
    }
    if (!t) return;
    if (A.k === 'item') useSlot(A.i, t.x, t.y);
    else if (A.s === 'wall' || A.s === 'platform') doBuild(A.s, t.x, t.y);
    else if (A.s === 'golem') {
      if (!c.battle.useSkill(0, 'golem', t.x, t.y)) flash('只能召唤在我方半场');
      else clearAim();
    }
  };

  /** Touch has no hover: the first tap shows where it lands, a second tap inside the ring confirms. */
  const tapAim = (p: { x: number; y: number }) => {
    const c = R.current;
    const A = c.aim;
    const t = aimAt(p);
    if (A === null) return;
    if (A.k === 'skill' && A.s === 'tame') return fireAim(t);
    const P = c.pending;
    const reach = Math.max(1.5, A.k === 'item' && c.battle ? itemRadius(c.battle, 0, slots[A.i]) : 0) * BLOCK;
    if (P && t && Math.hypot(t.x - P.x, t.y - P.y) <= reach) {
      c.pending = null;
      setPending(false);
      return fireAim(P);
    }
    c.pending = t;
    setPending(!!t);
    showAim(t);
  };

  // ── pointer input ──
  // Mouse: left drag rotates, right or middle drag pans, wheel zooms, double click resets.
  // Touch: one finger rotates, two fingers pan and pinch-zoom. A drag never uses an aimed item.
  const pinchOf = (m: Map<number, { x: number; y: number }>) => {
    const [a, b] = [...m.values()];
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    return { d: Math.hypot(a.x - b.x, a.y - b.y), x, y, sx: x, sy: y, panning: false };
  };

  const onPointerDown = (e: PointerEvent) => {
    const c = R.current;
    const p = local(e);
    const el = e.currentTarget as HTMLElement;
    const capture = () => {
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer is already gone */
      }
    };
    const touch = e.pointerType !== 'mouse';
    if (touch !== touchUI) setTouchUI(touch);
    if (e.button === 1) e.preventDefault();
    if (touch) {
      // A tapped terrain tip closes on the next touch.
      setHover(null);
      c.arena?.setHover(null);
      c.touches.set(e.pointerId, p);
      if (c.touches.size >= 2) {
        // Not while a finger drags a squad; a third finger is ignored.
        if (c.drag || c.touches.size > 2) {
          c.touches.delete(e.pointerId);
          return;
        }
        c.pinch = pinchOf(c.touches);
        c.pointer = null;
        capture();
        return;
      }
    }
    if (c.pointer) return;
    c.pointer = { id: e.pointerId, x: p.x, y: p.y, sx: e.clientX, sy: e.clientY, moved: false, button: e.button };
    capture();
    // Aiming acts on release, so dragging can still move the camera.
    if (c.aim !== null) return;
    if (c.phase === 'deploy' && e.button === 0 && c.arena && onDeployMove) {
      const u = c.arena.pickUnit(p.x, p.y, c.side);
      if (u) {
        const plan = c.battle!.plans[u.card];
        if (plan?.uid) {
          c.drag = { uid: plan.uid, card: u.card, pos: null };
          setDragging(true);
          sfx('card_flip', { vol: 0.5 });
        }
      }
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const c = R.current;
    const a = c.arena;
    if (!a) return;
    const p = local(e);
    if (c.touches.has(e.pointerId)) c.touches.set(e.pointerId, p);
    if (c.pinch) {
      if (c.touches.size === 2 && c.touches.has(e.pointerId)) {
        const P = c.pinch;
        const n = pinchOf(c.touches);
        if (n.d > 0 && P.d > 0) a.zoomBy(P.d / n.d);
        // Only a real two-finger drag pans (and stops following); a plain pinch just zooms.
        if (P.panning) a.pan(n.x - P.x, n.y - P.y);
        else if (Math.hypot(n.x - P.sx, n.y - P.sy) > 16) P.panning = true;
        c.pinch = { ...n, sx: P.sx, sy: P.sy, panning: P.panning };
      }
      return;
    }
    const mouse = e.pointerType === 'mouse';
    const ptr = c.pointer?.id === e.pointerId ? c.pointer : null;
    if (ptr && !ptr.moved && Math.hypot(e.clientX - ptr.sx, e.clientY - ptr.sy) > (mouse ? 5 : 10)) {
      ptr.moved = true;
      ptr.x = p.x;
      ptr.y = p.y;
    }
    if (ptr && !c.drag) {
      if (ptr.moved) {
        if (ptr.button === 0) a.orbit(p.x - ptr.x, p.y - ptr.y);
        else a.pan(p.x - ptr.x, p.y - ptr.y);
        ptr.x = p.x;
        ptr.y = p.y;
      }
      if (c.aim !== null && mouse) showAim(aimAt(p));
      return;
    }
    if (c.aim !== null) {
      if (mouse) showAim(aimAt(p));
      return;
    }
    if (c.phase !== 'deploy') return;
    if (c.drag) {
      const cell = a.pickCell(p.x, p.y);
      if (!cell) return;
      const [x, y] = clampToDeploy(c.side, cell.x, cell.y);
      const ok = inZone(c.side, cell.cx) && !isBlocked(terrain, cell.cx, cell.cy);
      a.setHover({ cx: c.side === 0 ? Math.min(DEPLOY_COLS - 1, cell.cx) : Math.max(GW - DEPLOY_COLS, cell.cx), cy: cell.cy }, ok);
      c.drag.pos = [x, y];
      // Live preview: move this squad's units (throttled rebuild).
      const now = performance.now();
      if (now - c.lastPreview > 90) {
        c.lastPreview = now;
        const sides = config.sides.slice() as BattleConfig['sides'];
        sides[c.side] = { ...sides[c.side], cards: sides[c.side].cards.map((k) => (k.uid === c.drag!.uid ? { ...k, anchor: [x, y] } : k)) };
        const cfg: BattleConfig = { ...config, sides };
        const b = new Battle(cfg);
        c.battle = b;
        a.setBattle(b);
      }
      return;
    }
    terrainTip(p);
  };

  /** Deploying: what the terrain under a point does (on hover, or on a tap with touch). */
  const terrainTip = (p: { x: number; y: number }) => {
    const c = R.current;
    const a = c.arena;
    if (!a) return;
    // Terrain info stops at trees and walls, so hovering one describes it.
    const cell = a.pickCell(p.x, p.y, true);
    if (cell) {
      a.setHover(cell, inZone(c.side, cell.cx));
      const i = cell.cy * GW + cell.cx;
      const T = c.battle?.terrain ?? terrain;
      const s = T.s[i];
      const f = T.f[i];
      const lines = [`${SURFACE_INFO[s]?.name ?? '地面'} · 高度 ${T.h[i]}`];
      const mv = SURFACE_INFO[s]?.move ?? 1;
      if (mv !== 1) lines.push(mv < 1 ? `移动速度 ×${mv}` : `移动加快 ×${mv}`);
      if (s === 13) lines.push('灼烧非免疫燃烧的生物');
      if (s === 12) lines.push('水生生物加速并回血；末影人受伤');
      if (FEATURE_NAME[f]) {
        const solid = isBlocked(T, cell.cx, cell.cy);
        lines.push(solid ? `${FEATURE_NAME[f]}（高 ${T.fh[i]} 格）：阻挡移动，可作掩体挡住投射物` : `${FEATURE_NAME[f]}：大幅减速（节肢免疫）`);
        lines.push(isIndestructible(T, i) ? '坚不可摧' : '可被爆炸摧毁');
      }
      if (T.h[i] > 0) lines.push(`高地：远程射程与伤害提升${T.h[i] >= 2 ? '；被撞下去会摔伤' : ''}`);
      lines.push(cell.cx < DEPLOY_COLS ? `${leftLabel}部署区` : cell.cx >= GW - DEPLOY_COLS ? `${rightLabel}${deploySide === 1 ? '部署区' : '区域'}` : '中立区域');
      setHover({ x: p.x, y: p.y, text: lines });
    } else {
      a.setHover(null);
      setHover(null);
    }
  };

  /** Pointer released (act) or cancelled by the browser (don't). */
  const endPointer = (e: PointerEvent, act: boolean) => {
    const c = R.current;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (c.touches.delete(e.pointerId) && c.pinch) {
      if (c.touches.size < 2) {
        c.pinch = null;
        // A finger left on the screen carries on rotating; it never counts as a tap.
        const rest = [...c.touches.entries()][0];
        c.pointer = rest ? { id: rest[0], x: rest[1].x, y: rest[1].y, sx: 0, sy: 0, moved: true, button: 0 } : null;
      }
      return;
    }
    if (c.drag) {
      const d = c.drag;
      c.drag = null;
      setDragging(false);
      c.arena?.setHover(null);
      if (d.pos) {
        sfx('click');
        c.configKey = '';
        onDeployMove?.(d.uid, d.pos);
      }
    }
    const ptr = c.pointer?.id === e.pointerId ? c.pointer : null;
    if (!ptr) return;
    c.pointer = null;
    if (!act || ptr.moved) return;
    // Touch has no hover: a tap on the ground while deploying shows what that terrain does.
    if (c.aim === null && c.phase === 'deploy' && e.pointerType !== 'mouse') return terrainTip(local(e));
    if (c.aim === null) return;
    if (ptr.button === 2) return clearAim();
    if (ptr.button !== 0) return;
    const p = local(e);
    if (e.pointerType === 'mouse') fireAim(aimAt(p));
    else tapAim(p);
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Mouse wheels step ~100 px per notch; trackpad pinches (ctrlKey) send small deltas.
    let d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 800 : e.deltaY;
    if (e.ctrlKey) d *= 4;
    R.current.arena?.zoomBy(Math.exp(Math.max(-300, Math.min(300, d)) * 0.0009));
  };

  const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  const fighting = phase === 'fight';

  return (
    <div class={`screen arena-screen ${dragging ? 'dragging' : ''}`}>
      <div
        class="arena-host"
        ref={hostRef}
        onPointerDown={onPointerDown as never}
        onPointerMove={onPointerMove as never}
        onPointerUp={((e: PointerEvent) => endPointer(e, true)) as never}
        onPointerCancel={((e: PointerEvent) => endPointer(e, false)) as never}
        onMouseDown={(e) => e.button === 1 && e.preventDefault()}
        onPointerLeave={(e: PointerEvent) => {
          // A lifted finger "leaves" too; a tapped terrain tip stays until the next touch.
          if (e.pointerType !== 'mouse') return;
          R.current.arena?.setHover(null);
          setHover(null);
        }}
        onWheel={onWheel as never}
        onDblClick={() => R.current.arena?.resetView()}
      />
      {!ready && <div class="arena-loading blink">正在生成战场……</div>}
      {hover && !fighting && (
        <div class="terrain-tip" style={{ left: Math.min(hover.x + 18, stageSize.value.w - 240), top: Math.min(hover.y + 18, stageSize.value.h - 100) }}>
          {hover.text.map((t, i) => (
            <div key={i} class={i === 0 ? 'tt-head' : ''}>
              {t}
            </div>
          ))}
        </div>
      )}
      {!fighting && children}
      {fighting && hud && (
        <>
          <div class="bhud-top">
            <div class="bhud-side left">
              <div class="bhud-label">{leftLabel}</div>
              <div class="bhud-bar">
                <div class="fill blue" style={{ width: `${(hud.hp[0] / Math.max(1, hud.max[0])) * 100}%` }} />
              </div>
            </div>
            <div class="bhud-center">
              <div class="bhud-time">{fmt(hud.t)}</div>
              <div class="bhud-title">{title}</div>
            </div>
            <div class="bhud-side right">
              <div class="bhud-label">{rightLabel}</div>
              <div class="bhud-bar">
                <div class="fill red" style={{ width: `${(hud.hp[1] / Math.max(1, hud.max[1])) * 100}%` }} />
              </div>
            </div>
          </div>
          {hud.boss && (
            <div class="boss-bar">
              <div class="boss-name">
                {hud.boss.name}
                {hud.boss.shield && <span class="boss-armor"> · 凋灵护甲</span>}
              </div>
              <div class="boss-track">
                <div class="boss-fill" style={{ width: `${(hud.boss.hp / hud.boss.max) * 100}%` }} />
              </div>
            </div>
          )}
          {hud.sudden && stage === 'fight' && <div class="sudden blink">⚠ 末影风暴：所有单位持续流失生命</div>}
          <div class="bhud-cards left">
            {hud.cards.filter((c) => c.team === 0 && !mobDef(c.mob).structure).map((c, i) => <Chip key={i} c={c} />)}
          </div>
          <div class="bhud-cards right">
            {hud.cards.filter((c) => c.team === 1 && !mobDef(c.mob).structure).map((c, i) => <Chip key={i} c={c} />)}
          </div>
          <div class="bhud-ctrl">
            {[1, 2, 4].map((v) => (
              <button key={v} class={`spd ${speed === v ? 'on' : ''}`} onClick={() => (sfx('click'), updateSettings({ speed: v }))}>
                {v}×
              </button>
            ))}
            <button class="spd" onClick={() => (sfx('click'), setPaused(!paused))}>
              {paused ? '▶' : '❚❚'}
            </button>
            <button
              class="spd skip"
              disabled={stage !== 'fight'}
              onClick={() => {
                sfx('click');
                R.current.skip = true;
              }}
            >
              跳过 ▶▶
            </button>
          </div>
        </>
      )}
      {ready && stage !== 'end' && (
        <div class={`cam-bar ${fighting ? '' : 'deploy'}`}>
          {camMoved && (
            <button class="spd cam-reset" onClick={() => (sfx('click'), R.current.arena?.resetView())}>
              ⟲ 复位视角{!touchUI && <span class="cam-key">空格</span>}
            </button>
          )}
          <div class="cam-hint">{touchUI ? '单指拖动旋转 · 双指拖动平移 · 双指捏合缩放' : '左键拖动旋转 · 右键拖动 / WASD 平移 · 滚轮缩放'}</div>
        </div>
      )}
      {(fighting ? stage !== 'end' && (slots.length > 0 || skillKinds.length > 0) : skill?.id === 'build' && !!onBuild && ready) && (
        <div class={`hotbar ${fighting ? '' : 'deploy'}`}>
          {note && <div class="hb-hint warn">{note}</div>}
          {!note && aim !== null && <div class="hb-hint">{aimHint(aim, slots, golemCost, touchUI, pending)}</div>}
          {!note && aim === null && !fighting && <div class="hb-hint">布阵时就可以建造：点「圆石墙」或「土台」，再点我方半场的地面{touchUI ? '' : '（Q / E）'}</div>}
          <div class="hb-row">
            {skillKinds.length > 0 && (
              <div class="hb-skills">
                {skillKinds.map((k, si) => {
                  const info = SKILL_INFO[k];
                  const off = !skillReady(k);
                  return (
                    <Tip
                      key={k}
                      content={() => (
                        <div>
                          <div class="tt-title" style={{ color: info.color }}>
                            {info.name}
                          </div>
                          <div class="tt-line">{info.desc}</div>
                          {k === 'golem' && <div class="tt-sec tt-gold">费用：{golemCost ? `${golemCost} 绿宝石（战后结算）` : '免费（钟楼）'}</div>}
                          {k === 'tame' && <div class="tt-sec tt-gray">可驯服的敌人头顶会出现橙色爱心。首领和建筑不能驯服。</div>}
                          <div class="tt-sec tt-gray">统领技能 · 本场剩余 {skillLeft} 次</div>
                        </div>
                      )}
                    >
                      <button class={`hb-slot skill ${off ? 'used' : ''} ${aim?.k === 'skill' && aim.s === k ? 'aim' : ''}`} disabled={off} onClick={() => pickSkill(k)}>
                        <img src={url.icon(info.icon)} />
                        <span class="hb-key">{SKILL_KEYS[si]}</span>
                        {si === skillKinds.length - 1 && <span class="hb-count">{skillLeft}</span>}
                        {k === 'golem' && golemCost > 0 && (
                          <span class="hb-cost">
                            {golemCost}
                            <Emerald size={11} />
                          </span>
                        )}
                      </button>
                    </Tip>
                  );
                })}
              </div>
            )}
            {fighting &&
              slots.map((id, i) => (
                <Tip key={i} content={() => <PotionTipContent id={id} />}>
                  <button
                    class={`hb-slot ${i >= items.length ? 'temp' : ''} ${used[i] ? 'used' : ''} ${aim?.k === 'item' && aim.i === i ? 'aim' : ''}`}
                    disabled={used[i] || stage !== 'fight'}
                    onClick={() => pickSlot(i)}
                  >
                    <img src={itemIcon(id)} />
                    <span class="hb-key">{i + 1}</span>
                    {i >= items.length && <span class="hb-temp">限定</span>}
                  </button>
                </Tip>
              ))}
            {!fighting && builds.length > 0 && (
              <button class="hb-undo" onClick={() => (sfx('click'), (R.current.configKey = ''), onBuild?.(builds.slice(0, -1)))}>
                撤销
                <br />
                建造
              </button>
            )}
          </div>
        </div>
      )}
      {fighting && stage === 'intro' && (
        <div class="b-intro">
          {subtitle && <div class="b-sub">{subtitle}</div>}
          <div class="b-title">{title}</div>
          <div class="b-terrain">
            战场：{terrain.name}
            {terrain.effects.map((e) => (
              <div key={e} class="b-terrain-fx">
                {e}
              </div>
            ))}
          </div>
          <div class="b-count" key={count}>
            {count > 0 ? count : '开战!'}
          </div>
        </div>
      )}
      {fighting && stage === 'end' && winner !== null && !endText && (
        <div class={`b-result ${winner === 0 ? 'win' : 'lose'}`}>
          <div class="b-result-text">{winner === 0 ? '胜 利' : '失 败'}</div>
        </div>
      )}
      {fighting && stage === 'end' && winner !== null && endText && (
        <div class={`b-result side side${draw ? 'd' : winner}`}>
          <div class="b-result-text">{draw ? '平 局' : endText[winner]}</div>
        </div>
      )}
      {paused && stage === 'fight' && <div class="b-paused">已暂停</div>}
      {extraOverlay}
    </div>
  );
}

function aimHint(aim: Exclude<Aim, null>, slots: string[], golemCost: number, touch: boolean, pending: boolean) {
  if (touch && pending) return '再点一次圈内确认 · 点别处换位置 · 再点按钮取消';
  const cancel = touch ? '再点按钮取消' : '右键 / Esc 取消';
  if (aim.k === 'item') {
    const def = ITEM_MAP[slots[aim.i]];
    return `点击战场投放「${def?.name}」${def?.target === 'own' ? '（只能放在我方半场）' : ''} · ${cancel}`;
  }
  switch (aim.s) {
    case 'wall':
      return `点击我方半场砌一道 3 格长的墙（绿色可建，红色不行）· ${cancel}`;
    case 'platform':
      return `点击我方半场垫高一块 3×3 的土台（布阵时把远程拖上去）· ${cancel}`;
    case 'tame':
      return `点击头顶有橙色爱心的敌人驯服它 · ${cancel}`;
    case 'golem':
      return `点击我方半场召唤铁傀儡${golemCost ? `（战后支付 ${golemCost} 绿宝石）` : ''} · ${cancel}`;
  }
}

function Chip({ c }: { c: HudCard }) {
  const m = mobDef(c.mob);
  return (
    <div class={`chip r-${m.rarity} ${c.alive <= 0 ? 'dead' : ''}`}>
      <img src={url.mob(c.mob)} />
      <div class="chip-info">
        <div class="chip-name" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span>{m.name}</span>
          <Stars star={c.star} size="sm" />
        </div>
        <div class="chip-stat">
          <span>
            {c.alive}/{c.spawned}
          </span>
          <span class="chip-dmg">⚔ {Math.round(c.dmg)}</span>
        </div>
      </div>
    </div>
  );
}

export { BLOCK };
