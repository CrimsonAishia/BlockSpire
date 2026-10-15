// Commanders: each one changes HOW a run is played, not just its numbers — a battle skill on
// the hotbar, a run mechanic, passives and a few exclusive relics that build on them.

export type SkillId = 'build' | 'tame' | 'golem' | 'brew';

export interface CommanderDef {
  id: string;
  name: string;
  title: string;
  color: string;
  hearts: number;
  emeralds: number;
  /** Commanders unlock in a chain: slay the dragon with the one before it on at least this omen level. */
  unlock?: { text: string; key: string; prev: string; omen: number };
  /** One line on how this commander wins. */
  style: string;
  /** Battle skill (hotbar). */
  skill: { id: SkillId; name: string; desc: string; charges: number };
  /** What changes on the map / in shops. */
  mechanic?: { name: string; desc: string };
  /** Plain passives. */
  desc: string[];
}

export const COMMANDERS: CommanderDef[] = [
  {
    id: 'steve', name: '史蒂夫', title: '建造者', color: '#3fb6d9', hearts: 7, emeralds: 100,
    style: '地形流：砌墙把敌人引进窄口，给远程垫高台——让战场替你打仗。',
    skill: {
      id: 'build', name: '建造', charges: 4,
      desc: '每场 4 次，布阵时就能建：「圆石墙」砌一道 3 格长、2 格高的墙，挡住敌人的行走和投射物（我方的箭能越墙射出）；「土台」把 3×3 区域垫高 2 格，站上去的远程会坚守高台、居高临下。紧挨己方墙壁或站在土台上的友军受到伤害 -20%。只能建在我方半场，不能把路完全堵死，墙会被爆炸炸毁。',
    },
    desc: ['初始 7 颗心、100 绿宝石：最皮实的统领，适合第一次游玩。', '每场战斗胜利额外获得 4 绿宝石。'],
  },
  {
    id: 'alex', name: '亚历克斯', title: '驯兽师', color: '#ff8a3d', hearts: 5, emeralds: 50,
    unlock: { text: '用史蒂夫通关（击败末影龙）', key: 'unlock_alex', prev: 'steve', omen: 0 },
    style: '收服流：把打残的敌人拉进队伍，组出补给箱开不到的阵容。',
    skill: {
      id: 'tame', name: '驯服', charges: 1,
      desc: '每场 1 次：点一个生命足够低的非首领敌人，它立刻倒戈为你作战。门槛：军规/受限 ≤60%，保密 ≤45%，隐秘/特殊 ≤30%；野兽再 +20%。',
    },
    mechanic: { name: '收服', desc: '战斗胜利时，被驯服的生物如果还活着，可以把它收为 ★1 卡牌（重复的会合成升星）。精英战的强敌也能收服。' },
    desc: ['开箱时品质升档几率 +10%。', '野兽单位生命与攻击力 +15%。'],
  },
  {
    id: 'villager', name: '村民', title: '大商人', color: '#4caf50', hearts: 5, emeralds: 120,
    unlock: { text: '用亚历克斯在不祥之兆 I 或更高难度下通关', key: 'unlock_villager', prev: 'alex', omen: 1 },
    style: '经济流：钱就是战力——指定订购想要的生物，危急时花钱雇铁傀儡。',
    skill: {
      id: 'golem', name: '雇佣铁傀儡', charges: 1,
      desc: '每场 1 次：花费绿宝石（第一幕 25，之后每幕 +15）在我方半场召唤一只村庄铁傀儡，本场有效。',
    },
    mechanic: { name: '订购', desc: '商店多一个「订购」：从本幕补给箱的生物池里指定买一只（军规 50 / 受限 85 / 保密 150），每家商店 1 次。' },
    desc: ['初始绿宝石 120。', '商店价格 -20%，每层结束获得 10% 利息（最多 15）。'],
  },
  {
    id: 'witch', name: '女巫', title: '药剂师', color: '#9b59b6', hearts: 5, emeralds: 60,
    unlock: { text: '用村民在不祥之兆 II 或更高难度下通关', key: 'unlock_witch', prev: 'villager', omen: 2 },
    style: '药剂流：每场都有免费药水，药效更强，异常状态伤害更高——靠道具运营取胜。',
    skill: {
      id: 'brew', name: '坩埚', charges: 1,
      desc: '每场开战时熬好 1 瓶限定药水，出现在物品栏旁，只在本场可用，不占格子。',
    },
    mechanic: { name: '药剂学', desc: '你使用的药水效果 +20%，喷溅与滞留药水范围 +20%；友方中毒与燃烧伤害 +30%。' },
    desc: ['物品栏 +1，开局携带 2 瓶随机药水。'],
  },
];
export const COMMANDER_MAP: Record<string, CommanderDef> = Object.fromEntries(COMMANDERS.map((c) => [c.id, c]));

/** Hotbar entries per skill: Steve's building has two shapes sharing one pool of charges. */
export const SKILL_INFO: Record<string, { name: string; icon: string; color: string; desc: string }> = {
  wall: { name: '圆石墙', icon: 'skill_wall', color: '#9a9a9a', desc: '在我方半场砌一道 3 格长、2 格高的墙：挡住敌人的行走与投射物，我方的箭可以越墙射出；紧挨墙的友军受到伤害 -20%。' },
  platform: { name: '土台', icon: 'skill_platform', color: '#a07a4a', desc: '把 3×3 区域垫高 2 格：站上去的远程会坚守高台、居高临下，站在上面的友军受到伤害 -20%。' },
  tame: { name: '驯服', icon: 'skill_tame', color: '#ff8a3d', desc: '点一个生命足够低的敌人，它立刻倒戈为你作战。' },
  golem: { name: '雇佣铁傀儡', icon: 'skill_golem', color: '#d9d5cd', desc: '花费绿宝石，在我方半场召唤一只铁傀儡。' },
};
