import { useEffect, useState } from 'preact/hooks';
import { signal } from '@preact/signals';
import { COMMANDER_MAP, OMENS } from '../../data/items.ts';
import { mobDef } from '../../data/mobs.ts';
import { createRun } from '../../run/run.ts';
import { DAILY_TRIES, dailyConfig, dailyDate, msToNextDaily } from '../../run/daily.ts';
import { loadRun, ROMAN_OMEN } from '../../meta/profile.ts';
import { fetchBoard, type BoardData, type BoardEntry, type BoardId } from '../../net/leaderboard.ts';
import { url } from '../assets.ts';
import { Btn, Modal } from '../components/common.tsx';
import { commit, go, profile, setRun, updateProfile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { isHostConnected, selfProfile } from '../../net/bakaboxBridge.ts';

/** Tab the leaderboard opens on (the title screen has a button for the daily and one for the boards). */
export const lbTab = signal<BoardId>('daily');

const TABS: [BoardId, string][] = [
  ['daily', '今日挑战'],
  ['week', '本周'],
  ['all', '总榜'],
];

const COMMANDER_SET = new Set(['steve', 'alex', 'villager', 'witch']);

function getAvatarUrl(avatar?: string) {
  if (!avatar) return url.cmd('steve');
  if (avatar.startsWith('//')) return 'https:' + avatar;
  if (
    avatar.startsWith('http://') ||
    avatar.startsWith('https://') ||
    avatar.startsWith('data:') ||
    avatar.startsWith('blob:') ||
    avatar.startsWith('/') ||
    avatar.startsWith('./') ||
    avatar.includes('assets/')
  ) {
    return avatar;
  }
  if (COMMANDER_SET.has(avatar)) return url.cmd(avatar);
  return url.mob(avatar);
}

/** Where today's daily challenge stands for this player. */
export function dailyState() {
  const cfg = dailyConfig(dailyDate());
  const rec = profile.value.daily?.[cfg.date] ?? { tries: 0, best: -1 };
  const save = loadRun();
  const left = Math.max(0, DAILY_TRIES - rec.tries);
  const status = save?.daily === cfg.date ? 'playing' : left > 0 ? 'ready' : 'done';
  return { cfg, status, tries: rec.tries, left, best: rec.best >= 0 ? rec.best : null, save } as const;
}

function startDaily() {
  const { cfg } = dailyState();
  const s = createRun(cfg.commander, cfg.omen, cfg.seed);
  s.daily = cfg.date;
  updateProfile((p) => {
    const rec = p.daily?.[cfg.date] ?? { tries: 0, best: -1 };
    p.daily = { ...(p.daily ?? {}), [cfg.date]: { ...rec, tries: rec.tries + 1 } };
  });
  sfx('levelup');
  setRun(s);
  commit();
  go('run');
}

const omenLabel = (o: number) => (o ? `不祥之兆 ${ROMAN_OMEN[o]}` : '普通');

function clock(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

function progressText(e: Pick<BoardEntry, 'won' | 'act' | 'floor'>) {
  const ACT_NAMES = ['', '主世界', '下界', '末地', '筛界', '遗迹远征', '圣殿远征', '破碎堡垒'];
  const ACT_NUMS = ['', '一', '二', '三', '四', '五', '六', '七'];
  if (e.won) return e.act >= 4 ? '凯旋通关' : '屠龙通关';
  const inActFloor = e.floor > 14 ? ((e.floor - 1) % 14) + 1 : e.floor;
  const actName = ACT_NAMES[e.act] ?? `第${e.act}幕`;
  return `第${ACT_NUMS[e.act] ?? e.act}幕 · ${actName} · 第 ${inActFloor} 层`;
}

export function Leaderboard() {
  // 必须在宿主环境（BakaBox）内运行
  if (!isHostConnected.value) {
    go('title');
    return null;
  }

  const isLoggedIn = selfProfile.value ? selfProfile.value.isLoggedIn !== false : true;
  const [tab, setTab] = useState<BoardId>(lbTab.value);
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [left, setLeft] = useState(msToNextDaily());
  const daily = dailyState();
  const cmd = COMMANDER_MAP[daily.cfg.commander];

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fetchBoard(tab, tab === 'daily' ? daily.cfg.date : undefined)
      .then((d) => live && setData(d))
      .catch((e: Error) => live && (setData(null), setError(e.message)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [tab]);

  useEffect(() => {
    const t = window.setInterval(() => setLeft(msToNextDaily()), 1000);
    return () => clearInterval(t);
  }, []);

  const start = () => {
    if (daily.save && !daily.save.daily) setConfirm(true);
    else startDaily();
  };

  return (
    <div class="screen lb-screen bg-stone bg-shade">
      <div class="lb-inner">
        <div class="row between">
          <div class="codex-title title-shadow">每日挑战 · 排行榜</div>
          <Btn onClick={() => go('title')}>返回</Btn>
        </div>
        <div class="lb-body">
          <div class="lb-side">
            <div class="panel lb-daily" style={{ '--cc': cmd.color } as never}>
              <div class="row between">
                <div class="panel-title" style={{ marginBottom: 0 }}>
                  每日挑战
                </div>
                <div class="faint">距离刷新 {clock(left)}</div>
              </div>
              <div class="lbd-date">{daily.cfg.date.slice(5).replace('-', ' 月 ')} 日</div>
              <div class="lbd-cmd">
                <img src={url.cmd(cmd.id)} />
                <div>
                  <div class="lbd-name" style={{ color: cmd.color }}>
                    {cmd.name} · {cmd.title}
                  </div>
                  <div class="red-t">{omenLabel(daily.cfg.omen)}</div>
                  <div class="faint" style={{ fontSize: 13 }}>
                    {OMENS.slice(0, daily.cfg.omen).map((o) => o.title).join(' · ')}
                  </div>
                </div>
              </div>
              <div class="subtle lbd-rules">
                今天所有人用同一位统领、同一张地图和同一个随机种子出发。每天 {DAILY_TRIES} 次机会，取最好的一次计入今日榜单（中途放弃也算用掉一次）。未解锁的统领也能在这里试玩。
              </div>
              <div class="lbd-tries">
                <span>
                  剩余次数{' '}
                  {Array.from({ length: DAILY_TRIES }, (_, i) => (
                    <span key={i} class={`lbd-pip ${i < daily.left ? 'on' : ''}`} />
                  ))}
                </span>
                <span>
                  今日最好 <b class="gold-t">{daily.best ?? '—'}</b>
                </span>
              </div>
              {!isLoggedIn && (
                <div class="faint" style={{ fontSize: 13, color: '#f59e0b', marginBottom: 10 }}>
                  💡 当前为未登录体验状态：可正常游玩每日挑战，但对局成绩不会上传至今日榜单。
                </div>
              )}
              {daily.status === 'ready' && (
                <Btn variant="gold" size="big" wide onClick={start}>
                  {daily.tries ? `开始第 ${daily.tries + 1} 次挑战` : '开始今日挑战'}
                </Btn>
              )}
              {daily.status === 'playing' && (
                <Btn
                  variant="green"
                  size="big"
                  wide
                  onClick={() => {
                    setRun(daily.save!);
                    go('run');
                  }}
                >
                  继续今日挑战
                </Btn>
              )}
              {daily.status === 'done' && <div class="lbd-done">今天的 {DAILY_TRIES} 次机会已用完，明天再来！</div>}
            </div>
            <NicknamePanel />
          </div>
          <div class="panel lb-board">
            <div class="codex-tabs">
              {TABS.map(([t, n]) => (
                <button key={t} class={`ctab ${tab === t ? 'on' : ''}`} onClick={() => (sfx('page'), setTab(t))}>
                  {n}
                </button>
              ))}
              <div class="lb-note faint">
                {tab === 'daily' ? `每天 ${DAILY_TRIES} 次机会 · 取每人最好成绩` : tab === 'week' ? '每周一 0 点（北京时间）重置 · 只保留每人最好成绩' : '只保留每人最好成绩'}
              </div>
            </div>
            <div class="lb-head">
              <span>排名</span>
              <span>玩家</span>
              <span>统领</span>
              <span>难度</span>
              <span>进度</span>
              <span>阵容</span>
              <span class="r">得分</span>
            </div>
            <div class="lb-list">
              {loading && <div class="lb-empty faint">正在读取榜单……</div>}
              {!loading && error && <div class="lb-empty faint">{error}</div>}
              {!loading && data && data.entries.length === 0 && <div class="lb-empty faint">还没有人上榜，快来抢第一！</div>}
              {!loading && data?.entries.map((e) => <Row key={e.rank} e={e} />)}
            </div>
            {!loading && data && (
              <div class="lb-foot">
                <span class="faint">共 {data.total} 人上榜</span>
                {!isLoggedIn ? (
                  <span class="faint" style={{ color: '#f59e0b' }}>
                    当前为未登录体验模式：成绩不计入全服榜单（请在 BakaBox 大厅登录后参与竞逐）
                  </span>
                ) : data.me ? (
                  <span>
                    我的排名：<b class="gold-t">第 {data.me.rank} 名</b> · 得分 {data.me.score}
                  </span>
                ) : (
                  <span class="faint">你还没有上榜：一局结束后可以在结算界面上传成绩</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {confirm && (
        <Modal onClose={() => setConfirm(false)} width={540}>
          <div class="panel-title">开始每日挑战？</div>
          <p class="subtle">你还有一局未完成的爬塔，开始每日挑战会覆盖那个存档。</p>
          <div class="row gap12" style={{ marginTop: 20, justifyContent: 'flex-end' }}>
            <Btn onClick={() => setConfirm(false)}>再想想</Btn>
            <Btn variant="gold" onClick={() => (setConfirm(false), startDaily())}>
              开始挑战
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Row({ e }: { e: BoardEntry }) {
  const c = COMMANDER_MAP[e.commander];
  const userAvatar = e.avatar || e.commander || 'steve';
  return (
    <div class={`lb-row ${e.me ? 'me' : ''} ${e.rank <= 3 ? `top${e.rank}` : ''}`}>
      <span class="lb-rank">{e.rank}</span>
      <span class="lb-player">
        <img
          src={getAvatarUrl(userAvatar)}
          class="lb-avatar"
          alt=""
          onError={(ev) => {
            const el = ev.currentTarget as HTMLImageElement;
            el.onerror = null;
            el.src = url.cmd('steve');
          }}
        />
        <span class="lb-name">{e.name}</span>
      </span>
      <span class="lb-cmd">{c && <img src={url.cmd(c.id)} title={`${c.name} · ${c.title}`} />}</span>
      <span class={e.omen ? 'red-t' : 'faint'}>{e.omen ? `☠ ${ROMAN_OMEN[e.omen]}` : '普通'}</span>
      <span class={e.won ? 'gold-t' : 'subtle'}>{progressText(e)}</span>
      <span class="lb-team">
        {e.team.map(([m, star], i) => (
          <img key={i} src={url.mob(m)} title={`${mobDef(m)?.name ?? m} ★${star}`} class={`s${star}`} />
        ))}
      </span>
      <span class="r lb-score">{e.score}</span>
    </div>
  );
}

/** 当前登录玩家的身份卡片（只读展示真实头像与昵称，无需手动填写） */
export function NicknamePanel() {
  const isLoggedIn = selfProfile.value ? selfProfile.value.isLoggedIn !== false : true;
  const name = selfProfile.value?.username || profile.value.nickname || '冒险家史蒂夫';
  const avatar = selfProfile.value?.avatar || 'steve';
  const uid = selfProfile.value?.uid ? `#${String(selfProfile.value.uid).slice(-4)}` : '';

  return (
    <div class="panel lb-nick">
      <div class="panel-title" style={{ marginBottom: 8 }}>
        我的身份
      </div>
      <div class="row gap12" style={{ alignItems: 'center', gap: 12 }}>
        <img
          src={getAvatarUrl(avatar)}
          class="lb-user-card-avatar"
          alt=""
          onError={(ev) => {
            const el = ev.currentTarget as HTMLImageElement;
            el.onerror = null;
            el.src = url.cmd('steve');
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div class="row gap8" style={{ alignItems: 'center', gap: 8 }}>
            <span class="lbn-name" style={{ fontSize: 18, color: 'var(--ink)' }}>{name}</span>
            <span class="my-tag-pill">{isLoggedIn ? '我' : '未登录体验'}</span>
          </div>
          {uid && <span class="faint" style={{ fontSize: 12 }}>{uid}</span>}
        </div>
      </div>
      <div class="faint" style={{ fontSize: 13, marginTop: 10, color: isLoggedIn ? undefined : '#f59e0b' }}>
        {isLoggedIn
          ? '已绑定当前登录账号，排行榜成绩将自动以此身份公开展示。'
          : '当前尚未登录账号，对局仅作单机体验，成绩不计入排行榜。登录后即可参与全服排名！'}
      </div>
    </div>
  );
}
