import type { MobDef, Rarity } from '../core/types.ts';

// Base stats are for ★1. Star scaling is derived in starStatMul() so that every card gains
// the same relative power per star regardless of how its unit count grows.
// Power reference ("√(总生命×总DPS)") per rarity tier is ~×1.27; abilities are budgeted in.

export const MOBS: MobDef[] = [
  // ───────────── 蓝 · 军规级 ─────────────
  {
    id: 'zombie', name: '僵尸', rarity: 'blue', families: ['undead'], role: 'melee',
    hp: 150, atk: 13, cd: 1.1, range: 10, speed: 38, armor: 0.05, radius: 15, size: 64,
    count: [4, 5, 6], ai: 'zombie', defaultRow: 'front',
    skill: { name: '感染', desc: '击杀非首领敌人时有 22% 几率将其转化为一只友方僵尸（60% 属性）。' },
    star3: '感染几率提升至 40%，转化的僵尸继承 100% 属性。',
    flavor: '最常见的不死生物，数量就是它们的盔甲。',
  },
  {
    id: 'skeleton', name: '骷髅', rarity: 'blue', families: ['undead'], role: 'ranged',
    hp: 80, atk: 13, cd: 1.4, range: 250, speed: 40, armor: 0, radius: 14, size: 64,
    count: [3, 4, 5], ai: 'skeleton', projectile: 'arrow', defaultRow: 'back',
    skill: { name: '连射', desc: '每第 4 次攻击改为扇形射出 3 支箭。' },
    star3: '每第 3 次攻击触发连射，且箭矢可穿透 1 个目标。',
    flavor: '骨头咔哒作响的弓手，总能在你最没防备时射来一箭。',
  },
  {
    id: 'spider', name: '蜘蛛', rarity: 'blue', families: ['arthropod'], role: 'melee',
    hp: 135, atk: 12, cd: 0.85, range: 10, speed: 64, armor: 0, radius: 18, size: 46,
    count: [4, 5, 6], ai: 'spider', defaultRow: 'front',
    skill: { name: '飞扑', desc: '对 60~200 距离内的目标飞扑，造成 2 倍伤害（冷却 5 秒）。' },
    star3: '飞扑命中后眩晕目标 0.7 秒。',
    flavor: '八条腿跑得比你快，墙也拦不住它。',
  },
  {
    id: 'silverfish', name: '蠹虫', rarity: 'blue', families: ['arthropod'], role: 'melee',
    hp: 44, atk: 7, cd: 0.6, range: 8, speed: 76, armor: 0, radius: 10, size: 26,
    count: [8, 10, 12], ai: 'silverfish', defaultRow: 'front',
    skill: { name: '虫群呼唤', desc: '每只蠹虫首次生命低于 50% 时，有 25% 几率唤醒一只新的蠹虫。' },
    star3: '唤醒几率提升至 45%，新蠹虫也能继续呼唤同伴。',
    flavor: '敲碎一块石头，跑出来一窝。',
  },
  {
    id: 'slime', name: '史莱姆', rarity: 'blue', families: ['slime'], role: 'tank',
    hp: 230, atk: 13, cd: 1.2, range: 10, speed: 34, armor: 0, radius: 24, size: 56,
    count: [2, 2, 3], ai: 'slime', defaultRow: 'front',
    skill: { name: '分裂', desc: '死亡时分裂为 2 只中史莱姆，中史莱姆死亡再分裂为 2 只小史莱姆。' },
    star3: '每次分裂改为 3 只。',
    flavor: '打一只，来两只；打两只，来四只。',
  },
  {
    id: 'snow_golem', name: '雪傀儡', rarity: 'blue', families: ['construct'], role: 'support',
    hp: 85, atk: 5, cd: 0.55, range: 220, speed: 36, armor: 0, radius: 15, size: 60,
    count: [3, 4, 5], ai: 'snow_golem', projectile: 'snowball', defaultRow: 'back',
    skill: { name: '冰霜雪球', desc: '雪球叠加寒意：每层降低目标 12% 移速与攻速（最多 3 层，2 秒），并轻微击退。' },
    star3: '雪球命中时溅射周围 35 范围的敌人。',
    flavor: '伤害不高，但没人喜欢被雪球砸脸。',
  },
  {
    id: 'wolf', name: '狼', rarity: 'blue', families: ['beast'], role: 'melee',
    hp: 125, atk: 12, cd: 0.75, range: 8, speed: 72, armor: 0, radius: 14, size: 44,
    count: [4, 5, 6], ai: 'wolf', defaultRow: 'front',
    skill: { name: '狼群', desc: '每有一只其他友方狼存活，攻击力 +8%（最多 +40%）。' },
    star3: '狼群加成提升至每只 +12%，并获得 15% 吸血。',
    flavor: '一只狼是宠物，一群狼是灾难。',
  },
  {
    id: 'bee', name: '蜜蜂', rarity: 'blue', families: ['arthropod'], role: 'assassin',
    hp: 72, atk: 10, cd: 0.9, range: 8, speed: 72, armor: 0, radius: 11, size: 34, flying: true, alt: 26,
    count: [5, 6, 8], ai: 'bee', defaultRow: 'mid',
    skill: { name: '毒刺', desc: '首次攻击造成 3 倍伤害并使目标中毒（5/秒，5 秒），之后失去毒刺攻击力减半。' },
    star3: '毒刺每 8 秒重新长出。',
    flavor: '蜇完就后悔的那种。',
  },
  {
    id: 'goat', name: '山羊', rarity: 'blue', families: ['beast'], role: 'melee',
    hp: 165, atk: 15, cd: 1.1, range: 10, speed: 52, armor: 0.05, radius: 17, size: 50,
    count: [3, 4, 5], ai: 'goat', defaultRow: 'front',
    skill: { name: '冲撞', desc: '向 80~260 距离内的目标冲锋，造成 2.5 倍伤害、强力击退并眩晕 0.5 秒（冷却 6 秒）。' },
    star3: '冲锋路径上的所有敌人都会被撞飞。',
    flavor: '站在悬崖边的时候，别背对山羊。',
  },
  {
    id: 'endermite', name: '末影螨', rarity: 'blue', families: ['arthropod', 'ender'], role: 'melee',
    hp: 48, atk: 7, cd: 0.6, range: 8, speed: 72, armor: 0, radius: 9, size: 22,
    count: [7, 9, 11], ai: 'endermite', defaultRow: 'front',
    skill: { name: '虚空闪烁', desc: '受到攻击时有 25% 几率闪烁躲开这次伤害。' },
    star3: '闪烁几率提升至 40%，闪烁后瞬移至敌方后排。',
    flavor: '末影珍珠的副产品，小而烦人。',
  },

  {
    id: 'bogged', name: '沼骸', rarity: 'blue', families: ['undead'], role: 'ranged',
    hp: 75, atk: 11, cd: 1.5, range: 240, speed: 40, armor: 0, radius: 14, size: 64,
    count: [3, 4, 5], ai: 'bogged', projectile: 'arrow', defaultRow: 'back',
    skill: { name: '毒箭', desc: '箭矢使目标中毒（4/秒，4 秒，可叠加 2 层）。' },
    star3: '每第 3 次射击齐射 3 支毒箭。',
    flavor: '试炼密室和沼泽里长满蘑菇的骷髅，箭头蘸着毒。',
  },
  {
    id: 'armadillo', name: '犰狳', rarity: 'blue', families: ['beast'], role: 'tank',
    hp: 200, atk: 10, cd: 1.0, range: 10, speed: 44, armor: 0.1, radius: 14, size: 44,
    count: [3, 4, 5], ai: 'armadillo', defaultRow: 'front',
    skill: { name: '缩成球', desc: '生命首次低于一半、或同时被 3 个以上敌人攻击时，卷成一个球 3 秒：受到伤害 -70%，期间不能攻击（冷却 8 秒）。' },
    star3: '卷起时反弹 30% 近战伤害。',
    flavor: '一碰就缩成一团，鳞甲还能做成狼铠。',
  },
  {
    id: 'baby_sifter', name: '小筛者', rarity: 'blue', families: ['sift'], role: 'melee',
    hp: 64, atk: 9, cd: 0.7, range: 8, speed: 70, armor: 0, radius: 11, size: 34,
    count: [6, 8, 10], ai: 'baby_sifter', defaultRow: 'front',
    skill: { name: '群咬', desc: '每有一只其他小筛者在攻击同一个目标，伤害 +12%（最多 +60%）。' },
    star3: '攻击附加「回响」：目标受到的下一次伤害 +20%。',
    flavor: '筛界里最早扑上来的就是它们，一窝一窝的。',
  },
  {
    id: 'blub', name: '噗噗', rarity: 'blue', families: ['sift'], role: 'support',
    hp: 85, atk: 4, cd: 1.0, range: 10, speed: 52, armor: 0, radius: 10, size: 30,
    count: [3, 4, 5], ai: 'blub', defaultRow: 'mid',
    skill: { name: '微光', desc: '身上的微光让周围 2 格内的友军每秒回复 1.8% 最大生命（多只噗噗不叠加）。被打时会尖叫着蹦开。' },
    star3: '微光范围 3 格，回复提升到每秒 2.6%。',
    flavor: '筛界的发光小兔，抱起来会吱吱叫。',
  },

  // ───────────── 紫 · 受限级 ─────────────
  {
    id: 'creeper', name: '苦力怕', rarity: 'purple', families: [], role: 'bomber',
    hp: 130, atk: 185, cd: 1, range: 22, speed: 48, armor: 0, radius: 15, size: 60,
    count: [3, 3, 4], ai: 'creeper', defaultRow: 'mid',
    skill: { name: '嘶……', desc: '冲向敌人最密集处，点燃引信 1 秒后爆炸，对 85 范围内敌人造成大量伤害并击退。' },
    star3: '化为闪电苦力怕：爆炸范围 +40%，伤害 ×1.8。',
    flavor: '那声“嘶……”是每个玩家的噩梦。',
  },
  {
    id: 'witch', name: '女巫', rarity: 'purple', families: ['illager'], role: 'support',
    hp: 160, atk: 26, cd: 2.2, range: 220, speed: 36, armor: 0, radius: 15, size: 66,
    count: [2, 2, 3], ai: 'witch', projectile: 'potion', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '药剂学', desc: '投掷伤害药水（范围魔法伤害，治疗亡灵）。每第 3 次投掷改为给受伤友军丢治疗药水；首次低于 40% 生命时喝药回复 40%。' },
    star3: '每次同时投掷 2 瓶药水。',
    flavor: '她的药水对不死生物来说是补品。',
  },
  {
    id: 'pillager', name: '掠夺者', rarity: 'purple', families: ['illager'], role: 'ranged',
    hp: 110, atk: 20, cd: 1.9, range: 280, speed: 40, armor: 0, radius: 14, size: 64,
    count: [3, 3, 4], ai: 'pillager', projectile: 'bolt', defaultRow: 'back',
    skill: { name: '穿透弩矢', desc: '弩箭直线飞行，最多贯穿 3 个敌人。' },
    star3: '多重射击：每次射出 3 支弩箭。',
    flavor: '巡逻队的主力，弩箭能把盾牌钉在墙上。',
  },
  {
    id: 'vindicator', name: '卫道士', rarity: 'purple', families: ['illager'], role: 'melee',
    hp: 210, atk: 26, cd: 1.25, range: 10, speed: 50, armor: 0.1, radius: 15, size: 64,
    count: [3, 3, 4], ai: 'vindicator', defaultRow: 'front',
    skill: { name: '狂斧', desc: '生命低于 50% 时攻速 +40%、移速 +20%。' },
    star3: '斧击横扫周围 50 范围，造成 50% 溅射伤害。',
    flavor: '“Johnny” 不是它的名字，但它会让你记住它。',
  },
  {
    id: 'husk', name: '尸壳', rarity: 'purple', families: ['undead'], role: 'tank',
    hp: 200, atk: 17, cd: 1.1, range: 10, speed: 38, armor: 0.1, radius: 15, size: 64,
    count: [3, 3, 4], ai: 'husk', immune: ['burn'], defaultRow: 'front',
    skill: { name: '饥饿', desc: '攻击使目标饥饿，攻速降低 30%，持续 3 秒。免疫燃烧。' },
    star3: '额外免疫中毒，并获得 15% 吸血。',
    flavor: '沙漠烈日晒不化它，反而让它更饥渴。',
  },
  {
    id: 'stray', name: '流浪者', rarity: 'purple', families: ['undead'], role: 'ranged',
    hp: 90, atk: 13, cd: 1.45, range: 260, speed: 40, armor: 0, radius: 14, size: 64,
    count: [4, 4, 5], ai: 'stray', projectile: 'arrow', defaultRow: 'back',
    skill: { name: '迟缓之箭', desc: '箭矢使目标迟缓：移速 -35%、攻速 -20%，持续 2.5 秒。' },
    star3: '箭矢命中时额外冻结目标 0.35 秒。',
    flavor: '冰原上游荡的骷髅，箭头淬着寒霜。',
  },
  {
    id: 'drowned', name: '溺尸', rarity: 'purple', families: ['undead', 'aquatic'], role: 'melee',
    hp: 175, atk: 14, cd: 1.1, range: 10, speed: 40, armor: 0.05, radius: 15, size: 64,
    count: [3, 3, 4], ai: 'drowned', projectile: 'trident', defaultRow: 'front',
    skill: { name: '三叉戟', desc: '对 80~260 距离的敌人投掷三叉戟，造成 2.2 倍伤害（冷却 4 秒）。' },
    star3: '三叉戟附带引雷，命中时召唤闪电。',
    flavor: '从水底爬出来，手里攥着你梦寐以求的三叉戟。',
  },
  {
    id: 'cave_spider', name: '洞穴蜘蛛', rarity: 'purple', families: ['arthropod'], role: 'melee',
    hp: 78, atk: 9, cd: 0.75, range: 8, speed: 66, armor: 0, radius: 12, size: 34,
    count: [6, 7, 9], ai: 'cave_spider', defaultRow: 'front',
    skill: { name: '剧毒', desc: '攻击叠加中毒（4/秒，4 秒，最多 3 层）。中毒无视护甲但不会致死。' },
    star3: '中毒最多叠加 5 层。',
    flavor: '废弃矿井的刷怪笼里，永远刷不完的毒蛛。',
  },
  {
    id: 'sniffer', name: '嗅探兽', rarity: 'purple', families: ['beast'], role: 'support',
    hp: 330, atk: 14, cd: 1.5, range: 12, speed: 34, armor: 0.1, radius: 24, size: 70,
    count: [2, 2, 3], ai: 'sniffer', defaultRow: 'mid',
    skill: { name: '古种挖掘', desc: '每 8 秒停下嗅探 1.2 秒，在友军最多的地方挖出一颗古老种子，长成火把花 6 秒：周围 2 格内的友军每秒回复 2% 最大生命，攻击速度 +20%。' },
    star3: '每 6 秒挖掘一次，火把花持续 9 秒、范围 2.5 格，攻速 +30%。',
    flavor: '从远古苏醒的大家伙，鼻子比谁都灵，总能刨出早已失传的种子。',
  },
  {
    id: 'polar_bear', name: '北极熊', rarity: 'purple', families: ['beast'], role: 'tank',
    hp: 390, atk: 22, cd: 1.35, range: 10, speed: 44, armor: 0.12, radius: 22, size: 64,
    count: [2, 2, 3], ai: 'polar_bear', defaultRow: 'front',
    skill: { name: '重掌', desc: '每第 3 次攻击造成 2 倍伤害并眩晕目标 0.4 秒。' },
    star3: '每 8 秒咆哮一次，嘲讽周围敌人 2 秒。',
    flavor: '护崽的熊是世界上最危险的东西之一。',
  },
  {
    id: 'phantom', name: '幻翼', rarity: 'purple', families: ['undead'], role: 'assassin',
    hp: 110, atk: 36, cd: 1.8, range: 10, speed: 88, armor: 0, radius: 16, size: 46, flying: true, alt: 70,
    count: [3, 3, 4], ai: 'phantom', defaultRow: 'mid',
    skill: { name: '俯冲', desc: '优先攻击敌方后排。俯冲攻击后拉升盘旋，高空时近战无法触及。' },
    star3: '俯冲伤害 ×1.5，并使目标流血（凋零 3 秒）。',
    flavor: '三天不睡觉，它们就会来找你。',
  },

  {
    id: 'frostbite', name: '冰封僵尸', rarity: 'purple', families: ['undead'], role: 'melee',
    hp: 190, atk: 15, cd: 1.1, range: 10, speed: 38, armor: 0.05, radius: 15, size: 64,
    count: [3, 3, 4], ai: 'frostbite', defaultRow: 'front',
    skill: { name: '寒冰之触', desc: '攻击使目标冰冻 2 秒（持续伤害并减速）。每第 4 次攻击改为投出冰球：远程击退并冰冻 3 秒。免疫冰冻。' },
    star3: '冰球砸中时冻住目标 0.6 秒，并溅射周围。',
    flavor: '冬季更新的新僵尸：在细雪里待太久的僵尸会变成它。',
  },
  {
    id: 'parched', name: '焦骸', rarity: 'purple', families: ['undead'], role: 'ranged',
    hp: 95, atk: 14, cd: 1.5, range: 260, speed: 42, armor: 0, radius: 14, size: 64,
    count: [3, 4, 4], ai: 'parched', projectile: 'arrow', immune: ['burn'], defaultRow: 'back',
    skill: { name: '虚弱之箭', desc: '箭矢使目标虚弱：攻击力 -30%，持续 4 秒。免疫燃烧。' },
    star3: '对虚弱中的目标伤害 +25%。',
    flavor: '沙漠里被晒干的骷髅，常骑在骆驼尸壳背上。',
  },
  {
    id: 'bearded_sifter', name: '须筛者', rarity: 'purple', families: ['sift'], role: 'ranged',
    hp: 120, atk: 19, cd: 1.6, range: 250, speed: 38, armor: 0, radius: 15, size: 58,
    count: [2, 3, 3], ai: 'bearded_sifter', projectile: 'chin_spike', defaultRow: 'back',
    skill: { name: '须弹', desc: '甩头射出须弹：先追踪 0.5 秒锁定目标，再沿直线加速飞行（锁定后可以被躲开）。' },
    star3: '每次射出 2 枚须弹。',
    flavor: '下巴上的须子能当飞镖用。',
  },
  {
    id: 'nester', name: '筑巢者', rarity: 'purple', families: ['sift', 'beast'], role: 'assassin',
    hp: 180, atk: 26, cd: 1.2, range: 10, speed: 60, armor: 0.05, radius: 15, size: 50,
    count: [2, 3, 3], ai: 'nester', defaultRow: 'mid',
    skill: { name: '扑咬', desc: '蓄力后扑向 80~220 距离内的敌人，造成 2 倍伤害，之后停顿 1 秒（冷却 5 秒）。优先扑后排。' },
    star3: '扑咬后不再停顿。',
    flavor: '跳起来比你想的远。',
  },

  // ───────────── 粉 · 保密级 ─────────────
  {
    id: 'blaze', name: '烈焰人', rarity: 'pink', families: ['nether'], role: 'ranged',
    hp: 200, atk: 16, cd: 2.6, range: 260, speed: 32, armor: 0, radius: 16, size: 66, flying: true, alt: 30,
    count: [2, 3, 3], ai: 'blaze', projectile: 'fireball', immune: ['burn'], defaultRow: 'back',
    skill: { name: '烈焰弹幕', desc: '连续发射 3 枚小火球，每枚造成伤害并点燃目标（5/秒，3 秒）。免疫燃烧。' },
    star3: '每轮发射 4 枚火球，火球命中时溅射。',
    flavor: '下界要塞的炮台，烈焰棒的来源。',
  },
  {
    id: 'enderman', name: '末影人', rarity: 'pink', families: ['ender'], role: 'assassin',
    hp: 320, atk: 30, cd: 1.1, range: 12, speed: 55, armor: 0.05, radius: 15, size: 96,
    count: [2, 2, 3], ai: 'enderman', defaultRow: 'mid',
    skill: { name: '瞬移', desc: '开战后瞬移至敌方后排远程身后。被投射物命中时瞬移闪避（冷却 1 秒）。' },
    star3: '瞬移后的首次攻击伤害 ×2 并眩晕 1 秒。',
    flavor: '别盯着它的眼睛看。',
  },
  {
    id: 'evoker', name: '唤魔者', rarity: 'pink', families: ['illager'], role: 'summoner',
    hp: 290, atk: 18, cd: 3.5, range: 250, speed: 34, armor: 0, radius: 15, size: 66,
    count: [1, 1, 2], ai: 'evoker', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '尖牙与恼鬼', desc: '向目标召唤一排尖牙（每颗造成魔法伤害）。每 9 秒召唤 3 只恼鬼（最多 6 只，存在 25 秒）。' },
    star3: '每次召唤 4 只恼鬼；身边有敌人时尖牙改为环形围绕自身。',
    flavor: '林地府邸的主人，不死图腾的持有者。',
  },
  {
    id: 'piglin_brute', name: '猪灵蛮兵', rarity: 'pink', families: ['nether'], role: 'melee',
    hp: 400, atk: 42, cd: 1.5, range: 12, speed: 46, armor: 0.2, radius: 16, size: 68,
    count: [2, 2, 3], ai: 'piglin_brute', defaultRow: 'front',
    skill: { name: '处决', desc: '对生命低于 40% 的目标造成 +50% 伤害。' },
    star3: '每次击杀回复 20% 最大生命。',
    flavor: '堡垒遗迹的守卫，不吃金子那一套。',
  },
  {
    id: 'hoglin', name: '疣猪兽', rarity: 'pink', families: ['nether', 'beast'], role: 'tank',
    hp: 520, atk: 28, cd: 1.3, range: 10, speed: 44, armor: 0.1, radius: 22, size: 68,
    count: [2, 2, 3], ai: 'hoglin', defaultRow: 'front',
    skill: { name: '挑飞', desc: '每第 3 次攻击将目标挑向空中，造成 1.3 倍伤害并使其失去行动 0.9 秒。' },
    star3: '挑飞改为范围效果，影响周围 55 范围。',
    flavor: '绯红森林里横冲直撞的獠牙。',
  },
  {
    id: 'shulker', name: '潜影贝', rarity: 'pink', families: ['ender', 'construct'], role: 'ranged',
    hp: 240, atk: 16, cd: 2.0, range: 320, speed: 0, armor: 0.1, radius: 18, size: 50,
    count: [2, 2, 3], ai: 'shulker', projectile: 'shulker_bullet', defaultRow: 'back',
    skill: { name: '漂浮弹', desc: '发射追踪弹，命中有 20%/30%/40% 几率使目标漂浮 1.5 秒（无法行动）并在落地时受到伤害。闭壳时护甲 +40%。不能行走，射程内没有敌人时会传送到战场附近（冷却 6 秒）。' },
    star3: '每次发射 2 枚追踪弹（双弹共享一次浮空判定）。',
    flavor: '末地城的门卫，被打中你就得飞一会儿了。',
  },
  {
    id: 'ghast', name: '恶魂', rarity: 'pink', families: ['nether'], role: 'ranged',
    hp: 250, atk: 45, cd: 4.0, range: 400, speed: 26, armor: 0, radius: 26, size: 92, flying: true, alt: 90,
    count: [1, 1, 2], ai: 'ghast', projectile: 'big_fireball', defaultRow: 'back',
    skill: { name: '巨型火球', desc: '向远处发射缓慢的巨型火球，爆炸造成范围伤害并点燃。飞行于高处，越过地形与障碍。' },
    star3: '火球落点留下 3 秒火焰区域。',
    flavor: '哭声在下界回荡，火球在你脚下炸开。',
  },
  {
    id: 'wither_skeleton', name: '凋灵骷髅', rarity: 'pink', families: ['undead', 'nether'], role: 'melee',
    hp: 310, atk: 32, cd: 1.2, range: 12, speed: 48, armor: 0.1, radius: 15, size: 80,
    count: [2, 2, 3], ai: 'wither_skeleton', immune: ['burn', 'wither'], defaultRow: 'front',
    skill: { name: '凋零之刃', desc: '攻击附加凋零（6/秒，4 秒，期间无法被治疗）。免疫燃烧。' },
    star3: '凋零伤害翻倍，持续时间 +2 秒。',
    flavor: '下界要塞的黑色剑士，头颅价值连城。',
  },
  {
    id: 'magma_cube', name: '岩浆怪', rarity: 'pink', families: ['nether', 'slime'], role: 'tank',
    hp: 215, atk: 18, cd: 1.4, range: 10, speed: 38, armor: 0.2, radius: 22, size: 60,
    count: [2, 2, 3], ai: 'magma_cube', immune: ['burn'], defaultRow: 'front',
    skill: { name: '熔岩跳跃', desc: '跳跃砸地，对 40 范围造成伤害并点燃。死亡时分裂（同史莱姆）。高护甲，免疫燃烧。' },
    star3: '每次分裂改为 3 只。',
    flavor: '史莱姆的下界远亲，更硬，更烫。',
  },
  {
    id: 'guardian', name: '守卫者', rarity: 'pink', families: ['aquatic'], role: 'ranged',
    hp: 250, atk: 72, cd: 3.2, range: 260, speed: 30, armor: 0.1, radius: 18, size: 52,
    count: [2, 2, 3], ai: 'guardian', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '激光', desc: '引导 1.6 秒激光后造成必中魔法伤害。尖刺反弹 20% 近战伤害。' },
    star3: '激光命中后弹射至另一名敌人。',
    flavor: '海底神殿的哨兵，盯上你就跑不掉。',
  },

  {
    id: 'camel_husk', name: '骆驼尸壳', rarity: 'pink', families: ['undead'], role: 'tank',
    hp: 560, atk: 28, cd: 1.4, range: 12, speed: 52, armor: 0.1, radius: 22, size: 84, mass: 3,
    count: [1, 1, 2], ai: 'camel_husk', defaultRow: 'front',
    skill: { name: '沙漠骑手', desc: '背上驮着一只焦骸（它会射箭）。每 6 秒向前冲刺，撞开路径上的敌人。骆驼倒下时，焦骸跳下来继续战斗。' },
    star3: '冲刺附带 0.8 秒眩晕，骑手焦骸为 ★3。',
    flavor: '1.21.11 加入：不死的骆驼，驮着一具会射箭的骷髅。',
  },
  {
    id: 'sulfur_cube', name: '硫磺立方', rarity: 'pink', families: ['slime'], role: 'tank',
    hp: 240, atk: 18, cd: 1.3, range: 10, speed: 40, armor: 0.1, radius: 22, size: 60,
    count: [2, 2, 3], ai: 'sulfur_cube', defaultRow: 'front',
    skill: { name: '吞方块', desc: '开战时吞下脚下的方块：岩石→沉重（护甲 +30%，免疫击退）；泥土/草→弹跳（跳砸远处敌人）；沙/雪/冰→滑行（移速 +60%）；下界岩→灼热（攻击点燃，免疫燃烧）；末地石/紫珀→虚空（受击时短距瞬移）。死亡时分裂为 2 只。' },
    star3: '分裂 3 只，小立方也保留形态。',
    flavor: '26.2 加入：唯一会吞方块的生物，吞了什么就变成什么。',
  },
  {
    id: 'tall_sifter', name: '高筛者', rarity: 'pink', families: ['sift'], role: 'caster',
    hp: 210, atk: 20, cd: 3.0, range: 280, speed: 34, armor: 0, radius: 16, size: 88,
    count: [2, 2, 3], ai: 'tall_sifter', projectile: 'goo', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '黄色黏液', desc: '抛出黏液弹，落地 1 秒后爆炸，并留下 4 秒的黏液：敌人在其中每秒损失生命，伤害的一半回复给最近的筛界友军。' },
    star3: '黏液范围 +40%。',
    flavor: '保持距离，往你脚下吐黏液。',
  },
  {
    id: 'sprout', name: '萌芽', rarity: 'pink', families: ['sift'], role: 'support',
    hp: 190, atk: 12, cd: 1.5, range: 200, speed: 44, armor: 0, radius: 16, size: 60, flying: true, alt: 46,
    count: [2, 2, 3], ai: 'sprout', dmgKind: 'magic', defaultRow: 'mid',
    skill: { name: '缠绕触须', desc: '每 6 秒用触须缠住 260 范围内最远的敌人 2 秒（无法行动），并把它往自己这边拖近 2 格。' },
    star3: '同时缠住 2 个敌人。',
    flavor: '会飞的触须植物，最爱把落单的家伙拽过来。',
  },

  // ───────────── 红 · 隐秘级 ─────────────
  {
    id: 'iron_golem', name: '铁傀儡', rarity: 'red', families: ['construct'], role: 'tank',
    hp: 1200, atk: 55, cd: 1.6, range: 14, speed: 40, armor: 0.25, radius: 26, size: 104, mass: 4,
    count: [1, 1, 1], ai: 'iron_golem', immune: ['knockback'], defaultRow: 'front',
    skill: { name: '守护者', desc: '攻击将目标抛向空中（失去行动 1 秒）。身边 130 范围内的友军受到伤害 -15%。' },
    star3: '每 8 秒嘲讽周围敌人 2.5 秒，抛飞改为范围效果。',
    flavor: '村庄的守护者，会给村民送花。',
  },
  {
    id: 'ravager', name: '劫掠兽', rarity: 'red', families: ['illager'], role: 'tank',
    hp: 1050, atk: 44, cd: 1.5, range: 14, speed: 50, armor: 0.2, radius: 28, size: 92, mass: 4,
    count: [1, 1, 1], ai: 'ravager', immune: ['knockback'], defaultRow: 'front',
    skill: { name: '咆哮', desc: '每 8 秒咆哮：对 150 范围敌人造成伤害、击退并眩晕 1 秒。攻击践踏周围敌人。' },
    star3: '咆哮冷却缩短至 5 秒。',
    flavor: '袭击中最可怕的身影，会把庄稼踩个稀烂。',
  },
  {
    id: 'elder_guardian', name: '远古守卫者', rarity: 'red', families: ['aquatic'], role: 'caster',
    hp: 1500, atk: 108, cd: 3.5, range: 280, speed: 22, armor: 0.2, radius: 28, size: 84, mass: 4,
    count: [1, 1, 1], ai: 'elder_guardian', dmgKind: 'magic', immune: ['knockback'], defaultRow: 'back',
    skill: { name: '挖掘疲劳', desc: '存活时所有敌人攻速 -20%。引导激光造成高额魔法伤害，尖刺反弹 25% 近战伤害。' },
    star3: '挖掘疲劳提升至 -30%，激光可弹射。',
    flavor: '海底神殿的主人，它的诅咒让你的镐子变得无比沉重。',
  },
  {
    id: 'breeze', name: '旋风人', rarity: 'red', families: ['construct'], role: 'ranged',
    hp: 750, atk: 42, cd: 2.0, range: 240, speed: 60, armor: 0.1, radius: 18, size: 66, flying: true, alt: 18,
    count: [1, 1, 1], ai: 'breeze', projectile: 'wind_charge', defaultRow: 'mid',
    skill: { name: '风弹', desc: '发射风弹，爆开时对 60 范围造成伤害并强力击退。45% 几率将飞来的投射物反弹回去（0.7 秒冷却）。' },
    star3: '反弹几率 65%，风弹爆炸后分裂为 3 个小风弹。',
    flavor: '试炼密室的守关者，你的箭对它没用。',
  },
  {
    id: 'illusioner', name: '幻术师', rarity: 'red', families: ['illager'], role: 'summoner',
    hp: 640, atk: 34, cd: 1.6, range: 270, speed: 38, armor: 0.05, radius: 15, size: 66,
    count: [1, 1, 1], ai: 'illusioner', projectile: 'arrow', defaultRow: 'back',
    skill: { name: '镜像与失明', desc: '开场及每 12 秒制造 3 个会射箭的镜像（10 秒）。每 10 秒使一张敌方卡牌失明：射程 -40%，攻击 -20%，4 秒。' },
    star3: '每次制造 4 个镜像，失明影响 2 张卡牌。',
    flavor: '从未在生存模式中出现的失落之人。',
  },

  {
    id: 'creaking', name: '嘎枝', rarity: 'red', families: [], role: 'tank',
    hp: 900, atk: 46, cd: 1.4, range: 12, speed: 46, armor: 0.15, radius: 18, size: 96, mass: 3,
    count: [1, 1, 1], ai: 'creaking', immune: ['knockback'], defaultRow: 'front',
    skill: { name: '嘎枝之心', desc: '开战时在我方后方长出一颗「嘎枝之心」。心脏存活时，嘎枝受到的伤害 -90%；心脏被摧毁时嘎枝随之崩塌。被敌人盯上（作为目标）时移动减慢。' },
    star3: '心脏生命 +50%，并且每 6 秒为嘎枝回复 8% 生命。',
    flavor: '苍白之园的守护者：你不看它的时候，它就靠近了。',
  },
  {
    id: 'sculk_slasher', name: '幽匿斩击者', rarity: 'red', families: ['sift'], role: 'assassin',
    hp: 560, atk: 44, cd: 0.9, range: 12, speed: 62, armor: 0.1, radius: 15, size: 80,
    count: [1, 1, 1], ai: 'sculk_slasher', defaultRow: 'mid',
    skill: { name: '残影', desc: '优先追击后排。每 4 次攻击后向后瞬闪，原地留下一道残影：2 秒后残影再挥出一次同样的斩击。' },
    star3: '残影存在期间自身闪避 +30%。',
    flavor: '长爪划过的地方，会留下一个慢半拍的影子。',
  },
  {
    id: 'singer', name: '歌者', rarity: 'red', families: ['sift'], role: 'summoner',
    hp: 520, atk: 18, cd: 2.0, range: 220, speed: 36, armor: 0.05, radius: 16, size: 100,
    count: [1, 1, 1], ai: 'singer', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '共鸣之歌', desc: '每 10 秒唱一次歌：召唤 1 只回响傀儡（存在 20 秒），周围友军攻速 +20%（5 秒）。敌方监守者听到歌声会被安抚 3 秒。' },
    star3: '每次召唤 2 只回响傀儡。',
    flavor: '筛界的长颈歌者，能用歌声让监守者安静下来。',
  },

  // ───────────── 金 · 罕见特殊 ★ ─────────────
  {
    id: 'warden', name: '监守者', rarity: 'gold', families: [], role: 'tank',
    hp: 1500, atk: 62, cd: 1.5, range: 16, speed: 38, armor: 0.3, radius: 30, size: 112, mass: 8,
    count: [1, 1, 1], ai: 'warden', immune: ['knockback', 'slow'], defaultRow: 'front',
    skill: { name: '音波尖啸', desc: '每 6 秒释放直线音波，无视护甲贯穿路径上所有敌人。存在时敌方射程 -25%（黑暗）。每损失 10% 生命攻击 +6%。' },
    star3: '音波冷却缩短至 4.5 秒。',
    flavor: '远古城市的守护者。它看不见你，但它听得见。',
  },
  {
    id: 'wither', name: '凋灵', rarity: 'gold', families: ['undead', 'nether'], role: 'ranged',
    hp: 1400, atk: 30, cd: 1.1, range: 320, speed: 40, armor: 0.15, radius: 30, size: 116, flying: true, alt: 60, mass: 6,
    count: [1, 1, 1], ai: 'wither', projectile: 'wither_skull', immune: ['burn', 'wither', 'knockback'], defaultRow: 'back',
    skill: { name: '凋零之首', desc: '三颗头轮流发射爆炸凋灵头颅并附加凋零，每第 4 发为蓝色头颅（2 倍伤害、更大范围）。生命低于 50% 时受到的投射物伤害减半。' },
    star3: '登场时引发大爆炸，对全场敌人造成伤害。',
    flavor: '用灵魂沙和凋灵骷髅头召唤的毁灭之主。',
  },
  {
    id: 'giant', name: '巨人', rarity: 'gold', families: ['undead'], role: 'tank',
    hp: 2500, atk: 52, cd: 1.8, range: 26, speed: 26, armor: 0.15, radius: 40, size: 170, mass: 10,
    count: [1, 1, 1], ai: 'giant', immune: ['knockback', 'stun'], defaultRow: 'front',
    skill: { name: '泰坦践踏', desc: '每次攻击践踏周围 75 范围的所有敌人并击退。击杀时 40% 几率生成一只友方僵尸。免疫眩晕。' },
    star3: '践踏范围 +30%，生成的僵尸为满属性。',
    flavor: '游戏代码里沉睡多年的传说。',
  },

  {
    id: 'sculk_dancer', name: '幽匿舞者', rarity: 'gold', families: ['sift'], role: 'melee',
    hp: 1600, atk: 46, cd: 1.3, range: 16, speed: 48, armor: 0.2, radius: 24, size: 120, mass: 6,
    count: [1, 1, 1], ai: 'sculk_dancer', immune: ['knockback', 'stun'], defaultRow: 'front',
    skill: { name: '回旋之舞', desc: '每 6 秒原地旋转 2 秒，持续伤害周围 90 范围的敌人，并留下一个残影：3 秒后残影原地再转一次。' },
    star3: '旋转冷却缩短到 4 秒。',
    flavor: '筛界的舞者首领，每一步都踩在你的心跳上。',
  },

  // ───────────── 召唤物 / 首领（不可开出）─────────────
  {
    id: 'vex', name: '恼鬼', rarity: 'blue', families: ['illager'], role: 'melee',
    hp: 40, atk: 9, cd: 0.8, range: 8, speed: 92, armor: 0, radius: 10, size: 32, flying: true, alt: 34,
    count: [1, 1, 1], ai: 'vex', defaultRow: 'mid', hidden: true,
    skill: { name: '穿墙', desc: '无视地形飞行，存在 25 秒后消散。' }, star3: '', flavor: '唤魔者的小帮手。',
  },
  {
    id: 'copper_golem', name: '铜傀儡', rarity: 'purple', families: ['construct'], role: 'support',
    hp: 260, atk: 11, cd: 1.1, range: 10, speed: 42, armor: 0.2, radius: 14, size: 46,
    count: [1, 1, 1], ai: 'copper_golem', defaultRow: 'mid', hidden: true,
    skill: { name: '避雷针', desc: '每 5 秒引一道闪电劈向 260 范围内最近的敌人，造成 4 倍攻击力的魔法伤害。' }, star3: '',
    flavor: '1.21.9 加入的铜傀儡，平时只爱整理箱子。',
  },
  {
    id: 'dispenser', name: '发射器', rarity: 'blue', families: [], role: 'ranged',
    hp: 220, atk: 14, cd: 2.5, range: 256, speed: 0, armor: 0.3, radius: 13, size: 34, flying: true, alt: 64,
    count: [1, 1, 1], ai: 'dispenser', projectile: 'arrow', defaultRow: 'back', hidden: true, structure: true,
    immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'],
    skill: { name: '机关', desc: '架在史蒂夫建造的墙顶上，每 2.5 秒向射程内最近的敌人射出一支箭。只有远程能打到它。' }, star3: '',
    flavor: '红石让墙也学会了还手。',
  },
  {
    id: 'end_crystal', name: '末地水晶', rarity: 'pink', families: ['ender'], role: 'support',
    hp: 500, atk: 0, cd: 1, range: 0, speed: 0, armor: 0, radius: 18, size: 70,
    count: [1, 1, 1], ai: 'end_crystal', defaultRow: 'back', hidden: true, structure: true,
    immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'],
    skill: { name: '治愈光束', desc: '存在时每秒为末影龙回复 0.3% 生命。被摧毁时爆炸。' }, star3: '', flavor: '黑曜石柱顶端的治愈之源。',
  },
  {
    id: 'echo_golem', name: '回响傀儡', rarity: 'purple', families: ['construct', 'sift'], role: 'melee',
    hp: 300, atk: 18, cd: 1.2, range: 10, speed: 44, armor: 0.15, radius: 16, size: 64,
    count: [1, 1, 1], ai: 'default', defaultRow: 'front', hidden: true,
    skill: { name: '灵魂之躯', desc: '歌者用灵魂唤醒的傀儡，存在 20 秒。' }, star3: '', flavor: '由灵魂方块驱动。',
  },
  {
    id: 'sculk_cube', name: '幽匿方块', rarity: 'blue', families: ['sift'], role: 'melee',
    hp: 160, atk: 20, cd: 1.0, range: 8, speed: 74, armor: 0.1, radius: 14, size: 40,
    count: [1, 1, 1], ai: 'sculk_cube', defaultRow: 'front', hidden: true,
    skill: { name: '翻滚', desc: '朝目标一路滚过去，撞上时造成伤害并击退。' }, star3: '', flavor: '巨像召唤的滚动方块。',
  },
  {
    id: 'creaking_heart', name: '嘎枝之心', rarity: 'red', families: [], role: 'support',
    hp: 600, atk: 0, cd: 1, range: 0, speed: 0, armor: 0.2, radius: 14, size: 40,
    count: [1, 1, 1], ai: 'creaking_heart', defaultRow: 'back', hidden: true, structure: true,
    immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'],
    skill: { name: '心脏', desc: '存活时让嘎枝几乎不受伤害。摧毁它，嘎枝就会崩塌。' }, star3: '', flavor: '苍白橡木里跳动的橙色眼睛。',
  },
  {
    id: 'sculk_monstrosity', name: '幽匿巨像', rarity: 'gold', families: ['sift'], role: 'boss',
    hp: 9000, atk: 70, cd: 1.6, range: 22, speed: 50, armor: 0.25, radius: 40, size: 170, mass: 12,
    count: [1, 1, 1], ai: 'sculk_monstrosity', immune: ['knockback', 'stun', 'slow'], defaultRow: 'front', hidden: true, boss: true,
    skill: { name: '筛界之主', desc: '肩撞冲锋撞飞一切；周期性释放灵魂爆发；召唤滚动的幽匿方块。生命低于一半时进入狂怒：更快、爆发更大。' },
    star3: '', flavor: '筛界深处的巨像，筛子里漏下来的一切都归它。',
  },
  {
    id: 'ravager_boss', name: '袭击首领 · 劫掠兽', rarity: 'red', families: ['illager'], role: 'boss', sprite: 'ravager',
    hp: 2300, atk: 40, cd: 1.5, range: 16, speed: 46, armor: 0.25, radius: 36, size: 128, mass: 10,
    count: [1, 1, 1], ai: 'ravager_boss', immune: ['knockback', 'stun'], defaultRow: 'front', hidden: true, boss: true,
    skill: { name: '袭击号角', desc: '每 7 秒咆哮眩晕周围敌人；每 16 秒吹响号角召唤掠夺者援军；生命低于 40% 时狂暴冲锋。' }, star3: '', flavor: '村庄袭击的终极威胁。',
  },
  {
    id: 'elder_guardian_boss', name: '远古守卫者 · 神殿之主', rarity: 'red', families: ['aquatic'], role: 'boss', sprite: 'elder_guardian',
    hp: 1700, atk: 46, cd: 3.0, range: 300, speed: 18, armor: 0.25, radius: 36, size: 120, mass: 10,
    count: [1, 1, 1], ai: 'elder_guardian_boss', dmgKind: 'magic', immune: ['knockback', 'stun', 'slow'], defaultRow: 'back', hidden: true, boss: true,
    skill: { name: '神殿诅咒', desc: '挖掘疲劳：敌方攻速 -20%。激光弹射 1 次。每 18 秒召唤 1 只守卫者（最多 2 只）。' }, star3: '', flavor: '海底神殿深处的古老存在。',
  },
  {
    id: 'wither_boss', name: '凋灵 · 毁灭之主', rarity: 'gold', families: ['undead', 'nether'], role: 'boss', sprite: 'wither',
    hp: 5200, atk: 39, cd: 0.85, range: 340, speed: 44, armor: 0.15, radius: 36, size: 150, flying: true, alt: 70, mass: 10,
    count: [1, 1, 1], ai: 'wither_boss', projectile: 'wither_skull', immune: ['knockback', 'stun', 'burn', 'wither', 'slow'], defaultRow: 'back', hidden: true, boss: true,
    skill: { name: '凋零风暴', desc: '登场爆炸；三头连射凋灵头颅。生命低于 50% 时进入凋灵护甲阶段：投射物伤害减半、召唤凋灵骷髅并发动冲撞。' }, star3: '', flavor: '下界之星在它的胸腔里跳动。',
  },
  {
    id: 'ender_dragon_boss', name: '末影龙', rarity: 'gold', families: ['ender'], role: 'boss', sprite: 'ender_dragon',
    hp: 14000, atk: 90, cd: 2.2, range: 380, speed: 70, armor: 0.2, radius: 44, size: 170, flying: true, alt: 110, mass: 12,
    count: [1, 1, 1], ai: 'ender_dragon_boss', projectile: 'dragon_fireball', immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'], defaultRow: 'back', hidden: true, boss: true,
    skill: { name: '末地主宰', desc: '末地水晶存在时持续回血。发射龙息火球留下腐蚀云；周期性俯冲扫过战场，撞飞一切。' }, star3: '', flavor: '一切的终点。去吧，屠龙者。',
  },

  // ───────────── V3.3 遗迹远征 · 可收集单位 ─────────────
  {
    id: 'skeleton_vanguard', name: '骷髅先锋', rarity: 'purple', families: ['undead'], role: 'tank',
    hp: 240, atk: 18, cd: 1.4, range: 14, speed: 32, armor: 0.18, radius: 16, size: 66,
    count: [3, 4, 5], ai: 'skeleton_vanguard', defaultRow: 'front',
    skill: { name: '皇家骨盾', desc: '正面 100° 范围内的投射物伤害降低 25%；每 6 秒由一名先锋向当前目标发动突刺，造成 80% 攻击力的物理伤害并击退。' },
    star3: '正面减伤提升至 30%；突刺后为该单位提供 8% 最大生命护盾，持续 3 秒。',
    flavor: '身披残破锁甲与铁盾的古代骷髅卫士。',
  },
  {
    id: 'redstone_golem', name: '红石守卫', rarity: 'red', families: ['construct'], role: 'tank',
    hp: 1050, atk: 58, cd: 2.0, range: 18, speed: 26, armor: 0.22, radius: 28, size: 90, mass: 6,
    count: [1, 1, 1], ai: 'redstone_golem', defaultRow: 'front',
    skill: { name: '红石震击', desc: '每 7 秒蓄力 1 秒砸地，对周围 65 范围至多 4 名敌人造成 140% 攻击力的物理伤害，并降低目标 5% 护甲，持续 4 秒。' },
    star3: '砸地目标上限提升至 5 名敌人；削减护甲提升至 8%。',
    flavor: '由炽热红石符文驱动的重装傀儡。',
  },
  {
    id: 'soul_wisp', name: '灵魂侍从', rarity: 'purple', families: ['undead'], role: 'ranged',
    hp: 85, atk: 13, cd: 1.25, range: 220, speed: 42, armor: 0, radius: 11, size: 40, flying: true, alt: 20,
    count: [3, 4, 5], ai: 'soul_wisp', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '魂火箭', desc: '发射魔法弹；攻击命中时额外收集 1 点灵魂（冷却 4 秒）。' },
    star3: '额外灵魂积累冷却缩短至 3 秒；普攻对带护盾目标伤害提升 10%。',
    flavor: '飘浮在幽冥深处的微弱魂光，指引着亡灵的归宿。',
  },
  {
    id: 'enchanter', name: '附魔师', rarity: 'pink', families: ['illager'], role: 'support',
    hp: 180, atk: 8, cd: 1.8, range: 190, speed: 34, armor: 0.04, radius: 14, size: 64,
    count: [2, 2, 3], ai: 'enchanter', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '附魔律令', desc: '发射魔法弹；每 7 秒对另一支友军施加附魔律令（优先近战且生命比例最低），提升其 15% 攻击力，持续 4 秒。' },
    star3: '受到附魔律令的友军同时获得 6% 最大生命护盾，持续 4 秒。',
    flavor: '手持魔导书的灾厄法师，能用邪术强化他的同僚。',
  },
  {
    id: 'geomancer', name: '地卜师', rarity: 'purple', families: ['illager'], role: 'caster',
    hp: 145, atk: 14, cd: 1.8, range: 210, speed: 32, armor: 0.05, radius: 15, size: 64,
    count: [2, 3, 4], ai: 'geomancer', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '大地岩柱', desc: '发射魔法弹；每 8 秒在敌人身边升起大地岩柱：预警 1 秒后造成 90% 攻击力的魔法伤害并击退，随后留下掩体阻挡路径 4 秒。' },
    star3: '岩柱命中后使目标移速降低 20%，持续 2 秒。',
    flavor: '能召唤大地意志与岩石路障的怪异术士。',
  },
  {
    id: 'royal_guard', name: '皇家卫兵', rarity: 'pink', families: ['illager'], role: 'tank',
    hp: 325, atk: 24, cd: 1.5, range: 12, speed: 30, armor: 0.18, radius: 17, size: 68,
    count: [2, 3, 4], ai: 'royal_guard', defaultRow: 'front',
    skill: { name: '誓死守卫', desc: '正面受到的投射物伤害降低 20%；生命低于 50% 时放弃盾姿转入狂怒，攻速提升 25%（每名卫兵一次）。' },
    star3: '转入狂怒时获得 8% 最大生命护盾，持续 3 秒。',
    flavor: '灾厄高厅的精锐禁卫，手持厚实重盾。',
  },
  {
    id: 'wraith', name: '幽魂', rarity: 'pink', families: ['undead'], role: 'caster',
    hp: 170, atk: 22, cd: 1.8, range: 220, speed: 40, armor: 0, radius: 14, size: 62, flying: true, alt: 16,
    count: [2, 3, 4], ai: 'wraith', dmgKind: 'magic', defaultRow: 'mid',
    skill: { name: '幽冥冷火', desc: '发射魔法弹；每 7 秒在敌人位置引燃 3 秒幽冥冷火，每秒对区域内至多 3 名敌人造成 25% 攻击力的魔法伤害。' },
    star3: '冷火持续时间延长至 4 秒。',
    flavor: '飘荡在废墟之中的怨灵，所到之处燃起蓝色冷火。',
  },
  {
    id: 'necromancer', name: '亡灵巫师', rarity: 'red', families: ['undead'], role: 'summoner',
    hp: 420, atk: 35, cd: 1.7, range: 240, speed: 30, armor: 0.08, radius: 17, size: 70,
    count: [1, 1, 1], ai: 'necromancer', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '亡骸复苏', desc: '发射魔法弹；每 8 秒召唤 1 只骷髅（50% 基础属性，存在 10 秒；同时最多 2 只，全场最多 3 只）。' },
    star3: '首次召唤提前至开战后 4 秒。',
    flavor: '高举法杖的亡者主宰，在墓地中唤醒沉睡的骨骸。',
  },
  {
    id: 'iceologer', name: '冰术师', rarity: 'pink', families: ['illager'], role: 'caster',
    hp: 175, atk: 21, cd: 1.9, range: 230, speed: 34, armor: 0.02, radius: 14, size: 64,
    count: [2, 3, 4], ai: 'iceologer', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '冰霜重压', desc: '发射魔法弹；每 7 秒召唤冰霜重压：预警 1 秒后降下玄冰，造成 90% 攻击力的魔法伤害并降低目标 20% 移速，持续 2 秒。' },
    star3: '额外降低目标 10% 攻击速度，持续 2 秒。',
    flavor: '来自极寒冻原的灾厄施法者，操控着刺骨的玄冰。',
  },
  {
    id: 'whisperer', name: '丛林低语者', rarity: 'purple', families: ['beast'], role: 'support',
    hp: 210, atk: 12, cd: 1.6, range: 170, speed: 28, armor: 0.06, radius: 18, size: 60,
    count: [2, 3, 4], ai: 'whisperer', dmgKind: 'magic', defaultRow: 'mid',
    skill: { name: '藤木护佑', desc: '发射魔法弹；每 8 秒施展藤木护佑，为生命比例最低的 2 名野兽友军提供 8% 最大生命护盾，持续 4 秒。' },
    star3: '护佑保护目标增加至 3 名友军。',
    flavor: '丛林深处的古老植物人，用蔓藤守护它的野兽同伴。',
  },
  {
    id: 'windcaller', name: '唤风者', rarity: 'red', families: ['illager'], role: 'caster',
    hp: 360, atk: 38, cd: 1.8, range: 250, speed: 38, armor: 0.04, radius: 16, size: 68,
    count: [1, 1, 1], ai: 'windcaller', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '狂风激流', desc: '发射魔法弹；每 8 秒预警 1 秒后释放狂风激流，对至多 4 名敌人造成 120% 攻击力的魔法伤害并强力击退。' },
    star3: '激流影响目标上限增加至 5 名。',
    flavor: '嚎风山巅的狂风祭司，法杖轻扬便能掀起狂岚。',
  },
  {
    id: 'key_golem', name: '钥匙傀儡', rarity: 'blue', families: ['construct'], role: 'support',
    hp: 120, atk: 7, cd: 1.2, range: 10, speed: 50, armor: 0.08, radius: 12, size: 42,
    count: [3, 4, 5], ai: 'key_golem', defaultRow: 'mid',
    skill: { name: '机巧奔行', desc: '队伍首次受到伤害后全体钥匙傀儡移速提升 25%，持续 4 秒；每 8 秒为生命最低的友军提供 6% 最大生命护盾，持续 3 秒。' },
    star3: '护盾值提升至 9% 最大生命。',
    flavor: '奔跑飞快的灵巧小傀儡，背上的金钥匙能开启密室之门。',
  },
  {
    id: 'mountaineer', name: '登山斧兵', rarity: 'purple', families: ['illager'], role: 'melee',
    hp: 235, atk: 25, cd: 1.5, range: 14, speed: 36, armor: 0.10, radius: 16, size: 66,
    count: [2, 3, 4], ai: 'mountaineer', defaultRow: 'front',
    skill: { name: '破防重斩', desc: '每 7 秒由一名斧兵蓄力 0.8 秒发动重斩：造成 130% 攻击力的物理伤害，若目标带护盾额外破除至多 30% 攻击力的护盾值。' },
    star3: '蓄力期间该斧兵获得 8% 最大生命护盾，持续 2 秒。',
    flavor: '适应崎岖地形的强壮战士，手持厚重双刃战斧。',
  },
  {
    id: 'leaper', name: '丛林跃袭者', rarity: 'pink', families: ['beast'], role: 'assassin',
    hp: 190, atk: 28, cd: 1.5, range: 12, speed: 44, armor: 0.03, radius: 16, size: 64,
    count: [2, 3, 4], ai: 'leaper', defaultRow: 'mid',
    skill: { name: '奇袭飞跃', desc: '每 8 秒由一名跃袭者飞扑敌方后排最远敌人：落地预警后造成 120% 攻击力的物理伤害。' },
    star3: '落地后自身获得 15% 移速加成，持续 2 秒。',
    flavor: '隐藏在树冠中的敏捷掠食者，擅长飞扑敌方后排。',
  },
  {
    id: 'poison_quill_vine', name: '毒刺藤', rarity: 'purple', families: ['beast'], role: 'ranged',
    hp: 160, atk: 18, cd: 1.6, range: 260, speed: 0, armor: 0.04, radius: 16, size: 62,
    count: [2, 3, 4], ai: 'poison_quill_vine', projectile: 'quill', defaultRow: 'back',
    skill: { name: '剧毒喷吐', desc: '固定炮台不可移动；毒刺命中时附加剧毒喷吐，每秒造成 12% 攻击力的魔法毒伤，持续 3 秒（冷却 5 秒）。' },
    star3: '剧毒喷吐持续时间延长至 4 秒。',
    flavor: '扎根地下的带刺植物炮台，不断向敌人喷射致命毒刺。',
  },
  {
    id: 'squall_golem', name: '疾风傀儡', rarity: 'pink', families: ['construct'], role: 'melee',
    hp: 360, atk: 33, cd: 1.8, range: 16, speed: 34, armor: 0.12, radius: 23, size: 78, mass: 5,
    count: [2, 2, 3], ai: 'squall_golem', defaultRow: 'front',
    skill: { name: '风暴冲撞', desc: '每 8 秒蓄力 1 秒后冲撞当前近战目标，造成 120% 攻击力的物理伤害并击退目标。' },
    star3: '冲撞后为自身提供 8% 最大生命护盾，持续 3 秒。',
    flavor: '体内封存着气旋核心的重甲傀儡，冲锋势不可挡。',
  },
  {
    id: 'drowned_necromancer', name: '溺水巫师', rarity: 'red', families: ['undead', 'aquatic'], role: 'summoner',
    hp: 390, atk: 31, cd: 1.9, range: 240, speed: 30, armor: 0.06, radius: 18, size: 72,
    count: [1, 1, 1], ai: 'drowned_necromancer', dmgKind: 'magic', defaultRow: 'back',
    skill: { name: '深渊沉溺', desc: '发射魔法弹；每 9 秒召唤 1 只溺尸（45% 基础属性，存在 9 秒；同时最多 1 只，全场最多 2 只）。' },
    star3: '首次召唤提前至开战后 5 秒。',
    flavor: '在深海沉船中诞生的溺亡巫师，能呼唤冰冷水流中的死者。',
  },
  {
    id: 'redstone_cube', name: '红石方块', rarity: 'blue', families: ['construct'], role: 'melee',
    hp: 105, atk: 12, cd: 1.3, range: 10, speed: 40, armor: 0.06, radius: 12, size: 44,
    count: [3, 4, 5], ai: 'redstone_cube', defaultRow: 'front',
    skill: { name: '滚石撞击', desc: '每 6 秒由一名方块向前翻滚撞击目标，造成 80% 攻击力的物理伤害并击退。' },
    star3: '滚撞后自身受到的击退距离降低 30%，持续 2 秒。',
    flavor: '活化的红石能量块，不断翻滚撞击敌人。',
  },

  // ───────────── V3.3 遗迹远征 · 专属首领与敌人 ─────────────
  {
    id: 'nameless_one', name: '无名者 · 墓穴之主', rarity: 'red', families: ['undead'], role: 'boss',
    hp: 2100, atk: 38, cd: 1.8, range: 250, speed: 24, armor: 0.08, radius: 24, size: 86, mass: 8,
    count: [1, 1, 1], ai: 'nameless_one', dmgKind: 'magic', immune: ['knockback', 'stun'], defaultRow: 'back', hidden: true, boss: true,
    skill: { name: '死者之王', desc: '每 9 秒召唤 2 只骷髅；生命低于 50% 后发射 3 路魂弹。' }, star3: '',
    flavor: '沙漠地下古老王墓的真正主人。',
  },
  {
    id: 'redstone_monstrosity', name: '红石巨兽 · 熔炉天灾', rarity: 'gold', families: ['construct'], role: 'boss',
    hp: 4200, atk: 80, cd: 2.5, range: 22, speed: 20, armor: 0.20, radius: 42, size: 120, mass: 12,
    count: [1, 1, 1], ai: 'redstone_monstrosity', immune: ['knockback', 'stun', 'slow'], defaultRow: 'front', hidden: true, boss: true,
    skill: { name: '熔炉灾厄', desc: '每 8 秒蓄力砸地造成 90 范围巨额物伤；生命降至 60%/30% 时生成熔岩喷口。' }, star3: '',
    flavor: '余烬锻造厂深处熔铸出的终极破坏兵器。',
  },
  {
    id: 'corrupted_cauldron', name: '腐化坩埚', rarity: 'red', families: ['slime'], role: 'boss', sprite: 'slime',
    hp: 2300, atk: 28, cd: 2.0, range: 230, speed: 0, armor: 0.12, radius: 35, size: 90, mass: 10,
    count: [1, 1, 1], ai: 'corrupted_cauldron', dmgKind: 'magic', immune: ['knockback', 'stun', 'slow'], defaultRow: 'mid', hidden: true, boss: true,
    skill: { name: '泥泞酸蚀', desc: '喷吐酸液腐蚀地面；周期性溢出小型史莱姆。' }, star3: '',
    flavor: '被黑暗魔法浸染的巨型生化坩埚。',
  },
  {
    id: 'tempest_golem', name: '风暴傀儡', rarity: 'gold', families: ['construct'], role: 'boss', sprite: 'squall_golem',
    hp: 4000, atk: 72, cd: 2.1, range: 220, speed: 24, armor: 0.16, radius: 34, size: 108, mass: 10,
    count: [1, 1, 1], ai: 'tempest_golem', dmgKind: 'magic', immune: ['knockback', 'stun', 'slow'], defaultRow: 'mid', hidden: true, boss: true,
    skill: { name: '风暴壁垒', desc: '风柱提供庇护；周期性召唤落雷轰击敌人。' }, star3: '',
    flavor: '耸立在疾风峡谷之巅的风暴守卫。',
  },
  {
    id: 'vengeful_heart', name: '复仇之心', rarity: 'gold', families: ['ender'], role: 'boss', sprite: 'enderman',
    hp: 5900, atk: 88, cd: 2.0, range: 270, speed: 26, armor: 0.12, radius: 34, size: 110, mass: 10,
    count: [1, 1, 1], ai: 'vengeful_heart', dmgKind: 'magic', immune: ['knockback', 'stun', 'burn', 'wither', 'slow'], defaultRow: 'back', hidden: true, boss: true,
    skill: { name: '虚空泯灭', desc: '标记目标并在其头顶降下毁灭虚空光束。' }, star3: '',
    flavor: '支配虚空废墟的终焉意志。',
  },
  {
    id: 'ancient_warden', name: '远古石卫', rarity: 'red', families: ['construct'], role: 'boss', sprite: 'iron_golem',
    hp: 3400, atk: 64, cd: 2.0, range: 20, speed: 26, armor: 0.18, radius: 30, size: 96, mass: 10,
    count: [1, 1, 1], ai: 'ancient_warden', immune: ['knockback', 'stun'], defaultRow: 'front', hidden: true, boss: true,
    skill: { name: '远古坚甲', desc: '每 9 秒为自身提供 12% 最大生命护盾；周期性重击敌人。' }, star3: '',
    flavor: '守卫古老门扉的坚固石偶。',
  },
  {
    id: 'healing_totem_unit', name: '治疗图腾', rarity: 'blue', families: [], role: 'support', sprite: 'totem',
    hp: 400, atk: 0, cd: 1, range: 0, speed: 0, armor: 0.1, radius: 14, size: 40,
    count: [1, 1, 1], ai: 'healing_totem_unit', defaultRow: 'back', hidden: true, structure: true,
    immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'],
    skill: { name: '生命潮涌', desc: '治疗周围友军。' }, star3: '', flavor: '雕刻着图腾纹理的再生之木。',
  },
  {
    id: 'buzzy_nest_unit', name: '便携蜂巢', rarity: 'blue', families: [], role: 'support', sprite: 'bee',
    hp: 350, atk: 0, cd: 1, range: 0, speed: 0, armor: 0.1, radius: 14, size: 40,
    count: [1, 1, 1], ai: 'buzzy_nest_unit', defaultRow: 'back', hidden: true, structure: true,
    immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'],
    skill: { name: '蜂群出击', desc: '周期性唤出蜜蜂。' }, star3: '', flavor: '装满蜜蜂的便携巢箱。',
  },
  {
    id: 'geomancer_pillar', name: '大地岩柱', rarity: 'blue', families: [], role: 'support',
    hp: 500, atk: 0, cd: 1, range: 0, speed: 0, armor: 0.2, radius: 15, size: 60,
    count: [1, 1, 1], ai: 'geomancer_pillar', defaultRow: 'front', hidden: true, structure: true,
    immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'],
    skill: { name: '坚实岩块', desc: '阻挡路径与投射物。' }, star3: '', flavor: '地卜师召唤的坚硬岩柱。',
  },
  {
    id: 'tempest_pillar', name: '风暴之柱', rarity: 'blue', families: [], role: 'support',
    hp: 600, atk: 0, cd: 1, range: 0, speed: 0, armor: 0.2, radius: 16, size: 70,
    count: [1, 1, 1], ai: 'geomancer_pillar', defaultRow: 'front', hidden: true, structure: true,
    immune: ['knockback', 'stun', 'burn', 'poison', 'wither', 'slow'],
    skill: { name: '旋风庇护', desc: '存活时为风暴傀儡提供减伤。' }, star3: '', flavor: '旋转的气旋石柱。',
  },
];

export const MOB_MAP: Record<string, MobDef> = Object.fromEntries(MOBS.map((m) => [m.id, m]));
export const PLAYABLE_MOBS = MOBS.filter((m) => !m.hidden);

export function mobDef(id: string): MobDef {
  const m = MOB_MAP[id];
  if (!m) throw new Error(`Unknown mob ${id}`);
  return m;
}

export function spriteOf(m: MobDef): string {
  return m.sprite ?? m.id;
}

/**
 * Power growth per star (√(HP·DPS) measure). Common mobs gain more from stars than rare ones:
 * a ★3 军规 card is a real alternative to a lucky 隐秘 pull, instead of rarity × stars
 * multiplying into a runaway.
 */
const STAR_POWER: Record<Rarity, number[]> = {
  blue: [1, 1.7, 2.8],
  purple: [1, 1.65, 2.65],
  pink: [1, 1.6, 2.5],
  red: [1, 1.5, 2.15],
  gold: [1, 1.45, 2.0],
};
export function starPower(m: MobDef, star: number): number {
  return STAR_POWER[m.rarity][star - 1];
}
export function starStatMul(m: MobDef, star: number): number {
  const n1 = m.count[0];
  const nk = m.count[star - 1];
  return (starPower(m, star) * n1) / nk;
}

export function unitCount(m: MobDef, star: number): number {
  return m.count[star - 1];
}

export const RARITY_INFO: Record<Rarity, { name: string; short: string; color: string; glow: string; dust: number; tier: number }> = {
  blue: { name: '军规级', short: '军规', color: '#4b69ff', glow: 'rgba(75,105,255,.55)', dust: 6, tier: 0 },
  purple: { name: '受限级', short: '受限', color: '#8847ff', glow: 'rgba(136,71,255,.55)', dust: 12, tier: 1 },
  pink: { name: '保密级', short: '保密', color: '#d32ce6', glow: 'rgba(211,44,230,.55)', dust: 24, tier: 2 },
  red: { name: '隐秘级', short: '隐秘', color: '#eb4b4b', glow: 'rgba(235,75,75,.6)', dust: 45, tier: 3 },
  gold: { name: '罕见特殊', short: '★ 特殊', color: '#ffc93c', glow: 'rgba(255,201,60,.7)', dust: 90, tier: 4 },
};

export const ROLE_INFO: Record<string, { name: string; icon: string }> = {
  tank: { name: '坦克', icon: '🛡' },
  melee: { name: '近战', icon: '⚔' },
  ranged: { name: '远程', icon: '🏹' },
  caster: { name: '法师', icon: '✦' },
  summoner: { name: '召唤', icon: '☄' },
  bomber: { name: '爆破', icon: '✹' },
  assassin: { name: '刺客', icon: '➶' },
  support: { name: '辅助', icon: '✚' },
  boss: { name: '首领', icon: '♛' },
};

/** How each role behaves in battle (shown in tooltips so players can plan deployment). */
export const ROLE_TACTIC: Record<string, string> = {
  tank: '就近交战，优先拦截正在攻击我方远程/辅助的敌人（掩护）。',
  melee: '就近交战，不惧爬坡但绕开岩浆，会尝试闪避预警范围的技能。',
  ranged: '抢占射程内的高地，绕开遮挡寻找射击角度，近战逼近时后撤。',
  support: '像远程一样走位，并优先阻截冲向我方后排的敌人。',
  assassin: '机动灵活，最擅长闪避范围技能。',
  bomber: '冲向敌人最密集的地方点火。',
  summoner: '像远程一样走位，技能瞄准敌人密集处。',
  caster: '像远程一样走位，技能瞄准敌人密集处。',
  boss: '首领不会闪避，按自身技能节奏行动。',
};

/** Mob-specific tactical habits that go beyond their role. */
export const MOB_TACTIC: Record<string, string> = {
  goat: '冲撞时优先把敌人撞进岩浆、水里或撞下高台，其次是后排。',
  spider: '飞扑会越过前排，优先扑向后排或残血敌人。',
  evoker: '尖牙沿着敌人最多的直线释放。',
  warden: '音波沿着敌人最多的直线释放。',
  witch: '优先治疗正被集火的队友，不把药水浪费在凋零中的队友身上；伤害药水砸向敌人密集处。',
  ravager: '咆哮会等到身边聚集多名敌人再放。',
  polar_bear: '★3 嘲讽会等敌人聚拢后再放。',
  sniffer: '火把花种在附近受伤队友最多的地方；挖掘时会停下脚步。',
  iron_golem: '★3 嘲讽会等敌人聚拢后再放。',
  enderman: '传送时避开水边。',
  breeze: '被近战贴身时跳开，并避免跳进墙角。',
  ghast: '火球砸向敌人密集处。',
  shulker: '射程内没有敌人时传送到敌人射程边缘的高处；生命低于一半时传送撤离一次。',
};
