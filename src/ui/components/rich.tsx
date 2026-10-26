// Keyword-aware text: highlights game terms and explains them on hover (Slay the Spire style).
import { Tip } from './common.tsx';

export const KEYWORDS: Record<string, { color: string; desc: string }> = {
  中毒: { color: '#7bd36b', desc: '每秒造成伤害，无视护甲，但不会致死（至少保留 1 点生命）。' },
  燃烧: { color: '#ff9a3c', desc: '每秒造成伤害，无视护甲。免疫燃烧的生物（如下界生物）不受影响。' },
  点燃: { color: '#ff9a3c', desc: '使目标燃烧：每秒造成伤害，无视护甲。' },
  凋零: { color: '#b0a0c8', desc: '每秒造成伤害，且期间无法被任何方式治疗。' },
  眩晕: { color: '#ffe14a', desc: '无法移动和攻击。首领只受到 20% 的眩晕时间。' },
  漂浮: { color: '#f5f0c8', desc: '被抬到空中无法行动，落地时受到伤害。' },
  挑飞: { color: '#ffe14a', desc: '把目标抛向空中，期间无法行动。' },
  抛飞: { color: '#ffe14a', desc: '把目标抛向空中，期间无法行动。' },
  击退: { color: '#dfe6e9', desc: '把目标推开，打乱阵型。可以把敌人推进岩浆！' },
  嘲讽: { color: '#ffd28a', desc: '迫使附近的敌人转而攻击自己。首领不受影响。' },
  吸血: { color: '#ff7e7e', desc: '回复造成伤害一定比例的生命。' },
  护盾: { color: '#ffe680', desc: '优先抵挡伤害，被打破前本体不掉血。单位描边会变成金色。' },
  暴击: { color: '#ffd23f', desc: '造成 175% 伤害。' },
  闪避: { color: '#d0d0d0', desc: '完全躲开这次伤害。' },
  护甲: { color: '#b2bec3', desc: '按比例减少物理伤害；魔法伤害只受一半护甲影响；真实伤害无视护甲。' },
  魔法伤害: { color: '#e29bff', desc: '只受目标一半护甲的减免。' },
  真实伤害: { color: '#8ff6ff', desc: '无视护甲。' },
  召唤: { color: '#b9a6ff', desc: '召唤物属于召唤者所在的卡牌，它们造成的伤害计入该卡牌。' },
  分裂: { color: '#7ed957', desc: '死亡时分裂成更小的个体继续战斗。' },
  迟缓: { color: '#8fd9ff', desc: '移动速度与攻击速度降低。' },
  寒意: { color: '#8fd9ff', desc: '每层降低 12% 移速与攻速，最多 3 层。' },
  冰冻: { color: '#9fd8ff', desc: '每秒受到伤害，移速 -30%、攻速 -15%，还会扑灭燃烧。寒地生物免疫；烈焰人、岩浆怪、硫磺立方受到 3 倍伤害。' },
  虚弱: { color: '#a0a0b0', desc: '攻击力降低。' },
  破势: { color: '#ffc93c', desc: '首领蓄势读条期间，受到控制反制技能或累计生命损失时累积破势，达到 100 即可强制打断首领技能并使其陷入 2.5 秒瘫痪大硬直。' },
  蓄势: { color: '#ff6b6b', desc: '首领释放毁灭级大招前展开的公开读条准备（通常为 2.4 秒），头顶展示金色蓄势条，可被破势打断。' },
  灵魂: { color: '#00d2d3', desc: '通过击杀亡灵或特定宝物收集的战略资源，达到阈值可自动施放强力遗迹武器（如腐化信标核心）或为特定遗物充能。' },
  虚空标记: { color: '#c06bff', desc: '使目标受到的下一次直接伤害提升 25%。' },
  回响: { color: '#7ff5de', desc: '筛界生物的攻击会在目标身上留下回响：它受到的下一次伤害提高。' },
  残影: { color: '#7ff5de', desc: '原地留下一个无法被攻击的影子，稍后它会把刚才的动作再做一次。' },
  灵魂潮汐: { color: '#7ff5de', desc: '筛界的维度规则：每 15 秒涨潮 4 秒，非筛界生物攻速 -25%、每秒损失 2% 生命。筛界生物和带着 2 种以上筛界生物的队伍免疫。' },
  'Ouch 水': { color: '#3fe0c0', desc: '筛界的青色泉水：非筛界生物站在里面每秒损失 4% 生命，筛界生物反而回血。' },
  脆冰: { color: '#bfe8ff', desc: '冰洞里的薄冰：有人站上去约 3 秒就会碎成水洼。' },
  饥饿: { color: '#c9a36b', desc: '攻击速度降低 30%。' },
  失明: { color: '#8e9eff', desc: '射程 -40%，攻击力 -20%。' },
  居高临下: { color: '#9fe870', desc: '站得比目标高时：远程伤害每格 +12%（最多 +24%），近战每格 +8%；远程射程也随所处高度提升。' },
  高地: { color: '#9fe870', desc: '站在高处的远程单位射程更远、伤害更高（居高临下）。攀爬高地很慢，蜘蛛除外。' },
  掩体: { color: '#c8b48a', desc: '树木、岩石、柱子和山坡会挡住箭矢、火球等投射物。远程单位会绕开遮挡寻找射击角度，久攻不下就会逼近，所以掩体只能拖延，不能让人刀枪不入。' },
  摔落: { color: '#e8e8e8', desc: '被击退摔下 2 格以上的高台时，落地损失最大生命的 5%（每多 1 格再 +5%，最多 15%）并短暂眩晕。' },
  地形破坏: { color: '#ff9a3c', desc: '所有爆炸都会在地上留下焦痕、炸飞花草；凋灵头颅偶尔能炸掉落点的 1 格方块。恶魂火球、末地水晶等较大的爆炸会炸掉树木岩石、削低 2 格高地，苦力怕和 TNT 最多 3 格。每场最多 36 个弹坑；最外圈、黑曜石和液体不会被破坏。' },
  羁绊: { color: '#ffd76a', desc: '出战队伍中同一羁绊的「不同生物」数量达到要求即激活，效果作用于该羁绊的生物。' },
  飞行: { color: '#cfe8ff', desc: '无视地形与障碍；在高空时近战无法攻击到它，只能靠远程。' },
  投射物: { color: '#e8dcc0', desc: '箭矢、火球等远程攻击。末影人会瞬移闪避，旋风人可能将其反弹。' },
  感染: { color: '#7bd36b', desc: '被击杀的敌人有几率变成友方僵尸。' },
  隐身: { color: '#c9ced6', desc: '无法被敌人选为目标。' },
  末影风暴: { color: '#ff9cf0', desc: '战斗超过 60 秒（首领战 80 秒）后，所有单位持续流失生命，防止僵持。' },
  联动: { color: '#ffd76a', desc: '特定的生物组合同时出战时触发的额外效果（例如劫掠兽 + 灾厄村民 = 袭击队伍）。卡牌说明里列出了它参与的联动。' },
  升星: { color: '#ffd76a', desc: '重复开出已拥有的生物会自动合成：★1→★2 需 1 张，★2→★3 需 2 张。升星提升生命、攻击与数量，★3 解锁强化能力。' },
};

const KW_RE = new RegExp(`(${Object.keys(KEYWORDS).sort((a, b) => b.length - a.length).join('|')})`, 'g');

export function keywordsIn(...texts: (string | undefined)[]): string[] {
  const found = new Set<string>();
  for (const t of texts) if (t) for (const m of t.matchAll(KW_RE)) found.add(m[1]);
  return [...found];
}

/** Text with highlighted keywords; `tips` adds hover definitions (off inside tooltips). */
export function RichText({ text, tips = true }: { text: string; tips?: boolean }) {
  const parts = text.split(KW_RE);
  return (
    <>
      {parts.map((p, i) => {
        const kw = KEYWORDS[p];
        if (!kw) return p;
        const span = (
          <span class="kw" style={{ color: kw.color }}>
            {p}
          </span>
        );
        if (!tips) return <span key={i}>{span}</span>;
        return (
          <Tip
            key={i}
            style={{ display: 'inline' }}
            content={() => (
              <div>
                <div class="tt-title" style={{ color: kw.color, fontSize: 16 }}>
                  {p}
                </div>
                <div class="tt-line">{kw.desc}</div>
              </div>
            )}
          >
            {span}
          </Tip>
        );
      })}
    </>
  );
}

/** Keyword glossary block appended to tooltips. */
export function KeywordBox({ texts }: { texts: (string | undefined)[] }) {
  const kws = keywordsIn(...texts);
  if (!kws.length) return null;
  return (
    <div class="kw-box">
      {kws.slice(0, 5).map((k) => (
        <div key={k} class="kw-def">
          <b style={{ color: KEYWORDS[k].color }}>{k}</b>：{KEYWORDS[k].desc}
        </div>
      ))}
    </div>
  );
}
