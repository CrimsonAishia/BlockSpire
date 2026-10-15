import { useState } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { allCards, canSmith, chooseBook, enchantFits, hasRelic, leaveNode, pickCard, restAction, restHeal, shardsNeeded } from '../../run/run.ts';
import { ENCHANT_MAP, enchantName, enchantText } from '../../data/items.ts';
import { mobDef, starPower, starStatMul, unitCount } from '../../data/mobs.ts';
import type { Card } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, HeartIcon, MobCard, Modal } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';

type P<T extends Pending['type']> = Extract<Pending, { type: T }>;

export function RestView({ s, p }: { s: RunState; p: P<'rest'>; v?: number }) {
  const heal = restHeal(s);
  const noRest = hasRelic(s, 'sculk_catalyst');
  const canUp = allCards(s).some(canSmith);
  const opts = [
    {
      id: 'rest' as const,
      icon: 'bed',
      name: '休息',
      desc: noRest ? '幽匿催发体让你无法入睡。' : `回复 ${heal} 颗心（当前 ${s.hearts}/${s.maxHearts}）。`,
      off: noRest || s.hearts >= s.maxHearts,
    },
    { id: 'smith' as const, icon: 'smithing', name: '锻造', desc: '使一张卡牌 ★+1（隐秘级及以上最高 ★2）。', off: !canUp },
    { id: 'enchant' as const, icon: 'enchanted_book', name: '附魔', desc: '从 3 本随机附魔书中选择一本，附魔一张卡牌。', off: false },
  ];
  return (
    <div class="screen rest-screen">
      <div class="campfire">
        <img src={url.icon('node_rest')} class="pixelated" />
        <div class="embers" />
      </div>
      <div class="rest-title title-shadow">营火</div>
      <div class="subtle" style={{ fontSize: 18 }}>
        篝火噼啪作响。你可以选择 {p.actions > 0 ? <span class="gold-t">{p.actions}</span> : '0'} 项行动{hasRelic(s, 'crafting_table') ? '（工作台：可执行两次）' : ''}。
      </div>
      <div class="rest-opts">
        {opts.map((o) => {
          const done = p.done.includes(o.id);
          const off = o.off || p.actions <= 0 || done;
          return (
            <button
              key={o.id}
              class={`rest-opt ${off ? 'off' : ''} ${done ? 'done' : ''}`}
              disabled={off}
              onClick={() => {
                sfx(o.id === 'rest' ? 'heal' : o.id === 'smith' ? 'golem' : 'enchant');
                act((r) => restAction(r, o.id));
              }}
            >
              <img src={url.icon(o.icon)} class="pixelated" />
              <div class="ro-name">
                {o.name}
                {o.id === 'rest' && !noRest && (
                  <span>
                    {' '}
                    +{heal} <HeartIcon size={16} />
                  </span>
                )}
              </div>
              <div class="ro-desc">{o.desc}</div>
              {done && <div class="ro-done">已完成</div>}
            </button>
          );
        })}
      </div>
      <Btn variant={p.actions <= 0 ? 'green' : ''} size="big" onClick={() => act((r) => leaveNode(r))}>
        {p.actions <= 0 ? '继续前进' : '跳过，继续前进'}
      </Btn>
    </div>
  );
}

export function PickCardView({ s, p }: { s: RunState; p: P<'pick_card'>; v?: number }) {
  const [sel, setSel] = useState<string | null>(null);
  const maxStar = Number(p.data?.maxStar ?? 2);
  const ok = (c: Card) => {
    switch (p.purpose) {
      case 'enchant':
        return enchantFits(c.mob, p.enchant!);
      case 'upgrade':
        return canSmith(c) && c.star <= maxStar;
      default:
        return true;
    }
  };
  const cards = allCards(s);
  const bookLv = Number(p.data?.lv ?? 1);
  const purposeText: Record<string, string> = {
    enchant: p.enchant ? `${enchantName(p.enchant, bookLv)}：${enchantText(p.enchant, bookLv)} 已有同名附魔的卡牌会合成升级（最高 III）。` : '',
    upgrade: '星级提升：生命、攻击、数量全面提升，★3 解锁强化能力。隐秘级与罕见特殊只能锻造到 ★2。',
    bonus: `永久属性 +${Math.round(Number(p.data?.amount ?? 0.15) * 100)}%${p.enchant ? `，并获得附魔「${enchantName(p.enchant, bookLv)}」` : ''}`,
    sacrifice: '被牺牲的卡牌将永久消失。',
    trade: '交出的卡牌将永久消失，换取一次更高品质的开箱。',
  };
  const selCard = cards.find((c) => c.uid === sel);
  return (
    <div class="screen choice-screen">
      <div class="choice-head">
        <div class="choice-title title-shadow">{p.title}</div>
        <div class="subtle">{purposeText[p.purpose]}</div>
      </div>
      <div class="pick-grid">
        {cards.map((c) => {
          const can = ok(c);
          const inTeam = s.team.includes(c);
          const why = !can && p.purpose === 'upgrade' && c.star < 3 && !canSmith(c) ? '只能靠重复开出升星' : '';
          return (
            <div key={c.uid} class="col gap8" style={{ alignItems: 'center' }}>
              <MobCard mob={c.mob} card={c} dim={!can} selected={sel === c.uid} onClick={can ? () => setSel(c.uid) : undefined} />
              <span class="faint" style={{ fontSize: 13 }}>
                {inTeam ? '出战中' : '背包'}
                {why ? ` · ${why}` : ''}
                {c.enchant && can && (p.purpose === 'enchant' || (p.purpose === 'bonus' && p.enchant)) ? (
                  c.enchant === p.enchant ? <span class="gold-t"> · 可合成升级</span> : <span class="red-t"> · 已有 {enchantName(c.enchant, c.enchantLv)}</span>
                ) : ''}
              </span>
            </div>
          );
        })}
      </div>
      <div class="choice-foot">
        <Btn onClick={() => act((r) => pickCard(r, null))}>{p.data?.price ? '取消（退款）' : '放弃'}</Btn>
      </div>
      {selCard && (
        <Modal onClose={() => setSel(null)} width={720}>
          <ChangePreview s={s} p={p} c={selCard} />
          <div class="row gap12 center" style={{ marginTop: 18 }}>
            <Btn onClick={() => setSel(null)}>重新选择</Btn>
            <Btn
              variant={p.purpose === 'sacrifice' || p.purpose === 'trade' ? 'red' : 'green'}
              onClick={() => {
                sfx(p.purpose === 'enchant' ? 'enchant' : p.purpose === 'upgrade' ? 'star_up' : 'click');
                setSel(null);
                act((r) => pickCard(r, selCard.uid));
              }}
            >
              {CONFIRM[p.purpose]}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

const CONFIRM: Record<P<'pick_card'>['purpose'], string> = {
  enchant: '确认附魔',
  upgrade: '确认升星',
  bonus: '确认强化',
  sacrifice: '确认牺牲',
  trade: '确认交易',
};

/** Before → after for the chosen card, with warnings for anything that gets lost. */
function ChangePreview({ p, c }: { s: RunState; p: P<'pick_card'>; c: Card }) {
  const m = mobDef(c.mob);
  const star = c.star;
  const bonus = c.bonus ?? 0;
  const after = { star, bonus, enchant: c.enchant, lv: c.enchantLv };
  const bookLv = Number(p.data?.lv ?? 1);
  if (p.purpose === 'upgrade') after.star = (star + 1) as 2 | 3;
  if (p.purpose === 'bonus') after.bonus = bonus + Number(p.data?.amount ?? 0.15);
  if (p.purpose === 'enchant' || (p.purpose === 'bonus' && p.enchant)) {
    if (c.enchant === p.enchant) after.lv = Math.min(3, (c.enchantLv ?? 2) + bookLv);
    else {
      after.enchant = p.enchant;
      after.lv = bookLv;
    }
  }
  const merge = after.enchant === c.enchant && after.lv !== c.enchantLv && !!c.enchant;
  const stat = (st: number, bn: number) => {
    const mul = starStatMul(m, st) * (1 + bn);
    return { n: unitCount(m, st), hp: Math.round(m.hp * mul), atk: Math.round(m.atk * mul), pow: starPower(m, st) * (1 + bn) };
  };
  const a = stat(star, bonus);
  const b = stat(after.star, after.bonus);
  const lost = p.purpose === 'sacrifice' || p.purpose === 'trade';
  const overwrite = after.enchant !== c.enchant && c.enchant;
  const changedEnch = after.enchant !== c.enchant || merge;
  const row = (label: string, x: number | string, y: number | string, up?: boolean) => (
    <div class="cp-row">
      <span class="subtle">{label}</span>
      <span>{x}</span>
      <span class="cp-arrow">➜</span>
      <span class={up ? 'em' : ''}>{y}</span>
    </div>
  );
  return (
    <div>
      <div class="panel-title">{lost ? `确定要交出 ${m.name}？` : `${m.name}：${CONFIRM[p.purpose].replace('确认', '')}预览`}</div>
      <div class="row gap16 center" style={{ alignItems: 'center', margin: '8px 0 14px' }}>
        <MobCard mob={c.mob} card={c} size="sm" tip={false} />
        {!lost && (
          <>
            <span class="cp-big-arrow">➜</span>
            <MobCard mob={c.mob} card={{ ...c, star: after.star as 1 | 2 | 3, bonus: after.bonus, enchant: after.enchant, enchantLv: after.lv, shards: 0 }} size="sm" tip={false} />
          </>
        )}
      </div>
      {lost ? (
        <div class="cp-warn">这张卡牌（★{star}{c.enchant ? `，附魔「${enchantName(c.enchant, c.enchantLv)}」` : ''}）将永久消失，无法撤销。</div>
      ) : (
        <div class="cp-table">
          {(p.purpose === 'upgrade' || p.purpose === 'bonus') && (
            <>
              {row('星级', '★'.repeat(star), '★'.repeat(after.star), after.star > star)}
              {row('出战数量', `×${a.n}`, `×${b.n}`, b.n > a.n)}
              {row('单体生命', a.hp, b.hp, b.hp > a.hp)}
              {row('单体攻击', a.atk, b.atk, b.atk > a.atk)}
              {row('整卡战力', '100%', `${Math.round((b.pow / a.pow) * 100)}%`, true)}
            </>
          )}
          {changedEnch && row('附魔', c.enchant ? enchantName(c.enchant, c.enchantLv) : '无', enchantName(after.enchant!, after.lv), true)}
        </div>
      )}
      {after.enchant && changedEnch && (
        <div class="cp-note tt-purple">
          {merge && <span class="gold-t">同名附魔合成升级！</span>}
          {enchantName(after.enchant, after.lv)}：{enchantText(after.enchant, after.lv)}
        </div>
      )}
      {overwrite && (
        <div class="cp-warn">
          ⚠ 每张卡牌只能有一个附魔：原有的「{enchantName(c.enchant!, c.enchantLv)}」（{enchantText(c.enchant!, c.enchantLv)}）会被覆盖并消失。
        </div>
      )}
      {p.purpose === 'upgrade' && after.star === 3 && m.star3 && <div class="cp-note gold-t">解锁 ★3 能力：{m.star3}</div>}
      {p.purpose === 'upgrade' && c.shards > 0 && <div class="cp-note faint">当前的升星进度（{c.shards}/{shardsNeeded(star)}）会被这次升星用掉。</div>}
    </div>
  );
}

export function EnchantChoiceView({ s, p }: { s: RunState; p: P<'enchant_choice'>; v?: number }) {
  return (
    <div class="screen choice-screen">
      <div class="choice-head">
        <div class="choice-title title-shadow">{p.title}</div>
        <div class="subtle">每张卡牌只能拥有一个附魔；同名附魔会合成升级（最高 III）。部分附魔仅对近战或远程生效。</div>
      </div>
      <div class="relic-tiles">
        {p.books.map((b, bi) => {
          const e = ENCHANT_MAP[b];
          const lv = p.levels?.[bi] ?? 1;
          const fits = allCards(s).filter((c) => enchantFits(c.mob, b));
          return (
            <div key={b} class={`relic-tile ench-tile ${fits.length ? '' : 'off'}`} style={{ '--tc': e.color } as never} onClick={() => fits.length && (sfx('enchant'), act((r) => chooseBook(r, b)))}>
              <div class="rt-glow" />
              <img src={url.icon('enchanted_book')} class="pixelated float" />
              <div class="rt-name" style={{ color: e.color }}>
                {enchantName(b, lv)}
              </div>
              <div class="rt-tier">{e.only ? `仅限${e.only === 'melee' ? '近战' : '远程'}` : '通用'}</div>
              <div class="rt-desc">{enchantText(b, lv)}</div>
              <div class="row gap4 center wrap" style={{ marginTop: 8 }}>
                {fits.slice(0, 6).map((c) => (
                  <img key={c.uid} src={url.mob(c.mob)} title={mobDef(c.mob).name} style={{ width: 30, height: 30, objectFit: 'contain' }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div class="choice-foot">
        <Btn onClick={() => act((r) => chooseBook(r, null))}>放弃</Btn>
      </div>
    </div>
  );
}

export function MessageView({ p }: { s: RunState; p: P<'message'>; v?: number }) {
  return (
    <div class="screen choice-screen">
      <div class="panel" style={{ width: 640, margin: '220px auto 0', textAlign: 'center' }}>
        <div class="panel-title">{p.title}</div>
        <div class={p.tone === 'bad' ? 'red-t' : p.tone === 'good' ? 'em' : 'subtle'} style={{ fontSize: 18, margin: '12px 0 20px' }}>
          {p.text}
        </div>
        <Btn variant="green" onClick={() => act((r) => leaveNode(r))}>
          继续
        </Btn>
      </div>
    </div>
  );
}
