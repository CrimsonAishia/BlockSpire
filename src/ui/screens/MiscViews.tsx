import { useState } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { allCards, canSmith, chooseBook, enchantFits, findCard, hasRelic, leaveNode, pickCard, restAction, restHeal, shardsNeeded } from '../../run/run.ts';
import { ENCHANT_MAP, enchantName, enchantText } from '../../data/items.ts';
import { mobDef, starPower, starStatMul, unitCount } from '../../data/mobs.ts';
import { sigilDesc, sigilOfMob, sigilRoman, sigilTierName } from '../../data/sigils.ts';
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
    { id: 'fuse' as const, icon: 'nether_star', name: '融合', desc: '献祭一张副卡，将其独特生物印记与精魄刻印至主力卡牌。', off: allCards(s).length < 2 },
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
                sfx(o.id === 'rest' ? 'heal' : o.id === 'smith' ? 'golem' : o.id === 'fuse' ? 'star_up' : 'enchant');
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
  const [ceremony, setCeremony] = useState<{
    baseName: string;
    sacName: string;
    sigilName: string;
    sigilDesc: string;
    totalBonus: number;
    resonance: number;
    enchantNameStr?: string;
    fusedCard: Card;
    sacUid: string;
  } | null>(null);
  const maxStar = Number(p.data?.maxStar ?? 2);
  const ok = (c: Card) => {
    switch (p.purpose) {
      case 'enchant':
        return enchantFits(c.mob, p.enchant!);
      case 'upgrade':
        return canSmith(c) && c.star <= maxStar;
      case 'fuse_sac':
        return c.uid !== p.data?.baseUid;
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
    fuse_base: '选择一张接受刻印的主力卡牌。融合后将获得副卡的专属生物印记，并吸收副卡的精魄成长。',
    fuse_sac: '选择一张献祭的副卡。副卡将永久消耗，将其专属印记与精魄（属性+5~10%、已有附魔）赋予主力卡牌。',
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
              variant={p.purpose === 'sacrifice' || p.purpose === 'trade' || p.purpose === 'fuse_sac' ? 'red' : 'green'}
              onClick={() => {
                if (p.purpose === 'fuse_sac') {
                  const baseCard = findCard(s, String(p.data?.baseUid));
                  if (baseCard) {
                    const baseM = mobDef(baseCard.mob);
                    const sacM = mobDef(selCard.mob);
                    const sDef = sigilOfMob(selCard.mob);
                    const isSameSigil = baseCard.sigil === selCard.mob;
                    const targetStar = isSameSigil ? Math.min(3, Math.max((baseCard.sigilStar ?? 1) + 1, selCard.star)) : selCard.star;
                    const rawEssence = selCard.star === 3 ? 12 : selCard.star === 2 ? 6 : 3;
                    const hostMul = (baseCard.star === 3 ? 1.75 : baseCard.star === 2 ? 1.30 : 1.0) + (baseCard.mastery ?? 0) * 0.10;
                    const resonance = baseM.families.some((f) => sacM.families.includes(f)) ? 5 : 0;
                    const totalBonus = Math.round(rawEssence * hostMul + resonance);

                    const enchName = !baseCard.enchant && selCard.enchant
                      ? enchantName(selCard.enchant, selCard.enchantLv)
                      : undefined;

                    const fusedCard: Card = {
                      ...baseCard,
                      sigil: selCard.mob,
                      sigilStar: targetStar,
                      bonus: (baseCard.bonus ?? 0) + totalBonus / 100,
                      enchant: baseCard.enchant ?? selCard.enchant,
                      enchantLv: baseCard.enchant ? baseCard.enchantLv : selCard.enchantLv,
                    };
                    setSel(null);
                    sfx('star_up');
                    setTimeout(() => sfx('level_up'), 250);
                    setCeremony({
                      baseName: baseM.name,
                      sacName: sacM.name,
                      sigilName: `${sDef?.name ?? '生物印记'} ${sigilRoman(targetStar)} [${sigilTierName(targetStar)}]`,
                      sigilDesc: sigilDesc(selCard.mob, targetStar),
                      totalBonus,
                      resonance,
                      enchantNameStr: enchName,
                      fusedCard,
                      sacUid: selCard.uid,
                    });
                    return;
                  }
                }
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
      {ceremony && (
        <Modal
          onClose={() => {
            act((r) => pickCard(r, ceremony.sacUid));
            setCeremony(null);
          }}
          width={640}
        >
          <div class="fusion-ceremony">
            <div class="fusion-banner">✨ 印记铭刻 · 精魄共鸣达成 ✨</div>
            <div class="subtle" style={{ fontSize: 14 }}>
              副卡「{ceremony.sacName}」的灵魂精魄已成功融入「{ceremony.baseName}」！
            </div>

            <div class="fusion-altar">
              <div class="fusion-halo" />
              <div class="fusion-sparks" />
              <div class="fusion-card-wrap">
                <MobCard mob={ceremony.fusedCard.mob} card={ceremony.fusedCard} tip={false} />
              </div>
            </div>

            <div class="fusion-stat-badge">
              <div class="row gap8 center" style={{ alignItems: 'center' }}>
                <span style={{ color: '#a29bfe', fontWeight: 700, fontSize: 16 }}>🔮 赋予印记：{ceremony.sigilName}</span>
              </div>
              <div class="subtle" style={{ fontSize: 13, color: '#dfe6e9', marginTop: 2 }}>
                {ceremony.sigilDesc}
              </div>
              <div class="row gap16 center" style={{ marginTop: 8, fontSize: 13 }}>
                <span class="gold-t">⚡ 精魄滋养：全属性 +{ceremony.totalBonus}%</span>
                {ceremony.resonance > 0 && <span style={{ color: '#55efc4' }}>🧬 同系共鸣 +5%</span>}
              </div>
              {ceremony.enchantNameStr && (
                <div style={{ color: '#74b9ff', fontSize: 13, marginTop: 4 }}>
                  🛡️ 附魔继承：{ceremony.enchantNameStr}
                </div>
              )}
            </div>

            <div class="row center" style={{ marginTop: 14 }}>
              <Btn
                variant="green"
                onClick={() => {
                  sfx('click');
                  act((r) => pickCard(r, ceremony.sacUid));
                  setCeremony(null);
                }}
              >
                完成铭刻 · 契约达成
              </Btn>
            </div>
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
  fuse_base: '选为主力',
  fuse_sac: '确认献祭融合',
};

/** Before → after for the chosen card, with warnings for anything that gets lost. */
function ChangePreview({ s, p, c }: { s: RunState; p: P<'pick_card'>; c: Card }) {
  const m = mobDef(c.mob);
  if (p.purpose === 'fuse_base') {
    return (
      <div>
        <div class="panel-title">选定 {m.name} 为融合主力</div>
        <div class="row gap16 center" style={{ alignItems: 'center', margin: '8px 0 14px' }}>
          <MobCard mob={c.mob} card={c} size="sm" tip={false} />
        </div>
        <div class="subtle" style={{ textAlign: 'center', lineHeight: 1.6, padding: '0 20px' }}>
          下一步将选择一张献祭副卡，将其专属生物印记刻印至 {m.name} 身上，并吸收其精魄属性。
        </div>
      </div>
    );
  }
  if (p.purpose === 'fuse_sac') {
    const baseCard = findCard(s, String(p.data?.baseUid));
    const baseM = baseCard ? mobDef(baseCard.mob) : null;
    const isSameSigil = baseCard?.sigil === c.mob;
    const targetStar = isSameSigil ? Math.min(3, Math.max((baseCard?.sigilStar ?? 1) + 1, c.star)) : c.star;
    const rawEssence = c.star === 3 ? 12 : c.star === 2 ? 6 : 3;
    const hostMul = baseCard ? ((baseCard.star === 3 ? 1.75 : baseCard.star === 2 ? 1.30 : 1.0) + (baseCard.mastery ?? 0) * 0.10) : 1.0;
    const resonance = baseM && baseM.families.some((f) => m.families.includes(f)) ? 5 : 0;
    const totalBonus = Math.round(rawEssence * hostMul + resonance);

    const sDef = sigilOfMob(c.mob);
    const targetSigilDesc = sigilDesc(c.mob, targetStar);
    const romanTier = sigilRoman(targetStar);
    const tierName = sigilTierName(targetStar);

    const previewCard: Card | null = baseCard
      ? {
          ...baseCard,
          sigil: c.mob,
          sigilStar: targetStar,
          bonus: (baseCard.bonus ?? 0) + totalBonus / 100,
          enchant: baseCard.enchant ?? c.enchant,
          enchantLv: baseCard.enchant ? baseCard.enchantLv : c.enchantLv,
        }
      : null;

    return (
      <div>
        <div class="panel-title">献祭 {m.name} 刻印至 {baseM?.name ?? '主力卡牌'}</div>
        <div class="row gap16 center" style={{ alignItems: 'center', margin: '8px 0 14px' }}>
          <div class="col center gap4">
            <span class="faint" style={{ fontSize: 12 }}>献祭副卡（★{c.star}）</span>
            <MobCard mob={c.mob} card={c} size="sm" tip={false} />
          </div>
          <span class="cp-big-arrow">➜</span>
          {previewCard && (
            <div class="col center gap4">
              <span class="gold-t" style={{ fontSize: 12 }}>主力目标（刻印后）</span>
              <MobCard mob={previewCard.mob} card={previewCard} size="sm" tip={false} />
            </div>
          )}
        </div>
        <div class="cp-table">
          <div class="cp-row">
            <span class="subtle">印记与阶数</span>
            <span class="em" style={{ color: '#a29bfe' }}>
              {sDef?.name ?? '专属印记'} {romanTier} [{tierName}]
              {isSameSigil && <span class="gold-t" style={{ marginLeft: 6 }}>（同印记升级升阶！）</span>}
            </span>
          </div>
          <div class="cp-row">
            <span class="subtle">印记效果</span>
            <span style={{ fontSize: 12, color: '#dfe6e9' }}>{targetSigilDesc}</span>
          </div>
          <div class="cp-row">
            <span class="subtle">精魄滋养</span>
            <span class="em">
              全属性 +{totalBonus}%
              <span class="faint" style={{ fontSize: 12, marginLeft: 6 }}>
                (基础{rawEssence}% × 主力★{baseCard?.star ?? 1}吸收{Math.round(hostMul * 100)}%{resonance ? ' + 同系共鸣5%' : ''})
              </span>
            </span>
          </div>
          {!baseCard?.enchant && c.enchant && (
            <div class="cp-row">
              <span class="subtle">附魔继承</span>
              <span class="em" style={{ color: '#74b9ff' }}>{enchantName(c.enchant, c.enchantLv)}</span>
            </div>
          )}

        </div>
        <div class="cp-warn" style={{ marginTop: 12 }}>
          副卡 {m.name}（★{c.star}）将作为祭品永久消耗！
        </div>
      </div>
    );
  }
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
  const overwrite = after.enchant !== c.enchant && !!c.enchant;
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
