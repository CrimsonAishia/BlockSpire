import { useState } from 'preact/hooks';
import { MOBS, PLAYABLE_MOBS, RARITY_INFO, ROLE_INFO, mobDef, starStatMul, unitCount } from '../../data/mobs.ts';
import { DIFFICULTY_POLICIES } from '../../data/difficulty.ts';
import { CRATES } from '../../data/crates.ts';
import { ENCHANTS, ITEM_KIND_NAME, POTIONS, RELICS, RELIC_MAP, RELIC_TIER_INFO, COMMANDER_MAP } from '../../data/items.ts';
import { COMMANDERS } from '../../data/commanders.ts';
import { TACTIC_DEFS, TACTIC_POOL, TACTIC_VARIANTS, COMMANDER_VARIANTS } from '../../data/tactics.ts';
import { FAMILY_LIST } from '../../data/families.ts';
import { ACHIEVEMENTS, ACH_CAT, ROMAN_OMEN, type HistoryEntry } from '../../meta/profile.ts';
import { RARITIES, type Family } from '../../core/types.ts';
import { url } from '../assets.ts';
import { Btn, FamBadge, Modal, RelicTipContent, Tip, itemIcon } from '../components/common.tsx';
import { go, profile, pushToast, updateProfile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { KEYWORDS, RichText } from '../components/rich.tsx';
import { SURFACE_INFO } from '../../battle/terrain.ts';
import { CHARGE_RULE, COMBOS, COUNTERS } from '../../data/combos.ts';

/** V3.3 & V3.4 遗迹远征专属生物 ID 集合 */
const EXPEDITION_MOB_IDS = new Set<string>([
  // V3.3 远征生物
  'skeleton_vanguard', 'redstone_golem', 'soul_wisp', 'enchanter', 'geomancer',
  'royal_guard', 'wraith', 'necromancer', 'iceologer', 'whisperer', 'windcaller',
  'key_golem', 'mountaineer', 'leaper', 'squall_golem',
  'drowned_necromancer', 'redstone_cube',
  // V3.4 地下城远征生物
  'baby_zombie', 'bat', 'snow_fox', 'pumpkin_turret', 'raven',
  'jungle_zombie', 'chicken_jockey', 'mooshroom', 'parrot',
  'ocelot', 'panda',
  'sunken_skeleton', 'tropical_slime', 'pufferfish', 'glow_squid', 'gold_axolotl', 'turtle', 'dolphin',
  'piglin_hunter', 'piglin_swordsman', 'fungus_thrower', 'baby_ghast', 'armored_piglin',
  'rampart_captain', 'skeleton_horseman', 'llama', 'armored_mountaineer',
  'blastling', 'snareling', 'endersent', 'soul_wizard', 'tower_wraith', 'mob_spawner', 'enderling',
  // 地下城扩展（群落与异种新卡 + 高稀有度卡）
  'baby_drowned', 'rabbit_scout', 'woolly_cow', 'baby_turtle',
  'mossy_skeleton', 'enchanted_blue_sheep',
  'enchanted_red_sheep', 'enchanted_green_sheep', 'vex_raider', 'zombified_piglin',
  'zombified_hunter', 'wither_archer', 'wave_whisperer', 'armored_pillager',
  'armored_vindicator', 'armored_drowned', 'icy_creeper',
  'tower_guard', 'arch_illager', 'poison_tower_wraith',
  'mooshroom_monstrosity', 'heart_of_ender',
  'frostbound_wraith', 'wildfire_sentinel', 'abyssal_guardian', 'nameless_sovereign',
  'redstone_colossus', 'verdant_abomination', 'tempest_warden', 'void_sovereign',
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

type Tab = 'rules' | 'tactics' | 'mobs' | 'relics' | 'enchants' | 'families' | 'combos' | 'achievements' | 'records';
const TABS: [Tab, string][] = [
  ['rules', '玩法说明'],
  ['tactics', '副战术与精进'],
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
          {tab === 'tactics' && <TacticsTab p={p} />}
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
          {tab === 'records' && <RecordsTab p={p} />}
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
    'I 增加精英与编队协同；II 精英获得词缀与战术；III 开局少 1 颗心、商店涨价 10%，第二幕起出现必经精英；IV 物价上涨至 15%，后续精英固定双战术；V 首领半血狂暴，第三幕起双精英闸门与终局连战。',
    `不祥 III／IV／V 在统领原有资金之外，分别提供一次性起始补助 ${DIFFICULTY_POLICIES.slice(3).map((p) => p.startingEmeraldBonus).join('／')} 绿宝石。难度不会提高开箱幸运；各级敌方强化与通关积分倍率见出发界面。每位统领分别记录最高通关难度，并获得铜（I–II）、银（III–IV）、金（V）统领边框。`,
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
    '每位统领都有专属的「统领技能」（开战在物品栏旁，按 Q 或 E 施放）、独特机制和 3–4 件专属宝物。在地图上的战技殿堂里，还可以挑选专属的【身份精进】路线（2 选 1），玩法风格完全不同。',
    '史蒂夫·建造者：布阵时就能砌墙、垫高台。紧挨墙壁或站在高台上的友军受到伤害减少 20%。战技殿堂里可走「坚垒工程」（掩体更硬、减伤提至 25%）或「火力工事」（登台射手开战攻速爆发）。',
    '亚历克斯·驯兽师：点残血敌人立刻让它倒戈，赢了还能收为生物卡。可走「安抚契约」（大幅放宽驯服血线，半血也能抓）或「短期借兵」（驯服单位攻击力暴增，但战后不带走）。',
    '村民·大商人：商店里能指定买想要的卡，战斗中还能花绿宝石雇铁傀儡。可走「轻装雇佣」（雇傀儡更便宜）或「风险投资」（战前下注对赌，18 秒内速胜大赚一笔！）。',
    '女巫·药剂师：每场开战自动熬制一瓶免费药水，药效更强、范围更大。可走「定向配方」（临时药水 2 选 1）或「应急双酿」（开战多熬一瓶，但单瓶药效稍打折）。',
    '流派宝物会让某种打法越滚越强：岩浆膏（燃烧）、河豚（剧毒）、刷怪笼（数量）、滴水石锥（撞墙摔落）、火焰弹（爆破）、瞭望塔（高地射击）、回响碎片（献祭）。配合羁绊和副战术组出自己的打法。',
  ]],
  ['副战术与军令', [
    '军令怎么用：开战直接获得 1 点军令，战斗打到 12 秒再补 1 点，每场战斗最多施放 2 次副战术。每次消耗 1 点军令，全队共用 8 秒冷却，找准关键时机放！',
    '六大战场战术：遥控爆破（炸飞并打晕敌人）、战术撤退（全员加速拉开距离）、强酸喷溅（破除护盾与削弱护甲）、应急钱炮（花钱远程斩杀补刀）、烟幕掩护（掩护友军减免远程伤害）、应急护符（全体套上紧急护盾）。',
    '群体上限与首领霸体：大范围伤害和护盾都有总额上限，怪再多也会均匀分摊，不会无脑秒怪；首领敌人天生霸体，不会被击退，打晕时间极短，破盾比例也会减半。',
    '战技殿堂与卷轴：踩中地图上的「战技殿堂」可以免费自选 1 个新战术（一攻一防保底备选）；还能花点绿宝石精进统领的专属技能。商店里偶尔也会卖「副战术卷轴」，买了就能再学新战术。',
  ]],
  ['生命与经济', [
    '❤ 是整局的生命：普通战败 -1，精英/首领战败 -2，归零即失败（不死图腾可复活一次）。',
    '绿宝石用于商店购买补给箱、物品、附魔书与宝物；分解多余卡牌也能获得绿宝石。',
    '营火可以休息回血、锻造升星或附魔。',
    '物品（药水、风弹、TNT、刷怪蛋……）在战斗中使用：点击下方物品栏或按数字键 1–5，再点击战场上的目标位置。饮用药水和山羊角立即生效；刷怪蛋只能放在我方半场。',
  ]],
];

type TacticFilter = 'all' | 'offense' | 'defense' | 'commanders' | 'rules';
const TACTIC_FILTERS: [TacticFilter, string][] = [
  ['all', '全部'],
  ['offense', '进攻战术'],
  ['defense', '防御战术'],
  ['commanders', '统领精进'],
  ['rules', '战术规则'],
];

function TacticsTab({ p }: { p: typeof profile.value }) {
  const [filter, setFilter] = useState<TacticFilter>('all');
  const tacticsSeen = p.tacticsSeen ?? [];
  const variantsSeen = p.variantsSeen ?? [];

  const tacticsSeenCount = TACTIC_POOL.filter((id) => tacticsSeen.includes(id)).length;
  const tacticVariantsTotal = Object.values(TACTIC_VARIANTS).flat().length;
  const tacticVariantsSeenCount = Object.values(TACTIC_VARIANTS)
    .flat()
    .filter((v) => variantsSeen.includes(v.id)).length;
  const cmdVariantsTotal = Object.values(COMMANDER_VARIANTS).flat().length;
  const cmdVariantsSeenCount = Object.values(COMMANDER_VARIANTS)
    .flat()
    .filter((v) => variantsSeen.includes(v.id)).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 12 }}>
      {/* 顶部筛选按钮栏 */}
      <div class="row between center wrap" style={{ flexShrink: 0, gap: 8 }}>
        <div class="row gap8 wrap">
          {TACTIC_FILTERS.map(([k, label]) => (
            <button
              key={k}
              class={`mc-btn ${filter === k ? 'gold' : ''}`}
              style={{ padding: '4px 14px', fontSize: 13 }}
              onClick={() => (sfx('click', { vol: 0.4 }), setFilter(k))}
            >
              {label}
            </button>
          ))}
        </div>
        <div class="faint" style={{ fontSize: 13 }}>
          已解锁 {tacticsSeenCount}/{TACTIC_POOL.length} 战术 · {tacticVariantsSeenCount}/{tacticVariantsTotal} 战术变体 · {cmdVariantsSeenCount}/{cmdVariantsTotal} 统领精进
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, paddingRight: 4 }}>
        {/* 1. 战术展示 (进攻 / 防御) */}
        {(filter === 'all' || filter === 'offense' || filter === 'defense') && (
          <div>
            <div class="tp-sec">战场副战术（消耗 1 军令 · 冷却 8 秒）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {TACTIC_POOL.filter((id) => {
                const def = TACTIC_DEFS[id];
                if (filter === 'offense') return def.category === 'offense';
                if (filter === 'defense') return def.category === 'defense';
                return true;
              }).map((id) => {
                const def = TACTIC_DEFS[id];
                const variants = TACTIC_VARIANTS[id];
                const isOffense = def.category === 'offense';
                const isSeen = tacticsSeen.includes(id);

                return (
                  <div
                    key={id}
                    class="panel"
                    style={{
                      background: isSeen ? 'rgba(20, 24, 30, 0.75)' : 'rgba(15, 18, 24, 0.55)',
                      border: isSeen
                        ? `1px solid ${isOffense ? 'rgba(239, 68, 68, 0.35)' : 'rgba(56, 189, 248, 0.35)'}`
                        : '1px dashed rgba(255, 255, 255, 0.15)',
                      borderRadius: 6,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      opacity: isSeen ? 1 : 0.85,
                    }}
                  >
                    {/* Header */}
                    <div class="row between center">
                      <div class="row center gap8">
                        <img
                          src={url.icon(def.icon)}
                          class={`pixelated ${isSeen ? '' : 'silhouette'}`}
                          style={{ width: 36, height: 36, objectFit: 'contain', opacity: isSeen ? 1 : 0.35 }}
                        />
                        <div>
                          <div
                            style={{
                              fontSize: 16,
                              fontWeight: 'bold',
                              color: isSeen ? (isOffense ? '#fca5a5' : '#7dd3fc') : '#64748b',
                            }}
                          >
                            {isSeen ? def.name : '？？？'}
                          </div>
                          <div class="row gap4 center" style={{ marginTop: 2 }}>
                            <span
                              style={{
                                fontSize: 11,
                                padding: '1px 5px',
                                borderRadius: 3,
                                background: isSeen
                                  ? isOffense
                                    ? 'rgba(239, 68, 68, 0.2)'
                                    : 'rgba(56, 189, 248, 0.2)'
                                  : 'rgba(255, 255, 255, 0.05)',
                                color: isSeen ? (isOffense ? '#ef4444' : '#38bdf8') : '#64748b',
                                border: isSeen
                                  ? `1px solid ${isOffense ? 'rgba(239, 68, 68, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`
                                  : '1px solid rgba(255, 255, 255, 0.1)',
                              }}
                            >
                              {isOffense ? '进攻战术' : '防御战术'}
                            </span>
                            <span class="faint" style={{ fontSize: 11 }}>
                              {isSeen ? `蓄力 ${def.windup}秒 ${def.radius ? `· 范围 ${def.radius}` : ''}` : '未习得'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 12, color: isSeen ? '#f59e0b' : '#64748b' }}>
                        <div>1 军令</div>
                        <div class="faint" style={{ fontSize: 11 }}>冷却 8秒</div>
                      </div>
                    </div>

                    {/* Base Effect */}
                    <div
                      style={{
                        fontSize: 13,
                        color: isSeen ? '#e2e8f0' : '#64748b',
                        background: 'rgba(0,0,0,0.3)',
                        padding: '6px 8px',
                        borderRadius: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {isSeen ? (
                        <>
                          <span class="gold-t" style={{ fontWeight: 'bold' }}>基础效果：</span>
                          <RichText text={def.desc} />
                        </>
                      ) : (
                        <span class="faint" style={{ fontStyle: 'italic' }}>
                          尚未解锁。在战技殿堂研习或使用战术卷轴后解锁详细效果。
                        </span>
                      )}
                    </div>

                    {/* Variants */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                      <div class="faint" style={{ fontSize: 11, fontWeight: 'bold' }}>
                        进阶分支（在战技殿堂二选一解锁）：
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {variants.map((v) => {
                          const isVarSeen = isSeen && variantsSeen.includes(v.id);
                          return (
                            <div
                              key={v.id}
                              style={{
                                background: isVarSeen ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.2)',
                                border: isVarSeen
                                  ? '1px solid rgba(255, 255, 255, 0.1)'
                                  : '1px dashed rgba(255, 255, 255, 0.08)',
                                borderRadius: 4,
                                padding: '6px 8px',
                                fontSize: 12,
                              }}
                            >
                              <div class="row between center" style={{ marginBottom: 2 }}>
                                <span
                                  style={{
                                    fontWeight: 'bold',
                                    color: isVarSeen ? (v.tag === 'A' ? '#93c5fd' : '#c084fc') : '#64748b',
                                  }}
                                >
                                  [{v.tag}] {isVarSeen ? v.name : '？？？'}
                                </span>
                              </div>
                              <div class="subtle" style={{ fontSize: 11, lineHeight: 1.35 }}>
                                {isVarSeen ? (
                                  <RichText text={v.desc} />
                                ) : (
                                  <span class="faint">未研习（战技殿堂选择该变体后解锁）</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. 统领精进变体展示 */}
        {(filter === 'all' || filter === 'commanders') && (
          <div>
            <div class="tp-sec">统领专属身份精进（战技殿堂专属进阶）</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12 }}>
              {COMMANDERS.map((c) => {
                const variants = COMMANDER_VARIANTS[c.id];
                if (!variants) return null;
                const isCmdUnlocked = !c.unlock || !!p.flags[c.unlock.key];

                return (
                  <div
                    key={c.id}
                    class="panel"
                    style={{
                      background: isCmdUnlocked ? 'rgba(24, 20, 32, 0.75)' : 'rgba(15, 18, 24, 0.55)',
                      border: isCmdUnlocked ? `1px solid ${c.color}66` : '1px dashed rgba(255, 255, 255, 0.12)',
                      borderRadius: 6,
                      padding: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 8,
                      opacity: isCmdUnlocked ? 1 : 0.85,
                    }}
                  >
                    {/* Header */}
                    <div class="row between center">
                      <div class="row center gap8">
                        <img
                          src={url.cmd(c.id)}
                          class={isCmdUnlocked ? '' : 'silhouette'}
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 4,
                            objectFit: 'cover',
                            border: `1px solid ${isCmdUnlocked ? c.color : 'rgba(255,255,255,0.1)'}`,
                            opacity: isCmdUnlocked ? 1 : 0.4,
                          }}
                        />
                        <div>
                          <div style={{ fontSize: 16, fontWeight: 'bold', color: isCmdUnlocked ? c.color : '#64748b' }}>
                            {c.name} · {c.title}
                          </div>
                          <div class="faint" style={{ fontSize: 12 }}>
                            {isCmdUnlocked ? `${c.style.slice(0, 24)}…` : `解锁条件：${c.unlock?.text}`}
                          </div>
                        </div>
                      </div>
                      <div
                        class="tag"
                        style={{
                          color: isCmdUnlocked ? c.color : '#64748b',
                          borderColor: isCmdUnlocked ? `${c.color}88` : 'rgba(255,255,255,0.1)',
                          background: isCmdUnlocked ? `${c.color}22` : 'rgba(255,255,255,0.03)',
                          fontSize: 11,
                        }}
                      >
                        {isCmdUnlocked ? `专属：${c.skill.name}` : '未解锁'}
                      </div>
                    </div>

                    {/* Base Skill description */}
                    <div
                      style={{
                        fontSize: 12,
                        color: isCmdUnlocked ? '#cbd5e1' : '#64748b',
                        background: 'rgba(0,0,0,0.3)',
                        padding: '6px 8px',
                        borderRadius: 4,
                        lineHeight: 1.4,
                      }}
                    >
                      {isCmdUnlocked ? (
                        <>
                          <span class="gold-t">【技能机制】：</span>
                          <RichText text={c.skill.desc.slice(0, 95) + (c.skill.desc.length > 95 ? '…' : '')} />
                        </>
                      ) : (
                        <span class="faint" style={{ fontStyle: 'italic' }}>
                          该统领尚未解锁。达成对应前置通关条件后开启。
                        </span>
                      )}
                    </div>

                    {/* Masteries A & B */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
                      <div class="faint" style={{ fontSize: 11, fontWeight: 'bold' }}>
                        身份精进分支（在战技殿堂二选一解锁）：
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                        {variants.map((v) => {
                          const isVarSeen = isCmdUnlocked && variantsSeen.includes(v.id);
                          return (
                            <div
                              key={v.id}
                              style={{
                                background: isVarSeen ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.2)',
                                border: isVarSeen
                                  ? '1px solid rgba(255, 255, 255, 0.1)'
                                  : '1px dashed rgba(255, 255, 255, 0.08)',
                                borderRadius: 4,
                                padding: '6px 8px',
                                fontSize: 12,
                              }}
                            >
                              <div class="row between center" style={{ marginBottom: 2 }}>
                                <span style={{ fontWeight: 'bold', color: isVarSeen ? '#fbbf24' : '#64748b' }}>
                                  [{v.tag}] {isVarSeen ? v.name : '？？？'}
                                </span>
                              </div>
                              <div class="subtle" style={{ fontSize: 11, lineHeight: 1.35 }}>
                                {isVarSeen ? (
                                  <RichText text={v.desc} />
                                ) : (
                                  <span class="faint">未研习（在战技殿堂选择该分支后解锁）</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. 战术规则与机制 */}
        {(filter === 'all' || filter === 'rules') && (
          <div>
            <div class="tp-sec">副战术与军令规则</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              <div class="panel" style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6 }}>
                <div style={{ fontWeight: 'bold', color: '#f59e0b', fontSize: 14, marginBottom: 4 }}>
                  🎖️ 军令与冷却
                </div>
                <div class="subtle" style={{ fontSize: 12, lineHeight: 1.45 }}>
                  开战自动获得 1 点军令，战斗进行至第 12 秒时再补 1 点，整场最多使用 2 点。每次施放副战术消耗 1 点军令，全队共用 8 秒冷却，注意留着关键时刻救场！
                </div>
              </div>

              <div class="panel" style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6 }}>
                <div style={{ fontWeight: 'bold', color: '#38bdf8', fontSize: 14, marginBottom: 4 }}>
                  ⚖️ 群体平摊与首领霸体
                </div>
                <div class="subtle" style={{ fontSize: 12, lineHeight: 1.45 }}>
                  范围伤害与护盾都有总额上限，命中目标很多时会自动等比例平摊数值，避免数字无脑膨胀。首领敌人拥有强韧霸体，不会被击飞，被眩晕时间极短，破盾比例也会减半。
                </div>
              </div>

              <div class="panel" style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6 }}>
                <div style={{ fontWeight: 'bold', color: '#4ade80', fontSize: 14, marginBottom: 4 }}>
                  🏛️ 战技殿堂与精进
                </div>
                <div class="subtle" style={{ fontSize: 12, lineHeight: 1.45 }}>
                  地图上的战技殿堂可以免费自选 1 个新战术（必有一攻一防给你挑）；还可以花费少量绿宝石（约 25~45 绿宝石，随幕数递增）为统领挑选一门专属精进分支，彻底改变技能风格。
                </div>
              </div>

              <div class="panel" style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 6 }}>
                <div style={{ fontWeight: 'bold', color: '#c084fc', fontSize: 14, marginBottom: 4 }}>
                  📜 商店战术卷轴
                </div>
                <div class="subtle" style={{ fontSize: 12, lineHeight: 1.45 }}>
                  商店里会刷出「副战术卷轴」（基准价格 48 绿宝石，受商店打折影响）。购买后能从 3 门未拥有的战术中任选 1 门补充进战术库，是补齐阵容防守或斩杀短板的利器。
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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

function RecordsTab({ p }: { p: typeof profile.value }) {
  const [selectedRun, setSelectedRun] = useState<HistoryEntry | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');

  const history = p.history ?? [];
  const totalRuns = history.length;
  const wins = history.filter((h) => h.won).length;
  const winRate = totalRuns > 0 ? Math.round((wins / totalRuns) * 100) : 0;

  // 难度阶梯统计 (Omen 0 ~ 5)
  const omenStats = [0, 1, 2, 3, 4, 5].map((omen) => {
    const list = history.filter((h) => h.omen === omen);
    const w = list.filter((h) => h.won).length;
    const rate = list.length > 0 ? Math.round((w / list.length) * 100) : null;
    return { omen, total: list.length, wins: w, rate };
  });

  // 头号团灭杀手 Top 3 (Deadliest Killers)
  const killerMap: Record<string, { count: number; name: string; kind: string }> = {};
  for (const h of history) {
    if (!h.won && h.killedBy) {
      const key = h.killedBy.encName || h.killedBy.encId;
      if (!killerMap[key]) {
        killerMap[key] = { count: 0, name: h.killedBy.encName || h.killedBy.encId, kind: h.killedBy.kind };
      }
      killerMap[key].count++;
    }
  }
  const topKillers = Object.values(killerMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  // 核心主力 Top 3
  const mobCounts: Record<string, number> = {};
  for (const h of history) {
    for (const c of h.team) {
      mobCounts[c.mob] = (mobCounts[c.mob] || 0) + 1;
    }
  }
  const topMobs = Object.entries(mobCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const handleExportAll = () => {
    if (history.length === 0) {
      pushToast('暂无对战数据可导出', 'bad');
      return;
    }
    try {
      navigator.clipboard.writeText(JSON.stringify(history, null, 2));
      pushToast(`已复制 ${history.length} 局对战遥测数据到剪贴板！`, 'gold');
    } catch {
      pushToast('复制失败，请检查浏览器权限', 'bad');
    }
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(importText.trim());
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      if (!arr.length || typeof arr[0].score !== 'number') {
        throw new Error('数据格式不符合战报结构');
      }
      updateProfile((prof) => {
        const merged = [...arr, ...prof.history];
        const seen = new Set<number>();
        prof.history = merged
          .filter((item) => {
            if (!item.date || seen.has(item.date)) return false;
            seen.add(item.date);
            return true;
          })
          .slice(0, 100);
      });
      pushToast(`成功导入 ${arr.length} 局对战数据！`, 'gold');
      setImporting(false);
      setImportText('');
    } catch (e) {
      pushToast(`导入失败: ${(e as Error).message}`, 'bad');
    }
  };

  return (
    <div class="codex-cols" style={{ gap: 24, alignItems: 'flex-start' }}>
      {/* ── 左侧：生涯与难度健康度诊断 ── */}
      <div style={{ width: 330, flexShrink: 0 }}>
        <div class="tp-sec">生涯数据</div>
        <div class="es-row"><span>爬塔局数</span><span>{p.runs}</span></div>
        <div class="es-row"><span>通关次数</span><span class="gold-t">{p.wins} ({winRate}%)</span></div>
        <div class="es-row"><span>最高分</span><span class="gold-t">{p.bestScore}</span></div>
        <div class="es-row"><span>最高解锁难度</span><span>{p.maxOmen ? `不祥之兆 ${ROMAN_OMEN[p.maxOmen]}` : '普通'}</span></div>
        <div class="es-row"><span>累计绿宝石</span><span class="em">{p.totalEmeralds}</span></div>

        <div class="tp-sec" style={{ marginTop: 14 }}>难度平衡与通关率 (Balance)</div>
        <div class="panel" style={{ padding: '8px 12px', background: 'rgba(0,0,0,0.25)', borderRadius: 6 }}>
          {omenStats.map(({ omen, total, wins: w, rate }) => (
            <div key={omen} class="row between center" style={{ fontSize: 13, padding: '3px 0' }}>
              <span>{omen === 0 ? '普通难度' : `不祥之兆 ${ROMAN_OMEN[omen]}`}</span>
              <span class="row gap8 center">
                <span class="faint">{total}局 ({w}胜)</span>
                <span
                  style={{
                    minWidth: 42,
                    textAlign: 'right',
                    fontWeight: 'bold',
                    color: rate === null ? '#777' : rate >= 50 ? '#4ade80' : rate >= 25 ? '#facc15' : '#ef4444',
                  }}
                >
                  {rate === null ? '—' : `${rate}%`}
                </span>
              </span>
            </div>
          ))}
        </div>

        {topKillers.length > 0 && (
          <>
            <div class="tp-sec" style={{ marginTop: 14 }}>头号致命杀手 (Top Run Killers)</div>
            <div class="panel" style={{ padding: '6px 10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: 6 }}>
              {topKillers.map((k, idx) => (
                <div key={idx} class="row between center" style={{ fontSize: 13, padding: '3px 0' }}>
                  <span style={{ color: '#fca5a5' }}>☠ {k.name}</span>
                  <span class="red-t" style={{ fontWeight: 'bold' }}>团灭 {k.count} 次</span>
                </div>
              ))}
            </div>
          </>
        )}

        {topMobs.length > 0 && (
          <>
            <div class="tp-sec" style={{ marginTop: 14 }}>常用核心主力 (Top Units)</div>
            <div class="row gap8 wrap">
              {topMobs.map(([mobId, count], idx) => (
                <div key={idx} class="row center gap4" style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: 4 }}>
                  <img src={url.mob(mobId)} style={{ width: 22, height: 22, objectFit: 'contain' }} />
                  <span style={{ fontSize: 13 }}>{mobDef(mobId).name} ({count})</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── 右侧：可交互历史对局与复盘入口 ── */}
      <div style={{ flex: 1, minWidth: 420 }}>
        <div class="row between center mb8">
          <div class="tp-sec" style={{ margin: 0 }}>对局遥测记录 ({history.length} 局)</div>
          <div class="row gap8">
            <Btn size="small" onClick={handleExportAll}>📋 导出全部 JSON</Btn>
            <Btn size="small" onClick={() => setImporting(true)}>📥 导入战报</Btn>
          </div>
        </div>
        <div class="faint mb8" style={{ fontSize: 12 }}>
          💡 点击任意对局可展开【深度复盘】，查看致命死因、终局羁绊、宝物与全关卡战报流水。
        </div>

        {history.length === 0 && <div class="faint" style={{ padding: '16px 0' }}>还没有记录，完成一次爬塔后即可在此复盘！</div>}

        <div style={{ maxHeight: 520, overflowY: 'auto', paddingRight: 6 }}>
          {history.map((h, i) => (
            <div
              key={i}
              class="hist-row clickable"
              onClick={() => {
                sfx('card_place');
                setSelectedRun(h);
              }}
              title="点击查看此局深度复盘与战场流水"
            >
              <span class={h.won ? 'gold-t' : 'red-t'}>
                {h.won ? '🏆 通关' : `💀 第${h.act}幕`}
              </span>
              <span style={{ color: COMMANDER_MAP[h.commander]?.color }}>
                {COMMANDER_MAP[h.commander]?.name}
              </span>
              <span class="row gap4 wrap">
                {h.team.map((c, k) => (
                  <span key={k} style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={url.mob(c.mob)}
                      title={`${mobDef(c.mob).name} (${c.star}星)`}
                      style={{ width: 26, height: 26, objectFit: 'contain' }}
                    />
                    {c.star > 1 && (
                      <span
                        style={{
                          position: 'absolute',
                          right: -2,
                          bottom: -2,
                          fontSize: 10,
                          background: c.star >= 4 ? '#e056fd' : '#f59e0b',
                          color: '#000',
                          fontWeight: 'bold',
                          borderRadius: 2,
                          padding: '0 2px',
                          lineHeight: '10px',
                        }}
                      >
                        {c.star}★
                      </span>
                    )}
                  </span>
                ))}
              </span>
              <span class="faint" style={{ textAlign: 'right' }}>
                {h.omen ? `Omen ${ROMAN_OMEN[h.omen]}` : '普通'} · {h.score}分
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── 单局对战深度复盘弹窗 ── */}
      {selectedRun && (
        <Modal width={860} onClose={() => setSelectedRun(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div class="row between center" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 10 }}>
              <div style={{ fontSize: 22, fontWeight: 'bold' }} class="title-shadow">
                {selectedRun.won ? '🏆 爬塔通关复盘' : `💀 第 ${selectedRun.act} 幕阵亡复盘`} · {COMMANDER_MAP[selectedRun.commander]?.name || selectedRun.commander}
              </div>
              <div class="row gap8 center">
                <span class="gold-t" style={{ fontSize: 16 }}>{selectedRun.omen ? `不祥之兆 ${ROMAN_OMEN[selectedRun.omen]}` : '普通难度'}</span>
                <span class="faint" style={{ fontSize: 13 }}>得分: {selectedRun.score}</span>
              </div>
            </div>

            {/* 致命死因 */}
            {!selectedRun.won && (
              <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.35)', padding: '10px 14px', borderRadius: 8 }}>
                <div class="row between center">
                  <div style={{ color: '#fca5a5', fontSize: 16, fontWeight: 'bold' }}>
                    🚨 致命遭遇：{selectedRun.killedBy?.encName || selectedRun.killedBy?.encId || '未知遭遇'}
                  </div>
                  <div class="row gap12" style={{ fontSize: 13 }}>
                    {selectedRun.killedBy?.time !== undefined && (
                      <span>战斗时长: <b>{selectedRun.killedBy.time}s</b></span>
                    )}
                    {selectedRun.killedBy?.bossHp !== undefined && (
                      <span>首领剩余血量: <b class="red-t">{selectedRun.killedBy.bossHp}%</b></span>
                    )}
                  </div>
                </div>
                <div class="faint" style={{ fontSize: 12, marginTop: 4 }}>
                  {selectedRun.killedBy?.bossHp !== undefined && selectedRun.killedBy.bossHp < 25
                    ? '⚡ 濒死惜败：首领残血已不足 25%，仅差微小输出爆发或护盾续航即可破局！'
                    : selectedRun.killedBy?.time !== undefined && selectedRun.killedBy.time < 10
                    ? '⚠️ 突发秒杀：战斗仅持续不足 10 秒即全线溃败，可能遭遇数值碾压或站位严重受克！'
                    : '复盘提示：建议排查前排抗伤分配，留意高伤怪物技能前摇并合理携带克制药水。'}
                </div>
              </div>
            )}

            {/* 终局构筑、羁绊与宝物 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div class="panel" style={{ padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
                <div class="panel-title" style={{ fontSize: 15, marginBottom: 8 }}>最终出战阵容</div>
                <div class="row gap8 wrap">
                  {selectedRun.team.map((c, idx) => (
                    <div key={idx} class="row center gap4" style={{ background: 'rgba(255,255,255,0.06)', padding: '4px 8px', borderRadius: 4 }}>
                      <img src={url.mob(c.mob)} style={{ width: 28, height: 28, objectFit: 'contain' }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 'bold' }}>{mobDef(c.mob).name}</div>
                        <div style={{ fontSize: 11, color: c.star >= 4 ? '#e056fd' : '#f59e0b' }}>{c.star} ★</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div class="panel" style={{ padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
                <div class="panel-title" style={{ fontSize: 15, marginBottom: 8 }}>激活羁绊与宝物</div>
                <div class="row gap6 wrap mb8">
                  {selectedRun.synergies && selectedRun.synergies.length > 0 ? (
                    selectedRun.synergies.map((s, idx) => (
                      <span key={idx} style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.4)', borderRadius: 4, padding: '2px 6px', fontSize: 12, color: '#fde68a' }}>
                        ✦ {s.name || s.family} {s.tier}阶 ({s.count})
                      </span>
                    ))
                  ) : (
                    <span class="faint" style={{ fontSize: 12 }}>无活跃羁绊</span>
                  )}
                </div>
                <div class="row gap6 wrap">
                  {selectedRun.relics && selectedRun.relics.length > 0 ? (
                    selectedRun.relics.map((r, idx) => (
                      <span key={idx} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 4, padding: '2px 6px', fontSize: 12 }}>
                        {RELIC_MAP[r]?.name || r}
                      </span>
                    ))
                  ) : (
                    <span class="faint" style={{ fontSize: 12 }}>无宝物</span>
                  )}
                </div>
              </div>
            </div>

            {/* 全程遭遇流水 */}
            {selectedRun.battles && selectedRun.battles.length > 0 && (
              <div class="panel" style={{ padding: 12, background: 'rgba(0,0,0,0.25)', borderRadius: 6 }}>
                <div class="panel-title" style={{ fontSize: 15, marginBottom: 6 }}>
                  战斗战报流水 (共 {selectedRun.battles.length} 场遭遇)
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#999' }}>
                        <th style={{ padding: '4px 6px' }}>幕-关卡</th>
                        <th style={{ padding: '4px 6px' }}>遭遇敌人</th>
                        <th style={{ padding: '4px 6px' }}>类型</th>
                        <th style={{ padding: '4px 6px' }}>战况</th>
                        <th style={{ padding: '4px 6px' }}>耗时</th>
                        <th style={{ padding: '4px 6px' }}>战损心数</th>
                        <th style={{ padding: '4px 6px' }}>本场 MVP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRun.battles.map((b, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '4px 6px' }}>第{b.act}幕-{b.row + 1}</td>
                          <td style={{ padding: '4px 6px', fontWeight: 'bold' }}>{b.encName || b.encId}</td>
                          <td style={{ padding: '4px 6px', color: b.kind === 'boss' ? '#f59e0b' : b.kind === 'elite' ? '#a855f7' : '#94a3b8' }}>
                            {b.kind === 'boss' ? '首领' : b.kind === 'elite' ? '精英' : b.kind === 'event' ? '事件' : '常规'}
                          </td>
                          <td style={{ padding: '4px 6px', color: b.win ? '#4ade80' : '#ef4444', fontWeight: 'bold' }}>
                            {b.win ? '胜利' : `战败${b.bossHp !== undefined ? ` (残血${b.bossHp}%)` : ''}`}
                          </td>
                          <td style={{ padding: '4px 6px' }}>{b.time}s</td>
                          <td style={{ padding: '4px 6px', color: b.heartsLost > 0 ? '#ef4444' : '#94a3b8' }}>
                            {b.heartsLost > 0 ? `-${b.heartsLost} ❤️` : '0'}
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            {b.mvp ? `${mobDef(b.mvp.mob).name} (${b.mvp.dmg})` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div class="row between center" style={{ marginTop: 6 }}>
              <Btn
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(JSON.stringify(selectedRun, null, 2));
                    pushToast('本局对战数据 JSON 已复制！', 'gold');
                  } catch {
                    pushToast('复制失败', 'bad');
                  }
                }}
              >
                📋 复制本局战报 JSON
              </Btn>
              <Btn onClick={() => setSelectedRun(null)}>关闭</Btn>
            </div>
          </div>
        </Modal>
      )}

      {/* ── 导入战报数据弹窗 ── */}
      {importing && (
        <Modal width={600} onClose={() => setImporting(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 20, fontWeight: 'bold' }} class="title-shadow">
              📥 导入对局遥测数据 JSON
            </div>
            <div class="faint" style={{ fontSize: 13 }}>
              支持粘贴测试人员或其他玩家导出的对战 JSON（单局对象或多局数组）。导入后将合并至本地记录以供复盘分析。
            </div>
            <textarea
              rows={8}
              value={importText}
              onInput={(e) => setImportText((e.target as HTMLTextAreaElement).value)}
              placeholder="在此粘贴战报 JSON 文本..."
              style={{
                width: '100%',
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#fff',
                padding: 10,
                borderRadius: 6,
                fontFamily: 'monospace',
                fontSize: 12,
                resize: 'vertical',
              }}
            />
            <div class="row end gap12">
              <Btn onClick={() => setImporting(false)}>取消</Btn>
              <Btn variant="green" onClick={handleImport}>确认导入</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
