import { useState } from 'preact/hooks';
import { runSummary, type RunState } from '../../run/run.ts';
import { submitRun, type SubmitResult } from '../../net/leaderboard.ts';
import { Btn } from '../components/common.tsx';
import { earnAchievement, profile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { selfProfile } from '../../net/bakaboxBridge.ts';
import { url } from '../assets.ts';

const BOARD_NAME = { daily: '今日挑战', week: '本周', all: '总榜' } as const;
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

/** End screen: send the run to the leaderboard if the player wants to. */
export function SubmitPanel({ s, won }: { s: RunState; won: boolean }) {
  const isLoggedIn = selfProfile.value ? selfProfile.value.isLoggedIn !== false : true;
  const name = selfProfile.value?.username || profile.value.nickname || '冒险家';
  const userAvatar = selfProfile.value?.avatar || s.commander || 'steve';
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [res, setRes] = useState<SubmitResult | null>(null);

  const send = () => {
    if (!isLoggedIn) {
      setMsg('未登录用户无法上传成绩至排行榜，请在 BakaBox 大厅登录后重试');
      return;
    }
    setBusy(true);
    setMsg(null);
    submitRun(runSummary(s, won), name, userAvatar)
      .then((r) => {
        s.submitted = true;
        setRes(r);
        sfx('levelup');
        const d = r.ranks.daily;
        if (d && d.updated && d.rank <= 10 && d.total >= 20) earnAchievement('daily_top10');
      })
      .catch((e: Error) => setMsg(e.message))
      .finally(() => setBusy(false));
  };

  if (res)
    return (
      <div class="end-submit">
        <div class="es-head">已上传到排行榜</div>
        <div class="row gap16" style={{ flexWrap: 'wrap' }}>
          {(['daily', 'week', 'all'] as const).map((b) => {
            const r = res.ranks[b];
            if (!r) return null;
            return (
              <span key={b}>
                {BOARD_NAME[b]} <b class="gold-t">第 {r.rank} 名</b>
                <span class="faint"> / {r.total}</span>
                {!r.updated && <span class="faint">（保留最好成绩 {r.best}）</span>}
              </span>
            );
          })}
        </div>
      </div>
    );

  return (
    <div class="end-submit">
      <div class="es-head">
        {s.daily
          ? isLoggedIn
            ? '提交每日挑战成绩（取今天最好的一次）'
            : '每日挑战结算（未登录体验）'
          : isLoggedIn
            ? '上传到排行榜'
            : '上传到排行榜（未登录体验）'}
        <span class="faint" style={{ fontSize: 14 }}>
          {isLoggedIn
            ? ' · 已绑定当前登录身份，点击即可一键上传'
            : ' · 当前为未登录状态，成绩不上榜'}
        </span>
      </div>
      <div class="row between" style={{ alignItems: 'center', marginTop: 4 }}>
        <div class="row gap8" style={{ alignItems: 'center' }}>
          <img
            src={getAvatarUrl(userAvatar)}
            class="submit-user-avatar"
            alt=""
            onError={(ev) => {
              const el = ev.currentTarget as HTMLImageElement;
              el.onerror = null;
              el.src = url.cmd('steve');
            }}
          />
          <span style={{ fontSize: 17, color: 'var(--ink)' }}>{name}</span>
          <span class="my-tag-pill">{isLoggedIn ? '我' : '未登录体验'}</span>
        </div>
        {isLoggedIn ? (
          <Btn variant="gold" size="big" onClick={send} disabled={busy}>
            {busy ? '上传中……' : '上传成绩'}
          </Btn>
        ) : (
          <Btn variant="gold" size="big" disabled title="未登录账号无法上传成绩至排行榜">
            未登录不上榜
          </Btn>
        )}
      </div>
      {!isLoggedIn && (
        <div class="faint" style={{ fontSize: 13, marginTop: 6, color: '#f59e0b' }}>
          💡 未登录用户可自由游玩体验全部模式，但成绩不计入全服榜单。请在 BakaBox 大厅登录后上传成绩参与排名。
        </div>
      )}
      {msg && <div class="red-t" style={{ fontSize: 14 }}>{msg}</div>}
    </div>
  );
}
