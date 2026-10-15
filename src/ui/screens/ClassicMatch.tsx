// 竞技场 between games: the squads, the series score, the prediction and what to do next.
import { BIOMES, generateTerrain } from '../../battle/terrain.ts';
import { sideSynergies } from '../../battle/setup.ts';
import { COMBOS, activeCombos } from '../../data/combos.ts';
import { mobDef } from '../../data/mobs.ts';
import {
  UPSET, isDecider, score, seriesChance, seriesMvp, seriesWinner, squadCost, winsNeeded,
  type Field, type GameRecord, type Rules, type Supply, type Teams,
} from '../../classic/match.ts';
import { blueChance, type Odds } from '../../classic/odds.ts';
import { url } from '../assets.ts';
import { Btn, MobCard, Tip } from '../components/common.tsx';
import { RichText } from '../components/rich.tsx';
import { SynRow } from './BattleStage.tsx';
import { profile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';

export type Guess = 0 | 1 | 'skip' | null;

export const BO_NAME: Record<number, string> = { 1: '单局决胜', 3: '三局两胜', 5: '五局三胜' };
export const FIELDS = BIOMES.filter((b) => !b.boss);
const biomeName = (id: string) => BIOMES.find((b) => b.id === id)?.name ?? id;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/** 240 games can't tell 0% from 0.3%: the extremes read as "under 1%". */
const pct = (p: number) => (p < 0.005 ? '<1%' : p > 0.995 ? '>99%' : `${Math.round(p * 100)}%`);

interface Props {
  rules: Rules;
  teams: Teams;
  games: GameRecord[];
  field: Field;
  guess: Guess;
  odds: Odds | null;
  /** Side owed a 败者补给 crate before the next game. */
  pull: 0 | 1 | null;
  /** What 败者补给 gave (or did not give) the loser of the last game, and why. */
  supply: (Supply & { side: 0 | 1 }) | null;
  /** Two players: who deploys first in the next game. */
  deployFirst?: 0 | 1;
  /** Custom squads, before the first game: choose the battlefield. */
  onField?: (f: Field) => void;
  onGuess: (g: Guess) => void;
  onFight: () => void;
  onPull: () => void;
  onReplay: (g: GameRecord) => void;
  onAgain: () => void;
  onSetup: () => void;
  onEdit?: () => void;
  onTitle: () => void;
}

export function ClassicMatch({ rules, teams, games, field, guess, odds, pull, supply, deployFirst, onField, onGuess, onFight, onPull, onReplay, onAgain, onSetup, onEdit, onTitle }: Props) {
  const names = rules.names;
  const bo = rules.bo;
  const won = seriesWinner(games, bo);
  const over = won !== null;
  const last = games[games.length - 1];
  const s = score(games);
  const lab = rules.mode === 'lab';
  const duel = rules.players === 2;
  // One player predicts on the first game only, before the odds are shown.
  const choosing = !lab && !duel && games.length === 0 && guess === null;
  const p = blueChance(odds);
  const terrain = generateTerrain(field.biome, field.seed);
  const decider = !over && isDecider(games, bo);

  let title: string;
  if (over) title = bo === 1 ? `${names[won]}获胜！` : `${names[won]}赢下对决！`;
  else if (last) title = last.winner === null ? `第 ${games.length} 局 · 平局，加赛一局` : `第 ${games.length} 局 · ${names[last.winner]}获胜`;
  else title = duel && lab ? '阵容揭晓！' : '双方阵容集结完毕';

  // Stats under each card: the last game while the series runs, the whole series once it is over.
  const shown = over ? games : last ? [last] : [];
  const stat = (team: 0 | 1, mob: string) => {
    let dmg = 0;
    let kills = 0;
    let alive = 0;
    let spawned = 0;
    let seen = false;
    for (const g of shown)
      for (const c of g.cards)
        if (c.team === team && c.mob === mob) {
          seen = true;
          dmg += c.dmg;
          kills += c.kills;
          alive += c.alive;
          spawned += c.spawned;
        }
    return seen ? { dmg, kills, alive, spawned } : null;
  };
  const mvp = over ? seriesMvp(games, won) : null;

  const guessLine = () => {
    if (lab || duel || guess === null) return null;
    if (guess === 'skip') return <div class="faint">本场没有竞猜</div>;
    if (!over) return <div class="subtle">你押了 <b class={guess === 0 ? 'blue-t' : 'red-t'}>{names[guess]}</b></div>;
    const ok = guess === won;
    return (
      <div class={ok ? 'gold-t' : 'red-t'} style={{ fontSize: 22 }}>
        {ok ? `猜对了！当前连胜 ${profile.value.classic.streak}` : `猜错了……你押的是${names[guess]}`}
      </div>
    );
  };

  return (
    <div class="screen classic-screen arena-bg">
      <div class="classic-inner match-inner">
        <div class="cl-title title-shadow">
          {over && <img class="cl-trophy" src={url.icon('trophy')} />}
          {title}
        </div>
        <div class="cl-sub">
          <span class="cl-format">{BO_NAME[bo] ?? `${bo} 局`}</span>
          {decider && <span class="cl-decider blink">决胜局！</span>}
          {guessLine()}
        </div>
        {bo > 1 && (
          <div class="cl-score">
            <span class="blue-t">{names[0]}</span>
            <b>
              {s[0]} : {s[1]}
            </b>
            <span class="red-t">{names[1]}</span>
          </div>
        )}
        <div class="cl-teams">
          {([0, 1] as const).map((i) => (
            <div key={i} class={`cl-team ${i === 0 ? 'blue' : 'red'} ${over && won === i ? 'winner' : ''} ${teams[i].length > 5 ? 'many' : ''}`}>
              <div class="cl-team-name">
                {names[i]}
                {lab && rules.budget > 0 && <span class="faint cl-cost"> · 费用 {squadCost(teams[i])}/{rules.budget}</span>}
              </div>
              <div class="row gap12 center wrap">
                {teams[i].map((pk, k) => {
                  const st = stat(i, pk.mob);
                  return (
                    <div key={k} class="col gap4" style={{ alignItems: 'center' }}>
                      <MobCard mob={pk.mob} star={pk.star} size="sm" />
                      {st && (
                        <span class="faint cl-stat">
                          伤害 {Math.round(st.dmg)} · {over ? `击杀 ${st.kills}` : `存活 ${st.alive}/${st.spawned}`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <TeamTraits mobs={teams[i].map((x) => x.mob)} />
            </div>
          ))}
          <div class="cl-vs">VS</div>
        </div>

        {over && mvp && (
          <div class="cl-mvp">
            <img src={url.mob(mvp.mob)} />
            <span>
              全场最佳：<b class={mvp.team === 0 ? 'blue-t' : 'red-t'}>{names[mvp.team]}</b> 的 {mobDef(mvp.mob).name} ★{mvp.star} · 伤害 {Math.round(mvp.dmg)} · 击杀 {mvp.kills}
            </span>
          </div>
        )}

        {!over && (
          <div class="cl-field">
            {onField && games.length === 0 ? (
              <select
                class="mc-select"
                value={field.biome}
                title="换一张战场：同样的阵容，换个地形可能就是另一个结果"
                onChange={(e) => (sfx('click'), onField({ biome: (e.target as HTMLSelectElement).value, seed: field.seed }))}
              >
                {FIELDS.map((b) => (
                  <option key={b.id} value={b.id}>
                    战场 · {b.name}
                  </option>
                ))}
              </select>
            ) : (
              <span class="dh-tname">
                {games.length ? `第 ${games.length + 1} 局战场` : '战场抽取'} · {terrain.name}
              </span>
            )}
            {terrain.effects.map((e) => (
              <span key={e} class="dh-tfx">
                {e}
              </span>
            ))}
          </div>
        )}

        {!over && supply && (
          <div class="cl-supply">
            败者补给 · <b class={supply.side === 0 ? 'blue-t' : 'red-t'}>{names[supply.side]}</b>：{supply.note}
          </div>
        )}
        {!over &&
          (pull !== null ? (
            <div class="faint cl-odds-cap">{names[pull]}开完败者补给箱后，重新推演下一局的胜率</div>
          ) : (
            <OddsBar odds={odds} p={p} names={names} hidden={choosing} games={games} bo={bo} note={duel ? '按默认站位' : undefined} />
          ))}

        {games.length > 0 && (bo > 1 || over) && <GameList games={games} names={names} onReplay={onReplay} />}

        {duel && !over && pull === null && deployFirst !== undefined && (
          <div class="faint">
            {games.length ? `上一局${names[(1 - deployFirst) as 0 | 1]}输了，这局后布阵：` : ''}
            {names[deployFirst]}先布阵，{names[(1 - deployFirst) as 0 | 1]}后布阵（可以看到对手的站位）
          </div>
        )}

        {choosing ? (
          <div class="col gap8" style={{ alignItems: 'center' }}>
            <div class="subtle">竞猜：你觉得{bo > 1 ? '哪一方会赢下这轮系列赛' : '哪一方会获胜'}？押好以后揭晓推演胜率</div>
            <div class="row gap16 center">
              <Btn variant="blue" size="big" onClick={() => onGuess(0)}>
                押{names[0]}
              </Btn>
              <Btn variant="red" size="big" onClick={() => onGuess(1)}>
                押{names[1]}
              </Btn>
              <Btn size="big" onClick={() => onGuess('skip')}>
                不猜，直接看推演
              </Btn>
            </div>
          </div>
        ) : over ? (
          <div class="row gap16 center">
            <Btn size="big" onClick={onTitle}>
              主菜单
            </Btn>
            <Btn size="big" onClick={onSetup}>
              修改规则
            </Btn>
            {onEdit && (
              <Btn size="big" onClick={onEdit}>
                {duel ? '重新暗选阵容' : '调整阵容'}
              </Btn>
            )}
            <Btn variant="green" size="big" onClick={onAgain}>
              {lab ? '同样阵容再打一轮' : '再来一局'}
            </Btn>
          </div>
        ) : (
          <div class="row gap16 center">
            <Btn size="big" onClick={onSetup}>
              {games.length ? '结束对决' : '返回'}
            </Btn>
            {onEdit && games.length === 0 && (
              <Btn size="big" onClick={onEdit}>
                {duel ? '重新暗选阵容' : '调整阵容'}
              </Btn>
            )}
            {pull !== null ? (
              <Btn variant="purple" size="big" onClick={onPull}>
                {names[pull]}开启败者补给箱
              </Btn>
            ) : duel ? (
              <Btn variant="gold" size="big" onClick={onFight} title={deployFirst === undefined ? undefined : `${names[deployFirst]}先布阵，${names[1 - deployFirst]}后布阵`}>
                {games.length ? `第 ${games.length + 1} 局：开始布阵` : '开始布阵'}
              </Btn>
            ) : (
              <Btn variant="gold" size="big" onClick={onFight}>
                ⚔ {games.length ? `开始第 ${games.length + 1} 局` : '开战！'}
              </Btn>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Active families and combos: what a careful predictor looks at. */
function TeamTraits({ mobs }: { mobs: string[] }) {
  const syn = sideSynergies(mobs.map((mob) => ({ mob })), []);
  const combos = activeCombos(mobs);
  return (
    <div class="cl-traits">
      <SynRow syn={syn} />
      {combos.map((id) => {
        const c = COMBOS.find((x) => x.id === id)!;
        return (
          <Tip key={id} content={() => <RichText text={c.desc} />}>
            <span class="cl-combo" style={{ '--cc': c.color } as never}>
              联动 · {c.name}
            </span>
          </Tip>
        );
      })}
    </div>
  );
}

function OddsBar({ odds, p, names, hidden, games, bo, note }: { odds: Odds | null; p: number | null; names: [string, string]; hidden: boolean; games: GameRecord[]; bo: number; note?: string }) {
  const running = !!odds && odds.done < odds.total;
  const head = odds ? `推演 ${odds.done}/${odds.total} 场` : '推演准备中';
  if (hidden || p === null)
    return (
      <div class="cl-odds pending">
        <div class="cl-odds-bar">
          <div class="fill pending" style={{ width: `${odds ? (odds.done / odds.total) * 100 : 0}%` }} />
        </div>
        <div class="faint cl-odds-cap">
          {hidden ? (running || !odds ? `${head}……结果在竞猜后揭晓` : `已在这张战场上推演 ${odds.total} 场，竞猜后揭晓`) : `${head}……`}
        </div>
      </div>
    );
  const s = score(games);
  const need = winsNeeded(bo);
  const series = bo > 1 ? seriesChance(p, need - s[0], need - s[1]) : null;
  return (
    <div class="cl-odds">
      <div class="cl-odds-bar">
        <div class="fill blue" style={{ width: `${p * 100}%` }}>
          <span>{pct(p)}</span>
        </div>
        <div class="fill red" style={{ width: `${(1 - p) * 100}%` }}>
          <span>{pct(1 - p)}</span>
        </div>
      </div>
      <div class="faint cl-odds-cap">
        {running ? `${head}……` : `在这张战场上${note ?? ''}推演了 ${odds!.total} 场`}
        ：本局 {names[0]} {pct(p)} · {names[1]} {pct(1 - p)}
        {series !== null && ` ｜ 整轮系列赛 ${names[0]} ${pct(series)}（按本局胜率估算）`}
        {(p < 0.03 || p > 0.97) && ' ｜ 几乎是一边倒的对局'}
      </div>
    </div>
  );
}

function GameList({ games, names, onReplay }: { games: GameRecord[]; names: [string, string]; onReplay: (g: GameRecord) => void }) {
  return (
    <div class="cl-games">
      {games.map((g, i) => {
        // The winner's predicted chance: under 30% is an upset.
        const pw = g.odds === undefined || g.winner === null ? null : g.winner === 0 ? g.odds : 1 - g.odds;
        return (
          <div key={i} class={`cl-game ${g.winner === 0 ? 'blue' : g.winner === 1 ? 'red' : ''}`}>
            <div>
              <b>第 {i + 1} 局</b>
              <span class="faint"> · {biomeName(g.field.biome)}</span>
            </div>
            <div>
              <span class={g.winner === 0 ? 'blue-t' : g.winner === 1 ? 'red-t' : 'faint'}>{g.winner === null ? '平局' : `${names[g.winner]}胜`}</span>
              <span class="faint">
                {' '}
                · {fmt(g.time)}
                {g.winner !== null && ` · 剩 ${g.left[g.winner]} 个单位`}
              </span>
            </div>
            <div class="row gap8" style={{ alignItems: 'center' }}>
              {pw !== null && <span class="faint">赛前胜率 {pct(pw)}</span>}
              {pw !== null && pw < UPSET && <span class="cl-upset">爆冷</span>}
              <button class="cl-replay" onClick={() => (sfx('click'), onReplay(g))}>
                ▶ 回放
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
