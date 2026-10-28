import type { Pending, RunState } from '../../run/run.ts';
import { choosePotion, chooseRelic } from '../../run/run.ts';
import { ITEM_KIND_NAME, ITEM_TIER_INFO, POTION_MAP, RELIC_MAP, RELIC_TIER_INFO } from '../../data/items.ts';
import { url } from '../assets.ts';
import { Btn, HeartIcon, itemIcon } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';
import { RichText } from '../components/rich.tsx';

function RelicTile({ id, onPick }: { id: string; onPick: () => void }) {
  const r = RELIC_MAP[id];
  const t = RELIC_TIER_INFO[r.tier];
  return (
    <div class={`relic-tile tier-${r.tier}`} style={{ '--tc': t.color } as never} onClick={() => (sfx('relic'), onPick())}>
      <div class="rt-glow" />
      <img src={url.icon(r.icon ?? id)} class="pixelated float" />
      <div class="rt-name" style={{ color: t.color }}>
        {r.name}
      </div>
      <div class="rt-tier">{t.name}宝物</div>
      <div class="rt-desc">
        <RichText text={r.desc} />
      </div>
    </div>
  );
}

export function RelicChoice({ p }: { s: RunState; p: Extract<Pending, { type: 'relic_choice' }>; v?: number }) {
  return (
    <div class="screen choice-screen">
      <div class="choice-head">
        <div class="choice-title title-shadow">{p.title}</div>
        <div class="subtle">宝物在整局中持续生效。</div>
      </div>
      <div class="relic-tiles">
        {p.choices.map((id) => (
          <RelicTile key={id} id={id} onPick={() => act((r) => chooseRelic(r, id))} />
        ))}
        {!p.choices.length && <div class="subtle">这里空空如也……</div>}
      </div>
      <div class="choice-foot">{(p.skippable || !p.choices.length) && <Btn onClick={() => act((r) => chooseRelic(r, null))}>跳过</Btn>}</div>
    </div>
  );
}

export function BossReward({ s, p }: { s: RunState; p: Extract<Pending, { type: 'boss_reward' }>; v?: number }) {
  return (
    <div class="screen choice-screen boss-reward">
      <div class="choice-head">
        <div class="choice-title title-shadow gold-t">首领已被击败！</div>
        <div class="row gap24 center" style={{ fontSize: 20 }}>
          {p.slotGained && <span class="em">✦ 出战栏位 +1（现在 {s.slots} 个）</span>}
          {p.healed > 0 && (
            <span class="row gap4">
              回复 {p.healed} <HeartIcon size={20} />
            </span>
          )}
        </div>
        <div class="subtle">{p.relics.length ? '选择一件首领宝物——它们强大，但往往伴随代价。' : '当前可获得的首领宝物已全部收集，继续前进。'}</div>
      </div>
      <div class="relic-tiles">
        {p.relics.map((id) => (
          <RelicTile key={id} id={id} onPick={() => act((r) => chooseRelic(r, id))} />
        ))}
      </div>
      <div class="choice-foot">
        <Btn onClick={() => act((r) => chooseRelic(r, null))}>{p.relics.length ? '不要宝物' : '继续'}</Btn>
      </div>
    </div>
  );
}

function PotionTile({ id, onPick }: { id: string; onPick: () => void }) {
  const p = POTION_MAP[id];
  if (!p) return null;
  const t = ITEM_TIER_INFO[p.tier];
  return (
    <div class={`relic-tile tier-${p.tier}`} style={{ '--tc': p.color || t.color } as never} onClick={() => (sfx('buy'), onPick())}>
      <div class="rt-glow" />
      <img src={itemIcon(id)} class="pixelated float" />
      <div class="rt-name" style={{ color: p.color || t.color }}>
        {p.name}
      </div>
      <div class="rt-tier">
        {t.name} · {ITEM_KIND_NAME[p.kind]}
        {p.radius > 0 ? ` · 半径 ${p.radius} 格` : ''}
      </div>
      <div class="rt-desc">
        <RichText text={p.desc} />
      </div>
    </div>
  );
}

export function PotionChoice({ p }: { s: RunState; p: Extract<Pending, { type: 'potion_choice' }>; v?: number }) {
  return (
    <div class="screen choice-screen">
      <div class="choice-head">
        <div class="choice-title title-shadow">{p.title ?? '选择特供道具'}</div>
        <div class="subtle">战斗中点击下方物品栏（或按对应数字键）使用道具。</div>
      </div>
      <div class="relic-tiles">
        {p.choices.map((id) => (
          <PotionTile key={id} id={id} onPick={() => act((r) => choosePotion(r, id))} />
        ))}
        {!p.choices.length && <div class="subtle">这里空空如也……</div>}
      </div>
      <div class="choice-foot">{(p.skippable || !p.choices.length) && <Btn onClick={() => act((r) => choosePotion(r, null))}>跳过</Btn>}</div>
    </div>
  );
}

