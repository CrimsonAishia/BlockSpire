import { useState } from 'preact/hooks';
import { MOBS, PLAYABLE_MOBS, RARITY_INFO, ROLE_INFO, mobDef, starStatMul, unitCount } from '../../data/mobs.ts';
import { CRATES } from '../../data/crates.ts';
import { ENCHANTS, ITEM_KIND_NAME, POTIONS, RELICS, RELIC_TIER_INFO, COMMANDER_MAP, COMMANDERS } from '../../data/items.ts';
import { FAMILY_LIST } from '../../data/families.ts';
import { ACHIEVEMENTS, ACH_CAT, ROMAN_OMEN, omenTier } from '../../meta/profile.ts';
import { RARITIES, type Family } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, FamBadge, RelicTipContent, Tip, itemIcon } from '../components/common.tsx';
import { go, profile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { KEYWORDS, RichText } from '../components/rich.tsx';
import { SURFACE_INFO } from '../../battle/terrain.ts';
import { CHARGE_RULE, COMBOS, COUNTERS } from '../../data/combos.ts';

/** V3.3 & V3.4 遗迹远征专属生物 ID 集合 */
const EXPEDITION_MOB_IDS = new Set<string>([
  // V3.3 远征生物
  'skeleton_vanguard', 'redstone_golem', 'soul_wisp', 'enchanter', 'geomancer',
  'royal_guard', 'wraith', 'necromancer', 'iceologer', 'whisperer', 'windcaller',
  'key_golem', 'mountaineer', 'leaper', 'poison_quill_vine', 'squall_golem',
  'drowned_necromancer', 'redstone_cube',
  // V3.4 地下城远征生物
  'baby_zombie', 'bat', 'snow_fox', 'pumpkin_turret', 'raven',
  'jungle_zombie', 'chicken_jockey', 'mooshroom', 'quick_vine', 'parrot',
  'ocelot', 'panda', 'abomination_vine',
  'sunken_skeleton', 'tropical_slime', 'pufferfish', 'glow_squid', 'gold_axolotl', 'turtle', 'dolphin',
  'piglin_hunter', 'piglin_swordsman', 'fungus_thrower', 'baby_ghast', 'armored_piglin',
  'rampart_captain', 'skeleton_horseman', 'llama', 'armored_mountaineer',
  'blastling', 'snareling', 'endersent', 'soul_wizard', 'tower_wraith', 'mob_spawner', 'enderling',
  // V3.3 & V3.4 远征首领
  'wretched_wraith', 'jungle_abomination', 'ancient_guardian', 'wildfire',
  'nameless_one', 'redstone_monstrosity', 'corrupted_cauldron', 'tempest_golem',
  'vengeful_heart', 'ancient_warden',
]);

/** V3.3 & V3.4 远征专属宝物 ID 集合 */
const EXPEDITION_RELIC_IDS = new Set<string>([
  // V3.3 远征宝物
  'corrupted_beacon_core', 'mycelium_spores', 'iron_hide_amulet', 'totem_grove',
  'feather_knot', 'firework_mechanism', 'hive_heart', 'gong_fragment',
  'soul_vessel', 'temporal_sand', 'amber_contract', 'cursed_crown',
  // V3.4 远征常规宝物
  'snow_armor', 'ocelot_armor', 'nourishment_satchel', 'guardian_eye',
  'thundering_quiver', 'enchanters_tome', 'ghost_cloak_relic', 'shadow_shifter',
  'frostbite_armor', 'full_metal_armor', 'assassins_armor', 'evocation_robe',
  'battle_robe', 'soul_robe', 'archers_armor', 'mercenary_armor',
  'champions_armor', 'reinforced_mail', 'grim_armor', 'mystery_armor',
  'spelunker_armor', 'dark_armor', 'wolf_armor', 'scale_mail',
  // V3.4 远征首领宝物
  'frost_scythe', 'stalwart_armor', 'winter_soul_bow', 'vine_whip',
  'shadow_walker', 'hunters_promise', 'encrusted_anchor', 'nimble_turtle',
  'coral_blade', 'mechanized_sawblade', 'gilded_piglin_armor', 'bone_club',
  'chill_gale_knife', 'gale_bow', 'opulent_armor', 'unstable_robes',
  'sturdy_shulker', 'swift_striker',
]);

/** V3.3 & V3.4 远征专属消耗道具 ID 集合 */
const EXPEDITION_ITEM_IDS = new Set<string>([
  // V3.3 道具
  'corrupted_beacon_charge', 'death_cap_mushroom', 'iron_hide_charm', 'healing_totem',
  'light_feather', 'firework_quiver', 'buzzy_nest', 'shock_powder', 'ghost_cloak', 'corrupted_seeds',
  // V3.4 道具
  'ice_wand', 'spinblade', 'powershaker', 'updraft_tome', 'water_breathing',
  'duplication_tome', 'fishing_rod_tool', 'wind_horn', 'weakening_gong', 'barrier_totem',
  'love_medallion', 'harvester', 'torment_quiver', 'harpoon_quiver', 'void_quiver',
  'emergency_satchel', 'rainbow_grass', 'wonderful_wheat', 'elemental_satchel', 'spore_bomb',
]);

type Tab = 'rules' | 'mobs' | 'relics' | 'enchants' | 'families' | 'combos' | 'achievements' | 'records';
const TABS: [Tab, string][] = [
  ['rules', '玩法说明'],
  ['mobs', '生物'],
  ['relics', '宝物'],
  ['enchants', '附魔与物品'],
  ['families', '羁绊'],
  ['combos', '联动与克制'],
  ['achievements', '成就'],
  ['records', '记录'],
];

export function Codex() {
  const [tab, setTab] = useState<Tab>('rules');
  const p = profile.value;
  return (
    <div class="screen codex-screen bg-stone bg-shade">
      <div class="codex-inner">
        <div class="row between">
          <div class="codex-title title-shadow">图鉴</div>
          <Btn onClick={() => go('title')}>返回</Btn>
        </div>
        <div class="codex-tabs">
          {TABS.map(([t, n]) => (
            <button key={t} class={`ctab ${tab === t ? 'on' : ''}`} onClick={() => (sfx('page'), setTab(t))}>
              {n}
            </button>
          ))}
        </div>
        <div class="codex-body panel">
          {tab === 'rules' && <RulesTab />}
          {tab === 'mobs' && <MobsTab discovered={p.discovered} />}
          {tab === 'relics' && <RelicsTab seen={p.relicsSeen} />}
          {tab === 'enchants' && <EnchantsTab />}
          {tab === 'families' && (
            <div class="codex-fams">
              {FAMILY_LIST.map((f) => (
                <div key={f.id} class="syn-card on">
                  <FamBadge f={f.id as Family} />
                  {f.tiers.map((t, i) => (
                    <div key={i} class="syn-tier on">
                      ({t.n}) {t.desc}
                    </div>
                  ))}
                  <div class="row gap4 wrap" style={{ marginTop: 6 }}>
                    {PLAYABLE_MOBS.filter((m) => m.families.includes(f.id)).map((m) => (
                      <img key={m.id} src={url.mob(m.id)} title={m.name} class={p.discovered.includes(m.id) ? '' : 'silhouette'} style={{ width: 34, height: 34, objectFit: 'contain' }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === 'combos' && (
            <div class="codex-cols">
              <div>
                <div class="tp-sec">联动（这些生物同时出战时触发）</div>
                {COMBOS.map((c) => (
                  <div key={c.id} class="codex-combo">
                    <div style={{ color: c.color, fontWeight: 700 }}>{c.name}</div>
                    <div class="row gap4 wrap">
                      {c.needs.map((g, i) => (
                        <span key={i} class="row gap4">
                          {i > 0 && <span class="faint">+</span>}
                          {g.slice(0, 5).map((m) => (
                            <img key={m} src={url.mob(m)} title={mobDef(m).name} class={p.discovered.includes(m) ? '' : 'silhouette'} style={{ width: 30, height: 30, objectFit: 'contain' }} />
                          ))}
                          {g.length > 5 && <span class="faint">…</span>}
                        </span>
                      ))}
                    </div>
                    <div class="subtle" style={{ fontSize: 14 }}>
                      <RichText text={c.desc} />
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <div class="tp-sec">克制（无论敌我，始终生效）</div>
                {COUNTERS.map((c, i) => (
                  <div key={i} class="codex-line">
                    <span class="row gap4">
                      {c.from.map((m) => (
                        <img key={m} src={url.mob(m)} title={mobDef(m).name} style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      ))}
                    </span>
                    <span class="subtle">{c.desc}</span>
                  </div>
                ))}
                <div class="tp-sec" style={{ marginTop: 10 }}>雷击</div>
                <div class="subtle">
                  <RichText text={CHARGE_RULE} />
                </div>
              </div>
            </div>
          )}
          {tab === 'achievements' && <AchievementsTab />}
          {tab === 'records' && (
            <div class="codex-cols">
              <div>
                <div class="tp-sec">生涯</div>
                <div class="es-row"><span>爬塔局数</span><span>{p.runs}</span></div>
                <div class="es-row"><span>通关次数</span><span>{p.wins}</span></div>
                <div class="es-row"><span>最高分</span><span class="gold-t">{p.bestScore}</span></div>
                <div class="es-row"><span>最高解锁难度</span><span>{p.maxOmen ? `不祥之兆 ${ROMAN_OMEN[p.maxOmen]}` : '普通'}</span></div>
                {COMMANDERS.map((c) => {
                  const best = p.bestOmen?.[c.id];
                  return (
                    <div key={c.id} class="es-row">
                      <span style={{ color: c.color }}>{c.name} · 最高通关</span>
                      <span class={`omen-best ${omenTier(best)}`}>{best === undefined ? '—' : best > 0 ? `不祥之兆 ${ROMAN_OMEN[best]}` : '普通'}</span>
                    </div>
                  );
                })}
                <div class="es-row"><span>累计绿宝石</span><span class="em">{p.totalEmeralds}</span></div>
                <div class="es-row"><span>竞技场</span><span>{p.classic.played} 场{p.classic.duels ? `（另有双人对战 ${p.classic.duels} 场）` : ''}</span></div>
                <div class="es-row"><span>竞技场竞猜</span><span>{p.classic.correct}/{p.classic.guesses}（最高连胜 {p.classic.best}{p.classic.upsets ? ` · 爆冷命中 ${p.classic.upsets}` : ''}）</span></div>
              </div>
              <div>
                <div class="tp-sec">最近对局</div>
                {p.history.length === 0 && <div class="faint">还没有记录</div>}
                {p.history.slice(0, 10).map((h, i) => (
                  <div key={i} class="hist-row">
                    <span class={h.won ? 'gold-t' : 'red-t'}>{h.won ? '通关' : `第${h.act}幕`}</span>
                    <span style={{ color: COMMANDER_MAP[h.commander]?.color }}>{COMMANDER_MAP[h.commander]?.name}</span>
                    <span class="row gap4">
                      {h.team.map((c, k) => (
                        <img key={k} src={url.mob(c.mob)} style={{ width: 26, height: 26, objectFit: 'contain' }} />
                      ))}
                    </span>
                    <span class="faint">{h.score} 分</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type MobFilter = 'all' | 'classic' | 'expedition' | 'boss';
const MOB_FILTERS: [MobFilter, string][] = [
  ['all', '全部'],
  ['classic', '经典篇章 (第1~4幕)'],
  ['expedition', '遗迹远征'],
  ['boss', '首领挑战'],
];

function MobsTab({ discovered }: { discovered: string[] }) {
  const [filter, setFilter] = useState<MobFilter>('all');
  const [sel, setSel] = useState<string>(PLAYABLE_MOBS[0].id);

  const m = mobDef(sel);
  const known = discovered.includes(sel) || m.hidden;
  const isExpeditionMob = EXPEDITION_MOB_IDS.has(sel);

  // 根据分类筛选展示的生物卡牌
  const filteredPlayable = PLAYABLE_MOBS.filter((x) => {
    if (filter === 'boss') return false;
    if (filter === 'classic') return !EXPEDITION_MOB_IDS.has(x.id);
    if (filter === 'expedition') return EXPEDITION_MOB_IDS.has(x.id);
    return true;
  });

  const allBosses = MOBS.filter((x) => x.boss);
  const filteredBosses = allBosses.filter((x) => {
    if (filter === 'classic') return !EXPEDITION_MOB_IDS.has(x.id);
    if (filter === 'expedition') return EXPEDITION_MOB_IDS.has(x.id);
    return true;
  });

  const totalDiscovered = PLAYABLE_MOBS.filter((x) => discovered.includes(x.id)).length;

  return (
    <div class="mobs-tab">
      <div class="mobs-list">
        <div class="row between center wrap" style={{ marginBottom: 10, gap: 6 }}>
          <div class="row gap6 wrap">
            {MOB_FILTERS.map(([k, label]) => (
              <button
                key={k}
                class={`mc-btn ${filter === k ? 'gold' : ''}`}
                style={{ padding: '3px 10px', fontSize: 13 }}
                onClick={() => (sfx('click', { vol: 0.4 }), setFilter(k))}
              >
                {label}
              </button>
            ))}
          </div>
          <div class="faint" style={{ fontSize: 13 }}>
            已发现 {totalDiscovered}/{PLAYABLE_MOBS.length}
          </div>
        </div>

        {filter !== 'boss' &&
          RARITIES.map((r) => {
            const list = filteredPlayable.filter((x) => x.rarity === r);
            if (list.length === 0) return null;
            return (
              <div key={r} class="mob-group">
                <div class="mg-title" style={{ color: RARITY_INFO[r].color }}>
                  {RARITY_INFO[r].name} <span class="faint" style={{ fontSize: 12 }}>({list.length})</span>
                </div>
                <div class="mg-items">
                  {list.map((x) => {
                    const k = discovered.includes(x.id);
                    return (
                      <button
                        key={x.id}
                        class={`mg-item r-${r} ${sel === x.id ? 'on' : ''}`}
                        title={k ? x.name : '？？？'}
                        onClick={() => (sfx('click', { vol: 0.4 }), setSel(x.id))}
                      >
                        <img src={url.mob(x.id)} class={k ? '' : 'silhouette'} />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

        {filteredBosses.length > 0 && (
          <div class="mob-group">
            <div class="mg-title gold-t">
              首领挑战 <span class="faint" style={{ fontSize: 12 }}>({filteredBosses.length})</span>
            </div>
            <div class="mg-items">
              {filteredBosses.map((x) => (
                <button
                  key={x.id}
                  class={`mg-item r-gold ${sel === x.id ? 'on' : ''}`}
                  title={x.name}
                  onClick={() => (sfx('click', { vol: 0.4 }), setSel(x.id))}
                >
                  <img src={url.mob(x.id)} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div class={`mob-detail r-${m.rarity}`}>
        <div class="md-art">
          <img src={url.mob(sel)} class={known ? '' : 'silhouette'} />
        </div>
        <div class="md-name rc">{known ? m.name : '？？？'}</div>
        <div class="row gap8 center center wrap" style={{ margin: '2px 0' }}>
          <span class="faint">
            {RARITY_INFO[m.rarity].name} · {ROLE_INFO[m.role].icon} {ROLE_INFO[m.role].name}
          </span>
          {isExpeditionMob && (
            <span class="tag" style={{ color: '#00e5ff', borderColor: 'rgba(0,229,255,0.5)', background: 'rgba(0,229,255,0.1)' }}>
              遗迹远征
            </span>
          )}
          {m.boss && (
            <span class="tag" style={{ color: '#ffd166', borderColor: 'rgba(255,209,102,0.5)', background: 'rgba(255,209,102,0.1)' }}>
              首领{m.skill.desc.includes('破势') ? ' · 支持破势' : ''}
            </span>
          )}
        </div>
        {known ? (
          <>
            <div class="row gap4 center wrap" style={{ margin: '6px 0' }}>
              {m.families.map((f) => (
                <FamBadge key={f} f={f} />
              ))}
            </div>
            {!m.boss && (
              <table class="md-stats">
                <thead>
                  <tr>
                    <th />
                    <th>★1</th>
                    <th>★2</th>
                    <th>★3</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>数量</td>
                    {[1, 2, 3].map((s) => (
                      <td key={s}>×{unitCount(m, s)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>生命</td>
                    {[1, 2, 3].map((s) => (
                      <td key={s}>{Math.round(m.hp * starStatMul(m, s))}</td>
                    ))}
                  </tr>
                  <tr>
                    <td>攻击</td>
                    {[1, 2, 3].map((s) => (
                      <td key={s}>{Math.round(m.atk * starStatMul(m, s))}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
            <div class="md-line">
              攻击间隔 {m.cd}s · {m.range >= 60 ? `射程 ${m.range}` : '近战'} · 移速 {m.speed}
              {m.armor > 0 && ` · 护甲 ${Math.round(m.armor * 100)}%`}
            </div>
            <div class="md-skill">
              <span class="gold-t">【{m.skill.name}】</span>
              <RichText text={m.skill.desc} />
            </div>
            {m.star3 && (
              <div class="md-star3">
                ★3：<RichText text={m.star3} />
              </div>
            )}
            <div class="md-flavor faint">「{m.flavor}」</div>
            {!m.hidden && (
              <div class="faint" style={{ fontSize: 13 }}>
                出现于：
                {CRATES.filter((c) => RARITIES.some((r) => c.pool[r].includes(m.id)))
                  .map((c) => c.name)
                  .join('、') || '遗迹远征补给箱'}
              </div>
            )}
          </>
        ) : (
          <div class="faint" style={{ marginTop: 20 }}>
            开出这只生物后解锁详细信息。
          </div>
        )}
      </div>
    </div>
  );
}

type RelicFilter = 'all' | 'regular' | 'synergy' | 'expedition' | 'boss';
const RELIC_FILTERS: [RelicFilter, string][] = [
  ['all', '全部'],
  ['regular', '基础常规'],
  ['synergy', '流派与统领'],
  ['expedition', '遗迹远征'],
  ['boss', '首领战利品'],
];

function RelicsTab({ seen }: { seen: string[] }) {
  const [filter, setFilter] = useState<RelicFilter>('all');

  const filtered = RELICS.filter((r) => {
    const isExpedition = EXPEDITION_RELIC_IDS.has(r.id);
    if (filter === 'boss') return r.tier === 'boss';
    if (filter === 'expedition') return isExpedition;
    if (filter === 'synergy') return !isExpedition && (!!r.tag || !!r.commander) && r.tier !== 'boss';
    if (filter === 'regular') return !isExpedition && !r.tag && !r.commander && r.tier !== 'boss';
    return true;
  });

  const discoveredCount = filtered.filter((r) => seen.includes(r.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <div class="row between center wrap" style={{ flexShrink: 0, gap: 8 }}>
        <div class="row gap8 wrap">
          {RELIC_FILTERS.map(([k, label]) => (
            <button
              key={k}
              class={`mc-btn ${filter === k ? 'gold' : ''}`}
              style={{ padding: '3px 12px', fontSize: 14 }}
              onClick={() => (sfx('click', { vol: 0.4 }), setFilter(k))}
            >
              {label}
            </button>
          ))}
        </div>
        <div class="faint" style={{ fontSize: 14 }}>
          已解锁 {discoveredCount}/{filtered.length}
        </div>
      </div>
      <div class="codex-grid relics" style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.map((r) => {
          const isSeen = seen.includes(r.id);
          const isExpedition = EXPEDITION_RELIC_IDS.has(r.id);
          return (
            <Tip
              key={r.id}
              content={() =>
                isSeen ? (
                  <RelicTipContent id={r.id} />
                ) : (
                  <div class="tt-gray">
                    尚未获得{r.commander ? ` · ${COMMANDER_MAP[r.commander].name}专属` : isExpedition ? ' · 遗迹远征' : ''}
                  </div>
                )
              }
              class={`codex-relic ${isSeen ? '' : 'unseen'}`}
            >
              <img src={url.icon(r.icon ?? r.id)} class="pixelated" />
              <div style={{ color: isSeen ? RELIC_TIER_INFO[r.tier].color : '#555' }}>
                {isSeen ? r.name : '？？？'}
              </div>
              {(r.tag || r.commander || isExpedition || r.tier === 'boss') && (
                <div class="faint" style={{ fontSize: 11, color: isExpedition ? '#00e5ff' : r.tier === 'boss' ? '#ff6060' : undefined }}>
                  {r.commander ? `${COMMANDER_MAP[r.commander].name}专属` : isExpedition ? (r.tag ? `${r.tag} · 远征` : '遗迹远征') : r.tier === 'boss' ? '首领' : r.tag}
                </div>
              )}
            </Tip>
          );
        })}
      </div>
    </div>
  );
}

function EnchantsTab() {
  const [filter, setFilter] = useState<'all' | 'classic' | 'expedition'>('all');

  return (
    <div class="codex-cols">
      <div>
        <div class="tp-sec">附魔书（每张卡牌 1 个，同名合成升级 I → III）</div>
        {ENCHANTS.map((e) => (
          <div key={e.id} class="codex-line">
            <img src={url.icon('enchanted_book')} class="pixelated" />
            <span style={{ color: e.color, minWidth: 120 }}>{e.name}</span>
            <span class="subtle">
              {e.text.replace(/\{(\d)\}/g, (_, k) => e.vals[Number(k)].join('/'))}
              {e.only && <span class="faint">（仅{e.only === 'melee' ? '近战' : '远程'}）</span>}
            </span>
          </div>
        ))}
      </div>
      <div>
        <div class="row between center wrap" style={{ marginBottom: 4, gap: 6 }}>
          <div class="tp-sec" style={{ margin: 0 }}>战斗物品（战斗中从物品栏使用，一次性）</div>
          <div class="row gap4">
            {(
              [
                ['all', '全部'],
                ['classic', '经典'],
                ['expedition', '远征 (V3.3–3.4)'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                class={`mc-btn ${filter === k ? 'gold' : ''}`}
                style={{ padding: '1px 8px', fontSize: 12 }}
                onClick={() => setFilter(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {(['drink', 'splash', 'lingering', 'tool', 'egg'] as const).map((k) => {
          const list = POTIONS.filter((e) => {
            if (e.kind !== k) return false;
            const isExp = EXPEDITION_ITEM_IDS.has(e.id);
            if (filter === 'classic') return !isExp;
            if (filter === 'expedition') return isExp;
            return true;
          });
          if (list.length === 0) return null;
          return (
            <div key={k}>
              <div class="faint" style={{ fontSize: 13, margin: '6px 0 2px' }}>
                {ITEM_KIND_NAME[k]} <span style={{ fontSize: 11 }}>({list.length})</span>
              </div>
              {list.map((e) => {
                const isExp = EXPEDITION_ITEM_IDS.has(e.id);
                const hasPosture = e.desc.includes('破势');
                return (
                  <div key={e.id} class="codex-line">
                    <img src={itemIcon(e.id)} class="pixelated" />
                    <span style={{ color: e.color, minWidth: 120, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {e.name}
                      {isExp && (
                        <span class="tag" style={{ color: '#00e5ff', fontSize: 10, padding: '0 4px', borderColor: 'rgba(0,229,255,0.4)', background: 'rgba(0,229,255,0.1)' }}>
                          远征
                        </span>
                      )}
                      {hasPosture && (
                        <span class="tag" style={{ color: '#ffd166', fontSize: 10, padding: '0 4px', borderColor: 'rgba(255,209,102,0.4)', background: 'rgba(255,209,102,0.1)' }}>
                          破势
                        </span>
                      )}
                    </span>
                    <span class="subtle">
                      <RichText text={e.desc} />
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RULES: [string, string[]][] = [
  ['核心循环与七幕远征', [
    '开箱获得生物卡牌 → 战前在地形上布阵 → 双方全自动混战 → 胜利后挑选补给箱 → 沿地图向上攀爬。',
    '经典前四幕：主世界 → 下界 → 末地 → 筛界。击败各幕顶端首领出战栏位逐步扩充（第 1 幕击败后为 4 卡，第 2 幕 5 卡，第 3 幕 6 卡），并奖励一件强力首领宝物。',
    '击败末影龙后可进入第四幕「筛界」（敌人全是筛界生物）；击败幽匿巨像有额外专属积分与成就。',
    '遗迹远征（第 5~7 幕）：突破第四幕筛界后，队伍将挺进更深邃的失落遗迹（第 5 幕 遗迹深潜、第 6 幕 堡垒/神殿、第 7 幕 破碎城堡）。出战栏位最大可扩充至 7 张生物卡，全屏军团与远古灾厄正面对决！',
  ]],
  ['远征机制与首领破势', [
    '队伍扩容至 7 卡：在远征军备支持下，队伍规模突破至 6~7 张生物卡，可组合更宏大的阵型与多重羁绊。',
    '首领蓄势与破势打断：远征首领（无名者、红石巨兽、腐化坩埚、远古石卫、复仇之心等）施放毁灭绝招前会有 2.4 秒公开【蓄势】吟唱条。在此期间遭受攻击、重击或控制道具可累积【破势】槽，满 100 破势打断绝招并使首领瘫痪 2.5 秒！',
    '首领专属战利品：包含 18 件远征首领专属宝物（如寒霜镰刀、暗影行者护甲、覆壳锚、珊瑚剑、机械锯刃、疾风战备等），提供极端强大的流派构筑机制。',
    '灵魂收集与战术军备：新一代远征法杖与遗物（灵魂容器、腐化信标、收割者、虚空箭袋等）支持收集阵亡单位灵魂，并在充盈时释放强力全屏法术轰炸。',
  ]],
  ['不祥之兆（难度）', [
    '普通难度通关后解锁「不祥之兆」挑战等级 I~V，参考杀戮尖塔的进阶：每一级保留之前的全部规则，再加上新的规则。',
    'I 精英出没：精英战更多、更早出现。II 精英词缀：精英战的敌人带再生、荆棘、迅捷、坚韧或嗜血之一。III 物资紧缺：少 1 颗心、物品栏 -1、商店涨价，普通战斗里有一张敌方卡牌带附魔。IV 精锐护卫：休息只回 1 颗心，精英战和首领战里也有附魔敌人。V 末日：首领半血时狂暴并召唤护卫。',
    '每升一级敌人生命 +3%、攻击 +2%，但开箱也更幸运（+2%），得分 +20%。每位统领分别记录最高通关难度，并获得铜（I–II）、银（III–IV）、金（V）统领边框。',
  ]],
  ['筛界（第四维度）', [
    '2026 年 Minecraft Live 公布的新维度：青色天空、粉色草甸、白骨树林和甲壳荒原。第二、三幕的地图上偶尔会出现「筛界裂隙」节点，胜利后可以开启只含筛界生物的「裂隙」补给箱。',
    '灵魂潮汐：筛界的维度规则。带 2 种以上筛界生物的队伍可以免疫。',
    'Ouch 水：伤害外来者、治疗筛界生物。把敌人顶进去吧！',
    '筛界生物自带回响；筛界羁绊 ③ 还能吸收阵亡敌人的灵魂回血。',
  ]],
  ['联动与事件链', [
    '联动：特定生物一起出战会触发额外效果，例如劫掠兽 + 灾厄村民（袭击队伍）、两种骷髅（箭雨）、歌者 + 幽匿生物（幽匿歌谣）。图鉴「联动与克制」页有完整列表。',
    '克制：狼猎杀骷髅、寒冷克制火焰、傀儡守护村庄……这些关系无论敌我都会生效。',
    '事件链：有些「？」事件会延续到后面的楼层甚至下一幕——你帮过的流浪商人会回来报答你，抢过他的话他会带着铁傀儡来报复；扛起不祥旗帜会引来袭击队伏击。',
  ]],
  ['品质与升星', [
    '品质：军规（蓝）< 受限（紫）< 保密（粉）< 隐秘（红）< 罕见特殊（金）。品质越高单体越强、数量越少。',
    '重复开出已拥有的生物会自动升星：★1→★2 需 1 张，★2→★3 需 2 张。★3 解锁该生物的强化能力。',
    '升星收益：品质越低，每颗星提升越多（军规 ★3 约为 ★1 的 2.8 倍，隐秘只有 2.15 倍）——养一张满星军规卡，和抽到一张隐秘卡一样有用。',
    '营火与商店的锻造能把任何卡牌升到 ★2；隐秘与罕见特殊卡想升到 ★3 只能靠重复开出。',
    '开箱有保底：连续多次没出红/金，下一次的高品质几率会逐渐提升。',
  ]],
  ['生物战术', [
    '双方生物都会自己判断：挑目标、走位、躲技能、挑时机放技能。卡牌说明里的「战术」一栏写着它的习惯。',
    '远程：抢占射程内的高地，绕开树木等遮挡寻找射击角度，近战逼近时后撤拉开距离，并尽量待在己方前排身后。',
    '近战：就近交战，不惧爬坡但会绕开岩浆；看到苦力怕点火、唤魔者尖牙、恶魂火球落点等预警会尝试闪避（坦克反应慢，刺客最灵活）。',
    '坦克与辅助会「掩护」：优先拦截正在攻击己方远程的敌人。范围攻击会瞄准敌人最密集的位置。',
    '战斗中生物头顶的小字（掩护!、抢占高地、后撤、闪避!、撞进岩浆!）说明它此刻在做什么。',
    '敌人同样聪明。布阵时把远程放在高地附近、让坦克挡在前面，它们能发挥得更好。',
  ]],
  ['战斗规则', [
    '刺客类（幻翼、末影人）会直接切入后排远程。',
    '飞行单位越过地形；高空飞行时近战无法攻击到它，只能靠远程。',
    '战斗超过 60 秒（首领战 80 秒）会触发末影风暴，所有单位持续流失生命。',
    '首领战失败扣 2 心后可以再战，首领会保留你造成的一半伤害（首领带伤）。',
  ]],
  ['地形与布阵', [
    '每场战斗都有随机战场。布阵阶段把小队拖到蓝色区域即可，鼠标悬停地面可查看地形效果。',
    '居高临下：远程单位站在高处射程更远、伤害更高；攀爬高地很慢（蜘蛛除外）。',
    '树木、岩石、柱子等会阻挡移动，生物会自动绕路；它们和山坡还是掩体，能挡住箭矢、火球等投射物（潜影弹和首领的攻击除外）。',
    '摔落：被撞下 2 格以上的高台会受到摔落伤害并短暂眩晕。山羊尤其喜欢把敌人顶下高台、顶进岩浆。',
    '地形破坏：所有爆炸都会留下焦痕；较大的爆炸会炸掉树木岩石、把高地削低，掩体可能在战斗中消失。破坏有上限，不会把战场炸成平地。',
    '群系加持：雪地里的雪傀儡/流浪者/北极熊/山羊攻速提升；沙地里的尸壳攻击提升；水生生物在水中加速回血；免疫燃烧的生物无视岩浆；节肢生物无视蜘蛛网；末影人碰水受伤。',
    '冰洞的脆冰会被踩碎成水洼；硫磺立方会吞下脚下的方块，站在不同地面上开战会变成不同的形态。',
  ]],
  ['统领与流派', [
    '每位统领都有自己的「统领技能」（物品栏左边，按 Q / E）、特色机制和 3–4 件专属宝物，玩法完全不同。',
    '史蒂夫·建造者：布阵时就能砌墙、垫土台。墙挡住敌人的行走和投射物（我方的箭能越墙），把敌人引进窄口；3×3 的土台让远程坚守高台、居高临下。紧挨己方墙或站在土台上的友军受到伤害 -20%。墙不能把路完全堵死，会被爆炸炸毁。',
    '亚历克斯·驯兽师：驯服生命足够低的敌人让它倒戈，赢下战斗后还能把它收为卡牌——精英战里的强敌也能收服。',
    '村民·大商人：商店里可以「订购」指定的生物；战斗中花绿宝石雇佣铁傀儡。钱越多越强。',
    '女巫·药剂师：每场开战都有一瓶免费的限定药水；药水更强、范围更大，中毒与燃烧伤害更高。',
    '流派宝物会让某种打法越滚越强：岩浆膏（燃烧）、河豚（剧毒）、刷怪笼（数量）、滴水石锥（击退撞墙与摔落）、火焰弹（爆破）、瞭望塔（高地远程）、回响碎片（献祭）。配合羁绊和统领机制组出自己的流派。',
  ]],
  ['生命与经济', [
    '❤ 是整局的生命：普通战败 -1，精英/首领战败 -2，归零即失败（不死图腾可复活一次）。',
    '绿宝石用于商店购买补给箱、物品、附魔书与宝物；分解多余卡牌也能获得绿宝石。',
    '营火可以休息回血、锻造升星或附魔。',
    '物品（药水、风弹、TNT、刷怪蛋……）在战斗中使用：点击下方物品栏或按数字键 1–5，再点击战场上的目标位置。饮用药水和山羊角立即生效；刷怪蛋只能放在我方半场。',
  ]],
];

function RulesTab() {
  return (
    <div class="rules">
      <div class="rules-main">
        {RULES.map(([title, lines]) => (
          <div key={title} class="rules-sec">
            <div class="tp-sec">{title}</div>
            {lines.map((l) => (
              <div key={l} class="rules-line">
                · <RichText text={l} />
              </div>
            ))}
          </div>
        ))}
        <div class="rules-sec">
          <div class="tp-sec">地表一览</div>
          <div class="surf-grid">
            {Object.values(SURFACE_INFO)
              .filter((x) => x.move !== 1 || x.liquid)
              .map((x) => (
                <span key={x.name} class="tag">
                  {x.name} 移速×{x.move}
                </span>
              ))}
          </div>
        </div>
      </div>
      <div class="rules-kw">
        <div class="tp-sec">关键词</div>
        {Object.entries(KEYWORDS).map(([k, v]) => (
          <div key={k} class="kw-def">
            <b style={{ color: v.color }}>{k}</b>：{v.desc}
          </div>
        ))}
      </div>
    </div>
  );
}

function AchievementsTab() {
  const p = profile.value;
  const got = ACHIEVEMENTS.filter((a) => p.achievements[a.id]).length;
  return (
    <div class="ach-tab">
      <div class="ach-sum">
        已达成 <b class="gold-t">{got}</b> / {ACHIEVEMENTS.length}
        <div class="ach-bar">
          <div style={{ width: `${(got / ACHIEVEMENTS.length) * 100}%` }} />
        </div>
      </div>
      {ACH_CAT.map(([cat, label]) => {
        const list = ACHIEVEMENTS.filter((a) => a.cat === cat);
        const n = list.filter((a) => p.achievements[a.id]).length;
        return (
          <div key={cat}>
            <div class="tp-sec">
              {label} <span class="faint">{n}/{list.length}</span>
              {cat === 'secret' && <span class="faint"> · 达成之前只显示一句提示</span>}
            </div>
            <div class="codex-ach">
              {list.map((a) => {
                const t = p.achievements[a.id];
                const hidden = cat === 'secret' && !t;
                return (
                  <div key={a.id} class={`ach ${t ? 'on' : ''} ${cat}`}>
                    <div class="ach-icon">{t ? '★' : hidden ? '?' : '☆'}</div>
                    <div>
                      <div class={t ? 'gold-t' : 'faint'}>{hidden ? '？？？' : a.name}</div>
                      <div class="subtle" style={{ fontSize: 14 }}>
                        {hidden ? a.hint : a.desc}
                      </div>
                      {t > 1e12 && <div class="ach-date faint">{new Date(t).toLocaleDateString('zh-CN')} 达成</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
