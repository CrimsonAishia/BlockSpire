import type { ButtonHTMLAttributes, ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { sfx } from '../../audio/audio.ts';
import { hideTips, stageScale, stageSize, tipStack, tooltip } from '../store.ts';
import { url } from '../assets.ts';
import { FAMILIES } from '../../data/families.ts';
import type { Card, Family } from '../../core/types.ts';
import { COMMANDER_MAP, ITEM_KIND_NAME, enchantName, enchantText, ITEM_TIER_INFO, POTION_MAP, RELIC_MAP, RELIC_TIER_INFO } from '../../data/items.ts';
import { MOB_TACTIC, RARITY_INFO, ROLE_INFO, ROLE_TACTIC, mobDef, starStatMul, unitCount } from '../../data/mobs.ts';
import { KeywordBox, RichText } from './rich.tsx';
import { CHARGE_RULE, combosOf, countersOf } from '../../data/combos.ts';
import { sigilOfMob, sigilRoman, sigilTierName, sigilDesc } from '../../data/sigils.ts';

// ───────────────────────── Button ─────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'green' | 'gold' | 'red' | 'purple' | 'blue' | '';
  size?: 'small' | 'tiny' | 'big' | '';
  wide?: boolean;
  sound?: string;
  disabled?: boolean;
};

export function Btn({ variant = '', size = '', wide, sound = 'click', class: cls, onClick, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      class={`mc-btn ${variant} ${size} ${wide ? 'wide' : ''} ${cls ?? ''}`}
      onMouseEnter={() => !rest.disabled && sfx('hover', { vol: 0.25 })}
      onClick={(e) => {
        if (rest.disabled) return;
        if (sound) sfx(sound);
        onClick?.(e as never);
      }}
    >
      {children}
    </button>
  );
}

/** The game's source repository. */
export const UPSTREAM_REPO_URL = 'https://github.com/moonwesif/BlockSpire';
export const REPO_URL = 'https://github.com/CrimsonAishia/BlockSpire';

/** A button-styled link to the GitHub repository (opens a new tab). */
export function GitHubLink({ label = 'GitHub', href = REPO_URL, size = 'small', class: cls }: { label?: string; href?: string; size?: string; class?: string }) {
  return (
    <a
      class={`mc-btn gh-btn ${size} ${cls ?? ''}`}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="在 GitHub 上查看源码"
      onMouseEnter={() => sfx('hover', { vol: 0.25 })}
      onClick={() => sfx('click')}
    >
      <svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true">
        <path
          fill="currentColor"
          d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
        />
      </svg>
      {label}
    </a>
  );
}

// ───────────────────────── Tooltip ─────────────────────────

function stagePoint(e: MouseEvent) {
  const st = document.querySelector('.stage') as HTMLElement | null;
  if (!st) return { x: e.clientX, y: e.clientY };
  const r = st.getBoundingClientRect();
  const s = stageScale.value;
  return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
}

// The tooltip follows the mouse by moving its element directly: re-rendering on every
// mousemove made it jump between the default and the edge-corrected spot each frame.
let tipEl: HTMLDivElement | null = null;
const tipAt = { x: 0, y: 0 };
let tipSeq = 0;

// Touch: there is no hover. A long press shows a tip (and swallows the tap it would have been);
// a tap shows it too when the thing isn't a button. The next touch anywhere else closes it.
let touchAt = -1e9;
/** The tip shown by touch, and the one a touch just closed (so tapping it again toggles it off). */
let touchTip = 0;
let closedTip = 0;
window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType === 'mouse') return;
    touchAt = performance.now();
    closedTip = 0;
    if (touchTip && !(e.target as Element | null)?.closest?.('.mc-tip')) {
      closedTip = touchTip;
      touchTip = 0;
      hideTips();
    }
  },
  true,
);
window.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && (touchAt = performance.now()), true);
/** Mouse events the browser fakes after a touch. */
const fromTouch = () => performance.now() - touchAt < 900;
/** Nested tips see the same event: only the innermost one handles it. */
const claim = (e: Event) => {
  const ev = e as Event & { tipClaimed?: boolean };
  if (ev.tipClaimed) return false;
  ev.tipClaimed = true;
  return true;
};
/** Whether a tap lands on something that does its own thing (a button, a clickable card...). */
function interactive(el: Element | null) {
  for (; el && !el.classList.contains('stage'); el = el.parentElement) {
    if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) || getComputedStyle(el).cursor === 'pointer') return true;
  }
  return false;
}

function placeTip() {
  const el = tipEl;
  if (!el) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const { w: sw, h: sh } = stageSize.value;

  // 1. Horizontal: start at the right side of the cursor with safe clearance
  const rightX = tipAt.x + 24;
  const leftX = tipAt.x - w - 16;
  let x: number;
  if (rightX + w <= sw - 10) {
    x = rightX;
  } else if (leftX >= 8) {
    x = leftX;
  } else {
    // If neither strictly fits, place where there's more room
    x = tipAt.x > sw / 2 ? Math.max(8, leftX) : Math.min(sw - w - 10, rightX);
  }

  // 2. Vertical: prefer below the cursor, flip above if overflowing bottom
  const belowY = tipAt.y + 14;
  const aboveY = tipAt.y - h - 14;
  let y: number;
  if (belowY + h <= sh - 10) {
    y = belowY;
  } else if (aboveY >= 8) {
    y = aboveY;
  } else {
    y = Math.max(8, sh - h - 10);
  }

  // 3. Collision guard: ensure the mouse cursor never falls inside the tooltip box
  const cursorPadding = 2;
  if (
    tipAt.x >= x - cursorPadding &&
    tipAt.x <= x + w + cursorPadding &&
    tipAt.y >= y - cursorPadding &&
    tipAt.y <= y + h + cursorPadding
  ) {
    if (tipAt.x + 28 + w <= sw - 8) {
      x = tipAt.x + 28;
    } else if (tipAt.x - w - 16 >= 8) {
      x = tipAt.x - w - 16;
    } else if (aboveY >= 8) {
      y = aboveY;
    }
  }

  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

/** Shows the innermost hovered tip (leaving a keyword inside a card brings the card's back). */
function showTop() {
  const top = tipStack[tipStack.length - 1];
  tooltip.value = top ? { x: tipAt.x, y: tipAt.y, content: top.content() } : null;
}

function dropTip(id: number) {
  const i = tipStack.findIndex((t) => t.id === id);
  if (i < 0) return false;
  tipStack.splice(i, 1);
  return true;
}

export function Tip({ content, children, class: cls, style }: { content: () => ComponentChildren; children: ComponentChildren; class?: string; style?: CSSProperties }) {
  const id = useRef(0);
  if (!id.current) id.current = ++tipSeq;
  const latest = useRef(content);
  latest.current = content;
  const press = useRef<{ timer: number; x: number; y: number; shown: boolean } | null>(null);
  useEffect(
    () => () => {
      if (press.current) clearTimeout(press.current.timer);
      if (dropTip(id.current)) showTop();
    },
    [],
  );
  const show = (p: { x: number; y: number }, touch: boolean) => {
    Object.assign(tipAt, p);
    dropTip(id.current);
    tipStack.push({ id: id.current, content: () => latest.current() });
    if (touch) {
      // Only this tip: an outer card's tip would otherwise show instead of the keyword pressed.
      tipStack.splice(0, tipStack.length - 1);
      touchTip = id.current;
    }
    showTop();
  };
  const cancelPress = () => {
    if (press.current && !press.current.shown) clearTimeout(press.current.timer);
  };
  return (
    <div
      class={cls}
      style={style}
      onMouseEnter={(e) => {
        if (!fromTouch()) show(stagePoint(e as MouseEvent), false);
      }}
      onMouseMove={(e) => {
        if (fromTouch()) return;
        Object.assign(tipAt, stagePoint(e as MouseEvent));
        placeTip();
      }}
      onMouseLeave={() => {
        if (!fromTouch() && dropTip(id.current)) showTop();
      }}
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' || !claim(e)) return;
        const p = stagePoint(e as unknown as MouseEvent);
        press.current = { x: e.clientX, y: e.clientY, shown: false, timer: window.setTimeout(() => {
          if (!press.current) return;
          press.current.shown = true;
          show(p, true);
        }, 420) };
      }}
      onPointerMove={(e) => {
        const P = press.current;
        if (P && !P.shown && Math.hypot(e.clientX - P.x, e.clientY - P.y) > 10) cancelPress();
      }}
      onPointerUp={cancelPress}
      onPointerCancel={cancelPress}
      onClickCapture={(e) => {
        // The tap that ends a long press only shows the tip.
        if (press.current?.shown) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
      onClick={(e) => {
        const longPress = !!press.current?.shown;
        press.current = null;
        if (longPress || !claim(e)) return;
        if (!fromTouch()) return hideTips();
        // A tap: buttons and clickable cards act as usual; anything else shows its tip (a second tap closes it).
        if (interactive(e.target as Element) || closedTip === id.current) return hideTips();
        show(stagePoint(e as MouseEvent), true);
      }}
    >
      {children}
    </div>
  );
}

export function TooltipLayer() {
  const t = tooltip.value;
  // Position before the browser paints, so a new tip never flashes at the wrong spot.
  useLayoutEffect(() => placeTip());
  if (!t) return null;
  return (
    <div
      ref={(el) => {
        tipEl = el;
        if (el) placeTip();
      }}
      class={`mc-tip ${touchTip ? 'touch' : ''}`}
      style={{ position: 'absolute' }}
    >
      {t.content}
    </div>
  );
}

// ───────────────────────── Icons ─────────────────────────

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

export function HeartIcon({ state = 'full', size = 22 }: { state?: 'full' | 'empty' | 'gold'; size?: number }) {
  const fill = state === 'full' ? '#e8262a' : state === 'gold' ? '#ffcc33' : '#4a3a52';
  const hi = state === 'full' ? '#ff9a9a' : state === 'gold' ? '#fff3b0' : '#5e4c68';
  return (
    <svg width={size} height={(size * 6) / 7} viewBox="-1 -1 9 8" shape-rendering="crispEdges">
      {HEART.map((row, y) =>
        [...row].map((ch, x) =>
          ch === 'X' ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={x === 1 && y === 1 ? hi : fill} stroke="#000" stroke-width={0} /> : null,
        ),
      )}
      <path d="M1 -0.5h2v1h1v-1h2v1h1v3h-1v1h-1v1h-1v1h-1v-1h-1v-1h-1v-1h-1v-3h1z" fill="none" stroke="#000" stroke-width="1" opacity="0.9" transform="translate(0,0)" />
    </svg>
  );
}

export function Hearts({ hearts, max }: { hearts: number; max: number }) {
  return (
    <div class="hearts">
      {Array.from({ length: max }, (_, i) => (
        <HeartIcon key={i} state={i < hearts ? 'full' : 'empty'} />
      ))}
    </div>
  );
}

export function Emerald({ n, size = 22 }: { n?: number; size?: number }) {
  return (
    <span class="row gap4" style={{ display: 'inline-flex' }}>
      <img src={url.icon('emerald')} width={size} height={size} class="pixelated" />
      {n !== undefined && <span class="em">{n}</span>}
    </span>
  );
}

export function StarIcon({ type }: { type: 'mastery' | 'normal' | 'off' }) {
  if (type === 'mastery') {
    return (
      <svg class="star-svg mastery" viewBox="0 0 24 24" width="1em" height="1em" fill="none">
        <defs>
          <linearGradient id="starMasteryGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ff7675" />
            <stop offset="35%" stop-color="#fd79a8" />
            <stop offset="70%" stop-color="#a29bfe" />
            <stop offset="100%" stop-color="#74b9ff" />
          </linearGradient>
          <radialGradient id="starMasteryCore" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#ffffff" />
            <stop offset="55%" stop-color="#ffeaa7" />
            <stop offset="100%" stop-color="#e056fd" />
          </radialGradient>
        </defs>
        {/* Radiant major 4-point diamond rays */}
        <polygon points="12,1 14.8,9.2 23,12 14.8,14.8 12,23 9.2,14.8 1,12 9.2,9.2" fill="url(#starMasteryGrad)" />
        {/* Diagonal facets giving 8-point celestial diamond star */}
        <polygon points="12,4.5 16.5,7.5 19.5,12 16.5,16.5 12,19.5 7.5,16.5 4.5,12 7.5,7.5" fill="#ffffff" opacity="0.32" />
        {/* Inner radiant crystal core */}
        <polygon points="12,5.5 15,12 12,18.5 9,12" fill="url(#starMasteryCore)" />
        {/* Center shining jewel */}
        <circle cx="12" cy="12" r="2.2" fill="#ffffff" />
      </svg>
    );
  }
  if (type === 'normal') {
    return (
      <svg class="star-svg normal" viewBox="0 0 24 24" width="1em" height="1em" fill="none">
        <defs>
          <linearGradient id="starNormalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#fff275" />
            <stop offset="45%" stop-color="#ffd700" />
            <stop offset="100%" stop-color="#e67e22" />
          </linearGradient>
        </defs>
        <polygon
          points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
          fill="url(#starNormalGrad)"
          stroke="#b7791f"
          stroke-width="0.8"
          stroke-linejoin="round"
        />
        <polygon
          points="12,5 13.8,9.5 18,10.2 15,13.5 15.8,17.5 12,15.5"
          fill="#ffffff"
          opacity="0.38"
        />
      </svg>
    );
  }
  return (
    <svg class="star-svg off" viewBox="0 0 24 24" width="1em" height="1em" fill="none">
      <polygon
        points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"
        fill="#26222d"
        stroke="#4a4352"
        stroke-width="0.8"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function Stars({
  star = 1,
  mastery,
  max = 3,
  size,
  className = '',
}: {
  star?: number;
  mastery?: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const mRank = mastery ?? (star > 3 ? Math.min(3, star - 3) : 0);
  const baseStar = Math.min(max, star > 3 ? 3 : star);
  return (
    <span
      class={`stars ${size ?? ''} ${className}`}
      title={mRank > 0 ? `★3 进阶 +${mRank} (${mRank}颗新星覆盖)` : `★${baseStar}`}
    >
      {Array.from({ length: max }, (_, idx) => {
        const i = idx + 1;
        const type: 'mastery' | 'normal' | 'off' = mRank >= i ? 'mastery' : baseStar >= i ? 'normal' : 'off';
        return <StarIcon key={i} type={type} />;
      })}
    </span>
  );
}

export function FamBadge({ f, count, active }: { f: Family; count?: number; active?: boolean }) {
  const d = FAMILIES[f];
  return (
    <span class="fam" style={{ '--fc': d.color, opacity: active === false ? 0.45 : 1 } as CSSProperties}>
      {d.glyph} {d.name}
      {count !== undefined && ` ${count}`}
    </span>
  );
}

// ───────────────────────── Tooltip contents ─────────────────────────

export function MobTipContent({
  mob,
  star = 1,
  enchant,
  enchantLv,
  bonus,
  sigil,
  sigilStar = 1,
  mastery,
  netherite,
  enchant2,
  enchant2Lv,
  showStar3 = true,
}: {
  mob: string;
  star?: number;
  enchant?: string;
  enchantLv?: number;
  bonus?: number;
  sigil?: string;
  sigilStar?: number;
  mastery?: number;
  netherite?: boolean;
  enchant2?: string;
  enchant2Lv?: number;
  showStar3?: boolean;
}) {
  const m = mobDef(mob);
  const r = RARITY_INFO[m.rarity];
  const masteryHpMul = mastery ? 1 + mastery * 0.10 : 1;
  const masteryAtkMul = mastery ? 1 + mastery * 0.08 : 1;
  const mul = starStatMul(m, star) * (1 + (bonus ?? 0));
  const n = unitCount(m, star);
  const sDef = sigil ? sigilOfMob(sigil) : null;
  return (
    <div>
      <div class="tt-title" style={{ color: r.color, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{m.name}</span>
        <Stars star={star} mastery={mastery} />
      </div>
      <div class="tt-gray">
        {r.name} · {ROLE_INFO[m.role].icon} {ROLE_INFO[m.role].name} · 出战 ×{n}
      </div>
      {m.families.length > 0 && <div class="tt-line">羁绊：{m.families.map((f) => FAMILIES[f].name).join(' / ')}</div>}
      <div class="tt-sec tt-line">
        生命 <span class="tt-green">{Math.round(m.hp * mul * masteryHpMul)}</span> · 攻击 <span class="tt-red">{Math.round(m.atk * mul * masteryAtkMul)}</span> · 间隔 {m.cd}s
      </div>
      <div class="tt-line">
        {m.range >= 60 ? `射程 ${m.range}` : '近战'} · 移速 {m.speed}
        {m.armor > 0 && ` · 护甲 ${Math.round(m.armor * 100)}%`}
        {m.flying && ' · 飞行'}
      </div>
      <div class="tt-sec">
        <span class="tt-gold">【{m.skill.name}】</span>
        <span class="tt-line">
          <RichText text={m.skill.desc} tips={false} />
        </span>
      </div>
      {showStar3 && m.star3 && (
        <div class="tt-sec">
          <span class={star >= 3 ? 'tt-yellow' : 'tt-gray'}>★3：{m.star3}</span>
        </div>
      )}
      <KeywordBox texts={[m.skill.desc, m.star3]} />
      {netherite && (
        <div class="tt-sec" style={{ color: '#ffbe76' }}>
          【下界合金武装】受控时间缩短 30%，护甲 +5%，已开启第二附魔槽位！
        </div>
      )}
      {enchant && (
        <div class="tt-sec tt-purple">
          {enchant2 ? '第一附魔 · ' : ''}{enchantName(enchant, enchantLv)}：{enchantText(enchant, enchantLv)}
        </div>
      )}
      {enchant2 && (
        <div class="tt-sec" style={{ color: '#f368e0' }}>
          第二附魔 · {enchantName(enchant2, enchant2Lv)}：{enchantText(enchant2, enchant2Lv)}
        </div>
      )}
      {bonus ? <div class="tt-aqua">永久强化 +{Math.round(bonus * 100)}%</div> : null}
      {mastery ? <div class="tt-gold">极阶突破 +{mastery}：生命 +{mastery * 10}% · 攻击 +{mastery * 8}%</div> : null}
      {sigil && (
        <div class="tt-sec" style={{ color: '#a29bfe' }}>
          【融合印记 · {sDef?.name ?? `${mobDef(sigil).name}之印`} · {sigilRoman(sigilStar)}阶({sigilTierName(sigilStar)})】
          <div class="tt-line" style={{ color: '#dff9fb', fontSize: 12 }}>{sigilDesc(sigil, sigilStar)}</div>
          {sigilStar < 3 && (
            <div class="tt-line faint" style={{ fontSize: 11, color: '#a29bfe', marginTop: 3 }}>
              下一阶预览：{sigilDesc(sigil, sigilStar + 1)}
            </div>
          )}
        </div>
      )}
      <div class="tt-sec tt-line">
        <span class="tt-aqua">战术</span> {MOB_TACTIC[m.id] ?? ROLE_TACTIC[m.role]}
      </div>
      {(combosOf(m.id).length > 0 || countersOf(m.id).length > 0 || m.id === 'creeper') && (
        <div class="tt-sec" style={{ fontSize: 13 }}>
          {combosOf(m.id).map((c) => (
            <div key={c.id}>
              <span style={{ color: c.color }}>联动「{c.name}」</span> <span class="tt-line">{c.desc}</span>
            </div>
          ))}
          {countersOf(m.id).map((c, i) => (
            <div key={i}>
              <span class="tt-red">克制</span> <span class="tt-line">{c.desc}</span>
            </div>
          ))}
          {m.id === 'creeper' && (
            <div>
              <span class="tt-aqua">雷击</span> <span class="tt-line">{CHARGE_RULE}</span>
            </div>
          )}
        </div>
      )}
      <div class="tt-sec tt-gray" style={{ fontSize: 13 }}>
        {m.flavor}
      </div>
    </div>
  );
}

export function RelicTipContent({ id }: { id: string }) {
  const r = RELIC_MAP[id];
  const t = RELIC_TIER_INFO[r.tier];
  return (
    <div>
      <div class="tt-title" style={{ color: t.color }}>
        {r.name}
      </div>
      <div class="tt-gray">
        {t.name}宝物
        {r.commander ? ` · ${COMMANDER_MAP[r.commander]?.name}专属` : ''}
        {r.tag ? ` · ${r.tag}` : ''}
      </div>
      <div class="tt-sec tt-line">
        <RichText text={r.desc} tips={false} />
      </div>
      <KeywordBox texts={[r.desc]} />
    </div>
  );
}

/** Icon URL for a battle item. */
export function itemIcon(id: string) {
  return url.icon(POTION_MAP[id]?.icon ?? `potion_${id}`);
}

/** Icon URL for a relic. */
export function relicIcon(id: string) {
  return url.relic(id);
}

export function PotionTipContent({ id }: { id: string }) {
  const p = POTION_MAP[id];
  if (!p) return null;
  const tier = ITEM_TIER_INFO[p.tier];
  return (
    <div>
      <div class="tt-title" style={{ color: p.color }}>
        {p.name}
      </div>
      <div class="tt-gray">
        <span style={{ color: tier.color }}>{tier.name}</span> · {ITEM_KIND_NAME[p.kind]}
        {p.radius > 0 && ` · 半径 ${p.radius} 格`}
      </div>
      <div class="tt-sec tt-line">
        <RichText text={p.desc} tips={false} />
      </div>
      <KeywordBox texts={[p.desc]} />
      <div class="tt-sec tt-gray">战斗中点击下方物品栏（或按数字键）使用。</div>
    </div>
  );
}

export function RelicSlot({ id }: { id: string }) {
  const r = RELIC_MAP[id];
  return (
    <Tip class="relic-slot" content={() => <RelicTipContent id={id} />}>
      <img src={url.icon(r?.icon ?? id)} />
    </Tip>
  );
}

// ───────────────────────── Mob card ─────────────────────────

export function MobCard({
  mob, star = 1, card, size = '', onClick, selected, tip = true, showCount = true, dim, children, style, locked,
}: {
  mob: string;
  star?: number;
  card?: Card;
  size?: 'sm' | 'lg' | '';
  onClick?: () => void;
  selected?: boolean;
  tip?: boolean;
  showCount?: boolean;
  dim?: boolean;
  children?: ComponentChildren;
  style?: CSSProperties;
  locked?: boolean;
}) {
  const m = mobDef(mob);
  const st = card?.star ?? star;
  const ench = card?.enchant;
  const body = (
    <div
      class={`mcard r-${m.rarity} ${size} ${onClick && !locked ? 'clickable' : ''} ${selected ? 'selected' : ''} ${ench && !locked ? 'ench' : ''} ${card?.sigil && !locked ? 'fused' : ''} ${card?.netherite && !locked ? 'netherite' : ''} ${m.rarity === 'gold' ? 'gold-card' : ''} ${locked ? 'locked' : ''}`}
      style={{ ...(style ?? {}), opacity: locked ? 0.6 : dim ? 0.45 : 1 }}
      onClick={onClick && !locked ? () => (sfx('card_flip', { vol: 0.5 }), onClick()) : undefined}
    >
      <div class="mc-top">
        <span class="mc-rar">{RARITY_INFO[m.rarity].short}</span>
        <span
          class="mc-stars"
          title={!locked && (card?.mastery ?? (st > 3 ? st - 3 : 0)) > 0
            ? `★3 极阶突破 +${card?.mastery ?? (st > 3 ? st - 3 : 0)} (${card?.mastery ?? (st > 3 ? st - 3 : 0)}颗进阶新星覆盖)`
            : `★${Math.min(3, st)}`}
        >
          {[1, 2, 3].map((i) => {
            const mRank = card?.mastery ?? (st > 3 ? Math.min(3, st - 3) : 0);
            const baseStar = Math.min(3, st);
            const type = locked ? 'off' : mRank >= i ? 'mastery' : baseStar >= i ? 'normal' : 'off';
            return <StarIcon key={i} type={type} />;
          })}
        </span>
      </div>
      <div class="mc-art">
        <img src={url.mob(mob)} class={locked ? 'silhouette' : ''} loading="lazy" />
        {!locked && ench && <div class="mc-glint" style={{ maskImage: `url(${url.mob(mob)})`, WebkitMaskImage: `url(${url.mob(mob)})` }} />}
      </div>
      {!locked && card?.sigil && (
        <div
          class="mc-sigil"
          style={{
            position: 'absolute',
            right: 4,
            top: 24,
            background: 'rgba(20, 10, 45, 0.88)',
            border: '1px solid #a29bfe',
            borderRadius: 4,
            padding: '1px 4px',
            fontSize: 10,
            color: '#dff9fb',
            zIndex: 3,
            boxShadow: '0 0 6px rgba(162, 155, 254, 0.5)',
            pointerEvents: 'none',
          }}
        >
          印·{sigilOfMob(card.sigil)?.name.split(' · ')[1] ?? mobDef(card.sigil).name} [{sigilRoman(card.sigilStar ?? 1)}]
        </div>
      )}
      {!locked && card?.netherite && (
        <div
          class="mc-netherite-tag"
          style={{
            position: 'absolute',
            left: 4,
            top: 24,
            background: 'linear-gradient(135deg, #2c1a1d 0%, #442a2f 100%)',
            border: '1px solid #c97d60',
            borderRadius: 3,
            padding: '1px 4px',
            fontSize: 9,
            fontWeight: 800,
            color: '#ffbe76',
            zIndex: 3,
            boxShadow: '0 0 6px rgba(201, 125, 96, 0.6)',
            pointerEvents: 'none',
          }}
        >
          合金
        </div>
      )}
      {showCount && !locked && <div class="mc-count">×{unitCount(m, st)}</div>}
      <div class="mc-name">{locked ? '？？？' : m.name}</div>
      <div class="mc-fams">
        {locked ? (
          <span class="faint" style={{ fontSize: 11, letterSpacing: 1 }}>？？？</span>
        ) : (
          m.families.map((f) => (
            <FamBadge key={f} f={f} />
          ))
        )}
      </div>
      {!locked && ench && <div class="mc-ench">✦ {enchantName(ench, card?.enchantLv)}</div>}
      {!locked && card?.enchant2 && (
        <div class="mc-ench" style={{ bottom: 25, color: '#f368e0' }}>
          ✦ {enchantName(card.enchant2, card.enchant2Lv)}
        </div>
      )}
      <div class="mc-role">
        {locked ? <span class="faint">？ 未知</span> : `${ROLE_INFO[m.role].icon} ${ROLE_INFO[m.role].name}`}
      </div>
      {!locked && card && card.star < 3 && card.shards > 0 && (
        <div style={{ position: 'absolute', left: 10, top: 124, fontSize: 12, color: '#ffd76a', textShadow: '1px 1px 0 #000', zIndex: 2 }}>
          升星 {card.shards}/{card.star === 1 ? 1 : 2}
        </div>
      )}
      {!locked && card && card.star >= 3 && (card.mastery ?? 0) < 3 && card.shards > 0 && (
        <div style={{ position: 'absolute', left: 10, top: 124, fontSize: 12, color: '#e056fd', textShadow: '1px 1px 0 #000', zIndex: 2 }}>
          突破 {card.shards}/{card.mastery === 1 ? 3 : card.mastery === 2 ? 4 : 2}
        </div>
      )}
      {children}
      <div class="mc-bar" />
    </div>
  );
  if (!tip || locked) return body;
  return (
    <Tip
      content={() => (
        <MobTipContent
          mob={mob}
          star={st}
          enchant={ench}
          enchantLv={card?.enchantLv}
          bonus={card?.bonus}
          sigil={card?.sigil}
          sigilStar={card?.sigilStar}
          mastery={card?.mastery}
          netherite={card?.netherite}
          enchant2={card?.enchant2}
          enchant2Lv={card?.enchant2Lv}
        />
      )}
      style={{ display: 'inline-block' }}
    >
      {body}
    </Tip>
  );
}

export function Modal({ children, onClose, width }: { children: ComponentChildren; onClose?: () => void; width?: number }) {
  return (
    <div class="modal-back" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class="panel modal" style={{ width }}>
        {children}
      </div>
    </div>
  );
}
