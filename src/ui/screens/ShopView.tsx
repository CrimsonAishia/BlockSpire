import type { Pending, RunState, ShopItem } from '../../run/run.ts';
import { useState } from 'preact/hooks';
import { allCards, buyItem, leaveNode, orderMob, orderPool, orderPrice, rerollShop, sellItem, sellValue } from '../../run/run.ts';
import { RARITY_INFO, mobDef } from '../../data/mobs.ts';
import { CRATE_MAP, GRADE_INFO } from '../../data/crates.ts';
import { ENCHANT_MAP, POTION_MAP, RELIC_MAP, RELIC_TIER_INFO, enchantName, enchantText } from '../../data/items.ts';
import { url } from '../assets.ts';
import { Btn, Emerald, Modal, MobTipContent, PotionTipContent, RelicTipContent, Tip, itemIcon } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { Hint } from '../components/hints.tsx';
import { sfx } from '../../audio/audio.ts';
import { RARITIES } from '../../core/types.ts';

type P = Extract<Pending, { type: 'shop' }>;

function itemView(s: RunState, it: ShopItem) {
  switch (it.kind) {
    case 'crate': {
      const c = CRATE_MAP[it.ref];
      return {
        icon: url.crate(it.ref),
        name: c.name,
        sub: `${GRADE_INFO[it.grade!].name}品质 · 立即开启`,
        color: GRADE_INFO[it.grade!].color,
        tip: () => (
          <div>
            <div class="tt-title">{c.name}</div>
            <div class="tt-line">{c.desc}</div>
            <div class="tt-sec row gap4 wrap" style={{ maxWidth: 300 }}>
              {RARITIES.flatMap((r) => c.pool[r].map((m) => <img key={m} src={url.mob(m)} width={28} height={28} style={{ objectFit: 'contain' }} />))}
            </div>
          </div>
        ),
      };
    }
    case 'potion':
      return { icon: itemIcon(it.ref), name: POTION_MAP[it.ref].name, sub: POTION_MAP[it.ref].desc, color: POTION_MAP[it.ref].color, tip: () => <PotionTipContent id={it.ref} /> };
    case 'enchant':
      return {
        icon: url.icon('enchanted_book'),
        name: `附魔书：${enchantName(it.ref, it.level ?? 1)}`,
        sub: enchantText(it.ref, it.level ?? 1) + (ENCHANT_MAP[it.ref].only ? `（仅限${ENCHANT_MAP[it.ref].only === 'melee' ? '近战' : '远程'}）` : ''),
        color: '#c9a6ff',
        tip: () => (
          <div>
            <div class="tt-title tt-purple">{enchantName(it.ref, it.level ?? 1)}</div>
            <div class="tt-line">{enchantText(it.ref, it.level ?? 1)}</div>
            <div class="tt-sec tt-gray">每张卡牌只能拥有一个附魔：同名附魔合成升级（最高 III），不同的会覆盖旧的。</div>
          </div>
        ),
      };
    case 'relic':
      return { icon: url.icon(RELIC_MAP[it.ref]?.icon ?? it.ref), name: RELIC_MAP[it.ref].name, sub: RELIC_MAP[it.ref].desc, color: RELIC_TIER_INFO[RELIC_MAP[it.ref].tier].color, tip: () => <RelicTipContent id={it.ref} /> };
    case 'heal':
      return { icon: url.icon('golden_apple'), name: '金胡萝卜', sub: '回复 1 颗心', color: '#ffcc33', tip: () => <div class="tt-line">回复 1 颗心。</div> };
    case 'upgrade':
      return {
        icon: url.icon('smithing'),
        name: '锻造升星',
        sub: '使一张 ★1 卡牌升至 ★2',
        color: '#ffd76a',
        tip: () => <div class="tt-line">选择一张 ★1 卡牌直接升至 ★2。（★3 需要在营火锻造或通过合成获得）</div>,
      };
  }
}

function disabledReason(s: RunState, it: ShopItem): string | null {
  if (it.sold) return '已售出';
  if (it.kind === 'potion' && s.potions.length >= s.potionSlots) return '物品栏已满（可在左侧出售）';
  if (it.kind === 'heal' && s.hearts >= s.maxHearts) return '生命已满';
  if (it.kind === 'upgrade' && !allCards(s).some((c) => c.star === 1)) return '无 ★1 卡牌';
  if (s.emeralds < it.price) return '绿宝石不足';
  return null;
}

export function ShopView({ s, p }: { s: RunState; p: P; v?: number }) {
  const [ordering, setOrdering] = useState(false);
  const owned = new Set(allCards(s).map((c) => c.mob));
  const groups: [string, ShopItem['kind'][]][] = [
    ['补给箱', ['crate']],
    ['战斗物品与附魔', ['potion', 'enchant']],
    ['宝物', ['relic']],
    ['服务', ['heal', 'upgrade']],
  ];
  return (
    <div class="screen shop-screen">
      <div class="shop-left">
        <img class="shop-villager" src={url.cmd('villager')} />
        <div class="speech">
          哼嗯……
          <br />
          <span class="subtle">看看有什么需要的？绿宝石，我只收绿宝石。</span>
        </div>
        <div class="shop-wallet">
          <Emerald n={s.emeralds} size={34} />
        </div>
        <div class="shop-sell">
          <div class="subtle" style={{ fontSize: 14 }}>
            出售物品（基础价半价回收） {s.potions.length}/{s.potionSlots}
          </div>
          <div class="row gap4 wrap">
            {s.potions.length === 0 && <span class="faint" style={{ fontSize: 13 }}>物品栏是空的</span>}
            {s.potions.map((it, i) => (
              <Tip key={i} content={() => <PotionTipContent id={it} />}>
                <button class="sell-slot" onClick={() => (sfx('coin'), act((r) => sellItem(r, i)))}>
                  <img src={itemIcon(it)} class="pixelated" />
                  <span class="em">+{sellValue(it)}</span>
                </button>
              </Tip>
            ))}
          </div>
        </div>
        <div class="col gap8" style={{ width: '100%' }}>
          <div class="subtle" style={{ fontSize: 13 }}>第 {s.act} 幕 · 商品与刷新费用随幕数上涨，连续刷新逐次加价。</div>
          <Btn
            wide
            disabled={s.emeralds < p.reroll}
            onClick={() => {
              sfx('page');
              act((r) => rerollShop(r));
            }}
          >
            刷新货架 <span class="price">{p.reroll} <Emerald size={18} /></span>
          </Btn>
          <Btn variant="green" wide onClick={() => act((r) => leaveNode(r))}>
            离开交易所
          </Btn>
        </div>
      </div>
      <Hint id="shop" pos="bottom">
        <b>村民交易所</b>：用绿宝石购买补给箱、战斗物品、附魔书和宝物。附魔书会让你选择一张卡牌附魔；物品在战斗中从下方物品栏使用。
      </Hint>
      <div class="shop-right">
        {p.orders !== undefined && (
          <div class="shop-group order-group">
            <div class="shop-group-title">订购 · 大商人专属</div>
            <div class="row gap12" style={{ alignItems: 'center' }}>
              <span class="subtle" style={{ fontSize: 14 }}>
                从本幕补给箱的生物池里指定买一只（军规 / 受限 / 保密级），已有的会合成升星。本店还能订购 <b class="gold-t">{p.orders}</b> 次。
              </span>
              <Btn variant="gold" disabled={p.orders <= 0} onClick={() => (sfx('page'), setOrdering(true))}>
                打开订购单
              </Btn>
            </div>
          </div>
        )}
        {groups.map(([title, kinds]) => {
          const items = p.stock.filter((x) => kinds.includes(x.kind));
          if (!items.length) return null;
          return (
            <div key={title} class="shop-group">
              <div class="shop-group-title">{title}</div>
              <div class="shop-items">
                {items.map((it) => {
                  const v = itemView(s, it);
                  const why = disabledReason(s, it);
                  return (
                    <Tip key={it.id} content={v.tip} class={`trade ${it.sold ? 'sold' : ''} ${why && !it.sold ? 'cant' : ''}`}>
                      <button
                        class="trade-btn"
                        disabled={!!why}
                        onClick={() => {
                          const before = s.emeralds;
                          act((r) => buyItem(r, it.id));
                          sfx(s.emeralds < before ? 'buy' : 'error');
                        }}
                      >
                        <div class="trade-cost">
                          <Emerald size={22} />
                          <span>{it.price}</span>
                        </div>
                        <div class="trade-arrow">➜</div>
                        <img class={`trade-icon ${it.kind === 'crate' ? '' : 'pixelated'}`} src={v.icon} />
                        <div class="trade-text">
                          <div class="trade-name" style={{ color: v.color }}>
                            {v.name}
                          </div>
                          <div class="trade-sub">{v.sub}</div>
                        </div>
                        {it.sold && <div class="sold-x">✕</div>}
                        {why && !it.sold && <div class="trade-why">{why}</div>}
                      </button>
                    </Tip>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {ordering && (
        <Modal onClose={() => setOrdering(false)} width={1080}>
          <div class="row between">
            <div class="panel-title">订购单</div>
            <span class="row gap8">
              <Emerald n={s.emeralds} size={22} />
              <Btn size="small" onClick={() => setOrdering(false)}>
                关闭
              </Btn>
            </span>
          </div>
          <div class="order-grid">
            {orderPool(s).map((m) => {
              const d = mobDef(m);
              const price = orderPrice(s, m);
              const can = s.emeralds >= price && (p.orders ?? 0) > 0;
              return (
                <Tip key={m} content={() => <MobTipContent mob={m} />}>
                  <button
                    class={`order-item r-${d.rarity} ${owned.has(m) ? 'owned' : ''}`}
                    disabled={!can}
                    onClick={() => {
                      sfx('buy');
                      setOrdering(false);
                      act((r) => orderMob(r, m));
                    }}
                  >
                    <img src={url.mob(m)} />
                    <span class="rc">{d.name}</span>
                    <span class="faint" style={{ fontSize: 11 }}>
                      {RARITY_INFO[d.rarity].short}
                      {owned.has(m) ? ' · 已拥有' : ''}
                    </span>
                    <span class="order-price">
                      {price} <Emerald size={14} />
                    </span>
                  </button>
                </Tip>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

