import type { ButtonHTMLAttributes, ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { sfx } from '../../audio/audio.ts';
import { hideTips, stageScale, tipStack, tooltip } from '../store.ts';
import { url } from '../assets.ts';
import { FAMILIES } from '../../data/families.ts';
import type { Card, Family } from '../../core/types.ts';
import { COMMANDER_MAP, ITEM_KIND_NAME, enchantName, enchantText, ITEM_TIER_INFO, POTION_MAP, RELIC_MAP, RELIC_TIER_INFO } from '../../data/items.ts';
import { MOB_TACTIC, RARITY_INFO, ROLE_INFO, ROLE_TACTIC, mobDef, starStatMul, unitCount } from '../../data/mobs.ts';
import { KeywordBox, RichText } from './rich.tsx';
import { CHARGE_RULE, combosOf, countersOf } from '../../data/combos.ts';

// ───────────────────────── Button ─────────────────────────

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'green' | 'gold' | 'red' | 'purple' | '';
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
export const REPO_URL = 'https://github.com/moonwesif/BlockSpire';

/** A button-styled link to the GitHub repository (opens a new tab). */
export function GitHubLink({ label = 'GitHub', size = 'small', class: cls }: { label?: string; size?: string; class?: string }) {
  return (
    <a
      class={`mc-btn gh-btn ${size} ${cls ?? ''}`}
      href={REPO_URL}
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

function placeTip() {
  const el = tipEl;
  if (!el) return;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  let x = tipAt.x + 18;
  let y = tipAt.y + 18;
  if (x + w > 1590) x = Math.max(8, tipAt.x - w - 14);
  if (y + h > 890) y = Math.max(8, 890 - h);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
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
  useEffect(
    () => () => {
      if (dropTip(id.current)) showTop();
    },
    [],
  );
  return (
    <div
      class={cls}
      style={style}
      onMouseEnter={(e) => {
        Object.assign(tipAt, stagePoint(e as MouseEvent));
        dropTip(id.current);
        tipStack.push({ id: id.current, content: () => latest.current() });
        showTop();
      }}
      onMouseMove={(e) => {
        Object.assign(tipAt, stagePoint(e as MouseEvent));
        placeTip();
      }}
      onMouseLeave={() => {
        if (dropTip(id.current)) showTop();
      }}
      onClick={() => hideTips()}
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
      }}
      class="mc-tip"
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

export function Stars({ star, max = 3 }: { star: number; max?: number }) {
  return (
    <span class="stars">
      {Array.from({ length: max }, (_, i) => (
        <span key={i} class={i < star ? '' : 'off'}>
          ★
        </span>
      ))}
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

export function MobTipContent({ mob, star = 1, enchant, enchantLv, bonus, showStar3 = true }: { mob: string; star?: number; enchant?: string; enchantLv?: number; bonus?: number; showStar3?: boolean }) {
  const m = mobDef(mob);
  const r = RARITY_INFO[m.rarity];
  const mul = starStatMul(m, star) * (1 + (bonus ?? 0));
  const n = unitCount(m, star);
  return (
    <div>
      <div class="tt-title" style={{ color: r.color }}>
        {m.name} <span class="stars">{'★'.repeat(star)}</span>
      </div>
      <div class="tt-gray">
        {r.name} · {ROLE_INFO[m.role].icon} {ROLE_INFO[m.role].name} · 出战 ×{n}
      </div>
      {m.families.length > 0 && <div class="tt-line">羁绊：{m.families.map((f) => FAMILIES[f].name).join(' / ')}</div>}
      <div class="tt-sec tt-line">
        生命 <span class="tt-green">{Math.round(m.hp * mul)}</span> · 攻击 <span class="tt-red">{Math.round(m.atk * mul)}</span> · 间隔 {m.cd}s
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
      {enchant && (
        <div class="tt-sec tt-purple">
          {enchantName(enchant, enchantLv)}：{enchantText(enchant, enchantLv)}
        </div>
      )}
      {bonus ? <div class="tt-aqua">永久强化 +{Math.round(bonus * 100)}%</div> : null}
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
  return (
    <Tip class="relic-slot" content={() => <RelicTipContent id={id} />}>
      <img src={url.icon(id)} />
    </Tip>
  );
}

// ───────────────────────── Mob card ─────────────────────────

export function MobCard({
  mob, star = 1, card, size = '', onClick, selected, tip = true, showCount = true, dim, children, style,
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
}) {
  const m = mobDef(mob);
  const st = card?.star ?? star;
  const ench = card?.enchant;
  const body = (
    <div
      class={`mcard r-${m.rarity} ${size} ${onClick ? 'clickable' : ''} ${selected ? 'selected' : ''} ${ench ? 'ench' : ''} ${m.rarity === 'gold' ? 'gold-card' : ''}`}
      style={{ ...(style ?? {}), opacity: dim ? 0.45 : 1 }}
      onClick={onClick ? () => (sfx('card_flip', { vol: 0.5 }), onClick()) : undefined}
    >
      <div class="mc-top">
        <span class="mc-rar">{RARITY_INFO[m.rarity].short}</span>
        <span class="mc-stars">
          {[1, 2, 3].map((i) => (
            <span key={i} class={i <= st ? '' : 'off'}>
              ★
            </span>
          ))}
        </span>
      </div>
      <div class="mc-art">
        <img src={url.mob(mob)} loading="lazy" />
        {ench && <div class="mc-glint" style={{ maskImage: `url(${url.mob(mob)})`, WebkitMaskImage: `url(${url.mob(mob)})` }} />}
      </div>
      {showCount && <div class="mc-count">×{unitCount(m, st)}</div>}
      <div class="mc-name">{m.name}</div>
      <div class="mc-fams">
        {m.families.map((f) => (
          <FamBadge key={f} f={f} />
        ))}
      </div>
      {ench && <div class="mc-ench">✦ {enchantName(ench, card?.enchantLv)}</div>}
      <div class="mc-role">
        {ROLE_INFO[m.role].icon} {ROLE_INFO[m.role].name}
      </div>
      {card && card.star < 3 && card.shards > 0 && (
        <div style={{ position: 'absolute', left: 10, top: 124, fontSize: 12, color: '#ffd76a', textShadow: '1px 1px 0 #000', zIndex: 2 }}>
          升星 {card.shards}/{card.star === 1 ? 1 : 2}
        </div>
      )}
      {children}
      <div class="mc-bar" />
    </div>
  );
  if (!tip) return body;
  return (
    <Tip content={() => <MobTipContent mob={mob} star={st} enchant={ench} enchantLv={card?.enchantLv} bonus={card?.bonus} />} style={{ display: 'inline-block' }}>
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
