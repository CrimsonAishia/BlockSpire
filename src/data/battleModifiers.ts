export interface BattleModifierDef {
  id: string;
  name: string;
  desc: string;
  color: string;
  /** Extra base emeralds on victory. */
  rewardMul: number;
  /** Symmetric SideContext flags applied to both armies. */
  flags: string[];
}

export const BATTLE_MODIFIERS: BattleModifierDef[] = [
  {
    id: 'frenzy',
    name: '躁动战场',
    desc: '双方非建筑单位攻击速度 +18%、移动速度 +10%。',
    color: '#ff9f43',
    rewardMul: 1.08,
    flags: ['battle_frenzy'],
  },
  {
    id: 'fog',
    name: '浓雾',
    desc: '双方远程单位射程 -25%，必须更靠近敌人才会开火。',
    color: '#b8c4d6',
    rewardMul: 1.1,
    flags: ['battle_fog'],
  },
  {
    id: 'fragile',
    name: '脆弱世界',
    desc: '双方非建筑单位生命 -12%、攻击力 +10%，战斗更加短促。',
    color: '#ff6b81',
    rewardMul: 1.08,
    flags: ['battle_fragile'],
  },
  {
    id: 'gale',
    name: '呼啸狂风',
    desc: '双方非建筑单位移动速度 +10%，所有攻击附带额外击退。',
    color: '#74d7ff',
    rewardMul: 1.12,
    flags: ['battle_gale'],
  },
];

export const BATTLE_MODIFIER_MAP: Record<string, BattleModifierDef> = Object.fromEntries(BATTLE_MODIFIERS.map((m) => [m.id, m]));
