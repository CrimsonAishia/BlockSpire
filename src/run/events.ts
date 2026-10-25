// Map "?" events. Each choice mutates the run and may queue follow-up interactions.
import type { Rng } from '../core/rng.ts';
import { RELICS, rollItem } from '../data/items.ts';
import { mobDef } from '../data/mobs.ts';
import {
  allCards, gainCard, gainEmeralds, gainRelic, hasRelic, makeEventBattle, openCrate, randomBooks, relicChoices, toast,
  type Pending, type RunState,
} from './run.ts';

export interface EventOutcome {
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
  then?: Pending[];
  /** Stay on the event (repeatable choice). */
  repeat?: boolean;
}

export interface EventChoice {
  label: string;
  desc: string;
  disabled?: string;
  run(s: RunState, r: Rng, data: Record<string, number>): EventOutcome;
}

export interface EventDef {
  id: string;
  name: string;
  acts: number[];
  /** Only offered when this holds (event chains). */
  when?: (s: RunState) => boolean;
  /** Next chapter of a chain: picked before any other event. */
  priority?: boolean;
  /** Illustration id if it isn't the event id (chapters of a chain share pictures). */
  art?: string;
  text: string;
  choices(s: RunState, data: Record<string, number>): EventChoice[];
  winRewards?: Record<string, (s: RunState, r: Rng) => Pending[]>;
}

const leave: EventChoice = { label: '离开', desc: '什么也不做。', run: () => ({ text: '你决定不冒这个险，继续赶路。' }) };

const chain = (s: RunState, id: string) => s.chains?.[id];
const setChain = (s: RunState, id: string, v: number) => {
  s.chains = { ...(s.chains ?? {}), [id]: v };
};
const rowOf = (s: RunState) => (s.nodeId ? s.map.nodes[s.nodeId].row : 0);

function addPotions(s: RunState, r: Rng, n: number) {
  let got = 0;
  for (let i = 0; i < n && s.potions.length < s.potionSlots; i++) {
    s.potions.push(rollItem(r, { potionOnly: true }));
    got++;
  }
  return got;
}

function needMoney(s: RunState, n: number) {
  return s.emeralds < n ? `需要 ${n} 绿宝石` : undefined;
}

function randomRelic(s: RunState, r: Rng, tiers: ('common' | 'rare' | 'legendary')[]) {
  const pool = RELICS.filter((x) => tiers.includes(x.tier as 'common') && !s.relics.includes(x.id) && (!x.commander || x.commander === s.commander));
  return pool.length ? r.pick(pool).id : null;
}

export const EVENTS: EventDef[] = [
  {
    id: 'wandering_trader', name: '流浪商人', acts: [1, 2, 3, 4],
    text: '一位穿着蓝袍的流浪商人牵着两只羊驼拦住了你的去路。“交易吗？我这儿的东西，你在别处可买不到。”',
    choices: (s) => [
      {
        label: '购买神秘药水', desc: '花费 25 绿宝石，获得 1 瓶随机药水。',
        disabled: needMoney(s, 25) ?? (s.potions.length >= s.potionSlots ? '物品栏已满' : undefined),
        run: (s, r) => {
          s.emeralds -= 25;
          addPotions(s, r, 1);
          return { text: '商人从羊驼背包里摸出一瓶冒着泡的药水递给你。', tone: 'good' };
        },
      },
      {
        label: '以物易物', desc: '交出一张卡牌，换取一次至少高一个品质的开箱。',
        disabled: allCards(s).length < 2 ? '至少需要 2 张卡牌' : undefined,
        run: () => ({
          text: '商人眯起眼睛打量你的队伍。“让我看看你带了什么好东西……”',
          then: [{ type: 'pick_card', purpose: 'trade', title: '选择要交给商人的卡牌（军规级→精良箱，其余→传奇箱）' }],
        }),
      },
      leave,
    ],
  },
  {
    id: 'mineshaft', name: '废弃矿井', acts: [1],
    text: '矿井深处传来蜘蛛的嘶嘶声。铁轨尽头停着一辆满载的运输矿车，蛛网后面似乎还有一个箱子。',
    choices: () => [
      {
        label: '深入探索', desc: '与矿井中的蜘蛛战斗。胜利后获得一件宝物和 30 绿宝石。',
        run: (s) => ({ text: '你点燃火把，钻进了蛛网之中——', then: [makeEventBattle(s, 'ev_mineshaft', 'mineshaft')] }),
      },
      {
        label: '搜刮矿车', desc: '获得 35~60 绿宝石，但矿车里可能装着 TNT（35%：失去 1 颗心）。',
        run: (s, r) => {
          const em = r.int(35, 60);
          gainEmeralds(s, em);
          if (r.chance(0.35)) {
            s.hearts = Math.max(1, s.hearts - 1);
            return { text: `你抱走了 ${em} 绿宝石……然后矿车里的 TNT 被引燃了！失去 1 颗心。`, tone: 'bad' };
          }
          return { text: `矿车里堆满了矿石，你换得了 ${em} 绿宝石。`, tone: 'good' };
        },
      },
      leave,
    ],
    winRewards: {
      mineshaft: (s) => {
        gainEmeralds(s, 30);
        return [{ type: 'relic_choice', title: '矿井宝箱', choices: relicChoices(s, 2, ['common', 'rare']), skippable: false }];
      },
    },
  },
  {
    id: 'enchanting', name: '附魔台', acts: [1, 2, 3, 4],
    text: '书架环绕着一张附魔台，奇异的符文在空中缓缓漂浮。',
    choices: (s) => [
      {
        label: '支付青金石', desc: '花费 35 绿宝石，从 3 本附魔书中挑选一本，附魔一张卡牌。',
        disabled: needMoney(s, 35),
        run: (s) => {
          s.emeralds -= 35;
          return { text: '符文涌入书页，三本附魔书在你面前展开。', tone: 'good', then: [{ type: 'enchant_choice', title: '选择一本附魔书', books: randomBooks(s, 3), cost: 0 }] };
        },
      },
      {
        label: '献祭生命', desc: '失去 1 颗心：附魔一张卡牌（随机附魔），并使其属性永久 +12%。',
        disabled: s.hearts <= 1 ? '生命不足' : undefined,
        run: (s, r) => {
          s.hearts -= 1;
          const book = r.pick(randomBooks(s, 6).filter((b) => b !== 'looting'));
          return {
            text: '附魔台吞噬了你的一部分生命力，光芒变得刺眼……',
            tone: 'neutral',
            then: [{ type: 'pick_card', purpose: 'bonus', title: '选择要接受献祭附魔的卡牌', enchant: book, data: { amount: 0.12 } }],
          };
        },
      },
      leave,
    ],
  },
  {
    id: 'witch_hut', name: '沼泽小屋', acts: [1],
    text: '沼泽深处的小屋里，坩埚还冒着诡异的绿色泡泡。女巫似乎出门了。',
    choices: (s) => [
      {
        label: '喝一口坩埚里的药', desc: '可能获得生命上限、药水，也可能中毒。',
        run: (s, r) => {
          const roll = r.next();
          if (roll < 0.4) {
            s.maxHearts++;
            s.hearts++;
            return { text: '一股暖流涌遍全身。生命上限 +1，回复 1 颗心！', tone: 'good' };
          }
          if (roll < 0.7) {
            const n = addPotions(s, r, 2);
            return { text: `你喝出了配方的门道，顺手装走了 ${n} 瓶药水。`, tone: 'good' };
          }
          s.hearts = Math.max(1, s.hearts - 1);
          return { text: '呕……是剧毒药水！失去 1 颗心。', tone: 'bad' };
        },
      },
      {
        label: '拿走药水架上的药', desc: '获得 1 瓶随机药水。',
        disabled: s.potions.length >= s.potionSlots ? '物品栏已满' : undefined,
        run: (s, r) => {
          addPotions(s, r, 1);
          return { text: '你把一瓶药水揣进了口袋。', tone: 'good' };
        },
      },
      leave,
    ],
  },
  {
    id: 'village', name: '平原村庄', acts: [1],
    text: '一座宁静的村庄。村民们“哼嗯”地打着招呼，铁傀儡在广场上巡逻。',
    choices: (s) => [
      {
        label: '成为村庄英雄', desc: '帮村民赶走灾厄巡逻队：选择一张卡牌，属性永久 +15%。',
        run: () => ({ text: '村民们为你的队伍欢呼。', tone: 'good', then: [{ type: 'pick_card', purpose: 'bonus', title: '选择获得「村庄英雄」的卡牌', data: { amount: 0.15 } }] }),
      },
      {
        label: '与图书管理员交易', desc: '花费 40 绿宝石，从 3 本附魔书中挑选一本。',
        disabled: needMoney(s, 40),
        run: (s) => {
          s.emeralds -= 40;
          return { text: '图书管理员推了推眼镜：“好书，配好兵。”', tone: 'good', then: [{ type: 'enchant_choice', title: '图书管理员的藏书', books: randomBooks(s, 3), cost: 0 }] };
        },
      },
      {
        label: '在村庄过夜', desc: '回复 1 颗心。',
        disabled: s.hearts >= s.maxHearts ? '生命已满' : undefined,
        run: (s) => {
          s.hearts = Math.min(s.maxHearts, s.hearts + 1);
          return { text: '你在床上睡了个好觉，跳过了夜晚。回复 1 颗心。', tone: 'good' };
        },
      },
    ],
  },
  {
    id: 'desert_temple', name: '沙漠神殿', acts: [1],
    text: '神殿地下室里，四个宝箱围绕着一块可疑的压力板。你几乎能听见下面 TNT 的呼吸声。',
    choices: () => [
      {
        label: '直接打开宝箱', desc: '60%：获得宝物与 40 绿宝石；40%：触发陷阱，失去 2 颗心。',
        run: (s, r) => {
          if (r.chance(0.6)) {
            gainEmeralds(s, 40);
            const rel = randomRelic(s, r, ['common', 'rare']);
            if (rel) gainRelic(s, rel);
            return { text: '你小心翼翼地绕开压力板，满载而归！', tone: 'good' };
          }
          s.hearts = Math.max(1, s.hearts - 2);
          gainEmeralds(s, 20);
          return { text: '咔哒。轰——！你被炸飞了出去，只抓住了 20 绿宝石。失去 2 颗心。', tone: 'bad' };
        },
      },
      {
        label: '先拆除陷阱', desc: '安全地获得 45 绿宝石。',
        run: (s) => {
          gainEmeralds(s, 45);
          return { text: '你挖走了 TNT，从宝箱里取出 45 绿宝石。稳妥。', tone: 'good' };
        },
      },
      leave,
    ],
  },
  {
    id: 'trial_chamber', name: '试炼密室', acts: [1, 2],
    text: '试炼刷怪笼亮起橙光。完成试炼，就能用钥匙打开深处的不祥宝库。',
    choices: () => [
      {
        label: '接受试炼', desc: '进行一场精英战斗（失败失去 2 颗心）。胜利后开启「不祥宝库」。',
        run: (s, r) => {
          const elites = ['a1e_evoker', 'a1e_golem', 'a1e_coven', 'a1e_ender', 'a2e_brutes', 'a2e_ghasts', 'a2e_breeze'].filter((e) => e.startsWith(`a${s.act}`));
          const b = makeEventBattle(s, r.pick(elites), 'trial');
          if (b.type === 'battle') b.kind = 'elite';
          return { text: '刷怪笼喷出了一波又一波的怪物——', then: [b] };
        },
      },
      leave,
    ],
    winRewards: {
      trial: (s) => [openCrate(s, 'ominous', 'elite', '不祥宝库')],
    },
  },
  {
    id: 'piglin_barter', name: '猪灵交易', acts: [2],
    text: '一群猪灵围了上来，盯着你的口袋。它们只认金子——当然，绿宝石也能凑合换成金锭。',
    choices: (s, d) => [
      {
        label: `扔出金锭（${(d.n ?? 0) < 3 ? `剩余 ${3 - (d.n ?? 0)} 次` : '已用完'}）`, desc: '花费 25 绿宝石。猪灵会随机丢给你一些东西。',
        disabled: (d.n ?? 0) >= 3 ? '猪灵们对你失去了兴趣' : needMoney(s, 25),
        run: (s, r, d) => {
          s.emeralds -= 25;
          d.n = (d.n ?? 0) + 1;
          const roll = r.next();
          if (roll < 0.3 && s.potions.length < s.potionSlots) {
            addPotions(s, r, 1);
            toast(s, '猪灵丢给你一瓶药水', 'good');
          } else if (roll < 0.55) {
            gainEmeralds(s, 50);
            toast(s, '猪灵丢给你一袋东西：50 绿宝石！', 'good');
          } else if (roll < 0.72) {
            const rel = randomRelic(s, r, ['common']);
            if (rel) gainRelic(s, rel);
          } else if (roll < 0.85) {
            s.queue.splice(1, 0, { type: 'enchant_choice', title: '猪灵丢来一本附魔书', books: randomBooks(s, 1), cost: 0 });
            toast(s, '猪灵丢来一本附魔书', 'good');
          } else toast(s, '猪灵把金锭揣进怀里，什么也没给你。', 'bad');
          return { text: '', repeat: true };
        },
      },
      { ...leave, run: () => ({ text: '猪灵们哼哼着散开了。' }) },
    ],
  },
  {
    id: 'nether_fortress', name: '下界要塞', acts: [2],
    text: '要塞走廊尽头有一个宝箱，但烈焰人的呼吸声越来越近。旁边的灵魂沙上长满了下界疣。',
    choices: (s) => [
      {
        label: '冲向宝箱', desc: '与要塞守卫战斗。胜利后获得一件稀有宝物。',
        run: (s) => ({ text: '你拔出武器冲了过去！', then: [makeEventBattle(s, 'ev_fortress', 'fortress')] }),
      },
      {
        label: '采集下界疣', desc: '获得 2 瓶随机药水。',
        disabled: s.potions.length >= s.potionSlots ? '物品栏已满' : undefined,
        run: (s, r) => {
          const n = addPotions(s, r, 2);
          return { text: `你用下界疣酿出了 ${n} 瓶药水。`, tone: 'good' };
        },
      },
      leave,
    ],
    winRewards: {
      fortress: (s) => [{ type: 'relic_choice', title: '要塞宝箱', choices: relicChoices(s, 3, ['rare']), skippable: false }],
    },
  },
  {
    id: 'bastion', name: '堡垒遗迹', acts: [2],
    text: '金块堆积如山，宝藏室里却只有几只猪灵蛮兵在打瞌睡。',
    choices: () => [
      {
        label: '偷偷拿走金块', desc: '50%：悄悄得手，获得 90 绿宝石；50%：惊醒蛮兵，必须战斗（胜利仍获得 90 绿宝石）。',
        run: (s, r) => {
          if (r.chance(0.5)) {
            gainEmeralds(s, 90);
            return { text: '你蹑手蹑脚地搬空了一堆金块，换得 90 绿宝石！', tone: 'good' };
          }
          return { text: '一块金子掉在地上——蛮兵们睁开了眼睛。', tone: 'bad', then: [makeEventBattle(s, 'ev_bastion', 'bastion')] };
        },
      },
      leave,
    ],
    winRewards: {
      bastion: (s) => {
        gainEmeralds(s, 90);
        toast(s, '获得 90 绿宝石', 'good');
        return [];
      },
    },
  },
  {
    id: 'end_city', name: '末地城', acts: [3],
    text: '末地船静静漂浮在虚空之上，船头的展示框里挂着一对鞘翅。',
    choices: () => [
      {
        label: '登上末地船', desc: '与船上的守卫战斗。胜利后获得鞘翅（若已拥有则获得一件传说宝物）。',
        run: (s) => ({ text: '潜影贝的壳一个接一个地打开了……', then: [makeEventBattle(s, 'ev_endship', 'endship')] }),
      },
      {
        label: '搜刮塔楼', desc: '获得 60 绿宝石和一本附魔书。',
        run: (s) => {
          gainEmeralds(s, 60);
          return { text: '塔楼的箱子里有绿宝石和一本闪闪发光的书。', tone: 'good', then: [{ type: 'enchant_choice', title: '塔楼里的附魔书', books: randomBooks(s, 2), cost: 0 }] };
        },
      },
      leave,
    ],
    winRewards: {
      endship: (s, r) => {
        if (!hasRelic(s, 'elytra')) gainRelic(s, 'elytra');
        else {
          const rel = randomRelic(s, r, ['legendary']);
          if (rel) gainRelic(s, rel);
        }
        return [];
      },
    },
  },
  {
    id: 'ancient_city', name: '远古城市', acts: [3],
    text: '远古城市一片死寂，幽匿尖啸体就在脚边。宝箱里隐约闪着回响碎片的光。',
    choices: () => [
      {
        label: '潜行搜刮', desc: '55%：获得稀有宝物与 50 绿宝石；45%：惊醒监守者，被迫战斗（胜利后开启传奇补给箱）。',
        run: (s, r) => {
          if (r.chance(0.55)) {
            gainEmeralds(s, 50);
            const rel = randomRelic(s, r, ['rare']);
            if (rel) gainRelic(s, rel);
            return { text: '你屏住呼吸，带着宝物悄悄溜了出来。', tone: 'good' };
          }
          return { text: '尖啸体发出了刺耳的尖叫……大地开始震动。', tone: 'bad', then: [makeEventBattle(s, 'ev_warden', 'warden')] };
        },
      },
      leave,
    ],
    winRewards: {
      warden: (s) => [openCrate(s, 'ominous', 'boss', '远古宝藏')],
    },
  },
  {
    id: 'spawner', name: '地牢刷怪笼', acts: [1, 2, 3],
    text: '苔石地牢中央，一个刷怪笼里的小火苗正在旋转。笼子两边各有一个箱子。',
    choices: () => [
      {
        label: '研究刷怪笼', desc: '获得一次「起源」补给箱开箱。',
        run: (s) => ({ text: '你从刷怪笼里“请”出了一只生物。', tone: 'good', then: [openCrate(s, 'origin', 'normal', '刷怪笼')] }),
      },
      {
        label: '用火把封住它', desc: '获得 25 绿宝石。',
        run: (s) => {
          gainEmeralds(s, 25);
          return { text: '刷怪笼熄灭了，你搜刮了两个箱子里的 25 绿宝石。', tone: 'good' };
        },
      },
    ],
  },
  {
    id: 'anvil', name: '铁砧', acts: [1, 2, 3, 4],
    text: '一座废弃的铁匠铺，铁砧还算完好。你可以把两件“装备”合二为一。',
    choices: (s) => [
      {
        label: '合并', desc: '牺牲一张卡牌，使另一张卡牌 ★+1。',
        disabled: allCards(s).length < 2 ? '至少需要 2 张卡牌' : !allCards(s).some((c) => c.star < 3) ? '没有可升星的卡牌' : undefined,
        run: () => ({ text: '铁砧发出清脆的“叮”声。', tone: 'neutral', then: [{ type: 'pick_card', purpose: 'sacrifice', title: '选择要牺牲的卡牌' }] }),
      },
      {
        label: '打磨装备', desc: '花费 30 绿宝石，回复 1 颗心。',
        disabled: needMoney(s, 30) ?? (s.hearts >= s.maxHearts ? '生命已满' : undefined),
        run: (s) => {
          s.emeralds -= 30;
          s.hearts = Math.min(s.maxHearts, s.hearts + 1);
          return { text: '修补好的盔甲让你安心不少。回复 1 颗心。', tone: 'good' };
        },
      },
      leave,
    ],
  },
  {
    id: 'brewing', name: '酿造台', acts: [1, 2, 3, 4],
    text: '一个无人看管的酿造台还在咕嘟作响，旁边堆着烈焰粉和下界疣。',
    choices: (s) => [
      {
        label: '酿造', desc: '获得 2 瓶随机药水。',
        disabled: s.potions.length >= s.potionSlots ? '物品栏已满' : undefined,
        run: (s, r) => {
          const n = addPotions(s, r, 2);
          return { text: `你熟练地酿出了 ${n} 瓶药水。`, tone: 'good' };
        },
      },
      {
        label: '以血为引', desc: '失去 1 颗心，获得 50 绿宝石和 1 瓶药水。',
        disabled: s.hearts <= 1 ? '生命不足' : undefined,
        run: (s, r) => {
          s.hearts -= 1;
          gainEmeralds(s, 50);
          addPotions(s, r, 1);
          return { text: '你用自己的血酿出了一瓶浓稠的药剂，还顺手卖掉了剩下的原料。', tone: 'neutral' };
        },
      },
      leave,
    ],
  },
  {
    id: 'shipwreck', name: '沉船', acts: [1],
    text: '海底的沉船残骸里藏着一个宝箱，几只溺尸在船舱间游荡，手里似乎攥着三叉戟。',
    choices: () => [
      {
        label: '潜水搜刮', desc: '与溺尸战斗。胜利后获得 50 绿宝石和一次「深海遗迹」开箱。',
        run: (s) => ({ text: '你深吸一口气，潜入了冰冷的海水——', then: [makeEventBattle(s, 'ev_shipwreck', 'shipwreck')] }),
      },
      {
        label: '只捞漂浮物资', desc: '获得 30 绿宝石。',
        run: (s) => {
          gainEmeralds(s, 30);
          return { text: '你捞起了几个漂浮的木桶，里面有 30 绿宝石。', tone: 'good' };
        },
      },
      leave,
    ],
    winRewards: {
      shipwreck: (s) => {
        gainEmeralds(s, 50);
        return [openCrate(s, 'ocean', 'normal', '沉船宝箱')];
      },
    },
  },
];


// ───────────────────────── Event chains ─────────────────────────
// Multi-chapter stories across floors and acts: what you choose now changes later events and
// fights (an ambush can replace one of your next battles).

EVENTS.push(
  {
    id: 'lost_trader', name: '迷路的流浪商人', acts: [1], art: 'wandering_trader',
    when: (s) => chain(s, 'trader') === undefined,
    text: '流浪商人的羊驼被一队掠夺者惊散了。他焦急地朝你挥手：“帮帮我！它们驮着我全部的货！”',
    choices: (s) => [
      {
        label: '帮他夺回羊驼', desc: '和掠夺者战斗。胜利后获得 25 绿宝石，并且他会记住你。',
        run: (s) => ({ text: '你朝掠夺者的方向追了过去——', then: [makeEventBattle(s, 'ev_trader_pillagers', 'trader_help')] }),
      },
      {
        label: '资助他', desc: '花费 20 绿宝石，让他雇人去找。他会记住你。',
        disabled: needMoney(s, 20),
        run: (s) => {
          s.emeralds -= 20;
          setChain(s, 'trader', 1);
          return { text: '商人感激地握了握你的手：“下次见面，我一定好好报答你。”', tone: 'good' };
        },
      },
      {
        label: '趁火打劫', desc: '抢走他剩下的货：获得 45 绿宝石和 1 件物品……他不会忘记这件事。',
        run: (s, r) => {
          gainEmeralds(s, 45);
          if (s.potions.length < s.potionSlots) s.potions.push(rollItem(r, {}));
          setChain(s, 'trader', -1);
          return { text: '商人瞪着你远去的背影，嘴里念叨着什么。', tone: 'bad' };
        },
      },
      leave,
    ],
    winRewards: {
      trader_help: (s) => {
        gainEmeralds(s, 25);
        setChain(s, 'trader', 1);
        return [];
      },
    },
  },
  {
    id: 'trader_returns', name: '老朋友', acts: [2, 3], priority: true, art: 'wandering_trader',
    when: (s) => chain(s, 'trader') === 1,
    text: '那位流浪商人牵着满载的羊驼找到了你：“老朋友！这次的好东西，只给你看。”',
    choices: (s) => [
      {
        label: '挑一件宝物', desc: '免费从 3 件稀有或传说宝物中选一件。',
        run: (s) => {
          setChain(s, 'trader', 2);
          return { text: '商人掀开一块绣着金线的布。', tone: 'good', then: [{ type: 'relic_choice', title: '商人的珍藏', choices: relicChoices(s, 3, ['rare', 'legendary']), skippable: false }] };
        },
      },
      {
        label: '半价开传奇补给箱', desc: '花费 60 绿宝石，开启一个传奇品质的「不祥宝库」。',
        disabled: needMoney(s, 60),
        run: (s) => {
          s.emeralds -= 60;
          setChain(s, 'trader', 2);
          return { text: '“这箱子我可只卖给你。”', tone: 'good', then: [openCrate(s, 'ominous', 'boss', '商人的宝库')] };
        },
      },
    ],
  },
  {
    id: 'trader_revenge', name: '流浪商人的报复', acts: [2, 3], priority: true,
    when: (s) => chain(s, 'trader') === -1,
    text: '你被一群人拦在了路上。流浪商人躲在一只铁傀儡身后，指着你：“就是他！”',
    choices: (s) => [
      {
        label: '迎战', desc: '和商人雇来的护卫战斗。胜利后获得 60 绿宝石和 1 件物品。',
        run: (s) => ({ text: '铁傀儡朝你走了过来——', then: [makeEventBattle(s, 'ev_trader_revenge', 'trader_revenge')] }),
      },
      {
        label: '赔偿', desc: '交出 70 绿宝石，这件事就算了。',
        disabled: needMoney(s, 70),
        run: (s) => {
          s.emeralds -= 70;
          setChain(s, 'trader', -2);
          return { text: '商人数着绿宝石，哼了一声，带着护卫离开了。', tone: 'neutral' };
        },
      },
    ],
    winRewards: {
      trader_revenge: (s, r) => {
        gainEmeralds(s, 60);
        if (s.potions.length < s.potionSlots) s.potions.push(rollItem(r, { boost: 0.6 }));
        setChain(s, 'trader', -2);
        return [];
      },
    },
  },
  {
    id: 'trader_gift', name: '一封来信', acts: [3], priority: true, art: 'wandering_trader',
    when: (s) => chain(s, 'trader') === 2,
    text: '一只羊驼驮着包裹找到了你。信上写着：“祝你好运，屠龙者。——你的老朋友”',
    choices: (s) => [
      {
        label: '打开包裹', desc: '从 2 件传说宝物中选一件。',
        run: (s) => {
          setChain(s, 'trader', 3);
          return { text: '包裹里的东西闪闪发光。', tone: 'good', then: [{ type: 'relic_choice', title: '老朋友的礼物', choices: relicChoices(s, 2, ['legendary']), skippable: false }] };
        },
      },
    ],
  },
  {
    id: 'ominous_banner', name: '不祥旗帜', acts: [1, 2],
    when: (s) => chain(s, 'banner') === undefined,
    text: '路边插着一面破旧的不祥旗帜，旗杆下是一位袭击队长的遗物。灰色的人脸图案正盯着你。',
    choices: (s) => [
      {
        label: '扛起旗帜', desc: '本幕战斗绿宝石 +25%。但几层之后，灾厄袭击队会循着旗帜找上门（替换一场普通战斗，打赢有大奖）。',
        run: (s) => {
          setChain(s, 'banner', 1);
          s.ambush = { enc: 'ev_raid_ambush', onWin: 'raid_ambush', act: s.act, minRow: rowOf(s) + 3, name: '灾厄袭击！', desc: '你扛着的不祥旗帜把袭击队引来了。' };
          return { text: '你把旗帜扛在肩上。远处好像传来了号角声。', tone: 'neutral' };
        },
      },
      {
        label: '烧掉旗帜', desc: '获得 15 绿宝石，什么也不会发生。',
        run: (s) => {
          setChain(s, 'banner', -1);
          gainEmeralds(s, 15);
          return { text: '旗帜在火焰里卷曲，你从灰烬里翻出了几颗绿宝石。', tone: 'good' };
        },
      },
      leave,
    ],
    winRewards: {
      raid_ambush: (s) => {
        gainEmeralds(s, 50);
        setChain(s, 'banner', 2);
        return [{ type: 'relic_choice', title: '袭击战利品', choices: relicChoices(s, 3, ['rare', 'legendary']), skippable: false }];
      },
    },
  },
  {
    id: 'enderman_block', name: '末影人的方块', acts: [1, 2],
    when: (s) => chain(s, 'ender') === undefined,
    text: '一只末影人抱着一块草方块，茫然地站在路边，好像不知道该把它放在哪。',
    choices: () => [
      {
        label: '帮它放好', desc: '陪它找一个合适的地方。也许它会记住你。',
        run: (s) => {
          setChain(s, 'ender', 1);
          return { text: '末影人把方块放在一棵树旁，满意地发出了一串奇怪的声音，消失了。', tone: 'good' };
        },
      },
      {
        label: '盯着它看', desc: '和被激怒的末影人战斗。胜利后获得 25 绿宝石和一颗末影珍珠。',
        run: (s) => ({ text: '末影人的眼睛亮了起来——', then: [makeEventBattle(s, 'ev_enderman', 'enderman_fight')] }),
      },
      leave,
    ],
    winRewards: {
      enderman_fight: (s) => {
        gainEmeralds(s, 25);
        if (s.potions.length < s.potionSlots) s.potions.push('pearl');
        setChain(s, 'ender', -1);
        return [];
      },
    },
  },
  {
    id: 'enderman_returns', name: '末影人的回礼', acts: [3], priority: true, art: 'end_city',
    when: (s) => chain(s, 'ender') === 1,
    text: '在末地，那只末影人认出了你。它抱着一块紫珀，歪着头看你。',
    choices: (s) => [
      {
        label: '请它加入', desc: '获得一张末影人卡牌（★1，已有则合成升星）。',
        run: (s) => {
          setChain(s, 'ender', 2);
          gainCard(s, 'enderman', false);
          return { text: '末影人瞬移到你的队伍旁边，不打算走了。', tone: 'good' };
        },
      },
      {
        label: '收下礼物', desc: '获得宝物「末影之眼」（已有则改为 60 绿宝石）。',
        run: (s) => {
          setChain(s, 'ender', 2);
          if (hasRelic(s, 'ender_eye')) gainEmeralds(s, 60);
          else gainRelic(s, 'ender_eye');
          return { text: '它把一颗发着光的眼睛放在你手心，然后消失了。', tone: 'good' };
        },
      },
    ],
  },
  {
    id: 'rift_song', name: '裂隙中的歌声', acts: [2],
    when: (s) => chain(s, 'song') === undefined,
    text: '一道粉色的裂隙悬在半空，里面传出若有若无的歌声。透过裂隙，你看到一片粉色的草原。',
    choices: () => [
      {
        label: '走进裂隙', desc: '和筛界的生物战斗。胜利后开启一个「裂隙」补给箱，并记住这段旋律。',
        run: (s) => ({ text: '你一步跨进了裂隙——', then: [makeEventBattle(s, 'ev_rift_sift', 'rift_song')] }),
      },
      {
        label: '静静聆听', desc: '记住这段旋律。也许以后会再听到它。',
        run: (s) => {
          setChain(s, 'song', 1);
          return { text: '歌声渐渐远去，裂隙合上了。你却一直记得那段旋律。', tone: 'neutral' };
        },
      },
      {
        label: '封住裂隙', desc: '获得 20 绿宝石。',
        run: (s) => {
          setChain(s, 'song', -1);
          gainEmeralds(s, 20);
          return { text: '裂隙在你面前合拢，地上留下几颗绿宝石。', tone: 'good' };
        },
      },
    ],
    winRewards: {
      rift_song: (s) => {
        setChain(s, 'song', 1);
        return [openCrate(s, 'sift', 'premium', '裂隙补给箱')];
      },
      // Rift nodes on the act 2–3 maps share this reward.
      rift_node: () => [{ type: 'crates', title: '裂隙战利品：裂隙补给箱', offers: [{ crate: 'sift', grade: 'premium' }], skip: 15 }],
    },
  },
  {
    id: 'singer_appears', name: '歌者', acts: [3], priority: true, art: 'singer',
    when: (s) => chain(s, 'song') === 1,
    text: '那段旋律又响了起来。一个苍绿色的长颈生物从裂隙里走了出来，鹿角上挂着发光的果实——它是「歌者」。它在等你回答。',
    choices: (s) => [
      {
        label: '一起歌唱', desc: '歌者加入你的队伍（获得歌者卡牌）。',
        run: (s) => {
          setChain(s, 'song', 2);
          gainCard(s, 'singer', false);
          return { text: '歌者的声音和你的旋律合在一起，它决定跟着你走。', tone: 'good' };
        },
      },
      {
        label: '请它指路', desc: '打败末影龙后，前往筛界时额外获得一件宝物。',
        run: (s) => {
          setChain(s, 'song', 3);
          return { text: '歌者在你的地图上画了一道粉色的弧线。', tone: 'good' };
        },
      },
    ],
  },
);

// ───────────────────────── The Sift (act 4) ─────────────────────────

EVENTS.push(
  {
    id: 'lost_blub', name: '迷路的噗噗', acts: [4], art: 'sift',
    text: '一只发着蓝光的小兔子从草丛里探出头，吱吱叫着蹭了蹭你的靴子。它好像迷路了。',
    choices: () => [
      {
        label: '抱走它', desc: '获得一张噗噗卡牌（已有则合成升星）。',
        run: (s) => {
          gainCard(s, 'blub', false);
          return { text: '噗噗在你怀里缩成一团，发出满足的吱吱声。', tone: 'good' };
        },
      },
      {
        label: '跟着它走', desc: '回复 1 颗心，获得 40 绿宝石。',
        run: (s) => {
          s.hearts = Math.min(s.maxHearts, s.hearts + 1);
          gainEmeralds(s, 40);
          return { text: '它把你带到一处安静的草地，草下埋着别人丢下的绿宝石。', tone: 'good' };
        },
      },
      leave,
    ],
  },
  {
    id: 'ouch_spring', name: 'Ouch 泉', acts: [4], art: 'sift',
    text: '一汪发光的青色泉水咕嘟作响。筛界的生物在里面泡得很舒服，别的生物一碰就“嗷”地跳起来。',
    choices: (s) => [
      {
        label: '让筛界生物泡一泡', desc: '队伍中每张筛界卡牌属性永久 +10%。',
        disabled: s.team.some((c) => mobDef(c.mob).families.includes('sift')) ? undefined : '出战队伍里没有筛界生物',
        run: (s) => {
          let n = 0;
          for (const c of s.team)
            if (mobDef(c.mob).families.includes('sift')) {
              c.bonus = (c.bonus ?? 0) + 0.1;
              n++;
            }
          return { text: `${n} 只筛界生物泡完澡，精神抖擞。`, tone: 'good' };
        },
      },
      {
        label: '灌两瓶带走', desc: '获得 2 瓶喷溅型伤害药水。',
        disabled: s.potions.length >= s.potionSlots ? '物品栏已满' : undefined,
        run: (s) => {
          for (let k = 0; k < 2 && s.potions.length < s.potionSlots; k++) s.potions.push('splash_harming');
          return { text: '瓶子里的泉水还在冒泡。最好别洒到自己身上。', tone: 'good' };
        },
      },
      {
        label: '喝一口', desc: '失去 1 颗心，获得 70 绿宝石（泉底沉着不少宝石）。',
        disabled: s.hearts <= 1 ? '生命不足' : undefined,
        run: (s) => {
          s.hearts -= 1;
          gainEmeralds(s, 70);
          return { text: '嗷！你被烫得跳了起来，但顺手捞上来一把绿宝石。', tone: 'neutral' };
        },
      },
      leave,
    ],
  },
  {
    id: 'echo_shrine', name: '回响祭坛', acts: [4], art: 'singer',
    text: '灵魂方块堆成的祭坛前，几具回响傀儡静静站着。祭坛上刻着一行字：以灵魂换取回响。',
    choices: (s) => [
      {
        label: '献上灵魂', desc: '花费 50 绿宝石，从 3 件稀有或传说宝物中选一件。',
        disabled: needMoney(s, 50),
        run: (s) => {
          s.emeralds -= 50;
          return { text: '祭坛亮起青光，回响傀儡同时转过头来。', tone: 'good', then: [{ type: 'relic_choice', title: '回响祭坛', choices: relicChoices(s, 3, ['rare', 'legendary']), skippable: false }] };
        },
      },
      {
        label: '唤醒守卫', desc: '和祭坛守卫战斗。胜利后开启一个传奇品质的「裂隙」补给箱。',
        run: (s) => ({ text: '回响傀儡的眼睛亮了起来——', then: [makeEventBattle(s, 'ev_sift_guard', 'echo_shrine')] }),
      },
      leave,
    ],
    winRewards: {
      echo_shrine: (s) => [openCrate(s, 'sift', 'boss', '祭坛宝藏')],
    },
  },
  {
    id: 'tide_pool', name: '退潮', acts: [4], art: 'rift_song',
    text: '灵魂潮汐刚刚退去，草甸上留下了一片闪着微光的东西。',
    choices: (s) => [
      {
        label: '收集灵魂', desc: hasRelic(s, 'echo_shard') ? '获得 50 绿宝石。' : '获得宝物「回响碎片」。',
        run: (s) => {
          if (hasRelic(s, 'echo_shard')) gainEmeralds(s, 50);
          else gainRelic(s, 'echo_shard');
          return { text: '灵魂在你手里凝成了一块冰凉的碎片。', tone: 'good' };
        },
      },
      {
        label: '原地休息', desc: '回复 2 颗心。',
        disabled: s.hearts >= s.maxHearts ? '生命已满' : undefined,
        run: (s) => {
          s.hearts = Math.min(s.maxHearts, s.hearts + 2);
          return { text: '潮水退去后的筛界格外安静。你睡了一个好觉。', tone: 'good' };
        },
      },
    ],
  },

  // ───── V3.3 遗迹远征事件 ─────
  {
    id: 'rescue_merchant', name: '林间囚车', acts: [1, 2], art: 'village_exchange',
    when: (s) => !chain(s, 'merchant'),
    text: '一辆倾覆的村民货运囚车陷在路边泥沼中，四周游荡着灾厄巡逻队。车厢里传来呼救声。',
    choices: (s) => [
      {
        label: '救援商人', desc: '击退护卫灾厄小队。胜利后获得 18 绿宝石，开启商人链。',
        run: (s) => ({
          text: '你拔出武器冲向囚车！',
          then: [makeEventBattle(s, s.act === 1 ? 'a1_outpost' : 'ev_trader_pillagers', 'rescue_merchant')],
        }),
      },
      leave,
    ],
    winRewards: {
      rescue_merchant: (s) => {
        setChain(s, 'merchant', 1);
        gainEmeralds(s, 18);
        toast(s, '商人已被营救！商人链已开启。', 'good');
        return [];
      },
    },
  },
  {
    id: 'merchant_stock', name: '新开的小铺', acts: [2, 3], art: 'village_exchange',
    when: (s) => chain(s, 'merchant') === 1,
    priority: true,
    text: '你在林道旁看到了之前搭救的商人。他已经支起了一顶小帐篷，摆出了压箱底的货物。',
    choices: (s) => [
      {
        label: '购买特供道具', desc: '支付 26 绿宝石，三选一：狂战蘑菇 / 铁皮碎片 / 轻羽。',
        disabled: needMoney(s, 26) ?? (s.potions.length >= s.potionSlots ? '物品栏已满' : undefined),
        run: (s) => {
          s.emeralds -= 26;
          setChain(s, 'merchant', 2);
          return {
            text: '商人感激地把密封的瓶子递给你。',
            tone: 'good',
            then: [{
              type: 'potion_choice',
              choices: ['death_cap_mushroom', 'iron_hide_charm', 'light_feather'],
              skippable: false,
            }],
          };
        },
      },
      {
        label: '领取谢礼', desc: '免费领取 1 件消耗道具并告别。',
        disabled: s.potions.length >= s.potionSlots ? '物品栏已满' : undefined,
        run: (s, r) => {
          setChain(s, 'merchant', 2);
          const p = rollItem(r);
          s.potions.push(p);
          return { text: `商人送给你一瓶【${p}】作为答谢。`, tone: 'good' };
        },
      },
      {
        label: '道别离开', desc: '不购买任何东西并离开。',
        run: (s) => {
          setChain(s, 'merchant', 2);
          return { text: '你与商人告别，继续赶路。' };
        },
      },
    ],
  },
  {
    id: 'ancient_contract', name: '远古契约', acts: [2, 3], art: 'ancient_gateway',
    when: (s) => !chain(s, 'ancient'),
    text: '一座布满古老符文的石碑立在岔路口，碑文用远古文字铭刻着通往失落试炼的契约。',
    choices: (s) => [
      {
        label: '签订契约', desc: '支付 35 绿宝石，将后续道路中的一座门扉固定为远古试炼。',
        disabled: needMoney(s, 35),
        run: (s) => {
          s.emeralds -= 35;
          setChain(s, 'ancient', 1);
          return { text: '符文石碑亮起暗红色的光芒，契约已成。', tone: 'good' };
        },
      },
      leave,
    ],
  },
  {
    id: 'ancient_gate', name: '远古门扉', acts: [2, 3], art: 'ancient_gateway',
    when: (s) => chain(s, 'ancient') === 1,
    priority: true,
    text: '契约指引的远古门扉已然开启，门后传来沉重的巨响与幽火的呼啸。',
    choices: (s) => [
      {
        label: '挑战远古试炼', desc: '挑战首领试炼。胜利后从稀有宝物中三选一。',
        run: (s) => ({
          text: '你跨入远古大门，试炼开始了！',
          then: [makeEventBattle(s, s.act === 2 ? 'a2b_redstone_monstrosity' : 'a1b_nameless', 'ancient_gate')],
        }),
      },
      {
        label: '放弃契约', desc: '返还 15 绿宝石并终止契约。',
        run: (s) => {
          setChain(s, 'ancient', 2);
          gainEmeralds(s, 15);
          return { text: '你收回了残留的契约符石，大门缓缓闭合。', tone: 'neutral' };
        },
      },
    ],
    winRewards: {
      ancient_gate: (s) => {
        setChain(s, 'ancient', 2);
        toast(s, '远古试炼胜利！', 'good');
        return [{
          type: 'relic_choice',
          title: '远古试炼赏赐',
          choices: relicChoices(s, 3, ['rare', 'legendary']),
          skippable: false,
        }];
      },
    },
  },
  {
    id: 'secret_crypt', name: '隐秘地窖', acts: [1, 2, 3], art: 'ancient_gateway',
    text: '你在废墟的石板下发现了一处被厚实青苔锁扣封闭的地窖入口。',
    choices: (s) => {
      const hasKey = s.team.some((c) => c.mob === 'key_golem');
      const crateId = s.act === 1 ? 'royal_tomb' : s.act === 2 ? 'gilded_forge' : 'obsidian_archive';
      return [
        {
          label: '钥匙傀儡开锁', desc: hasKey ? '队伍中的钥匙傀儡伸出钥匙，免费开启地窖宝箱！' : '队伍中没有钥匙傀儡。',
          disabled: !hasKey ? '缺少钥匙傀儡' : undefined,
          run: (s) => ({
            text: '钥匙傀儡灵巧地转动锁芯，锁扣应声弹开！',
            tone: 'good',
            then: [openCrate(s, crateId, 'elite', '地窖宝藏')],
          }),
        },
        {
          label: '破锁开启', desc: '支付 25 绿宝石撬开地窖。',
          disabled: needMoney(s, 25),
          run: (s) => {
            s.emeralds -= 25;
            return {
              text: '你撬开了锁扣，进入了满是尘埃的地窖。',
              tone: 'good',
              then: [openCrate(s, crateId, 'normal', '地窖宝藏')],
            };
          },
        },
        leave,
      ];
    },
  },
  {
    id: 'gong_shrine', name: '破损铜锣', acts: [1, 2], art: 'ancient_gateway',
    when: (s) => !hasRelic(s, 'gong_fragment'),
    text: '石坛上供奉着一面被劈裂的古铜锣，即使残破也散发着震慑心魄的低鸣。',
    choices: (s) => [
      {
        label: '修缮铜锣', desc: '花费 35 绿宝石修复，获得宝物「弱化铜锣碎片」。',
        disabled: needMoney(s, 35),
        run: (s) => {
          s.emeralds -= 35;
          gainRelic(s, 'gong_fragment');
          return { text: '你细心修补好裂纹，铜锣发出一声浑厚共鸣。', tone: 'good' };
        },
      },
      {
        label: '触碰机关', desc: '打一场精英战斗，胜利后直接夺取铜锣碎片。',
        run: (s) => ({
          text: '机关被触发，守卫从暗处显形！',
          then: [makeEventBattle(s, s.act === 1 ? 'a1e_forest_royal' : 'a2e_forge_overload', 'gong_shrine')],
        }),
      },
      leave,
    ],
    winRewards: {
      gong_shrine: (s) => {
        gainRelic(s, 'gong_fragment');
        return [];
      },
    },
  },
  {
    id: 'runesmith', name: '符文铁匠', acts: [2, 3], art: 'village_exchange',
    when: (s) => s.team.some((c) => !c.enchant || (c.enchantLv ?? 2) < 3),
    text: '一位流浪的符文铁匠正在擦拭他的锻造锤，身旁摆着各种附魔典籍。',
    choices: (s) => [
      {
        label: '刻印符文', desc: '支付 30 绿宝石，从 3 本附魔书中选一本刻印。',
        disabled: needMoney(s, 30),
        run: (s) => {
          s.emeralds -= 30;
          const books = randomBooks(s, 3);
          return {
            text: '铁匠摊开书卷，供你挑选符文。',
            tone: 'good',
            then: [{
              type: 'enchant_choice',
              title: '符文铁匠',
              books,
              cost: 0,
            }],
          };
        },
      },
      leave,
    ],
  },
  {
    id: 'bee_rescue', name: '蜂群失巢', acts: [1, 2], art: 'village_exchange',
    when: (s) => !hasRelic(s, 'hive_heart'),
    text: '一窝失去巢穴的蜜蜂在花丛中焦急地盘旋。',
    choices: (s) => [
      {
        label: '供养蜂群', desc: '支付 40 绿宝石修筑新巢，获得宝物「蜂巢之心」。',
        disabled: needMoney(s, 40),
        run: (s) => {
          s.emeralds -= 40;
          gainRelic(s, 'hive_heart');
          return { text: '蜜蜂们欢快地采蜜筑巢，将一枚花蜜核心赠予你。', tone: 'good' };
        },
      },
      {
        label: '引渡蜂群', desc: '交出 1 瓶消耗品，获得道具「便携蜂巢」。',
        disabled: s.potions.length === 0 ? '背包没有消耗品' : undefined,
        run: (s) => {
          s.potions.pop();
          s.potions.push('buzzy_nest');
          return { text: '你用空瓶妥善收纳了一小撮工蜂。', tone: 'good' };
        },
      },
      leave,
    ],
  },
  {
    id: 'lost_cartographer', name: '迷途测绘师', acts: [1, 2, 3], art: 'village_exchange',
    text: '一位手持图纸的制图师正在岩壁前核对坐标。',
    choices: (s) => [
      {
        label: '购买路线情报', desc: '支付 20 绿宝石，获得前进路线的情报与 1 瓶迅捷药水。',
        disabled: needMoney(s, 20) ?? (s.potions.length >= s.potionSlots ? '物品栏已满' : undefined),
        run: (s) => {
          s.emeralds -= 20;
          s.potions.push('swiftness');
          return { text: '测绘师为你标注了近路，并附赠了一瓶提速药水。', tone: 'good' };
        },
      },
      {
        label: '出售物资', desc: '交出 1 瓶消耗品，换取 15 绿宝石。',
        disabled: s.potions.length === 0 ? '背包没有消耗品' : undefined,
        run: (s) => {
          s.potions.pop();
          gainEmeralds(s, 15);
          return { text: '测绘师欣然买下了你的多余物资。', tone: 'neutral' };
        },
      },
      leave,
    ],
  },
  {
    id: 'void_bargain', name: '虚空交易', acts: [3], art: 'ancient_gateway',
    when: (s) => s.team.length >= 2,
    text: '虚空暗影中浮现出一双发光的紫色眼睛。深渊的低语要求以等价的代价进行交易。',
    choices: (s) => [
      {
        label: '献金换魂', desc: '支付 30 绿宝石，获得宝物「灵魂容器」。',
        disabled: needMoney(s, 30),
        run: (s) => {
          s.emeralds -= 30;
          gainRelic(s, 'soul_vessel');
          return { text: '一枚散发幽绿冷光的虚空容器落入你的背包。', tone: 'good' };
        },
      },
      leave,
    ],
  },
);

export const EVENT_MAP: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

export function eventMobName(id: string) {
  return mobDef(id).name;
}
