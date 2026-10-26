import { useEffect } from 'preact/hooks';
import type { Pending, RunState } from '../../run/run.ts';
import { declineRift, startAct } from '../../run/run.ts';
import { ENC_MAP } from '../../data/encounters.ts';
import { mobDef } from '../../data/mobs.ts';
import { url } from '../assets.ts';
import { Btn } from '../components/common.tsx';
import { act } from './RunView.tsx';
import { sfx } from '../../audio/audio.ts';

const ACTS: Record<number, { name: string; arena: string; line: string; color: string }> = {
  1: { name: '主世界', arena: 'overworld', line: '阳光下的草地并不安全。夜幕即将降临，怪物们正在集结——而你的补给箱里，也装着它们的同类。', color: '#8fe36b' },
  2: { name: '下界', arena: 'nether', line: '穿过黑曜石传送门，热浪扑面而来。凋灵骷髅在要塞深处守护着毁灭之主的召唤祭坛。', color: '#ff7a3d' },
  3: { name: '末地', arena: 'end', line: '末影之眼指引你来到虚空之上。黑曜石柱顶端的水晶闪烁着，末影龙在等待。', color: '#c06bff' },
  4: {
    name: '筛界', arena: 'sift',
    line: '末影龙倒下的地方，空气被撕开了一道粉色的裂隙。另一边是第四个维度——筛界：青色的天空下，灵魂随着潮汐流动。你可以就此凯旋，也可以踏进去。',
    color: '#ff8fb1',
  },
  5: {
    name: '遗迹远征', arena: 'overworld',
    line: '踏入尘封已久的远古遗迹。孤独堡垒的冰风、蔓生神殿的剧毒与深渊纪念碑的潮汐在前方交织，迎战古老首领。',
    color: '#70a1ff',
  },
  6: {
    name: '圣殿远征', arena: 'nether',
    line: '下界深处的熔炉堡垒与呼啸高耸的疾风圣殿已然苏醒。准备面对烈焰与风暴的双重试炼。',
    color: '#ff7a3d',
  },
  7: {
    name: '破碎堡垒', arena: 'end',
    line: '终焉的钟声在破碎的虚空浮石上敲响。复仇之心在此凝聚，这是属于勇者的终极决战！',
    color: '#a55eea',
  },
};

export function ActIntro({ s, p }: { s: RunState; p: Extract<Pending, { type: 'act_intro' }>; v?: number }) {
  const a = ACTS[p.act] ?? ACTS[1];
  const bossId = s.bosses[p.act - 1] ?? 'a4b_monstrosity';
  const boss = ENC_MAP[bossId] ?? ENC_MAP['a4b_monstrosity'];
  useEffect(() => {
    sfx(p.act === 1 ? 'levelup' : 'teleport', { vol: 0.7 });
  }, []);
  const rift = p.act === 4;
  const actNums = ['', '一', '二', '三', '四', '五', '六', '七'];
  return (
    <div class="screen act-intro" style={{ backgroundImage: `url(${rift ? url.event('sift') : url.bg(`arena_${a.arena}`)})` }}>
      <div class="act-shade" />
      <div class="act-inner">
        <div class="act-num">{rift ? '第四幕 · 可选' : `第${actNums[p.act] ?? p.act}幕`}</div>
        <div class="act-name title-shadow" style={{ color: a.color }}>
          {a.name}
        </div>
        <div class="act-line">{a.line}</div>
        <div class="act-boss">
          <img src={url.mob(mobDef(boss.cards[0][0]).id)} />
          <div>
            <div class="faint">本幕首领</div>
            <div class="gold-t" style={{ fontSize: 26 }}>{boss.name}</div>
          </div>
        </div>
        {p.act > 1 && <div class="em" style={{ fontSize: 18 }}>出战栏位：{s.slots} 个</div>}
        {rift && <div class="faint" style={{ fontSize: 15, maxWidth: 560 }}>筛界的敌人更强，但这里有只属于筛界的生物与「裂隙」补给箱。在筛界倒下也算屠龙成功；击败幽匿巨像可以获得额外的分数与成就。</div>}
        <div class="row gap12">
          <Btn variant="gold" size="big" onClick={() => act((r) => startAct(r, p.act))}>
            {p.act === 1 ? '踏上旅途' : rift ? '踏入裂隙' : '进入传送门'}
          </Btn>
          {rift && (
            <Btn variant="green" size="big" onClick={() => act((r) => declineRift(r))}>
              凯旋而归
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
