import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Battle, DT, type BattleConfig, type BattleResult } from '../../battle/sim.ts';
import type { Arena3D } from '../../battle3d/arena3d.ts';
import { BLOCK, FEATURE_NAME, GW, SURFACE_INFO, applyBuild, buildCells, clampToDeploy, cloneTerrain, isBlocked, isIndestructible, type BuildOrder, type Terrain } from '../../battle/terrain.ts';
import { ARENA_W } from '../../battle/unit.ts';
import { canTame, type SkillKind } from '../../battle/skills.ts';
import { itemRadius } from '../../battle/items.ts';
import { ITEM_MAP } from '../../data/items.ts';
import { SKILL_INFO, type SkillId } from '../../data/commanders.ts';
import { Emerald, PotionTipContent, Tip, itemIcon } from '../components/common.tsx';
import { mobDef } from '../../data/mobs.ts';
import { preload, sheetFor, url } from '../assets.ts';
import { earnAchievement, settings, stageScale, updateSettings } from '../store.ts';
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
  children?: ComponentChildren;
}

/** What a click on the battlefield will do. */
type Aim = { k: 'item'; i: number } | { k: 'skill'; s: SkillKind } | null;

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
  terrain, config, configKey, phase, title, subtitle, boss, leftLabel = '我方', rightLabel = '敌方', onDeployMove, onFinish, items = [], temp = [],
  golemCost = 0, canPay = true, builds = [], onBuild, children,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [hud, setHud] = useState<Hud | null>(null);
  const [stage, setStage] = useState<'intro' | 'fight' | 'end'>('intro');
  const [count, setCount] = useState(3);
  const [winner, setWinner] = useState<0 | 1 | null>(null);
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; text: string[] } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Hotbar: which slots are spent (inventory then temp items) and what is being aimed. */
  const [used, setUsed] = useState<boolean[]>([]);
  const [aim, setAim] = useState<Aim>(null);
  const [note, setNote] = useState<string | null>(null);
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
    pointer: null as null | { x: number; y: number; moved: boolean; button: number },
    lastPreview: 0,
    configKey,
    aim: null as Aim,
    canUse: false,
  });
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return clearAim();
      const up = e.key.toUpperCase();
      const si = SKILL_KEYS.indexOf(up);
      if (si >= 0 && skillKinds[si]) return pickSkill(skillKinds[si]);
      const k = Number(e.key);
      if (k >= 1 && k <= slots.length) pickSlot(k - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
      arena.resize(1600, 900, stageScale.value);
      arena.setMode(phase === 'deploy' ? 'deploy' : 'battle');
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
            setHud(snapshot(b, c.max));
            sfx(b.winner === 0 ? 'victory' : 'defeat', { vol: 0.7 });
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
    });
    const unsub = stageScale.subscribe((v) => R.current.arena?.resize(1600, 900, v));
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      unsub();
      R.current.arena?.dispose();
      R.current.arena = null;
    };
  }, []);

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

  // ── pointer input ──
  const onPointerDown = (e: PointerEvent) => {
    const c = R.current;
    const p = local(e);
    if (c.aim !== null && c.arena) {
      // Aiming: left click uses it, right click cancels.
      if (e.button === 2) return clearAim();
      if (e.button !== 0) return;
      const A = c.aim;
      if (A.k === 'skill' && A.s === 'tame') {
        const u = c.arena.pickUnit(p.x, p.y, 1, 60);
        if (!u || !c.battle || !canTame(c.battle, 0, u)) return flash(u ? `${u.mob.name} 的生命还太高（门槛见按钮说明）` : '点一个敌人');
        c.battle.useSkill(0, 'tame', 0, 0, u);
        clearAim();
        return;
      }
      const cell = c.arena.pickCell(p.x, p.y);
      if (!cell) return;
      if (A.k === 'item') useSlot(A.i, cell.x, cell.y);
      else if (A.s === 'wall' || A.s === 'platform') doBuild(A.s, cell.x, cell.y);
      else if (A.s === 'golem') {
        if (!c.battle?.useSkill(0, 'golem', cell.x, cell.y)) flash('只能召唤在我方半场');
        else clearAim();
      }
      return;
    }
    c.pointer = { x: p.x, y: p.y, moved: false, button: e.button };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (c.phase === 'deploy' && e.button === 0 && c.arena && onDeployMove) {
      const u = c.arena.pickUnit(p.x, p.y, 0);
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
    if (c.aim !== null) {
      const A = c.aim;
      const cell = a.pickCell(p.x, p.y);
      if (A.k === 'item') {
        const id = slots[A.i];
        const def = ITEM_MAP[id];
        if (!cell || !def || !c.battle) a.setAim(null);
        else a.setAim({ x: cell.x, y: cell.y }, itemRadius(c.battle, 0, id), def.target !== 'own' || cell.x < ARENA_W / 2, def.color);
      } else if (A.s === 'wall' || A.s === 'platform') {
        if (!cell || !c.battle) a.setCells(null);
        else {
          const cells = buildCells(c.battle.terrain, 0, A.s, cell.x, cell.y);
          let ok = cells.length > 0;
          if (ok && A.s === 'wall') ok = !!applyBuild(cloneTerrain(c.battle.terrain), 0, 'wall', cell.x, cell.y);
          a.setCells(cells.length ? cells : null, ok, A.s === 'wall' ? 2 : c.battle.has(0, 'obsidian') ? 2 : 1);
        }
      } else if (A.s === 'golem') {
        if (!cell) a.setAim(null);
        else a.setAim({ x: cell.x, y: cell.y }, 1.2, cell.x < ARENA_W / 2, '#e8e4dc');
      } else if (A.s === 'tame' && c.battle) {
        const u = a.pickUnit(p.x, p.y, 1, 60);
        if (!u) a.setAim(null);
        else a.setAim({ x: u.x, y: u.y }, Math.max(0.8, (u.radius / BLOCK) * 1.6), canTame(c.battle, 0, u), '#ff9a3d');
      }
      if (!c.pointer) return;
    }
    if (c.pointer) {
      const dx = p.x - c.pointer.x;
      const dy = p.y - c.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) c.pointer.moved = true;
      if (!c.drag) {
        a.orbit(dx, dy);
        c.pointer.x = p.x;
        c.pointer.y = p.y;
        return;
      }
    }
    if (c.phase !== 'deploy') return;
    const cell = a.pickCell(p.x, p.y);
    if (c.drag) {
      if (!cell) return;
      const [x, y] = clampToDeploy(0, cell.x, cell.y);
      const ok = cell.cx < 15 && !isBlocked(terrain, cell.cx, cell.cy);
      a.setHover({ cx: Math.min(14, cell.cx), cy: cell.cy }, ok);
      c.drag.pos = [x, y];
      // Live preview: move this squad's units (throttled rebuild).
      const now = performance.now();
      if (now - c.lastPreview > 90) {
        c.lastPreview = now;
        const cfg: BattleConfig = { ...config, sides: [{ ...config.sides[0], cards: config.sides[0].cards.map((k) => (k.uid === c.drag!.uid ? { ...k, anchor: [x, y] } : k)) }, config.sides[1]] };
        const b = new Battle(cfg);
        c.battle = b;
        a.setBattle(b);
      }
      return;
    }
    if (cell) {
      a.setHover(cell, cell.cx < 15);
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
      lines.push(cell.cx < 15 ? '我方部署区' : cell.cx >= GW - 15 ? '敌方区域' : '中立区域');
      setHover({ x: p.x, y: p.y, text: lines });
    } else {
      a.setHover(null);
      setHover(null);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const c = R.current;
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
    c.pointer = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    R.current.arena?.zoomBy(e.deltaY > 0 ? 1.08 : 0.93);
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
        onPointerUp={onPointerUp as never}
        onPointerLeave={() => {
          R.current.arena?.setHover(null);
          setHover(null);
        }}
        onWheel={onWheel as never}
        onDblClick={() => R.current.arena?.resetView()}
      />
      {!ready && <div class="arena-loading blink">正在生成战场……</div>}
      {hover && !fighting && (
        <div class="terrain-tip" style={{ left: Math.min(hover.x + 18, 1360), top: Math.min(hover.y + 18, 800) }}>
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
          <div class="cam-hint">拖动旋转视角 · 滚轮缩放 · 双击复位</div>
        </>
      )}
      {(fighting ? stage !== 'end' && (slots.length > 0 || skillKinds.length > 0) : skill?.id === 'build' && !!onBuild && ready) && (
        <div class={`hotbar ${fighting ? '' : 'deploy'}`}>
          {note && <div class="hb-hint warn">{note}</div>}
          {!note && aim !== null && <div class="hb-hint">{aimHint(aim, slots, golemCost)}</div>}
          {!note && aim === null && !fighting && <div class="hb-hint">布阵时就可以建造：点「圆石墙」或「土台」，再点我方半场的地面（Q / E）</div>}
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
      {fighting && stage === 'end' && winner !== null && (
        <div class={`b-result ${winner === 0 ? 'win' : 'lose'}`}>
          <div class="b-result-text">{winner === 0 ? '胜 利' : '失 败'}</div>
        </div>
      )}
      {paused && stage === 'fight' && <div class="b-paused">已暂停</div>}
    </div>
  );
}

function aimHint(aim: Exclude<Aim, null>, slots: string[], golemCost: number) {
  if (aim.k === 'item') {
    const def = ITEM_MAP[slots[aim.i]];
    return `点击战场投放「${def?.name}」${def?.target === 'own' ? '（只能放在我方半场）' : ''} · 右键 / Esc 取消`;
  }
  switch (aim.s) {
    case 'wall':
      return '点击我方半场砌一道 3 格长的墙（绿色可建，红色不行）· 右键 / Esc 取消';
    case 'platform':
      return '点击我方半场垫高一块 3×3 的土台（布阵时把远程拖上去）· 右键 / Esc 取消';
    case 'tame':
      return '点击头顶有橙色爱心的敌人驯服它 · 右键 / Esc 取消';
    case 'golem':
      return `点击我方半场召唤铁傀儡${golemCost ? `（战后支付 ${golemCost} 绿宝石）` : ''} · 右键 / Esc 取消`;
  }
}

function Chip({ c }: { c: HudCard }) {
  const m = mobDef(c.mob);
  return (
    <div class={`chip r-${m.rarity} ${c.alive <= 0 ? 'dead' : ''}`}>
      <img src={url.mob(c.mob)} />
      <div class="chip-info">
        <div class="chip-name">
          {m.name}
          <span class="stars"> {'★'.repeat(c.star)}</span>
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
