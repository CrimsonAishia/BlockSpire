import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { CRATE_MAP, GRADE_INFO, gradeOdds, type CrateGrade } from '../../data/crates.ts';
import { RARITY_INFO, mobDef } from '../../data/mobs.ts';
import { RARITIES, type Rarity } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, MobCard } from '../components/common.tsx';
import { settings } from '../store.ts';
import { sfx, tickPitch } from '../../audio/audio.ts';
import { RichText } from '../components/rich.tsx';

const ITEM = 150;
const GAP = 8;
const STEP = ITEM + GAP;
const WIN_INDEX = 46;
const COUNT = 54;
const VIEW = 1400;

export interface RevealInfo {
  headline: string;
  detail?: string;
  tone: 'new' | 'merge' | 'star' | 'dust' | 'decide';
}

interface Props {
  crate: string;
  grade: CrateGrade;
  mob: string;
  lucky?: boolean;
  title?: string;
  act: number;
  /** Applies the result to game state and returns what happened (called once at reveal). */
  onReveal: () => RevealInfo | null;
  onContinue: () => void;
  autoStart?: boolean;
  extra?: ComponentChildren;
  /** Restrict the displayed pool (e.g. starter crates). */
  pool?: string[];
  /** Result was already applied (e.g. page reload mid-reveal): skip straight to the reveal. */
  startRevealed?: boolean;
  /** Back to the crate choice (only before opening). */
  onBack?: () => void;
}

export function CrateOpen({ crate, grade, mob, lucky, title, act, onReveal, onContinue, autoStart, extra, pool, startRevealed, onBack }: Props) {
  const base = CRATE_MAP[crate];
  const def = useMemo(() => {
    if (!pool) return base;
    const filtered = Object.fromEntries(RARITIES.map((r) => [r, base.pool[r].filter((m) => pool.includes(m))])) as typeof base.pool;
    return { ...base, pool: filtered };
  }, [crate, pool?.join()]);
  const [stage, setStage] = useState<'ready' | 'opening' | 'spin' | 'reveal'>(startRevealed ? 'reveal' : autoStart ? 'opening' : 'ready');
  const [info, setInfo] = useState<RevealInfo | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const revealed = useRef(false);
  /** The roll was skipped (setting or click): the strip is not shown behind the result. */
  const [skipped, setSkipped] = useState(false);
  const skipTo = useRef<(() => void) | null>(null);
  const rarity = mobDef(mob).rarity;

  // Visual strip: weighted random filler with the real result planted at WIN_INDEX.
  const items = useMemo(() => {
    const odds = gradeOdds(grade, act);
    const out: string[] = [];
    for (let i = 0; i < COUNT; i++) {
      if (i === WIN_INDEX) {
        out.push(mob);
        continue;
      }
      let r: Rarity = 'blue';
      let tries = 0;
      do {
        let x = Math.random() * odds.reduce((a, b) => a + b, 0);
        r = RARITIES.find((_, k) => (x -= odds[k]) <= 0) ?? 'blue';
        tries++;
      } while (def.pool[r].length === 0 && tries < 20);
      if (def.pool[r].length === 0) r = RARITIES.find((k) => def.pool[k].length) ?? 'purple';
      // Tease: put a high-rarity item right next to the winner sometimes.
      if ((i === WIN_INDEX + 1 || i === WIN_INDEX - 1) && Math.random() < 0.45) {
        const hi = (['gold', 'red', 'pink'] as Rarity[]).find((k) => def.pool[k].length);
        if (hi) r = hi;
      }
      const pool = def.pool[r];
      out.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return out;
  }, [crate, mob]);

  const start = () => {
    if (stage !== 'ready') return;
    sfx('door');
    if (settings.value.spin === 'skip') {
      setSkipped(true);
      setStage('reveal');
    } else setStage('opening');
  };

  /** Jumps a running roll to its end. */
  const skip = () => {
    if (stage === 'opening') {
      setSkipped(true);
      setStage('reveal');
    } else if (stage === 'spin') skipTo.current?.();
  };

  useEffect(() => {
    if (stage === 'opening') {
      if (settings.value.spin === 'skip') {
        setSkipped(true);
        setStage('reveal');
        return;
      }
      const t = setTimeout(() => setStage('spin'), autoStart ? 150 : 650);
      return () => clearTimeout(t);
    }
    if (stage !== 'spin') return;
    const el = stripRef.current!;
    const fast = settings.value.spin !== 'full';
    const dur = fast ? 2300 : 5600;
    const jitter = (Math.random() - 0.5) * (ITEM * 0.78);
    // The window is narrower on the compact (phone) stage.
    const view = el.parentElement?.offsetWidth || VIEW;
    const target = WIN_INDEX * STEP + ITEM / 2 - view / 2 + jitter;
    const t0 = performance.now();
    let lastIdx = -1;
    let raf = 0;
    let done = false;
    const ease = (t: number) => 1 - Math.pow(1 - t, 4.2);
    skipTo.current = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      el.style.transform = `translate3d(${-target}px,0,0)`;
      setStage('reveal');
    };
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const pos = target * ease(t);
      el.style.transform = `translate3d(${-pos}px,0,0)`;
      const idx = Math.floor((pos + view / 2) / STEP);
      if (idx !== lastIdx) {
        lastIdx = idx;
        tickPitch(idx);
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else
        setTimeout(() => {
          if (done) return;
          done = true;
          setStage('reveal');
        }, 350);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== 'reveal' || revealed.current) return;
    revealed.current = true;
    if (!startRevealed) sfx(`reveal_${rarity}`);
    setInfo(onReveal());
  }, [stage]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (stage === 'ready') start();
        else if (stage === 'opening' || stage === 'spin') skip();
        else if (stage === 'reveal' && info && info.tone !== 'decide') onContinue();
      } else if (e.code === 'Escape' && stage === 'ready' && onBack) onBack();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [stage, info]);

  const odds = gradeOdds(grade, act);
  const total = odds.reduce((a, b) => a + b, 0);

  return (
    <div class="screen crate-screen">
      <div class="crate-bg" style={{ '--cc': def.color } as never} />
      <div class="crate-head">
        <div class="crate-title title-shadow">{title ?? def.name}</div>
        <div class="crate-sub">
          {def.name} · <span style={{ color: GRADE_INFO[grade].color }}>{GRADE_INFO[grade].name}</span>
        </div>
      </div>

      {(stage === 'ready' || stage === 'opening') && (
        <div class={`crate-ready ${stage === 'opening' ? 'opening' : ''}`}>
          <img class="crate-art float" src={url.crate(crate)} />
          <div class="crate-odds">
            {RARITIES.map((r, i) =>
              odds[i] > 0 && def.pool[r].length ? (
                <div key={r} class={`odd r-${r}`}>
                  <span class="dot" />
                  {RARITY_INFO[r].name} <b>{((odds[i] / total) * 100).toFixed(odds[i] / total < 0.01 ? 1 : 0)}%</b>
                </div>
              ) : null,
            )}
          </div>
          <div class="crate-pool">
            {RARITIES.flatMap((r) =>
              def.pool[r].map((m) => (
                <div key={m} class={`pool-item r-${r}`} title={mobDef(m).name}>
                  <img src={url.mob(m)} />
                </div>
              )),
            )}
          </div>
          {stage === 'ready' && (
            <div class="row gap16 center">
              {onBack && (
                <Btn size="big" onClick={onBack}>
                  ← 换一个箱子 <span class="kbd">Esc</span>
                </Btn>
              )}
              <Btn variant="gold" size="big" onClick={start}>
                开启补给箱 <span class="kbd">空格</span>
              </Btn>
            </div>
          )}
        </div>
      )}

      {(stage === 'spin' || (stage === 'reveal' && !skipped)) && (
        <div class={`spinner ${stage === 'reveal' ? 'done' : ''}`} onClick={skip} title={stage === 'spin' ? '点击跳过' : undefined}>
          <div class="spin-window">
            <div class="spin-strip" ref={stripRef}>
              {items.map((m, i) => {
                const md = mobDef(m);
                return (
                  <div key={i} class={`spin-item r-${md.rarity} ${stage === 'reveal' && i === WIN_INDEX ? 'win' : ''}`}>
                    <img src={url.mob(m)} />
                    <div class="spin-name">{md.name}</div>
                  </div>
                );
              })}
            </div>
            <div class="spin-marker" />
            <div class="spin-fade left" />
            <div class="spin-fade right" />
          </div>
          {stage === 'spin' && <div class="spin-skip faint">点击或按空格跳过</div>}
        </div>
      )}

      {stage === 'reveal' && (
        <div class={`reveal r-${rarity}`}>
          <div class="reveal-rays" />
          <div class="reveal-body">
            <div class="reveal-rar rc">
              {rarity === 'gold' ? '★ 罕见特殊物品 ★' : RARITY_INFO[rarity].name}
              {lucky && <span class="lucky"> · 幸运升档!</span>}
            </div>
            <div class="reveal-card">
              <MobCard mob={mob} size="lg" tip={false} />
            </div>
            <div class="reveal-skill">
              <div class="rs-name">【{mobDef(mob).skill.name}】</div>
              <div class="rs-desc">
                <RichText text={mobDef(mob).skill.desc} />
              </div>
              <div class="rs-star3">★3：{mobDef(mob).star3}</div>
            </div>
            {info && (
              <div class={`reveal-info ${info.tone}`}>
                <div class="ri-head">{info.headline}</div>
                {info.detail && <div class="ri-detail">{info.detail}</div>}
              </div>
            )}
            {extra}
            {info && info.tone !== 'decide' && (
              <Btn variant="green" size="big" onClick={onContinue}>
                继续 <span class="kbd">空格</span>
              </Btn>
            )}
            {info && info.tone === 'decide' && (
              <Btn variant="purple" size="big" onClick={onContinue}>
                安排卡牌…
              </Btn>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
