// Classic 3v3 mode: the original video format. Red and blue alternate opening crates,
// each mob is introduced, then the two squads brawl automatically while you guess the winner.
import { useMemo, useState } from 'preact/hooks';
import { Rng, randomSeed } from '../../core/rng.ts';
import { CRATES, CRATE_MAP, rollCrate, type CrateGrade } from '../../data/crates.ts';
import { mobDef, unitCount } from '../../data/mobs.ts';
import { buildSide } from '../../battle/setup.ts';
import type { BattleResult } from '../../battle/sim.ts';
import { url } from '../assets.ts';
import { Btn, MobCard } from '../components/common.tsx';
import { CrateOpen } from './CrateOpen.tsx';
import { Arena3DView } from './Arena3DView.tsx';
import { BIOMES, generateTerrain } from '../../battle/terrain.ts';
import { discover, earnAchievement, go, profile, updateProfile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';

interface Pick {
  mob: string;
  star: number;
}
type Phase = 'setup' | 'draft' | 'lineup' | 'battle' | 'result';

const MODES: { id: CrateGrade; name: string; desc: string }[] = [
  { id: 'normal', name: '标准开箱', desc: '与主世界普通补给箱相同的概率' },
  { id: 'premium', name: '高级开箱', desc: '保密级与隐秘级更常见' },
  { id: 'elite', name: '欧皇模式', desc: '没有军规级，金色传说更多' },
];

export function Classic() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [grade, setGrade] = useState<CrateGrade>('normal');
  const [crateId, setCrateId] = useState('origin');
  const [rounds, setRounds] = useState(3);
  const [teams, setTeams] = useState<[Pick[], Pick[]]>([[], []]);
  const [turn, setTurn] = useState(0);
  const [guess, setGuess] = useState<0 | 1 | null>(null);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [seed, setSeed] = useState(randomSeed());
  const rng = useMemo(() => new Rng(seed), [seed]);
  const [field, setField] = useState(() => ({ biome: 'plains', seed: 1 }));
  const terrain = useMemo(() => generateTerrain(field.biome, field.seed), [field]);

  const side = turn % 2 as 0 | 1;
  const pullCrate = crateId === 'random' ? CRATES[(turn * 7 + seed) % 6].id : crateId;
  const pull = useMemo(() => (phase === 'draft' ? rollCrate(rng, CRATE_MAP[pullCrate], grade, { act: 1, luck: 0, goldMul: 1, redMul: 1, pity: 0 }) : null), [turn, phase]);

  const start = () => {
    setTeams([[], []]);
    setTurn(0);
    setGuess(null);
    setResult(null);
    setSeed(randomSeed());
    const pool = BIOMES.filter((b) => !b.boss);
    setField({ biome: pool[Math.floor(Math.random() * pool.length)].id, seed: randomSeed() });
    setPhase('draft');
  };

  const config = () => {
    const mk = (t: Pick[]) => buildSide(t.map((p) => ({ mob: p.mob, star: p.star, row: mobDef(p.mob).defaultRow })), { relics: [], potions: [], act: 1 });
    return { seed: seed ^ 0x5bd1e995, sides: [mk(teams[0]), mk(teams[1])] as [ReturnType<typeof mk>, ReturnType<typeof mk>], terrain };
  };

  if (phase === 'battle')
    return (
      <Arena3DView
        terrain={terrain}
        config={config()}
        configKey={`classic-${seed}`}
        phase="fight"
        title="经典对决"
        subtitle="蓝方 VS 红方"
        leftLabel="蓝方"
        rightLabel="红方"
        onFinish={(r) => {
          setResult(r);
          setPhase('result');
          if (guess !== null)
            updateProfile((p) => {
              const ok = guess === r.winner;
              p.classic = { ...p.classic, played: p.classic.played + 1, guesses: p.classic.guesses + 1, correct: p.classic.correct + (ok ? 1 : 0) };
              p.classic.streak = ok ? p.classic.streak + 1 : 0;
              p.classic.best = Math.max(p.classic.best, p.classic.streak);
            });
          const streak = profile.value.classic.streak;
          if (streak >= 5) earnAchievement('classic_5', ...(streak >= 10 ? ['classic_10'] : []));
        }}
      />
    );

  if (phase === 'draft' && pull)
    return (
      <div class="classic-draft">
        <CrateOpen
          key={turn}
          crate={pullCrate}
          grade={grade}
          mob={pull.mob}
          title={`${side === 0 ? '蓝方' : '红方'} · 第 ${Math.floor(turn / 2) + 1} 轮开箱`}
          act={1}
          onReveal={() => {
            discover(pull.mob);
            const t: [Pick[], Pick[]] = [teams[0].slice(), teams[1].slice()];
            const ex = t[side].find((p) => p.mob === pull.mob);
            let info;
            if (ex && ex.star < 3) {
              ex.star++;
              info = { headline: `${side === 0 ? '蓝方' : '红方'}重复开出 ${mobDef(pull.mob).name}，升至 ★${ex.star}！`, tone: 'star' as const };
            } else {
              t[side].push({ mob: pull.mob, star: 1 });
              info = { headline: `${side === 0 ? '蓝方' : '红方'}获得 ${mobDef(pull.mob).name} ×${unitCount(mobDef(pull.mob), 1)}`, tone: 'new' as const };
            }
            setTeams(t);
            return info;
          }}
          onContinue={() => {
            if (turn + 1 >= rounds * 2) setPhase('lineup');
            else setTurn(turn + 1);
          }}
          extra={<TeamsBar teams={teams} />}
        />
      </div>
    );

  if (phase === 'lineup' || phase === 'result') {
    const win = result?.winner;
    return (
      <div class="screen classic-screen bg-stone bg-shade">
        <div class="classic-inner">
          <div class="cl-title title-shadow">{phase === 'result' ? (win === 0 ? '蓝方获胜！' : '红方获胜！') : '双方阵容集结完毕'}</div>
          <div class="cl-field">
            <span class="dh-tname">战场抽取 · {terrain.name}</span>
            {terrain.effects.map((e) => (
              <span key={e} class="dh-tfx">
                {e}
              </span>
            ))}
          </div>
          {phase === 'result' && guess !== null && (
            <div class={guess === win ? 'gold-t' : 'red-t'} style={{ fontSize: 22 }}>
              {guess === win ? `猜对了！当前连胜 ${profile.value.classic.streak}` : '猜错了……'}
            </div>
          )}
          <div class="cl-teams">
            {[0, 1].map((i) => (
              <div key={i} class={`cl-team ${i === 0 ? 'blue' : 'red'} ${phase === 'result' && win === i ? 'winner' : ''}`}>
                <div class="cl-team-name">{i === 0 ? '蓝方' : '红方'}</div>
                <div class="row gap12 center wrap">
                  {teams[i].map((p, k) => {
                    const stat = result?.cards.filter((c) => c.team === i)[k];
                    return (
                      <div key={k} class="col gap4" style={{ alignItems: 'center' }}>
                        <MobCard mob={p.mob} star={p.star} size="sm" />
                        {stat && (
                          <span class="faint" style={{ fontSize: 13 }}>
                            ⚔ {Math.round(stat.dmg)} · 存活 {stat.alive}/{stat.spawned}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div class="cl-vs">VS</div>
          </div>
          {phase === 'lineup' ? (
            <>
              <div class="subtle">竞猜：你认为哪一方会获胜？</div>
              <div class="row gap16 center">
                <Btn variant={guess === 0 ? 'green' : ''} onClick={() => (sfx('click'), setGuess(0))}>
                  押蓝方
                </Btn>
                <Btn variant={guess === 1 ? 'red' : ''} onClick={() => (sfx('click'), setGuess(1))}>
                  押红方
                </Btn>
                <Btn variant="gold" size="big" onClick={() => setPhase('battle')}>
                  ⚔ 开战！
                </Btn>
              </div>
            </>
          ) : (
            <div class="row gap16 center">
              <Btn size="big" onClick={() => go('title')}>
                返回主菜单
              </Btn>
              <Btn size="big" onClick={() => setPhase('battle')}>
                重播这场
              </Btn>
              <Btn variant="green" size="big" onClick={start}>
                再来一局
              </Btn>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Setup
  return (
    <div class="screen classic-screen bg-stone bg-shade">
      <div class="classic-inner">
        <div class="cl-title title-shadow">经典对决 3V3</div>
        <div class="subtle" style={{ fontSize: 18, maxWidth: 820, textAlign: 'center' }}>
          红蓝双方轮流开箱，每次开出的魔改生物都会加入本方阵容。重复开出同一生物会升星。集结完毕后双方全自动混战——最后仍有生物存活的一方获胜。
        </div>
        <div class="panel cl-setup">
          <div class="set-row">
            <span>补给箱</span>
            <div class="row gap4 wrap" style={{ justifyContent: 'flex-end' }}>
              {[...CRATES.filter((c) => c.id !== 'ominous'), { id: 'random', name: '随机' }].map((c) => (
                <button key={c.id} class={`toggle ${crateId === c.id ? 'on' : ''}`} onClick={() => setCrateId(c.id)}>
                  {c.id === 'random' ? '每次随机' : c.name.replace(/「|」|补给箱/g, '')}
                </button>
              ))}
            </div>
          </div>
          <div class="set-row">
            <span>开箱品质</span>
            <div class="row gap4">
              {MODES.map((m) => (
                <button key={m.id} class={`toggle ${grade === m.id ? 'on' : ''}`} onClick={() => setGrade(m.id)} title={m.desc}>
                  {m.name}
                </button>
              ))}
            </div>
          </div>
          <div class="set-row">
            <span>每方生物数</span>
            <div class="row gap4">
              {[3, 4, 5].map((n) => (
                <button key={n} class={`toggle ${rounds === n ? 'on' : ''}`} onClick={() => setRounds(n)}>
                  {n} 种
                </button>
              ))}
            </div>
          </div>
          {crateId !== 'random' && (
            <div class="row gap16" style={{ marginTop: 10, alignItems: 'center' }}>
              <img src={url.crate(crateId)} style={{ width: 110 }} />
              <div class="subtle">{CRATE_MAP[crateId].desc}</div>
            </div>
          )}
        </div>
        <div class="row gap16 center">
          <Btn size="big" onClick={() => go('title')}>
            返回
          </Btn>
          <Btn variant="gold" size="big" onClick={start}>
            开始开箱
          </Btn>
        </div>
      </div>
    </div>
  );
}

function TeamsBar({ teams }: { teams: [Pick[], Pick[]] }) {
  return (
    <div class="teams-bar">
      {[0, 1].map((i) => (
        <div key={i} class={`tb-side ${i === 0 ? 'blue' : 'red'}`}>
          <span>{i === 0 ? '蓝方' : '红方'}</span>
          {teams[i].map((p, k) => (
            <img key={k} src={url.mob(p.mob)} title={`${mobDef(p.mob).name} ★${p.star}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
