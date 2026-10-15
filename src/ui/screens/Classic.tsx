// 竞技场 (arena; formerly 经典对决 3v3, the original video format): squads from alternating crate
// pulls or picked by hand, then they brawl automatically. One player watches and predicts the
// winner; two players on one screen each run a side (secret picks, crate rerolls, deployment).
// A match can be a best-of-3 or best-of-5 series, each game on a fresh battlefield, with the
// prediction worker telling how much of a result was the squads and how much was luck.
// The arena never touches the codex: nothing here unlocks or requires a discovery.
import { useMemo, useRef, useState } from 'preact/hooks';
import { Rng, randomSeed } from '../../core/rng.ts';
import { CRATE_MAP, rollCrate, type CrateGrade } from '../../data/crates.ts';
import { mobDef, unitCount } from '../../data/mobs.ts';
import { generateTerrain } from '../../battle/terrain.ts';
import {
  DEFAULT_RULES, REROLLS, UPSET, addPull, classicSide, cleanName, score, seriesChance, seriesWinner, supplyFor, winsNeeded,
  type Anchors, type Field, type GameRecord, type Pick, type Rules, type Supply, type Teams,
} from '../../classic/match.ts';
import { blueChance, useOdds } from '../../classic/odds.ts';
import { url } from '../assets.ts';
import { Btn } from '../components/common.tsx';
import { CrateOpen } from './CrateOpen.tsx';
import { Arena3DView } from './Arena3DView.tsx';
import { BO_NAME, ClassicMatch, FIELDS, type Guess } from './ClassicMatch.tsx';
import { ClassicPicker } from './ClassicPicker.tsx';
import { CRATE_POOL, ClassicSetup } from './ClassicSetup.tsx';
import { earnAchievement, go, profile, settings, updateProfile, updateSettings } from '../store.ts';
import { sfx } from '../../audio/audio.ts';

type Phase = 'setup' | 'pick' | 'handover' | 'draft' | 'match' | 'deploy' | 'battle';

const randomField = (): Field => ({ biome: FIELDS[Math.floor(Math.random() * FIELDS.length)].id, seed: randomSeed() });
/** Pulls alternate blue, red, blue... until each side has its count. */
function draftOrder([a, b]: [number, number]): (0 | 1)[] {
  const out: (0 | 1)[] = [];
  for (let i = 0; i < Math.max(a, b); i++) {
    if (i < a) out.push(0);
    if (i < b) out.push(1);
  }
  return out;
}

function savedRules(): Rules {
  const r = { ...DEFAULT_RULES, ...settings.value.classic?.rules };
  return { ...r, names: [cleanName(r.names?.[0] ?? '', '蓝方'), cleanName(r.names?.[1] ?? '', '红方')] };
}

export function Classic() {
  const [phase, setPhase] = useState<Phase>('setup');
  const [rules, setRules] = useState<Rules>(savedRules);
  const [teams, setTeams] = useState<Teams>([[], []]);
  /** Sides still owed a crate (the draft, then 败者补给). */
  const [queue, setQueue] = useState<(0 | 1)[]>([]);
  /** The 败者补给 owed after the last game (grade null = none, with the reason). */
  const [supply, setSupply] = useState<(Supply & { side: 0 | 1 }) | null>(null);
  const [pulls, setPulls] = useState(0);
  /** Two players: crate rerolls left per side, and whether the next crate opens by itself. */
  const [rerolls, setRerolls] = useState<[number, number]>([REROLLS, REROLLS]);
  const [rerolled, setRerolled] = useState(false);
  const before = useRef<{ side: 0 | 1; team: Pick[] } | null>(null);
  const [matchSeed, setMatchSeed] = useState(randomSeed);
  const rng = useMemo(() => new Rng(matchSeed), [matchSeed]);
  const [games, setGames] = useState<GameRecord[]>([]);
  /** The next game: battlefield and battle seed. */
  const [field, setField] = useState<Field>(randomField);
  const [seed, setSeed] = useState(randomSeed);
  const [guess, setGuess] = useState<Guess>(null);
  /** The guessed side's chance of taking the series, as predicted when the first game started. */
  const [guessOdds, setGuessOdds] = useState<number | null>(null);
  /** Blue's predicted chance in the game being fought. */
  const [liveOdds, setLiveOdds] = useState<number | undefined>(undefined);
  /** A finished game being watched again (nothing is recorded). */
  const [watch, setWatch] = useState<GameRecord | null>(null);
  /** Two players: deployment positions, whose secret pick it is, and the deployment step. */
  const [anchors, setAnchors] = useState<Anchors>({});
  const [anchorV, setAnchorV] = useState(0);
  const [picking, setPicking] = useState<0 | 1>(0);
  const [deployStep, setDeployStep] = useState(0);

  const names = rules.names;
  const duel = rules.players === 2;
  const drafted = phase !== 'setup' && phase !== 'pick' && phase !== 'handover' && phase !== 'draft' && queue.length === 0;
  const over = seriesWinner(games, rules.bo) !== null;
  const odds = useOdds(teams, field, drafted && !over);
  const terrain = useMemo(() => generateTerrain(field.biome, field.seed), [field]);
  // Deployment: the loser of the last game goes second and can answer the other side's setup.
  const lastDecided = [...games].reverse().find((g) => g.winner !== null);
  const order: [0 | 1, 0 | 1] = lastDecided?.winner != null ? [lastDecided.winner, (1 - lastDecided.winner) as 0 | 1] : [0, 1];

  const remember = (patch: { rules?: Rules; lab?: Teams }) => updateSettings({ classic: { ...settings.value.classic, ...patch } });

  /** Starts a match with these rules (hand-picked squads come from the picker). */
  const begin = (r: Rules, lab?: Teams) => {
    const rr = { ...r, names: [cleanName(r.names[0], '蓝方'), cleanName(r.names[1], '红方')] as [string, string] };
    setRules(rr);
    remember({ rules: rr, ...(lab && rr.players === 1 ? { lab } : {}) });
    setGames([]);
    setGuess(null);
    setGuessOdds(null);
    setWatch(null);
    setSupply(null);
    setMatchSeed(randomSeed());
    setPulls(0);
    setRerolls([REROLLS, REROLLS]);
    setRerolled(false);
    setAnchors({});
    setDeployStep(0);
    setField(randomField());
    setSeed(randomSeed());
    if (rr.mode === 'lab' && lab) {
      setTeams(lab);
      setQueue([]);
      setPhase('match');
    } else {
      setTeams([[], []]);
      setQueue(draftOrder(rr.sizes));
      setPhase('draft');
    }
  };

  /** From the setup screen: draft crates, or pick squads (two players pick in secret, blue first). */
  const start = (r: Rules) => {
    setRules(r);
    if (r.mode === 'crate') return begin(r);
    if (r.players === 2) {
      setTeams([[], []]);
      setPicking(0);
      setPhase('handover');
    } else {
      setTeams(settings.value.classic?.lab ?? [[], []]);
      setPhase('pick');
    }
  };

  // ── draft: one crate per queued side ──
  const pullSide = queue[0];
  const comeback = games.length > 0;
  const grade: CrateGrade = comeback ? (supply?.grade ?? rules.grade) : rules.grade;
  const crateId = rules.crate === 'random' ? CRATE_POOL[(pulls * 7 + matchSeed) % CRATE_POOL.length].id : rules.crate;
  const pull = useMemo(
    () => (phase === 'draft' && pullSide !== undefined ? rollCrate(rng, CRATE_MAP[crateId], grade, { act: 1, luck: 0, goldMul: 1, redMul: 1, pity: 0 }) : null),
    [pulls, phase],
  );

  if (phase === 'draft' && pull && pullSide !== undefined) {
    // Pulls so far = stars on the side (before this crate's result was added).
    const base = before.current?.side === pullSide ? before.current.team : teams[pullSide];
    const round = base.reduce((n, p) => n + p.star, 0) + 1;
    const canReroll = duel && rerolls[pullSide] > 0;
    return (
      <div class="classic-draft">
        <CrateOpen
          key={pulls}
          crate={crateId}
          grade={grade}
          mob={pull.mob}
          autoStart={rerolled}
          title={comeback ? `${names[pullSide]} · 败者补给` : `${names[pullSide]} · 第 ${round} 箱`}
          act={1}
          onReveal={() => {
            const m = mobDef(pull.mob);
            const had = teams[pullSide].some((p) => p.mob === pull.mob);
            before.current = { side: pullSide, team: teams[pullSide] };
            const { team, star, joined } = addPull(teams[pullSide], pull.mob);
            setTeams(pullSide === 0 ? [team, teams[1]] : [teams[0], team]);
            if (!joined) return { headline: `${names[pullSide]}重复开出 ${m.name}，升至 ★${star}！`, tone: 'star' as const };
            return {
              headline: had ? `${m.name} 已经满星，${names[pullSide]}再添一队 ×${unitCount(m, 1)}` : `${names[pullSide]}获得 ${m.name} ×${unitCount(m, 1)}`,
              tone: 'new' as const,
            };
          }}
          onContinue={() => {
            const q = queue.slice(1);
            before.current = null;
            setRerolled(false);
            setPulls(pulls + 1);
            setQueue(q);
            if (q.length) return;
            const gold = (t: Pick[]) => t.some((p) => mobDef(p.mob).rarity === 'gold');
            if (gold(teams[0]) && gold(teams[1])) earnAchievement('classic_gods');
            setPhase('match');
          }}
          extra={
            <div class="col gap8" style={{ alignItems: 'center' }}>
              <TeamsBar teams={teams} names={names} />
              {canReroll && (
                <button
                  class="cl-reroll"
                  onClick={() => {
                    const b = before.current;
                    if (!b) return;
                    sfx('door');
                    setTeams(b.side === 0 ? [b.team, teams[1]] : [teams[0], b.team]);
                    setRerolls((r) => (b.side === 0 ? [r[0] - 1, r[1]] : [r[0], r[1] - 1]));
                    before.current = null;
                    setRerolled(true);
                    setPulls(pulls + 1);
                  }}
                >
                  <img src={url.icon('reroll')} />
                  {names[pullSide]}不要这个，重开一箱（还剩 {rerolls[pullSide]} 次）
                </button>
              )}
            </div>
          }
        />
      </div>
    );
  }

  if (phase === 'handover')
    return (
      <Handover
        to={picking}
        names={names}
        onGo={() => setPhase('pick')}
        onBack={() => setPhase('setup')}
      />
    );

  if (phase === 'pick')
    return (
      <ClassicPicker
        key={duel ? `duel${picking}` : 'solo'}
        initial={teams}
        names={names}
        budget={rules.budget}
        only={duel ? picking : undefined}
        onBack={() => setPhase('setup')}
        onDone={(t) => {
          if (!duel) return begin({ ...rules, mode: 'lab' }, t);
          if (picking === 0) {
            setTeams([t[0], []]);
            setPicking(1);
            setPhase('handover');
          } else begin({ ...rules, mode: 'lab' }, [teams[0], t[1]]);
        }}
      />
    );

  // ── deployment and battle (a new game, or a replay of a finished one) ──
  if (phase === 'deploy' || phase === 'battle') {
    const g = watch ?? { field, seed, teams, anchors };
    const no = watch ? games.indexOf(watch) + 1 : games.length + 1;
    const s = score(games.slice(0, no - 1));
    const t = watch ? generateTerrain(watch.field.biome, watch.field.seed) : terrain;
    const A = g.anchors ?? {};
    const side = order[deployStep];
    const decider = rules.bo > 1 && s[0] === s[1] && s[0] === winsNeeded(rules.bo) - 1;
    return (
      <Arena3DView
        key={`${watch ? 'r' : 'g'}${no}-${g.seed}`}
        terrain={t}
        config={{ seed: g.seed, sides: [classicSide(g.teams[0], 0, A), classicSide(g.teams[1], 1, A)], terrain: t }}
        configKey={`arena-${no}-${g.seed}-${anchorV}`}
        phase={phase === 'deploy' ? 'deploy' : 'fight'}
        deploySide={side}
        onDeployMove={(uid, pos) => {
          setAnchors((a) => ({ ...a, [uid]: pos }));
          setAnchorV((v) => v + 1);
        }}
        title={rules.bo > 1 ? `第 ${no} 局 · ${s[0]} : ${s[1]}` : '竞技场'}
        subtitle={watch ? `回放 · 第 ${no} 局` : rules.bo > 1 ? `${BO_NAME[rules.bo]} · 第 ${no} 局${decider ? ' · 决胜局' : ''}` : `${names[0]} VS ${names[1]}`}
        leftLabel={names[0]}
        rightLabel={names[1]}
        endText={[`${names[0]}获胜`, `${names[1]}获胜`]}
        onFinish={(r) => {
          if (watch) {
            setWatch(null);
            setPhase('match');
            return;
          }
          finishGame({
            field, seed, teams, anchors: duel ? anchors : undefined, winner: r.draw ? null : r.winner, time: r.time, left: r.left ?? [0, 0], cards: r.cards, odds: liveOdds,
          });
        }}
      >
        {phase === 'deploy' && (
          <DeployBar
            name={names[side]}
            side={side}
            step={deployStep}
            other={names[(1 - side) as 0 | 1]}
            game={no}
            second={games.length > 0}
            onReset={() => {
              sfx('click');
              setAnchors((a) => Object.fromEntries(Object.entries(a).filter(([k]) => !k.startsWith(`${side}-`))));
              setAnchorV((v) => v + 1);
            }}
            onDone={() => {
              sfx('click');
              if (deployStep === 0) setDeployStep(1);
              else setPhase('battle');
            }}
            onBack={() => setPhase('match')}
          />
        )}
      </Arena3DView>
    );
  }

  /** Records a game; then the series ends, or the next game gets its battlefield (and the loser its crate). */
  function finishGame(rec: GameRecord) {
    const gs = [...games, rec];
    setGames(gs);
    setPhase('match');
    setDeployStep(0);
    const w = seriesWinner(gs, rules.bo);
    if (w === null) {
      if (rules.field === 'each') setField(randomField());
      setSeed(randomSeed());
      setSupply(null);
      if (rules.comeback && rules.mode === 'crate' && rec.winner !== null) {
        const loser = (1 - rec.winner) as 0 | 1;
        const s = supplyFor(rec.odds === undefined ? undefined : loser === 0 ? rec.odds : 1 - rec.odds, rules.grade);
        setSupply({ ...s, side: loser });
        if (s.grade) setQueue([loser]);
      }
      return;
    }
    if (duel) {
      updateProfile((p) => {
        p.classic = { ...p.classic, duels: (p.classic.duels ?? 0) + 1 };
      });
      return;
    }
    // One player, series over: the prediction, and the series achievements.
    const picked = guess === 0 || guess === 1;
    const ok = picked && guess === w;
    const upset = ok && guessOdds !== null && guessOdds < UPSET;
    updateProfile((p) => {
      const c = { upsets: 0, ...p.classic };
      c.played++;
      if (picked) {
        c.guesses++;
        c.correct += ok ? 1 : 0;
        c.streak = ok ? c.streak + 1 : 0;
        c.best = Math.max(c.best, c.streak);
        if (upset) c.upsets++;
      }
      p.classic = c;
    });
    const ids: string[] = [];
    const streak = profile.value.classic.streak;
    if (picked && streak >= 5) ids.push('classic_5');
    if (picked && streak >= 10) ids.push('classic_10');
    if (upset) ids.push('classic_upset');
    const decided = gs.filter((g) => g.winner !== null);
    if (rules.bo === 5 && decided.length === 5) {
      ids.push('classic_decider');
      if (decided[0].winner === decided[1].winner && decided[0].winner !== w) ids.push('classic_reverse');
    }
    if (ids.length) earnAchievement(...ids);
  }

  /** Next game: two players deploy first; one player goes straight to the fight. */
  const fight = () => {
    const p = blueChance(odds);
    setLiveOdds(p ?? undefined);
    if (!duel && games.length === 0 && (guess === 0 || guess === 1) && p !== null) {
      const need = winsNeeded(rules.bo);
      const blue = seriesChance(p, need, need);
      setGuessOdds(guess === 0 ? blue : 1 - blue);
    }
    setDeployStep(0);
    setPhase(duel ? 'deploy' : 'battle');
  };

  if (phase === 'match')
    return (
      <ClassicMatch
        rules={rules}
        teams={teams}
        games={games}
        field={field}
        guess={duel ? 'skip' : guess}
        odds={odds}
        pull={queue[0] ?? null}
        supply={supply}
        deployFirst={duel ? order[0] : undefined}
        onField={rules.mode === 'lab' ? setField : undefined}
        onGuess={(g) => {
          sfx(g === 'skip' ? 'click' : 'levelup', { vol: 0.5 });
          setGuess(g);
        }}
        onFight={fight}
        onPull={() => setPhase('draft')}
        onReplay={(g) => {
          setWatch(g);
          setPhase('battle');
        }}
        onAgain={() => begin(rules, rules.mode === 'lab' ? teams : undefined)}
        onSetup={() => setPhase('setup')}
        onEdit={rules.mode === 'lab' ? () => (duel ? start(rules) : setPhase('pick')) : undefined}
        onTitle={() => go('title')}
      />
    );

  return <ClassicSetup rules={rules} onChange={setRules} onStart={start} />;
}

/** Two players, secret picks: hand the screen to the next player. */
function Handover({ to, names, onGo, onBack }: { to: 0 | 1; names: [string, string]; onGo: () => void; onBack: () => void }) {
  const other = names[(1 - to) as 0 | 1];
  return (
    <div class="screen classic-screen arena-bg">
      <div class="classic-inner handover">
        <img class="handover-art" src={url.arena('handover')} />
        <div class="cl-title title-shadow">
          请把屏幕交给 <span class={to === 0 ? 'blue-t' : 'red-t'}>{names[to]}</span>
        </div>
        <div class="subtle" style={{ fontSize: 18 }}>
          {to === 0 ? `${names[0]}先挑选阵容，${other}请先别看屏幕。` : `${other}的阵容已经锁定。轮到${names[1]}了，${other}请别偷看！`}
        </div>
        <div class="row gap16 center">
          <Btn size="big" onClick={onBack}>
            返回
          </Btn>
          <Btn variant={to === 0 ? 'blue' : 'red'} size="big" onClick={() => (sfx('click'), onGo())}>
            我是{names[to]}，开始挑选
          </Btn>
        </div>
      </div>
    </div>
  );
}

/** Two players, deployment: whose turn it is and how to hand over. */
function DeployBar(p: { name: string; side: 0 | 1; step: number; other: string; game: number; second: boolean; onReset: () => void; onDone: () => void; onBack: () => void }) {
  return (
    <div class={`deploy-bar side${p.side}`}>
      <div class="deploy-bar-head">
        第 {p.game} 局 · <b>{p.name}</b> 布阵（{p.step + 1}/2）
      </div>
      <div class="faint" style={{ fontSize: 14 }}>
        把{p.side === 0 ? '蓝' : '红'}色区域里你的生物拖到想要的位置；拖动空白处旋转视角，滚轮缩放。
        {p.step === 1 ? (p.second ? `上一局输了，你后布阵，可以针对${p.other}的站位。` : `你后布阵，可以针对${p.other}的站位。`) : `布完交给${p.other}。`}
      </div>
      <div class="row gap8 center">
        <Btn size="small" onClick={p.onBack}>
          返回
        </Btn>
        <Btn size="small" onClick={p.onReset}>
          恢复默认站位
        </Btn>
        <Btn size="small" variant={p.step === 1 ? 'gold' : p.side === 0 ? 'blue' : 'red'} onClick={p.onDone}>
          {p.step === 1 ? '布阵完成，开战！' : `布阵完成，交给${p.other}`}
        </Btn>
      </div>
    </div>
  );
}

function TeamsBar({ teams, names }: { teams: Teams; names: [string, string] }) {
  return (
    <div class="teams-bar">
      {([0, 1] as const).map((i) => (
        <div key={i} class={`tb-side ${i === 0 ? 'blue' : 'red'}`}>
          <span>{names[i]}</span>
          {teams[i].map((p, k) => (
            <img key={k} src={url.mob(p.mob)} title={`${mobDef(p.mob).name} ★${p.star}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

