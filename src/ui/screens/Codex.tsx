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
          {tab === 'relics' && (
            <div class="codex-grid relics">
              {RELICS.map((r) => {
                const seen = p.relicsSeen.includes(r.id);
                return (
                  <Tip key={r.id} content={() => (seen ? <RelicTipContent id={r.id} /> : <div class="tt-gray">尚未获得{r.commander ? ` · ${COMMANDER_MAP[r.commander].name}专属` : ''}</div>)} class={`codex-relic ${seen ? '' : 'unseen'}`}>
                    <img src={url.icon(r.id)} class="pixelated" />
                    <div style={{ color: seen ? RELIC_TIER_INFO[r.tier].color : '#555' }}>{seen ? r.name : '？？？'}</div>
                    {(r.tag || r.commander) && <div class="faint" style={{ fontSize: 11 }}>{r.commander ? `${COMMANDER_MAP[r.commander].name}专属` : r.tag}</div>}
                  </Tip>
                );
              })}
            </div>
          )}
          {tab === 'enchants' && (
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
                <div class="tp-sec">战斗物品（战斗中从物品栏使用，一次性）</div>
                {(['drink', 'splash', 'lingering', 'tool', 'egg'] as const).map((k) => (
                  <div key={k}>
                    <div class="faint" style={{ fontSize: 13, margin: '6px 0 2px' }}>{ITEM_KIND_NAME[k]}</div>
                    {POTIONS.filter((e) => e.kind === k).map((e) => (
                      <div key={e.id} class="codex-line">
                        <img src={itemIcon(e.id)} class="pixelated" />
                        <span style={{ color: e.color, minWidth: 120 }}>{e.name}</span>
                        <span class="subtle">
                          <RichText text={e.desc} />
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
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
                <div class="es-row"><span>经典对决竞猜</span><span>{p.classic.correct}/{p.classic.guesses}（最高连胜 {p.classic.best}）</span></div>
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

function MobsTab({ discovered }: { discovered: string[] }) {
  const [sel, setSel] = useState<string>(PLAYABLE_MOBS[0].id);
  const m = mobDef(sel);
  const known = discovered.includes(sel) || m.hidden;
  const bosses = MOBS.filter((x) => x.boss);
  const found = PLAYABLE_MOBS.filter((x) => discovered.includes(x.id)).length;
  return (
    <div class="mobs-tab">
      <div class="mobs-list">
        <div class="faint" style={{ marginBottom: 6 }}>
          已发现 {found}/{PLAYABLE_MOBS.length}
        </div>
        {RARITIES.map((r) => (
          <div key={r} class="mob-group">
            <div class="mg-title" style={{ color: RARITY_INFO[r].color }}>
              {RARITY_INFO[r].name}
            </div>
            <div class="mg-items">
              {PLAYABLE_MOBS.filter((x) => x.rarity === r).map((x) => {
                const k = discovered.includes(x.id);
                return (
                  <button key={x.id} class={`mg-item r-${r} ${sel === x.id ? 'on' : ''}`} onClick={() => (sfx('click', { vol: 0.4 }), setSel(x.id))}>
                    <img src={url.mob(x.id)} class={k ? '' : 'silhouette'} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div class="mob-group">
          <div class="mg-title gold-t">首领</div>
          <div class="mg-items">
            {bosses.map((x) => (
              <button key={x.id} class={`mg-item r-gold ${sel === x.id ? 'on' : ''}`} onClick={() => setSel(x.id)}>
                <img src={url.mob(x.id)} />
              </button>
            ))}
          </div>
        </div>
      </div>
      <div class={`mob-detail r-${m.rarity}`}>
        <div class="md-art">
          <img src={url.mob(sel)} class={known ? '' : 'silhouette'} />
        </div>
        <div class="md-name rc">{known ? m.name : '？？？'}</div>
        <div class="faint">
          {RARITY_INFO[m.rarity].name} · {ROLE_INFO[m.role].icon} {ROLE_INFO[m.role].name}
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
                    {[1, 2, 3].map((s) => <td key={s}>×{unitCount(m, s)}</td>)}
                  </tr>
                  <tr>
                    <td>生命</td>
                    {[1, 2, 3].map((s) => <td key={s}>{Math.round(m.hp * starStatMul(m, s))}</td>)}
                  </tr>
                  <tr>
                    <td>攻击</td>
                    {[1, 2, 3].map((s) => <td key={s}>{Math.round(m.atk * starStatMul(m, s))}</td>)}
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
              {m.skill.desc}
            </div>
            {m.star3 && <div class="md-star3">★3：{m.star3}</div>}
            <div class="md-flavor faint">「{m.flavor}」</div>
            {!m.hidden && (
              <div class="faint" style={{ fontSize: 13 }}>
                出现于：{CRATES.filter((c) => RARITIES.some((r) => c.pool[r].includes(m.id))).map((c) => c.name).join('、')}
              </div>
            )}
          </>
        ) : (
          <div class="faint" style={{ marginTop: 20 }}>开出这只生物后解锁详细信息。</div>
        )}
      </div>
    </div>
  );
}

const RULES: [string, string[]][] = [
  ['核心循环', [
    '开箱获得生物卡牌 → 战前在地形上布阵 → 双方全自动混战 → 胜利后挑选补给箱 → 沿地图向上攀爬。',
    '三幕：主世界 → 下界 → 末地，每幕顶端有首领。击败首领出战栏位 +1，并获得一件首领宝物。',
    '击败末影龙后可以选择踏入裂隙，进入可选的第四幕「筛界」（更难，敌人全是筛界生物）；在筛界倒下也算通关，击败幽匿巨像有额外分数与成就。',
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
